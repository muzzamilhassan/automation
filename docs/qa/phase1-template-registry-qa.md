# Phase 1 Template Registry — QA file (Studio UI, Task 8)

Feature: template-registry-studio-ui · Spec: `docs/superpowers/specs/2026-10-26-phase1-template-registry-spec.md` (issue #102)
Scope: UI halves of AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-9, AC-10 (API/DB/pipeline halves live in Tasks 7/9/11 rows of the phase ledger).
Executor: a human against the **deployed Studio** (Task 11), executed row by row; Actual / Evidence / Status stay empty until then.

## How to run

1. Studio deployed with this build; sign in as **owner** at `/login` (password or Google — owner = team role `owner` in Settings → Team).
2. A second sign-in as **staff** (Google account invited with role `staff`) for the AC-9 row.
3. Rows marked **[needs seeds]** require the Task 10 registry seeds synced to Neon (`node sync-template-registry.mjs` exits 0). Rows marked **[runs pre-seed]** work on the empty registry (`REGISTRY_META = {}` today) and are the states to check before Task 10 lands.
4. Screenshot widths: desktop 1440 and mobile 375 for every `visual` row. Evidence slots accept a screenshot path or a quoted output line.

## Rows

### Row 1 — AC-1 (browse + filters + fail-closed listing) · `visual` · [needs seeds]

Criterion (verbatim): "When the owner opens the catalog page, the system shall list all templates with valid registry metadata, filterable by niche and format; templates with invalid metadata shall not be listed."

- Precondition: owner signed in; Task 10 seeds synced; Neon reachable.
- Steps:
  1. Open `/templates/registry`. Expect one card per seeded family (6 after Task 10): name, family id, version chip, niche chips, formats, renderer, capability chips, safety chips, "N variation rules", Detail link.
  2. Set the **Niche** dropdown to `finance` (any seeded niche). Expect only templates whose registry niches include it.
  3. Set it back to `all niches`; set the **format** segment to `Short`, then `Long`. Expect only matching cards in each.
  4. Type garbage in the search box (`zzz`). Expect the "No templates match these filters" empty state, then clear it.
- Expected: only valid-registry templates ever appear as cards; count in the header sub-line matches the seed count.
- Boundary probe: a deliberately invalid block (add one in `studio/lib/template-registry.data.js` with a bad semver, sync) must appear ONLY in the amber warning strip under the header — never as a card — and the strip lists the family id plus its exact validator errors. Remove the block afterwards.
- Actual:
- Evidence (screenshot/output path):
- Status:

### Row 2 — Catalog empty state (pre-Task-10 reality) · `visual` · [runs pre-seed]

Criterion: the registry UI must degrade gracefully when zero templates have registry metadata (today's `REGISTRY_META = {}`).

- Precondition: owner signed in; no registry seeds synced.
- Steps:
  1. Open `/templates/registry`. Expect the empty state titled exactly "No registry templates yet — seeds land in Task 10" with the explainer under it, and NO error banner.
  2. Open any channel's card on `/channels` and click the layers icon ("Template registry — assigned template, pinned version, assign/unassign"). The panel must read "No registry templates yet — seeds land in Task 10."
- Expected: clean empty states on both surfaces; no crash, no raw JSON, no stack trace.
- Boundary probe: filters set to a niche while the registry is empty — still the empty state, never "undefined" text.
- Actual:
- Evidence (screenshot/output path):
- Status:

### Row 3 — AC-2 (assign + pin) · `manual` · [needs seeds]

Criterion (verbatim): "When the owner assigns a template to a channel, the system shall store the assignment with pinned major and exact version, and write an audit event."

- Precondition: owner signed in; seeds synced; pilot channel `ai-observer` visible on `/channels`.
- Steps:
  1. On `/channels`, open the `AI Observer` card's layers icon. Click **Assign template**.
  2. In the picker, select `Documentary Master Frames` (the pilot seed). Confirm the **Pinned major** dropdown shows `1 (current)`.
  3. Click **Assign & pin**.
- Expected: green message "Assigned — pinned major 1, resolving v1.0.0" (resolved version = the seed's exact version); the assignment row appears with chip `pin v1.0.0 (major 1)`, "assigned by <owner email>" and a UTC timestamp.
- Boundary probe: re-click **Assign & pin** with the same template/major — expect a clean re-assign message (upsert), never a duplicate row; the DB keeps one active assignment per (channel, family).
- Actual:
- Evidence (screenshot/output path):
- Status:

### Row 4 — AC-3 (blocked assignment, fix-naming messages) · `manual` · [needs seeds]

Criterion (verbatim): "When an assignment would violate a blocking rule, the system shall refuse the save and return the stable reason codes with fix-naming messages."

- Precondition: owner signed in; seeds synced; a channel WITHOUT the capability keys a seed requires (check the BYOK vault on `/keys` — pick a channel missing `tts`, e.g. a parked brand).
- Steps:
  1. Open that channel's registry panel, click **Assign template**, pick a seed whose `required_capabilities` include the missing capability.
  2. Click **Assign & pin**.
- Expected: red panel "Not compatible — assignment blocked:" listing one bullet per reason, each with the raw code (`missing_capability:tts`, `niche_mismatch`, `format_mismatch`, …) in small mono, followed by a plain sentence naming the fix (e.g. "add a key on the API Keys page", "give the channel a long-form slot in Production scheduling", "set a matching sub-niche in the channel's settings"). No assignment row appears; the picker stays open.
- Boundary probe: pick a deprecated seed (if any) — expect the `deprecated_template` bullet ("This template is deprecated — … pick a newer style"); an unknown family id forced via the API (outside the UI) returns 404 and the UI never lists such a family in the picker at all.
- Actual:
- Evidence (screenshot/output path):
- Status:

### Row 5 — AC-4 (usage list) · `visual` · [needs seeds]

Criterion (verbatim): "When the owner opens a template's detail, the system shall list every channel currently assigned to it, with pinned versions."

- Precondition: at least one assignment exists (from Row 3).
- Steps:
  1. Open `/templates/registry` and click **Detail** on the assigned template (or go straight to `/templates/registry/detail?family=<familyId>`).
  2. Read the **Used by** card.
- Expected: one row per assigned channel showing the display label plus raw channel id, a `pin v<version> (major <major>)` chip, and the assignment UTC timestamp. Zero assignments → "No channels assigned yet" empty state.
- Boundary probe: after unassigning (Row 3 channel, **Unassign** button), reopening the detail shows the empty usage state — the list reflects active assignments only.
- Actual:
- Evidence (screenshot/output path):
- Status:

### Row 6 — AC-5 (major-update banner + explicit re-pin; minor/patch auto-adopt note) · `manual` · [needs seeds]

Criterion (verbatim, relevant half): "…when a new MAJOR syncs, the system shall keep resolving the pinned major until the owner explicitly re-pins."

- Precondition: an active assignment pinned to major 1 (Row 3).
- Steps (minor/patch first):
  1. Bump the seed's registry `version` within the major (e.g. `1.0.0` → `1.1.0`) in `studio/lib/template-registry.data.js`, add a changelog entry, sync, reopen the channel panel.
     Expected: NO banner; an info note "Minor/patch updates auto-adopt — the next generation resolves v1.1.0 (no action needed)." The pinned chip still reads the old exact version until the next generation.
- Steps (major next):
  2. Bump the seed to the next major (`2.0.0`) with a changelog entry, sync, reopen the channel panel.
     Expected: a blue banner "Major update available: v2 is published — this channel stays pinned to 1 until you adopt it." with a **Re-pin to v2** button. The same banner appears on the template's detail page next to the affected channel row.
  3. Click **Re-pin to v2**.
     Expected: green message "Re-pinned to major 2 — resolving v2.0.0"; the assignment chip now reads `pin v2.0.0 (major 2)`; the banner disappears.
- Boundary probe: while pinned to 1 with v2 published, nothing in the UI silently changes the pin on refresh; staff (AC-9 row) sees the banner but NO re-pin button.
- Actual:
- Evidence (screenshot/output path):
- Status:

### Row 7 — AC-6 (deprecation notice) · `manual` · [needs seeds]

Criterion (verbatim, relevant half): "When a template is deprecated in git and synced, the system shall reject new assignments for it and continue resolving existing assignments."

- Precondition: one seed marked `deprecated: true` + `deprecated_on` in git and synced; a channel assigned to it (older row) and a fresh channel to attempt a NEW assignment.
- Steps:
  1. Open `/templates/registry`. Expect the deprecated template's card to carry a `deprecated` chip and the page footer to show the amber explainer ("Deprecated templates keep producing… the validator blocks every new assignment").
  2. Open its detail page. Expect the amber "Deprecated since <date>" banner with the keep-producing/migrate text.
  3. On an unassigned channel, open the picker: the deprecated template appears marked `(deprecated)` with an inline warning "deprecated — the validator blocks new assignments".
  4. Try assigning it anyway.
     Expected: red block with the `deprecated_template` bullet — the save is refused.
  5. Check the still-assigned channel's panel row: `deprecated` chip plus the notice "Deprecated since <date> — existing production keeps running; migrate to a newer style when ready." No forced unassign, no broken resolution note.
- Expected (summary): deprecation visible in all four surfaces (card, detail, picker, assigned row); new assignments blocked; existing untouched.
- Boundary probe: deprecated template pinned via a NEW major re-pin (Row 6 flow) — the validator must refuse with `deprecated_template`, and the panel shows that refusal.
- Actual:
- Evidence (screenshot/output path):
- Status:

### Row 8 — AC-9 (staff read-only) · `visual` · [needs seeds for full effect; read-only rendering itself runs pre-seed]

Criterion (verbatim, relevant half): "When staff opens catalog or assignment pages, the system shall render read-only views; write attempts shall be refused by the API layer."

- Precondition: staff Google account signed in (role `staff` from Settings → Team).
- Steps:
  1. Open `/templates/registry` as staff. Expect the header chip "read-only — owner only"; NO amber invalid-blocks strip (owner-only); Detail links work.
  2. Open a channel's registry panel as staff. Expect the same view the owner sees — assignments, banners, notes — with the "read-only — owner only" chip, and NO **Assign template** button, NO **Unassign**, NO **Re-pin**.
  3. (API half, quoted here for completeness) With the staff session, POST `/api/templates/assign` with any body — expect `403 {"error":"owner only"}`; the UI offers no path that produces this call.
- Boundary probe: staff opening a template detail with an invalid family sees the "Not a registry template" card WITHOUT the full schema-error list (owner-only detail); signed-out visitor to `/templates/registry` gets the sign-in gate, never a data leak.
- Actual:
- Evidence (screenshot/output path):
- Status:

### Row 9 — AC-10 (niche-first picker ordering) · `visual` · [needs seeds]

Criterion (verbatim): "When a channel's niches are set, the system shall present that niche's templates first in the assignment picker."

- Precondition: seeds synced across at least two niches; pilot channel has its niche set (main niche or sub-niches in the channel kit).
- Steps:
  1. Open the pilot channel's registry panel, click **Assign template**.
  2. Read the picker options in order.
- Expected: templates whose registry niches overlap the channel's niches come FIRST, each prefixed `★`; within each group alphabetical by name. The panel header shows a chip with the channel's niches ("channel niches: …") — these are the exact strings the validator compares. Templates whose formats can't fit the channel carry a `— format mismatch` suffix on the option.
- Boundary probe: a channel with NO niches configured — no `★` prefix on anything, default alphabetical order, no crash.
- Actual:
- Evidence (screenshot/output path):
- Status:

## Regression (CONTINUE TO / adjacent surfaces)

### Row R1 — Channels page happy path · `manual`

- Steps: open `/channels`; toggle autopilot (pause/play) on any live channel; open and close the scheduling panel; open and close the new template panel; click Edit (pencil).
- Expected: nothing regressed — flow chip flips PAUSED/ACTIVE, SchedulePanel saves as before, template panel opens/closes without disturbing the schedule panel, edit link still deep-links to `/channels/add?edit=<slug>`.
- Actual: — Evidence (screenshot/output path): — Status:

### Row R2 — Video Templates catalog (public browse) untouched · `manual`

- Steps: open `/templates` (the existing "Video Templates Studio").
- Expected: 100+ catalog cards with interactive demos still render from the static catalog — the registry work added a separate `/templates/registry` page and changed nothing on this one.
- Actual: — Evidence (screenshot/output path): — Status:

### Row R3 — API contract intact for old consumers · `automated`

- Steps: run `npm test` at repo root (147+ tests) and `cd studio && npx next build`.
- Expected: suite green (registry lib tests including the shared `channelConfigFromRegistryEntry` hoist); build exits 0 with `/templates/registry`, `/templates/registry/detail`, `/api/templates`, `/api/templates/assign` in the manifest.
- Actual: — Evidence (output path): — Status:

### Row R4 — Known local-dev degradation (documented state, not a bug) · `manual` · [runs pre-seed]

- Steps: on a machine where the studio `.env.local` carries a stub `DATABASE_URL`, sign in and open a channel's registry panel, then a template detail page.
- Expected: the panel shows "Template registry unavailable: registry db: DATABASE_URL missing / db not ready…" (honest error, no fake data); the detail page still renders the registry block and shows "Usage list could not be read from the database: …" inside the Used-by card; the catalog browse page still serves the empty state. On a deployment with real Neon none of these fire.
- Actual: — Evidence (screenshot/output path): — Status:
