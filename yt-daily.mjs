// Daily producer + scheduler for one multi-channel brand.
// Usage: node yt-daily.mjs <slug> [--force] [--no-episode] [--episode-only]
// Produces the day's Shorts (theme-rotated), uploads each as PRIVATE with
// publishAt at the brand's slot times, sets thumbnails, pins a comment,
// writes the FB/IG outbox, then produces the day's deep-dive episode.
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { spawnSync, execFileSync } from 'node:child_process';
import { google } from 'googleapis';
import { loadAllStates, saveChannelState } from './lib/state.mjs';

// NEVER crash the CI — log errors and continue
process.on('uncaughtException', (e) => { console.error('[yt-daily] Uncaught:', e.message, '— continuing'); });
process.on('unhandledRejection', (e) => { console.error('[yt-daily] Unhandled:', String(e).slice(0, 200), '— continuing'); });

// Load .env BEFORE importing the engine (it snapshots keys at module load).
const ENV_PATH = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '.env');
const envRaw = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
for (const m of envRaw.matchAll(/^([A-Z_0-9]+)=(.*)$/gm)) process.env[m[1]] ??= m[2].trim();

const { generateYouTubeScript, renderYouTubeScriptShort, buildScriptMeta } = await import('./youtube-engine.mjs');
const { pickApprovedTrack, pickMusicTrack } = await import('./music-engine.mjs');
const { resolveBrand } = await import('./lib/brand-resolve.mjs');
const { researchTrend } = await import('./trend-research.mjs');
const { archiveUpload } = await import('./yt-archive.mjs');
const { recentUploadTitles, findDup } = await import('./lib/dup-gate.mjs');

const slug = process.argv[2];
const FORCE = process.argv.includes('--force');
const NO_EPISODE = process.argv.includes('--no-episode');
const EPISODE_ONLY = process.argv.includes('--episode-only');
// --topup=N: heal mode (used by sweeper.mjs) — produce only the first N slots.
// Marks the NEXT day as done so the scheduled morning run doesn't double-produce
// the healed reels. Never touches the episode step.
const topupArg = process.argv.find(a => a.startsWith('--topup'));
const TOPUP_N = topupArg ? Math.max(0, Number(topupArg.split('=')[1]) || 0) : 0;
const b = await resolveBrand(slug);
if (!b) { console.error('unknown slug (no legacy kit and no registry entry):', slug); process.exit(1); }

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || envRaw.match(/^YOUTUBE_CLIENT_ID=(.+)$/m)?.[1]?.trim() || '';
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || envRaw.match(/^YOUTUBE_CLIENT_SECRET=(.+)$/m)?.[1]?.trim() || '';
if (!CLIENT_ID || !CLIENT_SECRET) { console.error('YouTube OAuth client credentials missing (env or .env)'); process.exit(1); }
// 10-05 FIX: this was referenced but never defined in this file since the
// 10-03 music-lock commit — the ReferenceError was swallowed by try/catch and
// every daily short rendered WITHOUT music. Defined here (same as yt-deepdive).
const APPROVED_MUSIC = JSON.parse(fs.readFileSync(new URL('./yt-brands/approved-music.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), 'utf8'));
const FF = process.env.FFMPEG_PATH || 'ffmpeg';

function channelAuth(forSlug) {
  const envName = `YT_TOKEN_${forSlug.toUpperCase().replace(/-/g, '_')}`;
  const tokenFile = path.join(path.dirname(ENV_PATH), `yt-mcp/channels/${forSlug}/token.json`);
  const raw = process.env[envName] || (fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8') : '');
  if (!raw) throw new Error('no token for ' + forSlug);
  const t = JSON.parse(raw);
  const a = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  a.setCredentials({ refresh_token: t.refresh_token });
  return a;
}

// UPLOAD VALIDATION GATE (hard rule 09-18): a broken render must die here,
// never on YouTube. Shorts < 20s or garbage titles are skipped fail-closed.
function ffprobeSeconds(file) {
  try {
    const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8', shell: process.platform === 'win32' });
    const v = parseFloat(String(r.stdout || '').trim());
    return Number.isFinite(v) ? v : 0;
  } catch { return 0; }
}
function validateUploadOrSkip(file, title, log = () => {}) {
  const secs = ffprobeSeconds(file);
  if (secs < 20) { log(`  GATE: rejected (${secs.toFixed(1)}s render < 20s) — upload skipped`); return false; }
  const t = String(title || '').trim();
  const garbage = /\|\s*#/.test(t) || t.includes('undefined') || /NaN/.test(t); // case-sensitive NaN — /NaN/i poisoned 'FiNANce' titles
  if (t.length < 10 || !/[a-z]/i.test(t) || garbage) { log(`  GATE: rejected (bad title "${t.slice(0, 40)}") — upload skipped`); return false; }
  return true;
}

// 09-20: per-channel state files are the source of truth (lib/state.mjs) —
// the shared schedule-state.json is a best-effort mirror for read-only consumers.
const loadState = () => loadAllStates();
const saveState = (s) => { for (const [k, v] of Object.entries(s)) saveChannelState(k, v); };

function nextSlotISO(hhmm, now = new Date()) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m, 0));
  if (d <= new Date(now.getTime() + 35 * 60 * 1000)) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().replace(/\.\d+Z$/, 'Z');
}

const state = loadState();
const today = new Date().toISOString().slice(0, 10);
// 10-05 PAUSE GUARD — feed-collapse cooldown: state.pausedUntil (YYYY-MM-DD)
// stops shorts AND the episode for this channel; daily-sweeper respects the
// same field. Used for the Quote Quarry Oct-1 recovery window.
if ((state[slug]?.pausedUntil || '') >= today) {
  console.log(`[${slug}] paused until ${state[slug].pausedUntil} (feed-collapse cooldown) — nothing produced`);
  process.exit(0);
}
// 10-05 CADENCE — Sunday is the network-wide break day: no new renders.
// Shorts come from the feed, not a subscription calendar, so a dark Sunday is
// free; it buys the weekly review that keeps quality up (research/
// upload-cadence-research-2026-10-05.md). --force overrides.
if (!FORCE && !TOPUP_N && new Date().getUTCDay() === 0) {
  console.log(`[${slug}] Sunday break day — no shorts produced`);
  process.exit(0);
}
const shortsDone = state[slug]?.lastRunDate === today || state[slug]?.healedDate === today;
const episodeDone = state[slug]?.deepdiveDate === today;
const RUN_SHORTS = !EPISODE_ONLY && (TOPUP_N > 0 || !shortsDone || FORCE);
const RUN_EPISODE = !NO_EPISODE && TOPUP_N === 0 && (!episodeDone || (FORCE && !EPISODE_ONLY));
const results = [];
const themes = [];

const page = { id: 'yt-' + slug, ytSlug: slug, name: b.label, niche: b.niche };

if (RUN_SHORTS) {
  // 09-30: topics are RESEARCH-LED. The static theme banks are gone — each
  // slot's topic comes from what is provably getting views in this niche
  // right now (top-viewed videos of the last 14 days, one viral wave per
  // slot, skipping seeds used recently). If research fails, slots skip
  // (fail-closed — same rule as the recycle removal).
  try {
    page.trend = await researchTrend(slug, channelAuth(slug), [...b.niches, ...b.tags.slice(0, 2)]);
    console.log(`[trend] 🔥 hot: ${page.trend.hotKeywords.slice(0, 6).join(', ')}`);
  } catch (e) {
    console.log(`[trend] FAILED: ${String(e.message).slice(0, 80)} — slots skipped (fail-closed, no static fallback)`);
  }
  // 10-03 step 3: real viewer search words (Analytics API). Best-effort —
  // channels without the yt-analytics scope just skip this.
  try {
    const { viewerTerms } = await import('./viewer-terms.mjs');
    const terms = await viewerTerms(slug, channelAuth(slug));
    page.viewerTerms = terms.terms.slice(0, 10).map((t) => t.term);
    console.log(`[terms] 🔎 your viewers search: ${page.viewerTerms.slice(0, 6).join(', ')}`);
  } catch (e) {
    console.log(`[terms] skipped: ${String(e.message).slice(0, 70)}`);
  }

  const yt = google.youtube({ version: 'v3', auth: channelAuth(slug) });
  // 10-05 DUPLICATE TITLE GATE — live titles from YouTube (state can be days
  // thin), plus this run's own titles so one run can never repeat itself.
  const recentTitles = await recentUploadTitles(yt);
  const seenThisRun = [];
  const usedSeeds = Array.isArray(state[slug]?.usedTrendSeeds) ? state[slug].usedTrendSeeds : [];
  const dayIdx = Math.floor(Date.now() / 86400000);
  const waves = page.trend?.videos || [];
  const themesToday = [];
  // 10-05 PHASE B — TOPIC DESK: user-approved topics (Studio → Topic Desk,
  // stored in yt-mcp/topics-<slug>.json) are consumed FIRST — one per slot.
  // When the queue empties, auto-research fills the remaining slots.
  const deskPath = `yt-mcp/topics-${slug}.json`;
  let deskQueue = [];
  try { deskQueue = JSON.parse(fs.readFileSync(deskPath, 'utf8')).queue || []; } catch { }
  let deskUsed = 0;
  for (let k = 0; k < b.slots.length && deskQueue.length; k++) {
    const t = deskQueue.shift();
    deskUsed++;
    const topic = t.kind === 'search'
      ? `Make today's video for what your viewers actually searched: "${t.text}". Answer it natively for ${b.label} with a fresh angle and work the search words naturally into the hook and points.${page.viewerTerms?.length ? ` Related real searches: ${page.viewerTerms.slice(0, 6).join(', ')}.` : ''}`
      : t.kind === 'seed'
        ? `Build today's video around the THEME of this proven viral video in the niche right now: "${t.text}". Reimagine it natively for ${b.label} — do NOT copy its title or wording; bring a fresh angle.${page.trend?.hotKeywords?.length ? ` Weave in what is currently working: ${page.trend.hotKeywords.slice(0, 6).join(', ')}.` : ''}`
        : t.text; // 'custom' — the user's own full instruction
    themesToday.push({ seed: `desk:${t.id || String(t.text).slice(0, 24)}`, topic });
  }
  if (deskUsed) {
    fs.writeFileSync(deskPath, JSON.stringify({ at: Date.now(), queue: deskQueue }, null, 2) + '\n');
    console.log(`[desk] used ${deskUsed} user-approved topic(s) — ${deskQueue.length} left in the queue`);
  }
  if (waves.length) {
    for (let k = themesToday.length; k < b.slots.length; k++) {
      let seed = null;
      for (let off = 0; off < waves.length; off++) {
        const cand = waves[(dayIdx * b.slots.length + k + off) % waves.length];
        if (!usedSeeds.includes(cand.title) && !themesToday.some((t) => t.seed === cand.title)) { seed = cand; break; }
      }
      if (!seed) seed = waves[(dayIdx * b.slots.length + k) % waves.length];
      themesToday.push({
        seed: seed.title,
        topic: `Build today's video around the THEME of this proven viral video in the niche right now: "${seed.title}" (${seed.views.toLocaleString('en-US')} views in the last 14 days). Reimagine it natively for ${b.label} — do NOT copy its title or wording; bring a fresh angle. Weave in what is currently working: ${(page.trend.hotKeywords.slice(0, 6)).join(', ')}.${page.viewerTerms?.length ? ` Your own viewers found this channel by searching: ${page.viewerTerms.slice(0, 8).join(', ')} — work the strongest of these real search words naturally into the hook and points.` : ''}`
      });
    }
  }
  console.log(`[topics] ${themesToday.map(t => '← ' + t.seed.slice(0, 48)).join(' | ') || 'none — research unavailable'}`);
  // off-niche drift guard is a Quote Quarry lesson ( Stoicism words leaking in) —
  // registry channels define their own niche, so the check stays legacy-only
  const OFF_NICHE = b.fromRegistry ? null : /\bstoic\w*|manipulat\w*|toxic|calm your mind|dark psychology\b/i;

  const slotLimit = TOPUP_N > 0 ? Math.min(TOPUP_N, b.slots.length) : b.slots.length;
  for (let i = 0; i < slotLimit; i++) {
    const publishAt = nextSlotISO(b.slots[i]);
    console.log(`\n[${slug}] short ${i + 1}/${b.slots.length} → goes public ${publishAt}`);
    if (!themesToday[i]) {
      console.log('  ✗ no researched topic (trend research failed) — slot skipped (fail-closed, no static fallback)');
      continue;
    }
    let script = await generateYouTubeScript(page, themesToday[i].topic);
    for (let t = 0; OFF_NICHE && t < 2 && OFF_NICHE.test(JSON.stringify(script.points)); t++) {
      console.log('  off-niche drift — regenerating');
      script = await generateYouTubeScript(page, themesToday[i].topic);
    }
    // GATE: near-duplicate of anything already on the channel (or made earlier
    // in this run) — skip BEFORE rendering, this is what fed the Oct-1 collapse
    const preDup = findDup(script.title, recentTitles, seenThisRun);
    if (preDup) {
      console.log(`  GATE: duplicate title "${script.title}" ≈ "${preDup}" — slot skipped before render`);
      continue;
    }
    if (script.source === 'fallback') {
      // Quota out → the slot SKIPS. Recycle was REMOVED 09-18: re-uploading the
      // same file reads as reused content to YouTube and suppresses the channel
      // (fail-closed rule: a missing video is free, a reuse strike costs weeks).
      console.log('  ✗ no AI script — slot skipped (recycle removed 09-18)');
      continue;
    }
    let music = null;
    // 10-03: ONLY the channel's own approved tracks (music-review folders) —
    // no catalog rotation, no other music anywhere. 10-05: registry channels
    // (Studio wizard) have no keeper pool yet → mood-matched catalog rotation
    // until the user picks keepers (the original music-engine behavior).
    try {
      const pool = APPROVED_MUSIC[slug];
      music = pool?.length
        ? await pickApprovedTrack(pool)
        : (b.musicFeels?.length ? await pickMusicTrack(0, { feels: b.musicFeels }) : null);
      if (music) console.log(`  ♫ ${music.title} (${music.feel || 'mood'})`);
      else if (!pool?.length && !b.musicFeels?.length) console.log('  [music] no pool and no musicFeels — rendering without music');
    } catch (e) { console.log(`  [music] skipped: ${String(e.message).slice(0, 60)}`); }
    const out = await renderYouTubeScriptShort(page, script, music);
    const meta = buildScriptMeta(page, script, music ? `${music.title} — ${music.credit}` : '');

    const stamp = `${Date.now()}-s${i}`;
    fs.mkdirSync(`fb-outbox/${slug}`, { recursive: true });
    fs.writeFileSync(`fb-outbox/${slug}/${stamp}.mp4`, out.buffer);
    fs.writeFileSync(`fb-outbox/${slug}/${stamp}.json`, JSON.stringify({ videoFile: `fb-outbox/${slug}/${stamp}.mp4`, publishAt, title: meta.title, description: meta.description, tags: meta.tags, slug }, null, 2));

    if (!validateUploadOrSkip(`fb-outbox/${slug}/${stamp}.mp4`, meta.title, (m) => console.log(m))) {
      results.push({ videoId: null, publishAt, title: meta.title, gateRejected: true });
      continue;
    }
    // GATE: final check on the exact upload title (meta can reword script.title)
    const metaDup = findDup(meta.title, recentTitles, seenThisRun);
    if (metaDup) {
      console.log(`  GATE: duplicate upload title "${meta.title}" ≈ "${metaDup}" — upload skipped`);
      results.push({ videoId: null, publishAt, title: meta.title, gateRejected: true });
      continue;
    }
    seenThisRun.push(meta.title);
    const res = await yt.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: { title: meta.title, description: `${meta.description}\n\n${b.hashtags || ''}`.trim(), tags: meta.tags, categoryId: '27', defaultLanguage: 'en', defaultAudioLanguage: 'en' },
        status: { privacyStatus: 'private', publishAt, selfDeclaredMadeForKids: false }
      },
      media: { body: Readable.from(out.buffer) }
    });
    const videoId = res.data.id;
    console.log(`  ✓ queued ${videoId} → https://youtube.com/shorts/${videoId}`);
    if (out.thumb) { try { await yt.thumbnails.set({ videoId, media: { body: Readable.from(out.thumb) } }); console.log('  ✓ thumbnail set'); } catch { } }
    try {
      await yt.commentThreads.insert({ part: 'snippet', requestBody: { snippet: { videoId, topLevelComment: { snippet: { textOriginal: `Which one hit hardest? 👇 Subscribe for daily ${b.kwShort}.` } } } } });
    } catch { }
    // archive the render (GitHub Release asset, <videoId>.mp4) so the recycler
    // never needs to download from YouTube
    try {
      if (process.env.GH_TOKEN || process.env.GITHUB_PAT) {
        await archiveUpload(videoId, `fb-outbox/${slug}/${stamp}.mp4`, (m) => console.log('  ' + m));
      }
    } catch (e) { console.log(`  [archive] skipped: ${String(e.message).slice(0, 60)}`); }
    results.push({ videoId, publishAt, title: meta.title });

    // ---- Video frames → FB image posts ----
    try {
      const videoFile = `fb-outbox/${slug}/${stamp}.mp4`;
      const pageId = { 'investors-compass': '116157974886564', 'money-rulebook': '1077306835630491', 'debt-free-doctrine': '106473735839651', 'quotequarry': '108044922375174' }[slug];
      if (pageId && process.env.FB_PAGE_TOKEN) {
        const pageTokenRes = await fetch(`https://graph.facebook.com/v20.0/me/accounts?fields=access_token&access_token=${process.env.FB_PAGE_TOKEN}`);
        const pageData = (await pageTokenRes.json()).data || [];
        const pageToken = pageData.find(p => p.id === pageId)?.access_token || process.env.FB_PAGE_TOKEN;

        // Extract 3 frames at key moments
        for (const pct of [0.3, 0.5]) {
          const ts = Math.round(parseFloat(out.duration || '50') * pct);
          const frameFile = `fb-outbox/${slug}/${stamp}-f${Math.round(pct*100)}.jpg`;
          execFileSync(FF, ["-y", '-v', 'error', '-ss', String(ts), '-i', videoFile, '-frames:v', '1', '-vf', 'scale=1080:1350:force_original_aspect_ratio=increase,crop=1080:1350,quality=90', frameFile], { timeout: 30000 });

          const form = new FormData();
          form.append('source', new Blob([fs.readFileSync(frameFile)], { type: 'image/jpeg' }), 'post.jpg');
          form.append('caption', `${meta.title}\n\nFollow for daily ${b.kwShort}. ${b.hashtags || ''}`.slice(0, 3000));
          const photoRes = await fetch(`https://graph.facebook.com/v20.0/${pageId}/photos?access_token=${encodeURIComponent(pageToken)}`, { method: 'POST', body: form });
          const photoData = await photoRes.json();
          if (photoData.id) console.log(`  ✓ FB image posted (${photoData.id})`);
          break; // only post 1 frame per Short (don't spam)
        }
      }
    } catch (e) { console.log('  [fb-image] skipped:', String(e.message).slice(0, 60)); }
  }
  if (!EPISODE_ONLY) {
    // Heal run with produced reels covers the next cycle — suppress the morning
    // full run. Heal that produced 0 keeps today, so tomorrow morning retries.
    const suppressNext = TOPUP_N > 0 && results.length > 0;
    state[slug] = {
      ...(state[slug] || {}),
      lastRunDate: suppressNext ? new Date(Date.now() + 86400000).toISOString().slice(0, 10) : today,
      ...(TOPUP_N > 0 ? { healedDate: today, healedCount: results.length } : {}),
      usedTrendSeeds: [...usedSeeds, ...themesToday.map(t => t.seed)].slice(-40),
      todayTopics: themesToday.map(t => ({ at: today, topic: t.seed })),
      // 10-05: durable title history — lastVideos alone only ever held the last
      // run, which is why cross-day duplicates went unnoticed for weeks
      titleHistory: [...(state[slug]?.titleHistory || []), ...results.filter(r => r.videoId).map(r => ({ t: r.title, at: r.publishAt }))].slice(-60),
      lastVideos: results, deepdiveDate: state[slug]?.deepdiveDate || null
    };
    saveState(state);
  }
} else {
  console.log(`[${slug}] Shorts already done today — episode-only pass`);
}

// Daily long-form episode (yt-deepdive has its own once-per-day state guard)
if (RUN_EPISODE) {
  console.log(`\n[${slug}] producing today's deep-dive episode...`);
  const dd = spawnSync('node', ['yt-deepdive.mjs', slug], { stdio: 'inherit' });
  console.log(`[${slug}] deep-dive exit: ${dd.status}`);
} else {
  console.log(`[${slug}] episode step skipped`);
}
