// Emotional voice — the free Kaggle GPU quota guard (docs/qa/emotional-voice-qa.md EV-Q).
//
// Pure. The engine (explainer/kaggle_voice.py) records every GPU run's wall
// time in yt-mcp/state/gpu-usage/<slug>.json — one file per channel, so
// parallel channel jobs never conflict when the produce job's "Commit
// publishing state" step commits them — and skips Kaggle once the SUM of all
// channels this ISO week passes GPU_GUARD_HOURS (the free quota is per Kaggle
// account); the panel shows the same number. Both sides are pinned to
// tests/fixtures/gpu-usage-cases.json.
//
//   each file: { weeks: { "2026-W47": { seconds, runs: [{ at, slug, kernel, seconds, ok }] } } }

export const GPU_WEEKLY_LIMIT_HOURS = 30; // Kaggle's free GPU allowance (about 30 h a week)
export const GPU_GUARD_HOURS = 25;        // stop here, leaving headroom
export const GPU_USAGE_DIR = 'yt-mcp/state/gpu-usage';
export const gpuUsagePath = (slug) => `${GPU_USAGE_DIR}/${String(slug).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')}.json`;
const KEEP_WEEKS = 8;

const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

// ISO-8601 week of a date (UTC), e.g. "2026-W47"
export function isoWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day); // the Thursday of this week decides the year
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// every channel's file -> one usage object (junk skipped; never throws)
export function mergeGpuUsage(list) {
  const weeks = {};
  for (const u of Array.isArray(list) ? list : []) {
    if (!isObj(u) || !isObj(u.weeks)) continue;
    for (const [k, w] of Object.entries(u.weeks)) {
      if (!isObj(w)) continue;
      const cur = weeks[k] || (weeks[k] = { seconds: 0, runs: [] });
      if (typeof w.seconds === 'number' && Number.isFinite(w.seconds) && w.seconds > 0) cur.seconds += w.seconds;
      if (Array.isArray(w.runs)) cur.runs.push(...w.runs);
    }
  }
  return { weeks };
}

// never throws: junk / missing = nothing used
export function gpuUsageSummary(usage, now = new Date()) {
  const week = isoWeekKey(now);
  const w = isObj(usage) && isObj(usage.weeks) && isObj(usage.weeks[week]) ? usage.weeks[week] : {};
  const seconds = typeof w.seconds === 'number' && Number.isFinite(w.seconds) && w.seconds > 0 ? w.seconds : 0;
  const hours = Math.round((seconds / 3600) * 10) / 10;
  return {
    week,
    hours,
    runs: Array.isArray(w.runs) ? w.runs.length : 0,
    limitHours: GPU_WEEKLY_LIMIT_HOURS,
    guardHours: GPU_GUARD_HOURS,
    paused: seconds >= GPU_GUARD_HOURS * 3600,
  };
}

export function gpuUsageLine(s) {
  const h = Number.isFinite(s?.hours) ? s.hours : 0;
  const base = `Free GPU this week: ${h} h of ~${s?.limitHours || GPU_WEEKLY_LIMIT_HOURS} h`;
  return s?.paused ? `${base} — paused until next week (standard voice)` : base;
}

// a new usage object with one run added to its ISO week (oldest weeks dropped)
export function recordGpuRun(usage, { at, slug = '', kernel = '', seconds = 0, ok = false } = {}) {
  const weeks = isObj(usage) && isObj(usage.weeks) ? { ...usage.weeks } : {};
  const when = at ? new Date(at) : new Date();
  const key = isoWeekKey(when);
  const cur = isObj(weeks[key]) ? weeks[key] : {};
  const secs = Math.max(0, Math.round(Number(seconds) || 0));
  weeks[key] = {
    seconds: (typeof cur.seconds === 'number' && Number.isFinite(cur.seconds) ? cur.seconds : 0) + secs,
    runs: [...(Array.isArray(cur.runs) ? cur.runs : []), { at: when.toISOString(), slug, kernel, seconds: secs, ok: Boolean(ok) }].slice(-50),
  };
  const keep = Object.keys(weeks).sort().slice(-KEEP_WEEKS);
  return { weeks: Object.fromEntries(keep.map((k) => [k, weeks[k]])) };
}
