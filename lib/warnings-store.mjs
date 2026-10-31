// #106 WARNINGS STORE — repo-root shim (same split as the #104 quota ledger /
// the S5 analytics store / the T5 script store).
//
// The canonical implementation moved to studio/lib/warnings-store.mjs (with
// its ntfy-alert + warnings-probe companions) so the Studio /warnings
// dashboard can import it INSIDE the Next.js root (imports reaching outside
// the Turbopack root fail `next build`). Every named export is re-exported
// here unchanged, so the pipeline, the nightly scripts, and the tests keep
// importing './lib/warnings-store.mjs' exactly as before:
//   channel-pipeline.mjs (T2 park-check / T5 gate) -> emitWarning, getDefaultWarningsStore
//   scripts/upload-reconcile.mjs, scripts/warnings-probe.mjs       -> same
//   tests/warnings-store.test.mjs, tests/pipeline-jobstore.test.mjs -> same
export * from '../studio/lib/warnings-store.mjs';
