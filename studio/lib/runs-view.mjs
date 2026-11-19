// Phase 2 run history (OPS-01) — the pure core behind /api/runs and /runs.
// The route fetches raw GitHub Actions runs; everything that decides what the
// owner SEES lives here so it is testable with plain `node --test`:
//   mapRun        raw GitHub run  → one view row
//   groupByChannel rows           → [{ channel, runs }]
//   todaySummary  rows + channels → per-channel "today" (ok/failed/running/none)
//   runLabel      row             → "Succeeded 02:39" / "Failed at 02:41" / "Running for 4m"
// Relative imports only (none needed) — this file also ships in the client bundle.
// Channels always come from data (registry/brands), never from a list in code.

// Workflow FILES whose runs make up the production timeline. Infra names, not
// channel data — adding a channel never touches this list.
export const PRODUCTION_WORKFLOWS = Object.freeze([
  'channel-autopilot.yml',
  'longform-daily.yml',
  'fb-now.yml',
  'ig-slot-poster.yml',
  'weekly-compilation.yml',
  'upload-reconcile.yml',
]);

// run-name first segments that mean "no single channel" (heartbeat / batch).
const NOT_A_CHANNEL = new Set(['heartbeat', 'all', 'all channels', 'scheduler']);

// ".github/workflows/fb-now.yml@refs/heads/main" → "fb-now.yml"
export function workflowFile(path) {
  const s = String(path || '').split('@')[0];
  return s.split('/').pop() || '';
}

const toMs = (iso) => {
  const t = Date.parse(iso || '');
  return Number.isFinite(t) ? t : null;
};

// GitHub status + conclusion → one of: ok | failed | running | queued |
// cancelled | skipped | blocked | unknown. Anything unrecognised is 'unknown'
// — never silently 'ok'.
export function runState(status, conclusion) {
  if (status && status !== 'completed') {
    return status === 'in_progress' ? 'running' : 'queued'; // queued/waiting/requested/pending
  }
  switch (conclusion) {
    case 'success': return 'ok';
    case 'failure':
    case 'timed_out':
    case 'startup_failure': return 'failed';
    case 'cancelled': return 'cancelled';
    case 'skipped':
    case 'neutral':
    case 'stale': return 'skipped';
    case 'action_required': return 'blocked';
    default: return 'unknown';
  }
}

// Which channel a run belongs to. Order: explicit inputs.channel (not in the
// list API today, but harmless) → the run-name convention "<channel> · <event>"
// (first segment) → the whole title equal to a known slug/label. No fuzzy
// text search: a wrong channel is worse than an honest null.
// `channels` = [{ slug, label }] from the registry/brands data.
export function deriveChannel(run, channels = []) {
  const known = Array.isArray(channels) ? channels : [];
  const resolve = (raw) => {
    const v = String(raw || '').trim();
    if (!v || NOT_A_CHANNEL.has(v.toLowerCase())) return null;
    const hit = known.find((c) => c && (c.slug === v || String(c.label || '').toLowerCase() === v.toLowerCase()));
    if (hit) return hit.slug;
    // registry unreadable → still trust a slug-shaped run-name segment
    if (!known.length && /^[a-z0-9][a-z0-9-]*$/.test(v)) return v;
    return null;
  };
  const input = run?.inputs?.channel;
  if (input) return resolve(input);
  const title = String(run?.display_title || '').trim();
  if (title.includes(' · ')) {
    const seg = resolve(title.split(' · ')[0]);
    if (seg) return seg;
  }
  return resolve(title);
}

// Raw GitHub run → the row the panel renders. durationSec only for finished
// runs (a running run's duration is computed live against "now").
export function mapRun(run, channels = []) {
  const status = run?.status || null;
  const conclusion = run?.conclusion || null;
  const state = runState(status, conclusion);
  const startedAt = run?.run_started_at || run?.created_at || null;
  const start = toMs(startedAt);
  const end = toMs(run?.updated_at);
  const durationSec = status === 'completed' && start != null && end != null && end >= start
    ? Math.round((end - start) / 1000)
    : null;
  return {
    id: run?.id ?? null,
    workflow: workflowFile(run?.path),
    name: run?.name || '',
    title: run?.display_title || '',
    channel: deriveChannel(run, channels),
    status,
    conclusion,
    state,
    event: run?.event || '',
    createdAt: run?.created_at || null,
    startedAt,
    updatedAt: run?.updated_at || null,
    durationSec,
    url: run?.html_url || null,
  };
}

// Merge several raw run lists (one per workflow), map, drop duplicates and
// non-production workflows, newest first.
export function mapRuns(rawLists, channels = [], workflows = PRODUCTION_WORKFLOWS) {
  const allow = new Set(workflows);
  const seen = new Set();
  const out = [];
  for (const list of rawLists || []) {
    for (const r of list || []) {
      if (r?.id == null || seen.has(r.id)) continue;
      if (!allow.has(workflowFile(r.path))) continue;
      seen.add(r.id);
      out.push(mapRun(r, channels));
    }
  }
  return out.sort((a, b) => (toMs(b.createdAt) || 0) - (toMs(a.createdAt) || 0));
}

// Rows → [{ channel, runs }] in first-seen order (rows arrive newest first);
// untagged runs collect under channel: null, always last.
export function groupByChannel(rows) {
  const map = new Map();
  for (const r of rows || []) {
    const k = r.channel || null;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  const groups = [...map.entries()].map(([channel, runs]) => ({ channel, runs }));
  return [...groups.filter((g) => g.channel), ...groups.filter((g) => !g.channel)];
}

/* ------------------------------ time + labels ------------------------------ */

// YYYY-MM-DD of an instant in the viewer's time zone.
export function dayKey(iso, timeZone) {
  const t = toMs(iso);
  if (t == null) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);
}

export function clock(iso, timeZone) {
  const t = toMs(iso);
  if (t == null) return '—';
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t);
}

// "19 Nov 02:39" — the Started column.
export function stamp(iso, timeZone) {
  const t = toMs(iso);
  if (t == null) return '—';
  const day = new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'short' }).format(t);
  return `${day} ${clock(iso, timeZone)}`;
}

// 42 → "42s", 260 → "4m 20s", 3900 → "1h 5m"
export function fmtDuration(sec) {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '—';
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

// Duration cell: finished runs show their real duration, live runs tick
// against "now", queued/unknown show "—".
export function durationText(row, now = Date.now()) {
  if (row?.durationSec != null) return fmtDuration(row.durationSec);
  if (row?.state === 'running') {
    const t = toMs(row.startedAt || row.createdAt);
    return t == null ? '—' : fmtDuration(Math.max(0, (now - t) / 1000));
  }
  return '—';
}

// Elapsed whole minutes for a live run ("Running for 4m"); under a minute = "<1m".
function elapsed(startIso, nowMs) {
  const t = toMs(startIso);
  if (t == null) return '';
  const min = Math.floor(Math.max(0, nowMs - t) / 60000);
  if (min < 1) return '<1m';
  return min < 60 ? `${min}m` : `${Math.floor(min / 60)}h ${min % 60}m`;
}

// The plain-English status line for one run.
export function runLabel(row, { now = Date.now(), timeZone } = {}) {
  const at = clock(row?.updatedAt, timeZone);
  switch (row?.state) {
    case 'ok': return `Succeeded ${at}`;
    case 'failed': return `Failed at ${at}`;
    case 'running': return `Running for ${elapsed(row.startedAt || row.createdAt, now)}`;
    case 'queued': return `Queued since ${clock(row.createdAt, timeZone)}`;
    case 'cancelled': return `Cancelled ${at}`;
    case 'skipped': return `Skipped ${at}`;
    case 'blocked': return 'Waiting for approval on GitHub';
    default: return 'Status unknown';
  }
}

// Chip tone per state — status is always icon/word + colour, never colour alone.
export function stateTone(state) {
  return { ok: 'ok', failed: 'bad', running: 'info', queued: 'info', blocked: 'warn', cancelled: 'plain', skipped: 'plain' }[state] || 'plain';
}

export const STATE_WORD = Object.freeze({
  ok: 'Succeeded', failed: 'Failed', running: 'Running', queued: 'Queued',
  cancelled: 'Cancelled', skipped: 'Skipped', blocked: 'Needs approval', unknown: 'Unknown',
});

/* ------------------------------ today summary ------------------------------ */

// One entry per channel (from DATA — the registry/brands list) plus any channel
// that only appears in the runs, and one `scheduler` entry for untagged runs.
//   status: 'running' (any live run today wins) | 'ok' | 'failed' (latest
//   finished run today decides — a retry that succeeded reads ok) | 'other'
//   (latest was cancelled/skipped/blocked) | 'none' (no run today).
// coveredSince: the oldest run time the API returned when a page was FULL —
// if that is today, "not run today" can't be claimed, only "no run seen since".
export function todaySummary(rows, channels = [], { now = Date.now(), timeZone, coveredSince = null } = {}) {
  const today = dayKey(new Date(now).toISOString(), timeZone);
  const todays = (rows || []).filter((r) => dayKey(r.createdAt, timeZone) === today);
  const untagged = todays.filter((r) => !r.channel);
  const partial = coveredSince && dayKey(coveredSince, timeZone) === today;

  const summarize = (runs, channel) => {
    const live = runs.find((r) => r.state === 'running' || r.state === 'queued');
    if (live) return { channel, status: 'running', run: live, label: runLabel(live, { now, timeZone }), count: runs.length };
    const done = runs[0]; // newest first
    if (!done) {
      let label = 'Not run today';
      if (partial) label = `No run seen since ${clock(coveredSince, timeZone)}`;
      else if (channel && untagged.length) label = 'No channel-tagged run today';
      return { channel, status: 'none', run: null, label, count: 0 };
    }
    const status = done.state === 'ok' ? 'ok' : done.state === 'failed' ? 'failed' : 'other';
    return { channel, status, run: done, label: runLabel(done, { now, timeZone }), count: runs.length };
  };

  const order = [];
  for (const c of channels || []) if (c?.slug && !order.includes(c.slug)) order.push(c.slug);
  for (const r of todays) if (r.channel && !order.includes(r.channel)) order.push(r.channel);
  const sorted = (list) => list.slice().sort((a, b) => (toMs(b.createdAt) || 0) - (toMs(a.createdAt) || 0));

  return {
    channels: order.map((slug) => summarize(sorted(todays.filter((r) => r.channel === slug)), slug)),
    scheduler: summarize(sorted(untagged), null),
    untaggedToday: untagged.length,
    partial: Boolean(partial),
  };
}

// Timeline filter: channel ('all' | slug | 'untagged') × status ('all' | state group).
export function filterRuns(rows, { channel = 'all', status = 'all' } = {}) {
  return (rows || []).filter((r) => {
    if (channel === 'untagged' ? r.channel : channel !== 'all' && r.channel !== channel) return false;
    if (status === 'all') return true;
    if (status === 'running') return r.state === 'running' || r.state === 'queued';
    if (status === 'other') return !['ok', 'failed', 'running', 'queued'].includes(r.state);
    return r.state === status;
  });
}
