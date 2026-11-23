// Creator City Phase 1 (FEEDBACK item O, 2026-11-23): the 7 production
// "stations" every channel video passes through, named ONCE here so the
// pipeline recorder, the API routes, the Today dots and the Runs drawer all
// speak the same words. Pure module — no I/O.
//
// Pipeline contract: a station is recorded as a Neon job_steps row whose
// `name` is `station:<key>` (e.g. `station:voice`). Status vocabulary of
// job_steps: pending | running | succeeded | failed | skipped.

export const STATIONS = Object.freeze([
  { key: 'topic', label: 'Topic', desc: 'Pick today’s topic' },
  { key: 'script', label: 'Script', desc: 'Write the script' },
  { key: 'approval', label: 'You approve', desc: 'Your OK on the script' },
  { key: 'voice', label: 'Voice', desc: 'Record the voiceover' },
  { key: 'render', label: 'Render', desc: 'Build the video' },
  { key: 'thumbnail', label: 'Thumbnail', desc: 'Make and set the thumbnail' },
  { key: 'upload', label: 'Upload', desc: 'Upload to YouTube' },
]);

export const STATION_KEYS = Object.freeze(STATIONS.map((s) => s.key));

// Display states, fixed words everywhere (UI rule 2 of the research report).
export const STATE_WORD = Object.freeze({
  done: 'Done',
  running: 'Running',
  needs_you: 'Needs you',
  failed: 'Failed',
  not_yet: 'Not yet',
  skipped: 'Skipped',
  unknown: 'Not tracked',
});

// Chip tone per state (matches the panel's --ok/--warn/--bad/--info inks).
export const STATE_TONE = Object.freeze({
  done: 'ok',
  running: 'info',
  needs_you: 'warn',
  failed: 'bad',
  not_yet: 'plain',
  skipped: 'plain',
  unknown: 'plain',
});

export const STEP_PREFIX = 'station:';

/** `station:voice` → 'voice'; anything else → null. */
export function stationFromStepName(name) {
  if (typeof name !== 'string' || !name.startsWith(STEP_PREFIX)) return null;
  const key = name.slice(STEP_PREFIX.length);
  return STATION_KEYS.includes(key) ? key : null;
}

/** 'voice' → `station:voice` (throws on an unknown key: a typo must fail loudly in tests). */
export function stepNameFor(key) {
  if (!STATION_KEYS.includes(key)) throw new Error(`unknown station: ${key}`);
  return `${STEP_PREFIX}${key}`;
}

/** job_steps status → display state. */
export function stateFromStepStatus(status) {
  switch (status) {
    case 'succeeded': return 'done';
    case 'running': return 'running';
    case 'failed': return 'failed';
    case 'skipped': return 'skipped';
    case 'pending': return 'not_yet';
    default: return 'unknown';
  }
}

/** A fresh strip: every station "not yet" (each new run starts clean). */
export function emptyStrip() {
  return STATIONS.map((s) => ({ key: s.key, state: 'not_yet', at: null, detail: null }));
}
