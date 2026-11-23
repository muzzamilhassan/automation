// Owner bug 2026-11-23: "when I click on a template and select one and click
// on Assign and pin, it's not working."
//
// Reproduced on production (channel drawer → Templates): the click DOES post
// /api/templates/assign, but for most channel × template pairs the server's
// compatibility validator refuses it (422 niche_mismatch — e.g. QuoteQuarry
// can use 1 of 19 templates). The panel rendered that refusal (and the success
// message too) at the very END of the drawer body, under ~19 demo cards —
// measured at y≈2127 in a 900px viewport, never on screen. Nothing on the
// card warned about the niche either (only format mismatch had a chip).
// So the button looked dead.
//
// Pinned here:
//  1. pickBlockers() — the pure client-side preview of the validator's
//     channel-shape checks (format / niche / deprecated) — agrees with
//     validateAssignment() for every real template × real-shaped channel.
//  2. the panel shows the assign answer in the drawer's sticky footer, next to
//     the button (always on screen), never at the end of the scrolling body.
//  3. cards and the footer say "niche mismatch" BEFORE the owner clicks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pickBlockers } from '../studio/lib/templates-gallery.mjs';
import { TEMPLATES_DATA } from '../studio/lib/templates-catalog.js';
import { REGISTRY_META } from '../studio/lib/template-registry.data.js';
import { loadRegistryTemplates, validateAssignment } from '../studio/lib/template-registry.js';

const PANEL = fs.readFileSync(new URL('../studio/components/TemplateAssignPanel.js', import.meta.url), 'utf8');
const { templates } = loadRegistryTemplates(TEMPLATES_DATA, REGISTRY_META);

// channel configs shaped exactly like channelConfigFromRegistryEntry() output
// for the live channels (niches = main niche + sub-niches, formats from longSlot)
const CONFIGS = [
  { formats: ['short', 'long'], niches: ['Personal finance rules & money habits', 'frugal living rules'], brand_kit: true },
  { formats: ['short', 'long'], niches: ['Timeless wisdom, self-mastery & human psychology', 'stoic rules for modern life'], brand_kit: true },
  { formats: ['short', 'long'], niches: ['Old money habits & quiet wealth'], brand_kit: true },
  { formats: ['short'], niches: [], brand_kit: false },
  { formats: ['short'], niches: ['History stories'], brand_kit: true },
  null,
];
const CHANNEL_SHAPE = new Set(['format_mismatch', 'niche_mismatch', 'deprecated_template']);

test('pickBlockers agrees with the server validator on every channel-shape check', () => {
  assert.ok(templates.length > 0);
  for (const t of templates) {
    for (const cfg of CONFIGS) {
      // all capabilities + renderer available → only channel-shape codes remain
      const caps = new Proxy({}, { get: () => true });
      const v = validateAssignment(t.registry, cfg, caps);
      const server = v.ok ? [] : v.reasons.map((r) => r.code).filter((c) => CHANNEL_SHAPE.has(c));
      assert.deepEqual(pickBlockers(t.registry, cfg), server, `${t.templateId} × ${JSON.stringify(cfg?.niches)}`);
    }
  }
});

test('pickBlockers names the owner-hit case: a finance template on QuoteQuarry is a niche mismatch', () => {
  const caseFiles = templates.find((t) => t.templateId === 'mr-case-files-storybook');
  assert.ok(caseFiles, 'catalog has mr-case-files-storybook');
  assert.deepEqual(pickBlockers(caseFiles.registry, CONFIGS[1]), ['niche_mismatch']);
  assert.deepEqual(pickBlockers(caseFiles.registry, CONFIGS[0]), []);
  assert.deepEqual(pickBlockers(null, CONFIGS[0]), []);
});

const sliceBetween = (src, start, end) => {
  const a = src.indexOf(start);
  const b = src.indexOf(end, a + 1);
  assert.ok(a >= 0 && b > a, `${start} … ${end}`);
  return src.slice(a, b);
};

test('the assign answer renders in the sticky footer, not at the end of the scrolling body', () => {
  const body = sliceBetween(PANEL, 'const body = (', 'const footer = ');
  const footer = sliceBetween(PANEL, 'const footer = ', 'return wrap(body, footer, dirty);');
  assert.doesNotMatch(body, /\{msg \?/, 'the result message must not sit under the card list');
  assert.match(footer, /\{msg \?/, 'the result message sits next to Assign & pin');
  assert.match(footer, /role="status"/, 'announced to screen readers');
  assert.match(footer, /Assign &amp; pin/);
});

test('niche (and format) mismatches show on the card and in the footer before the click', () => {
  assert.match(PANEL, /import \{[^}]*pickBlockers[^}]*\} from '@\/lib\/templates-gallery\.mjs'/);
  assert.match(PANEL, /<Chip tone="warn">niche mismatch<\/Chip>/);
  assert.match(PANEL, /<Chip tone="warn">format mismatch<\/Chip>/);
  const footer = sliceBetween(PANEL, 'const footer = ', 'return wrap(body, footer, dirty);');
  assert.match(footer, /pickedBlockers/, 'the footer warns about the selected template');
});
