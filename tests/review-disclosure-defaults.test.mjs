import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// #106 — the /review desk pre-selects the owner's production-style disclosure
// answers. The four official synthetic-media categories (AC-P4-21) render as
// the Yes/No radio pairs they always were — now SEEDED per script with the
// honest answers for the AI-voice + AI-illustrated pipeline (categories 1/2
// No, 3/4 Yes), adjustable per script before approving. The Approve gate is
// UNTOUCHED (all four answered; the route re-checks server-side), and the
// POST payload shape is unchanged (the answers were already the payload).
// House pattern for client-component pins: source-level (cf.
// session-admin / studio-registry-surfaces page.js reads).
// ---------------------------------------------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = fs.readFileSync(path.join(ROOT, 'studio/app/review/page.js'), 'utf8');

describe('#106 — review desk disclosure defaults', () => {
  test('the defaults map pins all four official categories by id: No, No, Yes, Yes', () => {
    assert.match(PAGE, /real_person:\s*false/, 'category 1 (a real person appears to say/do something they didn\'t) defaults No');
    assert.match(PAGE, /alters_footage:\s*false/, 'category 2 (alters footage of a real event or place) defaults No');
    assert.match(PAGE, /realistic_scene:\s*true/, 'category 3 (a realistic scene that didn\'t occur) defaults Yes');
    assert.match(PAGE, /music_focus:\s*false/, 'category 4 defaults No — the catalog is LICENSED music, not AI-generated (the honest production answer; aligned with the page)');
  });

  test('opening a script seeds the disclosure state from the defaults — required scripts only', () => {
    assert.match(PAGE, /setDisclosure\(disclosureDefaults\(d\)\)/, 'open() seeds the disclosure state when the detail loads');
    assert.match(PAGE, /synthetic_media_required !== true\)\s*return \{\}/, 'non-required scripts seed {} — no phantom answers where there is no checklist');
    assert.match(PAGE, /DISCLOSURE_DEFAULTS\[i\.id\]/, 'defaults resolve by category id, keyed to the official text the route validates');
    assert.match(PAGE, /filter\(\(i\) => i\.id in DISCLOSURE_DEFAULTS\)/, 'an unmapped future category stays unanswered (the gate still holds it) — never a silently wrong default');
  });

  test('the one-line production hint renders under the checklist', () => {
    assert.match(PAGE, /Defaults match your standard AI-voice \+ AI-illustrated production — adjust per script if needed\./);
  });

  test('the Approve gate is untouched and the payload still carries the answers', () => {
    assert.match(PAGE, /DISCLOSURE_CATEGORIES\.items\.every\(\(i\) => typeof disclosure\[i\.text\] === 'boolean'\)/, 'disclosureDone gate unchanged (AC-P4-21)');
    assert.match(PAGE, /action: 'approve', id: detail\.script\.id, note, disclosure/, 'the approve POST body shape unchanged');
    assert.match(PAGE, /type="radio"/, 'the categories still render as the selectable Yes/No pairs');
  });
});
