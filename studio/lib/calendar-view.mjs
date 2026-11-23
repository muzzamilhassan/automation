// Calendar page (owner-approved 2026-11-23) — the pure core behind
// /api/calendar and /calendar. Relative imports only, so `node --test` loads
// it directly (tests/calendar-view.test.mjs).
//
// One calendar for every real channel:
//   published  — a video whose go-public time has passed
//   scheduled  — a video uploaded with a go-public time still ahead
//   waiting    — a script waiting for approval, or approved but not yet a video
//   free       — an upcoming slot time with nothing real on it yet
// Published vs scheduled is read from the clock, never from the source's
// label. A free slot exists only from NOW on (a passed slot was missed, not
// free) and only where no real item already sits. Nothing is ever invented:
// a channel with no slot times gets no free slots.
//
// Days are UTC 'YYYY-MM-DD' (the engine stamps every day in UTC); the page
// shows times — and groups by day — on the viewer's own clock.
import { overviewSchedule } from './overview-truth.mjs';
import { parseHHMM, toHHMM } from './slot-planner.mjs';

const DAY_MS = 86_400_000;
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MAX_RANGE_DAYS = 62;
// a real item this close to a slot's time is sitting on that slot
const SLOT_MATCH_MS = 2 * 3600_000;
// an untitled upload (upload time) and a titled record (go-public time) are
// the same video when the go-public time is between 1 h before and 30 h after
// the upload (the engine publishes at the NEXT slot after the run)
const FOLD_BEFORE_MS = 3600_000;
const FOLD_AFTER_MS = 30 * 3600_000;

/* --------------------------------- dates ---------------------------------- */

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// 'YYYY-MM-DD' → ms at UTC midnight; null unless it is a real calendar day
export function parseDay(s) {
  const m = DAY_RE.exec(String(s ?? ''));
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(t).toISOString().slice(0, 10) === s ? t : null;
}

export const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

export function addDays(day, n) {
  const t = parseDay(day);
  return t == null ? null : dayOf(t + n * DAY_MS);
}

// the day an instant falls on for a viewer `offsetMin` minutes ahead of UTC
export function localDayOf(iso, offsetMin = 0) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? dayOf(t + Math.round(Number(offsetMin) || 0) * 60_000) : null;
}

// the Monday-start week holding `day` → 7 'YYYY-MM-DD'
export function weekDays(day) {
  const t = parseDay(day);
  if (t == null) return [];
  const start = t - ((new Date(t).getUTCDay() + 6) % 7) * DAY_MS;
  return [...Array(7).keys()].map((i) => dayOf(start + i * DAY_MS));
}

/** ?from=&to= check: real days, from ≤ to, at most MAX_RANGE_DAYS days (inclusive). */
export function validateRange(from, to, maxDays = MAX_RANGE_DAYS) {
  const a = parseDay(from);
  const b = parseDay(to);
  if (a == null || b == null) return { ok: false, error: 'from and to must be real dates (YYYY-MM-DD)' };
  if (b < a) return { ok: false, error: 'from must be on or before to' };
  if ((b - a) / DAY_MS + 1 > maxDays) return { ok: false, error: `at most ${maxDays} days at a time` };
  return { ok: true, from, to };
}

/* ------------------------------ month grid -------------------------------- */

/** Monday-start weeks covering `month` (1–12): [[{ date, day, inMonth } ×7], …] (4–6 weeks). */
export function monthGrid(year, month) {
  const first = Date.UTC(year, month - 1, 1);
  const last = Date.UTC(year, month, 0);
  let t = first - ((new Date(first).getUTCDay() + 6) % 7) * DAY_MS;
  const weeks = [];
  while (t <= last) {
    const week = [];
    for (let i = 0; i < 7; i++, t += DAY_MS) {
      const d = new Date(t);
      week.push({ date: dayOf(t), day: d.getUTCDate(), inMonth: d.getUTCMonth() === month - 1 });
    }
    weeks.push(week);
  }
  return weeks;
}

export const LIST_DAYS = 14;

/**
 * The days a view shows around `anchor`, plus the range to fetch: one extra
 * day each side, because the page groups by the VIEWER's day while the API
 * speaks UTC days. month → its Monday grid; week → Mon–Sun; list → 14 days.
 */
export function viewRange(view, anchor) {
  let days;
  if (view === 'month') {
    const [y, m] = String(anchor).split('-').map(Number);
    days = monthGrid(y, m).flat().map((d) => d.date);
  } else if (view === 'week') {
    days = weekDays(anchor);
  } else {
    days = [...Array(LIST_DAYS).keys()].map((i) => addDays(anchor, i));
  }
  return { days, from: addDays(days[0], -1), to: addDays(days[days.length - 1], 1) };
}

/** ‹ / › : month → the 1st of the next/previous month; week → ±7 days; list → ±14 days. */
export function shiftAnchor(view, anchor, dir) {
  if (view === 'month') {
    const [y, m] = String(anchor).split('-').map(Number);
    return dayOf(Date.UTC(y, m - 1 + dir, 1));
  }
  return addDays(anchor, (view === 'week' ? 7 : LIST_DAYS) * dir);
}

/* ------------------------------- schedules -------------------------------- */

const nonEmpty = (a) => (Array.isArray(a) && a.length ? a : null);
const cleanTimes = (list) => [...new Set((list || []).map(parseHHMM).filter(Boolean).map((p) => toHHMM(p.hour, p.minute)))];

/**
 * One channel's publishing schedule, in the engine's precedence:
 *   times     — registry slots → registry kit → brands.json (overviewSchedule)
 *   docDays   — cadence.json → registry → legacy docDay (lib/doc-days.mjs)
 *   shortDays — cadence.json → kit; empty = every day (shorts-clips.mjs)
 *   autopilotOff — registry `autopilot: false` (the overview's flowPaused
 *                  rule): nothing will fill the slots, so none are free
 */
export function scheduleFor({ slug, staticEntry = null, reg = null, cadence = null, pausedUntil = null } = {}) {
  const kit = reg?.kit || {};
  const { slots, longSlot } = overviewSchedule(staticEntry, reg);
  const long = parseHHMM(longSlot);
  const oneDay = reg?.docDay || kit.docDay || staticEntry?.docDay || null;
  const docDays = nonEmpty(cadence?.docDays) || nonEmpty(reg?.docDays) || nonEmpty(kit.docDays) || nonEmpty(staticEntry?.docDays) || (oneDay ? [oneDay] : []);
  const src = cadence?.shortsSource || reg?.shortsSource || kit.shortsSource;
  return {
    slug,
    shortSlots: cleanTimes(slots),
    longSlot: long ? toHHMM(long.hour, long.minute) : null,
    shortDays: nonEmpty(cadence?.shortDays) || nonEmpty(kit.shortDays) || nonEmpty(staticEntry?.shortDays) || [],
    docDays: docDays.filter((d) => DAY_NAMES.includes(d)),
    shortsSource: src === 'clips' ? 'clips' : 'generated',
    pausedUntil: pausedUntil || null,
    autopilotOff: reg?.autopilot === false,
  };
}

/**
 * The channel's upcoming slot instants between `from` and `to` (UTC days,
 * inclusive), only after `now`. A clips-lane channel posts one Short a day
 * (its first slot); a long slot falls on doc days only; a paused channel
 * holds nothing up to and including its pausedUntil day; a channel with
 * autopilot off holds nothing at all.
 * → [{ channel, date, at, lane: 'short'|'long', slotIdx }] sorted by time
 */
export function expandSlots(sched, from, to, now = Date.now()) {
  const a = parseDay(from);
  const b = parseDay(to);
  if (!sched?.slug || sched.autopilotOff || a == null || b == null || b < a) return [];
  const shorts = cleanTimes(sched.shortSlots);
  const shortTimes = sched.shortsSource === 'clips' ? shorts.slice(0, 1) : shorts;
  const shortDays = nonEmpty(sched.shortDays);
  const docDays = nonEmpty(sched.docDays) || [];
  const long = parseHHMM(sched.longSlot);
  const nowMs = Number(now) || 0;
  const out = [];
  for (let t = a; t <= b; t += DAY_MS) {
    const date = dayOf(t);
    if (sched.pausedUntil && date <= sched.pausedUntil) continue;
    const name = DAY_NAMES[new Date(t).getUTCDay()];
    const push = (hhmm, lane, slotIdx) => {
      const p = parseHHMM(hhmm);
      if (!p) return;
      const ms = t + (p.hour * 60 + p.minute) * 60_000;
      if (ms > nowMs) out.push({ channel: sched.slug, date, at: new Date(ms).toISOString(), lane, slotIdx });
    };
    if (!shortDays || shortDays.includes(name)) shortTimes.forEach((hhmm, i) => push(hhmm, 'short', i));
    if (long && docDays.includes(name)) push(sched.longSlot, 'long', 0);
  }
  return out.sort((x, y) => x.at.localeCompare(y.at));
}

/* --------------------------------- merge ---------------------------------- */

// record kind → slot lane. Covers every upload_intents kind (repo-root
// lib/upload-intents.mjs INTENT_KINDS: short, doc, longform), the Library's
// kinds (short, long, other) and script kinds; unknown → null (no lane).
const LANE = { short: 'short', long: 'long', doc: 'long', longform: 'long', episode: 'long' };
export const laneOf = (kind) => LANE[String(kind || '').toLowerCase()] || null;

const ms = (iso) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : null;
};
const isoOf = (v) => {
  const t = v instanceof Date ? v.getTime() : ms(v);
  return t == null ? null : new Date(t).toISOString();
};
export const ytUrl = (videoId) => (videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : null);

/**
 * Fold a linked-but-untitled upload record (`untitledUpload`: link + UPLOAD
 * time, e.g. an upload_intents row) into a titled-but-unlinked record of the
 * same channel + lane (title + GO-PUBLIC time, e.g. title history), when the
 * go-public time is 1 h before … 30 h after the upload. Nearest forward match
 * wins; each record folds at most once. Everything else passes through.
 */
export function foldUntitled(rows) {
  const list = (rows || []).filter(Boolean);
  const untitled = list.filter((r) => r.videoId && !r.title && r.untitledUpload).sort((x, y) => (ms(x.at) ?? 0) - (ms(y.at) ?? 0));
  const unlinked = list.filter((r) => !r.videoId && r.title);
  const used = new Set();
  const folded = new Map(); // untitled row → merged row
  for (const u of untitled) {
    const ut = ms(u.at);
    if (ut == null) continue;
    let best = null;
    let bestD = Infinity;
    for (const t of unlinked) {
      if (used.has(t) || t.channel !== u.channel || (u.lane && t.lane && u.lane !== t.lane)) continue;
      const tt = ms(t.at);
      if (tt == null) continue;
      const d = tt - ut;
      if (d < -FOLD_BEFORE_MS || d > FOLD_AFTER_MS) continue;
      if (Math.abs(d) < bestD) { best = t; bestD = Math.abs(d); }
    }
    if (best) {
      used.add(best);
      const { untitledUpload: _drop, ...rest } = u;
      folded.set(u, { ...rest, title: best.title, at: best.at, lane: u.lane || best.lane || null });
    }
  }
  return list.filter((r) => !used.has(r)).map((r) => folded.get(r) || r);
}

// one row per videoId: the first source wins; empty fields are filled from
// later ones; a go-public time beats an upload time (untitledUpload)
function dedupeVideos(rows) {
  const byId = new Map();
  const rest = [];
  for (const r of rows) {
    if (!r.videoId) { rest.push(r); continue; }
    const prev = byId.get(r.videoId);
    if (!prev) { byId.set(r.videoId, { ...r }); continue; }
    const at = prev.at && !prev.untitledUpload ? prev.at : r.at && !r.untitledUpload ? r.at : prev.at || r.at;
    byId.set(r.videoId, {
      ...prev,
      title: prev.title || r.title || '',
      at,
      lane: prev.lane || r.lane || null,
      untitledUpload: Boolean(prev.untitledUpload && r.untitledUpload),
    });
  }
  return [...byId.values(), ...rest];
}

function sortItems(items) {
  return items.sort((x, y) =>
    x.date.localeCompare(y.date)
    || (x.at == null) - (y.at == null)
    || String(x.at || '').localeCompare(String(y.at || ''))
    || String(x.channel).localeCompare(String(y.channel)));
}

/**
 * Real rows + free slots → calendar items
 *   { date, at, channel, kind, title, lane, videoId?, url?, scriptId?, stage? }
 * Inputs (any may be missing):
 *   published / scheduled — video rows { channel, at, videoId?, title, lane?, untitledUpload? }
 *   waiting               — script rows { channel, date, at?, title, scriptId, lane?, stage }
 *   slots                 — expandSlots() output
 * A free slot is dropped when a real item of that channel sits on it: first
 * by time (±2 h), then — for items left over — the same day + lane.
 */
export function mergeItems({ published = [], scheduled = [], waiting = [], slots = [] } = {}, { now = Date.now() } = {}) {
  const nowMs = Number(now) || 0;
  const videos = foldUntitled(dedupeVideos([...(published || []), ...(scheduled || [])].filter((r) => r && r.channel)));
  const real = [];
  for (const v of videos) {
    const at = isoOf(v.at);
    if (!at) continue; // a video with no time can't be placed on a day
    real.push({
      date: at.slice(0, 10),
      at,
      channel: v.channel,
      kind: ms(at) > nowMs ? 'scheduled' : 'published',
      title: v.title || '',
      lane: v.lane || null,
      ...(v.videoId ? { videoId: v.videoId, url: v.url || ytUrl(v.videoId) } : {}),
    });
  }
  const seenScript = new Set();
  for (const w of waiting || []) {
    if (!w || !w.channel || (w.scriptId && seenScript.has(w.scriptId))) continue;
    const at = isoOf(w.at);
    const date = parseDay(w.date) != null ? w.date : at ? at.slice(0, 10) : null;
    if (!date) continue;
    if (w.scriptId) seenScript.add(w.scriptId);
    real.push({
      date,
      at,
      channel: w.channel,
      kind: 'waiting',
      title: w.title || '',
      lane: w.lane || null,
      ...(w.scriptId ? { scriptId: w.scriptId } : {}),
      ...(w.stage ? { stage: w.stage } : {}),
    });
  }

  // which slots are taken
  const free = (slots || []).filter((s) => s && s.channel && s.at).map((s) => ({ ...s, taken: false }));
  const leftover = [];
  for (const it of real) {
    const t = ms(it.at);
    let best = null;
    let bestD = Infinity;
    if (t != null) {
      for (const s of free) {
        if (s.taken || s.channel !== it.channel) continue;
        const d = Math.abs(ms(s.at) - t);
        if (d <= SLOT_MATCH_MS && d < bestD) { best = s; bestD = d; }
      }
    }
    if (best) best.taken = true;
    else leftover.push(it);
  }
  for (const it of leftover) {
    const s = free.find((x) => !x.taken && x.channel === it.channel && x.date === it.date && (!it.lane || x.lane === it.lane));
    if (s) s.taken = true;
  }

  const items = [
    ...real,
    ...free.filter((s) => !s.taken).map((s) => ({ date: s.date, at: s.at, channel: s.channel, kind: 'free', title: '', lane: s.lane })),
  ];
  return sortItems(items);
}

/** items → { 'YYYY-MM-DD': items sorted by time }. `dayFn` picks the day (default: item.date). */
export function groupByDay(items, dayFn = (it) => it.date) {
  const out = {};
  for (const it of items || []) {
    const d = it ? dayFn(it) : null;
    if (!d) continue;
    (out[d] ||= []).push(it);
  }
  for (const d of Object.keys(out)) {
    out[d].sort((x, y) => (x.at == null) - (y.at == null) || String(x.at || '').localeCompare(String(y.at || '')));
  }
  return out;
}
