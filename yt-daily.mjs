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
import { fbPageId } from './lib/registry.mjs';

// NEVER crash the CI mid-production — log and continue, but leave a NON-ZERO
// exit code (#35: a silent exit 0 made verify-run verify yesterday's uploads).
process.on('uncaughtException', (e) => { console.error('[yt-daily] Uncaught:', e.message, '— continuing'); process.exitCode = 1; });
process.on('unhandledRejection', (e) => { console.error('[yt-daily] Unhandled:', String(e).slice(0, 200), '— continuing'); process.exitCode = 1; });

// Load .env BEFORE importing the engine (it snapshots keys at module load).
import { loadEnv } from './lib/env.mjs';
loadEnv();




const { generateYouTubeScript, renderYouTubeScriptShort, buildScriptMeta, resolveTemplateId } = await import('./youtube-engine.mjs');
const { pickApprovedTrack, pickMusicTrack } = await import('./music-engine.mjs');
const { resolveBrand } = await import('./lib/brand-resolve.mjs');
const { researchTrend } = await import('./trend-research.mjs');
const { archiveUpload } = await import('./yt-archive.mjs');
const { recentUploadTitles, findDup } = await import('./lib/dup-gate.mjs');
const { shouldSuppressNext } = await import('./lib/schedule.mjs');
import { nextCounter } from './lib/quota-ledger.mjs';
// #106 T5b: the review-seam helpers (pure module — no store/DB at import).
// #106 P5 T2c (D4): the deterministic-disclaimer helpers ride the same module —
// the upload DESCRIPTION's machine append (appendDisclaimers) and the
// template_id chain resolution (declaredDisclaimers).
import { flagOn, appendDisclaimers, declaredDisclaimers } from './lib/review-seams.mjs';
// #106 T3 (S2): upload intents — the note written before any videos.insert
// (D5); the two-step resumable upload whose session URI is ours to keep (D6);
// the run-start open-intent resolution that kills the duplicate class (D7a).
import { getUploadIntentStore, uploadWithIntent, recoverOpenIntents, makeFindByTitle, oauthAccessToken, slotISOOnDate, nextFutureSlotISO } from './lib/upload-intents.mjs';

const slug = process.argv[2];
const FORCE = process.argv.includes('--force');
const NO_EPISODE = process.argv.includes('--no-episode');
const EPISODE_ONLY = process.argv.includes('--episode-only');
// --topup=N: heal mode (used by sweeper.mjs) — produce only the first N slots.
// Marks the NEXT day as done so the scheduled morning run doesn't double-produce
// the healed reels. Never touches the episode step.
const topupArg = process.argv.find(a => a.startsWith('--topup'));
const TOPUP_N = topupArg ? Math.max(0, Number(topupArg.split('=')[1]) || 0) : 0;
// #106 T5b (S4) — the review seams, threaded by channel-pipeline.mjs's T5 gate
// (env travels ONLY on gated/approval runs; unset = byte-identical legacy path):
//   REVIEW_GENERATE_ONLY    the gate held with no approved script — generate +
//                           persist awaiting_review, then STOP (no render/upload);
//   PIPELINE_RESUME_JOB_ID  an approval dispatched resume=<held job id> — render
//                           from the STORED script input, never re-generate;
//   REVIEW_THUMB_CANDIDATES the template DATA enables picking — N variants per
//                           render (1 = today's single candidate).
const GENERATE_ONLY = flagOn(process.env.REVIEW_GENERATE_ONLY);
const RESUME_SCRIPT_JOB = String(process.env.PIPELINE_RESUME_JOB_ID || '').trim();
const THUMB_CANDIDATES = Math.max(1, Math.min(6, Number(process.env.REVIEW_THUMB_CANDIDATES) || 1));
const b = await resolveBrand(slug);
if (!b) { console.error('unknown slug (no legacy kit and no registry entry):', slug); process.exit(1); }

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || '';
if (!CLIENT_ID || !CLIENT_SECRET) { console.error('YouTube OAuth client credentials missing (env or .env)'); process.exit(1); }
// 10-05 FIX: this was referenced but never defined in this file since the
// 10-03 music-lock commit — the ReferenceError was swallowed by try/catch and
// every daily short rendered WITHOUT music. Defined here (same as yt-deepdive).
const APPROVED_MUSIC = JSON.parse(fs.readFileSync(new URL('./yt-brands/approved-music.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), 'utf8'));
const FF = process.env.FFMPEG_PATH || 'ffmpeg';

function channelAuth(forSlug) {
  const envName = `YT_TOKEN_${forSlug.toUpperCase().replace(/-/g, '_')}`;
  const tokenFile = path.join(process.cwd(), `yt-mcp/channels/${forSlug}/token.json`);
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
// #55: write ONLY this run's slug — writing back the whole merged snapshot
// clobbered concurrent channels' fresher state (staggered crons overlap).
const saveState = () => saveChannelState(slug, state[slug]);

function nextSlotISO(hhmm, now = new Date()) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m, 0));
  if (d <= new Date(now.getTime() + 35 * 60 * 1000)) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().replace(/\.\d+Z$/, 'Z');
}

// #106 T5b thumb-candidate emission (SEAM 2): shelf the rendered variants as
// thumb_candidate artifacts + job index rows + (where a script row exists)
// meta.thumb_candidates — the shape /review reads. Fail-soft end to end; the
// single-candidate path (THUMB_CANDIDATES=1) never calls this.
async function emitRenderThumbCandidates(thumbs, scriptId = null, scriptStore = null) {
  if (THUMB_CANDIDATES <= 1 || !Array.isArray(thumbs) || thumbs.length <= 1) return;
  try {
    const seams = await import('./lib/review-seams.mjs');
    const { makeArtifactStore } = await import('./lib/artifact-store.mjs');
    let jobs = null;
    try { jobs = await (await import('./lib/job-store.mjs')).getJobStore(); } catch { }
    const r = await seams.emitThumbCandidates({
      thumbs, artifacts: makeArtifactStore(), jobs,
      jobId: process.env.PIPELINE_JOB_ID || null, step: 'post',
      scriptStore, scriptId,
      log: (m) => console.log(`  [review] ${m}`),
    });
    if (r.candidates.length) console.log(`  [review] ${r.candidates.length} thumbnail candidates emitted (candidate 1 ships; swap at Studio > Review)`);
  } catch (e) {
    console.log(`  [review] thumb candidates degraded (non-fatal): ${String(e?.message || e).slice(0, 80)}`);
  }
}

// #106 T5b SEAM 3 (D14): the video_id write-back — this upload path is the
// only code that holds both the returned videoId and the job id. Fail-soft;
// a legacy (non-gated) lane has no script rows, so this is a SILENT no-op
// there (byte-identical log).
async function writeBackVideoIdFor(slug, videoId, kind, slotDate = null) {
  try {
    const seams = await import('./lib/review-seams.mjs');
    const { getScriptStore } = await import('./lib/script-store.mjs');
    await seams.writeBackVideoId({
      scriptStore: await getScriptStore(), channelId: slug,
      jobId: process.env.PIPELINE_JOB_ID || null, kind, videoId, slotDate,
      log: (m) => console.log(`  [review] ${m}`),
    });
  } catch { }
}

// ---- #106 T5b SEAM 1 (resume side): an approval dispatched resume=<held job
// id>. The child renders from the STORED full_render_input — generation is
// structurally impossible in this path (there is no generate call to remove;
// pinned by tests/review-seams.test.mjs: the render input EQUALS the stored
// JSON with zero LLM generation calls). The owner's dispatch bypasses the
// cadence guards below (pause/Sunday/already-produced): an approval is a
// deliberate production order, and D8 recomputes publishAt from the kit slots
// so a review delay can never publish instantly. A store that is unreadable
// or has no approved script exits WITHOUT regenerating (fail-closed — the
// approval's whole point is that THIS text ships).
async function resumeApprovedScript({ slug, jobId, b }) {
  const log = (m) => console.log(`[review] ${m}`);
  let store = null;
  let seams = null;
  try {
    const [ss, seamsMod] = await Promise.all([import('./lib/script-store.mjs'), import('./lib/review-seams.mjs')]);
    seams = seamsMod;
    store = await ss.getScriptStore();
  } catch (e) {
    log(`resume: seam import failed (${String(e?.message || e).slice(0, 80)})`);
    return false;
  }
  if (!store) {
    log('resume: script store unavailable — refusing to re-generate (fail-closed). Re-dispatch once the database is reachable.');
    return false;
  }
  const found = await seams.findResumableScript({ scriptStore: store, jobId, channelId: slug });
  if (!found.ok) {
    log(`resume: script store read failed (${found.error}) — refusing to re-generate (fail-closed)`);
    return false;
  }
  if (!found.script) {
    log(`resume: no approved script for job ${String(jobId).slice(0, 12)}… / ${slug} — nothing to render (already consumed, or the approval never landed)`);
    return false;
  }
  const stored = seams.storedInputOf(found.script);
  if (!stored) {
    log(`resume: script ${found.script.id} has no usable stored render input — refusing to re-generate (D4)`);
    return false;
  }
  const page = { id: 'yt-' + slug, ytSlug: slug, name: b.label, niche: b.niche, ytBrand: b };
  log(`resume: rendering the APPROVED script from its STORED input (${found.via}) — zero generation calls`);
  const script = { hook: stored.hook, points: stored.points, closing: stored.closing || '', thumbHeadline: stored.thumbHeadline || '', source: 'review-stored' };
  // D8/AC-P4-19: publishAt recomputed from the kit's slot times BEFORE any
  // render spend — the stored publishAt is history by construction (the
  // approval came later), and a past publishAt would publish instantly. No
  // future slot remains today => take the skip terminal WITHOUT rendering.
  const publishAt = nextFutureSlotISO(b.slots, { now: new Date() }) || stored.publishAt || (b.slots?.length ? nextSlotISO(b.slots[0]) : null);
  if (publishAt && new Date(publishAt).getTime() <= Date.now()) {
    log(`resume: no future slot remains today (publishAt ${publishAt} already past) — slot skipped before any render spend (AC-P4-19; the script STAYS approved)`);
    return false;
  }
  let music = null;
  try {
    const pool = APPROVED_MUSIC[slug];
    music = pool?.length
      ? await pickApprovedTrack(pool)
      : (b.musicFeels?.length ? await pickMusicTrack(0, { feels: b.musicFeels }) : null);
    if (music) console.log(`  ♫ ${music.title} (${music.feel || 'mood'})`);
  } catch (e) { console.log(`  [music] skipped: ${String(e.message).slice(0, 60)}`); }
  const out = await renderYouTubeScriptShort(page, script, music, { thumbVariants: THUMB_CANDIDATES });
  const meta = buildScriptMeta(page, script, music ? `${music.title} — ${music.credit}` : '');
  const slotIdx = Number.isInteger(found.script.slot_idx) ? found.script.slot_idx : 0;
  const slotDate = /^\d{4}-\d{2}-\d{2}$/.test(String(found.script.slot_date || '')) ? found.script.slot_date : today;
  const stamp = `review-${Date.now()}`;
  fs.mkdirSync(`fb-outbox/${slug}`, { recursive: true });
  const mp4Path = `fb-outbox/${slug}/${stamp}.mp4`;
  fs.writeFileSync(mp4Path, out.buffer);
  if (!validateUploadOrSkip(mp4Path, meta.title, (m) => console.log(m))) {
    log('resume: the render failed upload validation — the script STAYS approved (not consumed); fix and redispatch');
    try { fs.unlinkSync(mp4Path); } catch { }
    return false;
  }
  fs.writeFileSync(`fb-outbox/${slug}/${stamp}.json`, JSON.stringify({ videoFile: mp4Path, publishAt, title: meta.title, description: meta.description, tags: meta.tags, slug }, null, 2));
  // thumbnail candidates first (candidate 1 = the auto-set default, M7)
  await emitRenderThumbCandidates(out.thumbs, found.script.id, store);
  const ytAuth = channelAuth(slug);
  const yt = google.youtube({ version: 'v3', auth: ytAuth });
  const intents = await getUploadIntentStore();
  // #106 P5 T2c (D4/AC-P5-4): the approved script's template may declare fixed
  // disclaimers — the upload DESCRIPTION gains them machine-appended (code,
  // never the LLM). Null = nothing declared = byte-identical description.
  const resumeDisclaimers = await declaredDisclaimers(await resolveTemplateId(slug));
  const up = await uploadWithIntent({
    store: intents, channelId: slug, slotDate, kind: 'short', slotIdx,
    title: meta.title, jobId: process.env.PIPELINE_JOB_ID || null,
    accessToken: await oauthAccessToken(ytAuth),
    resource: {
      snippet: { title: meta.title, description: appendDisclaimers(`${meta.description}\n\n${b.hashtags || ''}`.trim(), resumeDisclaimers), tags: meta.tags, categoryId: '27', defaultLanguage: 'en', defaultAudioLanguage: 'en' },
      status: { privacyStatus: 'private', publishAt, selfDeclaredMadeForKids: false }
    },
    bytes: out.buffer, publishAt,
    log: (m) => console.log(`  [intent] ${m}`),
  });
  if (up.skipProduction && !up.videoId) {
    console.log('  ✗ resumed slot skipped (intent conflict or past publishAt — the safe direction, AC-P4-6/D8)');
    try { fs.unlinkSync(`fb-outbox/${slug}/${stamp}.json`); } catch { }
    try { fs.unlinkSync(mp4Path); } catch { }
    return false;
  }
  if (!up.ok) throw new Error(`upload failed: ${up.error}`);
  const videoId = up.videoId;
  if (up.conflict) {
    // The slot was produced by a crashed run's video — claim it (round-1
    // MAJOR 4 semantics): heal the thumbnail, SKIP the pinned comment (the
    // original run may have pinned one), record the CLAIMED video, and
    // retire the script with it (the slot is produced either way).
    console.log(`  ✓ intent conflict resolved: ${videoId} is already on YouTube — claimed, NOT re-uploaded`);
    if (out.thumb) { try { await yt.thumbnails.set({ videoId, media: { body: Readable.from(out.thumb) } }); console.log('  ✓ thumbnail set (claimed video)'); } catch { } }
    try {
      const mc = await store.markConsumed(found.script.id, videoId);
      if (mc.ok) log(`script ${found.script.id} -> consumed (claimed ${videoId})`);
    } catch { }
    const st = loadState();
    st[slug] = st[slug] || {};
    st[slug].uploadsToday = nextCounter(st[slug].uploadsToday);
    st[slug].lastRunDate = today;
    st[slug].lastVideos = [{ videoId, publishAt, title: up.existing?.title_fingerprint || meta.title, recovered: true }];
    saveChannelState(slug, st[slug]);
    return true;
  }
  console.log(`  ✓ resumed ${videoId} → https://youtube.com/shorts/${videoId}`);
  if (out.thumb) { try { await yt.thumbnails.set({ videoId, media: { body: Readable.from(out.thumb) } }); console.log('  ✓ thumbnail set (candidate 1)'); } catch { } }
  try {
    await yt.commentThreads.insert({ part: 'snippet', requestBody: { snippet: { videoId, topLevelComment: { snippet: { textOriginal: `Which one hit hardest? 👇 Subscribe for daily ${b.kwShort}.` } } } } });
  } catch { }
  try {
    if (process.env.GH_TOKEN || process.env.GITHUB_PAT) {
      await archiveUpload(videoId, mp4Path, (m) => console.log('  ' + m));
    }
  } catch (e) { console.log(`  [archive] skipped: ${String(e.message).slice(0, 60)}`); }
  // the videoId landed — NOW the record retires (SEAM 3, by id: this IS the row)
  try {
    const mc = await store.markConsumed(found.script.id, videoId);
    if (mc.ok) log(`script ${found.script.id} -> consumed (${videoId})`);
    else if (mc.error) log(`WARN consume degraded (non-fatal): ${mc.error}`);
  } catch { }
  // state: the slot is produced — carry the same record shape the pipeline
  // embeds (lastVideos[].text) and mark the day produced for THIS lane
  const st = loadState();
  st[slug] = st[slug] || {};
  st[slug].uploadsToday = nextCounter(st[slug].uploadsToday);
  st[slug].lastRunDate = today;
  st[slug].titleHistory = [...(st[slug].titleHistory || []), { t: meta.title, at: publishAt }].slice(-60);
  st[slug].lastVideos = [{ videoId, publishAt, title: meta.title, resumedReview: true, text: [script.hook, ...(script.points || []).map((p) => p?.line || ''), script.closing].filter(Boolean).join('\n\n') }];
  saveChannelState(slug, st[slug]);
  log(`✓ approved script shipped — the approval loop is closed (hold → review → resume-render from the STORED input)`);
  return true;
}

const state = loadState();
const today = new Date().toISOString().slice(0, 10);
// #106 T5b SEAM 1 (resume): runs BEFORE the cadence guards — see the function
// comment. Exit 1 surfaces a refused resume to the pipeline (the job records
// the failed step; the approval row stands for a later redispatch).
if (RESUME_SCRIPT_JOB) {
  const okResume = await resumeApprovedScript({ slug, jobId: RESUME_SCRIPT_JOB, b });
  process.exit(okResume ? 0 : 1);
}
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

const page = { id: 'yt-' + slug, ytSlug: slug, name: b.label, niche: b.niche, ytBrand: b };

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

  const ytAuth = channelAuth(slug);
  const yt = google.youtube({ version: 'v3', auth: ytAuth });
  // 10-05 DUPLICATE TITLE GATE — live titles from YouTube (state can be days
  // thin), plus this run's own titles so one run can never repeat itself.
  // #36: on API failure fall back to the durable titleHistory instead of
  // failing the gate open — quota exhaustion was the exact correlated
  // condition of the Oct-1 collapse.
  const recentTitles = await recentUploadTitles(yt, {
    fallback: (state[slug]?.titleHistory || []).map((h) => h?.t).filter(Boolean),
  });
  const seenThisRun = [];
  const rejectedSeeds = []; // dup-gate rejections cool their trend source (#91)
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
    const subNicheList = Array.isArray(b.niches) && b.niches.length ? b.niches : [b.niche];
    for (let k = themesToday.length; k < b.slots.length; k++) {
      let seed = null;
      for (let off = 0; off < waves.length; off++) {
        const cand = waves[(dayIdx * b.slots.length + k + off) % waves.length];
        if (!usedSeeds.includes(cand.title) && !themesToday.some((t) => t.seed === cand.title)) { seed = cand; break; }
      }
      if (!seed) {
        // all waves already used — rotate by day-index, but skip seeds whose
        // last generation was dup-gate rejected (#91: IC looped one Buffett
        // theme for 5 days because this fallback re-picked the cooled seed)
        let idx = (dayIdx * b.slots.length + k) % waves.length;
        const cooled = state[slug]?.cooldownSeeds || [];
        for (let off = 0; off < waves.length; off++) {
          const cand = waves[(idx + off) % waves.length];
          if (!cooled.includes(cand.title)) { idx = (idx + off) % waves.length; break; }
        }
        seed = waves[idx];
      }
      const slotSubNiche = subNicheList[(dayIdx * b.slots.length + k) % subNicheList.length];
      themesToday.push({
        seed: seed.title,
        subNiche: slotSubNiche,
        topic: `Sub-niche focus: "${slotSubNiche}" (Channel Niche: "${b.niche}"). Build today's video around the THEME of this proven viral video in this space right now: "${seed.title}" (${seed.views.toLocaleString('en-US')} views in the last 14 days). Reimagine it natively for ${b.label} — do NOT copy its title or wording; bring a fresh, original angle. Weave in what is currently working: ${(page.trend.hotKeywords.slice(0, 6)).join(', ')}.${page.viewerTerms?.length ? ` Your own viewers found this channel by searching: ${page.viewerTerms.slice(0, 8).join(', ')} — work the strongest of these real search words naturally into the hook and points.` : ''}`
      });
    }
  }
  console.log(`[topics] ${themesToday.map(t => '← ' + (t.subNiche ? `[${t.subNiche}] ` : '') + t.seed.slice(0, 40)).join(' | ') || 'none — research unavailable'}`);
  // off-niche drift guard prevents stoicism words leaking into pure finance channels
  const OFF_NICHE = (slug === 'quotequarry' || b.fromRegistry) ? null : /\bstoic\w*|manipulat\w*|toxic|calm your mind|dark psychology\b/i;

  const slotLimit = TOPUP_N > 0 ? Math.min(TOPUP_N, b.slots.length) : b.slots.length;
  // #105 D6/D8 threading: the channel's active template assignment carries the
  // brain's finance-gating signal + registry thresholds into the /dedupe gate.
  // Fail-open null (template-less = D8 defaults, non-finance tiers).
  const brainTemplateId = await resolveTemplateId(slug);
  // #106 P5 T2c (D4/AC-P5-4): the same assignment's fixed disclaimers — the
  // machine-append list for every upload DESCRIPTION this run (code, never the
  // LLM). Null = nothing declared = byte-identical descriptions (the legacy
  // 7 declare none).
  const templateDisclaimers = await declaredDisclaimers(brainTemplateId);
  // #106 T3 (D7a/AC-P4-8): BEFORE any slot production (including --topup),
  // resolve ANY open upload intent for this channel — any day, not just
  // today's. A resolved intent = the video exists on YouTube: the state entry
  // is written here, the slot is marked produced, and production for it is
  // SKIPPED — never a second upload. Abandoned = no video; this run produces
  // fresh (the abandoned row is re-claimable by the intent mutex).
  const intents = await getUploadIntentStore();
  const recoveredSlotIdx = new Set();
  if (intents) {
    try {
      const intentLog = (m) => console.log(`  [intent] ${m}`);
      // Round-1 MAJOR 3: kind-scoped — this lane recovers only SHORT intents;
      // a crashed doc intent belongs to yt-deepdive's own sweep.
      const rec = await recoverOpenIntents({
        store: intents, channelId: slug, kind: 'short', findByTitle: makeFindByTitle(yt, { log: intentLog }), log: intentLog,
      });
      for (const o of rec.outcomes) {
        if (o.status === 'resolved') {
          // Minor 8: record the recovered video's OWN schedule — the committed
          // publishAt from the probe body when we have it, else the kit slot
          // time ON THE RECOVERED SLOT'S DATE. Never now(), never a
          // rolled-forward occurrence for a past recovery.
          const rp = o.publishAt || slotISOOnDate(o.slotDate, b.slots[o.slotIdx]);
          console.log(`  [intent] recovered ${o.videoId} for slot ${o.slotDate}#${o.slotIdx} (${o.via}${rp ? `, publishAt ${rp}` : ''}) — state entry written, slot marked produced`);
          results.push({ videoId: o.videoId, publishAt: rp, title: o.title || o.intent.title_fingerprint || '', recovered: true });
          state[slug] = state[slug] || {};
          state[slug].uploadsToday = nextCounter(state[slug].uploadsToday);
          if (o.kind === 'short' && o.slotDate === today && o.slotIdx < slotLimit) recoveredSlotIdx.add(o.slotIdx);
        } else if (o.status === 'abandoned') {
          console.log(`  [intent] slot ${o.slotDate}#${o.slotIdx} abandoned — producing fresh this run`);
        } else {
          console.log(`  [intent] slot ${o.slotDate}#${o.slotIdx} left open (${o.reason}) — the slot mutex holds`);
        }
      }
    } catch (e) {
      console.log(`  [intent] recovery skipped (non-fatal): ${String(e.message).slice(0, 100)}`);
    }
  }
  let slotErrors = 0; // #35: a mid-loop throw used to kill the whole run silently
  for (let i = 0; i < slotLimit; i++) { try {
    if (recoveredSlotIdx.has(i)) {
      console.log(`  slot ${i + 1} already produced (recovered upload intent) — skipped (AC-P4-8)`);
      continue;
    }
    const publishAt = nextSlotISO(b.slots[i]);
    console.log(`\n[${slug}] short ${i + 1}/${b.slots.length} → goes public ${publishAt}`);
    if (!themesToday[i]) {
      console.log('  ✗ no researched topic (trend research failed) — slot skipped (fail-closed, no static fallback)');
      continue;
    }
    let script = await generateYouTubeScript(page, themesToday[i].topic, { templateId: brainTemplateId });
    for (let t = 0; OFF_NICHE && t < 2 && OFF_NICHE.test(JSON.stringify(script.points)); t++) {
      console.log('  off-niche drift — regenerating');
      script = await generateYouTubeScript(page, themesToday[i].topic, { templateId: brainTemplateId });
    }
    // GATE: near-duplicate of anything already on the channel (or made earlier
    // in this run) — skip BEFORE rendering, this is what fed the Oct-1 collapse
    // #36: scripts never had a .title — the gate read undefined and never
    // fired. thumbHeadline is the meta title's first segment and normTitle
    // drops everything after "|", so this is the exact meta-title verdict,
    // one full render earlier.
    const preTitle = script.thumbHeadline || script.hook || '';
    const preDup = findDup(preTitle, recentTitles, seenThisRun);
    if (preDup) {
      console.log(`  GATE: duplicate title "${preTitle}" ≈ "${preDup}" — slot skipped before render`);
      if (themesToday[i]?.seed) rejectedSeeds.push(themesToday[i].seed); // cool the source (#91)
      results.push({ videoId: null, publishAt, title: preTitle, gateRejected: true });
      continue;
    }
    if (script.source === 'fallback') {
      // Quota out → the slot SKIPS. Recycle was REMOVED 09-18: re-uploading the
      // same file reads as reused content to YouTube and suppresses the channel
      // (fail-closed rule: a missing video is free, a reuse strike costs weeks).
      console.log('  ✗ no AI script — slot skipped (recycle removed 09-18)');
      continue;
    }
    // #106 T5b SEAM 1 (generate-only): the pipeline's gate held this run with
    // no approved script — the surviving script (the brain's D5/D6 dedupe walk
    // ran inside the generator; the title gate above BLOCKED dups) is
    // persisted BEFORE any render (AC-P4-17) and this slot STOPS here: no
    // music, no TTS, no render, no upload. A blocked or fallback script is
    // never saved; an exhausted walk never reaches this branch either.
    if (GENERATE_ONLY) {
      const seams = await import('./lib/review-seams.mjs');
      const { getScriptStore } = await import('./lib/script-store.mjs');
      const store = await getScriptStore();
      if (!store) {
        console.log('  [review] script store unavailable — script NOT saved (fail-closed; the gate re-holds and this retries next run)');
        results.push({ videoId: null, publishAt, title: preTitle, generateOnly: true });
        continue;
      }
      const saved = await seams.saveGeneratedScript({
        scriptStore: store,
        channelId: slug,
        templateId: brainTemplateId || null,
        templateVersion: process.env.PIPELINE_TEMPLATE_VERSION || null,
        kind: 'short',
        title: buildScriptMeta(page, script, '').title,
        script,
        seed: themesToday[i]?.seed || null,
        themes: themesToday[i]?.topic || null,
        publishAt,
        slotDate: process.env.REVIEW_SCRIPT_SLOT_DATE || today,
        slotIdx: i,
        jobId: process.env.PIPELINE_JOB_ID || null,
      });
      if (saved.ok) {
        console.log(`  [review] script saved awaiting_review (${saved.id}) — nothing renders until an owner approves at Studio > Review`);
      } else {
        console.log(`  [review] WARN script not saved (${saved.error}) — the slot retries on the next run`);
      }
      results.push({ videoId: null, publishAt, title: preTitle, generateOnly: true, awaitingReview: saved.ok });
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
    // T5b round 1: the candidate count threads into EVERY gated-config render —
    // without it this path always produced a single thumb and the pipeline's
    // "3 candidates" log lied.
    const out = await renderYouTubeScriptShort(page, script, music, { thumbVariants: THUMB_CANDIDATES });
    const meta = buildScriptMeta(page, script, music ? `${music.title} — ${music.credit}` : '');

    const stamp = `${Date.now()}-s${i}`;
    // #53: the .json is the FB/IG cross-post pickup marker — it is written
    // only after both gates pass, so a rejected render can never be
    // scheduled downstream. The .mp4 alone (no .json) is invisible to the
    // drain loops and gets unlinked on rejection.
    fs.mkdirSync(`fb-outbox/${slug}`, { recursive: true });
    const mp4Path = `fb-outbox/${slug}/${stamp}.mp4`;
    fs.writeFileSync(mp4Path, out.buffer);

    if (!validateUploadOrSkip(mp4Path, meta.title, (m) => console.log(m))) {
      if (themesToday[i]?.seed) rejectedSeeds.push(themesToday[i].seed); // cool the source (#91)
      results.push({ videoId: null, publishAt, title: meta.title, gateRejected: true });
      try { fs.unlinkSync(mp4Path); } catch { }
      continue;
    }
    // GATE: final check on the exact upload title (meta can reword script.title)
    const metaDup = findDup(meta.title, recentTitles, seenThisRun);
    if (metaDup) {
      console.log(`  GATE: duplicate upload title "${meta.title}" ≈ "${metaDup}" — upload skipped`);
      if (themesToday[i]?.seed) rejectedSeeds.push(themesToday[i].seed); // cool the source (#91)
      results.push({ videoId: null, publishAt, title: meta.title, gateRejected: true });
      try { fs.unlinkSync(mp4Path); } catch { }
      continue;
    }
    fs.writeFileSync(`fb-outbox/${slug}/${stamp}.json`, JSON.stringify({ videoFile: mp4Path, publishAt, title: meta.title, description: meta.description, tags: meta.tags, slug }, null, 2));
    seenThisRun.push(meta.title);
    // #106 T3 (D6/AC-P4-6/7): explicit two-step resumable upload. The intent
    // row is the INSERT mutex (a conflict NEVER re-uploads); the session URI
    // is persisted BEFORE the first byte; the videoId lands on the row on 201.
    // #106 P5 T2c (D4/AC-P5-4): the description carries the template's fixed
    // disclaimers machine-appended — unconditional in code for declaring
    // templates (QA Row 10's boundary probe pins the unconditionality).
    const up = await uploadWithIntent({
      store: intents, channelId: slug, slotDate: today, kind: 'short', slotIdx: i,
      title: meta.title, jobId: process.env.PIPELINE_JOB_ID || null,
      accessToken: await oauthAccessToken(ytAuth),
      resource: {
        snippet: { title: meta.title, description: appendDisclaimers(`${meta.description}\n\n${b.hashtags || ''}`.trim(), templateDisclaimers), tags: meta.tags, categoryId: '27', defaultLanguage: 'en', defaultAudioLanguage: 'en' },
        status: { privacyStatus: 'private', publishAt, selfDeclaredMadeForKids: false }
      },
      bytes: out.buffer, publishAt,
      log: (m) => console.log(`  [intent] ${m}`),
    });
    if (up.skipProduction && !up.videoId) {
      console.log('  ✗ slot skipped (upload-intent conflict or past publishAt — the safe direction, AC-P4-6/D8)');
      // #53 fail-closed: nothing was uploaded here, so the FB/IG pickup marker
      // must not survive — an unuploaded render never crosses the gates.
      try { fs.unlinkSync(`fb-outbox/${slug}/${stamp}.json`); } catch { }
      try { fs.unlinkSync(mp4Path); } catch { }
      results.push({ videoId: null, publishAt, title: meta.title, intentSkip: true });
      continue;
    }
    if (!up.ok) throw new Error(`upload failed: ${up.error}`);
    const videoId = up.videoId;
    // #99 shared-pool ledger: count this successful upload (persisted by the
    // end-of-run state write below, which spreads state[slug])
    state[slug] = state[slug] || {};
    state[slug].uploadsToday = nextCounter(state[slug].uploadsToday);
    if (up.conflict) {
      // Round-1 MAJOR 4 + minor 9: the slot was produced by a CRASHED run's
      // video — record ITS fingerprint (this run's script text belongs to no
      // video and must never be embedded against the claimed videoId), heal
      // the thumbnail if we can, and SKIP the pinned comment (the original
      // run may have pinned one; two comments on one Short reads as spam).
      console.log(`  ✓ intent conflict resolved: ${videoId} is already on YouTube — claimed, NOT re-uploaded`);
      results.push({ videoId, publishAt, title: up.existing?.title_fingerprint || meta.title, recovered: true });
      if (out.thumb) { try { await yt.thumbnails.set({ videoId, media: { body: Readable.from(out.thumb) } }); console.log('  ✓ thumbnail set (claimed video)'); } catch { } }
      continue;
    }
    console.log(`  ✓ queued ${videoId} → https://youtube.com/shorts/${videoId}`);
    if (out.thumb) { try { await yt.thumbnails.set({ videoId, media: { body: Readable.from(out.thumb) } }); console.log('  ✓ thumbnail set'); } catch { } }
    // #106 T5b SEAM 2: where the gate's template config enabled picking, the
    // N rendered variants land in the artifact index (candidate 1 was just
    // auto-set; the owner swaps at Studio > Review). No script row exists on
    // the legacy render path — the index carries them.
    await emitRenderThumbCandidates(out.thumbs, null, null);
    // #106 T5b SEAM 3: video_id write-back (D14) — silent no-op on the
    // legacy (no script rows) path; the fallback is SLOT-SCOPED (round 1:
    // an unrelated approved script is never retired with this video's id).
    await writeBackVideoIdFor(slug, videoId, 'short', today);
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
    // #105 AC-P3-17: carry the script text in state — the shorts script never
    // had a durable home; the pipeline embeds it into the Brain at publish
    // time (only uploaded slots get here, so ghosts are never captured).
    results.push({ videoId, publishAt, title: meta.title, text: [script.hook, ...(script.points || []).map((p) => p?.line || ''), script.closing].filter(Boolean).join('\n\n') });

    // ---- Video frames → FB image posts ----
    // 2026-10-23 owner: platforms paused (YouTube-only focus) — skip FB images
    if (process.env.PLATFORMS_PAUSED !== '0') {
      console.log('  [fb-image] skipped (platforms paused — YouTube-only focus)');
    } else try {
      const videoFile = `fb-outbox/${slug}/${stamp}.mp4`;
      const pageId = fbPageId(slug); // canonical map — lib/registry.mjs (was drifted: QQ pointed at the retired page, #38)
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
    } catch (e) {
      // #35: isolate the slot failure — record it, keep the remaining slots
      slotErrors++;
      console.log(`  ✗ slot ${i + 1} failed: ${String(e.message).slice(0, 140)} — continuing to next slot`);
      results.push({ videoId: null, publishAt: publishAt || null, title: null, slotError: true });
    }
  }
  // #106 T5b SEAM 1 (generate-only): the slot is NOT produced — nothing was
  // rendered or uploaded, so lastRunDate NEVER advances (an approval's resume
  // must be able to render TODAY, and a rejection frees tomorrow's fresh
  // generation). Round 1: the seed rotation DOES advance (used + cooled
  // seeds) — an unapproved channel must diversify nightly, not spin on the
  // same near-identical topics while its scripts sit in the queue.
  if (GENERATE_ONLY) {
    const generated = results.filter((r) => r.awaitingReview).length;
    state[slug] = {
      ...(state[slug] || {}),
      usedTrendSeeds: [...usedSeeds, ...themesToday.map(t => t.seed)].slice(-40),
      cooldownSeeds: [...(state[slug]?.cooldownSeeds || []), ...rejectedSeeds].slice(-12),
    };
    saveState();
    console.log(`[review] generate-only done: ${generated} script(s) saved awaiting_review, 0 renders, 0 uploads — approve at Studio > Review to resume at render`);
    process.exit(0);
  }
  if (!EPISODE_ONLY) {
    // Heal run with produced reels covers the next cycle — suppress the morning
    // full run ONLY when tomorrow's slots are actually covered by healed reels
    // (#37: the old any-result rule suppressed after a reel landed TODAY,
    // causing day-on/day-off oscillation; partial tomorrow-coverage no longer
    // blanks the whole day). #35: error/gate slots never count.
    const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const suppressNext = TOPUP_N > 0 && shouldSuppressNext(results, b.slots.length, tomorrowStr);
    state[slug] = {
      ...(state[slug] || {}),
      lastRunDate: suppressNext ? new Date(Date.now() + 86400000).toISOString().slice(0, 10) : today,
      ...(TOPUP_N > 0 ? { healedDate: today, healedCount: results.length } : {}),
      usedTrendSeeds: [...usedSeeds, ...themesToday.map(t => t.seed)].slice(-40),
      cooldownSeeds: [...(state[slug]?.cooldownSeeds || []), ...rejectedSeeds].slice(-12),
      todayTopics: themesToday.map(t => ({ at: today, topic: t.seed })),
      // 10-05: durable title history — lastVideos alone only ever held the last
      // run, which is why cross-day duplicates went unnoticed for weeks
      titleHistory: [...(state[slug]?.titleHistory || []), ...results.filter(r => r.videoId).map(r => ({ t: r.title, at: r.publishAt }))].slice(-60),
      lastVideos: results, deepdiveDate: state[slug]?.deepdiveDate || null
    };
    saveState();
  }
  // #35: failed slots must not look like success — the state above already
  // carries this run's error markers (so verify-run reports THIS run
  // truthfully, not yesterday's), the owner gets the push, and the pipeline
  // sees a real failure instead of exit 0.
  if (slotErrors) {
    try {
      const { sendAlert } = await import('./lib/ntfy-alert.mjs');
      await sendAlert({ text: `${slug}: ${slotErrors} Shorts slot(s) failed mid-run — state saved with error markers, remaining slots were still attempted. Check the run log.`, title: `[${slug}] Shorts slots failed` });
    } catch { }
    process.exit(1);
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
