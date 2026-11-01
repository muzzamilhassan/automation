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
import { activeRegistryChannels, envSlugFor, loadRegistryChannels } from '../lib/registry-slugs.mjs';

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
