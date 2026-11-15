// One rule for "is a queued clip usable?" — shared by the overview, the
// clip-queue route and its clear action (admin-panel review 2026-11-15 #4).
// Mirrors longvideo/shorts-clips.mjs post-next: a clip is fetched from its
// local `file` (if it exists), else its Release `url`, else the release
// fallback (lookupQueuedClipAsset) by `asset` + the queue's lastRunId.
// "Broken" = none of those can work. The old rule ("no url") labelled valid
// Release-archived clips broken, and clear deleted the whole queue.
export function classifyClip(clip, queue = {}, { fileExists = () => false } = {}) {
  if (!clip) return 'broken';
  if (clip.postedAt) return 'posted';
  if (clip.url) return 'ready';
  if (clip.file && fileExists(clip.file)) return 'ready';
  if (clip.asset && queue?.lastRunId) return 'ready';
  return 'broken';
}

export function summarizeClips(queue, opts) {
  const clips = Array.isArray(queue?.clips) ? queue.clips : [];
  let remaining = 0;
  let broken = 0;
  for (const c of clips) {
    const k = classifyClip(c, queue, opts);
    if (k === 'ready') remaining += 1;
    else if (k === 'broken') broken += 1;
  }
  return { total: clips.length, remaining, broken };
}

export function withoutBrokenClips(queue, opts) {
  const clips = Array.isArray(queue?.clips) ? queue.clips : [];
  return clips.filter((c) => classifyClip(c, queue, opts) !== 'broken');
}
