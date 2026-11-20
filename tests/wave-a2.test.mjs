// Live fix wave A2 (2026-11-20 live test) — wiring pins for the wizard and the
// profile route, plus T4-11 (duplicate channel names).
//   T4-11: the wizard warns when a typed name matches another channel's
//   (case-insensitive), and the live brand list de-dupes by SLUG only — the
//   old label de-dupe hid a real second channel from the sidebar.
// Components import '@/…' so they are pinned by source scans (CRLF-safe).
// Spec + QA: docs/qa/live-fix-wave-a2-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { deriveBrandList, findLabelClash } from '../studio/lib/brand-list.mjs';

const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const PAGE = read('studio/app/channels/add/page.js');
const ROUTE = read('studio/app/api/channels/profile/route.js');
const WIZ = (f) => read(`studio/components/wizard/${f}`);

// ---- T4-11 ----
test('D1 two channels with the same name both stay in the brand list (de-dupe by slug only)', () => {
  const out = deriveBrandList(
    { quotequarry: { label: 'Quote Quarry', accent: '#F5E31C', active: true } },
    [{ slug: 'quotequarry', label: 'Quote Quarry' }, { slug: 'quote-quarry-2', label: 'quote quarry', accent: '#111111' }],
  );
  assert.deepEqual(out.map((c) => c.slug), ['quotequarry', 'quote-quarry-2']);
});

test('D2 a typed name that matches another channel (any case, extra spaces) is found; the channel itself is not', () => {
  const chans = [{ slug: 'quotequarry', label: 'Quote Quarry' }, { slug: 'yt-bot', label: 'YT-BOT' }];
  assert.equal(findLabelClash('  quote QUARRY ', chans, 'new-one')?.slug, 'quotequarry');
  assert.equal(findLabelClash('Quote Quarry', chans, 'quotequarry'), null, 'editing a channel never clashes with itself');
  assert.equal(findLabelClash('Quote Quarry 2', chans, ''), null);
  assert.equal(findLabelClash('', chans, ''), null);
  assert.equal(findLabelClash('x', undefined, ''), null);
});

test('D3 the identity step shows the warning from the live channel list', () => {
  const id = WIZ('IdentityStep.js');
  assert.match(id, /import \{ findLabelClash \} from '@\/lib\/brand-list\.mjs'/);
  assert.match(id, /const clash = findLabelClash\(form\.label, channels, selfSlug\);/);
  assert.match(id, /Another channel is already called/);
  assert.match(PAGE, /<IdentityStep\s+form=\{form\}\s+channels=\{reg\.channels\}\s+selfSlug=\{connectedSlug\}/);
});

// ---- T4-18 wiring ----
test('K5 every key chip in the wizard uses the honest channelKeyStatus', () => {
  for (const f of ['ConnectedChannels.js', 'ConnectStep.js']) {
    const src = WIZ(f);
    assert.match(src, /import \{ channelKeyStatus as keyStatus[^}]*\} from '@\/lib\/edit-prefill\.mjs'/, f);
    assert.doesNotMatch(src, /import \{[^}]*\bkeyStatus\b[^}]*\} from '@\/lib\/wizard-steps\.mjs'/, `${f}: no raw keyStatus`);
  }
  assert.match(PAGE, /sections=\{withReviewKeyRow\(reviewSummary\(/);
});

// ---- T4-02 wiring ----
test('P1 edit prefill reads the engine order and the static brand kit from the profile route', () => {
  assert.match(PAGE, /\.\.\.engineFormValues\(entry, legacy\),/);
  assert.match(PAGE, /prefill\(d\.channel, d\.legacy \|\| null\)/);
  assert.match(ROUTE, /return Response\.json\(\{ ok: true, channel: stripTokenMaterial\(entry\), legacy \}\);/);
  // the old empty-field reads are gone
  assert.doesNotMatch(PAGE, /slots: Array\.isArray\(entry\.slots\) \? entry\.slots\.join/);
});

test('P2 "Edit setup" from the list loads the saved profile (not the bare registry row)', () => {
  const edit = PAGE.slice(PAGE.indexOf('const editChannel'), PAGE.indexOf('if (!reg) return'));
  assert.match(edit, /loadProfile\(c\.slug, reg\?\.channels\);/);
  assert.doesNotMatch(edit, /prefill\(c\)/);
});

test('P3 an edit Save sends only changed fields; create still sends the whole profile', () => {
  assert.match(PAGE, /const payload = editing && savedForm\.current \? editPayload\(full, profileBody\(savedForm\.current\)\) : full;/);
  assert.match(PAGE, /\.\.\.payload,\s*\.\.\.\(start === true \? \{ startAutopilot: true \} : \{\}\)/);
  assert.match(PAGE, /savedForm\.current = next;/);
  assert.match(PAGE, /savedForm\.current = null;/, 'reset forgets the loaded form');
});

test('P4 the profile route guards filled fields before applying the body', () => {
  assert.match(ROUTE, /import \{ protectFilledFields \} from '@\/lib\/edit-prefill\.mjs'/);
  const guardAt = ROUTE.indexOf('const guard = protectFilledFields(body, entry);');
  assert.ok(guardAt > 0);
  assert.ok(guardAt < ROUTE.indexOf('if (body.label)'), 'the guard runs before any field is applied');
  assert.match(ROUTE, /body = guard\.body;/);
});
