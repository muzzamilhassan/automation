// A video goes public only on the days set in the panel
// (docs/qa/publish-days-qa.md — owner 2026-11-25: "videos just should publish on
// that day"). Days are UTC weekdays, like the rest of the schedule. No days set =
// any day (exactly the old rule). Pure.
import { nextSlotISO } from './schedule.mjs';

const NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LEAD_MS = 35 * 60_000; // same upload guard as lib/schedule.mjs

const dayList = (days) => (Array.isArray(days) ? days : []).filter((d) => NAMES.includes(d));

/** The next `hhmm` (UTC) on one of `days`, at least 35 minutes away. */
export function nextSlotOnDays(hhmm, days, now = new Date()) {
  const list = dayList(days);
  if (!list.length) return nextSlotISO(hhmm, now);
  const [h, m] = String(hhmm).split(':').map(Number);
  for (let i = 0; i <= 7; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i, h, m, 0));
    if (list.includes(NAMES[d.getUTCDay()]) && d.getTime() > now.getTime() + LEAD_MS) return d.toISOString().replace(/\.\d+Z$/, 'Z');
  }
  return nextSlotISO(hhmm, now); // unreachable with a valid time; never blocks an upload
}

/** The earliest next slot of several on the allowed days; null when there are no slots. */
export function nextFutureSlotOnDays(slots, days, now = new Date()) {
  const list = Array.isArray(slots) ? slots.filter(Boolean) : [];
  if (!list.length) return null;
  return list.map((s) => nextSlotOnDays(s, days, now)).sort()[0];
}

/** Is today (UTC) one of `days`? No days set = yes. */
export function isPublishDay(days, now = new Date()) {
  const list = dayList(days);
  return !list.length || list.includes(NAMES[now.getUTCDay()]);
}

/**
 * The date a channel's last long video counts for: the later of the day it was
 * made and the day it goes public. A video already scheduled for the next
 * long-video day means that day is covered (never two on one day).
 */
export function lastLongDate(state = {}) {
  const made = String(state?.deepdiveDate || '').slice(0, 10);
  const goes = String(state?.deepdiveVideo?.publishAt || '').slice(0, 10);
  const valid = [made, goes].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  return valid.length ? valid[valid.length - 1] : null;
}
