# Production audit — 2026-10-23 (clips-lane wave + 3-day cron history)

Scope: full audit after the #95–#100 implementation wave (Oct 20–21) — workflow runs Oct 21–23, channel production reality, issue state, and one P0 regression found + fixed mid-audit.

## Executive summary

**A P0 regression shipped in the Oct-21 wave kept every generated channel dark for 3 days (Oct 21–23).** Found by this audit, root-caused, fixed, and production restored the same morning (commit cd708cc; post-fix dispatch produced real Shorts + the DFD Friday doc with its SRT artifact). The watchdogs worked throughout: CI Doctor flagged staleness daily and the #91/#98 ntfy alerts fired on every dark slot — the phone had the evidence even while workflows showed green.

## F1 — P0, FIXED (cd708cc): yt-daily never ran for generated channels

The #98 restructure of channel-pipeline.mjs Phase 1 left the else-if **success branch holding the skip text** instead of the produce body. Result: every `shortsSource: 'generated'` channel logged "Shorts already produced today — skipping" and produced nothing, while workflows stayed green (pipeline always exits 0). Evidence: QQ Oct 23 (skip + verify 0/1 + ntfy sent), IC Oct 21+23 (same), MR identical by code-path; committed states frozen at Oct 20–21; zero state commits Oct 21–23 (nothing produced → nothing to commit — push machinery verified fine, "Everything up-to-date"). DFD was the only verified upload in the window (Oct 22, from the Oct-22 morning run before the broken code reached its matrix job — dispatch-timing, see restore note).

## F2 — P1, OPEN: sweeper heal path crashes (ENV_PATH)

`yt-daily.mjs:56` references `ENV_PATH` (removed by 7d8fa43's loadEnv refactor — #79). Any context where the `YT_TOKEN_<SLUG>` env is absent (sweeper heals) throws `ReferenceError: ENV_PATH is not defined` → trend research fails fail-closed → **heals produce nothing**. Sweeper runs failing Oct 21+22. Proposed fix: 1 line (derive the token path from a defined constant instead of ENV_PATH).

## F3 — P1, OPEN: dead channel token (invalid_grant)

Sweeper's long-form check: `[long-form] check failed: invalid_grant` — a channel refresh token is revoked/expired; needs browser re-auth (same class as PLAN B5). Also: all 16 per-channel MCP servers return 401 (stale MCP credentials) — separate from the pipeline tokens but same "credentials need rotation" workbox.

## F4 — P2, OPEN: Facebook token invalid (code 190)

FB image posting fails per channel: `Invalid OAuth access token - Cannot parse access token`. FB_PAGE_TOKEN needs regeneration. Cross-posting of the videos themselves schedules fine (outbox path), this breaks FB image posts.

## F5 — P2, OPEN: sweeper crashes at end (`pendingDeleted is not defined`)

Pre-existing dead reference (sweeper.mjs tail, recycle-removal leftover) — now actually throwing after the F2 failures, failing the run before its own state/log commit step.

## F6 — INFO: watchdogs validated in production

CI Doctor's red runs = `process.exitCode 1` on real problems (#69 design) — STALE flags caught this outage daily. verify-run + `lib/ntfy-alert.mjs` delivered phone alerts on every dark slot (Oct 23: `[alert] ntfy push: sent` + `alert delivered via ntfy`).

## Lane status after audit

| Issue | State |
|---|---|
| #96 cadence + SRT | **CLOSED** — `lf-srt-money-rulebook` present on the Oct-22 docDay run; `lf-srt-debt-free-doctrine` again today |
| #97 clipper | **CLOSED** — real-artifact e2e: 69 windows → 2 clips cut from MR's real doc (1080×1920, 23.2s, Release `clips-money-rulebook-39750079904`) |
| #98 publisher + flip | code-complete + fail-closed smoke; live post lands at #101 flip |
| #99 quota ledger | closed |
| #100 Studio panel | deployed (● Ready); owner save round-trip pending |
| #101 rollout | remaining (shorts-lane workflow + flip + 7-day proof) |

## Restoration evidence (post-fix dispatch 39921986638)

- MR / IC / DFD produce jobs **completed success**; QQ long-tailed at audit close
- DFD produced its Friday doc **with SRT** (artifacts above) — production restored
- Restore-run state pushes were still absent at audit close (QQ gating the run) — watch the next cron; if still missing, the #77 state-push step needs its own look

## Recommended order

1. F2 one-liner (sweeper heal) — unblocks self-healing
2. F3/F4 credential re-auths (YouTube token for the invalid_grant channel, FB page token)
3. F5 dead-ref cleanup
4. #101 rollout (flip + 7-day proof) once two clean cron days confirm F1's fix
