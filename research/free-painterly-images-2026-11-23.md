# Free painterly "Renaissance oil painting" images for a GitHub Actions pipeline

Date read: 2026-11-23 for every source (unless noted). Read-only research. No code changed.
Scope: ~40-60 images per 30-40 min video, $0 budget, GitHub Actions on Ubuntu, no GPU, laptop off.
Reference video: "Forget Getting Rich — Build the System That Makes Wealth Inevitable | Machiavelli" by channel "The Unseen Self" (YouTube oEmbed, [S1]).

---

## Summary (read this first)

1. **Only one AI source is truly free, server-callable and commercial-safe today: Cloudflare Workers AI.** It gives 10,000 free neurons per day on the Free plan [S2].
2. **Best model there: FLUX.2 [klein] 4B.** It is Apache-2.0 (commercial OK) [S7], takes up to 4 reference images (character consistency) [S5], and costs about 60-110 neurons per 16:9 image. That is roughly **90-170 free images per day**, so **one 40-60 image video per day fits**.
3. FLUX.1 [schnell] on Cloudflare is cheaper (about 58 neurons at 4 steps, so about 170/day) but it is text-only, with no seed and no reference image [S3][S4]. Use it for scenery without the character.
4. **Gemini / Nano Banana has NO free API tier for images.** Every image model says "Not available" on the free tier [S10]. Cheapest paid path is $0.0168 per image in batch mode (about $0.84 per 50-image video).
5. **Hugging Face free users now get $0 credits** [S12]. **Together's free FLUX endpoint is gone** (removed 2025-12-23) [S14]. **Pollinations now needs a secret key and a balance**; no free daily grant is documented [S16][S17].
6. Kaggle GPUs could run FLUX, but Kaggle's terms appear to forbid non-ML / commercial use (UNVERIFIED on the live page). Not recommended.
7. **Public-domain paintings are a strong free supplement.** The Met (no key, CC0, 80 req/s) [S20] and the Rijksmuseum (PD/CC0, commercial OK) [S22] are verified. A real Santi di Tito Machiavelli portrait exists on Wikimedia Commons at 1244x1600 [S25], but Italian heritage law may restrict commercial reuse [S26].
8. **YouTube risk is about the format, not about AI.** The policy names "Image slideshows ... with minimal or no narrative, commentary, or educational value" and "AI-generated content made with generic or unoriginal templates" as not monetizable [S28]. A new-looking section also bans monetizing "AI personas" that give **financial** advice [S28]. Painterly, clearly non-realistic AI art should not need the "altered or synthetic" label [S29].

**Recommended $0 combination:** Cloudflare FLUX.2 klein 4B for about 40 images (character shots with a reference image) + FLUX.1 schnell for about 10 scenery shots + 5-10 real CC0 paintings from The Met / Rijksmuseum. Total cost about 5,000-6,500 neurons per video, which is under the 10,000/day free cap.

---

## Sub-questions

1. Which AI image APIs are free, callable from a server, and allow commercial use? How many images per day?
2. Which of them keep one character consistent?
3. Which public-domain painting APIs are free and commercial-safe? Is there a real PD Machiavelli portrait?
4. What is the YouTube monetization and disclosure risk for this format?

---

## 1. Free AI image generation

### 1a. Cloudflare Workers AI (VERIFIED, the winner)

Facts from Cloudflare's pricing page [S2], read 2026-11-23:
- "10,000 Neurons per day at no charge." Resets daily at 00:00 UTC.
- The Free plan gets this allocation. Free users cannot go past it; they must upgrade to Workers Paid.
- Paid overage: $0.011 per 1,000 neurons.

Image model prices (verbatim from [S2]):

| Model | Neuron price | Licence | Reference images |
|---|---|---|---|
| `@cf/black-forest-labs/flux-1-schnell` | "4.80 per 512x512 tile; 9.60 per step" | Apache-2.0 [S8] | None. Input schema allows only `prompt` and `steps` (max 8, default 4); "additional properties: not allowed", so **no seed and no width/height** [S3][S4] |
| `@cf/black-forest-labs/flux-2-klein-4b` | "5.37 per input tile; 26.05 per output tile" | Apache-2.0, "Open weights available for commercial use" [S7] | **Up to 4** (`input_image_0..3`), each must be "smaller than 512x512" [S5] |
| `@cf/black-forest-labs/flux-2-klein-9b` | "1363.64 per first MP; 181.82 per subsequent MP; 181.82 per input image MP" | Non-commercial licence (per BFL model card [S7]) | Up to 4 [S6] |
| `@cf/black-forest-labs/flux-2-dev` | "18.75 per input tile, per step; 37.50 per output tile, per step" | BFL terms link [S9] | Up to 4 [S6b] |
| `@cf/leonardo/lucid-origin` | "636.00 per 512x512 tile; 12.00 per step" | Leonardo (terms not checked, UNVERIFIED) | Not checked |
| `@cf/leonardo/phoenix-1.0` | "530.00 per 512x512 tile; 10.00 per step" | Leonardo (UNVERIFIED) | Not checked |
| `stable-diffusion-xl-lightning` | "$0.00 per step", but "deprecation date of 11/20/2026" [S11a] | — | img2img via `image_b64` + `strength` |
| `dreamshaper-8-lcm` | Listed "Deprecated", date 11/20/2026 [S11b] | — | img2img |

FLUX.2 klein 4B details [S5]: width "default 1024 Range: 256-1920", height "default 768 Range: 256-1920", steps "fixed at 4". Example prompt: "take the subject of image 1 and style it like image 0".

**Images per day (my arithmetic, from [S2] prices).** Cloudflare does not say how partial tiles are counted (UNVERIFIED). So I give a low and a high estimate.

| Model @ ~1024x576 | Neurons per image | Free images/day | 50-image video/day? |
|---|---|---|---|
| FLUX.1 schnell, 4 steps (assumes 1024x1024 output = 4 tiles; output size UNVERIFIED) | 4x4.80 + 4x9.60 = **57.6** | **~173** | Yes |
| FLUX.1 schnell, 8 steps | 19.2 + 76.8 = **96** | ~104 | Yes |
| FLUX.2 klein 4B, 1 reference image, 2.25 tiles (pixel-exact) | 58.6 + 5.37 = **~64** | ~156 | Yes |
| FLUX.2 klein 4B, 1 reference image, 4 tiles (rounded up per side) | 104.2 + 5.37 = **~110** | ~91 | Yes |
| FLUX.2 klein 4B at 1280x720 (3-6 tiles) | ~84-162 | ~60-118 | Yes, tight at high end |
| FLUX.2 klein 9B, 1 MP | ~1,364+ | ~7 | No |
| FLUX.2 dev, 4 tiles, 25 steps (step default UNVERIFIED) | ~3,750 | ~2 | No |
| Leonardo Lucid Origin, 4 tiles, ~25 steps | ~2,844 | ~3 | No |

- Calling from GitHub Actions: plain REST, `POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/{model}` with a Bearer token that has "Workers AI - Read" and "Workers AI - Edit" [S13]. No Worker deploy needed.
- Rate limit: text-to-image "default limit of 720 requests per minute" [S13b]. Not a constraint.
- Card required? The pricing pages do not say. **UNVERIFIED** (widely reported that the Free plan needs no card).
- Commercial use: Cloudflare says customers "retain all applicable intellectual property or other proprietary rights in Inputs and Outputs" and must follow the model provider's own terms [S15]. BFL's terms say "We claim no ownership rights in and to Your Content", but forbid "representing that the Output is entirely human-generated" and require consent for real people [S9].
- Quality caveat: FLUX.1 schnell on Cloudflare has no width/height control, so 16:9 needs a crop. 1024-wide frames will be upscaled for 1080p. FLUX.2 klein lets you ask for 1920x1080 directly (more tiles, fewer images).

### 1b. Pollinations.ai (VERIFIED: no longer free/keyless)

- "Use a secret key from enter.pollinations.ai for generation requests." [S16]
- "Since November 1, 2026, a `pk_` key only identifies your app; requests that send one get `401`." [S16]
- "`gen.pollinations.ai` requires a bearer token for generation requests, so a plain client-side `fetch` with no auth returns 401 unless it is served from cache." [S16]
- Billing: "Prepaid credit: simple pay-as-you-go, priced in dollars." You can add balance "by contributing, without a credit card" and via "Quests" [S17]. **No free daily grant is documented. Size of quest rewards: UNVERIFIED.**
- Rate limits: secret keys show "No rate limits" [S17].
- Watermark / logo, commercial-use terms for outputs: **not documented anywhere I could read. UNVERIFIED.**
- Privacy: generated media is "uploaded unlisted ... expires after 30 days" [S16].
- Verdict: not a dependable $0 source any more.

### 1c. Google Gemini API / Nano Banana / Imagen (VERIFIED: no free image tier)

From the pricing page [S10] (ai.google.dev now redirects to aistudio.google.com):

| Model | Free tier | Paid (standard) |
|---|---|---|
| Gemini Nano Banana 2.1 | "Not available" | "$0.0336 per 1K image"; batch "$0.0168 per 1K image" |
| Gemini 3.1 Flash Image (Nano Banana 2) | "Not available" | "$0.067 per 1K image" |
| Gemini 3.1 Flash Lite Image | "Not available" | "$0.0336 per 1K resolution image" |
| Gemini 3 Pro Image (Nano Banana Pro) | "Not available" | "$0.134 per 1K/2K image" |
| Gemini 2.5 Flash Image | "Not available" | "$0.039 per image"; batch "$0.0195"; shuts down "March 15, 2027" |
| Imagen 4 | Not found on the page I could read. **UNVERIFIED** | — |

- Watermark: "All generated images include a SynthID watermark." [S11]
- Consistency: Nano Banana 2.1 / 3.1 Flash Image take "up to 4 character images for consistency"; 3 Pro Image up to 5 [S11]. This is the best consistency of any option, but it is paid.
- Paid fallback cost: 50 images x $0.0168 = **about $0.84 per video** (batch).

### 1d. Hugging Face Inference Providers (VERIFIED: $0 for free users)

- Free users: monthly credits "None"; they must buy credits or upgrade [S12].
- PRO: "$2.00" monthly credits [S12]. PRO subscription price not read (UNVERIFIED).
- A HF staff member said on the forum that free credits were removed due to account-farm abuse [S12b] (forum, secondary).
- Free ZeroGPU Spaces exist but their free quota was not checked. **UNVERIFIED.**

### 1e. Together AI, fal.ai, Replicate (VERIFIED: no free FLUX)

| Provider | Free FLUX? | Cheapest relevant price |
|---|---|---|
| Together AI | No. `FLUX.1-schnell-free` removed **2025-12-23**; paid `FLUX.1-schnell` removed **2026-08-19** [S14] | FLUX.2 [dev] "$0.0154 per image" [S14b] |
| fal.ai | No free credits stated [S18] | FLUX.1 [schnell] "$0.003 per megapixel" [S18] |
| Replicate | No free usage stated [S19] | flux-schnell "$3.00 / thousand output images" [S19] |

- fal or Replicate would cost about **$0.15-$0.30 per 50-image video**. Not $0, but the cheapest paid backup.

### 1f. Kaggle free GPU (PARTLY UNVERIFIED, not recommended)

- Weekly GPU quota "30 hours or sometimes higher" (Kaggle GPU tips page, seen only in a search snippet; page is JavaScript-only). **UNVERIFIED on the live page.**
- Automation is technically possible: `kaggle kernels push -p <FOLDER>` runs a notebook, `kaggle kernels status`, `kaggle kernels output` fetches files; `--accelerator` accepts e.g. `NvidiaTeslaT4`, `NvidiaL4` [S27].
- Terms: search snippets of Kaggle's Acceptable Use Policy list "activity unrelated to ML data science" as abuse, and the Terms reportedly limit use to "internal, personal, non-commercial use". **UNVERIFIED** (pages render only with JavaScript). This makes a monetized daily image farm risky.
- Licences: FLUX.1 [schnell] is Apache-2.0, "can be used for personal, scientific, and commercial purposes" [S8]. FLUX.1 [dev] uses the "FluxDev Non-Commercial License", but its card says "Generated outputs can be used for personal, scientific, and commercial purposes as described in the" licence [S8b]. Full licence not read.
- Project note: the repo already parked a Kaggle voice lane on 2026-11-23 (owner memory). Same fragility applies.

### 1g. Character consistency (one nobleman across 50 images)

| Option | Mechanism | Free? |
|---|---|---|
| Cloudflare FLUX.2 klein 4B | Up to 4 reference images (<512x512) per call [S5] | Yes |
| Cloudflare FLUX.2 dev / klein 9B | Up to 4 references [S6][S6b] | Only ~2-7 images/day |
| Cloudflare FLUX.1 schnell | None; no seed allowed [S4] | Yes, but no consistency |
| Gemini Nano Banana 2.1 / 3.1 Flash Image | "up to 4 character images for consistency" [S11] | No (paid) |
| Pollinations | Image inputs via `/v1/images/edits` style calls; no image seed documented [S16] | No |
| SDXL-Lightning img2img on Cloudflare | `image_b64` + `strength` [S11a] | Deprecated 11/20/2026 |

Practical recipe: make one "anchor" portrait of the nobleman, shrink it below 512x512, and pass it as `input_image_0` on every character shot. Prompt: "the man from image 0, dark Renaissance oil painting, candlelit study ...". Quality of consistency at 4 steps is **UNVERIFIED** until tested.

---

## 2. Public-domain real paintings (no AI)

| Source | Licence | Key? | Rate limit | Resolution | Commercial / YouTube | Status of my check |
|---|---|---|---|---|---|---|
| The Met Collection API | CC0 for data; images flagged `isPublicDomain` are public domain [S20] | "we do not require ... an API key" [S20] | "limit request rate to 80 requests per second" [S20] | `primaryImage` (original JPEG) and `primaryImageSmall`; pixels not stated [S20] | Open Access policy page returned 429 to me. CC0 implies yes. **Policy page UNVERIFIED** | API verified live: `/v1/search` now returns **410 Gone**; `/v1.1/search` works [S20b] |
| Art Institute of Chicago API + IIIF | CC0 for PD images, `is_public_domain` flag (search snippets only) | None reported | ~60/min per IP reported | IIIF, build URL from `config.iiif_url` + `image_id` | Likely yes | **All AIC pages returned 403 to my fetcher. UNVERIFIED** [S21] |
| Rijksmuseum | "Public Domain or Creative Commons Zero (CC0)" items "can be used freely", "including commercially, without asking permission" [S22] | Not stated | Not stated | "high-resolution photographs of 600,000 collection objects" [S22b] | Yes (verified) | APIs: Search API, OAI-PMH, LDES, full data dumps [S22c] |
| National Gallery of Art (US) | Dataset CC0; "Images and media files are not included in the dataset" [S23] | No API; CSV on GitHub [S23] | n/a | Image links in data | Open-access policy page returned 403. **UNVERIFIED** | Dataset verified |
| Wikimedia Commons | Per-file. PD-Art tag covers faithful photos of 2-D PD works; underlying work must be PD in US and origin country [S26] | No key for read API | Not checked | Santi di Tito Machiavelli: **1244x1600** [S25] | Usually yes, but see Italy caveat | commons.wikimedia.org DNS failed for me; used api.wikimedia.org mirror |
| Europeana | Per-item rights statements | wskey (UNVERIFIED) | UNVERIFIED | Varies | Varies per item | **Pages returned 403. UNVERIFIED** |

**Machiavelli portraits (public domain artworks):**
- Commons search found [S25b]: "Portrait of Niccolò Machiavelli by Santi di Tito.jpg", a head crop, a Palazzo Vecchio in-situ photo, two Cristofano dell'Altissimo versions, and an 1894 engraving after Stefano Ussi.
- Santi di Tito lived "5 December 1536 – 25 July 1603" [S24], so the painting is long out of copyright.
- The Met has no Machiavelli portrait: a `q=Machiavelli` search returns 4 objects (e.g. a 1936 woodcut, a 16th-century bit boss), none a portrait [S20b].
- **Italy caveat (real risk):** Italian file pages on Commons cite the Cultural Heritage Code (Legislative Decree 42/2004): "A further authorization by the Italian Ministry ... is required for reproduction for any other purpose, and particularly for commercial use" [S26]. Wikimedia's own blog called reuse of Italian heritage images "more difficult" [S26b]. Both Machiavelli portraits are in Florentine public collections (Palazzo Vecchio / Uffizi area). Whether the code applies to a YouTube video made abroad is a legal question. **UNVERIFIED; treat as a risk.** Safer: use it as a style reference only, or use non-Italian museum paintings (Met, Rijksmuseum, NGA, AIC).

**Fit for the theme:** The Rijksmuseum is rich in merchants, ships, coins and candlelit Dutch interiors. The Met and NGA hold Florentine Renaissance portraits. Real paintings will not show one recurring character, so use them as cutaways, not as the main thread.

---

## 3. YouTube monetization and disclosure risk

### 3a. Inauthentic content (YPP policy) [S28]

- July 15, 2025 notice: "We are also renaming this policy from 'repetitious content' to 'inauthentic content.'" "There is no change to our reused content policy."
- Not monetizable (examples): "Image slideshows, templated storylines, or scrolling text with minimal or no narrative, commentary, or educational value"; "AI-generated content made with generic or unoriginal templates giving the impression of mass production"; "Videos where characters are put in the same situation over and over again with the same outcome".
- Allowed: "Same intro and outro for your videos, but the bulk of your content is different"; "a series following a set of characters across episodes"; each video needs "a distinct storyline, focus, or concept".
- The page now also has **"Unsatisfying or Off-putting Content"** (bans "emotionally manipulative formulas" and content without "a cohesive storyline") and **"AI Personas Related to Sensitive Topics"**. The latter covers AI personas that present as "a human expert providing advice" on topics including **finances**, and says such "channels ... will not be allowed to monetize."
- **2026 dating:** the page shows no notice dated 2026. Third-party blogs claim these sections were added on July 16, 2026. **Date UNVERIFIED**; the sections themselves are verified on the live page.

What it means here:
- The reference format (painted stills + slow zoom + one-line captions) is fine **only if** the narration carries real, distinct commentary each episode. A thin script over a slideshow is exactly the named example.
- **Specific risk for a money channel:** a recurring AI "Machiavelli" nobleman who speaks as an expert giving wealth advice could be read as an "AI persona" on finances. Keep him as an illustrated historical subject, not a narrator-advisor persona. Interpretation is mine; YouTube does not address this exact case.

### 3b. Altered or synthetic content label [S29]

- Must disclose when AI content "appears realistic", e.g. "Makes a real person appear to say or do something they didn't do" or "Generates a realistic scene that didn't actually occur".
- No need: "Creators don't need to disclose non-realistic content that's made with AI"; examples include fantasy and fully animated scenes, and "vintage effects".
- Painterly oil-painting stills are stylized, so **likely no label needed**. YouTube does not name painterly historical art explicitly (my inference). If any frame looks photoreal, or shows the real Machiavelli doing something he never did in a realistic way, tick the box.
- Separately, BFL terms forbid "representing that the Output is entirely human-generated" [S9]. Never claim the art is hand-painted.

---

## 4. Comparison table

| Source | Free amount per day | Images per 40-min video possible? | Card needed | Commercial OK | Character consistency | Verdict |
|---|---|---|---|---|---|---|
| Cloudflare FLUX.2 klein 4B | 10,000 neurons = ~90-170 imgs [S2] | Yes, 1 video/day | UNVERIFIED (likely no) | Yes, Apache-2.0 [S7] + CF output terms [S15] | Yes, 4 refs [S5] | **PRIMARY** |
| Cloudflare FLUX.1 schnell | ~104-173 imgs (shares the same 10k) [S2] | Yes | UNVERIFIED | Yes, Apache-2.0 [S8] | No (no seed, no refs) [S4] | **Scenery filler** |
| Cloudflare FLUX.2 dev / klein 9B / Leonardo | ~2-7 imgs | No | UNVERIFIED | dev: BFL terms; 9B: non-commercial [S7] | Yes (refs) | Hero image only, or skip |
| Cloudflare SDXL-Lightning / Dreamshaper | $0 per step | — | — | — | img2img | **Deprecated 2026-11-20** [S11a][S11b] |
| Pollinations | No documented free grant [S16][S17] | Only with paid/quest balance | No card for quests | UNVERIFIED | Image edits only | Drop |
| Gemini / Nano Banana | 0 (free tier "Not available") [S10] | Paid only (~$0.84/video batch) | Yes (billing) | Yes, with SynthID [S11] | Best (4-5 character refs) [S11] | **Paid fallback** |
| Hugging Face | $0 for free users [S12] | No | Credits purchase | Per model | Per model | Drop |
| Together AI | Free FLUX removed 2025-12-23 [S14] | No | UNVERIFIED | Yes | FLUX.2 refs | Drop |
| fal.ai / Replicate | None stated [S18][S19] | Paid ~$0.15-0.30/video | UNVERIFIED | Per model | Per model | Cheap paid backup |
| Kaggle GPU + FLUX | ~30 GPU h/week (UNVERIFIED) | Yes in theory | Phone verify (UNVERIFIED) | ToS likely forbids non-ML/commercial (UNVERIFIED) | Yes (self-hosted) | Not recommended |
| The Met API | Unlimited (80 req/s) [S20] | Yes, as cutaways | No | Yes, CC0 PD images | No | **Supplement** |
| Rijksmuseum | Unlimited, rate not stated [S22c] | Yes, as cutaways | No (key UNVERIFIED) | Yes [S22] | No | **Supplement** |
| AIC / NGA / Europeana | Free (details UNVERIFIED) | Yes, as cutaways | No | Likely (UNVERIFIED) | No | Optional |
| Wikimedia Commons (Santi di Tito) | Free | 1 portrait | No | PD-Art, but Italy caveat [S26] | Real face | Use with care |

---

## 5. Recommended $0 combination (per video, ~50 images)

1. **~35-40 character shots:** Cloudflare FLUX.2 klein 4B, 1280x720 or 1024x576, one anchor portrait passed as `input_image_0`. About 64-110 neurons each, ~2,500-4,400 neurons.
2. **~10 scenery shots** (Florence skyline, ships, coins, chessboard, candlelit desk): Cloudflare FLUX.1 schnell, 4 steps, cropped to 16:9. ~58 neurons each, ~580 neurons.
3. **~5-10 real paintings:** The Met (`/v1.1/search?hasImages=true&q=...`, keep only `isPublicDomain=true`) and Rijksmuseum (PD/CC0 only). 0 neurons.
4. Total: about **3,100-5,000 neurons per video**, inside the 10,000/day cap with retry headroom.
5. **Cache every image** in the repo/artifact store. A failed render should never regenerate images.
6. Paid escape hatch if quality fails: Nano Banana 2.1 batch at $0.0168/image (~$0.84/video) [S10], or fal FLUX.1 schnell at $0.003/MP [S18].

---

## 6. Risks and gaps

- **One account = about one video per day.** The 10,000 neurons are per account. Many channels using this lane will not fit. Do not open extra accounts to dodge the cap (likely a ToS issue; not checked).
- **Model churn.** Cloudflare deprecated two image models on 2026-11-20. Together removed both FLUX schnell endpoints in 2025-2026. Build a provider switch.
- **Tile counting is not documented.** Neuron cost per 16:9 image could be up to 1.8x my low estimate. Measure on day one.
- **FLUX.1 schnell on Cloudflare has fixed output size and no seed.** Re-running gives a new image. Store outputs.
- **Klein 4B at 4 steps may look less "oil painting" than paid models.** Quality is UNVERIFIED until a test batch is reviewed.
- **Italian Cultural Heritage Code** may restrict commercial reuse of photos of Florentine-held paintings, including the Santi di Tito Machiavelli.
- **YouTube "inauthentic content" + "AI personas on finances".** A finance-flavoured Machiavelli channel with an AI nobleman persona is near both lines. The script must carry the value.
- **Real-person likeness.** BFL terms require consent for real-person depictions [S9]. Machiavelli died in 1527, but treat him as a stylized historical figure, never as realistic.
- **Pages I could not read:** AIC, NGA open-access policy, Europeana, Kaggle ToS/AUP/quota, Met Open Access policy page (429), Commons file page (DNS). All items depending on them are marked UNVERIFIED.

## 7. Open questions

1. Does Cloudflare Workers Free require a payment method at signup? (UNVERIFIED)
2. How does Cloudflare count partial 512x512 tiles for 1024x576 or 1280x720?
3. What is the output size of `@cf/black-forest-labs/flux-1-schnell`?
4. Is a 4-step klein 4B character reference strong enough for a recognisable recurring nobleman across 40 frames? Needs a 10-image test.
5. Are Leonardo models on Cloudflare licensed for commercial use?
6. When exactly were the "AI Personas Related to Sensitive Topics" and "Unsatisfying or Off-putting Content" sections added to the YPP page?

---

## 8. Sources (all read 2026-11-23)

1. [S1] https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=p2fN0saWs68&format=json — reference video title and channel ("The Unseen Self").
2. [S2] https://developers.cloudflare.com/workers-ai/platform/pricing/ — 10,000 free neurons/day, Free plan included, all image model neuron prices.
3. [S3] https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/ — schnell params (steps max 8, default 4), BFL terms link, text-only.
4. [S4] https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/schema-input.json — only `prompt` and `steps`; no additional properties (no seed/size).
5. [S5] https://developers.cloudflare.com/changelog/post/2026-01-15-flux-2-klein-4b-workers-ai/ — klein 4B: 4 refs <512x512, width/height 256-1920, fixed 4 steps.
6. [S6] https://developers.cloudflare.com/changelog/post/2026-01-28-flux-2-klein-9b-workers-ai/ — klein 9B reference-image params (via search summary).
7. [S6b] https://blog.cloudflare.com/flux-2-workers-ai — FLUX.2 dev multi-reference "up to 4", output up to 4 MP.
8. [S7] https://huggingface.co/black-forest-labs/FLUX.2-klein-4B — Apache-2.0, commercial use; 9B under non-commercial licence.
9. [S8] https://huggingface.co/black-forest-labs/FLUX.1-schnell — Apache-2.0, commercial use OK.
10. [S8b] https://huggingface.co/black-forest-labs/FLUX.1-dev — FluxDev Non-Commercial License; outputs commercial-use statement.
11. [S9] https://bfl.ai/legal/terms-of-service — output ownership, no "human-generated" claims, real-person consent.
12. [S10] https://aistudio.google.com/docs/pricing — all Gemini image models "Not available" on free tier; per-image prices; 2.5 Flash Image shutdown date.
13. [S11] https://aistudio.google.com/docs/image-generation — SynthID on all images; character reference limits.
14. [S11a] https://developers.cloudflare.com/workers-ai/models/stable-diffusion-xl-lightning/ — $0 per step, deprecated 11/20/2026, img2img params.
15. [S11b] https://developers.cloudflare.com/workers-ai/models/dreamshaper-8-lcm/ — deprecated 11/20/2026.
16. [S12] https://huggingface.co/docs/inference-providers/pricing — Free users "None" credits; PRO $2.00.
17. [S12b] https://discuss.huggingface.co/t/did-huggingface-remove-the-credits-given-to-free-users/189971 — staff note on removal (forum, secondary).
18. [S13] https://developers.cloudflare.com/workers-ai/get-started/rest-api/ — REST endpoint and token permissions.
19. [S13b] https://developers.cloudflare.com/workers-ai/platform/limits/ — 720 req/min for text-to-image.
20. [S14] https://docs.together.ai/docs/deprecations — FLUX.1-schnell-free removed 2025-12-23; FLUX.1-schnell 2026-08-19.
21. [S14b] https://www.together.ai/pricing — FLUX.2 prices; no schnell listed.
22. [S15] https://www.cloudflare.com/service-specific-terms-developer-platform/ — customer keeps rights in outputs; third-party model terms apply.
23. [S16] https://gen.pollinations.ai/llms-full.txt — secret key required, pk_ 401 since 2026-11-01, no-auth returns 401, media expiry.
24. [S17] https://github.com/pollinations/pollinations — prepaid credit, quests, sk_ "No rate limits".
25. [S18] https://fal.ai/pricing — FLUX.1 schnell $0.003/MP; no free credits stated.
26. [S19] https://replicate.com/pricing — flux-schnell $3.00 per 1,000 images.
27. [S20] https://metmuseum.github.io/ — no key, 80 req/s, CC0, isPublicDomain, primaryImage fields.
28. [S20b] https://collectionapi.metmuseum.org/public/collection/v1.1/search?hasImages=true&q=Machiavelli — 4 results, no portrait; v1 search returned 410.
29. [S21] https://api.artic.edu/docs — returned 403; AIC facts from search only (UNVERIFIED).
30. [S22] https://data.rijksmuseum.nl/policy/ — PD/CC0 free incl. commercial; attribution requested.
31. [S22b] https://data.rijksmuseum.nl/ — 600,000 high-res object photos.
32. [S22c] https://data.rijksmuseum.nl/docs/ — Search API, OAI-PMH, LDES, data dumps.
33. [S23] https://github.com/NationalGalleryOfArt/opendata — CC0 CSV dataset, images not included.
34. [S24] https://en.wikipedia.org/wiki/Santi_di_Tito — painter's dates; Machiavelli portrait in gallery (secondary).
35. [S25] https://api.wikimedia.org/core/v1/commons/file/File:Portrait_of_Niccolò_Machiavelli_by_Santi_di_Tito.jpg — 1244x1600 original.
36. [S25b] https://api.wikimedia.org/core/v1/commons/search/page?q=Machiavelli%20portrait&limit=10 — list of Machiavelli portrait files.
37. [S26] https://commons.wikimedia.org/wiki/Template:PD-art (via search summary) — PD-Art scope; Italian Cultural Heritage Code notices on Italian files.
38. [S26b] https://diff.wikimedia.org/2022/07/05/reusing-images-of-italian-cultural-heritage-from-wikimedia-commons-will-be-harder/ — Italian reuse restrictions (2022; current status UNVERIFIED).
39. [S27] https://github.com/Kaggle/kaggle-api/blob/main/docs/kernels.md — kernels push/status/output, --accelerator.
40. [S28] https://support.google.com/youtube/answer/1311392?hl=en — YPP: inauthentic content rename (2025-07-15), slideshow/AI-template examples, AI personas on finances, unsatisfying content.
41. [S29] https://support.google.com/youtube/answer/14328491?hl=en — altered/synthetic disclosure: realistic only; non-realistic AI exempt.
