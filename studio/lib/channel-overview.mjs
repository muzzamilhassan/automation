// Feedback round 1 (2026-11-19, items D + H) — pure helpers behind the calm
// channel cards, the channel overview drawer and the per-channel page.
// Relative imports only so `node --test` can load this file.
//
// Owner rule: real problems live in the bell and the Inbox. A channel surface
// shows at most a small red dot ("Has a problem — see Inbox") — never warning
// sentences, and never "Not run today" (the run happens once a day at a time
// that rarely matches the upload slot, so that line was usually just wrong).
import { isRealSeverity } from './notify-policy.mjs';
import { validSlots, slotDate, todayUTC } from './channel-health.mjs';

export const PROBLEM_LABEL = 'Has a problem — see Inbox';
export const INBOX_HREF = '/tasks';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_MS = 86400000;

/** true when `rows` (open warnings, grouped or raw) hold a REAL problem for this channel. */
export function channelHasRealProblem(rows, slug) {
  if (!slug || !Array.isArray(rows)) return false;
  return rows.some((w) => w && w.channel_id === slug && isRealSeverity(w.severity));
}

/** Today's production as a plain fact: { tone: 'ok'|'plain', text }. Never a warning. */
export function todayStatus(row, now = new Date()) {
  if (!row || typeof row !== 'object') return { tone: 'plain', text: 'Unknown' };
  const today = todayUTC(now);
  if (row.lastRun === today) {
    const n = Number.isFinite(row.todayVideos) ? row.todayVideos : 0;
    return { tone: 'ok', text: n > 0 ? `Made ${n} video${n === 1 ? '' : 's'} today` : 'Ran today' };
  }
  if (row.flowPaused === true) return { tone: 'plain', text: 'Paused — nothing new today' };
  if (!row.lastRun) return { tone: 'plain', text: 'No run yet' };
  const last = Date.parse(`${row.lastRun}T00:00:00Z`);
  const daysSince = Number.isFinite(last) ? Math.round((Date.parse(`${today}T00:00:00Z`) - last) / DAY_MS) : null;
  if (daysSince !== null && daysSince > 1) return { tone: 'plain', text: `Last run ${row.lastRun}` };
  return { tone: 'plain', text: 'Not made yet today' };
}

/** How many of this channel's recorded YouTube uploads went live today (UTC), up to now. */
export function uploadedToday(logs, slug, now = new Date()) {
  if (!Array.isArray(logs)) return 0;
  const start = Date.parse(`${todayUTC(now)}T00:00:00Z`);
  const t0 = now.getTime();
  return logs.filter((l) => {
    if (!l || l.slug !== slug || l.platform !== 'YouTube' || !l.at) return false;
    const t = Date.parse(l.at);
    return Number.isFinite(t) && t >= start && t <= t0;
  }).length;
}

function dayKey(d) {
  return String(d || '').trim().slice(0, 3).toLowerCase();
}

/**
 * The soonest upcoming upload slot: { hhmm, kind: 'Short'|'Long-form', at: Date } or null.
 * Shorts slots run daily; the long-form slot only on the channel's long-form days.
 */
export function nextSlot(row, now = new Date()) {
  if (!row || typeof row !== 'object') return null;
  const t0 = now.getTime();
  const longSlot = validSlots([row.longSlot])[0] || null;
  const longDays = new Set((Array.isArray(row.docDays) ? row.docDays : []).map(dayKey).filter(Boolean));
  const candidates = [];
  for (let i = 0; i < 8; i++) {
    const day = new Date(t0 + i * DAY_MS);
    for (const s of validSlots(row.slots)) candidates.push({ hhmm: s, kind: 'Short', at: slotDate(s, day) });
    if (longSlot && longDays.has(DAY_NAMES[day.getUTCDay()].toLowerCase())) {
      candidates.push({ hhmm: longSlot, kind: 'Long-form', at: slotDate(longSlot, day) });
    }
  }
  const future = candidates.filter((c) => c.at.getTime() > t0).sort((a, b) => a.at - b.at);
  return future[0] || null;
}

/** The schedule in a few short lines, e.g. ['Shorts 00:05 UTC', 'Long-form 22:30 UTC · Tue']. */
export function scheduleSummary(row) {
  if (!row || typeof row !== 'object') return [];
  const out = [];
  const slots = validSlots(row.slots);
  if (slots.length) out.push(`Shorts ${slots.join(' · ')} UTC`);
  const longSlot = validSlots([row.longSlot])[0] || null;
  const days = (Array.isArray(row.docDays) ? row.docDays : []).filter((d) => typeof d === 'string' && d.trim());
  if (longSlot && days.length) out.push(`Long-form ${longSlot} UTC · ${days.join(' · ')}`);
  return out;
}
