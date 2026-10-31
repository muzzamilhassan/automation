// #106 PARKED-CHANNEL PROBES — repo-root shim. Canonical implementation lives
// in studio/lib/warnings-probe.mjs (moved alongside warnings-store so the
// /warnings "re-check now" button can call the same probe runner INSIDE the
// Next.js root). Every named export is re-exported unchanged; repo-root
// importers (channel-pipeline.mjs park-check, scripts/warnings-probe.mjs
// nightly job, tests) keep working untouched.
export * from '../studio/lib/warnings-probe.mjs';
