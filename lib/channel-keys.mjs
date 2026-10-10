// BYOK CI-side loader — applies a channel's own provider keys on top of env.
// Crypto MUST stay in sync with studio/lib/keys-vault.js (same derivation:
// sha256('quarry-channel-keys-v1|' + YOUTUBE_CLIENT_SECRET) — both the Vercel
// server and these CI workflows already hold that exact value, so no new
// GitHub secret is needed).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const PROVIDER_ENV = {
  gemini: 'GEMINI_API_KEY',
  groq: 'GROQ_API_KEY',
  cerebras: 'CEREBRAS_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  hf: 'HF_TOKEN',
  openai: 'OPENAI_API_KEY',
  pixabay: 'PIXABAY_API_KEY',
  pexels: 'PEXELS_API_KEY',
};

function keysEncKey() {
  return crypto.createHash('sha256').update('quarry-channel-keys-v1|' + String(process.env.YOUTUBE_CLIENT_SECRET || '')).digest();
}

function decryptKeys(s) {
  try {
    const [iv, tag, ct] = String(s).split('.');
    const d = crypto.createDecipheriv('aes-256-gcm', keysEncKey(), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8'));
  } catch {
    return null;
  }
}

// Sets env entries for every provider key saved on this channel (channel key
// replaces the shared key for that provider). Returns the applied provider
// names, or null when the channel has no keys (callers treat that as "shared").
export function applyChannelKeys(slug, env = process.env) {
  try {
    const file = JSON.parse(fs.readFileSync(path.join('yt-mcp', 'channel-keys.json'), 'utf8'));
    const entry = file?.[slug];
    if (!entry?.enc) return null;
    const keys = decryptKeys(entry.enc);
    if (!keys) {
      console.log(`[keys] ${slug}: channel keys unreadable (wrong secret?) — using shared keys`);
      return null;
    }
    const applied = [];
    for (const [p, k] of Object.entries(keys)) {
      const envName = PROVIDER_ENV[p];
      if (envName && k) {
        env[envName] = k;
        applied.push(p);
      }
    }
    return applied.length ? applied : null;
  } catch {
    return null; // no file / unreadable = shared keys, never fail production over this
  }
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out')), ms))]);

// Cheap live test call per provider (keep in sync with studio/lib/keys-vault.js).
async function checkProviderKey(provider, key) {
  const bearer = (url) => withTimeout(fetch(url, { headers: { Authorization: `Bearer ${key}` } }), 10000);
  try {
    let r;
    switch (provider) {
      case 'gemini':
        r = await withTimeout(fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(key)}`), 10000);
        break;
      case 'groq': r = await bearer('https://api.groq.com/openai/v1/models'); break;
      case 'cerebras': r = await bearer('https://api.cerebras.ai/v1/models'); break;
      case 'mistral': r = await bearer('https://api.mistral.ai/v1/models'); break;
      case 'openai': r = await bearer('https://api.openai.com/v1/models'); break;
      case 'hf': r = await bearer('https://huggingface.co/api/whoami-v2'); break;
      case 'pixabay':
        r = await withTimeout(fetch(`https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=morning&per_page=3`), 10000);
        if (r.ok) { const j = await r.json().catch(() => ({})); return typeof j.totalHits === 'number' ? null : (j.message || 'unexpected response'); }
        break;
      case 'pexels':
        r = await withTimeout(fetch('https://api.pexels.com/v1/curated?per_page=1', { headers: { Authorization: key } }), 10000);
        break;
      default: return null;
    }
    if (r.ok) return null;
    const body = await r.json().catch(() => ({}));
    return body?.error?.message || body?.error || `HTTP ${r.status}`;
  } catch (e) {
    return e.message;
  }
}

// Post-apply health check: validates every key saved on this channel.
// Returns { ok: [providers], dead: [{provider, detail}] } — callers DROP the
// dead ones from env (shared key takes over) and alert via ntfy.
export async function checkChannelKeys(slug) {
  const out = { ok: [], dead: [] };
  try {
    const file = JSON.parse(fs.readFileSync(path.join('yt-mcp', 'channel-keys.json'), 'utf8'));
    const entry = file?.[slug];
    if (!entry?.enc) return out;
    const keys = decryptKeys(entry.enc);
    if (!keys) return out;
    await Promise.all(Object.entries(keys).map(async ([p, k]) => {
      const detail = await checkProviderKey(p, k);
      if (detail) out.dead.push({ provider: p, detail: String(detail).slice(0, 90) });
      else out.ok.push(p);
    }));
  } catch { }
  return out;
}

// Remove provider keys from env (after a dead-key check) — shared keys resume.
export function dropChannelKeys(providers, env = process.env) {
  for (const p of providers) {
    const envName = PROVIDER_ENV[p];
    if (envName) delete env[envName];
  }
}
