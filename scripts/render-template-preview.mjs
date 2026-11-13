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
import { previewLine, previewTitle, buildPreviewDoc, extractVisualQuery } from '../lib/template-preview.mjs';
import { edgeVoiceFor, buildStorybookBeats, timeBeats } from '../lib/doc-storybook.mjs';
import { makeArtifactStore } from '../studio/lib/artifact-store.mjs';

export { extractVisualQuery };

const isMain = Boolean(
  process.argv[1] && (
    process.argv[1].replace(/\\/g, '/').endsWith('scripts/render-template-preview.mjs') ||
    (import.meta.url && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  )
);

if (isMain) {
  // local runs read the root .env (CI injects these as real env instead)
  for (const lineStr of (() => { try { return fs.readFileSync(path.resolve('.env'), 'utf8').split(/\r?\n/); } catch { return []; } })()) {
    const m = lineStr.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
  }

  // --draft <file>: preview a STAGED bot draft (the entry json) instead of a
  // registry template — previews rows keyed draft-<id>, never the gallery
  // family cards (R3 isolation: unapproved drafts stay out of the gallery).
  const draftArg = (() => { const i = process.argv.indexOf('--draft'); return i > 0 ? process.argv[i + 1] : null; })();
  let id = process.argv[2];
  let meta;
  if (draftArg) {
    meta = JSON.parse(fs.readFileSync(draftArg, 'utf8'));
    id = `draft-${meta.template_id}`;
  } else {
    if (!id || !REGISTRY_META[id]) {
      console.error(`unknown template "${id || ''}" — pass a registry template_id`);
      process.exit(1);
    }
    meta = REGISTRY_META[id];
  }
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
  // remotion runs INSIDE explainer (Root.tsx + public live there — the lane's invocation).
  // render/still get a pid-derived --port: port 3000 is often taken by a dev
  // server (a foreign page there poisons the bundle check with a cryptic error).
  const shEx = (args) => { const extra = (args[0] === 'render' || args[0] === 'still') ? ['--port=' + (3700 + (process.pid % 250))] : []; const r = spawnSync('npx', ['remotion', ...args, ...extra], { cwd: EXPL, stdio: 'inherit', shell: process.platform === 'win32' }); if (r.status !== 0) throw new Error(`remotion ${args[0]} failed (${r.status})`); };

  // 1. Media sourcing — fetch BOTH a high-res photo AND a real b-roll video clip
  const { fetchPhoto } = await import('../explainer/assets-photos.mjs');
  const { fetchBestBroll } = await import('../explainer/broll-fetch.mjs');

  const title = previewTitle(meta);
  const rawBeats = meta.story_structure?.beats || [];
  const clean = (s) => String(s || '').replace(/^(Opening|Evidence|Mechanism|Payoff|Rule \w+|Exhibit \w+):\s*/i, '').trim();
  const hookLine = clean(rawBeats[0]) || previewLine(meta);

  const queryBase = extractVisualQuery(meta, title, hookLine);
  console.log(`[preview] content-matched visual query (95-100% target): "${queryBase}"`);
  let photo = null;
  try {
    const r = await fetchPhoto({
      key: process.env.PEXELS_API_KEY,
      query: queryBase,
      outPath: path.join(photoDir, 't-photo.jpg'),
      orientation: 'portrait',
    });
    photo = r ? path.relative(PUB, r.file).split(path.sep).join('/') : null;
  } catch (e) {
    console.warn(`[preview] photo fetch error: ${e.message}`);
  }
  console.log(`[preview] photo: ${photo || 'none'}`);

  let broll = null;
  try {
    const r = await fetchBestBroll({
      query: queryBase,
      outPath: path.join(photoDir, 't-broll.mp4'),
      pexelsKey: process.env.PEXELS_API_KEY,
      minDurationSec: 8,
    });
    broll = r ? path.relative(PUB, r.file).split(path.sep).join('/') : null;
  } catch (e) {
    console.warn(`[preview] broll fetch error: ${e.message}`);
  }
  console.log(`[preview] broll: ${broll || 'none'}`);

  // 2. Beats — construct an engaging 4-beat showcase with real photo and video, no forced chapter divider
  const photoLine = clean(rawBeats[1]) || 'Every principle is backed by documented evidence and real practice.';
  const videoLine = clean(rawBeats[2]) || clean(rawBeats[3]) || 'Consistency and disciplined execution create compounding results.';

  const dynamicLayout = pres.doc_layouts?.find((l) => !['hero', 'chapter', 'split', 'end'].includes(l)) || 'quote';

  const beats = [
    {
      i: 0,
      layout: 'hero',
      headline: title,
      sub: hookLine,
      text: title,
      kicker: pres.eyebrow || '',
      broll: broll || undefined,
      photo: !broll && photo ? photo : undefined,
    },
    {
      i: 1,
      layout: 'split',
      kicker: pres.eyebrow ? `${pres.eyebrow.split('//')[0].trim()} · EVIDENCE` : 'THE BREAKDOWN',
      headline: photoLine,
      sub: clean(rawBeats[2]) || undefined,
      text: photoLine,
      photo: photo || undefined,
    },
    {
      i: 2,
      layout: dynamicLayout,
      kicker: 'KEY TAKEAWAY',
      headline: videoLine,
      text: videoLine,
      broll: broll || undefined,
      big: '87%',
      label: videoLine,
    },
    {
      i: 3,
      layout: 'end',
      headline: `Follow ${pres.brand || 'for daily breakdowns'}.`,
      text: `Follow ${pres.brand || 'for daily breakdowns'}.`,
    },
  ];
  console.log(`[preview] ${beats.length} beats (layouts: ${beats.map((b) => b.layout).join(' → ')})`);

  // 3. TTS — the spoken beats, the template's voice (Edge WordBoundary timings
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
    VALUES (${draftArg ? `draft-${id}` : familyId}, ${id}, ${mp4.url}, ${mp4.hash}, ${poster.url}, ${poster.hash}, ${pres.voice || null}, ${pres.theme || 'vox'}, now())
    ON CONFLICT (template_id) DO UPDATE SET mp4_url = EXCLUDED.mp4_url, mp4_hash = EXCLUDED.mp4_hash,
    poster_url = EXCLUDED.poster_url, poster_hash = EXCLUDED.poster_hash, voice = EXCLUDED.voice,
    theme = EXCLUDED.theme, family_id = EXCLUDED.family_id, rendered_at = now()`;
  await sql.end();
  console.log(`[preview] ✅ ${id} sample stored (blob + Neon)`);
}
