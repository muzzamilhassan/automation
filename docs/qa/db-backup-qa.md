# Spec + QA — C0 nightly encrypted Neon backup (2026-11-16)

Design: docs/superpowers/specs/2026-11-16-neon-single-source-of-truth-design.md §C0.
Owner decisions: 30-day retention; approach approved.

Facts (2026-11-16, read-only): Neon PG 18.7, 21 MB, extensions plpgsql +
vector; the DATABASE_URL secret uses the pooler host (pg_dump needs the direct
host — derived by dropping `-pooler`).

## Requirements (EARS)

- R1: WHEN the nightly backup runs, THE WORKFLOW SHALL pg_dump Neon over the direct host.
- R2: THE WORKFLOW SHALL restore the dump into a throwaway Postgres 18 + pgvector and SHALL fail unless every live table exists with its row count within tolerance (≤ max(10 rows, 5%) drop; a non-empty table never restores empty).
- R3: THE DUMP SHALL be encrypted to the owner's age PUBLIC key; the plaintext SHALL be deleted; the private key SHALL never be in CI or the repo.
- R4: Encrypted dumps SHALL be kept as `db-backups` release assets for exactly 30 days.
- R5: WHEN any step fails, THE OWNER SHALL get one ntfy alert with the run link.
- R6: A restore runbook SHALL exist, and a manual decrypt + `pg_restore --list` drill SHALL succeed once before C2.

## QA rows

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | R2 | compareCounts: identical / missing table / big drop / empty restore / small drift / empty source | automated | `node --test tests/db-backup.test.mjs` |
| 2 | R4 | assetsToPrune keeps 30 dumps, ignores non-backup files; dated asset name | automated | same |
| 3 | R1–R5 | workflow shape: schedule + dispatch, pgvector pg18 service, pg_dump, pg_restore, verify CLI, `age -r` to the pinned public key, `--keep-days 30`, no secret key, alert on failure | automated | same |
| 4 | R1–R4 | live dispatch: dump, restore check OK, encrypted asset uploaded | automated | `gh workflow run db-backup.yml` + run log + release assets |
| 5 | R6 | local drill: download asset, `age -d` with the private key, `pg_restore --list` lists the tables | manual | runbook steps 1 |
| 6 | R3 | key pair: private key only at `%USERPROFILE%\.quarry-backup\age-identity.txt` (owner-only ACL); owner keeps an offline copy | manual | owner |

Cost: ~2 min/night on ubuntu-latest ≈ $0.36/month. Storage: release assets (no artifact quota).
