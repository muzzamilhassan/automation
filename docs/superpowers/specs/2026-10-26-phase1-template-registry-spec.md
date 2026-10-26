# Phase 1 Spec — Template Registry MVP

Status: APPROVED-DIRECTION (owner, 2026-10-26) · published to issue tracker as the Phase 1 spec · EARS-style acceptance criteria inline
Basis: master plan `docs/superpowers/plans/2026-10-25-platform-own30-master.md` (Phase 1); research `platform-niche-template-system-2026-10-24.md` §3–5; owner directives (no-static-maps, planning-first). Scope strictly limited to Phase 1.

## Problem Statement

Video styles for the channels are split between pipeline code and a Studio catalog with no registry behind it. There is no version, no niche linkage, no record of which channel uses which template, and nothing checks compatibility before generation. At 16 channels this is manageable; at 30, every template change risks silently altering channels, and adding a template still requires touching code — violating the no-static-maps directive.

## Solution

A **template registry** layered onto the existing Studio template catalog: every video template gains an identity as data — semantic version, niches, format, required capabilities, variation rules, safety rules — kept in git as the source of truth, synced one-way into Neon as a derived index. The owner browses and assigns templates in the admin panel with pinned versions; a compatibility validator blocks bad assignments and generation preflights with exact reasons; six seed templates prove the path end-to-end on a pilot channel. After this phase, adding template #7 — eventually #30+ — is adding data, never code.

## User Stories

1. As the owner, I want to browse the catalog filtered by niche and format, so that I find the right style for a channel quickly.
2. As the owner, I want to assign a template pinned to a version, so that template updates never silently change a running channel.
3. As the owner, I want incompatible assignments rejected with the exact missing capability named, so that I fix configuration instead of debugging failed renders.
4. As the owner, I want to see which channels use a template, so that I know the blast radius before changing it.
5. As the owner, I want major template updates to wait for my explicit consent per channel, so that improvements never arrive as surprises.
6. As the owner, I want deprecated templates blocked from new assignments but still producing for existing ones, so that old channels keep running while I migrate.
7. As the owner, I want variation rules and safety rules to travel with the template, so that policy safeguards are data, not tribal knowledge.
8. As the owner, I want generation to refuse when template requirements are unmet, so that failures surface before spending render minutes.
9. As staff, I want to view catalog and assignments read-only, so that I can plan without risk.
10. As the owner, I want the niche taxonomy to drive template suggestions per channel, so that configuring channel #25 is picks-not-code.
11. As the owner, I want an assignment audit trail, so that output changes are explainable after the fact.
12. As the owner, I want invalid template data to fail sync loudly, so that the registry never drifts from git silently.

## Implementation Decisions

### D1 — Registry metadata (schema v1)
Each catalog family gains a `registry` block: `version` (semver string), `niches` (ids from the niche catalog), `formats` (short|long), `renderer` (existing engine family id), `required_capabilities` (subset: script-gen, tts, captions, image-gen), `variation_rules` (per-video distinct signals required), `safety` (required_sources: bool, review_required: enums, disclosure_risk), `deprecated` + `deprecated_on`, `changelog` (array of {version, date, note}). A hand-rolled validator (no new dependency) checks the block against schema v1 at load and **fails closed** — a bad registry block makes that template invisible to assignment and the sync run reports it (see D3). The catalog file stays in git — git is the source of truth.

### D2 — Versioning and version adoption (exact rules)
- Versions are semver `MAJOR.MINOR.PATCH`. **MAJOR** = breaking (scene structure, beat contract, required capabilities, variation/safety semantics). **MINOR** = additive non-breaking (new optional variant, new optional param). **PATCH** = no intended output change (copy fixes, asset path fixes).
- An assignment stores `pinned_major` (integer) and `pinned_version` (exact string at assign time).
- **Adoption rule:** at resolution time (each generation), the registry resolves the **highest available version within the pinned MAJOR** (`X.*.*`). MINOR and PATCH auto-adopt at the next generation with no owner action. **MAJOR bumps never auto-adopt**: the channel keeps resolving its pinned major even when a higher major exists; the channel's template panel shows "major update available" and adoption happens only when the owner explicitly re-pins the new major.
- Resolution is recorded in every job (template id + resolved version in the job record/artifact metadata), so every video is traceable to an exact version.

### D3 — Git → Neon sync (exact behavior)
- One-way, idempotent, derived: Neon mirrors git; git always wins. Sync computes a content hash per template; upserts only rows whose hash changed; identical state = no-op.
- **Updates:** metadata edits flow to the registry index on the next sync (auto: Studio lazily ensures sync at most every 6 hours on first registry DB access; manual/CI: `node sync-template-registry.mjs` exits non-zero on any failure).
- **Deprecation:** `deprecated: true` in git → registry index marks it; new assignments are rejected; existing assignments are untouched and keep resolving (the deprecated version stays resolvable); the template detail view lists affected channels.
- **Removal:** sync **refuses** to remove (or mark removed) any template that still has active assignments, and exits non-zero listing them — deprecate first, unassign, then remove.
- **Invalid data:** a template failing schema v1 is not upserted; the sync run reports it and exits non-zero (CI-visible), and the previously synced valid version remains active. Stale-but-valid beats broken; the registry never silently drifts.

### D4 — Compatibility validation (real configs, real capabilities)
- The validator is a pure function: `validateAssignment(templateRegistryMeta, channelConfig, capabilityMap)` → `{ ok: true }` or `{ ok: false, reasons: [{ code, detail }] }`.
- Inputs are live data: channel configuration from the existing channel registry (formats the channel produces, niche assignments, brand kit presence), and the capability map from the existing BYOK vault (a capability counts as available only if a provider is configured AND passed its test-on-save; in Phase 1 the capability map covers what the vault supports today — full capability routing lands in Phase 2, and unknown/unconfigured capabilities are blocking).
- Stable blocking reason codes: `missing_capability:<cap>`, `format_mismatch`, `niche_mismatch`, `renderer_unavailable`, `deprecated_template`. No overrides in Phase 1 — strict, with messages that name the fix (e.g. "no TTS provider configured — add one in Providers").
- Runs at **two** moments: assignment save (Studio API, blocks the save) and generation preflight (pipeline, before script generation, fail-closed for channels with an active registry assignment; writes a job event and fires an ntfy alert on block).

### D5 — Backward compatibility (guarantees)
- Channels **without** a registry assignment keep today's exact code path — engine selection, outputs, CI behavior are untouched. The preflight runs in **observe mode** for them (logs verdicts to job events, never blocks) so we collect data with zero behavior change.
- Channels **with** an active registry assignment run enforce mode — only the pilot channel in this phase, switched explicitly by making its assignment.
- No changes to any channel-*.yml production workflow triggers or matrix. The pilot E2E runs via manual dispatch/local produce, not the cron lane.

### D6 — Seed templates (6, mapped from the existing catalog)
Six existing catalog families receive full registry metadata and niche mapping — no new renderers: history → documentary frames / timeline / figure profile; finance → concept-visual / principle-explainer / mistake-analysis (final family picks follow the niche research §2 lists and the catalog's actual families). Each seed: schema-valid registry block, capabilities declared, variation rules set, safety set (finance: review_required; sources required), assigned to the pilot channel.

### D7 — Pilot end-to-end acceptance test (the proof)
1. Sync registry (CLI) → exit 0, index rows for all catalog templates with valid metadata.
2. In Studio, assign a pinned seed template to the pilot channel (validator passes; audit event written).
3. Dispatch a produce run for the pilot channel (manual dispatch, not cron).
4. The run resolves the template from the registry (job record shows template id + resolved version), renders the artifact, and completes the existing publish path.
5. Evidence: job log lines + artifact present + registry resolution recorded. Re-run produces no duplicate upload (existing dedup guard unaffected).

## Acceptance Criteria (each maps to a user story; EARS-style)

- AC-1 (browse): When the owner opens the catalog page, the system shall list all templates with valid registry metadata, filterable by niche and format; templates with invalid metadata shall not be listed.
- AC-2 (assign+pin): When the owner assigns a template to a channel, the system shall store the assignment with pinned major and exact version, and write an audit event.
- AC-3 (reject): When an assignment would violate a blocking rule, the system shall refuse the save and return the stable reason codes with fix-naming messages.
- AC-4 (usage): When the owner opens a template's detail, the system shall list every channel currently assigned to it, with pinned versions.
- AC-5 (adoption): When a new MINOR or PATCH version syncs, the system shall resolve assigned channels to it at their next generation without owner action; when a new MAJOR syncs, the system shall keep resolving the pinned major until the owner explicitly re-pins.
- AC-6 (deprecation): When a template is deprecated in git and synced, the system shall reject new assignments for it and continue resolving existing assignments.
- AC-7 (safety data): When a seed template is loaded, the system shall expose its variation_rules and safety block to the pipeline record for the generation (consumed fully in Phase 3+; present and logged in Phase 1).
- AC-8 (preflight): When a channel with an active assignment generates, the system shall run the validator first and block generation with an ntfy alert if the verdict is not ok; when a channel has no assignment, the system shall log the verdict without blocking.
- AC-9 (read-only staff): When staff opens catalog or assignment pages, the system shall render read-only views; write attempts shall be refused by the API layer.
- AC-10 (suggestions): When a channel's niches are set, the system shall present that niche's templates first in the assignment picker.
- AC-11 (audit): When any assignment changes, the system shall record actor, timestamp, template, and from→to versions.
- AC-12 (sync safety): When a template fails schema validation or a removal is attempted on a template with active assignments, the sync shall exit non-zero, report the offending template/channels, and leave previously synced valid data active.
- AC-13 (E2E pilot): When the pilot produce run completes, the job record shall contain the registry-resolved template id and version, the artifact shall exist, and no duplicate upload shall occur.

## Testing Decisions

- The bulk of the suite tests the pure registry functions at module level with fixtures — validator verdicts per reason code, semver resolution (minor/patch auto, major hold), schema-validation fail-closed, sync behaviors against fixture rows (update, deprecation, removal-refusal, invalid-data). This matches the existing `node --test` registry-style suites (channels-registry, keys-vault) and needs no live Neon.
- DB-backed functions use the same fixture strategy as the existing suite; Studio pages are QA'd by the plain-English QA file executed row-by-row with screenshots (no browser automation in this phase).
- E2E pilot evidence is gathered per D7 and quoted in the phase close-out.

## Out of Scope

Thumbnail registry (Phase 5); fork-to-customize, community templates, owner-override of validation (Phase 5); RAG/variation-gate consumption of variation_rules (Phase 3 — Phase 1 only carries and logs them); new renderers; schedule UI changes; multi-tenancy/workspaces; client role; auto-dubbing; changes to production cron triggers.

## Further Notes

The bundled Next.js docs must be read before UI work (studio AGENTS.md: this Next.js version differs from training data). Repo is private — keep the suite fast within the existing 10-minute test budget. PLAN.md carries this as P30 Phase 1 (add-only lines). Exit gate: AC-13 evidence + adding template #7 as data-only demonstrated.
