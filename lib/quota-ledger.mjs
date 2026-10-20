// #99 QUOTA LEDGER — every channel token mints through ONE shared OAuth
// client, so all uploads draw on ONE Google Cloud project with the default
// 10,000 units/day (resets midnight PT; production consent-screen status does
// NOT raise it). Cost per upload: videos.insert 1,600 + thumbnails.set 50 +
// commentThreads.insert 50 = 1,700. This ledger fails CLOSED: when one more
// upload would breach the daily budget, slots skip before any render/LLM spend.
//
// Per-channel counters live in yt-mcp/state/<slug>.json as
//   uploadsToday: { date: '<YYYY-MM-DD PT>', count: N }
// The pool is per-PROJECT, so evaluate() sums the counters of ALL channels;
// concurrent runs read slightly stale sums — the documented approximation
// (reconcile path: verify-run claims vs counters).

const PT_TZ = 'America/Los_Angeles';

// 'YYYY-MM-DD' calendar date in PT for a given instant (quota resets midnight PT).
// en-CA locale yields ISO-style YYYY-MM-DD directly.
export function ptDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PT_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

// Counter for one channel: rolls over when the PT date changes.
export function nextCounter(prev, now = new Date()) {
  const date = ptDate(now);
  if (prev && prev.date === date) return { date, count: (prev.count || 0) + 1 };
  return { date, count: 1 };
}

// Evaluate the shared daily budget against all channels' counters.
// opts: now, dailyLimit (10,000), perUpload (1,700), margin (100 reads).
export function evaluate(allStates, { now = new Date(), dailyLimit = 10000, perUpload = 1700, margin = 100 } = {}) {
  const today = ptDate(now);
  let uploadsToday = 0;
  for (const st of Object.values(allStates || {})) {
    const c = st && st.uploadsToday;
    if (c && c.date === today) uploadsToday += c.count || 0;
  }
  const usedUnits = uploadsToday * perUpload;
  const remainingUnits = dailyLimit - margin - usedUnits;
  return {
    date: today,
    uploadsToday,
    usedUnits,
    remainingUnits,
    allowed: remainingUnits >= perUpload,
    dailyLimit,
    perUpload,
  };
}
