// #102 TEMPLATE PREFLIGHT (Phase 1, Task 9, spec D4/D5) — the pipeline-side
// half of the template registry. Runs once per channel-pipeline invocation,
// BEFORE any script generation spend:
//   - channel with NO active registry assignment -> { mode:'legacy' } — the
//     caller proceeds exactly as today (spec D5: byte-identical legacy path).
//   - channel WITH an active assignment -> resolve the pinned major against
//     the CATALOG registry data (never the DB index — the DB index is the
//     sync mirror, the catalog block is the source of truth) and validate
//     compatibility. ok -> the caller logs/enriches the run; not-ok -> the
//     caller fails the run BEFORE generation (AC-8).
// Pure-ish orchestrator: the registry DB is injected for testability, and the
// only unmanaged dependency left is `registryDb.getActiveAssignment`, whose
// failure propagates (fail-closed: a preflight that cannot run must never
// silently pass an assigned channel through to generation).
import {
  loadRegistryTemplates,
  resolveAssignment,
  validateAssignment,
  channelConfigFromRegistryEntry,
} from '../studio/lib/template-registry.js';

// Vault provider -> registry capability. KEEP IN SYNC with
// studio/app/api/templates/assign/route.js CAPABILITY_PROVIDERS — the two
// validator moments (assignment save, generation preflight) must agree, or
// every save would block at generation. Engine knowledge, not brand data.
const CAPABILITY_PROVIDERS = {
  'script-gen': ['gemini', 'groq', 'cerebras', 'mistral', 'hf', 'openrouter'],
  'tts': ['openai', 'elevenlabs'],
  'captions': ['openai'],
  // PHASE-2 UPGRADE (mirrors the route): the vault holds no image-generation
  // provider today, so image-gen cannot be expressed — it stays unavailable
  // until Phase 2 adds a generator provider to the vault.
  'image-gen': [],
};

/**
 * Build the validator's capabilityMap from the providers applied for this
 * channel at pipeline boot (lib/channel-keys.mjs applyChannelKeys return
 * value — the decrypted per-channel vault keys, same "configured provider"
 * semantic the assign route reads straight from the vault: a key in the
 * vault passed live validateKey() at save time). Fail-closed: no applied
 * channel keys -> every capability unavailable.
 * @param {string[] | null} appliedProviders provider names applied to env
 * @returns {Record<string, boolean>}
 */
export function capabilityMapFromAppliedProviders(appliedProviders) {
  const applied = new Set(Array.isArray(appliedProviders) ? appliedProviders : []);
  const map = {};
  for (const [cap, providers] of Object.entries(CAPABILITY_PROVIDERS)) {
    map[cap] = providers.some((p) => applied.has(p));
  }
  return map;
}

/**
 * Run the generation preflight for one channel.
 * @param {object} p
 * @param {string} p.channelId channel slug (matches channel_template_assignments.channel_id)
 * @param {{ getActiveAssignment: (channelId: string) => Promise<null | { channel_id: string, family_id: string, pinned_major: number, pinned_version: string, assigned_by: string }> }} p.registryDb injected DB layer (template-registry-db.js) — Phase-1 operating rule: one active assignment per channel; the single-row result IS the assignment
 * @param {Array<object>} p.catalog template catalog families (studio/lib/templates-catalog.js TEMPLATES_DATA)
 * @param {Record<string, object>} p.meta registry metadata keyed by family id (template-registry.data.js REGISTRY_META)
 * @param {object | null} p.channelEntry raw channel registry entry (yt-mcp/studio-channels.json shape — same shape the Studio assign route validated against at save time); null -> empty config, which blocks on niche_mismatch (fail-closed)
 * @param {Record<string, boolean>} p.capabilityMap capability availability (capabilityMapFromAppliedProviders)
 * @returns {Promise<{ mode: 'legacy', verdict: null } | { mode: 'enforce', verdict: { ok: true, template_id: string, resolved_version: string, pinned_version: string | null, major_update_available: boolean, metaSummary: { variation_rules: string[], safety: object } } | { ok: false, reasons: Array<{ code: string, detail: string }> } }>}
 * @throws when the registry DB lookup fails (fail-closed, never a silent pass)
 */
export async function runPreflight({ channelId, registryDb, catalog, meta, channelEntry, capabilityMap }) {
  if (typeof channelId !== 'string' || channelId.length === 0) {
    throw new Error('runPreflight: channelId (non-empty string) is required');
  }
  if (!registryDb || typeof registryDb.getActiveAssignment !== 'function') {
    throw new Error('runPreflight: registryDb with getActiveAssignment is required');
  }

  // Order-dependent on purpose (ledger operating rule): without a familyId,
  // getActiveAssignment returns the channel's single active row — in Phase 1
  // that row IS the assignment. Null -> legacy, zero behavior change.
  const assignment = await registryDb.getActiveAssignment(channelId);
  if (!assignment) return { mode: 'legacy', verdict: null };

  // ---- ENFORCE MODE: every path below is a hard gate on generation ----
  const familyId = assignment.family_id;
  const pinnedMajor = assignment.pinned_major;

  // Registry blocks come from the CATALOG registry data (pinned contract) —
  // one { familyId, version } block per registry-assignable family; invalid
  // metadata simply drops the family, which then blocks the assignment below
  // (fail-closed: an assigned family without resolvable registry data never
  // silently generates).
  const view = loadRegistryTemplates(Array.isArray(catalog) ? catalog : [], meta && typeof meta === 'object' ? meta : {});
  const registryBlocks = view.templates.map((t) => ({ familyId: t.familyId, version: t.registry.version }));

  const resolved = resolveAssignment({ familyId, pinned_major: pinnedMajor }, registryBlocks);
  if (!resolved.ok) {
    return {
      mode: 'enforce',
      verdict: {
        ok: false,
        reasons: resolved.errors.map((err) => ({
          code: err,
          detail: `assignment to "${familyId}" (pinned major ${pinnedMajor}) does not resolve against catalog registry data: ${err}`,
        })),
      },
    };
  }

  const template = view.templates.find((t) => t.familyId === familyId && t.registry.version === resolved.resolvedVersion);
  const resolvedMeta = template ? template.registry : null;

  const channelConfig = channelConfigFromRegistryEntry(channelEntry || {});
  // Mirror the assign route's Phase-1 renderer assertion (route.js: registry
  // renderers ship in-repo with the CI render lane, so availability is
  // trivially true). PHASE-2 UPGRADE: track per-renderer availability instead.
  const effectiveCaps = resolvedMeta && resolvedMeta.renderer
    ? { ...(capabilityMap || {}), [resolvedMeta.renderer]: true }
    : (capabilityMap || {});

  const verdict = validateAssignment(resolvedMeta, channelConfig, effectiveCaps);
  if (!verdict.ok) return { mode: 'enforce', verdict: { ok: false, reasons: verdict.reasons } };

  return {
    mode: 'enforce',
    verdict: {
      ok: true,
      template_id: familyId,
      resolved_version: resolved.resolvedVersion,
      pinned_version: typeof assignment.pinned_version === 'string' ? assignment.pinned_version : null,
      major_update_available: resolved.majorUpdateAvailable === true,
      metaSummary: {
        variation_rules: resolvedMeta.variation_rules,
        safety: resolvedMeta.safety,
      },
    },
  };
}
