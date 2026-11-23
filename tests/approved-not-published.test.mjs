// Owner report 2026-11-19: Money Rulebook approvals (Nov 14 cancelled, Nov 17
// voice-alignment crash, Nov 18 render timeout) never became videos and
// NOTHING said so. The nightly safety net flags every approved-but-unpublished
// script as a REAL warning — and never publishes/retries/approves anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sweepApprovedNotPublished } from '../lib/review-gate.mjs';

const fakeStore = (scripts, calls = []) => ({
  approvedNotPublished: async (opts) => { calls.push(opts); return { ok: true, scripts }; },
  approve: async () => { throw new Error('the sweep must never approve'); },
  reject: async () => { throw new Error('the sweep must never reject'); },
});

test('flags each approved-but-unpublished script once, as action_required, with a plain next step', async () => {
  const rows = [];
  const calls = [];
  const emit = async (_store, fields) => { rows.push(fields); return { ok: true }; };
  const r = await sweepApprovedNotPublished({
    scriptStore: fakeStore([
      { id: 's17', channel_id: 'money-rulebook', title: 'Congress & Your Wallet', job_id: 'j17', slot_date: '2026-11-17', approval_at: '2026-11-17T08:30:00Z' },
      { id: 's18', channel_id: 'money-rulebook', title: 'Hidden Money Rules', job_id: 'j18', slot_date: '2026-11-18', approval_at: '2026-11-18T04:32:00Z' },
    ], calls),
    warningsStore: {},
    emit,
  });
  assert.equal(r.ok, true);
  assert.equal(r.flagged, 2);
  assert.deepEqual(calls[0], { olderThanHours: 6 }, 'grace window before flagging');
  assert.equal(rows.length, 2);
  for (const w of rows) {
    assert.equal(w.severity, 'action_required', 'a REAL notification (bell + phone)');
    assert.equal(w.code, 'approved_not_published');
    assert.match(w.recommended_action, /Redispatch|reject it to skip/);
  }
  assert.equal(rows[0].dedupe_key, 'money-rulebook:approved_not_published:s17', 'one row per script, never repeated');
});

test('nothing lost → nothing flagged; missing store → honest error', async () => {
  const r = await sweepApprovedNotPublished({ scriptStore: fakeStore([]), warningsStore: {}, emit: async () => ({ ok: true }) });
  assert.deepEqual(r, { ok: true, flagged: 0 });
  assert.equal((await sweepApprovedNotPublished({ scriptStore: null })).ok, false);
});

test('the store query targets approved + no video + older than the grace window', () => {
  const src = fs.readFileSync('studio/lib/script-store.mjs', 'utf8');
  assert.match(src, /WHERE status = 'approved' AND video_id IS NULL/);
  assert.match(fs.readFileSync('scripts/review-sweep.mjs', 'utf8'), /sweepApprovedNotPublished\(/);
});

test('pipeline: a failed doc render raises a real warning and stops saying "not docDay"', () => {
  const src = fs.readFileSync('channel-pipeline.mjs', 'utf8');
  assert.match(src, /code: 'doc_render_failed'/);
  assert.match(src, /severity: 'action_required',\s*\n\s*code: 'doc_render_failed'/);
  assert.match(src, /results\.episodeFailed \? 'doc render FAILED this run/);
  // 105 / 150 min (were 75 / 120): + the emotional voice's 30-min Kaggle hard timeout (docs/qa/emotional-voice-qa.md EV-C)
  assert.match(src, /const DOC_TIMEOUT_MS = 6300000;/);
  assert.match(fs.readFileSync('.github/workflows/channel-autopilot.yml', 'utf8'), /timeout-minutes: 150/);
});

// Nov 14 died because 3 approvals in 30s made GitHub cancel a WAITING run
// (one pending run per channel). Approving while the channel is busy now
// saves the approval and does NOT dispatch.
test('approve while the channel already has a waiting/running run → saved, not dispatched', async () => {
  const { approveScriptAndDispatch } = await import('../studio/lib/review-actions.mjs');
  let dispatches = 0;
  const fetchImpl = async (url, opts = {}) => {
    if (String(url).includes('/dispatches')) { dispatches += 1; return { status: 204, ok: true, text: async () => '' }; }
    if (String(url).includes('status=queued')) return { ok: true, json: async () => ({ workflow_runs: [{ id: 9, display_title: 'money-rulebook · workflow_dispatch' }] }) };
    return { ok: true, json: async () => ({ workflow_runs: [] }) };
  };
  const store = {
    getScript: async () => ({ ok: true, script: { id: 's1', channel_id: 'money-rulebook', job_id: 'j1', full_render_input: {} } }),
    approve: async () => ({ ok: true }),
  };
  const r = await approveScriptAndDispatch({ scriptStore: store, scriptId: 's1', by: 'owner', token: 't', repo: 'o/r', fetchImpl });
  assert.equal(r.approved, true);
  assert.equal(r.dispatched, false);
  assert.equal(r.deferred, true);
  assert.equal(dispatches, 0, 'never knocks out the waiting run');
  assert.match(r.message, /Redispatch/);
  // free channel → dispatches normally
  const free = async (url) => (String(url).includes('/dispatches') ? { status: 204, ok: true, text: async () => '' } : { ok: true, json: async () => ({ workflow_runs: [] }) });
  const r2 = await approveScriptAndDispatch({ scriptStore: store, scriptId: 's1', by: 'owner', token: 't', repo: 'o/r', fetchImpl: free });
  assert.equal(r2.dispatched, true);
});
