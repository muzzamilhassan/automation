// live fix wave B2 (T4-06) — how a brand-kit draft (AI or template) meets
// the wizard form. The draft used to replace pillars, description, tags,
// eyebrow and tagline in one go, dropping what the owner had typed (a custom
// pillar vanished). Now:
//   - an EMPTY field is filled automatically ("filled");
//   - a field the owner already filled keeps their text; the draft waits as
//     a suggestion with its own "Use this" ("pending");
//   - voice and style are always suggestions (the form always has one);
//   - using the pillar suggestion MERGES — custom pillars are never dropped.
// Pure: no React, no fetch — pinned by tests/wave-b2.test.mjs.
import { normalizeTags } from './tag-normalize.mjs';

export const DRAFT_KEYS = ['subNiches', 'description', 'tags', 'style', 'voice', 'eyebrow', 'tagline'];
const SUGGEST_ONLY = new Set(['style', 'voice']);

const pillarList = (v) =>
  (Array.isArray(v) ? v : String(v ?? '').split(','))
    .map((s) => String(s).trim().toLowerCase())
    .filter(Boolean);

// The form value a draft offers for one key ('' = nothing to offer).
export function draftValue(key, draft) {
  const kit = draft?.kit || {};
  const suggestion = draft?.suggestion || {};
  switch (key) {
    case 'subNiches': return [...new Set(pillarList(kit.niches))].join(', ');
    case 'tags': return normalizeTags(kit.tags).join(', ');
    case 'description':
    case 'eyebrow':
    case 'tagline': return String(kit[key] ?? '').trim();
    case 'style':
    case 'voice': return String(suggestion[key] ?? '').trim();
    default: return '';
  }
}

// Existing pillars first, then the drafted ones not already there.
export function mergePillars(current, drafted) {
  return [...new Set([...pillarList(current), ...pillarList(drafted)])].join(', ');
}

// Explicit "Use this": pillars merge, everything else takes the draft value.
export function applyDraftField(form, key, draft) {
  if (!DRAFT_KEYS.includes(key)) return form;
  const value = draftValue(key, draft);
  if (!value) return form;
  if (key === 'subNiches') return { ...form, subNiches: mergePillars(form.subNiches, value) };
  return { ...form, [key]: value };
}

const sameAs = (key, current, value) => {
  if (key === 'subNiches') {
    const have = new Set(pillarList(current));
    return pillarList(value).every((p) => have.has(p));
  }
  if (key === 'tags') return normalizeTags(current).join(', ') === value;
  return String(current ?? '').trim() === value;
};

// Fill the empty fields, mark the rest. Returns the next form and a status
// per offered key: 'filled' | 'pending' | 'same'. Keys with nothing to offer
// get no status (no row in the panel).
export function planKitDraft(form, draft) {
  let next = { ...form };
  const status = {};
  for (const key of DRAFT_KEYS) {
    const value = draftValue(key, draft);
    if (!value) continue;
    const current = form?.[key];
    if (sameAs(key, current, value)) status[key] = 'same';
    else if (!SUGGEST_ONLY.has(key) && !String(current ?? '').trim()) {
      next = applyDraftField(next, key, draft);
      status[key] = 'filled';
    } else status[key] = 'pending';
  }
  return { form: next, status };
}
