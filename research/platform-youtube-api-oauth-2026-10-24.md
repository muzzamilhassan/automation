# YouTube Data/Analytics API + OAuth — platform research 2026-10-24

Read-only research round for the v2 template-driven multi-tenant SaaS design (Studio OAuth connects, GitHub Actions publish lanes, channel dashboard fields, analytics surfaces, publish reliability). External claims cite official Google docs only (developers.google.com, support.google.com), all fetched **2026-10-24** unless marked otherwise. Quota numbers, scope requirements, and metric names changed materially in 2025–2026 — several facts that circulate in tutorials (videos.insert = 1600 units, Analytics CTR via reports.query, 1-week session expiry) are no longer documented or no longer true. FACT/RECOMMENDATION labels mark what is documented vs what is our design judgment.

---

## 0. TL;DR — verdict table (facts and gotchas that change product design)

| # | Finding | Verdict / design consequence |
|---|---|---|
| 1 | **Quota model changed twice.** Dec 4, 2025: video upload cost went from ~1600 units → ~100 units; June 1, 2026: granular buckets — `search.list` and `videos.insert` each get their own bucket with a **default of 100 calls/day each**, everything else shares **10,000 units/day combined** (FACT, [S1][S2][S4]) | Any design math or blog post based on "1600 per upload" or "search costs 100 units" is stale. Upload throughput is now capped at ~100 uploads/day **per project, not per channel** — the real multi-tenant bottleneck |
| 2 | **reports.query now requires `youtube.readonly`** in addition to the `yt-analytics.*` scopes — "Important: API requests to this method now require access to the `https://www.googleapis.com/auth/youtube.readonly` scope." (FACT, [S30]; note the scope table on the same page still lists only yt-analytics scopes — a docs inconsistency) | Studio onboarding must request `youtube.readonly` alongside `yt-analytics.readonly`, or analytics calls break |
| 3 | **`videos.insert` has no idempotency key and no dedup** — the reference documents no client-generated ID or dedup mechanism (FACT, [S6]) | Crash-after-upload-before-DB-write produces an untraceable orphan video; the resumable session URI is the only recovery token (§4) |
| 4 | **`videos.update` is destructive**: "this method will override the existing values for all of the mutable properties that are contained in any parts" — omitted mutable props are deleted; `snippet.title` and `snippet.categoryId` are mandatory when updating `snippet` (FACT, [S8]) | Scheduled-publish flow must do read-modify-write of the full resource, never blind patch |
| 5 | **`publishAt` rules**: only settable if video is private **and never published**; "If your request schedules a video to be published at some time in the past, the video will be published right away"; when setting via `videos.update` you must also set `privacyStatus=private` in the same request even if already private (FACT, [S5][S8]) | Scheduling is create-private + schedule, and any update that touches `status` must re-assert `private` |
| 6 | **Token lifetimes**: current docs no longer publish a fixed access-token duration ("Access tokens have limited lifetimes", `expires_in` governs — sample 3920s). Refresh tokens die on: user revocation, 6-month inactivity, password change (Gmail scopes), >100 live tokens per account per client, **and 7 days if the consent screen is in "Testing" status** (FACT, [S23][S24]) | Publishing the OAuth consent screen to **In production** is a launch blocker for Studio; token store must handle 100-token recycling and 6-month staleness |
| 7 | **YouTube scopes are NOT in Google's restricted-scope list** (restricted = Gmail, Drive, Fit, Chat, Data Portability, Photos Ambient, Health) — so no annual security assessment for our use; but YouTube runs its **own compliance audit** before quota extension (FACT, [S25][S26][S3]) | OAuth verification overhead is manageable; scaling uploads past 100/day per project requires the YouTube audit form, not Google's security assessment |
| 8 | **Thumbnail impressions/CTR are NOT documented for targeted reports.query** — current Analytics metrics reference defines no `impressions`/`clickThroughRate`; reach metrics (`video_thumbnail_impressions`, `video_thumbnail_impressions_ctr`) were added **Jan 15, 2026 only to bulk Reporting API reports** (FACT, [S31][S34][S39]) | Impressions/CTR in Studio must come from the Reporting API (48–72h delay, CSV) or creator-facing approximations — design dashboards around the lag |
| 9 | **Analytics data freshness is a documented 48–72h processing delay** (added to Data Model docs Sept 9, 2026); day-dimension queries return no rows for the most recent days; docs recommend the Data API `videos.list` for near-real-time stats (FACT, [S39][S29]) | "Today's views" in Studio = Data API `statistics.viewCount`; "yesterday's" = Analytics API |
| 10 | **View-count methodology changed**: Shorts count on play/replay start from Mar 26, 2025; since **Aug 24/27, 2026** all formats count the moment playback begins; legacy methodology preserved in a new `engagedViews` metric (FACT, [S4][S39]) | Analytics-vs-Studio discrepancies before/after these dates are expected; `engagedViews` is the comparable-to-history series |
| 11 | **`status.containsSyntheticMedia`** (added Oct 30, 2024) lets the owner disclose realistic altered/synthetic content at insert/update time (FACT, [S4][S5]) | Directly relevant to faceless/AI-assisted channels — template should set it deliberately, and policy requires user consent before publishing on their behalf (III.I.2, [S28]) |
| 12 | **Revocation cascade**: revoking one token via `oauth2.googleapis.com/revoke` invalidates the grant; "Revocation removes all OAuth 2.0 scopes previously granted to a project… invalidating any issued access or refresh tokens" (FACT, [S24]); Developer Policies require deleting that user's API data within 30 days (7 days if revoked in-app) (FACT, [S28]) | Studio needs a revocation webhook-style sweep: on `invalid_grant`, mark channel disconnected and purge/refresh cached data on schedule |
| 13 | **Don't use `search.list` for recent uploads** — docs explicitly: "To reliably retrieve a channel's most recently uploaded videos, do not use `search.list`"; use `playlistItems.list` on the uploads playlist (FACT, [S13]) | Reconciliation and dashboard "recent uploads" both read the uploads playlist, not search |
| 14 | **Analytics revenue metrics require monetary scope AND YouTube Partner Program membership** — "non-monetized channels return HTTP `403 Forbidden`" (FACT, [S32][S39]) | Only request `yt-analytics-monetary.readonly` for YPP clients; don't build revenue panels for non-partner channels |
| 15 | **Resumable session URIs have "a finite lifetime"** — no 1-week figure appears in current docs; expired URI → 404 and restart from byte 0 (FACT that it expires, [S20]; the "1 week" number is UNVERIFIED in current docs) | Upload worker must persist the session URI immediately and treat 404 as restart-with-orphan-check |

---

## 1. Data API + OAuth (§3.1)

### 1.1 OAuth flows and the exact scope map

Flow (FACT, [S24]): web-app pattern is the authorization-code flow — authorize at `https://accounts.google.com/o/oauth2/v2/auth` with `access_type=offline` (refresh token only returned when this is set), exchange code at `https://oauth2.googleapis.com/token`; refresh via `grant_type=refresh_token` (client_secret optional for some clients). Refresh exchange returns a fresh access token with `expires_in` (sample `3920` seconds ≈ 65 min — no fixed published duration; "Access tokens periodically expire and become invalid credentials"). On refresh failure (`invalid_grant`): "Authenticate the user again and ask for user consent to obtain new tokens."

Scope strings verbatim (FACT, [S22]):

| Scope string | Docs description |
|---|---|
| `https://www.googleapis.com/auth/youtube` | "Manage your YouTube account" |
| `https://www.googleapis.com/auth/youtube.force-ssl` | "See, edit, and permanently delete your YouTube videos, ratings, comments and captions" |
| `https://www.googleapis.com/auth/youtube.readonly` | "View your YouTube account" |
| `https://www.googleapis.com/auth/youtube.upload` | "Manage your YouTube videos" |
| `https://www.googleapis.com/auth/youtubepartner` | "View and manage your assets and associated content on YouTube" |
| `https://www.googleapis.com/auth/youtubepartner-channel-audit` | "View private information of your YouTube channel relevant during the audit process with a YouTube partner" (audit tokens "must be revoked when the MCN decides to accept or reject the channel or within two weeks", [S11]) |
| `https://www.googleapis.com/auth/yt-analytics.readonly` | "View YouTube Analytics reports for your YouTube content" |
| `https://www.googleapis.com/auth/yt-analytics-monetary.readonly` | "View monetary and non-monetary YouTube Analytics reports for your YouTube content" |

Method → required-scope mapping (FACT, quoted from each method page; all "at least one of"):

| Method | Required scopes |
|---|---|
| `videos.insert` | youtube.upload, youtube, youtubepartner, youtube.force-ssl [S6] |
| `videos.update` | youtubepartner, youtube, youtube.force-ssl — **`youtube.upload` is NOT accepted** [S8] |
| `thumbnails.set` | youtubepartner, youtube.upload, youtube, youtube.force-ssl [S14] |
| `channelBanners.insert` | youtube.upload, youtube, youtube.force-ssl [S17] |
| `channels.update` | youtubepartner, youtube, youtube.force-ssl [S12] |
| `channelSections.insert/update/delete` | youtubepartner, youtube, youtube.force-ssl [S16] |
| `watermarks.set` | youtubepartner, youtube.upload, youtube, youtube.force-ssl [S18] |
| `captions.insert` | **youtube.force-ssl, youtubepartner only** — plain `youtube` is NOT accepted [S19] |
| `playlistItems.insert` | youtubepartner, youtube, youtube.force-ssl [S15] |
| `reports.query` (Analytics) | yt-analytics.readonly, yt-analytics-monetary.readonly (revenue), plus the new top-of-page notice requiring `youtube.readonly` [S29][S30] |
| `channels.list` `auditDetails` | youtubepartner-channel-audit only [S11] |

Gotcha for Studio onboarding (FACT synthesis of the table above): `youtube.upload` alone covers insert + thumbnail + banner, but **not** metadata updates, playlists, captions, or channel branding. The smallest set that covers all Data API writes plus captions is `youtube.force-ssl` (it appears in every write list including `videos.insert` and `captions.insert`). Recommended Studio set (RECOMMENDATION): `youtube.force-ssl` + `youtube.readonly` (Analytics notice) + `yt-analytics.readonly`, adding `yt-analytics-monetary.readonly` only for YPP channels.

### 1.2 API project setup: verification, audit, quota

- Google OAuth verification (FACT, [S25][S26][S27]): "Apps that request access to scopes categorized as sensitive or restricted must complete Google's OAuth app verification." The published restricted list is Gmail, Drive, Fit, Chat, Data Portability, Photos Ambient, Health — **no YouTube scope is on it**, so the restricted-scope requirements (annual security assessment by an empanelled assessor, annual re-verification) do not apply to us. The sensitive list is not published as a static page — the Cloud Console "indicate[s] categories automatically" when scopes are added (FACT [S25]; which YouTube scopes are "sensitive" = UNVERIFIED in public docs, but they demonstrably go through verification).
- Unverified/testing behavior (FACT, [S27][S23]): dev/testing/personal apps get the "unverified app" screen and a **100-user cap** ("Personal use apps… fewer than 100 users… may skip verification, though users see the 'unverified app' warning screen"). Consent screen in **Testing** status (external user type): "issued a refresh token expiring in 7 days" unless only name/email/profile scopes are requested ([S23]). → multi-tenant Studio must run the consent screen **In production** before client onboarding (RECOMMENDATION).
- YouTube-side compliance audit (FACT, [S3]): quota beyond default requires an audit first — "If you would like to request additional quota beyond the default allocation, you must first complete an audit." YouTube also runs periodic audits; a "change of control" (merger/sale) must be reported via the Change of Control Form. Forms: Audit and Quota Extension = `https://support.google.com/youtube/contact/yt_api_form`; Appeals = `.../yt_api_appeals`. Developer Policy III.D.3 adds that approved quota is restricted to the audited use case — a changed use case needs a resubmitted audit (FACT, [S28]).
- Default allocation (FACT, [S1][S2]): "Projects that enable the YouTube Data API have a default quota allocation of 100 `search.list` calls, 100 `videos.insert` calls, and 10,000 units per day combined for all other endpoints." Daily quotas reset at midnight Pacific Time. All requests — including invalid ones — cost at least 1 unit.
- Quota history (FACT, [S4] revision history): **Dec 4, 2025** — "a change in the quota cost of a video upload from approximately 1600 units to approximately 100 units"; **June 1, 2026** — granular quota rollout: `videos.insert` and `search.list` "will be charged to their own respective quota buckets." Also new: **June 3, 2026** `videos.batchGetStats` (1 unit, own 10k/day default).

### 1.3 Current quota cost table (FACT, [S2], page last updated 2026-10-15 UTC)

| Resource | list | insert | update | delete / other |
|---|---|---|---|---|
| videos | 1 | **own bucket: 100 calls/day, 1 unit each** | 50 | delete 50, rate 50, getRating 1, reportAbuse 50, batchGetStats 1 |
| search | **own bucket: 100 calls/day, 1 unit each** | — | — | — |
| channels | 1 | — | 50 | — |
| playlists / playlistItems | 1 | 50 | 50 | 50 |
| thumbnails | — | set: 50 (page says "approximately 50 units", [S14]) | — | — |
| channelSections | 1 | 50 | 50 | 50 |
| channelBanners | — | insert: 50 | — | — |
| watermarks | — | set 50 | — | unset 50 |
| captions | 50 | 400 | 450 | 50 |
| comments / commentThreads | 1 | 50 | 50 | 50 |
| liveChatMessages | 5 (streamList 5) | 20 | — | 20 |
| liveChatBans / liveChatModerators | 50 | 200 | — | 200 |
| subscriptions | 1 | 50 | — | 50 |
| i18n/guide/video categories, activities, members, superChatEvents | 1 | — | — | — |

Notes: each page of pagination costs the same as the first request; Live Streaming methods also draw from this quota; usage visible in the Cloud Console Quotas page ([S2]).

### 1.4 Uploads, processing, scheduling, thumbnails

**Resumable upload protocol** (FACT, [S20]):
1. POST to `https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=...` with the video resource JSON, `X-Upload-Content-Length`, `X-Upload-Content-Type` → `200 OK` with `Location` header = session URI. Save it.
2. PUT binary to the session URI with `Content-Range: bytes FIRST_BYTE-LAST_BYTE/TOTAL_LENGTH`. "FIRST_BYTE must be exactly one greater than the last byte in the `Range` header. Overlapping or skipping bytes is prohibited."
3. On interruption/`500/502/503/504`: PUT an empty body with `Content-Range: bytes */CONTENT_LENGTH` → `308 Resume Incomplete` + `Range` header of bytes received (omitted if none) + optional `Retry-After`. Backoff exponentially. Final success = `201 Created` whose body **is the new video resource (with its `id`)**.
4. Chunked mode (discouraged): chunks must be multiples of 256 KB except the last, all non-final chunks same size, each answered by `308`.
5. Session URI: "each resumable session URI has a finite lifetime and eventually expires"; expired → `404 Not Found` and a brand-new session must start from byte zero. The historical "~1 week" validity is **not stated in current docs** — UNVERIFIED.
6. Hard cap: maximum file size 256 GB (FACT, [S6]).

**Processing and status lifecycle** (FACT, [S5]):
- `status.uploadStatus`: `deleted`, `failed`, `processed`, `rejected`, `uploaded`.
- `status.failureReason` (only when failed): `codec`, `conversion`, `emptyFile`, `invalidFile`, `tooSmall`, `uploadAborted`.
- `status.rejectionReason` (only when rejected): `claim`, `copyright`, `duplicate`, `inappropriate`, `legal`, `length`, `termsOfUse`, `trademark`, `uploaderAccountClosed`, `uploaderAccountSuspended`. **`duplicateUpload` does not exist**; the enum value is `duplicate`. This is the platform-level duplicate-content rejection surface.
- `processingDetails.processingStatus` (owner-only part): `failed`, `processing`, `succeeded`, `terminated` ("Processing information is no longer available").

**Failure/error modes at insert** (FACT, [S6][S2]): `uploadLimitExceeded` — "The user has exceeded the number of videos they may upload" (a per-user/channel cap exists; its numeric value is not documented — UNVERIFIED). `quotaExceeded` is **not** listed in the current `videos.insert` error table; project-level bucket exhaustion is the documented quota mechanism (the old `quotaExceeded` string still appears for some resources elsewhere; for insert, treat quota/bucket failures as 403-class and retry after midnight PT — RECOMMENDATION). Policy side: uploads must be user-consented — clients must not "automate or trigger views, uploads, comments, likes, dislikes, or other actions" without the user's "prior specific and express consent" (Developer Policy III.I.2, FACT [S28]).

**Scheduling (`publishAt`)** (FACT, [S5][S8]):
- "The date and time when the video is scheduled to publish." Settable only "if the video's privacy status is private and the video has never been published."
- "If your request schedules a video to be published at some time in the past, the video will be published right away."
- Update rule: "If you set a value for this property, you must also set the status.privacyStatus property to private" — and the update page stresses this applies "even if the video is already private."
- Format "ISO 8601"; the docs do not state timezone handling beyond ISO 8601 (values are conventionally UTC-offset datetimes — UNVERIFIED; store and send UTC).
- Settable-at-insert properties (FACT, [S6]): `snippet.title/description/tags/categoryId/defaultLanguage`, `localizations`, `status.embeddable/license/privacyStatus/publicStatsViewable/publishAt/selfDeclaredMadeForKids/containsSyntheticMedia`, `recordingDetails.recordingDate`. `statistics` is never settable.
- Content limits: title ≤ 100 chars; description ≤ 5000 bytes; tags total ≤ 500 chars (FACT, [S5]).

**Thumbnails** (FACT, [S14][S4]): `thumbnails.set` ≈ 50 units; max file 50 MB (raised from 2 MB on Sept 11/14, 2026); `image/jpeg`, `image/png`; errors `invalidImage`, `mediaBodyRequired`, `forbidden` (not owner, or channel lacks custom-thumbnail permission), `videoNotFound`, and `uploadRateLimitExceeded` 429 — "The channel has uploaded too many thumbnails recently." **No documented timing constraint** tying thumbnail set to processing state — the folklore "must wait until processed" is not in the docs. `contentDetails.hasCustomThumbnail` "is only visible to the video uploader" ([S5]).

**Tokens and revocation** (FACT, [S23][S24]):
- Refresh-token death causes (verbatim list): user revoked access; "The refresh token has not been used for six months"; user password change with Gmail scopes; "The user account has exceeded a maximum number of granted (live) refresh tokens"; time-based access expired; admin policy (`admin_policy_enforced`); Google Cloud session-length policy (`invalid_grant` + `error_subtype`).
- Hard limit: "There is currently a limit of 100 refresh tokens per Google Account per OAuth 2.0 client ID" — "creating a new refresh token automatically invalidates the oldest refresh token without warning." (Directly relevant: a per-job `google.auth` flow that mints fresh tokens will eventually kill the stored token. Always reuse the stored refresh token — RECOMMENDATION.)
- 7-day testing-mode expiry (see §1.2).
- Revocation: POST `https://oauth2.googleapis.com/revoke`; revoking an access token also revokes its corresponding refresh token; success `200`, failure `400`; "Revocation removes all OAuth 2.0 scopes previously granted to a project… invalidating any issued access or refresh tokens for all clients registered under that project"; "Following a successful revocation response, it might take some time before the revocation has full effect."
- Post-revocation data duties (FACT, [S28]): delete API data within **7 calendar days** if revocation happened in-client, within **30 calendar days** if via Google's security page; clients "will need to periodically reconfirm that its authorization tokens are still valid" and delete data of users whose tokens can no longer be refreshed within 30 days.

### 1.5 API-editable vs view-only

Channel level (FACT, [S10][S12][S16][S17][S18]):
- **Editable**: `brandingSettings` (channel description ≤1000 chars, keywords ≤500, unsubscribedTrailer = own public/unlisted video ID, `channel.country` which syncs `snippet.country`, `image.bannerExternalUrl`), `invideoPromotion`, `localizations` — channels.update supports exactly these: "this method only supports updates to the `channel` resource's `brandingSettings`, `invideoPromotion`, and `localizations` objects"; one part per request. Channel sections/shelves: `channelSections.insert/update/delete` (max 10 shelves). Banner: 3-step flow (channelBanners.insert → get url → set `brandingSettings.image.bannerExternalUrl`; image ≥2048×1152 16:9, ≤6MB). Watermark: `watermarks.set`/`unset` (≤10MB; position deprecated — "Watermarks are always placed in the upper right corner"). `status.selfDeclaredMadeForKids` is owner-settable per the channel resource docs (though channels.update's supported-parts list doesn't mention it — docs tension; UNVERIFIED how it's set via API today).
- **View-only**: `snippet.title` (channel name), `snippet.customUrl` (handle/custom URL), `snippet.thumbnails` (avatar), `snippet.publishedAt`, all of `statistics` (viewCount, subscriberCount, videoCount), `contentDetails.relatedPlaylists`, subscriber-hiding state.
- Video level: settable = snippet (title/description/tags/categoryId/defaultLanguage), status (privacy, publishAt, embeddable, license, publicStatsViewable, madeForKids, containsSyntheticMedia), localizations, recordingDate. View-only = statistics, player, contentDetails (duration/definition), processingDetails/fileDetails/suggestions (owner-only reads), topicDetails.

---

## 2. Channel dashboard field inventory (§3.2)

Legend: **Scope** = what an OAuth'd Studio session needs; **Public** = retrievable without the channel owner's token. Cadence/caching/fallback are RECOMMENDATIONS anchored on documented constraints (10k/day quota, 30-day retention rule [S28], 48–72h analytics lag [S39]).

| Field | API source (method + part) | Scope | Public vs owner | Editable via API? | Caching | Sync cadence | Fallback if unavailable |
|---|---|---|---|---|---|---|---|
| Channel ID | `channels.list` (id, mine=true / forHandle / id) | none for public | Public | No | permanent (immutable key) | once at connect | — |
| Channel name/title | `channels.list?part=snippet.title` | none | Public | **No** (snippet not in supported update parts) | 24h | daily | brandingSettings.channel.title (UNVERIFIED if still returned/settable) |
| Handle | `channels.list?forHandle=@x` resolves a handle; `snippet.customUrl` = "The channel's custom URL" (docs never say "handle" — the parameter is the handle surface) | none | Public | No | permanent-ish, verify on connect | at connect + monthly | show `customUrl` only if non-empty |
| Description | `snippet.description`; editable twin `brandingSettings.channel.description` (≤1000) | none to read; youtube/force-ssl to write | Public / owner-writable | Yes (brandingSettings only) | 24h | on edit | snippet.description |
| Profile image | `snippet.thumbnails` (avatar) | none | Public | No | cache URL, bust weekly | weekly | initials tile |
| Country | `snippet.country`; set via `brandingSettings.channel.country` ("Update this property to set the value of the `snippet.country` property") | youtube/force-ssl to write | Public / owner-writable | Yes | 30d | on edit | hide field |
| publishedAt (creation) | `snippet.publishedAt` | none | Public | No | permanent | once | hide |
| Subscriber count | `statistics.subscriberCount` — "This value is rounded down to three significant figures" (rounded since Sept 10, 2019, [S4]) | none | Public (hidden-able) | No | 6–24h | daily | `hiddenSubscriberCount`=true → show "Hidden" |
| Subscriber count hidden? | `statistics.hiddenSubscriberCount` — "Indicates whether the channel's subscriber count is publicly visible" | none | Public | No | with count | daily | — |
| Total views | `statistics.viewCount` — new counting methodology from Aug 24, 2026 (count on playback start, [S4][S10]) | none | Public | No | 6–24h | daily | sum of recent videos' views |
| Public video count | `statistics.videoCount` — "the value reflects the count of the channel's public videos only, even to owners" | none | Public | No | 24h | daily | count from uploads playlist |
| Banner | 3-step: `channelBanners.insert` (50u, ≥2048×1152, ≤6MB) → url → `channels.update` `brandingSettings.image.bannerExternalUrl` | youtube/force-ssl/upload | Read via brandingSettings (owner-authorized for writes; banner URL itself public) | Yes | 30d | on edit | hide banner block |
| Watermark (branding) | `watermarks.set`/`unset` (50u; ≤10MB; position fixed top-right) | youtube/force-ssl/upload/partner | Owner | Yes | n/a | on edit | — |
| Channel sections (shelves) | `channelSections.list/insert/update/delete` (1u / 50u; max 10; types incl. `recentUploads`, `popularUploads`, `singlePlaylist`, `multiplePlaylists`, `completedEvents`, `liveEvents`, `upcomingEvents`, `multipleChannels`, `subscriptions`, `allPlaylists`) | youtube/force-ssl/partner | Public | Yes | 7d | weekly | default layout |
| Trailer | `brandingSettings.channel.unsubscribedTrailer` (own public/unlisted video ID) | youtube/force-ssl | owner-writable, public effect | Yes | 7d | on edit | hide |
| Long-upload status | `status.longUploadsStatus` — "only returned if the channel owner authorized the API request" (`allowed/disallowed/eligible`) | youtube.readonly-class read | Owner-only | No | 7d | monthly | assume ≤15min |
| Made-for-kids status | `status.madeForKids` (current status), `status.selfDeclaredMadeForKids` | authorized | Owner (mFK flag public-adjacent) | partially (selfDeclared) | 30d | monthly | treat as unknown; policy III.E.4.j requires checking per embedded video |
| Authorization status | Studio-side (token validity); detect via refresh failures (`invalid_grant`) + policy duty to reconfirm every 30 days ([S28]) | n/a | n/a | n/a | in DB | on every job + 30d reconfirm sweep | "Reconnect required" UI state |
| Last sync | Studio-side field | n/a | n/a | n/a | in DB | every job | show stale badge >24h |
| Recent uploads | `channels.list?part=contentDetails` → `relatedPlaylists.uploads` → `playlistItems.list?playlistId=...` (1u/page, maxResults 0–50, default 5) — docs: "To reliably retrieve a channel's most recently uploaded videos, do not use `search.list`" | none for public items; owner token for private | Public items public; private items need owner token (see below) | items managed by YouTube (can't insert into uploads playlist: "you can't insert a video into your uploaded videos playlist", [S15]) | 5–15min | hourly | cache last good list |
| Upload status per video | `videos.list?part=status,processingDetails` — processingDetails/fileDetails/suggestions "are only available to that video's owner" | youtube/force-ssl/readonly + owner | Owner-only parts | No | poll during publish window | during 1h post-upload window | show "processing" default |
| Scheduled publications (`publishAt`) | Owner lists private+scheduled via: (a) `playlistItems.list` on uploads playlist with owner token; (b) `search.list?forMine=true&type=video` (authorized; 100/day bucket — expensive, last resort); (c) `videos.list?id=...` for known IDs. Docs do **not** explicitly state that uploads-playlist listing returns private items for the owner (UNVERIFIED — (a) is the observed/community pattern; (c) is implied by owner-only parts); scheduled publishAt values are visible only in owner-authorized reads | owner token | Owner-only | publishAt via videos.update (with privacy=private re-assert) | poll during schedule window | 15min for scheduled lanes | "Scheduled" badge from Studio DB |
| Statistics per video | `videos.list?part=statistics` (1u) or `videos.batchGetStats` (1u, returns per-video stats + failedVideoIds summary; added June 3, 2026, [S9][S4]) | none (public stats); owner token for private videos | Public (if publicStatsViewable; "viewcount and ratings will still be publicly visible even if this property's value is set to false") | No | 6h | 2–6h | Analytics API (48–72h lag) |
| Description/tags defaults | `snippet.defaultLanguage`, `defaultAudioLanguage` ("language spoken in the video's default audio track") | owner | Owner-writable | Yes | per video | — | — |

Non-obvious inventory facts worth engineering into Studio: subscriber counts are 3-significant-figure rounded *even for the owner*; `videoCount` excludes private videos *even for the owner*; `longUploadsStatus` and `madeForKids` require owner authorization; the uploads playlist is system-managed (no manual inserts); `search.list` is both rate-limited (100/day) and explicitly unreliable for recency — everything dashboard-ish should hang off `playlistItems.list` + `videos.list`.

---

## 3. YouTube Analytics API (§16)

Scopes (FACT, [S29]): all Analytics API requests are authorized; `yt-analytics.readonly` ("user activity metrics, like view counts and rating counts"), `yt-analytics-monetary.readonly` (adds "estimated revenue and ad performance metrics"), `youtube`/`youtubepartner` only for groups/group-items management. Plus the reports.query notice: "API requests to this method now require access to the `https://www.googleapis.com/auth/youtube.readonly` scope" ([S30] — top-of-page "Important" notice; conflicts with the page's own scope table; treat `youtube.readonly` as required).

ids syntax (FACT, [S30]): `ids=channel==MINE` (the currently authenticated user's channel) or `channel==CHANNEL_ID` for an authorized channel, or `contentOwner==OWNER_NAME` for CMS partners.

Metric availability table (FACT unless noted; sources [S29][S30][S31][S32][S33][S34][S39]):

| Metric | Method + dimensions/filters | Scope | Availability conditions |
|---|---|---|---|
| views | reports.query; dims: day/month/country etc. | yt-analytics.readonly (+youtube.readonly per notice) | Core metric. Redefined for Shorts Mar 26, 2025 (count on play/replay start, no minimum watch time); extended to all formats Aug 2026; `engagedViews` preserves legacy methodology |
| estimatedMinutesWatched | reports.query; `day`, video/playlist filters | yt-analytics.readonly | Core metric; the canonical watch-time measure |
| averageViewDuration (seconds) / averageViewPercentage | reports.query | yt-analytics.readonly | "As of December 13, 2021… excludes looping clips traffic" |
| Audience retention — audienceWatchRatio | reports.query; **required dimension `elapsedVideoTimeRatio`, required filter `video=<id>`** (single video, no comma lists) | yt-analytics.readonly | Video-scoped only; values can exceed 1 (rewatched segments). Since May 6, 2024 reports also expose `startedWatching`, `stoppedWatching`, `totalSegmentImpressions`, and `relativeRetentionPerformance` |
| subscribersGained / subscribersLost | reports.query; channel totals or `video` filter | yt-analytics.readonly | With the video filter, "will only include statistics from the specified video's watch page" (subscribes from elsewhere not attributed) |
| Traffic sources | reports.query; required dimension `insightTrafficSourceType`, detail level adds `insightTrafficSourceDetail` (filter required) | yt-analytics.readonly | Detail reports "only supported for specific traffic sources"; **hard cap: "returns an error if the product of # of queried videos X # of days in date range exceeds 50,000"** (Nov 15, 2024). Enum values (verbatim, [S33]): ADVERTISING, ANNOTATION, CAMPAIGN_CARD, END_SCREEN, EXT_URL ("includes referrals from Google Search results"), NO_LINK_EMBEDDED, NOTIFICATION, PLAYLIST, PROMOTED, SUBSCRIBER, VIDEO_REMIXES ("from the remixed video link in the Shorts player"), YT_CHANNEL, YT_OTHER_PAGE, YT_SEARCH, plus HASHTAGS, LIVE_REDIRECT, NO_LINK_OTHER, PRODUCT_PAGE, RELATED_VIDEO, SHORTS, SOUND_PAGE, WATCH_WITH |
| Thumbnail impressions / CTR | **Bulk Reporting API only**: reach reports `channel_reach_basic_a1` / `channel_reach_combined_a1` (dims date, channel_id, video_id [+ traffic_source_type/detail, operating_system, device_type]) — added Jan 15, 2026 | same scopes (bulk jobs use the same authorization model) | NOT documented as targeted reports.query metrics (current metrics reference defines neither `impressions`, `clickThroughRate`, nor `videoThumbnailImpressions` [S31]); docs: "Reach reports provide statistics for video thumbnail impressions and click-through rates" [S36]. Counted surfaces & rules (creator-facing [S40]): thumbnail "shown for more than 1 second and at least 50%… visible", counted on Home/Search/Up Next/feeds/playlists across apps+web; NOT counted on external embeds, mobile web, Kids/Music apps, cards/end screens, background tabs |
| estimatedRevenue / estimatedAdRevenue / grossRevenue / cpm (formerly `impressionBasedCpm`) / playbackBasedCpm / monetizedPlaybacks / adImpressions (formerly `impressions`) | reports.query channel reports | **yt-analytics-monetary.readonly + channel must be YPP member** — "non-monetized channels return HTTP `403 Forbidden`" [S32][S39] | "subject to month-end adjustment and don't include partner-sold and partner-served advertising" (estimatedRevenue); monetizedPlaybacks "expected estimated error… ±2.0%" |
| uniques | reports.query (noted as Analytics-API-only in the naming table) | yt-analytics.readonly | Definition not on current metrics page — UNVERIFIED detail |
| Likes/comments/shares/playlistStarts/savesAdded/cards | reports.query | yt-analytics.readonly | Cards metrics distinct from thumbnail CTR |

**Data freshness** (FACT): Data Model docs now document "the 48 to 72 hour data processing delay" plus end-date truncation to the last fully processed day, with the recommendation to use Data API `videos.list` for near-real-time stats (revision entry Sept 9, 2026, [S39]). reports.query: "The response for a query with the `day` dimension will not contain rows for the most recent days," and queries return "data up until the last day for which all metrics in the query are available" — mixed-latency metric sets truncate to the slowest ([S29]). Bulk reports: retrievable within 48 hours of job creation, "updated daily," each covers 12:00 AM–11:59 PM Pacific; reports downloadable for **60 days** (30 days for historical/backfill reports) ([S37]). Estimated revenue is additionally revised at month-end ([S31]).

**Analytics API quota**: the current Analytics API reference does not publish a units-per-day number (the only quota mention is that `quotaUser` is unsupported in v2) — UNVERIFIED; verify the project's quota in the Cloud Console before designing high-frequency polling. Known hard constraint: the 50,000 videos×days traffic-source cap ([S32]).

**Data API vs Analytics API split** (FACT + RECOMMENDATION): Data API `videos.list statistics` (1 unit) gives free, near-real-time public view/like/comment counts and works for any channel; Analytics API gives watch time, retention curves, subscriber deltas, traffic sources, impressions (bulk), and revenue — but only for channels that granted `yt-analytics.readonly`(+monetary), with 48–72h lag and (for revenue) YPP membership. Design rule: dashboard "live" tiles from Data API; trend/retention/revenue panels from Analytics API with visible "data through <date-2>" stamps (RECOMMENDATION).

---

## 4. Reliable publishing (§13.4)

### 4.1 Resumable upload mechanics (FACT, [S20][S21][S6])
Session-initiate POST → save `Location` URI → PUT bytes with Content-Range → `201 Created` (body = video resource incl. id) | `308` resume | 5xx → exponential backoff (official sample: max 10 retries, sleeps capped at `2 ** retry` seconds, retriable codes 500/502/503/504) → status probe `PUT` with `Content-Range: bytes */N` returns `308` + `Range` of received bytes (absent Range = nothing received) → resume at last-byte+1, no overlap/skip allowed. Max file 256 GB. Chunked mode: 256 KB multiples. Session URI expiry: "finite lifetime" → 404 on expiry, restart from zero (the old "1 week" figure is UNVERIFIED).

### 4.2 Idempotency: there is none at the API layer
FACT: `videos.insert` documents no idempotency key, no client-generated ID, no dedup parameter ([S6]); the only platform dedup signals are post-hoc: `status.rejectionReason=duplicate` (rejection, after upload) and nothing else. The resumable **session URI is the de facto idempotency token**: the same initiated session can be probed (`bytes */N`) and continued after process death, instead of re-inserting.

**Orphan reconciliation pattern** (RECOMMENDATION, built on documented primitives):
1. Before initiating: write an upload-intent row (channel, file hash, title, publishAt, session URI once issued, state).
2. Persist the video `id` to the intent row **immediately** when the `201` arrives — the gap between upload completion and this DB write is the orphan window.
3. Crash recovery: first resume/probe the stored session URI; if `201` comes back (upload had completed server-side), harvest the id — no new insert.
4. If the session URI is gone/expired (404): before re-inserting, detect orphans by listing the channel's uploads playlist via `playlistItems.list` (documented as the reliable recency source, [S13]) filtered to the intent window, and/or `videos.list?id=` for candidates matched by exact title — then reuse or retire.
5. A second insert after a successful-but-unrecorded one yields two live videos with no API-level dedup; only manual or title-matched cleanup can remove the extra (`videos.delete`, 50 units).

### 4.3 Processing-failure detection
Poll `videos.list?part=status,processingDetails` (owner-only parts, 1 unit) until terminal states: `processingStatus` ∈ {succeeded, failed, terminated} and `uploadStatus` ∈ {processed, rejected, failed, deleted}. On `failed` read `failureReason` (codec/conversion/emptyFile/invalidFile/tooSmall/uploadAborted); on `rejected` read `rejectionReason` (incl. `duplicate`, `copyright`, `length`, `termsOfUse`, `uploaderAccountSuspended`). Poll within the publish window only (RECOMMENDATION: t+2, t+10, t+30 min, then hourly until terminal) to respect the 10k/day shared budget. `terminated` means the info is no longer available — treat as "assume processed if uploadStatus=processed".

### 4.4 Per-channel serialization rationale (FACTS → RECOMMENDATION)
- Quota is **per project**, not per tenant: 100 uploads/day and 100 searches/day per project, 10k units/day shared across every client channel's reads/writes ([S1][S2]). Unserialized per-channel workers will contend and starve each other near the cap.
- Token refresh is stateful per account+client: 100-refresh-token recycling limit, and concurrent refreshes racing on one stored refresh token can burn validity (invalid_grant → forced reconnect) ([S23][S24]). One writer per channel (per connected channel, a single in-flight token-mutex) prevents both races.
- `uploadLimitExceeded` is per user ("the number of videos they may upload") — a runaway lane can exhaust the *client's* channel-level upload allowance, blocking their manual uploads too ([S6]).
- Design: a per-channel job queue with a global upload semaphore sized to the project bucket (≤100/day minus safety margin), and a per-account token refresh lock (RECOMMENDATION).

### 4.5 Reconciliation-after-crash design (RECOMMENDATION)
Boot-time and per-run reconciliation sweep: (1) resume or retire all non-terminal session URIs; (2) diff Studio DB "published video ids" against `playlistItems.list` on the uploads playlist (paginated, 1 unit/page); (3) for scheduled lanes, `videos.list?id=` the scheduled ids and verify `status.privacyStatus=private` + `snippet.publishAt` intact — remember any `videos.update` touching status must re-send `privacyStatus=private`; (4) mark orphans found in (2) that have no intent row for takedown decisioning. All of this hangs off playlistItems/videos.list — never `search.list` ([S13]).

### 4.6 Policy constraints that shape reliability work (FACT, [S28])
Retention: analytics/reporting-derived data may be kept beyond 30 days only while "verify[ing] every 30 days that it is still authorized by the user" and the video still exists; other authorized data ≤ 30 days; deletion on request "as soon as possible and within 7 calendar days"; in-app revocation → revoke token programmatically + delete data within 7 days; Google-page revocation → 30 days. Publishing actions require the user's "prior specific and express consent" (III.I.2). Privacy/visibility of anything published "cannot be changed without express user instruction" (III.E.3.f). These turn "delete on revoke" and "sync cadence" into compliance requirements, not just hygiene.

---

## Risks / gaps (UNVERIFIED or unstable)

- **Analytics API quota number**: not published in current docs — check Cloud Console per project. Do not hard-code an assumed value.
- **Resumable session lifetime**: expiry documented, the "~1 week" figure is not (anymore).
- **Private-video visibility in the uploads playlist for the owner**: the core of the scheduled-posts dashboard is supported by community-consistent behavior, but no current doc sentence states it; the documented guarantees are owner-only parts via `videos.list` and `forMine` search. Ship behind a fallback that also matches by `videos.list?id=`.
- **`youtube.readonly` notice vs scope table on reports.query**: contradictory docs on the same page; safest to request the scope.
- **`channels.update` × `status.selfDeclaredMadeForKids`**: channel resource implies settable; update method's supported-parts list says brandingSettings/invideoPromotion/localizations only.
- **Channel-level daily upload cap**: existence proven by `uploadLimitExceeded`, value undocumented.
- **Sensitive-scope list**: not published as a static page; Cloud Console auto-categorizes at scope-add time.
- **Moving targets**: view-count methodology (Aug 2026 change just landed), thumbnail size limits (raised Sept 2026), quota buckets (June 2026) — re-verify quarterly; revision history is the cheap way ([S4][S39]).

## Open questions

1. Does the quota extension audit form accept per-tenant projections (our 100/day upload cap × client count) — i.e., can multi-tenant SaaS get per-project buckets raised for pipeline + Studio simultaneously? (Ask via the audit form.)
2. Are `videoThumbnailImpressions`/`videoThumbnailImpressionsClickRate` accepted by reports.query despite not being on the metrics page (undocumented), or bulk-only? Cheap to test with a token'd query before building the impressions panel.
3. Do we need `youtubepartner` anywhere in v2? Only if we operate CMS/content-owner features (`onBehalfOfContentOwner`) — likely NOT for client-owned channels (RECOMMENDATION: skip it; it widens audit surface).
4. Service accounts are not a path for YouTube user-scope actions (YouTube OAuth relies on user consent; service-account data-access exemptions target "its own data… not user data" [S27]) — confirm we never try to schedule uploads via service account.

## Sources (all fetched 2026-10-24)

1. https://developers.google.com/youtube/v3/getting-started — default quota allocation (100 search.list, 100 videos.insert, 10k units combined), audit nav.
2. https://developers.google.com/youtube/v3/determine_quota_cost — full cost table, bucket rules, midnight PT reset (page "Last updated 2026-10-15 UTC").
3. https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits — audit-before-quota-extension, periodic audits, change-of-control, form URLs.
4. https://developers.google.com/youtube/v3/revision_history — Dec 4 2025 upload cost 1600→100; June 1 2026 granular buckets; Jan 31 2024 forHandle; Aug 27 2026 view counting; Oct 30 2024 containsSyntheticMedia; Sept 11/14 2026 thumbnail 50MB; Sept 10 2019 subscriber rounding; June 3 2026 batchGetStats; Mar 13 2024 captions sync deprecation.
5. https://developers.google.com/youtube/v3/docs/videos — publishAt, uploadStatus/failureReason/rejectionReason enums, processingStatus, title/description/tags limits, statistics definitions, hasCustomThumbnail, publicStatsViewable, containsSyntheticMedia, defaultAudioLanguage.
6. https://developers.google.com/youtube/v3/docs/videos/insert — scopes, 256GB cap, uploadLimitExceeded, settable properties, part list.
7. https://developers.google.com/youtube/v3/docs/videos/list — 1 unit, owner-only parts note, chart=myRating, 1000-video result cap.
8. https://developers.google.com/youtube/v3/docs/videos/update — destructive update warnings, publishAt+private rule, scopes.
9. https://developers.google.com/youtube/v3/docs/videos/batchGetStats — new batch stats method, 1 unit, summary object.
10. https://developers.google.com/youtube/v3/docs/channels — customUrl, statistics (rounding, videoCount public-only), uploads playlist, brandingSettings, status parts.
11. https://developers.google.com/youtube/v3/docs/channels/list — 1 unit, forHandle/@, auditDetails + youtubepartner-channel-audit scope + 2-week revocation rule.
12. https://developers.google.com/youtube/v3/docs/channels/update — 50 units, supported parts (brandingSettings/invideoPromotion/localizations), scopes.
13. https://developers.google.com/youtube/v3/docs/search/list — 100/day bucket, forMine rules, "do not use search.list" recency guidance, maxResults.
14. https://developers.google.com/youtube/v3/docs/thumbnails/set — ~50 units, 50MB, error table incl. uploadRateLimitExceeded, scopes.
15. https://developers.google.com/youtube/v3/docs/playlistItems (+ /list, /insert) — costs, required body props, "can't insert into uploads playlist", maxResults default 5.
16. https://developers.google.com/youtube/v3/docs/channelSections (+ /insert) — 10-shelf cap, section type enum, 50 units, scopes.
17. https://developers.google.com/youtube/v3/docs/channelBanners/insert — 3-step banner flow, 2048×1152 16:9 ≤6MB, 50 units, scopes.
18. https://developers.google.com/youtube/v3/docs/watermarks/set — 50 units, 10MB, timing rules, position deprecated.
19. https://developers.google.com/youtube/v3/docs/captions/insert — 400 units, force-ssl/partner-only scopes, sync parameter deprecated.
20. https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol — protocol steps, 308/Range/Retry-After, 256KB chunks, session finite lifetime, 404 on expiry.
21. https://developers.google.com/youtube/v3/guides/uploading_a_video — official sample with resumable backoff (MAX_RETRIES=10).
22. https://developers.google.com/identity/protocols/oauth2/scopes — verbatim scope strings + descriptions (YouTube + Analytics sections).
23. https://developers.google.com/identity/protocols/oauth2 — refresh-token expiration causes, 7-day Testing rule, 100-token limit, "limited lifetimes".
24. https://developers.google.com/identity/protocols/oauth2/web-server — expires_in semantics, token endpoint, revocation endpoint + cascade + 200/400, invalid_grant guidance.
25. https://support.google.com/cloud/answer/13463073 — verification requirement for sensitive/restricted, console auto-categorization, annual re-verification.
26. https://support.google.com/cloud/answer/13464325 — restricted-scope list (Gmail/Drive/Fit/Chat/DataPortability/PhotosAmbient/Health; no YouTube scopes).
27. https://support.google.com/cloud/answer/13464323 — unverified-app screen + 100-user cap; service-accounts "own data" exemption.
28. https://developers.google.com/youtube/terms/developer-policies — III.E.4 data retention (30d/7d rules), III.D.2.c revocation duties, III.D.3 audit/quota, III.I.2 automation consent, III.F.2 branding attribution.
29. https://developers.google.com/youtube/analytics/reference — scopes, ids syntax, day-dimension truncation, last-available-day rule.
30. https://developers.google.com/youtube/analytics/reference/reports/query — "Important" youtube.readonly notice, sort rules, startIndex default.
31. https://developers.google.com/youtube/analytics/metrics (+ https://developers.google.com/youtube/analytics/v1/dimsmets/mets) — metric definitions; no thumbnail-impression metrics defined; looping-clips exclusions; month-end adjustment.
32. https://developers.google.com/youtube/analytics/channel_reports — audience retention report, traffic-source reports + 50,000 cap, revenue/YPP/403 rules.
33. https://developers.google.com/youtube/analytics/v1/dimsmets/dims — insightTrafficSourceType verbatim values/descriptions.
34. https://developers.google.com/youtube/analytics/v1/dimsmets/dimsmets — Analytics↔Reporting naming map incl. videoThumbnailImpressions/CTR.
35. https://developers.google.com/youtube/analytics — API overview, text vs integer enumeration note.
36. https://developers.google.com/youtube/reporting — bulk vs targeted positioning, daily generated reports, reach reports bulk-only.
37. https://developers.google.com/youtube/reporting/v1/reports — 48h job availability, 60-day download window (30d historical), backfill, Pacific day boundaries.
38. https://developers.google.com/youtube/reporting/v1/reports/channel_reports — channel_reach_basic_a1/combined report definitions.
39. https://developers.google.com/youtube/reporting/revision_history — Sept 9 2026 freshness SLA (48–72h) + YPP 403 clarification; Jan 15 2026 reach reports; Mar/Jun 2025 Shorts view changes + engagedViews; May 6 2024 retention metrics; Nov 15 2024 50k cap.
40. https://support.google.com/youtube/answer/9314486 — impression counting rule (>1s, ≥50% visible), counted/non-counted surfaces.
