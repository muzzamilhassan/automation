// #112 — pin-tests for the wizard's target-audience slot suggestions.
// Contracts: the preset table is well-formed and unique; every UTC slot is
// exactly the HH:MM shape the schedule/gate code already accepts (EARS 5);
// the suggestion helpers return the preset/null and a stable chip wording;
// an unknown or empty id yields NO suggestion (slot stays untouched, EARS 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUDIENCES, suggestionFor, suggestionText } from '../studio/lib/audiences.js';

test('#112: audience ids are unique and every preset is complete', () => {
  const ids = AUDIENCES.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate audience ids');
  for (const a of AUDIENCES) {
    assert.ok(a.label.length >= 3, `short label for ${a.id}`);
    assert.ok(a.local.length >= 6, `missing local-time label for ${a.id}`);
    assert.ok(a.peak.length >= 3, `missing peak description for ${a.id}`);
  }
});

test('#112: every preset UTC slot is exactly HH:MM — the format the gate already accepts', () => {
  for (const a of AUDIENCES) {
    assert.match(a.utc, /^([01]\d|2[0-3]):[0-5]\d$/, `slot for ${a.id} must be HH:MM 24h, got ${a.utc}`);
  }
});

test('#112: suggestionFor returns the preset for a known id and null otherwise', () => {
  const us = suggestionFor('us-ca');
  assert.equal(us.utc, '00:00');
  assert.equal(suggestionFor('nope'), null);
  assert.equal(suggestionFor(''), null);
  assert.equal(suggestionFor(undefined), null);
});

test('#112: chip wording is stable and mentions UTC, local time, and the peak', () => {
  const text = suggestionText('us-ca');
  assert.match(text, /^Suggested: 00:00 UTC ≈ /);
  assert.match(text, / — evening peak for US & Canada viewers$/);
  assert.match(text, /7:00 pm ET/, 'local-time label appears in the chip');
});

test('#112: an unknown audience produces an empty chip — nothing suggests itself', () => {
  assert.equal(suggestionText('bogus'), '');
  assert.equal(suggestionText(''), '');
});
