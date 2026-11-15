# Design — Neon as the single source of truth (step C) — 2026-11-16

Status: **DRAFT for owner approval.** Nothing is built until approved
(planning-first). Owner approved the direction ("C: yes", 2026-11-16).
Sources: research/scaling-admin-panel-python-plan-2026-11-16.md, the
admin-panel review (bug #1, lost updates #5 in §1a), audit #8 / data-12
(registry split-brain).

## 1. The problem, in plain words

Today the same channel information lives in several places, written by
different things:

| Information | Lives in | Written by | Read by |
|---|---|---|---|
| Channel list + settings (registry) | `yt-mcp/studio-channels.json` **and** Neon `channels` table | Studio (both), CI | 24 scripts/workflows read the JSON file |
| Posting days, shorts source (cadence) | `yt-mcp/cadence.json` | Studio (GitHub commit) | 6 files |
| Per-channel run state (last run, clip queue, titles, pause) | `yt-mcp/state/<slug>.json` | **every CI run commits it** (37 bot commits / 15 days) + Studio pause & clip-queue | 11 files, all through `lib/state.mjs` |
| Brand kits (voice, colours, wording…) | `yt-brands/brands.mjs`, `lib/brands.json`, `studio/lib/brands.json` (3 copies, drifting) | hand edits | resolveBrand, sweeper, the panel overview |
| YouTube tokens | 16 GitHub secrets `YT_TOKEN_<SLUG>` + `tokenEnc` in Neon | Studio connect | autopilot (dynamic) + 7 workflows with hard-coded lists |
| Provider keys (BYOK) | `yt-mcp/channel-keys.json` (encrypted) | Studio | 7 files |
| Thumbnail branding / A-B tests, topic queues | `yt-mcp/thumb-*.json`, `topics-<slug>.json` | Studio | 3 files each |

Consequences we already hit: the panel shows a build-time copy of brands
(profile edits never appear — panel bug #1); a panel save can silently
overwrite what a CI run just committed (lost updates); two CI runs finishing
together can drop one channel's state (single-shot push `|| true`); a
DB→repo sync almost switched all 4 live channels off (audit #8, guarded);
every new channel needs edits in several files and workflows.

## 2. The goal

**One place holds the truth: the Neon database.** The Studio writes only
there. Scripts read from there. JSON files in the repo stop being "the data"
— where scripts still need a file, it is **generated from Neon at the start
of each run** (a read-only copy, never committed).

What the owner sees afterwards:
- a panel change is saved instantly and shows up immediately — no GitHub
  commit in between, nothing overwritten;
- the channel list always matches reality (bug #1 fixed for good);
- adding channel #31 = connect it in the panel; no file or workflow edits;
- no more "autopilot … daily state [skip ci]" commits flooding git history.

## 3. Principles

1. **Small steps, each reversible.** Every step sits behind a switch
   (env flag) and keeps the old file path as a fallback for a while.
2. **Prove before switching.** Before a step goes live, the new path runs
   alongside the old one and the outputs are compared (byte-for-byte for
   generated files).
3. **Money-rulebook first** wherever a step can be per channel.
4. **Backup first.** Once Neon is the truth, losing it means losing
   everything — a nightly encrypted backup (audit #15) is step C0.
5. **Deterministic only.** No AI involved in any of this.
6. **Neon Free budget.** Reads are tiny; the design avoids keeping the DB
   awake longer than runs already do (watch the CU-hours meter, plan §2).

## 4. The steps

### C0 — Nightly encrypted backup (prerequisite) · effort S
- A nightly workflow runs `pg_dump`, encrypts it (age), keeps 14–30 days as a
  workflow artifact (small — the DB is MBs, not GBs) and **tests one restore
  into a temporary Neon branch** monthly.
- EARS: WHEN the nightly backup runs, THE SYSTEM SHALL produce an encrypted
  dump and alert on failure; a restore drill SHALL be documented and run once
  before C2 goes live.

### C1 — Registry, kit and cadence: Neon is the only writer · effort M
- Studio routes (profile, schedule, flow, keys, wizard) write **only Neon**
  (`channels` row: columns + `kit` JSONB; cadence moves into `kit.cadence`).
  The GitHub Contents-API commits of `studio-channels.json` / `cadence.json`
  stop.
- New script `scripts/export-registry.mjs`: reads Neon and writes
  `yt-mcp/studio-channels.json` + `yt-mcp/cadence.json` into the **runner's
  checkout** (not committed). Every workflow that reads those files runs it
  first (discover, produce, sweeper, nightlies). If Neon is unreachable it
  keeps the committed files (fallback) and warns.
- One-time **seed**: today's repo files + the 3 brand-kit copies are merged
  into Neon (repo file wins where they differ — it is what production uses
  today), reviewed by the owner before switching.
- The panel overview builds the channel list from the registry (fixes
  **panel bug #1**); `brands.json` stays only as a seed source.
- **Proof before switching:** the export must reproduce today's committed
  files exactly (diff = empty) for a week of runs.
- EARS: WHEN the owner saves a channel setting, THE STUDIO SHALL write Neon
  only and show it on the next page load; WHEN a workflow starts, THE
  EXPORT SHALL generate the registry/cadence files from Neon, or fall back to
  the committed files with a warning; THE ENGINE SHALL see the same values
  it saw before the switch (proved by the empty diff).

### C2 — Per-channel run state in Neon · effort M · money-rulebook first
- New table `channel_state (slug PK, data JSONB, version INT, updated_at)`.
- `lib/state.mjs` (the single gateway — 3 functions) reads/writes Neon when
  the channel is switched over (`STATE_SOURCE=neon` for listed slugs), and
  still writes the local file during the run so in-run readers are
  unchanged.
- Writes are **per-key merges** (`data = data || patch`) with a version
  check → the panel's pause / clip-queue edits and a CI run can never
  overwrite each other; two channels never touch the same row.
- The "💾 Commit publishing state" step stops committing for switched
  channels (git keeps only code).
- Order: money-rulebook for ~1 week (compare Neon vs the file each run) →
  the other 3 → remove the commit step.
- EARS: WHILE a channel is on Neon state, THE PIPELINE SHALL read and write
  its state through Neon and SHALL NOT commit its state file; WHEN two
  writers update the same channel, BOTH changes SHALL survive.

### C3 — YouTube tokens and provider keys from Neon · effort M
- Runners decrypt `tokenEnc` from Neon with **one** master-key secret
  instead of 16 `YT_TOKEN_*` secrets; the 7 workflows with hard-coded token
  lists switch to the registry-driven pattern (copy channel-autopilot's).
- BYOK keys move from `yt-mcp/channel-keys.json` into a Neon table (also
  removes that ciphertext from the repo before it ever goes public).
- Removes the 100-secret wall (~64 channels) and makes "connect in the
  panel" the whole onboarding for tokens.
- Prerequisite check: the encryption-key mismatch the audit found (Studio
  uses MASTER_KEY v2, CI only v1 — sec-07) is fixed first.
- EARS: WHEN a run needs a channel's token, THE RUNNER SHALL decrypt it from
  Neon; IF Neon or decryption fails, THE RUN SHALL fall back to the GitHub
  secret (during transition) and raise one warning.

### C4 — Remaining panel files · effort S–M
- `thumb-branding.json`, `thumb-tests.json`, `topics-<slug>.json`,
  `access.json` → Neon tables; their Studio routes stop committing to git.

### C5 — Clean-up · effort S
- Remove fallbacks once each step has run clean for 2+ weeks; delete the
  duplicated brand-kit files; repo JSON stays only as documented seed/export.

## 5. What does NOT change
- Rendering, uploads, quota and upload-intent logic (already in Neon).
- The cron-job.org heartbeat and slot gating (they read the exported file).
- The Python/LangGraph plan — this step is its foundation (the agent graph
  will read/write the same tables).

## 6. Risks and how they are handled

| Risk | Handling |
|---|---|
| Neon down → nothing runs | Export keeps committed files as fallback during C1–C3; uploads already degrade gracefully; nightly backup (C0) |
| Neon Free compute limit (100 CU-h/month) | Reads are short and happen inside runs that already wake the DB; watch the usage meter; Launch plan ~$19/mo is the escape hatch |
| Seed merges wrong values | Owner reviews the seeded table before C1 switches; export diff must be empty |
| A script reads a file the export doesn't produce | The export covers every file the 24 readers use; the empty-diff week catches anything missed |
| Concurrency bugs in state merges | Per-key merge + version check, tested; money-rulebook-only for a week |

## 7. Order and size

C0 (S) → C1 (M) → C2 (M, MR first) → C3 (M) → C4 (S–M) → C5 (S).
Each step: spec rows above → QA file → tests first → shadow/compare →
switch → evidence → owner sign-off before the next.

## 8. Decisions for the owner
1. Approve the approach (Neon writes, files generated at run start, not committed).
2. Backup retention: 14 or 30 days (both fit free artifact storage — the dump is small).
3. Seed rule when the 3 brand-kit copies disagree: the file production uses today wins (recommended), or review each difference manually.
4. Shadow period lengths: 1 week for C1's diff and C2's money-rulebook pilot (recommended).
