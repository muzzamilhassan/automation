// Audit 2026-11-13 #7b (ci-cd-04 / ops-cost-04). CI Doctor paged on EVERY
// run while any channel had a problem (3 runs/day; investors-compass STALE
// for 420h → ~50 identical pushes, 72 comments on issue #90) and exited 1,
// which skipped the report-commit step (report frozen at 10-30, "0 problems").
// planDoctorAlerts decides what to send from the previous report:
//   new / changed problem -> alert now; recovery -> one "recovered" push;
//   ongoing unchanged problem -> at most one reminder per reminderHours.
// Spec + QA: docs/qa/doctor-alerts-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planDoctorAlerts, doctorExitCode } from '../lib/doctor-alerts.mjs';

const NOW = new Date('2026-11-15T12:00:00Z');
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600000).toISOString();
const ok = (slug) => ({ slug, status: 'OK' });
const stale = (slug, h = 420) => ({ slug, status: 'STALE', lastUploadHours: h });

test('first time a channel goes bad -> alert now and remember it', () => {
  const prev = { results: [ok('ic'), ok('mr')] };
  const p = planDoctorAlerts(prev, [stale('ic'), ok('mr')], NOW);
  assert.deepEqual(p.alertNow.map((r) => r.slug), ['ic']);
  assert.deepEqual(p.reminders, []);
  assert.deepEqual(p.recovered, []);
  assert.deepEqual(p.alerts, { ic: { status: 'STALE', at: NOW.toISOString() } });
});

test('an unchanged ongoing problem is NOT re-paged within the reminder window', () => {
  const prev = { results: [stale('ic')], alerts: { ic: { status: 'STALE', at: hoursAgo(8) } } };
  const p = planDoctorAlerts(prev, [stale('ic', 428)], NOW);
  assert.equal(p.alertNow.length + p.reminders.length, 0, 'no push 8h after the last one');
  assert.deepEqual(p.alerts.ic, { status: 'STALE', at: hoursAgo(8) }, 'the last-alert time is kept');
});

test('an ongoing problem gets ONE reminder after 24h', () => {
  const prev = { results: [stale('ic')], alerts: { ic: { status: 'STALE', at: hoursAgo(25) } } };
  const p = planDoctorAlerts(prev, [stale('ic', 445)], NOW);
  assert.deepEqual(p.reminders.map((r) => r.slug), ['ic']);
  assert.equal(p.alertNow.length, 0);
  assert.equal(p.alerts.ic.at, NOW.toISOString(), 'the reminder resets the clock');
});

test('a problem that CHANGES kind (STALE -> ERROR) alerts immediately', () => {
  const prev = { results: [stale('ic')], alerts: { ic: { status: 'STALE', at: hoursAgo(1) } } };
  const p = planDoctorAlerts(prev, [{ slug: 'ic', status: 'ERROR', error: 'invalid_grant' }], NOW);
  assert.deepEqual(p.alertNow.map((r) => r.slug), ['ic']);
});

test('recovery -> one "recovered" entry, and the alert memory is cleared', () => {
  const prev = { results: [stale('ic')], alerts: { ic: { status: 'STALE', at: hoursAgo(3) } } };
  const p = planDoctorAlerts(prev, [ok('ic')], NOW);
  assert.deepEqual(p.recovered, ['ic']);
  assert.equal(p.alerts.ic, undefined);
  const again = planDoctorAlerts({ results: [ok('ic')], alerts: p.alerts }, [ok('ic')], NOW);
  assert.deepEqual(again.recovered, [], 'recovery is announced once');
});

test('no previous report (first run / legacy report without alerts) -> current problems alert once', () => {
  assert.deepEqual(planDoctorAlerts(null, [stale('ic')], NOW).alertNow.map((r) => r.slug), ['ic']);
  assert.deepEqual(planDoctorAlerts({ at: 'x', problems: 0, results: [ok('ic')] }, [stale('ic')], NOW).alertNow.map((r) => r.slug), ['ic']);
});

test('a broken workflow file is a problem like any channel (slug "workflows")', () => {
  const p = planDoctorAlerts({ results: [] }, [{ slug: 'workflows', status: 'BROKEN_WORKFLOW', error: 'x.yml' }], NOW);
  assert.deepEqual(p.alertNow.map((r) => r.slug), ['workflows']);
});

test('doctorExitCode: red only when a due alert could not be delivered (issue #69 "a watchdog that cannot bark")', () => {
  assert.equal(doctorExitCode({ due: false, delivered: false }), 0, 'nothing due -> green even with ongoing problems');
  assert.equal(doctorExitCode({ due: true, delivered: true }), 0, 'alert delivered -> green');
  assert.equal(doctorExitCode({ due: true, delivered: false }), 1, 'alert due but every channel failed -> red');
});

test('wiring: ci-doctor reads the previous report, plans, writes alerts memory, exits via doctorExitCode', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync('ci-doctor.mjs', 'utf8');
  const read = src.indexOf("prevReport = JSON.parse(fs.readFileSync('ci-doctor-report.json'");
  const write = src.indexOf("fs.writeFileSync('ci-doctor-report.json'");
  assert.ok(read > 0 && write > read, 'previous report read before the new one is written');
  assert.match(src, /planDoctorAlerts\(prevReport, results/);
  assert.match(src, /alerts: alertsMemory/);
  assert.match(src, /process\.exitCode = doctorExitCode\(\{ due, delivered \}\)/);
  assert.doesNotMatch(src, /process\.exitCode = 1;/, 'no unconditional red exit');
});

test('wiring: the report commit runs even when the doctor step fails', async () => {
  const fs = await import('node:fs');
  const { load } = await import('js-yaml');
  const wf = load(fs.readFileSync('.github/workflows/ci-doctor.yml', 'utf8'));
  const commit = wf.jobs.doctor.steps.find((s) => /Commit report/.test(s.name || ''));
  assert.equal(commit.if, '${{ !cancelled() }}');
  assert.match(commit.run, /git pull --rebase --autostash origin main/);
});
