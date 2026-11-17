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

export const LLM_MODEL_DEFAULT = 'openai/gpt-oss-120b';
export const LLM_MAX_TOKENS = 900; // gpt-oss burns reasoning tokens inside the cap — headroom for the JSON
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
  const user = `Niche: ${nick}. Channel label: ${lab}. Slug: ${slug || lab.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.`;
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

// One Groq chat call. fetchImpl is injectable so tests can stub the network;
// throws on transport errors, non-OK status, or a malformed envelope.
export async function groqChat({ system, user }, { model, maxTokens, fetchImpl } = {}) {
  const f = fetchImpl || fetch;
  const r = await f('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model || process.env.GROQ_MODEL || LLM_MODEL_DEFAULT,
      max_tokens: maxTokens || LLM_MAX_TOKENS,
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!r.ok) throw new Error(`groq ${r.status}`);
  const j = await r.json();
  const content = j?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('groq returned empty content');
  return content;
}

export async function llmKitDraft(opts, callOpts = {}) {
  const { system, user } = buildKitPrompt(opts);
  const raw = await groqChat({ system, user }, callOpts);
  return parseKitDraft(raw);
}
