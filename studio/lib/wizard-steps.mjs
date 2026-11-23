// Add Channel wizard — pure step logic (no React, no DOM, relative imports
// only) so node --test pins it: tests/wizard-rebuild.test.mjs.
//
// The wizard stores exactly what the profile API already accepts: short slots
// are UTC "HH:MM" strings (comma list), docDay is one of Mon–Fri. The owner
// SEES local time; these helpers do the conversion both ways.
import { parseVoiceProfile, MOOD_LABEL } from './human-voice.mjs';
import { emotionalOf, EXPRESSION_LABEL } from './emotional-voice.mjs';

export const STEPS = [
  { id: 'connect', label: 'Connect', hint: 'Google login' },
  { id: 'identity', label: 'Identity', hint: 'Name, niche, pillars' },
  { id: 'look', label: 'Look & sound', hint: 'Style, voice, colour' },
  { id: 'thumbnails', label: 'Thumbnails', hint: 'Branding on covers', optional: true },
  { id: 'schedule', label: 'Schedule', hint: 'When videos go out' },
  { id: 'destinations', label: 'Destinations', hint: 'Other platforms', optional: true },
  { id: 'review', label: 'Review & start', hint: 'Check and go live' },
];

export const STEP_INDEX = Object.fromEntries(STEPS.map((s, i) => [s.id, i]));

// The profile route accepts Mon–Fri for the weekly episode (it coerces
// anything else back to the saved day), so the picker offers exactly those.
export const DOC_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export const MAX_SLOTS = 6; // the route keeps the first 6

// The profile route keeps the first 60 characters of a name (wave B4, T4-15).
export const NAME_MAX = 60;
// Auto-built eyebrows ("NICHE // NAME") fit a thumbnail label (T4-16).
export const EYEBROW_MAX = 60;

// One empty form, used for the first render AND "Connect another channel"
// (the old reset object forgot subNiches and crashed the next save).
export const EMPTY_FORM = Object.freeze({
  label: '', niche: '', subNiches: '', style: 'cinematic', voice: 'am_michael', accent: '#38BDF8', slots: '22:35',
  docDay: 'Tue', eyebrow: '', tagline: '', tags: '', description: '',
  fbPageId: '', igHandle: '', threadsHandle: '', tiktokHandle: '',
});

/* ------------------------------- time maths ------------------------------- */

const HHMM_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

// "9:05" → "09:05"; anything unreadable → null.
export function normalizeHHMM(s) {
  const m = HHMM_RE.exec(String(s ?? '').trim());
  if (!m) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

// Shift a clock time by N minutes; reports when it crosses midnight so the
// UI can say "next day" / "previous day" honestly.
export function shiftHHMM(hhmm, minutes) {
  const n = normalizeHHMM(hhmm);
  if (n == null) return null;
  const [h, m] = n.split(':').map(Number);
  const total = h * 60 + m + Math.round(Number(minutes) || 0);
  const dayShift = Math.floor(total / 1440);
  const within = ((total % 1440) + 1440) % 1440;
  const time = `${String(Math.floor(within / 60)).padStart(2, '0')}:${String(within % 60).padStart(2, '0')}`;
  return { time, dayShift };
}

// offsetMin = minutes the owner's clock is AHEAD of UTC
// (= -new Date().getTimezoneOffset(); Karachi = +300, New York winter = -300).
export function utcToLocal(utcHHMM, offsetMin) {
  return shiftHHMM(utcHHMM, offsetMin);
}

export function localToUtc(localHHMM, offsetMin) {
  return shiftHHMM(localHHMM, -(Number(offsetMin) || 0));
}

// "19:05" → "7:05 pm" (the owner reads 12-hour clocks).
export function formatClock(hhmm) {
  const n = normalizeHHMM(hhmm);
  if (n == null) return String(hhmm ?? '');
  const [h, m] = n.split(':').map(Number);
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

// "+05:00" style label for an offset in minutes.
export function formatOffset(offsetMin) {
  const o = Math.round(Number(offsetMin) || 0);
  const sign = o < 0 ? '-' : '+';
  const a = Math.abs(o);
  return `UTC${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

/* ---------------------------------- slots --------------------------------- */

// The saved comma list → rows. Unreadable entries are KEPT (utc: null) so the
// owner sees and fixes them instead of the wizard silently dropping data.
export function parseSlots(str) {
  return String(str ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((raw) => ({ raw, utc: normalizeHHMM(raw) }));
}

export function slotsToString(list) {
  return (Array.isArray(list) ? list : []).map((s) => String(s).trim()).filter(Boolean).join(', ');
}

// Replace the slot at `index` with a LOCAL time typed by the owner.
export function setSlotFromLocal(slotsStr, index, localHHMM, offsetMin) {
  const rows = parseSlots(slotsStr).map((r) => r.utc ?? r.raw);
  const conv = localToUtc(localHHMM, offsetMin);
  if (!conv) return slotsStr;
  rows[index] = conv.time;
  return slotsToString(rows);
}

export function removeSlot(slotsStr, index) {
  const rows = parseSlots(slotsStr).map((r) => r.utc ?? r.raw);
  rows.splice(index, 1);
  return slotsToString(rows);
}

export function addSlot(slotsStr, utcHHMM = '22:35') {
  const rows = parseSlots(slotsStr).map((r) => r.utc ?? r.raw);
  if (rows.length >= MAX_SLOTS) return slotsStr;
  rows.push(utcHHMM);
  return slotsToString(rows);
}

/* ------------------------------ sub-niches -------------------------------- */

export function subNicheList(str) {
  return String(str ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// Toggle one content pillar in the comma list (case-insensitive).
export function togglePillar(str, pillar) {
  const list = subNicheList(str);
  const p = String(pillar).trim().toLowerCase();
  if (!p) return list.join(', ');
  return (list.includes(p) ? list.filter((x) => x !== p) : [...list, p]).join(', ');
}

/* ------------------------------ destinations ------------------------------ */

// Mirrors api/channels/profile validation so the owner sees the problem on
// the step instead of a 400 at the very end.
const FB_PAGE_ID_RE = /^(?:\d{6,}|UC[A-Za-z0-9_-]{10,})$/;
const HANDLE_RE = /^[\w.-]{1,60}$/;

export function validateDestinations(form) {
  const errs = {};
  const pageId = String(form?.fbPageId ?? '').trim();
  if (pageId !== '' && !FB_PAGE_ID_RE.test(pageId)) {
    errs.fbPageId = 'Use the numeric page ID (e.g. 114550268199751) or the UC… page ID.';
  }
  for (const key of ['igHandle', 'threadsHandle', 'tiktokHandle']) {
    const h = String(form?.[key] ?? '').trim().replace(/^@+/, '');
    if (h !== '' && !HANDLE_RE.test(h)) errs[key] = 'Letters, numbers, dots, dashes and underscores only.';
  }
  return errs;
}

/* --------------------------- step completion ------------------------------ */

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// Blocking problems for one step, in plain English. [] = the step is done.
// ctx = { form, connectedSlug }
export function stepIssues(stepId, ctx = {}) {
  const form = ctx.form || EMPTY_FORM;
  switch (stepId) {
    case 'connect':
      return ctx.connectedSlug ? [] : ['Connect a YouTube channel first.'];
    case 'identity': {
      const out = String(form.niche || '').trim() ? [] : ['Pick or type a niche.'];
      if (String(form.label || '').length > NAME_MAX) out.push(`Keep the name to ${NAME_MAX} characters.`);
      return out;
    }
    case 'look': {
      const out = [];
      if (!String(form.style || '').trim()) out.push('Pick a video style.');
      if (!String(form.voice || '').trim()) out.push('Pick a voice.');
      if (!HEX_RE.test(String(form.accent || ''))) out.push('The accent must be a colour like #38BDF8.');
      return out;
    }
    case 'schedule': {
      const out = [];
      const rows = parseSlots(form.slots);
      // wave B4 (T4-10): the engine has no "no shorts" mode in the kit — an
      // empty list falls back to old kit times or breaks a new channel. Long
      // videos only = turn off Shorts days in the channel's Schedule drawer.
      if (!rows.length) out.push('Add at least one daily short.');
      for (const r of rows) if (r.utc == null) out.push(`Can't read the time "${r.raw}" — use a time like 19:30.`);
      if (rows.length > MAX_SLOTS) out.push(`At most ${MAX_SLOTS} short times.`);
      if (!DOC_DAYS.includes(form.docDay)) out.push('Pick the weekly episode day.');
      return out;
    }
    case 'destinations':
      return Object.values(validateDestinations(form));
    default:
      return []; // thumbnails (all optional) and review
  }
}

// Every blocking problem before the review step — save is refused while any
// exist (the server would reject or silently coerce them).
export function allIssues(ctx) {
  return STEPS.filter((s) => s.id !== 'review').flatMap((s) => stepIssues(s.id, ctx).map((msg) => ({ step: s.id, msg })));
}

// A step can be opened when every step before it is complete — so completed
// steps are always reachable going back, and you can skip forward over steps
// that are already done (edit mode).
export function canOpenStep(index, ctx) {
  if (index <= 0) return true;
  for (let j = 0; j < index && j < STEPS.length; j++) {
    if (stepIssues(STEPS[j].id, ctx).length) return false;
  }
  return index < STEPS.length;
}

// Per-step indicator state: 'current' | 'done' | 'attention' | 'todo' | 'locked'.
// `visited` = indexes the owner has been on; `editing` = an existing channel
// whose saved settings count as done without a visit.
export function stepStates(ctx, { current = 0, visited = [], editing = false } = {}) {
  const seen = new Set(visited);
  return STEPS.map((s, i) => {
    if (i === current) return 'current';
    if (!canOpenStep(i, ctx)) return 'locked';
    if (s.id === 'review') return 'todo';
    const ok = stepIssues(s.id, ctx).length === 0;
    if (seen.has(i) || editing) return ok ? 'done' : 'attention';
    return 'todo';
  });
}

/* ------------------------------- key status ------------------------------- */

// Honest key chip: the real secret name, or say it's missing. Never a green
// "key saved" next to a blank name (report 05, C-03).
export function keyStatus(entry) {
  const secret = String(entry?.tokenSecret ?? '').trim();
  if (!secret) return { tone: 'warn', label: 'key name missing', secret: '', detail: 'No key name is recorded for this channel — re-connect it with Google to record one.' };
  if (entry?.tokenSecretSaved === false) return { tone: 'bad', label: 'secret missing', secret, detail: `The cloud runner secret ${secret} was not written — re-connect with Google to retry.` };
  return { tone: 'ok', label: 'key saved', secret, detail: `Stored as ${secret}.` };
}

/* ------------------------------- thumbnails ------------------------------- */

// The designs a niche's thumbnails rotate through — same rule as
// lib/thumb-registry.mjs thumbSetFor: the niche's bound designs, else the
// whole pool (uploads never block on coverage).
export function thumbDesignsForNiche(registry, niche) {
  const pool = Array.isArray(registry) ? registry.filter(Boolean) : [];
  const hit = pool.filter((d) => Array.isArray(d.niches) && d.niches.includes(niche));
  return hit.length ? { designs: hit, matched: true } : { designs: pool, matched: false };
}

/* ----------------------------- review summary ----------------------------- */

const orDash = (v, empty = 'Not set') => (String(v ?? '').trim() ? String(v).trim() : empty);
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// A daily short is DAILY, so no "(next day)": "3:35 am your time (22:35 UTC)"
// (wave B4, T4-17).
export function describeSlots(slotsStr, offsetMin) {
  const rows = parseSlots(slotsStr).filter((r) => r.utc);
  if (!rows.length) return 'No daily short time set';
  return rows
    .map((r) => `${formatClock(utcToLocal(r.utc, offsetMin).time)} your time (${r.utc} UTC)`)
    .join('; ');
}

// "quote-card" → "Quote card" (a design id without a loaded name).
const humanizeId = (id) => {
  const s = String(id ?? '').replace(/^v2\//, '').replace(/[-_]+/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : '';
};

/* ------------------------------ name + eyebrow ----------------------------- */

const caps = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
const initialsOf = (s) => caps(s).split(' ').filter((w) => w && w !== 'THE').map((w) => w[0]).join('');
const DANGLING = /(?:\s*(?:[,&·:;/+-]|\b(?:AND|OF|THE|FOR|WITH)\b))+$/i;

function splitEyebrow(e) {
  const at = String(e ?? '').lastIndexOf('//');
  return at < 0 ? null : { left: e.slice(0, at).trim(), right: e.slice(at + 2).trim() };
}

// Is `right` the name part for `label`? 'full' = the name or a cut-off start
// of it ("QUOTE QU"); 'initials' = "MR" for "The Money Rulebook".
function nameKind(right, label) {
  const name = caps(label);
  if (right === '') return 'full';
  if (name && (right === name || (right.length >= 3 && name.startsWith(right)))) return 'full';
  if (name && right.length >= 2 && right === initialsOf(label)) return 'initials';
  return '';
}

// Drop whole words from the end until it fits — never cut mid-word.
function fitWords(text, max) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  while (words.length > 1 && words.join(' ').length > max) words.pop();
  const out = words.join(' ');
  return out.length > max ? out.slice(0, max).trim() : out; // one giant word: the only hard cut
}

function joinEyebrow(left, right, max) {
  let l = String(left ?? '').trim();
  const r = fitWords(right, max);
  if (!r) return fitWords(l, max);
  const room = max - r.length - 4; // " // "
  if (room <= 0) return r;
  l = fitWords(l, room).replace(DANGLING, '').trim();
  while (l && l.length > room) l = l.split(' ').slice(0, -1).join(' ').replace(DANGLING, '').trim();
  return l ? `${l} // ${r}` : r;
}

// The eyebrow with the CURRENT name and whole words only (T4-16). Used when
// an AI / template eyebrow is applied ("… // QUOTE QU" → "… // QUOTE QUARRY").
export function eyebrowFor(eyebrow, label, max = EYEBROW_MAX) {
  const e = String(eyebrow ?? '').trim();
  if (!e) return '';
  const parts = splitEyebrow(e);
  if (!parts) return fitWords(e, max);
  const kind = nameKind(parts.right, label);
  const right = kind === 'full' && caps(label) ? caps(label) : parts.right;
  return joinEyebrow(parts.left, right, max);
}

// After a rename, the old name in the eyebrow becomes the new one. A custom
// eyebrow that does not carry the name is left exactly as it is.
export function renameEyebrow(eyebrow, oldLabel, newLabel, max = EYEBROW_MAX) {
  const e = String(eyebrow ?? '');
  const parts = splitEyebrow(e);
  if (!e.trim() || !parts) return e;
  const kind = nameKind(parts.right, oldLabel);
  if (!kind || (kind === 'full' && parts.right === '' && !caps(newLabel))) return e;
  const right = kind === 'initials' ? initialsOf(newLabel) : caps(newLabel);
  return right ? joinEyebrow(parts.left, right, max) : `${parts.left} //`;
}

// One form field change. The name is capped at NAME_MAX (the API keeps 60)
// and carries the eyebrow along with it.
export function withField(form, key, value) {
  const f = { ...(form || {}) };
  if (key === 'label') {
    const label = String(value ?? '').slice(0, NAME_MAX);
    return { ...f, label, eyebrow: renameEyebrow(f.eyebrow, f.label, label) };
  }
  return { ...f, [key]: value };
}

/* ------------------------- unsaved draft (T4-08) -------------------------- */

// The wizard keeps its in-progress form in sessionStorage, per mode + slug.
// Only the plain form fields are stored — never tokens, keys or secrets.
export const DRAFT_PREFIX = 'qs-wizard-draft';
const DRAFT_FIELDS = [...Object.keys(EMPTY_FORM), 'thumbTemplates', 'voiceProfile'];
const SECRETISH = /token|secret|password|passwd|api_?key|credential|auth/i;

export function draftKey(mode, slug) {
  const s = String(slug ?? '').trim();
  return s ? `${DRAFT_PREFIX}:${mode === 'edit' ? 'edit' : 'new'}:${s}` : '';
}

function draftFields(src) {
  const out = {};
  if (!src || typeof src !== 'object' || Array.isArray(src)) return out;
  for (const k of DRAFT_FIELDS) {
    if (SECRETISH.test(k)) continue;
    const v = src[k];
    if (k === 'thumbTemplates') {
      if (Array.isArray(v)) out[k] = v.filter((x) => typeof x === 'string').slice(0, 24);
    } else if (k === 'voiceProfile') {
      // human voice settings (docs/qa/human-voice-panel-qa.md): only a valid { human, mood, speed }
      const r = parseVoiceProfile(v);
      if (r.ok) out[k] = r.value;
    } else if (typeof v === 'string') {
      out[k] = v.slice(0, 2000);
    }
  }
  return out;
}

export function draftSnapshot(form, { step = 0, audience = '' } = {}) {
  return { v: 1, form: draftFields(form), step: Number.isInteger(step) ? step : 0, audience: typeof audience === 'string' ? audience : '' };
}

// sessionStorage text → { form, step, audience } | null (junk is ignored).
export function parseDraft(raw) {
  let d;
  try { d = JSON.parse(String(raw ?? '')); } catch { return null; }
  if (!d || typeof d !== 'object' || Array.isArray(d) || d.v !== 1) return null;
  if (!d.form || typeof d.form !== 'object' || Array.isArray(d.form)) return null;
  return {
    form: draftFields(d.form),
    step: Number.isInteger(d.step) && d.step >= 0 && d.step < STEPS.length ? d.step : 0,
    audience: typeof d.audience === 'string' ? d.audience : '',
  };
}

// Same values in every saved field? (undefined, '' and [] designs are equal)
export function sameForm(a, b) {
  if (!a || !b) return false;
  const norm = (f, k) => {
    if (k === 'thumbTemplates') return Array.isArray(f[k]) ? f[k].join('\u0001') : '';
    if (k === 'voiceProfile') {
      const r = parseVoiceProfile(f[k]);
      if (!r.ok) return '';
      // emotional voice (docs/qa/emotional-voice-qa.md): absent = off / none
      const e = emotionalOf(r.value);
      return `${r.value.human}|${r.value.mood}|${r.value.speed}|${e.emotional}|${e.expression}|${e.model}`;
    }
    return String(f[k] ?? '');
  };
  return DRAFT_FIELDS.every((k) => norm(a, k) === norm(b, k));
}

// One section per editable step, each row a plain [label, value] pair.
// names = { style(id) → name, voice(id) → label, thumb(id) → design name }
// (lookups passed in so this file stays dependency-free); audience = the
// picked audience's label (wizard-local, shown so Review lists every choice).
// Review row for the human voice settings — only once they are set.
function humanPacingRow(v) {
  const r = parseVoiceProfile(v);
  if (!r.ok) return [];
  const rows = [['Human pacing', r.value.human ? `On · ${MOOD_LABEL[r.value.mood]} · ${r.value.speed}×` : 'Off']];
  // emotional voice: listed once the setting exists
  if (r.value.emotional !== undefined) {
    rows.push(['Emotional voice', r.value.human && r.value.emotional ? `On · ${EXPRESSION_LABEL[r.value.expression]} expression` : 'Off']);
  }
  return rows;
}

export function reviewSummary(form, { channel = null, offsetMin = 0, names = {}, audience = '' } = {}) {
  const f = { ...EMPTY_FORM, ...(form || {}) };
  const styleName = (names.style && names.style(f.style)) || f.style || 'Not set';
  const voiceName = (names.voice && names.voice(f.voice)) || f.voice || 'Not set';
  const pillars = subNicheList(f.subNiches);
  const tags = String(f.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
  const key = channel ? keyStatus(channel) : null;
  const designs = Array.isArray(f.thumbTemplates) ? f.thumbTemplates : [];
  const designName = (id) => (names.thumb && names.thumb(id)) || humanizeId(id);
  const handle = (h) => (String(h || '').trim() ? `@${String(h).trim().replace(/^@+/, '')}` : 'Not posting');
  return [
    {
      step: 'connect',
      title: 'Channel',
      rows: [
        ['YouTube channel', channel ? `${channel.label || channel.slug}${channel.handle ? ` (${channel.handle})` : ''}` : 'Not connected'],
        ...(key ? [['Key', key.secret ? `${key.label} · ${key.secret}` : key.label]] : []),
      ],
    },
    {
      step: 'identity',
      title: 'Identity',
      rows: [
        ['Name', orDash(f.label)],
        ['Niche', orDash(f.niche)],
        ['Content pillars', pillars.length ? pillars.join(', ') : 'None — research uses the niche'],
        ['Description', f.description.trim() ? clip(f.description.trim(), 120) : 'Not set'],
        ['SEO tags', tags.length ? `${tags.length} tag${tags.length === 1 ? '' : 's'}` : 'None'],
      ],
    },
    {
      step: 'look',
      title: 'Look & sound',
      rows: [
        ['Video style', styleName],
        ['Voice', voiceName],
        ...humanPacingRow(f.voiceProfile),
        ['Accent colour', f.accent],
      ],
    },
    {
      step: 'thumbnails',
      title: 'Thumbnails',
      rows: [
        ['Designs', designs.length ? designs.map(designName).join(', ') : 'Not picked — the niche’s designs take turns'],
        ['Eyebrow label', orDash(f.eyebrow)],
        ['Tagline', orDash(f.tagline)],
      ],
    },
    {
      step: 'schedule',
      title: 'Schedule',
      rows: [
        ['Audience', orDash(audience, 'Not picked')],
        ['Daily shorts', describeSlots(f.slots, offsetMin)],
        ['Weekly long episode', `Every ${orDash(f.docDay)}`],
      ],
    },
    {
      step: 'destinations',
      title: 'Destinations',
      rows: [
        ['Facebook page', orDash(f.fbPageId, 'Not posting')],
        ['Instagram', handle(f.igHandle)],
        ['Threads', handle(f.threadsHandle)],
        ['TikTok', handle(f.tiktokHandle)],
      ],
    },
  ];
}
