# Research — the "Paper Billions" cartoon market-documentary lane (2026-11-10)

Source video: https://www.youtube.com/watch?v=zEUKLSrbRZk — "Why the Stock
Market Just Crashed", channel **Paper Billions**, published 2026-11-08,
**562,534 views in 2 days**, 15:00, Education. Status: RESEARCH ONLY — no
code, no infra, nothing provisioned. Owner decision pending on every phase
below.

## 1. The channel and the niche

The channel is **new — 3 uploads, ~2,170 subscribers** (yt-dlp channel dump,
2026-11-10):

| Video | Views | Length |
|---|---|---|
| Why the Stock Market Just Crashed | 565,000 | 15:00 |
| The Biggest IPO in History Lost $80 Billion | 15,000 | 14:09 |
| How a Chinese Spy Got Inside Nvidia | 909 | 19:48 |

Video #2 went massively viral — the FORMAT is validated, the channel is not
(yet). Niche: **long-form financial-event documentaries** — "the story
behind a market event, told as a narrative with real numbers". Not day-trading
advice, not news reading: narrative explainers with a strong cold-open hook,
chaptered structure, and a "what it means for ordinary people" close.

Sub-niches visible in just 3 uploads, and the expansion space around them:
1. **Market moves** — why a crash/rally happened (the viral one)
2. **Company sagas** — scandals, espionage, blowups (Nvidia spy)
3. **Business history** — IPOs, bubbles, frauds (the $80B IPO)
4. Expansion: earnings sagas, founder stories, crypto cycles, banking
   crises — the same engine covers all (template DATA, not code —
   [[no-static-maps-directive]]).

## 2. The visual grammar (18 frames extracted and reviewed)

Full-screen **flat 2D cartoon scenes**: simple round-headed characters (dot
eyes, stick limbs, no mouths sometimes), thin black outlines, soft flat
shading, muted room colors with green/red money accents. All labels in a
handwritten marker font. Verified reference frames in
`research/assets/paper-billions-ref/`. The recurring grammar:

- **Scene beats** — office, trading floor, data center, bedroom row, kitchen,
  construction site, courtroom-style stages with spotlights. Characters act
  the narration (a worker stacking "SAFE/BORING" sticky notes, traders
  cheering under confetti, everyone lying awake in bed).
- **Anthropomorphized objects** — the US Capitol with a face; a cloud
  character wearing the Microsoft logo; a data center with angry eyes
  peering through a kitchen window; "WANTED" posters for the 2008 and 1987
  crashes with an angry mob holding torches.
- **Kinetic text beats** — white handwritten text on pure black, word by word
  ("Nobody"), or a full sentence centered. Used as punctuation between
  scenes.
- **Data scenes** — hand-drawn-style charts on cream boards ("S&P 500
  ONE-DAY FALLS", red bars −4.84% / −5.97%), before/after bar pairs with a
  magnifying glass on the difference, phone-UI mockups ("MY PORTFOLIO
  $250,000" with a red declining chart), fictional ticker walls (PIKE, QUAY,
  RIFT — legally safe fake brands), a giant glowing "NASDAQ −1%" board.
- **Time markers** — a wall clock + chip badge ("10:35 AM ET", "4:00 PM ET"),
  and a colored day chip ("WEDNESDAY" green = party, "THURSDAY" red = crash)
  that persists across scenes. The Thursday chapter is a minute-by-minute
  timeline beat sequence (9:30 → 10:35 → 11:17 → 1:38 → 4:00).
- **Maps** — illustrated US map with red "NO" stamps and a "21 IN OHIO"
  callout pin; Middle East map with Iran red, a "DEAL?" bubble, and a
  "BRENT CRUDE" mini-chart inset panel.
- **Simulated dialogue** — short quoted asides voiced by a second speaker
  (auto-captions mark them with "»"): "I'm diversified. 500 companies." /
  "Seven of them are a third of the pie." Adds comedy and rhythm.
- **Narration style** — short present-tense sentences, concrete numbers,
  vivid analogies ("Picture a restaurant where three tables order two of
  every five plates"), cold open with a shocking stat, chaptered story arc,
  ending that lands on an ordinary person (a kitchen table in Ohio).

## 3. Production autopsy — how THEY make it

AI-image artifacts are visible: garbled in-image text ("DATHENTER" on a
window, clipped "-2…"), slight character-design drift between scenes. So
their chain is: **AI image generation per scene** (cartoon style prompt) →
simple animation (pans/zooms/cuts, probably CapCut/Premiere) → human(ish)
VO + a second character voice → kinetic text overlays → music. The
thumbnail is the same cartoon style (a Jensen Huang caricature pushing a
cracked Nvidia GPU off a cliff).

We do NOT need their exact chain. We can match the look with a better one.

## 4. What we need — the verified stack (free first)

### The core decision: draw scenes, don't generate them

This style is geometrically simple (round heads = circles, bodies = rounded
rects, thin strokes, flat fills). A **parametric SVG scene system inside our
existing Remotion engine** reproduces it — with huge advantages over AI
images: pixel-perfect text every time (their AI text garbles), perfect
character consistency, real-data charts (Yahoo numbers → animated
hand-drawn-style charts), zero per-image cost, zero watermark, infinitely
re-usable across ALL channels and niches (registry DATA drives scene choices
— no-static-maps honored).

**Proof** — `research/assets/paper-billions-ref/style-proof-mock.png`: a
hand-built SVG scene (trading floor, NASDAQ −4% board, ticker wall of
fictional brands, 4:00 PM ET badge, THURSDAY chip, round-headed traders)
rendered through our own headless Chrome at 1280×720 in one static file.
Side-by-side with `ref-board-nasdaq.jpg` / `ref-closing-bell.jpg` the family
is unmistakable. That took one HTML file — a component system takes it to
episode scale.

### Verified component stack

| Need | Choice | Status |
|---|---|---|
| Cartoon scenes | Parametric SVG/Remotion "cartoon scene system" | PROVEN (mock) — free forever |
| In-scene text/labels | DOM text in **Caveat** (Google Fonts, OFL) | PROVEN — renders in our headless Chrome |
| Real market data | **Yahoo Finance chart API** (JSON, no key, indexes/stocks/ranges) | VERIFIED live 2026-11-10 (`^GSPC` 1mo returned) |
| Macro series | FRED API (free key) | known-good, add when a script needs it |
| Maps | Public-domain outline SVGs / GeoJSON + stamps/pins (the f320 grammar) | free, no verification needed |
| Script brain | Existing LangGraph sidecar + a style-guide prompt using this transcript as the few-shot exemplar; scene-by-scene beat schema | infra exists |
| Narration | Edge-TTS via edge_batch (WordBoundary timings → karaoke) | already in the pipeline |
| Character voices | Multi-voice TTS (per-line voice assignment — small extension of P4 voice work) | infra exists |
| Music | Incompetech channel-approved pools via preferMood | already integrated |
| Captions/SRT | srtFromBeats (already) | unchanged |
| Thumbnails | Existing thumbnail engine, cartoon-background variant (AI caricature or SVG scene bg) + the left-stack text | engine exists |
| Kinetic text beats | Remotion (already) | unchanged |

### AI-image enrichment (optional layer, for caricatures/posters)

~20% of scenes want a hand-drawn-but-organic look we can't vectorize well
(Big Tech CEO caricatures, WANTED posters with faces). Tested 2026-11-10:

- **Pollinations (anonymous free)** — DISQUALIFIED: free tier now serves only
  the weak `sana` model, ignored the style prompt (wrong subject), and
  force-watermarks "pollinations.ai" on every image.
- **Gemini image models via our keys** — BLOCKED TODAY: main key → 429 quota
  (image models may be free-tier-limited or exhausted for this project);
  longvideo key → 403 "free tier not available for this project, set up
  billing". `gemini-2.5-flash-image` / `gemini-3.1-flash-image` /
  `nano-banana` variants ARE visible to the key. Owner options: enable
  billing (≈$0.04/image → ≈$1–2 per episode for ~15 enrichment scenes), or
  open a fresh AI Studio project to test the free quota.
- **Cloudflare Workers AI (recommended free option)** — free daily Neuron
  allocation covers dozens of FLUX.1-schnell images/day, no watermark, no
  card; needs a one-time free Cloudflare account + API token (owner signup).
- **Local generation** — impossible: this machine has Intel UHD 620 only (no
  NVIDIA GPU, no nvidia-smi).

Architecture: fail-soft chain (Cloudflare → Gemini → SVG stand-in), exactly
the logo-chain pattern. Enrichment scenes are never load-bearing.

## 5. The template family (registry DATA, not code)

New scene family — proposed id **`market-files`** (final name owner's call),
sitting beside the 8 existing families. Beat types map 1:1 to the grammar:

- `scene` — parametric cartoon scene (location + characters + props + mood
  palette, from the script's scene directions)
- `kinetic` — black-screen handwritten text (word-by-word or sentence)
- `chart` — real Yahoo/FRED data → animated hand-drawn-style bars/lines on a
  cream board
- `board` — the big glowing % board + ticker wall + clock + time badge
- `timeline` — minute-by-minute beat rail (the Thursday grammar)
- `map` — outline map + stamps/pins + callout + optional inset chart
- `phone` — illustrated app-UI mock (portfolio/bill/bank)
- `dialogue` — two-character stage beat, second voice
- `history` — wanted-poster/archival-style cutaway

All knobs (palette, day-chip color logic, font, voice, music mood, niche
queries) live in template DATA in the registry — one template per sub-niche
(market-moves, company-sagas, business-history), selectable per channel from
the panel like every other template. Previews ride the existing Phase C
chain (sample render per template, gallery cards).

## 6. Phased build plan (nothing starts without owner approval)

- **P0 — decision (owner)**: approve the lane + pick the image-enrichment
  option (Cloudflare free signup / Gemini billing / SVG-only v1 with zero
  AI images).
- **P1 — scene system**: character/prop/location primitives + 6–8 seed
  scenes + palette system; style QA against the reference frames.
- **P2 — script brain**: beat schema + LangGraph style-guide prompt (the
  Paper Billions transcript as exemplar); multi-voice dialogue lines.
- **P3 — data layer**: Yahoo chart fetch → chart/board/timeline beats with
  REAL numbers; fictional-brand ticker generator.
- **P4 — family renderer**: full episode assembly (scenes ↔ kinetic ↔ data
  beats, day chips, SRT/karaoke unchanged), preview via the Phase C chain.
- **P5 — thumbnails**: cartoon-bg variant of the thumbnail engine.
- **P6 — pilot**: new channel (owner logs in — note: fleet OAuth 401 must be
  re-authed first, it blocks every YouTube lane), first episode, then the
  template opens for ALL channels via the panel.

## 7. Risks and honest notes

- **YPP "inauthentic content" (July 2025)** — mass-produced templated video
  is under policy scrutiny. Mitigations are structural: original scripts on
  REAL reported events, REAL market data on screen, editorial narrative (not
  re-uploaded/looped content), distinct characters per story. This is the
  same risk the storybook lane already carries; nothing about it is
  disqualifying, but volume-without-substance is the thing to avoid.
- **Copyright/news footage** — we use NONE (all drawn), which is safer than
  the reference itself (they likely borrow press clips).
- **Fictional tickers** (PIKE/QUAY pattern) avoid trademark issues in scene
  art; real brands named in narration are factual reference, fine.
- **Competition window** — the reference channel went viral on upload #2 of
  a 3-video-old channel. The format is hot and the niche is not yet crowded
  with this exact style; moving soon matters more than moving perfectly.
- **Cost** — $0 mandatory (SVG-only v1). Optional: Cloudflare free tier
  (still $0) or Gemini billing ≈$1–2/episode for caricature enrichment.
- The owner's live-loop directive does NOT interact with this lane (this is
  a VOD format; no streaming involved).
