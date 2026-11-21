// Per-channel kit fields set from the panel (feedback round 1, items A + G).
// Pure validation + small UI mappings — no DB, no fs, never throws.
// Spec + QA: docs/qa/feedback-r1-templates-thumbs-qa.md.
//
//   thumbTemplates — the thumbnail design ids that take turns on uploads
//     (youtube-engine.mjs registryThumbCandidates reads brand.thumbTemplates).
//     Known ids = the thumbnail registry designs (thumb-registry.mjs) — the
//     engine's eligible pool, so the panel can never save an id the engine
//     would silently drop. [] = cleared (automatic).
//   hasChapters    — documentaries as one full story (false) or with chapter
//     dividers (true); null = unset = the template default. Read by
//     lib/doc-storybook.mjs docPresentation (boolean only).
//   storyShape     — 'template' | 'full' | 'chapters' (2026-11-21 readiness):
//     the owner's explicit choice; hasChapters is derived from it.
//   voiceProfile   — { human, mood, speed } human voice as a panel setting
//     (docs/qa/human-voice-panel-qa.md); rules in human-voice.mjs. Read by the
//     engine through lib/voice-profile.mjs + narrate.py voice_profile().
import { loadThumbRegistry } from './thumb-registry.mjs';
import { parseStoryShape, hasChaptersForShape } from './channel-readiness.mjs';
import { parseVoiceProfile } from './human-voice.mjs';

export const MAX_THUMB_TEMPLATES = 8; // API cap
// UI helpers live in a dependency-free module so client components don't
// bundle the registry data; re-exported here for one import surface.
export { PICKER_MIN, PICKER_MAX, chapterModeOf, chapterValueFor, canSaveThumbSet, thumbDemoUrl } from './channel-kit-ui.mjs';

export function thumbDesignIds() {
  return loadThumbRegistry().designs.map((d) => d.id);
}

// { ok: true, value } | { ok: false, error } — a plain sentence for the 400.
export function parseThumbTemplates(value, known = thumbDesignIds()) {
  if (!Array.isArray(value)) return { ok: false, error: 'thumbTemplates must be a list of thumbnail design ids' };
  if (value.some((x) => typeof x !== 'string')) return { ok: false, error: 'thumbTemplates: every design id must be text' };
  const ids = [...new Set(value.map((x) => x.trim()).filter(Boolean))];
  if (ids.length > MAX_THUMB_TEMPLATES) return { ok: false, error: `thumbTemplates: pick at most ${MAX_THUMB_TEMPLATES} designs` };
  const unknown = ids.filter((id) => !known.includes(id));
  if (unknown.length) return { ok: false, error: `thumbTemplates: unknown design ${unknown.map((u) => `"${u.slice(0, 40)}"`).join(', ')}` };
  return { ok: true, value: ids };
}

export function parseHasChapters(value) {
  if (value === true || value === false || value === null) return { ok: true, value };
  return { ok: false, error: 'hasChapters must be true (chapters), false (full story) or null (template default)' };
}

// Only the keys the caller actually sent — an absent key is never patched,
// so a save from another screen can't wipe it.
export function kitFieldPatch(k) {
  const patch = {};
  if (!k || typeof k !== 'object') return { patch };
  if (Object.prototype.hasOwnProperty.call(k, 'thumbTemplates')) {
    const r = parseThumbTemplates(k.thumbTemplates);
    if (!r.ok) return { patch: {}, error: r.error };
    patch.thumbTemplates = r.value;
  }
  if (Object.prototype.hasOwnProperty.call(k, 'hasChapters')) {
    const r = parseHasChapters(k.hasChapters);
    if (!r.ok) return { patch: {}, error: r.error };
    patch.hasChapters = r.value;
  }
  // 2026-11-21 readiness: storyShape ('template' | 'full' | 'chapters') makes
  // "Template default" a real choice. hasChapters (what the engine reads)
  // always follows it, so the two can never disagree in the kit.
  if (Object.prototype.hasOwnProperty.call(k, 'storyShape')) {
    const r = parseStoryShape(k.storyShape);
    if (!r.ok) return { patch: {}, error: r.error };
    const want = hasChaptersForShape(r.value);
    if (Object.prototype.hasOwnProperty.call(patch, 'hasChapters') && patch.hasChapters !== want) {
      return { patch: {}, error: 'storyShape and hasChapters disagree — send matching values' };
    }
    patch.storyShape = r.value;
    patch.hasChapters = want;
  }
  if (Object.prototype.hasOwnProperty.call(k, 'voiceProfile')) {
    const r = parseVoiceProfile(k.voiceProfile);
    if (!r.ok) return { patch: {}, error: r.error };
    patch.voiceProfile = r.value;
  }
  return { patch };
}

// Kit keys a panel saves ON THEIR OWN through setChannelKitFields (patch the
// Neon kit + only that key in the engine file) instead of the full-entry
// upsert. Only the Voice drawer today; other panels keep their save path.
export const KIT_ONLY_KEYS = Object.freeze(['voiceProfile']);

// true = the body is { slug, kit: { <only KIT_ONLY_KEYS> } } and nothing else
export function kitOnlySave(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  if (Object.keys(body).some((k) => k !== 'slug' && k !== 'kit')) return false;
  const kit = body.kit;
  if (!kit || typeof kit !== 'object' || Array.isArray(kit)) return false;
  const keys = Object.keys(kit);
  return keys.length > 0 && keys.every((k) => KIT_ONLY_KEYS.includes(k));
}

