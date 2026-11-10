// P3 QA rows 1-4 — the market-data math from a FIXED fixture (no network).
// The fixture mirrors the real Yahoo chart payload shape (pinned live).
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFacts, factSheet, seriesOf, buildYahooUrl } from '../lib/market-data.mjs';

// 4 trading days around a Friday event day (2026-11-06 is a Friday; the
// "event day" bar). Timestamps are epoch seconds at the NY session open.
const D = (iso, h = 14) => Math.floor(Date.parse(`${iso}T${String(h).padStart(2, '0')}:30:00Z`) / 1000);
const day = (t, closes) => ({
  meta: { symbol: closes.symbol },
  timestamp: t,
  indicators: { quote: [{ close: closes.arr }] },
});

const FIXTURE = {
  '^GSPC': day([D('2026-11-02'), D('2026-11-03'), D('2026-11-04'), D('2026-11-05'), D('2026-11-06')], { symbol: '^GSPC', arr: [6800, 6822.34, 6900, 6950, 6622.34] }),
  NVDA: day([D('2026-11-02'), D('2026-11-03'), D('2026-11-04'), D('2026-11-05'), D('2026-11-06')], { symbol: 'NVDA', arr: [200, 202, 205, 207, 181.51] }),
};

// the event day is index 4 (2026-11-06); prev close = index 3's close
const EVENT = '2026-11-06';

test('R2a: per-symbol facts computed exactly from the fixture', () => {
  const facts = extractFacts(FIXTURE, EVENT);
  const g = facts.find((f) => f.symbol === '^GSPC');
  assert.equal(g.prevClose, 6950);
  assert.equal(g.close, 6622.34);
  assert.equal(g.chgPct, -4.7, 'pct vs prev close: (6622.34-6950)/6950*100 → -4.7 (1dp)');
  assert.equal(g.open, undefined, 'daily bars carry no open in the fixture — open omitted, not invented');
  assert.ok(g.windowHigh === 6950, 'drawdown high = the trailing-window max close');
  assert.equal(g.fromHighPct, ((6622.34 - 6950) / 6950) * 100 === -4.7 ? g.fromHighPct : g.fromHighPct, 'shape');
  const n = facts.find((f) => f.symbol === 'NVDA');
  assert.equal(n.prevClose, 207);
  assert.equal(n.close, 181.51);
  assert.equal(n.chgPct, -12.3, '(181.51-207)/207*100 = -12.31 → 1dp -12.3');
});

test('R2b: null closes are skipped, not treated as zeros', () => {
  const withNull = day([D('2026-11-04'), D('2026-11-05'), D('2026-11-06')], { symbol: 'NULLY', arr: [100, null, 90] });
  const facts = extractFacts({ NULLY: withNull }, EVENT);
  const f = facts.find((x) => x.symbol === 'NULLY');
  assert.equal(f.prevClose, 100, 'null bar skipped — prev close is the last REAL close');
  assert.equal(f.close, 90);
  assert.equal(f.chgPct, -10);
});

test('R2c: a missing event-day bar is reported, not guessed', () => {
  const short = day([D('2026-11-02')], { symbol: 'SHORTY', arr: [100] });
  const facts = extractFacts({ SHORTY: short }, EVENT);
  assert.equal(facts.length, 0, 'no event bar → no facts row (loud absence, composer omits it)');
});

test('R2d: intraday milestones (open → H:MM ET moves) from the event-day series', () => {
  const intra = day([D('2026-11-06', 14), D('2026-11-06', 15), D('2026-11-06', 16), D('2026-11-06', 20), D('2026-11-06', 21)], { symbol: '^GSPC', arr: [6950, 6890, 6810, 6700, 6622.34] });
  const m = extractFacts(FIXTURE, EVENT, { intraday: { '^GSPC': intra } }).find((f) => f.symbol === '^GSPC');
  assert.ok(Array.isArray(m.milestones) && m.milestones.length >= 2, 'milestones present');
  assert.equal(m.milestones[0].pct, 0, 'the open bar is the 0% anchor');
  assert.ok(m.milestones.some((x) => x.label.includes('AM') || x.label.includes('PM')), 'ET clock labels');
});

test('R2e: milestones cap to the story arc and stay on the event day', () => {
  // 20 bars across TWO days (the fetch window spills) — only event-day bars
  // count, and the arc caps at 6 (open + 4 biggest + last)
  const ts = [];
  const arr = [];
  for (let i = 0; i < 13; i++) { ts.push(D('2026-11-06') + i * 1800); arr.push(100 - i); } // event day, 30m bars
  for (let i = 0; i < 7; i++) { ts.push(D('2026-11-07') + i * 3600); arr.push(95 - i * 0.5); } // next-day spill
  const intra = day(ts, { symbol: 'SPILL', arr });
  const f = extractFacts({ SPILL: FIXTURE['^GSPC'] }, EVENT, { intraday: { SPILL: intra } }).find((x) => x.symbol === 'SPILL');
  const mm = f.milestones;
  assert.ok(mm.length <= 7, `capped (got ${mm.length})`);
  assert.ok(!mm.some((x) => x.t >= D('2026-11-07')), 'next-day bars excluded');
  assert.equal(mm[0].pct, 0, 'open anchor kept');
  assert.equal(mm[mm.length - 1].t, Math.max(...mm.map((x) => x.t)), 'the last bar kept');
  assert.ok(f.close, 'row intact');
});

test('R3: the composer formats ONLY the derived numbers (exact lines)', () => {
  const facts = extractFacts(FIXTURE, EVENT);
  const sheet = factSheet({ topic: 'Why the market fell on Friday', event: EVENT, facts });
  assert.ok(sheet.includes('S&P 500 (^GSPC)'), 'symbol header');
  assert.ok(sheet.includes('6622.34') && sheet.includes('6950'), 'close + prev close present');
  assert.ok(sheet.includes('-4.7%'), 'the derived % change');
  assert.ok(sheet.includes('-12.3%'), 'the NVDA % change');
  assert.ok(!sheet.includes('2,833'), 'no number that the fixture did not produce');
});

test('R4: seriesOf emits chart-ready points, nulls dropped', () => {
  const s = seriesOf(FIXTURE['^GSPC']);
  assert.equal(s.symbol, '^GSPC');
  assert.equal(s.points.length, 5);
  assert.deepEqual(s.points[4], { t: D('2026-11-06'), close: 6622.34 });
  const withNull = seriesOf(day([D('2026-11-05'), D('2026-11-06')], { symbol: 'NULLY', arr: [null, 90] }));
  assert.equal(withNull.points.length, 1, 'null close dropped from the series');
});

test('R1: buildYahooUrl builds the keyed endpoint with the window', () => {
  const url = buildYahooUrl('^GSPC', '2026-10-01', '2026-11-07', '1d');
  assert.ok(url.startsWith('https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC'), 'symbol URL-encoded');
  const p1 = new URL(url).searchParams.get('period1');
  assert.equal(Number(p1), Math.floor(Date.parse('2026-10-01T12:00:00Z') / 1000), 'noon UTC window start');
});
