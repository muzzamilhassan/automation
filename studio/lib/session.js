// 10-09 A1 SESSION COOKIE — signed claims + opaque token, verifiable in the
// Edge proxy (cheap HMAC gate) AND resolvable to a revocable DB session in
// every route (the truth lives in Neon sessions table).
//   cookie = hex(json{ t, e, r, n, x }).hmac(hexjson)
//   t = opaque session token (DB-backed, revocable) · e = email · r = role
//   n = name · x = expiry ms
// Legacy pre-A1 cookies (HMAC json without t) still parse via parseSession.
import { hmacToken } from './auth-token';

const KEY = () => process.env.STUDIO_PASSWORD || process.env.YOUTUBE_CLIENT_SECRET || 'quarry-connect';
const hex = (str) => [...new TextEncoder().encode(str)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (h) => {
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < h.length; i += 2) bytes[i / 2] = parseInt(h.slice(i, i + 2), 16);
  return new TextDecoder().decode(bytes);
};

// claims: { t: opaqueToken, e: email, r: role, n: name, x: expiryMs }
export async function signSessionCookie(claims) {
  const body = hex(JSON.stringify(claims));
  return `${body}.${await hmacToken(body, KEY())}`;
}

// returns { t, e, r, n, x } for BOTH formats (new opaque / legacy claims), or null
export async function parseSessionCookie(val) {
  try {
    const m = /^([0-9a-f]+)\.([0-9a-f]{64})$/.exec(String(val || ''));
    if (!m) return null;
    if ((await hmacToken(m[1], KEY())) !== m[2]) return null;
    const claims = JSON.parse(unhex(m[1]));
    if (!claims?.e || !claims?.r) return null;
    return claims;
  } catch {
    return null;
  }
}

// LEGACY (pre-A1) format — hex(json{email,role,exp}).hmac — kept so existing
// cookies keep working until their natural 30-day expiry.
export async function signSession(payload) {
  const body = hex(JSON.stringify(payload));
  return `${body}.${await hmacToken(body, KEY())}`;
}

export async function parseSession(cookieVal) {
  try {
    const m = /^([0-9a-f]+)\.([0-9a-f]{64})$/.exec(String(cookieVal || ''));
    if (!m) return null;
    if ((await hmacToken(m[1], KEY())) !== m[2]) return null;
    const payload = JSON.parse(unhex(m[1]));
    if (!payload?.email || !payload?.role || Number(payload.exp) < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
