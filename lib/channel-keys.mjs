// BYOK CI-side loader — applies a channel's own provider keys on top of env.
// Crypto MUST stay in sync with studio/lib/keys-vault.js (same derivation:
// sha256('quarry-channel-keys-v1|' + YOUTUBE_CLIENT_SECRET) — both the Vercel
// server and these CI workflows already hold that exact value, so no new
// GitHub secret is needed).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PROVIDER_ENV = {
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
