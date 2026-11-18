# Wave 2 design — MASTER_KEY + ciphertext hardening (audit SEC-8 + SEC-10)

*2026-11-18 · Design only — no code written yet. Owner approval required before the issue is created.*

## The problem, in plain words

Three secrets today are locked to the wrong key material:

1. **Channel OAuth tokens** (`tokenEnc` in Neon) are encrypted with a key made from the **login password** (falling back to `YOUTUBE_CLIENT_SECRET`, falling back to the literal string `'quarry-connect'` — verified at [studio/lib/channels-registry.js:36](../../../studio/lib/channels-registry.js#L36)). Consequence: rotating the login password silently breaks every stored channel token, and the weakest fallback is a hardcoded string in a repo going public on day 19.
2. **Provider BYOK keys** (the vault, `yt-mcp/channel-keys.json` committed to git) have been v2-ready on the Studio side since #104 (keyed by `MASTER_KEY` when set), but the **CI-side loader** ([lib/channel-keys.mjs](../../../lib/channel-keys.mjs)) only understands v1. The day anyone sets `MASTER_KEY`, UI-saved provider keys silently stop applying in CI — with only a console line. The audit calls this the "vault v2 landmine."
3. One code path (`upsertChannel`'s DB-down repo fallback, [channels-registry.js:290-295](../../../studio/lib/channels-registry.js#L290)) can still write `tokenEnc` into the committed registry file. The DB→repo *sync* path was already fixed (#8 audit, `mergeRegistrySync` strips it) — the fallback path was missed. HEAD is currently clean (0 `tokenEnc` in `yt-mcp/studio-channels.json`); this closes the hole so it stays clean.

## Verified current state (facts this design is built on)

- Token writers: OAuth connect flow + `scripts/import-parked-channels.mjs` — all via `encryptJSON` in channels-registry.js (one choke point).
- Token readers (functional, not just display): `ytTokenRaw` in [studio/lib/data.mjs:183](../../../studio/lib/data.mjs#L183) — wizard channels' server-side YouTube API access depends on decrypting `tokenEnc`; and the registry read-back route. **Breaking the key derivation breaks wizard channels' YouTube calls** — so old rows must never lock out.
- Vault: exactly **1 row** (`money-rulebook`), legacy v1 format (no `key_version` field), ciphertext committed to git.
- Studio vault side is already v2-capable (#104: `masterEncKey` = sha256(`quarry-channel-keys-v2|` + MASTER_KEY), migration-on-read, fail-closed).
- CI loader consumers: `lib/ai-adapter.mjs` + `lib/template-preflight.mjs`, running inside **12 of 24 workflows** (the ones carrying `YOUTUBE_CLIENT_SECRET`).
- ntfy alert helpers already exist both sides (`lib/ntfy-alert.mjs` shim → `studio/lib/ntfy-alert.mjs`).

## The design

### Decision 1 — ONE master key, two derivations

A single `MASTER_KEY` env var (32 random bytes, base64). Domain-separated SHA-256 derivations, mirroring the shipped #104 pattern:

| What | Derivation |
|---|---|
| Vault v2 (exists) | `sha256('quarry-channel-keys-v2\|' + MASTER_KEY)` |
| Channel tokens v2 (new) | `sha256('quarry-studio-tokens-v2\|' + MASTER_KEY)` |

Why SHA-256 and not scrypt/argon2: `MASTER_KEY` will be a random 256-bit value (not a human password), so memory-hardening adds nothing; the audit's "scrypt/argon2" concern applies to password-shaped keys, and domain separation prevents cross-use. (If the owner later prefers a password-shaped key, scrypt is a drop-in at the derivation sites.)

### Part A — channel token crypto (`studio/lib/channels-registry.js`)

- **A1**: `encryptJSON` uses the v2 derivation when `MASTER_KEY` is set; otherwise the legacy derivation with a one-per-process deprecation warning (same shape as `keysEncKey` in keys-vault.js). Connects never break before migration.
- **A2**: the `'quarry-connect'` literal is **deleted**. Legacy derivation = `STUDIO_PASSWORD || YOUTUBE_CLIENT_SECRET`; when neither is set, encrypt/decrypt **refuse** (return null / throw) instead of silently using a public string. (Today that only fires on a broken deployment — the literal was pure false safety.)
- **A3**: `decryptJSON` tries v2 first (when `MASTER_KEY` set), then legacy. Wrong/missing key → `null`, never garbage. Existing rows keep working through the whole migration window.
- **A4**: `tokenEnc` can never reach the repo again: strip it in `upsertChannel`'s DB-down fallback **and**, belt-and-suspenders, in `writeRegistry` itself (one line, covers every future caller).
- **A5**: no format change to `tokenEnc` strings (still `iv.tag.ct`) — the version is discovered by trying derivations, exactly like the vault does.

### Part B — CI vault loader v2 port (`lib/channel-keys.mjs`)

- **B1**: `decryptKeys` mirrors the studio semantics: `MASTER_KEY` set → try v2 then legacy; unset → legacy only; fail-closed `null`.
- **B2**: honor `entry.key_version` when present (declared version first, cross-try on mismatch — a port of `readKeys`' logic).
- **B3**: when a vault row is unreadable, `applyChannelKeys` sends an **ntfy alert** (slug + reason, fire-and-forget, can never fail the run) in addition to the existing console line. "Silently using shared keys" becomes loud.
- **B4**: shared-keys fallback, capability filtering, dead-key check, shared-stash restore (#39) — all unchanged.
- **B5**: the 12 workflows that pass `YOUTUBE_CLIENT_SECRET` also pass `MASTER_KEY: ${{ secrets.MASTER_KEY }}` (mechanical env lines, in the same issue).

### Part C — one-time migration script (`scripts/migrate-master-key.mjs`)

- **C1** tokens: scan Neon `channels.token_enc`; rows decryptable under legacy but not v2 → listed; `--apply` re-encrypts under v2 and UPDATEs the row.
- **C2** vault: rows without `key_version: 2` → re-encrypt under v2, stamp `key_version: 2`, write the file.
- **C3**: dry-run by default; `--apply` required; never prints plaintext or ciphertext — per-row status only. Idempotent (re-run reports zero).
- Runs from the owner's machine with `DATABASE_URL` + `MASTER_KEY` + legacy-material env vars in the shell, never stored in the repo.

### Part D — operator runbook (the anti-landmine order)

**The audit's landmine is an ordering trap; this order makes it impossible to trigger:**

1. Merge + ship the code (dual-read everywhere — nothing depends on `MASTER_KEY` existing yet). Deploy Vercel; workflows update on next run.
2. Owner generates the key locally (`openssl rand -base64 32`), sets it as a Vercel production env **and** a repo Actions secret (`gh secret set MASTER_KEY`). The value is never printed into chat or the repo.
3. Run the migration script dry-run → `--apply`.
4. Verify: wizard-channel server-side YouTube calls still work (`ytTokenRaw` path); next CI run for money-rulebook shows keys applied; dashboard chips unchanged.

Until step 2, everything behaves exactly as today. There is no window where a v2 row exists that CI cannot read.

### Part E — what stays in git (decision point for the owner)

The audit's SEC-8 fix says "move all ciphertext to Neon (or private Vercel Blob)." Recommendation: **do NOT move the vault file to Neon in this wave.** Reasons: (a) with a random 256-bit `MASTER_KEY`, the committed vault ciphertext is no longer weakly keyed — that was the actual vulnerability; (b) CI reads the file from the checkout — moving it to Neon means CI fetches secrets over the network at every render, a new failure mode for zero practical gain while the repo is private; (c) the day-19 plan already requires rotating **all** channel tokens + provider keys at the public flip, which kills every historical ciphertext in git. The Neon move can be a later hardening issue if the owner wants it before day 19.

`yt-mcp/studio-channels.json` stays **ciphertext-free** (Part A guarantees it).

## EARS acceptance criteria (test-backed before ship)

- **R1**: WHEN `MASTER_KEY` is unset, THE SYSTEM SHALL encrypt/decrypt token and vault rows exactly as today (legacy derivations), so pre-migration behavior is byte-identical.
- **R2**: WHEN `MASTER_KEY` is set, THE SYSTEM SHALL encrypt new token/vault writes under the v2 derivations and SHALL still decrypt legacy rows (v2-then-legacy try order, fail-closed null).
- **R3**: THE SYSTEM SHALL NOT contain the `'quarry-connect'` fallback; with no key material set, encrypt/decrypt refuse.
- **R4**: NO code path SHALL write `tokenEnc` into any repo file (`upsertChannel` fallback + `writeRegistry` both strip).
- **R5**: WHEN `MASTER_KEY` is set, THE CI LOADER SHALL decrypt rows the STUDIO wrote under v2 (cross-boundary test: studio encrypts → CI decrypts → identical keys).
- **R6**: WHEN a CI vault row is unreadable, THE CI LOADER SHALL send one ntfy alert and SHALL continue with shared keys (never throws, never silent).
- **R7**: THE migration script SHALL convert both stores to v2 in one `--apply` run, idempotently, without printing secret material.
- **R8**: existing full test suite stays green (modulo the known pre-existing T4b).

## Test plan

- `tests/master-key-tokens.test.mjs` (new): R1–R4 behavioral (`encryptJSON`/`decryptJSON` with env toggled, garbage → null, refusal without key material) + source scans (literal gone; both strip sites).
- `tests/ci-vault-v2.test.mjs` (new): R5 cross-boundary (import BOTH libs in one test — both are plain ESM), R6 (stub `fetch`, assert alert sent exactly once per unreadable slug, run continues), legacy row readable without `MASTER_KEY`, v2 row unreadable without it (fail-closed).
- Existing `tests/channel-keys-vault.test.mjs` stays green (studio side untouched by this wave).

## Out of scope (later waves, per audit)

- SEC-9 (registry/profile routes shipping `tokenEnc` to the browser — separate projection fix).
- OPS-12 (Settings password-rotation flow — Wave 2 *unblocks* it: once tokens hang off `MASTER_KEY`, rotating `STUDIO_PASSWORD` no longer breaks anything).
- SEC-12 (live Actions-secret verification, operator UX).
- Day-19 rotation of all tokens/keys (already in the repo-public plan).

## Risks & rollback

- Biggest risk is ordering — neutralized by the runbook (code ships before the key exists anywhere).
- If `MASTER_KEY` is lost AFTER migration, v2 rows are unrecoverable — mitigation: the key lives in two places (Vercel + Actions secrets) and the runbook says to store it in the owner's password manager before step 3. Unsetting `MASTER_KEY` after migration degrades vault rows to shared-keys + loud ntfy alerts (R6 makes this visible, not silent).
- Rollback of the code itself is a `git revert` + redeploy; legacy rows were never rewritten in place (the script writes v2 only after a successful legacy decrypt), so reverting the code returns the system to fully-legacy state except already-migrated rows, which then need `MASTER_KEY` to stay set (documented).
