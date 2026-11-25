import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// #106 Phase 5 T2e (S-F) — the DOC-LANE threading suite (spec D15, Ruling 3,
// AC-P5-15/16; QA Rows 15/16 automated halves). Three layers:
//   1. PURE — lib/doc-template.mjs: the assigned doc template's story plan
//      (sections + chapter count + word floor, clamped ONTO the immutable
//      validEpisode contract), the foreign-format detector, and the loud
//      skip (one Action-required warning row + one log line, zero production).
//   2. SOURCE PINS — yt-deepdive.mjs threads the RESOLVED template id into
//      registryThresholds + the dedupe descriptor (the gate path — the save
//      path already resolved its own), the section plan into LONG_PROMPT
//      (replacing the hardcoded 8-chapters line ONLY when a plan exists),
//      and skips foreign formats BEFORE any research/generation spend.
//   3. SPAWN — the REAL yt-deepdive.mjs under module-loader redirects (the
//      review-seams harness pattern): an ASSIGNED doc template's generate-only
//      run derives its review class and thresholds from the template DATA and
//      prompts with the template's section plan; a shorts-only assignment
//      skips LOUDLY with zero brain calls; NO assignment is byte-identical
//      (Row 15's flags-off doc twin).
// All seams injected — no live Neon/YouTube.
// ---------------------------------------------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SLUG = 'quotequarry';

// ---- layer 1: the pure helpers ---------------------------------------------

import {
  MIN_EPISODE_CHAPTERS,
  MIN_CHAPTER_WORDS,
  docStoryPlan,
  docStoryPlanLines,
  foreignDocFormat,
  skipForeignDocFormat,
} from '../lib/doc-template.mjs';

// A doc-shaped registry meta block per the D2 example shape (sections[] with
// a chapters:N entry + chapter_min_words).
const DOC_META = {
  version: '1.0.0',
  template_id: 'doc-test-weekly',
  formats: ['long'],
  safety: { required_sources: true, review_required: ['finance'] },
  story_structure: {
    sections: ['cold_open', 'chapters:6', 'exhibits', 'outro'],
    chapter_min_words: 90,
  },
};

describe('P5-T2e — docStoryPlan (the template plan clamps ONTO the episode contract)', () => {
  test('docStoryPlan: sections + chapter count + word floor become the plan (D15)', () => {
    assert.deepEqual(docStoryPlan(DOC_META), {
      sections: ['cold_open', 'chapters:6', 'exhibits', 'outro'],
      chapters: 6,
      chapterMinWords: 90,
    });
  });

  test('docStoryPlan: the plan never dips below the validEpisode contract (>=5 chapters x >=70 words — the validator keeps the floor)', () => {
    assert.equal(MIN_EPISODE_CHAPTERS, 5);
    assert.equal(MIN_CHAPTER_WORDS, 70);
    const low = docStoryPlan({
      formats: ['long'],
      story_structure: { sections: ['cold_open', 'chapters:3', 'outro'], chapter_min_words: 40 },
    });
    assert.equal(low.chapters, 5, 'a template declaring 3 chapters still writes toward a >=5-chapter episode');
    assert.equal(low.chapterMinWords, 70, 'a template declaring a 40-word floor still writes >=70-word chapters');
  });

  test('docStoryPlan: no doc sections (or sections without a chapter count) means NO plan — the hardcoded default stays', () => {
    assert.equal(docStoryPlan(null), null, 'no template at all');
    assert.equal(docStoryPlan({ formats: ['long'] }), null, 'no story_structure block');
    assert.equal(docStoryPlan({ formats: ['long'], story_structure: { beats: ['slot one'] } }), null, 'a shorts-shaped story block is not a doc plan');
    assert.equal(docStoryPlan({ formats: ['long'], story_structure: { sections: ['cold_open', 'exhibits', 'outro'] } }), null, 'no chapters:N entry — no count to write toward');
  });

  test('docStoryPlanLines: renders the section beats + count + floor as ONE directive line', () => {
    const plan = docStoryPlan(DOC_META);
    assert.equal(
      docStoryPlanLines(plan),
      'Episode section plan: cold_open -> exhibits -> outro; exactly 6 chapters. Every chapter text MUST be at least 90 words.',
    );
  });

  test('docStoryPlanLines: no plan renders nothing (the caller keeps the hardcoded line)', () => {
    assert.equal(docStoryPlanLines(null), null);
  });
});

describe('P5-T2e — foreignDocFormat + the loud skip (Row 16)', () => {
  test('foreignDocFormat: a shorts-only assignment is foreign; long formats and unassigned meta are not', () => {
    assert.deepEqual(foreignDocFormat({ formats: ['short'] }), { formats: ['short'] });
    assert.equal(foreignDocFormat({ formats: ['long', 'short'] }), null, 'long-capable templates render docs');
    assert.equal(foreignDocFormat({ formats: ['long'] }), null);
    assert.equal(foreignDocFormat(null), null, 'no assignment = no foreign-format skip (byte-identical lane)');
    assert.equal(foreignDocFormat({}), null, 'missing formats = validator upstream, not this gate');
  });

  test('skipForeignDocFormat: ONE Action-required warning row + ONE log line; never throws', async () => {
    const opened = [];
    const store = { async openWarning(f) { opened.push(f); return { ok: true, id: 42 }; } };
    const alerts = [];
    const lines = [];
    const res = await skipForeignDocFormat({
      slug: 'quotequarry', templateId: 'shorts-only-test', foreign: { formats: ['short'] },
      store, log: (m) => lines.push(m), sendAlert: async (a) => { alerts.push(a); return { channel: 'ntfy', ok: true }; },
    });
    assert.equal(res.ok, true, 'the warning row landed');
    assert.equal(res.id, 42);
    assert.equal(opened.length, 1, 'exactly ONE warning row');
    assert.equal(opened[0].channel_id, 'quotequarry');
    assert.equal(opened[0].severity, 'action_required');
    assert.equal(opened[0].code, 'doc_template_foreign_format');
    assert.equal(opened[0].blocks_publishing, false, 'the skip never parks production (it IS the absence of production)');
    assert.match(opened[0].title, /shorts-only-test/);
    assert.equal(lines.length, 1, 'exactly ONE loud log line');
    assert.match(lines[0], /ACTION REQUIRED/);
    assert.match(lines[0], /shorts-only-test/);
    assert.match(lines[0], /short/);
    assert.equal(alerts.length, 1, 'the write-and-alert emitter fired');
  });

  test('skipForeignDocFormat: no warnings store degrades to log-only (fail-soft, still loud)', async () => {
    const lines = [];
    const res = await skipForeignDocFormat({
      slug: 'quotequarry', templateId: 'shorts-only-test', foreign: { formats: ['short'] },
      store: null, log: (m) => lines.push(m), sendAlert: async () => ({ channel: 'none', ok: false }),
    });
    assert.deepEqual(res, { ok: false, error: 'warnings_store_unavailable' });
    assert.equal(lines.length, 1, 'the loud line prints even with the store dark');
    assert.match(lines[0], /ACTION REQUIRED/);
  });
});

// ---- layer 2: the yt-deepdive threading pins -------------------------------

const src = fs.readFileSync(path.join(ROOT, 'yt-deepdive.mjs'), 'utf8');

describe('P5-T2e — the yt-deepdive threading pins (AC-P5-15)', () => {
  test('the doc GATE threads the assigned template: thresholds + identity + the derived finance signal — no hardcoded nulls left', () => {
    assert.ok(src.includes('const docGate = registryThresholds(templateId);'), 'the gate reads the ASSIGNED template (was registryThresholds(null))');
    assert.equal(src.includes('registryThresholds(null)'), false, 'the permanent null ("when doc templates are assigned, thread the id here") is GONE');
    assert.equal(src.includes('templateId: null,'), false, 'the dedupe descriptor no longer hardcodes the null identity');
    assert.match(src, /kind: 'doc',\r?\n\s+templateId,/, 'the dedupe descriptor carries the resolved identity (D19 brain-gate home)');
    assert.ok(src.includes('financeGated: docGate.financeGated'), 'the review-class derivation feeds the dedupe tiering');
    assert.ok(src.includes('docDedupeChunks'), 'the pooled whole-episode chunker is UNCHANGED (pooled semantics preserved)');
    assert.ok(src.includes("threshold: docGate.variation"), 'thresholds come from the same derived gate');
    assert.ok(src.includes("crossThreshold: docGate.crossChannel"), 'the cross-channel band threads too');
  });

  test('the section plan replaces the hardcoded 8-chapters line ONLY when a plan is assigned — the default stays byte-identical', () => {
    assert.ok(
      src.includes("docPlan ? docStoryPlanLines(docPlan) : 'Exactly 8 chapters. Every chapter text MUST be 120-150 words.'"),
      'the LONG_PROMPT shape directive is the plan when assigned, the exact hardcoded line when not',
    );
    assert.ok(
      src.includes('prompt: LONG_PROMPT(b, theme, docPlan),') && src.includes('write: (p) => llmScript(p, longSeed?.title || theme, docTemplateId),'),
      'the call site passes the plan into the prompt AND the resolved template id into the brain seam',
    );
  });

  test('the foreign-format skip runs at generation start — after the resume branch, BEFORE any research/generation spend', () => {
    const resumeIdx = src.indexOf('if (RESUME_SCRIPT_JOB)');
    const resolveIdx = src.indexOf('const docTemplateId = await resolveTemplateId(slug);');
    const skipIdx = src.indexOf('const foreignDoc = foreignDocFormat(docTemplate);');
    const trendIdx = src.indexOf('researchTrend');
    const genIdx = src.indexOf('await groundedScript(');
    assert.ok(resolveIdx > -1 && skipIdx > -1 && trendIdx > -1 && genIdx > -1, 'all the run-start markers exist');
    assert.ok(resumeIdx > -1 && resumeIdx < resolveIdx, 'the RESUME branch exits first — a resumed run never reads the template (renders the STORED script)');
    assert.ok(skipIdx < trendIdx, 'the loud skip precedes trend research — zero spend on a misassigned channel');
    assert.ok(skipIdx < genIdx, 'the loud skip precedes generation');
    assert.match(src, /skipForeignDocFormat\(\{ slug, templateId: docTemplateId,[\s\S]{0,300}?process\.exit\(0\)/, 'the skip produces nothing and exits the slot');
  });

  test('the validEpisode contract pin re-runs: >=5 chapters x >=70 words unchanged — the template declares the plan, the validator keeps the floor', () => {
    assert.ok(src.includes('p.chapters.length >= 5'), 'the chapter floor is untouched');
    assert.ok(src.includes('.split(/\\s+/).length >= 70'), 'the 70-word chapter floor is untouched');
    assert.ok(src.includes('p.intro && p.outro'), 'cold open + outro stay in the contract');
  });
});

// ---- layer 3: the REAL spawn (module-loader redirects) ----------------------

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const NOT_TODAY_NAME = DAY_NAMES[(new Date().getUTCDay() + 1) % 7];

// validEpisode-shaped (6 chapters — the spy template's declared count)
const T2E_EPISODE = {
  title: 'The Quiet Tax on Every Paycheck',
  intro: 'Cold open sentence one stands alone. Cold open sentence two raises the stakes.',
  chapters: Array.from({ length: 6 }, (_, i) => ({
    title: `CHAPTER ${i + 1}`,
    text: `Chapter ${i + 1} narration delivers the concrete mechanism with numbers and consequences, enough spoken-style words to clear the episode contract floor comfortably. ` +
      'Every chapter carries a tension and closes a payoff so the documentary reads as a story, not a list. '.repeat(2) +
      'The narration stays specific: figures, dates, mistakes, and what they cost the subject of this chapter.',
  })),
  outro: 'Outro sentence one wraps it. Outro sentence two asks for the subscribe.',
};

// The registry DATA spy — the REAL data blocks plus two scratch templates this
// suite assigns. yt-deepdive's REGISTRY_META import is redirected here.
const SPY_REGISTRY_DATA = [
  '// spy: REGISTRY_META for the T2e doc-threading spawn (real data + scratch blocks)',
  'export const REGISTRY_META = {',
  "  'doc-test-weekly': {",
  "    version: '1.0.0', template_id: 'doc-test-weekly',",
  "    niches: ['Human psychology & social dynamics'],",
  "    formats: ['long'],",
  "    renderer: 'remotion',",
  "    required_capabilities: ['script-gen', 'tts', 'captions'],",
  '    variation_threshold: 0.78,',
  '    cross_channel_threshold: 0.84,',
  "    safety: { required_sources: true, review_required: ['finance'] },",
  '    story_structure: { sections: ["cold_open", "chapters:6", "exhibits", "outro"], chapter_min_words: 90 },',
  '    deprecated: false,',
  '  },',
  "  'shorts-only-test': {",
  "    version: '1.0.0', template_id: 'shorts-only-test',",
  "    niches: ['Human psychology & social dynamics'],",
  "    formats: ['short'],",
  "    renderer: 'remotion',",
  "    required_capabilities: ['script-gen'],",
  "    safety: { required_sources: false, review_required: [] },",
  '    deprecated: false,',
  '  },',
  '};',
  'export default REGISTRY_META;',
].join('\n');

// The engine spy — records the FULL prompt + dedupe descriptor (the threading
// evidence), mirrors registryThresholds over the SPY meta (the real one is
// pinned by tests/registry.test.mjs; the spy keeps this harness self-contained
// because youtube-engine.mjs itself is redirected), and resolves the assignment
// from T2E_ASSIGNED_TEMPLATE.
const SPY_ENGINE = [
  "import { appendFileSync } from 'node:fs';",
  "import { REGISTRY_META } from './spy-registry-data.mjs';",
  'const LOG = process.env.PIPELINE_SPY_LOG;',
  "function rec(fn, args) { try { appendFileSync(LOG, JSON.stringify({ mod: 'docengine', fn, args }) + '\\n'); } catch {} }",
  'export function registryThresholds(templateId) {',
  '  const meta = templateId ? REGISTRY_META[templateId] : null;',
  '  const reviewRequired = Array.isArray(meta && meta.safety && meta.safety.review_required) ? meta.safety.review_required : [];',
  '  return {',
  "    variation: typeof (meta && meta.variation_threshold) === 'number' ? meta.variation_threshold : 0.85,",
  "    crossChannel: typeof (meta && meta.cross_channel_threshold) === 'number' ? meta.cross_channel_threshold : 0.90,",
  '    reviewRequired,',
  "    financeGated: reviewRequired.includes('finance'),",
  '  };',
  '}',
  'export async function resolveTemplateId() { return process.env.T2E_ASSIGNED_TEMPLATE || null; }',
  'export function thumbDesignFor(templateId) {',
  '  const meta = templateId ? REGISTRY_META[templateId] : null;',
  '  const td = meta && typeof meta === "object" ? meta.thumb_design : null;',
  '  return td && typeof td === "object" && !Array.isArray(td) ? td : null;',
  '}',
  'export async function callScriptBrain(o = {}) {',
  "  rec('callScriptBrain', { slug: o.slug, prompt: o.prompt, dedupe: o.dedupe ? {",
  "    kind: o.dedupe.kind, templateId: o.dedupe.templateId, threshold: o.dedupe.threshold,",
  "    crossThreshold: o.dedupe.crossThreshold, financeGated: o.dedupe.financeGated,",
  "  } : null });",
  '  return { ok: true, provider: "spy-provider", walk: 1, parsed: JSON.parse(process.env.T2E_EPISODE_JSON) };',
  '}',
  'export async function fetchBrainContext() { return null; }',
  'export function brainContextSection() { return ""; }',
  'export async function renderYouTubeThumbnail() { rec("renderYouTubeThumbnail", {}); throw new Error("RENDER FORBIDDEN IN GENERATE-ONLY"); }',
  'export default callScriptBrain;',
].join('\n');

const SPY_STORE = [
  "import { appendFileSync } from 'node:fs';",
  'const LOG = process.env.PIPELINE_SPY_LOG;',
  "function rec(fn, args) { try { appendFileSync(LOG, JSON.stringify({ mod: 'docstore', fn, args }) + '\\n'); } catch {} }",
  'const store = {',
  '  async saveScript(fields) { rec("saveScript", fields); return { ok: true, id: "doc-script-1" }; },',
  '  async latestApprovedForJob() { return { ok: true, script: null }; },',
  '  async latestApproved() { return { ok: true, script: null }; },',
  '  async markConsumed() { rec("markConsumed", {}); return { ok: true, id: "x" }; },',
  '};',
  "export async function getScriptStore() { rec('getScriptStore', {}); return store; }",
  'export default getScriptStore;',
].join('\n');

const SPY_MUSIC = [
  "import { appendFileSync } from 'node:fs';",
  'const LOG = process.env.PIPELINE_SPY_LOG;',
  "function rec(fn, args) { try { appendFileSync(LOG, JSON.stringify({ mod: 'docmusic', fn, args }) + '\\n'); } catch {} }",
  'export async function pickApprovedTrack() { rec("pickApprovedTrack", {}); return null; }',
  'export async function pickMusicTrack() { rec("pickMusicTrack", {}); return null; }',
].join('\n');

const SPY_TREND = [
  "import { appendFileSync } from 'node:fs';",
  'const LOG = process.env.PIPELINE_SPY_LOG;',
  "function rec(fn, args) { try { appendFileSync(LOG, JSON.stringify({ mod: 'doctrend', fn, args }) + '\\n'); } catch {} }",
  'export async function researchTrend() { rec("researchTrend", {}); return { videos: [{ title: "wave-doc-seed", views: 12345 }], hotKeywords: ["doc", "kw"] }; }',
  'export default researchTrend;',
].join('\n');

const SPY_DUPGATE = [
  "import { appendFileSync } from 'node:fs';",
  'const LOG = process.env.PIPELINE_SPY_LOG;',
  "function rec(fn, args) { try { appendFileSync(LOG, JSON.stringify({ mod: 'docdup', fn, args }) + '\\n'); } catch {} }",
  'export async function recentUploadTitles() { rec("recentUploadTitles", {}); return []; }',
  'export function findDup(title) { rec("findDup", { title }); return null; }',
].join('\n');

const SPY_INTENTS = [
  "import { appendFileSync } from 'node:fs';",
  'const LOG = process.env.PIPELINE_SPY_LOG;',
  "function rec(fn, args) { try { appendFileSync(LOG, JSON.stringify({ mod: 'docintents', fn, args }) + '\\n'); } catch {} }",
  'export async function uploadWithIntent() { rec("uploadWithIntent", {}); throw new Error("UPLOAD FORBIDDEN IN GENERATE-ONLY"); }',
  'export async function getUploadIntentStore() { rec("getUploadIntentStore", {}); return null; }',
  'export async function recoverOpenIntents() { return { outcomes: [] }; }',
  'export function makeFindByTitle() { return async () => null; }',
  'export async function oauthAccessToken() { return "fake-token"; }',
  'export function slotISOOnDate() { return null; }',
  'export default uploadWithIntent;',
].join('\n');

const SPY_GOOGLE = [
  'export const google = {',
  '  auth: { OAuth2: class { setCredentials() {} } },',
  '  youtube() { return { thumbnails: { set: async () => { throw new Error("network disabled in test"); } }, commentThreads: { insert: async () => { throw new Error("network disabled in test"); } } }; },',
  '};',
  'export default google;',
].join('\n');

const SPY_CP = [
  // the spy itself imports the REAL builtin: the loader scopes the
  // node:child_process redirect to yt-deepdive.mjs as the importing parent, so
  // this module resolves the genuine module and forwards everything the lane
  // imports (spawnSync joined with the storybook lane's edge_batch/remotion
  // calls — generate-only children never reach them, the import must exist).
  "import { appendFileSync } from 'node:fs';",
  "import * as real from 'node:child_process';",
  'const LOG = process.env.PIPELINE_SPY_LOG;',
  "function rec(fn, args) { try { appendFileSync(LOG, JSON.stringify({ mod: 'doccp', fn, args }) + '\\n'); } catch {} }",
  'export function execFileSync(cmd, args = [], opts = {}) { rec("execFileSync", { cmd: String(cmd) }); return (opts && opts.encoding) === "utf8" ? "5.0" : ""; }',
  'export const spawnSync = real.spawnSync;',
  'export default { execFileSync, spawnSync };',
].join('\n');

const SPY_CLIPS = [
  "import { appendFileSync } from 'node:fs';",
  'const LOG = process.env.PIPELINE_SPY_LOG;',
  "function rec(fn, args) { try { appendFileSync(LOG, JSON.stringify({ mod: 'docclips', fn, args }) + '\\n'); } catch {} }",
  'export async function getTopicClip() { rec("getTopicClip", {}); return null; }',
  'export default getTopicClip;',
].join('\n');

function readJsonl(p) {
  try {
    return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch { return []; }
}

function runDeepdiveChild({ assigned = null } = {}) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 't2e-deepdive-'));
  const spyLog = path.join(sandbox, 'spy.jsonl');
  try {
    const runDir = path.join(sandbox, 'run');
    fs.mkdirSync(path.join(runDir, 'yt-mcp', 'state'), { recursive: true });
    fs.writeFileSync(path.join(runDir, 'yt-mcp', 'state', SLUG + '.json'), JSON.stringify({}));
    // a non-docDay cadence: GENERATE_ONLY bypasses it (the clips-source reality)
    fs.writeFileSync(path.join(runDir, 'yt-mcp', 'cadence.json'), JSON.stringify({ [SLUG]: { docDays: [NOT_TODAY_NAME] } }));
    fs.mkdirSync(path.join(runDir, 'demos', 'deepdive-' + SLUG), { recursive: true });
    fs.writeFileSync(path.join(runDir, 'demos', 'deepdive-' + SLUG, 'joined.mp4'), Buffer.from('fake-joined-bytes'));
    fs.symlinkSync(ROOT, path.join(sandbox, 'repo'), 'junction');
    const spies = {
      'spy-registry-data.mjs': SPY_REGISTRY_DATA, 'spy-engine.mjs': SPY_ENGINE, 'spy-store.mjs': SPY_STORE,
      'spy-music.mjs': SPY_MUSIC, 'spy-trend.mjs': SPY_TREND, 'spy-dupgate.mjs': SPY_DUPGATE,
      'spy-intents.mjs': SPY_INTENTS, 'spy-google.mjs': SPY_GOOGLE, 'spy-cp.mjs': SPY_CP, 'spy-clips.mjs': SPY_CLIPS,
    };
    for (const [name, out] of Object.entries(spies)) {
      let body = out;
      if (name === 'spy-intents.mjs') {
        // the D8 publishAt recompute is PURE slot math — forward the real one
        body += '\nexport { nextFutureSlotISO } from ' + JSON.stringify(pathToFileURL(path.join(ROOT, 'lib', 'upload-intents.mjs')).href) + ';';
      }
      fs.writeFileSync(path.join(sandbox, name), body);
    }
    const loader = [
      "import { registerHooks } from 'node:module';",
      'const SANDBOX = ' + JSON.stringify(pathToFileURL(sandbox).href) + ';',
      'const REDIRECTS = {',
      '  "youtube-engine.mjs": SANDBOX + "/spy-engine.mjs",',
      '  "template-registry.data.js": SANDBOX + "/spy-registry-data.mjs",',
      '  "script-store.mjs": SANDBOX + "/spy-store.mjs",',
      '  "music-engine.mjs": SANDBOX + "/spy-music.mjs",',
      '  "trend-research.mjs": SANDBOX + "/spy-trend.mjs",',
      '  "dup-gate.mjs": SANDBOX + "/spy-dupgate.mjs",',
      '  "upload-intents.mjs": SANDBOX + "/spy-intents.mjs",',
      '  "googleapis": SANDBOX + "/spy-google.mjs",',
      '  "youtube-clips.mjs": SANDBOX + "/spy-clips.mjs",',
      '};',
      'registerHooks({',
      '  resolve(specifier, context, nextResolve) {',
      '    if (specifier === "node:child_process") {',
'      // scoped to the lane: the spy must itself be able to import the real builtin',
      '      if (/\\/yt-deepdive\\.mjs$/.test(String(context && context.parentURL || ""))) return { url: SANDBOX + "/spy-cp.mjs", shortCircuit: true };',
      '      return nextResolve(specifier, context);',
      '    }',
      '    if (REDIRECTS[specifier]) return { url: REDIRECTS[specifier], shortCircuit: true };',
      '    const res = nextResolve(specifier, context);',
      '    if (res && res.url && /\\/yt-deepdive\\.mjs$/.test(String(context && context.parentURL || ""))) {',
      '      const base = res.url.split("/").pop();',
      '      if (REDIRECTS[base]) return { url: REDIRECTS[base], shortCircuit: true };',
      '    }',
      '    return res;',
      '  },',
      '});',
    ].join('\n');
    const loaderPath = path.join(sandbox, 'loader.mjs');
    fs.writeFileSync(loaderPath, loader);
    const env = {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      PIPELINE_SPY_LOG: spyLog,
      NODE_OPTIONS: '--import ' + pathToFileURL(loaderPath).href,
      YOUTUBE_CLIENT_ID: 'dummy', YOUTUBE_CLIENT_SECRET: 'dummy',
      YT_TOKEN_QUOTEQUARRY: JSON.stringify({ refresh_token: 'dummy' }),
      T2E_EPISODE_JSON: JSON.stringify(T2E_EPISODE),
      FACT_PACK_OFFLINE: '1', REVIEW_GENERATE_ONLY: '1',
      REVIEW_SCRIPT_SLOT_DATE: new Date().toISOString().slice(0, 10),
    };
    if (assigned) env.T2E_ASSIGNED_TEMPLATE = assigned;
    const r = spawnSync(process.execPath, [path.join(sandbox, 'repo', 'yt-deepdive.mjs'), SLUG], {
      cwd: runDir, env, encoding: 'utf8', timeout: 180000,
    });
    let stateAfter = null;
    try { stateAfter = JSON.parse(fs.readFileSync(path.join(runDir, 'yt-mcp', 'state', SLUG + '.json'), 'utf8')); } catch { }
    return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', spy: readJsonl(spyLog), stateAfter };
  } finally {
    try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch { }
  }
}

const brainsOf = (spy) => spy.filter((e) => e.mod === 'docengine' && e.fn === 'callScriptBrain');
const savesOf = (spy) => spy.filter((e) => e.mod === 'docstore' && e.fn === 'saveScript');

describe('P5-T2e — the doc lane spawns (real yt-deepdive.mjs, generate-only)', () => {
  test('ASSIGNED doc template: the brain call carries the template thresholds + identity, the review class derives from the template, and the prompt carries the section plan — the hardcoded 8-chapters line is GONE (AC-P5-15/16)', () => {
    const r = runDeepdiveChild({ assigned: 'doc-test-weekly' });
    assert.equal(r.status, 0, `the run exits clean\nstdout: ${r.stdout.slice(-600)}\nstderr: ${r.stderr.slice(-600)}`);
    const brains = brainsOf(r.spy);
    assert.equal(brains.length, 1, 'the doc generation ran exactly once');
    assert.deepEqual(brains[0].args.dedupe, {
      kind: 'doc',
      templateId: 'doc-test-weekly',
      threshold: 0.78, crossThreshold: 0.84, // the template's OWN declared thresholds (D8 data)
      financeGated: true, // the review class derived from safety.review_required — the generate-only hold's own tiering
    }, 'the dedupe descriptor is the template DATA, not the D8 defaults');
    const prompt = brains[0].args.prompt;
    assert.ok(
      prompt.includes('Episode section plan: cold_open -> exhibits -> outro; exactly 6 chapters. Every chapter text MUST be at least 90 words.'),
      'the template section plan is in the prompt (6 chapters, 90-word floor — not 8 x 120-150)',
    );
    assert.equal(
      prompt.includes('Exactly 8 chapters. Every chapter text MUST be 120-150 words.'), false,
      'the hardcoded shape directive is REPLACED when a doc plan is assigned',
    );
    assert.ok(prompt.includes('"chapters":[{"title":"<=40 chars","text":"120-150 words of spoken-style narration"}]'), 'the immutable JSON contract line stays');
    assert.ok(savesOf(r.spy).length === 1, 'the survivor was still saved awaiting_review (generate-only loop unchanged)');
    assert.equal(r.stateAfter?.deepdiveDate, undefined, 'deepdiveDate never advances on a generate-only run');
  });

  test('FOREIGN format (shorts-only template on a doc channel): ONE Action-required line, ZERO brain calls, zero research, nothing saved (Row 16 loud skip)', () => {
    const r = runDeepdiveChild({ assigned: 'shorts-only-test' });
    assert.equal(r.status, 0, `the slot skips clean (never a failure exit)\nstdout: ${r.stdout.slice(-600)}\nstderr: ${r.stderr.slice(-600)}`);
    const actionLines = r.stdout.split('\n').filter((l) => l.includes('ACTION REQUIRED'));
    assert.equal(actionLines.length, 1, 'exactly ONE Action-required log line');
    assert.match(actionLines[0], /shorts-only-test/);
    assert.match(actionLines[0], /short/, 'the line names the foreign formats');
    assert.equal(brainsOf(r.spy).length, 0, 'nothing was generated from a shorts template structure');
    assert.equal(r.spy.some((e) => e.mod === 'doctrend'), false, 'zero research spend — the skip precedes the topic walk');
    assert.equal(savesOf(r.spy).length, 0, 'nothing saved awaiting_review');
    assert.equal(r.spy.some((e) => e.mod === 'docstore'), false, 'the script store is never even opened');
    assert.equal(r.stateAfter?.deepdiveDate, undefined, 'the slot is not marked produced');
  });

  test('UNASSIGNED: byte-identical — the hardcoded 8-chapters line ends the prompt, D8 default thresholds, null identity, non-finance tiering (Row 15 flags-off doc twin)', () => {
    const r = runDeepdiveChild({ assigned: null });
    assert.equal(r.status, 0, `the run exits clean\nstdout: ${r.stdout.slice(-600)}\nstderr: ${r.stderr.slice(-600)}`);
    const brains = brainsOf(r.spy);
    assert.equal(brains.length, 1, 'the doc generation ran exactly once');
    assert.deepEqual(brains[0].args.dedupe, {
      kind: 'doc', templateId: null, threshold: 0.85, crossThreshold: 0.90, financeGated: false,
    }, 'registryThresholds(null) semantics: D8 defaults, non-finance tiered — exactly today');
    const prompt = brains[0].args.prompt;
    assert.ok(
      prompt.includes('Exactly 8 chapters. Every chapter text MUST be 120-150 words.\n\nFACT RULES'),
      'the committed prompt (byte-identical default directive)',
    );
    assert.equal(prompt.includes('Episode section plan'), false, 'no template plan leaks into the unassigned prompt');
    assert.equal(r.stdout.includes('ACTION REQUIRED'), false, 'no foreign-format noise without an assignment');
    assert.ok(savesOf(r.spy).length === 1, 'the save path is unchanged');
  });
});

// ---- the REAL registry entry (AC-2, red-flags spec 2026-11-03) -------------

import { REGISTRY_META } from '../studio/lib/template-registry.data.js';

describe('red-flags-explained — the real entry\'s doc plan parses to the reference shape', () => {
  const meta = REGISTRY_META['red-flags-explained'];

  test('the entry exists and declares the reference doc plan (10 chapters x >=170 words)', () => {
    assert.ok(meta, 'red-flags-explained is in the registry');
    const plan = docStoryPlan(meta);
    assert.deepEqual(
      { chapters: plan.chapters, chapterMinWords: plan.chapterMinWords },
      { chapters: 10, chapterMinWords: 170 },
      'the reference video is 10 chapters ≈ 12:30 — the plan writes toward that shape'
    );
    assert.deepEqual(plan.sections, ['cold_open', 'chapters:10', 'exhibits', 'outro'], 'sections ride verbatim');
  });

  test('the plan line renders the section order verbatim (no code map)', () => {
    const line = docStoryPlanLines(docStoryPlan(meta));
    assert.equal(
      line,
      'Episode section plan: cold_open -> exhibits -> outro; exactly 10 chapters. Every chapter text MUST be at least 170 words.',
      'the ONE directive line the doc prompt gains'
    );
  });

  test('governance is the finance lane: sources + finance review + the disclaimer', () => {
    assert.equal(meta.safety.review_required.includes('finance'), true, 'finance review class');
    assert.deepEqual(meta.safety.disclaimers, ['Education, not financial advice.'], 'the fixed disclaimer rides at publish');
    assert.equal(meta.review_thumb_pick, true, 'thumb picking ON (3 candidates, candidate 1 ships)');
    assert.ok(meta.thumb_design && meta.thumb_design.layout === 'left-stack', 'the left-stack thumb design is declared');
  });
});
