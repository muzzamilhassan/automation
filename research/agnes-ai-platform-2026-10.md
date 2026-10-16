# Agnes AI Platform — API Research (2026-10-08)

## What it is
- **Agnes AI** (agnes-ai.com) — Singapore company (Sapiens AI). AI gateway launched June 2026 (Show HN 2026-06-24).
- One API key gives **text + image + video** models through an **OpenAI-compatible** endpoint (swap base URL, keep OpenAI SDK/fetch code).
- Also exposes Anthropic-style `/v1/messages` and OpenAI `/v1/responses` APIs on the same base.
- Positioning: "free multimodal API" marketing (claimed 4T free calls week), paid Token Plan tiers (Starter/Plus/Pro) above free.

## Core facts
| Item | Value |
|---|---|
| Base URL | `https://apihub.agnes-ai.com/v1` |
| Auth | `Authorization: Bearer KEY` (key shown once, from platform.agnes-ai.com dashboard) |
| Text | `POST /v1/chat/completions` |
| Image | `POST /v1/images/generations` |
| Video | `POST /v1/videos` (async task → poll) |
| Docs | wiki.agnes-ai.com (llms.txt index), key pages: quickstart, tokenplan, pricing, faqs |

## Models
### Text — agnes-3.0-flash (FREE, "promotional")
- 512K context, 65,536 max output, ~252 tok/s (Artificial Analysis 2026-09-11)
- Tool calling ✅, streaming ✅, image input ✅, thinking mode ✅
- **JSON `response_format` NOT documented** (same risk class as our Groq gpt-oss gotcha — must test)
- agnes-2.5-pro = paid: $0.45/M input, $0.90/M output. agnes-3.0-pro "coming soon"
- List price of flash: $0.05/$0.15 per 1M — currently $0

### Image — agnes-image-2.5-flash (FREE, all tiers)
- Sizes as tiers `1K|2K|3K|4K` + ratio `1:1, 3:4, 4:3, 16:9, 9:16, 2:3, 3:2, 21:9`
- 2K 16:9 = 2624x1472 (crop to 1920x1080 downstream); 4K up to 6272x2688 @21:9
- **Image-to-image editing via `extra_body.image` array** (public HTTPS URLs or data-URI base64; first 3 refs free at list price)
- Response: `data[0].url` or `data[0].b64_json` (`return_base64` top-level; `response_format` inside `extra_body` — never top-level, 400 otherwise)
- Generation latency: docs say allow **60–360s** (matters for CI timeouts)
- Models: 2.0-flash / 2.1-flash / 2.5-flash, same price table; list $0.01/img @1K → $0.024 @4K

### Video — agnes-video-2.5-flash (FREE "limited time"; paid sibling 2.5 = $0.025/s @720P)
- **720P ONLY** (16:9 → 1280x704; 9:16 → 720x1280)
- **4–12 second clips** (`seconds` is a STRING `"5"`; default 5)
- `mode`: `text` (t2v) | `keyframe` (first_frame/last_frame URLs, ≥1 required) | `reference` (≤5 image URLs + ≤3 audio URLs, referenced as `<Picture N>`/`<Audio N>` in prompt)
- `videos` input NOT supported in Flash
- Async: `POST /v1/videos` → task id → poll `GET /agnesapi?video_id=...&model_name=agnes-video-2.5-flash` every 1–2s → `status: completed` → top-level `url`
- **Input images must be public HTTPS URLs** (no base64 for video inputs) — we'd need a temp host (uguu.se pattern) or public bucket

## Free-tier limits (Token Plan FAQ)
| Model | Free RPM | Token Plan RPM | Token Plan quota |
|---|---|---|---|
| Text | **10 RPM** | 1000 | Starter 1,500 req/5h · 15k/week (Pro: 30k/5h · 300k/week) |
| Image 1K/2K | **10 / 5 RPM** | 100 / 80 | 4,000 imgs/day |
| Image 3K/4K | 1 RPM | 1 | — |
| Video | **1 RPM** | 5 | 500 seconds/day |

- Multiple keys of the same type share ONE pool (no stacking); free + token-plan pools separate.
- 429 = quota/RPM hit; 5xx = their load → backoff 1s→2s→4s→8s.

## Legal / commercial (from ToS + Privacy Policy)
- **Commercial use: ALLOWED** (ToS contemplates business Applications; Agnes is "technology provider").
- **Ownership:** we own outputs (conditional on non-infringement), BUT Agnes keeps the right to reuse outputs to improve their service.
- **Data training:** FREE tier = our prompts + outputs **may train their models** (opt-out via settings/email where available). Paid Token Plan = opted-out by default.
  - Our payloads (script topics, thumbnail prompts) are not sensitive → acceptable. Don't ever route anything private through the free tier.
- **No SLA on free**; they can change/discontinue free features "with reasonable notice"; 30-day notice for price changes.
- Prohibited: circumventing rate limits, scraping their service (so no multi-account tricks).
- Singapore law, SIAC arbitration; liability cap = fees paid last 6 months (≈ $0 on free).

## Trust check (our history with free tiers)
- ~3.5 months old as a public gateway; HN launch got only 10 points / 3 comments → little community validation.
- Business model = upsell Token Plan; free text/image are "promotional", video flash explicitly "limited time" → **expect it to end**.
- Underlying models are rebadged ("Agnes" brand); they don't disclose base models.
- Same risk family as: ElevenLabs-free (died), FreePD (died), tmpfiles.org trap. Conclusion: **middle/fallback layer only, never sole engine.**

## Fit to OUR stack (where we can use it)
### 1. Script brain — new free fallback layer (BEST fit, low risk)
- Chain today: Gemini flash-lite → Groq gpt-oss → Cerebras → Mistral → HF.
- Add `agnes-3.0-flash` as an extra rung (plain fetch, OpenAI shape — matches existing chain code in yt-daily/yt-deepdive script brains).
- 10 RPM free = plenty for a fallback rung (a few calls/day).
- ⚠️ Must test JSON output first (no documented `response_format`); if JSON is unreliable, use it only for prose steps, keep JSON steps on Groq/Cerebras.

### 2. Image generation — second engine for doc thumbnails / posters (HIGH value)
- Today: Pollinations only (no-key engine; CF→HF rotation blocked on CF token).
- `agnes-image-2.5-flash` free: up to 4K, real aspect ratios (16:9 thumbnails, 9:16 reels), **reference-image editing** = style-locked doc-thumbnail variants (feed 3 refs of our paper+cutout style).
- Volume fits: ~10–20 images/day across brands ≪ free 10 RPM @2K (≈14,400/day theoretical).
- ⚠️ 60–360s possible latency → put behind Pollinations in the chain or give CI a long timeout; text-in-image quality untested (we render text in SVG anyway, AI only does art, so low risk).
- Slot: `gen-doc-thumbnail.py` + poster rotation get a new rung: Agnes → CF → HF → Pollinations (or Pollinations → Agnes; test first).

### 3. Video b-roll — free custom shots for reels/longform (EXPERIMENTAL)
- Today: Pixabay stock (free, generic), Hailuo $0.08/s (specials only), Wan2.2 $36/mo (rejected).
- `agnes-video-2.5-flash` free = custom 4–12s 720P clips with keyframe control (first/last frame = directed shots) — intro hooks, special moments, 9:16 reel backdrops.
- 1 RPM free ≈ fine for a few clips per video; 500s/day if we ever buy Token Plan.
- ⚠️ 720P → upscale to 1080p (ffmpeg lanczos) or accept softness in b-roll cutaways. "Limited time" free → treat as bonus, nothing may depend on it.
- Gotcha: i2v inputs need PUBLIC URLs → upload first-frame to temp host (uguu.se pattern) or a public bucket first.

### 4. NOT usable for
- TTS/voices (no TTS API), music (none), YouTube/social posting APIs (not what Agnes is), translate/dubbing (none documented).

## Wiring plan (when user says go)
1. User creates account at platform.agnes-ai.com → creates API key → pastes key to me (shown once!).
2. I store `AGNES_API_KEY` as GitHub secret (same PAT+gh trick as always) + keep local .env copy.
3. Test script (one-off): text JSON test, 2K 16:9 image sample vs. doc-thumbnail style, one 5s 720P video sample. Verdict on quality before any wiring.
4. If pass: add Agnes rung to script-brain chain + image rotation (fail-closed, next rung on 429/5xx, log which engine won). B-roll helper optional/experimental.
5. Everything runs on GitHub Actions (cloud-only rule); Agnes used from CI and from local test only.

## YouTube thumbnail pattern research (2026-10-08, batch 2 demos)
Method: Playwright on youtube.com search sorted by view count (`&sp=CAMSAhAB`), screenshot evidence in `demos/agnes-thumbs/research-*.png`. User rejected batch-1 dark/cinematic style → batch 2 copies PROVEN winners:

| Pattern (source video / views) | Style recipe | Demo file |
|---|---|---|
| Malama Life 1.3M ("living frugal is living rich") | soft bright café scene + thin white serif, italic accent words | win-omc-elegant-serif.png |
| Anna Bey 1.2M ("Old Money Rules") | elegant person right + spaced serif caps on cream field | win-omc-spaced-caps.png |
| Ali Abdaal 3.5M ("How to Invest for Beginners") | smiling face right + $0→$1M white text + green arrow | win-ic-zero-to-million.png |
| Netflix "Explained: Stock Market" 19M | glowing green/blue ticker wall + centered white wordmark | win-ic-explained-ticker.png |
| James Jani 19M ("Untold Truth About Money") | sepia desert + thoughtful person + overline + giant spaced word | win-mr-sepia-documentary.png |
| Mark Tilbury 9.7M ("Invest As Teen With $0") | silver mentor + fan of cash + white card w/ short imperative | win-mr-mentor-cash-card.png |
| Vox "How Does the Internet Work?" | bold condensed title in white band over real photo | win-tech-vox-photo-title.png |
| Akshay Saini 1.2M ("EVENT LOOOOOOP") | yellow type bands, black text, over dark blurred code | win-tech-code-bands.png |

Key lesson: the old-money niche's winners are SOFT+BRIGHT+elegant (cream/beige, serif, italic) — NOT dark cinematic. All 8 batch-2 images rendered text correctly (short text + explicit space reservation in prompt works). Rate-limit reality: 8 parallel 2K requests → 429 on 3 (free tier); sequential with 30s spacing works. Gallery: demos/agnes-thumbs/winners.html.

## 2026 trend research + batch-3 demos (2026-10-08, same day later)
User: batch-2 winners look "very old" (some were 4–8y old videos). Re-researched 2026-current:

**Web trend reports (vidiq / thumbnailtest / alici.ai / overseeros, 2026):** simplicity dominant; MrBeast shocked-face saturated style now called dated; object-based no-face layouts + split before/after + "burning question" text rising; faces still work but cleaner; A/B decides.

**Live YouTube scan ("this month + most viewed" = `&sp=CAMSBAgDEAE%3D`), screenshots trend2026-*.png:**
- Old money niche is now DOMINATED by semi-realistic ILLUSTRATED story scenes ("POV:" titles) from faceless channels — Invisible Rich (cartoon family-inheritance scenes), Wealth Mindset 99 (illustrated dealership/kitchen), Daniel Wealth (illustrated QUIET LUXURY mansion) — plus equation thumbs: "BORING = RICH" (The Stoic Economist: giant gold serif + single camel coat in spotlight).
- Finance: Ramsey Show "BETTER HABITS = BETTER LIFE" 656K in 1 day = equation format again.
- Tech: Frontend Master = face + AI-gen glowing 3D JS cube with energy ring labeled CALL STACK/TASKS; Federico Bartoli = raw editor screenshot + diagram + webcam bubble.

**2026 recipe families used in batch 3 (all 8 text-perfect):**
1. Illustrated POV story scene + tiny text (t26-omc-pov-story, t26-ic-pov-sleep, t26-mr-pov-debtfree)
2. Equation "X = Y" + one hero object on dark bg (t26-omc-equation "SIMPLE = RICH", t26-mr-equation-safe "HABITS = WEALTH")
3. Minimal glowing object + big numbers (t26-ic-coin-equation "$10 = $10,000")
4. Glowing 3D concept object + orbiting labels (t26-tech-js-energy) / neon object + condensed title (t26-tech-bug)

Gallery: demos/agnes-thumbs/trends2026.html. Sequential 25s spacing → zero 429s. Awaiting user pick of which family to wire.

## Sources
- wiki.agnes-ai.com (llms.txt, quickstart, tokenplan.md, pricing.md, faqs.md, terms-of-service.md, privacy-policy.md, agnes-30-flash.md, agnes-image-25-flash.md, agnes-video-25-flash.md)
- news.ycombinator.com Show HN thread (2026-06-24, via Algolia API)
- Google Cloud customer page (agnes.ai = Singapore, Sapiens AI) — note: agnes.ai workspace product and agnes-ai.com API gateway are the same company per their docs/HN.
