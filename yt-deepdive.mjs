// Daily deep-dive long-form episode producer + uploader (1920x1080).
// Usage: node yt-deepdive.mjs <slug> [--force]
// Gemini -> HF Llama script (8 chapters) -> per-chapter 4K b-roll + brand
// voice narration + chapter lower-third -> concat -> music bed -> upload
// PRIVATE with publishAt at brand.longSlot (next occurrence).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { Readable } from 'node:stream';
import { google } from 'googleapis';
import { EMBEDDED_FONTS_CSS } from './typography-poster-engine.mjs';
import { getTopicClip } from './youtube-clips.mjs';
import { pickMusicTrack } from './music-engine.mjs';
import { renderYouTubeThumbnail } from './youtube-engine.mjs';
import { bySlug } from './yt-brands/brands.mjs';

const FF = process.env.FFMPEG_PATH || (fs.existsSync('ffmpeg-bin/ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe')
  ? 'ffmpeg-bin/ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe' : 'ffmpeg');
const FP = FF.replace('ffmpeg.exe', 'ffprobe.exe');
const ENV_PATH = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), '.env');

const slug = process.argv[2];
const FORCE = process.argv.includes('--force');
const b = bySlug[slug];
if (!b) { console.error('unknown slug', slug); process.exit(1); }

// env before anything that snapshots it
for (const m of fs.readFileSync(ENV_PATH, 'utf8').matchAll(/^([A-Z_0-9]+)=(.*)$/gm)) process.env[m[1]] ??= m[2].trim();

const STATE_FILE = 'yt-mcp/schedule-state.json';
const loadState = () => { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; } };
const saveState = (s) => fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));

function llm(prompt) {
  return (async () => {
    const key = process.env.GEMINI_API_KEY;
    if (key) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${key}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.85, responseMimeType: 'application/json' } })
        });
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        const parsed = text ? JSON.parse(text.replace(/^```json\s*/, '').replace(/```$/, '').trim()) : null;
        if (parsed?.title && Array.isArray(parsed.chapters) && parsed.chapters.length >= 5
            && parsed.chapters.every(c => (c.text || '').split(/\s+/).length >= 70)) {
          console.log(`[deepdive] Gemini long script OK (${parsed.chapters.length} chapters)`);
          return parsed;
        }
        throw new Error('bad shape');
      } catch (e) { console.log(`[deepdive] Gemini failed: ${String(e.message).slice(0, 70)} — trying HF...`); }
    }
    const hf = process.env.HF_TOKEN;
    if (!hf) throw new Error('no HF token');
    for (let a = 1; a <= 2; a++) {
      try {
        const res = await fetch('https://router.huggingface.co/v1/chat/completions', {
          method: 'POST', headers: { Authorization: `Bearer ${hf}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'meta-llama/Llama-3.1-8B-Instruct', messages: [{ role: 'user', content: prompt + (a > 1 ? '\nReply with the raw JSON object ONLY.' : '') }], temperature: 0.85, max_tokens: 2000 })
        });
        if (!res.ok) throw new Error('HF HTTP ' + res.status);
        const data = await res.json();
        const text = (data.choices?.[0]?.message?.content || '').replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
        if (parsed?.title && Array.isArray(parsed.chapters) && parsed.chapters.length >= 5
            && parsed.chapters.every(c => (c.text || '').split(/\s+/).length >= 70)) {
          console.log(`[deepdive] HF Llama long script OK (${parsed.chapters.length} chapters, attempt ${a})`);
          return parsed;
        }
        throw new Error('bad shape');
      } catch (e) { console.log(`[deepdive] HF attempt ${a} failed: ${String(e.message).slice(0, 70)}`); }
    }
    throw new Error('no script provider succeeded');
  })();
}

function sh(args, timeout = 600000) { execFileSync(FF, args, { stdio: ['ignore', 'ignore', 'pipe'], timeout }); }
function probeDur(f) { return parseFloat(execFileSync(FP, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim()); }

async function chapterCard(num, title) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="240">
  <defs><style>${EMBEDDED_FONTS_CSS}</style></defs>
  <rect x="0" y="20" width="1400" height="200" rx="18" fill="#000000" fill-opacity="0.72"/>
  <rect x="0" y="20" width="10" height="200" fill="${b.accent}"/>
  <text x="60" y="105" font-family="Oswald" font-weight="600" font-size="40" letter-spacing="8" fill="${b.accent}">CHAPTER ${String(num).padStart(2, '0')}</text>
  <text x="60" y="175" font-family="Oswald" font-weight="700" font-size="64" fill="#FFFFFF">${title.replace(/[<>&]/g, '').slice(0, 42).toUpperCase()}</text>
</svg>`;
  const file = `pixabay-pool/dd-card-${slug}-${num}.png`;
  await sharp(Buffer.from(svg)).png().toFile(file);
  return file;
}

function narrateChapter(text, num) {
  const base = `pixabay-pool/dd-narr-${slug}-${num}`;
  fs.writeFileSync(`${base}.txt`, text, 'utf8');
  execFileSync('python', ['youtube-flow/narrate.py', `${base}.txt`, `${base}.mp3`, `${base}.words.json`],
    { stdio: ['ignore', 'ignore', 'pipe'], timeout: 240000, env: { ...process.env, YT_TTS_EDGE_VOICE: b.voice || 'en-US-ChristopherNeural' } });
  fs.rmSync(`${base}.txt`, { force: true });
  fs.rmSync(`${base}.words.json`, { force: true });
  return `${base}.mp3`;
}

// ---------- main ----------
const state = loadState();
if (state[slug]?.deepdiveDate === new Date().toISOString().slice(0, 10) && !FORCE) {
  console.log(`[${slug}] deep-dive already produced today — skipping (--force to override)`);
  process.exit(0);
}
console.log(`[deepdive] ${b.label} — daily episode`);

const theme = b.themeBank[Math.floor(Date.now() / 86400000) % b.themeBank.length];
const script = await llm(`You write long-form YouTube episodes for "${b.label}" (Niche: ${b.niche}), in the style of top ${b.authority} channels.
Theme: ${theme}. Write for a US audience: concrete, specific, insider-feeling ${b.niches[0]} insights. No vague motivation, no stoicism clichés unless the niche is stoicism.
Structure: an eye-catching episode title (<=60 chars), a 2-sentence intro, then EXACTLY 8 chapters. Each chapter: {"title":"<=40 chars","text":"110-140 words of punchy, spoken-style insight"} — EVERY chapter text MUST be at least 110 words; chapters under 90 words will be rejected.
Return ONLY valid JSON: {"title":"...","intro":"...","chapters":[{"title":"...","text":"..."}],"outro":"2 sentences with a subscribe push"}`).catch(e => { console.error(`[deepdive] ${e.message}`); process.exit(1); });

fs.mkdirSync(`demos/deepdive-${slug}`, { recursive: true });
const segs = [];
let total = 0;
const chapterFiles = [];
for (let i = 0; i < script.chapters.length; i++) {
  const ch = script.chapters[i];
  console.log(`[deepdive] chapter ${i + 1}/${script.chapters.length}: ${ch.title}`);
  const mp3 = narrateChapter(`${ch.text} ${i === script.chapters.length - 1 ? script.outro : ''}`, i + 1);
  const dur = Math.max(12, probeDur(mp3) + 1.2);
  const clip = await getTopicClip(page(), { headline: ch.title }) || null;
  const card = await chapterCard(i + 1, ch.title);
  const seg = `demos/deepdive-${slug}/seg-${i + 1}.mp4`;
  const vf = clip
    ? `[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30,format=yuv420p[bg]`
    : `[0:v]fps=30,format=yuv420p[bg]`;
  const inputs = clip ? ['-stream_loop', '-1', '-i', clip.file, '-i', mp3, '-i', card] : ['-f', 'lavfi', '-i', `color=c=0x141414:s=1920x1080:r=30`, '-i', mp3, '-i', card];
  sh([...inputs, '-filter_complex', `${vf};[bg][2:v]overlay=(W-w)/2:H-h-70:enable='lte(t,4)'[v]`,
    '-map', '[v]', '-map', '1:a', '-t', String(dur), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2', seg]);
  segs.push(seg);
  total += dur;
  chapterFiles.push(seg);
  console.log(`  ✓ ${Math.round(dur)}s`);
}

const list = `demos/deepdive-${slug}/concat.txt`;
fs.writeFileSync(list, segs.map(s => `file '${path.resolve(s).replace(/\\/g, '/')}'`).join('\n'));
const joined = `demos/deepdive-${slug}/joined.mp4`;
sh(['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined]);

let music = null;
try { music = await pickMusicTrack(7, { feels: b.musicFeels }); } catch { }
const final = `demos/deepdive-${slug}/episode.mp4`;
if (music) {
  sh(['-y', '-i', joined, '-stream_loop', '-1', '-i', music.file, '-filter_complex',
    `[1:a]volume=0.09[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0[a]`,
    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', final]);
} else { fs.copyFileSync(joined, final); }

// thumbnail from a frame 8s in
sh(['-y', '-v', 'error', '-ss', '8', '-i', final, '-frames:v', '1', `demos/deepdive-${slug}/frame.jpg`]);
const thumb = await renderYouTubeThumbnail(script.title, `demos/deepdive-${slug}/frame.jpg`, { accent: b.accent, eyebrow: b.eyebrow });

const totalMin = Math.round(total / 60 * 10) / 10;
console.log(`[deepdive] ✅ episode rendered: ${final} (${totalMin} min)`);

// ---------- upload scheduled ----------
const envStr = fs.readFileSync('.env', 'utf8');
const auth = new google.auth.OAuth2(envStr.match(/^YOUTUBE_CLIENT_ID=(.+)$/m)[1].trim(), envStr.match(/^YOUTUBE_CLIENT_SECRET=(.+)$/m)[1].trim());
const t = JSON.parse(fs.readFileSync(`yt-mcp/channels/${slug}/token.json`, 'utf8'));
auth.setCredentials({ refresh_token: t.refresh_token });
const yt = google.youtube({ version: 'v3', auth });

const [h, m] = b.longSlot.split(':').map(Number);
const now = new Date();
const pub = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m, 0));
if (pub <= new Date(now.getTime() + 35 * 60 * 1000)) pub.setUTCDate(pub.getUTCDate() + 1);
const publishAt = pub.toISOString().replace(/\.\d+Z$/, 'Z');

const desc = [`"${script.title}" — daily ${b.kwShort} episode from ${b.label}.`, '', ...script.chapters.map((c, i) => `${String(Math.floor([0, ...chapterDurations()].slice(0, i + 1).reduce((a, x) => a + x, 0) / 60))}:${String(Math.floor(([0, ...chapterDurations()].slice(0, i + 1).reduce((a, x) => a + x, 0)) % 60)).padStart(2, '0')} ${c.title}`), '', script.outro, `Subscribe for a new episode every day.`, ...(music ? [`🎵 ${music.credit}`] : [])].join('\n').slice(0, 4800);
function chapterDurations() { return segs.map(s => probeDur(s)); }

const res = await yt.videos.insert({
  part: ['snippet', 'status'],
  requestBody: {
    snippet: { title: `${script.title} | ${b.authority}`.slice(0, 95), description: desc, tags: b.tags.slice(0, 12), categoryId: '27', defaultLanguage: 'en', defaultAudioLanguage: 'en' },
    status: { privacyStatus: 'private', publishAt, selfDeclaredMadeForKids: false }
  },
  media: { body: Readable.from(fs.readFileSync(final)) }
});
await yt.thumbnails.set({ videoId: res.data.id, media: { body: Readable.from(thumb) } }).catch(() => { });

const st = loadState();
st[slug] = st[slug] || {};
st[slug].deepdiveDate = new Date().toISOString().slice(0, 10);
st[slug].deepdiveVideo = { videoId: res.data.id, publishAt, title: `${script.title} | ${b.authority}` };
saveState(st);
fs.rmSync(`demos/deepdive-${slug}/joined.mp4`, { force: true });
segfCleanup();
console.log(`\n✅ ${b.label} EPISODE LIVE-SCHEDULED: https://youtube.com/watch?v=${res.data.id} → goes public ${publishAt} (${totalMin} min)`);

function segfCleanup() { for (const s of segs) fs.rmSync(s, { force: true }); }
function page() { return { id: 'yt-' + slug, ytSlug: slug, name: b.label, niche: b.niche }; }
