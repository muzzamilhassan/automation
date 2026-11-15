// Step C0 (docs/superpowers/specs/2026-11-16-neon-single-source-of-truth-design.md):
// nightly encrypted Neon backup, verified by a real restore into a throwaway
// Postgres 18 + pgvector container, kept 30 days as GitHub Release assets.
// Pure checks live in lib/backup-verify.mjs. Spec + QA: docs/qa/db-backup-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { load } from 'js-yaml';
import { compareCounts, assetsToPrune, backupAssetName } from '../lib/backup-verify.mjs';

test('compareCounts: identical restore passes', () => {
  assert.deepEqual(compareCounts({ channels: 13, scripts: 10 }, { channels: 13, scripts: 10 }), []);
});

test('compareCounts: a missing table fails', () => {
  assert.match(compareCounts({ channels: 13, scripts: 10 }, { channels: 13 }).join(' '), /scripts missing/);
});

test('compareCounts: a table restored with far fewer rows fails; small live drift is tolerated', () => {
  assert.match(compareCounts({ jobs: 100 }, { jobs: 40 }).join(' '), /jobs/);
  assert.deepEqual(compareCounts({ sessions: 44 }, { sessions: 42 }), [], 'rows deleted during the dump (session cleanup) are tolerated');
  assert.deepEqual(compareCounts({ warnings: 182 }, { warnings: 185 }), [], 'rows added during the dump are fine');
});

test('compareCounts: a non-empty source table restored empty always fails', () => {
  assert.match(compareCounts({ channels: 3 }, { channels: 0 }).join(' '), /channels/);
});

test('compareCounts: an empty source refuses to pass (backup of nothing)', () => {
  assert.match(compareCounts({}, {}).join(' '), /no tables/);
});

test('backupAssetName is dated and encrypted', () => {
  assert.equal(backupAssetName('2026-11-16'), 'neon-2026-11-16.dump.age');
});

test('assetsToPrune keeps the last 30 days, deletes older, ignores other files', () => {
  const names = ['neon-2026-11-16.dump.age', 'neon-2026-10-18.dump.age', 'neon-2026-10-17.dump.age', 'neon-2026-09-01.dump.age', 'README.txt'];
  assert.deepEqual(assetsToPrune(names, '2026-11-16', 30).sort(), ['neon-2026-09-01.dump.age', 'neon-2026-10-17.dump.age']);
});

test('workflow: nightly + manual, restore-verified, age-encrypted to the public key, 30-day release retention, alert on failure', () => {
  const wf = load(fs.readFileSync('.github/workflows/db-backup.yml', 'utf8'));
  const on = wf.on || wf[true];
  assert.ok(on.schedule?.length && on.workflow_dispatch !== undefined);
  const job = wf.jobs.backup;
  assert.match(job.services.pg.image, /^pgvector\/pgvector:pg18$/);
  const run = job.steps.map((s) => s.run || '').join('\n');
  assert.match(run, /pg_dump/);
  assert.match(run, /pg_restore/);
  assert.match(run, /scripts\/db-backup-verify\.mjs/);
  assert.match(run, /age -r "\$AGE_RECIPIENT"/);
  assert.match(JSON.stringify(job), /age1gpffacrsmrxanq5snz5vc7qvvrhd9whvdaq7274nw4y6n7efxpssp2harz/);
  assert.match(run, /--keep-days 30/);
  assert.doesNotMatch(run, /AGE-SECRET-KEY/, 'the private key never appears in CI');
  const alert = job.steps.find((s) => /Alert/.test(s.name || ''));
  assert.equal(alert.if, 'failure()');
});
