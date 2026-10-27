# Spec: keys-inline — per-channel API key operations move into the Channels page, `/keys` retired

Date: 2026-10-27 · Status: approved for build (owner approved seams + scope) · Research: `research/studio-keys-inline-ux-2026-10-27.md`

## Problem Statement

API keys are per-channel, but they are managed on a separate page (`/keys`) that reaches a channel only through a dropdown. Fixing a key means: read the error on the Channels page → navigate to API Keys → pick the same channel from a dropdown → do the key operation → navigate back. The most common trigger — template assignment blocking with "missing capability … add a key on the API Keys page" — actively sends the user away mid-task. As the portfolio grows toward ~30 channels, this round trip happens more often and the dropdown becomes the slow path.

## Solution

Key operations move onto the Channels page. Every active channel card gets a key button that expands an inline panel with exactly the operations the current page has: per-provider status (masked value or "not set — shared key is used"), paste → Save & test, remove, "get a key" links, and the last-change meta. Parked brand tiles become expandable with the same panel so keys can be pre-loaded before wake-up. The separate API Keys page and its nav entry are removed; the old URL redirects to Channels. Nothing about key storage, validation, permissions, or auditing changes.

## User Stories

1. As the owner, I want key operations available on the same page as the channel I'm configuring, so that I don't lose context hopping between pages.
2. As the owner, I want a key button on each channel card, so that I can reach that channel's keys in one click.
3. As the owner, I want the key panel to open inline without navigation, so that configuring a channel is one continuous task.
4. As the owner, I want per-provider status (masked value or "not set — shared key is used") in the panel, so that I can see at a glance which providers are channel-specific.
5. As the owner, I want live validation before any key is saved, so that a broken or restricted key never silently enters the vault.
6. As the owner, I want the masked value shown after saving, so that I can confirm which key is active without ever seeing the secret.
7. As the owner, I want a remove action on each set key, so that I can fall back to the shared key at any time.
8. As the owner, I want a "get a key" link per provider, so that I can obtain a key without leaving the flow.
9. As the owner, I want the last-change timestamp and author in the panel, so that I can trace unexpected key changes.
10. As the owner, I want parked brands expandable with the same key panel, so that I can pre-load keys before waking a brand up.
11. As the owner, I want the old `/keys` address to redirect to Channels, so that bookmarks and muscle memory don't break.
12. As the owner, I want the API Keys item gone from the System navigation, so that the nav reflects where operations actually live.
13. As the owner, I want the template panel's "missing capability" message to point at the inline key panel, so that I can fix the cause right where the error appeared.
14. As the owner, I want keys to remain encrypted and forever masked, so that moving the UI doesn't weaken security.
15. As the owner, I want every key change to keep writing audit entries and git commits, so that the audit trail survives the relocation unchanged.
16. As the owner, I want the key panel to load data only when opened, so that the Channels page stays fast with ~30 channel cards.
17. As staff, I want the inline panel to enforce exactly the same access rules as the current API, so that my permissions don't change with the UI move.
18. As a DFY client, I want my client workspace's key manager to keep working unchanged, so that my workflow isn't disrupted.
19. As the owner, I want failures (bad key, network error, denied access) shown as friendly inline messages, so that problems are understandable without opening the console.
20. As an auditor reviewing the keys file history, I want the existing commit-per-change convention to continue, so that git history remains a complete audit trail.

## Acceptance Criteria (EARS)

The QA file quotes these verbatim, row per criterion.

- **AC-1**: When the owner opens the Channels page, the system shall show a key toggle button on every active channel card's header row, alongside the existing scheduling/template/edit buttons.
- **AC-2**: When the owner clicks a channel's key button, the system shall expand an inline API keys panel for that channel listing every registered provider with its status — masked value (••••last4) when set, "not set — shared key is used" when not — without navigating away from the page.
- **AC-3**: When the owner opens a channel's key panel, the system shall fetch that channel's key data at open time, and while the panel stays closed the system shall make no key API requests for that channel.
- **AC-4**: When the owner pastes a key for a provider and clicks Save & test, the system shall validate the key live before saving; when validation fails, the system shall show the rejection detail inline and store nothing.
- **AC-5**: When a key passes validation and is saved, the system shall display its masked value, refresh the provider's status in place, and record the change in the audit log and the keys file's git history (existing behavior, unchanged).
- **AC-6**: When the owner removes a set key, the system shall delete it and indicate that the shared key takes over for that provider.
- **AC-7**: When the owner opens a channel's key panel, the system shall show the last change to that channel's keys (UTC timestamp and who), when one exists.
- **AC-8**: When a parked brand tile is expanded, the system shall offer the same inline key panel as active channel cards.
- **AC-9**: When a user opens the old `/keys` URL, the system shall redirect to the Channels page.
- **AC-10**: When the Studio loads, the system shall not list an API Keys item in the System navigation group.
- **AC-11**: When a template-assignment compatibility check reports a missing capability, the system shall direct the owner to the channel's inline API keys panel rather than to a removed page.
- **AC-12**: When a user without access to a channel (per existing slug access rules) opens its key panel, the system shall show the denial as a friendly inline message and expose no key material.
- **Security invariants (regression-guarded, unchanged)**: keys are stored AES-256-GCM encrypted, only ever returned masked, validated before save, and every set/remove writes an audit entry.

## Implementation Decisions

- New shared component: an owner-facing per-channel API keys panel, props limited to the channel slug (plus accent for theming). Behavior lifted from the retired page; provider cards stay driven by the existing provider registry — no hardcoded provider lists in the component (no-static-maps rule).
- The Channels page gains a third panel toggle in each active channel card header (key icon next to the schedule and template icons), same open/close state pattern as the existing two panels.
- Parked brand tiles become expandable, revealing the same panel component (key management only — no scheduling/template panels for parked brands).
- The retired page's unique explanatory content — "channel keys run before shared keys" and the encrypted/never-viewed-again note — moves into the panel's footnote area.
- The `/keys` route is deleted and replaced with a redirect to the Channels page. Implementer note: this repo's Next.js version has breaking changes relative to training data — verify the redirect mechanism against the bundled Next.js docs before writing it.
- The System navigation group drops its API Keys entry.
- The template-registry panel's missing-capability fix message is reworded to point at the channel's inline key panel.
- No API changes, no schema changes, no vault/crypto changes, no permission changes. The DFY client view's existing inline key manager stays as-is.

## Testing Decisions

- Good tests here check external behavior only: what a signed-in user sees and can do in the deployed Studio — not component internals.
- The API/vault seam is unchanged and already unit-tested at the lib seam (AES round-trip, masking, provider-map parity with the CI side); those existing tests are the regression guard. No new unit tests.
- The new UI is tested at the highest seam: the deployed Studio, via a new plain-English QA file — one row per AC, criterion quoted verbatim, human-executed with screenshot/output evidence, Actual/Evidence/Status filled at execution. Same format as the Phase-1 template registry QA file.
- Prior art: the Phase-1 template registry QA file (row structure, boundary probes, desktop 1440 + mobile 375 widths) and the channel-keys vault unit tests.

## Out of Scope

- Fleet-level key coverage view (channels × providers matrix / missing-key heatmap) — candidate follow-up, its own issue if wanted.
- Any change to the DFY client view.
- Shared-key management (env vars / Settings) — unchanged.
- Any API, vault, crypto, schema, or permission change.
- Multi-key-per-provider, key rotation, or expiry features.

## Further Notes

- Research backing: `research/studio-keys-inline-ux-2026-10-27.md` — the channels page already hosts two inline panels (schedule, template registry); the client view already ships inline keys; the `/keys` dropdown exists only because keys live on a non-channel page.
- Scale context: own-portfolio ~30 channels; fetch-on-open keeps the Channels page fast at that scale.
- The QA file for this spec is written during the build phase (same convention as the template-registry work: spec → build → QA file → evidence).
