# OPS-12 design — change the panel password safely (Settings → Security)

*2026-11-18 · Design only — no code written yet. Owner approval required before the issue is created.*

## The problem, in plain words

The panel password (`STUDIO_PASSWORD`) has no change flow. The audit feared rotation because the channel-token key used to derive from the password — **#120 already fixed that**: every stored token now hangs off `MASTER_KEY`, independent of the login password. What's left to build is the guided, verified flow — plus one safety net for any pre-#120 straggler rows.

## What actually happens when the password changes (the physics)

| Consumer | Effect of rotation | Why |
|---|---|---|
| Login check ([login/route.js](../../studio/app/api/login/route.js)) | New password applies the moment the redeploy lands | compares against the deploy-time env |
| **Every session cookie** ([session.js](../../studio/lib/session.js) HMAC key = the password) | **All cookies die automatically** — owner, staff, client alike — at the edge, instantly | old cookies fail HMAC verification; everyone just signs in again (Google members re-click Google; the owner types the new password) |
| Channel tokens (Neon `channels.token_enc`) | **None** — v2 rows key off MASTER_KEY | #120; legacy (v1) stragglers are password-keyed → pre-flight re-protects them BEFORE rotation (see R5) |
| Provider-key vault | **None** — even legacy vault rows key off `YOUTUBE_CLIENT_SECRET`, never the password | keys-vault.js |
| In-flight OAuth connect links | Die (signed with the password) | instruction: don't rotate while a channel connect is mid-flow |

## The flow (four steps; step 3 is deliberately manual)

1. **Prepare (automated, this issue):** Settings → Security → new "Change panel password" card. Owner enters current + new + confirm → `POST /api/settings/rotate-password` (owner-only, rate-limited `pw-rotate` 5/hour via the #121 limiter). The server verifies the current password, validates the new one (12–128 chars, ≠ current, confirm matches), checks `MASTER_KEY` is set (refuses otherwise — that's the safety precondition), classifies every `channels.token_enc` row and re-encrypts any password-keyed v1 stragglers under v2, writes one audit row with **counts only**, and answers "ready" with the exact remaining steps.
2. **Set (manual, one minute):** the card shows the Vercel environment-variables deep link; owner pastes the new value over `STUDIO_PASSWORD`. (The panel cannot do this step itself — a Vercel API token powerful enough to change env vars is account-scoped, i.e. full-account power. Too much to hand the panel for a once-a-year action.)
3. **Redeploy (manual or CLI):** dashboard Redeploy button or `cd studio && vercel --prod`.
4. **Sign in:** owner logs in with the new password; everyone else re-logs-in as normal. Old cookies are already dead (physics row above). Optional hygiene: the existing "Sign out everywhere" button.

The server **never sets the password itself** — so even a hijacked owner session gains nothing from this endpoint (it can only *validate* a candidate, not install one).

## Changes

1. **`studio/app/api/settings/rotate-password/route.js`** (new): the flow above. Never mutates env, never logs password material.
2. **`studio/lib/channels-registry.js`**: add `classifyTokenEncRow(enc)` → `'v2' | 'legacy' | 'unreadable' | null` (master-key-only decrypt ⇒ v2; legacy-key-only ⇒ legacy; neither ⇒ unreadable). Pure, env-driven, testable.
3. **`studio/app/settings/page.js`**: the card in the Security tab (next to "Security — active sign-ins"): three password inputs + button + result panel with the step list + deep link.

## EARS acceptance criteria

- **R1**: the route SHALL be owner-only (401 otherwise) and rate-limited (`pw-rotate`, 5/hour, #121 `enforceLimits`).
- **R2**: WHEN `currentPassword` doesn't match the server's password, SHALL refuse with a wrong-password error and change nothing.
- **R3**: SHALL validate `newPassword`: length 12–128, ≠ current, and `confirm` matches — violations → 400 with a plain-English message.
- **R4**: WHEN `MASTER_KEY` is not set, SHALL refuse (503) with "set MASTER_KEY first" — rotation must never risk the legacy fallback path.
- **R5**: SHALL classify every `channels.token_enc` row and re-encrypt v1 stragglers under v2 before answering "ready"; the response reports `{ scanned, migrated, unreadable }`; `unreadable > 0` warns but does not block (those rows were already broken).
- **R6**: SHALL write exactly one audit row (`password-rotate-prepare`, counts only) — no password material in any log, audit row, or response.
- **R7**: SHALL NOT set the password server-side (no env mutation); the response carries the manual steps + the Vercel deep link.
- **R8**: the card SHALL render in the Settings Security tab with current/new/confirm inputs and the result panel.
- **R9**: the full suite stays green (modulo the known pre-existing T4b).

## Test plan

`tests/password-rotation.test.mjs`: behavioral `classifyTokenEncRow` (real crypto, withEnv pattern — v2/legacy/unreadable/null); legacy→v2 re-protect round trip (old row decrypts, re-encrypt classifies v2, reads back); route source scans (owner gate, rate limit, R2–R7 shapes incl. "no env assignment anywhere in the route", audit-counts-only line); page scan (card fields + deep link).

## Out of scope

- Vercel-API automation of step 2 (account-scoped token — rejected above).
- Password complexity rules beyond length (owner picks memorable).
- OPS-16 forensics (failed-attempts view) — separate item.

## Risks

- Owner rotates and forgets to redeploy → old password keeps working until they do; the card's step list spells out the order (env → redeploy → sign in).
- Mid-OAuth rotation → in-flight connect link dies; instruction line covers it.
- Pre-flight DB blip → the route answers with the error, rotation not declared ready (fail-closed: this endpoint protects correctness, not availability).
