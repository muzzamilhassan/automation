// gitleaks CI secret scan (2026-11-15; audit 2026-11-13 security-06 — GitHub
// secret scanning needs paid Secret Protection on a private personal repo).
// Pins the load-bearing parts of tests.yml's `secrets` job and .gitleaks.toml.
// Spec + QA: docs/qa/secret-scan-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { load } from 'js-yaml';

const wf = load(fs.readFileSync('.github/workflows/tests.yml', 'utf8'));
const job = wf.jobs.secrets;
const run = (job?.steps || []).map((s) => s.run || '').join('\n');

test('tests.yml has a secrets job with full history checkout', () => {
  assert.ok(job, 'secrets job exists');
  const co = job.steps.find((s) => String(s.uses || '').startsWith('actions/checkout'));
  assert.equal(co.with['fetch-depth'], 0, 'the push range needs history');
});

test('gitleaks binary is version- and sha256-pinned', () => {
  assert.match(run, /V=8\.30\.1/);
  assert.match(run, /[0-9a-f]{64} {2}gl\.tgz" \| sha256sum -c -/);
});

test('scans only the pushed range, redacted, with the repo config', () => {
  assert.match(run, /RANGE="\$\{BEFORE\}\.\.HEAD"/);
  assert.match(run, /RANGE="HEAD~1\.\.HEAD"/, 'fallback for dispatch / first push');
  assert.match(run, /gitleaks git --redact --no-banner --config \.gitleaks\.toml --log-opts="\$RANGE"/);
});

test('a finding pages the owner', () => {
  const alert = job.steps.find((s) => /Alert/.test(s.name || ''));
  assert.equal(alert.if, 'failure()');
  assert.match(alert.run, /sendAlert/);
});

test('.gitleaks.toml only silences the generic rule, only under tests/', () => {
  const cfg = fs.readFileSync('.gitleaks.toml', 'utf8');
  assert.match(cfg, /useDefault = true/);
  assert.match(cfg, /targetRules = \["generic-api-key"\]/);
  assert.match(cfg, /paths = \['''\^tests\/'''\]/);
  assert.equal((cfg.match(/\[\[allowlists\]\]/g) || []).length, 1, 'exactly one allowlist');
});
