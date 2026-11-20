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
import { DAY_BASIS } from './channel-activity.mjs';

export const PROBLEM_LABEL = 'Has a problem — see Inbox';
export const INBOX_HREF = '/tasks';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_MS = 86400000;

/** true when `rows` (open warnings, grouped or raw) hold a REAL problem for this channel. */
export function channelHasRealProblem(rows, slug) {
  if (!slug || !Array.isArray(rows)) return false;
  return rows.some((w) => w && w.channel_id === slug && isRealSeverity(w.severity));
}

/**
 * Today's production (UTC day) as a plain fact: { tone: 'ok'|'plain'|'bad', text }.
 * Live-fix wave A3 (2026-11-20): reads the overview's `today` (made today from
 * the engine state; null = couldn't read it) and `todayRun` (latest autopilot
 * run today) — never the frozen lastRun date. A FAILED run is the one fact
 * shown in red; everything else stays calm and never says "not run today".
 */
export function todayStatus(row) {
  if (!row || typeof row !== 'object') return { tone: 'plain', text: 'Unknown' };
  const run = row.todayRun?.status || null;
  const n = row.today ? Number(row.today.count) || 0 : Number(row.todayVideos) || 0;
  const vids = (k) => `${k} video${k === 1 ? '' : 's'}`;
  if (run === 'failed') return { tone: 'bad', text: n > 0 ? `Made ${n} · last run failed` : 'Run failed today' };
  if (n > 0) return { tone: 'ok', text: `Made ${vids(n)} today` };
  if (row.flowPaused === true) return { tone: 'plain', text: 'Paused — nothing new today' };
  if (run === 'running') return { tone: 'plain', text: 'Running now' };
  if (run === 'succeeded') return { tone: 'ok', text: 'Ran today · nothing new' };
  if (row.today === null) return { tone: 'plain', text: "Can't check today right now" };
  return { tone: 'plain', text: 'Not made yet today' };
}

const hhmmUTC = (iso) => {
  const t = Date.parse(iso || '');
  return Number.isFinite(t) ? `${new Date(t).toISOString().slice(11, 16)} ${DAY_BASIS}` : '';
};

/** The latest autopilot run today in a few words, e.g. 'Run failed 01:47 UTC'. */
export function runText(todayRun) {
  const at = hhmmUTC(todayRun?.at);
  switch (todayRun?.status) {
    case 'failed': return `Run failed${at ? ` ${at}` : ''}`;
    case 'succeeded': return `Run succeeded${at ? ` ${at}` : ''}`;
    case 'running': return 'Running now';
    case 'other': return `Last run stopped${at ? ` ${at}` : ''}`;
    case 'none': return 'No run yet today';
    default: return "Can't check runs right now";
  }
}

/** The newest thing this channel made, e.g. 'Last made: Clip Short · 2026-11-20'. */
export function lastMadeText(last) {
  if (!last || !last.date) return 'Nothing made yet';
  return `Last made: ${last.label || 'Video'} · ${last.date}`;
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
