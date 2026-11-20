// Feedback round 1, item F (2026-11-19) — the pure brain behind SlotTimeline,
// the ONE schedule picker used by the Schedule drawer (autopilot start time)
// and the Add Channel wizard (when a short goes public). Pure: no React, no
// DOM, relative imports only, so node --test pins it
// (tests/slot-planner.test.mjs; spec docs/qa/feedback-r1-schedule-qa.md).
//
// Two different engine times — never mix them up:
//   start   = registry `cron` (else kit.gateCron), daily UTC 'M H * * *' —
//             when the autopilot run STARTS (lib/schedule-slot.mjs gates it)
//   publish = kit `slots` (UTC 'HH:MM') — when the short GOES PUBLIC
//             (yt-daily.mjs: publishAt = nextFutureSlotISO(b.slots))
// Audience peaks only make sense for `publish`; a start time is good when it
// is free and leaves review time before the video goes public.
//
// No per-channel maps: taken hours come from live registry rows
// (channelTimes), suggestions from a NICHE-wording table (data, not channels).
import { formatClock } from './wizard-steps.mjs';

/* ------------------------------ clock maths ------------------------------ */

const DAILY_CRON_RE = /^(\d{1,2}) (\d{1,2}) \* \* \*$/;
const HHMM_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const isHour = (h) => Number.isInteger(h) && h >= 0 && h <= 23;
const isMinute = (m) => Number.isInteger(m) && m >= 0 && m <= 59;

// '21 3 * * *' → { hour: 3, minute: 21 }; anything else → null (same rule as
// lib/schedule-slot.mjs parseDailyCron and the schedule route's validator).
export function parseDailyCron(cron) {
  const m = DAILY_CRON_RE.exec(String(cron ?? '').trim());
  if (!m) return null;
  const minute = Number(m[1]);
  const hour = Number(m[2]);
  return isHour(hour) && isMinute(minute) ? { hour, minute } : null;
}

// UTC hour (+ minute) → the daily cron the engine reads; null when invalid.
export function cronFromUtc(hour, minute = 0) {
  return isHour(hour) && isMinute(minute) ? `${minute} ${hour} * * *` : null;
}

export function parseHHMM(s) {
  const m = HHMM_RE.exec(String(s ?? '').trim());
  return m ? { hour: Number(m[1]), minute: Number(m[2]) } : null;
}

export function toHHMM(hour, minute = 0) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// minute-of-day (0..1439) on the viewer's clock for a UTC hour:minute.
// offsetMin = minutes AHEAD of UTC (= -new Date().getTimezoneOffset()).
export function utcToLocalMinutes(hour, minute, offsetMin) {
  const t = hour * 60 + minute + Math.round(Number(offsetMin) || 0);
  return ((t % 1440) + 1440) % 1440;
}

const clockLabel = (localMinutes) =>
  formatClock(toHHMM(Math.floor(localMinutes / 60), localMinutes % 60)).replace(':00 ', ' ');

// The timeline's 24 cells: one per UTC hour, labelled and ordered by the
// viewer's local clock (first cell = local midnight). Half-hour zones keep
// their minutes ("7:30 pm").
export function timelineHours(offsetMin) {
  return [...Array(24).keys()]
    .map((hour) => {
      const localMinutes = utcToLocalMinutes(hour, 0, offsetMin);
      return { hour, localMinutes, label: clockLabel(localMinutes) };
    })
    .sort((a, b) => a.localMinutes - b.localMinutes);
}

// A UTC hour:minute as the viewer reads it ("3:35 am").
export function localClock(hour, minute, offsetMin) {
  const lm = utcToLocalMinutes(hour, minute, offsetMin);
  return formatClock(toHHMM(Math.floor(lm / 60), lm % 60));
}

export function zoneLabel(name) {
  const n = String(name || '').replace(/_/g, ' ').trim();
  return n ? `your time (${n})` : 'your time';
}

export function hourDistance(a, b) {
  const d = Math.abs(a - b) % 24;
  return Math.min(d, 24 - d);
}

/* ------------------------ taken hours (live data) ------------------------ */

// Registry rows → the times each channel holds. Parked/inactive channels hold
// no slot. A channel without a daily cron gets start: null — never invented.
export function channelTimes(channels) {
  return (Array.isArray(channels) ? channels : [])
    .filter((c) => c && c.slug && c.active !== false)
    .map((c) => {
      const start = parseDailyCron(c.cron) || parseDailyCron(c.kit?.gateCron);
      const rawSlots = Array.isArray(c.kit?.slots) && c.kit.slots.length ? c.kit.slots : Array.isArray(c.slots) ? c.slots : [];
      const publish = rawSlots.map(parseHHMM).filter(Boolean).map((p) => toHHMM(p.hour, p.minute));
      const long = parseHHMM(c.kit?.longSlot || c.longSlot);
      return {
        slug: c.slug,
        label: c.label || c.slug,
        niche: c.niche || '',
        start: start ? toHHMM(start.hour, start.minute) : null,
        publish,
        long: long ? toHHMM(long.hour, long.minute) : null,
      };
    });
}

// Hours OTHER channels hold, as [{ hour (UTC), minute, slug, label }], sorted
// by hour. kind: 'start' (autopilot runs) or 'publish' (shorts going public).
// `minute` is the real minute (wave B4, T3-21: the legend shows "7:13 am").
export function takenHours(times, { exclude = '', kind = 'start' } = {}) {
  const out = [];
  for (const c of Array.isArray(times) ? times : []) {
    if (!c || c.slug === exclude) continue;
    const list = kind === 'publish' ? c.publish || [] : c.start ? [c.start] : [];
    const seen = new Set();
    for (const t of list) {
      const p = parseHHMM(t);
      if (!p || seen.has(p.hour)) continue;
      seen.add(p.hour);
      out.push({ hour: p.hour, minute: p.minute, slug: c.slug, label: c.label || c.slug });
    }
  }
  return out.sort((a, b) => a.hour - b.hour || a.label.localeCompare(b.label));
}

// The "Taken:" legend, one "Label 7:13 am" per taken time, sorted by the
// VIEWER's clock (T4-20) with the real minutes (T3-21).
export function takenLegend(taken, offsetMin) {
  return (Array.isArray(taken) ? taken : [])
    .filter((t) => t && isHour(t.hour))
    .map((t) => {
      const minute = isMinute(t.minute) ? t.minute : 0;
      return { at: utcToLocalMinutes(t.hour, minute, offsetMin), text: `${t.label || t.slug || ''} ${localClock(t.hour, minute, offsetMin).replace(':00 ', ' ')}`.trim() };
    })
    .sort((a, b) => a.at - b.at || a.text.localeCompare(b.text))
    .map((t) => t.text);
}

// What one timeline cell shows (wave B4):
//   owners   other channels' labels at this hour (or null)
//   own      this hour is the channel's SAVED time (T3-09: always pickable,
//            even when another channel shares it)
//   star     the suggestion for this hour (or null)
//   loading  the registry has not arrived: no stars, no picks (T4-13)
// → { blocked, tag ('shared' | 'taken' | 'saved' | ''), strike, star }
// Tags stay short so a narrow cell never truncates them (T3-25).
export function timelineCell({ owners = null, selected = false, own = false, star = null, loading = false } = {}) {
  const taken = Array.isArray(owners) && owners.length > 0;
  const tag = taken ? (selected || own ? 'shared' : 'taken') : own && !selected ? 'saved' : '';
  return {
    blocked: loading || (taken && !selected && !own),
    tag,
    strike: taken && !selected && !own,
    star: Boolean(star) && !loading,
  };
}

/* ------------------------------ suggestions ------------------------------ */

// Typical evening peaks by NICHE wording (data, not channels). peakUtc is in
// preference order. US evening 7-9 pm ET ≈ 00-02 UTC in winter (23-01 summer).
export const NICHE_PEAKS = [
  {
    match: /financ|money|invest|wealth|debt|tax|real estate|property|insurance|business|entrepreneur|sales|negotiat|leadership|health|longevity|sleep|gym|fitness/i,
    region: 'evenings in the US',
    peakUtc: [0, 1, 23, 2],
  },
  {
    match: /wisdom|psycholog|stoic|history|focus|productiv|science|travel|geograph|\bai\b|tech/i,
    region: 'evenings in the UK, afternoons in the US',
    peakUtc: [21, 22, 20, 23],
  },
];
const GENERAL_PEAKS = { region: 'a mix of US and UK evenings', peakUtc: [22, 23, 21, 0] };

export function peaksForNiche(niche) {
  const n = String(niche || '');
  const hit = n ? NICHE_PEAKS.find((p) => p.match.test(n)) : null;
  return hit
    ? { region: hit.region, peakUtc: [...hit.peakUtc], general: false }
    : { region: GENERAL_PEAKS.region, peakUtc: [...GENERAL_PEAKS.peakUtc], general: true };
}

const takenSet = (taken) => (Array.isArray(taken) ? taken : []).map((t) => (typeof t === 'number' ? t : t?.hour)).filter(isHour);

// Rank candidate hours: those keeping a `gapHours` gap from every taken hour
// first; only when that leaves fewer than `count`, top up with hours that are
// merely not taken. Exactly-taken hours are never suggested.
function pickFree(ranked, taken, count, gapHours) {
  const t = takenSet(taken);
  const gapped = ranked.filter((h) => t.every((x) => hourDistance(h, x) > gapHours));
  const loose = ranked.filter((h) => !t.includes(h) && !gapped.includes(h));
  return [...gapped, ...loose].slice(0, count);
}

/**
 * A free "HH:MM" near `prefer` (wave B4, T4-09): the preferred hour when it
 * keeps the `gapHours` gap from every taken hour, else the nearest hour that
 * does, else the nearest hour that is merely not taken (same rule as the
 * suggestions — pickFree). `own` = the channel's other short times (two shorts
 * never share an hour). The minute of `prefer` is kept. null = nothing free.
 */
export function freeSlotTime({ prefer = '22:35', taken = [], own = [], gapHours = 1 } = {}) {
  const p = parseHHMM(prefer) || { hour: 22, minute: 35 };
  const blockers = [...takenSet(taken), ...(Array.isArray(own) ? own : []).map(parseHHMM).filter(Boolean).map((x) => x.hour)];
  const ranked = [...Array(24).keys()].sort((a, b) => hourDistance(a, p.hour) - hourDistance(b, p.hour) || a - b);
  const [hour] = pickFree(ranked, blockers, 1, gapHours);
  return hour == null ? null : toHHMM(hour, p.minute);
}

/* --------------------------- schedule drawer state ------------------------ */

const daySet = (d) => [...new Set((Array.isArray(d) ? d : []).map(String))].sort().join(',');

// Has the Schedule drawer changed anything since it was loaded/saved?
// (wave B4, T3-18: Save stays disabled until it has.) Day order is ignored.
export function scheduleDirty(saved, draft) {
  if (!saved || !draft) return false;
  return (
    daySet(saved.docDays) !== daySet(draft.docDays) ||
    daySet(saved.shortDays) !== daySet(draft.shortDays) ||
    String(saved.shortsSource || '') !== String(draft.shortsSource || '') ||
    String(saved.gateCron || '').trim() !== String(draft.gateCron || '').trim()
  );
}

function normaliseAudience(audienceHours) {
  if (!Array.isArray(audienceHours)) return [];
  return audienceHours
    .map((a) => (typeof a === 'number' ? { hour: a, views: 1 } : { hour: Number(a?.hour), views: Number(a?.views) || 0 }))
    .filter((a) => isHour(a.hour))
    .sort((a, b) => b.views - a.views)
    .map((a) => a.hour);
}

/**
 * Best hours for a short to GO PUBLIC. Source order (first that applies):
 *   audienceHours — the channel's REAL per-hour viewers ([{hour, views}] UTC);
 *                   pass nothing when no API exposes them (never invented)
 *   preset        — the audience the owner picked ({ utc: 'HH:MM', label })
 *   niche         — NICHE_PEAKS wording table
 *   general       — a mixed US/UK evening guess
 * Returns [{ hour (UTC), reason, source, distance }].
 */
export function suggestHours({ niche = '', takenHours: taken = [], audienceHours = null, preset = null, count = 3, gapHours = 1 } = {}) {
  let peaks;
  let region;
  let source;
  let suffix;
  const viewers = normaliseAudience(audienceHours);
  const presetAt = parseHHMM(preset?.utc);
  if (viewers.length) {
    peaks = viewers;
    region = 'when your viewers watch most';
    source = 'audience';
    suffix = 'based on your channel’s viewers';
  } else if (presetAt) {
    peaks = [presetAt.hour, (presetAt.hour + 1) % 24, (presetAt.hour + 23) % 24];
    region = `evenings for ${preset.label || 'your'} viewers`;
    source = 'preset';
    suffix = 'the audience you picked';
  } else {
    const p = peaksForNiche(niche);
    peaks = p.peakUtc;
    region = p.region;
    source = p.general ? 'general' : 'niche';
    suffix = p.general ? 'general guess' : 'typical for this niche';
  }
  const near = (h) => {
    let best = { d: 99, i: 99 };
    peaks.forEach((p, i) => {
      const d = hourDistance(h, p);
      if (d < best.d) best = { d, i };
    });
    return best;
  };
  const ranked = [...Array(24).keys()].sort((a, b) => {
    const na = near(a);
    const nb = near(b);
    return na.d - nb.d || na.i - nb.i || a - b;
  });
  return pickFree(ranked, taken, count, gapHours).map((hour, idx) => {
    const distance = near(hour).d;
    const what = distance === 0
      ? `${idx === 0 ? 'Best' : 'Good'} — ${region}`
      : distance <= 2
        ? `Good — close to ${region}`
        : `Free — nearest open hour to ${region}`;
    return { hour, reason: `⭐ ${what} · ${suffix}`, source, distance };
  });
}

/**
 * Good hours for the autopilot to START. A start time does not change when
 * the video goes public, so audience peaks do not apply: the best start is
 * free (gap from other channels' runs) and leaves the day to review the
 * script before the channel's publish time (idealLead ≈ today's 20-22 h).
 * publishHours: the channel's publish slot hours (UTC); the first is used.
 */
export function suggestStartHours({ publishHours = [], takenHours: taken = [], count = 3, gapHours = 1, minLead = 6, maxLead = 22, idealLead = 20 } = {}) {
  const pub = (Array.isArray(publishHours) ? publishHours : []).find(isHour);
  if (pub == null) {
    const t = takenSet(taken);
    const room = (h) => (t.length ? Math.min(...t.map((x) => hourDistance(h, x))) : 24);
    const ranked = [...Array(24).keys()].sort((a, b) => room(b) - room(a) || a - b);
    return pickFree(ranked, taken, count, gapHours).map((hour) => ({
      hour, reason: '⭐ Free — no other channel starts near this hour', source: 'free', lead: null,
    }));
  }
  const lead = (h) => (pub - h + 24) % 24;
  const ranked = [...Array(24).keys()]
    .filter((h) => lead(h) >= minLead && lead(h) <= maxLead)
    .sort((a, b) => Math.abs(lead(a) - idealLead) - Math.abs(lead(b) - idealLead) || lead(b) - lead(a));
  return pickFree(ranked, taken, count, gapHours).map((hour, idx) => ({
    hour,
    reason: `⭐ ${idx === 0 ? 'Best' : 'Good'} — free · about ${lead(hour)} h to review before it goes public`,
    source: 'publish',
    lead: lead(hour),
  }));
}
