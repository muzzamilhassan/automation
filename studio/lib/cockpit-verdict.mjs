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

// /api/review answers 401/403 for anyone who isn't owner/staff, 503 when the
// DB is down. Only a 2xx is a real count.
export function reviewStatusFromHttp(httpStatus) {
  if (httpStatus >= 200 && httpStatus < 300) return 'ok';
  if (httpStatus === 401 || httpStatus === 403) return 'forbidden';
  return 'error';
}

// One channel's state for today. A YouTube error outranks everything (made
// videos can't upload), then a deliberate pause, then did-it-run.
export function channelToday(c, now = new Date()) {
  if (c?.health === 'youtube_error' || c?.yt?.error) return { state: 'yt_error', label: "can't reach YouTube", tone: 'bad' };
  if (c?.flowPaused) return { state: 'paused', label: 'paused', tone: 'info' };
  if (Number(c?.todayVideos) > 0) return { state: 'made', label: `${c.todayVideos} made today`, tone: 'ok' };
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

export function fmtIn(min) {
  if (min == null) return '';
  if (min < 60) return `in ${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `in ${h}h ${m}m` : `in ${h}h`;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function deriveVerdict({ channels, warnings, review, now = new Date() } = {}) {
  const items = [];   // things that need the owner — each one counts
  const unknown = []; // sources that could not be checked — never counted as zero
  let pending = false;

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
    const rows = Array.isArray(warnings.rows) ? warnings.rows : [];
    if (rows.length) {
      const blocking = rows.some((w) => w.severity === 'blocking');
      items.push({ key: 'warnings', tone: blocking ? 'bad' : 'warn', text: `${plural(rows.length, 'real problem', 'real problems')} to look at`, href: '/warnings' });
    }
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
    const n = Number(review.count) || 0;
    if (n > 0) items.push({ key: 'review', tone: 'warn', text: `${plural(n, 'script', 'scripts')} waiting for your approval — nothing publishes until you approve`, href: '/review' });
  }

  const unknownText = unknown.length ? `Can't check ${unknown.join(' or ')} right now — status unknown` : null;

  if (items.length) {
    return { kind: 'needs_you', tone: items.some((i) => i.tone === 'bad') ? 'bad' : 'warn', headline: `${plural(items.length, 'thing needs you', 'things need you')}`, sub: unknownText, items, unknown, ran, total };
  }
  if (unknown.length) {
    return { kind: 'unknown', tone: 'warn', headline: "Can't check right now — status unknown", sub: `${unknownText}. This is not an all-clear.`, items, unknown, ran, total };
  }
  if (pending) {
    return { kind: 'loading', tone: 'plain', headline: 'Checking your channels…', sub: null, items, unknown, ran, total };
  }
  if (!total) {
    return { kind: 'empty', tone: 'plain', headline: 'No live channels yet', sub: 'Add a channel to start the machine.', items, unknown, ran, total };
  }
  return { kind: 'all_good', tone: 'ok', headline: `All good — ${plural(ran, 'channel', 'channels')} ran today`, sub: 'No real problems and nothing waiting for approval.', items, unknown, ran, total };
}
