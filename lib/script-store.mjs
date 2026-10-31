// #106 SCRIPT STORE — repo-root shim (same split as the #104 quota ledger /
// the S5 analytics store).
//
// The canonical implementation moved to studio/lib/script-store.mjs so the
// Studio /review route can import it INSIDE the Next.js root (imports
// reaching outside the Turbopack root fail `next build`). Every named export
// is re-exported here unchanged, so the pipeline gate, the nightly sweep, and
// the tests keep importing './lib/script-store.mjs' exactly as before:
//   channel-pipeline.mjs (T5 gate)  -> getScriptStore
//   scripts/review-sweep.mjs (M4)   -> getScriptStore
//   tests/script-store.test.mjs     -> makeScriptStore, SCRIPT_STATUSES, ...
export * from '../studio/lib/script-store.mjs';
