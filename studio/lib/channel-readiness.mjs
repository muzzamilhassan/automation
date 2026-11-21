// "100% ready before anything publishes" (owner, 2026-11-21, FEEDBACK item K).
// A channel publishes only when the owner has set all 7 things in the panel.
// ONE pure answer, shared by the engine and the panel:
//   engine — lib/schedule-slot.mjs toDiscoverChannels (the autopilot's
//            discover step), lib/readiness-gate.mjs (channel-pipeline.mjs,
//            sweeper.mjs, longvideo/longform-upload.mjs)
//   panel  — /api/channels/readiness (chips + checklist), the flow route
//            (Resume answers 409 while not ready), the profile route
//            (Save & start keeps the autopilot off while not ready)
// Inputs are the data the ENGINE runs on: the registry entry
// (yt-mcp/studio-channels.json — Neon is mirrored into it on every panel
// save), its kit, and the channel's cadence row (yt-mcp/cadence.json). The
// static brand files (yt-brands/brands.mjs, lib/brands.json) never count.
//
// Pure: no imports (Studio deploys without the repo root; the engine imports
// this file by relative path). Never throws — anything unreadable is "not
// ready" (fail closed). No per-channel names: every rule is data-driven.
// Spec + QA: docs/qa/channel-readiness-qa.md.

export const READINESS_TOTAL = 7;
export const READINESS_KEYS = Object.freeze(['youtube', 'template', 'storyShape', 'details', 'voice', 'thumbnails', 'schedule']);
export const STORY_SHAPES = Object.freeze(['template', 'full', 'chapters']);
export const THUMBS_MIN = 2;
export const THUMBS_MAX = 5;

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HHMM_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const DAILY_CRON_RE = /^(\d{1,2}) (\d{1,2}) \* \* \*$/;

const LABEL = {
  youtube: 'YouTube connected',
  template: 'Video template picked',
  storyShape: 'Story shape chosen',
  details: 'Niche, description and tags',
  voice: 'Voice chosen',
  thumbnails: 'Thumbnail designs (2–5)',
  schedule: 'Full schedule',
};

// Where each item is fixed. Drawer places open the channel's drawer; page
// places link to a page (href).
const PLACE = {
  youtube: 'connect',
  template: 'templates',
  storyShape: 'templates',
  details: 'edit',
  voice: 'edit',
  thumbnails: 'thumbnails',
  schedule: 'schedule',
};

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v) => (typeof v === 'string' ? v.trim() : '');
const filled = (v) => text(v) !== '';

// "a, b and c"
function joinAnd(parts) {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function validDailyCron(cron) {
  const m = DAILY_CRON_RE.exec(text(cron));
  return Boolean(m) && Number(m[1]) <= 59 && Number(m[2]) <= 23;
}

// The engine (lib/brand-resolve.mjs parseKeywords) keeps quoted phrases and
// words longer than 2 letters from the channel's YouTube keywords.
function keywordsGiveTags(raw) {
  const s = text(raw);
  if (!s) return false;
  if (/"[^"]+"/.test(s)) return true;
  return s.replace(/"[^"]+"/g, ' ').split(/[,\s]+/).some((w) => w.length > 2);
}

// The Shorts go-public times the engine uses: a non-empty top-level list
// wins, else kit.slots (lib/brand-resolve.mjs registryToKit order).
function effectiveSlots(entry, kit) {
  if (Array.isArray(entry.slots) && entry.slots.length) return entry.slots;
  return Array.isArray(kit.slots) ? kit.slots : [];
}

/** UI + engine: which story shape the kit holds ('template' | 'full' | 'chapters'), null = not chosen. */
export function storyShapeOfKit(kit) {
  if (!isObj(kit)) return null;
  if (kit.hasChapters === true) return 'chapters';
  if (kit.hasChapters === false) return 'full';
  return kit.storyShape === 'template' ? 'template' : null;
}

/** The engine-facing value (kit.hasChapters) for a story shape: true | false | null (template default). */
export function hasChaptersForShape(shape) {
  if (shape === 'chapters') return true;
  if (shape === 'full') return false;
  return null;
}

/** Server validation for kit.storyShape → { ok, value } | { ok: false, error }. */
export function parseStoryShape(value) {
  if (STORY_SHAPES.includes(value)) return { ok: true, value };
  return { ok: false, error: 'storyShape must be "template", "full" or "chapters"' };
}

function editHref(slug) {
  return `/channels/add?edit=${encodeURIComponent(slug)}`;
}

function makeItem(key, ok, fix, slug) {
  const place = PLACE[key];
  const href = place === 'edit' ? (slug ? editHref(slug) : null) : place === 'connect' ? '/channels/add' : null;
  return { key, label: LABEL[key], ok: Boolean(ok), fix: ok ? '' : fix, place, href };
}

function evaluate(entry, schedule, assignment, hasAssignmentArg) {
  const slug = entry.slug;
  const kit = isObj(entry.kit) ? entry.kit : {};
  const items = [];

  // 1. YouTube connected — the key is saved (GitHub secret / Neon)
  items.push(makeItem('youtube', entry.tokenSecretSaved === true, 'Connect YouTube — Add channel › Connect', slug));

  // 2. Template assigned — the registry mirror of the Neon assignment
  const assigned = hasAssignmentArg
    ? (isObj(assignment) ? text(assignment.templateId) || text(assignment.family_id) : '')
    : text(kit.templateId);
  items.push(makeItem('template', assigned !== '', 'Pick a template — Channel › Templates', slug));

  // 3. Story shape chosen — hasChapters as the engine reads it, or an
  //    explicit "Template default"
  const shaped = typeof kit.hasChapters === 'boolean' || kit.storyShape === 'template';
  items.push(makeItem('storyShape', shaped, 'Pick a story shape — Channel › Templates', slug));

  // 4. Niche, description and tags
  const niche = filled(entry.niche) || filled(kit.niche);
  const description = filled(kit.description) || filled(entry.ytDescription);
  const tags = (Array.isArray(kit.tags) && kit.tags.some(filled)) || keywordsGiveTags(entry.ytKeywords);
  const needs = [!niche && 'a niche', !description && 'a description', !tags && 'tags'].filter(Boolean);
  items.push(makeItem('details', needs.length === 0, `Add ${joinAnd(needs)} — Edit profile`, slug));

  // 5. Voice chosen
  items.push(makeItem('voice', filled(entry.voice) || filled(kit.voice), 'Pick a voice — Edit profile', slug));

  // 6. Thumbnail designs: 2–5 distinct
  const thumbs = Array.isArray(kit.thumbTemplates) ? new Set(kit.thumbTemplates.filter(filled).map(text)).size : 0;
  const tooMany = thumbs > THUMBS_MAX;
  items.push(makeItem(
    'thumbnails',
    thumbs >= THUMBS_MIN && !tooMany,
    tooMany ? `Keep ${THUMBS_MAX} or fewer thumbnail designs — Channel › Thumbnails` : `Pick ${THUMBS_MIN} to ${THUMBS_MAX} thumbnail designs — Channel › Thumbnails`,
    slug,
  ));

  // 7. Schedule: an upload day, Shorts time, long-video time, start time
  const row = isObj(schedule) ? schedule : {};
  const days = [...(Array.isArray(row.docDays) ? row.docDays : []), ...(Array.isArray(row.shortDays) ? row.shortDays : [])];
  const hasDay = days.some((d) => DAY_NAMES.includes(d));
  const slots = effectiveSlots(entry, kit);
  const hasShorts = slots.length > 0 && slots.every((s) => HHMM_RE.test(text(s)));
  const hasLong = HHMM_RE.test(text(kit.longSlot));
  const hasStart = validDailyCron(entry.cron) || validDailyCron(kit.gateCron);
  const gaps = [
    !hasDay && 'upload days',
    !hasShorts && 'the Shorts go-public time',
    !hasLong && 'the long-video go-public time',
    !hasStart && 'the autopilot start time',
  ].filter(Boolean);
  items.push(makeItem('schedule', gaps.length === 0, `Set ${joinAnd(gaps)} — Channel › Schedule`, slug));

  return items;
}

function result(items) {
  const done = items.filter((i) => i.ok).length;
  return { ready: done === READINESS_TOTAL, done, total: READINESS_TOTAL, items };
}

// Every item missing — the fail-closed answer for an unreadable entry.
function closed(slug) {
  const s = typeof slug === 'string' ? slug : '';
  return result(READINESS_KEYS.map((key) => makeItem(key, false, failFix(key), s)));
}
function failFix(key) {
  return {
    youtube: 'Connect YouTube — Add channel › Connect',
    template: 'Pick a template — Channel › Templates',
    storyShape: 'Pick a story shape — Channel › Templates',
    details: 'Add a niche, a description and tags — Edit profile',
    voice: 'Pick a voice — Edit profile',
    thumbnails: `Pick ${THUMBS_MIN} to ${THUMBS_MAX} thumbnail designs — Channel › Thumbnails`,
    schedule: 'Set upload days, the Shorts go-public time, the long-video go-public time and the autopilot start time — Channel › Schedule',
  }[key];
}

/**
 * Is this channel 100% set up in the panel?
 * @param {object} p
 * @param {object} p.entry      registry entry (yt-mcp/studio-channels.json shape)
 * @param {object} [p.schedule] the cadence row ({ docDays, shortDays }) from yt-mcp/cadence.json
 * @param {object|null} [p.assignment] optional authoritative assignment ({ templateId } or a DB row
 *        { family_id }); null = none. Omitted = read the registry mirror kit.templateId (what the engine sees).
 * @returns {{ ready: boolean, done: number, total: 7, items: Array<{ key, label, ok, fix, place, href }> }}
 */
export function channelReadiness(p = {}) {
  try {
    const args = isObj(p) ? p : {};
    const entry = args.entry;
    if (!isObj(entry) || typeof entry.slug !== 'string' || !entry.slug.trim()) return closed('');
    const hasAssignmentArg = Object.prototype.hasOwnProperty.call(args, 'assignment') && args.assignment !== undefined;
    return result(evaluate(entry, args.schedule, args.assignment, hasAssignmentArg));
  } catch {
    let slug = '';
    try { slug = p?.entry?.slug; } catch { slug = ''; }
    return closed(slug);
  }
}

/** The same answer straight from the engine files: registry ({ channels }) + cadence ({ [slug]: row }). */
export function readinessFor({ registry, cadence, slug } = {}) {
  try {
    const channels = isObj(registry) && Array.isArray(registry.channels) ? registry.channels : null;
    const entry = channels ? channels.find((c) => isObj(c) && c.slug === slug) : null;
    if (!entry || !isObj(cadence)) return closed(slug);
    return channelReadiness({ entry, schedule: cadence[slug] || null });
  } catch {
    return closed(slug);
  }
}

/** Labels of the items still missing, in checklist order. */
export function missingLabels(r) {
  return (r && Array.isArray(r.items) ? r.items : []).filter((i) => !i.ok).map((i) => i.label);
}

/** The engine's one log line for a channel. */
export function readinessLine(slug, r) {
  const done = Number.isInteger(r?.done) ? r.done : 0;
  if (r?.ready) return `[readiness] ${slug}: ready to publish (${done}/${READINESS_TOTAL})`;
  return `[readiness] ${slug}: NOT READY to publish (${done}/${READINESS_TOTAL}) — missing: ${missingLabels(r).join('; ') || 'unknown'} — skipped (finish it in the panel)`;
}
