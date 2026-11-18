// #125 (S-10/S-11/S-12) — the static brand maps are gone; pages read LIVE
// brand data from /api/brands.
//
// Behavioral: deriveBrandList (the route's pure union/dedup/derive core).
// Source scans: no hardcoded slug list anywhere it used to live; the hook +
// route wiring pinned per file.
// Sentinels: the BRAND_META symbol has zero references repo-wide; the
// sidebar/thumbs pages contain no hardcoded channel slugs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { deriveBrandList } from '../studio/lib/brand-list.mjs';

const read = (p) => fs.readFileSync(p, 'utf8');

// ---- R3: behavioral deriveBrandList ----

test('#125 R3: legacy-first union — registry appended, dedup by slug AND label', () => {
  const legacy = {
    'money-rulebook': { label: 'The Money Rulebook', accent: '#E8C15A', active: true },
    'quotequarry': { label: 'Quote Quarry', accent: '#D4AF37', active: true },
  };
  const registry = [
    { slug: 'money-rulebook', label: 'The Money Rulebook', accent: '#3DDC97' }, // dup slug
    { slug: 'yt-bot', label: 'The Money Rulebook', accent: '#FFFFFF' }, // dup label (different slug)
    { slug: 'yt-bot', label: 'YT-BOT', accent: '#0EA5E9' }, // new
  ];
  const out = deriveBrandList(legacy, registry);
  assert.deepEqual(out.map((c) => c.slug), ['money-rulebook', 'quotequarry', 'yt-bot']);
  assert.equal(out[0].accent, '#E8C15A', 'legacy wins for its own slug (registry dup dropped)');
});

test('#125 R3: dormant legacy brands stay hidden; short is DERIVED from the label', () => {
  const legacy = {
    'live-one': { label: 'Live One', accent: '#111111', active: true },
    'dead-one': { label: 'Dead One', accent: '#222222', active: false },
  };
  const out = deriveBrandList(legacy, [{ slug: 'wizard-x', label: 'Wizard X', accent: '#333333' }]);
  assert.deepEqual(out.map((c) => c.slug), ['live-one', 'wizard-x']);
  assert.deepEqual(out.map((c) => c.short), ['LI', 'WI'], 'short = first 2 chars of the label, uppercased');
  assert.equal(out.find((c) => c.slug === 'wizard-x').accent, '#333333');
});

test('#125 R3: accent/short fall back sanely on missing fields', () => {
  const out = deriveBrandList({}, [{ slug: 'no-label' }]);
  assert.deepEqual(out, [{ slug: 'no-label', label: 'no-label', short: 'NO', accent: '#38BDF8' }]);
});

// ---- R1+R2: the route ----

const routeSrc = read('studio/app/api/brands/route.js');

test('#125 R1+R2: /api/brands — auth + fail-closed client scope + zero hardcoded slugs', () => {
  assert.match(routeSrc, /if \(!user\) return Response\.json\(\{ error: 'not signed in' \}, \{ status: 401 \}/);
  assert.match(routeSrc, /slugsForUser\(user\)\.catch\(\(\) => \[\]\)/);
  assert.match(routeSrc, /owned\.includes\(c\.slug\)/);
  // no brand may ever be hardcoded here (the no-static-maps rule for this route)
  for (const banned of ['quotequarry', 'investors-compass', 'money-rulebook', 'debt-free-doctrine', 'yt-bot', 'old-money-code']) {
    assert.ok(!routeSrc.includes(`'${banned}'`), `hardcoded slug '${banned}' in /api/brands`);
  }
});

// ---- R4: sidebar ----

test('#125 R4: sidebar is live — PINNED_CHANNELS symbol gone from the shell', () => {
  const nav = read('studio/components/shell/nav.js');
  assert.ok(!nav.includes('PINNED_CHANNELS'), 'PINNED_CHANNELS deleted from nav.js');
  const shell = read('studio/components/shell/AppShell.js');
  assert.ok(!shell.includes('PINNED_CHANNELS'), 'AppShell no longer imports/uses PINNED_CHANNELS');
  assert.match(shell, /useBrands\(\)/);
  assert.match(shell, /channels: liveChannels/);
  assert.ok(!shell.includes('all 16'), "the 'all 16' literal is gone");
});

// ---- R5: thumbs ----

test('#125 R5: thumbs page — no DEFAULT_CHANNELS, no invented title, honest empty state', () => {
  const src = read('studio/app/thumbs/page.js');
  assert.ok(!src.includes('DEFAULT_CHANNELS'), 'the 16-brand fallback list is deleted');
  assert.ok(!src.includes('Why Your Budget Is Secretly Killing Your Wealth'), 'the invented sample title is gone');
  assert.match(src, /const \[channels, setChannels\] = useState\(\[\]\)/);
  assert.match(src, /setChannels\(\[\]\).*never fake channels/s, 'error path keeps the honest empty state');
});

// ---- R6: BRAND_META is extinct repo-wide ----

test('#125 R6: zero BRAND_META references anywhere in studio/ (sentinel)', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (/\.(js|mjs|jsx)$/.test(f.name) && read(p).includes('BRAND_META')) offenders.push(p);
    }
  };
  walk('studio/app');
  walk('studio/components');
  walk('studio/lib');
  assert.deepEqual(offenders, [], 'BRAND_META must stay extinct (pages use useBrands now)');
});

test('#125: the 8 pages + shell use the live hook; thumbs reads overview directly (by design)', () => {
  for (const p of [
    'studio/app/analytics/page.js', 'studio/app/channels/page.js', 'studio/app/logs/page.js',
    'studio/app/music/page.js', 'studio/app/social/page.js', 'studio/app/topics/page.js',
    'studio/app/videos/page.js', 'studio/app/page.js',
  ]) {
    const src = read(p);
    assert.match(src, /useBrands/, p);
    // every swapped page kept a sane fallback in its mark lookups
    if (src.includes('BRAND[')) assert.match(src, /\|\| ['"]•['"]|var\(--faint\)|var\(--accent\)/, p);
  }
  assert.match(read('studio/app/thumbs/page.js'), /\/api\/overview/);
});

// ---- hook SCOPE guard (2026-11-18 regression: the home page crashed with
// "BRAND is not defined" because the hook was placed in the wrapper component
// while every use lived in an inner one — the build and the source scans
// passed; only a runtime render caught it). Every identifier a hook declares
// must be used ONLY inside the same top-level function that declares it.
// NOTE: regexes are built with String.raw — a `\b` inside a plain template
// literal is a BACKSPACE character, which made the first version of this
// guard pass vacuously (caught by the self-test below).
const HOOK_IDS = ['BRAND', 'openWarningRows', 'warningsCanSee', 'liveChannels'];
function topLevelFnAt(lines, idx) {
  for (let i = idx; i >= 0; i--) {
    const m = /^(?:export default )?function (\w+)|^const (\w+) = \(/.exec(lines[i]);
    if (m) return m[1] || m[2];
  }
  return null;
}
export function hookScopeProblems(src, label = 'src') {
  const lines = src.split(/\r?\n/);
  const problems = [];
  for (const id of HOOK_IDS) {
    const declRe = new RegExp(String.raw`const \{[^}]*\b${id}\b[^}]*\} = use(?:Brands|OpenWarnings)\(\)`);
    const useRe = new RegExp(String.raw`\b${id}\b`);
    const declIdx = lines.findIndex((l) => declRe.test(l));
    const useIdxs = lines
      .map((l, i) => [l.replace(/\/\/.*$/, ''), i])
      .filter(([l, i]) => i !== declIdx && useRe.test(l) && !/^\s*(import|\*)/.test(l))
      .map(([, i]) => i);
    if (!useIdxs.length) continue;
    if (declIdx < 0) { problems.push(`${label}: ${id} used but never declared by its hook`); continue; }
    const owner = topLevelFnAt(lines, declIdx);
    for (const u of useIdxs) {
      const fn = topLevelFnAt(lines, u);
      if (fn !== owner) problems.push(`${label}:${u + 1} ${id} used in ${fn} but declared in ${owner}`);
    }
  }
  return problems;
}

test('#125/#126 hook-scope guard SELF-TEST: it catches the exact home-page bug shape', () => {
  const buggy = [
    'function OverviewContent() {',
    '  return <BrandMark short={BRAND[c.slug]?.short} />;',
    '}',
    'export default function Overview() {',
    '  const { bySlug: BRAND } = useBrands();',
    '  return <OverviewContent />;',
    '}',
  ].join('\n');
  const fixed = [
    'function OverviewContent() {',
    '  const { bySlug: BRAND } = useBrands();',
    '  return <BrandMark short={BRAND[c.slug]?.short} />;',
    '}',
  ].join('\n');
  assert.deepEqual(hookScopeProblems(buggy, 'buggy'), ['buggy:2 BRAND used in OverviewContent but declared in Overview']);
  assert.deepEqual(hookScopeProblems(fixed, 'fixed'), []);
});

test('#125/#126 hook scope: every live hook is declared in the SAME component that uses it', () => {
  const files = [
    'studio/app/page.js', 'studio/app/analytics/page.js', 'studio/app/channels/page.js',
    'studio/app/logs/page.js', 'studio/app/music/page.js', 'studio/app/social/page.js',
    'studio/app/topics/page.js', 'studio/app/videos/page.js', 'studio/components/shell/AppShell.js',
  ];
  const problems = files.flatMap((p) => hookScopeProblems(read(p), p));
  assert.deepEqual(problems, [], problems.join('\n'));
});
