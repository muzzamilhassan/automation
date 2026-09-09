// Coding-explainer renderer v2 — SECTION-BASED narration for human pacing:
// each scene gets its own narration clip + a natural pause between sections,
// and scene timing comes from the real audio lengths (perfect sync).
// Usage: node code-video/render.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildAssCaptions } from '../youtube-engine.mjs';

const FF = process.env.FFMPEG_PATH || (fs.existsSync('ffmpeg-bin/ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe')
  ? 'ffmpeg-bin/ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe' : 'ffmpeg');
const FPS = 24;
const OUT_DIR = 'code-video';
const FRAMES = `${OUT_DIR}/frames`;
const GAP_MS = 750; // human pause between sections

// Pause-heavy, documentary-style script (commas/periods = breathing room)
const SECTIONS = [
  { id: 's0', text: 'Ever wondered why good APIs just feel... obvious? You open an API you have never used. And you already know what get orders slash one two three returns. That is not luck. Three rules explain it.' },
  { id: 's1', text: 'Rule one. Use nouns... not verbs. The path describes the thing. Orders. Customers. Payments. The method is the action. Get reads it. Post creates it. Delete removes it. Never bury a verb inside the URL.' },
  { id: 's2', text: 'Rule two. Status codes tell the truth. Two hundred means it worked. Four zero four means it never existed. If the order is missing... say four zero four. Never hide an error inside a success code. Hidden errors become incidents at three in the morning.' },
  { id: 's3', text: 'Rule three. Version everything. One day... you will break compatibility. Ship the new behavior under slash v two. And let version one live quietly. Old apps keep working. New apps move fast.' },
  { id: 's4', text: 'Nouns. Honest codes. And versions. That is how an API speaks for itself. Follow for more developer wisdom.' }
];

// 1. narrate each section separately (slower, human pace) -------------------
const clips = [];
for (let i = 0; i < SECTIONS.length; i++) {
  const sec = SECTIONS[i];
  fs.writeFileSync(`${OUT_DIR}/sec${i}.txt`, sec.text, 'utf8');
  execFileSync(process.env.PYTHON || 'python',
    ['youtube-flow/narrate.py', `${OUT_DIR}/sec${i}.txt`, `${OUT_DIR}/sec${i}.mp3`, `${OUT_DIR}/sec${i}.words.json`],
    { stdio: ['ignore', 'ignore', 'pipe'], timeout: 180000, env: { ...process.env, YT_KOKORO_SPEED: '0.92' } });
  const meta = JSON.parse(fs.readFileSync(`${OUT_DIR}/sec${i}.mp3.meta.json`, 'utf8'));
  const lastW = meta.words[meta.words.length - 1];
  clips.push({ audio: meta.audio, words: meta.words,
    dur: (lastW ? lastW.s + lastW.d : 3) + 0.35 });
  fs.rmSync(`${OUT_DIR}/sec${i}.txt`, { force: true });
  fs.rmSync(`${OUT_DIR}/sec${i}.mp3.meta.json`, { force: true });
}

// 2. timeline: section start = cumulative (audio + GAP) ----------------------
let t = 0;
const sections = [], allWords = [], concatList = [];
const GAP_S = GAP_MS / 1000;
clips.forEach((c, i) => {
  sections.push({ id: SECTIONS[i].id, start: Math.round(t * 1000), end: Math.round((t + c.dur) * 1000) });
  for (const w of c.words) allWords.push({ w: w.w, s: w.s + t, d: w.d });
  concatList.push(c.audio);
  if (i < clips.length - 1) concatList.push('GAP');
  t += c.dur + GAP_S;
});
const dur = Math.round((t + 1.2) * 10) / 10;
console.log(`Sections: ${sections.map((s) => `${s.start}-${s.end}`).join(' ')} | total ${dur}s`);

// 3. combined narration audio (clips + silence gaps) -------------------------
execFileSync(FF, ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', String(GAP_S),
  '-c:a', 'pcm_s16le', `${OUT_DIR}/gap.wav`], { stdio: ['ignore', 'ignore', 'pipe'] });
fs.writeFileSync(`${OUT_DIR}/concat.txt`, concatList.map((f) => `file '${path.resolve(f === 'GAP' ? `${OUT_DIR}/gap.wav` : f).replace(/\\/g, '/')}'`).join('\n') + '\n');
execFileSync(FF, ['-y', '-f', 'concat', '-safe', '0', '-i', `${OUT_DIR}/concat.txt`,
  '-c:a', 'pcm_s16le', `${OUT_DIR}/narr-full.wav`], { stdio: ['ignore', 'ignore', 'pipe'] });
fs.rmSync(`${OUT_DIR}/gap.wav`, { force: true });
fs.rmSync(`${OUT_DIR}/concat.txt`, { force: true });

// 4. render frames with injected section timeline ----------------------------
fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });
const { chromium } = await import('playwright-core');
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true, args: ['--force-device-scale-factor=1']
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const html = fs.readFileSync(`${OUT_DIR}/demo.html`, 'utf8')
  .replace('[ /*__SECTIONS__*/ ]', JSON.stringify(sections));
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate('window.seek(0)');
const totalFrames = Math.floor(dur * FPS);
let lastPct = -1;
for (let f = 0; f <= totalFrames; f++) {
  await page.evaluate(`window.seek(${Math.round(f / FPS * 1000)})`);
  await page.screenshot({ path: `${FRAMES}/f_${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 88 });
  const pct = Math.round(f / totalFrames * 100);
  if (pct >= lastPct + 20) { lastPct = pct; console.log(`frames ${pct}%`); }
}
await browser.close();
console.log(`Frames done: ${totalFrames + 1}`);

// 5. captions + final assemble ------------------------------------------------
const assFile = `${OUT_DIR}/caps.ass`;
fs.writeFileSync(assFile, buildAssCaptions(allWords, { w: 1920, h: 1080, x: 960, y: 970, size: 52 }), 'utf8');
execFileSync(FF, ['-y', '-framerate', String(FPS), '-i', `${FRAMES}/f_%05d.jpg`,
  '-i', `${OUT_DIR}/narr-full.wav`, '-stream_loop', '-1', '-i', 'image-tools/audio/awakening-dew.mp3',
  '-filter_complex',
  '[0:v]format=yuv420p[v];[v]ass=code-video/caps.ass:fontsdir=image-tools/fonts[vout];' +
  `[1:a]volume=1.0,atrim=0:${dur}[nar];[2:a]volume=0.10,atrim=0:${dur},afade=t=out:st=${(dur - 1.5).toFixed(1)}:d=1.5[mus];` +
  '[nar][mus]amix=inputs=2:duration=first:normalize=0[aout]',
  '-map', '[vout]', '-map', '[aout]', '-t', String(dur), '-r', String(FPS),
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
  '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', `${OUT_DIR}/code-demo.mp4`],
  { stdio: ['ignore', 'ignore', 'pipe'], timeout: 20 * 60 * 1000 });
fs.rmSync(assFile, { force: true });
fs.rmSync(`${OUT_DIR}/narr-full.wav`, { force: true });
fs.rmSync(FRAMES, { recursive: true, force: true });
for (const c of clips) fs.rmSync(c.audio, { force: true });
console.log(`✓ Demo video: ${OUT_DIR}/code-demo.mp4 (${Math.round(fs.statSync(`${OUT_DIR}/code-demo.mp4`).size / 1048576)} MB, ${dur}s, synced sections)`);
