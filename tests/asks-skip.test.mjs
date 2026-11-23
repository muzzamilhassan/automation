// Creator City item 6, follow-up 1 — "Skip it" on an approved-but-unpublished
// script is REAL: script-store skipApproved moves approved + video_id NULL →
// the existing 'rejected' status (no new status; reason in rejected_note),
// atomically. After a skip, approvedNotPublished and the nightly sweep stop
// flagging it, the open alert auto-resolves as "skipped", and the Inbox
// action closes the related warnings too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeScriptStore, SCRIPT_STATUSES } from '../studio/lib/script-store.mjs';
import { sweepApprovedNotPublished } from '../lib/review-gate.mjs';
import { staleReviewReason } from '../studio/lib/notify-policy.mjs';
import { performAskAction } from '../studio/lib/asks-store.mjs';
import { warningAsk, ASK_ACTIONS } from '../studio/lib/asks.mjs';

const SID = '0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b';
const NOW = new Date('2026-11-23T12:00:00.000Z');

// A tiny stateful fake for the three statements this follows: the skip
// UPDATE, the status probe and approvedNotPublished's SELECT.
function scriptsDb(rows) {
  const calls = [];
  const client = async (sql, params) => {
    const q = sql.replace(/\s+/g, ' ').trim();
    calls.push({ q, params });
    if (q.startsWith("UPDATE scripts SET status = 'rejected'") && q.includes("status = 'approved' AND video_id IS NULL")) {
      const r = rows.find((x) => x.id === params[0] && x.status === 'approved' && x.video_id == null);
      if (!r) return [];
      Object.assign(r, { status: 'rejected', rejected_by: params[1], rejected_at: params[2], rejected_note: params[3] });
      return [{ id: r.id }];
    }
    if (q.startsWith('SELECT status FROM scripts WHERE id = $1')) {
      const r = rows.find((x) => x.id === params[0]);
      return r ? [{ status: r.status }] : [];
    }
    if (q.includes("WHERE status = 'approved' AND video_id IS NULL")) {
      return rows.filter((x) => x.status === 'approved' && x.video_id == null);
    }
    return [];
  };
  return { client, calls };
}
const store = (rows) => {
  const { client, calls } = scriptsDb(rows);
  return { s: makeScriptStore({ dbClient: client, now: () => NOW, warn: () => {} }), calls, rows };
};
const approved = () => ({ id: SID, channel_id: 'money-rulebook', title: 'Why banks love debt', status: 'approved', video_id: null, job_id: 'j-0', approval_at: '2026-11-22T08:00:00Z' });

test('no new status: skip reuses rejected (the CHECK constraint is unchanged)', () => {
  assert.deepEqual(SCRIPT_STATUSES, ['draft', 'awaiting_review', 'approved', 'rejected', 'consumed']);
  const src = fs.readFileSync('studio/lib/script-store.mjs', 'utf8');
  assert.match(src, /CHECK \(status IN \('draft','awaiting_review','approved','rejected','consumed'\)\)/);
});

test('WHEN an approved script has no video THEN skipApproved marks it rejected with who/when/why, in ONE guarded UPDATE', async () => {
  const { s, calls, rows } = store([approved()]);
  const r = await s.skipApproved(SID, { by: 'owner@x', reason: 'skipped by owner from Inbox' });
  assert.deepEqual(r, { ok: true, id: SID });
  assert.equal(rows[0].status, 'rejected');
  assert.equal(rows[0].rejected_by, 'owner@x');
  assert.equal(rows[0].rejected_note, 'skipped by owner from Inbox');
  assert.equal(rows[0].rejected_at, NOW);
  const up = calls.find((c) => c.q.startsWith('UPDATE scripts'));
  assert.match(up.q, /WHERE id = \$1 AND status = 'approved' AND video_id IS NULL RETURNING id/);
});

test('WHEN the script already changed (consumed / has a video / rejected) THEN already_changed and nothing is written', async () => {
  for (const over of [{ status: 'consumed', video_id: 'v1' }, { status: 'approved', video_id: 'v1' }, { status: 'rejected' }, { status: 'awaiting_review' }]) {
    const { s, rows } = store([{ ...approved(), ...over }]);
    const r = await s.skipApproved(SID, { by: 'owner@x' });
    assert.deepEqual(r, { ok: false, reason: 'already_changed', status: over.status }, JSON.stringify(over));
    assert.equal(rows[0].status, over.status);
  }
});

test('WHEN the id is unknown or by is missing THEN refused', async () => {
  const { s } = store([]);
  assert.deepEqual(await s.skipApproved(SID, { by: 'owner@x' }), { ok: false, reason: 'not_found' });
  assert.equal((await s.skipApproved(SID, {})).error, 'skipped_by_required');
});

test('WHEN skipped THEN approvedNotPublished and the nightly sweep stop flagging it', async () => {
  const { s } = store([approved()]);
  assert.equal((await s.approvedNotPublished()).scripts.length, 1);
  await s.skipApproved(SID, { by: 'owner@x' });
  assert.equal((await s.approvedNotPublished()).scripts.length, 0);
  const rowsEmitted = [];
  const r = await sweepApprovedNotPublished({ scriptStore: s, warningsStore: {}, emit: async (_w, f) => { rowsEmitted.push(f); return { ok: true }; } });
  assert.deepEqual(r, { ok: true, flagged: 0 });
  assert.equal(rowsEmitted.length, 0);
});

test('WHEN skipped THEN its open approved_not_published alert reads stale as "skipped" (the existing resolver closes it)', () => {
  const w = { code: 'approved_not_published', evidence: `script ${SID} approved …` };
  assert.equal(staleReviewReason(w, { script: { id: SID, status: 'rejected' } }), 'auto-resolved: script rejected (skipped)');
});

test('the Inbox "Skip it" option now names skip_approved_script (a real skip), with a danger confirm', () => {
  assert.ok(ASK_ACTIONS.includes('skip_approved_script'));
  assert.ok(!ASK_ACTIONS.includes('skip_script_alerts'), 'the alerts-only skip is gone');
  const a = warningAsk({ id: '41', channel_id: 'money-rulebook', severity: 'action_required', code: 'approved_not_published', title: 'approved video never published — "X"', evidence: `script ${SID} approved` });
  const skip = a.options.find((o) => o.id === 'skip');
  assert.equal(skip.action, 'skip_approved_script');
  assert.equal(skip.confirm.tone, 'danger');
  assert.match(skip.confirm.body, /never becomes a video/);
});

function deps(over = {}) {
  const log = [];
  return {
    log,
    by: 'owner@x',
    resolveAlerts: async (a) => { log.push(['resolveAlerts', a]); },
    scriptStore: { skipApproved: async (id, o) => { log.push(['skip', id, o]); return { ok: true, id }; } },
    warningsStore: {
      listOpenByCodes: async () => ({ ok: true, rows: [{ id: '41', code: 'approved_not_published', evidence: `script ${SID} approved` }, { id: '50', code: 'approved_not_published', evidence: 'script deadbeef00 approved' }] }),
      resolve: async (id, o) => { log.push(['resolve', id, o]); return { ok: true, id }; },
    },
    ...over,
  };
}

test('skip_approved_script: the script is skipped (reason recorded), THEN this script\'s alerts close', async () => {
  const d = deps();
  const r = await performAskAction({ id: '7', channel: 'money-rulebook' }, { action: 'skip_approved_script', args: { scriptId: SID } }, d);
  assert.equal(r.ok, true);
  const skip = d.log.find((x) => x[0] === 'skip');
  assert.deepEqual(skip.slice(1), [SID, { by: 'owner@x', reason: 'skipped by owner from Inbox' }]);
  assert.deepEqual(d.log.filter((x) => x[0] === 'resolve').map((x) => x[1]), ['41']);
  assert.ok(d.log.findIndex((x) => x[0] === 'skip') < d.log.findIndex((x) => x[0] === 'resolve'), 'skip first, alerts after');
});

test('skip_approved_script: WHEN the script already changed THEN "already changed" and no alert is touched', async () => {
  const d = deps({ scriptStore: { skipApproved: async () => ({ ok: false, reason: 'already_changed', status: 'consumed' }) } });
  const r = await performAskAction({ id: '7', channel: 'money-rulebook' }, { action: 'skip_approved_script', args: { scriptId: SID } }, d);
  assert.equal(r.ok, false);
  assert.match(r.error, /already changed \(consumed\)/);
  assert.ok(!d.log.some((x) => x[0] === 'resolve'));
});

test('skip_approved_script: WHEN the skip worked but the warnings store is down THEN the answer still stands (no stuck ask)', async () => {
  const d = deps({ warningsStore: { listOpenByCodes: async () => { throw new Error('db down'); }, resolve: async () => ({ ok: false }) } });
  const r = await performAskAction({ id: '7', channel: 'money-rulebook' }, { action: 'skip_approved_script', args: { scriptId: SID } }, d);
  assert.equal(r.ok, true);
  assert.equal(r.result, 'skipped; closed 0 alerts');
});
