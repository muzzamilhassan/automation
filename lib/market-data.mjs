// market-files P3 — the DATA layer (docs/qa/market-files-p3-qa.md): a
// market event (date + symbols) becomes a REAL fact sheet automatically,
// from the free Yahoo Finance chart endpoint — no API key, no cost. The
// composer (factSheet) formats ONLY the computed numbers, so the fact sheet
// the P2 brain eats cannot contain an invented figure. seriesOf emits the
// chart-ready series P4's chart beats will render (on-screen numbers = the
// real ones). Network lives ONLY in fetchChart/buildYahooUrl; every math
// function is pure and fixture-tested (R6).
const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart/';

const noon = (iso) => Math.floor(Date.parse(`${iso}T12:00:00Z`) / 1000);
const ET_OFFSET_MIN = 300; // NY = UTC-5 (EST) at session timestamps in fixtures/feeds

export function buildYahooUrl(symbol, fromIso, toIso, interval = '1d') {
  const enc = encodeURIComponent(symbol);
  return `${YAHOO}${enc}?period1=${noon(fromIso)}&period2=${noon(toIso)}&interval=${interval}&events=div%2Csplit`;
}

export async function fetchChart(symbol, fromIso, toIso, interval = '1d') {
  const r = await fetch(buildYahooUrl(symbol, fromIso, toIso, interval), {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`yahoo ${symbol}: HTTP ${r.status}`);
  const d = await r.json();
  const res = d?.chart?.result?.[0];
  if (!res || !Array.isArray(res.timestamp) || !res.timestamp.length) {
    throw new Error(`yahoo ${symbol}: no chart result (symbol typo or no data in window)`);
  }
  return res;
}

// ---- the bar model -----------------------------------------------------------
// {t, close} pairs with null closes dropped — the single shape every math
// function works on, so fixtures and live payloads behave identically.
function barsOf(chart) {
  const ts = Array.isArray(chart.timestamp) ? chart.timestamp : [];
  const closes = chart?.indicators?.quote?.[0]?.close || [];
  const out = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (typeof c === 'number' && Number.isFinite(c)) out.push({ t: ts[i], close: c });
  }
  return out;
}

// the NY date of a session timestamp (YYYY-MM-DD) — timestamps sit inside
// the ET session, so a fixed -5h shift names the trading day correctly for
// the fixtures and for winter-time feeds (EST); summer drift is one bar,
// and the event-day match uses the operator's own date string.
function dayKey(t) {
  return new Date((t - ET_OFFSET_MIN * 60) * 1000).toISOString().slice(0, 10);
}

const pct = (from, to) => Math.round(((to - from) / from) * 1000) / 10;
const clock = (t) => {
  const d = new Date((t - ET_OFFSET_MIN * 60) * 1000);
  const h24 = d.getUTCHours();
  const h = ((h24 + 11) % 12) + 1;
  return `${h}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h24 >= 12 ? 'PM' : 'AM'} ET`;
};

// ---- R2: the fact math --------------------------------------------------------
// charts: {symbol: chartPayload}. eventDate: 'YYYY-MM-DD' (the trading day).
// opts.intraday: {symbol: chartPayload} — event-day 30m bars → milestones.
export function extractFacts(charts, eventDate, opts = {}) {
  const r2 = (v) => Math.round(v * 100) / 100; // prices print in cents, not float junk
  const out = [];
  for (const [symbol, chart] of Object.entries(charts || {})) {
    const bars = barsOf(chart);
    const idx = bars.findIndex((b) => dayKey(b.t) === eventDate);
    if (idx < 0) continue; // no event bar → loud absence (composer omits it)
    const event = bars[idx];
    const prev = idx > 0 ? bars[idx - 1] : null;
    const windowHigh = bars.slice(0, idx + 1).reduce((m, b) => Math.max(m, b.close), 0);
    const row = {
      symbol,
      close: r2(event.close),
      prevClose: prev ? r2(prev.close) : null,
      chgPct: prev ? pct(prev.close, event.close) : null,
      windowHigh: r2(windowHigh),
      fromHighPct: pct(windowHigh, event.close),
    };
    const intra = opts.intraday && opts.intraday[symbol];
    if (intra) {
      // event-day bars ONLY (the fetch window can spill into the next day)
      const mbars = barsOf(intra).filter((b) => dayKey(b.t) === eventDate);
      if (mbars.length && mbars[0].close) {
        const open = r2(mbars[0].close);
        row.open = open;
        const all = mbars.map((b) => ({ t: b.t, label: clock(b.t), close: r2(b.close), pct: pct(open, b.close) }));
        // the story arc, capped: the open anchor + the 4 biggest moves + the
        // final bar — a timeline beat, not a data dump
        const picks = [all[0], ...[...all].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 4), all[all.length - 1]];
        const seen = new Set();
        row.milestones = picks.filter((m) => !seen.has(m.t) && seen.add(m.t)).sort((a, b) => a.t - b.t);
      }
    }
    out.push(row);
  }
  return out;
}

// ---- R3: the composer (formats computed numbers — cannot invent) --------------
const NAME_FOR = { '^GSPC': 'S&P 500', '^DJI': 'Dow Jones', '^IXIC': 'Nasdaq' };
const nameOf = (symbol) => NAME_FOR[symbol] || symbol;

export function factSheet({ topic, event, facts, extra = [] }) {
  const lines = [`TOPIC: ${topic}`, '', `EVENT DAY: ${event} (market data fetched automatically from Yahoo Finance, daily bars + event-day intraday).`, ''];
  for (const f of facts) {
    lines.push(`- ${nameOf(f.symbol)} (${f.symbol}) closed at ${f.close} on the event day, from ${f.prevClose ?? '(no prior bar)'} the day before${f.chgPct == null ? '' : ` — a ${f.chgPct}% move`}. It sits ${f.fromHighPct}% below its recent window high (${f.windowHigh}).`);
    for (const m of f.milestones || []) {
      if (m.pct === 0) continue; // the open anchor isn't news
      lines.push(`  - At ${m.label} it was at ${m.close} (${m.pct > 0 ? '+' : ''}${m.pct}% from the open).`);
    }
  }
  for (const e of extra) lines.push(`- ${e}`);
  lines.push('', 'Only the numbers above are legal in the script (fact discipline).');
  return lines.join('\n');
}

// ---- R4: chart-ready series (P4 chart beats render from these) ----------------
export function seriesOf(chart) {
  return {
    symbol: chart?.meta?.symbol || 'unknown',
    points: barsOf(chart).map((b) => ({ t: b.t, close: b.close })),
  };
}
