// Add Channel wizard — upload days (docs/qa/wizard-upload-days-qa.md). Pure.
//
// The days live in the channel's saved schedule (yt-mcp/cadence.json, the
// Schedule drawer), which overrides the wizard's old weekly day in the engine
// (lib/brand-resolve.mjs applyCadence). So the wizard edits THAT schedule.
// The form holds each row as a comma string ("Wed, Fri"), like its other fields.

export const UPLOAD_DAYS = Object.freeze(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
const WEEKDAYS = UPLOAD_DAYS.slice(0, 5); // the profile's legacy docDay accepts Mon–Fri only

/** "Fri, Wed" | ['Fri','Wed'] → ['Wed','Fri'] (week order, unknown names dropped). */
export function dayList(v) {
  const raw = Array.isArray(v) ? v : String(v ?? '').split(',');
  const on = new Set(raw.map((d) => String(d).trim()));
  return UPLOAD_DAYS.filter((d) => on.has(d));
}

export function daysText(v) {
  return dayList(v).join(', ');
}

export function toggleDay(v, day) {
  const list = dayList(v);
  return daysText(list.includes(day) ? list.filter((d) => d !== day) : [...list, day]);
}

/** Form values for a loaded schedule; no saved days at all → the weekly day, no Shorts days (D2). */
export function formDays(schedule, docDay) {
  const docDays = daysText(schedule?.docDays);
  const shortDays = daysText(schedule?.shortDays);
  return docDays || shortDays ? { docDays, shortDays } : { docDays: daysText([docDay]), shortDays: '' };
}

/** Do the picks differ from the saved schedule? (D7) */
export function daysDirty(saved, form) {
  if (!saved) return false;
  return daysText(saved.docDays) !== daysText(form?.docDays) || daysText(saved.shortDays) !== daysText(form?.shortDays);
}

/** POST /api/channels/schedule body: only the days change (D6). */
export function daysBody(slug, saved, form) {
  return {
    slug,
    docDays: dayList(form?.docDays),
    shortDays: dayList(form?.shortDays),
    shortsSource: saved?.shortsSource === 'clips' ? 'clips' : 'generated',
  };
}

/** The legacy weekly day that goes with the picked days. */
export function weekdayFor(docDays, current) {
  const list = dayList(docDays);
  return list.includes(current) ? current : list.find((d) => WEEKDAYS.includes(d)) || current;
}

/** D8 — plain message when the loaded schedule has no day at all. */
export function daysIssue(form) {
  return dayList(form?.docDays).length || dayList(form?.shortDays).length ? '' : 'Pick at least one upload day.';
}

/** "a short on Wed, Fri · a long video on Tue" for the saved message (D10). */
export function daysSentence(form) {
  const s = daysText(form?.shortDays);
  const l = daysText(form?.docDays);
  return [s && `shorts on ${s}`, l && `a long video on ${l}`].filter(Boolean).join(' and ');
}
