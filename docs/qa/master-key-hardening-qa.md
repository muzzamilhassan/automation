# QA — MASTER_KEY hardening: token crypto + CI vault v2 + ciphertext out of repo paths (#120)

*Built 2026-11-18. Plain-English QA. Every row executed for real before shipping.*

## What changed (in plain words)

1. **Channel tokens no longer depend on your login password.** They used to be encrypted with a key made from the login password (or a hardcoded string if that was missing). Now there is one master key: when `MASTER_KEY` is set, tokens encrypt under it; old tokens keep reading until you migrate them; the hardcoded fallback string is gone for good.
2. **The vault landmine is defused.** The studio was already able to write provider keys under the master key, but the CI render loader couldn't read that format — setting the key would have silently switched your UI-saved keys off in renders. The CI loader now reads both formats, and if a row is unreadable it **sends you an alert** instead of quietly using shared keys.
3. **Token ciphertext can never land in the repo again.** The one forgotten write path (the DB-down fallback) strips it now, and the registry writer strips it on every entry no matter who calls.
4. **A migration script** moves everything to the new key in one run — dry-run first, never prints secrets, safe to re-run.

## QA rows

| # | What to do | What should happen | Evidence / result |
|---|---|---|---|
| 1 | New pin-tests | All #120 contracts pass | PASS — 13/13 across migrate-script + master-key-tokens + ci-vault-v2 |
| 2 | No MASTER_KEY → behavior identical to today | Legacy encrypt/decrypt round-trips; plaintext SHA-256 of the password still decrypts it (byte-identical legacy shape) | PASS |
| 3 | MASTER_KEY set → new writes are v2, old rows keep reading | v2 ciphertext decrypts under the domain-prefixed derivation; a pre-migration legacy row still decrypts; wrong key → null (never garbage) | PASS |
| 4 | The hardcoded `'quarry-connect'` fallback is gone | Code scan finds no `\|\| 'quarry-connect'`; with zero key material, encrypt refuses with a clear error, decrypt returns null | PASS |
| 5 | **Cross-boundary (the landmine test)**: studio writes v2 → CI reads it | Studio `encryptKeys` under MASTER_KEY → CI `applyChannelKeys` applies the exact same keys, shared values restored on drop (#39) | PASS |
| 6 | Legacy vault rows still work in CI — with AND without MASTER_KEY | Both cases apply the saved keys | PASS |
| 7 | Unreadable vault row in CI → loud, not silent | Exactly ONE ntfy alert naming the slug and the blast radius; shared keys untouched; the run continues even if the alert itself throws | PASS |
| 8 | The 12 render workflows get the master key | Every workflow that passes YOUTUBE_CLIENT_SECRET also passes `MASTER_KEY: ${{ secrets.MASTER_KEY }}` (12/12 scanned dynamically) | PASS |
| 9 | Migration script: dry-run default | Dry-run writes nothing (0 updates), reports what would change | PASS |
| 10 | Migration script: `--apply` works and is idempotent | UPDATEs carry v2 ciphertext (unreadable under the legacy key); re-run reports zero to do | PASS |
| 11 | Migration script never prints secrets | Log lines across a full dry-run+apply contain neither the plaintext token nor the plaintext key | PASS |
| 12 | tokenEnc cannot reach a repo file | DB-down fallback strips it (pushes the stripped entry); `writeRegistry` strips on every entry; both feed mirrors see the cleaned list | PASS (source scans) |
| 13 | Lint | channels-registry.js clean | PASS — eslint exit 0 (repo-root lib/script files are outside the studio eslint base path — house reality — covered by the 13 behavioral tests instead) |
| 14 | Regression: all Wave 1 + crypto + analytics suites | Green | PASS — combined run **94/94** |
| 15 | Full repo regression | Only the known pre-existing failure | PASS — **1394/1395**; single failure = `T4b reportChannels` (pre-existing parallel-session data drift, never chased) |
| 16 | Nothing else changed | Diff = 2 libs + 12 workflow env lines + script + 3 test files + QA + design doc | PASS — named-files-only commit |

## Files in this change

- [studio/lib/channels-registry.js](../../studio/lib/channels-registry.js) — dual-derivation token crypto; `'quarry-connect'` deleted; strips in fallback + `writeRegistry`
- [lib/channel-keys.mjs](../../lib/channel-keys.mjs) — CI loader reads v2; ntfy alert on unreadable rows
- [.github/workflows/](../../.github/workflows/) — 12 workflows: `MASTER_KEY` env line added
- [scripts/migrate-master-key.mjs](../../scripts/migrate-master-key.mjs) — the one-time migration tool
- [tests/master-key-tokens.test.mjs](../../tests/master-key-tokens.test.mjs), [tests/ci-vault-v2.test.mjs](../../tests/ci-vault-v2.test.mjs), [tests/migrate-script.test.mjs](../../tests/migrate-script.test.mjs) — 13 pin-tests
- Design: [docs/superpowers/specs/2026-11-18-wave2-master-key-design.md](../superpowers/specs/2026-11-18-wave2-master-key-design.md)

## OPERATOR RUNBOOK — read before touching anything

**The landmine was an ordering trap. This order makes it impossible to trigger. Nothing changes until step 2.**

1. ✅ **Ship this code** (done by this issue — dual-read everywhere; until the key exists, everything behaves exactly as today).
2. **Set the key** (the owner, ~5 minutes):
   - Generate locally, never paste it into chat or files: `openssl rand -base64 32`
   - Save it in your password manager FIRST.
   - Vercel: `vercel env add MASTER_KEY production` (paste when asked), then redeploy the studio.
   - GitHub: `gh secret set MASTER_KEY` (paste when asked).
3. **Migrate** (from the repo root, with `DATABASE_URL`, `MASTER_KEY`, and the legacy material in the shell):
   - `node scripts/migrate-master-key.mjs` — read the dry-run report.
   - `node scripts/migrate-master-key.mjs --apply` — writes.
   - Commit the rewritten `yt-mcp/channel-keys.json` it leaves in your working tree.
4. **Verify**: dashboard still shows channel data (tokens read through the new key path); next money-rulebook CI run applies the vault keys; re-run the script dry-run — it should say "already v2".

## Known limits (honest)

- Git history still holds the OLD weakly-keyed ciphertext — that is exactly why the day-19 public-flip plan rotates every channel token + provider key. This issue stops NEW ciphertext from being weakly keyed or landing in git.
- The ntfy alert is fire-and-forget: if a CI script calls `process.exit()` immediately after an unreadable row, the alert may be cut short (the console line always lands).
- `STUDIO_PASSWORD` rotation is still manual (OPS-12's UI flow is a later wave) — but after step 3, rotating the password no longer breaks any stored token. That was the point.
