# Cloud X Berry — full-course format audit + "Course" template proposal (2026-11-17)

**Read-only research.** No code changed. Nothing is built until the owner picks.
Reference video: [4 Years of Computer Science Degree in 4 Hours - Full Course (FREE)](https://www.youtube.com/watch?v=LJ_HY0AKZnM)
Channel: Cloud X Berry, `UCa4bTXWVuhtMJh6bQXAK38A`, 102K subscribers.
Previous audit of the same channel: `research/cloudxberry-channel-audit-2026-10-13.md`. Its visual description is now **out of date** (§3).

**Method:**
- Channel catalog: 60 videos via yt-dlp, with titles, views and lengths.
- Sampled sections of the 3.5 h course (0:00–6:30, 7:30–10:30, 48:30–51:30, 3:24:00–3:30:19) at 360p.
- Single frames at 13 more course timestamps.
- 8 frames each from the newest video, the 597K-view networking explainer, the 575K-view backend explainer and the 3 h "AI Engineer" course.
- Hard-cut counts with ffmpeg scene detection.
- The course's full auto-transcript (35,305 words): pace, structure and sample passages.
- Both course thumbnails.

---

## 0. TL;DR

1. **Long free "Full Course" videos are now the channel's growth engine.**
   - "4 Years of CS Degree in 4 Hours": **133K views in 16 days**.
   - "AI Engineer Full Course in 3 Hours": **280K**.
   - "AWS Networking Full Course": 82K. "Real Developer Life (3-Hour Course)": 73K.
   - Their 20–25 min "I Bet Nobody Has Ever Explained X Like This" explainers are the other pillar (597K, 575K, 365K).
   - Short 4–8 min "X vs Y" videos earn the least.
2. **The whole channel switched to a light "textbook" look.**
   - **The look:** white canvas, a bold black headline top-left with one accent word, a small underline bar, a logo top-right, and a numbered lecture badge.
   - **The teaching:** step-by-step visuals in which one thing changes per spoken sentence.
   - **No cuts:** 0 hard cuts in the course samples and in the 575K explainer; 3 in 25 min in the 597K one.
3. **The course is a strict, repeatable structure.**
   - **Shape:** course intro → **roadmap** → 5 colour-coded **modules** → **62 numbered lectures** of about 3–4 min → a **"What to take away"** card per lecture → **module recap** → **case studies** → wrap-up and a "next step".
   - **Glue:** one running example world (a fictional online store with customers and orders) ties 3.5 hours together.
4. **Script style:**
   - **Pace:** **168 words per minute**, short plain sentences.
   - **Lecture rhythm:** problem → analogy ("think of it as a light switch") → worked example → "Here's what to take away."
   - **Recurring anchors:** the same anchor questions per module ("How does it grow?").
5. **It fits our engine.** The Living Diagram already does the hard part: visuals fired on the spoken word, from data, without manual editing. A Course template needs:
   - **(a)** a new **light textbook look**;
   - **(b)** about 6 **teaching widgets** (code panel with line highlight, step solver, box row, growth chart, takeaway checklist, roadmap/progress);
   - **(c)** a **course planner** (outline → module → lecture);
   - **(d)** **split rendering** across parallel GitHub jobs. A 3.5 h video takes about 9 h to render in one job, over GitHub's 6 h limit.
6. **Recommendation:**
   - **Start:** a **1-hour mini course** in our **own** design (palette, cast, running world,
     logo), never a copy of Cloud X Berry's.
   - **Correction (owner, 2026-11-17):** there is **no ai-observer channel**. The `lib/brands.json`
     entry is a planning leftover: no channel ID, its saved login returns *"Account has been
     deleted"*, and `@TheAIObserver` is not ours. A tech course needs a **new channel**. Following
     the MR-first rule, the template could first be proven as a **money course on Money Rulebook**.

---

## 1. Channel performance (catalog, 2026-11-17)

| Format | Examples (views · length) | Verdict |
|---|---|---|
| **Full course (FREE)**, 1.75–3.5 h | AI Engineer **280K** · 2:53 · CS Degree in 4 Hours **133K in 16 days** · 3:30 · AWS Networking **82K** · 1:45 · Real Developer Life **73K** · 2:46 · System Design Patterns **36K** · 2:05 | the newest, fastest-growing pillar |
| **"I Bet Nobody / I Wish Someone Explained X"** + **"Complete X Ecosystem"**, 12–28 min | Networking **597K** · 25:36 · Backend **575K** · 12:42 · Programming **365K** · 20:37 · Rust ecosystem **111K** · OOP **108K** | the proven pillar |
| **Listicles** ("10 Backend Design Pattern Laws…", "10 CLI tools") | **146K–147K** | strong |
| **AI news / tool takes** | 270K (one hit), most 6–25K | spiky |
| **"X vs Y: The Most Confused Topic Finally Makes Sense"**, 4–8 min | 4.5K–101K, most under 30K | weakest |

**Takeaways:**
- Long and complete beats short and narrow.
- Packaging promises *completeness and a shortcut*: "4 Years … in 4 Hours", "Full Course in 2 Hours [FREE]", "Everything", "Complete".

---

## 2. Anatomy of the full course (from its 73 description chapters + transcript)

```
0:00  Course intro (~4 min)
      hook: "Have you ever written code that worked fine… then got very slow?"
      who it's for: tutorials · on the job · bootcamps · AI tools ("all good ways to start")
      one concrete example: 100 × 100 = 10,000 comparisons -> 100,000 customers = 10 billion
      COURSE ROADMAP: a walking figure along a road of 6 numbered stops (modules)
MODULE 01 (13 lectures) · 02 (14) · 03 (7) · 04 (17) · 05 (11)   -> 62 lectures + 3 case studies
      Module intro (~1 min): the module's questions ("How do you compare two pieces of code fairly?…")
      Lecture NN (~3-4 min each):
          problem -> analogy -> step-by-step worked example -> "Here's what to take away." (2-3 sentences)
      Module recap (~1 min): the module in plain sentences + ONE anchor question to keep
      ("What does this value really represent? And where does it live?" / "How does it grow?")
3:18  Case studies (real bugs: slow endpoint, missing cents + cache leak, race condition)
3:26  Course wrap-up: whole-course recap -> "why learn it" (tools change, ideas don't)
      -> "what changes for you now" -> ONE homework step ("build a hash map once this week")
      -> "You made it to the end" (a car drives past all 5 module signs, a medal, the year)
```

**Numbers:**
- 35,305 words in 210 min = **168 wpm**.
- Lectures are about 3–4 min, so every lecture works as a stand-alone short video. It's also a natural Shorts/clips source.
- Timestamps cover every lecture in the description: chapters for SEO and for viewers jumping around.

**Script voice (verbatim samples):**
- *"A bit is the smallest piece of information a computer can store. Think of it as a light switch. It's either off or on and it can't be both at once."*
- *"Here's what to take away. A computer counts in base two with bits that are either off or on…"*
- *"Say a report takes 1 second today. Next year, the data is 10 times bigger. Does the report take 10 seconds or 100? Both are possible."*
- *"Tools change every few years. These ideas don't. Learn them once, and they stay useful for your whole career."*

**What the script never does:** heavy math, jargon without an everyday example right after it, or long sentences.

---

## 3. The visual system (what changed since the October audit)

**October 2026 audit:** dark stage, neon glowing cards.
**Now:** a **light textbook system** across the whole channel. Seen in the newest video, the 597K and 575K explainers, and both 3 h courses. Thumbnails stay dark (§5).

**Frame furniture (every frame):**
- **Headline:** white canvas; bold geometric sans, black, top-left; **one accent word** coloured (purple, orange, green or blue); a short coloured underline bar beneath.
- **Badges:** a small square logo top-right; on lecture starts, a **numbered badge** before the title ("**02** From a number to binary", "**14** Here are five numbers").
- **Module colour:** each module has one accent colour (01 purple, 02 orange, 03 green, 04 blue, 05 purple). Badges and the **progress pills** top-right use it (01 02 03 04 05, the current one filled).

**Teaching widgets (each driven step by step by the narration):**

| Widget | Seen as |
|---|---|
| **Box row** | bits as 8 boxes with place values (128…1); boxes fill one by one; a "1 BYTE" pill |
| **Step solver** | a "LEFT: 89" counter + a condition card ("64 ≤ 89 ✓", "32 > 25 ✗") marching across the boxes |
| **Code panel** | light editor window (traffic-light dots, filename tab, line numbers); the current line highlighted; a warning badge on the buggy line |
| **Terminal / console** | `>>> 0.1 + 0.2` → `0.30000000000000004` with a red ✗ |
| **App mockups** | store admin, customer record cards with photo avatars and prices ("Asha Rao · Desk lamp $40"), a sales report, an email list |
| **Growth chart** | O(n) vs O(n²) curves drawing in; a "DATA × 10" bar |
| **Comparison table** | find_a vs find_b: steps, growth, loops, memory |
| **Takeaway checklist** | 3 cards; the first ticks ✓ while the others wait (the lecture's 3 points) |
| **Roadmap** | a road with numbered stops and a walking figure; at the end a car + medal |
| **Concept icons** | toggles, RAM/disk with photos, threads + locks, graph + Dijkstra strip, stack/heap columns, a books shelf |
| **Exercise cards** | "Try one yourself", "A quick question", "One catch" |

**Motion:**
- **Cuts:** essentially **no hard cuts**. The canvas changes in place (counted: 0 cuts in 3 course samples totalling 12.5 min; 0 in a 12:42 explainer; 3 in a 25:36 explainer).
- **Pacing:** each sentence adds, ticks, fills or highlights one thing. Same principle as our Living Diagram, on a white page.

**Running world:**
- **One fictional company for the whole course:** an online store (customers, orders, emails, reports, an admin panel).
- **Why it matters:** every new concept is shown on the *same* familiar app, which is why 3.5 h holds together. This is the format's strongest idea, and it costs nothing to copy as a *technique*.

---

## 4. Narration and audio

- **Delivery:** steady 168 wpm with short pauses between sentences. The October audit found it sentence-level AI TTS with natural breaths. Consistent with this course, but not re-verified by listening.
- **Music:** a soft bed (October audit). Not re-measured here.
- **For us:** our step-1 **human voice lane** (sentence pacing, real pauses, exact word times) already matches this delivery. See `docs/audio/how-audio-works.md`.

---

## 5. Packaging

- **Titles:** completeness + shortcut + free: "4 Years of Computer Science Degree in 4 Hours - Full Course (FREE)", "AI Engineer Full Course in 3 Hours [FREE]", "AWS Networking Full Course in 2 Hours (FREE)".
- **Thumbnails** (both courses): **dark** chalkboard background with neon doodles, a **huge two-tone headline** ("COMPUTER / SCIENCE"), a pill ("FULL COURSE · 4 HOURS"), or a **grid of topic tiles** with icons/logos ("BECOME AN AI ENGINEER · IN 3 HOURS": LLMs, Agents, MCP, RAG…). Dark thumbnails stand out against light videos.
- **Description:** one hook paragraph (the opening scenario), "What you will learn" bullets, then **every module and lecture timestamped**.

---

## 6. How a "Course" template maps onto our engine

| Need | We have | To build |
|---|---|---|
| Visuals fired on the spoken word, from data | **Living Diagram** cues (step 1) | — |
| Human pacing + exact word times | **human voice lane** | — |
| Light textbook look | `tile` / `glow` looks | a third look, **`paper`**: white canvas, top-left headline with an accent word + underline bar, lecture badge, module colour, progress pills, logo slot |
| Teaching widgets | nodes, edges, counters, badges, cards, statements | **6 widgets**: box row, step solver, code panel with line highlight, growth chart, takeaway checklist, roadmap/progress. Each is a cue verb, like `counter` today |
| Course structure | doc lane = cold open + chapters + outro | **course planner**: outline (modules → lectures) → one script per lecture (problem → analogy → example → takeaway) → module recaps → wrap-up; one **running world** chosen per course |
| 3.5 h render on GitHub | one job renders ≤ ~40 min of video comfortably | **split render**: one GitHub job per module in parallel, then a stitch job (join + upload). Measured: 8.8 min video = 22 min render; 3.5 h ≈ 9 h in one job, over the 6 h limit |
| Long-script review | review desk approves one script | approve the **outline** first, then each **module** script |
| Course thumbnail | thumb engine (photo + headline) | dark course thumb: two-tone headline + duration pill + topic-tile grid (own icons) |
| Shorts from the course | clips-first lane cuts on `episode.srt` | lecture = natural clip boundary (62 per course) |

**Estimated cost per course** (from today's measured cloud numbers, scaled):

| Course length | Voice | Plan | Render | GitHub runner time | Wall time (5 parallel jobs) |
|---|---|---|---|---|---|
| 1 h mini course | ~50 min | ~15 min | ~2.5 h | ~4 h | ~1 h |
| 3.5 h full course | ~3 h | ~45 min | ~9 h | ~13 h | ~3 h |

While the repo is private, Actions time is billed against the $12/month included compute
(memory: repo-private-2026-10-24), so a full course costs real dollars. Once the repo is public
(planned around day 19), standard GitHub-hosted runners are free.

---

## 7. Originality (important)

Use the **format** and the **teaching techniques**: full course, roadmap, numbered lectures,
takeaways, step-by-step widgets, one running example world. These are genre conventions.
Do **not** copy their identity:
- **Not their:** fictional store, palette, logo, cast names, exact layouts or titles.
- **Ours instead:** a different running world per course (e.g. a food-delivery app or a bank),
  our own palette and type, our own icon set (already ours, see `explainer/remotion/diagram/icons.tsx`),
  and royalty-free avatars (generated initials or CC0 Open Peeps, never stock photos of real people).

---

## 8. Proposed phases (each: spec + QA first, owner approval, local demo before anything live)

| # | What | Proof |
|---|---|---|
| C1 | **`paper` look + 6 teaching widgets** in the Living Diagram renderer | one 3–4 min **lecture** rendered locally for the owner |
| C2 | **Course planner**: outline → lecture scripts (fixed rhythm) → module recaps → wrap-up; running world; lecture badges, module colours, progress pills | one ~40 min **module** dry-run on GitHub (no upload) |
| C3 | **Split render workflow** (one job per module + stitch + upload) + outline/module review flow | full **1 h mini course** dry run on GitHub |
| C4 | **Course thumbnail** + description (module/lecture timestamps) + clips from lectures | thumbnail review |
| C5 | **Pilot**: a 1 h mini course on Money Rulebook (money course) **or** on a new tech channel the owner creates | first upload after owner review |

## 9. Owner decisions
1. **Channel:** a money course on Money Rulebook first (exists, MR-first rule), a **new** tech/dev-education channel (to be created), or both?
2. **Length to start:** a 1-hour mini course (recommended) or straight to a 3-hour course?
3. **Review:** approve the outline + each module's script (recommended), or the full script once?
4. **Cost timing:** start now (billed Actions while private) or wait until the repo is public?

## UNCERTAIN
- Narration engine of this specific video (not re-verified by listening).
- Exact scene transitions (sampled at 1 frame per 11–25 s; motion between frames not seen).
- Render cost of the new widgets (estimated from today's Living Diagram numbers).

## Sources
- Video + description (73 chapter lines, 5 modules, 62 lectures): https://www.youtube.com/watch?v=LJ_HY0AKZnM
- Channel catalog (60 videos, views, lengths): https://www.youtube.com/channel/UCa4bTXWVuhtMJh6bQXAK38A/videos
- Frames: course sections + `TR0RU2pmMeA` (597K), `mZ27vUoOEB0` (575K), `4uPU1Q5hlFA` (newest), `XFNggsFFZJw` (AI Engineer course)
- Auto-transcript of the course (35,305 words, 168 wpm)
- Prior audit: `research/cloudxberry-channel-audit-2026-10-13.md`
- Our measured costs: `docs/qa/step1-mr-voice-moneyflow-qa.md` (cloud dry run 2026-11-17)
