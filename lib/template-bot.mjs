// Template BOT — the GATES (Phase B, docs/qa/template-bot-qa.md).
// The drafting BRAIN is the Python LangGraph sidecar (services/ai/bot/
// graph.py): it drafts, self-reviews, repairs, and SHAPES. This module owns
// the two gates the Node side still enforces:
//
//   CANONICAL_LIST / canonicalNicheOrThrow — R1: only canonical niche
//     strings reach the brain (a paraphrase is rejected pre-LLM).
//   validateDraft — R2: the registry loader's own judgment (assignable or
//     the named errors) before anything is staged.
//
// The Node-side shaper/prompt trio that used to live here was removed —
// re-shaping the sidecar's already-shaped output read top-level keys
// against a nested payload and clobbered the creative fields with
// fallbacks (generic titles/beats, default vox palette, "undefined"
// disclaimer). ONE shaper, graph-tested in services/ai/tests.
import { CANONICAL_NICHES } from '../studio/lib/niches.js';
import { loadRegistryTemplates } from '../studio/lib/template-registry.js';
import { TEMPLATES_DATA } from '../studio/lib/templates-catalog.js';

export const CANONICAL_LIST = CANONICAL_NICHES;

export function canonicalNicheOrThrow(niche) {
  const n = String(niche || '').trim();
  const hit = CANONICAL_LIST.find((c) => c.toLowerCase() === n.toLowerCase());
  if (!hit) {
    throw new Error(`niche "${n}" is not a canonical string — use one of: ${CANONICAL_LIST.join(' | ')}`);
  }
  return hit; // the VERBATIM canonical casing (R1)
}

export function validateDraft(draft) {
  const view = loadRegistryTemplates(TEMPLATES_DATA, { [draft.template_id]: draft });
  const invalid = view.invalid.find((x) => x.familyId === draft.template_id);
  return { ok: view.templates.some((t) => t.templateId === draft.template_id) && !invalid, errors: invalid ? invalid.errors : [], assignable: view.templates.some((t) => t.templateId === draft.template_id) };
}
