// Creator City item 6 (research/creator-city-agent-factory-2026-11-23.md §5.6):
// Inbox "questions" — typed asks with buttons, the reference app's
// agent-request model (kinds + options + pending/answered/expired/cancelled).
// The Money Rulebook silent-loss case (approved scripts that never became
// videos: render crash "alignment too weak", timeouts) is exactly the moment
// the system should ASK instead of failing quietly.
//
// PURE module — no I/O. The Neon table + the action runner live in
// asks-store.mjs; /api/asks only wires. Sources (all real, nothing invented):
//   station  — the channel's latest finished run failed at a station
//              (job_steps `station:*`, upload intents) → key station:<job>:<key>
//   warnings — open REAL warnings with one of ASK_WARNING_CODES
//              → key script:<id>:unpublished | script:<id>:review_timeout |
//                warning:<id>
//   scripts  — approved scripts with no video (script-store
//              approvedNotPublished) → key script:<id>:unpublished
// One source_key = one question, ever (UNIQUE in Neon): an answered ask never
// comes back for the same thing, and two sources about one script merge.
//
// Expiry ("nothing hangs forever"): 24 h after it was asked; or its source no
// longer applies (warning closed, script got its video); or, for a station
// ask, a newer run of that channel passed (or failed again at) that station.
// A reader that failed is UNKNOWN — its asks are never expired early.
import { STATIONS } from './stations.mjs';
import { deriveStrip, pickForJob, shortError, runIdOf } from './station-read.mjs';
import { runHref } from './run-link.mjs';
import { isRealSeverity, scriptIdOf } from './notify-policy.mjs';

export const ASK_KINDS = Object.freeze(['retry_or_skip', 'confirm', 'choice']);
export const ASK_STATUSES = Object.freeze(['pending', 'answered', 'expired', 'cancelled']);
export const ASK_TTL_MS = 24 * 60 * 60 * 1000;
export const ASK_WARNING_CODES = Object.freeze(['approved_not_published', 'approval_dispatch_failed', 'review_timeout', 'upload_failed']);

// The ONLY server actions an option may name (asks-store.mjs runs them through
// existing code paths). Anything else stored in an option is never runnable.
export const ASK_ACTIONS = Object.freeze(['retry_resume', 'redispatch_script', 'reject_script', 'skip_approved_script', 'resolve_warnings', 'dismiss']);
// Actions that start a billable GitHub Actions run (rate-limited like /api/action).
export const DISPATCH_ACTIONS = Object.freeze(['retry_resume', 'redispatch_script']);

const LABEL = Object.fromEntries(STATIONS.map((s) => [s.key, s.label]));
const UNPUBLISHED_CODES = ['approved_not_published', 'approval_dispatch_failed'];
const NO_ERROR_LINE = 'No error line was recorded';

function toMs(v) {
  if (v == null || v === '') return null;
  const t = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(t) ? t : null;
}
const toIso = (v) => (toMs(v) == null ? null : new Date(toMs(v)).toISOString());
const quoted = (t) => `“${t}”`;

// "Open run" opens THAT run's step drawer when the run / job is known.
const openRun = (link = {}) => ({ id: 'open', label: 'Open run', href: runHref(link) });

// ------------------------------------------------------------------ station

/** The first failed station of a FINISHED run (the cause), with the strip. */
function failedStation(entry) {
  const job = entry?.job;
  if (!job || job.status === 'running') return null;
  const { stations } = deriveStrip({ job, steps: entry.steps || [], scripts: entry.scripts || [], intents: entry.intents || [] });
  // approval "failed" = the owner rejected it — a choice, never a question
  const failed = stations.find((s) => s.state === 'failed' && s.key !== 'approval');
  if (!failed) return null;
  const uploaded = stations.find((s) => s.key === 'upload')?.state === 'done';
  return { failed, uploaded, script: pickForJob(entry.scripts || [], job) };
}

/** Script ids whose titles the station asks need (the route reads them). */
export function titleScriptIds(today) {
  const out = [];
  for (const entry of today?.values?.() ?? []) {
    const f = failedStation(entry);
    if (f?.script?.id && !f.script.title) out.push(String(f.script.id));
  }
  return [...new Set(out)];
}

/** One channel's latest run → the ask for its first failed station, or null. */
export function stationAsk(entry, { titles = {} } = {}) {
  const f = failedStation(entry);
  if (!f) return null;
  const { job } = entry;
  const key = f.failed.key;
  const scriptTitle = f.script ? f.script.title || titles[String(f.script.id)] || null : null;
  const title = `${LABEL[key]} failed${scriptTitle ? ` for ${quoted(scriptTitle)}` : ''}`;
  const base = {
    source_key: `station:${job.id}:${key}`,
    channel: job.channel,
    title,
    body: f.failed.detail || NO_ERROR_LINE,
    covers: [],
    jobIds: [String(job.id), job.resumed_from_job_id ? String(job.resumed_from_job_id) : null].filter(Boolean),
  };
  const open = openRun({ runId: runIdOf(job), jobId: job.id, channel: job.channel });
  // Already on YouTube: a resume could upload the same video twice — no Retry.
  if (f.uploaded) {
    return { ...base, kind: 'confirm', options: [{ ...open, primary: true }, { id: 'ok', label: 'Got it', action: 'dismiss' }] };
  }
  const upload = key === 'upload';
  return {
    ...base,
    kind: 'retry_or_skip',
    options: [
      { id: 'retry', label: upload ? 'Retry upload' : 'Retry now', action: 'retry_resume', args: { jobId: String(job.id) }, primary: true },
      { id: 'skip', label: upload ? 'Skip' : 'Skip today', action: 'dismiss' },
      open,
    ],
  };
}

// ------------------------------------------------------------------ scripts

const SKIP_UNPUBLISHED_CONFIRM = Object.freeze({
  title: 'Skip this video?',
  body: 'The script is marked skipped (rejected) and never becomes a video. Its alerts close.',
  confirmLabel: 'Skip it',
  tone: 'danger',
});

function unpublishedAsk({ scriptId, channel, title, jobId = null, covers = [] }) {
  return {
    source_key: `script:${scriptId}:unpublished`,
    channel,
    kind: 'retry_or_skip',
    title: 'Approved script never became a video',
    body: title ? quoted(title) : 'You approved it, but no video was made',
    hasTitle: Boolean(title),
    covers: [...covers],
    jobIds: jobId ? [String(jobId)] : [],
    options: [
      { id: 'retry', label: 'Retry now', action: 'redispatch_script', args: { scriptId }, primary: true },
      { id: 'skip', label: 'Skip it', action: 'skip_approved_script', args: { scriptId }, confirm: { ...SKIP_UNPUBLISHED_CONFIRM } },
    ],
  };
}

/** script-store approvedNotPublished row → ask. */
export function unpublishedScriptAsk(s) {
  if (!s?.id || !s.channel_id) return null;
  return unpublishedAsk({ scriptId: String(s.id), channel: s.channel_id, title: s.title || null, jobId: s.job_id || null });
}

// ------------------------------------------------------------------ warnings

/** The quoted script title inside a warning title, e.g. never published — "X". */
function titleFromWarning(w) {
  return /"([^"]+)"/.exec(String(w?.title || ''))?.[1] || null;
}

/** One open warning → ask, or null (quiet, resolved, or not an ask code). */
export function warningAsk(w) {
  if (!w || !ASK_WARNING_CODES.includes(w.code) || !isRealSeverity(w.severity) || w.state === 'resolved') return null;
  const id = String(w.id);
  const channel = w.channel_id || null;
  const sid = scriptIdOf(w);
  const scriptTitle = titleFromWarning(w);

  if (UNPUBLISHED_CODES.includes(w.code) && sid) {
    return unpublishedAsk({ scriptId: sid, channel, title: scriptTitle, jobId: w.job_id || null, covers: [id] });
  }
  if (w.code === 'review_timeout' && sid) {
    return {
      source_key: `script:${sid}:review_timeout`,
      channel,
      kind: 'choice',
      title: 'Approval window passed',
      body: scriptTitle ? `${quoted(scriptTitle)} still waits for you` : 'A script still waits for you',
      covers: [id],
      jobIds: [],
      options: [
        { id: 'review', label: 'Review now', href: `/review?id=${encodeURIComponent(sid)}`, primary: true },
        {
          id: 'skip', label: 'Skip it', action: 'reject_script', args: { scriptId: sid },
          confirm: { title: 'Skip this script?', body: 'It is marked rejected and never becomes a video.', confirmLabel: 'Skip it', tone: 'danger' },
        },
      ],
    };
  }
  const skip = { id: 'skip', label: 'Skip', action: 'resolve_warnings', args: { warningIds: [id] } };
  if (w.code === 'upload_failed') {
    const base = { source_key: `warning:${id}`, channel, title: 'Upload failed', body: shortError(w.evidence) || shortError(w.title) || NO_ERROR_LINE, covers: [id], jobIds: [] };
    const open = openRun({ jobId: w.job_id || null, channel });
    if (!w.job_id) return { ...base, kind: 'confirm', options: [{ ...open, primary: true }, skip] };
    return {
      ...base,
      kind: 'retry_or_skip',
      options: [{ id: 'retry', label: 'Retry upload', action: 'retry_resume', args: { jobId: String(w.job_id) }, primary: true }, skip, open],
    };
  }
  // A review alert that cites no script: nothing safe to retry — review or close it.
  return {
    source_key: `warning:${id}`,
    channel,
    kind: 'confirm',
    title: w.code === 'review_timeout' ? 'Approval window passed' : 'Approved script never became a video',
    body: shortError(w.title) || NO_ERROR_LINE,
    covers: [id],
    jobIds: [],
    options: [{ id: 'review', label: 'Open review', href: '/review', primary: true }, skip],
  };
}

// ------------------------------------------------------------------ derive

function merge(map, cand) {
  if (!cand) return;
  const prev = map.get(cand.source_key);
  if (!prev) {
    map.set(cand.source_key, { ...cand, covers: [...cand.covers], jobIds: [...(cand.jobIds || [])] });
    return;
  }
  const better = !prev.hasTitle && cand.hasTitle ? cand : prev;
  map.set(cand.source_key, {
    ...better,
    covers: [...new Set([...prev.covers, ...cand.covers])],
    jobIds: [...new Set([...(prev.jobIds || []), ...(cand.jobIds || [])])],
  });
}

/**
 * Every current question, keyed by source_key (dedupe + merge). A reader that
 * failed passes null and contributes nothing. An "approved but never made"
 * question about the run that just failed at a station folds INTO the station
 * question (same video, one item; the station one is more specific).
 *   today       Map<channel, {job, steps, scripts, intents}> (jobs-read loadToday)
 *   warnings    open warning rows with ASK_WARNING_CODES
 *   unpublished script-store approvedNotPublished rows
 *   titles      { scriptId: title } for station asks
 */
export function deriveAsks({ today = null, warnings = null, unpublished = null, titles = {} } = {}) {
  const stations = new Map();
  for (const entry of today?.values?.() ?? []) merge(stations, stationAsk(entry, { titles }));
  const rest = new Map();
  for (const s of unpublished || []) merge(rest, unpublishedScriptAsk(s));
  for (const w of warnings || []) merge(rest, warningAsk(w));

  const byJob = new Map();
  for (const c of stations.values()) for (const j of c.jobIds) byJob.set(j, c);
  const out = new Map(stations);
  for (const c of rest.values()) {
    const station = c.source_key.endsWith(':unpublished') ? c.jobIds.map((j) => byJob.get(j)).find(Boolean) : null;
    if (station) {
      station.covers = [...new Set([...station.covers, ...c.covers])];
      continue;
    }
    out.set(c.source_key, c);
  }
  return out;
}

/** A candidate → the row asks-store inserts (expires 24 h after it is asked). */
export function newAskRow(cand, now = Date.now()) {
  return {
    source_key: cand.source_key,
    channel: cand.channel ?? null,
    kind: cand.kind,
    title: cand.title,
    body: cand.body ?? null,
    options: cand.options,
    expires_at: new Date((toMs(now) ?? Date.now()) + ASK_TTL_MS).toISOString(),
  };
}

// ------------------------------------------------------------------ expire

function familyOf(key) {
  const k = String(key || '');
  if (k.startsWith('station:')) return 'station';
  if (k.startsWith('script:')) return 'script';
  if (k.startsWith('warning:')) return 'warning';
  return null;
}

/** Station ask whose job is no longer the latest: did the newer run get past it? */
function stationMovedOn(row, today) {
  const m = /^station:(.+):([a-z]+)$/.exec(String(row.source_key));
  if (!m) return null;
  const [, jobId, key] = m;
  const entry = today?.get?.(row.channel);
  if (!entry?.job) return null; // nothing newer seen — the 24 h rule decides
  if (String(entry.job.id) === jobId) return 'no longer applies';
  const { stations } = deriveStrip({ job: entry.job, steps: entry.steps || [], scripts: entry.scripts || [], intents: entry.intents || [] });
  const state = stations.find((s) => s.key === key)?.state;
  if (state === 'done') return 'a newer run passed this step';
  if (state === 'failed') return 'a newer run failed here again';
  return null;
}

/**
 * Pending asks that must expire now → [{ id, reason }].
 *   candidates  deriveAsks output (what applies right now)
 *   today       the same loadToday Map (station asks of older runs)
 *   read        { today, warnings, unpublished } — which readers answered
 */
export function staleAsks(pending, { candidates = new Map(), today = null, read = {}, now = Date.now() } = {}) {
  const nowMs = toMs(now) ?? Date.now();
  const out = [];
  for (const row of pending || []) {
    if (!row || row.status !== 'pending') continue;
    const id = String(row.id);
    const exp = toMs(row.expires_at);
    if (exp != null && exp <= nowMs) {
      out.push({ id, reason: '24 h passed' });
      continue;
    }
    if (candidates.has(row.source_key)) continue;
    const family = familyOf(row.source_key);
    let reason = null;
    if (family === 'station' && read.today) reason = stationMovedOn(row, today);
    else if (family === 'warning' && read.warnings) reason = 'no longer applies';
    else if (family === 'script' && read.warnings && read.unpublished && read.today) reason = 'no longer applies';
    if (reason) out.push({ id, reason });
  }
  return out;
}

// ------------------------------------------------------------------ present / answer

function parseOptions(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseJson(raw) {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** A stored row (+ its current candidate) → what the Inbox card needs. Server
 * action names and args never leave the server. */
export function presentAsk(row, cand = null) {
  const answer = parseJson(row.answer);
  return {
    id: String(row.id),
    channel: row.channel ?? null,
    kind: row.kind,
    title: row.title,
    body: row.body ?? null,
    options: parseOptions(row.options).map(({ action, args, ...o }) => o),
    status: row.status,
    createdAt: toIso(row.created_at),
    expiresAt: toIso(row.expires_at),
    error: answer?.lastError || null,
    covers: cand?.covers ? [...cand.covers] : [],
  };
}

const ID_RE = /^\d{1,18}$/;
const OPTION_RE = /^[a-z][a-z_]{0,31}$/;

/** POST body → { ok, id, optionId } or { ok:false, reason }. */
export function parseAnswer(body) {
  if (!body || typeof body !== 'object') return { ok: false, reason: 'body_required' };
  if (body.id == null || body.id === '') return { ok: false, reason: 'id_required' };
  const id = String(body.id);
  if (!ID_RE.test(id)) return { ok: false, reason: 'bad_id' };
  if (body.optionId == null || body.optionId === '') return { ok: false, reason: 'option_required' };
  const optionId = String(body.optionId);
  if (!OPTION_RE.test(optionId)) return { ok: false, reason: 'bad_option' };
  return { ok: true, id, optionId };
}

/** The STORED option a click names — only one with a known server action. */
export function findOption(ask, optionId) {
  const o = parseOptions(ask?.options).find((x) => x && x.id === optionId);
  return o && ASK_ACTIONS.includes(o.action) ? o : null;
}

/** "expires in 5 h" / "expires in 40 min"; null once it has passed. */
export function expiresLabel(expiresAt, now = Date.now()) {
  const exp = toMs(expiresAt);
  if (exp == null) return null;
  const ms = exp - (toMs(now) ?? Date.now());
  if (ms <= 0) return null;
  if (ms >= 3600_000) return `expires in ${Math.floor(ms / 3600_000)} h`;
  return `expires in ${Math.max(1, Math.ceil(ms / 60_000))} min`;
}
