// #106 Phase 4.5 T4c — destinations (FB page ID, IG/Threads/TikTok handles)
// are registry data with a Studio editor, and the social lanes read them
// instead of static page maps: fb-images.mjs's literal page array,
// ig-crosspost.mjs's PAGE_MAP + HASHTAGS, threads-daily.mjs's
// fb-outbox/quotequarry hardcode, and daily-excel-report.mjs's 'Quote Quarry'
// Threads row + manual 'All brands' TikTok row display literals.
//
// Behavioral pins live on lib/registry.mjs (destinations resolution),
// threads-daily.mjs (IS_MAIN-guarded, the daily-excel-report.mjs house
// pattern) and daily-excel-report.mjs (already guarded). The self-executing
// lane scripts (fb-images, ig-crosspost) and the '@/lib'-aliased studio
// surfaces are pinned by SOURCE-SCAN — the house pattern for scripts the
// runner owns (tests/registry-lanes.test.mjs) and for studio routes
// (tests/studio-registry-surfaces.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { destinationsFor, normHandle, channelHashtags, fbPageId, LEGACY_SLUGS } from '../lib/registry.mjs';
import {
  threadsTargets,
  pickThreadReel,
  threadsChannelState,
  nextThreadsState,
  runThreadsDaily,
} from '../threads-daily.mjs';
import { reportChannels, buildExcel } from '../daily-excel-report.mjs';

const read = (p) => fs.readFileSync(p, 'utf8');
// Strip full-line comments so explanatory prose cannot satisfy (or trip) the
// no-hardcode scans — the house pattern from tests/registry-lanes.test.mjs.
const code = (p) => read(p).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const fbImagesSrc = code('fb-images.mjs');
const igCrosspostSrc = code('ig-crosspost.mjs');
const threadsDailySrc = code('threads-daily.mjs');
const profileRouteSrc = read('studio/app/api/channels/profile/route.js');
const addPageSrc = read('studio/app/channels/add/page.js');

const LEGACY_PAGE_IDS = ['116157974886564', '1077306835630491', '106473735839651', '114550268199751'];

// ---------------------------------------------------------------------------
// Registry destinations resolution (present / absent / normalized).
// ---------------------------------------------------------------------------

test('T4c destinationsFor: the legacy 4 resolve through the FB oracle — byte-identical to the old lane maps', () => {
  for (const slug of LEGACY_SLUGS) {
    const dest = destinationsFor(slug);
    assert.ok(dest, `${slug} resolves`);
    assert.equal(dest.fbPageId, fbPageId(slug), `${slug}'s fbPageId rides the canonical oracle`);
    assert.ok(LEGACY_PAGE_IDS.includes(dest.fbPageId), `${slug}'s page id is one of the legacy 4`);
  }
  assert.equal(destinationsFor('quotequarry').threadsHandle, 'quotequarry8', 'quotequarry carries its seeded Threads handle');
});

test('T4c destinationsFor: channels without a destination resolve absent — never a fallback', () => {
  for (const slug of ['investors-compass', 'money-rulebook', 'debt-free-doctrine']) {
    assert.equal(destinationsFor(slug).threadsHandle, undefined, `${slug} has no seeded Threads handle`);
    assert.equal(destinationsFor(slug).igHandle, undefined, `${slug} has no seeded IG handle`);
    assert.equal(destinationsFor(slug).tiktokHandle, undefined, `${slug} has no seeded TikTok handle`);
  }
  assert.equal(destinationsFor('definitely-not-a-channel'), undefined, 'unknown slugs resolve to undefined (no silent fallback)');
});

test('T4c normHandle: leading @ stripped, lowercased — the importer convention', () => {
  assert.equal(normHandle('@QuoteQuarry8'), 'quotequarry8');
  assert.equal(normHandle('@@handle'), 'handle', 'multiple leading @ still strip');
  assert.equal(normHandle('quotequarry8'), 'quotequarry8', 'already-normalized handles pass through');
  assert.equal(normHandle(''), undefined, 'empty = absent');
  assert.equal(normHandle(null), undefined, 'null = absent');
  assert.equal(normHandle(undefined), undefined);
  assert.equal(normHandle('  @spaced  '), 'spaced', 'surrounding whitespace trims');
});

test('T4c destinationsFor: seeded handles come back normalized (@-stripped)', () => {
  const qq = destinationsFor('quotequarry');
  assert.equal(qq.threadsHandle, normHandle(qq.threadsHandle), 'resolved handles are stored normalized');
});

test('T4c channelHashtags: per-channel registry kit.hashtags wins; absent = undefined (lanes keep their defaults)', () => {
  assert.equal(
    channelHashtags('investors-compass', [{ slug: 'investors-compass', kit: { hashtags: '#Custom #Tags' } }]),
    '#Custom #Tags',
    'a custom registry hashtag overrides the lane default',
  );
  assert.equal(channelHashtags('x', [{ slug: 'x', kit: {} }]), undefined, 'no custom hashtag = undefined');
  assert.equal(channelHashtags('x', [{ slug: 'x' }]), undefined, 'no kit at all = undefined');
  assert.equal(channelHashtags('x', [{ slug: 'x', kit: { hashtags: '   ' } }]), undefined, 'blank custom hashtag = undefined');
  assert.equal(
    channelHashtags('quotequarry'),
    undefined,
    'the legacy 4 carry no custom registry hashtags yet — their lane defaults keep captions byte-identical',
  );
});

// ---------------------------------------------------------------------------
// fb-images.mjs — the literal 4-page array is registry data now.
// ---------------------------------------------------------------------------

test('T4c fb-images: no page-ID literal survives — pages resolve via destinationsFor', () => {
  for (const pageId of LEGACY_PAGE_IDS) {
    assert.equal(fbImagesSrc.includes(pageId), false, `page id ${pageId} must move to registry data`);
  }
  assert.ok(/destinationsFor/.test(fbImagesSrc), 'the poster loop must resolve destinations from the registry');
  assert.ok(/activeRegistryChannels/.test(fbImagesSrc), 'the channel universe must be the active registry (the T4b lane pattern)');
});

test('T4c fb-images: destination-less channels skip LOUDLY — never a silent no-op', () => {
  assert.match(
    fbImagesSrc,
    /✗ no FB page linked/,
    'a channel without destinations.fbPageId must log a visible skip (mirrors ig-crosspost)',
  );
  assert.match(
    fbImagesSrc,
    /✗ no brand kit/,
    'a registry channel without a brand kit must log a visible skip too (reachable now that the universe is the registry)',
  );
});

test('T4c fb-images: hashtags keep the legacy defaults as a documented fallback, registry kit.hashtags wins', () => {
  assert.ok(/HASHTAG_FALLBACKS/.test(fbImagesSrc), 'the legacy per-page hashtags must survive as the documented fallback');
  assert.ok(/channelHashtags/.test(fbImagesSrc), 'a custom registry hashtag must override the fallback');
  assert.match(
    fbImagesSrc,
    /#InvestingPsychology #StockMarket #WealthBuilding/,
    'the legacy-4 captions must stay byte-identical while no custom registry hashtag exists',
  );
});

// ---------------------------------------------------------------------------
// ig-crosspost.mjs — PAGE_MAP is registry data, HASHTAGS gain a registry override.
// ---------------------------------------------------------------------------

test('T4c ig-crosspost: no page-ID literal survives — PAGE_MAP proxies the registry resolver (the fb-crosspost pattern)', () => {
  for (const pageId of LEGACY_PAGE_IDS) {
    assert.equal(igCrosspostSrc.includes(pageId), false, `page id ${pageId} must move to registry data`);
  }
  assert.match(
    igCrosspostSrc,
    /new Proxy\(\{\}, \{ get: \(_t, slug\) => registryFbPageId\(String\(slug\)\) \}\)/,
    'PAGE_MAP must proxy lib/registry.mjs fbPageId — the house pattern fb-crosspost.mjs already uses',
  );
});

test('T4c ig-crosspost: hashtags resolve registry-first with the existing defaults as fallback', () => {
  assert.ok(/channelHashtags/.test(igCrosspostSrc), 'a custom registry hashtag must override the defaults');
  assert.ok(/#motivation #mindset #success/.test(igCrosspostSrc), 'the generic default set stays for channels without any hashtags');
  assert.match(
    igCrosspostSrc,
    /#stoicism #dailymotivation #mindset #wisdom #selfimprovement/,
    'the legacy-4 caption defaults must stay byte-identical while no custom registry hashtag exists',
  );
});

test('T4c ig-crosspost: destination-less channels keep the clean skip (no crash)', () => {
  assert.match(igCrosspostSrc, /✗ IG: no linked account/, 'the loud skip for a missing IG-linked page must survive');
});

// ---------------------------------------------------------------------------
// threads-daily.mjs — outbox dir parameterized by slug; the flow iterates
// registry channels with a threadsHandle (or --slug); date-guard per channel.
// ---------------------------------------------------------------------------

test('T4c threads-daily: the fb-outbox/quotequarry hardcode is gone — the outbox dir comes from the target slug', () => {
  assert.equal(threadsDailySrc.includes("fb-outbox/quotequarry"), false, 'the literal slug dir must be parameterized');
  assert.ok(/path\.join\(outboxRoot, t\.slug\)/.test(threadsDailySrc), 'the outbox dir must be built from the target slug');
  assert.ok(/threadsTargets/.test(threadsDailySrc), 'the daily flow must iterate the registry Threads targets');
  assert.ok(/--slug/.test(threadsDailySrc), 'a --slug mode must exist for single-channel runs');
  assert.match(threadsDailySrc, /IS_MAIN/, 'main must be guarded so tests can import the helpers');
});

test('T4c threadsTargets: only registry channels with a (normalized) threadsHandle are targets', () => {
  const entries = [
    { slug: 'quotequarry', label: 'Quote Quarry' },
    { slug: 'investors-compass', label: "Investor's Compass" }, // no Threads destination
    { slug: 'wisdom-daily', label: 'Wisdom Daily' },
  ];
  const targets = threadsTargets(entries);
  assert.deepEqual(
    targets.map((t) => t.slug),
    ['quotequarry'],
    'only the seeded Threads destination is a target today',
  );
  assert.equal(targets[0].threadsHandle, 'quotequarry8');
  assert.deepEqual(threadsTargets([]), [], 'empty registry = empty lane');
});

test('T4c pickThreadReel: newest titled reel wins, posted files and untitled cache are skipped', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't4c-outbox-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, '111.json'), JSON.stringify({ title: 'Old reel', description: 'd' }));
  fs.writeFileSync(path.join(dir, '111.mp4'), 'x');
  fs.writeFileSync(path.join(dir, '222.json'), JSON.stringify({ title: 'Fresh reel', description: 'd2' }));
  fs.writeFileSync(path.join(dir, '222.mp4'), 'x');
  fs.writeFileSync(path.join(dir, '333.mp4'), 'x'); // stale cache file without meta

  assert.equal(pickThreadReel(dir, []).file, '222.mp4', 'the newest titled reel wins');
  assert.equal(pickThreadReel(dir, ['222.mp4']).file, '111.mp4', 'posted files drop to the next oldest');
  assert.equal(pickThreadReel(dir, ['222.mp4', '111.mp4']), null, 'everything posted = nothing to pick');
  assert.equal(pickThreadReel(dir, []).meta.title, 'Fresh reel', 'the pick carries its meta');
});

test('T4c pickThreadReel: an empty or missing outbox dir is a clean null (never a crash)', (t) => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 't4c-empty-'));
  t.after(() => fs.rmSync(empty, { recursive: true, force: true }));
  assert.equal(pickThreadReel(empty, []), null, 'empty dir = nothing to pick');
  assert.equal(pickThreadReel(path.join(empty, 'does-not-exist'), []), null, 'missing dir = nothing to pick');
});

test('T4c date-guard: per-channel state nests under the slug — the legacy single-account shape carries over', () => {
  // legacy shape: top-level lastPostDate/postedFiles belonged to quotequarry
  // (the only seeded handle) — the guard must survive the flip unchanged.
  const legacy = { lastPostDate: '2026-11-01', postedFiles: ['a.mp4'] };
  assert.deepEqual(
    threadsChannelState(legacy, 'quotequarry'),
    { lastPostDate: '2026-11-01', postedFiles: ['a.mp4'] },
    'the legacy top-level state is quotequarry’s per-channel state',
  );
  assert.deepEqual(
    threadsChannelState({ quotequarry: { lastPostDate: '2026-11-01' } }, 'quotequarry'),
    { lastPostDate: '2026-11-01' },
    'the nested per-channel shape reads back',
  );
  assert.deepEqual(threadsChannelState({}, 'quotequarry'), {}, 'no state = fresh channel');
});

test('T4c date-guard: the first per-channel write drops the legacy top-level keys', () => {
  const next = nextThreadsState({ lastPostDate: '2026-11-01', postedFiles: ['old.mp4'] }, 'quotequarry', {
    lastPostDate: '2026-11-01',
    postedFiles: ['old.mp4', 'new.mp4'],
  });
  assert.deepEqual(next, { quotequarry: { lastPostDate: '2026-11-01', postedFiles: ['old.mp4', 'new.mp4'] } });
  assert.equal(next.lastPostDate, undefined, 'the legacy top-level guard must not linger');
});

test('T4c round 1: the daily LOOP accumulates state across targets — B never erases A, the legacy shape never leaks to B', async (t) => {
  // reviewer-reproduced bug shape: main() snapshotting tstate once made every
  // successful post write from the STALE snapshot — the second target's write
  // erased the first channel's nested state (guard + postedFiles), so the
  // same reel re-picked and double-posted daily; worse, threadsChannelState
  // handed the legacy top-level shape to any un-nested slug.
  const outbox = fs.mkdtempSync(path.join(os.tmpdir(), 't4c-loop-'));
  t.after(() => fs.rmSync(outbox, { recursive: true, force: true }));
  for (const [slug, stamp, title] of [['aaa', '111', 'Reel A'], ['bbb', '222', 'Reel B']]) {
    fs.mkdirSync(path.join(outbox, slug), { recursive: true });
    fs.writeFileSync(path.join(outbox, slug, `${stamp}.mp4`), 'x');
    fs.writeFileSync(path.join(outbox, slug, `${stamp}.json`), JSON.stringify({ title, description: 'd' }));
  }
  const saved = [];
  const targets = [
    { slug: 'aaa', label: 'A', threadsHandle: 'aaa' },
    { slug: 'bbb', label: 'B', threadsHandle: 'bbb' },
  ];
  const first = await runThreadsDaily({
    targets,
    today: '2026-11-01',
    outboxRoot: outbox,
    tstate: { lastPostDate: '2026-10-31', postedFiles: ['old.mp4'] }, // legacy single-account shape
    saveState: (s) => saved.push(JSON.parse(JSON.stringify(s))),
    publish: async () => ({ id: 'x' }),
  });
  assert.equal(first.failed, false, 'both targets post clean');
  assert.equal(first.state.bbb.postedFiles.includes('111.mp4'), false, "A's postedFiles never leak into B");
  assert.equal(saved.length, 2, 'one persisted write per successful post');
  assert.deepEqual(
    saved[0],
    { aaa: { lastPostDate: '2026-11-01', postedFiles: ['old.mp4', '111.mp4'] } },
    "A (the legacy owner) carries the legacy postedFiles over and drops the legacy top-level keys",
  );
  assert.deepEqual(
    saved[1],
    { aaa: { lastPostDate: '2026-11-01', postedFiles: ['old.mp4', '111.mp4'] }, bbb: { lastPostDate: '2026-11-01', postedFiles: ['222.mp4'] } },
    "B's write keeps A's nested state on disk — the guard and postedFiles survive",
  );

  // the persisted shape re-read as the next run's tstate: both guards hold, nothing re-posts
  let republished = 0;
  const second = await runThreadsDaily({
    targets,
    today: '2026-11-01',
    outboxRoot: outbox,
    tstate: saved[1],
    saveState: () => assert.fail('a same-day re-run must never write state'),
    publish: async () => {
      republished++;
      return { id: 'x' };
    },
  });
  assert.equal(republished, 0, 'same-day re-run posts nothing — per-channel date-guard holds through the loop');
  assert.deepEqual(second.state, saved[1], 'state is untouched by an all-skip pass');
});

// ---------------------------------------------------------------------------
// daily-excel-report.mjs — the Threads + TikTok display rows are
// destinations-driven; absent destination = the row is honestly omitted.
// ---------------------------------------------------------------------------

test('T4c reportChannels: every channel carries its resolved destinations', () => {
  const bySlug = Object.fromEntries(reportChannels().map((c) => [c.slug, c]));
  // MR-only mode (owner directive 2026-11-03): the report covers the ACTIVE
  // set only; destination RESOLUTION is a registry lookup and stays correct
  // for the paused channels (reactivation restores their rows, zero edits).
  assert.equal(bySlug['money-rulebook'].fbPageId, '1077306835630491', 'the active channel resolves via the oracle');
  assert.equal(bySlug['quotequarry'], undefined, 'paused channels stay out of the report');
  assert.equal(destinationsFor('quotequarry')?.threadsHandle, 'quotequarry8', 'the seeded Threads handle still resolves from the registry');
  assert.equal(destinationsFor('debt-free-doctrine')?.tiktokHandle, undefined, 'absent destinations stay absent');
});

test('T4c buildExcel: channels with a threadsHandle get a Threads row — the global profile read only adds followers', async (t) => {
  const reportsDir = tmpDir(t, 'reports-threads');
  const stateDir = tmpDir(t, 'state-threads');
  const channels = [
    { slug: 'quotequarry', label: 'Quote Quarry', fbPageId: '114550268199751', threadsHandle: 'quotequarry8' },
    { slug: 'investors-compass', label: "Investor's Compass", fbPageId: '116157974886564' }, // no Threads
  ];
  const file = await buildExcel([], [], { username: 'quotequarry8', followers: null }, { reportsDir, stateDir, channels });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const overview = wb.getWorksheet('Overview');
  const rows = sheetRows(overview);
  const threadsRows = rows.filter((r) => r[1] === 'Threads');
  assert.equal(threadsRows.length, 1, 'exactly the seeded Threads destination gets a row');
  assert.deepEqual(threadsRows[0], ['Quote Quarry', 'Threads', '@quotequarry8', 'n/a', '-', '-'], 'the legacy-4 Threads row shape is unchanged');
});

test('T4c buildExcel: no tiktokHandle = no TikTok row (honestly omitted, no display literal)', async (t) => {
  const reportsDir = tmpDir(t, 'reports-tiktok-absent');
  const stateDir = tmpDir(t, 'state-tiktok-absent');
  const channels = [{ slug: 'quotequarry', label: 'Quote Quarry', fbPageId: '114550268199751', threadsHandle: 'quotequarry8' }];
  const file = await buildExcel([], [], null, { reportsDir, stateDir, channels });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const rows = sheetRows(wb.getWorksheet('Overview'));
  assert.equal(rows.some((r) => r[1] === 'TikTok'), false, 'the manual All-brands TikTok row is gone when no channel has a tiktokHandle');
});

test('T4c buildExcel: a channel with a tiktokHandle gets its own manual TikTok row', async (t) => {
  const reportsDir = tmpDir(t, 'reports-tiktok-present');
  const stateDir = tmpDir(t, 'state-tiktok-present');
  const channels = [
    { slug: 'quotequarry', label: 'Quote Quarry', fbPageId: '114550268199751' },
    { slug: 'investors-compass', label: "Investor's Compass", fbPageId: '116157974886564', tiktokHandle: 'munnabhai3483' },
  ];
  const file = await buildExcel([], [], null, { reportsDir, stateDir, channels });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const rows = sheetRows(wb.getWorksheet('Overview'));
  const tiktokRows = rows.filter((r) => r[1] === 'TikTok');
  assert.equal(tiktokRows.length, 1, 'exactly the channel with a tiktokHandle gets a row');
  assert.deepEqual(
    tiktokRows[0],
    ["Investor's Compass", 'TikTok', '@munnabhai3483', 'manual — no API approval yet', '-', '-'],
    'the manual-row honesty (no API approval yet) is kept per channel',
  );
});

// ---------------------------------------------------------------------------
// Studio — the profile editor gains the Destinations section; the save route
// normalizes handles, validates fbPageId, and mirrors into kit.destinations
// (T4d: the kit JSONB is the durable home — it survives OAuth re-connects).
// ---------------------------------------------------------------------------

test('T4c profile route: destinations are saved via the profile save path, normalized and validated', () => {
  assert.match(profileRouteSrc, /body\.destinations/, 'the save route must accept a destinations block');
  assert.ok(
    profileRouteSrc.includes(".replace(/^@+/, '')"),
    'handles must normalize with the leading @ stripped on save (the importer normHandle convention)',
  );
  assert.ok(/FB_PAGE_ID_RE/.test(profileRouteSrc), 'fbPageId must pass a named format check');
  assert.ok(profileRouteSrc.includes('UC[A-Za-z0-9_-]'), 'fbPageId validation must accept the UC… page form');
  assert.ok(/\\d\{6,\}/.test(profileRouteSrc), 'fbPageId validation must accept the numeric legacy page form');
  // round 1: a non-object (or array) envelope must 400, not silently wipe saved destinations
  assert.match(
    profileRouteSrc,
    /typeof body\.destinations !== 'object'\s*\|\|\s*Array\.isArray\(body\.destinations\)/,
    'a non-object destinations envelope must be rejected (parity with the fbPageId 400)',
  );
  // round 1: handles carry a charset check beside the fbPageId check
  assert.ok(/HANDLE_RE/.test(profileRouteSrc), 'handles must pass a named charset check');
  assert.ok(profileRouteSrc.includes('[\\w.-]'), 'the handle charset must be letters/digits/dots/dashes/underscores');
  assert.match(
    profileRouteSrc,
    /\.kit\s*=\s*\{\s*\.\.\.\(entry\.kit \|\| \{\}\),\s*destinations/,
    'destinations must mirror into kit.destinations (T4d durability)',
  );
});

test('T4c profile editor: the Destinations section exists with the four inputs', () => {
  for (const field of ['fbPageId', 'igHandle', 'threadsHandle', 'tiktokHandle']) {
    assert.ok(addPageSrc.includes(field), `the editor form must carry ${field}`);
  }
  assert.match(addPageSrc, /destinations:\s*\{/, 'saveProfile must POST the destinations block');
  assert.match(addPageSrc, /entry\.destinations\?\./, 'prefill must read the saved destinations back');
});

// ---------------------------------------------------------------------------
// shared test helpers
// ---------------------------------------------------------------------------

function tmpDir(t, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `t4c-${name}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function sheetRows(ws) {
  const rows = [];
  ws.eachRow((row, idx) => {
    if (idx === 1) return; // header
    rows.push(row.values.slice(1).map((v) => (v === undefined ? '-' : v)));
  });
  return rows;
}
