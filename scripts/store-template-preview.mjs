#!/usr/bin/env node
// Attach an already-rendered sample as a template's gallery preview
// (docs/qa/course-template-c1b-refine-qa.md R7). The automatic preview renderer
// (render-template-preview.mjs) only knows the storybook DocV2 look; diagram /
// paper templates store a real local render through this instead. Same private
// blob store + the same Neon template_previews row the gallery reads.
//
// Usage: node scripts/store-template-preview.mjs <template_id> <sample.mp4> [poster.jpg] [--clip 30]
//   --clip N  cut the first N seconds (default 30) so the gallery hover stays light
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadEnv } from '../lib/env.mjs';
import { makeArtifactStore } from '../studio/lib/artifact-store.mjs';
import { resolveBinary } from '../lib/ffmpeg.mjs';

loadEnv();
const args = process.argv.slice(2);
const [id, mp4In, posterIn] = args.filter((a) => !a.startsWith('--'));
const clipIdx = args.indexOf('--clip');
const clip = clipIdx > -1 ? Number(args[clipIdx + 1]) : 30;
if (!id || !mp4In) { console.error('usage: node scripts/store-template-preview.mjs <template_id> <sample.mp4> [poster.jpg] [--clip 30]'); process.exit(1); }

const { REGISTRY_META } = await import('../studio/lib/template-registry.data.js');
const meta = REGISTRY_META[id];
if (!meta) { console.error(`unknown template "${id}" — approve it into the registry first`); process.exit(1); }

const FF = resolveBinary('ffmpeg');
const tmp = path.resolve('longvideo', 'out', 'preview-store', id);
fs.mkdirSync(tmp, { recursive: true });
const mp4 = path.join(tmp, 'preview.mp4');
// 720p, short, faststart — the gallery plays it on hover
execFileSync(FF, ['-y', '-v', 'error', '-i', mp4In, '-t', String(clip), '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', mp4]);
let poster = posterIn;
if (!poster) {
  poster = path.join(tmp, 'poster.jpg');
  execFileSync(FF, ['-y', '-v', 'error', '-ss', String(Math.min(8, clip / 3)), '-i', mp4In, '-frames:v', '1', '-vf', 'scale=1280:-2', poster]);
}

const store = makeArtifactStore();
const put = async (file, contentType) => {
  const p = await store.putBytes('template_preview', fs.readFileSync(file), { contentType });
  if (!p?.ok || !p.blob_url) throw new Error(`blob put failed: ${p?.error || 'no url'}`);
  return { url: p.blob_url, hash: p.hash };
};
const v = await put(mp4, 'video/mp4');
const pst = await put(poster, 'image/jpeg');

const { default: postgres } = await import('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, idle_timeout: 5, onnotice: () => {} });
await sql`INSERT INTO template_previews (family_id, template_id, mp4_url, mp4_hash, poster_url, poster_hash, voice, theme, rendered_at)
  VALUES (${meta.family || null}, ${id}, ${v.url}, ${v.hash}, ${pst.url}, ${pst.hash}, ${meta.doc_presentation?.voice || null}, ${meta.doc_presentation?.style || 'paper'}, now())
  ON CONFLICT (template_id) DO UPDATE SET mp4_url = EXCLUDED.mp4_url, mp4_hash = EXCLUDED.mp4_hash,
  poster_url = EXCLUDED.poster_url, poster_hash = EXCLUDED.poster_hash, voice = EXCLUDED.voice,
  theme = EXCLUDED.theme, family_id = EXCLUDED.family_id, rendered_at = now()`;
const [row] = await sql`SELECT template_id, (mp4_url IS NOT NULL) AS has_mp4, (poster_url IS NOT NULL) AS has_poster, rendered_at FROM template_previews WHERE template_id = ${id}`;
await sql.end();
console.log(`[preview] ✅ ${id}: mp4 ${row.has_mp4 ? 'SET' : 'MISSING'} | poster ${row.has_poster ? 'SET' : 'MISSING'} | ${row.rendered_at.toISOString()}`);
