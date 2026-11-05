// Template BOT — the drafting brain (Phase B, docs/qa/template-bot-qa.md).
// Pure functions: a niche brief → the LLM drafting prompt → parsed drafts →
// normalized, validator-gated template entries. The RUNNER
// (scripts/template-bot.mjs) owns the LLM call (routeAndCall script-gen —
// R5: required, no deterministic fallback), staging, previews, and approval.
//
//   CANONICAL_NICHES  re-exported from niches.js — R1: paraphrases rejected
//   ALLOWED_*         the engine pools a draft may draw from (themes =
//                     longscenes2 THEMES keys; voices = Edge-shaped; moods =
//                     the incompetech feel words; layouts = the eleven)
//   draftPrompt       the LLM contract: JSON-in-JSON-out, ONE exemplar as
//                     the shape model, the allowed pools inline
//   parseDrafts       tolerant content extraction (the same loose parse the
//                     doc lane proves)
//   shapeDraft        normalizes an LLM draft into a schema-valid entry:
//                     id slug + -storybook, the exact canonical niche,
//                     theme/voice/mood/layout clamped to the pools, counts
//                     clamped (4 beats, 3 hooks, 3 titles, 1 disclaimer)
//   validateDraft     the registry loader's own judgment — assignable or
//                     the named errors (R2: the gate before staging)
import { CANONICAL_NICHES } from '../studio/lib/niches.js';
import { loadRegistryTemplates } from '../studio/lib/template-registry.js';
import { TEMPLATES_DATA } from '../studio/lib/templates-catalog.js';

export const ALLOWED_THEMES = ['vox', 'investing', 'poster', 'history', 'wisdom', 'science', 'travel', 'focus'];
export const ALLOWED_VOICES = ['en-US-AndrewNeural', 'en-US-BrianNeural', 'en-US-AriaNeural', 'en-US-EmmaNeural', 'en-US-ChristopherNeural', 'en-GB-RyanNeural'];
export const ALLOWED_MOODS = ['epic', 'uplifting', 'driving', 'bright', 'calming', 'mystical', 'heroic', 'grooving'];
export const ALLOWED_LAYOUTS = ['split', 'quote', 'process', 'versus', 'timeline', 'map', 'terminal', 'stat'];
export const CANONICAL_LIST = CANONICAL_NICHES;

export function canonicalNicheOrThrow(niche) {
  const n = String(niche || '').trim();
  const hit = CANONICAL_LIST.find((c) => c.toLowerCase() === n.toLowerCase());
  if (!hit) {
    throw new Error(`niche "${n}" is not a canonical string — use one of: ${CANONICAL_LIST.join(' | ')}`);
  }
  return hit; // the VERBATIM canonical casing (R1)
}

export function draftPrompt({ niche, count = 1, exemplar = '' }) {
  return `You are the template architect for a faceless-documentary YouTube factory.

Design ${count} new storybook video template${count > 1 ? 's' : ''} for the niche: "${niche}".

A storybook template = a 10-chapter documentary look with its own palette, layout cycle, narrator voice, and story patterns. Here is ONE existing entry as the SHAPE model (copy its structure exactly; invent fresh creative content):

${exemplar}

Return STRICT JSON (no markdown fences), shape:
{"templates":[{"template_id":"<slug>-storybook","theme":"<one of: ${ALLOWED_THEMES.join(' | ')}>","voice":"<one of: ${ALLOWED_VOICES.join(' | ')}>","music_mood":"<one of: ${ALLOWED_MOODS.join(' | ')}>","doc_layouts":["<6 layout names from: ${ALLOWED_LAYOUTS.join(' | ')}>, split first and last recommended"],"beats":["<slot 1 opening beat>", "<slot 2 evidence beat>", "<slot 3 mechanism beat>", "<slot 4 payoff beat>"],"hook_classes":["<3 hook styles>"],"title_patterns":["<3 title patterns with an exemplar in quotes>"],"payoff_rule":"<the closing rule>","disclaimer":"<one honest niche disclaimer>"}]}

Rules:
- template_id: lowercase-kebab, ends with -storybook, unique.
- beats: exactly 4 strings (slots 1-4 of the numbered chapter arc).
- Every claim pattern must suit the niche. No real financial/medical advice.
- The disclaimer must be honest for the niche.`;
}

export function parseDrafts(content) {
  const t = String(content || '').replace(/```json|```/g, '').trim();
  const start = t.indexOf('{');
  const parsed = JSON.parse(t.slice(start, t.lastIndexOf('}') + 1));
  const list = Array.isArray(parsed.templates) ? parsed.templates : [];
  if (!list.length) throw new Error('the model returned no templates');
  return list;
}

const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export function shapeDraft(raw, niche) {
  const theme = ALLOWED_THEMES.includes(raw.theme) ? raw.theme : 'vox';
  const voice = ALLOWED_VOICES.includes(raw.voice) ? raw.voice : 'en-US-AndrewNeural';
  const mood = ALLOWED_MOODS.includes(raw.music_mood) ? raw.music_mood : 'calming';
  const layouts = (Array.isArray(raw.doc_layouts) ? raw.doc_layouts : [])
    .map((x) => String(x).toLowerCase().trim())
    .filter((x) => ALLOWED_LAYOUTS.includes(x))
    .slice(0, 6);
  const idBase = slugify(raw.template_id || `${slugify(niche)}-book`);
  const template_id = (idBase.endsWith('-storybook') ? idBase : `${idBase || slugify(niche)}-storybook`);
  const strArr = (v, max) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, max) : []);
  return {
    version: '1.0.0',
    template_id,
    family: 'documentary-frames',
    niches: [niche],
    formats: ['long', 'short'],
    renderer: 'remotion',
    required_capabilities: ['script-gen', 'tts', 'captions'],
    doc_presentation: {
      theme, voice, music_mood: mood,
      doc_layouts: layouts.length ? layouts : ['split', 'quote', 'split', 'process', 'split', 'stat'],
      // the sidecar's shaped brand identity rides through (the LLM supplies it;
      // absent = the channel kit's brand at render time)
      ...(raw.doc_presentation?.brand ? { brand: String(raw.doc_presentation.brand) } : {}),
      ...(raw.doc_presentation?.badge ? { badge: String(raw.doc_presentation.badge) } : {}),
      ...(raw.doc_presentation?.eyebrow ? { eyebrow: String(raw.doc_presentation.eyebrow) } : {}),
    },
    story_structure: {
      doc_render: 'storybook',
      sections: ['cold_open', 'chapters:10', 'exhibits', 'outro'],
      chapter_min_words: 170,
      beats: strArr(raw.beats, 4).length === 4 ? strArr(raw.beats, 4) : [
        'slot 1 opens the arc — the subject and the question it raises',
        'slot 2 brings the cited turning point or evidence',
        'slot 3 explains the mechanism — how and why it unfolded',
        'slot 4 lands the payoff — the takeaway the viewer keeps',
      ],
      hook_classes: strArr(raw.hook_classes, 3).length ? strArr(raw.hook_classes, 3) : ['the-open question', 'the-scale number', 'the-stake call-out'],
      title_patterns: strArr(raw.title_patterns, 3).length ? strArr(raw.title_patterns, 3) : [`the ${niche} explainer ("A ${niche} Story — Explained")`],
      payoff_rule: String(raw.payoff_rule || '').trim() || 'the closing lands ONE takeaway the viewer keeps',
    },
    variation_rules: [
      "distinct subject/arc per video — differs from every one in the channel's last 5 videos (enforced: the variation gate similarity + seed rotation)",
      'no recycled example set against the last 5 videos (enforced: the variation gate similarity)',
      "no repeated hook across the channel's last 5 videos (enforced: the variation gate similarity)",
      'every figure and fact is a cited source (prose for the author and the review desk — spec Honest Limits)',
    ],
    review_thumb_pick: true,
    safety: { required_sources: true, review_required: [], disclaimers: [strArr(Array.isArray(raw.disclaimer) ? raw.disclaimer : [raw.disclaimer], 1)[0] || 'Summarized from cited sources; not professional advice.'] },
    deprecated: false,
    changelog: [{ version: '1.0.0', date: '2026-11-05', note: 'template bot draft — owner-approved via --approve' }],
  };
}

export function validateDraft(draft) {
  const view = loadRegistryTemplates(TEMPLATES_DATA, { [draft.template_id]: draft });
  const invalid = view.invalid.find((x) => x.familyId === draft.template_id);
  return { ok: view.templates.some((t) => t.templateId === draft.template_id) && !invalid, errors: invalid ? invalid.errors : [], assignable: view.templates.some((t) => t.templateId === draft.template_id) };
}
