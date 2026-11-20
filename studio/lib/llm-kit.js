// #113 — LLM-backed brand-kit drafts (flavor B, owner-approved 2026-11-17).
// Provider: Groq (owner supplied the key as a secret — GROQ_API_KEY env on
// Vercel, never in the repo). The machine drafts, the human approves: every
// field comes back as a reviewable suggestion with an explicit Apply action
// in the wizard; nothing fills the form silently. This module is split so
// node --test can pin the pure parts: buildKitPrompt (what we ask) and
// parseKitDraft (what we accept — strict validation, sane caps, allow-listed
// voice/style ids). Network stays behind llmKitDraft's fetchImpl seam.
import { VOICES } from './voices.js';
import { STYLE_CATALOG } from './styles-catalog.js';

// live fix wave B2 (P9 / T4-04): every production draft failed with
// "groq 400". The call asked the reasoning model gpt-oss-120b for JSON mode
// with max_tokens 900 and the default reasoning effort; the hidden reasoning
// ate the budget, the JSON came back cut off, and Groq's JSON-mode check
// answered 400 (json_validate_failed). Same fix the engine already uses
// (lib/ai-adapter.mjs): reasoning_effort 'low' + a real token budget, kept
// under the free tier's 8K tokens-per-minute so one request always fits.
// Models are data: GROQ_KIT_MODEL (or GROQ_MODEL) overrides the default,
// GROQ_KIT_FALLBACK_MODEL the fallback tried once on a model/JSON error.
export const LLM_MODEL_DEFAULT = 'openai/gpt-oss-120b';
export const LLM_MODEL_FALLBACK = 'openai/gpt-oss-20b';
export const LLM_MAX_TOKENS = 4000;
export const LLM_TEMPERATURE = 0.7;
export const KIT_FIELD_CAPS = {
  eyebrow: 60,
  tagline: 80,
  description: 900,
  maxTags: 12,
  maxSubNiches: 6,
};

// The allow-lists sent INTO the prompt and enforced AFTER the reply: the LLM
// may only suggest voices/styles production actually uses. Data comes from
// the same sources the wizard renders — no second hardcoded list.
export const ALLOWED_VOICE_IDS = VOICES.map((v) => v.id);
export const ALLOWED_STYLE_IDS = STYLE_CATALOG.filter((s) => s.status === 'live').map((s) => s.id);

export function buildKitPrompt({ niche, label, slug }) {
  const nick = String(niche || '').trim();
  const lab = String(label || '').trim() || 'New channel';
  const system = [
    'You draft YouTube brand kits for faceless educational Shorts channels.',
    'Return STRICT JSON only (no markdown, no commentary) with exactly these keys:',
    '{"eyebrow": string, "tagline": string, "description": string, "tags": string[], "subNiches": string[], "voice": string, "style": string}',
    'Rules: eyebrow <= 60 chars, ALL-CAPS style opener with the niche; tagline <= 80 chars, punchy, no hashtags;',
    `description <= 900 chars, written for the channel's YouTube About page, ends with a soft subscribe line;`,
    `tags = 8-12 lowercase SEO search phrases (two to four words each, no #);`,
    'subNiches = 4-6 specific content pillars inside the niche;',
    `voice = one id from this exact list: ${ALLOWED_VOICE_IDS.join(', ')};`,
    `style = one id from this exact list: ${ALLOWED_STYLE_IDS.join(', ')}.`,
  ].join(' ');
  // the lowercase word "json" must appear in the messages for Groq JSON mode
  const user = `Niche: ${nick}. Channel label: ${lab}. Slug: ${slug || lab.toLowerCase().replace(/[^a-z0-9]+/g, '-')}. Reply with the json object only.`;
  return { system, user };
}

const cleanStr = (v, cap) => {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ');
  return s.slice(0, cap);
};
const cleanList = (v, maxItems, capPer) => {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => cleanStr(x, capPer))
    .filter(Boolean)
    .filter((x, i, a) => a.indexOf(x.toLowerCase()) === i)
    .slice(0, maxItems);
};

// Accept ONLY sane drafts: JSON object in, clamped fields out, voice/style
// checked against the allow-lists (invalid ones are dropped, not guessed).
// Throws on non-JSON / non-object replies so the route can fall back.
export function parseKitDraft(raw) {
  const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('draft is not a JSON object');
  const caps = KIT_FIELD_CAPS;
  const out = {
    eyebrow: cleanStr(obj.eyebrow, caps.eyebrow),
    tagline: cleanStr(obj.tagline, caps.tagline),
    description: cleanStr(obj.description, caps.description),
    tags: cleanList(obj.tags, caps.maxTags, 40),
    subNiches: cleanList(obj.subNiches, caps.maxSubNiches, 60),
    voice: ALLOWED_VOICE_IDS.includes(cleanStr(obj.voice, 24)) ? cleanStr(obj.voice, 24) : null,
    style: ALLOWED_STYLE_IDS.includes(cleanStr(obj.style, 24)) ? cleanStr(obj.style, 24) : null,
  };
  if (!out.eyebrow && !out.tagline && !out.description && !out.tags.length && !out.subNiches.length && !out.voice && !out.style) {
    throw new Error('draft has no usable fields');
  }
  return out;
}

// The kit's model list: primary first, then the fallback (never twice).
export function kitModels() {
  const primary = process.env.GROQ_KIT_MODEL || process.env.GROQ_MODEL || LLM_MODEL_DEFAULT;
  const fallback = process.env.GROQ_KIT_FALLBACK_MODEL || LLM_MODEL_FALLBACK;
  return fallback && fallback !== primary ? [primary, fallback] : [primary];
}

// Only the gpt-oss family takes reasoning_effort 'low'; other models reject it.
const takesReasoningEffort = (model) => /gpt-oss/i.test(String(model));

// Groq error text for logs and the audit note — never the key.
const redact = (s) => {
  let out = String(s ?? '');
  const key = process.env.GROQ_API_KEY;
  if (key) out = out.split(key).join('[redacted]');
  return out.replace(/gsk_[A-Za-z0-9_-]+/g, '[redacted]');
};

async function groqError(r) {
  let raw = '';
  try { raw = await r.text(); } catch { raw = ''; }
  let code = '';
  let message = '';
  try {
    const j = JSON.parse(raw);
    code = String(j?.error?.code || '');
    message = String(j?.error?.message || '');
  } catch {
    message = raw;
  }
  message = redact(message).replace(/\s+/g, ' ').trim().slice(0, 240);
  const err = new Error(`groq ${r.status}${code ? ` ${code}` : ''}${message ? `: ${message}` : ''}`);
  err.status = r.status;
  err.code = code;
  return err;
}

// Worth one retry on the fallback model: the model is gone/unknown, or the
// JSON came back invalid. Auth (401), rate limits (429) and the rest are not.
const RETRY_CODES = new Set(['model_decommissioned', 'model_not_found', 'json_validate_failed']);
const worthFallback = (e) =>
  e?.status === 404 || (e?.status === 400 && (RETRY_CODES.has(e.code) || /decommission|does not exist/i.test(e.message)));

async function groqOnce({ system, user }, { model, maxTokens, fetchImpl }) {
  const f = fetchImpl || fetch;
  const body = {
    model,
    max_tokens: maxTokens || LLM_MAX_TOKENS,
    temperature: LLM_TEMPERATURE,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
  if (takesReasoningEffort(model)) body.reasoning_effort = 'low';
  const r = await f('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw await groqError(r);
  const j = await r.json();
  const content = j?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('groq returned empty content');
  return content;
}

// One Groq chat call (plus one fallback-model retry on a model/JSON error).
// fetchImpl is injectable so tests can stub the network; throws on transport
// errors, non-OK status (with Groq's code + message), or an empty reply.
export async function groqChat({ system, user }, { model, maxTokens, fetchImpl, fallback = true } = {}) {
  const models = model ? [model] : kitModels();
  const tries = fallback ? models : models.slice(0, 1);
  let last = null;
  for (const m of tries) {
    try {
      return await groqOnce({ system, user }, { model: m, maxTokens, fetchImpl });
    } catch (e) {
      last = e;
      if (!worthFallback(e)) throw e;
    }
  }
  if (tries.length > 1) last.message = `${last.message} (tried ${tries.join(', ')})`;
  throw last;
}

export async function llmKitDraft(opts, callOpts = {}) {
  const { system, user } = buildKitPrompt(opts);
  const raw = await groqChat({ system, user }, callOpts);
  return parseKitDraft(raw);
}
