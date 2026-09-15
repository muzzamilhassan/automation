// Self-healing sweeper for the 4 live channels.
// Every night it counts each channel's reels that go live TODAY (scheduled or
// already public). A channel short on reels gets just the missing ones re-produced
// (yt-daily --topup=N), then the FB/IG outboxes are drained so healed reels
// cross-post too. The old single-channel / 5-brand logic is gone.
// Usage: node sweeper.mjs [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { google } from 'googleapis';

const envStr = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
for (const m of envStr.matchAll(/^([A-Z_0-9]+)=(.*)$/gm)) process.env[m[1]] ??= m[2].trim();
const envOf = (k) => process.env[k] || '';

const DRY = process.argv.includes('--dry-run');
const todayUTC = new Date().toISOString().slice(0, 10);
const CHANNEL_SLUGS = ['quotequarry', 'investors-compass', 'money-rulebook', 'debt-free-doctrine'];
const brands = JSON.parse(fs.readFileSync('lib/brands.json', 'utf8'));

const log = (m) => console.log(m);
const healed = [];
const warnings = [];

function oauth(refreshToken) {
  const a = new google.auth.OAuth2(envOf('YOUTUBE_CLIENT_ID'), envOf('YOUTUBE_CLIENT_SECRET'));
  a.setCredentials({ refresh_token: refreshToken });
  return a;
}

function channelAuth(slug) {
  const raw = envOf(`YT_TOKEN_${slug.toUpperCase().replace(/-/g, '_')}`)
    || (fs.existsSync(path.join('yt-mcp', 'channels', slug, 'token.json'))
      ? fs.readFileSync(path.join('yt-mcp', 'channels', slug, 'token.json'), 'utf8') : '');
  const t = JSON.parse(raw || '{}');
  if (!t.refresh_token) throw new Error('no token for ' + slug);
  return oauth(t.refresh_token);
}

// Slots are UTC in brands.json, so "goes live today" = status.publishAt
// (still scheduled) or snippet.publishedAt (already public) is today's UTC date.
function goesLiveToday(v) {
  const when = (v.status && v.status.publishAt) || v.snippet.publishedAt || '';
  return when.slice(0, 10) === todayUTC;
}

// ---- 1. Per-channel reel count + top-up ------------------------------------
for (const slug of CHANNEL_SLUGS) {
  const b = brands[slug];
  const want = (b.slots || []).length;
  try {
    const y = google.youtube({ version: 'v3', auth: channelAuth(slug) });
    const ch = await y.channels.list({ part: 'snippet,contentDetails', mine: true });
    const c = ch.data.items?.[0];
    if (!c) throw new Error('channel not reachable');
    // Identity guard: a stale/mislabeled token must never heal the wrong channel.
    const handle = (c.snippet.customUrl || '').toLowerCase();
    if (b.handle && handle && handle !== b.handle.toLowerCase()) {
      warnings.push(`${slug}: token points at ${handle}, expected ${b.handle} — skipped`);
      log(`✗ [${slug}] token points at ${handle} but ${b.handle} expected — NOT healing this channel`);
      continue;
    }
    const up = await y.playlistItems.list({ part: 'contentDetails', playlistId: c.contentDetails.relatedPlaylists.uploads, maxResults: 15 });
    const ids = up.data.items.map(i => i.contentDetails.videoId).filter(Boolean);
    let count = 0;
    for (let i = 0; i < ids.length; i += 50) {
      const vs = await y.videos.list({ part: 'snippet,status', id: ids.slice(i, i + 50).join(',') });
      count += (vs.data.items || []).filter(goesLiveToday).length;
    }
    const missing = Math.max(0, want - count);
    if (missing === 0) {
      log(`✓ [${slug}] ${count}/${want} reels go live today — healthy`);
      continue;
    }
    if (DRY) {
      log(`⚠ [${slug}] ${count}/${want} reels go live today — would top-up +${missing} (dry-run)`);
      continue;
    }
    log(`⚠ [${slug}] ${count}/${want} reels go live today — re-producing ${missing}...`);
    const r = execFileSync('node', ['yt-daily.mjs', slug, '--no-episode', `--topup=${missing}`], { stdio: 'inherit', timeout: 40 * 60 * 1000 });
    if (r.status === 0) healed.push(`${b.label} +${missing}`);
    else warnings.push(`${slug}: top-up exited ${r.status}`);
  } catch (e) {
    warnings.push(`${slug}: ${String(e.message).slice(0, 100)}`);
    log(`✗ [${slug}] sweep failed: ${String(e.message).slice(0, 100)}`);
  }
}

// ---- 1.5 Recycle pending deletes -------------------------------------------
// yt-daily's recycler hides the old video immediately and queues
// state[slug].recyclePending = [{oldVideoId, newVideoId, publishAt, ...}].
// Once the recycled copy is live (public), delete the old copy. If the new copy
// errored/was rejected, restore the old copy to public instead. Max 3/night.
const STATE_FILE = path.join('yt-mcp', 'schedule-state.json');
let recycleState = {};
try { recycleState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { }
let pendingDeleted = 0;
let pendingRestored = 0;
for (const slug of CHANNEL_SLUGS) {
  const pend = recycleState[slug]?.recyclePending;
  if (!Array.isArray(pend) || !pend.length) continue;
  let y;
  try { y = google.youtube({ version: 'v3', auth: channelAuth(slug) }); } catch { continue; }
  for (const p of [...pend]) {
    if (pendingDeleted >= 3 && !DRY) { log(`[recycle] nightly delete cap reached — ${p.oldVideoId} waits for tomorrow`); continue; }
    try {
      const r = await y.videos.list({ part: 'status', id: p.newVideoId });
      const st = r.data.items?.[0]?.status;
      if (!st) { log(`[recycle] ${slug}: new copy ${p.newVideoId} not found — keeping pending`); continue; }
      if (st.privacyStatus === 'public') {
        if (DRY) { log(`[recycle] ${slug}: would delete old ${p.oldVideoId} (new copy ${p.newVideoId} is live) (dry-run)`); continue; }
        await y.videos.delete({ id: p.oldVideoId });
        recycleState[slug].recyclePending = pend.filter((x) => x !== p);
        pendingDeleted++;
        log(`✓ [recycle] ${slug}: deleted old ${p.oldVideoId} — recycled copy ${p.newVideoId} is live`);
      } else if (['rejected', 'error', 'deleted'].includes(st.uploadStatus)) {
        if (DRY) { log(`[recycle] ${slug}: new copy ${p.newVideoId} ${st.uploadStatus} — would restore old ${p.oldVideoId} (dry-run)`); continue; }
        await y.videos.update({ part: 'status', requestBody: { id: p.oldVideoId, status: { privacyStatus: 'public', selfDeclaredMadeForKids: false } } });
        recycleState[slug].recyclePending = pend.filter((x) => x !== p);
        pendingRestored++;
        warnings.push(`${slug}: recycled copy ${p.newVideoId} ${st.uploadStatus} — old video ${p.oldVideoId} restored to public`);
        log(`⚠ [recycle] ${slug}: new copy ${p.newVideoId} ${st.uploadStatus} — old ${p.oldVideoId} restored to public`);
      } else {
        log(`[recycle] ${slug}: new copy ${p.newVideoId} still ${st.privacyStatus}/${st.uploadStatus} — waiting`);
      }
    } catch (e) {
      warnings.push(`recycle ${slug}: ${String(e.message).slice(0, 80)}`);
      log(`✗ [recycle] ${slug}: ${String(e.message).slice(0, 80)}`);
    }
  }
}
try {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(recycleState, null, 2));
} catch (e) { log(`[recycle] state write failed: ${e.message}`); }

// ---- 2. Drain FB outbox so healed reels cross-post too ----------------------
// (IG is NOT drained here — reels are posted by ig-slot-poster.yml at fixed
// slot times; an instant IG drain at 20:15 UTC would double-post slot 3.)
if (healed.length && !DRY) {
  for (const s of ['fb-crosspost.mjs']) {
    try { execFileSync('node', [s], { stdio: 'inherit', timeout: 40 * 60 * 1000 }); }
    catch (e) { warnings.push(`${s}: ${String(e.message).slice(0, 80)}`); }
  }
}

// ---- 3. Daily long-form (compilation on the main channel) -------------------
let hasLong = false;
try {
  const y = google.youtube({ version: 'v3', auth: oauth(envOf('YOUTUBE_REFRESH_TOKEN')) });
  const ch = await y.channels.list({ part: 'contentDetails', mine: true });
  const pl = ch.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  const up = await y.playlistItems.list({ part: 'contentDetails', playlistId: pl, maxResults: 15 });
  const ids = up.data.items.map(i => i.contentDetails.videoId).filter(Boolean);
  const vs = await y.videos.list({ part: 'snippet', id: ids.join(',') });
  const cutoff = Date.now() - 30 * 3600000;
  hasLong = (vs.data.items || []).some(v => /compilation/i.test(v.snippet.title || '') && new Date(v.snippet.publishedAt).getTime() >= cutoff);
  log(hasLong ? '✓ Daily long-form is live.' : '⚠ No daily long-form in the last 30h.');
} catch (e) { log(`[long-form] check failed: ${String(e.message).slice(0, 80)}`); }

const utcHour = new Date().getUTCHours();
if (!hasLong && utcHour >= 13 && utcHour < 21) {
  if (DRY) {
    log('(dry-run) would re-dispatch weekly-compilation.yml');
  } else {
    log('Re-dispatching compilation workflow...');
    try {
      const token = envOf('GITHUB_PAT') || envOf('SECRET_WRITER_PAT');
      const repo = process.env.GITHUB_REPOSITORY || 'muzzamilhassan/automation';
      execFileSync('curl', ['-s', '-X', 'POST',
        '-H', `Authorization: token ${token}`,
        `https://api.github.com/repos/${repo}/actions/workflows/weekly-compilation.yml/dispatches`,
        '-d', '{"ref":"main"}'], { timeout: 30000 });
      log('✓ Long-form re-dispatched.');
    } catch (e) { log('✗ re-dispatch failed:', e.message); }
  }
}

// ---- 4. Phone alert when healing happened ----------------------------------
if (healed.length && envOf('NTFY_TOPIC') && !DRY) {
  const body = `Quarry sweeper healed: ${healed.join(', ')}. FB/IG cross-posts drained.`
    + (warnings.length ? ` Warnings: ${warnings.length}.` : '');
  try {
    await fetch(`https://ntfy.sh/${envOf('NTFY_TOPIC')}`, {
      method: 'POST', headers: { 'Title': 'Quarry Sweeper Report' }, body
    });
    log('✓ NTFY alert sent.');
  } catch { log('[ntfy] alert failed (non-fatal)'); }
}

log('\n══ SWEEP COMPLETE ══');
log(healed.length ? `  Healed: ${healed.join(', ')}` : '  All channels healthy');
if (pendingDeleted || pendingRestored) log(`  Recycle cleanup: ${pendingDeleted} deleted, ${pendingRestored} restored`);
warnings.forEach(w => log('  ! ' + w));
log(DRY ? '  (dry-run — nothing was changed)' : '  Sweeper done.');
