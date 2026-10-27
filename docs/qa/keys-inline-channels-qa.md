# keys-inline — QA file (#103)

Feature: keys-inline · Spec: `docs/superpowers/specs/2026-10-27-keys-inline-channels-spec.md` (issue #103)
Scope: all 12 ACs + the security invariants. Executor: a human against the **deployed Studio** (owner sign-in at `/login`); rows marked **[local]** can equally be executed against a local dev server. Evidence slots accept a screenshot path or a quoted output line. Screenshot widths: desktop 1440 and mobile 375 for every `visual` row.

## How to run

1. Studio deployed with this build (or `cd studio && npm run dev` locally); sign in as **owner**.
2. Have at least one active channel and one parked brand visible on `/channels`.
3. For AC-4 you need one deliberately invalid key string (e.g. `BAD-KEY-000`) and one real provider key you are willing to set (use a channel you own; the key can be removed right after).
4. Browser DevTools Network tab open for AC-3.

## Rows

### Row 1 — AC-1 · `visual`

Criterion (verbatim): "When the owner opens the Channels page, the system shall show a key toggle button on every active channel card's header row, alongside the existing scheduling/template/edit buttons."

- Precondition: owner signed in; `/channels` open; ≥1 active channel.
- Steps:
  1. Open `/channels`. Expect every active channel card's header row (next to the ACTIVE/PAUSED chip) to show a key icon button, alongside the calendar (schedule), layers (template), pause, and pen (edit) buttons.
  2. Hover the key button. Expect tooltip "API keys — per-channel provider keys (paste, Save & test, remove)".
- Expected: one key button per active card, in the same button row as the existing toggles.
- Boundary probe: page with exactly one active channel — the single card still has the button; no button on the parked grid tiles themselves.
- Actual:
- Evidence (screenshot/output path):
- Status:

### Row 2 — AC-2 · `visual`

Criterion (verbatim): "When the owner clicks a channel's key button, the system shall expand an inline API keys panel for that channel listing every registered provider with its status — masked value (••••last4) when set, "not set — shared key is used" when not — without navigating away from the page."

- Precondition: owner signed in on `/channels`.
- Steps:
  1. Click the key button on any active channel card. Expect a panel to expand directly under that card (same tile style as the schedule/template panels), headed "API keys".
  2. Expect one block per registered provider (Gemini, Groq, Cerebras, Mistral, HuggingFace, OpenAI, Pixabay, Pexels, OpenRouter, ElevenLabs), each showing either a green `••••<last4>` or the grey text "not set — shared key is used", plus a paste field and a "Save & test" button.
  3. Click the key button again. Expect the panel to collapse. The URL must still be `/channels` throughout.
- Expected: panel opens/closes inline; no page navigation at any point.
- Boundary probe: open the panel on channel A, then on channel B — A's panel closes, B's opens (only one open at a time).
- Actual:
- Evidence (screenshot/output path):
- Status:

### Row 3 — AC-3 · `manual` · [local]

Criterion (verbatim): "When the owner opens a channel's key panel, the system shall fetch that channel's key data at open time, and while the panel stays closed the system shall make no key API requests for that channel."

- Precondition: owner signed in on `/channels`; DevTools → Network tab open, filter `keys`.
- Steps:
  1. With all panels closed, wait 5 seconds. Expect **zero** requests to `/api/channels/keys`.
  2. Click a card's key button. Expect exactly one GET `/api/channels/keys?slug=<that channel>` appear at click time.
  3. Close the panel, open the same channel's panel again. Expect a fresh GET each open.
- Expected: fetch-on-open only; no key traffic on page load or while closed.
- Boundary probe: toggle the same panel open/closed rapidly 5× — no errors in console, request count grows only on opens.
- Actual:
- Evidence (screenshot/output path):
- Status:

### Row 4 — AC-4 · `manual`

Criterion (verbatim): "When the owner pastes a key for a provider and clicks Save & test, the system shall validate the key live before saving; when validation fails, the system shall show the rejection detail inline and store nothing."

- Precondition: owner signed in; a channel's key panel open.
- Steps:
  1. In any provider row (e.g. Gemini), click **Save & test** with the field empty. Expect the inline red message "paste a key first" and no network write.
  2. Paste `BAD-KEY-000` and click **Save & test**. Expect the inline red message starting "key rejected:" with the provider's own detail text, and the row's status unchanged (still "not set — shared key is used" if it was unset).
- Expected: invalid input never reaches storage; rejection text is shown inline in the panel.
- Boundary probe: paste a whitespace-only value — treated as empty ("paste a key first").
- Actual:
- Evidence (screenshot/output path):
- Status:

### Row 5 — AC-5 · `manual`

Criterion (verbatim): "When a key passes validation and is saved, the system shall display its masked value, refresh the provider's status in place, and record the change in the audit log and the keys file's git history (existing behavior, unchanged)."

- Precondition: owner signed in; a real provider key at hand; panel open on a test channel.
- Steps:
  1. Paste the real key, click **Save & test**. Expect the green message "saved ••••<last4>" and the row's status chip refresh to the masked value without a page reload.
  2. Open `/logs` (or the audit surface) — expect the newest entry "api-key set · <slug> · <provider> (••••<last4>)".
  3. Check the repo: a new commit titled `api-keys: <slug> <provider> set` exists.
- Expected: masked display, in-place refresh, audit entry, git commit — all as before the UI move.
- Boundary probe: double-click **Save & test** quickly — second click is disabled while the first is in flight (no duplicate write).
- Actual:
- Evidence (screenshot/output path):
- Status:

### Row 6 — AC-6 · `manual`

Criterion (verbatim): "When the owner removes a set key, the system shall delete it and indicate that the shared key takes over for that provider."

- Precondition: Row 5 left a key set (or any set key you may delete).
- Steps:
  1. In the provider row with the masked value, click the trash button. Expect the row's status to return to "not set — shared key is used" after reload of the panel data.
- Expected: key gone; shared-key indication restored; audit entry "api-key removed" written.
- Boundary probe: click remove on a row already showing "not set" — impossible; the trash button only renders on set rows.
- Actual:
- Evidence (screenshot/output path):
- Status:

### Row 7 — AC-7 · `manual`

Criterion (verbatim): "When the owner opens a channel's key panel, the system shall show the last change to that channel's keys (UTC timestamp and who), when one exists."

- Precondition: Row 5/6 performed a change on the test channel (or any channel with prior key history).
- Steps:
  1. Open that channel's key panel. Expect the info line "Last change <YYYY-MM-DD HH:MM> UTC · by <email> · every change is also in the audit log and git history."
  2. Open a channel whose keys were never touched. Expect NO meta line (not an empty placeholder).
- Expected: meta line only where history exists, timestamp in UTC, author shown.
- Boundary probe: after Row 6's removal, the meta line updates to the removal time/author.
- Actual:
- Evidence (screenshot/output path):
- Status:

### Row 8 — AC-8 · `visual`

Criterion (verbatim): "When a parked brand tile is expanded, the system shall offer the same inline key panel as active channel cards."

- Precondition: owner signed in; ≥1 parked brand on `/channels`.
- Steps:
  1. In the "Parked brands" card, click a parked brand tile. Expect a full-width panel with the same "API keys" content for that brand to appear below the tile grid.
  2. Click the tile again — panel closes. Click a different parked tile — the panel switches to that brand.
- Expected: parked brands get the identical key panel; tiles look clickable.
- Boundary probe: open a parked brand's panel and an active card's panel — they operate independently (no shared open-state clash).
- Actual:
- Evidence (screenshot/output path):
- Status:

### Row 9 — AC-9 · `manual` · [local]

Criterion (verbatim): "When a user opens the old `/keys` URL, the system shall redirect to the Channels page."

- Precondition: build deployed (or dev server running).
- Steps:
  1. Navigate to `/keys` while signed in. Expect to land on `/channels` (URL bar shows `/channels`).
  2. From a terminal: `curl -s -o /dev/null -w "%{http_code} %{redirect_url}" https://<studio-host>/keys` — expect `308` and the `/channels` target.
- Expected: permanent redirect; no 404 page ever shown for `/keys`.
- Boundary probe: `/keys?slug=x` (stray query) — still redirects to `/channels`.
- Actual:
- Evidence (screenshot/output path):
- Status:

### Row 10 — AC-10 · `visual`

Criterion (verbatim): "When the Studio loads, the system shall not list an API Keys item in the System navigation group."

- Precondition: signed in (owner).
- Steps:
  1. Open any studio page. In the sidebar's **System** group expect: Logs, Tasks, Users, Thumbnails, Settings — and **no** API Keys entry.
- Expected: nav item gone on every page, all roles that see the System group.
- Boundary probe: reload the page (nav is not a stale client cache).
- Actual:
- Evidence (screenshot/output path):
- Status:

### Row 11 — AC-11 · `manual`

Criterion (verbatim): "When a template-assignment compatibility check reports a missing capability, the system shall direct the owner to the channel's inline API keys panel rather than to a removed page."

- Precondition: owner signed in; template registry seeded; a channel missing a capability key for some template (check `/templates/registry` compatibility or pick a channel known to lack e.g. an ElevenLabs key).
- Steps:
  1. On `/channels`, open that channel's layers (template) panel, click **Assign template**, pick a template requiring the missing capability, click **Assign & pin**.
  2. Expect the red blocked message listing `missing_capability:...` with the fix sentence: "Fix: add a key in this channel's API keys panel (key icon on its Channels card)." — no mention of an "API Keys page".
- Expected: fix guidance points at the inline panel on the page the user is already on.
- Boundary probe: other block reasons (format_mismatch, niche_mismatch) keep their existing sentences — only the capability sentence changed.
- Actual:
- Evidence (screenshot/output path):
- Status:

### Row 12 — AC-12 · `manual`

Criterion (verbatim): "When a user without access to a channel (per existing slug access rules) opens its key panel, the system shall show the denial as a friendly inline message and expose no key material."

- Precondition: a **client** Google account bound to exactly one channel (invite via Settings → Team), signed in.
- Steps:
  1. As the client, open `/channels`. Expect to see only their bound channel's data (the overview API filters per role — other channels should not render).
  2. If any other channel's key panel is reachable, opening it must render the API's denial (e.g. "this channel is not linked to your account") as a friendly inline message — never raw JSON, never a masked value of another channel.
- Expected: slug access rules enforced exactly as before; no key material crosses the boundary.
- Boundary probe: as staff, every channel's panel opens normally (staff keep all-channel access — no behavior change).
- Actual:
- Evidence (screenshot/output path):
- Status:

### Row 13 — Security invariants · `automated`

Criterion (verbatim): "Keys are stored AES-256-GCM encrypted, only ever returned masked, validated before save, and every set/remove writes an audit entry."

- Precondition: repo checkout.
- Steps:
  1. Run `node --test tests/channel-keys-vault.test.mjs`. Expect all existing tests pass: AES round-trip (`iv.tag.ct`), masking (`••••` + last 4), corrupted-ciphertext fail-closed, Studio↔CI provider-map parity.
  2. Grep the keys API route for the audit calls — `appendAudit` present on both set and remove paths, unchanged by this feature.
- Expected: full suite green; the feature touched no vault/crypto/API file.
- Boundary probe: run the whole suite `node --test tests/` — no regressions anywhere.
- Actual:
- Evidence (screenshot/output path):
- Status:

## Regression — adjacent features touched by this change

### Row R1 — Schedule panel smoke · `manual`

This feature edits the same file that renders the schedule panel.

- Steps: on `/channels`, click a card's calendar icon → panel expands with the schedule controls → click again → collapses.
- Expected: unchanged behavior.
- Actual:
- Evidence:
- Status:

### Row R2 — Template panel smoke · `manual`

Same file + its message text edited.

- Steps: click a card's layers icon → panel loads assignments view → (owner) **Assign template** picker opens and closes.
- Expected: unchanged behavior; only the missing-capability fix sentence differs (Row 11).
- Actual:
- Evidence:
- Status:

### Row R3 — Client-view key manager smoke · `manual`

The client view has its own inline key manager that must be untouched.

- Steps: sign in as a bound client at `/client` → click **Manage API keys** → expect provider rows with statuses → close it.
- Expected: identical to before; no reference to the removed `/keys` page anywhere in the flow.
- Actual:
- Evidence:
- Status:

### Row R4 — Auth gate smoke · `manual`

The proxy role matrix was edited (dead rule removed).

- Steps: signed-out visitor opens `/channels` → lands on `/login?next=/channels`; signs in as owner → lands back on `/channels` with data.
- Expected: login flow unchanged; `/keys` rule removal affects nothing (page no longer exists; redirect covers it).
- Actual:
- Evidence:
- Status:

## Summary

Rows: 13 feature (1 automated, 6 manual, 4 visual, 2 manual-with-CLI) + 4 regression smoke. Criterion → row coverage: 12/12 ACs + invariants; every AC has exactly one row (none merged).

## Build-time evidence (gathered 2026-10-27, before human execution)

Quoted from the real local build/server (`STUDIO_PASSWORD` throwaway override; no production secret touched):

- **Row 13 (automated)** — `node --test tests/*.mjs`: `tests 173 / pass 173 / fail 0`; vault file alone: `tests 7 / pass 7 / fail 0`. Studio build: `✓ Compiled successfully`, `25/25` static pages, route table contains **no** `/keys`.
- **Row 9 (AC-9)** — local server:
  - unauthenticated `GET /keys` → `308 -> http://localhost:3000/channels`
  - `GET /keys?slug=x` → `308 -> http://localhost:3000/channels?slug=x`
  - `GET /keys` with owner session cookie → `308 -> http://localhost:3000/channels`
  - **production** `https://quarry-studio.vercel.app/keys` → `308 -> https://quarry-studio.vercel.app/channels`; `/channels` signed-out → `307` to login (gate unchanged)
- **Row 4 (AC-4, API half)** — owner session, channel `quotequarry`: `POST /api/channels/keys {provider: pixabay, key: "BAD-KEY-000"}` → `HTTP 400` `{"error":"key rejected: HTTP 400"}`; immediate re-GET shows `"pixabay":{... "set":false,"masked":null}` — nothing stored.
- **Row 2/12 (AC-2/AC-12, data shape)** — `GET /api/channels/keys?slug=quotequarry` returns the full registry-driven provider list with `set`/`masked` fields; `/api/overview` already filters channels per role (clients see only bound channels), so the denial path is the residual guard.
- **Two-axis code review** — spec axis flagged one major (AC-12 denial rendered as eternal spinner) — fixed in commit `4547cf3` along with `remove()` response honesty; standards axis: APPROVE (stale comment fixed same commit).

Human-executed rows (visual/manual, incl. rows 1, 3-browser-half, 5–8, 10–12, R1–R4) remain for the owner against the deployed Studio — Actual/Evidence/Status stay blank above until then.
