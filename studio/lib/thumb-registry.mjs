// Thumbnail template registry — loader + selection (Phase 5 T2d, spec D10/D12/D14).
// Mirrors the video registry split: the DATA lives in thumb-registry.data.js
// (the 17 needsPhoto:false launch entries); THIS module validates it against
// the EXISTING v2 catalog (studio/lib/thumb-catalog.json — the 42 designs the
// renderer already ships) and resolves per-niche candidate sets with the
// rotation rule. Pure logic only — no DB, no fs, no UI, never throws.
//
// Selection contract (D12/D14, AC-P5-12..14):
//   thumbSetFor(niche)       — the niche's designs; a niche with no bindings
//                              falls back to the FULL pool (the upload never
//                              blocks on registry coverage).
//   pickCandidates(niche, n, { lastPickedId }) — the registry designs for
//                              candidates 2..N: DISTINCT designs in catalog
//                              order, rotated so the design AFTER lastPickedId
//                              leads (never the same layout back-to-back),
//                              clamped to the pool size. Fallbacks: a
//                              single-design set returns that design (possibly
//                              repeating — there is nothing else to rotate to);
//                              an empty set returns [] = the caller keeps the
//                              legacy single frame thumbnail. Deterministic:
//                              a pure function of its arguments (the tests pin
//                              the order).
//   uniqueDesigns(picks)     — first-seen dedup: collapses the 1-eligible
//                              repeat so the seam renders frame + THAT design
//                              = 2 candidates (D12's exactly-1-eligible math).
//   thumbRenderTokens(entry, kit, templateId) — the D11 brand-token binding:
//                              the kit's existing fields (accent/bg/label/
//                              eyebrow — the same inputs the Studio preview
//                              route passes) under the entry's optional token
//                              pins, with perTemplate overrides winning when
//                              the render knows its video template.

import catalogJson from './thumb-catalog.json' with { type: 'json' };
import { CANONICAL_NICHES } from './niches.js';
import { THUMB_REGISTRY } from './thumb-registry.data.js';

const CATALOG_BY_ID = new Map((catalogJson?.templates || []).map((t) => [t.id, t]));

/**
 * Validate ONE registry entry against the v2 catalog + the closed D17 niche
 * vocabulary. Collects all errors (never first-only). Pure and fail-closed.
 * @returns {string[]} every named error (empty = valid)
 */
export function validateThumbEntry(entry) {
  const errors = [];
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    return ['entry: must be an object with { id, niches[] }'];
  }
  const id = entry.id;
  if (typeof id !== 'string' || id.length === 0) {
    errors.push('id: must be a non-empty string (the thumb-catalog design id)');
    return errors; // every later check keys on the id — stop here
  }
  const spec = CATALOG_BY_ID.get(id);
  if (!spec) {
    errors.push(`id: "${id}" does not exist in the v2 thumb catalog (studio/lib/thumb-catalog.json) — entries bind EXISTING designs`);
  } else if (spec.needsPhoto) {
    // Ruling 6 / D14: the v1 launch set is needsPhoto:false ONLY — a photo
    // design would block (or fake) its required input at render time.
    errors.push(`id: "${id}" is a needsPhoto:true design — the v1 launch set ships needsPhoto:false designs only (stock-photo wiring is Phase 6)`);
  }
  if (!Array.isArray(entry.niches) || entry.niches.length === 0) {
    errors.push('niches: must be a non-empty array of canonical niche strings');
  } else {
    entry.niches.forEach((n, i) => {
      if (typeof n !== 'string' || n.length === 0) {
        errors.push(`niches[${i}]: must be a non-empty string`);
      } else if (!CANONICAL_NICHES.includes(n)) {
        errors.push(`niches[${i}]: "${n}" is not in the closed D17 niche vocabulary — copy channel niche strings EXACTLY (studio/lib/niches.js CANONICAL_NICHES)`);
      }
    });
  }
  if (entry.tokens !== undefined && (entry.tokens === null || typeof entry.tokens !== 'object' || Array.isArray(entry.tokens))) {
    errors.push('tokens: must be an object of brand-token pins (e.g. { shade: null })');
  }
  if (entry.perTemplate !== undefined) {
    if (entry.perTemplate === null || typeof entry.perTemplate !== 'object' || Array.isArray(entry.perTemplate)) {
      errors.push('perTemplate: must be an object keyed by video template_id');
    } else {
      for (const [tid, over] of Object.entries(entry.perTemplate)) {
        if (over === null || typeof over !== 'object' || Array.isArray(over)) {
          errors.push(`perTemplate["${tid}"]: must be an object of token overrides`);
        }
      }
    }
  }
  return errors;
}

/**
 * Validate + resolve the launch registry over the catalog, fail-closed (the
 * loadRegistryTemplates pattern): valid entries carry the catalog join for the
 * panel (label/category); invalid entries are excluded AND reported with every
 * error named. Never throws — a garbage `entries` input resolves to invalid.
 * @param {Array<{id: string, niches: string[], tokens?: object, perTemplate?: object}>} [entries]
 * @returns {{ designs: Array<object>, invalid: Array<{ id: string, errors: string[] }> }}
 */
export function loadThumbRegistry(entries = THUMB_REGISTRY) {
  const designs = [];
  const invalid = [];
  try {
    const list = Array.isArray(entries) ? entries : [entries];
    const seen = new Set();
    for (const entry of list) {
      const key = entry && typeof entry === 'object' && !Array.isArray(entry) ? String(entry.id ?? '(no id)') : '(no id)';
      const errors = validateThumbEntry(entry);
      if (errors.length > 0) {
        invalid.push({ id: key, errors });
        continue;
      }
      if (seen.has(entry.id)) {
        invalid.push({ id: entry.id, errors: ['id: duplicate registry entry — ids must be unique (the rotation order keys on them)'] });
        continue;
      }
      seen.add(entry.id);
      const spec = CATALOG_BY_ID.get(entry.id);
      designs.push({ ...entry, label: spec.label, category: spec.category });
    }
  } catch (e) {
    invalid.push({ id: '(registry)', errors: [`registry: unreadable (${String(e?.message || e).slice(0, 120)})`] });
  }
  return { designs, invalid };
}

/**
 * The niche's design set. A niche with no bindings falls back to the FULL pool
 * (the upload never blocks on registry coverage — D14's posture). Never throws.
 * @param {string|null} niche a canonical D17 niche string (verbatim kit string)
 * @param {Array<object>} [designs] override (test fixtures); default = the shipped launch set
 * @returns {Array<object>} the design entries in catalog order
 */
export function thumbSetFor(niche, designs = loadThumbRegistry().designs) {
  const pool = Array.isArray(designs) ? designs : [];
  const hit = pool.filter((d) => d && Array.isArray(d.niches) && d.niches.includes(niche));
  return hit.length > 0 ? hit : pool;
}

/**
 * The candidate selection (D12): n DISTINCT designs for candidates 2..N,
 * rotated past lastPickedId, clamped to the pool size. Deterministic order.
 * Fallbacks: 0 eligible -> [] (the caller keeps the legacy single frame
 * thumbnail); exactly 1 eligible -> that design, possibly repeating (a
 * single-design set has nothing to rotate to — uniqueDesigns collapses the
 * repeat at the seam). Never throws.
 *
 * The pool, in order of precedence (T2d round 1, D13):
 * - `assignedIds` present -> ASSIGNED ∩ ELIGIBLE: the entries whose id is in
 *   the assigned list (the channel kit's `thumbTemplates` — the panel's
 *   assignment storage), in catalog order. No niche matching, no full-pool
 *   fallback: an assigned id outside the eligible set (unknown, or a
 *   needsPhoto:true design) drops out of the intersection, and an empty
 *   intersection is 0 eligible ([] -> the caller keeps today's staggered
 *   frames). Clamp + rotation apply to the subset unchanged. A present-but
 *   -malformed assignedIds is an EMPTY intersection, never a widened pool.
 * - otherwise -> the niche's designs (thumbSetFor, full-pool fallback).
 * @param {string|null} niche (used only when assignedIds is absent)
 * @param {number} n how many registry slots to fill
 * @param {{ lastPickedId?: string|null, entries?: Array<object>, assignedIds?: string[] }} [opts]
 * @returns {Array<object>}
 */
export function pickCandidates(niche, n, opts = {}) {
  try {
    const slots = Math.max(0, Math.trunc(Number(n) || 0));
    if (slots === 0) return [];
    const override = opts && Object.prototype.hasOwnProperty.call(opts, 'entries') ? opts.entries : undefined;
    const base = override === undefined ? loadThumbRegistry().designs : override;
    let pool;
    if (opts && Object.prototype.hasOwnProperty.call(opts, 'assignedIds')) {
      // D13: the panel-assigned set is the pool — assigned ∩ eligible.
      const assigned = Array.isArray(opts.assignedIds) ? opts.assignedIds : [];
      pool = base.filter((d) => d && assigned.includes(d.id));
    } else {
      pool = thumbSetFor(niche, base);
    }
    if (pool.length === 0) return []; // 0-eligible — the legacy single frame thumb stands
    if (pool.length === 1) return Array.from({ length: slots }, () => pool[0]);
    // Rotation (AC-P5-13): lead with the design AFTER the last-used one so a
    // consecutive upload never reuses the layout. An unknown/absent
    // lastPickedId (missing/unreadable state = fail-soft to "first eligible")
    // keeps the catalog order.
    const last = opts?.lastPickedId;
    const at = typeof last === 'string' ? pool.findIndex((d) => d.id === last) : -1;
    const rotated = at >= 0 ? [...pool.slice(at + 1), ...pool.slice(0, at + 1)] : pool;
    return rotated.slice(0, Math.min(slots, pool.length));
  } catch {
    return []; // never throw — the upload never blocks on the registry
  }
}

/**
 * First-seen dedup over a pickCandidates result: the 1-eligible repeat
 * collapses to ONE render, so the seam's candidate count is D12's math —
 * exactly 1 eligible -> TWO candidates (frame + that render); >=2 eligible ->
 * N. Never throws.
 * @param {Array<object>} picks
 * @returns {Array<object>}
 */
export function uniqueDesigns(picks) {
  const seen = new Set();
  const out = [];
  for (const d of Array.isArray(picks) ? picks : []) {
    if (!d || typeof d !== 'object' || typeof d.id !== 'string' || seen.has(d.id)) continue;
    seen.add(d.id);
    out.push(d);
  }
  return out;
}

/**
 * The D11 brand-token binding: the channel kit's existing fields, under the
 * entry's optional token pins, with the perTemplate override winning when the
 * render knows its video template. Pure; never throws.
 * @param {object|null} entry a registry entry (tokens/perTemplate optional)
 * @param {object|null} kit the resolved brand kit (accent/bg/label/eyebrow)
 * @param {string|null} [templateId] the active video template id, when known
 * @returns {{ accent: string|null, shade: string|null, brand: string, eyebrow: string }}
 */
export function thumbRenderTokens(entry, kit = null, templateId = null) {
  const k = kit && typeof kit === 'object' ? kit : {};
  const tokens = { accent: k.accent ?? null, shade: k.bg ?? null, brand: k.label ?? '', eyebrow: k.eyebrow ?? '' };
  const apply = (over) => {
    if (over && typeof over === 'object' && !Array.isArray(over)) Object.assign(tokens, over);
  };
  apply(entry?.tokens);
  if (templateId) apply(entry?.perTemplate?.[templateId]);
  return tokens;
}
