// Live fix wave C2 (T1-17): drill and test alerts never reach the owner's
// lists. A row is a drill when its code or title STARTS with "DRILL", or it
// carries a test/drill flag. Titles that merely contain "test" (a real
// template called "shorts-only-test", a video called "She Is Testing You")
// are real alerts and stay.
// Relative imports only (none needed) — this file also ships in the client bundle.

const DRILL = /^\s*drill\b|^\s*drill[_-]/i;

export function isDrill(row) {
  if (!row || typeof row !== 'object') return false;
  if (row.test === true || row.drill === true || row.is_test === true) return true;
  return DRILL.test(String(row.code || '')) || DRILL.test(String(row.title || ''));
}

export function withoutDrills(rows) {
  return (Array.isArray(rows) ? rows : []).filter((r) => !isDrill(r));
}
