# Spec + QA: live fix wave A4, alerts that tell the truth (2026-11-20)

Source: `research/live-e2e-test-2026-11-20.md`, findings T2-01 (failure
part), T2-02, T1-08, T2-03, T2-07, T2-08, T2-09 and P12.

The live test found these problems:
- Alerts stayed open after their script was published, rejected or skipped.
- The "needs you" number was different on every screen (5 / 6 / 6 / 11 / 191).
- A failed run raised no alert.
- One group title stood for five different slots.
- One alert had no link.
- The Review page showed "awaiting_review" for every script.

## Requirements (EARS)

**Stale alerts (T2-03 / P12)**
- A1: WHEN a review alert's script is consumed, rejected or approved, THE
  SYSTEM SHALL resolve the alert with an audit note, e.g. "auto-resolved:
  script consumed (video oXAT8NGLV4Q)".
- A2: WHILE the script still awaits review, or its state cannot be read, THE
  SYSTEM SHALL keep the alert open.
- A3: A "slot held" alert SHALL resolve only WHEN no script for that slot
  still waits. "Approved video never published" SHALL stay open until the
  video exists. "Dispatch failed" SHALL stay open until a dispatch works.
- A4: THE SYSTEM SHALL run this check nightly (`scripts/review-sweep.mjs`),
  WHEN the owner approves, rejects or redispatches (`/api/review`), and WHEN
  an upload consumes a script (`getScriptStore().markConsumed`).

**One number (T2-02 / T1-08)**
- N1: THE "needs you" number SHALL be: real alert groups + scripts awaiting
  approval. A held-slot or approval-window alert and its waiting script count
  once. While scripts wait, the queue stands for those alerts.
- N2: Home, `/tasks` and `/warnings` SHALL show that number from one helper
  (`needsYou` in `studio/lib/notify-policy.mjs`). Channel "didn't run" and
  "paused" states SHALL show in the channel rows and SHALL NOT be counted.

**Failed runs (T2-01)**
- R1: WHEN a produce job fails, THE WORKFLOW SHALL raise one `run_failed`
  alert. It is `action_required`, for that channel, with the run link and the
  failed step when known. The dedupe key is per run.
- R2: The alert step SHALL never fail the job further: `if: failure()`,
  `continue-on-error`, a 2-minute timeout.
- R3: WHEN a later pipeline run for that channel finishes, THE SYSTEM SHALL
  resolve its open `run_failed` alerts.

**Honest titles and links (T2-07 / T2-09 / T2-08)**
- G1: WHEN one group holds different things, THE TITLE SHALL be neutral,
  e.g. "5 slots held for review (Nov 16–20)" or "2 scripts past the approval
  window". Exact repeats keep "N× title".
- L1: Every review alert whose evidence names a script SHALL link to
  `/review?id=<id>`.
- V1: THE Review page SHALL show the script's real status and its slot day
  and time. It SHALL offer only the valid actions: awaiting review → Approve
  and Reject; approved → Redispatch; published or rejected → none.

## QA rows

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | A1–A3 | consumed / rejected / approved / waiting / unknown / slot rules | automated | `node --test tests/stale-alerts.test.mjs` |
| 2 | A1 | the live examples (5115ad32, 9d62f68f, slot 11-16, skipped 11-17) resolve; the waiting and approved-not-published ones stay | automated | same (S9) |
| 3 | A4 | sweep wired; approve, reject and redispatch hooks; consume wrapper | automated | same (S11–S14) |
| 4 | N1–N2 | one number; verdict, /tasks and /warnings use `needsYou` | automated | `node --test tests/needs-you-count.test.mjs` |
| 5 | G1, L1, V1 | neutral titles, review links, real status and actions | automated | same |
| 6 | R1–R3 | alert shape, failed-step lookup, YAML step, pipeline resolve | automated | `node --test tests/run-failed.test.mjs` |
| 7 | A1 | after the lead runs the sweep live, the stale MR alerts move to "Resolved history" with the "auto-resolved: …" note | manual | `/warnings` |
| 8 | N2 | Home, the `/tasks` header and the `/warnings` "Need you" tile show the same number | manual | open all three |
| 9 | R1 | the next failed autopilot run shows "today's run failed — <step>" with a run link on `/warnings` | manual | `/warnings` |
| 10 | V1 | open an approved script from an alert: chip says "approved", only Redispatch is offered, and the slot shows | manual | `/review?id=…` |

## Plain-English QA

1. **Old alerts close on their own.** Open `/warnings` after the nightly
   sweep. Alerts for scripts that were published, rejected or skipped should
   be gone from the list. Each one should appear under "Resolved history"
   with a note like "auto-resolved: script consumed (video …)". Alerts for
   scripts that still wait for you must still be in the list.
2. **Approving clears the "waiting" alert.** Approve a held script on
   `/review`, then reload `/warnings`. That script's "waiting for your
   approval" and "approval window passed" alerts should be resolved.
3. **One number.** Compare Home ("N things need you"), the `/tasks` header
   and the `/warnings` "Need you" tile. All three should show the same
   number. Paused channels and channels that didn't run show in the channel
   rows, not in the number.
4. **Failed runs speak up.** When an autopilot run fails, `/warnings` shows
   "today's run failed — <step>" for that channel, with the run link. When
   the next run for that channel finishes, the alert resolves.
5. **Group titles don't lie.** Five held slots read "5 slots held for review
   (Nov 16–20)", not one slot's title.
6. **Every review alert has a button.** Any alert about a script shows "Open
   in Review".
7. **The Review page shows the truth.** An approved script shows "approved"
   and offers only Redispatch. A published or rejected script offers
   nothing. The slot day and time show under the title.

## Not in this wave

- The bell badge (`studio/components/shell/AppShell.js`, owned by another
  team) still shows the number of alert groups. Making it show the same
  number needs a one-line change: `needsYou({ rows: openWarningRows,
  awaiting: <review count> }).count`.
