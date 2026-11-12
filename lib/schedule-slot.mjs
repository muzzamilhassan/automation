// T4a (#106 Phase 4.5) — registry-side slot gating for the channel autopilot.
// channel-autopilot.yml fires ONE heartbeat every 30 minutes (SCHEDULER_CRON,
// at :05/:35 — off GitHub's worst top-of-hour minute); this module decides,
// per channel, whether the CURRENT UTC time is inside that channel's
// 30-minute gate window. A channel's window opens at its scheduled time —
// entry.cron in yt-mcp/studio-channels.json (the simple daily 'M H * * *'
// form, written by Studio's schedule route from the channel's short slots;
// mirrored in kit.gateCron so DB->repo registry syncs cannot wipe it) — and
// the schedule lives in the registry (editable from the Admin Panel) instead
// of a hand-edited workflow cron list.
//
// Gate rule: a channel with cron '21 3 * * *' is selected iff the current UTC
// minute-of-day lies in [03:21, 03:51) — HH:MM within 30 minutes AFTER the
// channel's scheduled time. A heartbeat landing inside the window runs the
// channel, so the delay tolerance stretches up to the window edge — 1-30 min
// depending on the gate time's position within the half hour. Windows wrap
// modulo 1440, so a '51 23 * * *' cron gates 23:51-00:00 + 00:00-00:21.
// Entries whose cron is missing or not the daily form keep the legacy wizard
// catch-all slot ('33 2 * * *') — unchanged behavior from the static-list era.

export const SCHEDULER_CRON = '5,35 * * * *'; // the ONE workflow schedule line (30-min spacing)
export const LEGACY_FALLBACK_CRON = '33 2 * * *'; // wizard catch-all (02:33 UTC)
export const SLOT_WINDOW_MINUTES = 30; // = the heartbeat spacing (what exactly-once needs)

// Parse the simple daily cron form the registry uses: 'M H * * *'. Anything
// else (step values, lists, day-of-week/month fields, junk) returns null —
// callers gate those entries on the legacy fallback slot instead.
export function parseDailyCron(cron) {
  const m = /^(\d{1,2}) (\d{1,2}) \* \* \*$/.exec(String(cron || '').trim());
  if (!m) return null;
  const minute = Number(m[1]);
  const hour = Number(m[2]);
  if (minute > 59 || hour > 23) return null;
  return { minute, hour };
}

// Minute-of-day (0..1439) at which a channel's gate window opens. Entries
// without a parseable daily cron open at the legacy catch-all time, so their
// behavior is identical to the pre-T4a exact-match era.
export function gateOpensAt(cron) {
  const p = parseDailyCron(cron) || parseDailyCron(LEGACY_FALLBACK_CRON);
  return p.hour * 60 + p.minute;
}

// The slot rule, pure in minutes-of-day: selected iff now lies in
// [opensAt, opensAt + windowMinutes) with the window wrapping modulo 1440.
export function inSlotWindow(nowMinuteOfDay, opensAtMinuteOfDay, windowMinutes = SLOT_WINDOW_MINUTES) {
  const delta = (((nowMinuteOfDay - opensAtMinuteOfDay) % 1440) + 1440) % 1440;
  return delta < windowMinutes;
}

// Convenience: gate one cron string against a Date (UTC fields only).
export function cronMatchesSlot(cron, now = new Date()) {
  const nowMinute = now.getUTCHours() * 60 + now.getUTCMinutes();
  return inSlotWindow(nowMinute, gateOpensAt(cron));
}

// The discover step's channel mapping (mirror of the pre-T4a inline script):
// engine-eligible channels only, GitHub-secret env names, effective cron.
// Round 1: kit.gateCron is the durable fallback — a DB->repo registry sync
// (connect / profile save / importer) projects kit but not cron, so a bare
// repo-file-only cron would be wiped and every channel would drift to 02:33.
export function toDiscoverChannels(channels) {
  return (channels || [])
    .filter((c) => c.autopilot !== false && c.active !== false && c.tokenSecretSaved !== false)
    .map((c) => ({
      slug: c.slug,
      envSlug: c.slug.toUpperCase().replace(/-/g, '_'),
      cron: c.cron || c.kit?.gateCron || LEGACY_FALLBACK_CRON,
    }));
}

// Slot gating for one heartbeat: keep only the channels whose gate window
// contains `now`. With the 30-minute window against 30-minute spacing, every
// daily cron is selected by exactly one fire instant per day.
export function selectChannelsForSlot(channels, now = new Date()) {
  const nowMinute = now.getUTCHours() * 60 + now.getUTCMinutes();
  return (channels || []).filter((c) => inSlotWindow(nowMinute, gateOpensAt(c.cron)));
}

// Catch-up slot gating: selects a channel if its normal 30-minute slot window
// is open (always selected — pipeline day-guards apply), OR if `now` is within
// [opensAt, opensAt + catchUpMinutes) modulo 1440 AND the channel has not
// already run/posted/healed today UTC according to `statesBySlug?.[c.slug]`.
export function selectChannelsDueOrMissed(channels, statesBySlug = {}, now = new Date(), catchUpMinutes = 240) {
  const nowMinute = now.getUTCHours() * 60 + now.getUTCMinutes();
  const todayUTC = now.toISOString().slice(0, 10);
  return (channels || []).filter((c) => {
    const opensAt = gateOpensAt(c.cron);
    if (inSlotWindow(nowMinute, opensAt)) return true;
    if (!inSlotWindow(nowMinute, opensAt, catchUpMinutes)) return false;
    const st = statesBySlug?.[c.slug] || {};
    return st.lastRunDate !== todayUTC && st.clipLastPostDate !== todayUTC && st.healedDate !== todayUTC;
  });
}
