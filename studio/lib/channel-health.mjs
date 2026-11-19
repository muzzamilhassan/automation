// Phase 2 (I5) — one channel = one place. Pure helpers behind /channels/[slug].
// Relative imports only (none needed) so `node --test` can load this file.
//
// Honesty doctrine: every verdict comes from a real /api/overview row. When a
// signal is missing we say "unknown" — a channel is NEVER "Healthy" unless we
// actually saw a working YouTube connection.

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
// a real YouTube video id is exactly 11 url-safe chars
const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

const RANK = { ok: 0, unknown: 1, warn: 2, bad: 3 };
const LABEL = { ok: 'Healthy', unknown: 'Status unknown', warn: 'Needs attention', bad: 'Not uploading' };

export function isValidSlug(slug) {
  return typeof slug === 'string' && SLUG_RE.test(slug);
}

export function channelHref(slug) {
  return `/channels/${encodeURIComponent(slug)}`;
}

export function editHref(slug) {
  // the Add-channel wizard opens its setup form prefilled for ?edit=<slug>
  return `/channels/add?edit=${encodeURIComponent(slug)}`;
}

export function todayUTC(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/** Valid "HH:MM" UTC slots, sorted. Anything malformed is dropped, not guessed. */
export function validSlots(slots) {
  if (!Array.isArray(slots)) return [];
  return slots.filter((s) => typeof s === 'string' && HHMM_RE.test(s.trim())).map((s) => s.trim()).sort();
}

/** Date for today's slot "HH:MM" (UTC). */
export function slotDate(hhmm, now = new Date()) {
  const m = HHMM_RE.exec(String(hhmm || '').trim());
  if (!m) return null;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), Number(m[1]), Number(m[2])));
}

/** true/false when we know; null when the channel has no valid slot to judge by. */
export function firstSlotPassed(slots, now = new Date()) {
  const v = validSlots(slots);
  if (!v.length) return null;
  return slotDate(v[0], now).getTime() <= now.getTime();
}

/**
 * Today's production in plain English, from lastRun/todayVideos/flowPaused.
 * { state: 'made'|'paused'|'missed'|'stale'|'pending'|'never'|'unknown', text }
 */
export function todayProduction(row, now = new Date()) {
  if (!row || typeof row !== 'object') return { state: 'unknown', text: 'Unknown — no data right now' };
  const today = todayUTC(now);
  if (row.lastRun === today) {
    const n = Number.isFinite(row.todayVideos) ? row.todayVideos : null;
    return { state: 'made', text: n === null ? 'Ran today' : `Ran today · ${n} video${n === 1 ? '' : 's'} made` };
  }
  if (row.flowPaused === true) return { state: 'paused', text: 'Not run today — autopilot paused' };
  if (!row.lastRun) return { state: 'never', text: 'No run recorded yet' };
  // more than a day without a run is late no matter what time it is now
  const last = Date.parse(`${row.lastRun}T00:00:00Z`);
  const daysSince = Number.isFinite(last) ? Math.round((Date.parse(`${today}T00:00:00Z`) - last) / 86400000) : null;
  if (daysSince !== null && daysSince > 1) return { state: 'stale', text: `Not run for ${daysSince} days (last run ${row.lastRun})` };
  const passed = firstSlotPassed(row.slots, now);
  if (passed === true) return { state: 'missed', text: 'Not run today' };
  if (passed === false) return { state: 'pending', text: "Today's run hasn't happened yet" };
  return { state: 'unknown', text: 'Not run today (no upload slot set, so no deadline to judge by)' };
}

/** YouTube connection in plain English: { state: 'ok'|'error'|'unknown', text } */
export function youtubeConnection(row) {
  const yt = row?.yt;
  if (yt && typeof yt === 'object' && yt.error) return { state: 'error', text: 'Re-connect needed', detail: String(yt.error) };
  if (yt && typeof yt === 'object') return { state: 'ok', text: 'Connected' };
  return { state: 'unknown', text: "Can't check right now — status unknown" };
}

/**
 * The health verdict for one overview channel row.
 * Returns { level: ok|warn|bad|unknown, label, reasons: string[], nextAction: {label, href, action?} | null }.
 * Reasons are listed worst-first; nextAction is the ONE thing to do about the worst problem.
 * opts.canReconnect=false (clients) swaps the owner-only Google re-connect for "ask the owner".
 */
export function channelHealth(row, { now = new Date(), canReconnect = true } = {}) {
  if (!row || typeof row !== 'object' || !isValidSlug(row.slug)) {
    return { level: 'unknown', label: LABEL.unknown, reasons: ['No data for this channel right now — status unknown'], nextAction: null };
  }
  const slug = row.slug;
  const found = []; // { level, reason, action }

  const conn = youtubeConnection(row);
  if (conn.state === 'error') {
    found.push({
      level: 'bad',
      reason: 'YouTube connection failed — nothing can upload until you re-connect Google',
      action: canReconnect
        ? { label: 'Re-connect Google', href: '/channels/add' }
        : { label: 'Ask the owner to re-connect Google', href: null },
    });
  } else if (conn.state === 'unknown') {
    found.push({ level: 'unknown', reason: "Can't check the YouTube connection right now — status unknown", action: null });
  }

  if (row.flowPaused === true) {
    found.push({
      level: 'warn',
      reason: 'Autopilot paused — nothing new is made; already-scheduled videos still publish',
      action: { label: 'Resume autopilot', href: channelHref(slug), action: 'resume' },
    });
  }

  const prod = todayProduction(row, now);
  if (prod.state === 'missed') {
    found.push({ level: 'warn', reason: "Not run today — the first upload slot has passed and no run was recorded", action: { label: 'See execution logs', href: '/runs' } });
  } else if (prod.state === 'stale') {
    found.push({ level: 'warn', reason: `${prod.text} — the daily run isn't reaching this channel`, action: { label: 'See execution logs', href: '/runs' } });
  } else if (prod.state === 'never') {
    found.push({ level: 'warn', reason: 'No run has been recorded for this channel yet', action: { label: 'Finish setup', href: editHref(slug) } });
  } else if (prod.state === 'unknown') {
    found.push({ level: 'unknown', reason: "Can't tell if today's run is late — no upload slot is set", action: { label: 'Set the schedule', href: editHref(slug) } });
  }

  const broken = Number(row.clipQueue?.broken);
  if (Number.isFinite(broken) && broken > 0) {
    found.push({ level: 'warn', reason: `${broken} clip${broken === 1 ? '' : 's'} in the Shorts queue can't be posted`, action: null });
  }

  if (!found.length) return { level: 'ok', label: LABEL.ok, reasons: [], nextAction: null };

  found.sort((a, b) => RANK[b.level] - RANK[a.level]);
  const level = found[0].level;
  const nextAction = (found.find((f) => f.action) || {}).action || null;
  // a paused channel with nothing else wrong reads "Paused", not a vague "Needs attention"
  const onlyPaused = level === 'warn' && found.filter((f) => f.level === 'warn').length === 1 && row.flowPaused === true;
  return { level, label: onlyPaused ? 'Paused' : LABEL[level], reasons: found.map((f) => f.reason), nextAction };
}

/** Map a verdict level onto the kit's Chip tones. */
export function levelTone(level) {
  return { ok: 'ok', warn: 'warn', bad: 'bad' }[level] || 'plain';
}

/**
 * Which screen to show for a slug, given the overview payload and who is asking.
 * kind: 'invalid' | 'error' | 'found' | 'parked' | 'not-linked' | 'not-found'
 *  - error      → the overview itself failed (never a 404 — we simply don't know)
 *  - parked     → the slug exists (control list) but isn't a producing channel
 *  - not-linked → a client asked for a slug outside their account (we don't say whether it exists)
 */
export function resolveChannelView(slug, overview, role) {
  if (!isValidSlug(slug)) return { kind: 'invalid', row: null };
  if (!overview || overview.error || !Array.isArray(overview.channels)) return { kind: 'error', row: null };
  const row = overview.channels.find((c) => c?.slug === slug);
  if (row) return { kind: 'found', row };
  const ctrl = Array.isArray(overview.controlChannels) ? overview.controlChannels.find((c) => c?.slug === slug) : null;
  if (ctrl) return { kind: 'parked', row: ctrl };
  if (role === 'client') return { kind: 'not-linked', row: null };
  return { kind: 'not-found', row: null };
}

/** This channel's recorded uploads from the overview log, newest first. */
export function channelUploads(logs, slug, limit = 8) {
  if (!Array.isArray(logs)) return [];
  return logs.filter((l) => l?.slug === slug && l.platform === 'YouTube' && l.title).slice(0, limit);
}

/** The soonest still-scheduled YouTube upload for this channel (or null). */
export function nextScheduled(logs, slug, now = new Date()) {
  if (!Array.isArray(logs)) return null;
  const t0 = now.getTime();
  const future = logs
    .filter((l) => l?.slug === slug && l.platform === 'YouTube' && l.at && Date.parse(l.at) > t0)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return future[0] || null;
}

/**
 * Keep only REAL YouTube uploads from /api/thumbs/videos. On failure that route
 * pads the list with placeholder ids ("<slug>-sample-1", "<slug>-doc-latest")
 * and invented titles — those must never render as uploads.
 */
export function realUploads(videos, slug) {
  if (!Array.isArray(videos)) return [];
  const prefix = `${slug}-`;
  return videos.filter((v) => v && typeof v.videoId === 'string' && YT_ID_RE.test(v.videoId) && !v.videoId.startsWith(prefix) && v.title);
}
