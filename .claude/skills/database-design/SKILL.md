---
name: database-design
description: Design the data layer properly — schema from the domain glossary, constraints as enforced business rules, indexing for known queries, N+1 prevention, safe expand/contract migrations, correct data types (no float money, UTC timestamps), and multi-tenant isolation at the schema level. Use when designing a new schema, adding tables/migrations, fixing slow queries, or reviewing any data-model change.
license: MIT
metadata:
  source: fullstack-agent-os (authored; expand/contract migrations, vendor-neutral Postgres-grade practice)
  category: backend
---

# Database Design — the data outlives the framework

Get the data model right and every framework decision becomes reversible. Get it wrong and nothing else matters. Start from the domain (`docs/GLOSSARY.md`, features' user journeys), never from the UI's needs this week.

## Schema rules

- **Normalize by default.** Denormalize only with a stated reason, a measured read problem, and a written update path.
- Every table: primary key, `created_at`/`updated_at` (UTC, timestamptz-grade). Soft-delete only with a stated query story (which queries exclude deleted rows — ALL of them?).
- **Constraints ARE the business rules:** foreign keys enforced (or the exception documented at the table), unique constraints for real-world uniqueness (email per tenant, one active subscription per user), CHECK constraints for invariants (quantity > 0, dates ordered). The DB is the last line of defense against bugs — let it defend.
- **Data types:** money = exact decimal (never float); timestamps UTC; enums when the set is stable + code-adjacent, lookup tables when users will edit it; text with length/shape constraints where the domain has them.

## Indexing — for KNOWN queries only

- Index the queries the features actually run (`api-and-interface-design` contracts + user journeys list them). Composite index column order: equality columns first, range/sort last.
- Cover the FKs you filter/join on (the N+1 and slow-join killers).
- No speculative indexes on write-heavy tables — every index taxes every write.
- **N+1 prevention:** list endpoints declare their eager-loading story; one query per row shown is a bug, not a style choice.

## Migrations — expand/contract, never destructive

1. ADD the new column/table (nullable/defaulted) — old code unaffected.
2. Backfill in batches (online, not one giant UPDATE).
3. Switch reads/writes to the new shape (code deploy).
4. DROP the old shape in a LATER release, after the new shape is proven in production.
- Destructive change without this dance = data loss waiting for a bad day. Migrations are tested against prod-like volume, and every migration has a documented rollback (or a stated reason it must be forward-fixed).

## Multi-tenancy & access

- Tenant scoping lives at the DATA layer when the platform is multi-tenant (row-level security or one enforced scoped-query layer) — per-endpoint WHERE clauses are how cross-tenant leaks happen. Cross-tenant access tests are blocker-severity (`auth-product`).
- For every feature: a short "access patterns" note (its queries + their indexes) — the map that keeps indexing honest as the app grows.

## Review triggers

Schema change requested? Walk this file. Slow query reported? Measure (`EXPLAIN`/query logs), fix the specific plan, re-measure — and check whether the fix belongs in `scale-playbook` (cache/replica) or here (index/query shape).
