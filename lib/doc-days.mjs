// #96 DOC CADENCE — long-form supply for the clips-first lane. Kits may list
// several doc days (docDays: ['Tue','Fri']); the legacy single docDay keeps
// working; a kit with neither means docs are not scheduled for that channel.
// Weekday names are UTC ('Sun'..'Sat') matching yt-deepdive's existing guard.

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function docDaysOf(kit = {}) {
  if (Array.isArray(kit.docDays) && kit.docDays.length) return kit.docDays;
  if (kit.docDay) return [kit.docDay];
  return [];
}

export function isDocDay(kit, utcDate = new Date()) {
  const days = docDaysOf(kit);
  if (!days.length) return false;
  return days.includes(DAY_NAMES[utcDate.getUTCDay()]);
}

// Audit 2026-11-13 #10 (catch-up): the YYYY-MM-DD (UTC) of the latest doc day
// on or before `utcDate`, or null when no doc days are configured.
export function mostRecentDocDay(kit, utcDate = new Date()) {
  const days = docDaysOf(kit);
  if (!days.length) return null;
  for (let back = 0; back < 7; back++) {
    const d = new Date(utcDate.getTime() - back * 86400000);
    if (days.includes(DAY_NAMES[d.getUTCDay()])) return d.toISOString().slice(0, 10);
  }
  return null;
}

// A doc is due when the latest doc day has no doc yet. GitHub cron drops most
// ticks and heals can land on the wrong UTC day, so a strict "today is a doc
// day" guard skipped investors-compass's docs for weeks. This makes a missed
// doc day up on the next run — once (several missed days = one doc, never a
// backlog), and never twice for the same doc day.
export function isDocDue(kit, lastDocDate, utcDate = new Date()) {
  const latest = mostRecentDocDay(kit, utcDate);
  if (!latest) return false;
  return !lastDocDate || String(lastDocDate).slice(0, 10) < latest;
}
