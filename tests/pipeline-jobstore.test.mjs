// #106 Phase 4 T2 — channel-pipeline.mjs job instrumentation + resume + park-check.
//
// Spec: docs/superpowers/specs/2026-10-30-phase4-review-queue-analytics-spec.md
// D2 (instrumentation point), D3 (artifact index points), D4 (resume), D11
// (parking), D24 (quota gate wiring); AC-P4-1..5, AC-P4-13/14. THE FLAG PIN:
// JOB_STORE_ENABLED unset = byte-identical behavior (zero store calls).
//
// Technique: channel-pipeline.mjs is a top-level script — every test SPAWNS
// it. The sandbox is a temp cwd (repo is never written); network env is
// stripped (no DATABASE_URL / BLOB token / NTFY topic / YouTube tokens) and
// the state fixture exhausts the quota ledger so no child lane can spawn.
// For wiring scenarios a Node module-loader hook (--import loader.mjs)
// redirects ONLY the pipeline's four lib imports (job-store, artifact-store,
// warnings-store, warnings-probe) to recording spies — the same module
// specifiers, resolved from the pipeline file alone. No live Neon, no Blob,
// no ntfy, no GitHub (house pattern: no live services in unit CI).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ptDate } from '../lib/quota-ledger.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PIPELINE = path.join(ROOT, 'channel-pipeline.mjs');
const SLUG = 'quotequarry'; // legacy brands.json kit — resolves from any cwd
const TODAY = new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Spy sources, written into the sandbox at runtime (never into the repo).
// ---------------------------------------------------------------------------

const SPY_JOBSTORE = [
  "import { appendFileSync, readFileSync } from 'node:fs';",
  "import { randomUUID } from 'node:crypto';",
  'const LOG = process.env.PIPELINE_SPY_LOG;',
  "const MODE = process.env.PIPELINE_STORE_MODE || 'ok';",
  'let parent = null;',
  "try { if (process.env.PIPELINE_PARENT_JOB) parent = JSON.parse(readFileSync(process.env.PIPELINE_PARENT_JOB, 'utf8')); } catch { parent = null; }",
  "function rec(fn, args, res) { try { appendFileSync(LOG, JSON.stringify({ mod: 'jobs', fn, args, res }) + '\\n'); } catch {} }",
  "function boom(fn) { if (MODE === 'throw') throw new Error('spy ' + fn + ' exploded'); }",
  'let n = 0;',
  'const EMPTY = { ok: true, job: null, steps: [], artifacts: [] };',
  'const store = {',
  "  async startJob(o = {}) { boom('startJob'); const id = 'spy-' + (++n) + '-' + randomUUID().slice(0, 8); rec('startJob', o, { ok: true, id }); return { ok: true, id }; },",
  "  async recordStep(jobId, idx, name, o = {}) { boom('recordStep'); rec('recordStep', { jobId, idx, name, status: o.status || 'pending' }, { ok: true }); return { ok: true }; },",
  "  async startStep(jobId, idx) { boom('startStep'); rec('startStep', { jobId, idx }, { ok: true }); return { ok: true }; },",
  "  async finishStep(jobId, idx, o = {}) { boom('finishStep'); rec('finishStep', { jobId, idx, status: o.status, error: o.error }, { ok: true }); return { ok: true }; },",
  "  async indexArtifact(jobId, o = {}) { boom('indexArtifact'); rec('indexArtifact', { jobId, step: o.step, kind: o.kind, contentHash: o.contentHash, blobUrl: o.blobUrl, size: o.size, meta: o.meta }, { ok: true, id: ++n }); return { ok: true, duplicate: false, id: n }; },",
  "  async finishJob(jobId, o = {}) { boom('finishJob'); rec('finishJob', { jobId, status: o.status, error: o.error }, { ok: true }); return { ok: true }; },",
  "  async getJob(jobId) { boom('getJob'); const hit = !!parent && !!parent.job && parent.job.id === jobId; rec('getJob', { jobId, hit, haveParent: !!parent }, hit ? { ok: true } : { ok: true, empty: true }); if (!hit) return EMPTY; return JSON.parse(JSON.stringify(parent)); },",
  "  async latestResumableJob(channel, o = {}) { boom('latestResumableJob'); rec('latestResumableJob', { channel, staleAfterMs: o.staleAfterMs }, { ok: true }); return parent ? JSON.parse(JSON.stringify(parent)) : JSON.parse(JSON.stringify(EMPTY)); },",
  '};',
  "export async function getJobStore() { rec('getJobStore', {}, { ok: true }); return store; }",
  'export default getJobStore;',
].join('\n');

const SPY_ARTIFACTS = [
  "import { appendFileSync } from 'node:fs';",
  "import { createHash } from 'node:crypto';",
  'const LOG = process.env.PIPELINE_SPY_LOG;',
  "const MODE = process.env.PIPELINE_ARTIFACT_MODE || 'ok';",
  "function rec(fn, args, res) { try { appendFileSync(LOG, JSON.stringify({ mod: 'artifacts', fn, args, res }) + '\\n'); } catch {} }",
  'export function makeArtifactStore() {',
  '  return {',
  '    async putBytes(kind, bytes, meta) {',
  "      const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes), 'utf8');",
  "      const hash = createHash('sha256').update(buf).digest('hex');",
  "      const res = { ok: true, hash, pathname: 'artifacts/' + hash, blob_url: 'https://blob/' + hash, degraded: false };",
  "      rec('putBytes', { kind, size: buf.length, contentType: meta && meta.contentType }, { ok: true, hash });",
  '      return res;',
  '    },',
  '    async getBytes(loc, opts = {}) {',
  "      if (MODE === 'missing') { const res = { ok: false, error: 'blob_unavailable' }; rec('getBytes', { loc, expectedHash: opts.expectedHash }, { ok: false }); return res; }",
  "      const res = { ok: true, bytes: Buffer.from('spy-bytes'), hash: opts.expectedHash || 'a'.repeat(64), verified: opts.expectedHash ? true : null };",
  "      rec('getBytes', { loc, expectedHash: opts.expectedHash }, { ok: true, hash: res.hash, verified: res.verified });",
  '      return res;',
  '    },',
  '  };',
  '}',
  'export default makeArtifactStore;',
].join('\n');

// The warnings spy re-exports the REAL emitWarning (and ladder constants)
// from lib/warnings-store.mjs — the loader only redirects PIPELINE-parented
// imports, so the real module (and its real ntfy path) is exercised; only the
// DB seam is faked. openWarning models the store's dedupe honestly: when the
// scenario's fixture says an open row already exists for that channel+code it
// returns deduped:true (the park re-find — emitWarning stays silent), else
// deduped:false (a fresh insert — emitWarning pushes, so a call site that
// forgets its noop-send override shows up in the push count).
function spyWarningsSource(realWarningsHref) {
  return [
    "import { appendFileSync, readFileSync } from 'node:fs';",
    'const LOG = process.env.PIPELINE_SPY_LOG;',
    "function rec(fn, args, res) { try { appendFileSync(LOG, JSON.stringify({ mod: 'warnings', fn, args, res }) + '\\n'); } catch {} }",
    'function openRows(channelId) {',
    '  const f = process.env.PIPELINE_OPEN_BLOCKING;',
    '  if (!f) return [];',
    "  try { const rows = JSON.parse(readFileSync(f, 'utf8')); return channelId ? rows.filter((r) => r.channel_id === channelId) : rows; } catch { return []; }",
    '}',
    'const store = {',
    "  async openBlockingFor(channelId = null) { const rows = openRows(channelId); rec('openBlockingFor', { channelId }, { count: rows.length }); return { ok: true, rows }; },",
    "  async openWarning(fields) { const rows = openRows(fields && fields.channel_id); const deduped = rows.some((r) => r.code === (fields && fields.code)); rec('openWarning', fields, { ok: true, deduped }); return { ok: true, id: 77, deduped }; },",
    "  async markChecked(id) { rec('markChecked', { id }, { ok: true }); return { ok: true }; },",
    "  async autoResolveIf(o = {}) { rec('autoResolveIf', o, { ok: true, resolved: true }); return { ok: true, resolved: true }; },",
    "  async ensureWarningsSchema() { rec('ensureWarningsSchema', {}, { ok: true }); return { ok: true }; },",
    '};',
    "export async function getDefaultWarningsStore() { rec('getDefaultWarningsStore', {}, { ok: true }); return store; }",
    'export { emitWarning, SEVERITIES, PUBLISHING_PATH_CODES } from ' + JSON.stringify(realWarningsHref) + ';',
    'export default store;',
  ].join('\n');
}

const SPY_PROBE = [
  "import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';",
  'const LOG = process.env.PIPELINE_SPY_LOG;',
  "function rec(fn, args, res) { try { appendFileSync(LOG, JSON.stringify({ mod: 'probe', fn, args, res }) + '\\n'); } catch {} }",
  "export const PROBES = { token_revoked: async () => ({ ok: true, stage: 'channels.list' }) };",
  'export async function probeParkedChannels({ store, channelId = null, log = () => {} } = {}) {',
  '  const open = await store.openBlockingFor(channelId);',
  '  const rows = (open.rows || []).filter((r) => r && r.auto_verifiable);',
  '  if (rows.length) {',
  '    const f = process.env.PIPELINE_OPEN_BLOCKING;',
  "    if (f) { try { writeFileSync(f, '[]'); } catch {} }",
  "    log('[spy-probe] token_revoked probe PASSED — auto-resolved');",
  '  }',
  "  rec('probeParkedChannels', { channelId, checked: rows.length }, { ok: true });",
  '  return { ok: true, openBlocking: (open.rows || []).length, checked: rows.length, results: [] };',
  '}',
  "export function tokenForChannel() { return 'refresh-token'; }",
].join('\n');

function loaderSource(pipelineHref, redirects) {
  return [
    "import { registerHooks } from 'node:module';",
    // module.registerHooks: Node >=22.15 / 23.5, still flagged experimental
    // upstream — CI pins Node >=24 where it is stable in practice.
    'const PIPELINE = ' + JSON.stringify(pipelineHref) + ';',
    'const REDIRECTS = ' + JSON.stringify(redirects) + ';',
    'registerHooks({',
    '  resolve(specifier, context, nextResolve) {',
    '    const res = nextResolve(specifier, context);',
    '    if (context && context.parentURL === PIPELINE && res && res.url) {',
    "      const m = res.url.match(/\\/lib\\/(job-store|artifact-store|warnings-store|warnings-probe)\\.mjs$/);",
    "      if (m && REDIRECTS[m[1] + '.mjs']) return { url: REDIRECTS[m[1] + '.mjs'], shortCircuit: true };",
    '    }',
    '    return res;',
    '  },',
    '});',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function readSpyLog(p) {
  try {
    return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

/**
 * Spawn channel-pipeline.mjs in a sandboxed cwd. `state` seeds
 * yt-mcp/state/<slug>.json; `files` maps repo-relative paths to content.
 * `env` is layered over a minimal, network-free environment. `childLibs`
 * junctions lib/ + node_modules into the sandbox and copies verify-run.mjs
 * so the pipeline's RELATIVE-path child spawn can actually run it (the
 * pipeline spawns children as e.g. `node verify-run.mjs` from its cwd) —
 * the child then fails exactly as in production (no token -> its own alert).
 */
function runPipeline({ state = {}, files = {}, args = [], env = {}, loader = true, childLibs = false } = {}) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pipe-t2-'));
  const spyLog = path.join(sandbox, 'spy.jsonl');
  try {
    if (Object.keys(state).length) {
      fs.mkdirSync(path.join(sandbox, 'yt-mcp', 'state'), { recursive: true });
      fs.writeFileSync(path.join(sandbox, 'yt-mcp', 'state', SLUG + '.json'), JSON.stringify(state));
    }
    for (const [rel, content] of Object.entries(files)) {
      const p = path.join(sandbox, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, content);
    }
    if (childLibs) {
      // Junctions (no admin rights needed) — removal never follows them.
      fs.symlinkSync(path.join(ROOT, 'lib'), path.join(sandbox, 'lib'), 'junction');
      fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(sandbox, 'node_modules'), 'junction');
      fs.copyFileSync(path.join(ROOT, 'verify-run.mjs'), path.join(sandbox, 'verify-run.mjs'));
    }
    const childEnv = {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      // Deliberately ABSENT: DATABASE_URL, BLOB_READ_WRITE_TOKEN, NTFY_TOPIC,
      // YT_TOKEN_*, GITHUB_* — the run must be network-free and store-dead
      // unless a spy or an explicit env var below says otherwise.
      PIPELINE_SPY_LOG: spyLog,
      ...env,
    };
    const spawnArgs = [];
    if (loader) {
      const redirects = {
        'job-store.mjs': pathToFileURL(path.join(sandbox, 'spy-jobstore.mjs')).href,
        'artifact-store.mjs': pathToFileURL(path.join(sandbox, 'spy-artifacts.mjs')).href,
        'warnings-store.mjs': pathToFileURL(path.join(sandbox, 'spy-warnings.mjs')).href,
        'warnings-probe.mjs': pathToFileURL(path.join(sandbox, 'spy-probe.mjs')).href,
      };
      fs.writeFileSync(path.join(sandbox, 'spy-jobstore.mjs'), SPY_JOBSTORE);
      fs.writeFileSync(path.join(sandbox, 'spy-artifacts.mjs'), SPY_ARTIFACTS);
      fs.writeFileSync(path.join(sandbox, 'spy-warnings.mjs'), spyWarningsSource(pathToFileURL(path.join(ROOT, 'lib', 'warnings-store.mjs')).href));
      fs.writeFileSync(path.join(sandbox, 'spy-probe.mjs'), SPY_PROBE);
      fs.writeFileSync(path.join(sandbox, 'loader.mjs'), loaderSource(pathToFileURL(PIPELINE).href, redirects));
      spawnArgs.push('--import', pathToFileURL(path.join(sandbox, 'loader.mjs')).href);
    }
    spawnArgs.push(PIPELINE, SLUG, ...args);
    const r = spawnSync(process.execPath, spawnArgs, { cwd: sandbox, env: childEnv, encoding: 'utf8', timeout: 180000 });
    return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', spy: readSpyLog(spyLog), sandbox };
  } finally {
    if (!process.env.PIPELINE_TEST_KEEP_SANDBOX) {
      try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch { }
    }
  }
}

const QUOTA_BLOCKED_STATE = { uploadsToday: { date: ptDate(), count: 6 } }; // 6 x 1700 > 10000 budget
const PRODUCED_TODAY_STATE = { lastRunDate: TODAY, deepdiveDate: TODAY };

// The resume fixtures need the CURRENT resume key the pipeline itself computes;
// capture it once from a flag-on run's startJob meta (self-consistent — no
// replication of the kit-hash formula in the test).
let capturedResumeKey = null;
function currentResumeKey() {
  if (capturedResumeKey) return capturedResumeKey;
  const r = runPipeline({ state: QUOTA_BLOCKED_STATE, env: { JOB_STORE_ENABLED: '1' } });
  assert.equal(r.status, 0, 'capture run exits 0');
  const start = r.spy.find((c) => c.mod === 'jobs' && c.fn === 'startJob');
  assert.ok(start, 'capture run recorded startJob');
  capturedResumeKey = start.args.meta.resume_key;
  return capturedResumeKey;
}

function parentFixture({ key, steps, artifacts, id = 'parent-1' }) {
  return {
    ok: true,
    job: { id, channel: SLUG, kind: 'pipeline', status: 'running', trigger: 'cron', resumed_from_job_id: null, meta: { resume_key: key } },
    steps,
    artifacts,
  };
}

function calls(spy, mod, fn) {
  return spy.filter((c) => c.mod === mod && c.fn === fn);
}

// ===========================================================================
// 1. THE FLAG PIN — JOB_STORE_ENABLED unset = byte-identical behavior
// ===========================================================================

describe('#106 T2 pipeline job instrumentation — flag gate', () => {
  test('JOB_STORE_ENABLED unset: ZERO store calls on EVERY major path (quota-skip, shipped+verify-fail, park-fixture), normal flow, exit 0', () => {
    const scenarios = [
      { name: 'quota-skip', state: QUOTA_BLOCKED_STATE },
      { name: 'shipped+verify-fail', state: PRODUCED_TODAY_STATE },
      {
        name: 'park-fixture-inert',
        state: PRODUCED_TODAY_STATE,
        env: { PIPELINE_OPEN_BLOCKING: 'rows.json' },
        files: { 'rows.json': JSON.stringify([{ ...BLOCKING_ROW, auto_verifiable: false }]) },
      },
    ];
    for (const s of scenarios) {
      const r = runPipeline({ state: s.state, files: s.files, env: s.env, loader: true });
      assert.equal(r.status, 0, `${s.name}: exit 0 (always-exit-0 preserved)`);
      assert.deepEqual(r.spy, [], `${s.name}: zero store calls when the flag is unset — not even module construction`);
      assert.ok(!/\[job\]|resume:|\[park\]/.test(r.stdout), `${s.name}: no instrumentation log lines`);
      assert.ok(r.stdout.includes('PIPELINE COMPLETE'), `${s.name}: the run completed`);
    }
  });

  test('flag-off quota path keeps the existing flow byte-for-byte logs (quota gate, paused lanes, staging)', () => {
    const r = runPipeline({ state: QUOTA_BLOCKED_STATE, loader: true });
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('[quota] Shorts production skipped'), 'the existing quota path ran unchanged');
    assert.ok(r.stdout.includes('Phase 2 — FB Reels skipped'), 'paused-lanes path unchanged');
    assert.ok(r.stdout.includes('no doc rendered today'), 'staging path unchanged');
  });

  test('unknown slug exits 1 with the flag ON and still never touches the store', () => {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pipe-t2-'));
    try {
      const spyLog = path.join(sandbox, 'spy.jsonl');
      const redirects = {
        'job-store.mjs': pathToFileURL(path.join(sandbox, 'spy-jobstore.mjs')).href,
        'artifact-store.mjs': pathToFileURL(path.join(sandbox, 'spy-artifacts.mjs')).href,
        'warnings-store.mjs': pathToFileURL(path.join(sandbox, 'spy-warnings.mjs')).href,
        'warnings-probe.mjs': pathToFileURL(path.join(sandbox, 'spy-probe.mjs')).href,
      };
      fs.writeFileSync(path.join(sandbox, 'spy-jobstore.mjs'), SPY_JOBSTORE);
      fs.writeFileSync(path.join(sandbox, 'spy-artifacts.mjs'), SPY_ARTIFACTS);
      fs.writeFileSync(path.join(sandbox, 'spy-warnings.mjs'), spyWarningsSource(pathToFileURL(path.join(ROOT, 'lib', 'warnings-store.mjs')).href));
      fs.writeFileSync(path.join(sandbox, 'spy-probe.mjs'), SPY_PROBE);
      fs.writeFileSync(path.join(sandbox, 'loader.mjs'), loaderSource(pathToFileURL(PIPELINE).href, redirects));
      const r = spawnSync(process.execPath,
        ['--import', pathToFileURL(path.join(sandbox, 'loader.mjs')).href, PIPELINE, 'no-such-channel'],
        { cwd: sandbox, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, JOB_STORE_ENABLED: '1', PIPELINE_SPY_LOG: spyLog }, encoding: 'utf8', timeout: 60000 });
      assert.equal(r.status, 1, 'unknown slug still exits 1 (AC-P4-3 exit semantics)');
      assert.match(r.stderr || r.stdout, /unknown slug/);
      assert.deepEqual(readSpyLog(spyLog), [], 'no store calls for an unknown slug');
    } finally {
      try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch { }
    }
  });
});

// ===========================================================================
// 2. AC-P4-1 — job + planned-step recording (D2 order, skipped-* lanes)
// ===========================================================================

describe('#106 T2 — job recording (AC-P4-1, AC-P4-3 terminal)', () => {
  test('flag on: one job with planned steps in D2 order; PLATFORMS_PAUSED lanes recorded skipped; quota-skipped lanes closed skipped; terminal failed with no upload', () => {
    const r = runPipeline({ state: QUOTA_BLOCKED_STATE, env: { JOB_STORE_ENABLED: '1' } });
    assert.equal(r.status, 0);
    const start = calls(r.spy, 'jobs', 'startJob');
    assert.equal(start.length, 1, 'exactly one job');
    assert.equal(start[0].args.channel, SLUG);
    assert.equal(start[0].args.kind, 'pipeline', 'the wrapper run maps to kind pipeline');
    assert.equal(start[0].args.trigger, 'dispatch', 'no CI env -> dispatch');
    const steps = calls(r.spy, 'jobs', 'recordStep').map((c) => ({ idx: c.args.idx, name: c.args.name, status: c.args.status }));
    assert.deepEqual(steps.map((s) => s.name),
      ['preflight', 'post', 'brain-embed', 'verify', 'skipped-fb', 'skipped-poster', 'episode', 'staging'],
      'planned steps in D2 order; paused FB/poster lanes use the skipped-* names');
    assert.equal(steps[4].status, 'skipped', 'skipped-fb registered skipped');
    assert.equal(steps[5].status, 'skipped', 'skipped-poster registered skipped');
    const preflightStart = calls(r.spy, 'jobs', 'startStep').find((c) => c.args.idx === 0);
    assert.ok(preflightStart, 'preflight opened (it already passed — the job exists after it)');
    const preflightFinish = calls(r.spy, 'jobs', 'finishStep').find((c) => c.args.idx === 0);
    assert.equal(preflightFinish.args.status, 'succeeded');
    const postFinish = calls(r.spy, 'jobs', 'finishStep').find((c) => c.args.idx === 1);
    assert.equal(postFinish.args.status, 'skipped', 'quota-skipped shorts lane closed skipped');
    assert.match(postFinish.args.error || '', /quota/);
    const episodeFinish = calls(r.spy, 'jobs', 'finishStep').find((c) => c.args.idx === 6);
    assert.equal(episodeFinish.args.status, 'skipped', 'quota-skipped episode closed skipped');
    const fin = calls(r.spy, 'jobs', 'finishJob');
    assert.equal(fin.length, 1, 'finishJob exactly once');
    assert.equal(fin[0].args.status, 'failed', 'no upload produced -> failed terminal');
    assert.match(fin[0].args.error || '', /Shorts skipped/);
  });

  test('kind maps from the run shape: --no-episode -> shorts; GITHUB_EVENT_NAME=schedule -> cron trigger', () => {
    const r = runPipeline({ state: QUOTA_BLOCKED_STATE, env: { JOB_STORE_ENABLED: '1', GITHUB_EVENT_NAME: 'schedule' }, args: ['--no-episode'] });
    assert.equal(r.status, 0);
    const start = calls(r.spy, 'jobs', 'startJob')[0];
    assert.equal(start.args.kind, 'shorts', 'episode-free generated run is kind shorts');
    assert.equal(start.args.trigger, 'cron', 'schedule event -> cron');
  });

  test('already-produced day: shipped upload + failed verify lane -> partial terminal (AC-P4-3); executed steps are never swept to skipped', () => {
    const r = runPipeline({ state: PRODUCED_TODAY_STATE, env: { JOB_STORE_ENABLED: '1' } });
    assert.equal(r.status, 0, 'exit 0 even with the verify lane failed');
    const postFinish = calls(r.spy, 'jobs', 'finishStep').find((c) => c.args.idx === 1);
    assert.equal(postFinish.args.status, 'skipped');
    assert.match(postFinish.args.error || '', /already produced today/);
    const verifyStep = calls(r.spy, 'jobs', 'finishStep').find((c) => c.args.idx === 3);
    assert.equal(verifyStep.args.status, 'failed', 'the failed verify lane is recorded on its step');
    const brainFinishes = calls(r.spy, 'jobs', 'finishStep').filter((c) => c.args.idx === 2);
    assert.ok(brainFinishes.length >= 1, 'brain-embed actually ran (results.shorts, generated) — it must be closed');
    assert.ok(brainFinishes.every((c) => c.args.status === 'succeeded'),
      'an executed planned step must never end skipped (the shorts + doc passes both ran clean)');
    const swept = calls(r.spy, 'jobs', 'finishStep').filter((c) => c.args.error === 'not reached');
    assert.deepEqual(swept.map((c) => c.args.idx), [], 'no step the run executed may be swept as not-reached (never-closed guard)');
    const fin = calls(r.spy, 'jobs', 'finishJob')[0];
    assert.equal(fin.args.status, 'partial', 'upload shipped + a lane failed -> partial');
  });
});

// ===========================================================================
// 3. Emitter sites (a) verify + (b) quota gate — H9 constraints
// ===========================================================================

describe('#106 T2 — warning emitters (D24 quota gate, verify-run site)', () => {
  // The spies load the REAL emitWarning from lib/warnings-store.mjs, so these
  // assertions see the actual write-and-alert contract: openWarning is the
  // durable row; every '[alert] no NTFY_TOPIC' stdout line is one REAL push
  // attempt (sandbox: no topic -> skipped, no gh fallback configured by the
  // pipeline's own sites). A call site that loses its noop-send override
  // therefore shows up here as an extra push.
  test('quota gate skips emit warning-severity rows (never blocking) and keep the existing ntfy pushes', () => {
    const r = runPipeline({ state: QUOTA_BLOCKED_STATE, env: { JOB_STORE_ENABLED: '1' } });
    assert.equal(r.status, 0);
    const rows = calls(r.spy, 'warnings', 'openWarning');
    assert.equal(rows.length, 2, 'shorts + episode quota skips each wrote a row');
    for (const e of rows) {
      assert.equal(e.args.code, 'quota_exceeded');
      assert.equal(e.args.severity, 'warning', 'H9: the ledger gate is NOT allowed blocking');
      assert.equal(e.args.blocks_publishing, undefined, 'never parks over a budget skip');
      assert.equal(e.args.auto_verifiable, true, 'the ledger math is self-evident from the row');
      assert.equal(e.args.channel_id, SLUG);
    }
    const pushes = (r.stdout.match(/\[alert\] no NTFY_TOPIC/g) || []).length;
    assert.equal(pushes, 3, 'exactly the 3 existing ntfy paths (preflight warn + 2 quota gates) — the row write adds no push');
  });

  test('verify-run failure emits verify_publication_missing as action_required (publishing-path code, no park), without double-paging', () => {
    // NTFY_TOPIC='' pins the child's push OFF (loadEnv's ??= keeps an
    // explicitly-empty value, so the repo .env reachable through the lib
    // junction can never arm a real push in a test).
    const r = runPipeline({ state: PRODUCED_TODAY_STATE, env: { JOB_STORE_ENABLED: '1', NTFY_TOPIC: '' }, childLibs: true });
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('[verify] ALERT'), 'the verify-run child actually ran (sandbox lib junction) and hit its own alert path');
    const rows = calls(r.spy, 'warnings', 'openWarning');
    const verify = rows.find((e) => e.args.code === 'verify_publication_missing');
    assert.ok(verify, 'the verify failure site emitted');
    assert.equal(verify.args.severity, 'action_required');
    assert.equal(verify.args.channel_id, SLUG);
    assert.equal(verify.args.auto_verifiable, false, 'no probe maps this code yet (PROBES maps token_revoked only)');
    const quota = rows.filter((e) => e.args.code === 'quota_exceeded');
    assert.deepEqual(quota, [], 'no quota rows on an already-produced day');
    const pushes = (r.stdout.match(/\[alert\] no NTFY_TOPIC/g) || []).length;
    assert.equal(pushes, 2, 'exactly the preflight warn + verify-run.mjs own push — the durable row never double-pages');
  });
});

// ===========================================================================
// 4. AC-P4-5 / AC-P4-3 — dead store never darkens production
// ===========================================================================

describe('#106 T2 — dead-store degradation (AC-P4-5, AC-P4-3)', () => {
  test('real store without DATABASE_URL: one warn, log-only, run continues, exit 0', () => {
    const r = runPipeline({ state: QUOTA_BLOCKED_STATE, env: { JOB_STORE_ENABLED: '1' }, loader: false });
    assert.equal(r.status, 0, 'dead DB cannot change exit semantics');
    const warns = (r.stdout.match(/\[job\] WARN job store unavailable/g) || []).length;
    assert.equal(warns, 1, 'exactly one degradation warn (AC-P4-5)');
    assert.ok(r.stdout.includes('PIPELINE COMPLETE'), 'the run continued');
    assert.ok(r.stdout.includes('[quota] Shorts production skipped'), 'existing behavior intact');
  });

  test('a store that THROWS on every call still exits 0 with the full flow (defense in depth)', () => {
    const r = runPipeline({ state: QUOTA_BLOCKED_STATE, env: { JOB_STORE_ENABLED: '1', PIPELINE_STORE_MODE: 'throw' } });
    assert.equal(r.status, 0, 'a hostile store must not change exit semantics');
    const degrades = (r.stdout.match(/\[job\] WARN step recording degraded/g) || []).length;
    assert.equal(degrades, 1, 'store exceptions surface as ONE memoized degradation warn, never a crash');
    assert.ok(r.stdout.includes('PIPELINE COMPLETE'), 'the run completed');
    assert.ok(r.stdout.includes('[quota] Shorts production skipped'), 'existing behavior intact');
    assert.ok(!/at\s+\S+\s+\(/.test(r.stdout), 'no stack traces on stdout');
  });
});

// ===========================================================================
// 5. Park-check (D11 / AC-P4-13/14) — after preflight, before any spend
// ===========================================================================

const BLOCKING_ROW = {
  channel_id: SLUG, severity: 'blocking', code: 'token_revoked',
  title: 'OAuth token revoked — channel parked',
  explanation: 'YouTube rejected the refresh token.',
  evidence: '401 invalid_grant', policy_quote: 'q', policy_url: 'https://p',
  auto_verifiable: true, blocks_publishing: true,
};

describe('#106 T2 — park-check (D11, AC-P4-13/14)', () => {
  test('open blocking warning: probe runs, production skipped for this channel, exit 0, NO job started', () => {
    const r = runPipeline({
      state: PRODUCED_TODAY_STATE,
      env: { JOB_STORE_ENABLED: '1', PIPELINE_OPEN_BLOCKING: 'rows.json' },
      files: { 'rows.json': JSON.stringify([{ ...BLOCKING_ROW, auto_verifiable: false }]) },
    });
    assert.equal(r.status, 0, 'parked run exits 0');
    assert.ok(r.stdout.includes('[park]'), 'park-check logged');
    assert.ok(!/Phase 1/.test(r.stdout), 'no production lane ran');
    assert.equal(calls(r.spy, 'jobs', 'startJob').length, 0, 'a parked run starts no job (nothing to resume)');
    const probe = calls(r.spy, 'probe', 'probeParkedChannels');
    assert.equal(probe.length, 1, 'the cheap auto-verifiable probe ran');
    assert.equal(probe[0].args.channelId, SLUG, 'probe scoped to THIS channel');
    const rows = calls(r.spy, 'warnings', 'openWarning');
    assert.ok(rows.some((e) => e.args.code === 'token_revoked' && e.args.severity === 'blocking'), 'the open blocking row is re-found through emitWarning (store dedupe owns once-per-episode)');
    const pushes = (r.stdout.match(/\[alert\] no NTFY_TOPIC/g) || []).length;
    assert.equal(pushes, 1, 'the park re-find is silent (deduped) — only the preflight warn pushed this run');
  });

  test('probe pass clears the park and the run proceeds (AC-P4-14)', () => {
    const r = runPipeline({
      state: QUOTA_BLOCKED_STATE,
      env: { JOB_STORE_ENABLED: '1', PIPELINE_OPEN_BLOCKING: 'rows.json' },
      files: { 'rows.json': JSON.stringify([BLOCKING_ROW]) },
    });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /\[park\].*PASSED|probe cleared/, 'the probe-pass lift is logged');
    assert.ok(r.stdout.includes('[quota] Shorts production skipped'), 'production proceeded to the normal (quota-blocked) flow');
    const fin = calls(r.spy, 'jobs', 'finishJob');
    assert.equal(fin.length, 1, 'the job ran to completion after the lift');
    assert.equal(fin[0].args.status, 'failed', 'quota-blocked day still has no upload');
  });
});

// ===========================================================================
// 6. Resume (D4 / AC-P4-4) — skip requires succeeded step AND verified bytes
// ===========================================================================

describe('#106 T2 — resume (D4, AC-P4-4)', () => {
  const ARTIFACT_STATE = {
    ...PRODUCED_TODAY_STATE,
    lastVideos: [{ videoId: 'vid1', publishAt: TODAY + 'T22:35:00Z', title: 'Test Short', text: 'hook line' }],
  };
  const NARR_FILES = {
    'demos/deepdive-quotequarry/narr-intro.mp3': 'fake-mp3-bytes-intro',
    'demos/deepdive-quotequarry/narr-1.mp3': 'fake-mp3-bytes-ch1',
  };

  test('--resume <id>: succeeded steps with verifiable artifact bytes are skipped; child job links the parent; artifacts indexed', () => {
    const key = currentResumeKey();
    const parent = parentFixture({
      key,
      steps: [
        { job_id: 'parent-1', idx: 0, name: 'preflight', status: 'succeeded' },
        { job_id: 'parent-1', idx: 1, name: 'post', status: 'succeeded' },
        { job_id: 'parent-1', idx: 6, name: 'episode', status: 'succeeded' },
      ],
      artifacts: [
        { step: 'post', kind: 'script_payload', content_hash: 'b'.repeat(64), blob_url: 'https://blob/post' },
        { step: 'episode', kind: 'tts_audio', content_hash: 'c'.repeat(64), blob_url: 'https://blob/ep1' },
      ],
    });
    const sandboxFiles = { ...NARR_FILES, 'parent.json': JSON.stringify(parent) };
    const r = runPipeline({
      state: ARTIFACT_STATE,
      files: sandboxFiles,
      args: ['--resume', 'parent-1'],
      env: { JOB_STORE_ENABLED: '1', PIPELINE_PARENT_JOB: 'parent.json' },
    });
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('resume: skip post (artifact verified)'), 'skip log in the pinned format');
    assert.ok(r.stdout.includes('resume: skip episode (artifact verified)'));
    const start = calls(r.spy, 'jobs', 'startJob')[0];
    assert.equal(start.args.trigger, 'resume', 'the child job carries trigger resume');
    assert.equal(start.args.resumedFromJobId, 'parent-1', 'parent/child link');
    const postFinish = calls(r.spy, 'jobs', 'finishStep').find((c) => c.args.idx === 1);
    assert.equal(postFinish.args.status, 'skipped');
    assert.match(postFinish.args.error || '', /resume/);
    const episodeFinish = calls(r.spy, 'jobs', 'finishStep').find((c) => c.args.idx === 6);
    assert.equal(episodeFinish.args.status, 'skipped');
    // artifact indexing on the resumed run
    const puts = calls(r.spy, 'artifacts', 'putBytes').map((c) => c.args.kind);
    assert.ok(puts.includes('script_payload'), 'script payload re-indexed');
    assert.equal(puts.filter((k) => k === 'tts_audio').length, 2, 'both narration files indexed');
    const indexes = calls(r.spy, 'jobs', 'indexArtifact');
    assert.ok(indexes.some((c) => c.args.step === 'post' && c.args.kind === 'script_payload'));
    assert.equal(indexes.filter((c) => c.args.step === 'episode' && c.args.kind === 'tts_audio').length, 2);
  });

  test('--resume: bytes NOT retrievable -> the step re-runs (a degraded artifact never skips)', () => {
    const key = currentResumeKey();
    const parent = parentFixture({
      key,
      steps: [{ job_id: 'parent-1', idx: 1, name: 'post', status: 'succeeded' }],
      artifacts: [{ step: 'post', kind: 'script_payload', content_hash: 'b'.repeat(64), blob_url: null, }],
    });
    const r = runPipeline({
      state: ARTIFACT_STATE,
      files: { 'parent.json': JSON.stringify(parent) },
      args: ['--resume', 'parent-1'],
      env: { JOB_STORE_ENABLED: '1', PIPELINE_PARENT_JOB: 'parent.json', PIPELINE_ARTIFACT_MODE: 'missing' },
    });
    assert.equal(r.status, 0);
    assert.ok(!r.stdout.includes('resume: skip'), 'no skip without verified bytes');
    assert.match(r.stdout, /resume: re-run post \(bytes not retrievable\)/);
    const gets = calls(r.spy, 'artifacts', 'getBytes');
    assert.ok(gets.length >= 1, 'the bytes verification was attempted');
    const postFinish = calls(r.spy, 'jobs', 'finishStep').find((c) => c.args.idx === 1);
    assert.equal(postFinish.args.status, 'skipped', 'the re-run hits the already-produced guard (same-day), closing skipped');
    assert.match(postFinish.args.error || '', /already produced today/, 're-run reason is the lane guard, not the resume skip');
  });

  test('--resume (bare): no stale job -> runs fresh; --resume <unknown id> -> runs fresh', () => {
    const bare = runPipeline({ state: QUOTA_BLOCKED_STATE, env: { JOB_STORE_ENABLED: '1' }, args: ['--resume'] });
    assert.equal(bare.status, 0);
    assert.match(bare.stdout, /resume: no stale job/, 'bare --resume logs the empty lookup');
    const unknown = runPipeline({
      state: QUOTA_BLOCKED_STATE,
      env: { JOB_STORE_ENABLED: '1' },
      args: ['--resume', '00000000-0000-0000-0000-000000000000'],
    });
    assert.equal(unknown.status, 0);
    assert.match(unknown.stdout, /resume: job .* not found/, 'unknown id logs and continues fresh');
  });

  test('--resume: stale resume key (template/brand-kit changed) invalidates artifacts — everything re-runs (D4)', () => {
    const key = currentResumeKey();
    const staleKey = { ...key, kit: 'stale-kit-hash' };
    const parent = parentFixture({
      key: staleKey,
      steps: [{ job_id: 'parent-1', idx: 1, name: 'post', status: 'succeeded' }],
      artifacts: [{ step: 'post', kind: 'script_payload', content_hash: 'b'.repeat(64), blob_url: 'https://blob/post' }],
    });
    const r = runPipeline({
      state: QUOTA_BLOCKED_STATE,
      files: { 'parent.json': JSON.stringify(parent) },
      args: ['--resume', 'parent-1'],
      env: { JOB_STORE_ENABLED: '1', PIPELINE_PARENT_JOB: 'parent.json' },
    });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /resume: stale key/, 'the stale invalidation is logged with why');
    assert.ok(!r.stdout.includes('resume: skip'), 'stale artifacts never skip');
    const gets = calls(r.spy, 'artifacts', 'getBytes');
    assert.deepEqual(gets, [], 'stale key short-circuits before any blob fetch');
    const fin = calls(r.spy, 'jobs', 'finishJob')[0];
    assert.equal(fin.args.status, 'failed', 'the fresh (quota-blocked) flow completed');
  });
});

// ---------------------------------------------------------------------------
// Audit 2026-11-13 #7 — truthful clip-lane outcomes (exit semantics of the
// PIPELINE stay AC-P4-3: end-of-run exit 0). post-next now exits 3 when no
// Short was due (off day / queue consumed between docs) and 4 when one was
// due but no clip could be posted (empty+stale / exhausted / quota). Before,
// every one of those exited 0 and the pipeline logged "✓ Clip Short
// processed" — 40/40 green runs while a channel posted nothing for 15 days.
// Spec + QA: docs/qa/truthful-outcomes-qa.md.
// ---------------------------------------------------------------------------
describe('audit #7 — truthful clip-lane outcomes', () => {
  const clipsRun = (stubExit) => runPipeline({
    state: {},
    args: ['--no-episode'],
    env: { JOB_STORE_ENABLED: '1' },
    files: {
      'yt-mcp/cadence.json': JSON.stringify({ [SLUG]: { shortsSource: 'clips' } }),
      'longvideo/shorts-clips.mjs': `process.exit(${stubExit});`,
    },
  });

  test('exit 0 (posted) -> ✓, clips step succeeded, job succeeded', () => {
    const r = clipsRun(0);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /✓ Clip Short processed/);
    const step = calls(r.spy, 'jobs', 'finishStep').find((c) => c.args.idx === 1);
    assert.equal(step.args.status, 'succeeded');
    assert.equal(calls(r.spy, 'jobs', 'finishJob')[0].args.status, 'succeeded');
  });

  test('exit 3 (nothing due) -> no ✓, step skipped "nothing due", job succeeded, no error', () => {
    const r = clipsRun(3);
    assert.equal(r.status, 0, 'AC-P4-3: the pipeline still exits 0');
    assert.doesNotMatch(r.stdout, /✓ Clip Short processed/, 'a no-op must never log ✓');
    assert.match(r.stdout, /no Short due today/);
    assert.match(r.stdout, /Shorts: – nothing due/);
    const step = calls(r.spy, 'jobs', 'finishStep').find((c) => c.args.idx === 1);
    assert.equal(step.args.status, 'skipped');
    assert.match(step.args.error || '', /nothing due/);
    const fin = calls(r.spy, 'jobs', 'finishJob')[0];
    assert.equal(fin.args.status, 'succeeded', 'an off day is not a failure');
    assert.match(r.stdout, /Errors: 0/);
  });

  test('exit 4 (due but nothing posted) -> error recorded, job failed, ::warning:: annotation', () => {
    const r = clipsRun(4);
    assert.equal(r.status, 0, 'AC-P4-3: the pipeline still exits 0');
    assert.doesNotMatch(r.stdout, /✓ Clip Short processed/);
    const step = calls(r.spy, 'jobs', 'finishStep').find((c) => c.args.idx === 1);
    assert.equal(step.args.status, 'skipped');
    const fin = calls(r.spy, 'jobs', 'finishJob')[0];
    assert.equal(fin.args.status, 'failed', 'a due Short that never shipped is a failed day');
    assert.match(fin.args.error || '', /Shorts skipped — no clip available/);
    assert.match(r.stdout, /::warning title=quotequarry: no Short published::/);
  });

  test('a crashing child logs its exit status and elapsed time (no silent ✗)', () => {
    const r = clipsRun(7);
    assert.match(r.stdout, /longvideo\/shorts-clips\.mjs exited status=7 signal=none after \d+(\.\d+)?s/);
    assert.match(r.stdout, /✗ Clip posting failed/);
    assert.equal(calls(r.spy, 'jobs', 'finishJob')[0].args.status, 'failed');
  });
});
