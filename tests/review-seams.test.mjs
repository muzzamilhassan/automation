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

  test('round 1 minor 7: thumbFrameOffset is pure and candidate 1 keeps the LEGACY +3s frame (the auto-set thumb never moves)', async () => {
    const { thumbFrameOffset } = await import('../youtube-engine.mjs');
    assert.equal(thumbFrameOffset(0), 3, 'candidate 1 = the exact pre-T5b offset');
    assert.equal(thumbFrameOffset(1), 3.5, 'variant 1 staggers +0.5s later');
    assert.equal(thumbFrameOffset(2), 5);
    assert.notEqual(thumbFrameOffset(1), thumbFrameOffset(0), 'variants are genuinely different frames');
  });

  test('round 1 IMPORTANT 2 (source pin): the NORMAL shorts render threads the candidate count — no dead emission, no lying log', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'yt-daily.mjs'), 'utf8');
    assert.match(
      src,
      /renderYouTubeScriptShort\(page, script, music, \{ thumbVariants: THUMB_CANDIDATES \}\)/,
      'the normal slot-body render passes { thumbVariants } or the pipeline\'s candidate log is false',
    );
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

  test('no job linkage -> the channel+latest-approved fallback is SLOT-SCOPED (same day only); never cross-kind', async () => {
    const shortsRow = { id: 's-short', status: 'approved', kind: 'short', slot_date: TODAY, job_id: 'other-job' };
    const store = {
      async latestApproved() { return { ok: true, script: shortsRow }; },
      async markConsumed() { return { ok: true, id: 's-short' }; },
    };
    const rShort = await writeBackVideoId({ scriptStore: store, channelId: SLUG, jobId: null, kind: 'short', videoId: 'v1', slotDate: TODAY });
    assert.equal(rShort.consumed, true, 'same-slot approved script + same-day upload = the legitimate fallback');
    const rDoc = await writeBackVideoId({ scriptStore: store, channelId: SLUG, jobId: null, kind: 'doc', videoId: 'v2', slotDate: TODAY });
    assert.equal(rDoc.consumed, false, 'a doc upload must never stamp a SHORT script row (and vice versa)');
  });

  test('round 1: the fallback NEVER retires an unrelated approved script — A stays shippable when unreviewed B ships (S5 joins stay true)', async () => {
    // interleaving: A approved (held job, slot 2026-10-30) -> its render was
    // validation-refused -> a normal dispatch generates B and uploads it ->
    // the write-back resolves the channel's latest approved = A -> must NOT
    // consume A with B's videoId
    const rowA = { id: 's-A', status: 'approved', kind: 'short', slot_date: '2026-10-30', job_id: 'held-job-A' };
    const consumed = [];
    const store = {
      async latestApproved() { return { ok: true, script: rowA }; },
      async markConsumed(id, videoId) { consumed.push([id, videoId]); return { ok: true, id }; },
    };
    const r = await writeBackVideoId({ scriptStore: store, channelId: SLUG, jobId: 'fresh-job-B', kind: 'short', videoId: 'video-of-B', slotDate: TODAY });
    assert.equal(r.consumed, false, 'A (other day, other job) is unrelated to B\'s upload');
    assert.equal(r.skippedUnrelated, true);
    assert.deepEqual(consumed, [], 'no consumption happened at all');
  });

  test('round 1: the fallback DOES consume a same-job approved row even across days (the resumed run\'s own script)', async () => {
    const rowA = { id: 's-A', status: 'approved', kind: 'short', slot_date: '2026-10-30', job_id: 'fresh-job-B' };
    const store = {
      async latestApproved() { return { ok: true, script: rowA }; },
      async markConsumed(id, videoId) { return { ok: true, id }; },
    };
    const r = await writeBackVideoId({ scriptStore: store, channelId: SLUG, jobId: 'fresh-job-B', kind: 'short', videoId: 'v1', slotDate: TODAY });
    assert.equal(r.consumed, true, 'job-linked rows are precise by construction');
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
    assert.deepEqual(metas[0], ['s1', [
      { idx: 1, url: 'https://blob/h1', hash: 'h1' },
      { idx: 2, url: 'https://blob/h2', hash: 'h2' },
      { idx: 3, url: 'https://blob/h3', hash: 'h3' },
    ]],
      'meta.thumb_candidates [{idx,url,hash}] — the shape /api/review GET?id= serves, /review renders, and the thumb route hash-verifies');
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
  "appendFileSync(process.env.CHILD_ENV_LOG, JSON.stringify(Object.fromEntries([['child', 'daily'], ...KEYS.map((k) => [k, process.env[k] ?? null])])) + '\\n');",
  "console.log('[fake-yt-daily] ran with the env above');",
].join('\n');

function readJsonl(p) {
  try {
    return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

function runPipeline({ state = {}, env = {}, args = [], deepdive = false, cadence = null } = {}) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pipe-t5b-'));
  const spyLog = path.join(sandbox, 'spy.jsonl');
  const childEnvLog = path.join(sandbox, 'child-env.jsonl');
  try {
    fs.writeFileSync(path.join(sandbox, 'yt-daily.mjs'), FAKE_YT_DAILY);
    if (deepdive) fs.writeFileSync(path.join(sandbox, 'yt-deepdive.mjs'), FAKE_YT_DEEPDIVE);
    fs.mkdirSync(path.join(sandbox, 'yt-mcp', 'state'), { recursive: true });
    if (cadence) fs.writeFileSync(path.join(sandbox, 'yt-mcp', 'cadence.json'), JSON.stringify(cadence));
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

  test('round 1 IMPORTANT 1: a SCHEDULED run whose slot lookup finds an APPROVED script threads the stored-script job — the child re-renders it instead of generating fresh', () => {
    const r = runPipeline({
      env: {
        JOB_STORE_ENABLED: '1', REVIEW_QUEUE_ENABLED: '1',
        PIPELINE_GATE_VERDICT: JSON.stringify({
          ok: true, action: 'run', reason: 'approved',
          gating: { state: 'gated', familyId: 'finance-explainers', reviewRequired: ['finance'] },
          script: { id: 's-approved', status: 'approved', job_id: 'held-job-7' },
        }),
      },
    });
    assert.equal(r.status, 0);
    assert.equal(r.childEnv.length, 1);
    assert.equal(r.childEnv[0].PIPELINE_RESUME_JOB_ID, 'held-job-7',
      'no --resume arg — but the approved script\'s job rides to the child so the STORED text ships, never a fresh generation');
    assert.equal(r.childEnv[0].REVIEW_GENERATE_ONLY, null);
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

// ---------------------------------------------------------------------------
// #106 T5c — THE DOC LANE (yt-deepdive) JOINS THE APPROVAL LOOP. Clips-source
// channels (all 4 production channels) keep the skip-exact hold under T5b:
// nothing generates, so the /review desk has NOTHING to approve for them. T5c
// mirrors yt-daily's two branches onto the doc lane:
//   SEAM 1 generate-only — hold no_approved_script spawns yt-deepdive with
//          REVIEW_GENERATE_ONLY: the doc generation runs EXACTLY as today
//          (brain walk + dedupe gates — a blocked script never saves), the
//          survivor persists as awaiting_review (kind 'doc'), then EXIT 0
//          before any TTS/music/render/upload; the seed rotation advances
//          (never deepdiveDate) so nightly holds diversify.
//   SEAM 1 resume — PIPELINE_RESUME_JOB_ID: render the doc from the STORED
//          full_render_input (the generator is structurally unreachable),
//          upload, then markConsumed AFTER videoId. publishAt recomputed per
//          D8; the cadence guards never block a resumed doc run.
// Spec: docs/superpowers/specs/2026-10-30-phase4-review-queue-analytics-spec.md
// ---------------------------------------------------------------------------

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TODAY_NAME = DAY_NAMES[new Date().getUTCDay()];
const NOT_TODAY_NAME = DAY_NAMES[(new Date().getUTCDay() + 1) % 7];

const DOC_EPISODE = {
  title: 'The Borrowed Life Documentary',
  intro: 'Cold open sentence one stands alone. Cold open sentence two raises the stakes.',
  chapters: [
    { title: 'THE MASK', text: 'Chapter one narration, exactly the stored words.' },
    { title: 'THE WAGE', text: 'Chapter two narration, exactly the stored words.' },
    { title: 'THE LEDGER', text: 'Chapter three narration, exactly the stored words.' },
    { title: 'THE CRACK', text: 'Chapter four narration, exactly the stored words.' },
    { title: 'THE TURN', text: 'Chapter five narration, exactly the stored words.' },
    { title: 'THE COST', text: 'Chapter six narration, exactly the stored words.' },
    { title: 'THE REPAIR', text: 'Chapter seven narration, exactly the stored words.' },
    { title: 'THE QUIET', text: 'Chapter eight narration, exactly the stored words.' },
  ],
  outro: 'Outro sentence one wraps it. Outro sentence two asks for the subscribe.',
};

// the exact full_render_input shape the doc lane's generate-only save persists
// (yt-daily's seam shape + the doc's cold-open `intro`)
const STORED_DOC = {
  hook: DOC_EPISODE.title,
  intro: DOC_EPISODE.intro,
  points: DOC_EPISODE.chapters.map((c) => ({ title: c.title, line: c.text })),
  closing: DOC_EPISODE.outro,
  thumbHeadline: DOC_EPISODE.title,
  seed: 'wave-doc-seed',
  themes: 'doc topic directive',
  publishAt: '2026-10-31T14:30:00Z',
};

// quotequarry's legacy kit longSlot — the D8 recompute both branches must land on
function expectedDocPublishAt() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 14, 30, 0));
  if (d <= new Date(now.getTime() + 35 * 60 * 1000)) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().replace(/\.\d+Z$/, 'Z');
}

// the pipeline-threading fakes gain the deepdive child (the fake dumps the same
// T5b env keys, tagged child:'deepdive', so the two lanes are tellable apart)
const FAKE_YT_DEEPDIVE = [
  "// test double: dumps exactly the T5c env keys it received, then exits 0",
  "import { appendFileSync } from 'node:fs';",
  'const KEYS = ["REVIEW_GENERATE_ONLY", "REVIEW_SCRIPT_SLOT_DATE", "PIPELINE_JOB_ID", "PIPELINE_RESUME_JOB_ID", "REVIEW_THUMB_CANDIDATES", "PIPELINE_TEMPLATE_VERSION"];',
  "appendFileSync(process.env.CHILD_ENV_LOG, JSON.stringify(Object.fromEntries([['child', 'deepdive'], ...KEYS.map((k) => [k, process.env[k] ?? null])])) + '\\n');",
  "console.log('[fake-yt-deepdive] ran with the env above');",
].join('\n');

describe('#106 T5c — the pipeline spawns the DOC lane generate-only on a clips-source hold (spawn-style)', () => {
  test('SEAM 1 (doc): gate hold no_approved_script on a clips-source channel -> yt-deepdive runs GENERATE-ONLY (env threaded), held terminal', () => {
    const r = runPipeline({
      deepdive: true,
      cadence: { [SLUG]: { shortsSource: 'clips' } },
      env: { JOB_STORE_ENABLED: '1', REVIEW_QUEUE_ENABLED: '1', PIPELINE_GATE_VERDICT: GATE_HOLD_NO_SCRIPT },
    });
    assert.equal(r.status, 0, 'the held run still exits 0');
    const deep = r.childEnv.filter((e) => e.child === 'deepdive');
    assert.equal(deep.length, 1, 'the DOC lane child ran exactly once for the hold');
    assert.equal(deep[0].REVIEW_GENERATE_ONLY, '1', 'the generate-only flag travels to the deepdive child');
    assert.equal(deep[0].REVIEW_SCRIPT_SLOT_DATE, TODAY);
    assert.ok(deep[0].PIPELINE_JOB_ID && String(deep[0].PIPELINE_JOB_ID).startsWith('spy-'), 'PIPELINE_JOB_ID lands on the doc child (the saved script links to the job)');
    assert.equal(deep[0].PIPELINE_RESUME_JOB_ID, null, 'no resume env on a fresh generate-only doc run');
    const daily = r.childEnv.filter((e) => e.child === 'daily');
    assert.equal(daily.length, 0, 'a clips-source channel never spawns the shorts generator for a doc-lane hold');
    const held = r.spy.find((c) => c.mod === 'jobs' && c.fn === 'finishJob');
    assert.ok(held, 'the job closes');
    assert.equal(held.args.status, 'held', 'the held terminal stands');
    assert.match(String(held.args.error || ''), /generated/, 'the terminal records the generated-awaiting-review outcome');
  });

  test('SEAM 1 (doc) resume: --resume <held id> on a clips-source channel -> yt-deepdive receives PIPELINE_RESUME_JOB_ID (not generate-only)', () => {
    const r = runPipeline({
      deepdive: true,
      cadence: { [SLUG]: { shortsSource: 'clips' } },
      args: ['--resume', 'held-job-doc-9'],
      env: {
        JOB_STORE_ENABLED: '1', REVIEW_QUEUE_ENABLED: '1',
        PIPELINE_GATE_VERDICT: JSON.stringify({
          ok: true, action: 'run', reason: 'approved_resumed',
          gating: { state: 'gated', familyId: 'documentary-frames', reviewRequired: ['finance'] },
          script: { id: 'doc-1', status: 'approved' },
        }),
      },
    });
    assert.equal(r.status, 0);
    const deep = r.childEnv.filter((e) => e.child === 'deepdive');
    assert.ok(deep.length >= 1, 'the doc lane ran');
    assert.equal(deep[0].PIPELINE_RESUME_JOB_ID, 'held-job-doc-9', 'the held job id reaches the doc child so it renders from the STORED input');
    assert.equal(deep[0].REVIEW_GENERATE_ONLY, null, 'a resumed doc run NEVER regenerates');
  });

  test('FLAG PIN (doc lane): REVIEW_QUEUE_ENABLED unset on a clips-source channel -> NO review env on any child (byte-identical legacy lane)', () => {
    const r = runPipeline({ deepdive: true, cadence: { [SLUG]: { shortsSource: 'clips' } }, env: {} });
    assert.ok(r.childEnv.length >= 1, 'the normal production lanes ran');
    for (const e of r.childEnv) {
      for (const k of ['REVIEW_GENERATE_ONLY', 'REVIEW_SCRIPT_SLOT_DATE', 'PIPELINE_JOB_ID', 'PIPELINE_RESUME_JOB_ID', 'REVIEW_THUMB_CANDIDATES']) {
        assert.equal(e[k], null, `${k} must be absent with the flags off (child ${e.child})`);
      }
    }
    assert.equal(r.childEnv.filter((e) => e.child === 'daily').length, 0, 'a clips-source channel never spawns the shorts generator');
  });
});

// ---------------------------------------------------------------------------
// THE DOC GENERATE-ONLY PIN: spawn the REAL yt-deepdive.mjs with module-loader
// redirects for every seam a generate-only run may touch. PASS = the brain was
// called ONCE (generation ran), the survivor was saved awaiting_review with the
// COMPLETE doc render input, and ZERO TTS/music/render/upload happened.
// ---------------------------------------------------------------------------

const SPY_DOC_ENGINE_GEN = [
  "import { appendFileSync } from 'node:fs';",
  'const LOG = process.env.PIPELINE_SPY_LOG;',
  "function rec(fn, args) { try { appendFileSync(LOG, JSON.stringify({ mod: 'docengine', fn, args }) + '\\n'); } catch {} }",
  'export async function callScriptBrain(o = {}) {',
  "  rec('callScriptBrain', { slug: o.slug, dedupe: o.dedupe ? { kind: o.dedupe.kind, threshold: o.dedupe.threshold } : null });",
  '  if (process.env.T5C_BRAIN_BLOCKED) return { ok: false, error: "all walks blocked" };',
  '  return { ok: true, provider: "spy-provider", walk: 1, parsed: JSON.parse(process.env.T5C_EPISODE_JSON) };',
  '}',
  'export async function fetchBrainContext() { return null; }',
  'export function brainContextSection() { return ""; }',
  'export function registryThresholds() { return { variation: 0.82, crossChannel: 0.9, financeGated: false }; }',
  'export async function renderYouTubeThumbnail() { rec("renderYouTubeThumbnail", {}); throw new Error("RENDER FORBIDDEN IN GENERATE-ONLY"); }',
  'export async function resolveTemplateId() { return null; }',
  'export default callScriptBrain;',
].join('\n');

const SPY_DOC_ENGINE_RESUME = [
  "import { appendFileSync } from 'node:fs';",
  'const LOG = process.env.PIPELINE_SPY_LOG;',
  "function rec(fn, args) { try { appendFileSync(LOG, JSON.stringify({ mod: 'docengine', fn, args }) + '\\n'); } catch {} }",
  'export async function callScriptBrain() {',
  "  rec('callScriptBrain', {});",
  '  throw new Error("GENERATION FORBIDDEN ON A RESUMED RUN");',
  '}',
  'export async function fetchBrainContext() { return null; }',
  'export function brainContextSection() { return ""; }',
  'export function registryThresholds() { return { variation: 0.82, crossChannel: 0.9, financeGated: false }; }',
  'export async function renderYouTubeThumbnail() { rec("renderYouTubeThumbnail", {}); return Buffer.from("fake-doc-thumb"); }',
  'export async function resolveTemplateId() { return null; }',
  'export default renderYouTubeThumbnail;',
].join('\n');

const SPY_DOC_STORE_GEN = [
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

const SPY_DOC_STORE_RESUME = [
  "import { appendFileSync } from 'node:fs';",
  'const LOG = process.env.PIPELINE_SPY_LOG;',
  "function rec(fn, args) { try { appendFileSync(LOG, JSON.stringify({ mod: 'docstore', fn, args }) + '\\n'); } catch {} }",
  'const ROW = {',
  '  id: "doc-approved-1", status: "approved", channel_id: "quotequarry", job_id: "held-job-doc-1",',
  '  kind: "doc", slot_idx: 0, slot_date: "2026-10-30", title: "Stored doc",',
  '  full_render_input: JSON.parse(process.env.T5C_STORED_DOC_JSON),',
  '};',
  'const store = {',
  '  async saveScript() { throw new Error("SAVE FORBIDDEN ON A RESUMED RUN"); },',
  '  async latestApprovedForJob(jobId) { rec("latestApprovedForJob", { jobId }); return { ok: true, script: jobId === "held-job-doc-1" ? ROW : null }; },',
  '  async latestForJob(jobId) { rec("latestForJob", { jobId }); return { ok: true, script: null }; },',
  '  async latestApproved() { rec("latestApproved", {}); return { ok: true, script: ROW }; },',
  '  async markConsumed(id, videoId) { rec("markConsumed", { id, videoId }); return { ok: true, id }; },',
  '};',
  "export async function getScriptStore() { rec('getScriptStore', {}); return store; }",
  'export default getScriptStore;',
].join('\n');

const SPY_DOC_MUSIC = [
  "import { appendFileSync } from 'node:fs';",
  'const LOG = process.env.PIPELINE_SPY_LOG;',
  "function rec(fn, args) { try { appendFileSync(LOG, JSON.stringify({ mod: 'docmusic', fn, args }) + '\\n'); } catch {} }",
  'export async function pickApprovedTrack() { rec("pickApprovedTrack", {}); return null; }',
  'export async function pickMusicTrack() { rec("pickMusicTrack", {}); return null; }',
].join('\n');

const SPY_DOC_TREND = [
  "import { appendFileSync } from 'node:fs';",
  'const LOG = process.env.PIPELINE_SPY_LOG;',
  "function rec(fn, args) { try { appendFileSync(LOG, JSON.stringify({ mod: 'doctrend', fn, args }) + '\\n'); } catch {} }",
  'export async function researchTrend() { rec("researchTrend", {}); return { videos: [{ title: "wave-doc-seed", views: 12345 }], hotKeywords: ["doc", "kw"] }; }',
  'export default researchTrend;',
].join('\n');

const SPY_DOC_DUPGATE = [
  "import { appendFileSync } from 'node:fs';",
  'const LOG = process.env.PIPELINE_SPY_LOG;',
  "function rec(fn, args) { try { appendFileSync(LOG, JSON.stringify({ mod: 'docdup', fn, args }) + '\\n'); } catch {} }",
  'export async function recentUploadTitles() { rec("recentUploadTitles", {}); return []; }',
  'export function findDup(title) { rec("findDup", { title }); return process.env.T5C_DUP_HIT ? "existing episode" : null; }',
].join('\n');

const SPY_DOC_INTENTS_GEN = [
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

const SPY_DOC_INTENTS_RESUME = [
  "import { appendFileSync } from 'node:fs';",
  'const LOG = process.env.PIPELINE_SPY_LOG;',
  "function rec(fn, args) { try { appendFileSync(LOG, JSON.stringify({ mod: 'docintents', fn, args }) + '\\n'); } catch {} }",
  'export async function uploadWithIntent(o = {}) {',
  '  rec("uploadWithIntent", { title: o.title, publishAt: o.publishAt, kind: o.kind });',
  '  return { ok: true, videoId: "vid-doc-resumed" };',
  '}',
  'export async function getUploadIntentStore() { return {}; }',
  'export async function recoverOpenIntents() { return { outcomes: [] }; }',
  'export function makeFindByTitle() { return async () => null; }',
  'export async function oauthAccessToken() { return "fake-token"; }',
  'export function slotISOOnDate() { return null; }',
  'export default uploadWithIntent;',
].join('\n');

const SPY_GOOGLE = [
  "import { appendFileSync } from 'node:fs';",
  'const LOG = process.env.PIPELINE_SPY_LOG;',
  "function rec(fn, args) { try { appendFileSync(LOG, JSON.stringify({ mod: 'docyt', fn, args }) + '\\n'); } catch {} }",
  'export const google = {',
  '  auth: { OAuth2: class { setCredentials() {} } },',
  '  youtube() {',
  '    return {',
  '      thumbnails: { set: async (o) => { rec("thumbnails.set", { videoId: o.videoId }); throw new Error("network disabled in test"); } },',
  '      commentThreads: { insert: async () => { throw new Error("network disabled in test"); } },',
  '    };',
  '  },',
  '};',
  'export default google;',
].join('\n');

// stub the child's ffmpeg/TTS layer: execFileSync only ever answers probeDur
// (encoding utf8 -> "5.0"); the narration .txt bytes are READ at call time so
// the test can pin exactly which text the render consumed.
const SPY_DOC_CP = [
  "import { appendFileSync, readFileSync } from 'node:fs';",
  'const LOG = process.env.PIPELINE_SPY_LOG;',
  "function rec(fn, args) { try { appendFileSync(LOG, JSON.stringify({ mod: 'doccp', fn, args }) + '\\n'); } catch {} }",
  'export function execFileSync(cmd, args = [], opts = {}) {',
  '  let txt = null;',
  '  try { if (String(args[1] || "").endsWith(".txt")) txt = readFileSync(String(args[1]), "utf8"); } catch {}',
  '  rec("execFileSync", { cmd: String(cmd), txt });',
  '  return (opts && opts.encoding) === "utf8" ? "5.0" : "";',
  '}',
  'export default { execFileSync };',
].join('\n');

function docChildLoaderSource(sandboxHref, extraBare = {}) {
  return [
    "import { registerHooks } from 'node:module';",
    'const SANDBOX = ' + JSON.stringify(sandboxHref) + ';',
    'const REDIRECTS = {',
    '  "youtube-engine.mjs": SANDBOX + "/spy-doc-engine.mjs",',
    '  "script-store.mjs": SANDBOX + "/spy-doc-store.mjs",',
    '  "music-engine.mjs": SANDBOX + "/spy-doc-music.mjs",',
    '  "trend-research.mjs": SANDBOX + "/spy-doc-trend.mjs",',
    '  "dup-gate.mjs": SANDBOX + "/spy-doc-dupgate.mjs",',
    '  "upload-intents.mjs": SANDBOX + "/spy-doc-intents.mjs",',
    '  "googleapis": SANDBOX + "/spy-doc-google.mjs",',
    '  "node:child_process": SANDBOX + "/spy-doc-cp.mjs",',
    '};',
    'registerHooks({',
    '  resolve(specifier, context, nextResolve) {',
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
}

function runYtDeepdive({ env = {}, engine, store, intents } = {}) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 't5c-deepdive-'));
  const spyLog = path.join(sandbox, 'spy.jsonl');
  try {
    const runDir = path.join(sandbox, 'run');
    fs.mkdirSync(path.join(runDir, 'yt-mcp', 'state'), { recursive: true });
    fs.writeFileSync(path.join(runDir, 'yt-mcp', 'state', SLUG + '.json'), JSON.stringify({}));
    // a non-docDay cadence: the generate-only bypass of the docDay guard is
    // proven by generation happening AT ALL on this day
    fs.writeFileSync(path.join(runDir, 'yt-mcp', 'cadence.json'), JSON.stringify({ [SLUG]: { docDays: [NOT_TODAY_NAME] } }));
    // the shared tail copies joined.mp4 -> episode.mp4 when no music bed was
    // picked; the stubbed ffmpeg never builds it, so pre-place it
    fs.mkdirSync(path.join(runDir, 'demos', 'deepdive-' + SLUG), { recursive: true });
    fs.writeFileSync(path.join(runDir, 'demos', 'deepdive-' + SLUG, 'joined.mp4'), Buffer.from('fake-joined-bytes'));
    fs.symlinkSync(ROOT, path.join(sandbox, 'repo'), 'junction');
    for (const [name, src] of [
      ['spy-doc-engine.mjs', engine], ['spy-doc-store.mjs', store], ['spy-doc-music.mjs', SPY_DOC_MUSIC],
      ['spy-doc-trend.mjs', SPY_DOC_TREND], ['spy-doc-dupgate.mjs', SPY_DOC_DUPGATE],
      ['spy-doc-intents.mjs', intents], ['spy-doc-google.mjs', SPY_GOOGLE], ['spy-doc-cp.mjs', SPY_DOC_CP],
    ]) {
      let out = src;
      if (name === 'spy-doc-intents.mjs') {
        // the D8 publishAt recompute is PURE slot math the tests assert on —
        // forward the real implementation (only the NETWORK seams are stubbed)
        out += '\nexport { nextFutureSlotISO } from ' + JSON.stringify(pathToFileURL(path.join(ROOT, 'lib', 'upload-intents.mjs')).href) + ';';
      }
      fs.writeFileSync(path.join(sandbox, name), out);
    }
    const loader = path.join(sandbox, 'loader.mjs');
    fs.writeFileSync(loader, docChildLoaderSource(pathToFileURL(sandbox).href));
    const r = spawnSync(process.execPath, [path.join(sandbox, 'repo', 'yt-deepdive.mjs'), SLUG], {
      cwd: runDir,
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        PIPELINE_SPY_LOG: spyLog,
        NODE_OPTIONS: '--import ' + pathToFileURL(loader).href,
        YOUTUBE_CLIENT_ID: 'dummy', YOUTUBE_CLIENT_SECRET: 'dummy',
        YT_TOKEN_QUOTEQUARRY: JSON.stringify({ refresh_token: 'dummy' }),
        T5C_EPISODE_JSON: JSON.stringify(DOC_EPISODE),
        T5C_STORED_DOC_JSON: JSON.stringify(STORED_DOC),
        ...env,
      },
      encoding: 'utf8',
      timeout: 180000,
    });
    let stateAfter = null;
    try { stateAfter = JSON.parse(fs.readFileSync(path.join(runDir, 'yt-mcp', 'state', SLUG + '.json'), 'utf8')); } catch { }
    return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', spy: readJsonl(spyLog), stateAfter };
  } finally {
    try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch { }
  }
}

const DOC_GEN_ENV = {
  REVIEW_GENERATE_ONLY: '1',
  REVIEW_SCRIPT_SLOT_DATE: TODAY,
  PIPELINE_JOB_ID: 'spy-job-doc-1',
  PIPELINE_TEMPLATE_VERSION: '2.0.0',
};

describe('#106 T5c — GENERATE-ONLY saves the doc awaiting_review, zero render spend (real yt-deepdive spawn)', () => {
  test('hold seam: the brain runs ONCE, the survivor persists kind=doc awaiting_review with the COMPLETE render input, and ZERO TTS/music/render/upload happens', () => {
    const r = runYtDeepdive({ env: DOC_GEN_ENV, engine: SPY_DOC_ENGINE_GEN, store: SPY_DOC_STORE_GEN, intents: SPY_DOC_INTENTS_GEN });
    assert.equal(r.status, 0, 'the generate-only doc run exits 0\n' + r.stdout + r.stderr);
    const brains = r.spy.filter((c) => c.mod === 'docengine' && c.fn === 'callScriptBrain');
    assert.equal(brains.length, 1, 'the doc generation ran exactly once (the deepdive walk with brain context + dedupe gates)');
    assert.equal(brains[0].args.dedupe.kind, 'doc', 'the brain walk carried the doc dedupe gates (a blocked walk can never save)');
    const saves = r.spy.filter((c) => c.mod === 'docstore' && c.fn === 'saveScript');
    assert.equal(saves.length, 1, 'exactly one script persisted');
    const f = saves[0].args;
    assert.equal(f.channelId, SLUG);
    assert.equal(f.kind, 'doc', 'the doc lane saves kind doc');
    assert.equal(f.status, 'awaiting_review', 'the generated doc holds for the owner (D15)');
    assert.equal(f.jobId, 'spy-job-doc-1');
    assert.equal(f.slotDate, TODAY);
    assert.equal(f.slotIdx, 0);
    assert.equal(f.templateVersion, '2.0.0', 'the pipeline template version threads into the doc row');
    assert.equal(f.title, DOC_EPISODE.title);
    assert.equal(f.publishAt, expectedDocPublishAt(), 'publishAt is the long-slot D8 recompute');
    assert.deepEqual(
      { ...f.fullRenderInput, themes: null },
      {
        hook: DOC_EPISODE.title,
        intro: DOC_EPISODE.intro,
        points: DOC_EPISODE.chapters.map((c) => ({ title: c.title, line: c.text })),
        closing: DOC_EPISODE.outro,
        thumbHeadline: DOC_EPISODE.title,
        seed: 'wave-doc-seed',
        themes: null,
        publishAt: expectedDocPublishAt(),
      },
      'the resume renders from THIS object — the complete doc structure the render path re-reads',
    );
    assert.ok(String(f.fullRenderInput.themes).includes('wave-doc-seed'), 'the trend directive rides along as themes');
    assert.ok(f.text.includes(DOC_EPISODE.title) && f.text.includes(DOC_EPISODE.outro), 'text carries the narration for the /review desk');
    const tts = r.spy.filter((c) => c.mod === 'doccp' && c.fn === 'execFileSync');
    assert.deepEqual(tts, [], 'ZERO TTS/ffmpeg calls — the generate-only run stops before any render spend');
    assert.equal(r.spy.filter((c) => c.mod === 'docmusic' && c.fn === 'pickApprovedTrack').length, 0, 'ZERO music picks');
    assert.equal(r.spy.filter((c) => c.mod === 'docintents' && c.fn === 'uploadWithIntent').length, 0, 'ZERO uploads');
    assert.equal(r.spy.filter((c) => c.mod === 'docengine' && c.fn === 'renderYouTubeThumbnail').length, 0, 'ZERO renders (the spy also throws)');
    assert.ok(r.stdout.includes('awaiting_review'), 'the run says the doc script is awaiting review');
    assert.equal(r.stateAfter?.deepdiveDate, undefined, 'deepdiveDate NEVER advances on a generate-only run (the resume must render TODAY)');
    assert.ok((r.stateAfter?.usedLongSeeds || []).includes('wave-doc-seed'), 'the seed rotation ADVANCES so nightly holds diversify (T5b round-1 pattern)');
  });

  test('blocked script never saved: an exhausted brain walk throws before any store write (guard pin)', () => {
    const r = runYtDeepdive({ env: { ...DOC_GEN_ENV, T5C_BRAIN_BLOCKED: '1' }, engine: SPY_DOC_ENGINE_GEN, store: SPY_DOC_STORE_GEN, intents: SPY_DOC_INTENTS_GEN });
    assert.notEqual(r.status, 0, 'a total generation failure is a failed run, never a silent skip');
    assert.equal(r.spy.filter((c) => c.mod === 'docstore' && c.fn === 'saveScript').length, 0, 'a BLOCKED generation never becomes awaiting_review');
    assert.equal(r.spy.filter((c) => c.mod === 'doccp' && c.fn === 'execFileSync').length, 0, 'no render spend after a blocked walk');
  });
});

describe('#106 T5c — RESUME renders the doc from the STORED input (real yt-deepdive spawn)', () => {
  test('the narration EQUALS the stored structure, the generator is NEVER called, and markConsumed lands AFTER videoId (AC-P4-4/D8/D14)', () => {
    const r = runYtDeepdive({
      env: { PIPELINE_RESUME_JOB_ID: 'held-job-doc-1', PIPELINE_JOB_ID: 'spy-job-doc-2' },
      engine: SPY_DOC_ENGINE_RESUME, store: SPY_DOC_STORE_RESUME, intents: SPY_DOC_INTENTS_RESUME,
    });
    assert.equal(r.status, 0, 'the resumed doc run ships and exits 0\n' + r.stdout + r.stderr);
    assert.equal(r.spy.filter((c) => c.mod === 'docengine' && c.fn === 'callScriptBrain').length, 0, 'a resumed doc NEVER re-generates (the spy also THROWS)');
    assert.equal(r.spy.filter((c) => c.mod === 'docstore' && c.fn === 'saveScript').length, 0, 'a resumed doc NEVER re-saves');
    // THE deep-equal: the narration the render consumed, in render order
    // (intro -> chapters 1..n -> outro), is byte-for-byte the STORED text.
    const narrated = r.spy.filter((c) => c.mod === 'doccp' && c.fn === 'execFileSync' && c.args.txt != null).map((c) => c.args.txt);
    assert.deepEqual(
      narrated,
      [STORED_DOC.intro, ...STORED_DOC.points.map((p) => p.line), STORED_DOC.closing],
      'the doc render consumes the STORED narration/structure — byte-for-byte the approved text',
    );
    const uploads = r.spy.filter((c) => c.mod === 'docintents' && c.fn === 'uploadWithIntent');
    assert.equal(uploads.length, 1, 'exactly one upload of the resumed episode');
    assert.equal(uploads[0].args.title, `${STORED_DOC.hook} | Timeless Wisdom`, 'the upload title rebuilds from the STORED title');
    assert.equal(uploads[0].args.publishAt, expectedDocPublishAt(), 'publishAt recomputed per D8 — never the stored (stale) schedule');
    assert.ok(new Date(uploads[0].args.publishAt).getTime() > Date.now(), 'the recomputed publishAt is in the future');
    assert.equal(uploads[0].args.kind, 'doc');
    const consumed = r.spy.filter((c) => c.mod === 'docstore' && c.fn === 'markConsumed');
    assert.equal(consumed.length, 1, 'the record retires exactly once');
    assert.deepEqual(consumed[0].args, { id: 'doc-approved-1', videoId: 'vid-doc-resumed' }, 'markConsumed is BY the approved row id with the real videoId');
    const upIdx = r.spy.findIndex((c) => c.mod === 'docintents' && c.fn === 'uploadWithIntent');
    const mcIdx = r.spy.findIndex((c) => c.mod === 'docstore' && c.fn === 'markConsumed');
    assert.ok(upIdx > -1 && mcIdx > upIdx, 'markConsumed happens AFTER the videoId landed (D14/SEAM 3 order)');
    assert.equal(r.stateAfter?.deepdiveDate, TODAY, 'the doc slot is marked produced for THIS lane');
    assert.equal(r.stateAfter?.deepdiveVideo?.videoId, 'vid-doc-resumed');
    assert.equal(
      r.stateAfter?.deepdiveVideo?.text,
      [STORED_DOC.intro, ...STORED_DOC.points.map((p) => p.line), STORED_DOC.closing].filter(Boolean).join('\n\n'),
      'the embedded narration is exactly the approved text (brain embed feeds on this)',
    );
    assert.ok(r.stdout.includes('STORED input'), 'the run says it rendered from the STORED input');
  });
});
