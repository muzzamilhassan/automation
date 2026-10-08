// Server-side store for channels connected through the Studio "Add Channel"
// wizard. Two responsibilities:
//   1. Registry — yt-mcp/studio-channels.json (committed to the repo, NO tokens
//      in it) so Studio pages and the engine can see what was connected.
//   2. Token placement — the channel's OAuth refresh token goes into the
//      YT_TOKEN_<SLUG> GitHub secret (the exact convention the CI workflows
//      and Studio's cloud data loader already read), and, in local mode, into
//      the gitignored yt-mcp/channels/<slug>/token.json like oauth-reauth.mjs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ENV } from './data.mjs';

const REG_PATH = 'yt-mcp/studio-channels.json';
const REPO = ENV.GITHUB_REPO || 'muzzamilhassan/automation';
const TOKEN = ENV.GITHUB_TOKEN || ENV.GITHUB_PAT || '';
const ROOT = path.resolve(process.cwd(), '..');
const CLOUD = ENV.FORCE_GITHUB === '1' || !fs.existsSync(path.resolve(ROOT, 'yt-mcp'));

export const REGISTRY_MODE = CLOUD ? 'cloud' : 'local';

const ghHeaders = (extra = {}) => ({
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'quarry-studio',
  'X-GitHub-Api-Version': '2022-11-28',
  ...extra,
});

export function hasGithubToken() {
  return Boolean(TOKEN);
}

// ---------- encrypted token at rest (dashboard read-back for wizard channels) ----------

function encKey() {
  return crypto.createHash('sha256').update(String(process.env.STUDIO_PASSWORD || ENV.YOUTUBE_CLIENT_SECRET || 'quarry-connect')).digest();
}

export function encryptJSON(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join('.');
}

export function decryptJSON(s) {
  try {
    const [iv, tag, ct] = String(s).split('.').map((p) => Buffer.from(p, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', encKey(), iv);
    d.setAuthTag(tag);
    return JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString('utf8'));
  } catch {
    return null;
  }
}

export async function registryChannels() {
  const reg = await readRegistry().catch(() => null);
  return (reg?.channels || []).filter((c) => c.active !== false);
}

// ---------- generic repo JSON (10-05 PHASE B: Topic Desk queues live here) ----------

export async function readRepoJSON(repoPath) {
  if (!CLOUD) {
    try {
      return JSON.parse(fs.readFileSync(path.join(ROOT, repoPath), 'utf8'));
    } catch {
      return null;
    }
  }
  if (!TOKEN) throw new Error('no GITHUB_TOKEN on the server');
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${repoPath}?ref=main`, {
    headers: ghHeaders({ Accept: 'application/vnd.github.raw' }),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`github ${res.status} reading ${repoPath}`);
  return JSON.parse(await res.text());
}

export async function writeRepoJSON(repoPath, data, message) {
  const body = JSON.stringify(data, null, 2) + '\n';
  if (!CLOUD) {
    fs.mkdirSync(path.dirname(path.join(ROOT, repoPath)), { recursive: true });
    fs.writeFileSync(path.join(ROOT, repoPath), body);
    return { ok: true, mode: 'local' };
  }
  const cur = await fetch(`https://api.github.com/repos/${REPO}/contents/${repoPath}?ref=main`, {
    headers: ghHeaders(),
  });
  const sha = cur.ok ? (await cur.json()).sha : undefined;
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${repoPath}`, {
    method: 'PUT',
    headers: ghHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      message,
      content: Buffer.from(body, 'utf8').toString('base64'),
      branch: 'main',
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) throw new Error(`github ${res.status} committing ${repoPath}: ${(await res.text()).slice(0, 120)}`);
  return { ok: true, mode: 'cloud' };
}

export async function readRegistry() {
  if (!CLOUD) {
    try {
      return JSON.parse(fs.readFileSync(path.join(ROOT, 'yt-mcp', 'studio-channels.json'), 'utf8'));
    } catch {
      return { channels: [] };
    }
  }
  if (!TOKEN) throw new Error('no GITHUB_TOKEN on the server');
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${REG_PATH}?ref=main`, {
    headers: ghHeaders({ Accept: 'application/vnd.github.raw' }),
  });
  if (res.status === 404) return { channels: [] };
  if (!res.ok) throw new Error(`github ${res.status} reading registry`);
  return JSON.parse(await res.text());
}

export async function writeRegistry(registry, message) {
  const body = JSON.stringify(registry, null, 2) + '\n';
  if (!CLOUD) {
    fs.writeFileSync(path.join(ROOT, 'yt-mcp', 'studio-channels.json'), body);
    return { ok: true, mode: 'local' };
  }
  const cur = await fetch(`https://api.github.com/repos/${REPO}/contents/${REG_PATH}?ref=main`, {
    headers: ghHeaders(),
  });
  const sha = cur.ok ? (await cur.json()).sha : undefined;
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${REG_PATH}`, {
    method: 'PUT',
    headers: ghHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      message,
      content: Buffer.from(body, 'utf8').toString('base64'),
      branch: 'main',
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) throw new Error(`github ${res.status} committing registry: ${(await res.text()).slice(0, 120)}`);
  return { ok: true, mode: 'cloud' };
}

export async function upsertChannel(entry, message) {
  const reg = await readRegistry();
  const channels = (reg.channels || []).filter((c) => c.slug !== entry.slug);
  channels.push(entry);
  channels.sort((a, b) => a.slug.localeCompare(b.slug));
  return writeRegistry({ channels }, message || `studio: connect channel ${entry.slug}`);
}

// Encrypts with the repo's Actions secret public key (libsodium sealed box) —
// the same mechanism `gh secret set` uses.
export async function writeTokenSecret(secretName, tokenJson) {
  if (!TOKEN) throw new Error('no GITHUB_TOKEN on the server');
  const mod = await import('libsodium-wrappers');
  const sodium = mod.default ?? mod;
  await sodium.ready;
  const pkRes = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets/public-key`, {
    headers: ghHeaders(),
  });
  if (!pkRes.ok) throw new Error(`github ${pkRes.status} reading secrets public key`);
  const pk = await pkRes.json();
  const sealed = sodium.crypto_box_seal(Buffer.from(tokenJson, 'utf8'), Buffer.from(pk.key, 'base64'));
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets/${secretName}`, {
    method: 'PUT',
    headers: ghHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ encrypted_value: Buffer.from(sealed).toString('base64'), key_id: pk.key_id }),
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`github ${res.status} writing ${secretName}: ${(await res.text()).slice(0, 120)}`);
  }
  return { ok: true };
}

// Local mode only — mirror of what oauth-reauth.mjs writes (gitignored folder).
export function writeLocalTokenFile(slug, tokenJson) {
  if (CLOUD) return { ok: false };
  const dir = path.join(ROOT, 'yt-mcp', 'channels', slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'token.json'), tokenJson);
  return { ok: true };
}
