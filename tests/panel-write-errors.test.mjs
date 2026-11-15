// Admin-panel review 2026-11-15 (panel bug #5): registry helpers swallowed
// failed repo writes and returned ok, and the Channels pause toggle ignored the
// response and reloaded 60s-cached overview data — a failed pause looked like
// success, a successful one looked like it "didn't stick".
// Spec + QA: docs/qa/panel-write-errors-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const reg = fs.readFileSync('studio/lib/channels-registry.js', 'utf8');
const fnBody = (name) => {
  const s = reg.indexOf(`export async function ${name}`);
  const e = reg.indexOf('\nexport ', s + 10);
  return reg.slice(s, e === -1 ? undefined : e);
};

test('setChannelAutopilot: a failed repo write throws (never a silent ok)', () => {
  const b = fnBody('setChannelAutopilot');
  assert.doesNotMatch(b, /catch \{ \}/, 'no empty catch');
  assert.match(b, /await writeRepoJSON\(REG_PATH/);
  assert.match(b, /warnings/, 'a DB mirror failure is reported as a warning');
});

test('removeChannel: a failed repo write throws', () => {
  const b = fnBody('removeChannel');
  assert.doesNotMatch(b, /catch \{ \}/);
});

test('disconnect route reports a registry failure after revoking', () => {
  const r = fs.readFileSync('studio/app/api/channels/registry/route.js', 'utf8');
  assert.match(r, /try \{\s*await removeChannel\(/);
  assert.match(r, /status: 502/);
});

test('Channels pause toggle checks the response, shows errors, reloads fresh', () => {
  const p = fs.readFileSync('studio/app/channels/page.js', 'utf8');
  assert.match(p, /if \(!r\.ok\)/);
  assert.match(p, /setFlowMsg\(/);
  assert.match(p, /\/api\/overview\?fresh=1/);
});
