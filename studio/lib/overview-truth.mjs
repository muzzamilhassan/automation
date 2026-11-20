// Live-fix wave A3 (2026-11-20) — two honesty rules for /api/overview.
// Pure: no imports, so `node --test` can load it.
//
// 1. overviewSchedule — upload slots come from the SAME precedence the engine
//    uses (lib/brand-resolve.mjs registryToKit + mergeBrand): registry
//    top-level slots → registry kit slots → the static brands.json entry;
//    longSlot: registry kit → static. The static file used to win, so
//    Debt-Free Doctrine showed 00:35 / 01:30 while the engine posted at
//    21:20 / 20:20 (T3-01 / P5). No per-channel values live in code.
// 2. overviewTotals — a source that didn't answer is UNKNOWN (null), never 0
//    (T2-04 / P13: a GitHub 403 window showed "Subscribers 0, Views 0").

const nonEmpty = (a) => (Array.isArray(a) && a.length ? a : null);

/** { slots, longSlot } for one channel. `staticEntry` = brands.json row, `reg` = registry entry. */
export function overviewSchedule(staticEntry, reg) {
  const kit = reg?.kit || {};
  return {
    slots: nonEmpty(reg?.slots) || nonEmpty(kit.slots) || nonEmpty(staticEntry?.slots) || [],
    longSlot: kit.longSlot || staticEntry?.longSlot || null,
  };
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function sumKnown(values) {
  const known = values.filter((v) => v !== null);
  return known.length ? known.reduce((a, v) => a + v, 0) : null;
}

/**
 * Totals over the visible channels + the list of live sources that did not
 * fully answer. `ytOk` / `fbOk` = did the YouTube / Facebook reads run at all.
 * → { totals: { ytSubs, ytViews, ytVideos, ytChannels, ytOf, fbFollowers, igFollowers }, degraded: [] }
 */
export function overviewTotals(channels, { ytOk = true, fbOk = true } = {}) {
  const list = Array.isArray(channels) ? channels : [];
  const yt = list.map((c) => (c?.yt && !c.yt.error ? c.yt : null));
  const withYt = yt.filter(Boolean);
  const degraded = [];
  if (!ytOk || withYt.length < list.length) degraded.push('youtube');
  if (!fbOk) degraded.push('facebook');
  const fbSum = (pick) => (fbOk ? list.reduce((a, c) => a + (num(pick(c)) || 0), 0) : null);
  return {
    totals: {
      ytSubs: sumKnown(withYt.map((y) => num(y.subs))),
      ytViews: sumKnown(withYt.map((y) => num(y.views))),
      ytVideos: sumKnown(withYt.map((y) => num(y.videos))),
      ytChannels: withYt.length,
      ytOf: list.length,
      fbFollowers: fbSum((c) => c?.fb?.followers),
      igFollowers: fbSum((c) => c?.ig?.followers),
    },
    degraded,
  };
}
