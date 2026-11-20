// THE notification policy (owner directive 2026-11-19: "I don't want a lot of
// alerts and notifications — just real notifications").
//
//   REAL (count, bell, badges, home, phone push): blocking, action_required,
//     warning — something broke or needs the owner.
//   QUIET (recorded, visible on /warnings under "For your information", never
//     counted, never pushed): advisory, informational — e.g. 180
//     'upload_orphan' rows that literally say "No action needed".
//
// Repeats of the same problem on the same channel collapse into ONE
// notification with a count ("4× script held for review — Money Rulebook");
// different things under one code get a neutral title instead.
// Pure + relative-import-free so node --test can exercise it.

export const REAL_SEVERITIES = ['blocking', 'action_required', 'warning'];
const RANK = { blocking: 0, action_required: 1, warning: 2, advisory: 3, informational: 4 };

export function isRealSeverity(severity) {
  return REAL_SEVERITIES.includes(severity);
}

// Review-desk alerts: each one is about a script (or a held slot) and can
// link to /review?id=<script>. The first two only say "a script waits for
// you" — the approval queue already counts those (needsYou below).
export const REVIEW_ALERT_CODES = ['review_hold', 'review_timeout', 'approved_not_published', 'approval_dispatch_failed'];
export const APPROVAL_WAIT_CODES = ['review_hold', 'review_timeout'];

// Script ids are UUIDs; the evidence reads "script <id> …". Hex-only so
// "no script record" never reads as an id.
const SCRIPT_ID_RE = /\bscript ([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|[0-9a-f]{8,})\b/i;

/** The script a review alert is about, or null. */
export function scriptIdOf(w) {
  if (!w || !REVIEW_ALERT_CODES.includes(w.code)) return null;
  return SCRIPT_ID_RE.exec(String(w.evidence || ''))?.[1] || null;
}

/** The slot day a review_hold alert is about (dedupe key, then title/evidence). */
export function slotDateOf(w) {
  if (!w) return null;
  const fromKey = /:review_hold:(\d{4}-\d{2}-\d{2})$/.exec(String(w.dedupe_key || ''))?.[1];
  if (fromKey) return fromKey;
  const m = /\bslot (\d{4}-\d{2}-\d{2})\b/.exec(`${w.title || ''} ${w.evidence || ''}`);
  return m ? m[1] : null;
}

// Plain outcome note for a script that no longer waits on the owner.
function outcomeNote(s) {
  if (!s) return null;
  if (s.status === 'consumed') return `auto-resolved: script consumed (video ${s.video_id || 'unknown'})`;
  if (s.status === 'rejected') return 'auto-resolved: script rejected (skipped)';
  if (s.status === 'approved') return 'auto-resolved: script approved';
  return null;
}

/**
 * Is this open review alert stale? Returns the audit note to resolve it
 * with, or null to keep it. Unknown state (lookup failed) always keeps it.
 *   script        — the cited script row (null = unknown)
 *   slotScripts   — every script for a review_hold's slot (null = unknown)
 *   dispatchedScriptId — a resume dispatch for this script just succeeded
 */
export function staleReviewReason(w, { script = null, slotScripts = null, dispatchedScriptId = null } = {}) {
  if (!w || !REVIEW_ALERT_CODES.includes(w.code)) return null;
  const consumed = script?.status === 'consumed' ? outcomeNote(script) : null;

  if (w.code === 'review_hold') {
    if (/:store_unavailable$/.test(String(w.dedupe_key || ''))) return null; // a ledger problem, not a script
    if (slotDateOf(w) && Array.isArray(slotScripts)) {
      if (!slotScripts.length) return null; // nothing to judge by — may still be real
      if (slotScripts.some((s) => s?.status === 'awaiting_review' || s?.status === 'draft')) return null;
      const newest = slotScripts[0];
      if (newest.status === 'rejected') return 'auto-resolved: slot skipped (script rejected)';
      return outcomeNote(newest);
    }
    return script && script.status !== 'awaiting_review' && script.status !== 'draft' ? outcomeNote(script) : null;
  }
  if (w.code === 'review_timeout') {
    return script && script.status !== 'awaiting_review' && script.status !== 'draft' ? outcomeNote(script) : null;
  }
  if (w.code === 'approved_not_published') {
    return consumed || (script?.status === 'rejected' ? outcomeNote(script) : null);
  }
  // approval_dispatch_failed: real until a dispatch for that script works (or it shipped)
  if (consumed) return consumed;
  if (dispatchedScriptId && script?.id === dispatchedScriptId) return 'auto-resolved: dispatch succeeded';
  return null;
}

// Neutral titles when one (channel, code) group holds DIFFERENT things.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dayRange(days) {
  const sorted = [...new Set(days)].sort();
  if (!sorted.length) return '';
  const fmt = (d, withMonth) => {
    const [, m, dd] = d.split('-');
    return withMonth ? `${MONTHS[Number(m) - 1]} ${Number(dd)}` : String(Number(dd));
  };
  const a = sorted[0];
  const b = sorted[sorted.length - 1];
  if (a === b) return ` (${fmt(a, true)})`;
  return ` (${fmt(a, true)}–${fmt(b, a.slice(0, 7) !== b.slice(0, 7))})`;
}
function neutralTitle(code, n, rows) {
  if (code === 'review_hold') return `${n} slots held for review${dayRange(rows.map(slotDateOf).filter(Boolean))}`;
  if (code === 'review_timeout') return `${n} scripts past the approval window`;
  if (code === 'approved_not_published') return `${n} approved videos never published`;
  if (code === 'run_failed') return `${n} runs failed`;
  return `${n} ${String(code || 'other').replace(/_/g, ' ')} alerts`;
}

// One group per (channel, code). The group looks like a warning row so every
// existing renderer keeps working: id, title, severity, channel_id, code —
// plus count / ids / latestAt. Repeats of the SAME wording read "N× title";
// different things under one code get a neutral title ("5 slots held for
// review (Nov 16–20)") — never one item's title standing for all of them.
export function groupRealWarnings(rows = []) {
  const groups = new Map();
  for (const w of rows || []) {
    if (!w || !isRealSeverity(w.severity)) continue;
    const key = `${w.channel_id || 'system'}::${w.code || w.title || w.id}`;
    const at = w.created_at || w.updated_at || '';
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { ...w, id: w.id, groupKey: key, count: 1, ids: [w.id], latestAt: at, baseTitle: w.title, members: [w] });
      continue;
    }
    g.count += 1;
    g.ids.push(w.id);
    g.members.push(w);
    if ((RANK[w.severity] ?? 9) < (RANK[g.severity] ?? 9)) g.severity = w.severity;
    if (at > g.latestAt) {
      g.latestAt = at;
      g.baseTitle = w.title; // newest wording wins
      g.id = w.id;
    }
  }
  return [...groups.values()]
    .map(({ members, ...g }) => {
      const same = new Set(members.map((m) => m.title)).size === 1;
      const title = g.count === 1 ? g.baseTitle : same ? `${g.count}× ${g.baseTitle}` : neutralTitle(g.code, g.count, members);
      return { ...g, title };
    })
    .sort((a, b) => (RANK[a.severity] ?? 9) - (RANK[b.severity] ?? 9) || String(b.latestAt).localeCompare(String(a.latestAt)));
}

/**
 * THE one "needs you" number (live fix wave A4, 2026-11-20) — home verdict,
 * /tasks, /warnings and the bell all read it from here:
 *   count = real problem groups + scripts awaiting approval.
 * A held-slot / approval-window alert and its waiting script are ONE thing:
 * while scripts wait, the queue stands for those alerts; with no script
 * waiting, the alerts are the only record and count themselves.
 * Channel "didn't run / paused" states are not in this number (they show in
 * the channel rows); a FAILED run is a run_failed alert and counts here.
 * rows: raw open warnings OR groupRealWarnings output; awaiting: a number
 * or the awaiting-script list.
 */
export function needsYou({ rows = [], awaiting = 0 } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const groups = list.length && list.every((r) => r && r.groupKey) ? list.filter((g) => isRealSeverity(g.severity)) : groupRealWarnings(list);
  const n = Array.isArray(awaiting) ? awaiting.length : Math.max(0, Number(awaiting) || 0);
  const waits = groups.filter((g) => APPROVAL_WAIT_CODES.includes(g.code));
  const problems = groups.filter((g) => !APPROVAL_WAIT_CODES.includes(g.code));
  const alerts = problems.length + (n > 0 ? 0 : waits.length);
  return { count: alerts + n, alerts, approvals: n, groups };
}

export function quietCount(rows = []) {
  return (rows || []).filter((w) => w && !isRealSeverity(w.severity)).length;
}
