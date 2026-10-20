// Quarry Channel Pipeline — one command = everything for one channel.
// Produces Shorts → YouTube, cross-posts FB Reels, IG Reels, niche posters.
// Adding a new platform later = add one step here. No workflow changes needed.
//
// Usage: node channel-pipeline.mjs <slug> [--no-episode] [--force]
// Each step is independent: if one fails, the rest continue.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const slug = process.argv[2];
const FORCE = process.argv.includes('--force');
const SKIP_EPISODE = process.argv.includes('--no-episode');
// --topup=N: heal/backfill mode (sweeper semantics) — produce the first N slots
// even if today already ran; yt-daily marks the NEXT day done so the morning
// cron can't double-produce the healed reels.
const topupArg = process.argv.find(a => a.startsWith('--topup'));
const TOPUP_N = topupArg ? Math.max(0, Number(topupArg.split('=')[1]) || 0) : 0;
const brands = JSON.parse(fs.readFileSync('lib/brands.json', 'utf8'));
// 10-05 CHANNEL FACTORY: registry channels (Studio wizard) resolve from
// yt-mcp/studio-channels.json when lib/brands.json has no entry.
const { resolveBrand } = await import('./lib/brand-resolve.mjs');
let b = brands[slug] || await resolveBrand(slug);
if (!b) { console.error(`[pipeline] unknown slug: ${slug}`); process.exit(1); }

const today = new Date().toISOString().slice(0, 10);
// 09-20: per-channel state files are the source of truth (lib/state.mjs)
import { loadAllStates } from './lib/state.mjs';
// 10-09 BYOK: this channel's own provider keys (encrypted yt-mcp/channel-keys.json)
// replace the shared keys for the rest of the run — children inherit process.env.
import { applyChannelKeys, checkChannelKeys, dropChannelKeys } from './lib/channel-keys.mjs';
// #99 shared YouTube quota budget + #91-style alerts that always report outcome
import { evaluate } from './lib/quota-ledger.mjs';
import { sendAlert } from './lib/ntfy-alert.mjs';
const loadState = () => loadAllStates();

const log = (msg) => console.log(`[${slug}] ${msg}`);
const results = { shorts: false, episode: false, fbReels: false, igReels: false, poster: false };
const errors = [];

function run(script, args = []) {
  log(`▶ ${script} ${args.join(' ')}`);
  try {
    const r = spawnSync('node', [script, ...args], { stdio: 'inherit', timeout: 900000 });
    return r.status === 0;
  } catch (e) { errors.push(`${script}: ${e.message}`); return false; }
}

// ---- Load state ----
const state = loadState();
const _keysApplied = applyChannelKeys(slug);
if (_keysApplied) {
  // BYOK health check: a dead channel key must NOT silently degrade production —
  // drop it from env (shared key takes over) and alert the owner/client.
  const _check = await checkChannelKeys(slug);
  if (_check.dead.length) {
    dropChannelKeys(_check.dead.map((d) => d.provider));
    for (const d of _check.dead) log(`[keys] WARN ${d.provider} key DEAD (${d.detail}) - dropped, shared key covering`);
    if (process.env.NTFY_TOPIC) {
      fetch(`https://ntfy.sh/${process.env.NTFY_TOPIC}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', Title: `[${slug}] dead API key - shared key covering` },
        body: `Channel keys failed validation: ${_check.dead.map((d) => `${d.provider} (${d.detail})`).join('; ')}. Replace them in Studio > API Keys.`,
      }).catch(() => { });
    }
  }
  const _alive = _check.ok.filter((x) => _keysApplied.includes(x));
  log(_alive.length ? `[keys] channel overrides active: ${_alive.join(', ')}` : '[keys] channel keys all failed validation - using shared keys');
} else {
  log('[keys] using shared keys');
}
const shortsDone = state[slug]?.lastRunDate === today;
const episodeDone = state[slug]?.deepdiveDate === today;

// ---- Phase 0: shared YouTube quota budget (#99) — every channel draws on ONE
// 10,000 units/day pool (one OAuth client, ~1,700/upload). Fail closed BEFORE
// any render/LLM spend when one more upload would breach the daily budget.
async function quotaGate(label) {
  const q = evaluate(loadState());
  if (q.allowed) return true;
  log(`[quota] ${label} skipped — shared pool ${q.usedUnits}/${q.dailyLimit} units today (${q.uploadsToday} uploads) — resets midnight PT`);
  await sendAlert({ text: `${slug}: ${label} skipped — YouTube API daily budget reached (${q.usedUnits}/${q.dailyLimit} units, ${q.uploadsToday} uploads today). Resets midnight PT.`, title: `[${slug}] daily upload budget reached` });
  return false;
}

// ---- Phase 1: YouTube Shorts ----
// #98 SHORTS SOURCE: kit field shortsSource 'generated' (default, yt-daily
// research->script->render) or 'clips' (publisher posts one queued doc clip).
// Flipping a channel = one kit field; rolling back = flip it back.
const shortsSource = b.shortsSource || 'generated';
if (shortsSource === 'clips') {
  log(`Phase 1 — Clips lane (shortsSource=clips) for ${b.label}...`);
  if (await quotaGate('Shorts (clips)')) {
    if (run('longvideo/shorts-clips.mjs', ['post-next', slug])) { results.shorts = true; log(`✓ Clip Short processed`); }
    else { errors.push('Clip Short posting failed'); log(`✗ Clip posting failed`); }
  } else { errors.push('Shorts skipped — daily quota budget'); }
} else if ((!shortsDone || FORCE || TOPUP_N > 0) && (await quotaGate('Shorts production'))) {
  log(`Shorts already produced today — skipping`);
  results.shorts = true;
}

// ---- Phase 1b: Proof-of-publication (09-20) ----
// 09-19 lesson: a dead token printed "✓ Shorts queued / Errors: 0" while
// nothing was uploaded. Verify the claimed uploads REALLY exist on YouTube.
// (Clips lane self-verifies inside post-next — running it twice would double
// alert on the same upload.)
if (results.shorts && shortsSource !== 'clips') {
  if (run('verify-run.mjs', [slug])) log(`✓ Uploads verified on YouTube`);
  else errors.push('Upload verification failed — check ntfy alert');
}

// ---- Phase 2: Facebook Reels (cross-post from outbox) ----
log(`Phase 2 — Cross-posting to Facebook...`);
if (run('fb-crosspost.mjs')) { results.fbReels = true; log(`✓ FB Reels done`); }
else errors.push('FB cross-post failed');

// ---- Phase 3: Instagram Reels ----
// IG has no scheduling API, so posting here meant reels went live whenever the
// run finished. They are now posted by ig-slot-poster.yml 3x/day at fixed slot
// times, pulling the produced reels from the run's saved outbox cache.
// ---- Phase 2b: TikTok — PAUSED (10-17 owner decision) ----
// Zernio removed (issue #89 comment + owner go): publishing moves to the
// Quarry Studio TikTok app once its developer approval lands (docs staged in
// tt-lf/ + artifacts by Phase 6; quarry-studio-server + tiktok-app-site are
// the future publisher). Until then this phase is intentionally a no-op.


log(`Phase 3 — IG reels: handled by ig-slot-poster (3x/day at slot times)`);

// ---- Phase 4: Niche poster to FB page ----
log(`Phase 4 — Posting niche poster...`);
if (run('fb-images.mjs', [slug])) { results.poster = true; log(`✓ Poster done`); }
else errors.push('Poster failed');

// ---- Phase 5: Long-form episode (enable when ready) ----
if (!SKIP_EPISODE && !episodeDone && (await quotaGate('Episode'))) {
  log(`Phase 5 — Producing daily episode...`);
  const ok = run('yt-deepdive.mjs', [slug, ...(FORCE ? ['--force'] : [])]);
  if (ok) { results.episode = true; log(`✓ Episode done`); }
  else errors.push('Episode failed');
} else if (SKIP_EPISODE) {
  log(`Episode skipped (--no-episode or paused)`);
}

// ---- Phase 6: Stage doc render for TikTok clips (docDay only) ----
// Ported from channel-quotequarry.yml, which had this as QQ-only YAML logic —
// MR/IC/DFD docs never reached the TikTok queue (issue #77). Generic per-slug:
// the channel workflows upload tt-lf/lf-<slug>.* as artifacts named lf-<slug> /
// lf-meta-<slug>, which longvideo/tiktok-clips.mjs consumes per run.
try {
  const epFile = path.join('demos', `deepdive-${slug}`, 'episode.mp4');
  if (fs.existsSync(epFile)) {
    fs.mkdirSync('tt-lf', { recursive: true });
    fs.copyFileSync(epFile, path.join('tt-lf', `lf-${slug}.mp4`));
    let title = '';
    try {
      const files = fs.readdirSync(path.join('fb-outbox', slug)).filter(f => f.endsWith('.json')).reverse();
      for (const f of files) {
        const j = JSON.parse(fs.readFileSync(path.join('fb-outbox', slug, f), 'utf8'));
        if (j.kind === 'episode' && j.title) { title = j.title; break; }
      }
    } catch { }
    if (!title) title = `${b.label} documentary`;
    const keyword = (b.tags && b.tags[0]) || b.niche || 'documentary';
    fs.writeFileSync(path.join('tt-lf', `lf-meta-${slug}.json`), JSON.stringify({ title, keyword }, null, 2));
    // #96: SRT alongside the render — word-accurate cues for the clips lane (#97)
    const srtSrc = path.join('demos', `deepdive-${slug}`, 'episode.srt');
    if (fs.existsSync(srtSrc)) fs.copyFileSync(srtSrc, path.join('tt-lf', `lf-srt-${slug}.srt`));
    log(`✓ staged doc render for TikTok clips: "${title}" (keyword: ${keyword})`);
  } else {
    log('no doc rendered today (not docDay) — nothing staged for TikTok');
  }
} catch (e) {
  log(`⚠ TikTok staging failed (non-fatal): ${String(e.message).slice(0, 90)}`);
}

// ---- Summary ----
log(`══ PIPELINE COMPLETE ══`);
log(`  Shorts: ${results.shorts ? '✓' : '✗'}`);
log(`  FB Reels: ${results.fbReels ? '✓' : '✗'}`);
log(`  IG Reels: 📅 via ig-slot-poster (3x/day)`);
log(`  Poster: ${results.poster ? '✓' : '✗'}`);
log(`  Episode: ${results.episode ? '✓' : (SKIP_EPISODE ? '⏸ paused' : '✗')}`);
log(`  Errors: ${errors.length}`);
if (errors.length) errors.forEach(e => log(`    ! ${e}`));

// Always exit 0 — individual failures are logged, not fatal
process.exit(0);
