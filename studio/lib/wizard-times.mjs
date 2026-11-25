// Add Channel wizard — exact times (docs/qa/wizard-upload-days-qa.md, round 2).
// Pure. Form values are UTC "HH:MM" strings, like every other time in the wizard.
// Saved through POST /api/channels/schedule, the same place as the Schedule drawer.
import { UPLOAD_DAYS, dayList } from './wizard-days.mjs';

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const CRON_RE = /^(\d{1,2}) (\d{1,2}) \* \* \*$/;
const pad = (n) => String(n).padStart(2, '0');
const isTime = (v) => HHMM_RE.test(String(v ?? ''));
const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

/** '0 5 * * *' → '05:00'; anything else → ''. */
export function startFromCron(cron) {
  const m = CRON_RE.exec(String(cron ?? '').trim());
  if (!m || Number(m[1]) > 59 || Number(m[2]) > 23) return '';
  return `${pad(Number(m[2]))}:${pad(Number(m[1]))}`;
}

/** '05:00' → '0 5 * * *' (the engine's daily start); '' when unset. */
export function cronFromStart(hhmm) {
  if (!isTime(hhmm)) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${m} ${h} * * *`;
}

/** GET /api/channels/schedule → the two times (T1). */
export function formTimes(d) {
  const long = String(d?.publish?.long ?? '');
  return { longSlot: isTime(long) ? long : '', startAt: startFromCron(d?.gateCron) };
}

/** Only changed, filled times go out; nothing when the schedule was never read (T4). */
export function timesBody(saved, form) {
  const out = {};
  if (!saved) return out;
  if (isTime(form?.longSlot) && form.longSlot !== (saved.longSlot || '')) out.longSlot = form.longSlot;
  if (isTime(form?.startAt) && form.startAt !== (saved.startAt || '')) out.gateCron = cronFromStart(form.startAt);
  return out;
}

/** Plain sentence when the server did not store a sent time, else '' (T5). */
export function timesMissed(sent, answer) {
  const miss = [];
  if (sent?.longSlot && answer?.publishSaved?.longSlot !== sent.longSlot) miss.push('the long-video time');
  if (sent?.gateCron && answer?.gateCron !== sent.gateCron) miss.push('the autopilot start time');
  return miss.length ? `${miss.join(' and ')} did not save. Press Save again.` : '';
}

/** Minutes from the autopilot start to the next go-public time; null when either is unset. */
export function leadMinutes(startAt, hhmm) {
  if (!isTime(startAt) || !isTime(hhmm)) return null;
  return (minutes(hhmm) - minutes(startAt) + 1440) % 1440 || 1440;
}

/**
 * The next time a video goes public (T3): a listed UTC day's run, at its first
 * go-public time after the start (the engine rolls a passed time to the next
 * day). null when the days or the time are missing.
 */
export function nextPublic(days, hhmm, startAt, now = new Date()) {
  const list = dayList(days);
  if (!list.length || !isTime(hhmm)) return null;
  const rolls = isTime(startAt) && minutes(hhmm) <= minutes(startAt) ? 1440 : 0;
  for (let i = -1; i <= 8; i++) {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i));
    if (!list.includes(UPLOAD_DAYS[(day.getUTCDay() + 6) % 7])) continue;
    const at = new Date(day.getTime() + (minutes(hhmm) + rolls) * 60000);
    if (at > now) return at;
  }
  return null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Thu 26 Nov, 10:00 pm" on the viewer's clock (offsetMin = minutes ahead of UTC). */
export function dateText(at, offsetMin = 0) {
  if (!(at instanceof Date) || Number.isNaN(at.getTime())) return '';
  const l = new Date(at.getTime() + offsetMin * 60000);
  const h = l.getUTCHours();
  return `${UPLOAD_DAYS[(l.getUTCDay() + 6) % 7]} ${l.getUTCDate()} ${MONTHS[l.getUTCMonth()]}, ${h % 12 || 12}:${pad(l.getUTCMinutes())} ${h < 12 ? 'am' : 'pm'}`;
}

export const MIN_LEAD_MIN = 180; // approve + render (T6)

/** Warning when the start leaves too little time before a video goes public, else ''. */
export function leadWarning(startAt, times) {
  const leads = (Array.isArray(times) ? times : []).map((t) => leadMinutes(startAt, t)).filter((n) => n != null);
  if (!leads.length) return '';
  const min = Math.min(...leads);
  if (min >= MIN_LEAD_MIN) return '';
  const h = Math.floor(min / 60);
  const gap = h ? `${h} hour${h === 1 ? '' : 's'}` : `${min} minutes`;
  return `Only about ${gap} between the start and a video going public. Leave at least 3 hours to approve and render.`;
}

/**
 * What the owner typed → 'HH:MM' (24-hour, same clock as typed), or null.
 * Understands "10:07 pm", "10pm", "1007PM", "10.07 p.m.", "22:07", "9:35".
 * A bare hour needs am/pm ("10" alone is refused: it could be either).
 */
export function parseClock(text) {
  const t = String(text ?? '').trim().toLowerCase().replace(/\./g, (m, i, s) => (/\d\.\d/.test(s.slice(i - 1, i + 2)) ? ':' : ''));
  const m = /^(\d{1,2})(?::?([0-5]\d))?\s*([ap])?\s*m?$/.exec(t);
  if (!m) return null;
  const half = m[3];
  if (!half && (m[2] === undefined || /m$/.test(t))) return null;
  let h = Number(m[1]);
  if (half ? h < 1 || h > 12 : h > 23) return null;
  if (half) h = (h % 12) + (half === 'p' ? 12 : 0);
  return `${pad(h)}:${m[2] || '00'}`;
}
