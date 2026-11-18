# QA — #125 static-maps sweep (sidebar, thumbs picker, brand marks)

*Shipped 2026-11-18. Evidence: tests/static-maps-sweep.test.mjs (8/8) + full suite.*

**What this feature is, in one line:** every page that used to read a hard-coded list of 16 channel names now asks the server for the **real** list — connect a channel and it appears everywhere; disconnect and it disappears. No more fake channels anywhere, ever.

| # | What we checked | How we know it works | Result |
|---|---|---|---|
| 1 | One live source: a new `/api/brands` endpoint builds the list from your real brand data + the registry (the same dedup rule the Overview page uses) | Behavioral tests on the extracted core: union, dedup by name and slug, dormant brands hidden | PASS |
| 2 | The endpoint never has a channel name written in its code | Test bans all known slugs as literals in the route | PASS |
| 3 | Client accounts see only their own channels; anonymous gets 401; a registry blip shows nothing (never everything) | Source pins on the auth + fail-closed scope | PASS |
| 4 | The 2-letter marks and colors are **derived** from each channel's name — nothing hand-written to maintain | Behavioral test: short codes come from the label; accents from real data | PASS |
| 5 | **Sidebar:** the old 4-brand pinned list is deleted; the sidebar shows your live channels; "all 16 →" became "manage →"; the "· 16 brands" status footer claim is gone | Source-scan tests: symbol extinct, hook wired, literals gone | PASS |
| 6 | **Thumbnails page:** the 16-channel fallback list is deleted (it used to show on load errors too); the invented sample video title is gone; on failure the page shows an honest empty state, never fake channels | Source-scan tests pin the deletion, the empty initial state, and the error path | PASS |
| 7 | **8 pages** (home, analytics, channels, logs, music, social, topics, videos) now get their brand marks live via a shared hook, keeping their existing "•" fallbacks while loading | Test: hook wired in all 8 + fallbacks retained | PASS |
| 8 | **Sentinel:** the old brand-map symbol has **zero references anywhere** in the panel — it cannot quietly come back | Repo-wide walk test fails on any reference | PASS |
| 9 | Site metadata no longer claims "4 channels, 16 brands" | Literal replaced with honest text | PASS |
| 10 | Lint + full regression stay green | ESLint 0 errors on all touched files; full suite: only the known pre-existing T4b | PASS |

## What you'll see

- Sidebar "Channels": exactly your real channels (currently the 4 originals + YT-BOT), from live data.
- Thumbnails picker: same real list; if the data can't load it says so instead of showing 16 fake brands.
- All brand marks/colors across the panel derive from real registry/brand data.
- Future channels: connect through the wizard → they show up in the sidebar, pickers, and marks with **zero code changes** (your no-hardcoding rule).

Related: [rate-limits-qa.md](rate-limits-qa.md) (#121), data cleanup commit `1dc56c8` (the 12 inactive brands removed from the data file — this issue removed their last code footholds).
