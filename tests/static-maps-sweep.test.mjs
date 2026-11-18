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
