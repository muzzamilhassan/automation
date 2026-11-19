// Phase 2 "pocket mode" — the phone bottom tab bar + the two phone jobs
// (approve a script, ack a warning). Source-scan pins: the page/shell files use
// @/ aliases plain node can't resolve. Regexes anchor to code shapes, not prose.
// Plan: research/ui-ux-audit-2026-11-18/09-mobile-responsive.md §4.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const bar = read('studio/components/shell/PocketBar.js');
const review = read('studio/app/review/page.js');
const warnings = read('studio/app/warnings/page.js');

// strip comments so a pin can't be satisfied by prose
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// the className of the first <button> element whose body contains the label
// (never spans into the next <button> or past its </button>; attributes hold
// arrow functions, so a naive [^>]* can't be used)
const buttonClassFor = (src, label) => {
  const re = new RegExp(
    String.raw`<button\b(?:(?!<button\b|<\/button>)[\s\S])*?className="([^"]*)"(?:(?!<button\b|<\/button>)[\s\S])*?` + label,
  );
  const m = code(src).match(re);
  return m ? m[1] : null;
};

test('PocketBar is phones-only, fixed to the bottom, safe-area padded', () => {
  const c = code(bar);
  assert.match(c, /^'use client';/);
  assert.match(c, /className="md:hidden fixed inset-x-0 bottom-0/);
  assert.match(c, /paddingBottom: 'env\(safe-area-inset-bottom\)'/);
  assert.match(c, /export default function PocketBar\(\{ onMore \}\)/);
});

test('PocketBar has exactly the four tabs: Today /, Approve /review, Alerts /warnings, More (drawer)', () => {
  const c = code(bar);
  assert.match(c, /href: '\/', label: 'Today'/);
  assert.match(c, /href: '\/review', label: 'Approve'/);
  assert.match(c, /href: '\/warnings', label: 'Alerts'/);
  assert.match(c, /onClick=\{\(\) => onMore\?\.\(\)\}/, 'More opens the existing drawer via the onMore prop');
  assert.match(c, /<span>More<\/span>/);
  assert.match(c, /grid grid-cols-4/);
});

test('PocketBar tap targets are >=44px in px (root font is 14px, so rem sizes would undershoot)', () => {
  const c = code(bar);
  assert.match(c, /min-h-\[56px\] min-w-\[44px\]/);
  assert.doesNotMatch(c, /\bmin-h-(?:10|11|12)\b/, 'no rem-based min-h utilities');
});

test('PocketBar active state comes from usePathname()', () => {
  const c = code(bar);
  assert.match(c, /const pathname = usePathname\(\)/);
  assert.match(c, /const active = isActive\(t\.href, pathname\)/);
  assert.match(c, /aria-current=\{active \? 'page' : undefined\}/);
});

test('PocketBar badges are live counts — never hardcoded, hidden when unknown', () => {
  const c = code(bar);
  // Approve: one /api/review fetch; non-OK (401/403/503) -> null -> no badge
  assert.equal((c.match(/fetch\('\/api\/review'\)/g) || []).length, 1);
  assert.match(c, /r\.ok \? r\.json\(\) : null/);
  assert.match(c, /Array\.isArray\(d\?\.scripts\) \? d\.scripts\.length : null/);
  assert.match(c, /<CountBadge n=\{reviewCount\}/);
  // Alerts: the shared hook, real row count only when the caller can see it
  assert.match(c, /useOpenWarnings\(\)/);
  assert.match(c, /warnCanSee \? <CountBadge n=\{warnRows\.length\}/);
  // the badge renders nothing for a non-positive / non-number count
  assert.match(c, /if \(typeof n !== 'number' \|\| !\(n > 0\)\) return null;/);
  // no literal number is ever passed as a badge count
  assert.doesNotMatch(c, /<CountBadge n=\{\d/);
  assert.doesNotMatch(c, /useState\(\d+\)/);
});

test('PocketBar: a failed warnings check shows a grey "?" — never a number, never all-clear', () => {
  const c = code(bar);
  assert.match(c, /if \(warnStatus === 'error'\) return <UnknownDot \/>;/);
  assert.match(c, /function UnknownDot\(\)[\s\S]*?>\s*\?\s*<\/span>/); // CRLF-safe
  assert.match(c, /color: 'var\(--muted\)'/);
});

test('PocketBar uses the design kit: t-NN type, CSS vars, no hex text colors', () => {
  const c = code(bar);
  assert.doesNotMatch(c, /text-\[\d/);
  assert.doesNotMatch(c, /color: '#/);
  assert.match(c, /t-11/);
});

test('review: Approve / Reject are real kit buttons, >=44px on phones', () => {
  const approve = buttonClassFor(review, 'Approve \\+ resume run');
  const reject = buttonClassFor(review, 'Reject');
  assert.ok(approve, 'Approve button found');
  assert.ok(reject, 'Reject button found');
  assert.match(approve, /\bbtn btn-primary\b/);
  assert.match(reject, /\bbtn btn-danger\b/);
  for (const cls of [approve, reject]) assert.match(cls, /min-h-\[44px\] md:min-h-0/);
  // behavior intact: disclosure gate + reject confirm unchanged
  assert.match(review, /disabled=\{busy === 'approve' \|\| !disclosureDone\}/);
  assert.match(review, /'Reject this script\? It never uploads and the slot is skipped today\.'/);
});

test('review: the script|sources pair stacks on phones (no forced 2 columns)', () => {
  const c = code(review);
  assert.doesNotMatch(c, /className="px-5 pb-5 grid grid-cols-2 gap-5"/);
  assert.match(c, /grid grid-cols-1 md:grid-cols-2 gap-5/);
});

test('review: the other phone taps (back, pick, disclosure yes/no) are 44px targets', () => {
  assert.match(buttonClassFor(review, '← Back to queue'), /btn[\s\S]*min-h-\[44px\]/);
  assert.match(buttonClassFor(review, 'pick'), /btn btn-outline btn-sm min-h-\[44px\]/);
  assert.match(code(review), /<label key=\{String\(v\)\} className="[^"]*min-h-\[44px\]/);
});

test('review: the Phase 0 error card survives', () => {
  assert.match(review, /Can&apos;t load the review queue/);
  assert.match(review, /<button className="btn btn-outline mt-3" onClick=\{load\}>Try again<\/button>/);
});

test('warnings: Acknowledge / Re-check / Resolve are >=44px kit buttons on phones', () => {
  for (const label of ['Acknowledge', 'Re-check', 'Resolve', 'Re-check all parked channels']) {
    const cls = buttonClassFor(warnings, label);
    assert.ok(cls, `${label} button found`);
    assert.match(cls, /\bbtn\b/, `${label} uses the kit button`);
    assert.match(cls, /min-h-\[44px\] md:min-h-0/, `${label} is 44px tall on phones`);
  }
  // resolve still requires a note
  assert.match(warnings, /disabled=\{busy === `resolve-\$\{w\.id\}` \|\| !note\.trim\(\)\}/);
});

test('warnings: no horizontal overflow — rows wrap, actions drop below on phones', () => {
  const c = code(warnings);
  assert.match(c, /className="flex flex-col gap-3 md:flex-row md:items-start"/);
  assert.match(c, /className="flex flex-wrap items-center gap-2 md:shrink-0"/);
  assert.doesNotMatch(c, /className="w-40 /, 'the fixed-width resolve input is gone');
  assert.match(c, /grid grid-cols-1 sm:grid-cols-3/);
  assert.match(c, /t-12 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted/);
});

test('warnings: the Phase 0 error card survives', () => {
  assert.match(warnings, /Can&apos;t load warnings/);
  assert.match(warnings, /\['blocking', 'action_required', 'warning', 'advisory', 'informational'\]/);
});
