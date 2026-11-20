// Live fix wave B3 — command palette ranking (T1-11) + shortcut label (T1-22).
// Pure: no React, no '@/' imports (tested in tests/palette-rank.test.mjs).
//
// Enter runs the FIRST result, so the first result must be the best match,
// not whatever comes first in menu order ("Team" used to open Settings,
// "Templates" opened Create). Tiers, best first:
//   0 label equals the query
//   1 label starts with the query
//   2 label contains the query
//   3 a keyword contains the query
//   4 the description contains the query
// Equal tiers keep their original (menu) order.

const norm = (s) => String(s ?? '').trim().toLowerCase();

// The item's tier for a query, or null when it doesn't match at all.
export function paletteScore(item, q) {
  const query = norm(q);
  if (!query) return 4;
  const label = norm(item?.label);
  if (label === query) return 0;
  if (label.startsWith(query)) return 1;
  if (label.includes(query)) return 2;
  if ((item?.keywords || []).some((k) => norm(k).includes(query))) return 3;
  if (norm(item?.sub).includes(query)) return 4;
  return null;
}

// Matching items, best first. Never mutates the input.
export function rankPaletteItems(items, q) {
  if (!Array.isArray(items)) return [];
  if (!norm(q)) return items.slice();
  return items
    .map((item, i) => ({ item, i, s: paletteScore(item, q) }))
    .filter((x) => x.s !== null)
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map((x) => x.item);
}

// "⌘K" on Apple devices, "Ctrl K" everywhere else (Windows, Linux, unknown).
// Pass navigator.userAgentData?.platform || navigator.platform || navigator.userAgent.
export function shortcutLabel(platform) {
  return /mac|iphone|ipad|ipod/i.test(String(platform ?? '')) ? '⌘K' : 'Ctrl K';
}
