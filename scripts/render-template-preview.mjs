// Phase C (docs/qa/template-previews-qa.md) — render ONE template's sample
// episode: usage `node scripts/render-template-preview.mjs <template_id>`
// (CI: the template-preview workflow loops changed ids; manual: dispatch).
// Chain: buildPreviewDoc (the template's own DATA) → edge-tts one line →
// one landscape photo → DocV2 render (720p, ~12s) → poster → blob put →
// Neon template_previews rows. Fail-soft per step; exits non-zero only when
// the render itself fails.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { REGISTRY_META } from '../studio/lib/template-registry.data.js';
import { previewLine, previewTitle, buildPreviewDoc } from '../lib/template-preview.mjs';
import { edgeVoiceFor, buildStorybookBeats, timeBeats } from '../lib/doc-storybook.mjs';
import { makeArtifactStore } from '../studio/lib/artifact-store.mjs';

// local runs read the root .env (CI injects these as real env instead)
for (const lineStr of (() => { try { return fs.readFileSync(path.resolve('.env'), 'utf8').split(/\r?\n/); } catch { return []; } })()) {
  const m = lineStr.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
}

const id = process.argv[2];
if (!id || !REGISTRY_META[id]) {
  console.error(`unknown template "${id || ''}" — pass a registry template_id`);
  process.exit(1);
}
const meta = REGISTRY_META[id];
const familyId = meta.family || id; // the gallery card unit — one sample per family card
const pres = meta.doc_presentation && typeof meta.doc_presentation === 'object' ? meta.doc_presentation : {};
const niche = Array.isArray(meta.niches) && meta.niches.length ? meta.niches[0] : 'stories';
const EXPL = path.resolve('explainer');
const PUB = path.join(EXPL, 'public'); // remotion staticFile serves explainer/public (the lane's root)
const outDir = path.join(PUB, 'previews', id);
fs.mkdirSync(outDir, { recursive: true });
const work = path.join('demos', `preview-${id}`);
fs.mkdirSync(work, { recursive: true });
const audioDir = path.join(PUB, 'lf-audio', `preview-${id}`);
fs.mkdirSync(audioDir, { recursive: true });
const photoDir = path.join(PUB, 'lf-photos', `preview-${id}`);
fs.mkdirSync(photoDir, { recursive: true });
const sOpts = { stdio: 'inherit', shell: process.platform === 'win32' };
const sh = (args) => { const r = spawnSync(args[0], args.slice(1), sOpts); if (r.status !== 0) throw new Error(`${args[0]} failed (${r.status})`); };
// remotion runs INSIDE explainer (Root.tsx + public live there — the lane's invocation)
const shEx = (args) => { const r = spawnSync('npx', ['remotion', ...args], { cwd: EXPL, stdio: 'inherit', shell: process.platform === 'win32' }); if (r.status !== 0) throw new Error(`remotion ${args[0]} failed (${r.status})`); };

// 1. beats — the template's own layout cycle over a one-chapter sample
const line = previewLine(meta);
const beats = buildStorybookBeats(
  { title: previewTitle(meta), intro: line, chapters: [{ title: niche.split(/[,&]/)[0].trim(), text: line }], outro: '' },
  { docLayouts: pres.doc_layouts },
);
console.log(`[preview] ${beats.length} beats (layouts: ${beats.map((b) => b.layout).join(' → ')})`);

// 2. TTS — the spoken beats, the template's voice (Edge WordBoundary timings
//    → the preview karaoke works too)
const spoken = beats.filter((x) => (x.text || '').trim()).map((x) => ({ i: x.i, text: x.text }));
const voice = edgeVoiceFor(pres.voice);
console.log(`[preview] tts: ${spoken.length} spoken beat(s), voice ${voice}`);
// edge_batch writes tts-durations.json + a-<i>.mp3 NEXT TO its input — the
// input rides in the audio dir (the storybook lane's exact pattern)
fs.writeFileSync(path.join(audioDir, 'tts-input.json'), JSON.stringify(spoken));
const tts = spawnSync('python', [path.resolve('explainer', 'edge_batch.py'), path.join(audioDir, 'tts-input.json')], { ...sOpts, env: { ...process.env, EXPLAINER_VOICE: voice }, cwd: path.resolve('.') });
if (tts.status !== 0) throw new Error('preview tts failed');
const durs = JSON.parse(fs.readFileSync(path.join(audioDir, 'tts-durations.json'), 'utf8'));
const audioFor = (i) => {
  const rel = path.join('lf-audio', `preview-${id}`, 'audio', `beat-${String(i).padStart(2, '0')}.mp3`);
  const abs = path.join(PUB, rel);
  return fs.existsSync(abs) && fs.statSync(abs).size > 2048 ? rel.split(path.sep).join('/') : null;
};

// 3. one landscape photo for a mid slide (premium fetcher, niche query)
const { fetchPhoto } = await import('../explainer/assets-photos.mjs');
let photo = null;
try {
  const r = await fetchPhoto({ key: process.env.PEXELS_API_KEY, query: niche.split(/[,&]/)[0].trim().toLowerCase(), outPath: path.join(photoDir, 't-1.jpg'), orientation: 'landscape' });
  photo = r ? path.relative(PUB, r.file).split(path.sep).join('/') : null;
} catch { }
console.log(`[preview] photo: ${photo || 'none (text slide fallback)'}`);

// 4. doc json — the template's presentation over the timed beats
const { totalMs } = timeBeats(beats, durs, audioFor);
const doc = buildPreviewDoc(meta, beats, totalMs);
const docPath = path.join(PUB, `preview-${id}.json`);
fs.writeFileSync(docPath, JSON.stringify(doc, null, 2));

// 5. deps ensure + render DocV2 (720p — the doc json carries width/height);
//    the lane's exact invocation (cwd explainer, remotion/index.ts entry)
if (!fs.existsSync(path.join(EXPL, 'node_modules', 'remotion'))) {
  console.log('[preview] installing explainer deps (first run here)...');
  sh(['npm', 'install', '--no-audit', '--no-fund']);
}
const outPath = path.join(outDir, 'sample.mp4');
shEx(['browser', 'ensure']);
shEx(['render', 'remotion/index.ts', 'DocV2', outPath, `--props=${path.resolve(docPath)}`, '--concurrency=2', '--timeout=300000', '--log=error']);
console.log(`[preview] rendered: ${outPath}`);

// 6. poster frame
shEx(['still', 'remotion/index.ts', 'DocV2', path.join(outDir, 'poster.jpg'), `--props=${path.resolve(docPath)}`, '--frame=30', '--log=error']);

// 7. blob put + Neon rows (the PRIVATE store — the same one the gallery reads)
const store = makeArtifactStore();
const put = async (file, contentType) => {
  const bytes = fs.readFileSync(file);
  const p = await store.putBytes('template_preview', bytes, { contentType });
  if (!p?.ok) throw new Error(`blob put failed: ${p?.error}`);
  return { url: p.blob_url, hash: p.hash };
};
const mp4 = await put(outPath, 'video/mp4');
const poster = await put(path.join(outDir, 'poster.jpg'), 'image/jpeg');
console.log(`[preview] blob: mp4 ${mp4.url ? 'SET' : 'DEGRADED'} | poster ${poster.url ? 'SET' : 'DEGRADED'}`);

const { default: postgres } = await import('postgres');
const envUrl = process.env.DATABASE_URL || (fs.readFileSync(path.resolve('.env'), 'utf8').match(/DATABASE_URL=(.*)/) || [])[1]?.trim().replace(/^\"|\"$/g, '');
const sql = postgres(envUrl, { max: 1, idle_timeout: 5 });
await sql`CREATE TABLE IF NOT EXISTS template_previews (
  template_id text PRIMARY KEY,
  family_id text,
  mp4_url text, mp4_hash text,
  poster_url text, poster_hash text,
  voice text, theme text,
  rendered_at timestamptz DEFAULT now()
)`;
await sql`INSERT INTO template_previews (family_id, template_id, mp4_url, mp4_hash, poster_url, poster_hash, voice, theme, rendered_at)
  VALUES (${familyId}, ${id}, ${mp4.url}, ${mp4.hash}, ${poster.url}, ${poster.hash}, ${pres.voice || null}, ${pres.theme || 'vox'}, now())
  ON CONFLICT (template_id) DO UPDATE SET mp4_url = EXCLUDED.mp4_url, mp4_hash = EXCLUDED.mp4_hash,
  poster_url = EXCLUDED.poster_url, poster_hash = EXCLUDED.poster_hash, voice = EXCLUDED.voice,
  theme = EXCLUDED.theme, family_id = EXCLUDED.family_id, rendered_at = now()`;
await sql.end();
console.log(`[preview] ✅ ${id} sample stored (blob + Neon)`);
