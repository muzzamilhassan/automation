// market-files P5 — the THUMBNAIL (docs/qa/market-files-p5-qa.md):
//   node scripts/market-thumb.mjs --script content/market-scripts/<id>.json
// The episode's own cartoon scene becomes the thumbnail background — the
// first STAT beat (the big glowing board, the reference's signature shot) —
// composited through the existing left-stack thumbnail engine (dynamic
// gradient, crisp accent word). No stock photos: the art IS the show.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const STAGE_DIR = path.resolve('content', 'market-scripts');
const EXPL = path.resolve('explainer');
const sOpts = { stdio: 'inherit', shell: process.platform === 'win32' };

let scriptPath = arg('script');
if (!scriptPath) {
  const drafts = fs.readdirSync(STAGE_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('facts-') && !f.startsWith('market-data-')).map((f) => ({ f, m: fs.statSync(path.join(STAGE_DIR, f)).mtimeMs })).sort((a, b) => b.m - a.m);
  if (!drafts.length) { console.error('no staged scripts'); process.exit(1); }
  scriptPath = path.join(STAGE_DIR, drafts[0].f);
}
const script = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
const id = script.script_id;
const docPath = path.resolve('explainer', 'public', `lf-market-${id}.json`);
if (!fs.existsSync(docPath)) { console.error(`episode doc missing (${docPath}) — run scripts/market-render.mjs first`); process.exit(1); }
const doc = JSON.parse(fs.readFileSync(docPath, 'utf8'));

// the signature shot: the first STAT beat (big board), mid-beat frame
const fps = doc.fps || 24;
const stat = doc.beats.find((b) => b.layout === 'stat') || doc.beats.find((b) => b.layout === 'hero') || doc.beats[0];
const frame = Math.round(((stat.startMs + Math.min(stat.ms, 4000) / 2) / 1000) * fps);
const port = 3700 + (process.pid % 250);
const still = path.resolve(STAGE_DIR, 'render', id, 'thumb-scene.png');
fs.mkdirSync(path.dirname(still), { recursive: true });
spawnSync('npx', ['remotion', 'still', 'remotion/index.ts', 'DocV2', still, `--props=${docPath}`, `--frame=${frame}`, `--port=${port}`, '--log=error'], { cwd: EXPL, ...sOpts });
if (!fs.existsSync(still)) { console.error('scene still failed'); process.exit(1); }

// the existing engine: left-stack, dynamic gradient, crisp accent word —
// the same design language as the fleet's thumbnails, cartoon background
const { renderYouTubeThumbnail } = await import('../youtube-engine.mjs');
const jpg = await renderYouTubeThumbnail(script.topic, still, {
  thumbDesign: { layout: 'left-stack', brandmark: 'MARKET FILES', accent_word: 'last', scrim_tint: '#7A1E1E', accent: '#F0776E' },
});
const out = path.resolve(STAGE_DIR, 'render', id, 'thumbnail.jpg');
fs.writeFileSync(out, jpg);
console.log(`[thumb] ✅ ${out} (${(jpg.length / 1024).toFixed(0)} KB) — bg frame ${frame} (${stat.layout})`);
