# Spec + QA — Warnings NOT NULL drift + one alert digest per run (2026-11-15)

Source: research/deep-audit-2026-11-13.md, improvement #4 (ops-cost-01,
ops-cost-05, ci-cd-06). Verified read-only on live Neon (PG 18.7) before
coding: `warnings.quote_fetched_at` is `is_nullable = NO`
(`warnings_quote_fetched_at_not_null`), the table held 1 row. Only
blocking rows cite a policy, so every other insert (null) failed → no row
→ dedupe never matched → every re-fire paged again. The 2026-11-15
nightly reconcile (run 43712132963) attempted ~180 pushes for 137
"upload_orphan" advisories: 99 sent, the rest lost to HTTP 429 / fetch
failures, ~8 of its 9 minutes spent in retries.

## Requirements (EARS)

- R1: THE WARNINGS SCHEMA MIGRATION SHALL drop NOT NULL on
  `quote_fetched_at` idempotently, so rows without a policy quote insert.
- R2: WHILE a batch job opens several warnings in one run, THE SYSTEM SHALL
  send ONE summary push for the run (titles, `+N more`, a pointer to
  Studio /warnings) instead of one push per warning.
- R3: Deduped re-fires SHALL add nothing to the digest; an empty digest
  SHALL send nothing.
- R4: WHEN the store is unavailable, THE DIGEST SHALL say so (ntfy stays
  the fallback record).
- R5: WHEN ntfy answers 429 with `Retry-After`, sendAlert SHALL wait that
  long (capped at 30s) before retrying.

## QA rows

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | R1 | migration DO block contains `ALTER COLUMN quote_fetched_at DROP NOT NULL` | automated | `node --test tests/warnings-store.test.mjs` |
| 2 | R2/R3 | 5 warnings → 0 pushes until flush → 1 push, `+2 more`, `/warnings`; dedupe re-fire → empty flush, no push | automated | same |
| 3 | R4 | store down → digest text says "warnings store unavailable" | automated | same |
| 4 | R2 | reconcile script wraps emitWarning with the digest and flushes once after the channel loop | automated | same (source pin) |
| 5 | R5 | 429 + Retry-After 7 / 999 → sleeps 7000 / 30000 | automated | `node --test tests/ntfy-alert.test.mjs` |
| 6 | R1 | live: after a reconcile run, `quote_fetched_at` is_nullable = YES and orphan rows exist | manual | dispatch upload-reconcile.yml, then read-only information_schema + count query |
| 7 | R2 | live: that run logs `alert digest: N new warning(s)` and ≤ 1 `ntfy push: sent`; the next run pushes nothing (all deduped) | manual | run log |

## Regression

- Full root suite green; existing emitWarning semantics (write-and-alert,
  dedupe once per episode, rejected writes never page) unchanged for every
  caller that does not pass a digest.
