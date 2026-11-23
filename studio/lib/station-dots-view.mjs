// Creator City Phase 1 (FEEDBACK item O, 2026-11-23) — pure view logic for
// the station dots (Today rows) and the run step drawer (Runs page + Today).
// Words and tones come from lib/stations.mjs; durations from lib/runs-view.mjs.
// Relative imports only — this file ships in the client bundle.
//
//   normalizeStrip   API stations → always the 7 stations, in order
//   dotAria/dotTitle one dot → "Voice: Running" / "Voice — Running · detail"
//   currentIndex     which dot is "where the run is now"
//   stationsFromPayload  /api/stations body → channels map, or null (no dots)
//   stepsUrl         { jobId | runId [+ channel, startedAt] } → /api/runs/steps?… (job id wins)
//   matchRunUrl      a GitHub run URL only when the run ids match
//   stepsView        /api/runs/steps body → { kind: ok | multi | no_job | error, … }
import { STATIONS, STATE_WORD, stateFromStepStatus } from './stations.mjs';
import { fmtDuration } from './runs-view.mjs';

const STATES = new Set(Object.keys(STATE_WORD));
const validState = (s) => (typeof s === 'string' && STATES.has(s) ? s : null);

/** One line, trimmed, at most `max` characters (… when cut). */
export function firstLine(text, max = 160) {
  const line = String(text ?? '').trim().split(/\r?\n/)[0].trim();
  return line.length > max ? line.slice(0, max - 1) + '…' : line;
}

/** Always 7 dots in pipeline order. A station the API did not send is "unknown" (Not tracked). */
export function normalizeStrip(list) {
  const byKey = new Map();
  if (Array.isArray(list)) for (const s of list) if (s && typeof s.key === 'string' && !byKey.has(s.key)) byKey.set(s.key, s);
  return STATIONS.map(({ key, label }) => {
    const s = byKey.get(key);
    return {
      key,
      label,
      state: (s && validState(s.state)) || 'unknown',
      at: s?.at || null,
      detail: s?.detail ? String(s.detail) : null,
    };
  });
}

export const dotAria = (d) => `${d.label}: ${STATE_WORD[d.state] || STATE_WORD.unknown}`;

export function dotTitle(d) {
  const detail = firstLine(d.detail);
  return `${d.label} — ${STATE_WORD[d.state] || STATE_WORD.unknown}${detail ? ` · ${detail}` : ''}`;
}

/** Index of the dot the run is "at": running, else waiting for you, else failed; -1 if none. */
export function currentIndex(strip) {
  for (const state of ['running', 'needs_you', 'failed']) {
    const i = strip.findIndex((d) => d.state === state);
    if (i >= 0) return i;
  }
  return -1;
}

/** Screen-reader text for the whole strip: "Topic: Done, Script: Running, …". */
export const stripAria = (strip) => strip.map(dotAria).join(', ');

/** /api/stations body → `{ [slug]: entry }`, or null when there is nothing honest to show. */
export function stationsFromPayload(body) {
  if (!body || body.ok !== true) return null;
  const ch = body.channels;
  if (!ch || typeof ch !== 'object' || Array.isArray(ch)) return null;
  return ch;
}

/** The viewer's IANA time zone (the APIs format clock times in it), or '' when unknown. */
export function browserTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; }
}

const tzParam = (tz) => (tz ? `&tz=${encodeURIComponent(tz)}` : '');

/** /api/stations URL, with the viewer's zone so "Uploaded 09:04" is local time. */
export function stationsUrl(tz) {
  return tz ? `/api/stations?tz=${encodeURIComponent(tz)}` : '/api/stations';
}

/**
 * The step-API URL for a drawer target; the job id wins over the GitHub run id.
 * A run row that knows its channel asks for that channel only (one scheduled
 * run covers every channel) and passes its start time for the older-run
 * fallback; a fleet row (no channel) gets every channel's job back.
 */
export function stepsUrl(target, tz) {
  if (target?.jobId) return `/api/runs/steps?jobId=${encodeURIComponent(target.jobId)}${tzParam(tz)}`;
  if (target?.runId != null && target.runId !== '') {
    const ch = target.channel ? `&channel=${encodeURIComponent(target.channel)}` : '';
    const at = target.channel && target.startedAt ? `&startedAt=${encodeURIComponent(target.startedAt)}` : '';
    return `/api/runs/steps?runId=${encodeURIComponent(target.runId)}${ch}${at}${tzParam(tz)}`;
  }
  return null;
}

/** The GitHub log URL of `run` only when it is the same run as `runId`. */
export function matchRunUrl(runId, run) {
  if (runId == null || runId === '' || !run || run.id == null || !run.url) return null;
  return String(run.id) === String(runId) ? run.url : null;
}

/** A step's display state: a valid `state` from the API, else its job_steps status mapped. */
export const stepState = (step) => validState(step?.state) || stateFromStepStatus(step?.status);

/**
 * /api/runs/steps body → what the drawer shows. Anything unexpected is an
 * error, never "all fine". A fleet run (several channels) → `multi` with one
 * ok view per channel, in the API's order.
 */
export function stepsView(body) {
  if (body && body.ok === false && body.reason === 'no_job') return { kind: 'no_job' };
  if (body && body.ok === true && Array.isArray(body.jobs)) {
    const items = body.jobs.map((j) => ({ channel: j?.job?.channel || null, view: oneJobView(j) }));
    if (!items.length || items.some((i) => i.view.kind !== 'ok')) return { kind: 'error' };
    return { kind: 'multi', items };
  }
  if (!body || body.ok !== true) return { kind: 'error' };
  return oneJobView(body);
}

function oneJobView(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.steps)) return { kind: 'error' };
  const steps = body.steps
    .filter((s) => s && typeof s === 'object')
    .map((s, i) => ({
      idx: Number.isFinite(s.idx) ? s.idx : i,
      label: s.label || s.name || `Step ${i + 1}`,
      state: stepState(s),
      duration: s.durationSec == null ? '' : fmtDuration(s.durationSec),
      errorLine: firstLine(s.error),
    }))
    .sort((a, b) => a.idx - b.idx);
  const job = body.job && typeof body.job === 'object' ? body.job : {};
  return {
    kind: 'ok',
    job,
    steps,
    strip: normalizeStrip(body.stations),
    summary: typeof body.summary === 'string' ? body.summary : '',
    jobError: firstLine(job.error),
  };
}
