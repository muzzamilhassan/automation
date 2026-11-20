// Live fix wave C2 (2026-11-20 live test report, research/live-e2e-test-2026-11-20.md):
// the data pages — Analytics, Today's chart, Runs, Library, Topic Desk, Inbox.
//   T2-13  three different 28-day view totals on Analytics (733 / 866 / 799)
//   T2-14  watch time rounded to whole hours (0.4 h → "0")
//   T2-18  a real 0 shows "—"; "ID 0" in top countries
//   T2-19  picker shows codes; leaderboard ignores the picker; Topic Desk has no "All"
//   T2-20  Today's chart chip claims today's date; bars have no axis or values
//   T2-26  analytics tile labels cut off at 1440
//   T2-16  /runs replaces the page on a GitHub 403; self-contradicting wording
//   T2-23  "started by hand or clock" + "Untagged" heartbeat runs
//   T2-11 / T2-17 / T2-24  Library: bare "No link", "86 shown" vs 24 rows, Back leaves
//   T1-17  (part) "DRILL 2" row in the Inbox's Recently resolved
//   T2-22  the Reports card shows "—" for the date and implies 2-month-old reports are current
// Pure logic is behaviour-tested; '@/' components are pinned by source scan
// (house pattern). QA: docs/qa/live-fix-wave-c2-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  fmtWatchTime, watchMinutes, fmtDelta, countedOnly, lastDataDay, fmtDay,
  viewSplit, pickerOptions, boardRows, reportDay, reportsState,
} from '../studio/lib/analytics-view.mjs';
import {
  runScope, runOrigin, SCOPE_LABEL, githubFailText, parseSavedRuns, mapRun,
} from '../studio/lib/runs-view.mjs';
import {
  buildLibrary, toItem, LINK_NOTE, countLine, libraryFilters, libraryHref,
} from '../studio/lib/library-view.mjs';
import { isDrill, withoutDrills } from '../studio/lib/drill-rows.mjs';

const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const AN = code(read('studio/app/analytics/page.js'));
const HOME = code(read('studio/app/page.js'));
const CHARTS = code(read('studio/components/charts.js'));
const RUNS = code(read('studio/app/runs/page.js'));
const RUNS_ROUTE = code(read('studio/app/api/runs/route.js'));
const VIDEOS = code(read('studio/app/videos/page.js'));
const TASKS = code(read('studio/app/tasks/page.js'));
const TOPICS = code(read('studio/app/topics/page.js'));
const REPORTS_ROUTE = code(read('studio/app/api/reports/route.js'));
const NOW = Date.parse('2026-11-20T14:00:00Z');

/* --------------------------- T2-14 watch time ---------------------------- */

test('T2-14 EARS: WHEN watch time is under 1 hour THEN it shows minutes, never a rounded "0"', () => {
  assert.equal(fmtWatchTime(watchMinutes(0.4)), '24 min');
  assert.equal(fmtWatchTime(watchMinutes(0)), '0 min');
  assert.equal(fmtWatchTime(watchMinutes(null)), '—');
  assert.equal(fmtWatchTime(watchMinutes(undefined)), '—');
});

test('T2-14 EARS: WHEN watch time is 1–10 hours THEN it shows one decimal; 10 h and up whole hours', () => {
  assert.equal(fmtWatchTime(watchMinutes(4.4)), '4.4 h');
  assert.equal(fmtWatchTime(watchMinutes(1)), '1.0 h');
  assert.equal(fmtWatchTime(watchMinutes(12.6)), '13 h');
  assert.equal(fmtWatchTime(watchMinutes(1234)), '1,234 h');
});

test('T2-14: the tile counts up whole MINUTES (the count-up rounds) and formats them', () => {
  assert.match(AN, /label="Watch time · 28d" value=\{real \? watchMinutes\(real\.totals\?\.watchHours\) : null\} fmt=\{fmtWatchTime\}/);
  assert.doesNotMatch(AN, /label="Watch time · hours"/);
  // the leaderboard column uses the same formatter
  assert.match(AN, /fmtWatchTime\(watchMinutes\(r\.watchHours\)\)/);
});

/* ------------------------- T2-18 real zero vs unknown ------------------------- */

test('T2-18 EARS: a real 0 reads "0"; unknown reads "—"; gains get a +', () => {
  assert.equal(fmtDelta(0), '0');
  assert.equal(fmtDelta(2), '+2');
  assert.equal(fmtDelta(-3), '-3');
  assert.equal(fmtDelta(null), '—');
  assert.equal(fmtDelta(undefined), '—');
  assert.equal(fmtDelta(NaN), '—');
  assert.match(AN, /fmtDelta\(r\.subsDelta\)/);
  assert.doesNotMatch(AN, /r\.subsDelta \? /);
});

test('T2-18 EARS: countries with 0 views are hidden ("ID 0" is gone)', () => {
  const rows = countedOnly([{ key: 'US', views: 115 }, { key: 'ID', views: 0 }, { key: 'XX' }]);
  assert.deepEqual(rows.map((r) => r.key), ['US']);
  assert.equal(countedOnly(null).length, 0);
  assert.equal(countedOnly(Array.from({ length: 9 }, (_, i) => ({ key: 'C' + i, views: 9 - i }))).length, 6);
  assert.match(AN, /const countries = countedOnly\(real\?\.audience\?\.countries\)/);
});

/* --------------------------- T2-13 one total ---------------------------- */

test('T2-13 EARS: the Shorts/long split adds up to the SAME 28-day total as the tiles', () => {
  // live test numbers: tiles 866, per-video split 643 + 156 = 799
  const s = viewSplit({ total: 866, shorts: 643, long: 156 });
  assert.equal(s.total, 866);
  assert.equal(s.other, 67);
  assert.equal(s.shorts + s.long + s.other, 866);
  assert.equal(s.shortPct + s.longPct + s.otherPct, 100);
  // no gap → no "other" row, and the two shares still add to 100
  const t = viewSplit({ total: 10, shorts: 3, long: 7 });
  assert.equal(t.other, 0);
  assert.equal(t.shortPct + t.longPct, 100);
  // a total smaller than the parts (never seen) falls back to the parts
  assert.equal(viewSplit({ total: 5, shorts: 4, long: 4 }).total, 8);
  assert.equal(viewSplit({ total: 0, shorts: 0, long: 0 }), null);
});

test('T2-13 EARS: the page states the live window ("data through <date>") once, from the last real data point', () => {
  const daily = [{ date: '2026-10-23', views: 71 }, { date: '2026-11-17', views: 55 }];
  assert.equal(lastDataDay(daily), '2026-11-17');
  assert.equal(lastDataDay([]), null);
  assert.equal(lastDataDay(null), null);
  assert.equal(fmtDay('2026-11-17'), 'Nov 17');
  assert.equal(fmtDay('2026-09-19'), 'Sep 19');
  assert.equal(fmtDay('nope'), '');
  assert.match(AN, /const through = lastDataDay\(real\?\.daily\)/);
  assert.match(AN, /data through \$\{fmtDay\(through\)\}/);
  // the split uses the tile total, and names the remainder
  assert.match(AN, /viewSplit\(\{ total: real\?\.totals\?\.views, shorts: real\?\.split\?\.shortsViews, long: real\?\.split\?\.longViews \}\)/);
  assert.match(AN, /Not sorted/);
});

test('T2-13 EARS: the leaderboard says it is a nightly snapshot that can differ from the live numbers', () => {
  assert.match(AN, /Saved nightly/);
  assert.match(AN, /can differ a little from the live/);
  // no second "data through" chip on the win-rates card
  assert.equal((AN.match(/data through \{snapThrough\}/g) || []).length, 0);
});

/* --------------------------- T2-19 picker + board ---------------------------- */

test('T2-19 EARS: the channel picker shows real channel names, "All channels" first', () => {
  const opts = pickerOptions(
    [{ slug: 'quotequarry', label: 'QuoteQuarry' }, { slug: 'yt-bot' }],
    { quotequarry: { label: 'Quote Quarry', short: 'QU' } },
  );
  assert.deepEqual(opts, [
    { value: 'all', label: 'All channels' },
    { value: 'quotequarry', label: 'Quote Quarry' },
    { value: 'yt-bot', label: 'yt-bot' },
  ]);
  assert.match(AN, /options=\{pickerOptions\(active, BRAND\)\}/);
  assert.doesNotMatch(AN, /label: BRAND\[c\.slug\]\?\.short/);
});

test('T2-19 EARS: the leaderboard follows the picker and says which channels it shows', () => {
  const rows = [{ channelId: 'a', views: 3 }, { channelId: 'b', views: 1 }];
  assert.equal(boardRows(rows, 'all').length, 2);
  assert.deepEqual(boardRows(rows, 'b').map((r) => r.channelId), ['b']);
  assert.deepEqual(boardRows(null, 'all'), []);
  assert.match(AN, /const snapRows = boardRows\(snap\?\.rows, sel\)/);
  assert.match(AN, /sel === 'all' \? 'All channels' : /);
});

test('T2-19 EARS: the Topic Desk opens on "All channels" with real names', () => {
  assert.match(TOPICS, /useState\('all'\)/);
  assert.match(TOPICS, /\{ value: 'all', label: 'All channels' \}/);
  assert.doesNotMatch(TOPICS, /BRAND\[c\.slug\]\?\.short \|\| c\.slug/);
  assert.doesNotMatch(TOPICS, /\.slice\(0, 6\)\.toUpperCase\(\)/);
  // the All view reads every channel's queue and opens one to manage it
  assert.match(TOPICS, /Promise\.all\(/);
  assert.match(TOPICS, /onClick=\{\(\) => setSel\(/);
  // single-channel loads never fire for "all"
  assert.match(TOPICS, /if \(!sel \|\| sel === 'all'\) return;/);
});

/* ------------------------------ T2-26 labels ------------------------------ */

test('T2-26: analytics tile labels are short and the tiles get room at 1440 (6 across only from 2xl)', () => {
  for (const l of ['Views · 28d', 'Watch time · 28d', 'New subs · 28d']) assert.ok(AN.includes(`label="${l}"`), l);
  assert.match(AN, /grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-4 mb-5/);
  assert.doesNotMatch(AN, /(?<!2)xl:grid-cols-6/);
});

/* --------------------------- T2-20 Today's chart ---------------------------- */

test('T2-20 EARS: the Today chart chip says "data through <last data day>", not the fetch date', () => {
  assert.match(HOME, /lastDataDay\(analytics\?\.daily\)/);
  assert.match(HOME, /data through \$\{fmtDay\(through\)\}/);
  assert.doesNotMatch(HOME, /new Date\(analyticsCoverage\.fetchedAt\)\.toLocaleDateString\(\)/);
});

test('T2-20 EARS: the bars carry a y-axis max and an accessible value per bar on hover', () => {
  const bars = CHARTS.slice(CHARTS.indexOf('export function MiniBars'));
  assert.match(bars, /<ol[^>]*aria-label=\{ariaLabel\}/);
  assert.match(bars, /aria-label=\{`\$\{labels\?\.\[i\] \?\? i\}: \$\{v\.toLocaleString\('en-US'\)\} \$\{unit\}`\}/);
  assert.match(bars, /role="tooltip"/);
  assert.match(bars, /group-hover:opacity-100/);
  // the y-axis: the real max at the top, 0 at the bottom
  assert.match(bars, /\{max\.toLocaleString\('en-US'\)\}/);
  assert.match(HOME, /<MiniBars [\s\S]{0,240}?ariaLabel="Views per day, all channels"/);
  assert.match(AN, /<MiniBars [\s\S]{0,240}?ariaLabel=\{`Views per day, /);
});

/* -------------------------------- T2-16 runs -------------------------------- */

test('T2-16 EARS: a GitHub error is described plainly, never "didn\'t answer … answered 403"', () => {
  assert.equal(githubFailText(403), 'GitHub refused the request (403) — often a short rate limit.');
  assert.equal(githubFailText(401), "GitHub didn't accept the panel's token (401).");
  assert.equal(githubFailText(502), 'GitHub had a problem on its side (502).');
  assert.equal(githubFailText(null), "GitHub couldn't be reached.");
  assert.doesNotMatch(RUNS, /GitHub didn&apos;t answer/);
  assert.doesNotMatch(RUNS_ROUTE, /GitHub didn't answer/);
  assert.match(RUNS_ROUTE, /githubFailText\(/);
});

test('T2-16 EARS: WHEN GitHub fails AND the server has an earlier good answer THEN it serves it, marked stale', () => {
  assert.match(RUNS_ROUTE, /let lastGood = null;/);
  assert.match(RUNS_ROUTE, /if \(lastGood\) return Response\.json\(\{ \.\.\.lastGood, stale: true, staleReason: /);
  assert.match(RUNS_ROUTE, /lastGood = payload;/);
});

test('T2-16 EARS: WHEN the page cannot refresh THEN it keeps the last good runs (sessionStorage) with a small banner', () => {
  const good = { ok: true, runs: [{ id: 1 }], fetchedAt: '2026-11-20T10:00:00Z' };
  assert.deepEqual(parseSavedRuns(JSON.stringify(good)), good);
  assert.equal(parseSavedRuns('not json'), null);
  assert.equal(parseSavedRuns(null), null);
  assert.equal(parseSavedRuns(JSON.stringify({ runs: 'x', fetchedAt: 'y' })), null);
  assert.equal(parseSavedRuns(JSON.stringify({ runs: [] })), null);
  assert.match(RUNS, /window\.sessionStorage\.setItem\(SAVED_KEY, JSON\.stringify\(d\)\)/);
  assert.match(RUNS, /parseSavedRuns\(window\.sessionStorage\.getItem\(SAVED_KEY\)\)/);
  assert.match(RUNS, /Couldn't refresh — showing runs from \$\{stamp\(/);
  assert.match(RUNS, /d\.stale/);
});

/* ------------------------------- T2-23 origins ------------------------------- */

const raw = (over) => ({ id: 1, path: '.github/workflows/channel-autopilot.yml@refs/heads/main', status: 'completed', conclusion: 'success', created_at: '2026-11-20T13:05:32Z', ...over });

test('T2-23 EARS: heartbeat runs read "Heartbeat — checks all channels", never "Untagged"', () => {
  const hb = mapRun(raw({ display_title: 'heartbeat · workflow_dispatch', event: 'workflow_dispatch' }));
  assert.equal(runScope(hb), 'heartbeat');
  assert.equal(SCOPE_LABEL.heartbeat, 'Heartbeat — checks all channels');
  const all = mapRun(raw({ display_title: '🏭 Channel Autopilot — all channels', event: 'workflow_dispatch' }));
  assert.equal(runScope(all), 'all');
  assert.equal(SCOPE_LABEL.all, 'All channels');
  const ch = mapRun(raw({ display_title: 'money-rulebook · workflow_dispatch', event: 'workflow_dispatch' }), [{ slug: 'money-rulebook', label: 'MR' }]);
  assert.equal(runScope(ch), 'channel');
  assert.doesNotMatch(RUNS, /Untagged/);
  assert.match(RUNS, /SCOPE_LABEL\[runScope\(/);
});

test('T2-23 EARS: run origins are plain words', () => {
  const o = (title, event, channels) => runOrigin(mapRun(raw({ display_title: title, event }), channels));
  assert.equal(o('heartbeat · workflow_dispatch', 'workflow_dispatch'), 'Scheduled check');
  assert.equal(o('heartbeat · schedule', 'schedule'), 'Scheduled check');
  assert.equal(o('📸 IG Reels — Slot Poster', 'schedule'), 'On schedule');
  assert.equal(o('quotequarry · workflow_dispatch', 'workflow_dispatch', [{ slug: 'quotequarry' }]), 'You or an approval started it');
  assert.equal(o('Long-form Daily', 'workflow_dispatch'), 'Started on request');
  assert.doesNotMatch(RUNS, /started by hand or clock/);
  assert.match(RUNS, /runOrigin\(r\)/);
});

/* ------------------------- T2-11 / T2-17 / T2-24 Library ------------------------- */

test('T2-11 EARS: a Short whose link the engine did not save is labelled, with a way to find it', () => {
  // titleHistory rows are written only AFTER a successful upload, but carry no videoId
  const lib = buildLibrary({ state: { s: { titleHistory: [{ t: 'Debt Snowball: Cut $12K', at: '2026-11-19T00:05:00Z' }] } }, now: NOW });
  assert.equal(lib.length, 1);
  assert.equal(lib[0].url, null);
  assert.equal(lib[0].linkNote, 'not-saved');
  assert.equal(LINK_NOTE['not-saved'], 'Link not saved');
  assert.equal(lib[0].findUrl, 'https://www.youtube.com/results?search_query=%22Debt%20Snowball%3A%20Cut%20%2412K%22');
  // a scheduled upload with an id: not live yet, no search link
  const sch = toItem({ slug: 's', title: 'x', at: '2026-11-21T00:00:00Z', videoId: 'V', kind: 'short', source: 'latest-upload' }, NOW);
  assert.equal(sch.linkNote, 'scheduled');
  assert.equal(sch.findUrl, null);
  // a live upload with an id: no note at all
  assert.equal(toItem({ slug: 's', title: 'x', at: '2026-11-01T00:00:00Z', videoId: 'V', kind: 'short', source: 'latest-upload' }, NOW).linkNote, null);
  assert.doesNotMatch(VIDEOS, />\s*No link\s*</);
  assert.match(VIDEOS, /LINK_NOTE\[item\.linkNote\]/);
  assert.match(VIDEOS, /Find on YouTube/);
});

test('T2-17 EARS: the count line says "Showing N of M", matching what renders', () => {
  assert.equal(countLine({ shown: 24, matched: 86, recorded: 86 }), 'Showing 24 of 86');
  assert.equal(countLine({ shown: 100, matched: 12, recorded: 86 }), 'Showing 12 of 12 (filtered from 86)');
  assert.equal(countLine({ matched: 86, recorded: 86, perPage: 25 }), '86 videos · 25 per page');
  assert.equal(countLine({ matched: 1, recorded: 1, perPage: 25 }), '1 video');
  assert.doesNotMatch(VIDEOS, /\{filtered\.length\} shown/);
  assert.match(VIDEOS, /countLine\(/);
});

test('T2-24 EARS: filters live in the URL and a filter change is a history push (Back restores it)', () => {
  const f = libraryFilters(new URLSearchParams('channel=a&kind=long&status=bogus&view=grid'));
  assert.deepEqual(f, { channel: 'a', kind: 'long', status: 'all', view: 'grid' });
  assert.deepEqual(libraryFilters(new URLSearchParams('')), { channel: 'all', kind: 'all', status: 'all', view: 'table' });
  assert.equal(libraryHref('/videos', 'channel=a', { kind: 'short' }), '/videos?channel=a&kind=short');
  assert.equal(libraryHref('/videos', 'channel=a&kind=short', { kind: 'all', channel: 'all' }), '/videos');
  assert.equal(libraryHref('/videos', '', { view: 'table' }), '/videos');
  assert.match(VIDEOS, /router\.push\(libraryHref\(pathname, searchParams\.toString\(\), patch\), \{ scroll: false \}\)/);
  assert.doesNotMatch(VIDEOS, /router\.replace\(/);
  assert.doesNotMatch(VIDEOS, /useState\('all'\)/);
});

/* --------------------------------- T1-17 drills --------------------------------- */

test('T1-17 EARS: finished drill / test rows never reach the Inbox\'s Recently resolved', () => {
  assert.equal(isDrill({ title: 'DRILL 2: simulated revoked token', code: 'token_revoked' }), true);
  assert.equal(isDrill({ title: 'x', code: 'drill_probe' }), true);
  assert.equal(isDrill({ title: 'x', code: 'y', test: true }), true);
  assert.equal(isDrill({ title: 'x', code: 'y', drill: true }), true);
  assert.equal(isDrill({ title: 'Doc slot skipped: template "shorts-only-test"', code: 'doc_template_foreign_format' }), false);
  assert.equal(isDrill({ title: 'untracked upload: She Is Testing You', code: 'upload_orphan' }), false);
  assert.equal(isDrill(null), false);
  assert.deepEqual(withoutDrills([{ id: 1, title: 'DRILL 1' }, { id: 2, title: 'real' }]).map((w) => w.id), [2]);
  assert.deepEqual(withoutDrills(undefined), []);
  assert.match(TASKS, /withoutDrills\(warnings\.resolved\)/);
  // open rows are not filtered here: the "needs you" count must match the bell and Today
  assert.match(TASKS, /groupRealWarnings\(warnings\.open\)/);
});

/* -------------------------------- T2-22 reports -------------------------------- */

test('T2-22 EARS: a report\'s date comes from its file name, never "—"', () => {
  assert.equal(reportDay('daily-report-2026-09-19.xlsx'), '2026-09-19');
  assert.equal(reportDay('weekly-report-2026-11-16.xlsx'), '2026-11-16');
  assert.equal(reportDay('notes.xlsx'), null);
  assert.match(REPORTS_ROUTE, /reportDay\(f\.name\)/);
  assert.doesNotMatch(REPORTS_ROUTE, /metadata\?\.time/);
});

test('T2-22 EARS: WHEN the newest report is old THEN the card says reports are not being saved right now', () => {
  const stale = reportsState([{ name: 'daily-report-2026-09-12.xlsx' }, { name: 'daily-report-2026-09-19.xlsx' }], NOW);
  assert.equal(stale.day, '2026-09-19');
  assert.equal(stale.stale, true);
  assert.equal(stale.line, "Last report: Sep 19 — new daily reports aren't being saved here right now.");
  const fresh = reportsState([{ name: 'daily-report-2026-11-19.xlsx' }], NOW);
  assert.equal(fresh.stale, false);
  assert.equal(fresh.line, 'Latest report: Nov 19');
  assert.equal(reportsState([], NOW), null);
  assert.match(AN, /const reportsNow = reportsState\(reports\)/);
  assert.match(AN, /reportsNow\.line/);
  assert.match(AN, /fmtDay\(reportDay\(r\.name\)\)/);
});
