// Daily producer + scheduler for one multi-channel brand.
// Usage: node yt-daily.mjs <slug> [--force] [--no-episode] [--episode-only]
// Produces the day's Shorts (theme-rotated), uploads each as PRIVATE with
// publishAt at the brand's slot times, sets thumbnails, pins a comment,
// writes the FB/IG outbox, then produces the day's deep-dive episode.
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { google } from 'googleapis';

// NEVER crash the CI — log errors and continue
process.on('uncaughtException', (e) => { console.error('[yt-daily] Uncaught:', e.message, '— continuing'); });
process.on('unhandledRejection', (e) => { console.error('[yt-daily] Unhandled:', String(e).slice(0, 200), '— continuing'); });

// Load .env BEFORE importing the engine (it snapshots keys at module load).
const ENV_PATH = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '.env');
const envRaw = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
for (const m of envRaw.matchAll(/^([A-Z_0-9]+)=(.*)$/gm)) process.env[m[1]] ??= m[2].trim();

const { generateYouTubeScript, renderYouTubeScriptShort, buildScriptMeta } = await import('./youtube-engine.mjs');
const { pickMusicTrack } = await import('./music-engine.mjs');
const { bySlug } = await import('./yt-brands/brands.mjs');
const { researchTrend } = await import('./trend-research.mjs');
const { recycleForSlot, archiveUpload } = await import('./yt-recycle.mjs');

const slug = process.argv[2];
const FORCE = process.argv.includes('--force');
const NO_EPISODE = process.argv.includes('--no-episode');
const EPISODE_ONLY = process.argv.includes('--episode-only');
// --topup=N: heal mode (used by sweeper.mjs) — produce only the first N slots.
// Marks the NEXT day as done so the scheduled morning run doesn't double-produce
// the healed reels. Never touches the episode step.
const topupArg = process.argv.find(a => a.startsWith('--topup'));
const TOPUP_N = topupArg ? Math.max(0, Number(topupArg.split('=')[1]) || 0) : 0;
const b = bySlug[slug];
if (!b) { console.error('unknown slug', slug); process.exit(1); }

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || envRaw.match(/^YOUTUBE_CLIENT_ID=(.+)$/m)?.[1]?.trim() || '';
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || envRaw.match(/^YOUTUBE_CLIENT_SECRET=(.+)$/m)?.[1]?.trim() || '';
if (!CLIENT_ID || !CLIENT_SECRET) { console.error('YouTube OAuth client credentials missing (env or .env)'); process.exit(1); }
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
  if (t.length < 10 || !/[a-z]/i.test(t) || /\|\s*#|undefined|NaN/i.test(t)) { log(`  GATE: rejected (bad title "${t.slice(0, 40)}") — upload skipped`); return false; }
  return true;
}

const STATE_FILE = path.join(path.dirname(ENV_PATH), 'yt-mcp/schedule-state.json');
const loadState = () => { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; } };
const saveState = (s) => fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));

function nextSlotISO(hhmm, now = new Date()) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m, 0));
  if (d <= new Date(now.getTime() + 35 * 60 * 1000)) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().replace(/\.\d+Z$/, 'Z');
}

const state = loadState();
const today = new Date().toISOString().slice(0, 10);
const shortsDone = state[slug]?.lastRunDate === today;
const episodeDone = state[slug]?.deepdiveDate === today;
const RUN_SHORTS = !EPISODE_ONLY && (TOPUP_N > 0 || !shortsDone || FORCE);
const RUN_EPISODE = !NO_EPISODE && TOPUP_N === 0 && (!episodeDone || (FORCE && !EPISODE_ONLY));
const results = [];
const themes = [];

const page = { id: 'yt-' + slug, ytSlug: slug, name: b.label, niche: b.niche };

if (RUN_SHORTS) {
  try {
    page.trend = await researchTrend(slug, channelAuth(slug), [...b.niches, ...b.tags.slice(0, 2)]);
    console.log(`[trend] 🔥 hot: ${page.trend.hotKeywords.slice(0, 6).join(', ')}`);
  } catch (e) { console.log('[trend] skipped:', String(e.message).slice(0, 60)); }

  const yt = google.youtube({ version: 'v3', auth: channelAuth(slug) });
  const used = state[slug]?.usedThemes || [];
  const dayIdx = Math.floor(Date.now() / 86400000);
  const themesToday = b.slots.map((_, k) => {
    const t = b.themeBank[(dayIdx * b.slots.length + k) % b.themeBank.length];
    return used.includes(t) ? b.themeBank[(dayIdx * b.slots.length + k + 3) % b.themeBank.length] : t;
  });
  const OFF_NICHE = /\bstoic\w*|manipulat\w*|toxic|calm your mind|dark psychology\b/i;

  const slotLimit = TOPUP_N > 0 ? Math.min(TOPUP_N, b.slots.length) : b.slots.length;
  for (let i = 0; i < slotLimit; i++) {
    const publishAt = nextSlotISO(b.slots[i]);
    console.log(`\n[${slug}] short ${i + 1}/${b.slots.length} → goes public ${publishAt}`);
    let script = await generateYouTubeScript(page, themesToday[i]);
    for (let t = 0; t < 2 && OFF_NICHE.test(JSON.stringify(script.points)); t++) {
      console.log('  off-niche drift — regenerating');
      script = await generateYouTubeScript(page, themesToday[i]);
    }
    if (script.source === 'fallback') {
      // Quota out: instead of losing the slot, recycle the channel's own oldest
      // Short with < 1K views (same file/metadata, YouTube only, old copy hidden
      // + deleted later by the sweeper). Nothing to recycle → slot skipped.
      console.log('  ✗ no AI script — trying recycle of an old under-1K Short...');
      try {
        const r = await recycleForSlot({ slug, publishAt, auth: channelAuth(slug), state, log: (m) => console.log('  ' + m) });
        if (r.ok) {
          console.log(`  ✓ slot recovered via recycle — new: ${r.newVideoId}, old: ${r.oldVideoId}`);
          results.push({ videoId: r.newVideoId, publishAt, title: r.title, recycled: true });
        } else {
          console.log(`  ✗ slot stays skipped (${r.reason})`);
        }
      } catch (e) {
        console.log(`  ✗ recycle failed: ${String(e.message).slice(0, 100)} — slot stays skipped`);
        // CI can't download (YouTube bot-wall on datacenter IPs) — nudge the phone
        // so a local run (node yt-recycle.mjs <slug>) can recover the slot later.
        try {
          const topic = (process.env.NTFY_TOPIC || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
          if (topic) await fetch(`https://ntfy.sh/${topic}`, {
            method: 'POST',
            headers: { 'Title': 'Recycle Needed' },
            body: `${slug}: CI download blocked — run locally: node yt-recycle.mjs ${slug}`
          });
        } catch { }
      }
      continue;
    }
    let music = null;
    try { music = await pickMusicTrack(i, { feels: b.musicFeels }); } catch { }
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
      usedThemes: themesToday, lastVideos: results, deepdiveDate: state[slug]?.deepdiveDate || null
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
