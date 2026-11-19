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
// notification with a count ("4× script held for review — Money Rulebook").
// Pure + relative-import-free so node --test can exercise it.

export const REAL_SEVERITIES = ['blocking', 'action_required', 'warning'];
const RANK = { blocking: 0, action_required: 1, warning: 2, advisory: 3, informational: 4 };

export function isRealSeverity(severity) {
  return REAL_SEVERITIES.includes(severity);
}

// One group per (channel, code). The group looks like a warning row so every
// existing renderer keeps working: id, title, severity, channel_id, code —
// plus count / ids / latestAt.
export function groupRealWarnings(rows = []) {
  const groups = new Map();
  for (const w of rows || []) {
    if (!w || !isRealSeverity(w.severity)) continue;
    const key = `${w.channel_id || 'system'}::${w.code || w.title}`;
    const at = w.created_at || w.updated_at || '';
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { ...w, id: w.id, groupKey: key, count: 1, ids: [w.id], latestAt: at, baseTitle: w.title });
      continue;
    }
    g.count += 1;
    g.ids.push(w.id);
    if ((RANK[w.severity] ?? 9) < (RANK[g.severity] ?? 9)) g.severity = w.severity;
    if (at > g.latestAt) {
      g.latestAt = at;
      g.baseTitle = w.title; // newest wording wins
      g.id = w.id;
    }
  }
  return [...groups.values()]
    .map((g) => ({ ...g, title: g.count > 1 ? `${g.count}× ${g.baseTitle}` : g.baseTitle }))
    .sort((a, b) => (RANK[a.severity] ?? 9) - (RANK[b.severity] ?? 9) || String(b.latestAt).localeCompare(String(a.latestAt)));
}

export function quietCount(rows = []) {
  return (rows || []).filter((w) => w && !isRealSeverity(w.severity)).length;
}
