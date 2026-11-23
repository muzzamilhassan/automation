// Settings › Accounts (owner-approved 2026-11-23) — per connected account:
// is it healthy, which channel uses it, what can it do, does it ask the owner
// first, and the ONE fix button. Pure shaping + injectable live checkers so
// `node --test` can prove every rule (tests/accounts-health.test.mjs).
//
// Honesty doctrine: a row is `connected` only when a REAL check passed. A
// check that can't run, times out or errors is `unknown` ("Can't check …") —
// never a guess. Tokens, secrets and raw error bodies never leave this module:
// errors are reduced to a classification before they reach a row.
//
// No imports (the panel's client component reads the UI helpers too).

export const STATUS_WORDS = Object.freeze({
  connected: 'Connected',
  needs_relogin: 'Needs re-login',
  not_connected: 'Not connected',
  unknown: "Can't check",
});

const CAN_DO_WORDS = { upload: 'upload', analytics: 'read analytics', 'cross-post': 'cross-post' };
const KIND_ORDER = { youtube: 0, facebook: 1, instagram: 2, threads: 3 };
// Meta's token tool — where a new Facebook/Instagram token is made
const META_TOKEN_HREF = 'https://developers.facebook.com/tools/explorer/';
const CANT_NOW = "Can't check right now";
const CANT_PANEL = "Can't check from the panel";

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const at = (handle) => {
  const h = str(handle).replace(/^@/, '');
  return h ? `@${h}` : undefined;
};

// ---------- live-check helpers ----------

/** Run a check with a deadline. Never throws → { ok:true, value } | { ok:false, reason:'timeout'|'error' }. */
export async function withTimeout(fn, ms) {
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, reason: 'timeout' }), ms);
  });
  const run = Promise.resolve()
    .then(fn)
    .then((value) => ({ ok: true, value }), () => ({ ok: false, reason: 'error' }));
  try {
    return await Promise.race([run, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** A live YouTube read error (lib/data.mjs ytChannels) → 'auth' | 'missing' | 'unknown'. */
export function classifyYtError(msg) {
  const m = str(msg).toLowerCase();
  // ytAccessToken throws "no yt token" when Google answers without an access
  // token — the saved sign-in was refused (revoked / expired / invalid_grant)
  if (/no yt token|invalid_grant|unauthorized_client|token has been expired or revoked/.test(m)) return 'auth';
  // the panel has no copy of the key (the engine's GitHub secret is invisible here)
  if (/no token on the server|no encrypted token/.test(m)) return 'missing';
  return 'unknown';
}

/** ytChannels() rows → { [slug]: {ok,title,handle} | {error} } (classification only), null = read failed. */
export function ytStatusFromChannels(rows) {
  if (!Array.isArray(rows)) return null;
  const out = {};
  for (const r of rows) {
    if (!isObj(r) || !str(r.slug)) continue;
    out[r.slug] = r.error
      ? { error: classifyYtError(r.error) }
      : { ok: true, title: str(r.ytTitle), handle: str(r.ytCustomUrl) };
  }
  return out;
}

/**
 * The engine's review-gate verdict per channel — the last-known cache it
 * writes into yt-mcp/state/<slug>.json (`reviewGate.gated`, lib/review-gate.mjs).
 * null = the state read answered nothing (can't tell).
 */
export function gatesFromState(state, slugs) {
  if (!isObj(state) || !Object.keys(state).length) return null;
  const out = {};
  for (const slug of slugs || []) {
    const g = state[slug]?.reviewGate?.gated;
    out[slug] = typeof g === 'boolean' ? g : null;
  }
  return out;
}

function graphErrorCode(body) {
  const c = Number(body?.error?.code);
  return Number.isFinite(c) ? c : null;
}
// 190 = invalid / expired OAuth token, 102 = session invalid → a new login fixes it
const isGraphAuthCode = (c) => c === 190 || c === 102;

function shapePage(p) {
  const ig = isObj(p?.instagram_business_account) ? p.instagram_business_account : null;
  return {
    id: String(p.id),
    name: str(p.name),
    ig: ig && ig.id ? { id: String(ig.id), username: str(ig.username) } : null,
  };
}

/**
 * The fleet Facebook token, checked for real (lib/data.mjs fbPages swallows
 * Graph errors — this one doesn't). → { state:'ok', pages } | { state:'auth' }
 * | { state:'unreadable' } (no token on the panel) | { state:'unknown' }.
 */
export async function checkFacebook({ token, fetchImpl = globalThis.fetch, timeoutMs = 5000 } = {}) {
  if (!str(token)) return { state: 'unreadable' };
  const base = 'https://graph.facebook.com/v20.0';
  const get = async (pathAndQuery) => {
    const res = await fetchImpl(`${base}/${pathAndQuery}&access_token=${encodeURIComponent(str(token))}`, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    return { status: res.status, body };
  };
  try {
    const r = await get('me/accounts?fields=id,name,instagram_business_account{id,username}&limit=100');
    if (r.status >= 200 && r.status < 300 && Array.isArray(r.body?.data)) {
      return { state: 'ok', pages: r.body.data.filter((p) => p && p.id).map(shapePage) };
    }
    const code = graphErrorCode(r.body);
    if (isGraphAuthCode(code)) return { state: 'auth' };
    if (code === 100) {
      // a Page token: `me` IS the Page (no /accounts edge)
      const p = await get('me?fields=id,name,instagram_business_account{id,username}');
      if (p.status >= 200 && p.status < 300 && p.body?.id) return { state: 'ok', pages: [shapePage(p.body)] };
      if (isGraphAuthCode(graphErrorCode(p.body))) return { state: 'auth' };
    }
    return { state: 'unknown' };
  } catch {
    return { state: 'unknown' };
  }
}

/** Threads token as the panel can see it (env JSON → env token → local file). Never leaves the server. */
export function threadsTokenFrom({ envJson, envToken, fileText } = {}) {
  const parse = (text) => {
    try {
      const j = JSON.parse(text);
      if (!isObj(j) || !str(j.access_token)) return null;
      const exp = Number(j.expires_at);
      return { token: str(j.access_token), expiresAt: Number.isFinite(exp) ? exp : null, username: str(j.username) };
    } catch {
      return null;
    }
  };
  if (str(envJson)) {
    const j = parse(envJson);
    if (j) return j;
  }
  if (str(envToken)) return { token: str(envToken), expiresAt: null, username: '' };
  if (str(fileText)) return parse(fileText);
  return null;
}

/** → { state:'ok', username } | { state:'auth' } | { state:'unreadable' } | { state:'unknown' }. */
export async function checkThreads({ token, expiresAt = null, fetchImpl = globalThis.fetch, timeoutMs = 5000, now = Date.now() } = {}) {
  if (!str(token)) return { state: 'unreadable' };
  // Threads tokens hard-expire (60 days) — past the stamp, no call can work
  if (Number.isFinite(expiresAt) && expiresAt <= now) return { state: 'auth' };
  try {
    const res = await fetchImpl(`https://graph.threads.net/v1.0/me?fields=id,username&access_token=${encodeURIComponent(str(token))}`, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    if (res.status >= 200 && res.status < 300 && body?.id) return { state: 'ok', username: str(body.username) };
    if (isGraphAuthCode(graphErrorCode(body)) || res.status === 401) return { state: 'auth' };
    return { state: 'unknown' };
  } catch {
    return { state: 'unknown' };
  }
}

// ---------- shaping ----------

function tokenSavedFor(readiness, slug) {
  if (!isObj(readiness)) return null;
  const r = readiness[slug];
  if (typeof r === 'boolean') return r;
  const item = Array.isArray(r?.items) ? r.items.find((i) => i && i.key === 'youtube') : null;
  return item ? item.ok === true : null;
}

function row({ id, kind, label, channel, handle, status, canDo, asksFirst = null, problem, fix, checkedAt }) {
  const out = { id, kind, label };
  if (channel) out.channel = { slug: channel.slug, name: channel.name };
  if (handle) out.handle = handle;
  out.status = status;
  out.canDo = status === 'connected' ? [...canDo] : [];
  out.asksFirst = typeof asksFirst === 'boolean' ? asksFirst : null;
  if (problem && status !== 'connected') out.problem = problem;
  if (fix && (status === 'needs_relogin' || status === 'not_connected')) out.fix = { ...fix };
  out.checkedAt = checkedAt;
  return out;
}

function youtubeRow(ch, { readiness, ytStatus, openWarnings, gates, checkedAt }) {
  const slug = ch.slug;
  const saved = tokenSavedFor(readiness, slug);
  const live = isObj(ytStatus) ? ytStatus[slug] || null : null;
  const revoked = Array.isArray(openWarnings) && openWarnings.some((w) => w && w.channel_id === slug && w.code === 'token_revoked');
  const base = {
    id: `youtube:${slug}`,
    kind: 'youtube',
    label: 'YouTube',
    channel: ch,
    handle: live?.ok ? at(live.handle) : undefined,
    canDo: ['upload', 'analytics'],
    asksFirst: isObj(gates) ? gates[slug] : null,
    checkedAt,
  };
  const reconnect = { label: 'Reconnect', action: 'oauth' };
  if (revoked) return row({ ...base, status: 'needs_relogin', problem: 'Google sign-in was revoked — uploads are stopped', fix: reconnect });
  if (live?.error === 'auth') return row({ ...base, status: 'needs_relogin', problem: 'Google refused the saved sign-in — uploads are stopped', fix: reconnect });
  if (saved === false) return row({ ...base, status: 'not_connected', problem: 'No YouTube key saved — nothing can upload', fix: { label: 'Connect', action: 'link', href: '/channels/add' } });
  if (saved === null) return row({ ...base, status: 'unknown', problem: CANT_NOW });
  if (live?.ok) return row({ ...base, status: 'connected' });
  if (live?.error === 'missing') return row({ ...base, status: 'unknown', problem: CANT_PANEL });
  return row({ ...base, status: 'unknown', problem: CANT_NOW });
}

function facebookRows(channels, fbCheck, checkedAt) {
  const out = [];
  const state = fbCheck?.state || null;
  const reconnect = { label: 'Reconnect', action: 'link', href: META_TOKEN_HREF };
  for (const ch of channels) {
    const pageId = str(ch.fbPageId);
    if (!pageId) continue;
    const base = { id: `facebook:${ch.slug}:${pageId}`, kind: 'facebook', label: 'Facebook Page', channel: ch, canDo: ['cross-post'], checkedAt };
    if (state === 'ok') {
      const page = (fbCheck.pages || []).find((p) => p && String(p.id) === pageId);
      if (!page) {
        out.push(row({ ...base, status: 'not_connected', problem: "The Facebook login can't reach this Page", fix: { label: 'Connect', action: 'link', href: META_TOKEN_HREF } }));
        continue;
      }
      out.push(row({ ...base, handle: str(page.name) || undefined, status: 'connected' }));
      if (page.ig && page.ig.id) {
        out.push(row({
          id: `instagram:${ch.slug}:${page.ig.id}`,
          kind: 'instagram',
          label: 'Instagram',
          channel: ch,
          handle: at(page.ig.username),
          status: 'connected',
          canDo: ['cross-post'],
          checkedAt,
        }));
      }
    } else if (state === 'auth') {
      out.push(row({ ...base, status: 'needs_relogin', problem: 'Facebook login expired — Instagram posts stop too', fix: reconnect }));
    } else if (state === 'unreadable') {
      out.push(row({ ...base, status: 'unknown', problem: CANT_PANEL }));
    } else {
      out.push(row({ ...base, status: 'unknown', problem: CANT_NOW }));
    }
  }
  return out;
}

function threadsRows(channels, threadsCheck, checkedAt) {
  const out = [];
  const seen = new Set();
  const state = threadsCheck?.state || null;
  for (const ch of channels) {
    const handle = str(ch.threadsHandle).replace(/^@/, '');
    if (!handle || seen.has(handle.toLowerCase())) continue;
    seen.add(handle.toLowerCase());
    const base = { id: `threads:${handle.toLowerCase()}`, kind: 'threads', label: 'Threads', channel: ch, handle: at(handle), canDo: ['cross-post'], checkedAt };
    if (state === 'ok') {
      const same = str(threadsCheck.username).replace(/^@/, '').toLowerCase() === handle.toLowerCase();
      out.push(same
        ? row({ ...base, status: 'connected' })
        : row({ ...base, status: 'not_connected', problem: 'Signed in to a different Threads account' }));
    } else if (state === 'auth') {
      // the Threads login is made on the PC (threads-publisher.mjs) — no panel button
      out.push(row({ ...base, status: 'needs_relogin', problem: 'Threads login expired — sign in again on the PC' }));
    } else if (state === 'unreadable') {
      out.push(row({ ...base, status: 'unknown', problem: CANT_PANEL }));
    } else {
      out.push(row({ ...base, status: 'unknown', problem: CANT_NOW }));
    }
  }
  return out;
}

/**
 * Every account row, YouTube first.
 * @param {object} p
 * @param {Array<{slug,name,fbPageId?,threadsHandle?}>} p.channels  real channels only
 * @param {object|null} p.readiness   { [slug]: readiness result | boolean } (null = setup unreadable)
 * @param {object|null} p.ytStatus    ytStatusFromChannels() (null = live read failed / timed out)
 * @param {Array|null}  p.openWarnings open warning rows (only token_revoked matters; null = unreadable)
 * @param {object|null} p.fbCheck     checkFacebook() result (null = timed out)
 * @param {object|null} p.threadsCheck checkThreads() result (null = timed out)
 * @param {object|null} p.gates       gatesFromState() (null = unknown)
 */
export function buildAccounts({ channels, readiness = null, ytStatus = null, openWarnings = null, fbCheck = null, threadsCheck = null, gates = null, now = new Date() } = {}) {
  const checkedAt = new Date(now).toISOString();
  const list = (Array.isArray(channels) ? channels : [])
    .filter((c) => isObj(c) && str(c.slug))
    .map((c) => ({ slug: str(c.slug), name: str(c.name) || str(c.slug), fbPageId: c.fbPageId, threadsHandle: c.threadsHandle }));
  const rows = [
    ...list.map((ch) => youtubeRow(ch, { readiness, ytStatus, openWarnings, gates, checkedAt })),
    ...facebookRows(list, fbCheck, checkedAt),
    ...threadsRows(list, threadsCheck, checkedAt),
  ];
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => KIND_ORDER[a.r.kind] - KIND_ORDER[b.r.kind] || a.i - b.i)
    .map(({ r }) => r);
}

// ---------- UI helpers ----------

/** "4 connected · 1 needs you · 1 can't check" */
export function accountsSummary(accounts) {
  const list = Array.isArray(accounts) ? accounts : [];
  const connected = list.filter((a) => a?.status === 'connected').length;
  const needsYou = list.filter((a) => a?.status === 'needs_relogin' || a?.status === 'not_connected').length;
  const unknown = list.filter((a) => a?.status === 'unknown').length;
  const parts = [];
  if (connected) parts.push(`${connected} connected`);
  if (needsYou) parts.push(`${needsYou} needs you`);
  if (unknown) parts.push(`${unknown} can't check`);
  return { connected, needsYou, unknown, total: list.length, text: parts.length ? parts.join(' · ') : 'No accounts yet' };
}

/** The one muted line under a row: what it can do (healthy) or what's wrong. */
export function accountLine(a) {
  if (!a || a.status !== 'connected') return str(a?.problem);
  const can = (a.canDo || []).map((k) => CAN_DO_WORDS[k] || k);
  const parts = can.length ? [`Can ${can.join(' · ')}`] : [];
  if (a.asksFirst === true) parts.push('asks you first');
  else if (a.asksFirst === false) parts.push('posts without asking');
  return parts.join(' · ');
}
