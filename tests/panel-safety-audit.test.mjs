// Admin-panel review 2026-11-15 (panel bug #8): no confirmation on bulk /
// destructive actions, mutating routes without an audit row, and no error
// boundaries (a page crash = blank screen). Spec + QA: docs/qa/panel-safety-audit-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(p, 'utf8');

test('destructive/bulk actions confirm first', () => {
  const fnHasConfirm = (src, fnStart) => {
    const at = src.indexOf(fnStart);
    assert.ok(at > 0, fnStart);
    return /window\.confirm\(|await confirm\(/.test(src.slice(at, at + 600)); // useConfirm() dialog replaced window.confirm
  };
  assert.ok(fnHasConfirm(read('studio/app/production/page.js'), 'const setAll = async'), 'Pause/Resume everything');
  assert.ok(fnHasConfirm(read('studio/components/TemplateAssignPanel.js'), 'const unassign = async'), 'template unassign');
  // wave A1 (T3-11): remove only edits the local draft — the Save that writes it confirms
  assert.ok(fnHasConfirm(read('studio/components/ProviderRoutingPanel.js'), 'const saveChanges ='), 'provider routing save');
});

test('mutating routes leave an audit row', () => {
  const cases = {
    'studio/app/api/channels/profile/route.js': ['profile-save'],
    'studio/app/api/templates/assign/route.js': ['template-assign', 'template-unassign'],
    'studio/app/api/providers/route.js': ['provider-set-route', 'provider-deactivate-route'],
    'studio/app/api/create-video/route.js': ['create-video'],
  };
  for (const [f, actions] of Object.entries(cases)) {
    const s = read(f);
    assert.match(s, /import \{ appendAudit \} from '@\/lib\/audit';/, f);
    for (const a of actions) assert.ok(s.includes(`'${a}'`) && new RegExp(String.raw`appendAudit\([^;]*'${a}'`).test(s), `${f}: ${a}`);
  }
});

test('error boundary and 404 page exist', () => {
  const err = read('studio/app/error.js');
  assert.match(err, /^'use client';/);
  assert.match(err, /onClick=\{\(\) => reset\(\)\}/);
  assert.ok(fs.existsSync('studio/app/not-found.js'));
});
