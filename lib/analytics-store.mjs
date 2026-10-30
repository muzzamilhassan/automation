// #106 ANALYTICS STORE — repo-root shim (same split as the #104 quota ledger).
//
// The canonical implementation moved to studio/lib/analytics-store.mjs so the
// Studio leaderboard route can import it INSIDE the Next.js root (imports
// reaching outside the Turbopack root fail `next build`). Every named export
// is re-exported here unchanged, so the nightly script and the tests keep
// importing './lib/analytics-store.mjs' exactly as before:
//   scripts/analytics-nightly.mjs   -> makeAnalyticsStore, getAnalyticsStore, ...
//   tests/analytics-store.test.mjs  -> makeAnalyticsStore, trailingWindowDays, ...
export * from '../studio/lib/analytics-store.mjs';
