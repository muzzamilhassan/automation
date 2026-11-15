// Admin-panel review 2026-11-15: "Save & review" on /channels/add?edit= called
// saveProfile(false) -> startAutopilot:false -> api/channels/profile set
// entry.autopilot = false -> lib/schedule-slot.mjs drops the channel from
// discovery, while the panel kept showing ACTIVE. A profile save must never
// change the autopilot flag unless the owner explicitly starts it.
// Spec + QA: docs/qa/profile-save-autopilot-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync('studio/app/channels/add/page.js', 'utf8');
const route = fs.readFileSync('studio/app/api/channels/profile/route.js', 'utf8');

test('the Save button never sends startAutopilot:false', () => {
  assert.doesNotMatch(page, /saveProfile\(false\)/);
  assert.doesNotMatch(page, /const saveProfile = async \(start = false\)/, 'no default that becomes an explicit false');
});

test('saveProfile only includes startAutopilot when explicitly starting', () => {
  assert.match(page, /\.\.\.\(start === true \? \{ startAutopilot: true \} : \{\}\)/);
});

test('the route still leaves autopilot untouched when the field is absent', () => {
  assert.match(route, /if \(body\.startAutopilot === true\)/);
  assert.match(route, /else if \(body\.startAutopilot === false\)/, 'an explicit API false still works (deliberate stop)');
});
