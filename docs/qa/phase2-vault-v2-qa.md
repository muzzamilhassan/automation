# Phase 2 BYOK vault v2 — QA file (#104)

Feature: vault-ui-v2 (providers + routing) · Spec: `docs/superpowers/specs/2026-10-28-phase2-byok-vault-v2-spec.md` (issue #104, AC-P2-1/2/3/9 in scope here)
Scope: the providers management page (`/providers`), the per-channel routing editor (Providers panel on `/channels` cards), the `/api/providers` route, and the key-hygiene invariants. Task-4 slice only — ledger/dashboard (AC-P2-4/5) and quota rows (AC-P2-6/7) have their own tasks' QA. Executor: a human against the **deployed Studio** (owner sign-in at `/login`); rows marked **[local]** can equally be executed against a local dev server. Evidence slots accept a screenshot path or a quoted output line. Screenshot widths: desktop 1440 and mobile 375 for every `visual` row.

## How to run

1. Studio deployed with this build (or `cd studio && npm run dev` locally); sign in as **owner**.
2. Neon `DATABASE_URL` reachable (routing rows live in `provider_routes`/`provider_route_audit`; without it Row 8's degraded banner shows and routing writes 502).
3. For Row 2 you need one real provider key you are willing to store on a test channel (removable right after) and one deliberately invalid string (e.g. `BAD-KEY-000`).
4. For Row 7 a **staff** account (invite via Settings → Team).
5. Browser DevTools Network tab open for Row 6.

## Rows

### Row 1 — Catalog browser · `visual`

Criterion (task scope): the providers page shows the full catalog — all 13 providers with capability coverage, free-tier limits (fetch-dated) and license class.

- Precondition: owner signed in; `/providers` open.
- Steps:
  1. Expect 13 provider rows: Gemini, Groq, Cerebras, Mistral, HuggingFace, OpenRouter, Cloudflare Workers AI, OpenAI, Tavily, Serper, ElevenLabs, Edge TTS (local), Whisper (local).
  2. Each row shows capability chips (script-gen / tts / captions / search), a license chip (green `free`, amber `free-with-caveats`, red `paid`), a free-tier line with a `fetched YYYY-MM-DD` date, and the research note.
  3. The HuggingFace row shows the red `paid` chip **and** the disqualification note ("licenseClass paid — disqualified as a free lane 2026-10-28…").
  4. The two local rows (Edge TTS, Whisper) show `local — no key` and never render a key input.
- Expected: catalog rendered from `studio/lib/provider-catalog.js` — 13 rows, dated free-tier data, license chips; hf carries its paid-class warning.
- Boundary probe: search the page for "••••" — masked values only ever appear as channel-key statuses, never inside the catalog notes.
- Actual:
- Evidence (screenshot/output path):
- Status:

### Row 2 — AC-P2-1 · `manual`

Criterion (verbatim): "When a key is saved, the system shall test it against the provider and store masked display + last-tested timestamp; a failed test shall be visible at save."

- Precondition: owner signed in; `/providers`; a test channel picked in a vault-tracked provider row (Gemini, Groq, Cerebras, Mistral, HuggingFace, OpenAI, OpenRouter or ElevenLabs).
- Steps:
  1. In the Gemini row, click **Save & test** with the key field empty. Expect the inline red "paste a key first" (or "pick a channel first") and no network write to `/api/channels/keys`.
  2. Paste `BAD-KEY-000`, click **Save & test**. Expect the inline red "key rejected: …" with the provider's detail text, and the row's key list unchanged.
  3. Paste the real key, click **Save & test**. Expect the green "saved ••••<last4> on <slug> — tested live at save", and a new key line `<slug> ••••<last4> tested <YYYY-MM-DD HH:MM> UTC · by <email>`.
  4. Open the channel's key panel on `/channels` — the same masked value shows there (one vault, two surfaces).
- Expected: live test before save via the existing vault path (`POST /api/channels/keys`), masked read-back with the save timestamp as the last-tested marker, visible failure without storage.
- Boundary probe: double-click **Save & test** quickly — the button disables while in flight (no duplicate write).
- Actual:
- Evidence (screenshot/output path):
- Status:

### Row 3 — AC-P2-1 (probe lane) · `manual`

Criterion (task scope): providers the vault has no slot for yet (Tavily, Serper, Cloudflare) get a real key probe with nothing stored.

- Precondition: owner signed in; `/providers`; a real Tavily (or Serper / Cloudflare token) key at hand.
- Steps:
  1. In the Tavily row, click **Test only** with an empty field — expect the red "paste a key first".
  2. Paste `BAD-KEY-000`, **Test only** — expect red "rejected: …" with the provider's detail.
  3. Paste the real key, **Test only** — expect green "key works — nothing stored", and **no** new key line appears under the row.
- Expected: the probe calls the provider live (search endpoint / token verify) and stores nothing — the note "no vault slot yet — this key rides the pipeline env" stays true.
- Boundary probe: run the probe twice with the same good key — both pass (idempotent, no state created).
- Actual:
- Evidence (screenshot/output path):
- Status:

### Row 4 — AC-P2-2 · `manual`

Criterion (verbatim): "When a capability has multiple providers with priorities, the system shall use the highest-priority available provider and fall to the next only on that provider's failure."

- Precondition: owner signed in; `/providers` → "Routing — workspace defaults" panel; Neon reachable.
- Steps:
  1. In the script-generation row, pick Groq in the add select, click **Add** — expect it appended (priority 100), and the effective-order line updates.
  2. In script-generation add a **second** keyed provider (e.g. Gemini after Groq). Expect priorities 100, 200 in list order.
  3. Click the **up** arrow on the second provider. Expect the order to swap, priorities re-spaced (100/200), and the row refresh without a page reload.
  4. Verify persistence: reload `/providers` — the order survived; check Neon `provider_route_audit` — one `set` row per moved provider, actor = your owner email.
  5. Click **remove** (trash) on one provider — expect it to leave the chain (audit row action `deactivate`); a second remove on the same provider 404s ("no active route for that provider").
- Expected: per-capability chains with up/down priority ordering, spaced priorities, audit rows on every set/deactivate — the config half of AC-P2-2 (the runtime fallback itself is exercised by the Task 5 adapter QA / live E2E).
- Boundary probe: try adding the same provider twice — the add select only lists providers not already in the chain, so a duplicate row is impossible.
- Actual:
- Evidence (screenshot/output path):
- Status:

### Row 5 — AC-P2-3 · `manual`

Criterion (verbatim): "When a channel has a key override, the system shall use it before workspace defaults."

- Precondition: owner signed in; Row 4 left a workspace-default chain; `/channels` open.
- Steps:
  1. On an active channel card, click the routing button (arrows icon) — expect the "Provider routing" panel to expand inline (same tile style as the schedule/template/keys panels), headed by the layer toggle.
  2. With "This channel (override)" active, add a provider to script-generation. Expect it listed with an `override` chip and priority 100.
  3. Read the panel's `effective:` line — expect the channel provider first `(channel)`, then the workspace defaults `(default)`, then the local lanes.
  4. Toggle to "Workspace default" inside the panel — expect the channel override row to disappear from that view and the defaults from Row 4 to show; toggle back — the override is intact.
  5. Reload the page and reopen the panel — both layers persisted.
- Expected: channel-specific routes run before workspace defaults and both layers are editable independently from the same panel.
- Boundary probe: open the routing panel on channel A and channel B — the toggle/layer state resets per panel (no cross-channel bleed).
- Actual:
- Evidence (screenshot/output path):
- Status:

### Row 6 — AC-P2-9 · `manual` + `automated` · [local]

Criterion (verbatim): "When any stored key is read, the system shall decrypt via MASTER_KEY + stored key_version, and keys shall never appear in logs, responses, or errors."

- Precondition: repo checkout; Row 2 left a key stored; browser DevTools Network tab.
- Steps:
  1. On `/providers`, confirm every key field is `type="password"` (dot-masked while typing) and every stored value renders as `••••<last4>` — never plaintext.
  2. In DevTools, open the `GET /api/providers` response — expect `keys` entries carrying `masked` only; search the raw response for the real key string — zero hits. No key material in any `routes`/`catalog`/`resolved` field either.
  3. Trigger a failing **Test only** (Row 3 step 2) and read the response — expect the truncated provider rejection detail (≤140 chars), never an echo of the key.
  4. Automated: `node --test tests/channel-keys-vault.test.mjs` — AES round-trip, masking, fail-closed, MASTER_KEY migration all green (vault crypto untouched by this feature).
- Expected: masked-everywhere holds across UI, API responses and error paths; decryption behavior unchanged from Task 2.
- Boundary probe: `curl` the API signed-out — `401 {"error":"not signed in"}` before any data (keys incl. masked values are owner/staff-only).
- Actual:
- Evidence (screenshot/output path):
- Status:

### Row 7 — Staff read-only · `manual`

Criterion (house auth: owner-write / staff-read): staff see the catalog, statuses, chains and effective orders, but can write nothing.

- Precondition: a **staff** account signed in.
- Steps:
  1. Open `/providers` — expect the "staff — read-only" chip in the header, the catalog and routing chains fully visible, but **no** Save & test / Test only buttons, no key inputs, no add-selects, no up/down/remove arrows.
  2. The routing panel shows "read-only — owner only".
  3. From DevTools console: `fetch('/api/providers', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({action:'set-route', capability:'script-gen', providerId:'groq', priority:100})}).then(r=>r.status)` — expect `403`.
  4. Same with `{action:'test-key', providerId:'groq', key:'x'}` — expect `403`.
- Expected: the UI hides writes AND the API rejects them server-side — staff read-only holds even against direct calls.
- Boundary probe: signed-out `POST /api/providers` → `403` (proxy 401 happens only for unauthenticated traffic; an authed staff gets the in-route 403).
- Actual:
- Evidence (screenshot/output path):
- Status:

### Row 8 — Empty & degraded states · `visual`

Criterion (task scope): every unconfigured surface shows a friendly state, never a blank tile or a raw error.

- Precondition: owner signed in; `/providers` and `/channels` open.
- Steps:
  1. A capability with no routes yet (fresh install: all four) — expect "No workspace routes yet — providers run in the catalog baseline order." (default layer) and "No channel override — the workspace default chain…is used." (channel layer).
  2. The image-generation row — expect "No provider covers this capability yet — nothing to route…".
  3. A provider with no env key and no channel keys (e.g. Serper on a fresh install) — expect the grey "key not configured" marker.
  4. Channels list empty — every add-key channel select shows "— no channels yet —" and **Save & test** is disabled.
  5. [local] Stop Neon (or unset `DATABASE_URL`) and reload `/providers` — expect the amber "Routing store unavailable (…) — resolution falls back to the catalog baseline order…" banner; catalog and key statuses still render; routing writes return `502 {"error":…}` (fail-closed write, fail-soft read).
- Expected: all six states render as designed and the read surface survives the DB being down.
- Boundary probe: restore the DB and reload — the banner disappears and chains return (no stale-cache state).
- Actual:
- Evidence (screenshot/output path):
- Status:

### Row 9 — Navigation & per-channel wiring · `visual`

Criterion (task scope): the surface is reachable and the per-channel panel sits in the existing channel-panel row.

- Precondition: signed in (owner or staff).
- Steps:
  1. The sidebar **Network** group shows **Providers** between Channels and Template Registry; clicking it lands on `/providers`.
  2. On `/channels`, every active card's header row shows the new routing button (tooltip "Provider routing — per-capability provider priority, channel override vs workspace default (#104)") alongside calendar/layers/key/pause/edit.
  3. Click it — the routing panel expands inside that card; click again — collapses; the URL stays `/channels`.
- Expected: nav item + per-card toggle, no navigation away, no layout break in the button row.
- Boundary probe: narrow viewport (375px) — the header button row wraps without overlapping the card title.
- Actual:
- Evidence (screenshot/output path):
- Status:

### Row 10 — Local lanes are not routable · `manual` · [local]

Criterion (task scope): the always-available local baseline lanes (edge-tts-local, whisper-local) are shown as terminal fallback and can never take a route row.

- Precondition: owner signed in; Neon reachable.
- Steps:
  1. In the routing panel, the local lanes render as `🔒 <lane> always available` chips — they never appear in add selects or chain rows.
  2. From DevTools console: `fetch('/api/providers', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({action:'set-route', capability:'tts', providerId:'edge-tts-local', priority:100})}).then(r=>r.json())` — expect `400 {"error":"provider is a local baseline lane — always available, no route needed"}`.
  3. `POST test-key` with `providerId:'edge-tts-local'` — expect `400 {"ok":false,"detail":"local lane — needs no key"}`.
- Expected: locals stay the implicit last resort; the API enforces what the UI hides.
- Boundary probe: `{action:'set-route', capability:'script-gen', providerId:'tavily'}` — expect `400 "provider \"tavily\" does not cover capability \"script-gen\""` (capability coverage enforced).
- Actual:
- Evidence (screenshot/output path):
- Status:

## Regression — adjacent features touched by this change

### Row R1 — Channel panels smoke · `manual`

This feature adds a fourth toggle to the same header row that renders the schedule/template/keys panels.

- Steps: on `/channels`, click a card's calendar → schedule panel expands; layers → template panel; key → keys panel; all still expand/collapse independently of the new routing panel.
- Expected: unchanged behavior for the three older panels.
- Actual:
- Evidence:
- Status:

### Row R2 — Template assignment compatibility · `manual`

The assign route consumes the same catalog (Task 1); this feature adds no validator change.

- Steps: on `/channels`, open a card's template panel, assign a compatible template — assignment succeeds as before; a template needing a missing capability still blocks with `missing_capability:` and the keys-panel fix sentence.
- Expected: identical validator behavior.
- Actual:
- Evidence:
- Status:

### Row R3 — Per-channel keys panel · `manual`

The add-key flow on `/providers` reuses the per-channel keys API the channels page panel uses — that panel itself is untouched.

- Steps: on `/channels`, open a card's keys panel — statuses, Save & test, remove all behave exactly as the #103 QA (`docs/qa/keys-inline-channels-qa.md`) describes.
- Expected: unchanged; keys saved from `/providers` appear here masked and vice versa.
- Actual:
- Evidence:
- Status:

### Row R4 — Catalog drift pin · `automated`

The catalog is the source of truth this UI renders; the drift-pin suite must stay green.

- Steps: `node --test tests/provider-catalog.test.mjs tests/provider-routing.test.mjs` — all pass (catalog projection = route/preflight consumers; routing resolution semantics unchanged).
- Expected: green.
- Actual:
- Evidence:
- Status:

## Summary

Rows: 10 feature (4 manual, 3 visual, 2 manual+automated, 1 automated) + 4 regression smoke. Criterion → row coverage: AC-P2-1 → Rows 2+3; AC-P2-2 → Row 4 (config) + Task 5/live E2E (runtime); AC-P2-3 → Row 5; AC-P2-9 → Row 6; staff read-only → Row 7; empty/degraded states → Row 8; nav/wiring → Row 9; local-lane hygiene → Row 10; catalog browser incl. hf paid-class note → Row 1. No AC merged or split silently.

## Build-time evidence (gathered 2026-10-28, before human execution)

Quoted from real local builds/tests; no production secret touched. Note: `next build` in the **main tree currently fails at HEAD (42e852f)** for a reason unrelated to this task — see the concern below; both builds below were run in an isolated git-archive copy of HEAD to separate the signals cleanly.

- **Pre-existence check (Build A — HEAD only, zero Task-4 files)**: `next build` → `EXIT=1`: `./lib/schedule-projection.js:100:39 Error: Module not found: Can't resolve '../../lib/quota-ledger.mjs'` — committed by the parallel Task 8 (d405445) whose root-`lib/` import sits outside the studio Turbopack root (`next.config.mjs: turbopack.root: '.'`). **Not a Task-4 regression.**
- **Task-4 build (Build B — HEAD + all Task-4 files + a one-line throwaway stub of exactly that broken import, isolated dir, nothing committed)**: `✓ Compiled successfully in 16.6s`, `EXIT=0`, route table contains `ƒ /api/providers` and `○ /providers`.
- **Full suite (main tree)**: `npm test` → `EXIT=0`: `tests 254 / pass 254 / fail 0` (baseline 247 + 7 tests added by parallel Phase-2 tasks; no regressions).
- **Lint**: `npx eslint` on the Task-4 files → the `react-hooks/set-state-in-effect` error + `exhaustive-deps` warning, byte-for-byte the same findings the committed house panels (`TemplateAssignPanel.js`, `ChannelKeysPanel.js`) already carry — matching house pattern; build does not run eslint.
- **Row 6 (automated half)**: `node --test tests/channel-keys-vault.test.mjs` green inside the 254.
- **Row 10 / Row 7 (API halves)**: enforcement lives in `studio/app/api/providers/route.js` — owner-gate (`denyOwner` → 403), capability-coverage check, local-lane rejection, `test-key` owner-gate — all server-side, UI-hidden writes can never bypass them.

Human-executed rows (visual/manual, incl. Rows 1–5, 6 browser half, 7–9, R1–R3) remain for the owner against the deployed Studio — Actual/Evidence/Status stay blank until then.

## Concerns for the controller

1. **Blocked main-tree build (pre-existing, not Task 4):** Task 8's d405445 made `studio/lib/schedule-projection.js` (client-reachable via `SchedulePanel`) dynamically import repo-root `lib/quota-ledger.mjs`, which is outside the studio Turbopack root — every `next build` of the main tree fails until Task 8's owner fixes it (e.g. move the import behind a server-only seam or vendored projection data). Task 4's own constraint evidence is Build A/B above; Task 4 deliberately did not touch another task's file.
2. AC-P2-2's runtime half (fallback actually firing on provider failure) lands with Task 5's adapter + the Task 9 live E2E; this file pins the config surface only.
