// Step C0 — pure checks for the nightly Neon backup (tests/db-backup.test.mjs).
//
// compareCounts: after pg_restore into a throwaway Postgres, every live table
// must exist and hold (about) the same rows. pg_dump takes a consistent
// snapshot, but the live counts are read separately, so small drift is
// tolerated (rows a CI run added or a cleanup removed meanwhile). A table
// that had rows and restored EMPTY, or lost more than the tolerance, fails.

export function compareCounts(source = {}, restored = {}, { maxDropRows = 10, maxDropRatio = 0.05 } = {}) {
  const problems = [];
  const tables = Object.keys(source);
  if (!tables.length) return ['no tables in the source — refusing to call an empty backup good'];
  for (const t of tables) {
    const s = Number(source[t]);
    if (!(t in restored)) { problems.push(`${t} missing from the restore`); continue; }
    const r = Number(restored[t]);
    if (s > 0 && r === 0) { problems.push(`${t} restored EMPTY (live has ${s})`); continue; }
    const drop = s - r;
    if (drop > Math.max(maxDropRows, Math.ceil(s * maxDropRatio))) problems.push(`${t} restored ${r} rows, live has ${s}`);
  }
  return problems;
}

export function backupAssetName(isoDate) {
  return `neon-${isoDate}.dump.age`;
}

// Release assets older than keepDays (by the date in the name) — never touches
// files that are not backups.
export function assetsToPrune(names = [], todayIso, keepDays = 30) {
  const today = Date.parse(`${todayIso}T00:00:00Z`);
  return names.filter((n) => {
    const m = /^neon-(\d{4}-\d{2}-\d{2})\.dump\.age$/.exec(n);
    if (!m) return false;
    // keep exactly keepDays dumps: today and the keepDays-1 days before it
    return (today - Date.parse(`${m[1]}T00:00:00Z`)) / 86400000 >= keepDays;
  });
}
