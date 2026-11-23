// Calendar design round 2 (owner 2026-11-23: "best calendar with real icons
// and colours"): every kind has a real lucide icon + its own colour family,
// no emoji/text glyphs remain, and channel colour drives the event pills.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const PAGE = fs.readFileSync(new URL('../studio/app/calendar/page.js', import.meta.url), 'utf8');
const DRAWER = fs.readFileSync(new URL('../studio/components/CalendarDayDrawer.js', import.meta.url), 'utf8');

test('every kind (published, scheduled, waiting, free) has a lucide icon, a word and a colour family', () => {
  for (const kind of ['published', 'scheduled', 'waiting', 'free']) {
    const m = new RegExp(String.raw`${kind}: \{ icon: (\w+), word: '[^']+', color: '[^']+', tint: '[^']+', edge: '[^']+' \}`).exec(DRAWER);
    assert.ok(m, `KIND.${kind} is complete`);
    assert.match(DRAWER, new RegExp(String.raw`import \{[^}]*\b${m[1]}\b[^}]*\} from 'lucide-react'`), `${m[1]} comes from lucide-react`);
  }
  assert.match(DRAWER, /Hourglass/, 'approved-not-out-yet has its own icon');
});

test('no emoji / text glyphs are used as icons any more', () => {
  for (const [name, src] of [['page', PAGE], ['drawer', DRAWER]]) {
    const code = src.replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /[✓⏰📝░]/u, `${name} has no glyph icons`);
    assert.doesNotMatch(code, /glyph/, `${name} no longer uses KIND.glyph`);
  }
});

test('event pills use the channel accent; free slots are dashed; summary bar is the legend + kind filter', () => {
  assert.match(PAGE, /function EventPill/);
  assert.match(PAGE, /borderLeft: `3px solid \$\{b\.accent\}`/);
  assert.match(PAGE, /1px dashed var\(--line-strong\)/);
  assert.match(PAGE, /function KindSummary/);
  assert.match(PAGE, /hiddenKinds/);
});
