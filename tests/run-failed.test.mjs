// Live fix wave A4 (T2-01 failure part, 2026-11-20): DFD's run 44656112937
// failed at 07:19 PKT and NOTHING said so — channel-pipeline.mjs only raises
// doc_render_failed. Every failed produce job now raises ONE real
// (action_required) run_failed alert with the run link; a later finished run
// for the channel resolves it. QA: docs/qa/live-fix-wave-a4-qa.md
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildRunFailedAlert, failedStepOf, emitRunFailed } from '../scripts/emit-run-failed.mjs';

const ENV = {
  SLUG: 'debt-free-doctrine',
  GITHUB_RUN_ID: '44656112937',
  GITHUB_SERVER_URL: 'https://github.com',
  GITHUB_REPOSITORY: 'owner/repo',
};

test('R1: WHEN a produce job fails THE alert is action_required run_failed, per channel, per run, with the run link', () => {
  const a = buildRunFailedAlert({ env: ENV, step: 'Install Node Dependencies' });
  assert.equal(a.severity, 'action_required');
  assert.equal(a.code, 'run_failed');
  assert.equal(a.channel_id, 'debt-free-doctrine');
  assert.equal(a.dedupe_key, 'debt-free-doctrine:run_failed:44656112937');
  assert.equal(a.title, "today's run failed — Install Node Dependencies");
  assert.match(a.evidence, /https:\/\/github\.com\/owner\/repo\/actions\/runs\/44656112937/);
  assert.equal(a.blocks_publishing, undefined, 'never parks production');
  assert.equal(buildRunFailedAlert({ env: ENV }).title, "today's run failed");
});

test('R2: WHEN no channel slug is known THE builder refuses (no system-wide guess)', () => {
  assert.equal(buildRunFailedAlert({ env: { ...ENV, SLUG: '' } }), null);
});

test('R3: failedStepOf picks the failed step of THIS channel job from the jobs API payload', () => {
  const jobs = {
    jobs: [
      { name: 'discover', steps: [{ name: 'Checkout', conclusion: 'success' }] },
      { name: 'produce (money-rulebook, MONEY_RULEBOOK)', steps: [{ name: 'Install Node Dependencies', conclusion: 'failure' }] },
      { name: 'produce (debt-free-doctrine, DEBT_FREE_DOCTRINE)', steps: [{ name: '📥 Checkout', conclusion: 'success' }, { name: '🔑 Resolve this channel\'s token', conclusion: 'failure' }] },
    ],
  };
  assert.equal(failedStepOf(jobs, 'debt-free-doctrine'), "🔑 Resolve this channel's token");
  assert.equal(failedStepOf(jobs, 'quotequarry'), null);
  assert.equal(failedStepOf(null, 'x'), null);
});

test('R4: emitRunFailed writes through the injected emitter and never throws', async () => {
  const rows = [];
  const r = await emitRunFailed({ env: ENV, store: {}, emit: async (_s, f) => { rows.push(f); return { ok: true }; }, fetchImpl: async () => { throw new Error('api down'); } });
  assert.equal(r.ok, true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "today's run failed", 'step lookup failure falls back to the plain title');
  const bad = await emitRunFailed({ env: ENV, store: {}, emit: async () => { throw new Error('db down'); }, fetchImpl: async () => ({ ok: false }) });
  assert.equal(bad.ok, false);
});

test('R5: channel-autopilot.yml runs the emitter as the LAST produce step, only on failure, never failing the job further', async () => {
  const { load } = await import('js-yaml');
  const wf = load(fs.readFileSync('.github/workflows/channel-autopilot.yml', 'utf8'));
  const steps = wf.jobs.produce.steps;
  const last = steps[steps.length - 1];
  assert.match(last.name, /failed run/i);
  assert.equal(last.if, '${{ failure() }}');
  assert.equal(last['continue-on-error'], true);
  assert.ok(Number(last['timeout-minutes']) > 0 && Number(last['timeout-minutes']) <= 3, 'short timeout');
  assert.equal(last.run.trim(), 'node scripts/emit-run-failed.mjs');
  assert.equal(last.env.DATABASE_URL, '${{ secrets.DATABASE_URL }}', 'same Neon secret the pipeline uses');
  assert.equal(last.env.NTFY_TOPIC, '${{ secrets.NTFY_TOPIC }}');
  assert.equal(last.env.GH_TOKEN, '${{ github.token }}');
});

test('R6: a finished pipeline run resolves the channel\'s open run_failed alerts', () => {
  const src = fs.readFileSync('channel-pipeline.mjs', 'utf8').replace(/\r\n/g, '\n');
  const end = src.slice(src.indexOf('// ---- Summary ----'));
  assert.match(end, /warnStore\.resolveOpenFor\(\{ channel_id: slug, code: 'run_failed'/);
  assert.ok(end.indexOf("code: 'run_failed'") < end.indexOf('process.exit(0)'), 'before the final exit');
});
