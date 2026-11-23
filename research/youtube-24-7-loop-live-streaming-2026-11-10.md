# 24/7 loop live streams on YouTube — portfolio research 2026-11-10

Read-only research round, owner request: how to run lofi-girl-style 24/7 loop streams on all ~16 owned channels, re-playing already-uploaded 8–15 min long videos. External claims cite primary sources (support.google.com, developers.google.com, ffmpeg.org, vendor pricing pages), all fetched **2026-11-10** unless marked. Quota facts cross-checked against the repo's `research/platform-youtube-api-oauth-2026-10-24.md` (its determine_quota_cost snapshot, page updated 2026-10-15, matches today's fetch). FACT / RECOMMENDATION / UNVERIFIED labels mark documented vs judgment vs unverifiable claims. No code or repo files changed.

---

## 0. Executive summary — verdict + recommended architecture

**VERDICT: GO — technically cheap, policy-safe if framed honestly, and the API now makes it trivial. Recommended architecture in 5 lines:**

1. **One Hetzner CPX12 VPS in Germany (€11.99/mo excl. VAT) runs 16 `ffmpeg -re -stream_loop -1 -i playlist -c copy -f flv` processes** — one per channel, remux-only (no re-encode), 720p ingest keeps total egress ≈16.4 TB/month, inside Hetzner's included 20 TB.
2. **Per channel via the existing OAuth MCP servers (live scopes already granted):** `liveStreams.insert` (reusable RTMP stream) → `liveBroadcasts.insert` with `enableAutoStart=true`, `enableAutoStop=false`, and **no `scheduledEndTime`** — the docs state such a broadcast "is scheduled to continue indefinitely," so there is no 12-hour rollover problem at all.
3. **The "12-hour limit" only applies to archives/VODs** ("If your stream exceeds 12 hours, it may not be captured at all" — support.google.com); the live stream itself keeps running.
4. **Every live API method now costs 1 quota unit** (liveBroadcasts.*, liveStreams.* — confirmed 2026-11-10); setup is 4 units/channel, steady-state watchdog polling fits in <20% of the 10,000-unit/day bucket even shared across all 16 channels.
5. **All hosted-SaaS alternatives lose on price by 25–100×** (OneStream ≈$45/ch/mo with a 24-hour-per-stream cap; Castr loops only from $199.99/mo; GitHub Actions ≈$5,600/mo and violates GitHub's Additional Products terms; Colab kills sessions at 12–24 h). Pilot on Money-Rulebook first per the standing directive.

Biggest real risk is not technical: **the July 2025 "inauthentic content" YPP policy** explicitly targets "channels where content feels interchangeable from video to video" — which describes our templated channel inventory more than the loop streams themselves. See §5.

---

## 1. Requirements gate — what must be true per channel (before any code)

All facts from the official "Create a live stream on YouTube" page and the mobile page (which contains the enablement-delay sentence), fetched 2026-11-10 [S1][S2].

| # | Requirement | Fact (verbatim where quoted) | Applies to us? |
|---|---|---|---|
| 1 | Live restrictions | "To live stream, you need to have no live streaming restrictions in the past 90 days and you need to verify your channel." | Check each of the 16 channels |
| 2 | Channel verification | "you need to verify your channel" (phone verify; the mobile page says "To verify your channel") | One-time per channel |
| 3 | Activation delay | "You may need to wait 24 hours before you can start your first live stream." [S2] | Budget a 24 h gate per newly enabled channel — plan the pilot calendar around it |
| 4 | Age | "You must be at least 16 years old to live stream." Streams by 13–15 year olds may lose live chat. | Owner accounts — yes |
| 5 | Strike penalty | "A strike will prevent you from live streaming for 14 days." Also: a restricted account "is prohibited from using another channel to live stream" — don't cross-stream from a restricted channel to another owned channel | Avoid live strikes; they block the whole lane for 14 days |
| 6 | Subscriber minimum | **Mobile-app live only: "At least 50 subscribers"** plus "we may limit the number of viewers on your mobile live stream" for 50–1,000-sub channels [S2]. **Encoder live: no subscriber minimum appears anywhere in the current requirements/encoder pages** [S1][S3] — the absence of any documented threshold is the evidence (FACT of absence; no page states "no minimum" explicitly) | Our path is encoder/API → not gated by subs, even on small channels |
| 7 | Concurrency caps | "There is a limit of 10 active streams allowed per channel and 3 active streams per stream key." [S1] | We run exactly 1 active stream per channel — fine |
| 8 | API-side gate | `liveBroadcasts.insert`/`.bind` fail with `insufficientPermissions`/`liveStreamingNotEnabled` if "The user that authorized the request is not enabled to stream live video on YouTube" [S6][S7] | The MCP servers' tokens will surface this error verbatim — good probe |

FACT synthesis: the encoder/API path needs **verification + clean 90-day live history + one 24-hour activation wait per channel — no subscriber count requirement**. Mobile-live's 50-sub rule is irrelevant to us (we never stream from the app).

---

## 2. How the loop works — ffmpeg + API flow, step by step

### 2.1 The ffmpeg loop (FACT for every quoted option, ffmpeg.org docs fetched 2026-11-10 [S14][S15])

- `-stream_loop number` — "Set number of times input stream shall be looped. Loop 0 means no loop, loop -1 means infinite loop." [S14]
- `-re` — "Read input at native frame rate. This is equivalent to setting `-readrate 1`." [S14] — **mandatory**: without it ffmpeg pushes the file as fast as it can read it and YouTube will drop/fail the ingest.
- `-c copy` — "a special value `copy` (output only) to indicate that the stream is not to be re-encoded." [S14] — remux-only means each process uses a few percent of one vCPU (no encode work); 16 processes fit comfortably on 2 vCPUs. (CPU claim is inference from "not to be re-encoded" + common deployment experience — FACT for the semantics, RECOMMENDATION-level for the sizing.)
- Playlist rotation: the **concat demuxer** "reads a list of files and other directives from a text file" and demuxes them "one after the other, as if all their packets had been muxed together… each next file starts where the previous one finishes." Constraint: "All files must have the same streams (same codecs, same time base, etc.)." A `ffconcat version 1.0` header line makes it auto-detectable; `safe 0` is needed for absolute paths. [S15]

Single-video loop (one channel):

```
ffmpeg -re -stream_loop -1 -i sleep-architect-loop.mp4 \
  -c copy -f flv rtmp://a.rtmp.youtube.com/live2/<STREAM_KEY>
```

Multi-video playlist rotation:

```
# list.ffconcat
ffconcat version 1.0
file 'mr-money-rules.mp4'
file 'mr-mindset.mp4'
file 'mr-habits.mp4'

ffmpeg -re -stream_loop -1 -f concat -safe 0 -i list.ffconcat \
  -c copy -f flv rtmp://a.rtmp.youtube.com/live2/<STREAM_KEY>
```

RECOMMENDATIONS (not doc-quoted, engineering judgment):
- Source MP4s are H.264/AAC → copying into the FLV container works; keep every video in a channel's playlist from the **same factory render settings** (satisfies the concat "same codecs, same time base" constraint).
- `-c copy` across loop boundaries can emit non-monotonic-DTS warnings (community-known; UNVERIFIED in docs). If YouTube shows glitches at the seam, either add `-fflags +genpts` or fall back to a re-encode variant (`-c:v libx264 -preset veryfast -b:v 3000k -maxrate 3000k -bufsize 6000k -c:a aac`) — re-encoding 16×1080p channels needs real CPU; 16×720p veryfast is doable on CPX22. Try copy first.
- Prefer the **RTMPS** variant in production: YouTube's RTMPS guide requires "The protocol must be `rtmps`… The connection must be made to port 443 on the ingestion server," with the URL taken from `cdn.ingestionInfo.rtmpsIngestionAddress` [S11]. Plain RTMP works but is unencrypted.

### 2.2 Ingest endpoint + encoder settings (FACT)

- The ingest URL is not magic: the API returns it. `liveStreams.cdn.ingestionInfo` contains `streamName` ("The stream name that YouTube assigns to the video stream" = the stream key) and `ingestionAddress` / `backupIngestionAddress` / `rtmpsIngestionAddress` / `rtmpsBackupIngestionAddress`; `cdn.ingestionType` accepts `rtmp` ("which includes RTMPS"), `dash`, or `hls` [S10]. The well-known default shape `rtmp://a.rtmp.youtube.com/live2/<key>` (backup `b.rtmp.youtube.com/live2?backup=1`) is community-documented [S26] — but always read the address from the API response, never hardcode it (no-static-maps directive).
- Encoder ingest settings (support.google.com "Choose live encoder settings, bitrates, and resolutions", fetched 2026-11-10 [S3]):
  - H.264 720p30: **min 3 Mbps / recommended 8 Mbps**; 720p60: min 3 / rec 8; 1080p30: **min 5 Mbps / recommended 14 Mbps**; 1080p60: min 6 / rec 17. 1440p/4K exist above (rec up to 50 Mbps H.264 at 4K60).
  - Keyframe interval: "Recommended 2 seconds", hard ceiling "Do not exceed 4 seconds."
  - Audio: AAC (or MP3), "128-Kbps for stereo"; CBR; ≤60 fps.
  - Our loops are pre-rendered flat motion — **ingest at 720p30 @ 3–4 Mbps CBR** and the 16-channel bandwidth bill stays inside free tiers (math in §4). The 2-second keyframe interval matters for `-c copy` only if the source MP4s were rendered with 2 s GOPs — worth verifying one file with ffprobe; if the source GOP is off, either re-render with the right GOP or use the re-encode variant above (RECOMMENDATION).

### 2.3 The API flow (FACT throughout; per-channel, using the existing per-channel OAuth MCP servers)

Scopes per method pages: `https://www.googleapis.com/auth/youtube` or `https://www.googleapis.com/auth/youtube.force-ssl` for insert/bind/transition [S6][S7][S8]; `youtube.readonly` also accepted for list [S9]. The MCP servers already hold full live access (context), so **no new consent flow is needed**.

1. `liveStreams.insert` — cdn `{ingestionType: rtmp, resolution: 720p, frameRate: 30fps}`, `contentDetails.isReusable: true` ("it can be bound to multiple broadcasts" [S10]) → response gives `ingestionInfo.streamName` + addresses. (1 unit)
2. `liveBroadcasts.insert` — required body props: `snippet.title`, `snippet.scheduledStartTime`, `status.privacyStatus` [S6]. Set `scheduledStartTime` a minute ahead ("The scheduled start time must be in the future and close enough to the current date" [S6]), **omit `scheduledEndTime`** — documented: "If a liveBroadcast resource does not specify a value for this property, then the broadcast is scheduled to continue indefinitely… YouTube treats the broadcast as if it will go on indefinitely." [S5] Set `contentDetails.enableAutoStart: true` ("broadcast should start automatically when you start streaming video on the bound liveStreams") and `enableAutoStop: false` (true would stop it "around one minute after the channel owner stops streaming video" [S5]). (1 unit)
3. `liveBroadcasts.bind` (broadcastId, streamId) — "Binds a YouTube broadcast to a stream…" Cardinality: "A broadcast can only be bound to one video stream, though a video stream may be bound to more than one broadcast." [S7] (1 unit)
4. Start ffmpeg (systemd/docker restart policy: always). With `enableAutoStart=true` the broadcast goes live by itself when ingest data arrives; without it, poll `liveStreams.list` until `status.streamStatus=active` and call `liveBroadcasts.transition(broadcastStatus=live)` — documented rule: "to transition a broadcast to either the `testing` or `live` state, the [bound stream's] streamStatus must be `active`" [S8]. (list 1 + transition 1)
5. **Rollover: none required** (indefinite broadcast). If a broadcast ever ends/is revoked: `liveBroadcasts.insert` a new one + `bind` the **same** reusable streamId; because ffmpeg never stops, `enableAutoStart` flips the new broadcast live with no viewer-visible gap. Caveat: bind can 403 with `liveBroadcastBindingNotAllowed` if "The current status of the live broadcast does not allow it to be bound to a stream" [S7] — the create-in-`ready`-state → bind → autoStart sequence avoids this (RECOMMENDATION).
6. Hygiene: `liveBroadcasts.insert` can fail `userBroadcastsExceedLimit` — "The user has created too many live or scheduled broadcasts and must stop or delete some" [S6] — so the roll script must delete/complete stale broadcasts rather than accumulating them.

Note on "persistent" vs "event": `liveBroadcasts.list` has a `broadcastType` filter (`all` / `event` — the default / `persistent`) [S9], but persistent broadcasts are the legacy auto-created "default stream/broadcast," and YouTube "will stop creating a default stream and default broadcast" (deprecation dated on/after Sept 1, 2020) [S5][S10]. The API cannot create persistent broadcasts; **the documented indefinite-broadcast pattern above is the replacement** for 24/7 on channels created after 2020 — which all 16 of ours are (UNVERIFIED per-channel creation dates, but all were created 2026).

---

## 3. Duration & quota facts table (FACT)

| Fact | Value | Source |
|---|---|---|
| Broadcast end time | Omit `scheduledEndTime` → "the broadcast is scheduled to continue indefinitely" | [S5] |
| End-time validity | `invalidScheduledEndTime` 400: "The scheduled end time must follow the scheduled start time." | [S6] |
| Start-time validity | `invalidScheduledStartTime` 400: "must be in the future and close enough to the current date" | [S6] |
| 12-hour rule | Applies to **archives only**: "If your live stream is less than 12 hours, YouTube can automatically archive it for you." / "If your stream exceeds 12 hours, it may not be captured at all." The live stream itself is not terminated at 12 h (page silent on termination; 24/7 channels operating publicly for years corroborate) | [S4] |
| lifeCycleStatus values | `created` → `ready` → (`testStarting`/`testing`) → `liveStarting` → `live` → `complete`; also `revoked` ("removed by an administrator action") | [S5] |
| enableAutoStart | "broadcast should start automatically when you start streaming video on the bound liveStreams" | [S5] |
| enableAutoStop | "stop automatically around one minute after the channel owner stops streaming video" — keep false | [S5] |
| enableDvr | default `true`; "cannot be updated once the broadcast is in the `testing` or `live` state"; archives of >12 h streams unreliable → set archive expectations accordingly | [S5][S4] |
| streamStatus enum | `active` ("user is receiving data"), `inactive`, `ready` ("valid CDN settings"), `created`, `error` | [S10] |
| Stream health | `healthStatus.status`: `good`/`ok`/`bad`/`noData` + `configurationIssues[]` where severity `error` = "The video cannot be broadcast to viewers" | [S10] |
| Quota: liveBroadcasts.* (list/insert/update/delete/bind/transition/cuepoint) | **1 unit each** | [S12] |
| Quota: liveStreams.* (list/insert/update/delete) | **1 unit each** | [S12] |
| Quota: liveChatMessages | list 5, insert 20, delete 20 | [S12]; matches local 2026-10-24 snapshot [S13] |
| Quota bucket | Live methods draw from the default **10,000 units/day combined** bucket (only `search.list` and `videos.insert` have separate 100-call buckets); reset midnight PT | [S12][S13] |
| Watchdog polling budget | Polling all 16 channels every 15 min = 16 × 96 × 1 = **1,536 units/day (15% of bucket)**; every 5 min = 4,608 (46%) — poll every 5 min only during incidents (RECOMMENDATION) | math on [S12] |
| Setup budget | ≈4 units/channel one-time + a few per incident — negligible | math on [S12] |

Quota verdict: quota is a non-issue even if all 16 channels share one Google Cloud project; per-channel MCP servers almost certainly mean per-channel projects (10k/day each) — even better. (FACT on the bucket; per-channel project layout per task context.)

---

## 4. Hosting options compared — with the 16-channel bandwidth math

### 4.1 Bandwidth math (FACT inputs, RECOMMENDATION conclusion)

Seconds/month at 24/7: 30.44 days × 86,400 = **2.63M s**. Monthly egress = (video+audio bitrate) × time; +128 kbps AAC stereo audio per YouTube's audio recommendation [S3].

| Ingest tier | Bitrate (incl. audio) | Per channel/month | ×16 channels/month |
|---|---|---|---|
| 720p30 @ YouTube min 3 Mbps | 3.13 Mbps | **1.03 TB** | **16.4 TB** |
| 1080p30 @ YouTube min 5 Mbps | 5.13 Mbps | 1.69 TB | 27.0 TB |
| 720p30 @ YouTube rec 8 Mbps | 8.13 Mbps | 2.67 TB | 42.8 TB |
| 1080p30 @ YouTube rec 14 Mbps | 14.13 Mbps | 4.64 TB | 74.3 TB |

Conclusion: **720p @ 3 Mbps CBR puts all 16 channels at ~16.4 TB/month — inside Hetzner's included 20 TB and just over Oracle's free 10 TB.** 1080p at the recommended 14 Mbps would cost ~74 TB (≈€54/mo of €1/TB overage at Hetzner — still cheaper than every SaaS, but unnecessary for ambient loops) (RECOMMENDATION).

### 4.2 Options

| Option | Cost/month (16 channels, 720p) | 24/7 fit | Verdict |
|---|---|---|---|
| **Hetzner CPX12** (2 vCPU, 2 GB RAM, 40 GB NVMe, EU FSN1/NBG1/HEL1) | **€11.99 + €0–7 overage = €12–19 total** — EU instances include 20 TB outbound, extra "€1.00" per TB [S23]; 1 channel = €11.99 alone | One box, 16 ffmpeg `-c copy` processes (CPU trivial, RAM ~16×50–150 MB → 2 GB ok); systemd `Restart=always` | **RECOMMENDED**. CPX02 (€6.49, 1 GB RAM) is too tight on RAM for 16 processes; CPX22 (€19.99, 4 GB) if re-encoding fallback needed. US/Singapore Hetzner locations include only 1 TB/0.5 TB traffic — use EU [S23] |
| Oracle Cloud Always Free (A1: 2 OCPU/12 GB; "10 TB per month of outbound data") | $0 | 16.4 TB > 10 TB free; E2.1.Micro caps at 50 Mbps (16×3.13 = 50 Mbps — at the limit); **idle-reclamation**: Always Free A1 instances may be reclaimed if 7-day 95th-percentile CPU/network/memory < 20% — a `-c copy` ffmpeg fleet is exactly that idle → eviction risk | Possible hybrid (10 channels Oracle + 6 Hetzner) but fragile — not recommended as primary [S21] |
| DigitalOcean droplet ($4/mo up, "free outbound data transfer, starting at 500 GiB/mo", overage "$0.01 per GiB") | ~$170/mo (16.4 TB − 0.5 TB ≈ 15.9 TB × $0.01/GiB ≈ $159 + droplet) | Technically fine | **REJECT — uneconomic** [S22] |
| Vultr ($5–6 tiers) | Similar math to DO (overage-dominated) | — | REJECT — pricing page blocked fetch; numbers UNVERIFIED [S27] |
| **GitHub Actions** (repo is private since 2026-10-24) | Job cap: "Each job in a workflow can run for up to 6 hours" → 24/7 needs ~3 restarts/day/channel ≈ 3,894 jobs/mo; Free plan included compute is **$12 USD/mo** (docs now express included usage in USD, not the old 2,000-minute figure — memory's "watch 2,000/mo" framing is outdated); Linux compute ≈ $0.008/min → 16 × 730 h × $0.48/h ≈ **$5,600/mo** | Worse: prohibited. Terms bar "any other activity unrelated to the production, testing, deployment, or publication" of the repo's software and "any activity that places a burden on our servers… disproportionate to the benefits" | **REJECT twice over** [S16][S17] |
| **Google Colab** (free/Pro/Pro+) | Free tier: "In general, notebooks can run for at most 12 hours"; Pro+ "continuous code execution for up to 24 hours"; "Runtimes will time out if you are idle"; "Colab prioritizes interactive compute"; free tier disallows "running distributed computing workers" and "remote control such as SSH shells, remote desktops" | 2–6 forced restarts/day → constant babysitting; not designed for unattended push processes | **REJECT — even though the user already runs Colab jobs, those are batch jobs, not 24/7 sessions** [S18] |
| Local Windows PC (this workstation) | ~$0 cash; power ≈ 70–90 W × 730 h ≈ 55–70 kWh/mo (ESTIMATE, unmeasured) | Works (ffmpeg on Windows is fine), but: Windows Update reboots, sleep settings, the user's commute/cleanup habits, and the C:-disk pressure history make 24/7 uptime the weak link; ~5 GB of loop MP4s locally is fine | **VIABLE FALLBACK for the pilot only**; not the production lane (RECOMMENDATION) |
| Hosted SaaS loop services | See table below | — | **REJECT all — 25–100× Hetzner's price** |

### 4.3 Hosted SaaS "loop uploaded video as live" (fetched 2026-11-10)

| Service | 24/7 loop support | Per-channel economics | ×16 estimate |
|---|---|---|---|
| OneStream Live | "Run a 24-hour YouTube stream for only $30/month" add-on; included only on Enterprise ($99/mo). **Cap is 24 hours per stream** — marketed "24-Hours Stream," not true unlimited 24/7; needs daily re-scheduling | Basic $15/mo (5 GB storage, 0.5 TB bandwidth) + $30 add-on = **$45/mo/channel** | ≈**$720/mo** + daily restart automation [S24] |
| Castr | "Playout loop mode" only on **Premium $199.99/mo (loop max 15 days)** or Ultra $349.99 (30 days); Premium includes only 2 pre-recorded streams | ~$100/mo/channel at 16 channels | ≈**$1,600/mo** [S25] |
| Restream | "Upload & Stream" can "stream pre-recorded content live"; "Unlimited Upload & Stream" only on Enterprise; Business $239/mo covers 8 channels; loop-from-playlist limits on lower tiers not stated on pricing page (UNVERIFIED) | $239/8 ≈ $30/mo/channel | ≈$478/mo, with unclear loop semantics [S28] |
| StreamYard | Not a 24/7 product: "How Many Hours Can I Stream" — 10 h/stream (Core/Advanced), 24 h/stream (Business); help-center numbers via search snippet | n/a | REJECT [S29] |
| Switchboard Live | Multi-destination playout vendor; 24/7 positioning — **pricing not fetched, UNVERIFIED** | n/a | Not evaluated [S30] |

SaaS verdict: at 16 channels every vendor lands between ~$478 and ~$1,600+/month for a worse outcome (restart caps, storage caps, third-party dependency), vs **€12–19/month self-hosted**. This is not a close call (FACT on prices, RECOMMENDATION on verdict).

---

## 5. Policy & monetization risks

1. **No explicit "fake live" prohibition found.** As of 2026-11-10 there is **no current support.google.com sentence banning pre-recorded content streamed as live**; the old "Live streaming policies" help article URL (answer/6330662) now 404s, and the current Spam & deceptive practices page contains no fake-live item (FACT of absence — checked via page fetch + site searches [S19]). The enforceable surfaces that *do* exist:
2. **Misleading metadata / malicious clickbait** [S32]: item 9 bans "maliciously misleading titles, thumbnails, descriptions, or imagery" that "trick users into clicking on a video that does not deliver what was promised." A loop stream titled "LIVE: ask me anything" would violate this; a stream titled honestly (e.g., "Money-Rulebook Radio — 24/7 ambient loop of our explainers") does not (RECOMMENDATION on framing).
3. **YPP "inauthentic content" (renamed from "repetitious content" July 15, 2025)** [S33]: monetized content must "Not be mass-produced, generic, repetitive, or manipulative"; violations explicitly include "AI-generated content made with generic or unoriginal templates giving the impression of mass production," and "channels where content feels interchangeable from video to video are not allowed to monetize." **The loop stream itself is arguably fine (it replays our own originals), but this policy targets the underlying templated channel inventory** — the live lane neither causes nor cures a YPP review problem. Non-YPP channels can still run loops; YPP eligibility is governed by the channel-content review, not the live-ness.
4. **Spam item 6 — automated/synthetic mass-production**: "Using automated tools or AI to churn out high volumes of similar content with minimal changes"; consequences range from content removal + strike to monetization suspension or termination; "If you get 3 strikes within 90 days, your channel may be terminated" [S32]. Sixteen channels running near-identical machinery is exactly the pattern YouTube's reviewers look at — keep per-channel distinct content inventories and honest metadata.
5. **Strike blast radius**: a live strike blocks live streaming 14 days on that channel, and a restricted account may not evade by streaming "using another channel" [S1] — one bad loop stream can take a channel off the live lane, not the whole portfolio.
6. **Archives/DVR**: >12 h streams "may not be captured at all" [S4] — do not promise replays/VODs of the 24/7 stream; consider `enableArchive=false` to avoid doomed archive processing (RECOMMENDATION; property exists per [S5]).
7. Country/legal issues for ambient loops: nothing found in YouTube policies beyond the above (music licensing would matter if we looped copyrighted audio — our videos use owned/generated audio per the own-music lane; UNVERIFIED for every individual asset — confirm each loop's audio is cleared).

**Net policy verdict (RECOMMENDATION): loops of own, honestly-labeled content on channels with no live restrictions are low-risk; the real exposure is the July 2025 inauthentic-content YPP review of templated inventory, which predates and is independent of the live lane.**

---

## 6. Content logistics — getting MP4s onto the stream host

| Path | Facts | Verdict |
|---|---|---|
| YouTube Studio download of own videos | Works via Content → ⋮ → Download (community-documented; **no official support article found as of 2026-11-10 — UNVERIFIED-official**); community reports the download is the processed file, sometimes at reduced fps/quality vs the original | Usable emergency source, not the pipeline |
| Google Takeout | Official: "How to download your Google data" — select "YouTube and YouTube Music" to export uploaded videos [S31] | Official but bulk/slow (hours–days); fine for initial bootstrap, wrong for steady-state |
| GitHub Actions artifacts (the factory's renders) | "By default, GitHub stores build logs and artifacts for 90 days" [S18]; private repos can set custom retention up to 400 days, public capped at 90 (changelog Aug 27, 2026) [S19] | **RECOMMENDED**: the factory already renders remotely; fetch each render's artifact immediately after the render job and land it on the stream host (scp/rsync). Retention clock makes "fetch now" the rule, not "recover later" |
| Re-render on demand | Factory proven (renders remotely since 2026-11-04) | Most reliable source of truth; keep a **rolling shelf of 3–6 MP4s per channel on the VPS (~5 GB total at 100 MB per 8–15 min video)** — small enough for CPX12's 40 GB disk (RECOMMENDATION, math is estimate) |

---

## 7. Recommended pilot plan — Money-Rulebook first (per standing directive)

1. **Day 0 — gate check:** on MR's MCP server, probe `liveBroadcasts.list` (1 unit). If `liveStreamingNotEnabled`: phone-verify + enable live in Studio, wait ≤24 h [S1][S2]. Meanwhile pick 3–4 existing MR long videos and re-render/export fresh MP4s via the factory; fetch artifacts same day [S18].
2. **Day 0–1 — infrastructure:** provision Hetzner CPX12 (EU); install ffmpeg; `systemd` unit per channel with `Restart=always` + a 10-line watchdog script: poll `liveStreams.list?part=status` every 15 min; if `streamStatus=inactive` for >10 min → restart ffmpeg; if broadcast `complete`/`revoked` → create+bind replacement (autoStart handles going live); log `healthStatus.status` and any `configurationIssues` with severity `error` ("The video cannot be broadcast to viewers" [S10]). Same watchdog shell reused for all channels later — per-channel specifics (video list, bitrate, key) stay in kit/registry data, never in code (no-static-maps directive).
3. **Day 1 — go live:** `liveStreams.insert` (reusable, 720p/30fps) → `liveBroadcasts.insert` (autoStart=true, autoStop=false, **no scheduledEndTime**, privacy per owner) → `bind` → start ffmpeg → confirm `streamStatus=active` and broadcast `live` on the watch page.
4. **Day 1–4 — observe 72 h:** uninterrupted uptime, `healthStatus` good/ok, seam quality at loop boundaries (watch the exact restart of the playlist), Hetzner egress graph vs the 1.03 TB/72 h ≈ 130 GB/day projection, archive behavior past 12 h (expect none), zero live warnings/strikes.
5. **Gate to rollout (owner approval boundary):** only after MR passes 72 h + owner sign-off, template the per-channel config and flip the remaining 15 channels in small batches (e.g., 4/wk), each with its own enablement gate (§1) — new channels may each need the 24 h activation wait, so sequence enablements ahead of flips.
6. **Rollback:** `liveBroadcasts.transition(complete)` → stop/disable systemd unit → `liveStreams.delete` (optional). Total ~5 units.

Cost of pilot: €11.99/mo VPS + ~10 quota units + owner time. Everything else reuses existing infrastructure (factory renders, per-channel MCP servers, registry/kit data).

---

## 8. Open questions for the owner

1. **Ingest quality:** accept 720p30 @ 3 Mbps (16 channels fit the free 20 TB) or demand 1080p (adds €6–54/mo in overage)? RECOMMENDATION: 720p first, revisit per-channel later.
2. **Single-IP risk appetite:** all 16 streams from one VPS IP. Fine per YouTube's rules, but if the owner wants blast-radius separation: 2× CPX02/CPX12 (€6.49–11.99 each), 8 channels per box.
3. **Archives:** enable local recording on the VPS for VOD segmentation (the >12 h archive rule means YouTube won't keep replays) — or skip archives entirely for loops? Affects `enableArchive`/`enableDvr` defaults.
4. **Metadata framing:** exact live-title/thumbnail template per channel (honest "24/7 loop" labeling per §5.2) — needs brand-kit input.
5. **Does 24/7 live actually help these channels?** This research covered feasibility, not growth strategy: live watch-hours vs the existing upload cadence lane is an unquantified trade. (Flagged, not researched.)
6. **Audio rights confirmation** per loop asset (owned/generated per the own-music lane) before any monetized stream goes live.
7. **YPP posture:** do any of the 16 currently expect monetization review soon? If yes, sequence their live flip after (not before) the review to avoid muddying it.

---

## 9. Risks / gaps (UNVERIFIED or unstable)

- **Encoder-live subscriber minimum:** no minimum is documented anywhere current; absence-of-requirement is the evidence. If some small channel is refused at enablement, the fix path is undocumented — check Studio's enable screen at that moment.
- **`-stream_loop -1 -c copy` seam glitches** (non-monotonic DTS): community-known, not in ffmpeg docs; pilot will confirm on our exact MP4s; re-encode fallback specified in §2.1.
- **Indefinite-broadcast long-run behavior:** the docs say indefinite scheduling is valid, but no doc promises YouTube won't ever auto-end a weeks-long broadcast; the watchdog's create+bind recovery path covers it either way.
- **Vultr pricing** not fetched (403) — figures not cited; DO/Oracle/Hetzner/SaaS all verified on their own pages.
- **StreamYard limits** cited from its help-center via search snippet, not a direct page fetch.
- **Hetzner's new "cost-optimized" tier (reported from €2.99/mo)** — the news page rate-limited (HTTP 429 on three attempts); CPX lineup prices verified, the cheaper tier not. If it becomes available, it's a straight upgrade to the recommendation.
- **Policy pages move**: the old live-streaming policies article (6330662) is gone; spam/monetization policies were both revised in 2025–2026. Re-check §5 sources quarterly, same cadence as the quota research.
- **GitHub Actions billing model changed** to USD-included-compute ($12/mo Free) — the 2,000-minutes framing in repo memory (2026-10-24) is stale for Actions math (the 10,000-unit YouTube quota facts in the same memory remain current and were re-verified today).

---

## 10. Sources (all fetched 2026-11-10 unless noted)

1. https://support.google.com/youtube/answer/2474026 — enablement requirements (90-day restrictions, channel verify, 16+ age, strike→14 days, 10 active streams/channel + 3/key).
2. https://support.google.com/youtube/answer/9228390 (Android variant) — mobile-live: 50-sub minimum, "wait 24 hours", 50–1,000-sub viewer limits.
3. https://support.google.com/youtube/answer/2853702 — encoder ingest table (720p30 min 3/rec 8 Mbps; 1080p30 min 5/rec 14; keyframe 2 s, max 4 s; AAC 128 kbps; CBR; ≤60 fps).
4. https://support.google.com/youtube/answer/6247592 — 12-hour archive rule ("may not be captured at all" past 12 h).
5. https://developers.google.com/youtube/data/live/reference/rest/v3/liveBroadcasts — scheduledEndTime omission → indefinite; enableAutoStart/enableAutoStop definitions; lifeCycleStatus enum; enableDvr; isDefaultBroadcast deprecation.
6. https://developers.google.com/youtube/data/live/reference/rest/v3/liveBroadcasts/insert — required props, scopes, invalidScheduledStart/EndTime, userBroadcastsExceedLimit, liveStreamingNotEnabled.
7. https://developers.google.com/youtube/data/live/reference/rest/v3/liveBroadcasts/bind — bind semantics, broadcast↔stream cardinality, liveBroadcastBindingNotAllowed, scopes.
8. https://developers.google.com/youtube/data/live/reference/rest/v3/liveBroadcasts/transition — live/complete transitions, streamStatus=active precondition, error enum.
9. https://developers.google.com/youtube/data/live/reference/rest/v3/liveBroadcasts/list — broadcastType param (all/event/persistent), scopes.
10. https://developers.google.com/youtube/data/live/reference/rest/v3/liveStreams — ingestionInfo fields, ingestionType rtmp/dash/hls, streamStatus enum, healthStatus/configurationIssues, isReusable, default-stream notes.
11. https://developers.google.com/youtube/data/live/guides/rtmps-ingestion — RTMPS: protocol rtmps, port 443, rtmpsIngestionAddress fields.
12. https://developers.google.com/youtube/v3/determine_quota_cost — live methods 1 unit each; liveChatMessages 5/20/20; 10,000/day combined default; midnight PT reset (cross-checked against local `research/platform-youtube-api-oauth-2026-10-24.md`, its table snapshot 2026-10-15).
13. Local: research/platform-youtube-api-oauth-2026-10-24.md — scope map (youtube / force-ssl), quota-bucket model (June 2026), chat costs, audit-before-quota-extension.
14. https://ffmpeg.org/ffmpeg.html — `-stream_loop` ("loop -1 means infinite loop"), `-re` ("read input at native frame rate"), `-c copy` ("not to be re-encoded").
15. https://ffmpeg.org/ffmpeg-formats.html — concat demuxer (ffconcat, same-streams constraint, safe option).
16. https://docs.github.com/en/actions/reference/limits — 6-hour GitHub-hosted job cap, 35-day workflow cap, concurrency table, included-compute-in-USD table (Free $12/mo).
17. https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features — Actions prohibited uses (server-strain + "unrelated to the production, testing, deployment, or publication").
18. https://docs.github.com/en/actions/managing-workflow-runs/downloading-workflow-artifacts — "By default, GitHub stores build logs and artifacts for 90 days."
19. https://github.blog/changelog/2026-08-27-actions-retention-will-cover-checks-workflow-runs-and-statuses — retention unification, 90-day public-repo max (fetched via search snippet; supports §6).
20. https://research.google.com/colaboratory/faq.html — 12 h free max runtime, 24 h Pro+, idle timeouts, interactive-compute priority, free-tier prohibitions.
21. https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm — 10 TB/mo free outbound, A1 2 OCPU/12 GB, E2.1.Micro 50 Mbps cap, idle-reclamation thresholds.
22. https://www.digitalocean.com/pricing — $4/mo entry, "starting at 500 GiB/mo" free transfer, $0.01/GiB overage.
23. https://www.hetzner.com/cloud/regular-performance/ — CPX02–CPX62 EU/US/SG pricing; EU 20 TB included traffic, extra ~€1.00/TB; CPX12 €11.99 excl. VAT.
24. https://onestream.live/pricing — plan table; "Run a 24-hour YouTube stream for only $30/month" add-on; 24-Hours Stream included only on Enterprise; 24 h per stream.
25. https://castr.com/pricing — playout loop mode only Premium ($199.99/mo, 15-day loop)/Ultra (30-day); pre-recorded stream counts per plan.
26. https://upstream.so/blog/what-is-rtmp-a-rtmp-youtube-com-live2 + reddit.com/r/youtube/comments/552f08 (SECONDARY, flagged) — a.rtmp/b.rtmp.youtube.com/live2 endpoint shape; primary authority for addresses is the API response [S10].
27. https://www.vultr.com/pricing / /products/cloud-compute/ — HTTP 403 on both fetches; Vultr figures NOT cited (UNVERIFIED).
28. https://restream.io/pricing — plan table, Business $239/8 channels, Upload & Stream FAQ, unlimited uploads only on Enterprise.
29. https://support.streamyard.com/hc/en-us/articles/360051856012 (via search snippet — SECONDARY, flagged) — 10 h/24 h per-broadcast caps.
30. https://switchboard.live — not fetched; Switchboard UNVERIFIED, excluded from the comparison numbers.
31. https://support.google.com/accounts/answer/3024190 — Google Takeout export including "YouTube and YouTube Music" uploads.
32. https://support.google.com/youtube/answer/2801973 — Spam & deceptive practices (clickbait item, automated mass-production item, strikes/termination rules).
33. https://support.google.com/youtube/answer/1311392 — YPP monetization policies; July 15, 2025 rename to "inauthentic content"; mass-produced/AI-template rules; reused-content carve-out.
