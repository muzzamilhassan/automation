# YouTube Thumbnail Template System — Research (2026-10-18)

**Purpose:** Ground a 30-template selectable thumbnail system (1280x720, sharp+SVG, parametric, data-only templates) in primary sources. Every claim is cited inline. Sources are tiered: **[YT]** = official YouTube/Google documentation (owns the claim), **[IND]** = industry/platform-tool data (TubeBuddy, vidIQ, creator-tool studies — correlation, not YouTube-official), **[CR]** = high-authority creator material (leaked MrBeast production doc via Simon Willison), **[G]** = Google Fonts / google/fonts GitHub (license + metrics authority).

**Repo grounding used:** `package.json` (sharp ^0.33.5, ESM), `thumbnails/poster-factory.mjs` (puppeteer-based predecessor, hard-offset text-shadow, static per-channel `CHANNELS` map), `thumbnails/fonts/` (Anton-Regular, Cinzel-Bold, Inter-Regular, Inter-SemiBold already on disk), `register-fonts-windows.mjs` (installs TTFs to `%LOCALAPPDATA%\Microsoft\Windows\Fonts` + HKCU registry).

---

## 1. Hard rules (YouTube-official) [YT]

Source: YouTube Help "Add custom thumbnails on YouTube" — https://support.google.com/youtube/answer/72431

| Rule | Current official spec (fetched 2026-10-18) |
|---|---|
| Recommended resolution | **3840 x 2160** ("Your custom thumbnail image should be as large as possible") |
| Minimum width | **640 px** |
| Aspect ratio | **16:9** for videos (9:16 for Shorts, 1:1 for podcast playlists) |
| Max file size | **50 MB from a computer; 2 MB from the mobile app** |
| Formats | "Image formats such as JPG or PNG" (PNG or JPG recommended practice; GIF/BMP accepted historically) |
| Vertical-video exception | Vertical videos with 16:9 thumbs get an auto-generated **4:5** thumbnail on Home/Explore/Subscriptions (custom 16:9 still shows on watch feed, history, desktop) |
| Policy | Thumbnails must follow Community Guidelines; misleading/violating thumbnails can be rejected, strike the channel, or suspend custom-thumbnail privileges for 30 days |

Practical consequence for the engine: **render at 1280x720** (2.25x the old 640 floor, the size YouTube's own Test & Compare page names as its "720p (1280 x 720)" baseline) and compress to **< 2 MB** so the file is safe for both desktop and mobile-app upload paths. YouTube recommends 4K, but for a text-driven parametric system 1280x720 is the documented minimum-quality bar; 4K is an optional upscale later.

Official design guidance [YT] — "Creator tips for video thumbnails" — https://support.google.com/youtube/answer/12340300 :
- "**90% of the best-performing videos have custom thumbnails.**"
- "If you add text, make sure to use **a font that's easy to read**."
- "**Try not to make the design too complex.**"
- "**Dynamic use of color and composition can help catch the eye, but too much can overwhelm it.**"
- Use the **rule of thirds** for composition, then "overlay branding and descriptive text."
- "Thumbnails show up differently across devices, so make sure your thumbnail image is **as large as possible**." (official acknowledgment of cross-device scaling variance)
- Thumbnails and titles work together to "create interest and tell a story"; thumbnails must be **accurate** or viewers click away (hurts discoverability).
- Check **CTR on Home and Suggested in the first 24 hours** — the metric YouTube itself tells creators to read.

Official A/B testing facts [YT] — "Test & compare thumbnails" — https://support.google.com/youtube/answer/13861714 :
- Up to **3** titles/thumbnails tested concurrently; winner decided by **watch-time share**, deliberately *not* CTR ("we optimize tests for overall watch time over other metrics, like click-through-rate"). Design implication: a clickbait thumbnail that tanks retention loses YouTube's own tests — templates should promise, not bait.
- **If any tested thumbnail is under 720p (1280x720), all experiment thumbnails are downscaled to 480p (854x480)** — official confirmation that YouTube downscales thumbnails in practice; never render below 720p.

---

## 2. Text on thumbnails — findings

**Word count.** vidIQ's 500-breakout-thumbnail study (industry data; 500 breakout videos across 30 niches, breakout = video earning >=18x its channel's median views; median breakout 50x, top-50 median 800x; thumbnails "visually coded for face presence, color contrast, overlay word count, and facial expression") [IND] — https://vidiq.com/research/youtube-thumbnail-study :
- **72%** of breakouts carried overlay text; **28% carried none**.
- Word-count distribution (all 500): none 140 (28%), **1–3 words 120 (24%)**, 4–5 words 84 (17%), 6–7 words 63 (13%), 8–9 words 34 (7%), 10+ words 59 (12%).
- Median overlay length among text-bearing thumbnails: **5 words**; "Most breakouts used three words or fewer."
- Top-50 composition pattern: "a face filling roughly a third of the frame, strong background contrast, **very few words**."
- Industry guidance converges on **3–5 words maximum** (notelm.ai 2026 guide, kapa99, thumbcrafted) [IND]. YouTube-official says only "easy to read" + "not too complex" [YT] — the numeric cap is industry consensus, not YouTube policy.

**Font style 2025–2026.** Industry font guides converge on **bold, condensed sans-serif** for thumbnails; the repeatedly cited set is **Impact, Anton, Bebas Neue, Oswald Bold, Montserrat ExtraBold/Black, Barlow Condensed**, with **Anton called "the safest single choice"** (free, extremely bold, condensed) [IND — thumix, artiphik, thumbcrafted, 1of10 via search]. Google Fonts' own thickness metric confirms these are the heaviest display faces available (see Section 5).

**Stroke / shadow / highlight — what the data supports:**
- vidIQ: "contrast is what survives the shrink to a phone-sized thumbnail" — pair bright subject with dark background [IND]. Contrast was present in 56% of all breakouts but *declines* toward the top (56% → 50% top-100 → 46% top-50): contrast is "a baseline expectation rather than a differentiator" [IND]. High-contrast *text treatment* (solid color flip, highlight box) is therefore a floor requirement, not a gimmick.
- **Drop-shadows:** no CTR study found that compares shadows; the "soft drop-shadows read dated / turn muddy under compression" position is design-industry consensus, not measured data — **UNCERTAIN**. The engine bans them regardless (crisp-edges constraint), which is the conservative choice and matches YouTube's "not too complex" guidance [YT].
- **Thick outline (stroke-only):** industry guides recommend outlines for contrast on busy photos [IND — kapa99, notelm.ai]. Real stroke data: Google Fonts measures **Anton th7, Archivo Black th8, Alfa Slab One th9, Passion One 900 th9** (0–10 scale) [G] — the heaviest faces give strokes that survive downscale natively.
- **Highlight techniques** (solid box behind word, two-tone color word, underline/overline bars, strike): no A/B data isolates these individually — **UNCERTAIN** as to which wins. They are all crisp-edge devices consistent with the contrast finding; the template system ships all of them as selectable treatments so A/B testing (YouTube Test & Compare, 3 variants [YT]) can decide per-channel.
- **Uppercase vs mixed:** no primary data. YouTube's official title guidance says use ALL CAPS "carefully, to emphasize emotion" [YT]; thumbnail practice is near-universal uppercase for impact fonts (Anton, Bebas) and mixed-case for serif/editorial (Cinzel). Ship `case` as a template parameter, default uppercase for impact fonts.
- **Keyword highlighting** (the poster-factory's ONE accent word pattern): consistent with "very few words" + single-focal-point structure in the vidIQ top-50 pattern [IND].

**Structure of top channels.**
- vidIQ: **69%** of all 500 breakouts used a human face; **75%** of top-100; **80%** of top-50 — face share *rises* with breakout size; face is "the single most common trait" [IND].
- Only **5%** used exaggerated expressions (6% of top-50): "a clear, well-lit face with a genuine expression that matched the video" beats shocked-face cliché [IND].
- Face-led vs object-led: "Object-led thumbnails worked in DIY, food, and product niches; text balanced opposite the face" [IND].
- MrBeast (leaked internal doc, via Simon Willison's analysis) [CR]: "The creative process for every video they produce **starts with the title and thumbnail**"; "These set the expectations for the viewer, and everything that follows needs to be defined with those in mind"; the *ketchup* specificity example ("I Spent 50 Hours In Ketchup") is "easily 100x more viral" than the generic version — thumbnails must carry one concrete, visual object, not an abstract claim. Business Insider (Oct 2022) reported MrBeast tests thumbnail candidates socially ("a thumbnail feeler") [IND — secondary report].
- vidIQ caveat, quoted: copying single traits "is not a guarantee that copying any single trait makes a video go viral" [IND].

---

## 3. Color findings

- vidIQ (industry): high contrast in 56% of breakouts; advice: pair a bright subject with a darker background, and **avoid YouTube's own red/white/black UI palette** so the thumbnail doesn't blend into the app chrome [IND]. (Flags the repo's Money Rulebook red as a UI-blend risk worth testing.)
- **"3-color rule"** (one dominant + one supporting + one accent, often paired with 60-30-10 weighting): a design-industry convention, applied to thumbnails by creator guides — **no empirical study found**; label as convention, not data [IND — Piktochart, BrighterCraft via search].
- High-contrast pairs that survive mobile compression (synthesis from the contrast finding + industry 168px tests [IND]): white text on near-black; black text on saturated yellow/green; gold (#E8C15A-class) on deep navy/near-black; bright green (#4ADE80-class) on near-black. These map onto the repo's four channel accent systems (ic gold, mr red, dfd green, qq yellow).
- YouTube-official color guidance is only "dynamic use of color... but too much can overwhelm" [YT].

---

## 4. Compression / legibility findings

- **No official YouTube statement exists on thumbnail re-compression, minimum stroke widths, or minimum font sizes** — flagged **UNCERTAIN**; everything below is industry practice.
- **168x94 px** is the de-facto industry test size for mobile feed thumbnails ("test readability at 168x94 pixels" — notelm.ai, kapa99, thumbcrafted, moda.app all cite it) [IND]. 1280x720 → 168x94 is a **7.6x linear downscale**; 100 px type renders ~13 px, 8 px strokes ~1 px.
- Minimum effective type size: industry guides put text at **10–15% of canvas height** (~72–108 px on a 720 px canvas) [IND — miraflow.ai]; artiphik adds "readable in under one second at ~200 px wide" [IND].
- Thin strokes and soft/blurred edges die first under downscale (industry consensus; the 168px test method exists precisely because of this) [IND] — this is the mechanical justification for the engine's crisp-edges-only constraint.
- YouTube-official adjacent facts that bound the problem: Test & Compare downscales sub-720p experiments to 480p [YT]; the 2026 mobile Home-feed experiment **crops/zooms thumbnails dynamically** ("Some thumbnails might look cropped to viewers during this test") while leaving uploaded files untouched (Android Authority, Apr 30 2026; corroborated by Social Media Today and r/youtube reports) [IND]. Edge-adjacent content is therefore never safe; keep critical text inset from all edges.
- Derived engine constants (my synthesis, not sourced): headline auto-fit clamp **72–160 px** cap height at 720p (grounded in the 10–15% finding); stroke width **8–12 px** at 1280 canvas; underline/overline/strike bars **≥ 10 px** tall; critical text inset **≥ 64 px** (5%) from edges; bottom-right **≥ 260 x 120 px corner reserved** for the duration stamp + crop margin (platform UI observation — YouTube renders a duration chip over the bottom-right of every long-form thumbnail; geometry observed from the product, **no official safe-zone spec exists** — UNCERTAIN).

---

## 5. Font license + metrics table

All licenses verified against the `google/fonts` GitHub repo ([G], fetched 2026-10-18: `ofl/<family>/OFL.txt` HTTP 200; Luckiest Guy at `apache/luckiestguy/LICENSE.txt` = Apache 2.0). Weights/italics and the 0–10 thickness/width/slant metrics from the Google Fonts metadata API (`https://fonts.google.com/metadata/fonts`, `isOpenSource: true` on every family below) [G].

| Family | Weights | True italics? | Thickness (0-10, heaviest listed) | Width (condensed = low) | License | Status |
|---|---|---|---|---|---|---|
| Anton | 400 | no | **7** | 7 | SIL OFL 1.1 | already in repo (`thumbnails/fonts/Anton-Regular.ttf`) |
| Archivo Black | 400 | no | **8** | 8 | SIL OFL 1.1 | add TTF |
| Passion One | 400/700/900 | no | **9** (900) | 7 | SIL OFL 1.1 | add TTF |
| Alfa Slab One | 400 | no | **9** | 8 | SIL OFL 1.1 | add TTF |
| Archivo | 100–900 | **yes (i)** | 8 (900) | 8 | SIL OFL 1.1 | add TTF |
| Montserrat | 100–900 | **yes (i)** | 8 (900) | 8 | SIL OFL 1.1 | add TTF |
| Inter | 100–900 | **yes (i)** | 8 (900) | 7 | SIL OFL 1.1 | partly in repo (Regular/SemiBold) — add Black/Bold/Italic |
| Barlow Condensed | 100–900 | **yes (i)** | 9 (900, per family range) | low (condensed) | SIL OFL 1.1 | add TTF |
| Roboto Condensed | 100–900 | **yes (i)** | 6 (700) | 6 (condensed) | SIL OFL 1.1 | add TTF |
| Oswald | 200–700 | no | 6 (700) | 6 (condensed) | SIL OFL 1.1 | optional |
| Teko | 300–700 | no | **8** (700) | **6 (very condensed)** | SIL OFL 1.1 | add TTF |
| Bebas Neue | 400 | no | n/a (condensed display) | very condensed | SIL OFL 1.1 | add TTF |
| Bungee | 400 | no | 7 | 8 | SIL OFL 1.1 | add TTF |
| Luckiest Guy | 400 | no | 8 | 8 | **Apache 2.0** (not OFL) | add TTF |
| Cinzel | 400–900 | no | 8 (900) | 8 | SIL OFL 1.1 | partly in repo (Cinzel-Bold) — add 900 |
| Rubik | 300–900 | **yes (i)** | 9 (900, per family range) | 8 | SIL OFL 1.1 | add TTF |
| JetBrains Mono | 100–800 | **yes (i)** | 8 (800) | 6 (mono) | SIL OFL 1.1 | add TTF |
| IBM Plex Mono | 100–700 | **yes (i)** | 7 (700) | 6 (mono) | SIL OFL 1.1 | add TTF |
| Space Grotesk | 300–700 | no | 7 (700) | 7 | SIL OFL 1.1 | add TTF |

**Engineering-relevant license/face facts:** (a) every font above is free for commercial use and embeddable; redistribution of TTFs inside the repo is permitted under OFL 1.1 / Apache 2.0 (retain license files per OFL RF requirements). (b) **Italic treatment is only legal-correct via true italic files** — the families with real italic faces are Inter, Montserrat, Archivo, Barlow Condensed, Roboto Condensed, Rubik, JetBrains Mono, IBM Plex Mono, Space Mono. Anton, Bebas, Passion One, Alfa Slab One, Teko, Oswald, Bungee, Luckiest Guy, Cinzel, Space Grotesk have **no italic face**; the engine must either synthesize skew (declared as `syntheticItalic: true`) or restrict italic treatment to italic-capable families (recommended default).

---

## 6. DESIGN SECTION — parametric template system (synthesis)

### 6.1 Architecture: one renderer, N data files

Every template is a **JSON data spec**; one parametric renderer consumes it. Adding a template = adding a JSON file. Zero code. This is the direct answer to the "no static per-channel maps" directive: `poster-factory.mjs`'s `CHANNELS`/`powers`/`chip` closures are static code maps and must not be replicated — channel identity moves to **brand data files** (`thumbnails/brands/<channel>.json`: palette, wordmark, chip vocabulary), and templates reference brand tokens, never brand names or channel-specific logic.

```
thumbnails/
  templates/           <- 30 JSON files, pure data (the only way to add a template)
  brands/              <- palette + wordmark + chip vocab per channel (data, not code)
  fonts/<family>/<weight><style>.ttf + LICENSE
  render-template.mjs  <- ONE renderer: JSON -> SVG -> sharp -> PNG
```

### 6.2 Template schema (v1)

```json
{
  "id": "boxed-scream",
  "category": "bold-impact",
  "name": "Boxed Scream",
  "canvas": { "w": 1280, "h": 720 },
  "background": { "type": "photo | solid | duotone", "photo": { "fit": "cover", "zone": "right", "width": 0.55 }, "solid": "#0B0B0F", "duotone": { "dark": "#0B0B0F", "light": "#E8C15A", "angle": 76 } },
  "chip": { "show": true, "pos": "top-left", "textSource": "brand.vocab", "font": { "family": "Inter", "weight": 800 }, "size": 28, "letterSpacing": 5, "bg": "#080A0E", "fg": "brand.accentSoft" },
  "headline": {
    "text": "{title.short}", "maxWords": 5, "wordSource": "title.words",
    "font": { "family": "Archivo Black", "weight": 400, "italic": false },
    "case": "upper", "letterSpacing": 1, "lineHeight": 0.98,
    "sizeMode": "autofit", "sizeRange": [72, 160], "box": { "x": 64, "y": 340, "w": 760, "h": 320 },
    "color": "#FFFFFF", "align": "left"
  },
  "words": [
    { "index": "last", "treatments": [ { "type": "highlightBox", "bg": "brand.accent", "fg": "#0B0B0F", "padX": 18, "padY": 10, "radius": 0 } ] }
  ],
  "decorations": [ { "type": "bar", "rect": [64, 300, 220, 12], "color": "brand.accent" } ],
  "safeZone": { "inset": 64, "reserveBottomRight": [260, 120] },
  "bans": { "dropShadow": true, "blur": true, "glow": true }
}
```

Word-treatment vocabulary (all crisp-edge, all implementable in pure SVG):
- `highlightBox` — measured word bbox -> `<rect>` behind + flipped text fill (contrast-pair device; the one treatment the contrast finding directly supports).
- `twoTone` — `<tspan>` accent fill on one word (the existing "ONE accent word" DNA).
- `underline` / `overline` — solid `<rect>` bars (>=10 px).
- `strike` — solid horizontal `<rect>` through the word bbox (crisp; doubles as negation/curiosity device).
- `stroke` — SVG `stroke` + `paint-order="stroke fill"` + `stroke-linejoin="round"`, width 8–12 px (outline-first rendering order so stroke sits under the fill).
- `italic` — true italic font file where available (see license table); else `syntheticItalic: true` skew transform, declared explicitly.
- `case`, `letterSpacing`, `sizeMode: autofit` — JS-side; autofit = binary-search font size against measured advance widths (opentype.js, MIT-licensed, one new dep; fallback `textLength` + `lengthAdjust="spacingAndGlyphs"`).

Renderer pipeline: `JSON -> SVG string -> sharp(Buffer.from(svg)).png({ compressionLevel: 9, quality: 90 }) -> JPEG/PNG <= 2 MB`. Photo layers are resized by sharp (`cover` fit) and composited *before* the SVG overlay so SVG stays lightweight (no base64 megabytes). Fonts: `@font-face`-free — librsvg/sharp resolves families via fontconfig; on Windows reuse/extend `register-fonts-windows.mjs` to register `thumbnails/fonts/**` into `%LOCALAPPDATA%\Microsoft\Windows\Fonts` (registry entry already proven in-repo); set `FONTCONFIG_PATH` for CI/Linux.

**Hard engine constraints (non-negotiable, enforced in schema validation):** no drop-shadows (`text-shadow`/feDropShadow), no `feGaussianBlur`, no glow, no soft edges; fills, bars, strokes, and flat translucent overlay rects only. Auto-reject any template JSON containing `filter`, `blur`, or shadow fields.

**Validation gates** (design constants from Section 4, flagged as synthesis): headline words <= 5; autofit result within [72, 160] px or the renderer truncates words and logs; stroke 8–12 px; bars >= 10 px; all content within `safeZone.inset` (64 px); bottom-right reserve enforced; output <= 2 MB.

### 6.3 The 30 templates

Color hexes shown are examples; `brand.*` tokens override per channel (ic gold #E8C15A / mr red #C1272D / dfd green #4ADE80 / qq yellow #F5E31C already exist in repo).

| # | Category | Name | Layout | Font + treatment | Color system | Word treatment | Justifying finding |
|---|---|---|---|---|---|---|---|
| 1 | Bold Impact | KETCHUP | Photo fills right 60% behind flat dark overlay; headline left 40% | Anton 400 upper, autofit 96–140 | Near-black #0B0B0F + white + gold accent | twoTone last word | vidIQ: <=3 words + bright-subject/dark-bg contrast [IND]; MrBeast ketchup specificity [CR] |
| 2 | Bold Impact | BLACKOUT | Solid near-black bg, no photo | Anton 400 white, 1–2 words, huge (120–160) | #0B0B0F + white + accent | underline bar under one word | vidIQ contrast baseline; 28% of breakouts carry no text — minimal-copy extreme [IND] |
| 3 | Bold Impact | BOXED SCREAM | Flat saturated accent bg | Archivo Black 400 black text, upper | Yellow #F5E31C bg + black + white | highlightBox (inverted: black box, white text) on 1 word | Contrast-flip survives 168px shrink [IND]; avoids YouTube red/white/black blend [IND] |
| 4 | Bold Impact | SLAB CORE | Duotone photo full-bleed | Alfa Slab One 400, 2–3 words | Duotone navy/gold | stroke (paint-order, 10px) on accent word | th9 heaviest face = stroke survives compression [G][IND] |
| 5 | Minimal | WHITESPACE | Ivory bg, nothing else | Inter 800 mixed-case, 2 words, left-aligned | Ivory + charcoal #1F2937 + accent | overline bar over 1 word | vidIQ: no-text (28%) + 1–3 words (24%) are the top two patterns; YT "not too complex" [YT][IND] |
| 6 | Minimal | FOCAL CUT | Isolated object photo center on flat bg | Inter 900, 1 word, small bottom-left chip | Flat brand-tint bg | twoTone (whole word) | vidIQ: object-led works in DIY/food/product niches [IND] |
| 7 | Minimal | FRAME LINE | 12px inset frame border, text centered | Barlow Condensed 800, 3 words | Flat bg + hairline frame | twoTone keyword | YT rule-of-thirds composition; frame reads at 168px [YT][IND] |
| 8 | Face-Emotion | THIRD FACE | Face occupies right third; headline left | Anton 400, 3–4 words; chip pill top-left | Photo + dark shade + brand accent | twoTone last word | vidIQ top-50 composition verbatim: face ~1/3 frame + few words [IND] |
| 9 | Face-Emotion | GENUINE | Full-bleed candid face, flat translucent bar bottom-left | Inter 800 italic (true italic file), 1–2 words | Photo + 85% flat bar | italic only | vidIQ: only 5% exaggerated faces; genuine beats shocked [IND]; italic-capable family [G] |
| 10 | Face-Emotion | DUO TENSION | Two faces split vertical, crisp 8px seam | Archivo Black per side, 1–2 words each | Two contrast halves + white seam | twoTone on each name | vidIQ: face share rises to 80% in top-50 [IND] |
| 11 | Curiosity | QUESTION ECONOMY | Huge "?" glyph right; 3 words left | Bungee "?" + Anton words | Dark bg + accent question mark | twoTone verb | Curiosity-gap structure; MrBeast title/thumbnail-first [CR] |
| 12 | Curiosity | STRIKE TRUTH | Photo full-bleed, 4-word claim | Passion One 900, upper | Photo + shade | strike (accent bar) on 1 word | Negation/curiosity device; crisp strike; <=5 words median [IND] |
| 13 | Curiosity | TEASE CHIP | Dark bg; eyebrow + short hook | Eyebrow Barlow Condensed 700; hook Anton 2 words | #0B0B0F + accent | twoTone hook word | vidIQ median 5 words / most <=3; chip+eyebrow = brand continuity [IND] |
| 14 | Listicle | BIG NUMBER | Number fills 45% of frame; short label beside | Passion One 900 number + Inter 700 label | Flat dark bg | twoTone number | Numbers parse instantly at 168px; <=3 words [IND] |
| 15 | Listicle | STACKED COUNT | 3 rows: number + label, overline bars between | Alfa Slab numbers + Inter 500 labels | Alternating row tints | overline bars | Structured listicle reads in scan order; bars are crisp [IND] |
| 16 | Listicle | BADGE CIRCLE | Crisp circle badge with number; word beside | Inter 900 badge + Anton word | Flat bg | highlightBox (circle badge = filled box) | Badge form survives downscale; high-contrast flip [IND] |
| 17 | VS | SPLIT VERDICT | 50/50 vertical split, two flat colors | Archivo Black both sides; center "VS" Bungee in white circle | Two brand-contrast halves | twoTone both sides | Contrast-pair structure; comparison content [IND] |
| 18 | VS | PRICE FIGHT | Two price chips as filled boxes; seam between | Inter 800 inside chips | Light/dark halves | highlightBox + strike on old price | Box-flip + strike combo; both crisp [IND] |
| 19 | Before-After | SEAM | Photo split with crisp seam; labels top corners | Barlow Condensed 700 on overline bars | Duotone halves (desat vs vivid) | overline label bars | Transformation visible without reading; labels tiny-but-barry [IND] |
| 20 | Before-After | ARROW JUMP | Two states stacked diagonal; crisp triangle arrow between | Passion One 900 outcome word | Dark bg + accent arrow | twoTone outcome word | One concrete object (arrow) per MrBeast concreteness [CR] |
| 21 | Quote | SLAB QUOTE | Deep charcoal bg; big quote glyph accent | Alfa Slab One, <=6 words mixed-case | Charcoal + ivory + accent | twoTone key phrase | Serif/slab breaks feed pattern; few words [IND] |
| 22 | Quote | SERIF FRAME | Thin overline+underline frame around centered quote | Cinzel 700 small-caps | Deep green + ivory (dfd-style) | underline + overline frame | Premium serif differentiation; official "dynamic color, not too much" [YT] |
| 23 | Luxury | GOLD STANDARD | Near-black bg, letterspaced centered | Cinzel 900, 2–3 words, letterSpacing 8 | Black + gold #E8C15A | twoTone (gold whole line) | Avoid-YouTube-palette blend; letterspaced serif = niche signal [IND] |
| 24 | Luxury | MARBLE | Desaturated duotone photo + gold underline bar | Cinzel 700 | Desat photo + gold | underline bar | Contrast survives duotone; gold on dark pair [IND] |
| 25 | Tech/Mono | TERMINAL | Dark bg; prompt-style "> " + words | JetBrains Mono 800 (true italics avail.), upper | #0D1117 + terminal green | twoTone + static cursor-block rect | Mono = tech-niche signal; mono faces legible at small size [IND][G] |
| 26 | Tech/Mono | DATA CALLOUT | Huge stat number + mono label; hairline grid marks | Passion One 900 number + IBM Plex Mono 600 label | Dark + accent | twoTone number | Numbers + label = instant parse; hairlines crisp [IND] |
| 27 | Tech/Mono | CHANGELOG | Version chip top; old struck, new boxed | IBM Plex Mono 700 | Dark + green/red pairs | strike + highlightBox | Versioning content; both treatments crisp [IND] |
| 28 | Retro/Print | TABLOID | Cream bg; stacked headline; red masthead bar | Passion One 900, stacked lines | Cream + red + black | overline masthead bar + twoTone word | Print nostalgia = pattern interrupt; warm high contrast [IND] |
| 29 | Retro/Print | BUNGEE SIGN | Flat primary bg; hairline inner frame; centered | Bungee 400, 2 words | Flat accent + white hairline | twoTone (per-letter color blocks inherent to Bungee) | th7 display face; sign geometry reads at 168px [G][IND] |
| 30 | Doc-style | FIELD NOTES | Ivory paper bg; vertical margin rule; kicker + headline | Inter 600 kicker + Anton 2-word headline | Ivory + ink + red accent | strike on 1 word + vertical rule | Documentary authority; limited text; editorial mixed-case [IND] |

### 6.4 Migration notes for the existing engine

- `thumbnails/poster-factory.mjs` (puppeteer-based) already proves the composition language (chip pill, letterspaced eyebrow, Anton headline, one accent word, photo + dark angled shade). The new renderer re-expresses that DNA as template JSON; its `text-shadow: 6px 6px 0` and `box-shadow` glow violate the new crisp-edges constraint and die in migration.
- Channel-specific `powers` arrays and `chip()` regex trees in that file are exactly the "static per-channel maps" the directive bans — they become brand JSON vocabularies.
- Output: 1280x720, JPEG q~90 target under 2 MB (mobile-app upload cap [YT]); 4K upscale optional since YouTube now recommends 3840x2160 [YT].

---

## 7. Source list

**YouTube-official [YT]**
1. Add custom thumbnails on YouTube — specs (4K recommended, 640px min, 16:9, 50MB/2MB caps, JPG/PNG, 4:5 vertical exception): https://support.google.com/youtube/answer/72431
2. Creator tips for video thumbnails (90% stat, easy-to-read fonts, not too complex, dynamic color, rule of thirds, CTR at 24h): https://support.google.com/youtube/answer/12340300
3. Test & compare thumbnails (3 variants, watch-time-share winner, sub-720p downscaled to 480p): https://support.google.com/youtube/answer/13861714
4. A/B test titles & thumbnails (newer article): https://support.google.com/youtube/answer/16391400

**Industry data [IND] (correlation, not YouTube-official)**
5. vidIQ 500-breakout-thumbnail study (faces 69/75/80%, contrast 56/50/46%, 72% text, median 5 words, 5% exaggerated expressions, top-50 composition, avoid-YouTube-palette advice): https://vidiq.com/research/youtube-thumbnail-study
6. TubeBuddy blog — A/B testing lifts (37%–110% documented case CTR lifts; native tool optimizes watch time not CTR): https://www.tubebuddy.com/blog/leaked-youtube-ab-testing-title-thumbnail
7. Android Authority — YouTube mobile Home-feed dynamic thumbnail size/crop experiment (Apr 30, 2026): https://www.androidauthority.com/youtube-home-feed-thumbnail-test-3662288
8. Industry font/readability guides (168x94 test; 3–5 word cap; bold condensed sans consensus; Anton safest): notelm.ai https://notelm.ai/blog/youtube-thumbnail-text-tips ; thumbcrafted.com; kapa99.com; moda.app; miraflow.ai (min type 10–15% of canvas height); artiphik.com
9. 3-color rule / 60-30-10 (design convention, no study): Piktochart, BrighterCraft color-theory guides (via search)
10. Business Insider — MrBeast "thumbnail feeler" testing (Oct 13, 2022; fetched via search summary only — page blocked): https://www.businessinsider.com/youtube-creator-mrbeast-shares-thumbnail-strategy-advice-team-2022-10

**Creator authority [CR]**
11. Simon Willison's analysis of the leaked "How to Succeed in MrBeast Production" PDF (title+thumbnail-first; ketchup specificity; CTR-dictates): https://simonwillison.net/2024/Sep/15/how-to-succeed-in-mrbeast-production/

**Font licensing + metrics [G]**
12. Google Fonts metadata API (weights, italics, thickness/width/slant, isOpenSource): https://fonts.google.com/metadata/fonts
13. google/fonts repo OFL/Apache license files: https://github.com/google/fonts (verified `ofl/*/OFL.txt` HTTP 200 for all families listed except Luckiest Guy = `apache/luckiestguy/LICENSE.txt`, Apache 2.0)

## Explicit UNCERTAIN register
- Mobile-feed occlusion geometry (duration-stamp box, watch-later overlay): observed product UI, no official safe-zone spec exists. The 2026 dynamic-crop experiment (Android Authority) makes any fixed geometry provisional.
- 168x94 px test size and 10–15% min type size: industry convention, not YouTube-published.
- Minimum stroke widths: no primary source; engine constants are synthesis.
- Highlight-treatment efficacy ranking (box vs two-tone vs bars vs strike): no isolating A/B data found; treat as selectable variables for YouTube Test & Compare to decide.
- "Soft drop-shadows are dated/low-contrast": design-community opinion, no CTR study located; engine bans shadows regardless.
- 3-color rule: convention only.
- Business Insider quote fetched via search summary (page blocked) — quote reliability medium.


## 8. Pipeline integration grounding (orchestrator, verified against the live codebase)

The design above lands on an existing engine with known shape:

- **Today:** `studio/lib/thumb-templates.js` exports `TEMPLATES` — **28 templates** (clean, poster, paper, hero, statue, silhouette, luxury, splitba, vs, collage, newspaper, magazine, motion, annotate, glass, duotone, question, bignum, equation, timeline, stats, brutalist, anime, soft3d, liminal, pov, iso, map), each with its own `render()` function (`{ label, desc, category, needsPhoto, render }`). Helpers: `buildThumbSvg, escapeXml, pickAccentWord, wrapByWidth, wrapForTemplate`.
- **Shadow audit:** 5 `feDropShadow`/`feGaussianBlur`/`drop-shadow` usages exist in v1 today — the v2 engine and all 30 new templates BAN these entirely (owner hard requirement: no soft/blur shadows on text, ever).
- **Text-treatment gap:** underline/overline/strike appear ~0 times in v1 — the v2 schema's bars + highlightBox + twoTone + stroke are all NEW capability.
- **Fonts already on disk** (no downloads needed for most templates): Anton (Regular + Black), Archivo Black, Cinzel Bold, Cormorant Garamond SemiBold + **SemiBoldItalic** (a true italic), Inter 400/600/800/900 + ExtraBold, JetBrains Mono, Playfair Display, Caveat, PatrickHand (in explainer/public/fonts + image-tools/fonts), plus hdw woff2 (anton/bebas/inter-black). **Missing for the 30:** Passion One (400/700/900), Alfa Slab One, Barlow Condensed, Bungee, IBM Plex Mono (+italic), Space Grotesk — all SIL OFL (§5 table) — download into the thumbs font dir.
- **Consumption points** (v2 must surface through all four): `GET /api/thumbs/templates` (gallery list — merge v1+v2), `/thumbs` page picker, `POST /api/thumbs/branding` (per-channel default; accepts all templates since the #71 whitelist fix), `POST /api/thumbs/bulk` + `preview` (render entry points; hex validation per the #59 fix pattern).
- **Validation gates carry into routes:** ≤5 headline words warn, 64px edge inset in layout math, reserved bottom-right duration-stamp zone, output ≤2MB check in bulk (already rejects >2MB for YouTube).
- **No-static-maps rule (owner directive):** the 30 templates are a JSON catalog consumed by one parametric renderer — a new template is a data entry, zero code. Same rule kills the per-channel static maps in poster-factory.mjs when it gets v2 parity later.
- **Parity backlog (not v2 scope):** thumbnails/poster-factory.mjs (CI longform posters) uses its own HTML/sharp pipeline with static CHANNELS powers maps — migrate onto the v2 catalog in a follow-up.

## 9. Implementation tracking

Filed as tracker issue on `muzzamilhassan/automation`: "feat(thumbs): template library v2 — parametric renderer + 30 data-driven templates (no shadows)". v1's 28 templates remain live and untouched; v2 ships additively.
