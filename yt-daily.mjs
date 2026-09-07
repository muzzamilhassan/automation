// Daily producer + scheduler for one multi-channel brand.
// Usage: node yt-daily.mjs <slug> [--force]
// Produces the day's Shorts (theme-rotated), uploads each as PRIVATE with
// publishAt at the brand's slot times (next occurrence), sets thumbnails,
// pins a brand comment, records state so re-runs never duplicate.
// Token: env YT_TOKEN_<SLUG> (CI) or yt-mcp/channels/<slug>/token.json (local).
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { google } from 'googleapis';
import { spawnSync } from 'node:child_process';

// Load .env BEFORE importing the engine (the engine snapshots GEMINI_API_KEY
// at module load; background sandboxes don't always inherit it or the cwd).
const ENV_PATH = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '.env');
for (const m of fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : ''.matchAll(/^([A-Z_0-9]+)=(.*)$/gm)) {
  process.env[m[1]] ??= m[2].trim();
}
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

const envStr = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || envStr.match(/^YOUTUBE_CLIENT_ID=(.+)$/m)?.[1]?.trim() || '';
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || envStr.match(/^YOUTUBE_CLIENT_SECRET=(.+)$/m)?.[1]?.trim() || '';
if (!CLIENT_ID || !CLIENT_SECRET) { console.error('YouTube OAuth client credentials missing (env or .env)'); process.exit(1); }

function channelAuth() {
  const envName = `YT_TOKEN_${slug.toUpperCase().replace(/-/g, '_')}`;
  const raw = process.env[envName] || fs.readFileSync(`yt-mcp/channels/${slug}/token.json`, 'utf8');
  const t = JSON.parse(raw);
  const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  auth.setCredentials({ refresh_token: t.refresh_token });
  return auth;
}

const STATE_FILE = 'yt-mcp/schedule-state.json';
function loadState() { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; } }
function saveState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }

function nextSlotISO(hhmm, now = new Date()) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m, 0));
  if (d <= new Date(now.getTime() + 35 * 60 * 1000)) d.setUTCDate(d.getUTCDate() + 1); // need >=35min lead
  return d.toISOString().replace(/\.\d+Z$/, 'Z');
}

function themesForToday(state) {
  const used = state[slug]?.usedThemes || [];
  const dayIdx = Math.floor(Date.now() / 86400000);
  const picks = [];
  for (let k = 0; k < b.slots.length; k++) {
    const t = b.themeBank[(dayIdx * b.slots.length + k) % b.themeBank.length];
    picks.push(used.includes(t) ? b.themeBank[(dayIdx * b.slots.length + k + 3) % b.themeBank.length] : t);
  }
  return picks;
}

const state = loadState();
if (state[slug]?.lastRunDate === new Date().toISOString().slice(0, 10) && !FORCE && !EPISODE_ONLY) {
  console.log(`[${slug}] already produced today — skipping (use --force to override)`);
  process.exit(0);
}

const auth = channelAuth();
const yt = google.youtube({ version: 'v3', auth });
const themes = themesForToday(state);
const page = { id: 'yt-' + slug, ytSlug: slug, name: b.label, niche: b.niche };
try {
  page.trend = await researchTrend(slug, auth, [...b.niches, ...b.tags.slice(0, 2)]);
  console.log(`[trend] 🔥 hot keywords: ${page.trend.hotKeywords.slice(0, 6).join(', ')}`);
  console.log(`[trend] viral now: ${page.trend.videos.slice(0, 3).map(v => `"${v.title}" — ${v.channel} (${Math.round(v.views / 1000)}k views)`).join(' | ')}`);
} catch (e) { console.log('[trend] research skipped:', String(e.message).slice(0, 70)); }
const OFF_NICHE = /\bstoic\w*|manipulat\w*|toxic|calm your mind|dark psychology\b/i;
const results = [];

for (let i = 0; i < (EPISODE_ONLY ? 0 : b.slots.length); i++) {
  const publishAt = nextSlotISO(b.slots[i]);
  console.log(`\n[${slug}] short ${i + 1}/${b.slots.length} → goes public ${publishAt}`);
  let script = await generateYouTubeScript(page, themes[i]);
  for (let t = 0; t < 2 && OFF_NICHE.test(JSON.stringify(script.points)); t++) {
    console.log('  off-niche drift — regenerating');
    script = await generateYouTubeScript(page, themes[i]);
  }
  if (script.source === 'fallback') {
    console.log(`  ✗ SKIP — no Gemini key, fallback script is off-niche for ${b.label} (never publish wrong-niche content)`);
    continue;
  }
  let music = null;
  try { music = await pickMusicTrack(i, { feels: b.musicFeels }); } catch { }
  const out = await renderYouTubeScriptShort(page, script, music);
  const meta = buildScriptMeta(page, script, music ? `${music.title} — ${music.credit}` : '');
  // FB outbox — fb-crosspost.mjs picks these up and posts as FB Reels
  const stamp = `${Date.now()}-s${i}`;
  fs.mkdirSync(`fb-outbox/${slug}`, { recursive: true });
  fs.writeFileSync(`fb-outbox/${slug}/${stamp}.mp4`, out.buffer);
  fs.writeFileSync(`fb-outbox/${slug}/${stamp}.json`, JSON.stringify({ videoFile: `fb-outbox/${slug}/${stamp}.mp4`, publishAt, title: meta.title, description: meta.description, tags: meta.tags, slug }, null, 2));

  const readable = Readable.from(out.buffer);
  const res = await yt.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: { title: meta.title, description: `${meta.description}\n\n${b.hashtags || ''}`.trim(), tags: meta.tags, categoryId: '27', defaultLanguage: 'en', defaultAudioLanguage: 'en' },
      status: { privacyStatus: 'private', publishAt, selfDeclaredMadeForKids: false }
    },
    media: { body: readable }
  });
  const videoId = res.data.id;
  console.log(`  ✓ queued ${videoId} → https://youtube.com/shorts/${videoId}`);
  if (out.thumb) {
    try { await yt.thumbnails.set({ videoId, media: { body: Readable.from(out.thumb) } }); console.log('  ✓ thumbnail set'); } catch (e) { console.log('  [thumb skipped]', String(e.message).slice(0, 60)); }
  }
  try {
    await yt.commentThreads.insert({
      part: 'snippet',
      requestBody: { snippet: { videoId, topLevelComment: { snippet: { textOriginal: `Which one hit hardest? 👇 Subscribe for daily ${b.kwShort}.` } } } }
    });
  } catch (e) { console.log('  [comment skipped]', String(e.message).slice(0, 60)); }
  results.push({ videoId, publishAt, title: meta.title });
}

if (!EPISODE_ONLY) state[slug] = { lastRunDate: new Date().toISOString().slice(0, 10), usedThemes: themes, lastVideos: results };
saveState(state);
console.log(`\n[${slug}] DONE — ${results.length} Shorts scheduled:`);
results.forEach(r => console.log(`  ${r.publishAt}  ${r.title}`));

// Daily long-form episode — runs right after the Shorts (once per day)
if (NO_EPISODE) {
  console.log(`[${slug}] episode step skipped (--no-episode)`);
} else {
  console.log(`\n[${slug}] producing today's deep-dive episode...`);
  const dd = spawnSync('node', ['yt-deepdive.mjs', slug], { stdio: 'inherit' });
  console.log(`[${slug}] deep-dive exit: ${dd.status}`);
}

function outDir() { return 'demos'; }
