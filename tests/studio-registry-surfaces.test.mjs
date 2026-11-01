// #106 Phase 4.5 T4d — the Studio's read/dashboard surfaces lose the legacy-4
// hardcodes (G8 + G11 + G12 + G13). Everything derives from the registry
// (Neon channels ↔ yt-mcp/studio-channels.json feed): state-file reads, the
// cloud ytChannels loop, the terms panel, overview FB destinations, the users
// route's owner bindings, music tabs, and the command palette's quick-run
// entries. The legacy 4 keep identical behavior because their registry
// entries now carry the data the hardcoded lists used to hold (destinations
// seeded into the registry feed — data, not code, per the no-static-maps
// directive).
//
// SOURCE-SCAN + fs pins — the house pattern for studio surfaces
// (tests/studio-action-route.test.mjs): route files import through the
// '@/lib' alias plain node --test cannot resolve, and a live import would
// pull the real db/audit stores. data.mjs's pure derivation helper and the
// engine registry (lib/registry.mjs) ARE importable and pinned behaviorally.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registrySlugs } from '../studio/lib/data.mjs';
import { fbPageId, LEGACY_SLUGS } from '../lib/registry.mjs';

const read = (p) => fs.readFileSync(p, 'utf8');
const dataSrc = read('studio/lib/data.mjs');
const termsSrc = read('studio/app/api/terms/route.js');
const overviewSrc = read('studio/app/api/overview/route.js');
const usersSrc = read('studio/app/api/users/route.js');
const musicSrc = read('studio/app/music/page.js');
const paletteSrc = read('studio/components/shell/CommandPalette.js');
const channelsPageSrc = read('studio/app/channels/page.js');
const socialSrc = read('studio/app/social/page.js');
const siteDataSrc = read('studio/lib/site-data.js');
const doctorSrc = read('ci-doctor.mjs');
const studioRegistrySrc = read('studio/lib/channels-registry.js');
const registryFeed = JSON.parse(read('yt-mcp/studio-channels.json'));

// ---------------------------------------------------------------------------
// G8 — data.mjs: the state files and the cloud ytChannels loop derive their
// slug universe from the registry, never a hardcoded list.
// ---------------------------------------------------------------------------

test('T4d: registrySlugs() is pure — every active registry entry joins, duplicates collapse, garbage and parked entries drop', () => {
  const entries = [
    { slug: 'quotequarry', label: 'Quote Quarry' },
    { slug: 'investors-compass' },
    { slug: 'money-rulebook' },
    { slug: 'debt-free-doctrine' },
    { slug: 'sleep-architect', active: false }, // parked — excluded
    { slug: 'quotequarry' }, // duplicate — collapsed
    { label: 'no slug' }, // garbage — dropped
    null, // garbage — dropped
  ];
  assert.deepEqual(registrySlugs(entries), [
    'quotequarry',
    'investors-compass',
    'money-rulebook',
    'debt-free-doctrine',
  ]);
  assert.deepEqual(registrySlugs([]), []);
  assert.deepEqual(registrySlugs(null), []);
  assert.deepEqual(registrySlugs(undefined), []);
});

test('T4d: data.mjs derives the state-file slug list from the registry — the hardcoded legacy-4 list is gone', () => {
  assert.equal(
    dataSrc.includes("['quotequarry', 'investors-compass', 'money-rulebook', 'debt-free-doctrine']"),
    false,
    'state() must not gate yt-mcp/state/<slug>.json reads on a hardcoded slug list',
  );
  assert.ok(/registryChannels/.test(dataSrc), 'data.mjs must read the registry through the existing read path');
  assert.ok(/registrySlugs\(/.test(dataSrc), 'state() must derive its slug list through the pure helper');
  // the per-file read stays fail-soft: a channel without a state file is skipped
  assert.match(dataSrc, /catch\s*\{\s*\}/, 'missing state files must stay tolerated (graceful fallback)');
});

test('T4d: the cloud ytChannels loop iterates the registry universe — LIVE_SLUGS is gone', () => {
  assert.equal(/const LIVE_SLUGS/.test(dataSrc), false, 'the hardcoded cloud-mode loop list must die');
  assert.ok(
    /for\s*\(const\s+e\s+of\s+\w+\)\s*\{[\s\S]*?ytTokenRaw\(e\.slug\)/.test(dataSrc),
    'cloud mode must resolve a token for EVERY registry channel through ytTokenRaw',
  );
});

// ---------------------------------------------------------------------------
// G11 — terms / users routes join the registry (the analytics house pattern).
// ---------------------------------------------------------------------------

test('T4d: the terms route appends registry channels to the legacy base (mirrors the analytics route)', () => {
  assert.ok(/registryChannels/.test(termsSrc), 'the terms route must append registryChannels');
  assert.match(termsSrc, /import\s*\{\s*registryChannels\s*\}\s*from\s+'@\/lib\/channels-registry'/, 'static import like the house pattern');
  assert.ok(!/SLUGS\.includes/.test(termsSrc) || /\.includes\(e\.slug\)/.test(termsSrc), 'append must dedupe against the base list by slug');
});

test('T4d: the users route derives the owner-bound channels from registry bindings — the legacy-4 literal is gone', () => {
  assert.equal(
    usersSrc.includes("['quotequarry', 'investors-compass', 'money-rulebook', 'debt-free-doctrine']"),
    false,
    'the hardcoded legacy list must be replaced by registry derivation',
  );
  assert.ok(/bound\(/.test(usersSrc), 'the existing ownerEmail binding map must feed the owner channel list');
});

// ---------------------------------------------------------------------------
// G11 — overview: FB destinations come from the registry, the force-flag dies.
// ---------------------------------------------------------------------------

test('T4d: overview FB rows come from registry destinations.fbPageId — the hardcoded page-ID map is gone', () => {
  for (const pageId of ['116157974886564', '1077306835630491', '106473735839651', '114550268199751']) {
    assert.equal(overviewSrc.includes(pageId), false, `hardcoded FB page id ${pageId} must move to registry data`);
  }
  assert.ok(/\.destinations\b/.test(overviewSrc) && /fbPageId/.test(overviewSrc), 'the route must read the registry destination schema');
  // absent destination = the channel honestly shows no FB row
  assert.match(overviewSrc, /fbId\s*\?\s*fb\.find/, 'a channel without a registry destination must omit the FB row');
});

test('T4d: overview drops the quotequarry force-flag — k.active is used as-is', () => {
  assert.equal(/slug\s*===\s*'quotequarry'\s*\?\s*true/.test(overviewSrc), false, 'the force-flag must die');
  assert.match(overviewSrc, /active:\s*k\.active/, 'brand channels must surface their own active flag');
});

test('T4d: overview exposes registry destination handles so pages stop hardcoding them', () => {
  const rowShapes = overviewSrc.match(/threadsHandle:/g) || [];
  assert.ok(rowShapes.length >= 2, 'both channel row shapes (brand loop + registry append) must carry threadsHandle');
});

test('T4d: channels-registry hoists kit.destinations so DB-mode reads see destinations (no destinations column yet)', () => {
  assert.match(studioRegistrySrc, /kit\?\.destinations/, 'rowToEntry must map the seeded kit.destinations to entry.destinations');
});

// ---------------------------------------------------------------------------
// Registry feed carries the legacy 4's data (identical-behavior guarantee).
// ---------------------------------------------------------------------------

test('T4d: the registry feed gives every legacy channel its FB destination — matching the engine oracle', () => {
  const bySlug = new Map((registryFeed.channels || []).map((c) => [c.slug, c]));
  for (const slug of LEGACY_SLUGS) {
    const entry = bySlug.get(slug);
    assert.ok(entry, `the registry feed must still contain ${slug} (the identical-behavior guarantee)`);
    assert.equal(
      entry.destinations?.fbPageId,
      fbPageId(slug),
      `${slug}'s seeded destinations.fbPageId must equal the engine's canonical page ID`,
    );
  }
  assert.equal(
    bySlug.get('quotequarry')?.destinations?.threadsHandle,
    'quotequarry8',
    'quotequarry must carry its Threads handle so the social page can drop the literal',
  );
});

// ---------------------------------------------------------------------------
// G13 — client surfaces: music tabs, command palette, channels special case,
// social handle, and the retired TikTok lane copy.
// ---------------------------------------------------------------------------

test('T4d: music tabs are registry-driven — the static 4-channel array is gone', () => {
  assert.equal(/const CHANNELS = \[/.test(musicSrc), false, 'the hardcoded channel tab list must die');
  assert.ok(/api\/overview/.test(musicSrc), 'tabs must come from the overview payload (the house client source)');
});

test('T4d: command-palette quick runs are registry-driven — the 4 hardcoded entries and the retired tiktok entry are gone', () => {
  for (const dead of ["'run-qq'", "'run-ic'", "'run-mr'", "'run-dfd'", 'Run QQ Shorts now', "'run-tiktok'"]) {
    assert.equal(paletteSrc.includes(dead), false, `the hardcoded palette entry ${dead} must be replaced by registry data`);
  }
  assert.ok(/api\/overview/.test(paletteSrc), 'palette run entries must derive from the overview payload');
  assert.ok(/'yt-daily'/.test(paletteSrc), 'per-channel runs keep dispatching yt-daily (the route accepts every channel)');
});

test('T4d: the investors-compass TikTok special case is removed from the channels page — the generic path stands', () => {
  assert.equal(channelsPageSrc.includes('via Zernio · @arzo22345'), false, 'the hardcoded TikTok platform row must go');
  assert.equal(channelsPageSrc.includes("c.slug === 'investors-compass'"), false, 'no per-slug special case may remain');
});

test('T4d: the social page reads the Threads handle from the overview payload — the @quotequarry8 literal is gone', () => {
  assert.equal(socialSrc.includes('@quotequarry8'), false, 'the literal handle must be replaced by registry data');
  assert.ok(/threadsHandle/.test(socialSrc), 'the page must render the handle the API exposes');
});

test('T4d: site-data retires the TikTok lane copy — no dead workflow ad, no retired action button', () => {
  assert.equal(siteDataSrc.includes('tiktok-post.yml'), false, 'the retired workflow must not be advertised');
  assert.equal(/action:\s*'tiktok'/.test(siteDataSrc), false, "the dead 'tiktok' action button must be retired (the route answers 'workflow retired')");
  assert.ok(/id:\s*'tiktok'/.test(siteDataSrc), 'the lane entry may stay as honest placeholder copy');
});

// ---------------------------------------------------------------------------
// G12 — ci-doctor: the same discovery the nightlies use, no LEGACY_SLUGS gate.
// ---------------------------------------------------------------------------

test('T4d: ci-doctor discovers channels the nightly way — the LEGACY_SLUGS gate is gone', () => {
  assert.equal(doctorSrc.includes('LEGACY_SLUGS'), false, 'the health check must not be bounded by the legacy fleet');
  assert.match(doctorSrc, /import\s*\{\s*discoverChannels\s*\}\s*from\s*'\.\/scripts\/analytics-nightly\.mjs'/, 'the nightly discovery pattern is the source');
  assert.match(doctorSrc, /discoverChannels\(/, 'the doctor must call the discover function');
});
