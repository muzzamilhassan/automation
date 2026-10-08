// 10-08 ROLE-BASED ACCESS — the invite list + Google identity check.
// access.json lists WHO may sign in and with which role:
//   { "users": [ { "email": "x@gmail.com", "role": "owner|staff|client", "name": "..." } ] }
// Adding a teammate = add one line to that file. Emails are not secrets.
import fs from 'node:fs';
import path from 'node:path';
import { ENV } from './data.mjs';

const FILE = path.join(process.cwd(), 'lib', 'access.json');

export function accessList() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8')).users || [];
  } catch {
    return [];
  }
}

export function roleForEmail(email) {
  const e = String(email || '').toLowerCase();
  if (!e) return null;
  const u = accessList().find((u) => String(u.email || '').toLowerCase() === e);
  return u ? (u.role || 'staff') : null;
}

// Verifies a Google id_token server-side via Google's tokeninfo endpoint
// (Google checks the signature for us) and confirms it was issued to OUR client.
export async function verifyGoogleIdToken(idToken) {
  if (!idToken) return null;
  try {
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!r.ok) return null;
    const d = await r.json();
    const clientId = ENV.YOUTUBE_CLIENT_ID || '';
    if (clientId && d.aud !== clientId) return null;
    if (d.email_verified !== 'true' && d.email_verified !== true) return null;
    return { email: String(d.email || '').toLowerCase(), name: d.name || '', picture: d.picture || '' };
  } catch {
    return null;
  }
}
