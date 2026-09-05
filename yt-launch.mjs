// Per-channel test/production runner for the multi-channel launch.
// Usage: node yt-launch.mjs <slug> [outDir]
//   node yt-launch.mjs investors-compass
// Renders one scripted Short for the brand (Gemini script + brand voice +
// Hormozi captions + music) and SAVES IT LOCALLY — does NOT upload.
import fs from 'node:fs';
import { generateYouTubeScript, renderYouTubeScriptShort, buildScriptMeta } from './youtube-engine.mjs';
import { pickMusicTrack } from './music-engine.mjs';
import { bySlug } from './yt-brands/brands.mjs';

const slug = process.argv[2] || 'investors-compass';
const outDir = process.argv[3] || 'demos';
const b = bySlug[slug];
if (!b || !fs.existsSync(`yt-mcp/channels/${slug}/token.json`)) {
  console.error('Unknown slug or missing channel token:', slug);
  process.exit(1);
}

const page = { id: 'yt-' + slug, ytSlug: slug, name: b.label, niche: b.niche };
console.log(`[launch] ${b.label} (${b.handle}) — niche: ${b.niche}`);

const script = await generateYouTubeScript(page);
console.log(`[launch] script: "${script.thumbHeadline}" (${script.source}) — ${script.points?.length} points`);

let music = null;
try {
  music = await pickMusicTrack(Math.floor(Math.random() * 100), { feels: b.musicFeels });
  if (music) console.log(`[launch] music: "${music.title}" (${music.feel})`);
} catch (e) { console.log('[launch] music skipped:', e.message.slice(0, 80)); }

const out = await renderYouTubeScriptShort(page, script, music);
fs.mkdirSync(outDir, { recursive: true });
const mp4 = `${outDir}/test-short-${slug}.mp4`;
fs.writeFileSync(mp4, out.buffer);
if (out.thumb) fs.writeFileSync(`${outDir}/test-short-${slug}-thumb.jpg`, out.thumb);
const meta = buildScriptMeta(page, script, music ? `${music.title} — ${music.credit}` : '');
fs.writeFileSync(`${outDir}/test-short-${slug}-meta.json`, JSON.stringify({ slug, handle: b.handle, ...meta, duration: out.duration, script }, null, 2));

console.log(`\n✅ TEST SHORT READY (nothing uploaded):`);
console.log('   video:', mp4, `(${out.duration}s, ${Math.round(out.buffer.length / 1024)} KB)`);
console.log('   thumb:', `${outDir}/test-short-${slug}-thumb.jpg`);
console.log('   title:', meta.title);
