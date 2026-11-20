// J1 (2026-11-20): the daily Excel reports live as GitHub Actions artifacts
// ("reports-<run_id>", kept 30 days by reporting-daily.yml) — never committed
// to the repo (binary bloat + analytics data would go public with the repo).
// Pure mapping from the artifacts API to the Reports card rows.

const PKT_MS = 5 * 3600 * 1000; // the report's day is the owner's (PKT) day

export function reportDayFromIso(iso) {
  const t = Date.parse(String(iso || ''));
  if (!Number.isFinite(t)) return null;
  return new Date(t + PKT_MS).toISOString().slice(0, 10);
}

/** artifacts → [{ name, when, size, source:'actions', artifactId }] newest first, one per day. */
export function artifactsToReports(artifacts = []) {
  const byDay = new Map();
  for (const a of Array.isArray(artifacts) ? artifacts : []) {
    if (!a || a.expired || !/^reports-\d+$/.test(String(a.name || ''))) continue;
    const day = reportDayFromIso(a.created_at);
    if (!day) continue;
    const prev = byDay.get(day);
    if (prev && Date.parse(prev.created_at) >= Date.parse(a.created_at)) continue;
    byDay.set(day, a);
  }
  return [...byDay.entries()]
    .map(([day, a]) => ({ name: `daily-report-${day}.xlsx`, when: day, size: a.size_in_bytes || null, source: 'actions', artifactId: a.id }))
    .sort((x, y) => y.when.localeCompare(x.when));
}

/** Merge artifact rows with any legacy repo-folder files; a day appears once (artifact wins). */
export function mergeReports(actionRows = [], repoRows = []) {
  const days = new Set(actionRows.map((r) => r.when));
  return [...actionRows, ...repoRows.filter((r) => !days.has(r.when))].sort((a, b) => String(b.when || b.name).localeCompare(String(a.when || a.name)));
}
