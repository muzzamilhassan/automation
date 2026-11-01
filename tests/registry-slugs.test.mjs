// #106 Phase 4.5 T4b — lib/registry-slugs.mjs is the ONE implementation of the
// two facts every crossposting/reporting lane needs from the studio registry:
//   active-filter — a channel is in scope when its entry does not opt out
//     (active !== false; the same gate channel-autopilot.yml's discover step
//     applies. tokenSecretSaved is an autopilot-only concern — a cache
//     restore or report fetch for a channel without data is a harmless miss).
//   envSlug — the YT_TOKEN_<ENSSLUG> secret suffix (dashes → underscores).
// The inline discover steps in the lane workflows mirror this logic (house
// pattern); this module is the importable form for scripts and tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { activeRegistryChannels, envSlugFor, loadRegistryChannels, healRouteFor, shouldDispatchHealToday } from '../lib/registry-slugs.mjs';

test('registry-slugs.activeRegistryChannels keeps every channel that does not opt out (active !== false)', () => {
  const entries = [
    { slug: 'alpha', active: true },
    { slug: 'beta' },            // no flag — wizard default is in
    { slug: 'gamma', active: false }, // parked — out
    { slug: null },              // malformed — out, never crashes the lane
    { slug: 'delta', active: false },
    { slug: 'epsilon' },
  ];
  assert.deepEqual(
    activeRegistryChannels(entries).map((c) => c.slug),
    ['alpha', 'beta', 'epsilon'],
    'only non-opted-out entries with a slug survive, in registry order',
  );
});

test('registry-slugs.envSlugFor derives the YT_TOKEN secret suffix from the slug', () => {
  assert.equal(envSlugFor('quotequarry'), 'QUOTEQUARRY');
  assert.equal(envSlugFor('investors-compass'), 'INVESTORS_COMPASS');
  assert.equal(envSlugFor('debt-free-doctrine'), 'DEBT_FREE_DOCTRINE');
  assert.equal(envSlugFor(undefined), '', 'missing slug degrades to empty, not a throw');
});

test('registry-slugs.activeRegistryChannels carries label/handle/envSlug from the entry', () => {
  const out = activeRegistryChannels([
    { slug: 'money-rulebook', label: 'The Money Rulebook', handle: '@themoneyrulebook-p4y' },
  ]);
  assert.deepEqual(out, [
    { slug: 'money-rulebook', label: 'The Money Rulebook', handle: '@themoneyrulebook-p4y', envSlug: 'MONEY_RULEBOOK' },
  ]);
});

test('registry-slugs.activeRegistryChannels: label falls back to the slug, handle to empty', () => {
  const out = activeRegistryChannels([{ slug: 'bare-channel' }]);
  assert.deepEqual(out, [
    { slug: 'bare-channel', label: 'bare-channel', handle: '', envSlug: 'BARE_CHANNEL' },
  ]);
});

test('registry-slugs.loadRegistryChannels reads the live registry; missing file degrades to []', () => {
  const live = loadRegistryChannels();
  assert.ok(Array.isArray(live) && live.length >= 4, 'the live studio registry must parse');
  assert.ok(live.every((c) => typeof c.slug === 'string'));

  assert.deepEqual(loadRegistryChannels('yt-mcp/does-not-exist.json'), [], 'missing registry must never throw');
});

test('registry-slugs.activeRegistryChannels over [] is [] (unreadable registry = empty lane, not a crash)', () => {
  assert.deepEqual(activeRegistryChannels([]), []);
  assert.deepEqual(activeRegistryChannels(undefined), []);
});

// ---- T4b fix round 1: the sweeper heal-routing split (daily-sweeper.yml is
// ONE job — a single job cannot construct secret names, so a registry channel
// without a mapped YT_TOKEN_* would silently never heal) ----

test('registry-slugs.healRouteFor: a local token (env or token file) always heals in-process', () => {
  assert.equal(healRouteFor('sleep-architect', { legacySlugs: [], hasLocalToken: true }), 'in-process');
  assert.equal(healRouteFor('quotequarry', { legacySlugs: ['quotequarry'], hasLocalToken: true }), 'in-process');
});

test('registry-slugs.healRouteFor: a non-legacy registry channel without a token routes to the channel-autopilot dispatch', () => {
  assert.equal(healRouteFor('sleep-architect', { legacySlugs: ['quotequarry'], hasLocalToken: false, registryActive: true }), 'dispatch');
});

test('registry-slugs.healRouteFor: the legacy 4 keep today in-process path (warn-and-skip when their token is absent)', () => {
  for (const slug of ['quotequarry', 'investors-compass', 'money-rulebook', 'debt-free-doctrine']) {
    assert.equal(healRouteFor(slug, { legacySlugs: ['quotequarry', 'investors-compass', 'money-rulebook', 'debt-free-doctrine'], hasLocalToken: false, registryActive: true }), 'in-process');
  }
});

test('registry-slugs.healRouteFor: not registry-active and no token = none (never dispatch for a parked slug)', () => {
  assert.equal(healRouteFor('sleep-architect', { legacySlugs: [], hasLocalToken: false, registryActive: false }), 'none');
});

test('registry-slugs.shouldDispatchHealToday: one heal-dispatch per channel per day (dedupe)', () => {
  assert.equal(shouldDispatchHealToday({}, 'alpha', '2026-11-01'), true, 'never dispatched — go');
  assert.equal(shouldDispatchHealToday({ alpha: '2026-10-31' }, 'alpha', '2026-11-01'), true, 'yesterday — go');
  assert.equal(shouldDispatchHealToday({ alpha: '2026-11-01' }, 'alpha', '2026-11-01'), false, 'already today — skip');
  assert.equal(shouldDispatchHealToday(null, 'alpha', '2026-11-01'), true, 'missing state file — go');
});

// ---- T4b fix round 1: durable money-rulebook identity (the T4a wipe path:
// upsertChannel -> readRegistry -> syncRegistryRepo rewrites the repo feed
// from rowToEntry projections; without a durable mirror the Neon columns
// would revert the repo-file label/handle fix on the next sync) ----

test('T4b durability: rowToEntry prefers the kit identity mirror over the Neon columns (source-scan, channels-registry.js pulls db.mjs)', () => {
  const src = fs.readFileSync('studio/lib/channels-registry.js', 'utf8');
  assert.match(
    src,
    /label:\s*r\.kit\?\.label\s*\|\|\s*r\.label\s*\|\|\s*r\.slug/,
    'the kit jsonb mirror must win over the label column — sync can then never revert a repaired identity',
  );
  assert.match(
    src,
    /handle:\s*r\.kit\?\.handle\s*\|\|\s*r\.handle\s*\|\|\s*''/,
    'the kit jsonb mirror must win over the handle column',
  );
});

test('T4b durability: upsertChannel mirrors the incoming label/handle into kit jsonb (every write keeps the mirror fresh)', () => {
  const src = fs.readFileSync('studio/lib/channels-registry.js', 'utf8');
  assert.match(src, /kit\s*=\s*\{\s*\.\.\.\(?entry\.kit\s*\|\|\s*\{\}\)?,/, 'upsert must build a kit that carries the identity mirror');
  assert.match(src, /label:\s*entry\.label\s*\?\?\s*entry\.kit\?\.label/, 'incoming label lands in the mirror');
  assert.match(src, /handle:\s*entry\.handle\s*\?\?\s*entry\.kit\?\.handle/, 'incoming handle lands in the mirror');
  assert.ok(
    src.indexOf('db.json(kit)') !== -1 || /db\.json\(kit\)/.test(src),
    'the mirrored kit must be the one written to the channels row',
  );
});
