# GTA 6 stream clipping — how to clip other creators' lives and use them on our channel

Date: 2026-11-19 (GTA 6 launched on PS5 / Xbox Series this week; streams are at peak).
Type: research only — no code, workflows or state were changed.
Inputs: 3 owner-shared videos (transcripts pulled with yt-dlp), YouTube + Rockstar policy, clipping-campaign boards, a live YouTube search done today (~21:30 PKT) for GTA 6 streams with subscriber counts.

---

## 1. Bottom line

1. **Clipping other people's streams is real money right now, but YouTube ads are the weakest way to earn from it.** YouTube's *reused content* rule judges the **whole channel**, and **permission from the streamer does not count** (quoted in §3). A channel that only posts raw stream clips can be refused for, or lose, monetization.
2. **The safe way to use clips on our own channel is to transform them**: add our own narration, a storyline, ranking or context. Example: "Small streamers' wildest GTA 6 first reactions — Day 2", with our narrator voice between clips. YouTube explicitly allows "edited footage from other creators where you add a storyline and commentary".
3. **The direct cash route is paid clipping campaigns** (Whop *Content Rewards*, clipping.net, streamer programs). The streamer pays per 1,000 views, so YouTube monetization doesn't matter. But most open GTA 6 campaigns today are **TikTok / Instagram / X**, and those platforms are **paused** by your 2026-10-23 directive (YouTube-only).
4. **Small streamers are the best source**, for three reasons: they say yes to permission requests, nobody else is clipping them, and several have more live viewers than their subscriber count suggests (table in §5).
5. **None of our 16 channels is a gaming channel** (all are finance or self-improvement). GTA clips on Money Rulebook etc. would confuse their audiences. This needs **one new dedicated gaming channel**. Under the no-static-maps rule, that is a registry/kit entry, not new code.
6. **About 60% of the machinery already exists** in our #97 clipper (`longvideo/shorts-clips.mjs`: LLM moment ranking over subtitles, cutting, vertical repack, captions, queue, publisher). Stream clips need 4 new pieces (§6).

---

## 2. What the 3 shared videos actually show

### Video 1 — "How to Make Money Clipping GTA 6 Videos/Streams (Free Skill)" — Nafay 3D (304K subs, 237K views, 2026-11-18)
- Gives away a free **"Stream Clip Skill"** for Claude Code / Gemini CLI / OpenCode / Codex. You tell the agent "make clips from the latest GTA 6 streams".
- What the skill does (per its description):
  1. **Finds the biggest GTA 6 streams** by itself (or takes a link).
  2. **Listens to the whole stream locally.**
  3. **Finds spikes: where the streamer got loud and where chat went crazy.** These are the two signals we don't use yet.
  4. AI picks the most viral moments and gives each a **virality score**.
  5. Builds the vertical clip: **facecam on top, gameplay below, title on top, captions**.
  6. Writes the caption + hashtags.
- A 12-hour stream took about 30 minutes to analyse on his machine.
- Two ways to earn: (a) post and earn from platform monetization, (b) **Content Rewards (Whop) / clipping.net campaigns**. He showed an IShowSpeed campaign paying **$1 per 1,000 views**.
- His own fine print: *"only clip creators who allow it. Many big streamers run paid clipping programs."*

### Video 2 — "GTA 6 Clipping: Earn Money From Home With AI (Step by Step)" — Badar Munir (2026-11-19, Urdu/Hindi)
- Tool shown: **CreatorSuite** (his own team's product; 5 free videos, then paid plans). You paste a stream link and AI finds the moments and edits the clips. It can copy a famous creator's clip style.
- **"Clipping" defined**: take the best moment from a long horizontal stream and stack **streamer reaction + gameplay top/bottom** in one vertical frame.
- **Content Rewards had 11 GTA 6 campaigns open the day before launch.** There are two payout types:
  - **Fixed CPM**: $X per 1,000 views, with a **max per clip**.
  - **Pool**: a fixed budget split among clippers, but you need very high views to qualify (hundreds of thousands).
- **Check 5 things before joining a campaign**: rate, max clip length, **remaining budget**, allowed platforms, specific requirements (a required song, streamer face must show, etc.).
- **3 mistakes**:
  1. No **"paid promotion" disclosure** at the start of the clip or in the platform's paid-partnership toggle.
  2. Sending one clip to two campaigns, or **buying views**, which gets a permanent ban.
  3. **Using footage you have no permission for.** Only use footage the campaign provides or names. Also avoid GTA **story endings, big reveals, cutscenes, glitches, cheats or mod menus**.
- **Submit the post link within 30 minutes of posting**, or the clip doesn't count.
- His honest verdict: *Rockstar only permits non-commercial videos, so paid clips can be removed at any time. $1/1K is low and you need volume. Treat clipping as a skill, not a lottery.*

### Video 3 — MrJayPlays "GTA 6 IS FINALLY HERE! FIRST TIME GTA 6 LIVE!" (948K subs, ~170K views, still live at ~5,100 watching)
- An example of the **source material**: a multi-hour first-playthrough live with facecam and a giveaway. This is exactly the kind of stream clippers cut.
- Not a small channel (948K). See §5 for small ones.

---

## 3. The rules (this decides what's safe)

### 3a. YouTube reused content (official policy page, fetched today)
- Not allowed: *"repurpose content that's already on YouTube or another online source without adding significant original commentary"*; *"Clips of moments … edited together with little or no narrative"*; *"Short videos you compiled from other social media websites."*
- Allowed: *"Reaction videos where you comment on the original video"*, *"Edited footage from other creators where you add a storyline and commentary"*, clips used *"for a critical review"*.
- The test: *"we allow reused content if viewers can tell that there's a meaningful difference between the original video and your video."*
- **Permission does NOT help**: *"applies even if you have permission from the original creator"*, and *"Promotion of other people's content (even if you have permission)"* is not allowed.
- It is **separate from copyright** (*"not based on copyright, permission, or fair use"*), so a clip with no Content ID claim can still fail a monetization review.
- **Penalty is channel-wide**: *"monetization may be removed from your entire channel."*
- Secondhand only, unverified: one clip editor says YouTube Support told him that posting the same stream as VOD + highlights + clips + Shorts *"could fall under the reused content policy"*.

**What this means for us:** raw cut-and-caption clips work for **campaign payouts** and for **growing a channel**, but they are a YPP risk. Anything we want monetized on YouTube needs **our own narration or commentary layer**. The good news is that our pipeline already generates narration (TTS + scripts).

### 3b. Rockstar video policy
- The Rockstar support page timed out twice, so this comes from secondary reports. The policy (last updated Jan 2025) welcomes gameplay uploads but describes them as *"occasional, non-commercial"* fan use. Rockstar removes **isolated cinematics, ending reveals, cutscene compilations and pre-release/leaked footage**, and can take anything down "at any time".
- Practical rule for our moment-picker: **never cut cutscenes or story spoilers. Cut streamer reactions, chaos, funny moments and open-world gameplay.**

### 3c. YouTube ad rules for game violence (Sep 2026 update, per press)
- Graphic game violence is OK for ads if it **doesn't appear in the first ~7–8 seconds**. "Shock" compilations (e.g. mass NPC killing) can still be fully demonetized, and thumbnails and titles are reviewed separately.
- So **open each clip on the streamer's face/reaction, not on gore**. That is also the best hook.

---

## 4. Three ways to use clips (and which formats)

| Route | How we earn | Format | Risk | Fit with our rules |
|---|---|---|---|---|
| **A. Paid clipping campaigns** (Content Rewards, clipping.net, streamer programs) | Streamer/brand pays ~$0.40–$2 per 1K views, capped per clip; Whop takes ~10% | Shorts / Reels / TikTok, 15–60s, facecam-top + gameplay-bottom, captions, disclosure | Low copyright risk (it's commissioned); budgets run out fast; most GTA 6 campaigns are TikTok/IG/X | **Conflicts with the YouTube-only directive**: only some campaigns accept YouTube |
| **B. Permission clips of small streamers, on our own gaming channel** | Channel growth → later YPP; streamer cross-promo | Shorts (daily), credit + link to the streamer | YPP reused-content risk if clips are raw | Clean if we get written permission + credit; growth tool, not a monetization path by itself |
| **C. Transformative long-form compilations** | YouTube ads (long-form RPM ≫ Shorts) | 8–15 min: "Top 10 small-streamer reactions", "GTA 6 Day 3: what new players are discovering", with **our narrator between clips** | Lowest YPP risk; matches the "storyline and commentary" allowance | Best fit for our engine (narration + scripting already exist) |

**Recommended mix:** C for money, B for daily volume and discovery (Shorts can be cut from C's own long-form, like our clips-first lane #95). A only if you lift the platform pause, or for campaigns that accept YouTube Shorts.

**Shorts layout** (both videos agree): 1080×1920, **streamer facecam top (~40%)**, **gameplay bottom (~60%)**, big title on top for the first 2–3s, word-by-word captions, streamer credit on screen. This replaces our current "brand-pad" layout for this lane.

**Long-form layout:** 16:9, our narrator VO between clips, a "clip from @streamer" lower-third on every clip, chapters per clip, all streamers credited and linked in the description.

---

## 5. Small channels streaming GTA 6 live right now

Taken from a YouTube live search (3 queries, 105 live streams, 103 channels) at about **21:30 PKT, 2026-11-19**. "Watching" is the concurrent viewer count at that moment. A higher watching-to-subscriber ratio means a more engaged audience, which makes that streamer a better partner.

### Outliers (small channel, unusually big live audience): contact these first
| Channel | Subs | Watching | Stream |
|---|---|---|---|
| Thunder GOD Live (Hindi) | 13.5K | **1,813** | https://www.youtube.com/watch?v=IEY22llr4Vc |
| Reforge Gaming | 74.9K | 545 | https://www.youtube.com/watch?v=241lrCJ-7Q8 |
| Dark Rishi | 4.8K | 194 | https://www.youtube.com/watch?v=K-TLXQBEWZE |
| LuceIsHere | 55.5K | 160 | https://www.youtube.com/watch?v=0oa8df_Uvy8 |
| ViolaTor Gaming | 36.7K | 158 | https://www.youtube.com/watch?v=SVahrHNg-TY |
| BOTIMUS-_-PRIME | 8.5K | 125 | https://www.youtube.com/watch?v=a8eKzA2LACo |
| itsnublo | 935 | 60 | https://www.youtube.com/watch?v=XMcJzLFdhIs |
| okay kyro | 2.7K | 47 | https://www.youtube.com/watch?v=NewRacw6K4k |
| HITMAN IS LIVE (Hindi) | 2.4K | 36 | https://www.youtube.com/watch?v=soey7oe0s1o |
| PandaTalksTech (Hindi/Hinglish) | 22.8K | 32 | https://www.youtube.com/watch?v=Fx7_PjrPzQg |
| Shawtt Gaming (12h marathon) | 31.2K | 22 | https://www.youtube.com/watch?v=uM6pPxEhFrg |
| SJR GamingYT (Malayalam) | 1.2K | 19 | https://www.youtube.com/watch?v=tawAhqy1MDo |
| Bhai is Live Gaming | 13.7K | 19 | https://www.youtube.com/watch?v=Lb8c2inl0mA |

### Very small (under 10K subs) streaming GTA 6 live
| Channel | Subs | Watching | Stream |
|---|---|---|---|
| HollowCraft | 64 | 1 | https://www.youtube.com/watch?v=MZgS2FqOJ1E |
| Ikonik | 73 | — | https://www.youtube.com/watch?v=Zr6u7aSdJj0 |
| PANKAJ PRAJAPAT | 113 | — | https://www.youtube.com/watch?v=XsBm4r5FdvU |
| GameBaaz | 115 | 3 | https://www.youtube.com/watch?v=_HO8XpP4LEI |
| Bat's Arcade | 136 | 1 | https://www.youtube.com/watch?v=6UAuB1YszUY |
| Shinzo GamingYT | 148 | 2 | https://www.youtube.com/watch?v=wU8hI0oI0Uo |
| ChintanisLive (Hindi) | 250 | 2 | https://www.youtube.com/watch?v=kNrkGwT2XS0 |
| Aryan Gaming Zone (India) | 257 | 3 | https://www.youtube.com/watch?v=3zcijULiqA4 |
| OPNovaYT (already vertical) | 525 | 1 | https://www.youtube.com/watch?v=K-49pdjFURE |
| CBunfiltered | 935 | — | https://www.youtube.com/watch?v=rhHYlNuYqak |
| Shadowzin Live (Hindi) | 953 | — | https://www.youtube.com/watch?v=qpL1JQOvF8o |
| A Beastyy Gamer | 1.06K | 2 | https://www.youtube.com/watch?v=dRGli-l0V7c |
| Adwaria gaming (India) | 1.26K | — | https://www.youtube.com/watch?v=wQq3x-cRs3s |
| GameSena YT (India) | 1.78K | 4 | https://www.youtube.com/watch?v=5xDWVhOiaBk |
| ToxicshotGG | 1.8K | 7 | https://www.youtube.com/watch?v=z9qv-_1Ow58 |
| LegionYT Live | 1.94K | — | https://www.youtube.com/watch?v=mVknv40iRxI |
| FAITH WORLD | 1.98K | — | https://www.youtube.com/watch?v=wRsLGtgysFI |
| Saint Plunge (NZ) | 2.77K | 14 | https://www.youtube.com/watch?v=fmQovcucVe4 |
| Lucky chhajlani (Hindi) | 3.12K | — | https://www.youtube.com/watch?v=BSrGDF4IO98 |
| EzekieL Playz (India) | 3.86K | 6 | https://www.youtube.com/watch?v=0-yxQ-fZROA |
| Happy Khelraay (Hindi) | 6.2K | — | https://www.youtube.com/watch?v=cYMF0eEmMVk |
| Gugu chan | 6.33K | 7 | https://www.youtube.com/watch?v=AvJcLkyIFYQ |
| Rohme Gaming (India) | 6.63K | — | https://www.youtube.com/watch?v=fmItQxVNTzc |
| Afia Mafia (Pakistani streamer) | hidden | 7 | https://www.youtube.com/watch?v=OaKrt1KSt1c |

Notes:
- The search also returned the giants (IShowSpeed 62.9M subs, ~170K watching; Kai Cenat Live 16.8M, ~54K; TimTheTatman; DarkViperAU). They already have large clipper armies and paid programs. Use them only through their **official campaigns** (Route A).
- "okay kyro" is actually streaming **GTA 5** with #gta6 tags. Ignore it.
- Many small streams have only 1–7 viewers. **Footage quality and streamer energy matter more than subscriber count.** Spot-check a VOD before pitching.
- The raw data (all 103 channels with subs and watching) is in the session scratchpad. Re-run the search on any day; the live list changes hourly.

**Outreach pitch (permission-first):** *"We'll clip your GTA 6 stream into Shorts on our channel with your name + link on screen and in the description. Free, no strings. Reply 'yes' to allow."* Keep the reply as proof in a permission ledger (§6).

---

## 6. How it maps onto our system

**Already built (#97 clipper, `longvideo/shorts-clips.mjs`, 674 lines):**
- Subtitle-based **LLM moment ranking** (Gemini → Groq → Cerebras chain)
- ffmpeg cut + vertical 1080×1920 repack (`cutClip`)
- Word-level captions (`buildAssCaptions`), title card, dup-title gate
- Clip queue in channel state, slot scheduling, quota ledger, upload intents, publisher
- Disclaimer append to descriptions (`lib/review-seams.mjs`)

**Missing for stream clipping (4 pieces):**
1. **External source ingest.** Download the streamer's VOD + **live-chat replay** + auto-captions with yt-dlp. Our clipper currently only reads our *own* render artifacts. Risk to test first: yt-dlp from GitHub Actions IPs often gets bot-checked by YouTube, and we already hit an HTTP 429 locally today while pulling one subtitle file. This step may have to run locally or on the Hetzner box from the live-loop lane.
2. **Two new moment signals**, the same ones Nafay's skill uses:
   - **Audio loudness spikes**: ffmpeg `ebur128`/`astats`, i.e. when the streamer shouts.
   - **Chat-rate spikes**: messages per 10s from the chat replay JSON.
   Combine both with the subtitle-based LLM ranking. A 6–12h stream can't go to the LLM whole, so the spikes pick the candidate windows first.
3. **Facecam-split layout.** Facecam top, gameplay bottom. It needs the facecam box coordinates per streamer, **stored as data in a source registry record, not hardcoded** (no-static-maps). A first version can ask once per streamer, then reuse.
4. **Source / permission ledger + spoiler guard.** Each source streamer gets a record: channel, permission proof (DM screenshot/link), credit line, facecam box, language. Clips from a source with no permission are **fail-closed** (never cut). The moment-picker prompt excludes cutscenes and story reveals (Rockstar) and opens on a reaction, never on gore (YouTube 7–8s rule).

**Long-form (Route C)** reuses the doc engine: the script/narration step writes the commentary between ranked clips.

**Channel:** one new gaming brand (kit + registry entry). Nothing changes on the 16 existing channels.

**Quota:** uploads share the existing pool tracked by `lib/quota-ledger.mjs`. Plan the gaming channel's daily Shorts inside the current budget.

---

## 7. Recommended next step (needs your approval — nothing built yet)

**Pilot in 1 day, manual-first, no code** (per the pilot-first and no-calendar-waits rules):
1. Pick **3 streamers** from the outlier table (e.g. Thunder GOD Live, Dark Rishi, BOTIMUS-_-PRIME) and send the permission pitch.
2. From one approved VOD, cut **5 Shorts + 1 eight-to-ten-minute narrated compilation** using our existing clipper locally, with hand-placed facecam crop.
3. Post on a new gaming channel. After 72h, compare Shorts views vs our finance channels' Shorts.
4. If the numbers are good, spec the 4 missing pieces (EARS spec → QA file → build), one feature at a time.

**Decisions only you can make:**
1. **New gaming channel:** yes/no, and its name.
2. **Clipping campaigns (Route A):** keep the YouTube-only pause, or lift it for TikTok/IG campaign payouts?
3. **Who sends permission DMs** to streamers: you personally, or a channel account?
4. **Language:** English sources only, or also Hindi/Urdu streams? Many of the small streamers above are Hindi; your audience reach could favour either.

**Timing caveat:** GTA 6 launch hype peaks in the first 1–3 weeks. A slow spec-first build risks missing the wave. That is why the pilot above is manual and uses existing tools.

---

## Sources
- Video 1: https://www.youtube.com/watch?v=2WXR8P3bJys (transcript + description pulled via yt-dlp)
- Video 2: https://www.youtube.com/watch?v=Cf6LjDPMXac (Hindi/Urdu auto-transcript + description)
- Video 3: https://www.youtube.com/watch?v=3jcwcOuSdZA
- YouTube channel monetization policies / reused content: https://support.google.com/youtube/answer/1311392
- Reused-content analysis for clip channels (secondhand YouTube Support claim): https://forkoff.xyz/blog/clipping/youtube-reused-content-policy-2026
- Rockstar video policy (page timed out; content via secondary reports): https://support.rockstargames.com/articles/200153756/rockstar-games-video-policy
- YouTube violence ad-rule update (Sep 2026): https://www.dexerto.com/gta/youtube-updates-gaming-violence-monetization-rules-ahead-of-gta-6-launch-3405945/ , https://www.gamingamigos.com/post/youtube-updates-monetization-graphic-gaming-gta-6
- GTA 6 clipping campaign board (as of 16 Nov 2026): https://gtaviclipper.com/board
- Clipping rates overviews: https://klap.app/blog/make-money-clipping-gta-6 , https://openclip.app/clipping/gta-6-clipping , https://whop.com/gta6-clip-network/
- GTA 6 launch date context: https://gtaintel.com/news/gta-6-launch-day-what-to-expect
- Live-stream list: yt-dlp YouTube search with the "Live" filter, 3 queries, 2026-11-19 ~21:30 PKT; subscriber counts from each channel page.
