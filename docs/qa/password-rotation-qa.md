# QA — #123 OPS-12 change-panel-password flow

*Shipped 2026-11-18. Design: docs/superpowers/specs/2026-11-18-ops12-password-rotation-design.md. Evidence: tests/password-rotation.test.mjs (10/10) + full suite.*

**What this feature is, in one line:** Settings → Security now has a **"Change panel password"** card. You type the current + new password, the server verifies and prepares everything (including making sure no old-style token row can break), then shows you the one manual step left: paste the new password into Vercel and redeploy. Changing the password is now **safe** — nothing else depends on it since the master-key work (#120).

| # | What we checked | How we know it works | Result |
|---|---|---|---|
| 1 | Only the owner can use the endpoint, and it's rate-limited (5 tries/hour) so it can never be hammered | Source-scan pins: owner check → 401; `pw-rotate` 5/hour limit via the #121 limiter | PASS |
| 2 | The current password must be correct before anything happens — wrong → "nothing was changed" | Test proves the verification happens first in the code order | PASS |
| 3 | The new password must be 12–128 characters, different from the current one, and the repeat field must match | Test pins all three checks after the verify gate, each with its plain-English message | PASS |
| 4 | If MASTER_KEY isn't set on the server, rotation is refused with an explanation (that's the safety precondition) | Test pins the 503 refusal | PASS |
| 5 | Any old-style (password-keyed) token row is re-encrypted under the master key BEFORE the password changes — so rotation can't orphan it | Behavioral round-trip test with real encryption: old-style row → detected as "legacy" → decrypted → re-encrypted → verified as "v2" and readable | PASS |
| 6 | The response honestly reports the numbers: rows scanned / re-protected / already-unreadable (pre-existing breakage warns but doesn't block) | Test pins the counter declaration + the warning text | PASS |
| 7 | **No password ever reaches a log, audit row, or response** — the audit entry carries counts only | Test walks every log/audit/response line in the route and rejects any that touch a password variable | PASS |
| 8 | **The server never sets the password itself** — it only verifies and prepares. The value changes on Vercel, by you | Test: the env variable appears exactly once in the route (the compare); no assignment anywhere; steps + deep link returned instead | PASS |
| 9 | The card renders in the Security tab: three password fields (all masked, with proper autocomplete hints), a button, and a result panel with the numbered steps + "Open Vercel environment variables" link | Source-scan pins on all fields, the fetch endpoint, the result panel, the deep link | PASS |
| 10 | When the new value deploys, every signed-in device is signed out automatically — this is physics, not code: session cookies are sealed with the password, so old cookies stop verifying | Documented in the route header (session.js `KEY = STUDIO_PASSWORD`); Google-members just re-click Google, you type the new password | PASS (by design) |
| 11 | Lint + full regression stay green | ESLint exit 0 on touched files; full suite: only the known pre-existing T4b | PASS |

## How to use it (when you want to change the password)

1. Settings → Security & Sessions → **Change panel password** → fill the three fields → **Verify & prepare rotation**.
2. Click the **Vercel link** the card shows → update `STUDIO_PASSWORD` to the new value → Save.
3. Redeploy (dashboard button, or ask me to run `cd studio && vercel --prod`).
4. Sign in with the new password. Done — everyone else signs in as normal (Google members re-click Google).
- Changed your mind mid-way? Do nothing on Vercel and the old password simply keeps working.

Related: [master-key-hardening-qa.md](master-key-hardening-qa.md) (#120 — the work that made rotation safe), [rate-limits-qa.md](rate-limits-qa.md) (#121 limiter).
