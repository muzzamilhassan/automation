// #97 SHORTS CLIPPER — turns one long-form documentary into branded vertical
// Shorts candidates for the clips-first lane (#95).
//   node longvideo/shorts-clips.mjs ensure-queue <slug> [--max K] [--local <dir>] [--archive]
//     -- finds the newest successful doc render run, downloads the video + SRT
//     + meta artifacts, asks the LLM to rank the best self-contained moments,
//     cuts + repacks them vertical (brand-pad, house captions, title card),
//     uploads them as GitHub Release assets and writes the clip queue into the
//     channel state (yt-mcp/state/<slug>.json clipQueue) for the publisher (#98).
//     --local <dir> reads video.mp4 / episode.srt / meta.json from disk instead
//     of GitHub artifacts (offline dev/backfill mode; queue points at local files).
//     --archive (CI, #96) with --local: ALSO uploads the cut clips to the
//     clips Release — Actions runners are ephemeral, file:-only entries die
//     with the runner and every post-docDay clip fails forever.
// Needs: GITHUB_TOKEN (or GITHUB_PAT), ffmpeg on PATH, GEMINI/GROQ/CEREBRAS key.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { loadEnv } from '../lib/env.mjs';
import { parseSrt } from '../lib/srt.mjs';
import { candidateWindows, parseSelection, pickTitles, cuesToWords, cardSvg } from '../lib/clipper.mjs';
import { buildAssCaptions } from '../youtube-engine.mjs';
import { isDupTitle } from '../lib/dup-gate.mjs';
import { sendAlert } from '../lib/ntfy-alert.mjs';
import { loadChannelState, saveChannelState, loadAllStates } from '../lib/state.mjs';
import { resolveBrand } from '../lib/brand-resolve.mjs';
import { nextSlotISO } from '../lib/schedule.mjs';
import { nextUnposted } from '../lib/clipper.mjs';
import { recentUploadTitles } from '../lib/dup-gate.mjs';
import { nextCounter } from '../lib/quota-ledger.mjs';
// #106 T3 (S2): upload intents — the note before any videos.insert (D5), the
// two-step resumable upload (D6), the run-start open-intent resolution (D7a).
import { getUploadIntentStore, uploadWithIntent, recoverOpenIntents, makeFindByTitle, oauthAccessToken, titleFingerprint, matchUploadedIntentsToQueue, slotISOOnDate } from '../lib/upload-intents.mjs';

loadEnv();
const REPO = process.env.GH_REPO || 'muzzamilhassan/automation';
// Actions pass the workflow token as GH_TOKEN; local runs use GITHUB_TOKEN/GITHUB_PAT
const TOK = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || process.env.GH_TOKEN || '';
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
// Main-module guard (#96): importing this file (tests, channel-pipeline's args
// builder) must not read argv, resolve a brand or exit.
const IS_MAIN = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

// CLI wiring — module-level lets so ensureQueue/postNext keep their closures;
// only initialized when this file IS the script being run.
let MODE = '', slug = null, localDir = null, maxArg = 3, archiveMode = false, b = null;
let PAD = '0x0A0A0A';
let log = (m) => console.log(m);
let fail = async (why) => { throw new Error(why); };
async function initCli() {
  MODE = process.argv[2] || '';
  slug = process.argv[3] || null;
  const args = process.argv.slice(4);
  archiveMode = args.includes('--archive');
  localDir = args.includes('--local') ? args[args.indexOf('--local') + 1] : null;
  maxArg = args.includes('--max') ? Number(args[args.indexOf('--max') + 1]) || 3 : 3;
  if (MODE !== 'ensure-queue' && MODE !== 'post-next') {
    console.log('usage: node longvideo/shorts-clips.mjs ensure-queue <slug> [--max K] [--local <dir>] [--archive]');
    console.log('       node longvideo/shorts-clips.mjs post-next <slug>');
    process.exit(2);
  }
  b = await resolveBrand(slug);
  if (!b) { console.error(`[clips] unknown slug: ${slug}`); process.exit(1); }
  PAD = (b.bg || '#0A0A0A').replace('#', '0x');
  log = (m) => console.log(`[clips:${slug}] ${m}`);
  fail = async (why, err) => {
    log(`✗ ${why}${err ? ': ' + String(err.message || err).slice(0, 120) : ''}`);
    await sendAlert({ text: `${slug} clips: ${why}${err ? ' — ' + String(err.message || err).slice(0, 200) : ''}`, title: `[${slug}] clips queue failed` });
    process.exit(1);
  };
}
if (IS_MAIN) await initCli();

// CLI contract for the doc-day pipeline feed (channel-pipeline Phase 5b):
// --local cuts from the fresh in-job render (its artifacts upload only later in
// the workflow); --archive ALSO pushes the cut clips to the clips Release —
// Actions runners are ephemeral, so file:-only entries die with the runner and
// every post-docDay clip fails forever (#96 hotfix). Dev runs stay pure-local.
export function ensureQueueArgs({ slug, feedDir, max = 4, ci = false }) {
  const args = ['ensure-queue', slug, '--local', feedDir, '--max', String(max)];
  if (ci) args.push('--archive');
  return args;
}

// ---------- gh api (artifact/release access) ----------
const ghApi = async (pathname) => {
  const r = await fetch(`https://api.github.com/repos/${REPO}/${pathname}`, {
    headers: { Authorization: `Bearer ${TOK}`, Accept: 'application/vnd.github+json', 'User-Agent': 'quarry-clips' },
  });
  if (!r.ok) throw new Error(`gh api ${pathname}: HTTP ${r.status}`);
  return r.json();
};
async function downloadArtifact(art, into) {
  const r = await fetch(art.archive_download_url, { headers: { Authorization: `Bearer ${TOK}`, 'User-Agent': 'quarry-clips' } });
  const zip = path.join(into, art.name + '.zip');
  fs.writeFileSync(zip, Buffer.from(await r.arrayBuffer()));
  spawnSync('unzip', ['-o', zip, '-d', into], { stdio: 'ignore' });
  fs.rmSync(zip, { force: true });
}

// ---------- LLM moment ranking (compact chain: gemini -> groq -> cerebras) ----------
async function llm(prompt) {
  const call = async (url, headers, body, pick) => {
    try {
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const txt = pick(await res.json());
      if (txt && String(txt).trim().length > 10) return String(txt);
      throw new Error('short/empty');
    } catch (e) { log(`  [brain] provider failed: ${String(e.message).slice(0, 60)}`); return null; }
  };
  let t = null;
  if (process.env.GEMINI_API_KEY) {
    t = await call(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { 'Content-Type': 'application/json' },
      { contents: [{ parts: [{ text: prompt }] }] },
      (j) => j?.candidates?.[0]?.content?.parts?.[0]?.text);
  }
  if (!t && process.env.GROQ_API_KEY) {
    t = await call('https://api.groq.com/openai/v1/chat/completions',
      { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      { model: 'openai/gpt-oss-120b', messages: [{ role: 'user', content: prompt }], temperature: 0.4 },
      (j) => j?.choices?.[0]?.message?.content);
  }
  if (!t && process.env.CEREBRAS_API_KEY) {
    t = await call('https://api.cerebras.ai/v1/chat/completions',
      { Authorization: `Bearer ${process.env.CEREBRAS_API_KEY}`, 'Content-Type': 'application/json' },
      { model: 'gpt-oss-120b', messages: [{ role: 'user', content: prompt }], temperature: 0.4 },
      (j) => j?.choices?.[0]?.message?.content);
  }
  return t;
}

// ---------- ffmpeg: cut + vertical repack + captions + title card ----------
function cutClip(videoFile, out, startSec, durSec, assFile, cardPng) {
  const capFilter = assFile ? `,subtitles='${assFile.replace(/\\/g, '/').replace(/:/g, '\\:')}':fontsdir=image-tools/fonts` : '';
  const vf = `[0:v]scale=1080:-2,setsar=1,pad=1080:1920:0:656:${PAD}[pv];` +
    `[pv][1:v]overlay=0:0:enable='lte(t,0.8)'[pc];` +
    `[pc]format=yuv420p${capFilter}[v]`;
  const r = spawnSync(FFMPEG, ['-y', '-v', 'error', '-ss', String(startSec), '-t', String(durSec), '-i', videoFile,
    '-i', cardPng, '-filter_complex', `${vf}`, '-map', '[v]', '-map', '0:a?',
    '-t', String(durSec), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', out],
    { stdio: ['ignore', 'ignore', 'pipe'], timeout: 600000 });
  if (r.status !== 0 || !fs.existsSync(out) || fs.statSync(out).size < 50000) {
    throw new Error(`ffmpeg cut failed: ${String(r.stderr).slice(-200)}`);
  }
}

// ---------- Release archive + queue mapping (exported for tests) ----------
// Uploads the cut clips to the Release `clips-<slug>-<docRunId>` (09-14 archive
// pattern — the publisher never re-downloads from YouTube) and maps them to
// queue entries. Runs whenever the queue must be Release-backed: artifact mode,
// or --local --archive in CI (#96). Each asset POST retries 3× (2s backoff;
// thrown fetch errors count as failed attempts) and a clip that never uploads
// is DROPPED with a loud [alert] log + ntfy — a queued entry without a
// servable url fails forever with "neither a local file nor a Release asset
// URL" once the runner that cut it is gone. If the Release itself can't be
// created/found the run fails loudly (no unhandled throw). Pure --local dev
// mode (archive=false) skips the Release entirely and queues file: paths.
export async function archiveAndMapClips({ slug, docRunId, clips, archive, local, backoffMs = 2000, tok = TOK, repo = REPO, log = (m) => console.log(m), alert = sendAlert, fetchImpl = fetch }) {
  if (archive) {
    const tag = `clips-${slug}-${docRunId}`;
    const ghApi = async (pathname) => {
      const r = await fetchImpl(`https://api.github.com/repos/${repo}/${pathname}`, {
        headers: { Authorization: `Bearer ${tok}`, Accept: 'application/vnd.github+json', 'User-Agent': 'quarry-clips' },
      });
      if (!r.ok) throw new Error(`gh api ${pathname}: HTTP ${r.status}`);
      return r.json();
    };
    let rel = null;
    try { rel = await ghApi(`releases/tags/${tag}`); } catch { }
    if (!rel || !rel.id) {
      try {
        const cr = await fetchImpl(`https://api.github.com/repos/${repo}/releases`, {
          method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', 'User-Agent': 'quarry-clips' },
          body: JSON.stringify({ tag_name: tag, name: `Clips ${slug} ${docRunId}`, body: `Vertical Shorts candidates from doc run ${docRunId} (#97).` }),
        });
        rel = cr.ok ? await cr.json() : await ghApi(`releases/tags/${tag}`);
      } catch { }
      if (!rel || !rel.id) await fail(`Release ${tag} unavailable (create + lookup failed) — clips cannot be archived`);
    }
    const dropped = [];
    const kept = [];
    for (const c of clips) {
      const name = path.basename(c.file);
      const existing = (rel.assets || []).find((a) => a.name === name);
      if (existing) { c.asset = existing.name; c.url = existing.url; kept.push(c); continue; }
      let up = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          up = await fetchImpl(`https://uploads.github.com/repos/${repo}/releases/${rel.id}/assets?name=${name}`, {
            method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/octet-stream', 'User-Agent': 'quarry-clips' }, body: fs.readFileSync(c.file),
          });
        } catch (e) {
          up = null; // a thrown fetch (ECONNRESET on a 25-60MB body) = failed attempt
          log(`[warn] asset upload attempt ${attempt}/3 threw for ${name}: ${String(e.message).slice(0, 80)}`);
        }
        if (up && up.ok) break;
        if (attempt < 3) { log(`[warn] asset upload attempt ${attempt}/3 failed for ${name}${up ? ` (HTTP ${up.status})` : ''} — retrying`); await new Promise((r) => setTimeout(r, backoffMs)); }
      }
      if (!up || !up.ok) {
        dropped.push(c);
        log(`[alert] DROPPED part ${c.part} "${c.title}" — Release asset ${name} failed to upload after 3 attempts; queueing it would fail forever with "neither a local file nor a Release asset URL"`);
        continue;
      }
      const asset = await up.json();
      c.asset = asset.name; c.url = asset.url;
      kept.push(c);
    }
    if (dropped.length) {
      // the #96 orphaned-clip failure mode was DISCOVERED via ntfy — a drop
      // must push too (sendAlert never throws; the queue save must not die here)
      await alert({
        text: `${slug} clips: DROPPED ${dropped.map((c) => `part ${c.part} "${c.title}"`).join(', ')} — Release asset upload failed after 3 attempts. ${kept.length}/${clips.length} clips queued.`,
        title: `[${slug}] clips: ${dropped.length} clip(s) dropped — Release upload failed`,
      });
    }
    clips = kept;
  }
  return clips.map((c) => ({ part: c.part, title: c.title, asset: c.asset, url: c.url, startSec: c.startSec, durSec: c.durSec, file: local ? c.file : undefined }));
}

// One on-the-fly lookup for a queued clip that lost its local file AND its url
// (e.g. queued by a pre-#96 --local run from a since-dead runner): find the
// asset on the doc run's clips Release before giving up. Returns {asset,url}
// or null — null falls through to the existing fail (its ntfy already fires).
export async function lookupQueuedClipAsset({ slug, docRunId, clip, tok = TOK, repo = REPO, fetchImpl = fetch }) {
  if (!docRunId) return null;
  try {
    const r = await fetchImpl(`https://api.github.com/repos/${repo}/releases/tags/clips-${slug}-${docRunId}`, {
      headers: { Authorization: `Bearer ${tok}`, Accept: 'application/vnd.github+json', 'User-Agent': 'quarry-clips' },
    });
    if (!r.ok) return null;
    const rel = await r.json();
    const name = clip.asset || `clip-${String(clip.part).padStart(2, '0')}.mp4`;
    const a = (rel.assets || []).find((x) => x.name === name);
    return a ? { asset: a.name, url: a.url } : null;
  } catch { return null; }
}

// ---------- ensure-queue ----------
async function ensureQueue() {
const st = loadChannelState(slug);
const docTitle = (meta) => meta?.title || `${b.label} documentary`;
const tmp = localDir ? null : path.join('longvideo', `sc-tmp-${slug}`);
let videoFile, srtFile, meta, docRunId;

if (localDir) {
  docRunId = 'local-' + Date.now();
  videoFile = path.join(localDir, 'video.mp4');
  srtFile = path.join(localDir, 'episode.srt');
  meta = JSON.parse(fs.readFileSync(path.join(localDir, 'meta.json'), 'utf8'));
  if (!fs.existsSync(videoFile) || !fs.existsSync(srtFile)) await fail(`--local dir needs video.mp4 + episode.srt`);
  log(`local mode: ${videoFile}`);
} else {
  if (!TOK) await fail('GITHUB_TOKEN/GITHUB_PAT missing — cannot read doc artifacts');
  const SRC_WORKFLOW = process.env.CLIPS_SRC_WORKFLOW || 'channel-autopilot.yml';
  const runs = await ghApi(`actions/workflows/${SRC_WORKFLOW}/runs?status=success&per_page=14`);
  let chosen = null;
  for (const run of runs.workflow_runs || []) {
    if (String(run.id) === String(st.clipQueue?.lastRunId)) break;
    const arts = (await ghApi(`actions/runs/${run.id}/artifacts`)).artifacts || [];
    const vid = arts.find((a) => a.name === `lf-${slug}` && !a.expired);
    if (!vid) continue;
    if ((st.clipQueue?.doneRuns || []).includes(String(run.id))) { log(`run ${run.id} already clipped`); break; }
    chosen = { runId: String(run.id), vid, srt: arts.find((a) => a.name === `lf-srt-${slug}` && !a.expired), meta: arts.find((a) => a.name === `lf-meta-${slug}` && !a.expired) };
    break;
  }
  if (!chosen) { log('nothing new to clip'); return 'nothing-new'; }
  if (!chosen.srt) await fail(`doc run ${chosen.runId} has no lf-srt-${slug} artifact — it predates #96; wait for the next docDay run`);
  docRunId = chosen.runId;
  fs.mkdirSync(tmp, { recursive: true });
  log(`clipping doc run ${docRunId}`);
  await downloadArtifact(chosen.vid, tmp);
  await downloadArtifact(chosen.srt, tmp);
  if (chosen.meta) await downloadArtifact(chosen.meta, tmp);
  videoFile = path.join(tmp, `lf-${slug}.mp4`);
  srtFile = path.join(tmp, `lf-srt-${slug}.srt`);
  const metaPath = path.join(tmp, `lf-meta-${slug}.json`);
  meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
  if (!fs.existsSync(videoFile)) await fail('video mp4 missing after artifact extract');
}

// ---------- candidates -> LLM ranking -> dup-safe titles ----------
const cues = parseSrt(fs.readFileSync(srtFile, 'utf8'));
if (!cues.length) await fail('SRT parsed to zero cues', new Error('empty srt'));
const windows = candidateWindows(cues, { minDur: 20, maxDur: 60, stepCues: 2 });
if (!windows.length) await fail('no candidate windows built from SRT');
log(`${windows.length} candidate windows (target ${maxArg})`);

const rankingPrompt = `You are a YouTube Shorts editor. Below are numbered candidate segments (transcripts) from one documentary titled "${docTitle(meta)}" in the ${b.niche} niche.
Pick the ${maxArg} BEST standalone Shorts moments: self-contained story, strong hook potential, works without the surrounding context. Prefer segments that end on a payoff.
For EACH pick return: index (the candidate number), title (a Shorts title, max 60 chars, no channel suffix), altTitle (a different angle on the same clip).
Reply with ONLY JSON: {"picks":[{"index":0,"title":"...","altTitle":"..."}]} ranked best first.

CANDIDATES:
${windows.map((w) => `[${w.i}] (${w.startSec}s-${w.endSec}s) ${w.text}`).join('\n\n')}`;

const raw = await llm(rankingPrompt);
if (!raw) await fail('LLM moment selection failed (all providers)');
const picks = parseSelection(raw, windows);
if (!picks.length) await fail('LLM returned no valid picks', new Error(raw.slice(0, 120)));

const recent = (st.titleHistory || []).map((h) => h.t || h).filter(Boolean);
const titled = pickTitles(picks, recent, isDupTitle).slice(0, maxArg);
if (!titled.length) await fail('every picked clip title collided with recent uploads');

// ---------- cut + repack + release/queue ----------
const workDir = localDir ? path.join(localDir, 'clips') : tmp;
fs.mkdirSync(workDir, { recursive: true });
const clips = [];
for (let n = 0; n < titled.length; n++) {
  const p = titled[n];
  const w = windows[p.index];
  const out = path.join(workDir, `clip-${String(n + 1).padStart(2, '0')}.mp4`);
  const cardPng = path.join(workDir, `card-${n + 1}.png`);
  await sharp(Buffer.from(cardSvg({ title: p.title, brand: b.label, subline: docTitle(meta), accent: b.accent, bg: b.bg || '#0A0A0A' }))).png().toFile(cardPng);
  const winCues = cues.filter((c) => c.start >= w.startSec - 0.5 && c.end <= w.endSec + 0.5);
  let assFile = null;
  try {
    const ass = buildAssCaptions(cuesToWords(winCues, w.startSec), { width: 1080, height: 1920 });
    assFile = path.join(workDir, `cap-${n + 1}.ass`);
    fs.writeFileSync(assFile, ass, 'utf8');
  } catch (e) { log(`  [warn] captions skipped: ${String(e.message).slice(0, 60)}`); }
  cutClip(videoFile, out, w.startSec, w.durSec, assFile, cardPng);
  clips.push({ part: n + 1, file: out, title: p.title, startSec: w.startSec, durSec: w.durSec });
  log(`✓ clip ${n + 1}: "${p.title}" (${w.startSec}s +${w.durSec}s)`);
}
if (!clips.length) await fail('zero clips encoded');

// GitHub Release assets (09-14 archive pattern — the publisher never re-downloads from YouTube)
// + queue mapping. #96: --archive extends this to the --local doc-day feed in
// CI; failed uploads are DROPPED with a loud [alert] in every Release-backed
// mode — never queue an entry without a servable url.
const entries = await archiveAndMapClips({ slug, docRunId, clips, archive: !localDir || archiveMode, local: !!localDir, log });
// #96 review r1: an ALL-fail batch must fail loudly BEFORE saveChannelState —
// saving it would append the run to doneRuns (artifact path: marked
// "already clipped" forever) and arm Phase 5b's fedToday guard against a
// same-day retry, while post-next's empty queue is a silent skip on fresh docs.
// The per-clip drops were already ntfy'd inside the uploader.
if (entries.length === 0) await fail(`all ${clips.length} clips failed Release upload`);

// queue into the channel state (publisher #98 consumes it)
st.clipQueue = {
  lastRunId: docRunId,
  doneRuns: [...(st.clipQueue?.doneRuns || []), String(docRunId)].slice(-12),
  docTitle: docTitle(meta),
  createdAt: new Date().toISOString(),
  local: localDir ? true : undefined,
  clips: entries,
};
saveChannelState(slug, st);
if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
log(`queue ready: ${entries.length} clips from run ${docRunId} -> yt-mcp/state/${slug}.json clipQueue`);
return 'clipped';
}

if (IS_MAIN) {
  if (MODE === 'ensure-queue') await ensureQueue();
  else if (MODE === 'post-next') await postNext();
  else console.log('usage: node longvideo/shorts-clips.mjs ensure-queue <slug> | post-next <slug>');
}

// ---------- post-next (#98): publish one queued clip ----------
// Fail-closed: empty/exhausted queue = logged skip + ntfy alert, never a
// re-upload. Title re-checked against LIVE recent uploads (the queue-time
// check was against titleHistory); dup clips are skipped, not re-titled.
async function postNext() {
  let st = loadChannelState(slug);
  const todayUTC = new Date().toISOString().slice(0, 10);
  if (st.clipLastPostDate === todayUTC && !process.env.CLIPS_FORCE) {
    log(`clip Short already posted today — done`);
    process.exit(0);
  }
  // #100: scheduled-off day (kit shortDays, Studio-set) — silent skip, no alert
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const todayName = DAY_NAMES[new Date().getUTCDay()];
  const shortDays = Array.isArray(b.shortDays) ? b.shortDays : [];
  if (shortDays.length && !shortDays.includes(todayName)) {
    log(`${todayName} is not a short day (${shortDays.join('/')}) — skipped`);
    process.exit(0);
  }
  // #99 shared-pool ledger: the publisher respects the daily budget too
  const q = (await import('../lib/quota-ledger.mjs')).evaluate(loadAllStates());
  if (!q.allowed) {
    log(`[quota] upload skipped — shared pool ${q.usedUnits}/${q.dailyLimit} units today (${q.uploadsToday} uploads) — resets midnight PT`);
    await sendAlert({ text: `${slug}: clip upload skipped — YouTube API daily budget reached (${q.usedUnits}/${q.dailyLimit} units). Resets midnight PT.`, title: `[${slug}] clip upload blocked by quota` });
    process.exit(0);
  }
  let queue = st.clipQueue?.clips || [];
  if (!queue.length) {
    // #101 self-feed: nothing queued — try clipping the newest doc before giving up
    log('queue empty — checking for a new doc to clip...');
    await ensureQueue();
    st = loadChannelState(slug);
    queue = (st.clipQueue && st.clipQueue.clips) || [];
    if (!queue.length) {
      // expected dry day (queue consumed, next doc day ahead) → silent skip;
      // alert only when docs are STALE (weekly cadence broken = real problem)
      const dd = st.deepdiveDate ? new Date(st.deepdiveDate).getTime() : 0;
      const stale = !dd || (Date.now() - dd) > 8 * 86400000;
      if (stale) {
        log(`clip queue empty AND docs stale (last ${st.deepdiveDate || 'never'}) — alerting`);
        await sendAlert({ text: `${slug}: clip queue is EMPTY after a fresh ensure AND docs are stale (last: ${st.deepdiveDate || 'never'}) — no Short posted today. Check doc production.`, title: `[${slug}] clip queue empty + stale docs — Short skipped` });
      } else {
        log(`queue consumed — next doc day will refill (last doc ${st.deepdiveDate}) — silent skip`);
      }
      process.exit(0);
    }
  }

  // live dup gate needs the channel's recent upload titles
  const { google } = await import('googleapis');
  const envName = `YT_TOKEN_${slug.toUpperCase().replace(/-/g, '_')}`;
  const tokenFile = path.join('yt-mcp', 'channels', slug, 'token.json');
  const tokRaw = process.env[envName] || (fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8') : '');
  if (!tokRaw) await fail('no YouTube token for live dup gate');
  const auth = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: JSON.parse(tokRaw).refresh_token });
  const yt = new google.youtube({ version: 'v3', auth });

  // #106 T3 (D7a/AC-P4-8): resolve ANY open clip upload intent BEFORE picking.
  // A resolved intent = the clip is already on YouTube (a crashed run posted
  // it): mark the matching queue entry posted + today's state marks — the slot
  // is produced, never re-picked, never re-uploaded. Abandoned = a fresh clip
  // proceeds; open = the intent mutex guards the slot (the upload below then
  // conflict-skips).
  const intents = await getUploadIntentStore();
  if (intents) {
    const rec = await recoverOpenIntents({ store: intents, channelId: slug, kind: 'short', findByTitle: makeFindByTitle(yt, { log }), log });
    for (const o of rec.outcomes) {
      if (o.status === 'resolved' && o.kind === 'short') {
        log(`recovered clip upload ${o.videoId} (${o.slotDate}#${o.slotIdx}, ${o.via}) — marking the queue entry posted`);
        const fp = o.intent.title_fingerprint;
        const entry = (st.clipQueue?.clips || []).find((c) => !c.postedAt && titleFingerprint(c.title) === fp);
        if (entry) entry.postedAt = new Date().toISOString();
        else log(`  [warn] no unposted queue entry matches the recovered title — state marks still written`);
        st.clipLastPostDate = todayUTC;
        st.uploadsToday = nextCounter(st.uploadsToday);
        // Minor 8: the recovered clip's OWN schedule — committed publishAt
        // from the probe body, else the slot time on its own slot_date.
        const rp = o.publishAt || slotISOOnDate(o.slotDate, (b.slots && b.slots[0]) || '22:35');
        st.lastVideos = [{ videoId: o.videoId, publishAt: rp, title: o.title || o.intent.title_fingerprint || '', recovered: true }];
        st.titleHistory = [...(st.titleHistory || []), { t: o.title || o.intent.title_fingerprint || '', at: rp }].slice(-60);
        saveChannelState(slug, st);
        process.exit(0);
      }
      if (o.status === 'abandoned') log(`open intent ${o.slotDate}#${o.slotIdx} abandoned — proceeding with a fresh clip`);
      else if (o.status === 'open') log(`open intent ${o.slotDate}#${o.slotIdx} left open (${o.reason}) — the slot mutex holds`);
    }
    // Round-1 MAJOR 4 TERMINAL SWEEP: a run that died AFTER markUploaded but
    // BEFORE its queue entry was marked posted would let title rotation
    // re-pick — and weeks later RE-UPLOAD — the same clip. The intent row
    // holds the fingerprint that prevents it: mark those entries posted
    // before picking. Bookkeeping only — the pick below still proceeds.
    try {
      const done = await intents.uploadedIntentsFor(slug, { sinceMs: 7 * 24 * 3600_000 });
      const matches = matchUploadedIntentsToQueue({ uploadedIntents: done.ok ? done.intents : [], clips: st.clipQueue?.clips || [] });
      if (matches.length) {
        for (const { entry } of matches) entry.postedAt = entry.postedAt || new Date().toISOString();
        saveChannelState(slug, st);
        log(`sweep: ${matches.length} queued clip(s) already uploaded per the intent ledger — marked posted, never re-picked`);
      }
    } catch (e) {
      log(`terminal sweep skipped (non-fatal): ${String(e.message).slice(0, 80)}`);
    }
  }

  const liveTitles = await recentUploadTitles(yt, { max: 45 });
  const pick = nextUnposted(queue, liveTitles, isDupTitle);
  if (!pick) {
    log(`queue exhausted (all posted or dup vs live uploads) — Shorts skipped today`);
    await sendAlert({ text: `${slug}: clip queue EXHAUSTED — every queued clip is posted or dup-flagged. Run ensure-queue after the next docDay render.`, title: `[${slug}] clip queue exhausted — Short skipped` });
    process.exit(0);
  }
  const { clip, skipped } = pick;
  skipped.forEach((s) => log(`  skip part ${s.part}: ${s.reason}`));

  // fetch the clip file: local path (dev queue) or GitHub Release asset
  let file = clip.file;
  if (!file || !fs.existsSync(file)) {
    if (!clip.url) {
      // #96 hotfix: the entry may predate its Release upload (cut on a runner
      // that is long gone) — one on-the-fly lookup before giving up
      const docRunId = st.clipQueue?.lastRunId;
      const found = await lookupQueuedClipAsset({ slug, docRunId, clip });
      if (found) {
        log(`release fallback: found ${found.asset} on clips-${slug}-${docRunId}`);
        clip.asset = found.asset; clip.url = found.url;
      } else {
        await fail(`clip part ${clip.part} has neither a local file nor a Release asset URL`);
      }
    }
    if (!TOK) await fail('GITHUB_TOKEN/GITHUB_PAT missing — cannot download the clip asset');
    log(`downloading ${clip.asset}...`);
    const r = await fetch(clip.url, { headers: { Authorization: `Bearer ${TOK}`, 'User-Agent': 'quarry-clips' } });
    if (!r.ok) await fail(`asset download HTTP ${r.status}`);
    fs.mkdirSync(`longvideo/sc-tmp-${slug}`, { recursive: true });
    file = path.join(`longvideo/sc-tmp-${slug}`, clip.asset || `clip-${clip.part}.mp4`);
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  }

  const publishAt = nextSlotISO((b.slots && b.slots[0]) || '22:35');
  const description = [
    clip.title,
    '',
    `From our documentary "${st.clipQueue?.docTitle || b.label}".`,
    `Follow for daily ${b.kwShort || b.niche}.`,
    ...(b.hashtags ? [b.hashtags] : []),
  ].join('\n').trim();

  log(`posting "${clip.title}" (part ${clip.part}) -> public ${publishAt}`);
  // #106 T3 (D6/AC-P4-6/7): two-step resumable upload — the intent row is the
  // INSERT mutex; the session URI is persisted BEFORE the first byte; the
  // videoId lands on the row on 201. Minor 7: the intent fingerprints the
  // EXACT uploaded title (sliced, as the resource sends it).
  const clipUploadTitle = clip.title.slice(0, 100);
  const up = await uploadWithIntent({
    store: intents, channelId: slug, slotDate: todayUTC, kind: 'short', slotIdx: 0,
    title: clipUploadTitle, jobId: process.env.PIPELINE_JOB_ID || null,
    accessToken: await oauthAccessToken(auth),
    resource: {
      snippet: { title: clipUploadTitle, description, tags: (b.tags || []).slice(0, 12), categoryId: '27', defaultLanguage: 'en', defaultAudioLanguage: 'en' },
      status: { privacyStatus: 'private', publishAt, selfDeclaredMadeForKids: false },
    },
    bytes: fs.readFileSync(file), publishAt,
    log,
  });
  if (up.skipProduction && !up.videoId) {
    log(`clip upload skipped (intent conflict or past publishAt — the safe direction, AC-P4-6/D8)`);
    process.exit(0);
  }
  if (!up.ok) await fail(`clip upload failed: ${up.error}`);
  const videoId = up.videoId;
  if (up.conflict) {
    // Round-1 MAJOR 4: the slot was produced by a crashed run's clip — mark
    // THAT clip's queue entry (by the claimed intent's fingerprint), never
    // the current pick's. The current pick stays queued for its own day.
    log(`✓ claimed already-uploaded clip ${videoId} (intent conflict) — NOT re-uploaded`);
    const claimed = (st.clipQueue?.clips || []).find((c) => titleFingerprint(c.title) === up.existing?.title_fingerprint);
    if (claimed) {
      claimed.postedAt = claimed.postedAt || new Date().toISOString();
      log(`  marked "${String(claimed.title).slice(0, 50)}" posted (the claimed upload)`);
    } else {
      log(`  [warn] no queue entry matches the claimed title fingerprint`);
    }
    st.clipLastPostDate = todayUTC;
    st.uploadsToday = nextCounter(st.uploadsToday);
    saveChannelState(slug, st);
    process.exit(0);
  }
  log(`✓ queued ${videoId} -> https://youtube.com/shorts/${videoId}`);

  // ledger (#99) + state marks (publisher once-per-day, verify claims, history)
  const now = new Date().toISOString();
  clip.postedAt = now;
  st.clipLastPostDate = todayUTC;
  st.uploadsToday = nextCounter(st.uploadsToday);
  st.lastVideos = [{ videoId, publishAt, title: clip.title }];
  st.titleHistory = [...(st.titleHistory || []), { t: clip.title, at: publishAt }].slice(-60);
  saveChannelState(slug, st);

  // FB/IG outbox — existing crosspost lanes pick it up unchanged
  fs.mkdirSync(`fb-outbox/${slug}`, { recursive: true });
  const stamp = `clip-${Date.now()}`;
  fs.copyFileSync(file, `fb-outbox/${slug}/${stamp}.mp4`);
  fs.writeFileSync(`fb-outbox/${slug}/${stamp}.json`, JSON.stringify({ videoFile: `fb-outbox/${slug}/${stamp}.mp4`, publishAt, title: clip.title, description, tags: (b.tags || []).slice(0, 12), slug }, null, 2));
  log(`✓ fb-outbox staged (${stamp}.mp4)`);

  try {
    await yt.commentThreads.insert({ part: 'snippet', requestBody: { snippet: { videoId, topLevelComment: { snippet: { textOriginal: `Which one hit hardest? 👇 Subscribe for daily ${b.kwShort || b.niche}.` } } } } });
  } catch { }

  // archive the render (09-14 pattern) so the clip is never YouTube-dependent
  try {
    if (process.env.GH_TOKEN || process.env.GITHUB_PAT) {
      const { archiveUpload } = await import('../yt-archive.mjs');
      await archiveUpload(videoId, file, (m) => log('  ' + m));
    }
  } catch (e) { log(`  [archive] skipped: ${String(e.message).slice(0, 60)}`); }

  // proof-of-publication — verify-run alerts + exits non-zero on a miss
  const v = spawnSync('node', ['verify-run.mjs', slug], { stdio: 'inherit', timeout: 300000 });
  process.exit(v.status || 0);
}
