// Live fix wave C4 (T5-07 / T5-08): plain-English session facts shared by
// Settings › Security, /sessions and /users. Pure — no imports, safe in the
// browser and in node tests.

// A raw user-agent → "Chrome on Windows". Scripts are named as scripts.
export function deviceLabel(ua) {
  const s = String(ua || '').trim();
  if (!s) return 'Unknown device';
  if (/^curl\//i.test(s)) return 'Script (curl)';
  if (/^node\b|node-fetch|undici/i.test(s)) return 'Script (Node)';
  if (/python/i.test(s)) return 'Script (Python)';
  const os = /iPhone/.test(s) ? 'iPhone'
    : /iPad/.test(s) ? 'iPad'
      : /Android/.test(s) ? 'Android'
        : /Windows/.test(s) ? 'Windows'
          : /Macintosh|Mac OS X/.test(s) ? 'Mac'
            : /CrOS/.test(s) ? 'ChromeOS'
              : /Linux/.test(s) ? 'Linux' : '';
  const browser = /Edg(?:e|A|iOS)?\//.test(s) ? 'Edge'
    : /OPR\/|Opera/.test(s) ? 'Opera'
      : /SamsungBrowser/.test(s) ? 'Samsung Internet'
        : /Firefox\/|FxiOS/.test(s) ? 'Firefox'
          : /Chrome\/|CriOS/.test(s) ? 'Chrome'
            : /Version\/[\d.]+.*Safari\//.test(s) ? 'Safari' : '';
  if (browser && os) return `${browser} on ${os}`;
  if (browser) return browser;
  if (os) return `Browser on ${os}`;
  return 'Unknown device';
}

function parts(d, timeZone, opts) {
  const out = {};
  for (const p of new Intl.DateTimeFormat('en-US', { ...(timeZone ? { timeZone } : {}), ...opts }).formatToParts(d)) out[p.type] = p.value;
  return out;
}

// One time format everywhere, in the viewer's own time zone and labelled:
// "7:38 pm your time" today, "Nov 19, 7:38 pm your time" on other days,
// "Nov 19 2025, …" in other years. timeZone/now are injectable for tests.
export function localTime(value, { now = new Date(), timeZone } = {}) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const t = parts(d, timeZone, { hour: 'numeric', minute: '2-digit', hour12: true });
  const time = `${t.hour}:${t.minute} ${String(t.dayPeriod || '').toLowerCase()}`.trim();
  const day = parts(d, timeZone, { year: 'numeric', month: 'short', day: 'numeric' });
  const today = parts(now, timeZone, { year: 'numeric', month: 'short', day: 'numeric' });
  if (day.year === today.year && day.month === today.month && day.day === today.day) return `${time} your time`;
  const date = day.year === today.year ? `${day.month} ${day.day}` : `${day.month} ${day.day} ${day.year}`;
  return `${date}, ${time} your time`;
}

// Never hide rows silently: show the first `cap`, and say how many there are.
export const SIGNIN_CAP = 20;
export function capList(rows, showAll, cap = SIGNIN_CAP) {
  const all = Array.isArray(rows) ? rows : [];
  const shown = showAll ? all : all.slice(0, cap);
  return { shown, total: all.length, note: shown.length < all.length ? `Showing ${shown.length} of ${all.length}` : '' };
}
