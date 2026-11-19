// Feedback round 1 (items B + D-home, 2026-11-19) — the home page keeps ONLY
// the verdict line, one row per channel, and the views chart. Topics, trend
// radar and the lifetime totals moved to Analytics. QA: docs/qa/feedback-r1-home-qa.md
//
// Pure helpers are tested by behaviour; the '@/'-importing pages by source
// scans anchored to code shapes (comments stripped, CRLF-safe).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { verdictHref, todayMarks, deriveVerdict } from '../studio/lib/cockpit-verdict.mjs';

const strip = (src) => src.replace(/\r\n/g, '\n').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
const home = strip(fs.readFileSync('studio/app/page.js', 'utf8'));
const an = strip(fs.readFileSync('studio/app/analytics/page.js', 'utf8'));
const LATE = new Date('2026-11-19T23:00:00Z');
const ch = (slug, extra = {}) => ({ slug, label: slug.toUpperCase(), slots: ['14:30'], todayVideos: 2, ...extra });

// ---- H2: where the verdict line links
test('H2: WHEN open problems exist, THE verdict links to /warnings', () => {
  const v = deriveVerdict({ now: LATE, channels: [ch('a')], warnings: { status: 'ok', rows: [{ severity: 'warning' }] }, review: { status: 'ok', count: 3 } });
  assert.equal(v.kind, 'needs_you');
  assert.equal(verdictHref(v), '/warnings');
});

test('H2: WHEN only script approvals wait, THE verdict links to /review', () => {
  const v = deriveVerdict({ now: LATE, channels: [ch('a')], warnings: { status: 'ok', rows: [] }, review: { status: 'ok', count: 1 } });
  assert.equal(verdictHref(v), '/review');
});

test('H2: WHEN nothing needs you (or only channel rows do), THE verdict has no extra link', () => {
  const good = deriveVerdict({ now: LATE, channels: [ch('a')], warnings: { status: 'ok', rows: [] }, review: { status: 'ok', count: 0 } });
  assert.equal(verdictHref(good), null);
  const chOnly = deriveVerdict({ now: LATE, channels: [ch('a', { flowPaused: true })], warnings: { status: 'ok', rows: [] }, review: { status: 'ok', count: 0 } });
  assert.equal(chOnly.kind, 'needs_you');
  assert.equal(verdictHref(chOnly), null, 'channel problems are shown in the channel rows right below');
  assert.equal(verdictHref(undefined), null);
});

test('H4: WHILE a client is signed in, THE verdict never counts or links warnings', () => {
  const v = deriveVerdict({ now: LATE, channels: [ch('a')], warnings: { status: 'forbidden', rows: [] }, review: { status: 'forbidden', count: null } });
  assert.equal(v.kind, 'all_good');
  assert.equal(verdictHref(v), null);
});

// ---- H6: poster / episode marks only when made TODAY (UTC)
test('H6: todayMarks shows poster/episode only when made today (UTC)', () => {
  const now = new Date('2026-11-19T10:00:00Z');
  assert.deepEqual(todayMarks({ imageDate: '2026-11-19', deepdiveDate: '2026-11-19' }, now), ['poster', 'episode']);
  assert.deepEqual(todayMarks({ imageDate: '2026-11-18', deepdiveDate: '2026-11-19' }, now), ['episode']);
  assert.deepEqual(todayMarks({ imageDate: null, deepdiveDate: '2026-11-02' }, now), []);
  assert.deepEqual(todayMarks(undefined, now), []);
});

// ---- H1 / H5 / H11: home keeps only verdict + channel rows + chart
test('H1: home renders verdict, then channel rows, then the views chart — in that order', () => {
  const v = home.indexOf('<VerdictLine');
  const rows = home.indexOf('<TodayList');
  const chart = home.indexOf('title="Views per day"');
  assert.ok(v > 0 && rows > v && chart > rows, `order verdict(${v}) < rows(${rows}) < chart(${chart})`);
});

test('H1/H11: the extra home sections are gone (tiles, production table, topics, radar, tabs)', () => {
  for (const [re, what] of [
    [/<StatCard\b/, 'KPI tiles'],
    [/Today's production line/, 'production table'],
    [/Today's researched topics/, 'topics card'],
    [/title="Trend radar"/, 'trend radar'],
    [/<TabNav\b/, 'tabs'],
    [/import Analytics from '@\/app\/analytics\/page'/, 'embedded analytics tab'],
    [/Lifetime totals/, 'lifetime totals row'],
  ]) assert.doesNotMatch(home, re, what + ' must not be on home');
});

test('H5: THE home page renders no warning list — the Needs-attention card is gone', () => {
  assert.doesNotMatch(home, /Needs attention/);
  assert.doesNotMatch(home, /openWarningRows\.(slice|map)\(/);
  assert.doesNotMatch(home, /verdict\.items\.map\(/, 'the verdict is one line, not a list');
});

test('H2/H3: the verdict line links via verdictHref and keeps Retry for unknown', () => {
  assert.match(home, /const href = verdictHref\(verdict\)/);
  assert.match(home, /href \? \(\s*<Link href=\{href\}/);
  assert.match(home, /verdict\.unknown\.length \? \(/);
  assert.match(home, /warnings: \{ status: warnStatus, rows: openWarningRows \}/);
});

test('H6: one compact row per channel with state, today marks and next slot', () => {
  assert.match(home, /function TodayList\(\{ channels, marks, now \}\)/);
  assert.match(home, /const t = channelToday\(c, now\)/);
  assert.match(home, /todayMarks\(c, now\)/);
  assert.match(home, /nextSlot\(c\.slots, c\.longSlot, now\)/);
  assert.match(home, /href=\{`\/channels\/\$\{c\.slug\}`\}/);
  assert.equal((home.match(/active\.map\(/g) || []).length, 0, 'no second per-channel table/tiles on home');
});

test('H7: the views chart keeps its honest coverage chip and unavailable text', () => {
  assert.match(home, /<MiniBars data=\{daily\.map\(\(d\) => d\.views\)\}/);
  assert.match(home, /analyticsCoverage\.failed\?\.length === 0 \? <Chip tone="ok">/);
  assert.match(home, /YouTube unavailable · <button/);
  assert.match(home, /no views are shown \(not zero\)/);
  // a reply where EVERY channel failed is zeros, not data — never drawn as bars
  assert.match(home, /setAnalytics\(a && !a\.error && !\(a\.coverage && !a\.coverage\.ok\?\.length\) \? a : null\)/);
});

// ---- H8 / H9 / H10: moved to Analytics, honest on failure
test('H8: Analytics shows the lifetime totals home used to (views all-time, videos)', () => {
  assert.match(an, /label="Views · all time"/);
  assert.match(an, /label="Videos · total"/);
  assert.match(an, /label="Subscribers · total"/);
  // FB/IG followers already live in the Audience split card — not duplicated as tiles
  assert.match(an, /name: 'Facebook', value: totals\.fbFollowers/);
  assert.doesNotMatch(an, /label="FB followers"|label="IG followers"/);
});

test('H10: moved totals read "—" (null) on overview failure, never 0', () => {
  assert.match(an, /const lifetimeViews = ovErr \? null : /);
  assert.match(an, /const lifetimeVideos = ovErr \? null : /);
  assert.match(an, /value=\{lifetimeViews\}/);
  assert.match(an, /value=\{lifetimeVideos\}/);
});

test("H9: Analytics shows Today's researched topics + Trend radar, scoped by the channel picker", () => {
  assert.match(an, /title="Today's researched topics"/);
  assert.match(an, /title="Trend radar"/);
  assert.match(an, /channelScope\.filter\(\(c\) => c\.todayTopics\?\.length \|\| c\.episodeTopic\)/);
  assert.match(an, /trendRows = Object\.entries\(data\.trends \|\| \{\}\)\.filter\(\(\[slug\]\) => sel === 'all' \|\| slug === sel\)/);
});

test('H10: topics and trends say unavailable on overview failure, never "no trends yet"', () => {
  assert.match(an, /ovErr \? \(\s*<p[^>]*>Topics unavailable right now/);
  assert.match(an, /ovErr \? \(\s*<p[^>]*>Trends unavailable right now/);
});
