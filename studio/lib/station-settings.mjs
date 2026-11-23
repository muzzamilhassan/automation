// Creator City — Station drawer (research §5 item 7, 2026-11-23). Click a
// station → that station's settings in ONE place + its last 5 results, for
// one channel. PURE module (relative imports only — it ships in the client
// bundle and node --test loads it: tests/station-settings.test.mjs).
//
// Nothing here is a new setting. Every station points at what already exists:
//   panel    embed the SAME manage panel ChannelDrawers uses (frame prop)
//   facts    a compact summary read from the live APIs the panels read
//            (profile = GET /api/channels/profile, templates = GET /api/templates?channel=)
//   actions  manage → open the existing Manage drawer (CHANNEL_DRAWERS key)
//            link   → another page (/topics, /review)
//            edit   → Edit channel (channel-health editHref)
//
// History: GET /api/stations/history rows (job_steps `station:<key>`, see
// jobs-read.mjs loadStationHistory) → the drawer's "Last 5" list.
import { STATIONS, STATION_KEYS, STATE_WORD, STATE_TONE } from './stations.mjs';
import { mapSteps, toIso } from './station-read.mjs';
import { assignmentSummary } from './templates-gallery.mjs';
import { storyModeOf } from './channel-kit-ui.mjs';
import { fmtDuration } from './runs-view.mjs';

export const HISTORY_LIMIT = 5;

const LABEL = Object.fromEntries(STATIONS.map((s) => [s.key, s.label]));
const has = (obj, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(obj, k);

const facts = (...keys) => ({ kind: 'facts', keys });
const actions = (...items) => ({ kind: 'actions', items });
const manage = (drawer, label) => ({ type: 'manage', drawer, label });
const link = (href, label) => ({ type: 'link', href, label });
const EDIT = { type: 'edit', label: 'Edit channel' };

// station key → where its settings already live. manageSection = the main
// Manage drawer for the station (null = no drawer; topic lives on /topics).
const MAP = {
  topic: { sections: [facts('niche'), actions(link('/topics', 'Topics desk'), EDIT)], manageSection: null },
  script: { sections: [facts('storyShape'), actions(manage('routing', 'AI routing'), manage('templates', 'Story shape'))], manageSection: 'routing' },
  approval: { sections: [facts('reviewGate'), actions(link('/review', 'Review desk'), manage('templates', 'Template'))], manageSection: 'templates' },
  voice: { sections: [{ kind: 'panel', drawer: 'voice' }], manageSection: 'voice' },
  render: { sections: [facts('template'), actions(manage('templates', 'Template'))], manageSection: 'templates' },
  thumbnail: { sections: [facts('thumbs'), actions(manage('thumbnails', 'Designs'))], manageSection: 'thumbnails' },
  upload: { sections: [{ kind: 'panel', drawer: 'schedule' }], manageSection: 'schedule' },
};

export const STATION_SETTINGS = Object.freeze(Object.fromEntries(
  STATION_KEYS.map((key) => [key, Object.freeze({ key, title: LABEL[key], ...MAP[key] })]),
));

/** 'voice' → { key, title, sections, manageSection }; unknown → null. */
export function settingsFor(key) {
  return has(STATION_SETTINGS, key) ? STATION_SETTINGS[key] : null;
}

const SOURCE_OF = { niche: 'profile', storyShape: 'profile', thumbs: 'profile', template: 'templates', reviewGate: 'templates' };

/** The live sources a station's facts need: ['profile'] | ['templates'] | []. */
export function factSources(key) {
  const s = settingsFor(key);
  if (!s) return [];
  const keys = s.sections.filter((x) => x.kind === 'facts').flatMap((x) => x.keys);
  return [...new Set(keys.map((k) => SOURCE_OF[k]).filter(Boolean))];
}

// The API an embedded panel reads (VoicePanel → profile, SchedulePanel →
// schedule). The drawer probes it first, so a role the API refuses sees a
// calm "Owner only" line instead of the panel's red load error.
const PANEL_SOURCE = { voice: 'profile', schedule: 'schedule' };

/** The live sources a station's embedded panels read: ['profile'] | ['schedule'] | []. */
export function panelSources(key) {
  const s = settingsFor(key);
  if (!s) return [];
  return [...new Set(s.sections.filter((x) => x.kind === 'panel').map((x) => PANEL_SOURCE[x.drawer]).filter(Boolean))];
}

/** The source an embedded panel (ChannelDrawers key) reads, or null. */
export const panelSourceOf = (drawer) => (has(PANEL_SOURCE, drawer) ? PANEL_SOURCE[drawer] : null);

/**
 * One fetch answer → a source state. 401/403 = this role may not read it
 * ('denied', shown as a neutral "Owner only"); any other failure = 'error'
 * (shown red with Retry); 2xx = 'ok' with its body.
 */
export function sourceState(httpStatus, body) {
  const n = Number(httpStatus);
  if (n === 401 || n === 403) return { status: 'denied' };
  if (n >= 200 && n < 300) return { status: 'ok', data: body };
  return { status: 'error' };
}

/** Can an embedded panel mount? loading (wait) · denied ("Owner only") · ok (the panel handles its own errors + Retry). */
export function panelAccess(source) {
  if (!source || source.status === 'loading') return 'loading';
  return source.status === 'denied' ? 'denied' : 'ok';
}

/** Did any fact source of this station really fail (not denied)? → the drawer offers Retry. */
export function factsFailed(key, sources = {}) {
  return factSources(key).some((src) => {
    const got = sources[src];
    if (!got || got.status === 'loading' || got.status === 'denied') return false;
    if (got.status !== 'ok') return true;
    return src === 'profile' ? !(got.data?.channel && typeof got.data.channel === 'object') : !Array.isArray(got.data?.assignments);
  });
}

export const OWNER_ONLY = 'Owner only';

/* --------------------------------------------------------------- facts */

const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const LOAD_FAIL = 'Couldn’t load';
const STORY_WORD = { default: 'Template default', story: 'Full story', chapters: 'Chapters' };

/**
 * The review gate exactly as the engine decides it (lib/review-gate.mjs, D15):
 * the ASSIGNED template's safety.review_required list. No assignment → legacy,
 * runs ungated; an assignment the registry cannot resolve → held (fail-closed).
 * @returns {{ asks: boolean, why: 'no_template'|'template_missing'|'template', reasons: string[] }}
 */
export function reviewGateOf({ assignments, templates } = {}) {
  const list = arr(assignments).filter((a) => a && str(a.family_id));
  if (!list.length) return { asks: false, why: 'no_template', reasons: [] };
  const byId = new Map(arr(templates).filter(Boolean).map((t) => [t.templateId, t]));
  const reasons = [];
  for (const a of list) {
    const t = byId.get(a.family_id);
    if (!t) return { asks: true, why: 'template_missing', reasons: [] };
    reasons.push(...arr(t.registry?.safety?.review_required).filter((r) => typeof r === 'string' && r));
  }
  const uniq = [...new Set(reasons)];
  return { asks: uniq.length > 0, why: 'template', reasons: uniq };
}

function profileFacts(keys, channel) {
  const kit = channel.kit && typeof channel.kit === 'object' ? channel.kit : {};
  const out = [];
  for (const k of keys) {
    if (k === 'niche') {
      const niche = str(channel.niche);
      out.push(niche ? { label: 'Niche', value: niche } : { label: 'Niche', value: 'Not set', tone: 'warn' });
      const subs = arr(kit.niches).map(str).filter((n) => n && n !== niche);
      if (subs.length) out.push({ label: 'Sub-niches', value: subs.join(' · ') });
    } else if (k === 'storyShape') {
      const mode = storyModeOf(kit);
      out.push(STORY_WORD[mode] ? { label: 'Story shape', value: STORY_WORD[mode] } : { label: 'Story shape', value: 'Not picked', tone: 'warn' });
    } else if (k === 'thumbs') {
      const n = arr(kit.thumbTemplates).length;
      out.push({ label: 'Designs', value: n ? `${n} take turns` : 'Automatic' });
    }
  }
  return out;
}

function templateFacts(keys, body) {
  const assignments = arr(body.assignments);
  const templates = arr(body.templates);
  const out = [];
  for (const k of keys) {
    if (k === 'template') {
      const a = assignments.find((x) => x && str(x.family_id));
      if (!a) out.push({ label: 'Template', value: 'None assigned', tone: 'warn' });
      else {
        const s = assignmentSummary(a, templates.find((t) => t?.templateId === a.family_id));
        out.push({ label: 'Template', value: s.version ? `${s.name} · v${s.version}` : s.name, ...(s.missing ? { tone: 'warn' } : {}) });
      }
    } else if (k === 'reviewGate') {
      const g = reviewGateOf({ assignments, templates });
      const value = g.why === 'no_template' ? 'No · no template'
        : g.why === 'template_missing' ? 'Yes · template not found'
          : g.asks ? `Yes · ${g.reasons.join(', ')}` : 'No';
      out.push({ label: 'Asks you first', value, ...(g.why === 'template_missing' ? { tone: 'warn' } : {}) });
    }
  }
  return out;
}

const LABEL_OF_SOURCE = { profile: 'Channel settings', templates: 'Template' };

/**
 * One station's facts from the live sources. Each source is
 * { status: 'loading' } | { status: 'error' } | { status: 'denied' } | { status: 'ok', data: <body> }.
 * value null = still loading; a failed or malformed source says so.
 * { status: 'denied' } (401/403) → a neutral "Owner only" (tone 'muted').
 * @returns {{ label: string, value: string|null, tone?: 'warn'|'bad'|'muted' }[]}
 */
export function stationFacts(key, sources = {}) {
  const s = settingsFor(key);
  if (!s) return [];
  const keys = s.sections.filter((x) => x.kind === 'facts').flatMap((x) => x.keys);
  const out = [];
  for (const source of factSources(key)) {
    const mine = keys.filter((k) => SOURCE_OF[k] === source);
    const got = sources[source];
    if (!got || got.status === 'loading') {
      out.push({ label: LABEL_OF_SOURCE[source], value: null });
      continue;
    }
    if (got.status === 'denied') {
      out.push({ label: LABEL_OF_SOURCE[source], value: OWNER_ONLY, tone: 'muted' });
      continue;
    }
    const body = got.status === 'ok' ? got.data : null;
    if (source === 'profile' && body?.channel && typeof body.channel === 'object') out.push(...profileFacts(mine, body.channel));
    else if (source === 'templates' && body && Array.isArray(body.assignments)) out.push(...templateFacts(mine, body));
    else out.push({ label: LABEL_OF_SOURCE[source], value: LOAD_FAIL, tone: 'bad' });
  }
  return out;
}

/* ------------------------------------------------------------- history */

const heldError = (row) => row?.status === 'skipped' && typeof row.error === 'string' && row.error.startsWith('held:');
const autoError = (row) => row?.status === 'skipped' && typeof row.error === 'string' && row.error.startsWith('auto:');
const rowMs = (iso) => {
  const t = Date.parse(iso || '');
  return Number.isFinite(t) ? t : 0;
};

/**
 * job_steps rows of ONE station (jobs-read loadStationHistory) → the "Last 5"
 * rows, newest first: { jobId, state, startedAt, durationSec, error, note }.
 * A review hold reads "Needs you" only on the NEWEST row — an older hold was
 * overtaken by a later run, so it reads Skipped "Held for your OK".
 */
export function historyRows(rows, { now = Date.now(), limit = HISTORY_LIMIT } = {}) {
  const list = arr(rows).filter((r) => r && typeof r === 'object' && typeof r.name === 'string');
  const shaped = list.map((r) => {
    const [step] = mapSteps([r], { now });
    // held/auto-skipped steps are marked without a start time: fall back to
    // when they finished, then to the job's start (the query selects it)
    const at = step.startedAt || step.finishedAt || toIso(r.job_started_at);
    return { raw: r, step, at };
  });
  shaped.sort((a, b) => rowMs(b.at) - rowMs(a.at));
  return shaped.slice(0, limit).map(({ raw, step, at }, i) => {
    let state = step.state;
    let note = null;
    let error = step.error;
    if (heldError(raw)) {
      error = null;
      if (i === 0) note = 'Waiting for your OK';
      else { state = 'skipped'; note = 'Held for your OK'; }
    } else if (autoError(raw)) {
      error = null;
      note = 'No approval needed';
    }
    return { jobId: raw.job_id == null ? null : String(raw.job_id), state, startedAt: at, durationSec: step.durationSec, error, note };
  });
}

/** /api/stations/history body → { kind: ok|empty|error, rows } for the drawer. */
export function historyView(body) {
  if (!body || body.ok !== true || !Array.isArray(body.rows)) return { kind: 'error', rows: [] };
  const rows = body.rows.filter((r) => r && typeof r === 'object').map((r, i) => {
    const state = has(STATE_WORD, r.state) ? r.state : 'unknown';
    return {
      id: `${r.jobId || 'row'}-${i}`,
      state,
      word: STATE_WORD[state],
      tone: STATE_TONE[state] || 'plain',
      at: typeof r.startedAt === 'string' ? r.startedAt : null,
      duration: r.durationSec == null ? '' : fmtDuration(r.durationSec),
      error: typeof r.error === 'string' && r.error ? r.error : null,
      note: typeof r.note === 'string' && r.note ? r.note : null,
    };
  });
  return rows.length ? { kind: 'ok', rows } : { kind: 'empty', rows: [] };
}

/** The history API URL for one channel + station, or null when either is unusable. */
export function historyUrl(channel, station) {
  if (typeof channel !== 'string' || !channel || !STATION_KEYS.includes(station)) return null;
  return `/api/stations/history?channel=${encodeURIComponent(channel)}&station=${encodeURIComponent(station)}`;
}

// Same slug rule as station-read.mjs parseStepsQuery.
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

/** /api/stations/history query → { ok, channel, station } or { ok:false, reason }. */
export function parseHistoryQuery(params) {
  const get = (k) => {
    const v = params?.get?.(k);
    return v == null || v === '' ? null : String(v);
  };
  const channel = get('channel');
  const station = get('station');
  if (!channel) return { ok: false, reason: 'channel_required' };
  if (!station) return { ok: false, reason: 'station_required' };
  if (!SLUG_RE.test(channel)) return { ok: false, reason: 'bad_channel' };
  if (!STATION_KEYS.includes(station)) return { ok: false, reason: 'bad_station' };
  return { ok: true, channel, station };
}
