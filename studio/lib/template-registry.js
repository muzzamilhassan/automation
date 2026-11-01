// Template registry metadata validator + loader (schema v2 — Phase 5 T1).
// Pure logic only — no DB, no UI. The metadata itself lives in
// template-registry.data.js and is seeded by a later task.
//
// Schema v2 (Phase 5 D1 — the identity split): registry entries are keyed by
// `template_id` (the unique registry key); `family` names the VISUAL catalog
// family for the gallery/aspect-ratio join. Legacy blocks (the pre-Phase-5 7)
// keep key == family id == template_id — no data migration.

import { CANONICAL_NICHES } from './niches.js';

const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_FORMATS = ['short', 'long'];
const ALLOWED_CAPABILITIES = ['script-gen', 'tts', 'captions', 'image-gen'];
const ALLOWED_REVIEW_REQUIRED = ['health', 'finance', 'medical', 'all']; // 'medical' per D17 (Phase 4 review gate — health/medical YMYL lane)

/**
 * Pipeline-truth capability baseline (Phase 1): what the production pipeline
 * fulfills TODAY with no owner action — script-gen via the script-brain chain
 * (server keys), tts via the local edge-tts/Kokoro lanes, captions via the
 * local faster-whisper/SRT lane. All ship in-repo and run in the current
 * workflows, so they count as available WITHOUT any vault key. image-gen has
 * no in-repo generator (pixabay/pexels are stock *search* keys, not
 * generators).
 * SHARED by both validator moments — the Studio assign route
 * (app/api/templates/assign/route.js) and the pipeline preflight
 * (lib/template-preflight.mjs) — so the same ruling can never drift into two
 * implementations (the E2E round-2 finding: route said tts/captions available,
 * preflight said unavailable, and an assigned channel fail-closed at
 * generation). The BYOK vault is REFINEMENT ONLY: a configured key can add
 * availability on top of this baseline and can never revoke it.
 * PHASE-2 UPGRADE: replace the baseline with per-provider truth (capability
 * registry) instead of asserting lane availability.
 */
export const CAPABILITY_BASELINE = {
  'script-gen': true,
  'tts': true,
  'captions': true,
  'image-gen': false,
};

function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

function isStringArray(v) {
  return Array.isArray(v) && v.every(isNonEmptyString);
}

function isSubsetOf(arr, allowlist) {
  return Array.isArray(arr) && arr.every(v => allowlist.includes(v));
}

// Catalog aspect-ratio -> production format (the house mapping: 16:9 lanes
// produce the weekly long, 9:16 lanes the daily short). Shared by the loader's
// formats ⊆ family gate and the catalog pins.
const ASPECT_TO_FORMAT = { '16:9': 'long', '9:16': 'short' };

export function formatsForAspectRatios(aspectRatios) {
  return Array.isArray(aspectRatios)
    ? aspectRatios.map((a) => ASPECT_TO_FORMAT[a]).filter(isNonEmptyString)
    : [];
}

/**
 * Validate one registry metadata block against schema v2.
 * Collects all errors (not first-only). Pure and fail-closed.
 *
 * Schema v2 identity fields (Phase 5 D1): `template_id` and `family`. Both are
 * optional ONLY for legacy blocks (the pre-Phase-5 7, where the family id IS
 * the identity); a block that declares `family` is a schema v2 entry and MUST
 * carry `template_id` — a declared visual family needs its own template
 * identity. Whether template_id agrees with the registry key is checked by the
 * loader (which sees the key; this function sees only the block).
 *
 * Authoring rules for schema v2 entries (`family` declared — the legacy 7 are
 * exempt from all three and stay byte-identical):
 * - D2: `story_structure` REQUIRED — point-slot constraints over the immutable
 *   shorts skeleton: `beats[]` (1-5 non-empty strings; the skeleton's point
 *   count is kit-owned, beats only name slots), `hook_classes[]`,
 *   `title_patterns[]`, `payoff_rule`.
 * - D4: `safety.disclaimers` REQUIRED when review_required includes 'medical'
 *   or 'finance' (fixed verbatim texts machine-appended at publish); legal but
 *   not required for other classes.
 * @returns {{ ok: true } | { ok: false, errors: string[] }}
 */
export function validateRegistryMeta(meta) {
  const errors = [];

  if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) {
    return { ok: false, errors: ['meta: must be an object'] };
  }

  if (!isNonEmptyString(meta.version) || !SEMVER_RE.test(meta.version)) {
    errors.push(`version: must be semver (MAJOR.MINOR.PATCH), got ${JSON.stringify(meta.version)}`);
  }

  const isSchemaV2 = isNonEmptyString(meta.family);
  if (meta.template_id !== undefined && !isNonEmptyString(meta.template_id)) {
    errors.push('template_id: must be a non-empty string (the unique registry key — the identity of D1/D19)');
  }
  if (meta.family !== undefined && !isSchemaV2) {
    errors.push('family: must be a non-empty string (the visual family id in the template catalog)');
  }
  if (isSchemaV2 && meta.template_id === undefined) {
    errors.push('template_id: required on schema v2 entries — a declared visual family needs its own template identity (D1 identity split)');
  }

  if (!Array.isArray(meta.niches) || meta.niches.length === 0 || !meta.niches.every(isNonEmptyString)) {
    errors.push('niches: must be a non-empty array of non-empty strings');
  } else {
    // D17 closed vocabulary: assignment matching is exact-string, so a
    // paraphrase would silently niche_mismatch in production — reject it at
    // authoring/sync time with a named error instead.
    meta.niches.forEach((n, i) => {
      if (!CANONICAL_NICHES.includes(n)) {
        errors.push(`niches[${i}]: "${n}" is not in the closed D17 niche vocabulary — copy channel niche strings EXACTLY (studio/lib/niches.js CANONICAL_NICHES)`);
      }
    });
  }

  // D2 authoring rule (schema v2 entries): the story plan is required — beats
  // are POINT-SLOT constraints; they never change the shorts JSON shape.
  const story = meta.story_structure;
  if (isSchemaV2 && (story === null || typeof story !== 'object' || Array.isArray(story))) {
    errors.push('story_structure: required on schema v2 entries (family declared) — author the point-slot plan (beats, hook_classes, title_patterns, payoff_rule — D2)');
  } else if (isSchemaV2) {
    if (!Array.isArray(story.beats) || story.beats.length < 1 || story.beats.length > 5 || !story.beats.every(isNonEmptyString)) {
      errors.push('story_structure.beats: must be an array of 1-5 non-empty strings — point-slot constraints over the immutable shorts skeleton (D2)');
    }
    if (!isStringArray(story.hook_classes) || story.hook_classes.length === 0) {
      errors.push('story_structure.hook_classes: must be a non-empty array of non-empty strings (allowed hook types — D2)');
    }
    if (!isStringArray(story.title_patterns) || story.title_patterns.length === 0) {
      errors.push('story_structure.title_patterns: must be a non-empty array of non-empty strings (D2)');
    }
    if (!isNonEmptyString(story.payoff_rule)) {
      errors.push('story_structure.payoff_rule: must be a non-empty string (D2)');
    }
  }

  if (!Array.isArray(meta.formats) || meta.formats.length === 0 || !isSubsetOf(meta.formats, ALLOWED_FORMATS)) {
    errors.push(`formats: must be a non-empty array drawn from {${ALLOWED_FORMATS.join(', ')}}`);
  }

  if (!isNonEmptyString(meta.renderer)) {
    errors.push('renderer: must be a non-empty string');
  }

  if (!Array.isArray(meta.required_capabilities) || !isSubsetOf(meta.required_capabilities, ALLOWED_CAPABILITIES)) {
    errors.push(`required_capabilities: must be an array drawn from {${ALLOWED_CAPABILITIES.join(', ')}}`);
  }

  if (!Array.isArray(meta.variation_rules) || meta.variation_rules.length === 0 || !meta.variation_rules.every(isNonEmptyString)) {
    errors.push('variation_rules: must be a non-empty array of non-empty strings');
  }

  const safety = meta.safety;
  if (safety === null || typeof safety !== 'object' || Array.isArray(safety)) {
    errors.push('safety: must be an object with required_sources and review_required');
  } else {
    if (typeof safety.required_sources !== 'boolean') {
      errors.push('safety.required_sources: must be a boolean');
    }
    if (!Array.isArray(safety.review_required) || !isSubsetOf(safety.review_required, ALLOWED_REVIEW_REQUIRED)) {
      errors.push(`safety.review_required: must be an array drawn from {${ALLOWED_REVIEW_REQUIRED.join(', ')}}`);
    }
    // D4: disclaimers[] carries the fixed verbatim texts appended to the
    // upload DESCRIPTION at publish time. Required for every NEW medical /
    // finance template; legal-but-not-required for other classes; malformed
    // values fail on ANY entry.
    if (safety.disclaimers !== undefined) {
      if (!isStringArray(safety.disclaimers) || safety.disclaimers.length === 0) {
        errors.push('safety.disclaimers: must be a non-empty array of non-empty strings (the fixed verbatim texts machine-appended at publish — D4)');
      }
    } else if (isSchemaV2 && Array.isArray(safety.review_required)
      && safety.review_required.some((c) => c === 'medical' || c === 'finance')) {
      errors.push('safety.disclaimers: required when review_required includes "medical" or "finance" — author the fixed verbatim text(s) (D4, machine-appended at publish)');
    }
    // P5-T2b authoring bar (D3/AC-P5-7): the YMYL review classes pin TIGHTER
    // brain thresholds than the documented defaults — variation ≤ 0.80,
    // cross-channel ≤ 0.85 (the defaults 0.85/0.90 are the LOOSEST allowed
    // for non-YMYL classes). Both must be DECLARED: an omission would
    // silently inherit the defaults the bar exists to tighten. Finance and
    // the class-less lanes are untouched.
    if (Array.isArray(safety.review_required)
      && safety.review_required.some((c) => c === 'medical' || c === 'health')) {
      for (const [field, cap] of [['variation_threshold', 0.80], ['cross_channel_threshold', 0.85]]) {
        const v = meta[field];
        if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > cap) {
          errors.push(`${field}: required for medical/health review classes and must be a number with 0 < value ≤ ${cap} — the YMYL authoring bar pins tighter-than-default brain thresholds (D3/AC-P5-7); got ${JSON.stringify(v)}`);
        }
      }
    }
  }

  if (typeof meta.deprecated !== 'boolean') {
    errors.push('deprecated: must be a boolean');
  } else if (meta.deprecated) {
    if (!isNonEmptyString(meta.deprecated_on) || !DATE_RE.test(meta.deprecated_on)) {
      errors.push('deprecated_on: required (YYYY-MM-DD) when deprecated is true');
    }
  } else if (meta.deprecated_on !== undefined && (!isNonEmptyString(meta.deprecated_on) || !DATE_RE.test(meta.deprecated_on))) {
    errors.push('deprecated_on: must be a YYYY-MM-DD date string');
  }

  if (!Array.isArray(meta.changelog)) {
    errors.push('changelog: must be an array of {version, date, note} entries');
  } else {
    meta.changelog.forEach((entry, i) => {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        errors.push(`changelog[${i}]: must be an object`);
        return;
      }
      if (!isNonEmptyString(entry.version) || !SEMVER_RE.test(entry.version)) {
        errors.push(`changelog[${i}].version: must be semver (MAJOR.MINOR.PATCH)`);
      }
      if (!isNonEmptyString(entry.date) || !DATE_RE.test(entry.date)) {
        errors.push(`changelog[${i}].date: must be a YYYY-MM-DD date string`);
      }
      if (!isNonEmptyString(entry.note)) {
        errors.push(`changelog[${i}].note: must be a non-empty string`);
      }
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true };
}

/**
 * Resolve registry-assignable templates over catalog families, fail-closed.
 *
 * Phase 5 T1 (D1): `metaData` is keyed by template_id — the unique registry
 * key and THE identity string of the D19 invariant. Each block joins to the
 * catalog by its `family` (the VISUAL family; defaults to the key for legacy
 * blocks), so many templates may share one visual family. Result rows carry:
 *   templateId — the identity (== the key; legacy fallback when the block
 *                omits the field)
 *   familyId   — the SAME string: the assignment/DB-join id. Kept as the field
 *                name because every DB row and consumer indexes by it; it
 *                holds the registry KEY (dual meaning documented in
 *                template-registry-db.js — template_id == family_id for all
 *                pre-Phase-5 rows).
 *   family     — the visual family id (gallery/aspect-ratio join).
 * - Metadata blocks are absent from the result only when null/undefined.
 * - Invalid blocks (bad fields, identity drift, unknown family) are excluded
 *   AND reported with every error named (AC-1/AC-P5-1). Never throws.
 * @param {Array<{id: string, name: string, family?: string, [k: string]: unknown}>} catalogFamilies
 * @param {Record<string, unknown>} metaData registry key (template_id) -> metadata block
 * @returns {{ templates: Array<{templateId: string, familyId: string, family: string, name: string, catalog: object, registry: object}>, invalid: Array<{familyId: string, errors: string[]}> }}
 */
export function loadRegistryTemplates(catalogFamilies, metaData) {
  const templates = [];
  const invalid = [];
  const families = Array.isArray(catalogFamilies) ? catalogFamilies : [];
  const entries = metaData && typeof metaData === 'object' && !Array.isArray(metaData)
    ? Object.entries(metaData)
    : [];

  for (const [key, meta] of entries) {
    if (meta === null || meta === undefined) continue; // no metadata -> not registry-assignable, simply absent
    if (typeof meta !== 'object' || Array.isArray(meta)) {
      invalid.push({ familyId: key, errors: ['meta: must be an object'] });
      continue;
    }

    // The registry KEY is the identity (one string, four homes — D1/D19): a
    // block's template_id must equal its key, so every consumer indexing the
    // data object resolves the same string the assignment row stores.
    const templateId = isNonEmptyString(meta.template_id) ? meta.template_id : key; // legacy fallback: family id
    if (templateId !== key) {
      invalid.push({
        familyId: key,
        errors: [`template_id: must equal the registry key "${key}" — the object key IS the identity (one string, four homes, D1/D19); got "${templateId}"`],
      });
      continue;
    }

    const family = isNonEmptyString(meta.family) ? meta.family : templateId;
    const catalogEntry = families.find((e) => e !== null && typeof e === 'object' && (e.family || e.id) === family);
    if (!catalogEntry) {
      invalid.push({
        familyId: key,
        errors: [`family: "${family}" does not exist in the template catalog (TEMPLATES_DATA) — the visual binding must name a real family (D1)`],
      });
      continue;
    }

    // formats ⊆ family (D1's only hard family rule): declared formats are
    // derived from the visual family's catalog aspectRatios — never declared
    // beyond what the family ships. Collected together with the validator
    // errors so one broken block reports everything at once.
    const supported = formatsForAspectRatios(catalogEntry.aspectRatios);
    const unsupportedFormats = (Array.isArray(meta.formats) ? meta.formats : [])
      .filter((f) => !supported.includes(f))
      .map((f) => `formats: "${f}" is not shipped by the visual family "${family}" (aspectRatios [${(catalogEntry.aspectRatios || []).join(', ')}]) — formats are derived from the family, never declared beyond it (D1)`);

    const result = validateRegistryMeta(meta);
    const errors = [...(result.ok ? [] : result.errors), ...unsupportedFormats];
    if (errors.length > 0) {
      invalid.push({ familyId: key, errors });
      continue;
    }

    templates.push({ templateId, familyId: templateId, family, name: catalogEntry.name, catalog: catalogEntry, registry: meta });
  }

  return { templates, invalid };
}

/**
 * Resolve a channel's pinned template assignment to the highest version
 * within the pinned major. Pure and fail-closed.
 * Adoption rules: minor/patch updates within the pinned major auto-adopt;
 * a higher major never auto-adopts — it is surfaced via
 * majorUpdateAvailable so the caller can decide (spec D2).
 * @param {{ familyId: string, pinned_major: number }} assignment
 * @param {Array<{ familyId?: string, version: string }>} registryBlocks registry metadata blocks (one per version)
 * @returns {{ ok: true, resolvedVersion: string, majorUpdateAvailable: boolean } | { ok: false, errors: string[] }}
 */
export function resolveAssignment(assignment, registryBlocks) {
  const inputErrors = [];
  if (assignment === null || typeof assignment !== 'object' || Array.isArray(assignment) || !Number.isInteger(assignment.pinned_major)) {
    inputErrors.push('assignment: must be an object with an integer pinned_major');
  }
  if (!Array.isArray(registryBlocks)) {
    inputErrors.push('registryBlocks: must be an array of metadata blocks');
  }
  if (inputErrors.length > 0) return { ok: false, errors: inputErrors };

  const versions = registryBlocks
    .filter(b => b !== null && typeof b === 'object' && !Array.isArray(b)
      && b.familyId === assignment.familyId
      && isNonEmptyString(b.version) && SEMVER_RE.test(b.version))
    .map(b => b.version.split('.').map(Number));

  const inMajor = versions.filter(v => v[0] === assignment.pinned_major);
  if (inMajor.length === 0) {
    return { ok: false, errors: ['no_version_in_major'] };
  }

  const highest = inMajor.reduce((a, b) => (b[1] > a[1] || (b[1] === a[1] && b[2] > a[2]) ? b : a));
  const majorUpdateAvailable = versions.some(v => v[0] > assignment.pinned_major);

  return { ok: true, resolvedVersion: highest.join('.'), majorUpdateAvailable };
}

/**
 * Derive the validator's channelConfig from the channel registry's real
 * entry shape (spec D4 "live data"). Shared by the GET templates route
 * (channel view) and the POST assign route so both always feed the
 * validator the same niches/formats the UI orders on:
 * - niches: the channel's main niche plus its configured sub-niches
 * - formats: the channel registry stores no per-channel format field; every
 *   lane is a Shorts-first vertical lane, so 'short' is always produced, and
 *   a channel with a long-form slot configured (kit.longSlot) also gets
 *   'long'. PHASE-2 UPGRADE: add an explicit per-channel formats field to the
 *   channels table instead of deriving it.
 * - brand_kit: present when the channel has any kit data saved.
 * @param {object} entry channel registry entry (slug, niche, kit)
 * @returns {{ formats: string[], niches: string[], brand_kit: boolean }}
 */
export function channelConfigFromRegistryEntry(entry) {
  const kit = entry?.kit || {};
  const niches = [...new Set([entry?.niche, ...(Array.isArray(kit.niches) ? kit.niches : [])]
    .filter((n) => typeof n === 'string' && n.length > 0))];
  const formats = kit.longSlot ? ['short', 'long'] : ['short'];
  const brand_kit = Boolean(entry?.kit && Object.keys(entry.kit).length > 0);
  return { formats, niches, brand_kit };
}

/**
 * Validate a template assignment against a channel's configuration and the
 * environment capability map (spec D4). Pure and fail-closed: a capability
 * (or renderer) counts as available only when the map holds it as exactly
 * `true`. Collects ALL blocking reasons — never first-only.
 * Stable blocking codes: `missing_capability:<cap>`, `format_mismatch`,
 * `niche_mismatch`, `renderer_unavailable`, `deprecated_template`.
 * @param {object} meta validated registry metadata block
 * @param {{ formats?: string[], niches?: string[], brand_kit?: boolean }} channelConfig
 * @param {Record<string, boolean>} capabilityMap
 * @returns {{ ok: true } | { ok: false, reasons: Array<{ code: string, detail: string }> }}
 */
export function validateAssignment(meta, channelConfig, capabilityMap) {
  if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) {
    return { ok: false, reasons: [{ code: 'invalid_meta', detail: 'meta: must be an object' }] };
  }

  const reasons = [];
  const caps = Array.isArray(meta.required_capabilities) ? meta.required_capabilities : [];
  for (const cap of caps) {
    if (capabilityMap === null || typeof capabilityMap !== 'object' || capabilityMap[cap] !== true) {
      reasons.push({ code: `missing_capability:${cap}`, detail: `required capability "${cap}" is not available (map value must be exactly true)` });
    }
  }

  const metaFormats = Array.isArray(meta.formats) ? meta.formats : [];
  const channelFormats = channelConfig && Array.isArray(channelConfig.formats) ? channelConfig.formats : [];
  if (!metaFormats.some(f => channelFormats.includes(f))) {
    reasons.push({ code: 'format_mismatch', detail: `template formats [${metaFormats.join(', ')}] have no overlap with channel formats [${channelFormats.join(', ')}]` });
  }

  const metaNiches = Array.isArray(meta.niches) ? meta.niches : [];
  const channelNiches = channelConfig && Array.isArray(channelConfig.niches) ? channelConfig.niches : [];
  if (!metaNiches.some(n => channelNiches.includes(n))) {
    reasons.push({ code: 'niche_mismatch', detail: `template niches [${metaNiches.join(', ')}] have no overlap with channel niches [${channelNiches.join(', ')}]` });
  }

  if (capabilityMap === null || typeof capabilityMap !== 'object' || capabilityMap[meta.renderer] !== true) {
    reasons.push({ code: 'renderer_unavailable', detail: `renderer ${JSON.stringify(meta.renderer)} is not available (map value must be exactly true)` });
  }

  if (meta.deprecated === true) {
    reasons.push({ code: 'deprecated_template', detail: `template version ${meta.version} is deprecated${meta.deprecated_on ? ` on ${meta.deprecated_on}` : ''}` });
  }

  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true };
}
