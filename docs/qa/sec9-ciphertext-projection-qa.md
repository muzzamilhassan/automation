# QA — #122 SEC-9 ciphertext projection (+ client slug check)

*Shipped 2026-11-18. Design: docs/superpowers/specs/2026-11-18-sec9-ciphertext-projection-design.md. Evidence: tests/sec9-ciphertext-projection.test.mjs (8/8) + full suite.*

**What this feature is, in one line:** the panel's registry and profile screens stop receiving the encrypted YouTube login tokens with their data — the browser gets only what it actually displays, and one small hole is closed where a client account could read another channel's profile by editing the web address. Nothing on screen changes.

| # | What we checked | How we know it works | Result |
|---|---|---|---|
| 1 | The strip helper removes exactly the two token fields (`tokenEnc` ciphertext + its internal error note) and changes nothing else | Behavioral test: output equals input minus those two fields, field by field | PASS |
| 2 | The helper never alters the original data it was given | Test: input stringified before and after — identical | PASS |
| 3 | The wizard's two needed signals survive: the GitHub secret **name** (shown in repair instructions) and the **"key saved / secret missing"** flag | Test: both fields present after projection | PASS |
| 4 | Registry screen: every channel row is projected — ciphertext can no longer reach the browser there | Source-scan pin on the `.map(stripTokenMaterial)` response; the old verbatim shape asserted gone | PASS |
| 5 | Profile screen: GET returns the projected channel; POST echoes the saved entry **without** token material | Source-scan pins on both response shapes; old verbatim shapes asserted gone | PASS |
| 6 | A client account asking for a channel that isn't theirs now gets **403** (was: readable by anyone with any slug) | Source-scan pin on the ownership check mirroring the thumbs/videos pattern; owner/staff untouched; profile saving stays owner-only | PASS |
| 7 | No route anywhere in the panel puts `tokenEnc` in a response body — checked across **all** API routes, not just the two named by the audit | Automated walk of every route file: no line pairs `tokenEnc` with a response body | PASS |
| 8 | The OAuth connect flow is unaffected (it *writes* the token server-side and only ever redirects the browser — verified, it never returns the entry) | Code check: callback has no JSON responses, redirects only | PASS |
| 9 | Lint + full regression stay green | ESLint clean on the 3 touched files; full suite: only the known pre-existing T4b | PASS |

## Notes

- **Why remove-only, not a whitelist:** these screens use many fields; removing exactly the dangerous two fixes the finding with zero chance of breaking the wizard by forgetting a field. (The providers screen's stricter style stays as it is.)
- **The secret NAME that stays on screen is not a secret** — it's a label like `YT_TOKEN_MONEY_RULEBOOK` that tells GitHub where the real secret lives; the value itself never leaves GitHub/the server.
- Related: [master-key-hardening-qa.md](master-key-hardening-qa.md) (#120 removed the repo-write path for these tokens), [rate-limits-qa.md](rate-limits-qa.md) (#121).
