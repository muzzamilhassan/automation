// P5-T2e (spec D15, Ruling 3, AC-P5-15/16) — the doc lane's template reads.
//
// yt-deepdive.mjs IS the weekly episode builder and executes top-level code,
// so the doc lane's template logic lives here as pure, importable functions:
//   - docStoryPlan / docStoryPlanLines — the assigned doc template's
//     story_structure (sections[] + chapter_min_words) parsed into the ONE
//     prompt directive line, clamped ONTO the immutable episode contract
//     (validEpisode: >=5 chapters x >=70 words — the template's plan writes
//     toward the contract and can only tighten it, never dip below the floor).
//   - foreignDocFormat / skipForeignDocFormat — the loud skip: an active
//     template whose formats exclude 'long' is NEVER rendered as a
//     documentary (one Action-required warning row + one log line, zero
//     production).
//
// Registry meta shape (studio/lib/template-registry.data.js): sections[]
// entries are strings per the D2 example ('cold_open', 'chapters:8',
// 'exhibits', 'outro'), chapter_min_words is a number. The sections
// vocabulary is template DATA — the plan line renders the entries VERBATIM,
// never a code map (no-static-maps owner directive).
import { emitWarning } from './warnings-store.mjs';

// The episode contract floors (validEpisode, yt-deepdive.mjs) — mirrored here
// as the clamp the template plan maps onto; the contract literals themselves
// are pinned byte-identical by tests/doc-template.test.mjs and never move.
export const MIN_EPISODE_CHAPTERS = 5;
export const MIN_CHAPTER_WORDS = 70;

const CHAPTERS_ENTRY = /^chapters:(\d+)$/i;

/**
 * The doc template's section plan, or null when this template declares no
 * doc plan (the lane then keeps the hardcoded shape directive — fail-safe to
 * today's episode shape; the per-template QA gate catches an underdeclared
 * block, not a silent wrong shape).
 */
export function docStoryPlan(meta) {
  const story = meta && typeof meta === 'object' ? meta.story_structure : null;
  if (!story || typeof story !== 'object' || Array.isArray(story)) return null;
  if (!Array.isArray(story.sections)) return null;
  const sections = story.sections.map((s) => String(s ?? '').trim()).filter(Boolean);
  const chaptersEntry = sections.find((s) => CHAPTERS_ENTRY.test(s));
  if (!chaptersEntry) return null; // no chapter count declared — nothing to write toward
  const declared = parseInt(chaptersEntry.match(CHAPTERS_ENTRY)[1], 10);
  const minWords = Number(story.chapter_min_words);
  return {
    sections,
    chapters: Math.max(MIN_EPISODE_CHAPTERS, declared),
    chapterMinWords: Math.max(MIN_CHAPTER_WORDS, Number.isFinite(minWords) && minWords > 0 ? Math.round(minWords) : MIN_CHAPTER_WORDS),
  };
}

/**
 * The ONE directive line the plan renders to, replacing the hardcoded
 * "Exactly 8 chapters. Every chapter text MUST be 120-150 words." when (and
 * only when) a doc plan is assigned. Null plan -> null (caller keeps the
 * hardcoded line byte-identically).
 */
export function docStoryPlanLines(plan) {
  if (!plan) return null;
  const beats = (plan.sections || []).filter((s) => !CHAPTERS_ENTRY.test(s));
  return `Episode section plan: ${beats.length ? beats.join(' -> ') + '; ' : ''}exactly ${plan.chapters} chapters. Every chapter text MUST be at least ${plan.chapterMinWords} words.`;
}

/**
 * The foreign-format detector (D15): the doc lane renders 'long' — an active
 * template whose formats exclude it would put a shorts-shaped structure on a
 * documentary, so the lane must skip the slot LOUDLY instead. Missing/empty
 * formats is a validator concern (upstream), not this gate: null.
 */
export function foreignDocFormat(meta) {
  if (!meta || !Array.isArray(meta.formats) || meta.formats.length === 0) return null;
  if (meta.formats.includes('long')) return null;
  return { formats: meta.formats.map(String) };
}

/**
 * The loud skip itself: ONE Action-required log line + one Action-required
 * warning row (the /warnings surface — the condition must be visible on the
 * dashboard, not just in logs; the same rationale as review-gate's drift
 * row). Never throws, never parks production (blocks_publishing stays false
 * — the skip IS the absence of production); a dark warnings store degrades
 * to log-only (AC-P4-5 posture). The row dedupes per channel+code while
 * open, so a misassignment warns once per episode on /warnings and every
 * failed doc day re-prints the log line.
 */
export async function skipForeignDocFormat({ slug, templateId, foreign, store = null, log = () => {}, sendAlert = null }) {
  const formats = ((foreign && foreign.formats) || []).join(', ');
  log(`[long] ACTION REQUIRED: ${slug}'s assigned template "${templateId}" declares formats [${formats}] — no 'long' format, so the doc lane will NOT render a shorts-shaped template as a documentary (D15); doc slot skipped, nothing produced. Reassign a doc/long-format template at Studio > Templates.`);
  if (!store) return { ok: false, error: 'warnings_store_unavailable' };
  return emitWarning(store, {
    channel_id: slug,
    severity: 'action_required',
    code: 'doc_template_foreign_format',
    title: `Doc slot skipped: template "${templateId}" has no long format`,
    explanation: `The doc lane resolved active template "${templateId}", whose formats [${formats}] exclude 'long'. A shorts-shaped template is never rendered as a documentary (Phase 5 D15) — the slot produces nothing until the assignment is fixed.`,
    evidence: `yt-deepdive doc run: templateId=${templateId} formats=[${formats}]`,
    recommended_action: `Assign a doc/long-format template to ${slug} at Studio > Templates (assign = swap).`,
    auto_verifiable: false,
    blocks_publishing: false,
  }, sendAlert ? { sendAlert } : {});
}
