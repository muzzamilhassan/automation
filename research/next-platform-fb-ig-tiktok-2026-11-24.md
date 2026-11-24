# Next platform after YouTube: Instagram vs Facebook vs TikTok

Date: 2026-11-24. Read-only research. All pages read 2026-11-24 unless noted.
Owner: Pakistan, $0 budget, GitHub Actions, human-approved scripts, neural English TTS, 1080x1920 Shorts 30-60 s plus 8-40 min videos. Target audience: US/UK.

Evidence labels: **[P]** first-party page opened. **[P-idx]** first-party text seen only through a search index of that domain (page would not render). **[S]** secondary page opened. **WEAK** = blogs/vendors only. **UNVERIFIED** = could not confirm. Quotes pass through a page-to-text summariser; re-open the page before relying on exact punctuation.

## 1. Summary

1. No platform of the three reliably pays a Pakistan-resident creator per view today. Facebook Content Monetization: Pakistan absent from Meta's 70-country list (three independent secondary reads, Oct 6, Oct 11, Nov 22 2026; Meta's own page blocked our reader). Instagram: Gifts list excludes Pakistan (secondary reads). TikTok Creator Rewards: 8-country list, no Pakistan (secondary) and the terms require real residence (first-party). The one native tool open to Pakistan is Facebook Stars (tips).
2. So choose by automation legality, audience and funnel, not by RPM.
3. Ranking: **1. Instagram, 2. Facebook (same Meta app, add after the visibility test), 3. TikTok (manual drafts only).** Confidence: high that TikTok is last; medium on Instagram over Facebook.
4. Instagram is the only one whose docs state plainly that App Review is not needed for a business you own.
5. TikTok's rules name our exact use as unacceptable: "A utility tool to help upload contents to the account(s) you or your team manages."
6. This is not greenfield. The repo already has `fb-crosspost.mjs`, `ig-crosspost.mjs`, `ig-slot-poster.yml` (paused 2026-10-23, "YouTube-only focus") and a 2026-09-20 audit showing about 60 Facebook reels = 2 views. **Diagnose that before posting anything new.** A previously unconsidered cause is a Meta app left in Development mode.
7. Any VPN, fake US/UK region, bought account or borrowed bank route breaks terms. Do not do it.

## 2. Comparison table (as of 2026-11-24)

| | Instagram | Facebook | TikTok |
|---|---|---|---|
| View-based pay in Pakistan | No programme found. Bonuses invite-only [P] | Not on 70-country list [S x3]; invite-only [P] | Not on 8-country list [S x2]; residence required [P] |
| Other native pay in Pakistan | Gifts no [S]; Subscriptions no [S, WEAK]; brand deals open [S] | **Stars yes** [P-idx + S] | Not found for Pakistan |
| Unattended public posting for own account | Yes, no App Review if you own the business [P] | Probably; app-mode ambiguity [P] | **No** until audit; own-account tools are named as unacceptable [P] |
| Daily API cap | Docs conflict: 100 vs 50 posts/24 h [P] | 30 API reels/24 h [P] | About 15/day per creator via Direct Post [P] |
| Video length by API | 3 s to 15 min, 300 MB [P] | 3 to 90 s reels [P] | Creator Rewards needs 60 s+ [P]; our 30-60 s Shorts fail |
| Token life | 60 days refreshable (IG Login), or Page token with no fixed expiry [P] | Page token no fixed expiry [P] | 2 h access / 180-day refresh [P] |
| US adults using it (Pew 2026) | 51% | 70% | 31% |
| US users 30-49 / 50-64 | 64% / 41% | 78% / 71% | 45% / 31% |
| US adults with $100k+ income using it | 59% | 70% | 29% |
| Outbound links | Bio link; post links are paid via Meta One [S] | Some Pages capped at 2 link posts/month [S] | Bio link, about 1,000 followers (WEAK) |
| Account risk | Documented ban waves with poor appeals [S] | Same Meta systems; own history of near-zero reach | Lowest viability: audit, PTA blocks history |

## 3. Monetization for a Pakistan-based creator

### Facebook
- **Access is invite-only.** Meta, 30 Mar 2026: "Content Monetization is currently an invite-only program." [1][P] Interest is expressed in the Professional Dashboard Monetization tab; the Mar 2026 newsroom post says the same. [2][P]
- **Country list.** Meta's page "Facebook Content Monetization: Country and language availability" [3] exists but returned only a title to us (also the en-gb version). Secondary reads of that page: Abondy, read Nov 22 2026, lists 70 countries including Bangladesh, India, Nepal, Sri Lanka, and says Pakistan is not on it [4]; Pakistan Era, checked Oct 11 2026, "Pakistan is not on that list" [5]; myartmyrules, checked Oct 6 2026, same [6]. Treat as strong secondary, not first-party. Owner can settle it in one minute by opening [3] while logged in.
- **Nuance:** Pakistan Era notes the programme page itself names no country as eligible or banned. An invite to a Pakistani page is therefore not proven impossible, only unsupported.
- **History:** ProPakistani (17 Mar 2025, citing Express Tribune) reported Pakistani pages losing ads, reels and photo earnings because Pakistani bank/tax details were rejected; payee had to have bank and tax details from the same eligible country; false details can lead to "permanent bans". [7][S] This is the main reason to distrust the local doc's "Reliq North (FB) monetization" tick.
- **Partner Monetization Policies** (title only to our reader; text via facebook.com search index): must reside in an eligible country, connected financial entities must also be eligible, and monetization can be lost if location changes. [8][P-idx]
- **Stars:** Pakistan on Meta's Stars list. [9][P-idx] plus [4][10][S]. Meta launched Stars in Pakistan Dec 2022. 500 followers for 30 days is WEAK (blogs). Payout rail to a Pakistani bank: **not found**.
- **Thresholds:** 24News HD (20 Jun 2026) reports "300,000 views within a 28-day period" may qualify selected pages. WEAK, no Meta source, and the article does not cite a country list. [11]
- **Creator Fast Track:** $1,000/month from 100k followers on IG/TikTok/YouTube, $3,000 above 1M. [2][P] The programme page served us "Creator Fast Track is not available in your country, coming soon". [12][P] That message reflects our fetcher's location, so it says nothing about Pakistan.
- **Payment terms:** Meta pays about 30 days after month end and refuses "misleading or inauthentic" earnings. [13][P]
- **Scale:** nearly $3B paid in 2025, 60% to reels. [2][P]
- **RPM, WEAK, third-party estimates:** from $0.01-0.20 to $1-10 per 1,000 in the results we saw, a spread too wide to plan on. Meta publishes no rate. Finance-specific first-party RPM: **not found**.

### Instagram
- **Bonuses:** "limited time and invite-only". Country list: not published. [14][P]
- **Gifts:** 49 countries, Pakistan absent, per Pakistan Era (24 Oct 2026). [15][S] Instagram's own page would not render.
- **Subscriptions:** 10,000 followers and a listed country; Pakistan reported absent or "may not be available to you yet". [16][S, WEAK]
- **Badges:** no country list on the Badges page; sources conflict. UNVERIFIED for Pakistan.
- **Ads on Reels revenue share:** no current open Instagram programme found. Programme RPM: **not found**.
- **Brand partnerships:** not country-gated per [16][S]. Paid partnership label needed.

### TikTok
- **US terms** (last update 20 Jul 2026): "Creator is a legal resident of a country where the Program is made available"; 18+; 10,000 followers; videos "at least 1 minute"; $50 minimum. [17][P]
- **EEA terms** (last update Apr 2025): "you reside in a country in which Creator Rewards Program is available and do not use a VPN or other similar tool"; 10,000 followers, 100,000 views in 30 days, not a Business Account, videos "one minute or longer", "original content and produced entirely by the creator" or adding new ideas. [18][P]
- **Countries:** US, UK, Germany, France, Japan, South Korea, Brazil, Mexico. The TikTok Creator Academy page rendered only a title to us; its eight-country text and the "based in one of these countries and have an account registered there" wording came through a tiktok.com search index [19][P-idx], matching [20][21][S]. Other blogs add Canada, Australia, Italy, Spain: conflicting. Pakistan: "No" in [21], absent in [20].
- **Plain warning:** a VPN, foreign SIM, bought US account or a relative's identity to look US/UK is a false-residence claim. EEA terms ban it by name; US terms require legal residence. The US terms do not mention VPNs, but that does not make a false residence legal. TikTok may suspend access. Several articles promoting this are selling accounts ([20], [21] included).
- **RPM (creator-reported/vendor, WEAK):** $0.40-1.00 per 1,000 qualified views; finance about $1.00-1.80. Not available to this owner.
- **Format mismatch:** our 30-60 s Shorts earn nothing under the 1-minute rule even in an eligible country.

### What actually pays from Pakistan
Affiliate/sponsor income routed through off-platform rails, and YouTube. The Payoneer/ClickBank claims in the Sept 2026 doc were **not re-verified** here.

## 4. Automation (official APIs, $0)

### Instagram
- Allowed without App Review for own business. Meta's App Review page: not required when "My app is only for a business I own or manage". [22][P] Overview: Standard Access suffices for an account you own or manage; Advanced Access needs App Review and Business Verification. [23][P]
- **Two routes:**

| | Instagram Login | Facebook Login (current repo route) |
|---|---|---|
| Facebook Page needed | No [23] | Yes [23] |
| Permissions | instagram_business_basic, instagram_business_content_publish [24] | instagram_basic, instagram_content_publish, pages_read_engagement [24] |
| Token | 60 days; refreshable after 24 h; dies if unrefreshed for 60 days [25] | Long-lived Page token "do not have an expiration date and only expire or are invalidated under certain conditions" [26] |
| Local file upload | Not covered | Yes, resumable upload "only for apps that have implemented Facebook Login for Business" [27] |
| Public URL needed | Yes, "publicly accessible server" [24] | No if resumable |

- Professional (Business or Creator) account required. [24][P]
- **Caps:** publishing guide says 100 posts/24 h, its carousel section says 50; `media_publish` reference says 50; 400 containers/24 h. [24][28][29][P] Plan on 50. We need 1-3.
- Reels: MP4/MOV, H.264/HEVC, AAC, 23-60 fps, 3 s-15 min, 300 MB, `is_ai_generated` optional flag, `thumb_offset`/`cover_url`; container expires after 24 h. [28][P] Trial reels supported through `trial_params`. [24][P]
- 8-40 min videos: only those up to 15 min and 300 MB fit. Clip them instead.

### Facebook Pages
- Reels: "limited to 30 API-published posts within a 24-hour moving period", Pages only, 3 to 90 s, 1080x1920 recommended, states DRAFT/SCHEDULED/PUBLISHED, permissions pages_show_list, pages_read_engagement, pages_manage_posts. [30][P]
- Long video: `POST /<PAGE_ID>/videos` with an uploaded file handle and the same permissions. [31][P] Length limit: not found on that page.
- **App-mode trap (first-party).** "Any data generated while an app is in Development mode, such as test posts, can only be seen by role users"; it becomes visible after switching to Live. [32][P] The access-levels page says Business apps are automatically approved for Standard Access, usable by role holders. [33][P] But the App Review submission guide says Live mode restricts to approved permissions, "This restriction applies to everyone, even users who have a role on the app itself." [34][P] These pull in different directions; the newer docs say publishing needs an icon, privacy policy URL and data deletion URL. [35][P] **Whether a Page post from a published, unreviewed own-use app is public is UNVERIFIED. Test it, do not assume.**
- Relevance: the 2026-09-20 repo audit found 14,911-follower Eon Ventures with 30 reels = 1 view. Development-mode visibility would explain a near-total zero better than normal low reach. This is a hypothesis: nobody has checked the app mode, and the repo has no record of it. The audit's "unchanged Shorts are unoriginal" explanation is weaker than stated: Meta's March 2026 text defines original as content "filmed or produced directly by a creator or owner of a Profile or Page" [40], which covers our own renders. Repo duplicates remain a real problem.

### TikTok
- "All content posted by unaudited clients will be restricted to private viewing mode" (page updated 27 Oct 2026). [36][P] Unaudited: SELF_ONLY, accounts must be set private when posting, up to 5 users/24 h. [37][P, updated 4 Aug 2026]
- About 15 posts/day per creator via Direct Post, shared across clients; 6 requests/min/token. [36][37]
- **Audit hurdle:** clients must be "intended for a wide audience, not limited to internal groups/private use"; unacceptable example: "A utility tool to help upload contents to the account(s) you or your team manages." [37] App review: "Apps must not be for private or personal use." [38][P] The earlier Quarry Studio rejection fits this. The Sept 2026 local plan to "re-submit the audit kit" should be treated as low probability unless it is a genuine multi-user product.
- **Legal $0 path:** `video.upload` inbox drafts, at most 5 pending shares/24 h; user must open the notification and finish in the app. [39][P] The page does not mention an audit. App still needs scope approval (UNVERIFIED for production).
- Tokens: access 2 h, refresh 180 days. [41][P]
- Cookie/browser uploaders: TikTok "strictly prohibit[s] automation tools, scripts, or other tricks designed to bypass our systems". [42][P] Do not use.
- No visible branding/watermark may be added by the posting app. [37] Our rendered brand pads would need a check.

### Repo facts found while checking (files not changed)
- `fb-crosspost.mjs` and parts of `ig-crosspost.mjs`/`yt-daily.mjs` call Graph **v20.0**, which expired 24 Sep 2026; v21.0 expires 21 Jan 2027; latest is v26.0 (29 Jul 2026). [43][P] Meta says expired calls default to the next oldest usable version [44][P], so calls may still work, with changed behaviour. Upgrade first.
- `ig-crosspost.mjs` hosts videos on uguu.se (third-party temporary host); resumable upload would remove it.
- `ig-slot-poster.yml`: cron commented out since 2026-10-23. `yt-mcp/ig-state.json` shows 13 successful-looking IG publishes across 4 channels (IDs are repo stamps, not proof of public visibility).
- Page `fbPageId` values are in `yt-mcp/studio-channels.json`; `quotequarry8` handle claimed in the Sept doc was not found in the files checked.

## 5. Policy: reused, unoriginal and AI content

| Topic | Instagram | Facebook | TikTok |
|---|---|---|---|
| Own content | Original = "work that you wholly created or reflects your unique perspective" [45][P] | "filmed or produced directly by a creator or owner" [40][P] | Post only what you created or may share; reused material "without anything new" is FYF-ineligible [42][P] |
| Not original | Re-uploads of others' work; border, watermark, subtitles or credit do not fix it [45] | Minor edits: borders, captions, speed; re-uploads you had no role in; may be "non-recommendable and demonetized" [40] | See above |
| Own Shorts from YouTube | Not addressed on the April 2026 page. No first-party statement that cross-posting your own clean video is penalised: **not found** | Not addressed in the March 2026 post | Not addressed on pages read |
| Duplicates across your own accounts | Identical copies on multiple accounts: "we will only recommend the original one" [46] | Networks duplicating the same content face reduced reach and lost monetization [47] | Associated accounts may be banned for evasion [48] |
| Watermarks | Must have "no visible watermarks" to reach new audiences [46] | Not stated in the pages read | Posting apps must not add watermark/branding [37] |
| AI | `is_ai_generated` flag; AI info labels by signal or self-disclosure [28][49] | Same labels [49]; March 2026 originality post does not mention AI [40] | Must label realistic AI or heavily edited scenes or people; `is_aigc` flag [42][36] |

- Instagram, 30 Apr 2026: aggregator rule now covers photos and carousels; recovery needs a significant share of original posts over 30 days; check Account Status. [45][50] Nov 17 2026: content-protection tool scans for reused reels, flags AI-altered copies, allows an allow-list for own second accounts. [51][S, TechCrunch] **Use one brand account per content stream.**
- Meta's TTS stance: no first-party rule on synthetic narration found. TTS over our own motion graphics is original by the published definition; whether Meta's classifier agrees is UNVERIFIED. Avoid narrating stock clips without adding anything; NoFaceTube attributes "narrating what's already on screen" to Meta [52][S].
- Set the AI flags honestly. Whether TTS plus abstract graphics must be labelled on Meta is UNVERIFIED (the 2024 page read does not state a duty); TikTok's duty is for realistic scenes/people.
- Meta spam rules (Apr 2025): irrelevant long captions or excessive hashtags lose reach and monetization. [47] Keep captions short and unique.
- Finance: we found no first-party ban on general personal-finance education. TikTok finance-specific policy was not read: UNVERIFIED.

### Music
- **Meta:** music "for commercial or non-personal purposes" is prohibited without appropriate licences; heavier music density raises restriction risk; content needs a visual element (effective 26 Mar 2024). [53][P, Urdu rendering, translated] Meta Sound Collection: royalty-free, commercial or not, **Meta products only**. [54][P]
- **TikTok:** "Businesses cannot use the general music library for commercial usage"; use the Commercial Music Library. [55][P] Commercial Music Library sounds are reported as TikTok-only (P-idx).
- **YouTube Audio Library:** the page read does not grant off-YouTube use and says YouTube can't guide on off-platform issues. [56][P] Creative Commons tracks need credit. Creator Music off YouTube: page 404, UNVERIFIED.
- Practical rule: use own-generated music, or CC0/CC BY with credit and stored proof, for the cross-post master. Do not reuse YouTube Audio Library, Meta Sound Collection or TikTok CML tracks across platforms.

## 6. Fit and traffic value (documented evidence)

- Pew, 5,511 US adults, 30 Jan-18 Jun 2026 [57][P]:

| Platform | 18-29 | 30-49 | 50-64 | 65+ | $100k+ |
|---|---|---|---|---|---|
| Facebook | 69 | 78 | 71 | 59 | 70 |
| Instagram | 79 | 64 | 41 | 21 | 59 |
| TikTok | 65 | 45 | 31 | 11 | 29 |

- For old money/wealth/debt content aimed at 30-64, Facebook's US base is strongest; Instagram skews younger but adequate and urban; TikTok is weakest on income and age. AI explainers for 18-39 fit Instagram or TikTok. Inference, not a tested result.
- UK: Ofcom Online Nation 2025 has Facebook/Messenger at 93% of adults (search result only; ofcom.org.uk returned 403). Instagram/TikTok UK reach: **not found**.
- Reach test (Metricool, 26 Aug 2026, 6,177,375 videos, 375,462 accounts): TikTok up to 42% more views than Reels; Reels lead shares at every account size. Small-account table gated; Facebook not included. [58][S, vendor]
- Trust: CFP Board survey as reported by Benzinga, Mar 2026: 40% of Americans use social for financial advice (47% under 45); Gen Z rates TikTok among the least trustworthy for it. [59][S] Platform percentages not given.
- **Traffic out:**
  - Instagram: clickable links in posts/reels need paid Meta One; links in captions are plain text; no API field for links. Free option = bio link. [60][S citing Meta pages we could not render]
  - Facebook: some Pages limited to two link posts per month unless paying; started Dec 2025, extended around Meta One (15 Sep 2026); publisher Pages exempt per Meta. [61][S] Meta's link-limit help page exists but did not render [62]; the launch post confirms the plans and prices (Advanced from $49.99) but the text we read does not state link caps. [63][P] Cap on your Page: test in-product.
  - TikTok: bio link needs about 1,000 followers: WEAK.
  - Documented conversion to YouTube or email for faceless finance channels on any of the three: **not found**. Assume low and measure with a UTM link.

## 7. Account risk

- **Instagram/Meta:** TechCrunch (2025) and 2026 reports describe ban waves with poor appeals. Meta confirmed at least one mistaken automated suspension in 2026 (No Kings Coalition). eWeek's article linking that alert to Claude-driven browsing returned 403: read via search index only, UNVERIFIED. Practical point: **never drive Instagram with an AI browser agent; API only, one app, human login.**
- **New-account limits:** specific posting limits for new IG/FB accounts: not found in first-party sources. Use a slow ramp.
- **Location:** Meta's inauthentic-behaviour policy bars deceiving users about "the identity, or origin of an audience or the entity that they represent" [64][P]. Do not claim a US newsroom or US persona. Being Pakistan-based and saying so is fine.
- **TikTok US:** TikTok USDS Joint Venture LLC announced Jan 23 2026: Silver Lake, Oracle, MGX 15% each; ByteDance 19.9%; algorithm to be retrained on US data in Oracle cloud. [65][P] Operating, not banned. Wikipedia (edited 16 Nov 2026) shows no newer change. [66][S] Reported $10B payment to the administration (Reuters, via [66]).
- **TikTok Pakistan:** "Blocked and restored repeatedly by PTA" per [21][S, vendor]; not checked against PTA.
- **Distribution by region:** whether a Pakistan-registered TikTok/Instagram account is shown to US users is UNVERIFIED in first-party text. Pew numbers describe the US market, not our reach.

## 8. Other platforms (one line each)
- **Threads:** 250 API posts/24 h [67][P]; text/short video; cheap add-on later, repo already has a publisher. Not better as a first platform.
- **Pinterest:** pins from Trial API are visible only to the creator; Standard needs a video demo. [68][P] Outbound links are its attraction, but approval is required. Worth a second look only if affiliate/blog traffic becomes the goal.
- **LinkedIn / X:** not researched beyond scope; no evidence they are clearly better. X payouts to Pakistan: not checked.

## 9. Recommendation

1. **Instagram.** Only path with a first-party no-review statement for own use, code already in repo, one daily Reel fits caps, originality rules fit our self-rendered videos, `is_ai_generated` available. Weakness: zero native pay in Pakistan and weak links; treat it as brand reach with bio link, and judge it by profile visits and bio clicks.
2. **Facebook.** Best demographic fit (30-64, income) and only platform with any Pakistan-native pay (Stars). Loses first place because own history is zero reach, app-mode status unknown, link cap for Pages. Costs little to add to the same app once the visibility test passes.
3. **TikTok.** Own-account posting tools named unacceptable; no Pakistan payout; one-minute rule; needs hands-on drafts.

### What would flip it
- **To Facebook:** the owner's logged-in dashboard shows Content Monetization active (Reliq North) or Meta's page lists Pakistan; OR the app-mode test shows reels were hidden and, once fixed, a 15k-follower page gets normal reach. The second alone makes Facebook the cheaper win.
- **To TikTok:** Pakistan joins Creator Rewards AND the app passes audit (or the owner accepts manual drafts) AND we switch to 61-90 s cuts.
- **To "none, do YouTube only":** an IG test posts 20 clean Reels with under about 100 median views, or owner time for manual review is the constraint.

## 10. First 5 setup steps (Instagram, Money Rulebook pilot)

1. **Owner, 15 min:** confirm which IG accounts exist and are linked to which Pages; set the MR one to professional, 2FA on, Account Status green, bio = searchable one-liner + YouTube link with UTM. Open [3] and the Monetization tab while logged in and screenshot both (settles Pakistan status).
2. **Check the Meta app:** Business type, App Purpose "Yourself or your own business", record Development or Published, the app's granted permissions and the token type. Add icon, privacy policy and data deletion URL if publishing.
3. **Visibility test before any schedule:** publish one new Reel by API, then view its link in a logged-out or second-account browser. Also check old Facebook reels the same way. Zero visibility = fix app mode first.
4. **Code spike (needs owner approval under the repo's rules):** Graph v20/v21 to current; resumable upload instead of uguu.se; own-rendered IG master: no YouTube watermark or "subscribe" end card, unique caption, `is_ai_generated` decision, music cleared per section 5, duplicate guard, MR only.
5. **Run:** one Reel per day, Reels only, no other account gets the same file. Measure 3-second retention, sends, profile visits, bio clicks over the first 20 posts, with Trial Reels if eligible, then decide whether to add Facebook. Keep cron off until the visibility test passes.

## 11. Open questions / not verified
- Meta's Content Monetization, Stars, Gifts, Subscriptions and link-limit pages in Meta's own words.
- Whether "Reliq North" truly earns today, and how payout is configured.
- Public visibility of posts from an unreviewed published app.
- TikTok scope approval for inbox drafts in production; TikTok financial-content rules.
- Payoneer/affiliate rails from the Sept doc.

### Corrections to older local docs
| Older claim | Status now |
|---|---|
| facebook-content-strategy-2026-09: "PK creators confirmed eligible (Stars + Content Monetization)" | Stars yes; Content Monetization contradicted by three Oct-Nov 2026 reads |
| instagram-growth-2026-09: "Reliq North (FB) monetization" tick | UNVERIFIED; check dashboard |
| Same: duplicate captions and TikTok audio are known reach killers | No first-party support found; watermarks confirmed |
| Same: "Instagram locked out of Pakistan" | Still consistent (secondary reads) |
| Same: ManyChat DM automation, 3x rates etc. | Not re-verified |
| tiktok-upload-options-2026-09: re-submit own-use app | Contradicted by TikTok's own-account example |
| facebook-audit-2026-09-20: unchanged cross-post = unoriginal | Not what Meta's text says about your own content; app mode untested |

## Sources
1. https://creators.facebook.com/blog/new-tips-to-help-you-earn-on-facebook-content-monetization - invite-only (30 Mar 2026)
2. https://about.fb.com/news/2026/03/creator-fast-track-grow-your-audience-earn-money-on-facebook/ - payouts, Fast Track, invite-only
3. https://www.facebook.com/business/help/267128784014981 - Meta country list (title only)
4. https://abondy.app/guides/facebook-monetization-countries - 70-country read, 22 Nov 2026
5. https://pakera.pk/check-facebook-content-monetization-invite-pakistan-creators/ - Pakistan unlisted, 11 Oct 2026
6. https://directory.myartmyrules.com/platforms/facebook-monetization-countries/ - same, 6 Oct 2026
7. https://propakistani.pk/2025/03/17/facebook-quietly-tightens-monetization-policy-in-pakistan/ - 2025 demonetisation
8. https://www.facebook.com/business/help/169845596919485 - Partner Monetization Policies (index only)
9. https://www.facebook.com/business/help/862669417580221 - Stars list (index only)
10. https://www.lilachbullock.com/facebook-monetization-in-pakistan/ - Stars yes, Subscriptions no
11. https://www.24newshd.tv/20-Jun-2026/facebook-relaxes-monetization-policy-makes-easier-pakistanis-earn-money - 300k views/28 days
12. https://creators.facebook.com/creator-fast-track - geo message
13. https://www.facebook.com/legal/creator_content_monetization_terms - payment terms
14. https://creators.instagram.com/bonuses - invite-only
15. https://pakera.pk/does-instagram-pay-in-pakistan-gifts-badges-check/ - Gifts exclude Pakistan
16. https://www.lilachbullock.com/instagram-monetization-in-pakistan/ - IG tools in Pakistan
17. https://www.tiktok.com/legal/page/global/creator-rewards-program-us/en - US terms
18. https://www.tiktok.com/legal/page/global/tiktok-creator-rewards-program-eea/en - EEA terms, VPN
19. https://www.tiktok.com/creator-academy/article/creator-rewards-program - countries (index only)
20. https://creatorriseagency.com/tiktok-creator-rewards-countries/ - 8 markets (sells accounts)
21. https://monetizednow.com/creator-rewards-countries - Pakistan "No" (sells accounts)
22. https://developers.facebook.com/docs/instagram-platform/app-review/ - no review for own business
23. https://developers.facebook.com/docs/instagram-platform/overview/ - access levels, Page need
24. https://developers.facebook.com/docs/instagram-platform/content-publishing/ - caps, permissions, URL hosting
25. https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login - 60-day tokens
26. https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived - Page tokens
27. https://developers.facebook.com/docs/instagram-platform/content-publishing/resumable-uploads/ - local upload
28. https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media - specs, is_ai_generated
29. https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media_publish - 50/24 h
30. https://developers.facebook.com/docs/video-api/guides/reels-publishing/ - 30/24 h, 3-90 s
31. https://developers.facebook.com/docs/video-api/guides/publishing - Page video
32. https://developers.facebook.com/docs/development/build-and-test/app-modes/ - dev-mode visibility
33. https://developers.facebook.com/docs/graph-api/overview/access-levels/ - Standard Access
34. https://developers.facebook.com/documentation/resp-plat-initiatives/individual-processes/app-review/submission-guide.md - App Purpose, Live restriction
35. https://developers.facebook.com/documentation/pages-api/create-an-app - publish requirements
36. https://developers.tiktok.com/doc/content-posting-api-reference-direct-post - unaudited, is_aigc
37. https://developers.tiktok.com/doc/content-sharing-guidelines - own-account tools unacceptable
38. https://developers.tiktok.com/doc/app-review-guidelines - no private/personal use
39. https://developers.tiktok.com/doc/content-posting-api-reference-upload-video - inbox drafts
40. https://about.fb.com/news/2026/03/rewarding-original-creators-on-facebook/ - originality
41. https://developers.tiktok.com/doc/oauth-user-access-token-management - token lives
42. https://www.tiktok.com/community-guidelines/en/integrity-authenticity - AIGC, automation, unoriginal
43. https://developers.facebook.com/docs/graph-api/changelog/versions/ - version expiry
44. https://developers.facebook.com/docs/graph-api/guides/versioning/ - expired-version fallback
45. https://creators.instagram.com/blog/rewarding-original-creators-on-instagram - IG originality
46. https://creators.instagram.com/recommendations-and-originality - watermarks, duplicates
47. https://about.fb.com/news/2025/04/cracking-down-spammy-content-facebook/ - spam rules
48. https://www.tiktok.com/community-guidelines/en/accounts-features - bans, monetization
49. https://about.fb.com/news/2024/04/metas-approach-to-labeling-ai-generated-content-and-manipulated-media/ - AI info
50. https://www.socialmediatoday.com/news/instagram-updates-algorithm-to-benefit-original-creators/819016/ - Apr 30 2026 detail
51. https://techcrunch.com/2026/11/17/instagrams-new-tool-for-creators-targets-unauthorized-reposts-and-ai-modified-videos/ - content protection
52. https://nofacetube.com/rules/meta-unoriginal-content-crackdown/ - narration point
53. https://www.facebook.com/legal/music_guidelines - music rules
54. https://www.facebook.com/sound/collection/terms/ - Sound Collection
55. https://ads.tiktok.com/help/article/commercial-music-library?lang=en - CML
56. https://support.google.com/youtube/answer/3376882?hl=en - Audio Library
57. https://www.pewresearch.org/internet/fact-sheet/social-media/ - Pew 2026
58. https://metricool.com/short-video-report/ - views comparison
59. https://www.cfp.net/news/2026/03/gen-z-says-tiktok-is-the-least-trustworthy-place-for-financial-advice - trust
60. https://www.blotato.com/blog/meta-one-link-limits - link limits, cites Meta pages
61. https://www.socialmediatoday.com/news/facebook-pages-get-charged-for-link-posts/830743/ - 2 links/month
62. https://www.facebook.com/help/1929252614431792 - link-limit help page (title only)
63. https://about.fb.com/news/2026/09/introducing-meta-one-subscription-service-more-features-ai/ - Meta One plans
64. https://transparency.meta.com/policies/community-standards/inauthentic-behavior/ - origin deception
65. https://newsroom.tiktok.com/en-us/announcement-from-the-new-tiktok-usds-joint-venture-llc - JV
66. https://en.wikipedia.org/wiki/TikTok_USDS - JV status
67. https://developers.facebook.com/docs/threads/overview - Threads cap
68. https://developers.pinterest.com/docs/key-concepts/access-tiers/ - Pinterest tiers
