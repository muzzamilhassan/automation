# youtube-automation: Lead Audit Report (2026-11-13)

## 1. Executive verdict

**Overall health: 4.5 / 10.** This is the mean of the 12 dimension scores, which is 4.6. Two corrections to the audits: after the skeptic pass, none of the "critical" findings stayed critical, and none were fully refuted. Several were downgraded to high or medium.

**Top takeaways**
1. **Today's commit e9ef6d2 reopened an auth hole.** `studio/app/api/thumbs/preview/route.js:12` lost its getUser and owner/staff check, which was the #60 fix. `studio/proxy.js:27-31` then made 5 `/api/thumbs/*` routes public. The result is an unauthenticated server-side fetch of any https URL, followed by a sharp/librsvg render. sharp is 0.33.5, which is affected by GHSA-wq5f-xc86-pv6w. `/api/thumbs/videos` also returns private pipeline titles for any slug. This is the cheapest high-value fix in the repo. Nobody has checked whether it is live on Vercel yet.
2. **None of the health signals can be trusted.**
   - `tests.yml` has been red for 6 pushes because `opentype.js` is missing from the root `package.json`.
   - CI Doctor has failed 33 of 33 runs, and issue #90 has 66 comments.
   - `channel-pipeline.mjs` always exits 0. As a result, 40 of 40 autopilot runs are green while investors-compass has posted nothing for 372 hours.
   - The live `warnings.quote_fetched_at` column is NOT NULL, so most warning inserts fail. The /warnings page stays empty, dedupe never matches, and the nightly reconcile sends about 190 ntfy pushes, half of which come back as 429s.
3. **GitHub cron is not a usable production clock.** The 30-minute heartbeat fires 3–5 times out of 48 per day, and daily crons start 3.4–8.7 hours late. The sweeper's late start pushes it past UTC midnight, where it heals the wrong day. Output today depends on accidental heals and manual dispatches.
4. **Inauthentic-content risk is live on the pilot channel.** `lib/brand-resolve.mjs:72-84` overwrites each kit's voice, slots and script. All 4 live channels now publish with voice `am_michael` at 22:35 UTC. Shorts use the same kickers and comments on every channel. Money-rulebook docs and clips carry unsourced dollar figures, while their disclaimers say the content comes "from cited sources".
5. **The money-rulebook doc/clip lane has correctness bugs.**
   - yt-deepdive hangs about 20 minutes after a successful upload and is then reported as "Episode failed".
   - The clip self-feed can re-clip docs it has already clipped.
   - The `has_chapters` toggle does nothing.
   - Chapter timestamps are invalid.
   - Nothing checks rendered media, and black videos have already reached YouTube once (commit 5fae2bf).

## 2. Scorecard

| Dimension | Score | Verdict |
|---|---|---|
| Security & secrets | 5 | Session and role design is solid, but today's thumbs regression, an unrevoked PAT in history, and one password keying three secrets drag it down |
| Core video pipeline | 5 | Good gates and tested helpers; the doc lane has an exit hang, re-clip risk, and no chapters, loudness, or media QC |
| YouTube API / quota / uploads | 5.5 | The intent mutex is well designed; it has a network-error double-upload path, no invalid_grant preflight, and the ledger ignores quota buckets |
| GitHub Actions CI/CD & cost | 4 | The schedule delivers about 8% of ticks, CI is red, alert noise is constant, and spend is about $8–17.5/mo against the $12 allowance |
| Studio architecture | 4 | Auth regression, no lint/type/build gate, dead poller, broken analytics URL, and 89% of untitledui is dead code |
| Studio UX & a11y | 4.5 | Polished look, but toggles that don't save, a schedule-wipe path, unconfirmed destructive actions, and contrast as low as 1.18:1 |
| Data layer, state & RAG | 5.5 | Stores are careful; no migrations, no backup, git used as the state database, and two RAG dedupe bugs |
| Tests & QA traceability | 5.5 | 1113 tests, but they gate nothing, CI is red, render output is untested, and 35 of 79 acceptance criteria are untraced |
| Content quality & policy | 5 | Fail-closed basics are in place; templated sameness, unsourced YMYL figures, and the AI-disclosure answer is dropped |
| Multi-channel scale (no-static-maps) | 4 | The autopilot lane is data-driven; 8 workflows, Studio and brand stores are still hardcoded, and the registry has a split-brain |
| Cross-platform & repo hygiene | 4 | PAT written into a Colab cell, Graph API v20 retired, 2.01 GiB pack, script sprawl |
| Observability & cost | 3.5 | No trustworthy fleet-health signal, an alert storm, no Blob retention, and free tiers that block when exceeded rather than bill |

## 3. Top 15 improvements (ranked by impact divided by effort)

Under CLAUDE.md and AGENTS.md, each item needs an EARS spec and a QA file before code, and needs owner approval first (planning-first). Where a change touches the channel lane, pilot it on money-rulebook first.

| # | Title | Why (evidence) | Impact | Effort | First step |
|---|---|---|---|---|---|
| 1 | **Revert the e9ef6d2 thumbs auth removal and add route-auth tests** | `thumbs/preview/route.js:12`: auth was removed and `fetch(photoUrl)` runs on any `^https://` URL (line 24) with redirects allowed. `proxy.js:27-31` adds 5 public paths. `thumbs/videos/route.js:89` serves `fallbackVideos(slug)` to anonymous callers. No test covers this (security-01, studio-arch-01, security-10). | High | S | Restore the getUser and owner/staff checks in preview, videos and templates. Remove the 5 `isPublic` lines. Add `tests/thumbs-auth.test.mjs` asserting 401 with no cookie. Then run `cd studio && vercel --prod` and curl the live route to confirm. |
| 2 | **Close the SVG injection and upgrade sharp/next** | `thumbs/demo/route.js:39-40` passes `accent`/`shade` unescaped into `fill="${o.accent}"` (`lib/thumb-templates.js:113,210,244`). preview accepts any `data:image/` URI, including SVG (line 21/119). Installed versions: sharp 0.33.5 / rsvg 2.58.93, next 16.3.4 (security-02, security-03). | High | S | Add a `/^#[0-9a-fA-F]{6}$/` check in demo, restrict photoDataUrl to `^data:image/(jpeg\|png\|webp);base64,`, and escape every attribute in thumb-templates. Install `sharp@^0.35.5` in root and studio and `next@16.4.6` in studio. |
| 3 | **Get main green again** | `studio/lib/thumb-templates.js:12` imports `opentype.js`, which only `studio/package.json:21` declares. `tests.yml:30` installs root dependencies only. 6 red pushes in a row (ci-cd-03 = tests-qa-01 = studio-arch-03 = crossplatform-debt-01). | High | S | Add `"opentype.js": "^1.3.4"` to the root manifest, switch to `npm ci` with `cache: npm`, add an `if: failure()` ntfy step, and add a guard test that every root import resolves from the root manifest. |
| 4 | **Fix the warnings-table NOT NULL drift and send one alert digest per run** | Live Neon has `warnings_quote_fetched_at_not_null`. The D9 block at `warnings-store.mjs:202` only drops the DEFAULT. Insert failures always page (`:441`). 1 row in the table, roughly 190 pushes a night, 99 alerts dropped (ops-cost-01/05, ci-cd-06). | High | S | Add `ALTER TABLE warnings ALTER COLUMN quote_fetched_at DROP NOT NULL;` to the idempotent DO block. Make reconcile send one summary push. Make `sendAlert` honour Retry-After. |
| 5 | **Stop brand-resolve overwriting kits with invented defaults** | `lib/brand-resolve.mjs:72` sets `voice … \|\| 'am_michael'`. `:73` sets slots to `['22:35']` and ignores `kit.slots`. `:84` uses generic `script`. The merge at `:116` always lets these defaults win. Live titleHistory shows all 4 channels at T22:35 (content-growth-02 = scale-config-01). | High | S | Write a failing test: `resolveBrand('money-rulebook')` should give voice `bm_daniel` and slots `['00:05']`. Then make `registryToKit` return `undefined` for fields that aren't declared, the same way the #101 accent fix works. |
| 6 | **Make yt-deepdive exit deterministically** | `yt-deepdive.mjs:1192` has no `process.exit`. `studio/lib/db.mjs:15` sets no `idle_timeout`. Run 43342205832 uploaded at 01:32, then sat idle until the 45-minute kill and was reported "Episode failed" (pipeline-01). | High | S | Change the end of the file to `const r = await renderAndShipEpisode(...); await sql.end({timeout:5}); process.exit(r?.ok\|\|r?.claimed\|\|r?.skipped?0:1)`. Add `idle_timeout:20` to db.mjs. Force a money-rulebook doc to verify. |
| 7 | **Report outcomes truthfully: no-op exit codes, logged timeouts, state-change alerting** | `channel-pipeline.mjs:297-307` never logs `r.signal`, and `:961/974` always exits 0. Empty clip queues log "✓" (`:559-561`, `shorts-clips.mjs:421,490`). `shorts-clips.mjs:636` uses `v.status \|\| 0`. ci-doctor exits 1 on STALE (`ci-doctor.mjs:131`) and its commit step is skipped (pipeline-05, ops-cost-03/04, ci-cd-04). | High | S | Log signal, error and elapsed time in `run()`. Give shorts-clips exit code 3 for "nothing to post" and close the job as `noop`. Write `published_today` to state. Alert from ci-doctor only on an OK→BAD change, and run its commit step with `if: always()`. |
| 8 | **Guard the registry DB→repo sync before it wipes crons and reopens parked channels** | `channels-registry.js:59-98` `rowToEntry` has no top-level `cron` and recomputes `active`. Neon has 13 active rows, all with `kit.gateCron` NULL, against 4 repo rows with crons. The next connect or profile save drops every cron and re-adds 9 parked channels. `tokenEnc` is also projected into git (scale-config-04, data-12). | High | S (guard), M (single writer) | Make `syncRegistryRepo` keep the repo's `cron` and `active` and drop `tokenEnc`. Backfill `kit.gateCron` for the 4 rows. Add a round-trip test. |
| 9 | **Fix the clip-feed run identity and stage only docs that shipped** | `longvideo/shorts-clips.mjs:255` records `local-<ts>` while the artifact scan (`:264-273`) matches GitHub run ids. Money-rulebook doneRuns holds no ids for locally fed docs. `channel-pipeline.mjs:886-906` stages `episode.mp4` whenever the file exists (pipeline-02/06). | High | S | Pass `--run-id $GITHUB_RUN_ID` into doneRuns. Gate Phase 6 on `deepdiveDate===today && deepdiveVideo.videoId`. Add a test where a local feed followed by an artifact scan yields `nothing-new`. |
| 10 | **Move the clock to an external scheduler and make the sweeper date-safe** | `channel-autopilot.yml:25` heartbeat fires 3–5 times out of 48 per day. `sweeper.mjs:24` uses `todayUTC` from wall-clock time. On 11-13 at 01:05 it dispatched 4 heals ahead of the 02:13–03:53 slots (ci-cd-01/02, scale-config-02, ops-cost-02). | High | M | Use a Cloudflare Worker cron (`*/30`) or Vercel crons calling `workflow_dispatch`, starting with money-rulebook only. Add a pure `targetDateFor(now, firstSlot)` with a test. Keep the GitHub cron as a backup. |
| 11 | **Token preflight and invalid_grant parking before any render spend** | Trend research swallows OAuth failures (`yt-deepdive.mjs:1115`). The dup gate fails open. `yt-token.mjs:33` throws a generic error. Only `scripts/import-parked-channels.mjs` handles `invalid_grant` (youtube-api-03, scale-config-07). | High | S | Run `channels.list(mine)` (1 unit) right after the park-check. On `invalid_grant`, set `reconnect_required`, send one ntfy and exit 0. **Owner action:** move the consent screen to "In production", then re-auth once. |
| 12 | **Secret hygiene sweep** | A classic `ghp_` PAT and an n8n JWT sit in history at `587a2be:.mcp.json`, and the repo was public until 10-24. `colab-driver-v5.py:269` writes `repr(pat)` into notebook cells. Secret scanning and Dependabot are off, and main has no protection (security-06, crossplatform-debt-02). | High | S | **Owner action:** confirm the 587a2be PAT is revoked, rotate `GITHUB_PAT`, and switch Colab to `userdata` with a fine-grained token. Then enable secret scanning (or add gitleaks to tests.yml) and Dependabot alerts. |
| 13 | **Pre-upload media QC gate** | No `blackdetect`, `silencedetect` or ffprobe check exists anywhere. The black-video incident (5fae2bf) pulled 4 videos. The pre-upload check (6228c56) only looks at bytes and magic numbers (tests-qa-03). | High | M | Add `lib/media-qc.mjs` (codec, duration within ±X%, resolution, moov before mdat, black and silence ratios) and call it in `uploadWithIntent` before the session opens. Add a lavfi `testsrc2` pass fixture and a black-video fail fixture. |
| 14 | **Close the upload-intent network-error double-upload path** | At `lib/upload-intents.mjs:707`, a thrown PUT has no status, so `markFailed` runs without a probe. The reclaim at `:213-218` sets `session_uri` to NULL. Reproduced with a fake fetch. The 308 no-progress loop is unbounded at `:703` (youtube-api-01/02). | Med | S | Add failing tests (ECONNRESET followed by a probe returning 201, and a repeated 308 with the same Range). Route the no-status branch through the existing `bytes */N` probe and backoff. |
| 15 | **Nightly encrypted Neon backup** | No pg_dump job exists. The Neon Free restore window is 6 hours, and Neon holds approvals, `upload_intents`, `dedupe_verdicts`, the registry and the RAG corpus (data-03). | Med | S | Workflow: `pg_dump -Fc` over a `DATABASE_URL_DIRECT` secret, encrypt with age, store as a 30-day artifact. Test one restore into a Neon branch. |

**Quick wins that didn't make the list.** Each is one line or one small commit. Ship them separately.
- `studio/app/page.js:52`: the analytics URL builds `?slug=all?fresh=1`.
- `channel-autopilot.yml:126`: rolling cache key `pixabay-pool-${{ github.run_id }}` with `restore-keys`. The cache has been frozen since 09-02.
- `lib/state.mjs:40`: move the try/catch inside the loop.
- `analytics-store.mjs:301`: run the data_api prune outside `if (daily.length)`.
- `yt-deepdive.mjs:392`: add `normalize=0` to amix.
- `reporting-daily.yml:158`: remove the destructive `fb-dedupe --apply` cron.

## 4. Confirmed critical/high issues (post-verify; no criticals remain)

| ID | File:line | Issue | Fix |
|---|---|---|---|
| security-01 / studio-arch-01 / security-10 | `studio/app/api/thumbs/preview/route.js:12`, `studio/proxy.js:27-31`, `thumbs/videos/route.js:89` | Unauthenticated fetch proxy with SSRF and cost burn; private titles leak through the videos fallback | Restore auth, remove the public paths, set `redirect:'error'` plus a host allowlist |
| security-02 | `studio/app/api/thumbs/demo/route.js:39`, `lib/thumb-templates.js:113,119` | Unescaped SVG attributes reach sharp 0.33.5/librsvg (GHSA-wq5f-xc86-pv6w) | Hex and dataURL validation, escapeXml in templates, sharp >=0.35.5 |
| security-06 | `587a2be:.mcp.json` | Classic PAT and n8n key in history from the public period; scanning is off | Revoke or confirm revocation, enable secret scanning and Dependabot |
| pipeline-01 | `yt-deepdive.mjs:1192`, `studio/lib/db.mjs:15` | About 20 minutes of idle hang after upload; job recorded as failed | Explicit exit plus `sql.end`, `idle_timeout` |
| pipeline-02 | `longvideo/shorts-clips.mjs:255,264-273` | Self-feed re-selects docs it already clipped, so duplicate Shorts on money-rulebook | Record `GITHUB_RUN_ID` in doneRuns, dedupe on window identity |
| tests-qa-03 | `lib/ffmpeg.mjs` (8 encode copies) | No render-output QC; the black-video regression already shipped | `lib/media-qc.mjs` gate plus golden fixtures |
| content-growth-02 / scale-config-01 | `lib/brand-resolve.mjs:56,72,73,84,116` | Invented defaults override legacy kits, collapsing 4 channels to one voice and one slot | Return `undefined` for undeclared fields, add per-field precedence tests |
| ci-cd-01 / scale-config-02 / ops-cost-02 | `.github/workflows/channel-autopilot.yml:25`, `lib/schedule-slot.mjs:85-94` | Heartbeat delivers about 8% of ticks, so slot gating fails silently | External dispatcher, wider catch-up, dead-man check |
| scale-config-04 | `studio/lib/channels-registry.js:59-98,177` | DB→repo sync drops crons, reactivates 9 parked rows, and projects `tokenEnc` | Preserve cron and active, drop tokenEnc, make Neon the only writer |
| ops-cost-01 | `studio/lib/warnings-store.mjs:202,262` | Live NOT NULL column rejects warning inserts, so dashboard, dedupe and alert storm all break | `DROP NOT NULL` migration plus a real-Postgres contract test |

## 5. QA results summary

| Check | Result |
|---|---|
| Root `npm test` (local, Node 24.19) | **1113/1113 pass** (~36 s). It is **flaky under load**: other runs gave 1080 pass / 2 fail (exceljs files) and 1111 / 2 fail (`#106 T5b`, cleanup CLI). |
| CI `tests.yml` | **FAIL**: last 6 pushes red (8 of the last 30). 1108 run, 1 fails at load (`tests/thumbs-studio.test.mjs`, missing `opentype.js`). One older red run (42675299490) came from tests coupled to live registry data. |
| Python brain (`pytest services/ai/tests`) | 102 pass, 3 skipped; `test_store.py` 26/26 |
| Targeted suites | security 47/47, pipeline 174/174, YouTube/quota 160/160, studio 190/190 and 114/114, data 286/286, content 307/307, scale 153/153, cross-platform 68/68, ops 76/76. All pass, but many use regex-SQL fakes and source-string pins. |
| `node --check` | 99/99 modules OK; Python `py_compile` OK |
| Studio ESLint | **FAIL**: 48 errors and 77 warnings (22 errors first-party: duplicate prop at `app/client/page.js:196`, render mutation at `components/charts.js:188`, 13 set-state-in-effect) |
| Studio `tsc --noEmit` | **FAIL**: 32 errors, all in dead untitledui code, hidden by `ignoreBuildErrors: true` |
| npm audit | studio: 1 critical, 6 high (next, sharp, @vercel/blob chain). root: 7 high, 9 moderate. |
| Probes reproduced as failing | ECONNRESET double-upload; 308 infinite loop (51 PUTs); 00:05 slot getting only 15 minutes of lead at 23:50Z; `loadAllStates` dropping channels after a corrupt file; rollup never pruning data_api; malformed analytics URL; contrast as low as 1.18:1; thumbnail title truncation; brand-resolve voice and slot overwrite |
| Production telemetry | channel-autopilot 40/40 "success" despite failures; CI Doctor 33/33 fail; Template Previews 20/39 fail; heartbeat 3–5 of 48 per day; reconcile 341 failed ntfy attempts and 130+ HTTP 429 per run; 1 job "running" since 10-31; 12 money-rulebook jobs "held" since 11-02 |
| Cost measurements (conflicting) | ops: about 1,400 wall-min/mo (~$8.2). ci-cd, using per-job rounding as GitHub bills: about 2,900 min/mo (~$17.5). The verifier marked both unverified. Artifacts are 1,309 MB against 500 MB included. |
| Side effects of running the tests | `npm test` overwrote and then restored the tracked `yt-mcp/channel-keys.json`, and re-serialized `yt-mcp/schedule-state.json` (CRLF only). Both are hazards for parallel sessions sharing one working tree. |

## 6. Research highlights (decision-relevant)

- **YouTube quota model has changed.** Since the 2025-12-04 revision an upload costs about 100 units, not 1,600. Since 2026-06-01, `videos.insert` and `search.list` each have their own 100 calls/day bucket. Other calls share the 10k pool, which resets at midnight PT: `captions.insert` 400, `thumbnails.set` 50, `commentThreads.insert` 50. At 30 channels the insert bucket is the limit you hit first. https://developers.google.com/youtube/v3/determine_quota_cost · https://developers.google.com/youtube/v3/revision_history
- **Quota extension.** The audit form now makes per-bucket increases easier, so request an insert-bucket raise when you approach about 80 uploads/day. https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits
- **OAuth expiry.** Apps in "Testing" status get refresh tokens that expire after 7 days. There is a cap of 100 tokens per account per client (the oldest is silently revoked), and tokens die after 6 months unused. Failures surface as `invalid_grant` plus `error_subtype`. This matches the fleet-wide 401. Durable fix: switch the app to "In production" and re-auth once. https://developers.google.com/identity/protocols/oauth2
- **Resumable uploads.** Google says to treat a dropped connection like a 5xx: probe with `bytes */SIZE`, then resume. https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol
- **YPP "inauthentic content" (July 2025).** It names "AI-generated content made with generic or unoriginal templates giving the impression of mass production", and enforcement applies to the whole channel. https://support.google.com/youtube/answer/1311392. Reports of 2026 enforcement waves come only from secondary sources and are unconfirmed.
- **AI disclosure.** Only realistic synthetic content needs it; stock footage plus TTS probably does not. Repeated failure to disclose can lead to a forced label or YPP suspension. Set `status.containsSyntheticMedia` at insert time. https://support.google.com/youtube/answer/14328491 · https://developers.google.com/youtube/v3/docs/videos
- **Chapters.** They need a first stamp of `00:00`, at least 3 ascending stamps, and each chapter at least 10 s long. https://support.google.com/youtube/answer/9884579. Upload spec: faststart and 48 kHz AAC. https://support.google.com/youtube/answer/1722171
- **Actions billing (2026).** Linux 2-core costs $0.006/min and ubuntu-slim $0.002/min. Each job is rounded up to a whole minute. The Free plan includes $12/mo of compute and 500 MB of artifact storage. **Without a payment method, usage is blocked when the allowance runs out**, so overrunning means an outage rather than a bill. https://docs.github.com/en/billing/reference/actions-runner-pricing · https://docs.github.com/en/billing/concepts/product-billing/github-actions
- **Schedules can be dropped.** GitHub's docs say "some queued jobs may be dropped" under load. https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows. Free alternatives: Cloudflare Workers allows 5 cron triggers per account (https://developers.cloudflare.com/workers/platform/limits/). Vercel Hobby allows 100 cron jobs, each at most once a day (https://vercel.com/docs/cron-jobs/usage-and-pricing).
- **`concurrency: queue: max`** (GA 2026-05-07) prevents pending runs, such as review-resume, from being silently cancelled. https://github.blog/changelog/2026-05-07-github-actions-concurrency-groups-now-allow-larger-queues
- **Free-tier walls that block rather than bill.** Vercel Blob Hobby: 1 GB, then locked for 30 days (https://vercel.com/docs/vercel-blob/usage-and-pricing). Neon Free: 6-hour restore window, 1 GB, 100 CU-hours/mo (https://neon.com/docs/introduction/plans).
- **Next.js.** Proxy is not an authorization boundary, so every route has to check auth itself (https://nextjs.org/docs/app/api-reference/file-conventions/proxy). The librsvg advisory is https://github.com/advisories/GHSA-wq5f-xc86-pv6w, fixed in sharp 0.35.5 and next 16.4.1.
- **Meta.** Graph API v20 expired 2026-09-24 and v21 expires 2027-01-21; target v25 (valid to 2028-07-29) before un-pausing social. https://developers.facebook.com/docs/graph-api/changelog/versions. Threads tokens last 60 days and can only be refreshed while still valid. https://developers.facebook.com/docs/threads/get-started/long-lived-tokens/

## 7. Suggested roadmap (one feature at a time, each with an EARS spec and QA file, piloted on money-rulebook, after owner approval)

**This week (all small, in order)**
1. Thumbs auth revert plus auth tests, then deploy and confirm live (#1).
2. SVG validation plus sharp/next upgrade (#2).
3. CI green: opentype.js, `npm ci`, ntfy on failure (#3).
4. Warnings NOT NULL migration plus reconcile digest (#4).
5. Brand-resolve default fix; check that money-rulebook's next upload uses bm_daniel at 00:05 (#5).
6. yt-deepdive exit; force a money-rulebook doc and confirm the child exits within 10 s of upload (#6).
7. Registry sync guard: preserve cron and active, drop tokenEnc (#8).
- **Owner actions running in parallel (no code):** revoke the 587a2be PAT, rotate `GITHUB_PAT`, move the OAuth consent screen to "In production" and re-auth, enable secret scanning and Dependabot, remove the `fb-dedupe --apply` cron step.

**Next 2–4 weeks**
- Truthful outcomes and alert hygiene: noop exit codes, ci-doctor state-change alerts, severity-based topics, run links (#7).
- External scheduler for money-rulebook, then the fleet, plus a date-safe sweeper (#10).
- Token preflight with invalid_grant parking (#11).
- Clip-feed run identity and shipped-only staging (#9).
- Media QC gate (#13).
- Upload-intent probe fix (#14).
- Neon nightly backup (#15).
- `has_chapters` wiring plus a valid `lib/doc-chapters.mjs` (pipeline-03/04).
- Shared audio chain: `normalize=0`, `loudnorm -14 LUFS`, 48 kHz, `apad` (pipeline-07/08).
- Actions cost: caching, `npm ci`, ubuntu-slim for discover and probe jobs, lf-*.mp4 retention down to 5 days, Blob retention reaper.
- RAG dedupe: channel-scoped search and a channel-scoped unique key (data-08/09).
- Grounded-claims contract for YMYL docs, and only write "cited sources" when sources exist (content-growth-01).

**Later**
- Per-bucket quota ledger read from Neon `upload_intents`.
- One token source and a reusable registry-driven `workflow_call`, deleting the hardcoded YT_TOKEN lists in 8 workflows.
- Neon as the only registry writer; versioned SQL migrations.
- GitHub App in place of the Vercel PAT.
- Key separation: SESSION_SECRET, MASTER_KEY v2 everywhere, retire qs_key.
- Studio cleanup: `withAuth` plus a single `yt-token`, prune untitledui plus knip, exception-first Fleet table, ConfirmAction plus sonner feedback, WCAG token pass.
- Per-channel format signatures and disclosure derived from asset provenance.
- `lib/meta-graph.mjs` and a Neon crosspost queue before any social lane is un-paused.
- History scrub and repo slimming.
- PGlite store tests and an AC-traceability script.
- Hetzner ephemeral runner evaluation (research doc only).

## 8. Medium/low findings, condensed

**Security**
- sec-03 (M): next 16.3.4 advisories; RCE preconditions are mostly unmet today.
- sec-04 (M): `STUDIO_PASSWORD` keys sessions, connect-link HMAC and token AES (`channels-registry.js:36`); `'quarry-connect'` fallback; `!==` comparison.
- sec-05 (M): `qs_key` cookie never expires and bypasses /sessions revoke (`login/route.js:45`).
- sec-07 (M): BYOK key split: Studio uses MASTER_KEY v2, CI only v1 (`lib/channel-keys.mjs:24`).
- sec-08 (M): Vercel PAT has contents, actions and secrets write on an unprotected main.
- sec-09 (M): `${{ inputs.* }}` interpolated into `run:` (`channel-autopilot.yml:203`, `template-bot.yml:58`, and others).
- sec-11 (M): 6 dead secrets including `YT_DLP_COOKIES`; checkout persists the PAT; YT token in `GITHUB_ENV`.
- sec-12 (L): fail-open aud check, throttle and HMAC compare.
- sec-13 (L): no CSP or frame-ancestors headers.

**Pipeline**
- pipe-03 (M): `has_chapters` toggle is a no-op.
- pipe-04 (M): chapter stamps are offset or don't start at 00:00.
- pipe-05 (M): unconditional exit 0.
- pipe-06 (M): stages an episode that was never uploaded.
- pipe-07 (M): no loudnorm, and amix halves the narration.
- pipe-08 (M): audio shorter than video before `-c copy` concat; drift risk is plausible but unmeasured.
- pipe-09 (M): curl downloads lack `--fail`, `--max-time` and a `.part` file.
- pipe-10 (M): frozen pixabay cache.
- pipe-11 (M): Remotion `spawnSync` has no timeout, and `npm ci` runs on every runner.
- pipe-12 (L): no faststart on the legacy doc mux; 44.1 kHz.
- pipe-13 (L): cinematic per-page static maps.
- pipe-14 (L): 60 s truncation; temp files leak.

**YouTube API**
- yt-01 (M): double-upload path.
- yt-02 (L): 308 loop.
- yt-03 (M): no preflight.
- yt-04 (M): ledger ignores buckets; the 18k-unit projection is inflated.
- yt-05 (M): with no DB, falls back to 1700 units, which parks the fleet after about 5 uploads.
- yt-06 (M): `longform-upload.mjs:231` and `weekly-compilation.mjs:322` bypass intents.
- yt-07 (M): reconcile covers only 4 channels and its "PT reset" comment is wrong.
- yt-09 (M): token encryption tied to the password.
- yt-10 (L): rollover lead time of 15 minutes; intent key uses the run date.
- yt-11 (L): oauth CLIs use a static MATCH map and `state:'0'`.
- yt-12 (L): `argv` "test" sniffing lowers the upload minimum to 8 bytes.

**CI/CD**
- ci-02 (M): sweeper crosses midnight (early production, previous day never checked).
- ci-03 (M): red tests.
- ci-04 (M): CI Doctor always red.
- ci-05 (M): cost likely over $12.
- ci-06 (M): reconcile spends about 8 of its 9 minutes on ntfy retries and has no issues:write fallback.
- ci-07 (M): YT_TOKEN hardcoded in 7 workflows.
- ci-08 (M): no npm, pip, apt or model caching.
- ci-09 (M): a newer pending run can cancel a review-resume.
- ci-10 (M): single-shot state push with `|| true`.
- ci-11 (M): input injection.
- ci-12 (M): 10 jobs have no timeout; template-preview starts the image server before `npm install`.
- ci-13 (L): Node 20 action majors, no SHA pins.
- ci-14 (L): "restore-only" cache comments are false; paused IG outbox caches cost 290 MB.

**Studio architecture**
- arch-02 (M): analytics URL bug.
- arch-03 (M): no lint, type or build gate.
- arch-04 (M): unused WorkspaceProvider polls every 60 s; `cached()` doesn't dedupe in-flight requests.
- arch-05 (M): drafts toggle writes to a read-only filesystem (EROFS).
- arch-06 (M): stale static RETENTION, ALERTS and badges.
- arch-07 (M): 6 hardcoded slug maps.
- arch-08 (M): 280 of 313 untitledui files dead; 5 dead dependencies.
- arch-09 (M): no error boundaries; hubs bypass the proxy role matrix.
- arch-10 (M): 22 first-party ESLint errors.
- arch-11 (M): 6 refresh-token copies.
- arch-12 (L): postgres client opened per request in 3 routes.
- arch-13 (L): 401 returned for role denials; 3 different auth idioms.
- arch-14 (L): pipeline libraries live under `studio/lib`.

**Studio UX**
- ux-01 (M): drafts toggle reverts and can commit the wrong format.
- ux-03 (M): a failed schedule load followed by Save wipes the cadence.
- ux-04 (M): Reject, Pause-all and bulk thumbnail replace run with no confirmation; bulk replace keeps no backup.
- ux-05 (M): mutations ignore `r.ok`; `sonner` is installed but unused.
- ux-06 (M): bell, badges and "16 brands" are hardcoded.
- ux-07 (M): debt-free-doctrine shows the "OM" monogram; `?channel=` is ignored.
- ux-08 (M): approved drafts stay actionable; Contents API races; **panel commits hardcode a `Co-Authored-By: Claude` trailer (`template-approvals.mjs:135,163`), which conflicts with the git-identity directive**.
- ux-09 (M): contrast failures.
- ux-10 (M): no live regions or `aria-pressed`.
- ux-11 (M): modal focus not managed; fake ARIA tabs; two h1s.
- ux-12 (M): card-per-channel layout won't scale; fixed 2-column grids on mobile.
- ux-13 (L): controls labelled only by placeholder.
- ux-14 (L): hardcoded "95–100% matched" badges.

**Data**
- data-01 (M): no migrations; ALTER runs on every boot.
- data-02 (M): `dedupe_verdicts` only exists if the Python sidecar created it.
- data-03 (M): no backup.
- data-04 (M): git state push race.
- data-05 (L): stale quota snapshot (immaterial at current volume).
- data-06 (M): `loadAllStates` corrupt-file cascade.
- data-07 (M): rollup never prunes data_api.
- data-08 (M): global top-5 hides same-channel BLOCKs.
- data-09 (M): `UNIQUE(content_hash, chunk_kind)` ignores channel.
- data-10 (M): sidecar leaks a connection per request.
- data-11 (M): pooled embedding truncated at about 256 tokens.
- data-12 (M): registry split-brain and tokenEnc in git.
- data-13 (L): db-setup re-seed overwrites kit data.
- data-14 (L): intent mutex fails open.
- data-15 (L): no retention, missing or duplicate indexes, meta race.

**Tests & QA**
- tq-01/02 (M): red and gating nothing; `cancel-in-progress` hides per-commit results.
- tq-04 (M): tests write tracked production files.
- tq-05 (M): tests assert on the live registry.
- tq-06 (M): 141 source-regex pins.
- tq-07 (M): sweeper, verify-run and cross-posters untested.
- tq-08 (M): regex-SQL fakes.
- tq-09 (M): 29 of 72 feat/fix commits since 11-01 have no tests; recent features have no spec.
- tq-10 (M): 5 QA files unexecuted; 35 of 79 ACs untraced.
- tq-11 (L): studio lint not in CI.
- tq-12 (L): `npm install` instead of `npm ci`, no coverage floor.
- tq-13 (L): wall-clock dependence at midnight UTC.
- tq-14 (L): `tests/fixtures` is empty.

**Content**
- cg-01 (M): unsourced dollar figures plus false "cited sources" disclaimers (`template-registry.data.js:208,585`, `yt-deepdive.mjs:1172`).
- cg-03 (M): disclosure answers dropped (`review-actions.mjs:123`).
- cg-04 (M): tags made entirely of competitor tokens, including creator names (`youtube-engine.mjs:1348`).
- cg-05 (M): thumbnail text truncated and duplicated.
- cg-06 (M): clip dedupe frozen; most-downloaded clips favoured.
- cg-07 (M): dup-gate one-word-swap carve-out.
- cg-08 (M): identical kickers and comments on every channel; "align wording" with viral videos.
- cg-09 (L): same footage looped, fade to black between sections.
- cg-10 (L): tax, insurance, investing and health templates ungated.
- cg-11 (L): `categoryId '27'` and `'en'` hardcoded.
- cg-12 (L): b-roll LLM bypasses the adapter.
- cg-13 (L): public compilation lane can still be dispatched.

**Scale**
- sc-03 (M): 8 workflows hardcode the legacy 4 channels.
- sc-05 (M): 6+ brand stores, already drifted.
- sc-06 (M): wizard collision check ignores parked kit slugs; per-slug code switches.
- sc-07 (M): no token check; one shared GCP project.
- sc-08 (M): all crons fall in 02:13–03:53; 02:33 is the default; alphabetical matrix order.
- sc-09 (M): ONBOARDING.md names deleted scripts; 16 static MCP entries.
- sc-10 (L): state commit race.
- sc-11 (L): insert bucket advisory only.
- sc-12 (L): registry paths depend on cwd.

**Cross-platform & hygiene**
- xp-02 (M): PAT in a Colab cell.
- xp-03 (L): Graph API v20/v21 pins.
- xp-04 (M): IG `media_type=VIDEO` removed; FB `/videos` is not Reels.
- xp-05 (M): `FB_DESTINATIONS` overrides Studio data (`lib/registry.mjs:88`).
- xp-06 (M): IG/FB outbox `.done` race.
- xp-07 (M): Threads token expired 10-29 and CI can't persist refreshes.
- xp-08 (M): weekly destructive `fb-dedupe --apply`.
- xp-09 (M): 2.01 GiB pack; scrub never run; codeberry commits MP4s.
- xp-10 (L): 16 unreferenced root scripts; sweeper dispatches a disabled workflow.
- xp-11 (L): 18 OAuth2 constructors; 14 direct LLM callers.
- xp-12 (L): unpublished media uploaded to uguu.se; Pinterest Trial pins are invisible.
- xp-13 (L): `.gitignore` misses `quarry-studio-token.json`; `scripts/gh-personal` is untracked.

**Ops & cost**
- ops-03 (M): "nothing published" is reported as success.
- ops-04 (M): one high-priority topic for everything.
- ops-05 (M): ntfy 429 storm.
- ops-06 (M): sweeper curl has no `-f`; "All channels healthy" prints next to warnings.
- ops-07 (M): Blob `deleteExpired` is never called.
- ops-08 (M): about 114 s of setup per run; 1.3 GB of artifacts against 500 MB.
- ops-09 (M): no reaper for stuck or held jobs.
- ops-10 (L): no run-URL correlation; 10 direct ntfy call sites.
- ops-11 (L): analytics URL (duplicate).
- ops-12 (L): no USD price or cap in `routeAndCall`; 3 callers bypass it.
- ops-13 (L): Excel workbook posted to the public ntfy.sh topic.