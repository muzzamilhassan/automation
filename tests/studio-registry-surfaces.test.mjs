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
import { loadRegistryTemplates } from '../studio/lib/template-registry.js';

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
const oauthCallbackSrc = read('studio/app/api/oauth/callback/route.js');
const reviewApiSrc = read('studio/app/api/review/route.js');
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
  assert.match(overviewSrc, /fbId\s*\?\s*fbRows\.find/, 'a channel without a registry destination must omit the FB row');
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

// ---------------------------------------------------------------------------
// Round 1 review fixes — the kit JSONB survives an OAuth re-connect; control
// surfaces get an unfiltered list; cloud 404 storm; parked-channel gate.
// ---------------------------------------------------------------------------

test('T4d round 1: the OAuth re-connect carries the existing kit — upsert cannot clobber the kit JSONB', () => {
  // the reviewer-confirmed clobber: the callback built a kit-less entry and
  // upsertChannel blind-SET kit = EXCLUDED.kit — one re-connect wiped
  // destinations, gateCron (T4a) and the generated niches in Neon
  assert.match(oauthCallbackSrc, /existing\?\.kit/, 'the callback must carry the existing entry kit into the new entry');
  assert.equal(/kit = EXCLUDED\.kit/.test(studioRegistrySrc), false, 'the blind kit SET must be gone');
  assert.match(
    studioRegistrySrc,
    /kit = COALESCE\(channels\.kit, '\{\}'::jsonb\) \|\| COALESCE\(EXCLUDED\.kit, '\{\}'::jsonb\)/,
    'field-level jsonb merge: caller-sent fields win, absent fields survive (destinations, gateCron)',
  );
});

test('T4d round 1: overview exposes controlChannels — unfiltered by the production filter, still client-scoped', () => {
  assert.ok(/controlChannels/.test(overviewSrc), 'the control list must exist');
  assert.match(
    overviewSrc,
    /owned \? channels\.filter\(\(c\) => owned\.includes\(c\.slug\)\) : channels/,
    'controlChannels must be built from the UNFILTERED channels array (pre producing-filter), scoped for clients',
  );
  assert.match(overviewSrc, /\{ channels: visible, controlChannels,/, 'the payload must include controlChannels');
});

test('T4d round 1: palette and music consume controlChannels so an erroring channel keeps its controls', () => {
  assert.match(paletteSrc, /controlChannels \|\| d\?\.channels/, 'palette run entries must prefer the control list');
  assert.match(musicSrc, /controlChannels \|\| d\?\.channels/, 'music tabs must prefer the control list');
});

test('T4d round 1: state-file reads memoize negative results — no cloud 404 storm per dashboard request', () => {
  assert.match(dataSrc, /stateFileMemo/, 'the negative-result memo must exist');
  assert.match(dataSrc, /readStateFile\(/, 'state() must read per-channel state files through the memo');
});

test('T4d round 1: ci-doctor gates passive discovery on the active registry+brands set — CHANNELS env overrides', () => {
  assert.match(doctorSrc, /import\s*\{\s*listChannels\s*\}\s*from\s*'\.\/lib\/registry\.mjs'/, 'the active set comes from the registry+brands merge');
  assert.match(doctorSrc, /process\.env\.CHANNELS \? discovered : discovered\.filter/, 'an explicit CHANNELS list overrides the parked-channel gate');
});

// ---------------------------------------------------------------------------
// P5 T2f — panel surfaces speak the template identity (D9 + the T1 reviewer
// note): after T1's identity split the assignment string IS the template_id
// (the registry key), so the user-facing surface renames familyId ->
// templateId (the assignment body param, the card fields) while the VISUAL
// family stays a separate displayed field. SOURCE-SCAN pins on the routes,
// gallery, detail page and panel (house pattern — '@/lib' aliases are not
// node --test importable), plus one behavioral pin through the importable
// loader for the two distinct fields the gallery renders. The loader itself
// and the DB columns keep their legacy names (T1 dual meaning, engine
// consumers) — the ONLY familyId these surfaces may still reference is the
// loader's invalid-row field (`v.familyId` / `x.familyId`).
// ---------------------------------------------------------------------------

const templatesApiSrc = read('studio/app/api/templates/route.js');
const assignRouteSrc = read('studio/app/api/templates/assign/route.js');
const galleryPageSrc = read('studio/app/templates/registry/page.js');
const detailPageSrc = read('studio/app/templates/registry/detail/page.js');
const assignPanelSrc = read('studio/components/TemplateAssignPanel.js');

const onlyLoaderInvalidLookup = (src, label) => {
  for (const line of src.split('\n').filter((l) => l.includes('familyId'))) {
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('{/*') || t.startsWith('*')) continue; // comment/doc lines may name the legacy field
    assert.match(line, /[vx]\.familyId/, `${label}: the only familyId left is the loader invalid-row lookup (got: ${t})`);
  }
};

test('T2f: the assign route takes templateId — the body param IS the registry key, no familyId surface remains', () => {
  assert.match(assignRouteSrc, /const \{ channelId, templateId \} = body/, 'POST parses templateId from the body');
  assert.match(assignRouteSrc, /channelId and templateId are required/, 'the 400 names templateId');
  assert.match(assignRouteSrc, /t\.templateId === templateId/, 'the template lookup keys on the identity');
  assert.match(assignRouteSrc, /db\.assignTemplate\(channelId, templateId/, 'the DB assign call carries templateId');
  assert.match(assignRouteSrc, /db\.unassignTemplate\(channelId, templateId/, 'the DB unassign call carries templateId');
  assert.match(assignRouteSrc, /q\.get\('templateId'\)/, 'the DELETE query fallback reads ?templateId=');
  assert.match(assignRouteSrc, /\{ ok: true, channelId, templateId \}/, 'the unassign response names templateId');
  onlyLoaderInvalidLookup(assignRouteSrc, 'assign route');
});

test('T2f: the GET templates route reads ?template= and answers templateId for the usage branch', () => {
  assert.match(templatesApiSrc, /params\.get\('template'\)/, 'the usage query param is ?template= (the registry key)');
  assert.match(templatesApiSrc, /\{ role, templateId, templates: view\.templates, invalid: view\.invalid, usage/, 'the family-branch response names templateId');
  assert.equal(templatesApiSrc.includes('familyId'), false, 'no familyId may remain in the GET route');
  assert.equal(templatesApiSrc.includes("params.get('family')"), false, 'the old ?family= param must be gone');
});

test('T2f: the gallery cards show templateId and family as distinct fields — the identity split on the card', () => {
  assert.match(galleryPageSrc, /\{t\.templateId\}/, 'the card id line renders the registry key');
  assert.match(galleryPageSrc, /Family</, 'the card has a labeled Family row (the VISUAL family, its own field)');
  assert.match(galleryPageSrc, /\{t\.family\}/, 'the Family row renders the visual family id');
  assert.equal(galleryPageSrc.includes('t.familyId'), false, 'the gallery must not present the identity under the family name');
  assert.match(galleryPageSrc, /detail\?template=/, 'the detail link carries the identity as ?template=');
  assert.match(galleryPageSrc, /t\.templateId\.toLowerCase\(\)/, 'registry search matches the templateId');
  onlyLoaderInvalidLookup(galleryPageSrc, 'gallery page');
});

test('T2f: the detail page speaks templateId — ?template= URL, templateId fetch + re-pin body, family shown separately', () => {
  assert.match(detailPageSrc, /q\.get\('template'\)/, 'the URL param is ?template=');
  assert.match(detailPageSrc, /api\/templates\?template=/, 'the view fetch queries the renamed GET param');
  assert.match(detailPageSrc, /templateId: template/, 'the re-pin body sends templateId');
  assert.match(detailPageSrc, /x\.templateId === template/, 'the template lookup keys on the identity');
  assert.match(detailPageSrc, /\{t\.templateId\}/, 'the header sub line renders the registry key');
  assert.match(detailPageSrc, /\{t\.family\}/, 'the visual family is displayed as its own field');
  onlyLoaderInvalidLookup(detailPageSrc, 'detail page');
});

test('T2f: the assignment panel speaks templateId — picker state and POST/DELETE bodies carry the registry key', () => {
  assert.match(assignPanelSrc, /const \[templateId, setTemplateId\]/, 'the picker state is templateId');
  assert.match(assignPanelSrc, /byTemplate = useMemo/, 'the lookup map is named byTemplate');
  assert.match(assignPanelSrc, /new Map\(templates\.map\(\(t\) => \[t\.templateId, t\]\)\)/, 'the map keys on the identity');
  assert.match(assignPanelSrc, /body: JSON\.stringify\(\{ channelId: slug, templateId, pinnedMajor: Number\(pinnedMajor\) \}\)/, 'the assign body sends templateId');
  assert.match(assignPanelSrc, /body: JSON\.stringify\(\{ channelId: slug, templateId: tid \}\)/, 'the unassign body sends templateId');
  assert.match(assignPanelSrc, /body: JSON\.stringify\(\{ channelId: slug, templateId: tid, pinnedMajor: newMajor \}\)/, 'the re-pin body sends templateId');
  assert.equal(assignPanelSrc.includes('familyId'), false, 'the panel must not carry the old surface name anywhere');
});

test('T2f: the loader view the gallery renders carries templateId and family as DISTINCT fields (v2 block)', () => {
  const catalog = [{ family: 'stats-counters', name: 'Stats Counters', aspectRatios: ['9:16'] }];
  const meta = {
    'myth-vs-money': {
      template_id: 'myth-vs-money',
      family: 'stats-counters', // visual family ≠ template_id — the split T2f renders
      version: '1.0.0',
      niches: ['Personal finance rules & money habits'],
      formats: ['short'],
      renderer: 'remotion',
      required_capabilities: [],
      variation_rules: ['vary the reversal evidence'],
      safety: { required_sources: false, review_required: ['finance'], disclaimers: ['Education, not financial advice.'] },
      story_structure: {
        beats: ['the popular belief', 'reversal evidence', 'what-to-do payoff'],
        hook_classes: ['challenge'],
        title_patterns: ['3 money myths'],
        payoff_rule: 'the fix lands in the last beat',
      },
      deprecated: false,
      changelog: [{ version: '1.0.0', date: '2026-11-01', note: 'pilot' }],
    },
  };
  const { templates, invalid } = loadRegistryTemplates(catalog, meta);
  assert.equal(invalid.length, 0, JSON.stringify(invalid));
  assert.equal(templates[0].templateId, 'myth-vs-money', 'templateId is the registry key (the card id field)');
  assert.equal(templates[0].family, 'stats-counters', 'family is the visual family (the separate card field)');
  assert.notEqual(templates[0].templateId, templates[0].family, 'identity and visual family must stay distinct concepts on the gallery');
});

// ---------------------------------------------------------------------------
// #106 T5f round 1 — the review desk's store() is a SECOND production
// makeScriptStore construction site (besides getScriptStore): the desk reads
// and single-writes today, but a dbClient-only store there would run any
// future saveScript non-atomically (the pass-through default, autocommit —
// silent partial persist). SOURCE-SCAN pin (the '@/lib' alias is not
// node --test importable — the house pattern this file is built on).
// ---------------------------------------------------------------------------

test('T5f round 1: /api/review store() constructs with dbClient AND transact — no dbClient-only store site remains in production', () => {
  assert.match(
    reviewApiSrc,
    /import\s*\{\s*makeScriptStore,\s*adaptPostgresTransact\s*\}\s*from\s*'@\/lib\/script-store\.mjs'/,
    'the route imports the transact adapter from the same module as the factory',
  );
  assert.match(
    reviewApiSrc,
    /makeScriptStore\(\{\s*dbClient:\s*adaptPostgres\(db\),\s*transact:\s*adaptPostgresTransact\(db\)\s*\}\)/,
    'the store construction carries BOTH deps — the sql.begin transport is wired at every production construction site',
  );
});
