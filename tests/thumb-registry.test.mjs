import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// #106 Phase 5 T2d — the thumbnail template registry: the 17 needsPhoto:false
// launch set over the EXISTING 42-design v2 catalog, the loader (fail-closed,
// closed D17 niche vocabulary), the rotation selection (never back-to-back),
// the clamping + 0/1-eligible fallbacks, and the SEAM pins: candidate 1 stays
// today's frame thumbnail (thumbFrameOffset(0) === 3, the regression pin) and
// candidates 2..N come from the registry through the UNCHANGED Phase 4
// emission path (meta.thumb_candidates [{idx,url,hash}]).
// Spec: docs/superpowers/specs/2026-11-01-phase5-catalog-spec.md D10-D14,
// AC-P5-11..14. CI-portable: fixture entries + fixture tokens only — no real
// brand kits, no tokens, no network, no DB.
// ---------------------------------------------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

import { CANONICAL_NICHES } from '../studio/lib/niches.js';
import {
  loadThumbRegistry,
  thumbSetFor,
  pickCandidates,
  uniqueDesigns,
  thumbRenderTokens,
} from '../studio/lib/thumb-registry.mjs';

// QA Row 11's verbatim pool (docs/qa/phase5-catalog-qa.md): the 17
// needsPhoto:false designs, in catalog declaration order.
const QA_POOL = [
  'blackout', 'whitespace', 'focal-cut', 'big-number', 'price-fight',
  'slab-quote', 'serif-frame', 'gold-standard', 'terminal', 'bungee-sign',
  'redact', 'ledger', 'screen', 'plinth', 'coinflip', 'marquee', 'pillar',
  // + Left Stack (2026-11-23): the one photo design — its photo is a video frame
  'left-stack',
];

const idsOf = (designs) => designs.map((d) => d.id);
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'studio/lib/thumb-catalog.json'), 'utf8'));
const catalogById = new Map(catalog.templates.map((t) => [t.id, t]));

// ---------------------------------------------------------------------------
// AC-P5-11 — the launch registry: 17 needsPhoto:false entries, closed vocabulary
// ---------------------------------------------------------------------------

describe('T2d — the launch registry data (AC-P5-11, QA Row 11)', () => {
  test('the registry is exactly the 17 needsPhoto:false designs the QA file names + Left Stack, in catalog order', () => {
    const { designs, invalid } = loadThumbRegistry();
    assert.equal(designs.length, 18, `the 17-design v1 pool + Left Stack, got ${designs.length}`);
    assert.deepEqual(idsOf(designs), QA_POOL);
    assert.deepEqual(invalid, [], 'the shipped launch set validates clean');
  });

  test('every entry binds to a real catalog design that is needsPhoto:false, or declares photo:frame (Ruling 6 — no photo hunting)', () => {
    const { designs } = loadThumbRegistry();
    for (const d of designs) {
      const spec = catalogById.get(d.id);
      assert.ok(spec, `${d.id} must exist in thumb-catalog.json`);
      if (spec.needsPhoto) assert.equal(d.photo, 'frame', `${d.id} is a photo design — it must take its photo from the video frame`);
      assert.ok(d.label && d.category, `${d.id} joins the catalog label/category for the panel`);
    }
    assert.deepEqual(designs.filter((d) => catalogById.get(d.id).needsPhoto).map((d) => d.id), ['left-stack'], 'Left Stack is the only photo design');
  });

  test('photo:frame is the only photo source, and only it unlocks a photo design', () => {
    const { designs, invalid } = loadThumbRegistry([
      { id: 'ketchup', niches: ['History stories'], photo: 'frame' }, // photo design + frame = accepted
      { id: 'shout', niches: ['History stories'] }, // photo design without photo:frame = rejected
      { id: 'left-stack', niches: ['History stories'], photo: 'stock' }, // unsupported source
      { id: 'left-stack', niches: ['History stories'] }, // photo design without the frame declaration
    ]);
    assert.deepEqual(idsOf(designs), ['ketchup']);
    assert.equal(invalid.length, 3);
    assert.ok(invalid[1].errors.some((m) => /photo: "stock" is not supported/.test(m)));
    assert.ok(invalid[2].errors.some((m) => /declare photo: 'frame'/.test(m)));
  });

  test('the D17 vocabulary pin: every niches[] string is a member of the closed set', () => {
    const { designs } = loadThumbRegistry();
    for (const d of designs) {
      assert.ok(Array.isArray(d.niches) && d.niches.length > 0, `${d.id} declares niches`);
      for (const n of d.niches) {
        assert.ok(CANONICAL_NICHES.includes(n), `${d.id} niche ${JSON.stringify(n)} must copy CANONICAL_NICHES exactly`);
      }
    }
  });

  test('per-niche coverage: EVERY canonical launch string holds >= 2 designs (the QA Row 11 bar)', () => {
    for (const niche of CANONICAL_NICHES) {
      const set = thumbSetFor(niche);
      assert.ok(set.length >= 2, `niche ${JSON.stringify(niche)} has ${set.length} designs, needs >= 2`);
    }
  });

  test('the loader is fail-closed: unknown catalog id, needsPhoto:true id, and a paraphrased niche are ALL rejected with every error named', () => {
    const fixture = [
      { id: 'not-a-design', niches: ['History stories'] },
      { id: 'ketchup', niches: ['History stories'] }, // real id, but needsPhoto:true
      { id: 'ledger', niches: ['History rulez'] }, // paraphrase
      { id: 'ledger', niches: ['Not in the vocabulary', 42, ''] }, // all-errors-collected, never first-only
      { id: 'plinth', niches: ['History stories'] }, // valid — lands
    ];
    const { designs, invalid } = loadThumbRegistry(fixture);
    assert.deepEqual(idsOf(designs), ['plinth'], 'only the valid entry lands; the rest are excluded');
    assert.equal(invalid.length, 4);
    assert.match(invalid[0].errors[0], /not-a-design.*does not exist in the v2 thumb catalog/);
    assert.match(invalid[1].errors[0], /needsPhoto:false/);
    assert.match(invalid[2].errors[0], /closed D17 niche vocabulary/);
    assert.equal(invalid[3].errors.length, 3, 'collects ALL errors, never first-only');
    assert.match(invalid[3].errors[2], /must be a non-empty string/);
  });

  test('the loader never throws on garbage input', () => {
    for (const garbage of [null, undefined, 'x', 42, [null, 42, 'ledger', { niches: ['History stories'] }]]) {
      const r = loadThumbRegistry(garbage);
      assert.ok(Array.isArray(r.designs) && Array.isArray(r.invalid));
    }
    assert.deepEqual(idsOf(loadThumbRegistry([null, 42, { id: 'ledger', niches: ['History stories'] }]).designs), ['ledger']);
  });
});

// ---------------------------------------------------------------------------
// thumbSetFor — the per-niche sets with the full-pool fallback
// ---------------------------------------------------------------------------

describe('T2d — thumbSetFor (niche mapping + fallback)', () => {
  test('a niche hit returns exactly that niche\'s designs', () => {
    const tech = idsOf(thumbSetFor('AI & future tech'));
    assert.ok(tech.includes('terminal') && tech.includes('screen'), `tech set carries the terminal/screen designs, got ${tech.join(', ')}`);
    assert.ok(!tech.includes('blackout'), 'a niche hit is the niche\'s set, not the whole pool');
    const finance = idsOf(thumbSetFor('Old money habits & quiet wealth'));
    assert.ok(finance.includes('gold-standard') && finance.includes('pillar'), 'the old-money niche binds the luxury designs');
  });

  test('the fallback: a niche with no bindings returns the FULL 18 pool', () => {
    assert.deepEqual(idsOf(thumbSetFor('a niche nobody binds')), QA_POOL);
    assert.deepEqual(idsOf(thumbSetFor(null)), QA_POOL);
    assert.deepEqual(idsOf(thumbSetFor(undefined)), QA_POOL);
  });

  test('a designs override (test fixture) replaces the shipped registry', () => {
    const fixture = [
      { id: 'ledger', niches: ['History stories'], label: 'Ledger', category: 'doc-style' },
      { id: 'plinth', niches: ['History stories'], label: 'Plinth', category: 'bold-impact' },
    ];
    assert.deepEqual(idsOf(thumbSetFor('History stories', fixture)), ['ledger', 'plinth']);
    assert.deepEqual(idsOf(thumbSetFor('Travel & geography explained', fixture)), ['ledger', 'plinth'], 'fallback = the full OVERRIDDEN pool');
  });
});

// ---------------------------------------------------------------------------
// pickCandidates — determinism, rotation, clamping, fallbacks
// ---------------------------------------------------------------------------

describe('T2d — pickCandidates (deterministic rotation selection)', () => {
  const FULL = thumbSetFor('a niche nobody binds'); // the fallback = the full 18 pool

  test('deterministic: the same inputs give the same output, in catalog order', () => {
    const a = pickCandidates('AI & future tech', 2);
    const b = pickCandidates('AI & future tech', 2);
    assert.deepEqual(a, b);
    assert.deepEqual(idsOf(a), idsOf(thumbSetFor('AI & future tech')).slice(0, 2), 'default order = the set\'s catalog order');
  });

  test('n DISTINCT designs — never a repeat within one selection', () => {
    const picks = pickCandidates('a niche nobody binds', 5); // the full pool, 5 slots
    assert.equal(new Set(idsOf(picks)).size, 5);
  });

  test('rotation: never the lastPickedId back-to-back', () => {
    const first = idsOf(FULL);
    const next = pickCandidates('a niche nobody binds', 3, { lastPickedId: first[0] });
    assert.notEqual(next[0].id, first[0], 'the design after the last-used one leads the rotated order');
    // a full rotation cycle: walk n=1 picks 10 times — no two consecutive picks match
    let last = first[0];
    for (let i = 0; i < 10; i++) {
      const [pick] = pickCandidates('a niche nobody binds', 1, { lastPickedId: last });
      assert.notEqual(pick.id, last, `round ${i}: ${pick.id} repeated ${last} back-to-back`);
      last = pick.id;
    }
  });

  test('rotation degrades deterministically: unknown or absent lastPickedId = catalog order', () => {
    const plain = pickCandidates('AI & future tech', 2);
    assert.deepEqual(pickCandidates('AI & future tech', 2, { lastPickedId: 'never-picked' }), plain);
    assert.deepEqual(pickCandidates('AI & future tech', 2, {}), plain);
    assert.deepEqual(pickCandidates('AI & future tech', 2), plain);
  });

  test('clamping: n is truncated, floored at 0, and capped at the pool size', () => {
    assert.equal(pickCandidates('a niche nobody binds', 999).length, 18, 'clamped to the full pool size');
    assert.equal(pickCandidates('Travel & geography explained', 999).length, idsOf(thumbSetFor('Travel & geography explained')).length, 'clamped to the NICHE set');
    assert.deepEqual(pickCandidates('a niche nobody binds', 0), []);
    assert.deepEqual(pickCandidates('a niche nobody binds', -3), []);
    assert.equal(pickCandidates('a niche nobody binds', 2.9).length, 2, 'truncated, not rounded');
    assert.deepEqual(pickCandidates('a niche nobody binds', 'x').length, 0, 'garbage n = no registry slots');
  });

  test('the 1-eligible fallback: a single-design set returns THAT design, possibly repeating', () => {
    const fixture = [{ id: 'ledger', niches: ['History stories'], label: 'Ledger', category: 'doc-style' }];
    const picks = pickCandidates('History stories', 3, { entries: fixture });
    assert.deepEqual(idsOf(picks), ['ledger', 'ledger', 'ledger'], 'the only choice repeats rather than erroring');
    // rotation cannot help a single-design set — same output with the design itself as lastPickedId
    const again = pickCandidates('History stories', 3, { entries: fixture, lastPickedId: 'ledger' });
    assert.deepEqual(idsOf(again), ['ledger', 'ledger', 'ledger']);
  });

  test('the 0-eligible fallback: an empty set yields [] — the caller keeps the legacy single frame thumb', () => {
    assert.deepEqual(pickCandidates('History stories', 3, { entries: [] }), []);
    assert.deepEqual(pickCandidates('History stories', 3, { entries: [], lastPickedId: 'ledger' }), []);
  });

  test('never throws on garbage arguments', () => {
    assert.doesNotThrow(() => pickCandidates(null, NaN));
    assert.doesNotThrow(() => pickCandidates(42, 'x', { lastPickedId: {} }));
    assert.doesNotThrow(() => pickCandidates('AI & future tech', 3, { lastPickedId: null, entries: 'garbage' }));
    assert.deepEqual(pickCandidates('AI & future tech', 3, { entries: 'garbage' }), [], 'a garbage pool is 0-eligible, not a crash');
  });
});

// ---------------------------------------------------------------------------
// T2d round 1 — kit.thumbTemplates drives selection (D13: assigned ∩ eligible)
// ---------------------------------------------------------------------------

describe('T2d round 1 — the assigned thumb set (kit.thumbTemplates, D13)', () => {
  const FIXTURE = [
    { id: 'ledger', niches: ['History stories'], label: 'Ledger', category: 'doc-style' },
    { id: 'plinth', niches: ['History stories'], label: 'Plinth', category: 'bold-impact' },
    { id: 'coinflip', niches: ['History stories'], label: 'Coin Flip', category: 'listicle' },
  ];

  test('an assigned set restricts the pool to assigned ∩ eligible, in CATALOG order (not assigned order)', () => {
    const picks = pickCandidates('History stories', 3, { entries: FIXTURE, assignedIds: ['coinflip', 'ledger'] });
    assert.deepEqual(idsOf(picks), ['ledger', 'coinflip'], 'catalog order wins; unassigned designs are excluded');
  });

  test('rotation + clamping apply to the assigned subset unchanged', () => {
    const full = pickCandidates('History stories', 9, { entries: FIXTURE, assignedIds: ['ledger', 'plinth', 'coinflip'] });
    assert.equal(full.length, 3, 'clamped to the assigned subset');
    const next = pickCandidates('History stories', 1, { entries: FIXTURE, assignedIds: ['ledger', 'plinth', 'coinflip'], lastPickedId: 'ledger' });
    assert.notEqual(next[0].id, 'ledger', 'rotation never repeats the last-used layout');
    assert.deepEqual(
      idsOf(pickCandidates('History stories', 2, { entries: FIXTURE, assignedIds: ['plinth'], lastPickedId: 'plinth' })),
      ['plinth', 'plinth'],
      'a single-design assigned set still repeats (the only choice)',
    );
  });

  test('assigned ids outside the eligible pool shrink the intersection honestly; 0 after → [] (the frames cell)', () => {
    assert.deepEqual(
      idsOf(uniqueDesigns(pickCandidates('History stories', 3, { entries: FIXTURE, assignedIds: ['ledger', 'ketchup', 'not-a-design'] }))),
      ['ledger'],
      'a needsPhoto:true / unknown assigned id drops from the intersection (the 1-design remainder repeats — the 1-eligible fallback)',
    );
    assert.deepEqual(pickCandidates('History stories', 3, { entries: FIXTURE, assignedIds: ['ketchup'] }), [], '0 after the intersection = the staggered-frames cell at the seam');
    assert.deepEqual(pickCandidates('History stories', 3, { assignedIds: [] }), [], 'an empty assigned key = no registry slots');
    assert.deepEqual(pickCandidates('History stories', 3, { assignedIds: 'garbage' }), [], 'a malformed assigned key is an empty intersection, never a crash or a widened pool');
  });

  test('without assignedIds the niche path is untouched (the documented API keeps its fallback)', () => {
    assert.deepEqual(idsOf(pickCandidates('History stories', 2, { entries: FIXTURE })), ['ledger', 'plinth']);
  });
});

// ---------------------------------------------------------------------------
// P5-T4 — the LAUNCH ASSIGNMENT DATA: the four active channels' kits carry
// 2-3 niche-matched launch-set ids in yt-mcp/studio-channels.json's kit JSONB
// (D13's assignment storage; the engine reads brand.thumbTemplates through the
// T2d round-1 carry and intersects with the eligible pool). The file is
// checked-in repo data with NO secrets (registry kits never hold tokens), so
// the pins stay CI-portable. The panel's per-niche browser keeps future
// assignments inside the same bars; an unassigned channel stays legal (the
// frames cell) — only the four launch channels are pinned to HAVE sets.
// ---------------------------------------------------------------------------

describe('P5-T4 — the launch thumb-set assignments (kit JSONB, D13)', () => {
  const CHANNELS = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'yt-mcp/studio-channels.json'), 'utf8'),
  ).channels;
  const LAUNCH_SLUGS = ['money-rulebook', 'investors-compass', 'debt-free-doctrine', 'quotequarry'];
  const catalogOrder = (ids) => [...ids].sort((a, b) => QA_POOL.indexOf(a) - QA_POOL.indexOf(b));

  test('each of the four launch channels declares kit.thumbTemplates with 2-3 ids (D13 storage)', () => {
    for (const slug of LAUNCH_SLUGS) {
      const ch = CHANNELS.find((c) => c.slug === slug);
      assert.ok(ch, `${slug} is a launch channel in yt-mcp/studio-channels.json`);
      const set = ch.kit?.thumbTemplates;
      assert.ok(Array.isArray(set), `${slug}.kit.thumbTemplates is declared (the D13 JSONB key)`);
      assert.ok(set.length >= 2 && set.length <= 3, `${slug} carries 2-3 designs, got ${set?.length}`);
    }
  });

  test('the pilot money-rulebook carries >= 2 designs — Drill C needs N>1 candidate rotation room', () => {
    const mr = CHANNELS.find((c) => c.slug === 'money-rulebook');
    assert.ok(
      mr.kit.thumbTemplates.length >= 2,
      `the pilot needs rotation room (>= 2), got ${mr.kit.thumbTemplates.length}`,
    );
  });

  test('every assigned id on every active channel is an eligible launch design, niche-matched to the channel\'s EXACT niche string', () => {
    const { designs } = loadThumbRegistry();
    const byId = new Map(designs.map((d) => [d.id, d]));
    for (const ch of CHANNELS.filter((c) => c.active)) {
      const set = ch.kit?.thumbTemplates;
      if (!Array.isArray(set) || set.length === 0) continue; // unassigned = the frames cell — legal
      assert.ok(CANONICAL_NICHES.includes(ch.niche), `${ch.slug} niche string is in the closed D17 vocabulary`);
      for (const id of set) {
        const d = byId.get(id);
        assert.ok(d, `${ch.slug} assigned "${id}" — a needsPhoto:false launch design (unknown/photo ids would silently drop at the seam)`);
        assert.ok(
          d.niches.includes(ch.niche),
          `${ch.slug} (${ch.niche}): assigned "${id}" binds that exact niche string — got [${d.niches.join(', ')}]`,
        );
      }
    }
  });

  test('the T2d loader resolves each launch channel\'s FULL assigned set (assigned ∩ eligible, catalog order)', () => {
    for (const slug of LAUNCH_SLUGS) {
      const ch = CHANNELS.find((c) => c.slug === slug);
      const picks = pickCandidates(ch.niche, 3, { assignedIds: ch.kit.thumbTemplates });
      assert.deepEqual(
        idsOf(picks),
        catalogOrder(ch.kit.thumbTemplates),
        `${slug}: nothing dropped from the assignment and catalog order wins`,
      );
    }
  });

  test('P5-T6 D2: the de-overlapped assignment sets — gold-standard no longer blankets 3 of 4 channels', () => {
    const EXPECTED = {
      quotequarry: ['slab-quote', 'serif-frame', 'plinth'],
      'investors-compass': ['gold-standard', 'coinflip', 'price-fight'],
      'money-rulebook': ['price-fight', 'ledger', 'coinflip'],
      'debt-free-doctrine': ['gold-standard', 'pillar'],
    };
    for (const [slug, set] of Object.entries(EXPECTED)) {
      const ch = CHANNELS.find((c) => c.slug === slug);
      assert.deepEqual(ch.kit.thumbTemplates, set, `${slug}'s assigned set (T6 de-overlap)`);
    }
    const goldUsers = CHANNELS.filter((c) => c.kit?.thumbTemplates?.includes('gold-standard')).map((c) => c.slug);
    assert.ok(
      goldUsers.length <= 2,
      `gold-standard must not blanket the network (was 3 of 4), now on: ${goldUsers.join(', ')}`,
    );
  });
});

// ---------------------------------------------------------------------------
// P5-T6 — the catalog flag fix: tabloid's design draws NO photo
// (photo:"none") but declared needsPhoto:true, so the Studio panel
// (app/thumbs/page.js) and the preview route demanded a photo the renderer
// would ignore.
// ---------------------------------------------------------------------------

describe('P5-T6 — the tabloid flag fix (catalog data)', () => {
  test('tabloid is needsPhoto:false — Studio stops demanding a photo the design ignores', () => {
    const t = catalogById.get('tabloid');
    assert.ok(t, 'tabloid exists in thumb-catalog.json');
    assert.equal(t.needsPhoto, false, 'needsPhoto:false — no photo demand at the panel or the preview route');
    assert.equal(t.photo, 'none', 'the design itself draws no photo — the flag must match');
  });
});

// ---------------------------------------------------------------------------
// The D12 eligibility math (QA Row 12: 0/1/>=2 eligible -> the candidate counts)
// ---------------------------------------------------------------------------

describe('T2d — the D12 eligibility math at the seam', () => {
  test('uniqueDesigns collapses the 1-eligible repeat in first-seen order', () => {
    const fixture = [
      { id: 'ledger', niches: ['History stories'], label: 'L', category: 'c' },
      { id: 'plinth', niches: ['History stories'], label: 'P', category: 'c' },
    ];
    assert.deepEqual(idsOf(uniqueDesigns([fixture[0], fixture[0], fixture[0]])), ['ledger']);
    assert.deepEqual(idsOf(uniqueDesigns([fixture[0], fixture[1], fixture[0]])), ['ledger', 'plinth'], 'first-seen order preserved');
    assert.deepEqual(uniqueDesigns(null), []);
    assert.deepEqual(uniqueDesigns('garbage'), []);
    assert.deepEqual(uniqueDesigns([null, 42, fixture[0]]), [fixture[0]], 'garbage entries drop');
  });

  test('the counts: 1 eligible -> TWO candidates (frame + that render); >=2 eligible -> N candidates', () => {
    const singleton = [{ id: 'ledger', niches: ['History stories'], label: 'L', category: 'c' }];
    // candidate_count = 3 on a 1-eligible set: frame + 1 unique registry render
    assert.equal(1 + uniqueDesigns(pickCandidates('History stories', 2, { entries: singleton })).length, 2);
    // candidate_count = 3 on the full pool: frame + 2 distinct registry renders
    assert.equal(1 + uniqueDesigns(pickCandidates('History stories', 2)).length, 3);
  });
});

// ---------------------------------------------------------------------------
// D11 — brand-token binding: kit data in, render opts out (fixture tokens only)
// ---------------------------------------------------------------------------

describe('T2d — thumbRenderTokens (kit binding + entry/template pins)', () => {
  const KIT = { accent: '#3DDC97', bg: '#101314', label: 'THE MONEY RULEBOOK', eyebrow: 'money // rules' };

  test('the kit tokens flow through: accent/bg/label/eyebrow — data, never a per-channel map', () => {
    const entry = { id: 'blackout', niches: ['History stories'] };
    assert.deepEqual(thumbRenderTokens(entry, KIT), {
      accent: '#3DDC97', shade: '#101314', brand: 'THE MONEY RULEBOOK', eyebrow: 'money // rules',
    });
  });

  test('an entry token pin wins over the kit (a light-bg design ignores the kit\'s dark bg — D11)', () => {
    const entry = { id: 'whitespace', niches: ['History stories'], tokens: { shade: null } };
    const t = thumbRenderTokens(entry, KIT);
    assert.equal(t.shade, null, 'shade:null = the catalog bg wins at render');
    assert.equal(t.accent, '#3DDC97', 'unpinned tokens still bind from the kit');
  });

  test('a perTemplate override wins over both the kit and the entry pins (when the render knows its template)', () => {
    const entry = { id: 'blackout', niches: ['History stories'], tokens: { shade: null }, perTemplate: { 'myth-vs-money': { accent: '#F5E31C' } } };
    assert.deepEqual(thumbRenderTokens(entry, KIT, 'myth-vs-money').accent, '#F5E31C');
    assert.equal(thumbRenderTokens(entry, KIT, 'other-template').accent, '#3DDC97', 'other templates keep the kit binding');
    assert.equal(thumbRenderTokens(entry, KIT).accent, '#3DDC97', 'v1 lanes pass no template id — entry pins + kit only');
  });

  test('missing/garbage kit or entry never throws', () => {
    assert.deepEqual(thumbRenderTokens(null, null), { accent: null, shade: null, brand: '', eyebrow: '' });
    assert.doesNotThrow(() => thumbRenderTokens({ id: 'x', niches: [], tokens: 'garbage', perTemplate: [] }, KIT));
  });
});

// ---------------------------------------------------------------------------
// Regression pins — the engine seam (candidate 1 = today's frame thumb)
// ---------------------------------------------------------------------------

describe('T2d — the candidate-1 regression pin + the engine source switch', () => {
  test('thumbFrameOffset(0) === 3 — candidate 1 keeps the exact legacy frame (the Phase 4 pin, re-run)', async () => {
    const { thumbFrameOffset } = await import('../youtube-engine.mjs');
    assert.equal(thumbFrameOffset(0), 3, 'candidate 1 = the exact pre-T5b offset');
  });

  test('source pin: the engine\'s registry source is gated on picking (variants > 1) AND on the assigned thumb set (D13)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'youtube-engine.mjs'), 'utf8');
    assert.match(src, /if \(variants > 1\)[\s\S]{0,120}await registryThumbCandidates\(brand, page, /, 'the registry is consulted ONLY when the template data enabled picking (and the helper no longer takes the dead script param)');
    assert.match(src, /registryThumbCandidates[\s\S]{0,4000}pickCandidates\(/, 'the engine selection goes through pickCandidates (one selection truth)');
    assert.match(src, /brand\?\.thumbTemplates/, 'the kit-assigned thumb set (D13) is the selection gate');
    assert.match(src, /if \(!assigned \|\| !assigned\.length\) return null;/, 'an absent/empty kit key = today\'s staggered frames, byte-identically (checked BEFORE any registry import)');
    assert.match(src, /assignedIds: assigned/, 'the assigned ids ride into pickCandidates — assigned ∩ eligible');
    assert.match(src, /frameVariants = reg \? 1 : variants/, 'with registry designs candidate 1 is the ONLY frame; without them today\'s staggered frames run');
    assert.match(src, /catch[^{]*\{\s*thumbReg = null;/, 'a registry failure degrades to null — the frame path is untouchable');
  });

  test('source pin: registry renders go through the EXISTING v2 renderer with the channel\'s brand tokens and the 2 MB cap', () => {
    const src = fs.readFileSync(path.join(ROOT, 'youtube-engine.mjs'), 'utf8');
    assert.match(src, /renderV2\(`v2\/\$\{design\.id\}`/, 'the v2/ catalog id prefix (renderV2 requires it)');
    assert.match(src, /2 \* 1024 \* 1024/, 'the JPEG re-encode/drop cap at the 2 MB YouTube limit');
  });

  test('source pin: the rotation state rides the channel state file (last-used id recorded)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'youtube-engine.mjs'), 'utf8');
    assert.match(src, /thumb_last_design/, 'the D12 last-used key');
    assert.match(src, /loadChannelState\(slug\)/, 'rotation reads the channel state file');
    assert.match(src, /saveChannelState\(slug, state\)/, 'rotation persists via saveChannelState');
    assert.match(src, /thumbDesigns: thumbReg \? thumbReg\.pickedIds : null/, 'the engine returns the picked ids for the lane\'s own state write');
    const daily = fs.readFileSync(path.join(ROOT, 'yt-daily.mjs'), 'utf8');
    assert.match(daily, /state\[slug\]\.thumb_last_design = out\.thumbDesigns\[out\.thumbDesigns\.length - 1\]/, 'the lane re-carries the mark in ITS state copy — the end-of-run save must not clobber rotation');
  });

  test('source pin: the kit thumb set reaches the engine through the resolved brand (brand-resolve passes D13 through)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib/brand-resolve.mjs'), 'utf8');
    assert.match(src, /thumbTemplates:\s*kit\.thumbTemplates/, 'registryToKit carries the kit-assigned set — data, never a hardcoded map');
    assert.match(src, /Array\.isArray\(kit\.thumbTemplates\)/, 'guarded so an absent kit key never clobbers a legacy kit value in the merge (#101 undefined-spread lesson)');
  });

  test('source pin: the studio registry route serves the launch set read-only, auth-gated', () => {
    const src = fs.readFileSync(path.join(ROOT, 'studio/app/api/thumbs/registry/route.js'), 'utf8');
    assert.match(src, /getUser\(req\)/, 'the house auth gate');
    assert.match(src, /loadThumbRegistry\(\)/, 'the launch set comes from the registry loader, never a second data source');
    assert.match(src, /status: 401/, 'unsigned requests are refused');
  });
});
