# Research: Should key operations live inline on the Channels page?

**Date:** 2026-10-27 · **Status:** research only, no code changed · **Owner decision pending**

## Question

Keys currently live on a separate `/keys` page (System nav group). Owner asks:
when configuring a channel, key operations should show right there on the
Channels page — is merging them in the better design?

## Current state (verified in code)

| Surface | What it does | File |
|---|---|---|
| `/keys` page | Standalone owner page: a channel `<select>` dropdown, then 10 provider cards (paste key → Save & test → masked read-back → remove). Shows "last change … by …" meta. | `studio/app/keys/page.js` |
| `/channels` page | Channel cards with **two existing inline panels** toggled by icon buttons in each card header: `SchedulePanel` (CalendarDays) and `TemplateAssignPanel` (Layers), plus Edit (PenLine) and autopilot pause. | `studio/app/channels/page.js:74-97`, `:156-157` |
| `/client` page | **Already ships inline keys.** `KeysInline` component: "Manage API keys" disclosure inside each channel card, same API. This is the exact pattern being proposed — it already exists for DFY clients. | `studio/app/client/page.js:121+` |
| API | Fully slug-parameterized: GET/POST/DELETE `/api/channels/keys?slug=…`. Owner-only + `canAccessChannelSlug` (owner/staff = all channels, client = bound channel only). **Zero backend change needed.** | `studio/app/api/channels/keys/route.js`, `studio/lib/access.js:61-66` |
| Providers | 10 providers, data-driven from `PROVIDERS` in `studio/lib/keys-vault.js:7-18` — panel stays registry-driven, no hardcoded maps. | |

## Why the separate page exists as friction

- Keys are *per-channel*, but the page holding them is not per-channel — the
  `<select>` dropdown at the top of `/keys` is a workaround for exactly the
  mismatch the owner noticed.
- `TemplateAssignPanel.js:27` already cross-jumps pages: *"Fix: add a key on
  the API Keys page."* The most common reason to open keys (fix a missing
  capability flagged during template assignment) sends the user to a
  different page, then back.
- The client view already proved inline keys work; the owner surface is the
  only one still page-based.

## Recommendation: YES — merge, following the existing panel pattern

### Design

1. **New component** `studio/components/ChannelKeysPanel.js` — lift the body of
   `/keys` (provider cards, meta line, footnotes) minus the page header and the
   channel `<select>`. Props: `{ slug, accent }` (same shape as `SchedulePanel`).
   Owner version stays richer than the client `KeysInline` (meta line, provider
   hints, "get a key" links).
2. **Channels page** gains a third panel toggle: KeyRound icon button in each
   card header next to CalendarDays/Layers, `keysOpen` state, render
   `<ChannelKeysPanel>` under the card. Panel opens on demand → no extra API
   traffic on page load (each panel fetches only when opened, like the client
   version).
3. **Update the cross-page message** in `TemplateAssignPanel.js:27` →
   "Fix: add a key in this channel's API keys panel" (user is already there).
4. **Fate of `/keys`:** see options below.

### API / security impact

None. Same endpoints, same owner-only gate, same encrypted-at-rest,
masked-read-back vault. The UI is the only moving part.

### One real catch: parked brands

`/channels` renders parked brands as small tiles with **no panel toggles**
(`studio/app/channels/page.js:163-181`). If `/keys` is deleted outright,
key management for parked channels is lost. Options:
- **A (recommended):** make parked tiles expandable with the same panel —
  parked brands are exactly where you pre-load keys before wake-up.
- **B:** keep `/keys` alive only for parked channels (awkward, half-page).
- **C:** drop parked key management (blocks the "wake up a parked brand"
  workflow that the parked card promises).

### `/keys` fate — options

| Option | Trade-off |
|---|---|
| Delete page + nav item, redirect to `/channels` | Cleanest match to owner intent; nav loses one System item. Fleet question ("which channels miss which keys?") loses its home — but nothing on `/keys` answered that today anyway (it was one-channel-at-a-time via dropdown). |
| Keep as read-only fleet coverage matrix (channels × providers, missing-key heatmap) | Genuinely useful at ~30-channel scale, but it's a *new feature*, not a migration — belongs in its own issue if wanted. |
| Keep as-is alongside inline panel | Two places to edit keys = drift + confusion; not recommended. |

**Suggested split:** Issue 1 = inline panel + parked-tile expand + delete
`/keys` + nav item + redirect (one coherent feature slice). Issue 2 (optional,
later) = fleet coverage matrix if the owner feels the need at scale.

## Effort estimate

Small: 1 new component (~150 lines, mostly lifted), 2 small edits
(channels page, TemplateAssignPanel message), 1 deletion, nav line removal.
No schema, no API, no CI changes.
