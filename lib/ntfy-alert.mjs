// #106 ALERT DELIVERY — repo-root shim. Canonical implementation lives in
// studio/lib/ntfy-alert.mjs (moved alongside warnings-store for the Studio
// /warnings dashboard — Next.js Turbopack pins the root to studio/). Every
// named export is re-exported unchanged; all repo-root importers
// (channel-pipeline.mjs, verify-run.mjs, yt-daily.mjs, ci-doctor.mjs,
// longvideo/shorts-clips.mjs) keep working untouched.
export * from '../studio/lib/ntfy-alert.mjs';
