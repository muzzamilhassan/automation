// Should tonight's run write a NEW documentary script for review?
// (docs/qa/doc-script-cadence-qa.md — owner 2026-11-25: "why scripts are showing
// everyday for every channel although we are just publishing 1 long video per week")
//
// A review-gated clips channel used to write one every day ("the /review desk would
// starve"), and every approved one became a long video — far past the channel's doc
// days. Now a script is written only when a long video is due, and never while one
// is already waiting. Pure.
import { docDaysOf, isDocDay, isDocDue } from './doc-days.mjs';

// An unanswered script blocks a new one only while it can still go ahead: auto-approve
// (studio/lib/auto-approve.mjs) never touches one older than 48 h, so after that it
// would block the channel's long videos for days (found live 2026-11-27: MR/IC/DFD
// wrote nothing on their long-video days behind pre-fact-check scripts).
export const PENDING_MAX_AGE_DAYS = 2;

function waiting(pending, now) {
  return (Array.isArray(pending) ? pending : []).filter((s) => {
    if (!s || s.kind !== 'doc') return false;
    const t = new Date(s.created_at).getTime();
    return Number.isFinite(t) && now.getTime() - t < PENDING_MAX_AGE_DAYS * 86400000;
  });
}

/**
 * @param {object} p
 * @param {object} p.kit resolved channel kit (docDays / docDay)
 * @param {string|null} p.lastDocDate YYYY-MM-DD of the channel's last long video
 * @param {Array<object>} [p.pending] the channel's awaiting_review scripts ({ kind, created_at })
 * @param {boolean} [p.ordered] the owner asked for one now (force run or an owner topic)
 * @param {Date} [p.now]
 * @returns {{ due: boolean, reason: 'ordered'|'due'|'already_waiting'|'not_due'|'no_doc_days' }}
 */
export function docScriptDue({ kit = {}, lastDocDate = null, pending = [], ordered = false, now = new Date() } = {}) {
  if (ordered) return { due: true, reason: 'ordered' };
  if (!docDaysOf(kit).length) return { due: false, reason: 'no_doc_days' };
  if (waiting(pending, now).length) return { due: false, reason: 'already_waiting' };
  // a brand-new channel starts on its doc day, not on whichever day it was switched on
  const due = lastDocDate ? isDocDue(kit, lastDocDate, now) : isDocDay(kit, now);
  return { due, reason: due ? 'due' : 'not_due' };
}

export function notDueText(reason, kit = {}) {
  const days = docDaysOf(kit).join('/');
  if (reason === 'already_waiting') return 'a script is already waiting for review — no new one written';
  if (reason === 'no_doc_days') return 'no long-video days are set — no script written';
  return `no long video is due today (long-video days: ${days}) — no script written`;
}
