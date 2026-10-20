# Agent OS Runbook — where to start (2026-10-20)

> The FullStack Agent OS is installed (74 skills). This file is the execution order. Give your agent ONE block at a time.

## 🔥 START HERE — production fire (issue #91)

Investor's Compass is dark 5+ days. The dup-gate rejects near-identical template titles daily, and the verify ALERT never reached the phone. Two bugs, one incident.

Paste to your agent:

```
Work issue #91 from this repo using the systematic-debugging skill.
Phase 1 (find truth): reproduce the dup-gate rejection with the real Oct-10..15
titles, and trace why the verify ALERT never reached ntfy (the phone evidence).
Phase 2 (fix both): (a) dup-gate must not reject template siblings — same
template + different hook word is ALLOWED to upload (keep blocking true
re-uploads of the same video file); (b) verify ALERT must be re-sent through a
second channel (ntfy retry + a row in the daily report) so a silent skip can
never stay silent again.
Prove both fixes with running evidence, then close #91 quoting it.
Commit small, reference #91. One issue at a time — stop after this one.
```

## THEN — the ready-for-agent queue (one issue at a time, in this order)

Paste this after #91 closes:

```
Work the ready-for-agent queue per docs/agents/agent-os-runbook.md (issue #93
adoption map). Order: #79, #77, #76, #80, #58, #57, #56, #55, #53, #65, #61,
#51, #50, #49, #45, #44, #43, #42, #41, #39, #37. One issue at a time: read the
issue, plan, implement, verify with running evidence, close with the evidence
quoted. Commit small with the issue number. Stop after every 3 issues and show
me the summary.
```

(PLAN.md T1 is now issue-tracked — add its ID to the queue after #45/#64.)

## THEN — enhancements (after the bug backlog drains)

#83 contracts + #76 ONE registry + #78 monorepo (use `refactor-slice`) · #82 TypeScript adoption · #81 repo-visibility decision (needs YOUR call, not the agent's).

## Rules that apply here (short version)

- PLAN.md rules win on conflict (add-only sheet).
- CI workflows are PRODUCTION — never experiment on the master workflows.
- An issue closes only with quoted running evidence (`verification-before-completion`).
- OS updates: `git pull` in `personal/fullstack-agent-os`, re-run its `install/install.sh` here.
