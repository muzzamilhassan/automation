import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { registerHooks } from 'node:module';
import { resolveGating, evaluateReviewGate, sweepReviewTimeouts, CACHE_TTL_MS } from '../lib/review-gate.mjs';
import {
  DISCLOSURE_CATEGORIES,
  dispatchResumeRun,
  approveScriptAndDispatch,
  resolvePickRequest,
  defaultCandidateIndex,
} from '../studio/lib/review-actions.mjs';
import { ptDate } from '../lib/quota-ledger.mjs';

// ---------------------------------------------------------------------------
// #106 Phase 4 T5 (S4) — review gate (D15/C2/M2/M3/M4), approval dispatch
// (D16/H6), thumbnail pick semantics (D18/M7), and THE PIPELINE FLAG PIN
// (REVIEW_QUEUE_ENABLED unset = byte-identical).
// Spec: docs/superpowers/specs/2026-10-30-phase4-review-queue-analytics-spec.md
// D15-D18; AC-P4-18..23; review findings 2 (C2 fail-closed), 3 (drift
// warning), 4 (post-upload swap), 7 (dispatch contract), 12 (timeout).
// All seams injected — no live Neon, GitHub, or YouTube in unit CI.
// ---------------------------------------------------------------------------

// ---- fakes ----------------------------------------------------------------

function fakeScriptStore({ slotScripts = [], pending = [] } = {}) {
  return {
    async scriptsForSlot(channelId, slotDate) {
      // store contract: newest first (created_at DESC)
      const scripts = slotScripts
        .filter((s) => s.channel_id === channelId && s.slot_date === slotDate)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return { ok: true, scripts };
    },
    async pendingFor() {
      return { ok: true, scripts: pending };
    },
    async approve(id) { return { ok: true, id }; },
  };
}

function fakeEmit() {
  const rows = [];
  const fn = async (store, fields) => { rows.push(fields); return { ok: true, id: rows.length, deduped: false }; };
  fn.rows = rows;
  return fn;
}

const REGISTRY_DB_WITH = (row) => async () => ({
  async getActiveAssignment(channelId) { return row; },
});
const BROKEN_DB = async () => { throw new Error('db down'); };

const META_FINANCE = { safety: { review_required: ['finance'] } };
const META_PLAIN = { safety: { review_required: [] } };

const assignmentRow = (familyId = 'finance-explainers') => ({
  channel_id: 'quotequarry', family_id: familyId, pinned_major: 1, pinned_version: '1.0.0',
});

const AWAITING = (over = {}) => ({
  id: 's-awaiting', channel_id: 'quotequarry', slot_date: '2026-10-31', status: 'awaiting_review',
  title: 'T', publish_at: '2026-11-01T15:00:00Z', created_at: '2026-10-31T06:00:00Z', ...over,
});

// Shared gate options — the registry/meta seams say "gated finance channel"
// unless a test overrides them (module-scope so every describe sees it).
const gatedOpts = (over = {}) => ({
  slug: 'quotequarry', slotDate: '2026-10-31',
  scriptStore: fakeScriptStore(),
  registryDb: REGISTRY_DB_WITH(assignmentRow()),
  templateMeta: () => META_FINANCE,
  cache: null, saveCache: () => {},
  warningsStore: {}, emit: fakeEmit(),
  now: () => new Date('2026-10-31T09:00:00Z'),
  log: () => {},
  ...over,
});

// ---------------------------------------------------------------------------
// A. resolveGating — the C2 truth table (review finding 2, D15, AC-P4-18)
// ---------------------------------------------------------------------------

describe('#106 T5 review gate — C2 truth table: membership x unreadable state (D15)', () => {
  test('no registry assignment at all -> ungated (legacy channels run exactly as today), cache records it', async () => {
    const r = await resolveGating({
      slug: 'legacy-chan', registryDb: REGISTRY_DB_WITH(null), templateMeta: () => META_FINANCE, cache: null,
    });
    assert.equal(r.state, 'ungated');
    assert.deepEqual(r.cacheUpdate, { assigned: false, gated: false, checkedAt: r.cacheUpdate.checkedAt }, 'the cache records the legacy resolution so DB blips preserve it');
  });

  test('assignment + EMPTY review_required -> ungated (membership is the only gate), cache records it', async () => {
    const r = await resolveGating({
      slug: 'quotequarry', registryDb: REGISTRY_DB_WITH(assignmentRow()), templateMeta: () => META_PLAIN, cache: null,
    });
    assert.equal(r.state, 'ungated');
    assert.deepEqual(r.cacheUpdate, { assigned: true, gated: false, checkedAt: r.cacheUpdate.checkedAt });
  });

  test('assignment + NON-EMPTY review_required -> gated (D15: membership-driven ONLY)', async () => {
    const r = await resolveGating({
      slug: 'quotequarry', registryDb: REGISTRY_DB_WITH(assignmentRow()), templateMeta: () => META_FINANCE, cache: null,
    });
    assert.equal(r.state, 'gated');
    assert.deepEqual(r.reviewRequired, ['finance']);
    assert.deepEqual(r.cacheUpdate, { assigned: true, gated: true, checkedAt: r.cacheUpdate.checkedAt });
  });

  test('C2: registry UNREADABLE + cached gated assignment -> still gated (the hold survives DB blips)', async () => {
    const r = await resolveGating({
      slug: 'quotequarry', registryDb: BROKEN_DB, templateMeta: () => META_FINANCE,
      cache: { assigned: true, gated: true, checkedAt: new Date().toISOString() },
    });
    assert.equal(r.state, 'gated');
    assert.equal(r.viaCache, true, 'the LAST-KNOWN-ASSIGNMENT cache answers when the DB blips (D15b)');
  });

  test('C2: registry UNREADABLE + cached legacy (ungated) channel -> ungated (legacy runs as today through blips)', async () => {
    const r = await resolveGating({
      slug: 'legacy-chan', registryDb: BROKEN_DB, templateMeta: () => META_PLAIN,
      cache: { assigned: false, gated: false, checkedAt: new Date().toISOString() },
    });
    assert.equal(r.state, 'ungated');
    assert.equal(r.viaCache, true);
  });

  test('C2: registry UNREADABLE + NO cache at all -> fail-closed GATED (hold covers even a missing cache)', async () => {
    const r = await resolveGating({ slug: 'quotequarry', registryDb: BROKEN_DB, templateMeta: () => META_FINANCE, cache: null });
    assert.equal(r.state, 'gated');
    assert.equal(r.failClosed, true, 'unreadable with no cache holds (D15: fail-closed)');
  });

  test('M3 drift: an assignment the gate cannot resolve (template meta missing) -> drift, gated-conservative cache', async () => {
    const r = await resolveGating({
      slug: 'quotequarry', registryDb: REGISTRY_DB_WITH(assignmentRow('ghost-family')), templateMeta: () => null, cache: null,
    });
    assert.equal(r.state, 'drift');
    assert.deepEqual(r.cacheUpdate, { assigned: true, gated: true, checkedAt: r.cacheUpdate.checkedAt }, 'drift caches CONSERVATIVE (gated) so later blips stay held');
  });
});

// ---------------------------------------------------------------------------
// B. evaluateReviewGate — approval states x membership (AC-P4-18), M2
// ---------------------------------------------------------------------------

describe('#106 T5 review gate — approval states (AC-P4-18) + M2 risk flags never gate', () => {
  test('gated + no script for the slot -> HOLD (fail-closed: nothing renders/uploads without an approval row)', async () => {
    const emit = fakeEmit();
    const r = await evaluateReviewGate(gatedOpts({ emit }));
    assert.equal(r.ok, true);
    assert.equal(r.action, 'hold');
    assert.equal(r.reason, 'no_approved_script');
  });

  test('gated + awaiting_review script -> HOLD, one Action-required hold alert', async () => {
    const emit = fakeEmit();
    const r = await evaluateReviewGate(gatedOpts({
      emit,
      scriptStore: fakeScriptStore({ slotScripts: [AWAITING()] }),
    }));
    assert.equal(r.action, 'hold');
    assert.equal(r.reason, 'awaiting_review');
    const holds = emit.rows.filter((e) => e.code === 'review_hold');
    assert.equal(holds.length, 1, 'ONE Action-required alert per hold (store dedupe owns re-fires)');
    assert.equal(holds[0].severity, 'action_required');
  });

  test('gated + rejected script newest for the slot -> HOLD (the lane terminal: a rejected script never uploads)', async () => {
    const r = await evaluateReviewGate(gatedOpts({
      scriptStore: fakeScriptStore({
        slotScripts: [
          AWAITING({ id: 's-old', created_at: '2026-10-31T06:00:00Z' }),
          AWAITING({ id: 's-new', status: 'rejected', created_at: '2026-10-31T07:00:00Z' }),
        ],
      }),
    }));
    assert.equal(r.action, 'hold');
    assert.equal(r.reason, 'rejected');
  });

  test('gated + APPROVED script -> RUN (approval is the only key that un-holds a gated slot)', async () => {
    const r = await evaluateReviewGate(gatedOpts({
      scriptStore: fakeScriptStore({ slotScripts: [AWAITING({ status: 'approved' })] }),
    }));
    assert.equal(r.action, 'run');
    assert.equal(r.reason, 'approved');
  });

  test('M2: generator risk flags NEVER gate — a flagged-claims script on an UNGATED template still runs', async () => {
    const r = await evaluateReviewGate(gatedOpts({
      templateMeta: () => META_PLAIN,
      scriptStore: fakeScriptStore({ slotScripts: [AWAITING({ status: 'awaiting_review' })] }),
    }));
    assert.equal(r.action, 'run', 'an ungated channel runs even with awaiting/flagged records — membership decides, nothing else');
  });

  test('M2 inverse: a gated channel with a ZERO-risk-flag script still holds (a flag can never un-gate)', async () => {
    const r = await evaluateReviewGate(gatedOpts({
      scriptStore: fakeScriptStore({
        slotScripts: [{
          ...AWAITING(),
          claims: [{ claim: 'safe', verification: 'verified' }],
        }],
      }),
    }));
    assert.equal(r.action, 'hold');
  });

  test('C2 end-to-end: unreadable registry + no cache -> HOLD with one review_state_unreadable row (fail-closed)', async () => {
    const emit = fakeEmit();
    const r = await evaluateReviewGate(gatedOpts({ registryDb: BROKEN_DB, emit }));
    assert.equal(r.action, 'hold');
    const rows = emit.rows.filter((e) => e.code === 'review_state_unreadable');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].severity, 'action_required');
  });

  test('M3: drift emits the dedicated review_gating_inactive row and holds', async () => {
    const emit = fakeEmit();
    const r = await evaluateReviewGate(gatedOpts({ templateMeta: () => null, emit }));
    assert.equal(r.action, 'hold');
    const rows = emit.rows.filter((e) => e.code === 'review_gating_inactive');
    assert.equal(rows.length, 1, 'the dedicated M3 row (AC-P4-18)');
    assert.equal(rows[0].severity, 'action_required');
    assert.ok(rows[0].explanation);
  });

  test('readable resolutions persist the last-known-assignment cache via saveCache', async () => {
    const savedCaches = [];
    await evaluateReviewGate(gatedOpts({ saveCache: (c) => savedCaches.push(c) }));
    assert.equal(savedCaches.length, 1);
    assert.equal(savedCaches[0].gated, true);
  });
});

// ---------------------------------------------------------------------------
// C. approval timeout (M4 / D17 / AC-P4-19) — run-start half + nightly sweep
// ---------------------------------------------------------------------------

describe('#106 T5 review gate — approval timeout (M4, AC-P4-19)', () => {
  test('run-start: an awaiting script whose slot publishAt passed emits review_timeout, RETAINS the script, holds', async () => {
    const emit = fakeEmit();
    const script = AWAITING({ publish_at: '2026-10-31T07:00:00Z' }); // 2h before now
    const r = await evaluateReviewGate(gatedOpts({
      emit,
      scriptStore: fakeScriptStore({ slotScripts: [script] }),
    }));
    assert.equal(r.action, 'hold');
    const timeouts = emit.rows.filter((e) => e.code === 'review_timeout');
    assert.equal(timeouts.length, 1);
    assert.equal(timeouts[0].severity, 'action_required');
    assert.equal(timeouts[0].auto_verifiable, false, 'approval is human — no probe can clear it');
    assert.ok(String(timeouts[0].evidence).includes('s-awaiting'));
  });

  test('run-start: publishAt still in the future emits NO timeout (the window is open)', async () => {
    const emit = fakeEmit();
    await evaluateReviewGate(gatedOpts({
      emit,
      scriptStore: fakeScriptStore({ slotScripts: [AWAITING({ publish_at: '2026-11-01T15:00:00Z' })] }),
    }));
    assert.equal(emit.rows.some((e) => e.code === 'review_timeout'), false);
  });

  test('nightly sweep: times out EVERY channel\'s past-deadline awaiting script (publishAt, else end-of-day), retains all', async () => {
    const emit = fakeEmit();
    const kept = [];
    const store = {
      async pendingFor() {
        return {
          ok: true,
          scripts: [
            AWAITING({ id: 'past-publish', channel_id: 'a', publish_at: '2026-10-30T10:00:00Z' }),
            AWAITING({ id: 'future-publish', channel_id: 'b', publish_at: '2026-12-01T10:00:00Z' }),
            AWAITING({ id: 'end-of-day', channel_id: 'c', publish_at: null, slot_date: '2026-10-29', created_at: '2026-10-29T06:00:00Z' }),
          ],
        };
      },
      async approve(id) { kept.push(id); return { ok: true, id }; },
    };
    const r = await sweepReviewTimeouts({
      scriptStore: store, warningsStore: {}, emit, warningsEmit: emit,
      now: () => new Date('2026-10-31T12:00:00Z'),
      log: () => {},
    });
    assert.equal(r.ok, true);
    const timedOut = emit.rows.filter((e) => e.code === 'review_timeout').map((e) => e.dedupe_key);
    assert.equal(timedOut.length, 2, 'past-publishAt AND past-end-of-day both time out');
    assert.ok(timedOut.some((k) => k.includes('past-publish')));
    assert.ok(timedOut.some((k) => k.includes('end-of-day')));
    assert.equal(kept.length, 0, 'RETAIN-AND-RESUME: the sweep never consumes the script (AC-P4-19)');
    assert.equal(r.timedOut, 2);
  });

  test('nightly sweep is never-throw: a dead script store degrades, nothing emits', async () => {
    const emit = fakeEmit();
    const r = await sweepReviewTimeouts({
      scriptStore: { async pendingFor() { return { ok: false, error: 'db down' }; } },
      warningsStore: {}, emit,
      now: () => new Date('2026-10-31T12:00:00Z'), log: () => {},
    });
    assert.equal(r.ok, false);
    assert.equal(emit.rows.length, 0);
  });
});

// ---------------------------------------------------------------------------
// D. approval -> dispatch contract (H6 / D16 / AC-P4-22) + the disclosure gate
// ---------------------------------------------------------------------------

describe('#106 T5 review dispatch — approve -> channel-autopilot resume (D16, AC-P4-22)', () => {
  const TOKEN_OK = { match: 'api.github.com', status: 204 };

  function fetchStub(routes) {
    const calls = [];
    const fn = async (url, init) => {
      calls.push({ url: String(url), init, body: init && init.body ? JSON.parse(init.body) : null });
      const rule = routes.find((r) => String(url).includes(r.match));
      if (!rule) throw new Error(`fetch stub: unexpected url ${String(url)}`);
      return { ok: rule.status === 204, status: rule.status, text: async () => rule.text || '' };
    };
    fn.calls = calls;
    return fn;
  }

  test('DISCLOSURE_CATEGORIES is the OFFICIAL four-category wording (research §5.7, support.google.com/youtube/answer/14328491)', () => {
    assert.equal(DISCLOSURE_CATEGORIES.source, 'https://support.google.com/youtube/answer/14328491');
    assert.equal(DISCLOSURE_CATEGORIES.citedFrom, 'research/platform-topic-discovery-script-qa-2026-10-24.md §5.7');
    assert.deepEqual(
      DISCLOSURE_CATEGORIES.items.map((i) => i.text),
      [
        'Makes a real person appear to say or do something they didn\'t do',
        'Alters footage of a real event or place',
        'Generates a realistic scene that didn\'t actually occur',
        'Creates music that\'s the main focus of the video',
      ],
      'verbatim from research §5.7 — the four official synthetic-media categories',
    );
    assert.equal(DISCLOSURE_CATEGORIES.items.length, 4);
  });

  test('AC-P4-21: approval REQUIRES all four disclosure answers when the script requires disclosure', async () => {
    const dbLike = {
      calls: [],
      tables: { scripts: [], script_sources: [], script_claims: [] },
    };
    // minimal script store double: approve records + getScript returns a disclosure-required script
    const script = { id: 's1', channel_id: 'quotequarry', job_id: 'j1', status: 'awaiting_review', slot_date: '2026-10-31', full_render_input: JSON.stringify({ disclosure: { synthetic_media_required: true } }) };
    const scriptStore = {
      async approve(id, o) { return { ok: true, id }; },
      async getScript(id) { return { ok: true, script, sources: [], claims: [] }; },
    };
    const emit = fakeEmit();
    const fetchImpl = fetchStub([TOKEN_OK]);
    const incomplete = await approveScriptAndDispatch({
      scriptStore, warningsStore: {}, emit,
      scriptId: 's1', by: 'owner', note: '', disclosure: { answered: 2 },
      token: 't', repo: 'muzzamilhassan/automation', fetchImpl, log: () => {},
    });
    assert.equal(incomplete.ok, false, 'approval is impossible until every item is answered');
    assert.match(incomplete.error, /disclosure/);
    assert.equal(fetchImpl.calls.length, 0, 'no dispatch without the completed checklist');
    const full = await approveScriptAndDispatch({
      scriptStore, warningsStore: {}, emit,
      scriptId: 's1', by: 'owner', note: 'ok', disclosure: {
        'Makes a real person appear to say or do something they didn\'t do': false,
        'Alters footage of a real event or place': false,
        'Generates a realistic scene that didn\'t actually occur': true,
        'Creates music that\'s the main focus of the video': false,
      },
      token: 't', repo: 'muzzamilhassan/automation', fetchImpl, log: () => {},
    });
    assert.equal(full.ok, true);
    assert.equal(full.dispatched, true);
  });

  test('approve dispatches channel-autopilot.yml with channel=<slug>&resume=<job_id> (the /api/action pattern)', async () => {
    const scriptStore = {
      async approve() { return { ok: true, id: 's1' }; },
      async getScript() {
        return { ok: true, script: { id: 's1', channel_id: 'quotequarry', job_id: 'job-9', status: 'awaiting_review', full_render_input: null }, sources: [], claims: [] };
      },
    };
    const fetchImpl = fetchStub([TOKEN_OK]);
    const r = await approveScriptAndDispatch({
      scriptStore, warningsStore: {}, emit: fakeEmit(),
      scriptId: 's1', by: 'owner', note: '', disclosure: null,
      token: 't', repo: 'muzzamilhassan/automation', fetchImpl, log: () => {},
    });
    assert.equal(r.ok, true);
    assert.equal(r.dispatched, true);
    const call = fetchImpl.calls[0];
    assert.match(call.url, /actions\/workflows\/channel-autopilot\.yml\/dispatches/);
    assert.equal(call.body.ref, 'main');
    assert.equal(call.body.inputs.channel, 'quotequarry');
    assert.equal(call.body.inputs.resume, 'job-9');
  });

  test('H6: a dispatch FAILURE records an Action-required warning — an approval can never silently not render', async () => {
    const scriptStore = {
      async approve() { return { ok: true, id: 's1' }; },
      async getScript() {
        return { ok: true, script: { id: 's1', channel_id: 'quotequarry', job_id: 'job-9', status: 'awaiting_review', full_render_input: null }, sources: [], claims: [] };
      },
    };
    const emit = fakeEmit();
    const fetchImpl = fetchStub([{ match: 'api.github.com', status: 500, text: 'boom' }]);
    const r = await approveScriptAndDispatch({
      scriptStore, warningsStore: {}, emit,
      scriptId: 's1', by: 'owner', note: '', disclosure: null,
      token: 't', repo: 'muzzamilhassan/automation', fetchImpl, log: () => {},
    });
    assert.equal(r.approved, true, 'the approval row stands (D16: the owner re-triggers from the warning)');
    assert.equal(r.dispatched, false);
    const rows = emit.rows.filter((e) => e.code === 'approval_dispatch_failed');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].severity, 'action_required');
    assert.equal(rows[0].channel_id, 'quotequarry');
    assert.equal(rows[0].job_id, 'job-9');
  });
});

// ---------------------------------------------------------------------------
// E. thumbnails (D18 as amended / M7): unpicked default + before/after publishAt
// ---------------------------------------------------------------------------

describe('#106 T5 thumbnails — post-upload swap semantics (D18, AC-P4-23, M7)', () => {
  test('M7: UNPICKED = candidate 1 — an explicit default, not a gap', () => {
    assert.equal(defaultCandidateIndex(), 1);
  });

  test('a pick BEFORE publishAt applies (the thumbnails.set swap)', () => {
    const r = resolvePickRequest({
      candidate: 2, candidatesCount: 3,
      publishedAt: '2026-11-01T15:00:00Z', now: () => new Date('2026-10-31T10:00:00Z'),
    });
    assert.equal(r.ok, true);
    assert.equal(r.apply, true);
    assert.equal(r.reason, 'swap_before_publish');
  });

  test('a pick AFTER publishAt is RECORDED but NOT applied', () => {
    const r = resolvePickRequest({
      candidate: 3, candidatesCount: 3,
      publishedAt: '2026-10-31T09:00:00Z', now: () => new Date('2026-10-31T10:00:00Z'),
    });
    assert.equal(r.ok, true);
    assert.equal(r.apply, false);
    assert.equal(r.reason, 'after_publish_recorded_only');
  });

  test('an out-of-range or missing candidate is rejected', () => {
    assert.equal(resolvePickRequest({ candidate: 4, candidatesCount: 3, publishedAt: null }).ok, false);
    assert.equal(resolvePickRequest({ candidate: 0, candidatesCount: 3, publishedAt: null }).ok, false);
    assert.equal(resolvePickRequest({ candidate: 2, candidatesCount: 0, publishedAt: null }).ok, false);
  });
});

// ---------------------------------------------------------------------------
// F. THE PIPELINE FLAG PIN — channel-pipeline.mjs gate block (D15 wiring)
// ---------------------------------------------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PIPELINE = path.join(ROOT, 'channel-pipeline.mjs');
const SLUG = 'quotequarry';

const SPY_GATE = [
  "import { appendFileSync } from 'node:fs';",
  'const LOG = process.env.PIPELINE_SPY_LOG;',
  "function rec(fn, args, res) { try { appendFileSync(LOG, JSON.stringify({ mod: 'gate', fn, args, res }) + '\\n'); } catch {} }",
  'export async function evaluateReviewGate(opts = {}) {',
  "  const mode = process.env.PIPELINE_GATE_MODE || 'hold';",
  "  rec('evaluateReviewGate', { slug: opts.slug, jobId: opts.jobId }, { mode });",
  "  if (mode === 'run') return { ok: true, action: 'run', reason: 'approved', gating: { state: 'gated' } };",
  "  return { ok: true, action: 'hold', reason: 'awaiting_review', gating: { state: 'gated' } };",
  '}',
  'export async function resolveGating() { throw new Error("tests must not call this in the pipeline"); }',
  'export async function sweepReviewTimeouts() { return { ok: true, timedOut: 0 }; }',
].join('\n');

const SPY_SCRIPTSTORE = [
  "import { appendFileSync } from 'node:fs';",
  'const LOG = process.env.PIPELINE_SPY_LOG;',
  "function rec(fn, args, res) { try { appendFileSync(LOG, JSON.stringify({ mod: 'scripts', fn, args, res }) + '\\n'); } catch {} }",
  // NOTE: `then` must NOT be intercepted — a promise resolved WITH the store
  // adopts it as a thenable, and an intercepted `then` that never settles
  // deadlocks the awaiting top-level code (exit 13).
  "const store = new Proxy({}, { get: (t, fn) => (fn === 'then' ? undefined : async (...a) => { rec(String(fn), a.length, {}); return { ok: true }; }) });",
  'export function makeScriptStore() { return store; }',
  'export async function getScriptStore() { rec("getScriptStore", 0, {}); return store; }',
  'export default getScriptStore;',
].join('\n');

const SPY_JOBS = [
  "import { appendFileSync } from 'node:fs';",
  'const LOG = process.env.PIPELINE_SPY_LOG;',
  "function rec(fn, args, res) { try { appendFileSync(LOG, JSON.stringify({ mod: 'jobs', fn, args, res }) + '\\n'); } catch {} }",
  'let n = 0;',
  'const EMPTY = { ok: true, job: null, steps: [], artifacts: [] };',
  'const store = {',
  "  async startJob(o = {}) { const id = 'spy-' + (++n); rec('startJob', o, { ok: true, id }); return { ok: true, id }; },",
  "  async recordStep(jobId, idx, name, o = {}) { rec('recordStep', { jobId, idx, name, status: o.status || 'pending' }, { ok: true }); return { ok: true }; },",
  "  async startStep(jobId, idx) { rec('startStep', { jobId, idx }, { ok: true }); return { ok: true }; },",
  "  async finishStep(jobId, idx, o = {}) { rec('finishStep', { jobId, idx, status: o.status, error: o.error }, { ok: true }); return { ok: true }; },",
  "  async indexArtifact() { return { ok: true }; },",
  "  async finishJob(jobId, o = {}) { rec('finishJob', { jobId, status: o.status, error: o.error }, { ok: true }); return { ok: true }; },",
  "  async getJob() { return EMPTY; },",
  "  async latestResumableJob() { return EMPTY; },",
  '};',
  'export async function getJobStore() { rec("getJobStore", 0, {}); return store; }',
  'export default getJobStore;',
].join('\n');

function loaderSource(pipelineHref, redirects) {
  return [
    "import { registerHooks } from 'node:module';",
    'const PIPELINE = ' + JSON.stringify(pipelineHref) + ';',
    'const REDIRECTS = ' + JSON.stringify(redirects) + ';',
    'registerHooks({',
    '  resolve(specifier, context, nextResolve) {',
    '    const res = nextResolve(specifier, context);',
    '    if (context && context.parentURL === PIPELINE && res && res.url) {',
    "      const m = res.url.match(/\\/lib\\/(job-store|script-store|review-gate)\\.mjs$/);",
    "      if (m && REDIRECTS[m[1] + '.mjs']) return { url: REDIRECTS[m[1] + '.mjs'], shortCircuit: true };",
    '    }',
    '    return res;',
    '  },',
    '});',
  ].join('\n');
}

function readSpyLog(p) {
  try {
    return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

function runPipeline({ state = {}, args = [], env = {} } = {}) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pipe-t5-'));
  const spyLog = path.join(sandbox, 'spy.jsonl');
  try {
    fs.mkdirSync(path.join(sandbox, 'yt-mcp', 'state'), { recursive: true });
    fs.writeFileSync(path.join(sandbox, 'yt-mcp', 'state', SLUG + '.json'), JSON.stringify(state));
    const redirects = {
      'job-store.mjs': pathToFileURL(path.join(sandbox, 'spy-jobstore.mjs')).href,
      'script-store.mjs': pathToFileURL(path.join(sandbox, 'spy-scriptstore.mjs')).href,
      'review-gate.mjs': pathToFileURL(path.join(sandbox, 'spy-gate.mjs')).href,
    };
    fs.writeFileSync(path.join(sandbox, 'spy-jobstore.mjs'), SPY_JOBS);
    fs.writeFileSync(path.join(sandbox, 'spy-scriptstore.mjs'), SPY_SCRIPTSTORE);
    fs.writeFileSync(path.join(sandbox, 'spy-gate.mjs'), SPY_GATE);
    fs.writeFileSync(path.join(sandbox, 'loader.mjs'), loaderSource(pathToFileURL(PIPELINE).href, redirects));
    // Network-free env (no DATABASE_URL / tokens / NTFY); the state exhausts
    // the quota ledger so no child lane can spawn (T2 harness pattern).
    const childEnv = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, PIPELINE_SPY_LOG: spyLog, ...env };
    const r = spawnSync(process.execPath, ['--import', pathToFileURL(path.join(sandbox, 'loader.mjs')).href, PIPELINE, SLUG, ...args],
      { cwd: sandbox, env: childEnv, encoding: 'utf8', timeout: 180000 });
    return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', spy: readSpyLog(spyLog) };
  } finally {
    try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch { }
  }
}

const QUOTA_BLOCKED_STATE = { uploadsToday: { date: ptDate(), count: 6 } };

describe('#106 T5 pipeline gate block — REVIEW_QUEUE_ENABLED flag pin', () => {
  test('flag UNSET: zero gate/script-store calls on the quota-skip path, no [review] lines, exit 0 (byte-identical)', () => {
    const r = runPipeline({ state: QUOTA_BLOCKED_STATE });
    assert.equal(r.status, 0);
    assert.deepEqual(r.spy, [], 'the flag-off run must not import or call the gate, script store, or job store');
    assert.ok(!/\[review\]/.test(r.stdout), 'no gate log lines');
    assert.ok(r.stdout.includes('PIPELINE COMPLETE'));
    assert.ok(r.stdout.includes('[quota] Shorts production skipped'), 'existing flow unchanged');
  });

  test('flag ON + gate HOLD: slot skipped today, the hold is recorded in job steps (review step + held terminal), exit 0', () => {
    const r = runPipeline({
      state: QUOTA_BLOCKED_STATE,
      env: { REVIEW_QUEUE_ENABLED: '1', JOB_STORE_ENABLED: '1', PIPELINE_GATE_MODE: 'hold' },
    });
    assert.equal(r.status, 0, `a held slot is the S4-era lane terminal — exit 0 like every skip (stderr: ${r.stderr.slice(0, 200)})`);
    assert.match(r.stdout, /\[review\].*held.*awaiting_review/, 'the hold is logged with its reason');
    assert.ok(!r.stdout.includes('Phase 1'), 'no production lane ran into the held slot');
    const review = r.spy.filter((c) => c.mod === 'jobs' && c.fn === 'recordStep').find((c) => c.args.name === 'review');
    assert.ok(review, 'the hold is recorded in T2 job vocabulary');
    assert.equal(review.args.name, 'review');
    const finish = r.spy.filter((c) => c.mod === 'jobs' && c.fn === 'finishStep');
    const reviewFinish = finish.find((c) => c.args.idx === review.args.idx);
    assert.ok(reviewFinish);
    assert.equal(reviewFinish.args.status, 'skipped');
    assert.match(reviewFinish.args.error || '', /awaiting_review/);
    const fin = r.spy.find((c) => c.mod === 'jobs' && c.fn === 'finishJob');
    assert.ok(fin, 'the job closes held');
    assert.equal(fin.args.status, 'held', "D15/D17's 'held' terminal (jobs vocabulary)");
  });

  test('flag ON + gate RUN: production proceeds exactly as today (approved script un-holds the slot)', () => {
    const r = runPipeline({
      state: QUOTA_BLOCKED_STATE,
      env: { REVIEW_QUEUE_ENABLED: '1', JOB_STORE_ENABLED: '1', PIPELINE_GATE_MODE: 'run' },
    });
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('[quota] Shorts production skipped'), 'the run reached the normal flow');
    assert.ok(!r.spy.some((c) => c.mod === 'jobs' && c.fn === 'recordStep' && c.args.name === 'review'), 'no review step on a run');
  });

  test('flag ON without JOB_STORE_ENABLED: the hold still skips the slot (log-only, no job rows)', () => {
    const r = runPipeline({
      state: QUOTA_BLOCKED_STATE,
      env: { REVIEW_QUEUE_ENABLED: '1', PIPELINE_GATE_MODE: 'hold' },
    });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /\[review\].*held/);
    assert.ok(!r.spy.some((c) => c.mod === 'jobs'), 'no job store is constructed without its own flag');
    assert.ok(!r.stdout.includes('Phase 1'));
  });
});

// ===========================================================================
// G. Round 1 (fix round 1/5) — resume dispatch pin, durable route-path failure
//    rows, fail-closed gate ordering, scheduled sweep, day-boundary resume.
// ===========================================================================

// ---- workflow content pins (BLOCKER 1 + MAJOR 4) ---------------------------

const yamlMod = await import('js-yaml');
const yaml = yamlMod.default || yamlMod;
const readWorkflow = (name) => yaml.load(fs.readFileSync(path.join(ROOT, '.github', 'workflows', name), 'utf8'));

describe('#106 T5 round 1 — workflow pins (BLOCKER 1 + MAJOR 4)', () => {
  test('BLOCKER 1: channel-autopilot.yml declares the resume dispatch input and threads the SPACE-form --resume into the run', () => {
    const y = readWorkflow('channel-autopilot.yml');
    const on = y.on ?? y.true; // YAML 1.1 parses a bare `on:` key as boolean true in some loaders
    const inputs = on['workflow_dispatch'].inputs;
    assert.ok(inputs.resume, 'the resume input is DECLARED — GitHub rejects undeclared dispatch inputs with 422, so every approve would fail forever without it');
    const produce = y.jobs.produce;
    const runStep = (produce.steps || []).find((s) => String(s.run || '').includes('node channel-pipeline.mjs'));
    assert.ok(runStep, 'the pipeline run step exists');
    assert.match(
      runStep.run,
      /format\('--resume \{0\}', inputs\.resume\)/,
      'the run threads --resume <job_id> — SPACE form, because channel-pipeline.mjs parses argv.includes("--resume") + the next arg (an --resume=<id> token would be silently ignored)',
    );
  });

  test('MAJOR 4: the approval-timeout sweep is SCHEDULED — warning-probe.yml runs scripts/review-sweep.mjs network-wide on its nightly cron', () => {
    const y = readWorkflow('warning-probe.yml');
    assert.ok(y.on?.schedule, 'the workflow carries the nightly cron');
    const job = y.jobs['review-sweep'];
    assert.ok(job, 'the review-sweep job exists (network-wide — the probe job is a per-channel matrix; the sweep runs ONCE)');
    const run = (job.steps || []).map((s) => s.run || '').find((r) => r.includes('scripts/review-sweep.mjs'));
    assert.ok(run, 'the sweep script is invoked');
  });
});

// ---- fail-closed gate ordering (MAJOR 3) + day-boundary resume (MAJOR 5) ---

describe('#106 T5 round 1 — gate ordering + resume lookup (MAJOR 3, MAJOR 5)', () => {
  test('MAJOR 3: readable GATED registry + NULL script store => HOLD (a store construction failure can no longer fail a gated channel open)', async () => {
    const emit = fakeEmit();
    const r = await evaluateReviewGate(gatedOpts({
      scriptStore: null,
      registryDb: REGISTRY_DB_WITH(assignmentRow()),
      emit,
    }));
    assert.equal(r.action, 'hold', 'C2: without the ledger no approval can be proven — fail-closed');
    assert.equal(r.reason, 'script_store_unavailable');
    const holds = emit.rows.filter((e) => e.code === 'review_hold');
    assert.equal(holds.length, 1, 'the hold is visible (ntfy is the fallback when the row store shares the dead DB)');
  });

  test('MAJOR 3: ungated channel + NULL script store => RUN (AC-P4-5: a dead store never darkens legacy production)', async () => {
    const r = await evaluateReviewGate(gatedOpts({
      scriptStore: null,
      registryDb: REGISTRY_DB_WITH(null),
    }));
    assert.equal(r.action, 'run');
  });

  test('MAJOR 3: gated + script-store READ error => HOLD (never the old { ok:false } continue)', async () => {
    const r = await evaluateReviewGate(gatedOpts({
      scriptStore: { async scriptsForSlot() { return { ok: false, error: 'db down' }; } },
    }));
    assert.equal(r.action, 'hold');
    assert.equal(r.reason, 'script_store_unavailable');
  });

  test('MAJOR 5: a resumed run resolves the approval by the HELD job id — next-day approval proceeds', async () => {
    const r = await evaluateReviewGate(gatedOpts({
      slotDate: '2026-11-02', // the resumed run happens the NEXT day — no slot row exists
      resumeJobId: 'held-job-1',
      scriptStore: {
        async latestForJob(jobId) {
          return { ok: true, script: AWAITING({ id: 's-held', status: 'approved', job_id: jobId }) };
        },
        async scriptsForSlot() { return { ok: true, scripts: [] }; },
      },
    }));
    assert.equal(r.action, 'run');
    assert.equal(r.reason, 'approved_resumed', 'the approval keyed by the held job survives the day boundary');
  });

  test('MAJOR 5: a resumed run whose script is STILL awaiting re-holds (alert keyed by the job)', async () => {
    const emit = fakeEmit();
    const r = await evaluateReviewGate(gatedOpts({
      slotDate: '2026-11-02',
      resumeJobId: 'held-job-1',
      emit,
      scriptStore: {
        async latestForJob() {
          return { ok: true, script: AWAITING({ id: 's-held', status: 'awaiting_review', job_id: 'held-job-1' }) };
        },
        async scriptsForSlot() { return { ok: true, scripts: [] }; },
      },
    }));
    assert.equal(r.action, 'hold');
    assert.equal(r.reason, 'awaiting_review');
  });

  test('minor 6: a STALE last-known-assignment cache (past CACHE_TTL_MS) is treated as no cache — fail-closed', async () => {
    assert.equal(CACHE_TTL_MS, 24 * 3600_000);
    const r = await resolveGating({
      slug: 'legacy-chan', registryDb: BROKEN_DB, templateMeta: () => META_PLAIN,
      cache: { assigned: false, gated: false, checkedAt: new Date(Date.now() - 3 * 24 * 3600_000).toISOString() },
    });
    assert.equal(r.state, 'gated', 'a 3-day-old "legacy" verdict must not answer gating — fail-closed');
    assert.equal(r.failClosed, true);
  });

  test('minor 8: MULTIPLE active assignments are ambiguous — drift (hold + conservative cache)', async () => {
    const r = await resolveGating({
      slug: 'quotequarry',
      registryDb: async () => ({
        async listAssignments() { return [assignmentRow('finance-explainers'), assignmentRow('stats-counters')]; },
      }),
      templateMeta: () => META_FINANCE,
      cache: null,
    });
    assert.equal(r.state, 'drift');
    assert.deepEqual(r.cacheUpdate, { assigned: true, gated: true, checkedAt: r.cacheUpdate.checkedAt });
  });
});

// ---- route-path approve: the durable dispatch-failure row (BLOCKER 2) -------

describe('#106 T5 round 1 — /api/review route path (BLOCKER 2)', () => {
  // The ROUTE is loaded for real ('@/...' aliases mapped to seams), the real
  // script/warnings stores run over one injected SQL fake, and the dispatch
  // fails deterministically (no GITHUB_TOKEN in the fake ENV — zero network).
  async function loadRouteWith(scriptRow) {
    const routeUrl = pathToFileURL(path.join(ROOT, 'studio', 'app', 'api', 'review', 'route.js')).href;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'route-t5-'));
    const write = (name, src) => {
      fs.writeFileSync(path.join(tmp, name), src);
      return pathToFileURL(path.join(tmp, name)).href;
    };
    const sql = (() => {
      const warnRows = [];
      const client = async (sqlText, params) => {
        const s = String(sqlText).replace(/\s+/g, ' ').trim();
        if (s.startsWith('CREATE ') || s.startsWith('DO ') || s.startsWith('ALTER ')) return [];
        if (s.startsWith('SELECT * FROM scripts WHERE id = $1')) return scriptRow ? [scriptRow] : [];
        if (s.startsWith('SELECT status FROM scripts WHERE id = $1')) return scriptRow ? [{ status: scriptRow.status }] : [];
        if (s.startsWith('SELECT id, script_id, url')) return [];
        if (s.startsWith('SELECT id, script_id, claim')) return [];
        if (s.includes("SET status = 'approved'")) { scriptRow.status = 'approved'; return [{ id: scriptRow.id }]; }
        if (s.startsWith('SELECT id, state FROM warnings WHERE dedupe_key')) {
          return warnRows.filter((r) => r.dedupe_key === params[0] && r.state !== 'resolved').map((r) => ({ id: r.id, state: r.state }));
        }
        if (s.startsWith('INSERT INTO warnings')) {
          const m = s.match(/INSERT INTO warnings \(([^)]*)\)/);
          const row = { id: warnRows.length + 1, state: 'open' };
          m[1].split(',').map((c) => c.trim()).forEach((c, i) => { row[c] = params[i]; });
          warnRows.push(row);
          return [{ id: row.id }];
        }
        throw new Error(`route fake db: unexpected sql: ${s.slice(0, 90)}`);
      };
      client.warnRows = warnRows;
      return client;
    })();
    globalThis.__T5_SQL = sql;
    globalThis.__T5_AUDIT = [];
    const fmap = {
      '@/lib/route-auth': write('auth.mjs', 'export async function getUser() { return { email: "owner@test", role: "owner", session_id: 0 }; } export async function requireRole() { return "owner"; }'),
      '@/lib/db.mjs': write('db.mjs', 'export const db = {}; export const dbReady = true; export function dbUnavailable() { return null; }'),
      '@/lib/provider-routing': write('provider.mjs', 'export function adaptPostgres() { return globalThis.__T5_SQL; }'),
      '@/lib/script-store.mjs': pathToFileURL(path.join(ROOT, 'studio', 'lib', 'script-store.mjs')).href,
      '@/lib/warnings-store.mjs': pathToFileURL(path.join(ROOT, 'studio', 'lib', 'warnings-store.mjs')).href,
      '@/lib/data.mjs': write('data.mjs', 'export const ENV = {};'), // no GITHUB_TOKEN — dispatch fails WITHOUT network
      '@/lib/audit': write('audit.mjs', 'export async function appendAudit(...a) { globalThis.__T5_AUDIT.push(a); }'),
      '@/lib/yt-token.mjs': write('yt.mjs', 'export function createAccessToken() { return async () => "at"; }'),
      '@/lib/review-actions.mjs': pathToFileURL(path.join(ROOT, 'studio', 'lib', 'review-actions.mjs')).href, // the REAL module under test's own import — @/ is a Next alias, not a node package
    };
    registerHooks({
      resolve(specifier, context, nextResolve) {
        // Only the route module uses '@/' specifiers in this test process, so
        // matching on the specifier alone is safe (the parentURL check does
        // not survive every loader path here).
        if (fmap[specifier]) {
          return { url: fmap[specifier], shortCircuit: true };
        }
        return nextResolve(specifier, context);
      },
    });
    const route = await import(routeUrl);
    return {
      route,
      sql,
      async post(body) {
        return route.POST({ json: async () => body });
      },
      cleanup() {
        delete globalThis.__T5_SQL;
        delete globalThis.__T5_AUDIT;
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { }
      },
    };
  }

  test('BLOCKER 2: a failed approve dispatch writes the Action-required warning row — approved-but-never-rendered is never silent', async () => {
    const ctx = await loadRouteWith({
      id: 'script-1', channel_id: 'quotequarry', job_id: 'job-9', status: 'awaiting_review', full_render_input: null,
    });
    try {
      const res = await ctx.post({ action: 'approve', id: 'script-1', note: '', disclosure: null });
      assert.equal(res.status, 202, 'the approval STANDS even though the dispatch failed (D16: the owner re-triggers)');
      const body = await res.json();
      assert.equal(body.approved, true);
      assert.equal(body.dispatched, false);
      const rows = ctx.sql.warnRows.filter((r) => r.code === 'approval_dispatch_failed');
      assert.equal(rows.length, 1, 'exactly ONE durable row (AC-P4-22: never a silent approved-but-not-rendered)');
      assert.equal(rows[0].severity, 'action_required');
      assert.equal(rows[0].channel_id, 'quotequarry');
      assert.equal(rows[0].job_id, 'job-9');
      assert.equal(rows[0].dedupe_key, 'quotequarry:approval_dispatch_failed');
      assert.equal(ctx.sql.warnRows.length, 1, 'no other rows');
    } finally {
      ctx.cleanup();
    }
  });
});
