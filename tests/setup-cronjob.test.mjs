// External clock for channel-autopilot via cron-job.org (owner 2026-11-15,
// audit #10). The job definition is pure and pinned here — the dangerous part
// is a BLANK dispatch (= every channel, every tick), so the body must always
// carry heartbeat=1. Spec + QA: docs/qa/external-heartbeat-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHeartbeatJob, HEARTBEAT_TITLE, DISPATCH_URL, redactJob } from '../scripts/setup-cronjob.mjs';

const job = buildHeartbeatJob('github_pat_TESTONLY');

test('targets the channel-autopilot dispatch endpoint with POST', () => {
  assert.equal(job.url, DISPATCH_URL);
  assert.equal(DISPATCH_URL, 'https://api.github.com/repos/muzzamilhassan/automation/actions/workflows/channel-autopilot.yml/dispatches');
  assert.equal(job.requestMethod, 1, 'cron-job.org requestMethod 1 = POST');
  assert.equal(job.title, HEARTBEAT_TITLE);
  assert.equal(job.enabled, true);
});

test('body always sends heartbeat=1 on main (never a blank all-channels dispatch)', () => {
  const body = JSON.parse(job.extendedData.body);
  assert.deepEqual(body, { ref: 'main', inputs: { heartbeat: '1' } });
});

test('fires every hour at :05 and :35 UTC — the 30-min spacing the slot gate needs', () => {
  assert.deepEqual(job.schedule, { timezone: 'UTC', expiresAt: 0, hours: [-1], mdays: [-1], minutes: [5, 35], months: [-1], wdays: [-1] });
});

test('GitHub headers carry the dispatch token; failures notify; responses saved', () => {
  const h = job.extendedData.headers;
  assert.equal(h.Authorization, 'Bearer github_pat_TESTONLY');
  assert.equal(h.Accept, 'application/vnd.github+json');
  assert.equal(h['Content-Type'], 'application/json');
  assert.equal(h['X-GitHub-Api-Version'], '2022-11-28');
  assert.equal(job.notification.onFailure, true);
  assert.equal(job.saveResponses, true);
});

test('refuses to build a job without a token', () => {
  assert.throws(() => buildHeartbeatJob(''), /token/);
});

test('redactJob never leaks the token into logs', () => {
  const s = JSON.stringify(redactJob(job));
  assert.doesNotMatch(s, /TESTONLY/);
  assert.match(s, /Bearer \*\*\*/);
});
