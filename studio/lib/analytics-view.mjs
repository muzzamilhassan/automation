// Live fix wave C2 — the pure core behind /analytics (and the Today chart's
// "data through" chip). Everything that decides what a number LOOKS like
// lives here so it is testable with plain `node --test`.
// Relative imports only (none needed) — this file also ships in the client bundle.
//
// House rule: a real zero reads "0"; an unknown value reads "—".

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// Watch time travels as WHOLE minutes: StatCard's count-up rounds to integers,
// so hours (0.4) used to round to "0". Minutes round safely (0.4 h → 24).
export function watchMinutes(hours) {
  return isNum(hours) ? Math.round(hours * 60) : null;
}

// minutes → "24 min" (under 1 h) · "4.4 h" (under 10 h) · "1,234 h"
export function fmtWatchTime(minutes) {
  if (!isNum(minutes)) return '—';
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = m / 60;
  if (h < 10) return `${(Math.round(h * 10) / 10).toFixed(1)} h`;
  return `${Math.round(h).toLocaleString('en-US')} h`;
}

// signed change: 0 → "0", 2 → "+2", -3 → "-3", unknown → "—"
export function fmtDelta(v) {
  if (!isNum(v)) return '—';
  return v > 0 ? `+${v.toLocaleString('en-US')}` : v.toLocaleString('en-US');
}

// audience rows with real views only (a country with 0 views is noise, not data)
export function countedOnly(list, n = 6) {
  return (Array.isArray(list) ? list : []).filter((r) => r && isNum(r.views) && r.views > 0).slice(0, n);
}

// The last day YouTube Analytics actually returned (it lags 2–3 days), so the
// page can say "data through Nov 17" instead of implying today.
export function lastDataDay(daily) {
  const days = (Array.isArray(daily) ? daily : []).map((d) => d?.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''))).sort();
  return days.length ? days[days.length - 1] : null;
}

// "2026-11-17" → "Nov 17" (calendar day, no time-zone shift)
export function fmtDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '';
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  if (!Number.isFinite(t)) return '';
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(t);
}

// ONE total: the split is shown against the same 28-day total as the tiles.
// The per-video report only sorts each channel's top videos, so a remainder
// ("other") is named instead of silently making a second total.
export function viewSplit({ total, shorts, long } = {}) {
  const s = isNum(shorts) && shorts > 0 ? shorts : 0;
  const l = isNum(long) && long > 0 ? long : 0;
  const t = isNum(total) && total >= s + l ? total : s + l;
  if (!t) return null;
  const other = t - s - l;
  const shortPct = Math.round((s / t) * 100);
  const longPct = other ? Math.round((l / t) * 100) : 100 - shortPct;
  const otherPct = other ? Math.max(0, 100 - shortPct - longPct) : 0;
  return { total: t, shorts: s, long: l, other, shortPct, longPct, otherPct };
}

// The picker: real channel names, "All channels" first.
export function pickerOptions(channels, bySlug = {}) {
  const out = [{ value: 'all', label: 'All channels' }];
  for (const c of Array.isArray(channels) ? channels : []) {
    if (!c?.slug || out.some((o) => o.value === c.slug)) continue;
    out.push({ value: c.slug, label: bySlug?.[c.slug]?.label || c.label || c.slug });
  }
  return out;
}

// The leaderboard follows the picker.
export function boardRows(rows, sel = 'all') {
  const list = Array.isArray(rows) ? rows : [];
  return sel && sel !== 'all' ? list.filter((r) => r?.channelId === sel) : list;
}

/* ---------------------------------- reports ---------------------------------- */

// "daily-report-2026-09-19.xlsx" → "2026-09-19" (the day the report covers)
export function reportDay(name) {
  const m = /(\d{4}-\d{2}-\d{2})/.exec(String(name || ''));
  return m ? m[1] : null;
}

// Newest report + whether reports have stopped arriving. Daily reports older
// than `staleDays` mean the list is not current — say so plainly.
export function reportsState(reports, now = Date.now(), staleDays = 2) {
  const days = (Array.isArray(reports) ? reports : []).map((r) => reportDay(r?.name)).filter(Boolean).sort();
  if (!days.length) return null;
  const day = days[days.length - 1];
  const age = (now - Date.parse(`${day}T00:00:00Z`)) / 86400000;
  const stale = !Number.isFinite(age) || age > staleDays;
  return {
    day,
    stale,
    line: stale
      ? `Last report: ${fmtDay(day)} — new daily reports aren't being saved here right now.`
      : `Latest report: ${fmtDay(day)}`,
  };
}
