// 10-08 ROLE-BASED ACCESS — the invite list + Google identity check.
// access.json (yt-mcp/access.json, committed to the repo) lists WHO may sign
// in and with which role:
//   { "users": [ { "email": "x@gmail.com", "role": "owner|staff|client", "name": "..." } ] }
// Adding a teammate = one line in the file (or the Settings → Team screen).
// Fallback: the bundled lib/access.json (owner) so the owner can always log in
// even if GitHub is unreachable.
import fs from 'node:fs';
import path from 'node:path';
import { ENV } from './data.mjs';
import { readRepoJSON } from './channels-registry.js';

const FALLBACK = path.join(process.cwd(), 'lib', 'access.json');

function accessListSync() {
  try {
    return JSON.parse(fs.readFileSync(FALLBACK, 'utf8')).users || [];
  } catch {
    return [];
  }
}

export async function accessList() {
  try {
    const repo = await readRepoJSON('yt-mcp/access.json');
    if (repo?.users?.length) return repo.users;
  } catch { }
  return accessListSync();
}

export async function roleForEmail(email) {
  const e = String(email || '').toLowerCase();
  if (!e) return null;
  const users = await accessList();
  const u = users.find((u) => String(u.email || '').toLowerCase() === e);
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
