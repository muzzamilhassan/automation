// #106 T5b (round 1) — repo-root shim (the exact script-store split): the
// canonical implementation moved to studio/lib/artifact-store.mjs so the
// /api/review thumb route can read PRIVATE candidate bytes from INSIDE the
// Next.js root (imports reaching outside fail `next build`). Every named
// export is re-exported here unchanged, so the pipeline, the lanes, and the
// tests keep importing './lib/artifact-store.mjs' exactly as before:
//   channel-pipeline.mjs (T2)       -> makeArtifactStore
//   yt-daily / yt-deepdive (T5b)    -> makeArtifactStore
//   tests/artifact-store.test.mjs   -> makeArtifactStore, expiredEntries, ...
export * from '../studio/lib/artifact-store.mjs';
export { default } from '../studio/lib/artifact-store.mjs';
