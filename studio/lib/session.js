// 10-08 ROLE-BASED ACCESS — signed per-person sessions.
// Cookie qs_session = <hex(json)>.<hmac(json)> — verifiable in the Edge proxy
// AND in Node routes (same crypto.subtle helper as the connect links).
// { email, role: 'owner'|'staff'|'client', exp } — 30 days.
import { hmacToken } from './auth-token';

const KEY = () => process.env.STUDIO_PASSWORD || process.env.YOUTUBE_CLIENT_SECRET || 'quarry-connect';
const hex = (str) => [...new TextEncoder().encode(str)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (h) => {
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < h.length; i += 2) bytes[i / 2] = parseInt(h.slice(i, i + 2), 16);
  return new TextDecoder().decode(bytes);
};

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
