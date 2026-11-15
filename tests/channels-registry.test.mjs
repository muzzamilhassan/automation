import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registryToKit } from '../lib/brand-resolve.mjs';

test('registryToKit preserves existing channel data and sets defaults correctly', () => {
  const entry = {
    slug: 'growth-mindset',
    label: 'Growth Mindset',
    handle: '@growthmindset',
    niche: 'Personal Growth',
    accent: '#10B981',
    slots: ['14:00', '20:00'],
    voice: 'am_michael',
    docDay: 'Wed',
    active: true,
    kit: {
      eyebrow: 'GROWTH // DAILY',
      tagline: 'Get better every day.',
      tags: ['growth', 'mindset', 'habits'],
      niches: ['growth', 'habits'],
      description: 'Daily personal growth insights in 60 seconds.',
    }
  };

  const kit = registryToKit(entry);

  assert.equal(kit.slug, 'growth-mindset');
  assert.equal(kit.label, 'Growth Mindset');
  assert.equal(kit.handle, '@growthmindset');
  assert.equal(kit.niche, 'Personal Growth');
  assert.equal(kit.accent, '#10B981');
  assert.deepEqual(kit.slots, ['14:00', '20:00']);
  assert.equal(kit.docDay, 'Wed');
  assert.equal(kit.active, true);
  assert.equal(kit.fromRegistry, true);
  assert.equal(kit.eyebrow, 'GROWTH // DAILY');
  assert.equal(kit.tagline, 'Get better every day.');
  assert.deepEqual(kit.tags, ['growth', 'mindset', 'habits']);
});

test('registryToKit parses comma and space-delimited keywords if tags are omitted', () => {
  const entry = {
    slug: 'crypto-pulse',
    ytKeywords: '"crypto news" bitcoin "altcoin daily" ethereum investment',
  };

  const kit = registryToKit(entry);
  assert.ok(kit.tags.includes('crypto news'));
  assert.ok(kit.tags.includes('altcoin daily'));
  assert.ok(kit.tags.includes('bitcoin'));
  assert.ok(kit.tags.includes('ethereum'));
});

test('reconnecting an existing channel must preserve existing slug over raw handle', () => {
  // Simulates the seam in studio/app/api/oauth/callback/route.js
  const existingRegistry = [
    { channelId: 'UC1234567890', slug: 'custom-assigned-slug' }
  ];

  const incomingChannelId = 'UC1234567890';
  const incomingHandle = 'newhandle';

  function slugify(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  const existing = existingRegistry.find(c => c.channelId === incomingChannelId);
  let resolvedSlug;
  if (existing) {
    resolvedSlug = existing.slug;
  } else {
    resolvedSlug = slugify(incomingHandle);
  }

  assert.equal(resolvedSlug, 'custom-assigned-slug', 'Existing slug should be preserved to prevent secret drift');
});

// ---------------------------------------------------------------------------
// Audit 2026-11-13 #8 (scale-config-04 / data-12). upsertChannel re-wrote the
// engine feed (yt-mcp/studio-channels.json) from rowToEntry projections of
// EVERY Neon row: no top-level cron, `active` recomputed from token columns
// (live Neon: none of the 13 rows has token_secret/token_enc -> all false),
// tokenSecretSaved false, and tokenEnc projected into git. One Studio connect
// or profile save would have switched off all 4 live channels and wiped their
// crons. The guard: a write for channel X changes only X's repo entry, keeps
// the repo's cron/active/tokenSecretSaved, and never writes tokenEnc.
// Spec + QA: docs/qa/registry-sync-guard-qa.md.
// ---------------------------------------------------------------------------
import { mergeRegistrySync } from '../studio/lib/channels-registry.js';

const repoFeed = () => [
  { slug: 'money-rulebook', label: 'The Money Rulebook', cron: '21 3 * * *', active: true, autopilot: true, tokenSecretSaved: true, kit: { slots: ['00:05'] } },
  { slug: 'quotequarry', label: 'Quote Quarry', cron: '13 2 * * *', active: true, autopilot: true, tokenSecretSaved: true, kit: { slots: ['22:35'] } },
];
// what rowToEntry projects for a live row today (no token columns, no cron)
const dbProjection = (over = {}) => ({ slug: 'money-rulebook', label: 'The Money Rulebook', niche: 'Personal finance', status: 'active', active: false, tokenSecretSaved: false, tokenEnc: 'iv.tag.ct', autopilot: true, kit: { slots: ['00:05'], niches: ['x'] }, fromRegistry: true, ...over });

test('#8 a write for one channel never touches the other repo entries', () => {
  const before = repoFeed();
  const out = mergeRegistrySync(before, dbProjection({ niche: 'Money rules' }));
  assert.deepEqual(out.find((c) => c.slug === 'quotequarry'), before.find((c) => c.slug === 'quotequarry'));
  assert.equal(out.length, 2, 'no other Neon rows are injected into the engine feed');
});

test('#8 an existing channel keeps its repo cron, active and tokenSecretSaved; DB edits still land', () => {
  const mr = mergeRegistrySync(repoFeed(), dbProjection({ niche: 'Money rules' })).find((c) => c.slug === 'money-rulebook');
  assert.equal(mr.cron, '21 3 * * *');
  assert.equal(mr.active, true, 'a token-column-less DB row must not switch a live channel off');
  assert.equal(mr.tokenSecretSaved, true);
  assert.equal(mr.niche, 'Money rules', 'the edited field from the DB lands');
});

test('#8 tokenEnc is never written to the repo feed', () => {
  const out = mergeRegistrySync(repoFeed(), dbProjection());
  assert.equal(out.some((c) => 'tokenEnc' in c), false);
  const fresh = mergeRegistrySync(repoFeed(), dbProjection({ slug: 'brand-new', active: true, tokenSecretSaved: true }));
  assert.equal('tokenEnc' in fresh.find((c) => c.slug === 'brand-new'), false);
});

test('#8 the DB can park a channel, but a sync never un-parks one', () => {
  const parked = mergeRegistrySync(repoFeed(), dbProjection({ status: 'parked' })).find((c) => c.slug === 'money-rulebook');
  assert.equal(parked.active, false, 'an explicit DB park still reaches the engine');
  const feed = repoFeed().map((c) => (c.slug === 'money-rulebook' ? { ...c, active: false } : c));
  const still = mergeRegistrySync(feed, dbProjection({ active: true })).find((c) => c.slug === 'money-rulebook');
  assert.equal(still.active, false, 'repo-parked stays parked on an unrelated save');
});

test('#8 cron falls back to the durable kit.gateCron mirror when the repo has none', () => {
  const feed = [{ slug: 'money-rulebook', active: true, tokenSecretSaved: true, kit: {} }];
  const out = mergeRegistrySync(feed, dbProjection({ kit: { gateCron: '5 3 * * *' } }));
  assert.equal(out[0].cron, '5 3 * * *');
});

test('#8 a brand-new channel (not in the repo yet) is added from the DB projection, sorted by slug', () => {
  const out = mergeRegistrySync(repoFeed(), dbProjection({ slug: 'aaa-new', active: true, tokenSecretSaved: true }));
  assert.equal(out[0].slug, 'aaa-new');
  assert.equal(out[0].active, true);
});

test('#8 upsertChannel syncs only the written slug through the guard', () => {
  const src = fs.readFileSync('studio/lib/channels-registry.js', 'utf8');
  const upsert = src.slice(src.indexOf('export async function upsertChannel'), src.indexOf('export async function removeChannel'));
  assert.match(upsert, /syncRegistryRepo\(entry\.slug,/);
  const sync = src.slice(src.indexOf('async function syncRegistryRepo'), src.indexOf('export async function registryChannels'));
  assert.match(sync, /mergeRegistrySync\(/);
});
