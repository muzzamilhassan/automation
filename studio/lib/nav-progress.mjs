// Live fix wave B3 (T1-06) — the top progress bar's pure rules.
// Pure: no React, no '@/' imports (tested in tests/wave-b3.test.mjs).

// Does a click / push to `href` start an in-app page change? Only same-site
// http(s) links to a DIFFERENT page (path or query) count. New-tab clicks
// (target, ctrl/cmd/shift/alt, middle button), downloads, other sites,
// mailto: and hash-only jumps never start the bar.
export function isTrackableNav({ href, current, target, button = 0, modified = false, download = false }) {
  if (!href || !current) return false;
  if (target && target !== '_self') return false;
  if (button !== 0 || modified || download) return false;
  let to;
  let from;
  try {
    from = new URL(current);
    to = new URL(href, from);
  } catch {
    return false;
  }
  if (to.protocol !== 'http:' && to.protocol !== 'https:') return false;
  if (to.origin !== from.origin) return false;
  return to.pathname !== from.pathname || to.search !== from.search;
}

// One creep step: fast at first, slower near the end, never past 90% —
// only the rendered page takes it to 100%.
export function trickle(pct) {
  const p = Number(pct) || 0;
  if (p >= 90) return 90;
  return Math.min(90, p + Math.max(0.3, (90 - p) * 0.1));
}
