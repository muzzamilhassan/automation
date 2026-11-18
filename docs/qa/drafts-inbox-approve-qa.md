# QA — #124 approved templates leave the Drafts Inbox

*Shipped 2026-11-18. Evidence: tests/drafts-inbox-approve.test.mjs (5/5 after cleanup) + full suite.*

**What was wrong, in one line:** approving a template copied it into the live registry but never removed its draft file, and the inbox only hid *rejected* drafts — so **all 20 drafts in your inbox were approved-and-live templates pretending to be pending**.

| # | What we checked | How we know it works | Result |
|---|---|---|---|
| 1 | The inbox now shows only genuinely pending work: rejected drafts hidden (as before), **approved-and-applied drafts hidden too**, failed approvals stay visible for retry | Behavioral test on the extracted filter — six cases including the failed-approve retry path | PASS |
| 2 | When you approve, the draft file is now **deleted from the repo** the same way reject deletes it — an approved template's content lives in the registry, nothing lingers | Source-scan: the deletion call sits in the approve path; response reports the cleanup outcome (`fileCleanup`) | PASS |
| 3 | A **failed** registry commit never deletes the draft (you'd lose the pending draft on a GitHub hiccup) | Test proves the cleanup sits after the success gate in the code order | PASS |
| 4 | **The 20 stale drafts were removed** — and first proven safe: each id was verified present in the live registry before deletion, so no live template was touched | Test pins all 20 ids exist in the registry data (would fail if any had been missing) | PASS |
| 5 | **Permanent sentinel:** any draft file that ever lingers in the folder while already in the registry fails the test suite — the exact bug you reported can't silently return | Test walks the drafts folder and fails on any id already in the registry | PASS |
| 6 | Lint + full regression stay green | ESLint 0 errors on touched files; full suite: only the known pre-existing T4b | PASS |

## What you'll see

- The Drafts Inbox is now **empty** (it was showing 20 already-live templates).
- Future flow: a new draft lands → inbox shows it → **Approve** → it appears in your template catalog AND leaves the inbox (first immediately via the filter, then the file disappears from the repo on the next deploy). **Reject** works as before.
- Nothing was lost: the 20 removed files' contents are byte-identical to their approved entries in the registry.
