// docs/qa/facts-first-qa.md A1–A7 — unanswered scripts, approved only with checked facts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { decideAutoApprove, autoApproveHours, parseAutoApproveHours, autoApproveLine } from '../studio/lib/auto-approve.mjs';
import { runAutoApprove } from '../scripts/auto-approve.mjs';
import { disclosureAnswersComplete } from '../studio/lib/review-actions.mjs';

const NOW = new Date('2026-11-26T08:00:00Z');
const ago = (h) => new Date(NOW.getTime() - h * 3600_000).toISOString();
const OK = { status: 'passed', sources: 4, verified: 6, problems: [] };
const script = (over = {}, fc = OK) => ({ id: 's1', channel_id: 'demo', kind: 'doc', status: 'awaiting_review', title: 'T', created_at: ago(3), full_render_input: fc ? { hook: 'x', factCheck: fc } : { hook: 'x' }, ...over });
const ch = (over = {}) => ({ slug: 'demo', autopilot: true, kit: {}, ...over });
const act = (s, c = ch(), x = {}) => decideAutoApprove({ script: s, channel: c, now: NOW, ...x }).action;

test('two hours without an answer and checked facts → approved; earlier → waits', () => {
  assert.equal(act(script()), 'approve');
  assert.equal(act(script({ created_at: ago(1.9) })), 'wait');
});

test('facts not passed, no sources, or written before the check → never approved', () => {
  assert.equal(act(script({}, { ...OK, status: 'failed', problems: ['chapter 2: number 42'] })), 'needs_you');
  assert.equal(act(script({}, { ...OK, problems: ['x'] })), 'needs_you');
  assert.equal(act(script({}, { ...OK, sources: 0 })), 'needs_you');
  assert.equal(act(script({}, null)), 'skip');
  assert.equal(act(script({ full_render_input: JSON.stringify({ factCheck: OK }) })), 'approve', 'the stored JSON may arrive as text');
});

test('paused, switched off, set to wait, stale, or already approved → not approved', () => {
  assert.equal(act(script(), ch({ autopilot: false })), 'skip');
  assert.equal(act(script(), null), 'skip');
  assert.equal(act(script(), ch(), { pausedUntil: '2099-12-31' }), 'skip');
  assert.equal(act(script(), ch(), { pausedUntil: '2026-11-25' }), 'approve', 'a pause that is over');
  assert.equal(act(script(), ch({ kit: { autoApproveHours: 0 } })), 'skip');
  assert.equal(act(script({ created_at: ago(60) })), 'skip');
  assert.equal(act(script({ status: 'rejected' })), 'skip');
  assert.equal(act(script(), ch(), { alreadyApproved: true }), 'wait');
  assert.equal(act(script({ kind: 'short' })), 'skip');
});

test('the panel setting: 2 hours unless set; junk is refused', () => {
  assert.equal(autoApproveHours({}), 2);
  assert.equal(autoApproveHours({ autoApproveHours: 8 }), 8);
  assert.equal(act(script({ created_at: ago(5) }), ch({ kit: { autoApproveHours: 8 } })), 'wait');
  assert.equal(autoApproveHours({ autoApproveHours: 'soon' }), 2);
  assert.deepEqual(parseAutoApproveHours('0'), { ok: true, value: 0 });
  assert.equal(parseAutoApproveHours(3).ok, false);
});

test('the Review line says what will happen', () => {
  assert.match(autoApproveLine(script({ created_at: ago(1) }), {}, NOW, () => '2:00 pm'), /4 sources\. If you don't answer, it is approved at 2:00 pm/);
  assert.match(autoApproveLine(script({}, { ...OK, status: 'failed', problems: ['a', 'b'] }), {}, NOW), /2 sentences could not be matched to a source\. It waits for you/);
  assert.match(autoApproveLine(script({}, null), {}, NOW), /not checked/);
  assert.match(autoApproveLine(script(), { autoApproveHours: 0 }, NOW), /always waits/);
});

function rig(scripts, { approved = {}, states = {} } = {}) {
  const calls = { approve: [], emit: [] };
  return {
    calls,
    run: (extra = {}) => runAutoApprove({
      store: {
        pendingFor: async () => ({ ok: true, scripts }),
        getScript: async (id) => ({ ok: true, script: scripts.find((s) => s.id === id) }),
        latestApproved: async (c) => ({ ok: true, script: approved[c] || null }),
      },
      channels: [ch(), ch({ slug: 'two' })],
      stateOf: (s) => states[s] || {},
      approve: async (a) => { calls.approve.push(a); return { ok: true, approved: true, dispatched: true }; },
      emit: async (f) => { calls.emit.push(f); },
      now: () => NOW,
      log: () => {},
      ...extra,
    }),
  };
}

test('run: approves the newest once per channel with the full checklist answered, alerts on failed facts', async () => {
  const r = rig([script({ id: 'old', created_at: ago(6) }), script({ id: 'new' }), script({ id: 'bad', channel_id: 'two' }, { ...OK, status: 'failed', problems: ['number 42 is not in its source'] })]);
  await r.run();
  assert.deepEqual(r.calls.approve.map((a) => a.scriptId), ['new']);
  assert.equal(r.calls.approve[0].by, 'auto-approve');
  assert.equal(disclosureAnswersComplete(r.calls.approve[0].disclosure), true);
  assert.deepEqual(r.calls.emit.map((e) => [e.channel_id, e.code, e.dedupe_key]), [['two', 'script_facts_unverified', 'two:script_facts_unverified:bad']]);
});

test('run: a dry run, a paused channel and a video already on its way approve nothing', async () => {
  for (const [opts, extra] of [[{}, { dry: true }], [{ states: { demo: { pausedUntil: '2099-01-01' } } }, {}], [{ approved: { demo: { approval_at: ago(1), video_id: null } } }, {}]]) {
    const r = rig([script()], opts);
    await r.run(extra);
    assert.equal(r.calls.approve.length, 0);
  }
  const doneEarlier = rig([script()], { approved: { demo: { approval_at: ago(1), video_id: 'abc' } } });
  await doneEarlier.run();
  assert.equal(doneEarlier.calls.approve.length, 1, 'the last approved one is already a video');
});

test('the scheduler runs it on every tick, with the right to start the render', () => {
  const y = fs.readFileSync(new URL('../.github/workflows/channel-autopilot.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const job = y.slice(y.indexOf('  auto-approve:'));
  assert.match(job, /github\.event_name == 'schedule' \|\| inputs\.heartbeat == '1'/);
  assert.match(job, /actions: write/);
  assert.match(job, /node scripts\/auto-approve\.mjs/);
});

test('A9: only the owner can change the setting, checked before any write', () => {
  const r = fs.readFileSync(new URL('../studio/app/api/channels/schedule/route.js', import.meta.url), 'utf8');
  const guard = r.indexOf("if (user.role !== 'owner')", r.indexOf('rawApprove !== undefined'));
  assert.ok(guard > 0 && guard < r.indexOf('await writeRepoJSON(FILE'));
});
