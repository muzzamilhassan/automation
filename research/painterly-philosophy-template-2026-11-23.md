# "Painted Philosophy" template: deep audit of p2fN0saWs68 + how we build our own (2026-11-23)

*Read-only research. Nothing in the pipeline was changed. Companion file with every image-source fact and
citation: [`research/free-painterly-images-2026-11-23.md`](free-painterly-images-2026-11-23.md).*

**Reference:** "Forget Getting Rich — Build the System That Makes Wealth Inevitable | Machiavelli",
channel **The Unseen Self** (@The_Unseen_Self), uploaded 2026-10-17.

**Method:**
- Metadata, chapters and the channel's 23-video catalogue via yt-dlp.
- A 480p copy: frame sheets every 5 s for the first 90 s and every 60 s for the whole video, plus 4 frames
  6 s apart to see the motion.
- Shot and unique-image counting over 1,102 frames (one every 2 s).
- Full local transcript (faster-whisper tiny.en). YouTube's subtitle endpoint returned 429.

---

## 1. Plain-English summary

1. **It is a slideshow of AI oil paintings, done very well.** Dark, warm, Renaissance-style pictures: Florence,
   a recurring bearded nobleman (the "Machiavelli" character), chess, gold coins, harbours, a candlelit study.
   About **48 different pictures** fill **36:45**. Each one **slowly zooms in** and **fades** into the next.
   Pictures come back again and again. There is **not one hard cut**.
2. **The words do the work.** A slow, deep, serious narration (**124 words per minute**, about 4,500 words)
   carries a dark "the system is using you" message. The pictures are mood, not explanation.
3. **The pictures are not free stock.** They are AI-generated with one consistent character. You cannot
   download "this type of image" anywhere. You make it, or you use real old paintings.
4. **$0 is possible for ONE video a day.** Cloudflare Workers AI's free tier (10,000 "neurons" a day) makes
   about 90–170 images a day with FLUX.2 klein, which can keep one face consistent from a reference image.
   Real public-domain paintings (the Met, Rijksmuseum) add authentic cutaways for free. Most other "free" AI
   image services have closed their free tiers in 2025–26 (details in the companion file).
5. **We already own most of the machine.** Narration, word-timed captions, music, chapters, the upload tail
   and a Ken Burns zoom all exist. New work: the image generator (Cloudflare), a picture planner, and one
   full-bleed render composition.
6. **Best channel fit: Quote Quarry** ("Timeless wisdom, self-mastery & human psychology", including dark
   psychology defence and the samurai mindset). Second: Debt-Free Doctrine (old money, quiet wealth).
7. **Monetization risk is real but manageable.** YouTube's "inauthentic content" rule demonetizes "image
   slideshows with minimal narrative" and "generic templates". The defence is a genuinely original,
   researched script, plus a look and voice that change per channel. Painterly (non-realistic) AI art does
   not need the "altered or synthetic" label.

---

## 2. The reference, measured

### 2.1 The channel
| Fact | Value |
|---|---|
| Subscribers | 6,290 |
| Videos | 23, every title "… \| Machiavelli", 25–42 min long |
| Hits | 341K ("NEVER Answer These 5 Questions"), **328K (this one)**, 120K ("How to Speak to Someone More Powerful") |
| Everything else | 600–2,800 views |
| Business model | Mid-roll sale of its own paid course "Machiavelli in WealthCode" (link in the pinned comment) |

**Lesson:** the format is hit-driven. Three topics out of 23 broke out, and all three are **"rules/questions
about power and money"** titles with a curiosity or fear hook. The look keeps people watching; the
**title + thumbnail + first 60 seconds** decide the hit.

### 2.2 The look
| Element | What it does | Measured |
|---|---|---|
| Pictures | AI oil paintings: dark, warm candle and sunset light, heavy shadows | ≈48 unique images in 36:45 |
| Main character | The same bearded nobleman in burgundy and black velvet, in about half the pictures | Consistent face, clothes and hair |
| Settings | Florence skyline with the Duomo, a balcony over a harbour, a study, a chess table, a papal court, a water mill, a market | 8–10 recurring places |
| Motion | Slow push-in zoom on every picture, slight darkening | Median frame change 3.6/255 every 2 s, i.e. very gentle |
| Transitions | Soft crossfade (about 1–2 s), never a hard cut | 1 hard cut detected in 37 min |
| Hold time | One picture on screen for 6–20 s, sometimes up to 2 min | Median 6 s, mean 19 s |
| Reuse | The same picture returns several times in different chapters | 118 shots from 48 images |
| Captions | One short phrase at a time (3–8 words), lowercase, white bold sans with a dark shadow, bottom centre. No karaoke highlight | Every frame |
| On screen | No logo, no chapter cards, no text graphics. Just picture + caption | |
| Grade | Strong vignette, crushed blacks, warm highlights | |

### 2.3 The script (from the transcript)
- **Hook (0:00–1:15), pure dread and second person:** "The system doesn't need you to be poor, it needs you
  to be desperate enough to keep working… You spent your life building someone else's empire, and they
  convinced you to be grateful for the privilege." Then three parallel examples: "The man who builds the
  mansion may never afford to live inside it…"
- **8 chapters** (in the description): The illusions of success → Understanding power structures → The
  strategy of systems → Intelligence as a trap → Ownership versus participation → The danger of display →
  Achieving independence → The 90-day transformation.
- **Bridges between chapters** are the retention trick: "Yet recognizing the system is only the beginning,
  because the next trap is even more deceptive."
- **Machiavelli is a lens, not a lecturer:** 23 mentions in 4,543 words, plus Rockefeller, Carnegie and
  J.P. Morgan as examples.
- **Ends with a practical 90-day plan** (days 1–30 audit, 31–60 strengthen, 61–90 act), then a subscribe ask
  and a closing aphorism.
- **Pace:** 124 wpm, a slow, deep male read with long pauses.

---

## 3. Where the pictures can come from ($0)

The full table, numbers and citations are in the companion file. In short:

| Source | Free amount | Good for | Verdict |
|---|---|---|---|
| **Cloudflare Workers AI, FLUX.2 klein 4B** | 10,000 neurons/day ≈ 90–170 images/day | The recurring character: up to 4 reference images keep one face | **Main source** |
| **Cloudflare Workers AI, FLUX.1 schnell** | ≈173 images/day (shares the same 10,000) | Scenery (skylines, harbours, rooms). No seed or reference | Scenery |
| **The Met Open Access API** | CC0, no key | Real Renaissance paintings as cutaways | Free extras |
| **Rijksmuseum** | CC0, API + data dumps | Merchants, ships, coins, candlelit interiors | Free extras |
| Gemini "Nano Banana" | **No free image tier** | Best consistency | Paid fallback: about $0.84/video |
| Pollinations | **Now needs a paid key** (since 2026-11-01) | | ✗ |
| Together / HF free credits | **Gone** | | ✗ |
| Kaggle GPU | 30 h/week; ToS reportedly bars non-ML/commercial use | | ✗ not recommended |

**Plan per 40-minute video (about 50 images):** about 35–40 character shots (klein + one anchor portrait),
about 10 scenery shots (schnell) and 5–10 real CC0 paintings. That is about 3,100–5,000 neurons, half the
daily free cap. Every image is cached, so a failed render never pays twice.

**Limits to know:**
- The free cap is **per Cloudflare account**, so this covers about one video a day for one channel.
- Cloudflare says nothing about needing a card to sign up (UNVERIFIED).
- Models churn: Cloudflare deprecated two image models this week. The generator must be switchable.

**Side finding (bug in our repo):** `explainer/media-assets.mjs` still calls the Met's old `/v1/search`
(now **410 Gone**; the working endpoint is `/v1.1/search`) and Pollinations without a key (now **401**).
Both fetchers fail silently today.

---

## 4. What we already have vs what is new

| Piece | Status |
|---|---|
| Script brain (outline → chapters, approved in the Inbox) | **Have** (doc lane) |
| Deep, slow narration with word timings | **Have** (Kokoro/Edge voice lane, `voiceProfile` per channel) |
| Phrase captions from word timings | **Have** (SRT + caption renderers) |
| Music bed, chapters in the description, upload tail | **Have** |
| Ken Burns zoom | **Have** (`explainer/remotion/kits.tsx`) |
| Wikimedia / Openverse / Met fetchers | **Have, but the Met fetcher is broken** (above) |
| **Picture planner:** script → about 50 picture prompts (characters, places, mood), with reuse | **New** (one LLM call per chapter; the same pattern as the diagram planner) |
| **Cloudflare image client** with an anchor portrait, cache and switchable provider | **New** |
| **Full-bleed "oil painting" render** (zoom + crossfade + vignette + phrase captions) | **New**: one Remotion composition, simpler than Living Diagram |
| Registry template + gallery preview + assignment | **Have** (same steps as Lecture Notes) |

---

## 5. Our own design (not a clone)

Same grammar (paintings, slow zoom, quiet captions, slow voice), own identity per channel, all from the kit:

- **Painting style is DATA:** "Renaissance oils" for Quote Quarry; it could be "Dutch Golden Age", "Edo
  woodblock / samurai ink" or "Roman marble" for others. The prompt style lives in the template/kit, never
  in code (no-static-maps rule).
- **Our own recurring figure per channel:** an original "Mentor" character generated once and saved as that
  channel's anchor portrait. Never a real person's likeness as a narrator (YouTube's "AI personas on
  sensitive topics" line). Historical figures appear only as subjects.
- **Small upgrades over the reference:** a quiet chapter title card (one line, letter-spaced) at each of the
  8 chapters, which also matches the description chapters; caption phrases timed to the voice; a 1.06×
  zoom with alternating direction instead of always pushing in.
- **Script rules carried into the planner:** a 60-second dread/curiosity hook, 6–8 chapters with bridge
  lines, one historical example per chapter, and a practical plan at the end. 25–40 min at about 125 wpm
  (3,100–5,000 words).

---

## 6. Build plan (proposal)

| Step | What | Proof |
|---|---|---|
| **P0** (owner, 5 min) | Create a free Cloudflare account and an API token with Workers AI permission. Add `CF_ACCOUNT_ID` and `CF_AI_TOKEN` as GitHub secrets | Token test call |
| **P1** | 10-image style test: one anchor portrait + 9 scenes with klein and schnell. Does the face hold and does it read as oil painting? Fix the Met fetcher | 10 images shown to the owner |
| **P2** | Local 2-minute demo: picture planner + full-bleed composition + Quote Quarry voice and captions | MP4 for the owner |
| **P3** | Registry template "Painted Philosophy" (doc_render `painted`) + gallery preview + cloud dry run on GitHub, no upload | Cloud MP4 |
| **P4** | Pilot: assign to one channel (Quote Quarry recommended), first real doc day through the Inbox | Live video |

**Cost:** $0 for one video a day. If more channels want it daily, either more Cloudflare accounts (one per
channel owner) or the paid fallback at about $0.84/video.

---

## 7. Risks
- **Free-tier churn:** keep a provider switch and cache everything.
- **Inauthentic-content policy:** original researched scripts, chapters, a per-channel look, and never the
  same images across channels. Reuse inside one video is fine (the reference does it).
- **Face drift with 4-step klein:** the P1 test answers it before any build.
- **Hit-driven format:** expect most videos to sit low. The win is in titles and thumbnails; plan to test
  "rules/questions about power" titles first.

## 8. Evidence
- Frame sheets, motion strip, transcript (`transcript.json`), catalogue (`chan.txt`): session scratchpad
  `p2f/`. Not committed, because they are a third party's content.
- Image-source citations: `research/free-painterly-images-2026-11-23.md`.
