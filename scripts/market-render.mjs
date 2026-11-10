// market-files P4 — the EPISODE ASSEMBLER (docs/qa/market-files-p4-qa.md):
//   node scripts/market-render.mjs --script content/market-scripts/<id>.json [--slug money-rulebook]
// staged script (P2) + P1 scenes → a RENDERED watchable episode: per-voice
// Edge-TTS with real WordBoundary timings (karaoke), the shared pacing
// (timeBeats), approved music (fail-soft), DocV2 render, poster, SRT.
// The demo video the owner watches before anything goes live (their gate).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

for (const lineStr of (() => { try { return fs.readFileSync(path.resolve('.env'), 'utf8').split(/\r?\n/); } catch { return []; } })()) {
  const m = lineStr.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
}

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const STAGE_DIR = path.resolve('content', 'market-scripts');
const PUB = path.resolve('explainer', 'public');
const EXPL = path.resolve('explainer');
const sOpts = { stdio: 'inherit', shell: process.platform === 'win32' };

let scriptPath = arg('script');
if (!scriptPath) {
  const drafts = fs.readdirSync(STAGE_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('facts-') && !f.startsWith('market-data-') && f !== 'approved-music.json').map((f) => ({ f, m: fs.statSync(path.join(STAGE_DIR, f)).mtimeMs })).sort((a, b) => b.m - a.m);
  if (!drafts.length) { console.error('no staged scripts — run scripts/market-bot.mjs first'); process.exit(1); }
  scriptPath = path.join(STAGE_DIR, drafts[0].f);
  console.log(`[render] no --script given — latest staged: ${drafts[0].f}`);
}
const slug = arg('slug') || 'money-rulebook'; // the pilot channel (pilot directive)

// R1 — the gate again, before ANY spend
const { validateMarketScript, buildMarketBeats, voiceGroups, SCENE_MOODS } = await import('../lib/market-script.mjs');
const script = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
const v = validateMarketScript(script);
if (!v.ok) { console.error(`[render] ✗ staged script fails the gate: ${v.errors.slice(0, 6).join(' | ')}`); process.exit(1); }
const id = script.script_id;
const beats = buildMarketBeats(script);
// EPISODE MOOD: beats the writer left without a scene mood inherit the
// episode's dominant EXPLICIT mood (crash script stays red even when a
// sentence says "below its recent high" — the per-word derivation alone
// turned a crash stat into a green confetti party on the first render).
const tally = {};
for (const b of beats) { const m = b.scene?.mood; if (m && SCENE_MOODS.includes(m)) tally[m] = (tally[m] || 0) + 1; }
const dominant = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0];
if (dominant) {
  let filled = 0;
  for (const b of beats) if (!b.scene?.mood) { b.scene = { ...(b.scene || {}), mood: dominant }; filled++; }
  if (filled) console.log(`[render] episode mood "${dominant}" — ${filled} beat(s) inherited it`);
}
console.log(`[render] ${id}: ${beats.length} beats validated`);

// R2 — one edge_batch per voice, real WordBoundary timings.
// edge_batch writes tts-durations.json + audio/beat-XX.mp3 NEXT TO its input,
// so each voice gets its own lf-audio directory; the merged map keys beats
// by their real indices either way.
const groups = voiceGroups(beats);
const durs = [];
const audioDirOf = {};
for (const [voice, idx] of Object.entries(groups)) {
  const tag = voice.replace(/[^A-Za-z]/g, '');
  const audioDir = path.join(PUB, 'lf-audio', `market-${id}-${tag}`);
  fs.mkdirSync(audioDir, { recursive: true });
  audioDirOf[voice] = audioDir;
  const input = idx.map((i) => ({ i, text: beats[i].text }));
  fs.writeFileSync(path.join(audioDir, 'tts-input.json'), JSON.stringify(input));
  console.log(`[render] tts ${voice}: ${idx.length} beat(s)…`);
  const tts = spawnSync('python', [path.resolve('explainer', 'edge_batch.py'), path.join(audioDir, 'tts-input.json')], { ...sOpts, env: { ...process.env, EXPLAINER_VOICE: voice }, cwd: path.resolve('.') });
  if (tts.status !== 0) throw new Error(`tts failed for ${voice}`);
  durs.push(...JSON.parse(fs.readFileSync(path.join(audioDir, 'tts-durations.json'), 'utf8')));
}
const dirForBeat = (i) => audioDirOf[beats[i].voice] || Object.values(audioDirOf)[0];
const audioFor = (i) => {
  const rel = path.relative(PUB, path.join(dirForBeat(i), 'audio', `beat-${String(i).padStart(2, '0')}.mp3`));
  const abs = path.join(PUB, rel);
  return fs.existsSync(abs) && fs.statSync(abs).size > 2048 ? rel.split(path.sep).join('/') : null;
};

// R3 — the shared pacing (storybook lane's exact timeBeats)
const { timeBeats, buildStorybookDoc, srtFromBeats } = await import('../lib/doc-storybook.mjs');
timeBeats(beats, durs, audioFor);
const totalSec = beats.reduce((n, b) => n + b.ms, 0) / 1000;
console.log(`[render] timeline: ${totalSec.toFixed(1)}s across ${beats.length} beats`);

// R4 — the doc: family style + brand furniture + approved music (fail-soft)
const { pickApprovedTrack } = await import('../music-engine.mjs');
const APPROVED_MUSIC = JSON.parse(fs.readFileSync(path.resolve('yt-brands', 'approved-music.json'), 'utf8'));
let musicRel = null;
try {
  const moods = beats.map((b) => b.scene?.mood).filter(Boolean);
  const mood = moods.includes('crash') ? 'driving' : moods.includes('party') ? 'bright' : 'calming';
  const track = await pickApprovedTrack(APPROVED_MUSIC[slug] || [], mood);
  if (track) {
    musicRel = `lf-audio/market-${id}-music.mp3`;
    fs.copyFileSync(track.file, path.join(PUB, musicRel));
    console.log(`[render] music: "${track.title}" (${track.feel})`);
  }
} catch (e) { console.log(`[render] music skip (fail-soft): ${String(e.message).slice(0, 60)}`); }

const chapters = beats.filter((b) => b.layout === 'chapter').length;
const doc = buildStorybookDoc({
  title: script.topic,
  presentation: { theme: 'focus', style: 'market-files', brand: 'MARKET FILES', eyebrow: 'MARKET FILES // MF', badge: 'MF' },
  beats,
  totalMs: beats.reduce((n, b) => n + b.ms, 0) + 1500,
  music: musicRel,
  progressParts: Math.max(chapters, 1),
});
const jsonPath = path.join(PUB, `lf-market-${id}.json`);
fs.writeFileSync(jsonPath, JSON.stringify(doc, null, 2));

// R5 — the lane's render invocation (browser ensure, conc 2 → retry 1)
const outDir = path.join(STAGE_DIR, 'render', id);
fs.mkdirSync(outDir, { recursive: true });
if (!fs.existsSync(path.join(EXPL, 'node_modules', 'remotion'))) {
  console.log('[render] installing explainer deps (first run here)…');
  spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: EXPL, ...sOpts });
}
spawnSync('npx', ['remotion', 'browser', 'ensure'], { cwd: EXPL, ...sOpts });
const port = 3700 + (process.pid % 250);
const final = path.resolve(outDir, 'episode.mp4');
const renderArgs = (conc) => ['remotion', 'render', 'remotion/index.ts', 'DocV2', final, `--props=${jsonPath}`, `--concurrency=${conc}`, '--timeout=300000', `--port=${port}`, '--log=error'];
console.log('[render] rendering DocV2…');
let r = spawnSync('npx', renderArgs(2), { cwd: EXPL, ...sOpts });
if (r.status !== 0) {
  console.log('[render] retry concurrency 1…');
  r = spawnSync('npx', renderArgs(1), { cwd: EXPL, ...sOpts });
}
if (r.status !== 0) throw new Error('docv2 render failed');

// poster + R6 SRT
spawnSync('npx', ['remotion', 'still', 'remotion/index.ts', 'DocV2', path.resolve(outDir, 'poster.jpg'), `--props=${jsonPath}`, '--frame=40', `--port=${port}`, '--log=error'], { cwd: EXPL, ...sOpts });
fs.writeFileSync(path.join(outDir, 'episode.srt'), srtFromBeats(beats, durs));

// R7 — the demo gate
const mb = (fs.statSync(final).size / 1048576).toFixed(1);
console.log(`\n[render] ✅ DEMO READY (${mb} MB, ${totalSec.toFixed(0)}s):`);
console.log(`   video  ${final}`);
console.log(`   poster ${path.join(outDir, 'poster.jpg')}`);
console.log(`   srt    ${path.join(outDir, 'episode.srt')}`);
