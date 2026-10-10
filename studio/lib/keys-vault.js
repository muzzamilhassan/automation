// BYOK vault core (Studio side). Keep the crypto in sync with /lib/channel-keys.mjs (CI side).
// The encryption key is DELIBERATELY tied to YOUTUBE_CLIENT_SECRET (not STUDIO_PASSWORD):
// both the Vercel server and every CI workflow already hold that exact value, so the
// channel-keys file is readable in both places with zero extra secrets.
import crypto from 'node:crypto';

export const PROVIDERS = {
  gemini:   { env: 'GEMINI_API_KEY',   label: 'Gemini (Google AI Studio)', url: 'https://aistudio.google.com/apikey',            hint: 'script brain #1' },
  groq:     { env: 'GROQ_API_KEY',     label: 'Groq',                       url: 'https://console.groq.com/keys',                 hint: 'script brain #2' },
  cerebras: { env: 'CEREBRAS_API_KEY', label: 'Cerebras',                   url: 'https://cloud.cerebras.ai',                     hint: 'script brain #3' },
  mistral:  { env: 'MISTRAL_API_KEY',  label: 'Mistral',                    url: 'https://console.mistral.ai/api-keys',           hint: 'script brain #4' },
  hf:       { env: 'HF_TOKEN',         label: 'HuggingFace',                url: 'https://huggingface.co/settings/tokens',        hint: 'script brain #5 (fallback)' },
  openai:   { env: 'OPENAI_API_KEY',   label: 'OpenAI',                     url: 'https://platform.openai.com/api-keys',          hint: 'voice + transcription' },
  pixabay:  { env: 'PIXABAY_API_KEY',  label: 'Pixabay',                    url: 'https://pixabay.com/api/docs/',                 hint: '4K footage + photos' },
  pexels:   { env: 'PEXELS_API_KEY',   label: 'Pexels',                     url: 'https://www.pexels.com/api/',                   hint: 'documentary photos' },
};

export function keysEncKey() {
  return crypto.createHash('sha256').update('quarry-channel-keys-v1|' + String(process.env.YOUTUBE_CLIENT_SECRET || '')).digest();
}

export function encryptKeys(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keysEncKey(), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join('.');
}

export function decryptKeys(s) {
  try {
    const [iv, tag, ct] = String(s).split('.');
    const d = crypto.createDecipheriv('aes-256-gcm', keysEncKey(), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8'));
  } catch {
    return null;
  }
}

export function maskKey(k) {
  const s = String(k || '');
  return s.length > 8 ? '••••' + s.slice(-4) : '••••';
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out')), ms))]);

// Live test call per provider — validate-before-save is mandatory (Google now
// rejects broken/unrestricted keys at call time anyway; failing here is kinder).
export async function validateKey(provider, key) {
  const k = String(key || '').trim();
  if (!k) return { ok: false, detail: 'empty key' };
  const bad = (msg) => ({ ok: false, detail: String(msg || 'rejected').slice(0, 140) });
  const bearer = (url) => withTimeout(fetch(url, { headers: { Authorization: `Bearer ${k}` } }), 12000);
  try {
    let r;
    switch (provider) {
      case 'gemini':
        r = await withTimeout(fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(k)}`), 12000);
        if (!r.ok) return bad((await r.json().catch(() => ({})))?.error?.message || `HTTP ${r.status}`);
        return { ok: true, detail: '' };
      case 'groq':
        r = await bearer('https://api.groq.com/openai/v1/models');
        break;
      case 'cerebras':
        r = await bearer('https://api.cerebras.ai/v1/models');
        break;
      case 'mistral':
        r = await bearer('https://api.mistral.ai/v1/models');
        break;
      case 'openai':
        r = await bearer('https://api.openai.com/v1/models');
        break;
      case 'hf': {
        r = await bearer('https://huggingface.co/api/whoami-v2');
        if (r.ok) return { ok: true, detail: '' };
        break;
      }
      case 'pixabay': {
        r = await withTimeout(fetch(`https://pixabay.com/api/?key=${encodeURIComponent(k)}&q=morning&per_page=3`), 12000);
        if (r.ok) {
          const j = await r.json().catch(() => ({}));
          if (typeof j.totalHits === 'number') return { ok: true, detail: '' };
          return bad(j.message || 'unexpected response');
        }
        break;
      }
      case 'pexels':
        r = await withTimeout(fetch('https://api.pexels.com/v1/curated?per_page=1', { headers: { Authorization: k } }), 12000);
        break;
      default:
        return bad('unknown provider');
    }
    if (r.ok) return { ok: true, detail: '' };
    const body = await r.json().catch(() => ({}));
    return bad(body?.error?.message || body?.error || `HTTP ${r.status}`);
  } catch (e) {
    return bad(e.message);
  }
}
