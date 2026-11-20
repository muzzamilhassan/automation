// J1: Reports card lists the real daily reports (Actions artifacts), downloadable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { artifactsToReports, mergeReports, reportDayFromIso } from '../studio/lib/reports-list.mjs';

test('report day is the owner (PKT) day of the artifact', () => {
  assert.equal(reportDayFromIso('2026-11-19T21:30:00Z'), '2026-11-20');
  assert.equal(reportDayFromIso('nope'), null);
});

test('only live reports-<run_id> artifacts, newest per day, newest first', () => {
  const rows = artifactsToReports([
    { id: 1, name: 'reports-100', created_at: '2026-11-18T02:00:00Z', size_in_bytes: 5000 },
    { id: 2, name: 'reports-101', created_at: '2026-11-19T02:00:00Z', size_in_bytes: 6000 },
    { id: 3, name: 'reports-102', created_at: '2026-11-19T03:00:00Z', size_in_bytes: 7000 },
    { id: 4, name: 'report-fragment-quotequarry', created_at: '2026-11-19T02:00:00Z' },
    { id: 5, name: 'reports-99', created_at: '2026-11-01T02:00:00Z', expired: true },
  ]);
  assert.deepEqual(rows.map((r) => [r.when, r.artifactId]), [['2026-11-19', 3], ['2026-11-18', 1]]);
  assert.equal(rows[0].name, 'daily-report-2026-11-19.xlsx');
  assert.equal(rows[0].source, 'actions');
});

test('merge keeps legacy repo files for days without an artifact', () => {
  const merged = mergeReports([{ name: 'daily-report-2026-11-19.xlsx', when: '2026-11-19', source: 'actions' }], [{ name: 'daily-report-2026-09-19.xlsx', when: '2026-09-19' }, { name: 'daily-report-2026-11-19.xlsx', when: '2026-11-19' }]);
  assert.deepEqual(merged.map((r) => r.when), ['2026-11-19', '2026-09-19']);
});

test('the reports route lists artifacts and serves downloads via a redirect (owner/staff only)', () => {
  const src = fs.readFileSync('studio/app/api/reports/route.js', 'utf8');
  assert.match(src, /actions\/artifacts/);
  assert.match(src, /artifactsToReports/);
  assert.match(src, /searchParams\.get\('download'\)/);
  assert.match(src, /requireRole\(req, \['owner', 'staff'\]\)/);
});

for (const wf of ['reporting-daily', 'channel-autopilot', 'warning-probe']) {
  test(`${wf}: the per-channel token goes to GITHUB_ENV with a heredoc delimiter (multi-line safe)`, () => {
    const yml = fs.readFileSync(`.github/workflows/${wf}.yml`, 'utf8');
    assert.match(yml, /echo "\$\{ENV_NAME\}<<\$\{DELIM\}"/);
    assert.ok(!/echo "\$\{ENV_NAME\}=\$\{DYN_TOKEN\}" >> "\$GITHUB_ENV"/.test(yml), 'the single-line form broke on multi-line tokens (yt-bot, since 11-17)');
  });
}
