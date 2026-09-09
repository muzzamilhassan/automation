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

const slug = process.argv[2];
const FORCE = process.argv.includes('--force');
const NO_EPISODE = process.argv.includes('--no-episode');
const EPISODE_ONLY = process.argv.includes('--episode-only');
const b = bySlug[slug];
if (!b) { console.error('unknown slug', slug); process.exit(1); }

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || envRaw.match(/^YOUTUBE_CLIENT_ID=(.+)$/m)?.[1]?.trim() || '';
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || envRaw.match(/^YOUTUBE_CLIENT_SECRET=(.+)$/m)?.[1]?.trim() || '';
if (!CLIENT_ID || !CLIENT_SECRET) { console.error('YouTube OAuth client credentials missing (env or .env)'); process.exit(1); }

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
const RUN_SHORTS = !EPISODE_ONLY && (!shortsDone || FORCE);
const RUN_EPISODE = !NO_EPISODE && (!episodeDone || (FORCE && !EPISODE_ONLY));
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

  for (let i = 0; i < b.slots.length; i++) {
    const publishAt = nextSlotISO(b.slots[i]);
    console.log(`\n[${slug}] short ${i + 1}/${b.slots.length} → goes public ${publishAt}`);
    let script = await generateYouTubeScript(page, themesToday[i]);
    for (let t = 0; t < 2 && OFF_NICHE.test(JSON.stringify(script.points)); t++) {
      console.log('  off-niche drift — regenerating');
      script = await generateYouTubeScript(page, themesToday[i]);
    }
    if (script.source === 'fallback') { console.log('  ✗ SKIP — no AI script (never publish off-niche fallback)'); continue; }
    let music = null;
    try { music = await pickMusicTrack(i, { feels: b.musicFeels }); } catch { }
    const out = await renderYouTubeScriptShort(page, script, music);
    const meta = buildScriptMeta(page, script, music ? `${music.title} — ${music.credit}` : '');

    const stamp = `${Date.now()}-s${i}`;
    fs.mkdirSync(`fb-outbox/${slug}`, { recursive: true });
    fs.writeFileSync(`fb-outbox/${slug}/${stamp}.mp4`, out.buffer);
    fs.writeFileSync(`fb-outbox/${slug}/${stamp}.json`, JSON.stringify({ videoFile: `fb-outbox/${slug}/${stamp}.mp4`, publishAt, title: meta.title, description: meta.description, tags: meta.tags, slug }, null, 2));

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
    results.push({ videoId, publishAt, title: meta.title });
  }
  if (!EPISODE_ONLY) {
    state[slug] = { ...(state[slug] || {}), lastRunDate: today, usedThemes: themesToday, lastVideos: results, deepdiveDate: state[slug]?.deepdiveDate || null };
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
