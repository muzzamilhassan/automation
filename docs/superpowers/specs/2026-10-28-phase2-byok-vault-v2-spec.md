# Phase 2 Spec — BYOK Vault v2 + Usage Ledger + Cost Dashboard

Status: DRAFT — awaiting owner approval before publishing to tracker. Per master plan `docs/superpowers/plans/2026-10-25-platform-own30-master.md` Phase 2 slices; research basis `platform-byok-providers-2026-10-24.md` §1–§4.

## Problem Statement

The Studio vault supports only two providers (OpenRouter, ElevenLabs) with no per-task routing. Every documentary and Short generation draws from whatever keys the pipeline environment happens to carry — the owner cannot see which service wrote which script, what it cost, or choose a different provider per channel without editing code. Free-tier quotas (the owner's strategy: one key per Gmail, ×15) are invisible to the system, and tonight's doc-script truncation showed the chain config is hand-maintained. Cost per video is unknowable.

## Solution

Vault v2 turns the BYOK vault into the **capability router**: the owner picks providers per capability (script-gen / tts / captions / image-gen) with priority + fallback order, keys are tested on save and shown masked, and every AI call records a **usage event** — so a new cost dashboard answers "what did each channel cost me this month" and "which provider wrote what". The documentary chain and the Shorts script brain both route through the same capability registry, and the YouTube quota model becomes per-project data. No more hand-edited chain configs.

## User Stories

1. As the owner, I want to add any provider's API key in the admin panel and have it tested immediately, so that I never discover a dead key mid-render.
2. As the owner, I want to assign which provider serves each capability (script-gen, tts, captions, image-gen) with priority + fallback order, so that a rate-limited service automatically falls to my backup.
3. As the owner, I want per-channel key overrides (channel X uses its own Gemini key), so that my one-key-per-Gmail strategy gives every channel its own quota.
4. As the owner, I want every AI call recorded (provider, model, task, tokens, measured-vs-estimated), so that cost per video and per channel is auditable.
5. As the owner, I want a cost dashboard with per-channel and per-provider rollups, so that I can rank channels by cost and prune weak ones.
6. As the owner, I want provider free-tier limits stored as data (RPD, output caps), so that the system warns me BEFORE a quota wall instead of failing mid-generation.
7. As the owner, I want masked keys (last 4 only) everywhere in the UI, so that keys never leak via screen or logs.
8. As the owner, I want the documentary chain driven by the same capability registry as Shorts, so that fixing the doc chain never requires hand-editing code again (ends the drift class from E2E rounds 2–3).
9. As the owner, I want the YouTube quota model stored as per-project data, so that quota math follows Google's current bucket structure without code edits.
10. As the owner, I want a paid OpenAI key to slot in as priority-0 for script-gen whenever I choose, so that upgrading quality is a UI action, not a deploy.

## Implementation Decisions

- **D1 — Provider matrix as data.** `PROVIDERS` static catalog (provider id, capability coverage, env-var names, base URLs, free-tier limits with fetch-dated fields, license class) replacing the mirrored route/preflight `CAPABILITY_PROVIDERS` tables (kills ledger debts M31/M34 — one source of truth, drift-pin unit test included).
- **D2 — Capability baseline stays in the shared lib.** `CAPABILITY_BASELINE` (pipeline truth) remains exported from template-registry.js; the vault REFINES availability add-only (Phase-1 semantics preserved, E2E-proven).
- **D3 — Per-channel key routing.** Extend the existing per-channel keys applier: resolution order = channel override → workspace default → baseline. `applyChannelKeys(slug)` (already wired into the doc renderer) becomes capability-aware.
- **D4 — Universal adapter.** One OpenAI-compatible client for script-gen (Groq/Cerebras/OpenRouter/Mistral/any base URL), thin native adapters for tts (ElevenLabs/edge-tts-local), transcription (local whisper family), search (Tavily/Serper). Cloudflare slot keeps its env-gated form until the owner adds CF keys (then it joins the matrix).
- **D5 — Usage ledger.** `usage_events` table (job_id, channel_id, provider, model, capability, tokens/audio-seconds/requests, usage_source: measured|estimated, cost_provider_usd, created_at) written by every adapter call; providers reporting usage in-response are recorded measured; others estimated via price table with the source flag.
- **D6 — Cost dashboard.** Studio page: per-channel/per-provider/per-template rollups over selectable windows; rows link to the job that spent.
- **D7 — Quota-model-as-data.** `youtube_quota_models` table (per GCP project: bucket structure + limits), replacing the hardcoded 1,700/upload ledger assumption; the existing schedule projection reads it.
- **D8 — Key security hardening.** Replace the `YOUTUBE_CLIENT_SECRET`-derived key derivation with `MASTER_KEY` env + `key_version` column (re-encrypt-on-read migration for existing stored keys); masked display and test-on-save behavior preserved from the current vault.
- **D9 — Model-name hygiene.** The doc chain's dead-model class is prevented structurally: provider catalog entries carry their CURRENT model ids (research-dated); a chain config referencing an id absent from the catalog fails a unit test.

## Testing Decisions

- Pure routing/resolution logic (capability map, priority + fallback, quota-model lookup) unit-tested with fixtures — same style as the existing template-registry suite.
- Adapter tests: request-shape tests with a stub HTTP layer (no live calls in CI); one live smoke per provider is the owner's E2E step (test-on-save in UI).
- Drift-pin test: route/preflight capability tables must deep-equal the shared catalog projection.
- Live E2E: re-run the documentary chain with a non-default provider priority and verify the usage event records the right provider/model.

## Out of Scope

Client/multi-user anything; image-gen provider wiring (no generator yet); RAG (Phase 3); billing/invoicing; per-channel keys for OAuth tokens (token storage stays as-is); OpenAI key purchase (owner decision, drop-in later per AC-10 of this spec's user stories).

## Acceptance Criteria (EARS-style)

- AC-P2-1: When a key is saved, the system shall test it against the provider and store masked display + last-tested timestamp; a failed test shall be visible at save.
- AC-P2-2: When a capability has multiple providers with priorities, the system shall use the highest-priority available provider and fall to the next only on that provider's failure.
- AC-P2-3: When a channel has a key override, the system shall use it before workspace defaults.
- AC-P2-4: When any adapter call completes, the system shall write a usage event with provider/model/capability/usage figures and the measured-or-estimated flag.
- AC-P2-5: When the cost dashboard opens, the system shall render per-channel and per-provider rollups for the selected window.
- AC-P2-6: When a provider's stored free-tier limit would be exceeded by a planned generation, the system shall warn at schedule time (advisory, not blocking).
- AC-P2-7: When the YouTube quota model row changes for a project, the schedule projection shall compute from the row without code changes.
- AC-P2-8: When a chain references a model id absent from the provider catalog, the unit suite shall fail (drift pin).
- AC-P2-9: When any stored key is read, the system shall decrypt via MASTER_KEY + stored key_version, and keys shall never appear in logs, responses, or errors.
- AC-P2-10: When the doc chain runs, it shall route through the same capability registry as Shorts (no provider-specific chain config left in yt-deepdive.mjs beyond endpoint wiring).

## Further Notes

Research basis with exact free-tier numbers: `research/free-doc-script-apis-2026-10-28.md` (fetched 2026-10-28) + `platform-byok-providers-2026-10-24.md`. The Phase-1 ledger's M31/M34 (provider-table drift) and the quota-ledger model discrepancy are retired by this phase. OpenAI-as-slot-0 remains an owner UI action available any time after this phase.
