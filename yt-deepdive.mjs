// Quarry Long-form v2 — premium daily episode builder (1920x1080).
// Dedicated long-form script (NOT reel points): cold open + 8 documentary
// chapters + outro. Premium visuals: branded title card, chapter transitions,
// slow cinematic drift on 4K b-roll, lower-thirds, end card, music bed.
// Usage: node yt-deepdive.mjs <slug> [--force]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { Readable } from 'node:stream';
import { google } from 'googleapis';
import { loadAllStates, saveChannelState } from './lib/state.mjs';
import { isDocDay, docDaysOf } from './lib/doc-days.mjs';
import { cuesFromWords, toSrt } from './lib/srt.mjs';
import { nextCounter } from './lib/quota-ledger.mjs';
import { EMBEDDED_FONTS_CSS } from './typography-poster-engine.mjs';
import { getTopicClip } from './youtube-clips.mjs';
import { pickApprovedTrack } from './music-engine.mjs';
const APPROVED_MUSIC = JSON.parse(fs.readFileSync(new URL('./yt-brands/approved-music.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), 'utf8'));
import { renderYouTubeThumbnail, callScriptBrain, fetchBrainContext, brainContextSection, registryThresholds, resolveTemplateId, thumbDesignFor } from './youtube-engine.mjs';
import { bySlug } from './yt-brands/brands.mjs';
// P5-T2e (D15/AC-P5-15/16): the doc lane's template reads — the assigned doc
// template's section plan and the foreign-format loud skip. Pure helpers: this
// module executes top-level code, so the logic lives in lib/ for the suite.
import { docStoryPlan, docStoryPlanLines, foreignDocFormat, skipForeignDocFormat } from './lib/doc-template.mjs';
// #106 INCIDENT: the doc lane's frame helpers as pure lib functions — the
// TRANSPARENT chapter lower-third (the old opaque card covered the b-roll
// under overlay=0:0) and the fail-closed b-roll gate (zero clips = refuse).
import { chapterLowerThirdSvg, docBrollGate } from './lib/doc-frames.mjs';
// STORYBOOK doc lane (spec docs/superpowers/specs/2026-11-04-storybook-doc-lane-spec.md):
// the assigned template's story_structure.doc_render === 'storybook' flips the
// visual layer to the DocV2 vox engine (the owner's wanted look — the reference
// BFCa-bRy-3M style). Pure helpers live in lib/doc-storybook.mjs; photos ride
// the same Pexels→Pixabay lane make-longform proves, in portrait for the cards.
import { docRenderOf, docPresentation, edgeVoiceFor, buildStorybookBeats, timeBeats, buildStorybookDoc, storybookPhotoGate, photoQueryFor, srtFromBeats, planStoryDirectives, planEntityDirectives } from './lib/doc-storybook.mjs';
import { fetchPhoto, fetchPhotoPixabay } from './explainer/assets-photos.mjs';
// REGISTRY_META is registry DATA keyed by the ONE identity string (D19) — the
// doc lane reads the ASSIGNED template's own block (no family fallback).
import { REGISTRY_META } from './studio/lib/template-registry.data.js';
const { recentUploadTitles, findDup } = await import('./lib/dup-gate.mjs');
const { resolveBrand } = await import('./lib/brand-resolve.mjs');

import { resolveBinary } from './lib/ffmpeg.mjs';
import { applyChannelKeys } from './lib/channel-keys.mjs';
// #106 T3 (S2): upload intents — the note before any videos.insert (D5), the
// two-step resumable upload (D6), the run-start open-intent resolution (D7a).
// #106 T5c: nextFutureSlotISO recomputes publishAt per D8 on the review seams
// (generate-only save + the resume's pre-render AC-P4-19 guard).
import { getUploadIntentStore, uploadWithIntent, recoverOpenIntents, makeFindByTitle, oauthAccessToken, slotISOOnDate, nextFutureSlotISO } from './lib/upload-intents.mjs';
// #106 T5c: the review-seam flag parser (pure module — the env travels ONLY on
// gated/approval runs; unset = byte-identical legacy path).
// #106 P5 T5d (D4/AC-P5-4): the doc upload DESCRIPTION's machine append
// (appendDisclaimers) and the doc template's declared chain
// (declaredDisclaimers) — the same unconditional append the shorts lanes wire
// at their snippets.
import { flagOn, appendDisclaimers, declaredDisclaimers } from './lib/review-seams.mjs';
import { loadEnv } from './lib/env.mjs';
loadEnv();
const FF = resolveBinary('ffmpeg');
const FP = resolveBinary('ffprobe');
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));



const slug = process.argv[2];
const FORCE = process.argv.includes('--force');
const b = (await resolveBrand(slug)) || bySlug[slug];
if (!b) { console.error('unknown slug (no legacy kit and no registry entry):', slug); process.exit(1); }
// T5c round 1 (IMPORTANT 2): the page-like object getTopicClip expects — the
// same shape yt-daily builds (yt-daily.mjs). This module has referenced
// `page()` since e7fb691 without defining it: every chapter's ReferenceError
// was swallowed by the per-chapter try/catch, so doc chapters have silently
// rendered flat backgrounds with no Pixabay b-roll ever since.
const page = () => ({ id: 'yt-' + slug, ytSlug: slug, name: b.label, niche: b.niche, ytBrand: b });
// #102 BYOK: this channel's own provider keys (encrypted yt-mcp/channel-keys.json)
// replace the shared keys so the doc chain burns per-channel quota, not one shared pool.
applyChannelKeys(slug);

// #106 T5c (S4) — the DOC lane's review seams, threaded by channel-pipeline.mjs's
// T5 gate (env travels ONLY on gated/approval runs; unset = byte-identical
// legacy path — this is how clips-source channels close the approval loop):
//   REVIEW_GENERATE_ONLY    the gate held with no approved script — run the doc
//                           generation exactly as today (brain walk + dedupe
//                           gates), persist the survivor awaiting_review, then
//                           STOP before any TTS/music/render/upload;
//   PIPELINE_RESUME_JOB_ID  an approval dispatched resume=<held job id> — render
//                           the doc from the STORED script input, never re-generate.
const GENERATE_ONLY = flagOn(process.env.REVIEW_GENERATE_ONLY);
const RESUME_SCRIPT_JOB = String(process.env.PIPELINE_RESUME_JOB_ID || '').trim();

// 09-20: per-channel state files are the source of truth (lib/state.mjs)
const loadState = () => loadAllStates();

// ---------- script brain: the capability registry (lib/ai-adapter.mjs) ----------
// #104 Task 6 (AC-P2-10): the hand-coded Gemini -> Groq -> Cloudflare chain is
// GONE — provider order/fallback belongs to routeAndCall('script-gen') now
// (channel routes -> workspace default -> catalog baseline; per-channel vault
// keys and usage_events are the adapter's job). Caller-owned and untouched:
// the LONG_PROMPT contract, validEpisode shape validation, and the 3-walk
// escalation (walk 2+ appends groq's old raw-JSON-only suffix chain-wide).
// Throws on total failure exactly as before — the run exits nonzero and the
// episode is picked up on the next doc day.
function validEpisode(p) {
  return p?.title && Array.isArray(p.chapters) && p.chapters.length >= 5 &&
    p.chapters.every(c => (c.text || '').split(/\s+/).length >= 70) && p.intro && p.outro;
}
// #105 Task 7 — the doc lane's /dedupe chunks: the whole episode as ONE
// pooled chunk, the same shape the backfill corpus (lf-*.json docs) is
// embedded with, so similarity compares like-for-like.
const docDedupeChunks = (p) => [{
  chunk_kind: 'pooled',
  text: [p.title, p.intro, ...(Array.isArray(p.chapters) ? p.chapters : []).map(c => c?.text || ''), p.outro]
    .filter(Boolean).join('\n'),
}];
async function llmScript(prompt, topic, templateId = null) {
  const jobId = `deepdive:${slug}:${today()}`;
  // #105 Task 7 — /context BEFORE prompt assembly (no-op unless the brain is
  // enabled AND reachable; disabled = byte-identical committed prompt).
  const ctx = await fetchBrainContext({ channel: slug, kind: 'doc', topic, jobId });
  // P5-T2e (D15/AC-P5-15): the channel's ONE active template assignment
  // (resolved at run start) threads here — thresholds, the dedupe identity,
  // and the review-class derivation all read the template's own DATA. The
  // class derivation is the doc lane's OWN dedupe tiering (finance => BLOCK
  // fails closed, non-finance => today's WARN-downgrade): the pipeline's hold
  // already happened upstream, before this process was spawned. Unassigned
  // (null) = D8 defaults, non-finance tiered — byte-identical.
  const docGate = registryThresholds(templateId);
  if (templateId) {
    console.log(`[long] template ${templateId}: review class [${(docGate.reviewRequired || []).join(', ') || 'none'}] — dedupe thresholds ${docGate.variation}/${docGate.crossChannel}${docGate.financeGated ? ' (finance fail-closed)' : ' (non-finance WARN-downgrade)'}`);
  }
  const res = await callScriptBrain({
    slug,
    jobId,
    prompt: ctx && ctx.length ? prompt + brainContextSection(ctx) : prompt,
    isValidJson: validEpisode,
    maxAttempts: 3,
    suffix: '\nReply with the raw JSON object ONLY.',
    dedupe: {
      channel: slug,
      kind: 'doc',
      templateId,
      threshold: docGate.variation,
      crossThreshold: docGate.crossChannel,
      financeGated: docGate.financeGated,
      toChunks: docDedupeChunks,
    },
  });
  if (res.ok) {
    console.log(`[long] ${res.provider} script OK (${res.parsed.chapters.length} chapters${res.walk > 1 ? `, attempt ${res.walk}` : ''})`);
    return { ...res.parsed, provider: res.provider };
  }
  console.log(`[long] script brain exhausted (${res.error})`);
  throw new Error('all script providers failed');
}

// P5-T2e (D15/AC-P5-16): the LAST line is the shape directive — the hardcoded
// 8-chapters default when no doc plan is assigned (byte-identical), the
// assigned doc template's section plan (chapter count + word floor, clamped
// onto the validEpisode contract) when one is. The JSON contract line above
// it is the immutable episode shape and never changes.
const LONG_PROMPT = (b, theme, docPlan = null) => `You write premium long-form YouTube documentary episodes for "${b.label}" (Niche: ${b.niche}), in the style of top ${b.authority} channels for a US audience.
Episode theme: ${theme}.
STRICT RULES: every chapter delivers concrete, specific ${b.niches[0]} insight — stories, mechanisms, numbers, mistakes, consequences. NO generic motivation, NO repetition between chapters. Documentary storytelling: each chapter opens a tension and closes a payoff.
Return ONLY valid JSON:
{"title":"episode title <=60 chars, curiosity gap","intro":"2 sentence cold-open that sets stakes","chapters":[{"title":"<=40 chars","text":"120-150 words of spoken-style narration"}],"outro":"2 sentences with a natural subscribe push"}
${docPlan ? docStoryPlanLines(docPlan) : 'Exactly 8 chapters. Every chapter text MUST be 120-150 words.'}`;

function sh(args, timeout = 900000) {
  try {
    execFileSync(FF, args, { stdio: ['ignore', 'ignore', 'pipe'], timeout });
  } catch (e) {
    console.error('[long] FFMPEG FAILED: ' + args.join(' ').slice(0, 400));
    console.error('[long] stderr: ' + String(e.stderr || e.message).slice(0, 300));
    throw e;
  }
}
function probeDur(f) { return parseFloat(execFileSync(FP, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim()); }
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function wrapCenter(text, size, maxChars, startY, lineHeight, maxLines) {
  const words = String(text || '').split(/\s+/);
  const lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length <= maxChars) cur = (cur + ' ' + w).trim(); else { if (cur) lines.push(cur); cur = w; } }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines).map((l, i) => `<text x="960" y="${startY + i * lineHeight}" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="${size}" fill="#FFFFFF">${esc(l)}</text>`).join('\n  ');
}

// ---------- premium frames ----------
function frameSvg(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
  <defs><style>${EMBEDDED_FONTS_CSS}</style>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${b.bg}"/><stop offset="1" stop-color="#000000"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="40%" r="75%">
      <stop offset="0%" stop-color="${b.accent}" stop-opacity="0.20"/><stop offset="100%" stop-color="${b.bg}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#g)"/>
  <rect width="1920" height="1080" fill="url(#glow)"/>
  ${inner}
</svg>`;
}
async function introCard(title) {
  const inner = `
  <text x="960" y="360" text-anchor="middle" font-family="Oswald" font-weight="500" font-size="38" letter-spacing="14" fill="${b.accent}">${esc(b.eyebrow)}</text>
  <rect x="810" y="400" width="300" height="6" fill="${b.accent}"/>
  ${wrapCenter(title, 92, 24, 470, 106, 3)}
  <text x="960" y="930" text-anchor="middle" font-family="Oswald" font-weight="400" font-size="32" letter-spacing="6" fill="#FFFFFF" fill-opacity="0.65">${esc(b.label.toUpperCase())} • DAILY EPISODE</text>`;
  const f = `demos/deepdive-${slug}/card-intro.png`;
  await sharp(Buffer.from(frameSvg(inner)), { density: 96 }).png().toFile(f);
  return f;
}
async function chapterLowerThird(num, title) {
  // #106 INCIDENT (DEFECT 2): the card built on frameSvg — TWO FULL-FRAME
  // OPAQUE rects (gradient + glow) — and segment() composites it overlay=0:0,
  // so the card covered the chapter b-roll 100%: black docs with voice. The
  // lower-third is now a TRANSPARENT overlay (lib/doc-frames.mjs) — only the
  // bottom band, the accent bar, and the text are painted; the b-roll shows
  // through. frameSvg stays opaque for the intro/end cards (static gradient
  // cards by design).
  const f = `demos/deepdive-${slug}/lt-${num}.png`;
  // NO density option: at 96 the SVG rasterizes 2560x1440 (96/72 scaling) and
  // segment()'s unscaled overlay would push the band below the 1080 canvas —
  // the default 72 dpi renders the intrinsic 1920x1080 exactly.
  await sharp(Buffer.from(chapterLowerThirdSvg({ num, title, accent: b.accent }))).png().toFile(f);
  return f;
}
async function endCard() {
  const inner = `
  <text x="960" y="420" text-anchor="middle" font-family="Oswald" font-weight="500" font-size="36" letter-spacing="12" fill="${b.accent}">DAILY EPISODES</text>
  ${wrapCenter('Subscribe — tomorrow, same time.', 72, 24, 540, 86, 2)}
  <text x="960" y="880" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="52" letter-spacing="6" fill="${b.accent}">${esc(b.label.toUpperCase())}</text>
  <text x="960" y="960" text-anchor="middle" font-family="Oswald" font-weight="400" font-size="30" letter-spacing="4" fill="#FFFFFF" fill-opacity="0.6">${esc(b.handle)} • ${esc(b.kwShort.toUpperCase())}</text>`;
  const f = `demos/deepdive-${slug}/card-end.png`;
  await sharp(Buffer.from(frameSvg(inner)), { density: 96 }).png().toFile(f);
  return f;
}
async function renderCard(cardPng, audioFile, outFile, dur) {
  sh(['-y', '-loop', '1', '-i', cardPng, '-i', audioFile,
    '-filter_complex', `[0:v]scale=1920:1080,fps=30,format=yuv420p,fade=t=in:st=0:d=0.5,fade=t=out:st=${Math.max(0, dur - 0.6).toFixed(2)}:d=0.6[v]`,
    '-map', '[v]', '-map', '1:a', '-t', String(dur), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2', outFile]);
}
function narrate(text, num) {
  const base = `demos/deepdive-${slug}/narr-${num}`;
  fs.writeFileSync(`${base}.txt`, text, 'utf8');
  execFileSync('python', ['youtube-flow/narrate.py', `${base}.txt`, `${base}.mp3`, `${base}.words.json`],
    { stdio: ['ignore', 'ignore', 'pipe'], timeout: 240000, env: { ...process.env, YT_KOKORO_VOICE: b.voice || 'am_michael', YT_TTS_EDGE_VOICE: b.voice || 'en-US-ChristopherNeural', YT_KOKORO_SPEED: '0.92' } });
  fs.rmSync(`${base}.txt`, { force: true });
  fs.rmSync(`${base}.words.json`, { force: true });
  const metaPath = `${base}.mp3.meta.json`;
  let audio = `${base}.mp3`;
  if (fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    audio = meta.audio || audio;
  }
  return audio;
}
function segment(cardPng, clipFile, audioFile, outFile, dur, drift = false) {
  const pan = drift ? `crop=1920:1080:x='(in_w-1920)*min(t/${(dur / 2).toFixed(1)},1)':y=0,` : '';
  const filters = clipFile
    ? `[0:v]scale=2304:-2,${pan}fps=30,format=yuv420p[bg]`
    : `[0:v]fps=30,format=yuv420p[bg]`;
  const inputs = clipFile
    ? ['-stream_loop', '-1', '-i', clipFile, '-i', audioFile, '-i', cardPng]
    : ['-f', 'lavfi', '-i', `color=c=0x0c0c0e:s=1920x1080:r=30`, '-i', audioFile, '-i', cardPng];
  sh([...inputs,
    '-filter_complex', `${filters};[bg][2:v]overlay=0:0[v]`,
    '-map', '[v]', '-map', '1:a', '-t', String(dur),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2', outFile]);
}

// ---------- render + ship (one path for the normal doc day AND the review resume) ----------
// #106 T5c: the render+upload tail moved verbatim into ONE function so the
// resumed doc run consumes the exact same path (the resume rebuilds the script
// from the STORED input and calls this). The early process.exit(0) lanes became
// returns so a caller can tell "shipped" from "refused": the normal path
// ignores the result and the module ends right after (identical behavior), the
// resume maps a refusal to exit 1 with the script left approved.
async function renderAndShipEpisode(script, { yt, auth, intents, longSeed = null, reviewScript = null, docTemplateId = null, docDisclaimerBlock = null } = {}) {
  // STORYBOOK LANE (spec SB-1/SB-12): the ASSIGNED template's own DATA picks
  // the visual layer — story_structure.doc_render === 'storybook' renders the
  // DocV2 vox engine (the reference's editorial storybook look); any other
  // value/absent key falls through to the legacy b-roll lane below,
  // byte-identical. The branch reads the template INSIDE renderAndShipEpisode
  // so the review-resume path (which re-enters here with the APPROVED row's
  // template_id and the STORED script — zero generation calls) picks the same
  // lane its owner approved. Both lanes end in shipEpisode (SB-11) — the
  // upload tail is shared verbatim.
  const sbMeta = docTemplateId ? (REGISTRY_META[docTemplateId] || null) : null;
  if (docRenderOf(sbMeta) === 'storybook') {
    return shipEpisode(script, {
      yt, auth, intents, longSeed, reviewScript, docTemplateId, docDisclaimerBlock,
      ...(await renderStorybookVisuals(script, docPresentation(sbMeta, b))),
    });
  }
  // P5 T5d: docTemplateId = the doc template whose declared disclaimers the
  // upload description machine-appends; docDisclaimerBlock = the APPROVED
  // row's stored block, which wins VERBATIM on a resume (round 1 FIX 1).
  // Threaded per call site: the resolved assignment on the normal doc day, the
  // APPROVED ROW's own template_id + stored block on a resume (this tail runs
  // before the module-scope docTemplateId below is resolved, so the resume can
  // only name its row's template).
  fs.mkdirSync(`demos/deepdive-${slug}`, { recursive: true });
  const work = `demos/deepdive-${slug}`;
  const segs = [];
  let total = 0;

  // intro: title card with cold-open narration
  const introNarr = narrate(script.intro, 'intro');
  const introDur = Math.max(6, probeDur(introNarr) + 0.8);
  await renderCard(await introCard(script.title), introNarr, `${work}/seg-00.mp4`, introDur);
  segs.push({ file: `${work}/seg-00.mp4`, dur: introDur });
  total += introDur;

  // chapters: b-roll + lower-third + narration
  let chaptersWithClips = 0;
  for (let i = 0; i < script.chapters.length; i++) {
    const ch = script.chapters[i];
    console.log(`[long] chapter ${i + 1}/${script.chapters.length}: ${ch.title}`);
    const narr = narrate(ch.text, i + 1);
    const dur = Math.max(14, probeDur(narr) + 1.4);
    const seg = `${work}/seg-${String(i + 1).padStart(2, '0')}.mp4`;
    // #106 INCIDENT (DEFECT 1 hardening): a failed fetch is LOGGED, never
    // swallowed — the e7fb691 undefined-`page` ReferenceError died silently in
    // the old bare `catch { }` for every doc ever rendered.
    let clip = null;
    try { clip = await getTopicClip(page(), { headline: ch.title }); }
    catch (e) { console.log(`[long] WARN chapter ${i + 1} b-roll fetch failed: ${String(e?.message || e).slice(0, 90)}`); }
    if (clip) chaptersWithClips++;
    else console.log(`[long] WARN chapter ${i + 1}/${script.chapters.length}: no b-roll — chapter renders on the flat 0x0C0C0E fallback`);
    const lt = await chapterLowerThird(i + 1, ch.title);
    segment(lt, clip?.file || null, narr, seg, dur, true);
    segs.push({ file: seg, dur });
    total += dur;
    console.log(`  ✓ ${dur.toFixed(0)}s`);
  }

  // #106 INCIDENT BRAKE — the loud fail-closed b-roll gate. The fetches above
  // are best-effort per chapter, but a run where ZERO chapters carry a clip is
  // systemic (dead key, network down, empty search — or a swallowed regression
  // like the undefined-`page` ReferenceError) — exactly the four black Money
  // Rulebook videos. REFUSE before any upload: nonzero exit (the pipeline
  // records the failed step), the slot stays unproduced (deepdiveDate never
  // advances — a fixed next run retries), and the owner is pushed.
  const gate = docBrollGate(script.chapters.length, chaptersWithClips);
  if (!gate.ok) {
    console.error(`[long] FAIL-CLOSED: ${gate.reason}`);
    try {
      const { sendAlert } = await import('./lib/ntfy-alert.mjs');
      await sendAlert({ text: `${slug}: doc render REFUSED — ${gate.reason}. The episode was NOT uploaded. Check PIXABAY_API_KEY / b-roll queries, then re-dispatch (the script/slot is unspent).`, title: `[${slug}] doc refused: zero b-roll` });
    } catch { }
    throw new Error(gate.reason);
  }

  // end card with outro narration
  const endNarr = narrate(script.outro, 'end');
  const endDur = Math.max(6, probeDur(endNarr) + 1.0);
  const endSeg = `${work}/seg-end.mp4`;
  await renderCard(await endCard(), endNarr, endSeg, endDur);
  segs.push({ file: endSeg, dur: endDur });
  total += endDur;

  // #96 EPISODE SRT — per-chapter word timestamps (narr-*.mp3.meta.json words
  // [{w,s,d}]) mapped onto the episode timeline, so the clips-first lane (#97)
  // can cut sentence-aligned Shorts without re-transcribing. Narration order is
  // intro, chapters 1..n, end — same order as segs.
  const narrNames = ['intro', ...script.chapters.map((_, i) => String(i + 1)), 'end'];
  let srtCursor = 0;
  const srtCues = [];
  for (let i = 0; i < segs.length; i++) {
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(work, `narr-${narrNames[i]}.mp3.meta.json`), 'utf8'));
      srtCues.push(...cuesFromWords(meta.words || [], srtCursor));
    } catch { }
    srtCursor += segs[i].dur;
  }
  fs.writeFileSync(path.join(work, 'episode.srt'), toSrt(srtCues));
  console.log(`[long] SRT: ${srtCues.length} cues -> ${work}/episode.srt`);

  // concat + music bed
  const list = `${work}/concat.txt`;
  fs.writeFileSync(list, segs.map(s => `file '${path.resolve(s.file).replace(/\\/g, '/')}'`).join('\n'));
  const joined = `${work}/joined.mp4`;
  sh(['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined]);
  let music = null;
  // 10-03: channel's own approved pool only. The -stream_loop -1 below already
  // restarts THIS track when it ends — never a second track (user rule).
  try { music = await pickApprovedTrack(APPROVED_MUSIC[slug] || []); } catch { }
  const final = `${work}/episode.mp4`;
  if (music) {
    sh(['-y', '-i', joined, '-stream_loop', '-1', '-i', music.file, '-filter_complex',
      `[1:a]volume=0.09[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0[a]`,
      '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', final]);
  } else { fs.copyFileSync(joined, final); }

  // Chapter timestamps for the upload description — cumulative segment
  // durations (the storybook lane derives the same lines from its divider
  // beats). The upload tail itself is SHARED: shipEpisode below (SB-11).
  let cum = 0;
  const chapterLines = script.chapters.map((c, i) => {
    const t = cum; cum += segs[i + 1]?.dur || 0;
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')} ${c.title}`;
  });
  return shipEpisode(script, {
    yt, auth, intents, longSeed, reviewScript, docTemplateId, docDisclaimerBlock,
    final, total, chapterLines, music,
    cleanupFiles: [joined, ...segs.map((s) => s.file)],
  });
}

// ---------- STORYBOOK visual layer (spec 2026-11-04) ----------
// The reference look (DocV2 vox) with the doc lane's structure: script ->
// beats (hero / divider+splits per chapter / end) -> ONE edge_batch TTS call
// (real Edge-TTS WordBoundary timings — the karaoke captions' fuel) ->
// portrait photos per slide (Pexels->Pixabay, pool reuse) -> fail-closed
// photo gate (#106 doctrine: zero photos is systemic) -> timeline -> approved
// music -> DocV2 render (npx remotion render, the make-longform invocation
// this repo's Actions proves) -> episode.srt from the beat words. The upload
// tail is shipEpisode — shared with the legacy lane.
async function renderStorybookVisuals(script, pres) {
  const EXPL = path.join(HERE, 'explainer');
  const PUB = path.join(EXPL, 'public');
  const work = `demos/deepdive-${slug}`;
  fs.mkdirSync(work, { recursive: true });
  const audioDir = path.join(PUB, 'lf-audio', slug);
  const photoDir = path.join(PUB, 'lf-photos', slug);
  fs.mkdirSync(audioDir, { recursive: true });
  fs.mkdirSync(photoDir, { recursive: true });
  const IS_WIN = process.platform === 'win32';
  const sOpts = { stdio: 'inherit', shell: IS_WIN };

  // beats (SB-4): hero -> per chapter divider + one split per sentence -> end
  const beats = buildStorybookBeats(script, { followLine: `Follow ${pres.brand} for more.` });
  console.log(`[storybook] ${beats.length} beats (${(script.chapters || []).length} chapters)`);

  // TTS (SB-7): one edge_batch call for ALL beats — a real Edge voice (the kit
  // voice when Edge-shaped, else en-US-AndrewNeural; kokoro ids like bm_daniel
  // are NOT edge voices). The #41 text-hash resume cache makes re-runs cheap.
  const spoken = beats.filter((x) => (x.text || '').trim()).map((x) => ({ i: x.i, text: x.text }));
  const inPath = path.join(audioDir, 'tts-input.json');
  fs.writeFileSync(inPath, JSON.stringify(spoken));
  const voice = edgeVoiceFor(b.voice);
  console.log(`[storybook] tts: ${spoken.length} spoken beats, voice ${voice}`);
  const tts = spawnSync('python', [path.join(EXPL, 'edge_batch.py'), inPath], { ...sOpts, env: { ...process.env, EXPLAINER_VOICE: voice } });
  if (tts.status !== 0) throw new Error('storybook tts failed');
  const durs = JSON.parse(fs.readFileSync(path.join(audioDir, 'tts-durations.json'), 'utf8'));

  // photos (SB-8): portrait stock per split slide — the same lane make-longform
  // proves (Pexels first, Pixabay fallback, niche-word retry, pool reuse), the
  // research doc's "portrait crops for the cards".
  const nicheWords = (Array.isArray(b.niches) && b.niches.length ? b.niches : String(b.niche || '').split(',')).map((x) => String(x).trim()).filter(Boolean);
  const pool = [];
  let poolIdx = 0;
  let photoIdx = 0;
  const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const beat of beats) {
    if (beat.layout !== 'split') continue;
    const outPath = path.join(photoDir, `p-${beat.i}.jpg`);
    const q = photoQueryFor(beat.chapterTitle, nicheWords, photoIdx++);
    let r = await fetchPhoto({ key: process.env.PEXELS_API_KEY, query: q, outPath, orientation: 'portrait' });
    if (!r) r = await fetchPhotoPixabay({ key: process.env.PIXABAY_API_KEY, query: q, outPath, orientation: 'portrait' });
    if (!r) {
      await sleepMs(2600);
      r = await fetchPhoto({ key: process.env.PEXELS_API_KEY, query: photoQueryFor(beat.chapterTitle, nicheWords, photoIdx + 7), outPath, orientation: 'portrait' });
    }
    if (!r) r = await fetchPhotoPixabay({ key: process.env.PIXABAY_API_KEY, query: nicheWords[photoIdx % nicheWords.length], outPath, orientation: 'portrait' });
    const rel = r ? path.relative(PUB, r.file).split(path.sep).join('/') : null;
    if (rel) { pool.push(rel); beat.photo = rel; }
    else if (pool.length) { beat.photo = pool[poolIdx++ % pool.length]; console.log(`[storybook] beat ${beat.i}: pool reuse`); }
    else beat.photo = null;
    await sleepMs(350);
  }
  const slides = beats.filter((x) => x.layout === 'split');
  console.log(`[storybook] photos: ${slides.filter((x) => x.photo).length}/${slides.length} slides set (pool ${pool.length})`);
  // #106 doctrine on the photo lane: a run where ZERO slides carry a photo is
  // systemic (dead key / network down) — refuse BEFORE the render spend. The
  // script stays approved (the resume can re-render after a re-dispatch); a
  // partially covered episode is degraded (text-only slides), not refused.
  const gate = storybookPhotoGate(slides.length, slides.filter((x) => x.photo).length);
  if (!gate.ok) {
    console.error(`[storybook] FAIL-CLOSED: ${gate.reason}`);
    try {
      const { sendAlert } = await import('./lib/ntfy-alert.mjs');
      await sendAlert({ text: `${slug}: storybook render REFUSED — ${gate.reason}. Check PEXELS/PIXABAY keys, then re-dispatch (the script/slot is unspent).`, title: `[${slug}] storybook refused: zero photos` });
    } catch { }
    throw new Error(gate.reason);
  }

  // timeline (SB-6) + doc json (SB-2/SB-15): make-longform's proven pacing;
  // progressParts = one dash per chapter (the reference's track).
  const audioFor = (i) => {
    const rel = `lf-audio/${slug}/audio/beat-${String(i).padStart(2, '0')}.mp3`;
    const abs = path.join(PUB, rel);
    return fs.existsSync(abs) && fs.statSync(abs).size > 2048 ? rel : null;
  };
  const { totalMs } = timeBeats(beats, durs, audioFor);
  const directives = planStoryDirectives(beats);
  const entities = planEntityDirectives(beats);
  console.log(`[storybook] directives: ${directives.pops} stat + ${entities.pops} entity pop(s) on the spoken words`);
  let musicRel = null;
  let track = null;
  try { track = await pickApprovedTrack(APPROVED_MUSIC[slug] || []); } catch { }
  if (track) {
    musicRel = `lf-audio/${slug}/music.mp3`;
    fs.copyFileSync(track.file, path.join(PUB, musicRel));
    console.log(`[storybook] music: "${track.title}" (${track.feel})`);
  }
  const doc = buildStorybookDoc({ title: script.title, presentation: pres, beats, totalMs, music: musicRel, progressParts: (script.chapters || []).length });
  const jsonPath = path.join(PUB, `lf-${slug}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(doc, null, 2));
  console.log(`[storybook] timeline: ${(totalMs / 60000).toFixed(1)} min -> ${path.basename(jsonPath)}`);

  // render (SB-9): deps on first use, browser ensure, then the make-longform
  // DocV2 invocation (concurrency 2 with a concurrency-1 retry).
  if (!fs.existsSync(path.join(EXPL, 'node_modules', 'remotion'))) {
    console.log('[storybook] installing explainer deps (first storybook render on this runner) ...');
    const ci = spawnSync('npm', ['ci'], { cwd: EXPL, ...sOpts });
    if (ci.status !== 0) throw new Error('explainer npm ci failed');
  }
  const ensure = spawnSync('npx', ['remotion', 'browser', 'ensure'], { cwd: EXPL, ...sOpts });
  if (ensure.status !== 0) throw new Error('remotion browser ensure failed');
  const final = path.resolve(work, 'episode.mp4');
  const renderArgs = (conc) => ['remotion', 'render', 'remotion/index.ts', 'DocV2', final, `--props=${jsonPath}`, `--concurrency=${conc}`, '--timeout=300000', '--port=3492'];
  let r = spawnSync('npx', renderArgs(2), { cwd: EXPL, ...sOpts });
  if (r.status !== 0) {
    console.log('[storybook] render retry concurrency 1');
    r = spawnSync('npx', renderArgs(1), { cwd: EXPL, ...sOpts });
  }
  if (r.status !== 0) throw new Error('storybook docv2 render failed');

  // SRT (SB-10): the beat words shifted onto the episode timeline — the same
  // cuesFromWords/toSrt the legacy lane feeds; episode.srt lands where the
  // pipeline's tt-lf artifact step already reads it.
  const srt = srtFromBeats(beats, durs);
  fs.writeFileSync(path.join(work, 'episode.srt'), srt);
  console.log(`[storybook] SRT cues -> ${work}/episode.srt`);

  const chapterLines = (script.chapters || []).map((c, i) => {
    const d = beats.find((x) => x.layout === 'chapter' && x.n === i + 1);
    const t = (d ? d.startMs : 0) / 1000;
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')} ${c.title}`;
  });
  console.log(`[storybook] ✅ episode rendered: ${final} (${(totalMs / 1000 / 60).toFixed(1)} min)`);
  return { final, total: totalMs / 1000, chapterLines, music: track, cleanupFiles: [] };
}

// ---------- SHIP TAIL (SB-11 — shared verbatim by BOTH visual layers) ----------
// Moved verbatim out of renderAndShipEpisode (the legacy body assembles its
// visual layer, then hands off here; the storybook branch hands off after
// renderStorybookVisuals). Only two generalizations: the description's chapter
// lines arrive per-lane (chapterLines) and the cleanup list (cleanupFiles).
async function shipEpisode(script, { yt, auth, intents, longSeed = null, reviewScript = null, docTemplateId = null, docDisclaimerBlock = null, final, total, chapterLines, music = null, cleanupFiles = [] }) {
  const work = `demos/deepdive-${slug}`;

  // premium thumbnail from a mid-episode frame
  // R4 (red-flags spec): the active doc template's thumb_design drives the
  // frame thumbnail's design (left-stack chip/brandmark/last-word accent/tint).
  // Template values win over the kit accent per the T6 precedence; null td =
  // today's center render byte-identical (R5). docTemplateId is the resolved
  // assignment on the normal doc day and the APPROVED ROW's template on a
  // resume (same threading as the disclaimers block).
  const thumbDesign = thumbDesignFor(docTemplateId);
  sh(['-y', '-v', 'error', '-ss', String(Math.round(total * 0.35)), '-i', final, '-frames:v', '1', `${work}/frame.jpg`]);
  const thumbOpts = { accent: (thumbDesign?.accent) || b.accent, eyebrow: (thumbDesign?.eyebrow) || b.eyebrow, thumbDesign };
  const thumb = await renderYouTubeThumbnail(script.title, `${work}/frame.jpg`, thumbOpts);

  // #106 T5b SEAM 2 (D18/AC-P4-23): WHERE the pipeline's gate enabled picking
  // (REVIEW_THUMB_CANDIDATES from the template DATA), the render emits N
  // candidates staggered across the episode. The upload still proceeds with
  // candidate 1 (M7); the owner picks at Studio > Review. Fail-soft end to end;
  // the env unset = today's single candidate, byte-identical.
  const THUMB_CANDIDATES_N = Math.max(1, Math.min(6, Number(process.env.REVIEW_THUMB_CANDIDATES) || 1));
  if (THUMB_CANDIDATES_N > 1) {
    const docThumbs = [thumb].filter(Boolean);
    try {
      for (const pct of [0.22, 0.48]) {
        sh(['-y', '-v', 'error', '-ss', String(Math.round(total * pct)), '-i', final, '-frames:v', '1', `${work}/frame-alt.jpg`]);
        docThumbs.push(await renderYouTubeThumbnail(script.title, `${work}/frame-alt.jpg`, thumbOpts));
        fs.rmSync(`${work}/frame-alt.jpg`, { force: true });
      }
    } catch (e) {
      console.log(`[long] thumb candidates degraded (${String(e.message).slice(0, 60)}) — candidate 1 proceeds`);
    }
    try {
      const seams = await import('./lib/review-seams.mjs');
      const { makeArtifactStore } = await import('./lib/artifact-store.mjs');
      let jobs = null;
      try { jobs = await (await import('./lib/job-store.mjs')).getJobStore(); } catch { }
      // #106 T5c: where a script row exists (the resumed doc's approved row),
      // the candidates are ALSO recorded on it — meta.thumb_candidates is the
      // shape /review reads for the swap. The normal doc day has no row — the
      // artifact index carries them (unchanged).
      const r = await seams.emitThumbCandidates({
        thumbs: docThumbs, artifacts: makeArtifactStore(), jobs,
        jobId: process.env.PIPELINE_JOB_ID || null, step: 'episode',
        scriptStore: reviewScript?.store ?? null, scriptId: reviewScript?.id ?? null,
        log: (m) => console.log(`[review] ${m}`),
      });
      if (r.candidates.length) console.log(`[long] ${r.candidates.length} thumbnail candidates emitted (candidate 1 ships; swap at Studio > Review)`);
    } catch (e) {
      console.log(`[long] thumb candidate indexing degraded (non-fatal): ${String(e.message).slice(0, 60)}`);
    }
  }

  console.log(`[long] ✅ episode rendered: ${final} (${(total / 60).toFixed(1)} min)`);

  // ---------- upload scheduled ----------

  const [hh, mm] = b.longSlot.split(':').map(Number);
  const now = new Date();
  const pub = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm, 0));
  if (pub <= new Date(now.getTime() + 35 * 60 * 1000)) pub.setUTCDate(pub.getUTCDate() + 1);
  const publishAt = pub.toISOString().replace(/\.\d+Z$/, 'Z');

  // #106 P5 T5d (D4/AC-P5-4): the doc template may declare fixed disclaimers —
  // the upload DESCRIPTION gains them machine-appended (code, never the LLM),
  // the same unconditional append the shorts lanes wire at their snippets.
  // Round 1 FIX 1: a RESUMED doc ships the APPROVED row's stored block
  // VERBATIM — a registry edit (or an unreadable data file failing open to
  // null) between approval and this resume can never silently change the
  // compliance text /review showed the owner; rows predating the block fall
  // back to the live chain. Null = nothing declared = byte-identical.
  const docDisclaimers = docDisclaimerBlock
    ? docDisclaimerBlock.split('\n')
    : await declaredDisclaimers(docTemplateId);
  // Round 1 FIX 2: the append's length is resolved BEFORE the base slice so
  // the description RESERVES its headroom — the final payload stays within
  // YouTube's 5000-char cap and the verbatim text is never truncated (never
  // slice after the append).
  const disclaimerAppend = Array.isArray(docDisclaimers) ? docDisclaimers.filter(Boolean).join('\n') : '';
  const description = [`"${script.title}" — a daily ${b.kwShort} episode from ${b.label}.`, '', script.intro, '', ...chapterLines, '', script.outro, `New episodes every day. ${b.hashtags || ''}`, ...(music ? [`🎵 ${music.credit}`] : [])].join('\n').slice(0, Math.max(0, 4900 - (disclaimerAppend ? disclaimerAppend.length + 2 : 0)));

  // 10-05 DUPLICATE TITLE GATE — the "Musonius Rufus" doc went out twice in two
  // days; a near-dup episode must never upload. Skip WITHOUT marking
  // deepdiveDate so tomorrow's fresh topic can go out cleanly.
  const docDup = findDup(script.title, await recentUploadTitles(yt));
  if (docDup) {
    console.log(`GATE: duplicate episode title "${script.title}" ≈ "${docDup}" — upload skipped`);
    return { skipped: 'dup' };
  }

  // #106 T3 (D6/AC-P4-6/7): two-step resumable upload — intent row first (the
  // INSERT mutex), session URI persisted before the first byte, videoId on 201.
  // Minor 7: the intent fingerprints the EXACT uploaded title (sliced, as the
  // resource sends it) so recovery matches the live playlist byte-for-byte.
  const docTitle = `${script.title} | ${b.authority}`.slice(0, 95);
  const up = await uploadWithIntent({
    store: intents, channelId: slug, slotDate: today(), kind: 'doc', slotIdx: 0,
    title: docTitle, jobId: process.env.PIPELINE_JOB_ID || null,
    accessToken: await oauthAccessToken(auth),
    resource: {
      snippet: { title: docTitle, description: appendDisclaimers(description, docDisclaimers), tags: b.tags.slice(0, 12), categoryId: '27', defaultLanguage: 'en', defaultAudioLanguage: 'en' },
      status: { privacyStatus: 'private', publishAt, selfDeclaredMadeForKids: false }
    },
    bytes: fs.readFileSync(final), publishAt,
    log: (m) => console.log(`[intent] ${m}`),
  });
  if (up.skipProduction && !up.videoId) {
    console.log(`[intent] doc upload skipped (intent conflict or past publishAt — safe direction); retry on the next doc day`);
    return { skipped: 'intent' };
  }
  if (!up.ok) throw new Error(`upload failed: ${up.error}`);
  const videoId = up.videoId;
  await yt.thumbnails.set({ videoId, media: { body: Readable.from(thumb) } }).catch(() => { });

  // R7 (red-flags QA, the captions gap): the doc lane's SRT rides as YouTube
  // CLOSED CAPTIONS — the same CC behavior as the reference video. Both lanes
  // write episode.srt into demos/deepdive-<slug>/. Fail-soft: a captions
  // failure never fails the upload (warn + continue).
  try {
    const srtPath = path.join('demos', `deepdive-${slug}`, 'episode.srt');
    if (fs.existsSync(srtPath)) {
      await yt.captions.insert({
        part: ['snippet'],
        requestBody: { snippet: { videoId, language: 'en', name: 'English' } },
        media: { body: Readable.from(fs.readFileSync(srtPath, 'utf8')), mimeType: 'text/plain' },
      });
      console.log(`[long] captions uploaded (CC from episode.srt)`);
    } else {
      console.log(`[warn] captions: no episode.srt found — video ships with auto-captions only`);
    }
  } catch (e) { console.log(`[warn] captions: ${String(e.message).slice(0, 90)}`); }

  // #106 T5b SEAM 3 (D14): the video_id write-back — fail-soft; a normal doc
  // day has no script rows (silent no-op), and the kind guard keeps a doc
  // upload from ever stamping a shorts script row. The resumed doc retires BY
  // ID in resumeApprovedDoc (the resumed job id is not the row's job id).
  try {
    const seams = await import('./lib/review-seams.mjs');
    const { getScriptStore } = await import('./lib/script-store.mjs');
    await seams.writeBackVideoId({
      scriptStore: await getScriptStore(), channelId: slug,
      jobId: process.env.PIPELINE_JOB_ID || null, kind: 'doc', videoId, slotDate: today(),
      log: (m) => console.log(`[review] ${m}`),
    });
  } catch { }

  const st = loadState();
  st[slug] = st[slug] || {};
  // deepdiveDate = TODAY in BOTH paths (safe direction): the doc slot is produced.
  st[slug].deepdiveDate = today();
  if (up.conflict) {
    // Round-1 MAJOR 4: claimed, not re-uploaded (a crashed run's episode is the
    // slot's product). Record ITS fingerprint — this run's narration text
    // belongs to no video and must never be embedded against the claimed id.
    // No FB outbox (wrong content), no seed write (this run's theme never
    // shipped — the next doc day may reuse it for a fresh episode).
    st[slug].deepdiveVideo = { videoId, publishAt, title: up.existing?.title_fingerprint || '', recovered: true };
    st[slug].uploadsToday = nextCounter(st[slug].uploadsToday);
    saveChannelState(slug, st[slug]);
    console.log(`[intent] conflict resolved: ${videoId} already on YouTube — claimed, NOT re-uploaded`);
    return { claimed: true, videoId };
  }
  if (longSeed) {
    st[slug].usedLongSeeds = [...(st[slug].usedLongSeeds || []), longSeed.title].slice(-40);
    st[slug].todayTopic = { at: today(), topic: longSeed.title };
  }
  // #105: narration text rides along in state (intro + chapters + outro) — the
  // pipeline embeds it into the Brain at publish time (AC-P3-2: upload accepted
  // first, so videoId is real here; the dup gate above exits without this write).
  st[slug].deepdiveVideo = { videoId, publishAt, title: `${script.title} | ${b.authority}`, text: [script.intro, ...(script.chapters || []).map((c) => c?.text || ''), script.outro].filter(Boolean).join('\n\n') };
  // #99 shared-pool ledger: count this successful upload against the daily budget
  st[slug].uploadsToday = nextCounter(st[slug].uploadsToday);
  saveChannelState(slug, st[slug]);

  // FB/IG outbox — episode cross-post (fb-crosspost posts it as scheduled video,
  // ig-crosspost posts it as feed VIDEO; long content is not a Reel)
  fs.mkdirSync(`fb-outbox/${slug}`, { recursive: true });
  const stamp = `ep-${Date.now()}`;
  fs.copyFileSync(final, `fb-outbox/${slug}/${stamp}.mp4`);
  fs.writeFileSync(`fb-outbox/${slug}/${stamp}.json`, JSON.stringify({ videoFile: `fb-outbox/${slug}/${stamp}.mp4`, publishAt, title: `${script.title} | ${b.authority}`, description, slug, kind: 'episode' }, null, 2));

  for (const f of cleanupFiles) fs.rmSync(f, { force: true });
  console.log(`\n✅ ${b.label} EPISODE scheduled: https://youtube.com/watch?v=${videoId} → public ${publishAt} (${(total / 60).toFixed(1)} min) + FB/IG outbox`);
  return { ok: true, videoId };
}

// ---- #106 T5c SEAM 1 (resume side): an approval dispatched resume=<held job
// id>. The child renders the DOC from the STORED full_render_input —
// generation is structurally impossible in this path (pinned by
// tests/review-seams.test.mjs: the brain spy THROWS if it is touched, and the
// narration the render consumes EQUALS the stored JSON). The owner's dispatch
// bypasses the cadence guards below (pause/docDay/already-produced): an
// approval is a deliberate production order, and D8 recomputes publishAt from
// the kit's long slot so a review delay can never publish instantly. A store
// that is unreadable or has no approved script exits WITHOUT regenerating
// (fail-closed — the approval's whole point is that THIS episode ships).
async function resumeApprovedDoc({ slug, jobId, b }) {
  const log = (m) => console.log(`[review] ${m}`);
  let store = null;
  let seams = null;
  try {
    const [ss, seamsMod] = await Promise.all([import('./lib/script-store.mjs'), import('./lib/review-seams.mjs')]);
    seams = seamsMod;
    store = await ss.getScriptStore();
  } catch (e) {
    log(`resume: seam import failed (${String(e?.message || e).slice(0, 80)})`);
    return false;
  }
  if (!store) {
    log('resume: script store unavailable — refusing to re-generate (fail-closed). Re-dispatch once the database is reachable.');
    return false;
  }
  const found = await seams.findResumableScript({ scriptStore: store, jobId, channelId: slug });
  if (!found.ok) {
    log(`resume: script store read failed (${found.error}) — refusing to re-generate (fail-closed)`);
    return false;
  }
  // T5c round 1 (BLOCKER 1) + round 2 (RESIDUAL): the /review dispatch is
  // kind-agnostic — a resumed SHORTS job reaches this lane through the episode
  // step's inherited resume env. A foreign-kind row is NOT this lane's
  // dispatch: exit 0 WITHOUT rendering or consuming (pre-T5c behavior — never
  // a false 'Episode failed' ntfy, and a short script can never ship as a full
  // documentary). Round 2: the check runs BEFORE the null-refusal too — the
  // DOMINANT single-approval flow has already CONSUMED the shorts row by the
  // time this lane looks (yt-daily rendered + markConsumed it), so all three
  // resumable lookups miss it and only a KIND-AGNOSTIC, status-agnostic
  // latestForJob can still see whose dispatch this was. Exit 1 stays for
  // doc-kind rows and truly-absent jobs (fail-closed).
  if (found.script && found.script.kind && found.script.kind !== 'doc') {
    log(`resume: job ${String(jobId).slice(0, 12)}… holds a ${found.script.kind} script — not the doc lane's dispatch; skipping (the shorts lane owns that resume)`);
    return true;
  }
  if (!found.script && typeof store.latestForJob === 'function') {
    let foreign = null;
    try {
      const any = await store.latestForJob(jobId);
      if (any?.ok && any.script && any.script.kind && any.script.kind !== 'doc') foreign = any.script;
    } catch { }
    if (foreign) {
      log(`resume: job ${String(jobId).slice(0, 12)}… holds a ${foreign.kind} script (${foreign.status}) — not the doc lane's dispatch; skipping (the shorts lane owns that resume)`);
      return true;
    }
  }
  if (!found.script) {
    log(`resume: no approved script for job ${String(jobId).slice(0, 12)}… / ${slug} — nothing to render (already consumed, or the approval never landed)`);
    return false;
  }
  const stored = seams.storedInputOf(found.script);
  if (!stored) {
    log(`resume: script ${found.script.id} has no usable stored render input — refusing to re-generate (D4)`);
    return false;
  }
  // Rebuild the EXACT doc structure the render path consumes from the stored
  // seam shape (hook=title, points=chapters, closing=outro, + the cold-open
  // intro) — this path never assembles a prompt, so there is no generate call
  // to remove.
  const script = {
    title: stored.hook,
    intro: typeof stored.intro === 'string' ? stored.intro : '',
    chapters: (Array.isArray(stored.points) ? stored.points : []).map((p) => ({ title: p?.title || '', text: p?.line || p?.text || '' })),
    outro: stored.closing || '',
    source: 'review-stored',
  };
  log(`resume: rendering the APPROVED doc from its STORED input (${found.via}) — zero generation calls`);
  // This branch runs BEFORE the cadence guards, so it builds its own clients
  // (the yt-daily resume mirror).
  const auth = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID || '', process.env.YOUTUBE_CLIENT_SECRET || '');
  const envName = `YT_TOKEN_${slug.toUpperCase().replace(/-/g, '_')}`;
  const tokRaw = process.env[envName] || fs.readFileSync(path.resolve(HERE, `yt-mcp/channels/${slug}/token.json`), 'utf8');
  const tok = JSON.parse(tokRaw);
  auth.setCredentials({ refresh_token: tok.refresh_token });
  const yt = google.youtube({ version: 'v3', auth });
  // D8/AC-P4-19: publishAt recomputed from the kit's long slot BEFORE any
  // render spend — the stored publishAt is history by construction (the
  // approval came later), and a past publishAt would publish instantly. No
  // future long slot remains => take the skip terminal WITHOUT rendering.
  const publishAt = nextFutureSlotISO([b.longSlot], { now: new Date() });
  if (publishAt && new Date(publishAt).getTime() <= Date.now()) {
    log(`resume: no future long slot remains (publishAt ${publishAt} already past) — episode skipped before any render spend (AC-P4-19; the script STAYS approved)`);
    // Unreachable via nextFutureSlotISO (always future-or-null) — belt-and-braces for a null-slot fallback evolution.
    return false;
  }
  // 10-05 duplicate-title gate BEFORE the render spend — a near-dup episode
  // must never re-render; the script stays approved for a fixed redispatch.
  const docDup = findDup(script.title, await recentUploadTitles(yt));
  if (docDup) {
    log(`resume: duplicate episode title "${script.title}" ≈ "${docDup}" — refused before render spend; the script STAYS approved`);
    return false;
  }
  const intents = await getUploadIntentStore();
  const ship = await renderAndShipEpisode(script, {
    yt, auth, intents, longSeed: null,
    reviewScript: { id: found.script.id, store },
    docTemplateId: found.script.template_id ?? null,
    // P5 T5d round 1 (FIX 1): the compliance text the owner approved ships
    // VERBATIM — the live chain only covers rows that predate the block.
    docDisclaimerBlock: typeof stored.disclaimer_block === 'string' && stored.disclaimer_block.trim() ? stored.disclaimer_block : null,
  });
  if (ship?.claimed) {
    // The slot was produced by a crashed run's video — claimed, not
    // re-uploaded. The approval row stands (a re-dispatch would re-render and
    // re-claim — wasteful, never unsafe).
    log(`resume: intent conflict resolved — ${ship.videoId} was already on YouTube, claimed, NOT re-uploaded (the script stays approved)`);
    return true;
  }
  if (!ship?.ok || !ship.videoId) {
    log(`resume: episode not shipped (${ship?.skipped || 'no videoId'}) — the script STAYS approved; fix and redispatch`);
    return false;
  }
  // the videoId landed — NOW the record retires (SEAM 3, by id: this IS the row)
  try {
    const mc = await store.markConsumed(found.script.id, ship.videoId);
    if (mc.ok) log(`script ${found.script.id} -> consumed (${ship.videoId})`);
    else if (mc.error) log(`WARN consume degraded (non-fatal): ${mc.error}`);
  } catch { }
  log(`✓ approved doc shipped — the approval loop is closed (hold → review → resume-render from the STORED input)`);
  return true;
}

// ---------- main ----------
const state = loadState();
// #106 T5c SEAM 1 (resume): runs BEFORE the cadence guards (pause/docDay/
// already-produced) — an approval is a deliberate production order (the
// yt-daily placement). Exit 1 surfaces a refused resume to the pipeline (the
// job records the failed step; the approval row stands for a later redispatch).
if (RESUME_SCRIPT_JOB) {
  const okResume = await resumeApprovedDoc({ slug, jobId: RESUME_SCRIPT_JOB, b });
  process.exit(okResume ? 0 : 1);
}
// 10-05 PAUSE GUARD — feed-collapse cooldown (same field yt-daily/sweeper use)
if ((state[slug]?.pausedUntil || '') >= today()) {
  console.log(`[${slug}] paused until ${state[slug].pausedUntil} — episode skipped`);
  process.exit(0);
}
// 10-05 CADENCE — docs are WEEKLY: each channel has a fixed docDay (brands).
// Daily 10-min docs got 0-37 views and read as mass-production; one weekly
// episode at a fixed slot is appointment viewing. --force overrides.
// #96: docDays ['Tue','Fri'] lists raise the cadence for the clips-first lane;
// the legacy single docDay keeps working. --force overrides.
const DOC_DAY_NAME = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getUTCDay()];
// #106 T5c: a GENERATE-ONLY run bypasses the docDay cadence — the review gate
// holds on ANY day for clips-source channels (the doc is their only script
// lane), so the /review desk would starve if scripts only generated on doc
// days. The already-produced and pause guards above/below still apply.
// force_doc=1 dispatches keep working exactly as before (--force). A RESUMED
// doc run never reaches this guard (the branch above exits first).
if (!isDocDay(b) && !FORCE && !GENERATE_ONLY) {
  const days = docDaysOf(b);
  console.log(`[${slug}] doc day${days.length === 1 ? '' : 's'} ${days.join('/') || '(none configured)'} (today is ${DOC_DAY_NAME}) — episode skipped`);
  process.exit(0);
}
if (state[slug]?.deepdiveDate === today() && !FORCE) {
  console.log(`[${slug}] deep-dive already produced today — skipping (--force to override)`);
  process.exit(0);
}
function today() { return new Date().toISOString().slice(0, 10); }

// Channel OAuth + yt client (moved up from the upload block — the D7a recovery
// needs the uploads playlist for its title-fingerprint lookup).
const auth = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID || '', process.env.YOUTUBE_CLIENT_SECRET || '');
const envName = `YT_TOKEN_${slug.toUpperCase().replace(/-/g, '_')}`;
const tokRaw = process.env[envName] || fs.readFileSync(path.resolve(HERE, `yt-mcp/channels/${slug}/token.json`), 'utf8');
const tok = JSON.parse(tokRaw);
auth.setCredentials({ refresh_token: tok.refresh_token });
const yt = google.youtube({ version: 'v3', auth });

// #106 T3 (D7a/AC-P4-8): BEFORE any production spend, resolve ANY open doc
// upload intent for this channel — any day. A resolved intent = the episode
// is already on YouTube: mark the slot produced (deepdiveDate + state entry,
// publishAt RECOMPUTED from the kit's long slot per D8) and exit — never a
// second upload. Abandoned = produce fresh; open = the slot mutex holds.
const intents = await getUploadIntentStore();
if (intents) {
  const intentLog = (m) => console.log(`[intent] ${m}`);
  // Round-1 MAJOR 3: kind-scoped — the doc lane recovers only DOC intents.
  const rec = await recoverOpenIntents({
    store: intents, channelId: slug, kind: 'doc', findByTitle: makeFindByTitle(yt, { log: intentLog }), log: intentLog,
  });
  for (const o of rec.outcomes) {
    if (o.status === 'resolved' && o.kind === 'doc') {
      console.log(`[intent] doc upload already on YouTube (${o.videoId}) — slot marked produced, production skipped`);
      const stR = loadState();
      stR[slug] = stR[slug] || {};
      // deepdiveDate = TODAY (safe direction, D17-terminal family): the doc
      // slot IS produced — the video is on YouTube. Re-producing today would
      // be exactly the duplicate this lane exists to prevent; a "missing"
      // episode is free, a second episode <24h is not.
      stR[slug].deepdiveDate = today();
      stR[slug].deepdiveVideo = {
        videoId: o.videoId,
        // Minor 8: the committed schedule (probe body) or the long-slot time
        // ON THE RECOVERED SLOT'S DATE — never a rolled-forward occurrence.
        publishAt: o.publishAt || slotISOOnDate(o.slotDate, b.longSlot || '22:35'),
        title: o.title || o.intent.title_fingerprint || '',
        recovered: true,
      };
      stR[slug].uploadsToday = nextCounter(stR[slug].uploadsToday);
      saveChannelState(slug, stR[slug]);
      process.exit(0);
    }
    if (o.status === 'abandoned') console.log(`[intent] slot ${o.slotDate}#${o.slotIdx} abandoned — producing fresh`);
    else if (o.status === 'open') console.log(`[intent] slot ${o.slotDate}#${o.slotIdx} left open (${o.reason})`);
  }
}

// P5-T2e (D15/AC-P5-15): resolve the channel's ONE active template assignment —
// the same getActiveAssignment pattern the pipeline gate uses (resolveTemplateId
// wraps it). Fail-open null (registry dark) = today's template-less defaults.
// A shorts-only assignment skips the slot LOUDLY — one Action-required warning
// + log line, zero production: a shorts-shaped template is never rendered as a
// documentary. The resume branch above never reaches this (it renders the
// STORED approved script — no generation, no template read).
const docTemplateId = await resolveTemplateId(slug);
const docTemplate = docTemplateId ? (REGISTRY_META[docTemplateId] || null) : null;
const foreignDoc = foreignDocFormat(docTemplate);
if (foreignDoc) {
  let warnStore = null;
  try { warnStore = await (await import('./lib/warnings-store.mjs')).getDefaultWarningsStore(); } catch { }
  await skipForeignDocFormat({ slug, templateId: docTemplateId, foreign: foreignDoc, store: warnStore, log: console.log });
  process.exit(0);
}
const docPlan = docStoryPlan(docTemplate);

console.log(`[long] ${b.label} — premium daily episode`);
// 09-30: episode topics are RESEARCH-LED too (static banks removed). The
// topic comes from the strongest current story in the niche; seeds already
// used are skipped so episodes never circle the same subject.
let theme = null;
let longSeed = null;
try {
  const { researchTrend } = await import('./trend-research.mjs');
  const tokLong = JSON.parse(process.env[`YT_TOKEN_${slug.toUpperCase().replace(/-/g, '_')}`] || fs.readFileSync(path.resolve(HERE, `yt-mcp/channels/${slug}/token.json`), 'utf8'));
  const oauthLong = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
  oauthLong.setCredentials({ refresh_token: tokLong.refresh_token });
  const trend = await researchTrend(slug, oauthLong, [...b.niches, ...b.tags.slice(0, 2)]);
  const usedLong = Array.isArray(state[slug]?.usedLongSeeds) ? state[slug].usedLongSeeds : [];
  longSeed = trend.videos.find((v) => !usedLong.includes(v.title)) || trend.videos[0] || null;
  if (longSeed) {
    theme = `Build today's documentary around the THEME of this proven viral video in the niche: "${longSeed.title}" (${longSeed.views.toLocaleString('en-US')} views in the last 14 days). Reimagine it as a deep, original ${b.label} episode — do NOT copy its title or content; go much deeper with a fresh angle. What is working right now: ${trend.hotKeywords.slice(0, 8).join(', ')}.`;
  }
} catch (e) { console.log(`[long] trend research failed: ${String(e.message).slice(0, 70)} — using evergreen niche angle`); }
if (!theme) {
  // Last-resort evergreen angle (not a static list — derived from the niche).
  theme = `The most searched, most argued-about question in ${b.niche} right now, told as a story-driven documentary for ${b.label}.`;
}
const script = await llmScript(LONG_PROMPT(b, theme, docPlan), longSeed?.title || theme, docTemplateId);

// #106 T5c SEAM 1 (generate-only): the pipeline's gate held this run with no
// approved script — the doc generation ran EXACTLY as today (the brain's
// dedupe walk inside llmScript; an exhausted/blocked walk THREW above and
// never reaches this branch), so the survivor is persisted BEFORE any render
// (AC-P4-17) and this run STOPS here: no TTS, no music, no render, no upload.
// The dup gate runs first — a near-dup episode never sits in the review queue.
// deepdiveDate NEVER advances (the approval's resume must be able to render
// TODAY); the seed rotation DOES (the T5b round-1 pattern — an unapproved
// channel must diversify nightly, not re-pick the same wave).
if (GENERATE_ONLY) {
  const docDupGen = findDup(script.title, await recentUploadTitles(yt));
  if (docDupGen) {
    // T5c round 1 (minor 3): the blocked theme is CONSUMED for rotation even
    // though nothing saved — a gated clips channel must not re-derive the same
    // near-dup theme nightly (the yt-daily rejectedSeeds mirror).
    if (longSeed) {
      const stD = loadState();
      stD[slug] = { ...(stD[slug] || {}), usedLongSeeds: [...(stD[slug]?.usedLongSeeds || []), longSeed.title].slice(-40) };
      saveChannelState(slug, stD[slug]);
    }
    console.log(`GATE: duplicate episode title "${script.title}" ≈ "${docDupGen}" — doc script NOT saved (blocked); nothing to review`);
    process.exit(0);
  }
  const seams = await import('./lib/review-seams.mjs');
  const { getScriptStore } = await import('./lib/script-store.mjs');
  const store = await getScriptStore();
  if (!store) {
    console.log('[review] script store unavailable — doc script NOT saved (fail-closed; the gate re-holds and this retries next run)');
    process.exit(0);
  }
  const docTemplateId = await resolveTemplateId(slug);
  const saved = await seams.saveGeneratedScript({
    scriptStore: store,
    channelId: slug,
    templateId: docTemplateId || null,
    templateVersion: process.env.PIPELINE_TEMPLATE_VERSION || null,
    kind: 'doc',
    title: script.title,
    script: {
      hook: script.title,
      intro: script.intro,
      points: (script.chapters || []).map((c) => ({ title: c.title, line: c.text })),
      closing: script.outro,
      thumbHeadline: script.title,
    },
    // P5 round 1 (live MR pilot): the doc generation path does not track
    // per-claim sources — record that HONESTLY as empty arrays (the schema
    // allows it; sources added at review time) instead of letting an undefined
    // field crash the save. The /review desk's flagged-claims panel surfaces
    // required-sources docs as unsourced until the owner attaches sources.
    sources: [],
    claims: [],
    seed: longSeed?.title || null,
    themes: theme || null,
    publishAt: nextFutureSlotISO([b.longSlot], { now: new Date() }),
    slotDate: process.env.REVIEW_SCRIPT_SLOT_DATE || today(),
    slotIdx: 0,
    jobId: process.env.PIPELINE_JOB_ID || null,
  });
  if (saved.ok) console.log(`[review] doc script saved awaiting_review (${saved.id}) — nothing renders until an owner approves at Studio > Review`);
  else console.log(`[review] WARN doc script not saved (${saved.error}) — the slot retries on the next run`);
  if (longSeed) {
    const stG = loadState();
    stG[slug] = { ...(stG[slug] || {}), usedLongSeeds: [...(stG[slug]?.usedLongSeeds || []), longSeed.title].slice(-40) };
    saveChannelState(slug, stG[slug]);
  }
  console.log(`[review] generate-only done: doc script ${saved.ok ? 'saved awaiting_review' : 'NOT saved'}, 0 renders, 0 uploads — approve at Studio > Review to resume at render`);
  process.exit(0);
}

await renderAndShipEpisode(script, { yt, auth, intents, longSeed, docTemplateId });
