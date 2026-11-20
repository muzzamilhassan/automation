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
import { formatClock } from './wizard-steps.mjs';

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

/* ------------------------ live fix wave C3 (2026-11-20) ------------------------ */
// Spec + QA: docs/qa/live-fix-wave-c3-qa.md.

const cleanList = (a) => (Array.isArray(a) ? a.map((x) => String(x ?? '').trim()).filter(Boolean) : []);

/**
 * T3-07: a channel's music feels, in the engine's order (lib/brand-resolve.mjs:
 * the registry kit wins over the brand file). No data → [] (the card says "Not set").
 */
export function overviewMusicFeels(staticEntry, reg) {
  const kit = cleanList(reg?.kit?.musicFeels);
  return kit.length ? kit : cleanList(staticEntry?.musicFeels);
}

// The engine matches music by word STEMS ("inspir"); read them as words.
const FEEL_WORDS = { inspir: 'Inspiring' };
const moodWord = (f) => FEEL_WORDS[f.toLowerCase()] || f[0].toUpperCase() + f.slice(1).toLowerCase();

/** T3-07: ['calming', 'bright'] → 'Calming · Bright'; nothing → ''. */
export function moodText(feels) {
  return cleanList(feels).map(moodWord).join(' · ');
}

/** T3-22: { active, paused, parked } — a paused channel is not counted as active. */
export function channelCounts(channels) {
  const out = { active: 0, paused: 0, parked: 0 };
  for (const c of Array.isArray(channels) ? channels : []) {
    if (!c) continue;
    if (!c.active) out.parked += 1;
    else if (c.flowPaused) out.paused += 1;
    else out.active += 1;
  }
  return out;
}

/** T3-22: '4 active · 1 paused' (zero paused/parked are left out). */
export function countsText({ active = 0, paused = 0, parked = 0 } = {}) {
  return [`${active} active`, paused ? `${paused} paused` : '', parked ? `${parked} parked` : ''].filter(Boolean).join(' · ');
}

export const SETUP_TEXT = 'Setup not finished';

/** T3-22: a wizard channel whose setup never got a niche. */
export function needsSetup(row) {
  return Boolean(row?.fromRegistry && !String(row.niche || '').trim());
}

const ms = (v) => {
  const t = v instanceof Date ? v.getTime() : Date.parse(v || '');
  return Number.isFinite(t) ? t : null;
};
const normTitle = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
const STATUS_RANK = { published: 0, scheduled: 1 };

/**
 * T3-10: this channel's uploads for the "Recent uploads" list. One row per
 * title + UTC day (the published one wins, then one with a video id),
 * newest first, undated last, at most `limit`.
 */
export function recentUploads(items, limit = 10) {
  const rank = (it) => (STATUS_RANK[it.status] ?? 2) * 2 + (it.videoId ? 0 : 1);
  const byKey = new Map();
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || !normTitle(it.title)) continue;
    const t = ms(it.at);
    const key = `${normTitle(it.title)}|${t == null ? '' : new Date(t).toISOString().slice(0, 10)}`;
    const prev = byKey.get(key);
    if (!prev || rank(it) < rank(prev)) byKey.set(key, it);
  }
  return [...byKey.values()]
    .sort((a, b) => {
      const ta = ms(a.at);
      const tb = ms(b.at);
      if (ta == null || tb == null) return ta == null ? (tb == null ? 0 : 1) : -1;
      return tb - ta;
    })
    .slice(0, limit);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad2 = (n) => String(n).padStart(2, '0');

/**
 * T3-21: an instant on the viewer's clock, naming the day when it isn't
 * today: '9:00 pm', '3:35 am tomorrow', '7:30 pm Sun'. `offsetMin` = minutes
 * ahead of UTC (-new Date().getTimezoneOffset()). Bad input → ''.
 */
export function localWhen(at, now = new Date(), offsetMin = 0) {
  const t = ms(at);
  if (t == null) return '';
  const off = Math.round(Number(offsetMin) || 0) * 60000;
  const local = new Date(t + off);
  const clock = formatClock(`${pad2(local.getUTCHours())}:${pad2(local.getUTCMinutes())}`);
  const days = Math.floor((t + off) / DAY_MS) - Math.floor((now.getTime() + off) / DAY_MS);
  if (days === 0) return clock;
  if (days === 1) return `${clock} tomorrow`;
  if (days > 1 && days < 7) return `${clock} ${DAY_NAMES[local.getUTCDay()]}`;
  return `${clock} ${MONTHS[local.getUTCMonth()]} ${local.getUTCDate()}`;
}

/** T3-21: the next instant of a UTC 'HH:MM' slot (only on `days`, UTC weekdays, when given). */
export function nextSlotAt(hhmm, now = new Date(), days = null) {
  if (!validSlots([hhmm]).length) return null;
  const want = Array.isArray(days) && days.length ? new Set(days.map(dayKey).filter(Boolean)) : null;
  for (let i = 0; i < 8; i++) {
    const day = new Date(now.getTime() + i * DAY_MS);
    const at = slotDate(hhmm, day);
    if (at.getTime() <= now.getTime()) continue;
    if (want && !want.has(DAY_NAMES[at.getUTCDay()].toLowerCase())) continue;
    return at;
  }
  return null;
}

/** T3-21: the next instant of a slot on the viewer's clock ('3:35 am tomorrow'); '' when unknown. */
export function slotLocalText(hhmm, now = new Date(), offsetMin = 0, days = null) {
  const at = nextSlotAt(hhmm, now, days);
  return at ? localWhen(at, now, offsetMin) : '';
}

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const andList = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} & ${a[a.length - 1]}`);

// UTC 'HH:MM' → { clock: '3:35 am', shift: -1 | 0 | 1 } on the viewer's clock
function localClockShift(hhmm, offsetMin) {
  if (!validSlots([hhmm]).length) return null;
  const [h, m] = String(hhmm).trim().split(':').map(Number);
  const total = h * 60 + m + Math.round(Number(offsetMin) || 0);
  const lm = ((total % 1440) + 1440) % 1440;
  return { clock: formatClock(`${pad2(Math.floor(lm / 60))}:${pad2(lm % 60)}`), shift: Math.floor(total / 1440) };
}

/**
 * T3-17: 'Long videos go public at 7:30 pm your time on Tue & Sat'. The UTC
 * long-form days move with the clock when the local time crosses midnight.
 * No time or no days → ''.
 */
export function longPublicText(longHHMM, days, offsetMin = 0) {
  const lc = localClockShift(longHHMM, offsetMin);
  if (!lc) return '';
  const idx = new Set();
  for (const d of Array.isArray(days) ? days : []) {
    const i = DAY_NAMES.findIndex((n) => n.toLowerCase() === dayKey(d));
    if (i >= 0) idx.add((((i + lc.shift) % 7) + 7) % 7);
  }
  if (!idx.size) return '';
  const local = WEEK.filter((w) => idx.has(DAY_NAMES.indexOf(w)));
  return `Long videos go public at ${lc.clock} your time on ${andList(local)}`;
}

/** T3-17: 'Shorts go public at 3:35 am your time' (daily); no slots → ''. */
export function shortsPublicText(slots, offsetMin = 0) {
  const clocks = validSlots(slots).map((s) => localClockShift(s, offsetMin).clock);
  return clocks.length ? `Shorts go public at ${clocks.join(' and ')} your time` : '';
}

/**
 * T3-16: schedule warnings fit for the owner. The quota-model advisory is
 * developer information (it only says the limit is roomier) — dropped. The
 * insert-bucket limit is real and is said in plain words. Others pass through.
 */
export function plainScheduleWarnings(list) {
  const out = [];
  for (const s of Array.isArray(list) ? list : []) {
    if (typeof s !== 'string' || !s.trim() || /^Quota advisory:/i.test(s)) continue;
    const m = /^Advisory: the busiest day plans (\d+) uploads, over this project's insert bucket of (\d+)\/day/i.exec(s);
    out.push(m ? `Too many uploads on the busiest day: ${m[1]} planned, YouTube takes ${m[2]} a day. The rest would be refused.` : s);
  }
  return [...new Set(out)];
}
