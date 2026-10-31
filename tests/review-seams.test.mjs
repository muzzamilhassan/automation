import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// #106 Phase 4 T5b (S4) — the LANE-side review seams: generate-only save,
// resume-from-STORED-input lookup, the video_id write-back (D14), and the
// thumbnail candidates (D18/AC-P4-23). Plus THE PIPELINE THREADING PIN: the
// T2-style env the gate passes the child lanes (REVIEW_GENERATE_ONLY,
// REVIEW_SCRIPT_SLOT_DATE, PIPELINE_RESUME_JOB_ID, REVIEW_THUMB_CANDIDATES,
// PIPELINE_JOB_ID) — and that it passes NONE of them with the flags off
// (byte-identical legacy path).
// Spec: docs/superpowers/specs/2026-10-30-phase4-review-queue-analytics-spec.md
// D14/D17/D18; AC-P4-16..23. All seams injected — no live Neon/Blob/YouTube.
// ---------------------------------------------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SLUG = 'quotequarry';
const TODAY = new Date().toISOString().slice(0, 10);

// ---- the seam module -------------------------------------------------------

import {
  flagOn,
  thumbCandidateCount,
  saveGeneratedScript,
  storedInputOf,
  findResumableScript,
  writeBackVideoId,
  emitThumbCandidates,
} from '../lib/review-seams.mjs';

const GENERATED = {
  hook: 'Nobody tells you this about compound interest.',
  points: [
    { title: 'THE LIE', line: 'Banks quote nominal rates because the real number would scare you.' },
    { title: 'THE MATH', line: 'At 7 percent, money doubles every decade — fees quietly make it 14 years.' },
    { title: 'THE HABIT', line: 'Automate the transfer the day the paycheck lands, not the month end.' },
    { title: 'THE PROOF', line: 'Every audited portfolio study says time in market beats timing.' },
  ],
  closing: 'Which rule are you breaking?',
  thumbHeadline: 'THE COMPOUND INTEREST LIE',
};

describe('#106 T5b — flag + config parsing', () => {
  test('flagOn: the established flag vocabulary (1/true), everything else off', () => {
    assert.equal(flagOn('1'), true);
    assert.equal(flagOn('true'), true);
    assert.equal(flagOn('TRUE'), true);
    assert.equal(flagOn('0'), false);
    assert.equal(flagOn(''), false);
    assert.equal(flagOn(undefined), false);
    assert.equal(flagOn(null), false);
  });

  test('AC-P4-23: candidate count comes from the template DATA — truthy = 3, numeric honored, absent = 1', () => {
    assert.equal(thumbCandidateCount({ review_thumb_pick: true }), 3, 'the enabled default is N=3');
    assert.equal(thumbCandidateCount({ review_thumb_pick: 4 }), 4, 'a numeric template count is honored');
    assert.equal(thumbCandidateCount({ review_thumb_pick: 2 }), 2);
    assert.equal(thumbCandidateCount({ review_thumb_pick: false }), 1, 'disabled = today\'s single candidate');
    assert.equal(thumbCandidateCount({}), 1);
    assert.equal(thumbCandidateCount(null), 1);
    assert.equal(thumbCandidateCount(undefined), 1);
    assert.equal(thumbCandidateCount({ review_thumb_pick: 99 }), 6, 'clamped to a sane ceiling');
    assert.equal(thumbCandidateCount({ review_thumb_pick: 0 }), 1, 'zero means disabled, not "zero thumbnails"');
  });
});

describe('#106 T5b — saveGeneratedScript (AC-P4-17: persisted BEFORE any render)', () => {
  function fakeStore() {
    const saved = [];
    return {
      saved,
      async saveScript(fields) { saved.push(fields); return { ok: true, id: 'script-1' }; },
    };
  }

  test('persists the COMPLETE structured render input (hook/points/closing/thumbHeadline + seed/themes/publishAt) as awaiting_review', async () => {
    const store = fakeStore();
    const r = await saveGeneratedScript({
      scriptStore: store, channelId: SLUG, templateId: 'finance-explainers', templateVersion: '1.0.0',
      kind: 'short', title: 'The Compound Interest Lie | Finance Wisdom',
      script: GENERATED, seed: 'wave-title', themes: 'topic directive', publishAt: `${TODAY}T15:00:00Z`,
      slotDate: TODAY, slotIdx: 0, jobId: 'job-1',
    });
    assert.equal(r.ok, true);
    assert.equal(store.saved.length, 1);
    const f = store.saved[0];
    assert.equal(f.channelId, SLUG);
    assert.equal(f.templateId, 'finance-explainers');
    assert.equal(f.templateVersion, '1.0.0');
    assert.equal(f.kind, 'short');
    assert.equal(f.status, 'awaiting_review', 'the generated script holds for the owner (D15)');
    assert.equal(f.jobId, 'job-1');
    assert.equal(f.slotDate, TODAY);
    assert.equal(f.slotIdx, 0);
    assert.equal(f.publishAt, `${TODAY}T15:00:00Z`);
    assert.deepEqual(f.fullRenderInput, {
      hook: GENERATED.hook, points: GENERATED.points, closing: GENERATED.closing,
      thumbHeadline: GENERATED.thumbHeadline, seed: 'wave-title', themes: 'topic directive',
      publishAt: `${TODAY}T15:00:00Z`,
    }, 'the resume renders from THIS object — it must be the complete input');
    assert.ok(f.text.includes(GENERATED.hook) && f.text.includes(GENERATED.closing), 'text carries the full script');
  });

  test('a BLOCKED/unusable script is never saved: no store call without a real script shape', async () => {
    const store = fakeStore();
    const r = await saveGeneratedScript({
      scriptStore: store, channelId: SLUG, script: { hook: '', points: [], closing: 'x' },
    });
    assert.equal(r.ok, false, 'a corrupt generation must never persist as awaiting_review');
    assert.equal(store.saved.length, 0, 'nothing was written');
    const r2 = await saveGeneratedScript({ scriptStore: null, channelId: SLUG, script: GENERATED });
    assert.equal(r2.ok, false, 'no store = no save (the gate re-holds; never a crash)');
  });

  test('saveScript is transactional (D14): a store refusal surfaces as { ok:false } — the lane continues', async () => {
    const store = { async saveScript() { return { ok: false, error: 'constraint' }; } };
    const r = await saveGeneratedScript({ scriptStore: store, channelId: SLUG, script: GENERATED });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'constraint');
  });
});

describe('#106 T5b — storedInputOf (the resume consumes the STORED JSON)', () => {
  test('accepts the jsonb object shape and the JSON-string shape; rejects unusable rows', () => {
    const input = { hook: 'h', points: [{ title: 'T', line: 'l' }], closing: 'c', thumbHeadline: 'H', seed: 's', themes: 't', publishAt: 'p' };
    assert.deepEqual(storedInputOf({ id: 'x', full_render_input: input }), input, 'object (pg jsonb) parses');
    assert.deepEqual(storedInputOf({ id: 'x', full_render_input: JSON.stringify(input) }), input, 'string form parses');
    assert.equal(storedInputOf({ id: 'x', full_render_input: '{broken' }), null, 'corrupt JSON = no usable input');
    assert.equal(storedInputOf({ id: 'x', full_render_input: { hook: '', points: [] } }), null, 'no hook/points = no usable input');
    assert.equal(storedInputOf({ id: 'x', full_render_input: { hook: 'h', points: [{ line: '' }] } }), null, 'empty points are unusable');
    assert.equal(storedInputOf(null), null);
    assert.equal(storedInputOf({}), null);
  });
});

describe('#106 T5b — findResumableScript (the approval lookup)', () => {
  const APPROVED_ROW = { id: 's1', status: 'approved', channel_id: SLUG, job_id: 'j1', kind: 'short', full_render_input: GENERATED };

  test('prefers latestApprovedForJob — a job with several slots must resume THE APPROVED one', async () => {
    const calls = [];
    const store = {
      async latestApprovedForJob(jobId) { calls.push('latestApprovedForJob'); return { ok: true, script: APPROVED_ROW }; },
      async latestApproved() { calls.push('latestApproved'); return { ok: true, script: null }; },
    };
    const r = await findResumableScript({ scriptStore: store, jobId: 'j1', channelId: SLUG });
    assert.equal(r.ok, true);
    assert.equal(r.via, 'job');
    assert.deepEqual(calls, ['latestApprovedForJob'], 'the channel fallback never runs when the job hits');
  });

  test('a store WITHOUT latestApprovedForJob (legacy row) falls back to latestForJob status-checked, then the channel lookup', async () => {
    const store = {
      async latestForJob(jobId) { return { ok: true, script: APPROVED_ROW }; },
      async latestApproved() { return { ok: true, script: null }; },
    };
    const r = await findResumableScript({ scriptStore: store, jobId: 'j1', channelId: SLUG });
    assert.equal(r.via, 'job');
    // an awaiting row under the job is NOT resumable — the channel fallback decides
    const store2 = {
      async latestForJob() { return { ok: true, script: { ...APPROVED_ROW, status: 'awaiting_review' } }; },
      async latestApproved() { return { ok: true, script: { ...APPROVED_ROW, id: 's2' } }; },
    };
    const r2 = await findResumableScript({ scriptStore: store2, jobId: 'j1', channelId: SLUG });
    assert.equal(r2.via, 'channel', 'an unapproved job row never satisfies a resume');
    assert.equal(r2.script.id, 's2');
  });

  test('nothing approved anywhere -> { ok:true, script:null } (nothing to render); store ERROR -> { ok:false } (fail-closed)', async () => {
    const empty = { async latestApproved() { return { ok: true, script: null }; } };
    assert.deepEqual((await findResumableScript({ scriptStore: empty, jobId: 'j1', channelId: SLUG })).script, null);
    const dead = { async latestApproved() { return { ok: false, error: 'db down' }; } };
    const r = await findResumableScript({ scriptStore: dead, jobId: 'j1', channelId: SLUG });
    assert.equal(r.ok, false, 'a store read error must read as "cannot prove the approval" — never as "generate fresh"');
  });
});

describe('#106 T5b — writeBackVideoId (D14 SEAM 3: the upload sites hold videoId + job)', () => {
  test('marks the job-linked approved script consumed with the videoId', async () => {
    const row = { id: 's1', status: 'approved', kind: 'short', channel_id: SLUG };
    const calls = [];
    const store = {
      async latestForJob(jobId) { calls.push(['latestForJob', jobId]); return { ok: true, script: row }; },
      async markConsumed(id, videoId) { calls.push(['markConsumed', id, videoId]); return { ok: true, id }; },
    };
    const logs = [];
    const r = await writeBackVideoId({ scriptStore: store, channelId: SLUG, jobId: 'j1', kind: 'short', videoId: 'vid1', log: (m) => logs.push(m) });
    assert.equal(r.ok, true);
    assert.equal(r.consumed, true);
    assert.deepEqual(calls, [['latestForJob', 'j1'], ['markConsumed', 's1', 'vid1']]);
    assert.equal(logs.length, 1, 'one visible line when the record retires');
  });

  test('no job linkage -> the channel+latest-approved fallback; never cross-kind', async () => {
    const shortsRow = { id: 's-short', status: 'approved', kind: 'short' };
    const store = {
      async latestApproved() { return { ok: true, script: shortsRow }; },
      async markConsumed() { return { ok: true, id: 's-short' }; },
    };
    const rShort = await writeBackVideoId({ scriptStore: store, channelId: SLUG, jobId: null, kind: 'short', videoId: 'v1' });
    assert.equal(rShort.consumed, true);
    const rDoc = await writeBackVideoId({ scriptStore: store, channelId: SLUG, jobId: null, kind: 'doc', videoId: 'v2' });
    assert.equal(rDoc.consumed, false, 'a doc upload must never stamp a SHORT script row (and vice versa)');
  });

  test('fail-soft everywhere: null store, no rows, consumed-already, store throw — never a crash, silent when a legacy lane has no rows', async () => {
    const logs = [];
    assert.equal((await writeBackVideoId({ scriptStore: null, channelId: SLUG, jobId: null, kind: 'short', videoId: 'v', log: (m) => logs.push(m) })).ok, true);
    const empty = { async latestApproved() { return { ok: true, script: null }; } };
    const rEmpty = await writeBackVideoId({ scriptStore: empty, channelId: SLUG, jobId: null, kind: 'short', videoId: 'v', log: (m) => logs.push(m) });
    assert.equal(rEmpty.consumed, false);
    assert.equal(logs.length, 0, 'the non-gated legacy path stays SILENT (byte-identical log)');
    const consumed = { async latestApproved() { return { ok: true, script: { id: 's', status: 'consumed', kind: 'short' } }; } };
    assert.equal((await writeBackVideoId({ scriptStore: consumed, channelId: SLUG, jobId: null, kind: 'short', videoId: 'v' })).consumed, false);
    const boom = { async latestApproved() { throw new Error('db down'); } };
    assert.equal((await writeBackVideoId({ scriptStore: boom, channelId: SLUG, jobId: null, kind: 'short', videoId: 'v' })).ok, true, 'a dead store never fails an upload that already succeeded');
  });
});

describe('#106 T5b — emitThumbCandidates (D18/AC-P4-23)', () => {
  function fakeArtifacts() {
    const puts = [];
    return {
      puts,
      async putBytes(kind, bytes, meta) { puts.push({ kind, size: bytes.length, contentType: meta?.contentType }); return { ok: true, hash: `h${puts.length}`, blob_url: `https://blob/h${puts.length}` }; },
    };
  }

  test('N rendered variants land as thumb_candidate artifacts + job index rows + the script meta the /review page reads', async () => {
    const artifacts = fakeArtifacts();
    const indexed = [];
    const jobs = { async indexArtifact(jobId, o) { indexed.push({ jobId, ...o }); } };
    const metas = [];
    const scriptStore = { async recordThumbCandidates(id, cands) { metas.push([id, cands]); return { ok: true, id }; } };
    const thumbs = [Buffer.from('a'), Buffer.from('bb'), Buffer.from('ccc')];
    const r = await emitThumbCandidates({ thumbs, artifacts, jobs, jobId: 'j1', step: 'post', scriptStore, scriptId: 's1' });
    assert.equal(r.candidates.length, 3);
    assert.deepEqual(r.candidates.map((c) => c.idx), [1, 2, 3], 'candidate 1 is the auto-set default (M7)');
    assert.deepEqual(artifacts.puts.map((p) => p.kind), ['thumb_candidate', 'thumb_candidate', 'thumb_candidate']);
    assert.equal(indexed.length, 3);
    assert.equal(indexed[0].kind, 'thumb_candidate');
    assert.deepEqual(metas[0], ['s1', [{ idx: 1, url: 'https://blob/h1' }, { idx: 2, url: 'https://blob/h2' }, { idx: 3, url: 'https://blob/h3' }]],
      'meta.thumb_candidates [{idx,url}] — the exact shape /api/review GET?id= serves and /review renders');
  });

  test('fail-soft: one degraded candidate never blocks the render; no script row = artifact-index only', async () => {
    const artifacts = {
      async putBytes(kind, bytes) { return bytes.length === 1 ? { ok: false, error: 'blob down' } : { ok: true, hash: 'h', blob_url: 'u' }; },
    };
    const r = await emitThumbCandidates({ thumbs: [Buffer.from('a'), Buffer.from('bb')], artifacts, jobs: null, scriptStore: null, scriptId: null });
    assert.equal(r.candidates.length, 1, 'the surviving candidate is recorded; the degraded one is index-lost (fail-open)');
    const none = await emitThumbCandidates({ thumbs: [], artifacts: fakeArtifacts() });
    assert.deepEqual(none.candidates, []);
  });
});

// ---------------------------------------------------------------------------
// THE PIPELINE THREADING (spawn-style — the house harness shape)
// ---------------------------------------------------------------------------

const SPY_GATE = [
  "import { appendFileSync } from 'node:fs';",
  'const LOG = process.env.PIPELINE_SPY_LOG;',
  "function rec(fn, args) { try { appendFileSync(LOG, JSON.stringify({ mod: 'gate', fn, args }) + '\\n'); } catch {} }",
  'export async function evaluateReviewGate(opts = {}) {',
  "  rec('evaluateReviewGate', { slug: opts.slug, slotDate: opts.slotDate, resumeJobId: opts.resumeJobId ?? null });",
  '  return JSON.parse(process.env.PIPELINE_GATE_VERDICT || \'{"ok":false,"error":"no_verdict"}\');',
  '}',
  'export async function sweepReviewTimeouts() { return { ok: true, timedOut: 0, scripts: [] }; }',
  'export default evaluateReviewGate;',
].join('\n');

const SPY_SCRIPTSTORE = [
  "import { appendFileSync } from 'node:fs';",
  'const LOG = process.env.PIPELINE_SPY_LOG;',
  "function rec(fn, args) { try { appendFileSync(LOG, JSON.stringify({ mod: 'scriptstore', fn, args }) + '\\n'); } catch {} }",
  'export async function getScriptStore() { rec(\'getScriptStore\', {}); return null; }',
  'export default getScriptStore;',
].join('\n');

// Minimal job/warnings/artifact spies (the pipeline-jobstore.test.mjs shape):
// the pipeline's OWN lib imports must resolve to spies, or the REAL store
// constructors throw without DATABASE_URL and jobCtl degrades to null — the
// exact degradation these tests are NOT about.
const SPY_JOBSTORE = [
  "import { appendFileSync } from 'node:fs';",
  "import { randomUUID } from 'node:crypto';",
  'const LOG = process.env.PIPELINE_SPY_LOG;',
  "function rec(fn, args, res) { try { appendFileSync(LOG, JSON.stringify({ mod: 'jobs', fn, args, res }) + '\\n'); } catch {} }",
  'let n = 0;',
  'const store = {',
  "  async startJob(o = {}) { const id = 'spy-' + (++n) + '-' + randomUUID().slice(0, 8); rec('startJob', o, { ok: true, id }); return { ok: true, id }; },",
  "  async recordStep(jobId, idx, name, o = {}) { rec('recordStep', { jobId, idx, name, status: o.status || 'pending' }, { ok: true }); return { ok: true }; },",
  "  async startStep(jobId, idx) { rec('startStep', { jobId, idx }, { ok: true }); return { ok: true }; },",
  "  async finishStep(jobId, idx, o = {}) { rec('finishStep', { jobId, idx, status: o.status, error: o.error }, { ok: true }); return { ok: true }; },",
  "  async indexArtifact(jobId, o = {}) { rec('indexArtifact', { jobId, step: o.step, kind: o.kind, contentHash: o.contentHash, blobUrl: o.blobUrl, meta: o.meta }, { ok: true }); return { ok: true }; },",
  "  async finishJob(jobId, o = {}) { rec('finishJob', { jobId, status: o.status, error: o.error }, { ok: true }); return { ok: true }; },",
  "  async getJob() { return { ok: true, job: null, steps: [], artifacts: [] }; },",
  "  async latestResumableJob() { return { ok: true, job: null, steps: [], artifacts: [] }; },",
  '};',
  "export async function getJobStore() { rec('getJobStore', {}, { ok: true }); return store; }",
  'export default getJobStore;',
].join('\n');

const SPY_WARNINGS = [
  "import { appendFileSync } from 'node:fs';",
  'const LOG = process.env.PIPELINE_SPY_LOG;',
  "function rec(fn, args) { try { appendFileSync(LOG, JSON.stringify({ mod: 'warnings', fn, args }) + '\\n'); } catch {} }",
  'const store = {',
  "  async openBlockingFor() { rec('openBlockingFor', {}, { count: 0 }); return { ok: true, rows: [] }; },",
  "  async openWarning(fields) { rec('openWarning', fields, { ok: true, deduped: false }); return { ok: true, id: 1, deduped: false }; },",
  '};',
  "export async function getDefaultWarningsStore() { rec('getDefaultWarningsStore', {}, { ok: true }); return store; }",
  "export { emitWarning, SEVERITIES, PUBLISHING_PATH_CODES } from " + JSON.stringify(pathToFileURL(path.join(ROOT, 'lib', 'warnings-store.mjs')).href) + ';',
  'export default store;',
].join('\n');

const SPY_PROBE = [
  "import { appendFileSync } from 'node:fs';",
  'const LOG = process.env.PIPELINE_SPY_LOG;',
  "function rec(fn, args) { try { appendFileSync(LOG, JSON.stringify({ mod: 'probe', fn, args }) + '\\n'); } catch {} }",
  'export async function probeParkedChannels(o = {}) { rec(\'probeParkedChannels\', { channelId: o.channelId }, { ok: true }); return { ok: true, openBlocking: 0, checked: 0, results: [] }; }',
  'export function tokenForChannel() { return null; }',
].join('\n');

const SPY_ARTIFACTS = [
  "import { appendFileSync } from 'node:fs';",
  'const LOG = process.env.PIPELINE_SPY_LOG;',
  "function rec(fn, args) { try { appendFileSync(LOG, JSON.stringify({ mod: 'artifacts', fn, args }) + '\\n'); } catch {} }",
  'export function makeArtifactStore() {',
  '  return {',
  "    async putBytes(kind, bytes) { rec('putBytes', { kind, size: bytes.length }, { ok: true }); return { ok: true, hash: 'a'.repeat(64), blob_url: null, degraded: true }; },",
  '    async getBytes() { return { ok: false, error: "blob_unavailable" }; },',
  '  };',
  '}',
  'export default makeArtifactStore;',
].join('\n');

// The pipeline spy redirects lib imports for PIPELINE-parented imports only —
// so the pipeline's OWN gate/store calls are spied while the fake child lane
// (a plain script below) runs real code.
function loaderSource(pipelineHref, redirects) {
  return [
    "import { registerHooks } from 'node:module';",
    'const PIPELINE = ' + JSON.stringify(pipelineHref) + ';',
    'const REDIRECTS = ' + JSON.stringify(redirects) + ';',
    'registerHooks({',
    '  resolve(specifier, context, nextResolve) {',
    '    const res = nextResolve(specifier, context);',
    '    if (context && context.parentURL === PIPELINE && res && res.url) {',
    "      const m = res.url.match(/\\/lib\\/(job-store|artifact-store|warnings-store|warnings-probe|review-gate|script-store)\\.mjs$/);",
    '      if (m && REDIRECTS[m[1] + \'.mjs\']) return { url: REDIRECTS[m[1] + \'.mjs\'], shortCircuit: true };',
    '    }',
    '    return res;',
    '  },',
    '});',
  ].join('\n');
}

const FAKE_YT_DAILY = [
  "// test double: dumps exactly the T5b env keys it received, then exits 0",
  "import { appendFileSync } from 'node:fs';",
  'const KEYS = ["REVIEW_GENERATE_ONLY", "REVIEW_SCRIPT_SLOT_DATE", "PIPELINE_JOB_ID", "PIPELINE_RESUME_JOB_ID", "REVIEW_THUMB_CANDIDATES", "PIPELINE_TEMPLATE_VERSION"];',
  "appendFileSync(process.env.CHILD_ENV_LOG, JSON.stringify(Object.fromEntries(KEYS.map((k) => [k, process.env[k] ?? null]))) + '\\n');",
  "console.log('[fake-yt-daily] ran with the env above');",
].join('\n');

function readJsonl(p) {
  try {
    return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

function runPipeline({ state = {}, env = {}, args = [] } = {}) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pipe-t5b-'));
  const spyLog = path.join(sandbox, 'spy.jsonl');
  const childEnvLog = path.join(sandbox, 'child-env.jsonl');
  try {
    fs.writeFileSync(path.join(sandbox, 'yt-daily.mjs'), FAKE_YT_DAILY);
    fs.mkdirSync(path.join(sandbox, 'yt-mcp', 'state'), { recursive: true });
    fs.writeFileSync(path.join(sandbox, 'yt-mcp', 'state', SLUG + '.json'), JSON.stringify(state));
    for (const [name, src] of [['spy-gate.mjs', SPY_GATE], ['spy-scriptstore.mjs', SPY_SCRIPTSTORE], ['spy-jobstore.mjs', SPY_JOBSTORE], ['spy-warnings.mjs', SPY_WARNINGS], ['spy-probe.mjs', SPY_PROBE], ['spy-artifacts.mjs', SPY_ARTIFACTS]]) {
      fs.writeFileSync(path.join(sandbox, name), src);
    }
    fs.writeFileSync(path.join(sandbox, 'loader.mjs'), loaderSource(pathToFileURL(path.join(ROOT, 'channel-pipeline.mjs')).href, {
      'review-gate.mjs': pathToFileURL(path.join(sandbox, 'spy-gate.mjs')).href,
      'script-store.mjs': pathToFileURL(path.join(sandbox, 'spy-scriptstore.mjs')).href,
      'job-store.mjs': pathToFileURL(path.join(sandbox, 'spy-jobstore.mjs')).href,
      'warnings-store.mjs': pathToFileURL(path.join(sandbox, 'spy-warnings.mjs')).href,
      'warnings-probe.mjs': pathToFileURL(path.join(sandbox, 'spy-probe.mjs')).href,
      'artifact-store.mjs': pathToFileURL(path.join(sandbox, 'spy-artifacts.mjs')).href,
    }));
    const r = spawnSync(process.execPath, ['--import', pathToFileURL(path.join(sandbox, 'loader.mjs')).href, path.join(ROOT, 'channel-pipeline.mjs'), SLUG, ...args], {
      cwd: sandbox,
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        PIPELINE_SPY_LOG: spyLog,
        CHILD_ENV_LOG: childEnvLog,
        ...env,
      },
      encoding: 'utf8',
      timeout: 120000,
    });
    return { status: r.status, stdout: r.stdout || '', spy: readJsonl(spyLog), childEnv: readJsonl(childEnvLog), sandbox };
  } finally {
    try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch { }
  }
}

const GATE_HOLD_NO_SCRIPT = JSON.stringify({
  ok: true, action: 'hold', reason: 'no_approved_script',
  gating: { state: 'gated', familyId: 'finance-explainers', reviewRequired: ['finance'] }, script: null,
});
const GATE_RUN = (familyId = 'finance-explainers') => JSON.stringify({
  ok: true, action: 'run', reason: 'review_required_empty',
  gating: { state: 'ungated', familyId, reviewRequired: [] }, script: null,
});

describe('#106 T5b — the pipeline threads the gate verdict to the child lanes (spawn-style)', () => {
  test('SEAM 1: gate hold no_approved_script -> the child runs GENERATE-ONLY (REVIEW_GENERATE_ONLY=1 + slot date + job id), exit 0, held terminal', () => {
    const r = runPipeline({
      env: { JOB_STORE_ENABLED: '1', REVIEW_QUEUE_ENABLED: '1', PIPELINE_GATE_VERDICT: GATE_HOLD_NO_SCRIPT },
    });
    assert.equal(r.status, 0, 'the held run still exits 0');
    assert.equal(r.childEnv.length, 1, 'the child lane ran exactly once');
    const env = r.childEnv[0];
    assert.equal(env.REVIEW_GENERATE_ONLY, '1', 'the T2-style generate-only flag travels ONLY on this hold');
    assert.equal(env.REVIEW_SCRIPT_SLOT_DATE, TODAY);
    assert.ok(env.PIPELINE_JOB_ID && String(env.PIPELINE_JOB_ID).startsWith('spy-'), 'PIPELINE_JOB_ID lands on the child (T3 intents + T5b scripts link to the job)');
    assert.equal(env.PIPELINE_RESUME_JOB_ID, null, 'no resume env on a fresh generate-only run');
    const held = r.spy.find((c) => c.mod === 'jobs' && c.fn === 'finishJob');
    assert.ok(held, 'the job closes');
    assert.equal(held.args.status, 'held', 'the held terminal stands');
    assert.match(String(held.args.error || ''), /generated/, 'the terminal records the generated-awaiting-review outcome');
    assert.ok(r.spy.some((c) => c.mod === 'gate' && c.fn === 'evaluateReviewGate'), 'the gate was evaluated');
  });

  test('SEAM 1 resume: gate approved_resumed with --resume <id> -> the child receives PIPELINE_RESUME_JOB_ID (not generate-only)', () => {
    const r = runPipeline({
      args: ['--resume', 'held-job-9'],
      env: {
        JOB_STORE_ENABLED: '1', REVIEW_QUEUE_ENABLED: '1',
        PIPELINE_GATE_VERDICT: JSON.stringify({
          ok: true, action: 'run', reason: 'approved_resumed',
          gating: { state: 'gated', familyId: 'finance-explainers', reviewRequired: ['finance'] },
          script: { id: 's1', status: 'approved' },
        }),
      },
    });
    assert.equal(r.status, 0);
    assert.equal(r.childEnv.length, 1);
    const env = r.childEnv[0];
    assert.equal(env.PIPELINE_RESUME_JOB_ID, 'held-job-9', 'the held job id reaches the child so it renders from the STORED input');
    assert.equal(env.REVIEW_GENERATE_ONLY, null, 'a resumed run NEVER regenerates');
    const gateCall = r.spy.find((c) => c.mod === 'gate' && c.fn === 'evaluateReviewGate');
    assert.equal(gateCall.args.resumeJobId, 'held-job-9', 'the gate resolves the approval by the held job id');
  });

  test('SEAM 2: the gate\'s template meta review_thumb_pick=true -> REVIEW_THUMB_CANDIDATES=3 on the child', () => {
    const r = runPipeline({
      env: { JOB_STORE_ENABLED: '1', REVIEW_QUEUE_ENABLED: '1', PIPELINE_GATE_VERDICT: GATE_RUN('finance-explainers') },
    });
    assert.equal(r.status, 0);
    assert.equal(r.childEnv.length, 1);
    assert.equal(r.childEnv[0].REVIEW_THUMB_CANDIDATES, '3', 'the count comes from the template DATA (OQ-4: review-gated templates ON)');
    assert.equal(r.childEnv[0].REVIEW_GENERATE_ONLY, null);
  });

  test('SEAM 2 negative: an assigned template WITHOUT review_thumb_pick -> no candidates env (single-candidate behavior unchanged)', () => {
    const r = runPipeline({
      env: { JOB_STORE_ENABLED: '1', REVIEW_QUEUE_ENABLED: '1', PIPELINE_GATE_VERDICT: GATE_RUN('documentary-frames') },
    });
    assert.equal(r.status, 0);
    assert.equal(r.childEnv[0].REVIEW_THUMB_CANDIDATES, null, 'WHERE picking is not enabled, today\'s single candidate continues');
  });

  test('FLAG PIN: REVIEW_QUEUE_ENABLED unset -> the child receives NONE of the review env (byte-identical legacy lane)', () => {
    const r = runPipeline({ env: {} });
    assert.equal(r.status, 0);
    assert.equal(r.childEnv.length, 1, 'the normal production lane ran');
    const env = r.childEnv[0];
    for (const k of ['REVIEW_GENERATE_ONLY', 'REVIEW_SCRIPT_SLOT_DATE', 'PIPELINE_JOB_ID', 'PIPELINE_RESUME_JOB_ID', 'REVIEW_THUMB_CANDIDATES']) {
      assert.equal(env[k], null, `${k} must be absent with the flags off`);
    }
    assert.ok(!r.spy.some((c) => c.mod === 'gate'), 'no gate evaluation at all');
  });
});

// ---------------------------------------------------------------------------
// THE RESUME PIN (AC-P4-4/D4, T5b SEAM 1): spawn the REAL yt-daily.mjs with a
// module-loader hook that spies the TWO seams a resumed run may touch — the
// script engine and the script store. PASS = the render call's input EQUALS
// the stored full_render_input and the generator was NEVER called.
// ---------------------------------------------------------------------------

const STORED_INPUT = {
  hook: 'Stored hook — this exact text must render.',
  points: [
    { title: 'ONE', line: 'Stored point one line.' },
    { title: 'TWO', line: 'Stored point two line.' },
    { title: 'THREE', line: 'Stored point three line.' },
    { title: 'FOUR', line: 'Stored point four line.' },
  ],
  closing: 'Stored closing.',
  thumbHeadline: 'STORED HEADLINE',
  seed: 'stored-seed',
  themes: 'stored topic directive',
  publishAt: '2026-10-31T15:00:00Z',
};

const SPY_ENGINE = [
  "import { appendFileSync } from 'node:fs';",
  'const LOG = process.env.PIPELINE_SPY_LOG;',
  "function rec(fn, args) { try { appendFileSync(LOG, JSON.stringify({ mod: 'engine', fn, args }) + '\\n'); } catch {} }",
  'export async function generateYouTubeScript() {',
  "  rec('generateYouTubeScript', {});",
  "  throw new Error('GENERATION FORBIDDEN ON A RESUMED RUN');",
  '}',
  'export async function renderYouTubeScriptShort(page, script, music, opts = {}) {',
  "  rec('renderYouTubeScriptShort', { script, opts });",
  '  const buf = Buffer.from("fake-mp4-bytes");',
  '  return { buffer: buf, thumb: buf, thumbs: [buf, buf, buf], meta: { title: "T | A", description: "d", tags: [] }, duration: 40 };',
  '}',
  'export function buildScriptMeta() { return { title: "T | A", description: "d", tags: [] }; }',
  'export async function resolveTemplateId() { return null; }',
  'export default renderYouTubeScriptShort;',
].join('\n');

// the music engine downloads catalog mp3s — a unit test is network-free, so it
// resolves to a null-picker (music null = the resume renders without a bed)
const SPY_MUSIC = [
  'export async function pickApprovedTrack() { return null; }',
  'export async function pickMusicTrack() { return null; }',
].join('\n');

const SPY_CHILD_STORE = [
  "import { appendFileSync } from 'node:fs';",
  'const LOG = process.env.PIPELINE_SPY_LOG;',
  "function rec(fn, args) { try { appendFileSync(LOG, JSON.stringify({ mod: 'childstore', fn, args }) + '\\n'); } catch {} }",
  'const ROW = {',
  "  id: 'script-approved-1', status: 'approved', channel_id: 'quotequarry', job_id: 'held-job-1',",
  "  kind: 'short', slot_idx: 0, slot_date: '2026-10-31', title: 'Stored script',",
  '  full_render_input: JSON.parse(process.env.T5B_STORED_INPUT_JSON),',
  '};',
  'const store = {',
  "  async latestApprovedForJob(jobId) { rec('latestApprovedForJob', { jobId }); return { ok: true, script: jobId === 'held-job-1' ? ROW : null }; },",
  "  async latestApproved() { rec('latestApproved', {}); return { ok: true, script: null }; },",
  "  async markConsumed(id, videoId) { rec('markConsumed', { id, videoId }); return { ok: true, id }; },",
  '};',
  'export async function getScriptStore() { rec(\'getScriptStore\', {}); return store; }',
  'export default getScriptStore;',
].join('\n');

function childLoaderSource(sandboxHref) {
  return [
    "import { registerHooks } from 'node:module';",
    'const SANDBOX = ' + JSON.stringify(sandboxHref) + ';',
    'const REDIRECTS = {',
    '  "youtube-engine.mjs": SANDBOX + "/spy-engine.mjs",',
    '  "script-store.mjs": SANDBOX + "/spy-store.mjs",',
    '  "music-engine.mjs": SANDBOX + "/spy-music.mjs",',
    '};',
    'registerHooks({',
    '  resolve(specifier, context, nextResolve) {',
    '    const res = nextResolve(specifier, context);',
    '    if (res && res.url && /\\/yt-daily\\.mjs$/.test(String(context && context.parentURL || ""))) {',
    '      const base = res.url.split("/").pop();',
    '      if (REDIRECTS[base]) return { url: REDIRECTS[base], shortCircuit: true };',
    '    }',
    '    return res;',
    '  },',
    '});',
  ].join('\n');
}

function runYtDailyResume() {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 't5b-daily-'));
  const spyLog = path.join(sandbox, 'spy.jsonl');
  try {
    // the REAL repo junctioned in — relative imports resolve in the real tree;
    // the scratch run dir (cwd) holds the state fixture and the run outputs
    const runDir = path.join(sandbox, 'run');
    fs.mkdirSync(runDir, { recursive: true });
    fs.symlinkSync(ROOT, path.join(sandbox, 'repo'), 'junction');
    fs.mkdirSync(path.join(runDir, 'yt-mcp', 'state'), { recursive: true });
    fs.writeFileSync(path.join(runDir, 'yt-mcp', 'state', SLUG + '.json'), JSON.stringify({}));
    fs.writeFileSync(path.join(sandbox, 'spy-engine.mjs'), SPY_ENGINE);
    fs.writeFileSync(path.join(sandbox, 'spy-store.mjs'), SPY_CHILD_STORE);
    fs.writeFileSync(path.join(sandbox, 'spy-music.mjs'), SPY_MUSIC);
    const loader = path.join(sandbox, 'loader.mjs');
    fs.writeFileSync(loader, childLoaderSource(pathToFileURL(sandbox).href));
    const r = spawnSync(process.execPath, [path.join(sandbox, 'repo', 'yt-daily.mjs'), SLUG], {
      cwd: runDir,
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        PIPELINE_SPY_LOG: spyLog,
        NODE_OPTIONS: '--import ' + pathToFileURL(loader).href,
        YOUTUBE_CLIENT_ID: 'dummy', YOUTUBE_CLIENT_SECRET: 'dummy',
        YT_TOKEN_QUOTEQUARRY: JSON.stringify({ refresh_token: 'dummy' }),
        PIPELINE_RESUME_JOB_ID: 'held-job-1',
        PIPELINE_JOB_ID: 'spy-job-1',
        REVIEW_THUMB_CANDIDATES: '3',
        T5B_STORED_INPUT_JSON: JSON.stringify(STORED_INPUT),
      },
      encoding: 'utf8',
      timeout: 120000,
    });
    return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', spy: readJsonl(spyLog), sandbox };
  } finally {
    try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch { }
  }
}

describe('#106 T5b — RESUME consumes the STORED input (real yt-daily spawn, engine spied)', () => {
  test('the render input EQUALS the stored full_render_input and the LLM generator is NEVER called (AC-P4-4/D4)', () => {
    const r = runYtDailyResume();
    const gen = r.spy.filter((c) => c.mod === 'engine' && c.fn === 'generateYouTubeScript');
    assert.equal(gen.length, 0, 'a resumed run must NEVER re-generate (the spy also THROWS if it is)');
    const renders = r.spy.filter((c) => c.mod === 'engine' && c.fn === 'renderYouTubeScriptShort');
    assert.equal(renders.length, 1, 'exactly one render of the stored script');
    const { script, opts } = renders[0].args;
    assert.deepEqual(
      { hook: script.hook, points: script.points, closing: script.closing, thumbHeadline: script.thumbHeadline },
      { hook: STORED_INPUT.hook, points: STORED_INPUT.points, closing: STORED_INPUT.closing, thumbHeadline: STORED_INPUT.thumbHeadline },
      'the render input EQUALS the stored JSON — byte-for-byte the approved text',
    );
    assert.deepEqual(opts, { thumbVariants: 3 }, 'the candidate count threads into the render (3 variants when enabled)');
    const lookup = r.spy.find((c) => c.mod === 'childstore' && c.fn === 'latestApprovedForJob');
    assert.ok(lookup, 'the approved script was resolved by the dispatched job id');
    assert.equal(lookup.args.jobId, 'held-job-1');
    const consumed = r.spy.filter((c) => c.mod === 'childstore' && c.fn === 'markConsumed');
    assert.equal(consumed.length, 0, 'the upload never completed (validation gate) — the record STAYS approved, never consumed prematurely');
    assert.equal(r.status, 1, 'the fake render bytes fail upload validation — the refusal is the safe terminal');
    assert.ok(r.stdout.includes('STORED input'), 'the run says it rendered from the STORED input');
  });
});
