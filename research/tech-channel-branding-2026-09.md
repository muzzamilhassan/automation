# Tech Channel Branding + SEO Package — "How Dev Works"

Built 2026-09-21. Deep research for the new dev-explainer channel (5th channel).
Content engine: "Dark Mode Minimalist Tech" v3 (sentence-choreographed visuals, 8–12 min deep-dives) rendering on quarry-render `tech-video.yml` (topic as free-text input). First video delivered: Event Loop 11.4-min.
Handle checks done via YouTube Data API `channels.list?forHandle=` (exact, 2026-09-21) — same method as the 09-18 finance SEO doc.

---

## 1. Landscape — who owns dev YouTube (2026)

| Channel | Lane | Lesson for us |
|---|---|---|
| Fireship | Fast, meme-heavy tool/news coverage + 100s concepts | Don't fight him on speed/news — we can't win it |
| ByteByteGo + Gaurav Sen | Animated system-design interview prep | Owns "diagram animation for interviews" |
| Hussein Nasser | Backend/networking internals, long talky streams | Owns "backend personality" — talky, not animated |
| CodeAesthetic | Minimalist visual programming concepts | Closest style cousin, uploads rarely — GAP here |
| Kevin Powell / Theo / Primeagen | CSS depth / commentary / react-curmudgeon | Different lanes entirely |

**The gap our engine fills:** evergreen "how X actually works" deep-dives, calm dark-mode minimalist animation, 8–12 minutes, evergreen (search-fed, not news-fed). Nobody owns this exact slot; CodeAesthetic is the closest but irregular and conceptual-only. ByteByteGo prove animated explainers scale to millions; Hussein proves internals hunger; Fireship's shorts feed the funnel.

Niche consistency rule (from 09-18 research): every metadata surface repeats ONE phrase — for this channel: **"how software actually works."**

Sources: [daily.dev best channels 2026](https://daily.dev/blog/best-youtube-channels-software-engineers), [crackr.dev 50 coding channels](https://crackr.dev/blog/best-coding-youtube-channels), [LearnWithPath 2026](https://learnwithpath.com/blog/best-youtube-channels-for-web-development-2026), [Unicorn Club front-end 2026](https://unicornclub.dev/articles/2024-11-01-best-youtube-channels-for-front-end-developers)

## 2. Name research — candidates + handle reality (checked 2026-09-21)

Handle availability (API-verified): nearly every good dev name is parked by 0–80 sub placeholder channels. FREE exact or HQ handles among 30 checked:

| Option | Name | Handle (status) | Verdict |
|---|---|---|---|
| **A** ⭐ | **How Dev Works** | **@HowDevWorks — FREE exact** | Name = the format (every video is "How X works"). Instant niche + positioning + SEO. Zero collision (exact-name channels are 0 subs). Fits house naming style (plain descriptive). |
| B | Compile Time | @CompileTimeHQ FREE (exact taken by 0-sub) | Best pure branding/pun, podcast-y. BUT 3+ existing "Compile Time" channels cause search collision; name says nothing about "explained deep-dives". |
| C | Dark Mode Dev | @DarkModeDevHQ FREE (exact taken) | Style-forward, matches engine name. BUT "dark mode" reads as a CSS topic; brand tied to an aesthetic, not a promise. |
| D | Under the Hood Dev | @UnderTheHoodDev FREE | Descriptive internals fit; "under the hood" is generic (car content), name is long. |
| E | Code Deep Dive | @CodeDeepDiveHQ FREE (161-sub channel owns clean name) | Positioning-exact but generic and someone else owns the pretty handle. |

Taken (for the record): DarkModeDev, CodeCompass(+HQ), TheStackTrace(+HQ), CompileTime, CodeUnderTheHood, DeepTerminal, StackExplained, TheCodeBeneath, TerminalDepth, DevDecoded, HowCodeWorks, CodeInternals, BlackBoxDev, CodeXRay, QuietCode, DevDeepDive, TheCompileTime.

**Recommendation: A — "How Dev Works" (@HowDevWorks).** Backup: B.

## 3. COPY-PASTE package (for Option A)

### 3a. Channel name (Basic info → Title)
```
How Dev Works
```

### 3b. Handle
```
@HowDevWorks
```
(Set it FIRST — verified free 2026-09-21; handles get squatted fast.)

### 3c. Description (first 150 chars are the search snippet — front-loaded)
```
How software actually works — animated deep-dives into JavaScript, Git, networks, databases, and the tools developers use every day. Calm, visual, and honest: no hype, no fluff, just the machine explained.

WHAT YOU GET
• One system opened up and explained per video — event loop, Git internals, HTTPS, DNS, database indexes
• Clean dark-mode animations that show what your code does behind the scenes
• 8–12 minute deep-dives — watch once, understand for years
• Evergreen topics, not news — these videos don't expire

New deep-dive every week.

Whether you're a junior dev filling the gaps or a senior who wants the full picture, this channel shows you what happens under the hood.

Subscribe and finally see the whole machine.

📧 Business: muzzamilhassan302@gmail.com
```

### 3d. Channel keywords (Settings → Channel → Keywords, <500 chars)
```
how dev works, programming explained, software engineering explained, javascript event loop, how git works, how https works, how dns works, system design, backend development, web development, computer science explained, database indexing, docker explained, nodejs, v8 engine, rest vs graphql, tech animations, dark mode, deep dive, under the hood
```

### 3e. Country of residence: **US** (same US-primetime CPM strategy as the other 4 channels)

### 3f. Branding
- **Banner text**: `How Dev Works` big, tagline under it: `Software, explained.` — dark background (#0D1117 GitHub-dark family), one accent color (the engine's existing teal/cyan), NO heavy borders on text (house rule).
- **Logo**: minimal glyph — a `{ }` or terminal caret on dark square, one accent line. Generate during setup.
- **Watermark**: same glyph.

### 3g. Trailer
Event Loop deep-dive (already rendered, 11.4 min) set as channel trailer for new visitors + pinned. When the 2nd video lands, cut a 45-60s trailer from the two.

### 3h. Launch playlists (searchable names, not cute)
1. `How JavaScript Works` (event loop, V8, promises, GC)
2. `How Git Works`
3. `Networking Explained` (DNS, HTTPS/TLS, TCP, what happens when you type a URL)
4. `Databases & Backend` (indexes, REST vs GraphQL, Docker)

### 3i. First 12 videos (evergreen, ordered; #1 done)
1. ✅ **How the JavaScript Event Loop Actually Works** (delivered)
2. How Git Actually Works (objects, refs, rebase vs merge — visualized)
3. What Really Happens When You Type a URL and Press Enter
4. How HTTPS Actually Works (TLS handshake, certificates, why it's safe)
5. How DNS Finds a Website in Milliseconds
6. Inside the V8 Engine: How JavaScript Gets Fast
7. How Database Indexes Work (B-trees, visualized)
8. Promises vs Async/Await: What Actually Happens
9. How Docker Containers Actually Work (namespaces, images, layers)
10. Garbage Collection Explained (why JS never asks you to free memory)
11. REST vs GraphQL: What Each One Really Costs You
12. How React Re-Renders (and why your app gets slow)

These are proven evergreen search topics (ByteByteGo/Fireship/Hussein overlap) AND they feed from `state/tech-topic-bank.json` for later, trend-driven additions.

### 3j. Upload plan
- Render: quarry-render `tech-video.yml` (dispatch: topic + minutes, fallback=true for 10+ min guarantee).
- Cadence: start 2/week (fixed slots beat daily-burn; channel #6 decision later).
- Slot: ET evening (US prime = money slot, per reels-timing research).
- Wiring: `add-yt-channel.mjs` onboarding → OAuth token → new upload job in automation (mirror of longform-upload family).
- FB/IG mirror: if wanted, page/handle MUST be named `How Dev Works` — lesson from the FB name-mismatch audit (mismatched names confused viewers and were left unlinked).

## 4. Setup checklist (after user picks the name)
1. User: set name + handle @HowDevWorks in YT Studio (2 min, while handle is free)
2. Me: channel description + keywords + country + playlists (Studio-ready, or via API after onboarding)
3. Me: generate logo + banner (dark minimal, no heavy borders)
4. User: run `add-yt-channel.mjs` OAuth (browser picker)
5. Me: upload job + token secret + first upload of Event Loop video + set as trailer
6. FB/IG mirror page decision (name must match)
