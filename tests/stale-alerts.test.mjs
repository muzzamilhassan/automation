// Live fix wave A4 (T2-03 / P12, 2026-11-20): stale review alerts never
// closed. "approval window passed" stayed open for consumed/rejected scripts,
// review_hold stayed open for slots the owner skipped. The auto-resolve
// closes an alert ONLY when its script (or its slot) is no longer waiting on
// the owner — and never touches an alert whose problem is still real.
// QA: docs/qa/live-fix-wave-a4-qa.md
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { staleReviewReason, scriptIdOf, slotDateOf } from '../studio/lib/notify-policy.mjs';
import { resolveStaleReviewAlerts, scriptLookups } from '../studio/lib/warnings-store.mjs';
import { sweepStaleReviewAlerts } from '../lib/review-gate.mjs';
import { approveScriptAndDispatch } from '../studio/lib/review-actions.mjs';
import { withConsumeAlertResolve } from '../studio/lib/script-store.mjs';

const S_CONSUMED = '5115ad32-0000-4000-8000-000000000001';
const S_REJECTED = '9d62f68f-0000-4000-8000-000000000002';
const S_WAITING = 'aaaaaaaa-0000-4000-8000-000000000003';
const S_APPROVED = 'bbbbbbbb-0000-4000-8000-000000000004';

const timeout = (id, sid) => ({ id, channel_id: 'money-rulebook', severity: 'action_required', code: 'review_timeout', state: 'open', title: 'approval window passed — script "X" still awaiting review', evidence: `script ${sid} awaiting since 2026-11-15, deadline passed`, dedupe_key: `money-rulebook:review_timeout:${sid}` });
const hold = (id, slot, sid = null) => ({ id, channel_id: 'money-rulebook', severity: 'action_required', code: 'review_hold', state: 'open', title: `waiting for your approval — slot ${slot} held`, evidence: sid ? `script ${sid} awaiting_review (slot ${slot})` : `no script record for slot ${slot}`, dedupe_key: `money-rulebook:review_hold:${slot}` });
const anp = (id, sid) => ({ id, channel_id: 'money-rulebook', severity: 'action_required', code: 'approved_not_published', state: 'open', title: 'approved video never published — "X"', evidence: `script ${sid} approved 2026-11-17 for slot 2026-11-17; video_id still empty after 6h`, dedupe_key: `money-rulebook:approved_not_published:${sid}` });
const dispatchFailed = (id, sid) => ({ id, channel_id: 'money-rulebook', severity: 'action_required', code: 'approval_dispatch_failed', state: 'open', title: 'approval recorded but the resume dispatch FAILED', evidence: `script ${sid}, job j1 — github 500`, dedupe_key: 'money-rulebook:approval_dispatch_failed' });
const sc = (id, status, extra = {}) => ({ id, channel_id: 'money-rulebook', status, video_id: null, slot_date: '2026-11-16', ...extra });

// ---- pure rules -----------------------------------------------------------
test('S1: scriptIdOf reads the script id from any review alert (not "script record")', () => {
  assert.equal(scriptIdOf(timeout(1, S_CONSUMED)), S_CONSUMED);
  assert.equal(scriptIdOf(anp(2, S_APPROVED)), S_APPROVED);
  assert.equal(scriptIdOf(dispatchFailed(3, S_APPROVED)), S_APPROVED);
  assert.equal(scriptIdOf(hold(4, '2026-11-16', S_WAITING)), S_WAITING);
  assert.equal(scriptIdOf(hold(5, '2026-11-16')), null, '"no script record" is not an id');
  assert.equal(scriptIdOf({ code: 'upload_ghost', evidence: `script ${S_WAITING}` }), null, 'only review alerts link');
  assert.equal(slotDateOf(hold(6, '2026-11-14')), '2026-11-14');
});

test('S2: WHEN the cited script was consumed THE alert resolves with the video id in the note', () => {
  const note = staleReviewReason(timeout(1, S_CONSUMED), { script: sc(S_CONSUMED, 'consumed', { video_id: 'oXAT8NGLV4Q' }) });
  assert.equal(note, 'auto-resolved: script consumed (video oXAT8NGLV4Q)');
});

test('S3: WHEN the cited script was rejected (skipped) THE alert resolves', () => {
  assert.match(staleReviewReason(timeout(1, S_REJECTED), { script: sc(S_REJECTED, 'rejected') }), /^auto-resolved: script rejected/);
});

test('S4: WHEN the script was approved THE wait alerts resolve, but approved-not-published stays', () => {
  assert.match(staleReviewReason(timeout(1, S_APPROVED), { script: sc(S_APPROVED, 'approved') }), /^auto-resolved: script approved/);
  assert.equal(staleReviewReason(anp(2, S_APPROVED), { script: sc(S_APPROVED, 'approved') }), null, 'approved but no video is still real');
  assert.equal(staleReviewReason(dispatchFailed(3, S_APPROVED), { script: sc(S_APPROVED, 'approved') }), null, 'a failed dispatch stays until a dispatch works');
  assert.match(staleReviewReason(dispatchFailed(3, S_APPROVED), { script: sc(S_APPROVED, 'approved'), dispatchedScriptId: S_APPROVED }), /dispatch/);
});

test('S5: WHILE the script is still awaiting review THE alert never resolves', () => {
  assert.equal(staleReviewReason(timeout(1, S_WAITING), { script: sc(S_WAITING, 'awaiting_review') }), null);
  assert.equal(staleReviewReason(hold(2, '2026-11-16', S_WAITING), { script: sc(S_WAITING, 'awaiting_review'), slotScripts: [sc(S_WAITING, 'awaiting_review')] }), null);
});

test('S6: WHEN the script state is unknown (lookup failed) THE alert never resolves', () => {
  assert.equal(staleReviewReason(timeout(1, S_CONSUMED), { script: null }), null);
  assert.equal(staleReviewReason(hold(2, '2026-11-16'), { slotScripts: null }), null);
});

test('S7: a slot hold resolves only when NO script for that slot is still waiting', () => {
  // the cited script was rejected but a newer one for the same slot waits: still real
  const slot = [sc(S_WAITING, 'awaiting_review'), sc(S_REJECTED, 'rejected')];
  assert.equal(staleReviewReason(hold(1, '2026-11-16', S_REJECTED), { script: sc(S_REJECTED, 'rejected'), slotScripts: slot }), null);
  // every script for the slot is done: resolved, with the newest outcome
  assert.equal(staleReviewReason(hold(2, '2026-11-16', 'x'), { slotScripts: [sc('878cf931-0000-4000-8000-000000000005', 'consumed', { video_id: 'vid16' })] }), 'auto-resolved: script consumed (video vid16)');
  assert.match(staleReviewReason(hold(3, '2026-11-14'), { slotScripts: [sc(S_REJECTED, 'rejected', { slot_date: '2026-11-14' })] }), /^auto-resolved: slot skipped/);
  // a slot with no script at all stays (the problem may still be real)
  assert.equal(staleReviewReason(hold(4, '2026-11-14'), { slotScripts: [] }), null);
});

test('S8: the ledger-unavailable hold and non-review alerts are never auto-resolved here', () => {
  const ledger = { ...hold(1, '2026-11-16'), title: 'review-gated channel held — script ledger unavailable', dedupe_key: 'money-rulebook:review_hold:store_unavailable' };
  assert.equal(staleReviewReason(ledger, { slotScripts: [sc(S_REJECTED, 'rejected')] }), null);
  assert.equal(staleReviewReason({ code: 'token_revoked', evidence: `script ${S_CONSUMED}` }, { script: sc(S_CONSUMED, 'consumed', { video_id: 'v' }) }), null);
});

// ---- store-level resolver --------------------------------------------------
function fakeWarnings(rows) {
  const resolved = [];
  return {
    resolved,
    listOpenByCodes: async ({ codes, channelId = null }) => ({ ok: true, rows: rows.filter((r) => codes.includes(r.code) && (!channelId || r.channel_id === channelId) && r.state !== 'resolved') }),
    resolve: async (id, { by, note }) => { resolved.push({ id, by, note }); return { ok: true, id }; },
  };
}
const fakeScripts = (byId) => ({
  getScript: async (id) => ({ ok: true, script: byId[id] ?? null, sources: [], claims: [] }),
  scriptsForSlot: async (ch, d) => ({ ok: true, scripts: Object.values(byId).filter((s) => s.channel_id === ch && s.slot_date === d) }),
  approve: async () => { throw new Error('never approves'); },
  reject: async () => { throw new Error('never rejects'); },
  markConsumed: async () => { throw new Error('never consumes'); },
});

test('S9: resolveStaleReviewAlerts closes the live examples and keeps the real ones', async () => {
  const ws = fakeWarnings([
    timeout(1, S_CONSUMED), // 5115ad32 consumed -> oXAT8NGLV4Q
    timeout(2, S_REJECTED), // 9d62f68f rejected
    hold(3, '2026-11-16', '878cf931-0000-4000-8000-000000000005'), // consumed
    hold(4, '2026-11-17'), // skipped by the owner on 11-19 (rejected)
    timeout(5, S_WAITING), // still waiting — must stay
    anp(6, S_APPROVED), // approved, no video — must stay
  ]);
  const ss = fakeScripts({
    [S_CONSUMED]: sc(S_CONSUMED, 'consumed', { video_id: 'oXAT8NGLV4Q', slot_date: '2026-11-15' }),
    [S_REJECTED]: sc(S_REJECTED, 'rejected', { slot_date: '2026-11-15' }),
    '878cf931-0000-4000-8000-000000000005': sc('878cf931-0000-4000-8000-000000000005', 'consumed', { video_id: 'v16', slot_date: '2026-11-16' }),
    r17: sc('r17', 'rejected', { slot_date: '2026-11-17' }),
    [S_WAITING]: sc(S_WAITING, 'awaiting_review', { slot_date: '2026-11-20' }),
    [S_APPROVED]: sc(S_APPROVED, 'approved', { slot_date: '2026-11-18' }),
  });
  const r = await resolveStaleReviewAlerts(ws, { ...scriptLookups(ss) });
  assert.equal(r.ok, true);
  assert.deepEqual(ws.resolved.map((x) => x.id).sort(), [1, 2, 3, 4]);
  assert.equal(ws.resolved.find((x) => x.id === 1).note, 'auto-resolved: script consumed (video oXAT8NGLV4Q)');
  assert.ok(ws.resolved.every((x) => x.by === 'auto-resolve'), 'audited as the auto-resolver');
  assert.equal(r.resolved.length, 4);
});

test('S10: a lookup failure keeps every alert open (never resolve on unknown)', async () => {
  const ws = fakeWarnings([timeout(1, S_CONSUMED), hold(2, '2026-11-16')]);
  const broken = { getScript: async () => ({ ok: false, error: 'db down' }), scriptsForSlot: async () => ({ ok: false, error: 'db down' }) };
  const r = await resolveStaleReviewAlerts(ws, { ...scriptLookups(broken) });
  assert.equal(r.ok, true);
  assert.equal(ws.resolved.length, 0);
});

test('S11: the nightly sweep runs the resolver over every channel; missing stores answer honestly', async () => {
  const ws = fakeWarnings([timeout(1, S_CONSUMED), timeout(2, S_WAITING)]);
  const ss = fakeScripts({ [S_CONSUMED]: sc(S_CONSUMED, 'consumed', { video_id: 'v1' }), [S_WAITING]: sc(S_WAITING, 'awaiting_review') });
  const r = await sweepStaleReviewAlerts({ scriptStore: ss, warningsStore: ws });
  assert.equal(r.ok, true);
  assert.equal(r.resolved, 1);
  assert.deepEqual(ws.resolved.map((x) => x.id), [1]);
  assert.equal((await sweepStaleReviewAlerts({ scriptStore: null, warningsStore: ws })).ok, false);
  assert.equal((await sweepStaleReviewAlerts({ scriptStore: ss, warningsStore: null })).ok, false);
  const src = fs.readFileSync('scripts/review-sweep.mjs', 'utf8');
  assert.match(src, /sweepStaleReviewAlerts\(/, 'wired into the nightly sweep');
});

// ---- decision-time hooks ----------------------------------------------------
test('S12: approving a script resolves its open wait alerts at decision time', async () => {
  const calls = [];
  const store = {
    getScript: async () => ({ ok: true, script: { id: S_APPROVED, channel_id: 'money-rulebook', job_id: 'j1', full_render_input: {} } }),
    approve: async () => ({ ok: true }),
  };
  const free = async (url) => (String(url).includes('/dispatches') ? { status: 204, ok: true, text: async () => '' } : { ok: true, json: async () => ({ workflow_runs: [] }) });
  const r = await approveScriptAndDispatch({ scriptStore: store, scriptId: S_APPROVED, by: 'owner', token: 't', repo: 'o/r', fetchImpl: free, resolveAlerts: async (o) => { calls.push(o); } });
  assert.equal(r.dispatched, true);
  assert.deepEqual(calls, [{ channelId: 'money-rulebook', dispatchedScriptId: S_APPROVED }]);
  // a resolver that throws never breaks the approval
  const r2 = await approveScriptAndDispatch({ scriptStore: store, scriptId: S_APPROVED, by: 'owner', token: 't', repo: 'o/r', fetchImpl: free, resolveAlerts: async () => { throw new Error('boom'); } });
  assert.equal(r2.approved, true);
});

test('S13: the /api/review route resolves alerts after approve, reject and a working redispatch', () => {
  const src = fs.readFileSync('studio/app/api/review/route.js', 'utf8').replace(/\r\n/g, '\n');
  assert.match(src, /import \{ makeWarningsStore, emitWarning, resolveStaleReviewAlerts, scriptLookups \} from '@\/lib\/warnings-store\.mjs';/);
  assert.match(src, /resolveAlerts: resolveAlertsFor\(s\)/, 'approve path');
  const reject = src.slice(src.indexOf("body.action === 'reject'"), src.indexOf("body.action === 'redispatch'"));
  assert.match(reject, /await resolveAlertsFor\(s\)\(\{ channelId: /);
  const redispatch = src.slice(src.indexOf("body.action === 'redispatch'"), src.indexOf("body.action === 'pick-thumb'"));
  assert.match(redispatch, /dispatchedScriptId: g\.script\.id/);
});

test('S14: consuming a script (upload write-back) resolves its alerts, never changes the consume result', async () => {
  const calls = [];
  const base = {
    markConsumed: async (id, vid) => ({ ok: true, id }),
    getScript: async (id) => ({ ok: true, script: { id, channel_id: 'money-rulebook', status: 'consumed', video_id: 'v1' } }),
  };
  const wrapped = withConsumeAlertResolve(base, { getWarningsStore: async () => ({ fake: true }), resolver: async (ws, o) => { calls.push(o.channelId); return { ok: true }; } });
  assert.deepEqual(await wrapped.markConsumed('s1', 'v1'), { ok: true, id: 's1' });
  assert.deepEqual(calls, ['money-rulebook']);
  // resolver failure or a dead warnings store never fails the consume
  const w2 = withConsumeAlertResolve(base, { getWarningsStore: async () => { throw new Error('dead'); } });
  assert.deepEqual(await w2.markConsumed('s1', 'v1'), { ok: true, id: 's1' });
  // a failed consume resolves nothing
  calls.length = 0;
  const w3 = withConsumeAlertResolve({ ...base, markConsumed: async () => ({ ok: false, reason: 'not_open' }) }, { getWarningsStore: async () => ({}), resolver: async (ws, o) => { calls.push(o); } });
  assert.deepEqual(await w3.markConsumed('s1', 'v1'), { ok: false, reason: 'not_open' });
  assert.equal(calls.length, 0);
  // production factory wires it
  assert.match(fs.readFileSync('studio/lib/script-store.mjs', 'utf8'), /return withConsumeAlertResolve\(makeScriptStore\(/);
});

test('S15: warnings store exposes listOpenByCodes + resolveOpenFor over SQL (open rows only)', async () => {
  const { makeWarningsStore } = await import('../studio/lib/warnings-store.mjs');
  const sqls = [];
  const db = async (sql, params) => {
    sqls.push({ sql, params });
    if (/SELECT id FROM warnings WHERE channel_id = \$1 AND code = \$2 AND state <> 'resolved'/.test(sql)) return [{ id: 7 }, { id: 8 }];
    if (/SELECT state FROM warnings WHERE id/.test(sql)) return [{ state: 'open' }];
    if (/SELECT \* FROM warnings/.test(sql)) return [{ id: 1, code: 'review_hold' }];
    return [];
  };
  const store = makeWarningsStore(db);
  const l = await store.listOpenByCodes({ codes: ['review_hold'] });
  assert.equal(l.ok, true);
  assert.equal(l.rows.length, 1);
  const q = sqls.find((x) => /code IN \(\$2\)/.test(x.sql));
  assert.ok(q, 'filters by code list');
  assert.match(q.sql, /state <> 'resolved'/);
  assert.deepEqual(q.params, [null, 'review_hold']);
  const r = await store.resolveOpenFor({ channel_id: 'dfd', code: 'run_failed', by: 'auto-resolve', note: 'auto-resolved: later run finished' });
  assert.deepEqual(r, { ok: true, resolved: 2 });
});
