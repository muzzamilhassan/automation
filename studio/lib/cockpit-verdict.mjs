// Phase 2 I4 — the cockpit home's one-line answer to "is everything OK?".
// Pure (no React, no fetch, relative imports only) so node --test can prove
// the honesty rules: a source that failed to answer is UNKNOWN, never zero,
// and an unknown source can never produce "All good".
//
// Inputs (all plain data the page already has):
//   channels  — /api/overview `channels` rows, or null when overview is missing
//   warnings  — { status: 'loading'|'ok'|'forbidden'|'error', rows } (useOpenWarnings)
//   review    — { status: 'loading'|'ok'|'forbidden'|'error', count } (/api/review)
//   now       — Date (for the next-slot math)
import { needsYou } from './notify-policy.mjs';

// /api/review answers 401/403 for anyone who isn't owner/staff, 503 when the
// DB is down. Only a 2xx is a real count.
export function reviewStatusFromHttp(httpStatus) {
  if (httpStatus >= 200 && httpStatus < 300) return 'ok';
  if (httpStatus === 401 || httpStatus === 403) return 'forbidden';
  return 'error';
}

// One channel's state for today (the UTC day). A YouTube error outranks
// everything (made videos can't upload), then a deliberate pause, then a
// FAILED run, then what was made / whether it ran.
// Wave A3 (2026-11-20): reads the truthful overview fields — `today` (made
// today from the engine state; null = couldn't read it) and `todayRun` (the
// latest autopilot run today). Rows without them fall back to `todayVideos`.
// States: yt_error | paused | failed | made | waiting | unknown | not_run.
// 'running' is reported as state 'waiting' (a run in progress is not a
// missed day); a succeeded run with nothing new is 'made' (it ran).
export function channelToday(c, now = new Date()) {
  if (c?.health === 'youtube_error' || c?.yt?.error) return { state: 'yt_error', label: "can't reach YouTube", tone: 'bad' };
  if (c?.flowPaused) return { state: 'paused', label: 'paused', tone: 'info' };
  const run = c?.todayRun?.status || null;
  const n = c?.today ? Number(c.today.count) || 0 : Number(c?.todayVideos) || 0;
  if (run === 'failed') return { state: 'failed', label: n > 0 ? `${n} made · run failed` : 'run failed', tone: 'bad' };
  if (n > 0) return { state: 'made', label: `${n} made today`, tone: 'ok' };
  if (run === 'running') return { state: 'waiting', label: 'running now', tone: 'info' };
  if (run === 'succeeded') return { state: 'made', label: 'ran · nothing new', tone: 'ok' };
  // the state file AND the run history didn't answer: unknown, never "made"
  if (c?.today === null && (run === 'unknown' || run === null)) return { state: 'unknown', label: "can't check today", tone: 'warn' };
  // Not run yet is only a problem once today's FIRST slot has passed — before
  // that, the channel is simply waiting (no morning false alarms).
  const first = firstSlotMin(c?.slots, c?.longSlot);
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (first != null && nowMin < first) {
    const hh = String(Math.floor(first / 60)).padStart(2, '0');
    const mm = String(first % 60).padStart(2, '0');
    return { state: 'waiting', label: `first slot ${hh}:${mm} UTC`, tone: 'plain' };
  }
  return { state: 'not_run', label: 'not run today', tone: 'warn' };
}

// Earliest 'HH:MM' UTC slot of the day in minutes, or null when none is set.
function firstSlotMin(slots = [], longSlot = null) {
  const mins = [...(Array.isArray(slots) ? slots : []), ...(longSlot ? [longSlot] : [])]
    .map((x) => /^(\d{1,2}):(\d{2})$/.exec(String(x).trim()))
    .filter(Boolean)
    .map((m) => Number(m[1]) * 60 + Number(m[2]))
    .filter((m) => m < 24 * 60);
  return mins.length ? Math.min(...mins) : null;
}

// Slots are 'HH:MM' in UTC (brands.json / registry). Returns the next one at
// or after `now`, rolling to tomorrow's first slot; null when none are set.
export function nextSlot(slots = [], longSlot = null, now = new Date()) {
  const all = [...(Array.isArray(slots) ? slots : []), ...(longSlot ? [longSlot] : [])]
    .map((s) => /^(\d{1,2}):(\d{2})$/.exec(String(s).trim()))
    .filter(Boolean)
    .map((m) => ({ time: `${m[1].padStart(2, '0')}:${m[2]}`, min: Number(m[1]) * 60 + Number(m[2]) }))
    .filter((s) => s.min < 24 * 60)
    .sort((a, b) => a.min - b.min);
  if (!all.length) return null;
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const today = all.find((s) => s.min >= nowMin);
  const pick = today || all[0];
  const inMin = today ? pick.min - nowMin : 24 * 60 - nowMin + pick.min;
  return { time: pick.time, inMin };
}

// Feedback r1 (2026-11-19): the home row marks the poster / episode only when
// it was made TODAY (UTC, the same day key the production line always used).
// Wave A3: plus 'clip' when a clip Short went up today (overview today.clips).
export function todayMarks(c, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const marks = [];
  if (c?.imageDate === day) marks.push('poster');
  if (c?.deepdiveDate === day) marks.push('episode');
  if (Number(c?.today?.clips) > 0) marks.push('clip');
  return marks;
}

// Feedback r1: home shows the verdict as ONE line (problems are listed only in
// the bell + Inbox). Its link goes where the owner acts: open problems →
// /warnings; only approvals waiting → /review; channel-only issues need no
// link (the channel rows right below show them).
export function verdictHref(verdict) {
  const keys = (verdict?.items || []).map((i) => i.key);
  if (keys.includes('warnings')) return '/warnings';
  if (keys.includes('review')) return '/review';
  return null;
}

export function fmtIn(min) {
  if (min == null) return '';
  if (min < 60) return `in ${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `in ${h}h ${m}m` : `in ${h}h`;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Live fix wave A4 (2026-11-20): the headline number is THE shared needsYou
// count (notify-policy) — the same number /tasks, /warnings and the bell
// show. Channel states (didn't run / paused / YouTube error) stay in `items`
// for the channel rows but are NOT added to the count.
export function deriveVerdict({ channels, warnings, review, now = new Date() } = {}) {
  const items = [];   // things to show: channel states + the alerts/approvals lines
  const unknown = []; // sources that could not be checked — never counted as zero
  let pending = false;
  const counted = { rows: [], awaiting: 0 };

  // channels (from /api/overview)
  let ran = 0;
  let total = 0;
  if (!Array.isArray(channels)) unknown.push('channels');
  else {
    total = channels.length;
    for (const c of channels) {
      const t = channelToday(c, now);
      const name = c.label || c.slug;
      const href = `/channels/${c.slug}`;
      if (t.state === 'made') ran++;
      else if (t.state === 'waiting') continue; // its slot hasn't come yet — not a problem
      else if (t.state === 'yt_error') items.push({ key: `yt:${c.slug}`, tone: 'bad', text: `${name} can't reach YouTube — reconnect Google`, href });
      else if (t.state === 'paused') items.push({ key: `pause:${c.slug}`, tone: 'info', text: `${name} is paused — nothing publishes until you resume it`, href });
      else items.push({ key: `run:${c.slug}`, tone: 'warn', text: `${name} didn't run today`, href });
    }
  }

  // open warnings (useOpenWarnings status contract)
  const ws = warnings?.status;
  if (ws === 'error') unknown.push('warnings');
  else if (ws === 'loading' || ws == null) pending = true;
  else if (ws === 'ok') {
    counted.rows = Array.isArray(warnings.rows) ? warnings.rows : [];
  } // 'forbidden' = a client login; warnings aren't theirs to see

  // scripts waiting for approval (/api/review)
  const rs = review?.status;
  if (rs === 'error') unknown.push('approvals');
  else if (rs === 'loading' || rs == null) pending = true;
  else if (rs === 'forbidden') {
    // a client is expected to be refused; owner/staff being refused means
    // we genuinely don't know the queue
    if (ws !== 'forbidden') unknown.push('approvals');
  } else if (rs === 'ok') {
    counted.awaiting = Number(review.count) || 0;
  }

  const need = needsYou({ rows: counted.rows, awaiting: counted.awaiting });
  const count = need.count;
  if (need.alerts > 0) {
    const blocking = need.groups.some((w) => w.severity === 'blocking');
    items.push({ key: 'warnings', tone: blocking ? 'bad' : 'warn', text: `${plural(need.alerts, 'real problem', 'real problems')} to look at`, href: '/warnings' });
  }
  if (need.approvals > 0) items.push({ key: 'review', tone: 'warn', text: `${plural(need.approvals, 'script', 'scripts')} waiting for your approval — nothing publishes until you approve`, href: '/review' });

  const unknownText = unknown.length ? `Can't check ${unknown.join(' or ')} right now — status unknown` : null;
  const base = { items, unknown, ran, total, count };

  if (count > 0) {
    return { ...base, kind: 'needs_you', tone: items.some((i) => i.tone === 'bad') ? 'bad' : 'warn', headline: `${plural(count, 'thing needs you', 'things need you')}`, sub: unknownText };
  }
  if (unknown.length) {
    return { ...base, kind: 'unknown', tone: 'warn', headline: "Can't check right now — status unknown", sub: `${unknownText}. This is not an all-clear.` };
  }
  if (pending) {
    return { ...base, kind: 'loading', tone: 'plain', headline: 'Checking your channels…', sub: null };
  }
  if (!total) {
    return { ...base, kind: 'empty', tone: 'plain', headline: 'No live channels yet', sub: 'Add a channel to start the machine.' };
  }
  if (items.length) {
    // Only channel states: nothing is counted; say what the rows below show.
    const n = (p) => items.filter((i) => i.key.startsWith(p)).length;
    const parts = [
      n('yt:') ? `${n('yt:')} can't reach YouTube` : '',
      n('run:') ? `${n('run:')} didn't run today` : '',
      n('pause:') ? `${n('pause:')} paused` : '',
    ].filter(Boolean);
    const tone = n('yt:') ? 'bad' : n('run:') ? 'warn' : 'info';
    return { ...base, kind: 'all_good', tone, headline: 'Nothing needs you', sub: `Channels: ${parts.join(' · ')} — see the rows below.` };
  }
  return { ...base, kind: 'all_good', tone: 'ok', headline: `All good — ${plural(ran, 'channel', 'channels')} ran today`, sub: 'No real problems and nothing waiting for approval.' };
}
