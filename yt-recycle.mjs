// Recycle engine: when a slot's AI script fails (quota), reuse the channel's own
// oldest Short that still has < 1,000 views instead of losing the slot.
// Same file, same title/description/tags/thumbnail. Old copy is hidden immediately
// and deleted later by sweeper.mjs once the recycled copy is live (state.recyclePending).
// YouTube ONLY — recycled videos never go to FB/IG (the old reel already lives there).
// Usage (standalone test): node yt-recycle.mjs <slug> [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import https from 'node:https';
import { Readable } from 'node:stream';
import { google } from 'googleapis';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const envRaw = fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8') : '';
for (const m of envRaw.matchAll(/^([A-Z_0-9]+)=(.*)$/gm)) process.env[m[1]] ??= m[2].trim();

const YTDLP_CACHE_DIR = process.env.YTDLP_CACHE_DIR || path.join(process.env.HOME || process.env.USERPROFILE || ROOT, '.cache', 'yt-dlp');
const VIEWS_THRESHOLD = 1000;
const MAX_SECONDS = 61;          // Shorts are <= 60s; anything longer is long-form, never recycled
const MAX_OLDEST_SCAN = 100;     // how deep into "oldest first" we scan
const FF = process.env.FFMPEG_PATH || 'ffmpeg';

function parseISODuration(iso) {
  if (!iso) return null;
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return null;
  return (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0);
}

function httpsGetBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsGetBuffer(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Oldest-first walk of the channel's uploads; returns public Shorts with views
// < VIEWS_THRESHOLD (up to `limit`), oldest first. Empty array = nothing qualifies.
export async function findRecycleCandidates(y, { log = () => {}, limit = 6 } = {}) {
  const ch = await y.channels.list({ part: 'contentDetails,statistics', mine: true });
  const c = ch.data.items?.[0];
  if (!c) throw new Error('channel not reachable');
  const uploads = c.contentDetails?.relatedPlaylists?.uploads;
  const total = Number(c.statistics?.videoCount) || 0;
  if (!uploads || !total) { log('recycle: channel has no uploads'); return null; }

  // uploads playlist is newest-first; walk all pages, then take the oldest tail
  const allIds = [];
  let pageToken;
  for (;;) {
    const r = await y.playlistItems.list({ part: 'contentDetails', playlistId: uploads, maxResults: 50, pageToken });
    allIds.push(...(r.data.items || []).map((i) => i.contentDetails?.videoId).filter(Boolean));
    pageToken = r.data.nextPageToken;
    if (!pageToken) break;
  }
  const oldestIds = allIds.slice(-MAX_OLDEST_SCAN).reverse(); // oldest first
  log(`recycle: scanning ${oldestIds.length} oldest of ${total} uploads...`);
  if (!oldestIds.length) return [];

  const details = [];
  for (let i = 0; i < oldestIds.length; i += 50) {
    const r = await y.videos.list({ part: 'snippet,statistics,contentDetails,status', id: oldestIds.slice(i, i + 50).join(',') });
    details.push(...(r.data.items || []));
  }
  const order = new Map(oldestIds.map((id, k) => [id, k]));
  details.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  const out = [];
  for (const v of details) {
    const views = Number(v.statistics?.viewCount) || 0;
    const dur = parseISODuration(v.contentDetails?.duration);
    const privacy = v.status?.privacyStatus;
    if (privacy !== 'public') { log(`recycle: skip ${v.id} (privacy=${privacy})`); continue; }
    if (dur === null || dur > MAX_SECONDS) { log(`recycle: skip ${v.id} (not a Short, ${dur ?? '?'}s)`); continue; }
    if (views >= VIEWS_THRESHOLD) { log(`recycle: skip ${v.id} (${views} views >= 1K)`); continue; }
    log(`recycle: candidate — ${v.id} "${v.snippet.title}" (${views} views, ${dur}s)`);
    out.push({ videoId: v.id, title: v.snippet.title, views, duration: dur });
    if (out.length >= limit) break;
  }
  if (!out.length) log(`recycle: no candidate — all ${details.length} oldest Shorts have >= 1K views or are unusable`);
  return out;
}

// Backwards-compatible single-candidate helper
export async function findRecycleCandidate(y, log = () => {}) {
  const list = await findRecycleCandidates(y, { log, limit: 1 });
  return list[0] || null;
}

// ---- GitHub archive (Release assets named <videoId>.mp4, tags archive-YYYY-MM)
// The archive removes YouTube from the recycle path entirely: renders are stored
// as release assets at production time, and recycles download from GitHub.
function ghRepo() { return process.env.GH_REPO || 'muzzamilhassan/automation'; }
function ghToken() { return process.env.GH_TOKEN || process.env.GITHUB_PAT || ''; }

async function ghApi(pathname) {
  const r = await fetch(`https://api.github.com/repos/${ghRepo()}/${pathname}`, {
    headers: { Authorization: `Bearer ${ghToken()}`, Accept: 'application/vnd.github+json', 'User-Agent': 'quarry-recycler' },
  });
  if (!r.ok) throw new Error(`gh api ${pathname}: HTTP ${r.status}`);
  return r.json();
}

async function findArchiveAsset(videoId) {
  for (let page = 1; page <= 3; page++) {
    const rels = await ghApi(`releases?per_page=30&page=${page}`);
    if (!Array.isArray(rels) || !rels.length) break;
    for (const rel of rels) {
      if (!String(rel.tag_name || '').startsWith('archive-')) continue;
      const a = (rel.assets || []).find((x) => x.name === `${videoId}.mp4`);
      if (a) return { url: a.url, tag: rel.tag_name };
    }
  }
  return null;
}

// Returns true when the file was fetched from the archive.
export async function downloadFromArchive(videoId, outFile, log = () => {}) {
  const hit = await findArchiveAsset(videoId);
  if (!hit) return false;
  const res = await fetch(hit.url, {
    headers: { Authorization: `Bearer ${ghToken()}`, Accept: 'application/octet-stream', 'User-Agent': 'quarry-recycler' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`archive download HTTP ${res.status}`);
  fs.writeFileSync(outFile, Buffer.from(await res.arrayBuffer()));
  if (fs.statSync(outFile).size < 100_000) throw new Error('archive file too small');
  log(`recycle: downloaded ${videoId} from archive ${hit.tag} (${Math.round(fs.statSync(outFile).size / 1024)} KB) — no YouTube involved`);
  return true;
}

// Attach a file to this month's archive release (creates the release if missing).
export async function archiveUpload(videoId, filePath, log = () => {}) {
  const tag = 'archive-' + new Date().toISOString().slice(0, 7);
  let rel = null;
  try { rel = await ghApi(`releases/tags/${tag}`); } catch { /* not found */ }
  if (!rel || !rel.id) {
    const res = await fetch(`https://api.github.com/repos/${ghRepo()}/releases`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ghToken()}`, Accept: 'application/vnd.github+json', 'User-Agent': 'quarry-recycler', 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_name: tag, name: 'Recycle archive ' + tag.slice(8), body: 'Monthly Short archive for the recycler (auto-generated).' }),
    });
    if (!res.ok) throw new Error(`release create HTTP ${res.status}`);
    rel = await res.json();
  }
  const up = await fetch(`https://uploads.github.com/repos/${ghRepo()}/releases/${rel.id}/assets?name=${videoId}.mp4`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ghToken()}`, 'User-Agent': 'quarry-recycler', 'Content-Type': 'application/octet-stream' },
    body: fs.readFileSync(filePath),
  });
  if (!up.ok) throw new Error(`archive asset upload HTTP ${up.status}`);
  log(`archive: stored ${videoId}.mp4 in ${tag}`);
}

// Download via yt-dlp. OAuth cache (generated once locally) makes CI downloads
// pass YouTube's bot checks; client fallbacks cover the rest.
// Download via yt-dlp. No login needed for public videos — the android client
// works from residential IPs; CI datacenter IPs fall through the client chain,
// then (optionally) a cookies file secret and local Chrome cookies.
export function downloadVideo(videoId, outFile, log = () => {}) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const clients = ['default', 'tv', 'android', 'ios', 'mweb', 'android_vr', 'tv_embedded', 'web_embedded'];
  const attempts = [];
  if (process.env.YT_DLP_COOKIES && fs.existsSync(process.env.YT_DLP_COOKIES)) {
    for (const c of clients) attempts.push([`cookies+${c}`, ['--cookies', process.env.YT_DLP_COOKIES, ...(c === 'default' ? [] : ['--extractor-args', `youtube:player_client=${c}`])]]);
  }
  for (const c of clients) attempts.push([c, c === 'default' ? [] : ['--extractor-args', `youtube:player_client=${c}`]]);
  attempts.push(['chrome-cookies', ['--cookies-from-browser', 'chrome']]);

  const launchers = [['yt-dlp', []], ['python', ['-m', 'yt_dlp']], ['python3', ['-m', 'yt_dlp']]];
  let lastErr = null;
  for (const [cmd, pre] of launchers) {
    for (const [name, extra] of attempts) {
      try {
        const args = [
          ...pre,
          '-f', 'b[ext=mp4]/bv*+ba/b',           // logged-in clients often serve split streams — merge with ffmpeg
          '--merge-output-format', 'mp4',
          '--no-playlist', '--no-warnings', '--quiet',
          '--ffmpeg-location', FF,
          '-o', outFile,
          ...extra,
          url,
        ];
        execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 10 * 60 * 1000 });
        if (fs.existsSync(outFile) && fs.statSync(outFile).size > 100_000) {
          log(`recycle: downloaded ${videoId} via ${cmd} [${name}] (${Math.round(fs.statSync(outFile).size / 1024)} KB)`);
          return;
        }
        log(`recycle: ${cmd} [${name}] produced no usable file, trying next...`);
      } catch (e) {
        lastErr = e;
        if (String(e.message).includes('ENOENT')) break; // launcher missing — skip its attempts
        const stderrTail = String(e.stderr || '').trim().split('\n').filter(Boolean).slice(-2).join(' | ').slice(0, 200);
        log(`recycle: download attempt ${cmd} [${name}] failed: ${stderrTail || String(e.message).slice(0, 90)}`);
      }
    }
  }
  throw new Error('all yt-dlp download attempts failed' + (lastErr ? ` (last: ${String(lastErr.message).slice(0, 60)})` : ''));
}

// Full flow for one missed slot. Never throws into the caller's loop unless noted;
// returns { ok, ... } so yt-daily can decide what to log.
export async function recycleForSlot({ slug, publishAt, auth, state, log = () => {} }) {
  const y = google.youtube({ version: 'v3', auth });
  const cands = await findRecycleCandidates(y, { log, limit: 6 });
  if (!cands.length) return { ok: false, reason: 'no-candidate' };

  const tmp = path.join(ROOT, 'fb-outbox', slug);
  fs.mkdirSync(tmp, { recursive: true });

  // Oldest-first: archive copy wins instantly; otherwise fall back to YouTube
  // (works from residential IPs, blocked from CI). Unusable candidate → next one.
  let cand = null, videoFile = null, fromArchive = false;
  for (const c of cands) {
    const f = path.join(tmp, `recycle-${c.videoId}.mp4`);
    try {
      if (await downloadFromArchive(c.videoId, f, log)) {
        cand = c; videoFile = f; fromArchive = true; break;
      }
      log(`recycle: ${c.videoId} not in archive — trying YouTube...`);
      downloadVideo(c.videoId, f, log);
      cand = c; videoFile = f; fromArchive = false; break;
    } catch (e) {
      log(`recycle: ${c.videoId} unusable (${String(e.message).slice(0, 70)}) — trying next candidate...`);
      try { fs.unlinkSync(f); } catch { }
      continue;
    }
  }
  if (!cand) return { ok: false, reason: 'download-blocked' };

  // metadata (exact copy)
  const meta = await y.videos.list({ part: 'snippet', id: cand.videoId });
  const s = meta.data.items?.[0]?.snippet;
  if (!s) throw new Error('candidate vanished before copy');
  const snippet = {
    title: s.title,
    description: s.description,
    tags: s.tags || undefined,
    categoryId: s.categoryId || '27',
    defaultLanguage: s.defaultLanguage || 'en',
    defaultAudioLanguage: s.defaultAudioLanguage || 'en',
  };

  // thumbnail bytes (largest available) — direct CDN URLs, no API needed
  let thumbBuf = null;
  for (const q of ['maxresdefault', 'sddefault', 'hqdefault']) {
    try {
      const buf = await httpsGetBuffer(`https://i.ytimg.com/vi/${cand.videoId}/${q}.jpg`);
      if (buf.length > 1024) { thumbBuf = buf; break; }
    } catch { /* try next quality */ }
  }
  if (!thumbBuf) log('recycle: no thumbnail fetchable — uploading without');

  if (process.env.RECYCLE_DRY_RUN === '1') {
    log('recycle: DRY RUN — download + metadata OK, skipping upload/hide');
    try { fs.unlinkSync(videoFile); } catch { }
    return { ok: false, reason: 'dry-run' };
  }

  // upload the copy, scheduled into the missed slot
  const up = await y.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet,
      status: { privacyStatus: 'private', publishAt, selfDeclaredMadeForKids: false },
    },
    media: { body: Readable.from(fs.readFileSync(videoFile)) },
  });
  const newVideoId = up.data.id;
  log(`recycle: re-uploaded as ${newVideoId} → goes live ${publishAt}`);
  if (thumbBuf) {
    try { await y.thumbnails.set({ videoId: newVideoId, media: Readable.from(thumbBuf) }); log('recycle: thumbnail set'); } catch { }
  }
  // keep the archive pool complete: store the recycled copy under its new id
  try {
    if (ghToken()) await archiveUpload(newVideoId, videoFile, log);
  } catch (e) { log(`archive: re-attach skipped (${String(e.message).slice(0, 60)})`); }

  try { fs.unlinkSync(videoFile); } catch { }

  // hide the old copy instantly (deleted by sweeper once the new one is live)
  await y.videos.update({
    part: 'status',
    requestBody: { id: cand.videoId, status: { privacyStatus: 'private', selfDeclaredMadeForKids: false } },
  });
  log(`recycle: old copy ${cand.videoId} set to private — sweeper will delete after ${publishAt}`);

  state[slug] = state[slug] || {};
  state[slug].recyclePending = [
    ...((state[slug].recyclePending || []).filter((p) => p.oldVideoId !== cand.videoId)),
    { oldVideoId: cand.videoId, newVideoId, publishAt, date: new Date().toISOString().slice(0, 10), title: cand.title },
  ];

  return { ok: true, oldVideoId: cand.videoId, newVideoId, title: cand.title, publishAt };
}

// Standalone: scan-only report (read-only, safe) — node yt-recycle.mjs <slug> [--scan]
export async function channelAuth(slug) {
  const envName = `YT_TOKEN_${slug.toUpperCase().replace(/-/g, '_')}`;
  const tokenFile = path.join(ROOT, 'yt-mcp', 'channels', slug, 'token.json');
  const raw = process.env[envName] || (fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8') : '');
  const t = JSON.parse(raw || '{}');
  if (!t.refresh_token) throw new Error('no token for ' + slug);
  const a = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
  a.setCredentials({ refresh_token: t.refresh_token });
  return a;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
  const slug = process.argv[2];
  const scan = process.argv.includes('--scan');
  if (!slug) { console.error('Usage: node yt-recycle.mjs <slug> [--scan]'); process.exit(1); }
  const log = (m) => console.log(`[${slug}] ${m}`);
  const auth = await channelAuth(slug);
  const y = google.youtube({ version: 'v3', auth });
  if (scan) {
    const cand = await findRecycleCandidate(y, log);
    console.log(cand ? `RESULT: ${JSON.stringify(cand)}` : 'RESULT: no candidate');
    process.exit(0);
  }
  const { brands } = await import('./yt-brands/brands.mjs').then(m => ({ brands: m.bySlug }));
  const slot = brands[slug]?.slots?.[0] || '11:35';
  const [h, mm] = slot.split(':').map(Number);
  const d = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate(), h, mm, 0));
  if (d <= new Date(Date.now() + 35 * 60 * 1000)) d.setUTCDate(d.getUTCDate() + 1);
  const publishAt = d.toISOString().replace(/\.\d+Z$/, 'Z');
  const STATE_FILE = path.join(ROOT, 'yt-mcp', 'schedule-state.json');
  let state = {};
  try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { }
  // Safe re-run guard: one recycle per channel per day (protects against repeated
  // dispatches — e.g. a leftover test automation — recycling many videos at once).
  const today = new Date().toISOString().slice(0, 10);
  if ((state[slug]?.recyclePending || []).some(p => p.date === today)) {
    console.log(`[${slug}] already recycled today — nothing to do (safe re-run guard)`);
    process.exit(0);
  }
  const r = await recycleForSlot({ slug, publishAt, auth, state, log });
  console.log('RESULT:', JSON.stringify(r));
  if (r.ok) {
    // recycleForSlot already pushed the pending entry into state[slug].recyclePending
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    console.log('pending entry saved to yt-mcp/schedule-state.json');
  }
}
