# YouTube policy & compliance — platform research 2026-10-24

Read-only research round for the v2 policy-aware dashboard (Studio, multi-tenant OAuth channels). Answers four questions: (1) which monetization/content policies actually exist, with effective dates and enforcement level; (2) the owner's specific question — name/handle change rules and whether any of it is API-checkable; (3) classification of each proposed dashboard check by how it can be verified; (4) warning architecture (severities, fields, hard-block vs advisory, pipeline stages). **Method: every policy claim below was fetched from official Google/YouTube pages on 2026-10-24 and quoted verbatim.** Secondary sources are labeled SECONDARY. FACT vs RECOMMENDATION is marked. No code was changed for this research.

---

## 0. TL;DR verdicts

| # | Question | Verdict | One line |
|---|---|---|---|
| 1 | Does using AI disqualify monetization? | **NO (official)** | YouTube officially says "Disclosing AI content alone won't limit a video's audience or impact its eligibility to earn money" — what's banned is *mass-produced, templated, inauthentic* output, not AI as a tool [S4][S5][S6]. |
| 2 | Owner Q: channel NAME change — waiting period? | **No official published rule** | No current Help article states a name-change frequency limit; the "twice within 14 days" rule is officially documented for HANDLES only (§2). A 14-day rule for names exists only via TeamYouTube/community reports — SECONDARY [S17][S38]. |
| 3 | Owner Q: HANDLE change — waiting period? | **YES — official, verbatim** | "You can change your handle twice within a 14-day period"; previous handle held 14 days, then released to anyone [S17]. |
| 4 | Owner Q: does name/handle change trigger re-review or affect monetization? | **No official statement exists** | Neither the handle articles, custom-URL page, nor monetization pages mention any re-review — the honest dashboard answer is "no rule found," never an invented one (§2). |
| 5 | Is name/handle state checkable via API? | **Read-diff only; not changeable** | `snippet.title`/`snippet.customUrl` diffs detect changes between syncs; `channels.update` *forbids* title changes (`channelTitleUpdateForbidden`) and there is no handle API (§3). |
| 6 | Feb 2027 YPP changes real? | **YES — verified** | Blog 2026-08-10: new ads/Premium entrants need 8,000 watch hrs/365d **or** 20M Shorts views/90d; Shorts revenue sharing gated at 10M Shorts views/90d; "This update won't impact creators already in YPP" [S1][S3]. |
| 7 | "Inauthentic content" rename still current? | **YES** | Support page carries the July 15, 2025 banner verbatim; adds explicit AI-template example (§1.2) [S4]. |
| 8 | Can the dashboard see strikes/YPP/monetization? | **Almost never directly** | No strikes, strike details, or monetization fields in the Data API. One real YPP probe exists: monetary Analytics metrics return **403 Forbidden for non-YPP channels** (§3) [S23][S29]. |
| 9 | Hard-block on policy heuristics? | **NO — RECOMMENDATION** | Block publishing only on verified technical constraints (401/403, quota, `uploadLimitExceeded`, `uploadStatus=rejected`); everything policy-level is advisory with citations (§4). |

---

## 1. Monetization & content policies

### 1.1 YPP eligibility + the Feb 1, 2027 changes — FACT

**Current thresholds** (fetched 2026-10-24, [S1], [S2]):

| Tier | Thresholds (verbatim) | Unlocks |
|---|---|---|
| Expanded / early tier | "Get 500 subscribers with 3 valid public uploads in the last 90 days" + "3,000 qualified watch hours in the last 12 months" or "3 million qualified Shorts views in the last 90 days" | Fan funding + Shopping only (memberships, Super Chat/Stickers/Thanks, Jewels, Shopping) |
| Full monetization | "1,000 subscribers with 4,000 qualified watch hours in the last 12 months, or" "1,000 subscribers with 10 million qualified Shorts views in the last 90 days" | Ad + Premium revenue sharing |

**Account-level requirements (all verbatim from [S1]):** "Follow the YouTube channel monetization policies"; reside in an available country; "Have no active Community Guidelines strikes on your channel"; "Make sure 2-Step Verification is turned on"; "Have advanced features access on YouTube"; "Have one active AdSense for YouTube account linked to your channel". Decision "typically in about a month"; rejected applicants re-apply after 30 days (90 days for repeat rejections); channels inactive 6+ months "can lose monetization". (Shorts-feed watch hours don't count toward the 4,000-hour path.)

**Effective Feb 1, 2027** (blog post "New opportunities to earn and changes to the YouTube Partner Program", published **2026-08-10**, [S3]; echoed on [S1] and [S12]):
- New ads/Premium applicants: "New creators applying for YPP will need 8,000 qualified watch hours in the last 365 days" **or** "20 million qualified Shorts views in the last 90 days". **The blog post states no subscriber minimum anywhere for these new thresholds** — whether 1,000 subs survives is not yet stated on official pages (support pages still show the old thresholds). Search-result summaries claiming "1,000 subs + 8,000 hours" are SECONDARY interpretation — do not hardcode.
- Shorts revenue sharing gate: "Beginning February 1, 2027, creators who have 10 million qualified Shorts views over the last 90 days" — "will be eligible for ads and subscription revenue sharing on Shorts". Channels that dip below: "remain in YPP and continue earning on long-form content, with Shorts revenue sharing automatically resuming once they cross 10 million views again."
- Grandfathering, verbatim: "This update won't impact creators already in YPP." "The entry thresholds for our Fan Funding and shopping products remain unchanged."
- Premium Lite expansion: pools of "30% of the net subscription revenue for Premium and 60% for Premium Lite", shared by watch time/views at "55% for long-form videos and 45% for Shorts".
- New incentive programs (Shopping bonuses, brand-deal incentives, trend earnings boosts) for channels below the Shorts threshold.
- Mechanics: creators must "review and accept the updated terms in YouTube Studio by January 31, 2027" [S1][S3]. "Qualified" hours/views are **not defined** in the blog post (links elsewhere) — UNVERIFIED whether the definition changes.

### 1.2 "Inauthentic content" (the template-channel killer) — FACT

Source [S4] (`channel monetization policies`, answer/1311392), banner verbatim on page: "July 15, 2025: We're making a minor update to our 'repetitious content' policy to better clarify this includes content that is repetitive or mass-produced… We are also renaming this policy from 'repetitious content' to 'inauthentic content.'… This type of content has always been ineligible for monetization under our existing policies", and "no change to our reused content policy".

**Current wording (verbatim):** content that "looks like it's made with a template, or that may feel repetitive to viewers after watching several videos in a row"; the originality standard requires content "Not be mass-produced, generic, repetitive, or manipulative" and, if borrowed, "change it significantly to make it your own".

**Not allowed (page says list is "not exhaustive"):**
- "Similar or repetitive content with low educational value, commentary, narratives, or minimal variation across videos"
- "Characters are put in the same situation over and over again with the same outcome"
- "Image slideshows, templated storylines, or scrolling text with minimal or no narrative, commentary, or educational value"
- **"AI-generated content made with generic or unoriginal templates giving the impression of mass production"** lacking "original, authentic insights or perspective" ← the exact clause that governs this repo's template factories

**Allowed:** "Same intro and outro for your videos, but the bulk of your content is different"; series/review channels where "each video has a distinct storyline, focus, or concept".

Adjacent "Unsatisfying or Off-putting Content" section: allowed = content expressing "your unique creative voice, like using AI to visualize a unique character and narrative you invented", or AI for "a unique, well-researched, or creative narrative"; not allowed = "videos that stitch together unrelated or inconsistent AI clips to surprise or shock viewers".

**AI Personas policy (same page):** bans channels that use "AI-generated personas to deliver information on sensitive topics" — health, legal, finance, politics (e.g., an AI "doctor" or AI podcast host giving financial guidance). Directly relevant to the finance/health-adjacent channel slates.

**Enforcement level:** channel-level for reused/inauthentic — "monetization may be removed from your entire channel"; reviewers assess "main theme, most recent videos, most viewed videos, watch time, metadata, About section". Video-level: "limited ad earnings or no ad earnings". Escalation: "monetization being suspended or permanently disabled", withheld earnings with "payment delays of up to 90 days", and "In exceptional circumstances we may need to terminate a channel" [S4].

### 1.3 Reused content — FACT [S4]

Channels that "repurpose content that's already on YouTube or another online source" without "significant original commentary, substantive modifications, or educational or entertainment value". Key rules: "This policy applies even if you have permission from the original creator"; "Reused content is separate from YouTube's Copyright enforcement" (monetization policy, not a copyright strike).

- **Allowed:** clips in a critical review; rewritten dialog + changed voiceover; explained sports replays; reaction videos with commentary; edited footage with added storyline; Shorts remixes "adding original content to a song from our library"; "Content that primarily features the uploading creator"; editing that "demonstrates substantive editing and shows it's unique to your channel".
- **Not allowed:** moments "edited together with little or no narrative"; "Short videos you compiled from other social media websites"; "Collections of songs from different artists (even if you have their permission)"; content "uploaded many times by other creators"; "downloaded or copied from another online source without any substantive modifications"; "Content that gets views from mostly non-verbal reactions to your videos without added voice commentary"; "Content that exclusively features readings of other materials you did not originally create"; "Songs modified to change the pitch or speed, but are otherwise identical".

### 1.4 Copyright + Content ID — FACT

- **Strike** ([S8]): a strike means "your content was removed due to a legal copyright removal request." "Channels that get 3 copyright strikes in 90 days are subject to termination." Livestream access restricted 7 days after the first strike, 14 after the second. "Copyright strikes expire in 90 days if you complete Copyright School and your channel has fewer than 3 copyright strikes." Resolution: wait 90 days, get a retraction, or file a counter-notification. "Deleting a video doesn't resolve a copyright strike." Linked channels inherit risk: "If a channel linked to yours has 3 active copyright strikes, your channel is also subject to termination." Visibility of strikes: Studio dashboard ("Active copyright strikes") + email from no-reply@youtube.com — **not the API**.
- **Content ID claim** ([S9]): automated match → claim; rights holder can "**Blocks** a video from being viewed", "**Monetizes** the video by running ads against it and sometimes sharing revenue with the uploader", or "**Tracks** the video's viewership statistics" — "can be geography-specific". A claim is an automated match, distinct from the legal removal behind a strike; no strike accrues from a claim (the strikes page defines strikes solely via legal removal requests [S8]).
- **API surface:** `videos.list` `status.uploadStatus=rejected` with `rejectionReason` ∈ {claim, copyright, duplicate, inappropriate, legal, length, termsOfUse, trademark, uploaderAccountClosed, uploaderAccountSuspended} [S21]; live claim state is **not** exposed (§3.4). `channels.list` `auditDetails` exposes `copyrightStrikesGoodStanding`/`contentIdClaimsGoodStanding` booleans but only under the `youtubepartner-channel-audit` scope (§3.3) [S23].

### 1.5 Music licensing — FACT [S11][S10]

Audio Library tracks are "royalty-free production music and sound effects"; "Music and sound effects from the YouTube Audio Library are copyright-safe" and "won't be claimed by a rights holder through the Content ID system" [S10]. Two license types: Creative Commons ("you must credit the artist in your video's description") and Standard ("doesn't require attribution"). "If you're in the YouTube Partner Program, you can monetize videos with music and sound effects from the Audio Library." Caveat: YouTube "is not responsible for issues that arise from 'royalty-free' music" from third-party libraries — pipeline must only source from the Audio Library itself. Unlicensed commercial tracks → Content ID claim → revenue typically redirected to the rights holder or video blocked [S9].

### 1.6 Stock footage — FACT (a negative finding)

**No dedicated stock-footage policy exists on any official policy page fetched.** Stock clips fall under §1.2/§1.3 analysis: unedited stock without narrative/commentary matches "templated storylines… with minimal or no narrative, commentary, or educational value" and "content that gets views from mostly non-verbal reactions… without added voice commentary" [S4]. Dashboard must present this as interpretation, citing those exact clauses — not as a named "stock footage rule".

### 1.7 Synthetic/altered media disclosure — FACT [S5]

Page: "Disclosing use of GenAI content". Rule: "We require creators to disclose AI-generated or altered content that seems realistic" — realism-gated, not topic-gated. **Must disclose when content:**
- "Makes a real person appear to say or do something they didn't do"
- "Alters footage of a real event or place"
- "Generates a realistic scene that didn't actually occur"
- "Creates music that's the main focus of the video"

**Mechanics:** disclosure during upload, Studio Attributes → "AI use" → Yes; YouTube decides label placement (in-player label for photorealistic/AI-music content, expanded-description label otherwise). **Explicitly excluded from disclosure** (verbatim list): beauty filters; color/lighting; background blur/vintage effects; caption creation; sharpening/upscaling/repair; "Cloning one's own voice to create voice overs or dubs"; idea generation; gameplay footage; AI help with "a video outline, script, thumbnail, title"; AI infographics. → **AI narration and AI thumbnails do not require disclosure**; realistic AI *visuals* do.

**Enforcement:** "consistent" non-disclosure can bring "manual application of a label, or penalties from YouTube", including "removal of content or suspension from the YouTube Partner Program". And the sentence the dashboard should quote: **"Disclosing AI content alone won't limit a video's audience or impact its eligibility to earn money."** No dates on page; the requirement launched with YouTube's Nov 2023-March 2024 rollout (secondary knowledge; page shows none — do not cite a date from us).

**API interaction:** the Data API has a real field: `videos` resource `status.containsSyntheticMedia` — "allows the channel owner to disclose that a video contains realistic Altered or Synthetic (A/S) content" [S21]. Labels applied by YouTube's systems (C2PA metadata, YouTube's own AI tools, manual review) cannot be changed by the creator [S5]. So the pipeline can SET the disclosure via API at upload time; it cannot read whether YouTube overlaid an automatic label.

### 1.8 Medical misinformation — FACT [S13]

Policy covers prevention + treatment misinformation: harmful substances (MMS, Black Salve, etc.), vaccines (claims contradicting authority guidance on "safety, efficacy, and ingredients of currently administered and approved vaccines"), transmission misinformation, unapproved cancer treatments, abortion safety misinformation, infant-feeding misinformation. **Standalone COVID policies are retired** ("given the reduced burden of disease") but the framework "continues to apply to content related to infectious diseases including influenza and measles." **Enforcement = Community Guidelines level** (remove → warning → strike → termination), not monetization-level. EDSA and firsthand-experience exceptions apply.

### 1.9 Financial misinformation — FACT (a negative finding + reroute)

**No dedicated financial-misinformation policy exists** in the misinformation policy series [S14] (it contains only: census suppression, manipulated content, misattributed content) nor in the CG master list [S15]. Financial content is governed by: (a) **Spam policy** scams category — "Promoting 'get rich quick' investment schemes, fake job offers" [S6]; (b) the **AI Personas ban** for AI personas giving financial guidance [S4]; (c) Advertiser-Friendly Guidelines for demonetization (linked from [S32], not fetched — scope unverified). Dashboard should route "financial misinformation" checks to these three, citing each.

### 1.10 Spam / deceptive practices — FACT [S6]

"We do not allow content, metadata, or behavior designed to take advantage of the YouTube community." Categories (verbatim selections): engagement manipulation — "Repetitive or templated content aimed at artificially inflating engagement through bots, coercion, or offering rewards"; comment spam; off-platform diversion; detection evasion — "Technical manipulation (such as speeding up audio, heavy filters, cropping) designed to bypass abuse detection"; scams; malicious clickbait; scraped content. **The AI mass-production clause:** "Using automated tools or AI to churn out high volumes of similar content with minimal changes" is not allowed — "Testing tools or a few variations is fine". Also: "Creators should disclose when content is generated or meaningfully altered with AI", but disclosure "is not a free pass to violate our policies". Asking viewers to like/subscribe is explicitly fine. Enforcement: remove + warning/strike; "3 strikes within 90 days" → possible termination; "we may suspend your monetization or terminate your channel or account".

### 1.11 Metadata manipulation + misleading thumbnails — FACT [S6][S15]

No standalone "misleading metadata" policy page exists today; it lives inside the Spam policy as **malicious clickbait**: "Using maliciously misleading titles, thumbnails, descriptions, or imagery to trick users into clicking" — i.e., strike-level enforcement, not just demonetization. A separate **Thumbnails policy** exists under sensitive content (answer/9229980, listed in [S15], not fetched — content unverified).

### 1.12 Community Guidelines strikes — FACT [S7]

- "the first violation is typically only a warning" — optional policy training lets the warning expire after 90 days (clock runs "from when the training is completed"); violating the same policy within 90 days "may not expire and your channel may be given a strike".
- **First strike:** "you will not be allowed to do the following for 1 week" — uploads, livestreams, scheduled live streams, scheduling public videos, Premieres, custom thumbnails, posts, playlist edits; "Your scheduled public content is set to 'private' for the penalty period duration"; "Penalty starts from the date of acknowledgement."
- **Second strike (within 90 days):** "you will not be allowed to post content for 2 weeks."
- **Third strike:** "3 strikes in the same 90-day period may result in your channel being permanently removed from YouTube."
- Strikes remain on the channel for 90 days; "Deleting your content doesn't remove a strike"; severe single cases "will result in channel termination without warning"; strikes also cost advanced-features access.

**This 1-week upload ban is the closest real-world analog to the "name change disables publishing" worry — but it is triggered by strikes, never by branding changes (§2).**

### 1.13 Shorts vs long-form monetization mechanics — FACT [S12]

Long-form/Premium: 55% to creator. Shorts: monthly Shorts Feed ad revenue → music licensing costs carved out → **Creator Pool** (a Short using 1 music track sends half its revenue to the pool; 2 tracks, one-third) → creators allocated a share "matching their share of total engaged views" per country → "Monetizing creators will keep 45% of their allocated revenue, regardless if music was used or not." Worked example on page: $100K feed revenue, $10K to music licensing, 1% allocation = $900 → "you earn $405". Only "engaged views" count; unoriginal Shorts/reuploads/fake views earn nothing; "Shorts over one minute with claimed content are blocked". From Feb 1, 2027 the Shorts gate becomes the rolling "10 million qualified Shorts views in the last 90 days" (§1.1) plus **targeted Shorts ads** where "creators will keep 45% of the net revenue from the specific ad". (Original Feb 1, 2023 launch date is not stated on the current page — don't cite it as current policy text.)

### 1.14 Does AI disqualify monetization? — FACT, explicit answer

**No.** Official statements, verbatim:
1. "Disclosing AI content alone won't limit a video's audience or impact its eligibility to earn money" [S5].
2. The July 15, 2025 rename was framed as clarification: this content "has always been ineligible for monetization under our existing policies" — i.e., no new AI ban [S4].
3. The allowed-examples list explicitly includes AI-assisted work: "using AI to visualize a unique character and narrative you invented"; AI for "a unique, well-researched, or creative narrative" [S4].
4. The YPP eligibility page contains no AI condition at all [S1]; the Feb 2027 announcement contains no AI wording (verified — the fetch found no statements about AI-generated or inauthentic content in the post) [S3].

**What actually keeps template/AI channels monetizable (per official guidance, all quotable):** original scripts/narrative with "original, authentic insights or perspective"; variation across videos (distinct storyline/focus); substantive transformation of any borrowed material + added voice commentary; disclosure of realistic AI content; avoiding AI personas on sensitive topics (health/legal/finance/politics); avoiding "high volumes of similar content with minimal changes" and detection-evasion edits [S4][S5][S6].

---

## 2. Channel name / handle rules (owner's specific question)

### 2.1 What is officially documented — FACT

**Handles** ([S16] "Learn about YouTube handles", [S17] "Change, view, or hide your handle"):
- One handle per channel; 3–30 chars (shorter ranges for Han/Hangul etc.); letters/numbers in 75 supported languages; separators allowed but not at the ends; "not URL-like or phone number-like"; "Follows YouTube's Community Guidelines"; "each channel can only have one handle".
- "YouTube may auto assign you a handle based on your chosen channel name."
- **Frequency rule, verbatim: "You can change your handle twice within a 14-day period."**
- Previous handle: "we hold your previous handle for 14 days in case you'd like to switch back" (both URLs work meanwhile); "Afterward, the handle will become available for other users to select as their handle."
- "Your handle will also automatically become the new YouTube URL for your channel"; "Any legacy personalized URLs that you have will continue to work."
- YouTube "will revoke the handle and generate a new one" for violating handles, and "reserves the right to change, reclaim, or remove a handle at any time."
- **Neither handle page says anything about monetization, verification, or re-review being triggered by a handle change.**
- Related, [S18] custom URLs: "New custom URLs can no longer be set up and existing custom URLs can no longer be changed." Existing custom URLs "will continue to work" and "now redirect users to your new URL that is based on your handle." URL changes happen only via the handle at youtube.com/handle.

**Channel NAME:** There is **no current official Help article stating any name-change frequency limit or waiting period.** The old "Change your channel name" article (answer/2657864) now returns 404; the "Manage settings for your channel" topic pages link only handle articles, custom URLs, verification badges, pronouns — no name article ([S19]). Name changes are performed in YouTube Studio → Customization → Basic info (community/forum guidance; the Studio UI itself is the authority). No official page connects a name change to monetization re-review, verification, or YPP status.

**Secondary evidence on names (label: SECONDARY):** TeamYouTube's official support account and multiple user reports describe the same "twice within 14 days" cooldown applying to channel-name changes, with a hard "Sorry, you have to wait 14 days" error once exhausted [S38]. Useful for the dashboard's help text, but it must be cited as "reported by TeamYouTube on social support channels", not as Help Center text.

**Monetization/verification re-review:** No official source — page, blog, or policy — states that changing a name or handle triggers re-review, affects YPP standing, or restricts publishing. The only published mechanisms that pause uploads are CG strikes (1–2 week posting bans, §1.12) and copyright strikes (livestream restrictions, §1.4). **Dashboard must not display any "renaming may affect monetization" warning** — that would be an invented rule.

### 2.2 API observability of name/handle — FACT

- The API **cannot change** the name: `channels.update` "only supports updates to the `channel` resource's `brandingSettings`, `invideoPromotion`, and `localizations`" objects; supplying a changed `brandingSettings.channel.title` triggers error `channelTitleUpdateForbidden` — "you must set the brandingSettings.channel.title property's value to the channel's current title or omit the property" [S24]. There is no API for handles at all (no endpoint listed anywhere in the Data API docs).
- The API **can observe** current values: `channels.list` `snippet.title` (name) and `snippet.customUrl` (handle-based URL) [S22][S23]. So a sync-side **diff** ("name changed between sync N-1 and N") is inferable; there is no change event feed, no history field, and no exposure of the 2-per-14-days counter or remaining cooldown.

**Verdict for the dashboard:** handle/name churn checks = **(b) indirectly inferable** via periodic diff, severity Advisory/Informational at most, help text quoting [S17] for handles and labeling the name rule as SECONDARY. Anything stronger would be an invented rule.

---

## 3. Programmatically checkable conditions (classification)

Legend: **(a)** directly verifiable via official API (endpoint + field named) · **(b)** indirectly inferable · **(c)** requires user confirmation · **(d)** manual review only (Studio/email) · **(e)** not available via API.

| # | Check | Class | Evidence (endpoint/field/error — all verified in docs fetched 2026-10-24) |
|---|---|---|---|
| 1 | **Name/handle changes** | **(b)** | `channels.list` `snippet.title`, `snippet.customUrl` diff between syncs; no event/history; `channels.update` `channelTitleUpdateForbidden` proves API can't change title [S22][S23][S24]. 14-day counters invisible. |
| 2 | **Branding changes** (description, links, trailer, country) | **(b)** | `channels.list` `brandingSettings` + `localizations` diff [S22]. Writable via `channels.update` (50 units) [S24]. |
| 3 | **Upload eligibility (>15 min)** | **(a)** | `channels.list` `status.longUploadsStatus`: `allowed` / `disallowed` / `eligible` (eligible = must phone-verify first) — "Indicates whether the channel is eligible to upload videos that are more than 15 minutes long"; owner-authorized only [S22]. |
| 4 | **Daily upload cap hit** | **(a)** | `videos.insert` → 400 `uploadLimitExceeded`: "The channel's daily video upload limit has been reached" — "entirely separate from your Google Cloud project's API quota" [S25]. Default allocation includes "100 videos.insert calls" per day [S26]. |
| 5 | **Authorization problems** | **(a)** | 401: `youtubeSignupRequired` (Google account without a YouTube channel), `authorizationRequired`; 403: `authenticatedUserAccountClosed`, `authenticatedUserAccountSuspended`, `channelClosed`, `channelSuspended`, `insufficientPermissions` (revoked/expired token) [S25]. |
| 6 | **Quota restrictions** | **(a)** | 403 `quotaExceeded`. Defaults: "a default quota allocation of 100 search.list calls, 100 videos.insert calls" + "10,000 units per day combined for all other endpoints" [S26]. Extension via quota form + compliance audit [S27]. |
| 7 | **Verification requirements** (phone/ID/advanced features) | **(a)/(c)** | Partially: `longUploadsStatus=eligible` ⇒ phone verification pending [S22]. The verification act itself (phone/ID/video, "advanced features access" tier required for monetization application [S20]) is not API-visible → user confirms. |
| 8 | **Processing failures** | **(a)** | `videos.list` `processingDetails.processingStatus` ∈ {failed, processing, succeeded, terminated}; `processingFailureReason` ∈ {other, streamingFailed, transcodeFailed, uploadFailed}; `processingProgress` (partsProcessed/partsTotal/timeLeftMs); `status.failureReason` ∈ {codec, conversion, emptyFile, invalidFile, tooSmall, uploadAborted} [S21]. |
| 9 | **Upload rejection** | **(a)** | `status.uploadStatus=rejected` + `status.rejectionReason` ∈ {claim, copyright, duplicate, inappropriate, legal, length, termsOfUse, trademark, uploaderAccountClosed, uploaderAccountSuspended} [S21]. |
| 10 | **Copyright restrictions (live claims)** | **(e)** | No field exposes an active Content ID claim on a normal creator's video. Claims APIs exist only in the Content ID API: "The YouTube Content ID API is for YouTube content partners, not all developers or users"; "Access requires a YouTube Content Manager account" [S28]. Detection only after the fact: `uploadStatus=rejected`/`rejectionReason=claim`, `embeddable` note ("blocked from playback in embedded players… third-party claims (such as Content ID)") [S21]. |
| 11 | **Copyright strikes / CG strikes (booleans)** | **(a) with heavy caveat** | `channels.list` part=`auditDetails`: `communityGuidelinesGoodStanding`, `copyrightStrikesGoodStanding`, `contentIdClaimsGoodStanding`, `overallGoodStanding` — requires OAuth scope `https://www.googleapis.com/auth/youtubepartner-channel-audit`; docs frame it as an MCN audit flow: "any token that uses that scope must be revoked when the MCN decides to accept or reject the channel" or "within two weeks of the date that the token was issued" [S23]. **UNVERIFIED in practice:** whether Google grants this scope to a non-MCN SaaS for *persistent* dashboard use — the two-week revocation language conflicts with continuous monitoring. Prototype before relying on it. |
| 12 | **Strike details (count, dates, reason)** | **(d)/(e)** | Not exposed anywhere in the API. Studio dashboard + email only [S7][S8]. |
| 13 | **Age restriction** | **(a)** | `videos.list` `contentDetails.contentRating.ytRating` = `ytAgeRestricted` (only enum value: "A rating that YouTube uses to identify age-restricted content") [S21]. |
| 14 | **Visibility settings** | **(a)** | `status.privacyStatus` ∈ {private, public, unlisted}; `status.publishAt` ("can only be set if the video's privacy status is private and the video has never been published") [S21]. |
| 15 | **Made-for-kids designation** | **(a)** | `status.madeForKids` (current designation), `status.selfDeclaredMadeForKids` (owner-set; returned only for owner-authorized requests); channel-level equivalents on `channels` [S21][S22]. |
| 16 | **Monetization status** | **(b)** | No Data API field. One indirect probe: YouTube Analytics monetary metrics (`estimatedRevenue`, `estimatedAdRevenue`, `monetizedPlaybacks`…) are "supported for channel reports" but require scope `https://www.googleapis.com/auth/yt-analytics-monetary.readonly`, and "the authenticated user's channel must be a member of the YouTube Partner Program… Requesting monetary metrics for a channel that is not in the YouTube Partner Program results in a 403 Forbidden error" [S29]. Revenue-present ⇒ monetized; 403 ⇒ not in YPP (or scope missing — disambiguate carefully). Note revenue figures are "subject to month-end adjustment" [S30]; bulk/system-managed revenue reports beyond this are content-owner only [S31]. |
| 17 | **YPP status (direct)** | **(e)** | No field on `channels` ("No field exists for monetization status, YPP membership status, or account verification" [S22]). Use #16's 403 probe (b) + user confirmation (c). |
| 18 | **Thumbnail upload failures** | **(a)** | `thumbnails.set`: 400 `invalidImage`, `mediaBodyRequired`; 403 `forbidden` ("The authenticated user doesn't have permissions to upload and set custom video thumbnails" — e.g., features revoked after strikes [S7]); 429 `uploadRateLimitExceeded` ("The channel has uploaded too many thumbnails recently") [S25]. |
| 19 | **Synthetic-media disclosure state** | **(a)** | `videos` `status.containsSyntheticMedia` — owner-settable disclosure flag [S21]; `paidProductPlacementDetails.hasPaidProductPlacement` for paid-promotion disclosure [S21]. Whether YouTube auto-labeled a video is NOT readable [S5]. |
| 20 | **Custom-URL / link breakage** | **(b)** | `snippet.customUrl` diff → old handle links break after 14-day grace [S17]; stored channel URLs in our DB must be refreshed from this field. |
| 21 | **Uploads playlist integrity** | **(a)** | `channels.list` `contentDetails.relatedPlaylists.uploads` [S22]; `playlistItems.insert` errors (`videoAlreadyInPlaylist`, `playlistContainsMaximumNumberOfVideos`, …) [S25]. |

### 3.1 The honest summary — FACT

Directly checkable today: technical health (auth, quota, upload caps, processing, rejection, visibility, MFK, age rating, thumbnail perms, disclosure flags) and **three boolean good-standing flags under a scope designed for MCN audits**. One indirect YPP probe exists (monetary-metrics 403). Everything else policy-level — strike counts, strike reasons, YPP application state, monetization suspension, inauthentic-content review outcomes, claim details — is Studio/email-only. Any dashboard line implying otherwise would be fabrication.

---

## 4. Warning architecture — RECOMMENDATION

### 4.1 Severity ladder mapped to §3 classifications

| Severity | Applies to | Publish blocked? | Examples (from verified evidence) |
|---|---|---|---|
| **Blocking** | (a) hard technical constraint, current attempt impossible | YES | 401 revoked/expired token (`insufficientPermissions`, `youtubeSignupRequired`); 403 `quotaExceeded`; 400 `uploadLimitExceeded` (daily cap); `authenticatedUserAccountSuspended`/`channelClosed`; `longUploadsStatus=disallowed` for a >15-min render; `uploadStatus=rejected` for that video; `thumbnails.set` 403 when custom thumbnail required |
| **Action-required** | (a) something YouTube rejected/changed and someone must fix | Per-item | `processingStatus=failed`; `uploadStatus=terminated` (channel-level signal — stop pipeline, alert owner); `privacyStatus` drift vs. schedule; auditDetails flag false (if the scope proves usable); monetary-metrics 403 = not in YPP |
| **Warning** | policy exposure with concrete official rule + our observable inputs | NO | `containsSyntheticMedia=false` while pipeline knows it generated realistic A/S visuals [S5]; `hasPaidProductPlacement` unset on sponsored script [S21]; MFK flag mismatch; madeForKids vs. intended audience |
| **Advisory** | (b) inference + official policy context | NO | name/handle diff detected (cites 2-per-14-days handle rule [S17], name rule SECONDARY [S38]); `customUrl` changed → stale links; template-similarity heuristics vs. inauthentic-content clauses [S4]; Shorts threshold distance (10M/90d gate, Feb 2027) [S12] |
| **Informational** | facts, deadlines, education | NO | Feb 2027 terms acceptance deadline (Jan 31, 2027) [S1][S3]; policy explainer links; quota usage trending toward `quotaExceeded` |

### 4.2 Per-warning record fields (all recommended)

`id`; `severity` (above); `classification` (a–e); `title`; `explanation` (plain English); `policySourceUrl` (official only — never a blog); `policyQuote` (verbatim, with fetched date); `evidence` (exact API field values / error codes observed, or "user-confirmed"); `lastCheckedAt`; `autoVerifiable` (bool — false forces the (c)/(d) UI path); `recommendedAction`; `blocksPublishing` (bool — TRUE only for Blocking); `state` (`temporary` with expiry, e.g. 90-day strike/strike-expiry windows, vs `unresolved`); `supersededBy`/`resolvedAt`.

### 4.3 Hard-block vs advisory rules — RECOMMENDATION

- **Block ONLY on verified technical constraints:** OAuth failure (401), channel/account suspension (403 account/channel reasons), `quotaExceeded`, `uploadLimitExceeded`, `uploadStatus=rejected`, `longUploadsStatus=disallowed` for the artifact being published, thumbnail 403 when a custom thumbnail is required. These are YouTube-stated impossibilities, not judgments.
- **Never block on policy heuristics.** Inauthentic/reused/spam/AI-template risk, disclosure gaps, YPP/monetization uncertainty = Advisory/Warning with citation. Developer-policies duty: don't present our own analysis as YouTube's voice — "non-YouTube metrics shown alongside API Data need 'a clear and prominent disclosure' that they are not from YouTube" [S27, §III.E.4.h]; explain any feature limitation as ours, "not imposed by YouTube" [S27, §III.C.7].
- **(c)/(d) states render as "user must confirm in Studio"** with a deep link (e.g., youtube.com/handle for handle changes) — never as assertions.
- **Data-handling duties from [S27] that shape the dashboard:** non-analytics authorized data refresh/delete every 30 days; delete all authorized data within 7 days of user-requested revocation (30 days for Google-side revocation — implement token-validity checks); users get a data-deletion path (7-day SLA); users "must have final control over the data that will be published to YouTube" (§III.C.3); no uploads/likes/comments automation "without the user's prior specific and express consent" (§III.I.2) — the pipeline's scheduled publishing must map to explicit per-channel consent records.

### 4.4 Where checks run in the pipeline — RECOMMENDATION (stage → why)

| Stage | Checks | Why there |
|---|---|---|
| **Auth** (per token use) | 401/403 reasons; token-validity check for the 30-day Google-side revocation rule; auditDetails good-standing (if scope feasible) | Cheapest point to fail fast; revocation detection is a contractual duty [S27] |
| **Sync** (channel pull) | `snippet.title`/`customUrl`/`brandingSettings` diff → identity-change warnings; `longUploadsStatus`; quota headroom | The only place (b)-class inference is possible; alerts human before any publishing attempt |
| **Template selection** | Inauthentic/reused/AI-persona risk flags per template class (advisory, citing [S4]) | Prevent-policy-risk decisions happen before generation cost is incurred — but never block here |
| **Generation** | Disclosure determination → set `containsSyntheticMedia`, `hasPaidProductPlacement`, `selfDeclaredMadeForKids` at insert time | Only the pipeline knows what it generated; API flags exist exactly for this [S21] |
| **Scheduling** | `publishAt` validity (private-only rule), processing status poll | `publishAt` fails on non-private videos [S21]; catch processing failures pre-announcement |
| **Upload** | Handle `uploadLimitExceeded`, `quotaExceeded`, thumbnails 403/429 with backoff; surface `rejectionReason` verbatim | Errors here are the true hard-block set [S25][S26] |
| **Post-publication** | Re-fetch video: `uploadStatus`, `privacyStatus`, `ytRating`, `madeForKids`, `containsSyntheticMedia` echo; embeddable/blocked signals | Detects YouTube-side changes (age-restriction, MFK override, claim-driven embedding blocks) the pipeline didn't cause |

---

## 5. Risks / gaps

- **Feb 2027 spec is incomplete on official pages:** the blog names no subscriber minimum for the new 8,000-hour / 20M-Shorts entry path; support pages still show 1,000-sub thresholds. Do not encode post-2027 entry thresholds yet; store the 10M/90d Shorts gate + "accept terms by Jan 31, 2027" only.
- **`auditDetails` usability unproven for SaaS:** the documented MCN workflow mandates token revocation "within two weeks"; using it for a persistent dashboard may be impossible or fragile. UNVERIFIED — prototype with one channel before designing UI around it.
- **Monetary-403 probe ambiguity:** 403 on monetary metrics can mean "not in YPP" *or* "scope not granted/consent missing" — must disambiguate by comparing against a known-good monetary call before displaying "not monetized".
- **Secondary-only facts (labeled, do not present as official):** the 14-day channel-*name* cooldown (TeamYouTube/community) [S38]; Dec 2025–Jan 2026 termination wave (~16 channels / ~35M subs per outlierkit; YouTube's Nov 13, 2025 statement on "mass uploading of auto-generated or low-value content" via ppc.land) [S34][S35]; Test & Compare global rollout Dec 2025 (SEJ + YouTube Help page confirming the feature exists, no official date) [S36].
- **No stock-footage or financial-misinformation policy pages exist** — dashboards referencing them must cite the umbrella clauses instead (§1.6, §1.9).
- **Support-page churn:** 3 previously-known URLs 404'd during this research (old name-change article 2657864, old handles article 11585638, CG list 2801961). Policy URLs rot; store answer IDs + quotes + fetch dates, re-verify quarterly.

## 6. Open questions

1. Does post-Feb-2027 YPP entry retain a 1,000-subscriber minimum? (Watch answer/72851 and the "qualified watch hours" blog definition page.)
2. Will Google grant `youtubepartner-channel-audit` to a third-party SaaS outside MCN flows, and does auditDetails populate for opted-in creator channels in practice?
3. Does `containsSyntheticMedia` round-trip (read-back) for owner-authorized requests, and does it surface publicly?
4. Is there any official statement — current or archived — on name-change frequency? (If found, upgrade §2 from SECONDARY to FACT.)
5. Do Advertiser-Friendly Guidelines changes land alongside the Feb 2027 YPP terms? (Not fetched this round: answer/6162278.)

## Sources

Fetched 2026-10-24 unless noted. "Supported:" = what the source was used for above.

**Policy (support.google.com / blog.youtube — primary):**
1. https://support.google.com/youtube/answer/72851 — YPP eligibility: current thresholds, account requirements, Feb 2027 terms-acceptance notice, re-application rules.
2. https://support.google.com/youtube/answer/13429240 — Expanded YPP: 500-sub fan-funding tier thresholds verbatim.
3. https://blog.youtube/news-and-events/youtube-partner-program-updates-2027-new-opportunities-earn — Feb 1, 2027 changes: 8,000h/20M entry, 10M Shorts gate, grandfathering, Premium Lite pools (published 2026-08-10).
4. https://support.google.com/youtube/answer/1311392 — Channel monetization policies: July 15, 2025 rename banner, inauthentic/reused content lists, AI-template clause, AI Personas, enforcement levels.
5. https://support.google.com/youtube/answer/14328491 — GenAI disclosure: 4 required categories, exclusion list, penalties, "won't impact eligibility" line.
6. https://support.google.com/youtube/answer/2801973 — Spam policy: 9 categories incl. AI mass-production, malicious clickbait, enforcement ladder.
7. https://support.google.com/youtube/answer/2802032 — CG strikes: warning→strike→1wk/2wk/termination mechanics, 90-day expiry.
8. https://support.google.com/youtube/answer/2814000 — Copyright strikes: 3-in-90 termination, Copyright School, livestream restrictions, visibility.
9. https://support.google.com/youtube/answer/2797370 — How Content ID works: claim actions (block/monetize/track).
10. https://support.google.com/youtube/answer/2797466 — Copyright overview: Audio Library "won't be claimed", fair use, counter-notification.
11. https://support.google.com/youtube/answer/3376882 — Audio Library: licenses, attribution, YPP monetization caveat.
12. https://support.google.com/youtube/answer/12504220 — Shorts monetization: creator-pool→allocation→45% mechanics, worked example, Feb 1 2027 changes, ineligible views.
13. https://support.google.com/youtube/answer/13813322 — Medical misinformation: scope, CG enforcement, COVID retirement.
14. https://support.google.com/youtube/answer/10834785 — Misinformation policies: 3-part series; no financial policy; AI-inclusive applicability line.
15. https://support.google.com/youtube/answer/9288567 — CG master doc: policy index (URLs for spam/medical/misinformation/thumbnails), enforcement statement.
16. https://support.google.com/youtube/answer/11585688 — Handles overview: format rules, auto-assign, URL effects, revocation.
17. https://support.google.com/youtube/answer/15920820 — Change handle: "You can change your handle twice within a 14-day period"; 14-day hold then release.
18. https://support.google.com/youtube/answer/2657968 — Custom URL phase-out, redirect-to-handle behavior.
19. https://support.google.com/youtube/topic/9257109 — Manage account settings topic: no name-rule article exists (negative evidence).
20. https://support.google.com/youtube/answer/9890437 — Feature eligibility: Standard/Intermediate/Advanced tiers, phone/ID verification, monetization sits in Advanced.
21. https://blog.youtube/news-and-events/youtube-auto-dubbing-expressive-speech — auto-dubbing "available to everyone", 27 languages (published 2026-02-04; context verification).

**API / developer docs (primary):**
22. https://developers.google.com/youtube/v3/docs/videos — videos resource: all `status` fields incl. `containsSyntheticMedia`, rejectionReason enums, ytRating, processingDetails, thumbnails, paidProductPlacement.
23. https://developers.google.com/youtube/v3/docs/channels — channels resource: status fields, parts, auditDetails good-standing booleans, relatedPlaylists.
24. https://developers.google.com/youtube/v3/docs/channels/list — auditDetails scope requirement + MCN revocation rule; 1-unit quota cost.
25. https://developers.google.com/youtube/v3/docs/channels/update — writable brandingSettings fields; `channelTitleUpdateForbidden`; title not updatable.
26. https://developers.google.com/youtube/v3/docs/errors — per-method error reasons (uploadLimitExceeded, accountSuspended, thumbnails 403/429, etc.).
27. https://developers.google.com/youtube/v3/getting-started — quota defaults (10,000 units/day + 100 search + 100 inserts).
28. https://developers.google.com/youtube/terms/developer-policies — data retention (30-day), deletion SLAs (7/30-day), honesty/labeling duties, upload consent rules, quota audit.
29. https://developers.google.com/youtube/partner — Content ID API: content partners only, CMS account required.
30. https://developers.google.com/youtube/analytics/channel_reports — monetary metrics on channel reports; yt-analytics-monetary.readonly scope; **403 Forbidden for non-YPP channels**.
31. https://developers.google.com/youtube/analytics/metrics — estimatedRevenue/estimatedAdRevenue definitions, month-end adjustment.
32. https://developers.google.com/youtube/analytics/revenue_reports — revenue reports framed as content-owner (bulk).
33. https://www.youtube.com/howyoutubeworks/policies/community-guidelines/ — enforcement overview; links to AI disclosure blog + policy documents.

**SECONDARY (labeled, used only where noted):**
34. https://www.socialmediatoday.com/news/youtube-clarifies-monetization-update-inauthentic-repeated-content/752892 — July 2025 rename coverage (confirmed primary banner exists on [S4]).
35. https://www.outlierkit.com/ (AI-crackdown roundup) — Dec 2025–Jan 2026 termination wave figures (~16 channels, ~35M subs). Unverified officially.
36. https://ppc.land/ (Nov 13, 2025 report) — YouTube statement attributing upheld terminations to "mass uploading of auto-generated or low-value content". Secondary quoting YouTube.
37. https://www.searchenginejournal.com/youtube-title-a-b-testing-rolls-out-globally-to-creators/562571 + https://support.google.com/youtube/answer/16391400 — Test & Compare: feature verified on the Help page (3 variants, 2 weeks, watch-time win metric, Advanced features required); December 2025 date is secondary only.
38. TeamYouTube social-support replies + https://www.reddit.com/r/youtube/comments/1sa4ixn/ — 14-day/twice rule reported for channel-name changes. SECONDARY; no Help Center text found.
