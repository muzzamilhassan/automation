# Template Layout / Scene-Type Market Catalog — 2026-11-09

**Question:** What scene/layout archetypes does the commercial template-video market actually sell for text-driven explainer / documentary / facts videos? Which structures are popular AND buildable in Remotion with pure React/SVG/CSS?

**Method:** 9 primary sources surveyed 2026-11-09: Remotion official gallery + docs, one 81-template community Remotion pack, three template-video APIs (Creatomate, JSON2Video, Shotstack), one AE-render API (Plainly), four marketplace/catalog sweeps (Envato Elements ×2, Storyblocks, Pond5, Motion Array), and creator-market checks (CapCut, Pippit, Etsy, CreativeFabrica). Nothing invented; unverifiable items marked `?`.

---

## Summary

- The market clusters into **10 scene families**; this catalog enumerates **40 distinct archetypes**. The biggest supply is in typographic and photo-treatment scenes; the **evidence/investigation family is the least commoditized and the most differentiating** for a faceless-documentary factory.
- Remotion's own gallery is mostly *app/infra* starters (23 templates as of 2026-11-09) — only ~10 are scene-bearing. The scene-level design space is instead demonstrated by a community MIT pack of **81 Remotion templates in 9 categories** and by official packages (`@remotion/lottie`, `<IFrame>`). NOTE: the brief's examples "Remotion Titles / Staggered Text / Charts" were **not found** in the current official gallery — equivalent functionality exists in the community pack (Charts ×9, staggered text ×9).
- API vendors' element vocabularies confirm the primitive set: JSON2Video has exactly 9 element types (image, video, text, html, component, audio, voice, audiogram, subtitles); Creatomate's editor sells text/photos/video/shapes/music/subtitles + keyframes; Shotstack sells lower thirds + news-caption-over-broll scenarios.
- Marketplace counting (Envato documentary titles ~48 items, Envato documentary ~45, Storyblocks 837 results first 48, Pond5 ~1,222 documentary / ~494 timeline / ~189 lower-thirds, Shotstack ~230 templates in 9 categories) shows **timeline-track scenes and history-documentary slideshows are the most repeated archetypes** across vendors.
- Creator market (CapCut/Pippit/Etsy) converges on one format: **vertical, near-black kinetic typography + word-by-word captions + 1–3 facts in 15–30s**.

---

## Findings by sub-question

### 1. Remotion official gallery (remotion.dev/templates) — verified 2026-11-09

23 templates listed: 20 free + 3 paid. **Scene-bearing templates** (the rest are SaaS/app/render-infra starters):

| Template | What it demonstrates |
|---|---|
| TikTok | animated word-by-word captions, auto-installs Whisper.cpp |
| Audiogram | podcast snippet → text + waveform social video |
| Music Visualization | text + waveform visualization |
| Overlay | overlay graphics layers for editors |
| Code Hike | animated code scenes |
| Stargazer | GitHub-stars celebration video |
| 3D | React Three Fiber scenes |
| Stills | dynamic PNG/JPEG generation |
| Prompt to Video | story from prompt: images + voiceover |
| Watercolor Map (paid) | 2D illustrated map for travel videos |
| \<Timeline /\> (paid) | timeline-based editing component |
| Recorder / Editor Starter | in-browser recording / editor UI |

Discrepancy vs. brief: no "Remotion Titles", "Staggered Text", or "Charts" official templates today. Filling that gap: [reactvideoeditor/remotion-templates](https://github.com/reactvideoeditor/remotion-templates) — **81 free MIT templates, 9 per category**: Charts & Data (bar/line/pie/donut/area/progress/stat-counter/comparison/ring), Text (9 entrances incl. glitch, typewriter), Content Animation (countdown, card flip, progress steps, notification pop, carousel), Backgrounds (grain, matrix rain, starfield…), Cinematic (Ken Burns, letterbox, camera shake, whip pan, vignette…), Transitions (9), Logo reveals (9), Intro & Outro (chapter title, lower third, quote card, credits roll, end card…), Image & Media (split screen, comparison slider, polaroid, gallery grids, PiP…). README explicitly lists gaps: **maps, timelines, terminal UIs, device mockups** — i.e., exactly the investigation-family differentiators. Remotion capability confirmed: [`@remotion/lottie`](https://www.remotion.dev/docs/lottie) and [`<IFrame>`](https://www.remotion.dev/docs/iframe) (auto `delayRender()`), so Lottie icons and embedded-webpage scenes are officially supported.

### 2. Template-video APIs

| API | Scene/element vocabulary | Layout evidence |
|---|---|---|
| **Creatomate** | Editor sells: text, photos, video, shapes, music, subtitles, animations/transitions; keyframes with easing; "RenderScript underneath — editable JSON". Demo template has named scenes "Hook" → "Scene-Name-1..4" → "Scene-Close" | Hook+close modular scene pattern is a first-class vendor concept |
| **JSON2Video** | Exactly 9 element types: image, video, text, html, component, audio, voice, audiogram, subtitles. Scene model: per-scene transition (40+ xfade styles), `iterate` for data-driven slideshow scenes | Library categories: Top10 Ranking ×2, Inspirational + Stoic quotes, Reddit story, Twitter story, Would-you-rather, Trivia Quiz, Slideshow, Real Estate ×6, Ads |
| **Shotstack** | HTML-based lower-third templates; news-summary scenario = lower thirds + caption/headline text over b-roll bed + logo outro; explicitly "no charts, no scrolling news ticker, no map graphics" in the reference news edit | Studio gallery ~230 templates in 9 categories incl. News (22) with "Chart of the Day", "Breaking News Intro", "AI Avatar News Summary", "Faceless Explainer Short", "AI Science/Historical Facts TikTok Video", "Top 10 Tourism Listicle" |
| **Plainly (AE)** | 19 pre-made After Effects templates, 5 families: Media & Publishers (article-snippet), Twitter-card (boxed gradient, duotone…), Slideshow (intro scene + per-image text scenes), E-commerce ×7 (incl. comic-style "Pop") | Confirms article-snippet and tweet-card as productized scene systems |

### 3. Marketplace survey (counted across 9 catalog pages)

- **Envato Elements "documentary titles"** (~48 items): openers, title sequences, "Captions + Lower thirds", "Documentary Timeline", related-search tags include "documentary titles - vox style", "documentary timeline", "ending credits", "transition documentary".
- **Envato Elements "documentary"** (~45 items): "History Documentary Timeline" ×2, "Documentary Broadcast Package", "Investigation Documentary Project", "Old TV Documentary", "Scientific Documentary", "Historical Documentary Slideshow" ×3 variants, "Monochrome Documentary Opener", "Politic Documentaries", "Vintage Documentary".
- **Storyblocks "documentary"** (837 results, first 48 read): "History Timeline…" ×7 variants, "Pin Board Timeline Slideshow", "Historic Events Timeline", "Old TV | Historical Opener", "Newspaper News Intro", "VHS CRT Effect", "Erased History", "Darkness Opening Titles", "Billionaires Mind", documentary LUT packs, "Documentary Offset Transitions".
- **Pond5**: ~1,222 documentary AE templates; ~494 timeline-history templates; ~189 classic lower thirds (counts from category headers, 2026-11-09).
- **Motion Array**: kinetic typography packs — "Huge Kinetic Typography Pack" (45 animated elements), "Kinetic Typography Titles" (9 scenes, color controller).
- Distinct layout archetypes observed across these packs: opener/title-sequence, timeline track, history slideshow, lower third, caption+lower-third set, broadcast package, investigation board, retro-TV/CRT frame, newspaper clipping, monochrome treatment, vintage treatment, political promo, LUT/grading pack (grading is *not* a layout — excluded from taxonomy below).

### 4–5. Creator market (Canva/CapCut/Etsy side)

- CapCut's official fact-video guide prescribes the creator format: 5 genres ("Mind-blowing facts", "Amazing animal facts", "History's dark secrets", "Science explained simply", "Everyday hacks & practical facts"), 15–30s, vertical 9:16, auto-captions for silent viewing, 1–3 facts per video, "Match stock media" b-roll, optional AI avatar.
- Pippit (CapCut family) advertises a "Dark Documentary" template collection `?` (page 404'd on fetch 2026-11-09; existence supported by search snippet only — UNVERIFIED).
- CapCut hosts an official "Scary facts" template (dark/moody facts format).
- Etsy sells "Faceless Video Bundle" and "Fact Video Bundle" markets (bundle listings claim 130k+ clips spanning satisfying/luxury/motivational/viral-facts — marketing numbers, unverified individually); CreativeFabrica sells "Dark Documentary Crime YouTube Thumbnail" assets; a Threads post describes the 9:16 "dark documentary kinetic typography" convention (near-black bg, subtle grain).
- Canva proper: no direct template-page capture succeeded (JS-rendered); only third-party evidence of Canva-editable dark-documentary thumbnails `?`. Treat Canva scene inventory as a gap.

---

## TAXONOMY — 40 scene/layout archetypes

Frequency = number of distinct sources (of the 12 surveyed) where the archetype is observed on sale. Difficulty = build effort in Remotion with pure React/SVG/CSS: **S** ≤ ~1–2 days, **M** ~3–5 days or needs an asset pipeline, **L** needs data/licensing/AI infra.

### Family A — Typographic

| # | Archetype | Description | Freq | Exemplar | Remotion |
|---|---|---|---|---|---|
| A1 | Kinetic statement typography | Word/char-level animated prose on full-frame text; the core "facts video" scene | 5 | Huge Kinetic Typography Pack (45 elements) — [Motion Array](https://motionarray.com/motion-graphics-templates/huge-kinetic-typography-pack-97661) | S |
| A2 | Word-by-word caption block | Karaoke-style captions synced to TTS/VO; short-form table stakes | 4 | Remotion TikTok template (Whisper) — [remotion.dev](https://www.remotion.dev/templates/tiktok) | S |
| A3 | Typewriter / mono reveal | Character-by-character typing with cursor; dossier/terminal flavor | 3 | "Typewriter Subtitle" — [RVE pack](https://github.com/reactvideoeditor/remotion-templates) | S |
| A4 | Lower third / name-title bar | News-style name+title bar sliding in bottom-left | 6 | Expanding HTML lower third — [Shotstack](https://shotstack.io/templates/html-lower-third-expanding-highlite); ~189 on [Pond5](https://www.pond5.com/after-effects/1/classic-lower-third.html) | S |
| A5 | Quote card | Animated quotation + attribution; stoic/motivation genre | 4 | "Inspirational Stoic 01" — [JSON2Video](https://json2video.com/templates); RVE "Quote Card" | S |
| A6 | Listicle counter | Numbered items (1→N) animating in as a countdown/roll | 3 | "Top 10 Tourism Listicle" — [Shotstack](https://shotstack.io/studio/templates); "Top10 Ranking 01/02" — [JSON2Video](https://json2video.com/templates) | S |
| A7 | Chapter title card | Chapter number + extending rule lines; documentary segmentation | 2 | RVE "Chapter Title" — [GitHub](https://github.com/reactvideoeditor/remotion-templates) | S |
| A8 | Hook + Close modular pair | Paired cold-open and CTA/payoff scenes bracketing a template | 3 | Creatomate demo template scenes "Hook"/"Scene-Close" — [creatomate.com/template-editor](https://creatomate.com/template-editor) | S |

### Family B — Data / chart

| # | Archetype | Description | Freq | Exemplar | Remotion |
|---|---|---|---|---|---|
| B1 | Bar/column chart build | Bars grow in staggered sequence | 2 | RVE "Bar Chart"; "Chart of the Day" — [Shotstack News](https://shotstack.io/studio/templates) | S |
| B2 | Line/area draw-on | Polyline draws left-to-right with data points | 2 | RVE "Line Chart" / "Area Chart" | S |
| B3 | Donut/pie share reveal | Ring segments appear sequentially with center metric | 1 | RVE "Donut Chart" / "Circular Progress" | S |
| B4 | Big-number stat counter | Oversized number counting up with comma formatting | 2 | RVE "Stat Counter"; "Business Performance Comparison" — [Shotstack](https://shotstack.io/studio/templates) | S |
| B5 | Comparison split | Side-by-side before/after metrics or images with sliding divider | 2 | RVE "Comparison Chart" + "Image Comparison Slider"; Envato "Revenue vs. Net Profit" — [Shotstack](https://shotstack.io/studio/templates) | S |
| B6 | Progress bars / step tracker | Bars fill to targets; step indicators light sequentially | 1 | RVE "Progress Bars" / "Progress Steps" | S |

### Family C — Map / geography

| # | Archetype | Description | Freq | Exemplar | Remotion |
|---|---|---|---|---|---|
| C1 | Animated route / pins map | Illustrated or dark map, camera pans between pinned locations along a route; the Netflix-doc convention | 3 | Remotion paid "Watercolor Map" — [remotion.dev](https://www.remotion.dev/templates); "Documentary Style Map Animation (Netflix-style)" tutorial — [YouTube](https://www.youtube.com/watch?v=W6WH-Mxy37Q) | M (L if true geo-projection) |
| C2 | Choropleth / data map | Regions shaded by a data variable | 0 | none observed in sampled catalogs `?` | L |

### Family D — Evidence / investigation (least commoditized)

| # | Archetype | Description | Freq | Exemplar | Remotion |
|---|---|---|---|---|---|
| D1 | Case-file timeline track | Horizontal time axis, events/cards slide along dated track; history-doc backbone | 6 | "History Timeline ×7 variants" — [Storyblocks](https://www.storyblocks.com/templates/search/documentary); "Documentary Timeline" — [Envato](https://elements.envato.com/video-templates/documentary+titles); ~494 timeline templates — [Pond5](https://www.pond5.com/search?kw=timeline-history&media=ae) | M |
| D2 | Redacted document / evidence card | Document photo with black redaction bars, stamps, highlighted lines revealing | 2 | "Investigation Documentary Project" — [Envato](https://elements.envato.com/video-templates/documentary); "Erased History" — [Storyblocks](https://www.storyblocks.com/templates/search/documentary) | M |
| D3 | Pin board / corkboard | Photos, notes, strings connecting suspects/events | 2 | "Pin Board Timeline Slideshow" — [Storyblocks](https://www.storyblocks.com/templates/search/documentary) | M |
| D4 | Newspaper clipping scene | Headline zooms/paper texture; archive-press device | 2 | "Newspaper News Intro" — [Storyblocks](https://www.storyblocks.com/templates/search/documentary) | M |
| D5 | Retro TV / CRT frame | Footage framed inside vintage TV with scanlines/VHS wobble | 3 | "Old TV Documentary" — [Envato](https://elements.envato.com/video-templates/documentary); "Old TV Historical Opener", "VHS CRT Effect" — [Storyblocks](https://www.storyblocks.com/templates/search/documentary) | M |
| D6 | Dark-documentary statement scene | Near-black bg + film grain + serif/giant condensed type + slow zoom; the "dark documentary bundle" look | 4 | CapCut "Scary facts" template — [capcut.com](https://www.capcut.com/template-detail/Scary-facts/7421931490465828102); Pippit "Dark Documentary" collection `?` — [pippit.ai](https://www.pippit.ai/templates/dark-documentary) (UNVERIFIED, 404); "Darkness Opening Titles" — [Storyblocks](https://www.storyblocks.com/templates/search/documentary) | S |

### Family E — Editorial / magazine / news

| # | Archetype | Description | Freq | Exemplar | Remotion |
|---|---|---|---|---|---|
| E1 | Breaking-news banner intro | Headline slam, badge, intro sting; news-genre opener | 4 | "Breaking News Intro" ×several — [Shotstack News](https://shotstack.io/studio/templates); "Documentary news Intro" — [Envato](https://elements.envato.com/video-templates/documentary+titles) | M |
| E2 | Headline caption over b-roll | Static bold caption line bottom-left over stock footage bed | 3 | Shotstack news-summary scenario — [shotstack.io](https://shotstack.io/use-cases/scenarios/api/generate-news-summary-videos) | S |
| E3 | Broadcast package (system) | Bundle: opener + lower thirds + transitions + end card, one visual language | 3 | "Documentary Broadcast Package" — [Envato](https://elements.envato.com/video-templates/documentary) | M (bundle) |
| E4 | Magazine cover scene | Cover with masthead + coverlines building in `?` | 0 | not observed as a *video* scene in sampled catalogs (graphic-template category only) | M |
| E5 | Article-snippet card | Publisher-style tweet/article card with headline, byline, CTA | 3 | Plainly "Urban/Timeless/Classic" — [plainlyvideos.com/templates](https://www.plainlyvideos.com/templates) | S |

### Family F — Comic / playful

| # | Archetype | Description | Freq | Exemplar | Remotion |
|---|---|---|---|---|---|
| F1 | Bubble / sticker text pop | Characters pop inside bubbles, comic SFX styling | 1 | RVE "Bubble Pop Text" — [GitHub](https://github.com/reactvideoeditor/remotion-templates) | S |
| F2 | Notification / toast stack | OS-style popups stacking with sound design | 1 | RVE "Notification Pop" | S |
| F3 | This-or-that poll card | Binary choice split-screen with animated tallies | 2 | "Would you rather 01" — [JSON2Video](https://json2video.com/templates) | S |
| F4 | Trivia quiz card | Question → options → reveal answer beat | 2 | "Trivia Quiz 01" — [JSON2Video](https://json2video.com/templates) | S |

### Family G — Board / index systems

| # | Archetype | Description | Freq | Exemplar | Remotion |
|---|---|---|---|---|---|
| G1 | Checklist card | Items tick off sequentially | 1 | "Radiant Results: Checklist Promo Template" — [Shotstack](https://shotstack.io/studio/templates) | S |
| G2 | Ranking podium / leaderboard | Ranked entries with scores sliding onto a board | 2 | "Top10 Ranking 01" — [JSON2Video](https://json2video.com/templates); "Team Lineup Template" — [Shotstack](https://shotstack.io/studio/templates) | S |
| G3 | Terminal / code scene | Monospace code typing/executing; hacker flavor | 2 | Remotion "Code Hike" template — [remotion.dev/templates](https://www.remotion.dev/templates) | S |
| G4 | Device-mockup / iframe scene | App UI or live webpage inside phone/browser frame | 2 | SaaS explainer "UI walkthroughs" category — [Envato](https://elements.envato.com/video-templates/saas+explainer+video); Remotion `<IFrame>` — [docs](https://www.remotion.dev/docs/iframe) | S/M |

### Family H — Photo treatment

| # | Archetype | Description | Freq | Exemplar | Remotion |
|---|---|---|---|---|---|
| H1 | Ken Burns pan/zoom | Slow pan+zoom on stills; the documentary stock-photo bed | 6 | RVE "Ken Burns"; "Historical Documentary Slideshow" ×3 — [Envato](https://elements.envato.com/video-templates/documentary) | S |
| H2 | Polaroid / photo stack | Photos drop in as tilted polaroids / overlapping frames | 1 | RVE "Polaroid Frame" / "Photo Stack" | S |
| H3 | Gallery grid / collage | 2×3 grids, masonry, multi-photo collages revealing | 3 | RVE "Gallery Grid"/"Masonry"; "Family Moments Collage" — [Shotstack](https://shotstack.io/studio/templates) | S |
| H4 | Image comparison slider | Before/after with draggable divider | 1 | RVE "Image Comparison Slider" | S |
| H5 | Picture-in-picture | Inset frame over main footage | 1 | RVE "Picture in Picture" | S |
| H6 | Texture overlay pack | Film grain, vignette, film burn, VHS CRT, light leaks | 4 | RVE "Noise Grain"/"Vignette"/"Film Burn"; "VHS CRT Effect" — [Storyblocks](https://www.storyblocks.com/templates/search/documentary) | S |

### Family I — Chapter / transitional devices

| # | Archetype | Description | Freq | Exemplar | Remotion |
|---|---|---|---|---|---|
| I1 | Cinematic letterbox bars | Black bars retract/expand for aspect-ratio drama | 2 | RVE "Letterbox Reveal"; "Cinematic Titles and Credits 2" — [Envato](https://elements.envato.com/video-templates/documentary+titles) | S |
| I2 | Credits roll + end card | Scrolling credits; outro card with subscribe CTA | 3 | RVE "Credits Roll"/"End Card"; "Historical Credits" — [Envato](https://elements.envato.com/video-templates/documentary) | S |
| I3 | Countdown timer / intro | Ring or numeral countdown 3-2-1 | 1 | RVE "Countdown Timer"/"Countdown Intro" | S |
| I4 | Impact devices | Camera shake, whip pan, zoom pulse, dip-to-black between beats | 3 | RVE Cinematic/Transition categories; "Documentary Offset Transitions" — [Storyblocks](https://www.storyblocks.com/templates/search/documentary) | S |

### Family J — Creator-format systems (vertical, faceless)

| # | Archetype | Description | Freq | Exemplar | Remotion |
|---|---|---|---|---|---|
| J1 | Reddit/tweet story card | Screenshot-style post card read aloud over gameplay/stock bg | 3 | "Reddit story", "Twitter story" — [JSON2Video](https://json2video.com/templates); Plainly "Boxed gradient" — [Plainly](https://www.plainlyvideos.com/templates) | S |
| J2 | Faceless explainer short | Stock-media bed + captions + 1–3 facts + CTA; the CapCut-prescribed format | 4 | "Faceless Explainer Short" — [Shotstack](https://shotstack.io/studio/templates); CapCut fact-video guide — [capcut.com](https://www.capcut.com/resource/fact-video) | S/M |
| J3 | AI-avatar presenter | Talking head avatar delivering facts | 2 | "AI Avatar News Summary" — [Shotstack](https://shotstack.io/studio/templates); CapCut AI avatars | L |
| J4 | Audiogram / waveform scene | Waveform + text for podcast/quote audio | 2 | Remotion "Audiogram" — [remotion.dev/templates](https://www.remotion.dev/templates); JSON2Video `audiogram` element — [docs](https://json2video.com/docs/v2/reference/json-syntax/movie) | S |

**Count: 40 archetypes across 10 families** (2 marked `?` unobserved-or-unverified: C2 choropleth, E4 magazine cover).

---

## Top 10 for a faceless-documentary factory (differentiation × build cost)

1. **D6 Dark-documentary statement scene (S)** — defines the genre; near-black + grain + giant type is trivial in CSS. Highest identity-per-effort.
2. **D1 Case-file timeline track (M)** — the most repeated premium documentary archetype (Pond5 ~494 timeline templates; 7 Storyblocks variants; Envato ×2) yet absent from every Remotion-native pack → genuine differentiation.
3. **D2 Redacted/evidence card (M)** — investigation identity; SVG masks + bar reveals; only 2 commodity sources.
4. **C1 Animated route/pins map (M)** — Netflix-doc convention; Remotion-proof via the paid Watercolor Map template; no free Remotion pack covers maps.
5. **B4 Big-number stat counter (S)** — universal in facts video, one spring + comma formatting.
6. **B5 Comparison split (S)** — before/after both as metrics and images; cheap, high retention value.
7. **A6 Listicle counter (S)** — sold by both an API vendor and a marketplace; trivially data-driven.
8. **A5 Quote card (S)** — stoic/motivation lanes run on it; one component serves multiple channels.
9. **A2 Word-by-word caption block (S)** — table stakes for Shorts; official Remotion template proves the pipeline.
10. **A7 Chapter title card (S)** — segmentation device that makes long-form documentary feel structured; near-zero competition in Remotion.

Runners-up: D4 newspaper clipping (M), D5 retro-TV frame (M), H6 grain/VHS overlay pack (S), A4 lower third (S, table stakes).
Deliberately skipped: AI-avatar scenes (L, infra-heavy), character-animation explainers (Videohive toolkits with 30+ characters — a different product line), choropleth maps (no observed demand in sampled catalogs).

---

## Risks / gaps

- **Canva and CapCut template catalogs are JS-walled** — no direct scene inventory captured; creator-side claims rest on CapCut's own guide, Etsy/CreativeFabrica listings, and snippets. `?`
- **Pippit "Dark Documentary" collection** could not be fetched (404); existence is from a search snippet only. UNVERIFIED.
- **Pond5/Storyblocks/Etsy counts** are category-header numbers, not audited per-item; marketplace pages show names, not scene lists — layout attribution for those packs is inferred from names + preview conventions.
- **Envato/Vimeo-style "Vox documentary titles"** appeared only as a related-search tag on Envato — the "Vox style" keyword is real demand evidence but no specific pack was inventoried.
- Remotion brief mismatch: "Remotion Titles / Staggered Text / Charts / Lottie / iframe" are not official gallery templates (checked 2026-11-09); Lottie and iframe are official *packages/docs* instead; titles/staggered-text/charts are covered by the third-party RVE pack.
- Per-template scene lists for paid Envato items (e.g., "Documentary Broadcast Package") were not opened individually — archetype counts there are name-level.

## Open questions for the owner

1. Choose the first template FAMILY to spec (recommendation: Evidence/Investigation D1+D2+D6 on top of the existing typographic base).
2. License posture: build all 10 in-house (preferred per no-static-maps directive) vs. buy 1–2 Envato packs for scene-reference only.
3. Map scenes (C1): real geo-projection (L) vs. stylized SVG map with data-free routes (M) — decide before MR pilot spec.

## Sources

1. [remotion.dev/templates](https://www.remotion.dev/templates) — official gallery inventory, 23 templates (2026-11-09).
2. [github.com/reactvideoeditor/remotion-templates](https://github.com/reactvideoeditor/remotion-templates) — 81 free MIT Remotion scene templates, 9 categories; README gap list (maps/timelines/terminal/device).
3. [remotion.dev/templates/tiktok](https://www.remotion.dev/templates/tiktok) — word-by-word captions + Whisper.cpp.
4. [remotion.dev/templates/audiogram](https://www.remotion.dev/templates/audiogram) — podcast snippet template.
5. [remotion.dev/docs/lottie](https://www.remotion.dev/docs/lottie) — official Lottie package support.
6. [remotion.dev/docs/iframe](https://www.remotion.dev/docs/iframe) — `<IFrame>` component, auto delayRender.
7. [creatomate.com/template-editor](https://creatomate.com/template-editor) — element types, keyframes, Hook/Close scene naming.
8. [creatomate.com/docs/api/reference/modifications](https://creatomate.com/docs/api/reference/modifications) — template automation surface.
9. [json2video.com/docs/v2/reference/json-syntax/movie](https://json2video.com/docs/v2/reference/json-syntax/movie) — 9 element types.
10. [json2video.com/docs/v2/reference/json-syntax/scene](https://json2video.com/docs/v2/reference/json-syntax/scene) — scene model, `iterate`, 40+ xfade transitions.
11. [json2video.com/templates](https://json2video.com/templates) — library: Top10, quotes, Reddit/Twitter story, would-you-rather, trivia.
12. [shotstack.io/studio/templates](https://shotstack.io/studio/templates) — ~230 templates, 9 categories; Faceless Explainer Short, AI facts TikTok, Chart of the Day.
13. [shotstack.io/use-cases/scenarios/api/generate-news-summary-videos](https://shotstack.io/use-cases/scenarios/api/generate-news-summary-videos) — news scene inventory (lower thirds + captions + b-roll; no ticker/charts/maps).
14. [shotstack.io/templates/html-lower-third-expanding-highlite](https://shotstack.io/templates/html-lower-third-expanding-highlite) — lower-third productization.
15. [plainlyvideos.com/templates](https://www.plainlyvideos.com/templates) — 19 AE templates, 5 families (publisher, tweet-card, slideshow, e-commerce).
16. [elements.envato.com/video-templates/documentary+titles](https://elements.envato.com/video-templates/documentary+titles) — documentary titles inventory + related-search tags (vox style, timeline, credits).
17. [elements.envato.com/video-templates/documentary](https://elements.envato.com/video-templates/documentary) — History Documentary Timeline ×2, Broadcast Package, Investigation Documentary, Old TV, slideshows.
18. [storyblocks.com/templates/search/documentary](https://www.storyblocks.com/templates/search/documentary) — 837 results; timeline variants, pin board, Old TV, VHS CRT, newspaper intro.
19. [pond5.com/search?kw=documentary&media=ae](https://www.pond5.com/search?kw=documentary&media=ae) — ~1,222 documentary AE templates (category header).
20. [pond5.com/search?kw=timeline-history&media=ae](https://www.pond5.com/search?kw=timeline-history&media=ae) — ~494 timeline templates.
21. [pond5.com/after-effects/1/classic-lower-third.html](https://www.pond5.com/after-effects/1/classic-lower-third.html) — ~189 lower thirds.
22. [filtergrade.com/15-lower-thirds-templates-for-documentaries](https://filtergrade.com/15-lower-thirds-templates-for-documentaries/) — documentary lower-thirds roundup (demand corroboration).
23. [motionarray.com/motion-graphics-templates/huge-kinetic-typography-pack-97661](https://motionarray.com/motion-graphics-templates/huge-kinetic-typography-pack-97661) — 45 kinetic elements.
24. [motionarray.com/motion-graphics-templates/kinetic-typography-titles-864312](https://motionarray.com/motion-graphics-templates/kinetic-typography-titles-864312) — 9 scenes, color controller.
25. [capcut.com/resource/fact-video](https://www.capcut.com/resource/fact-video) — 5 fact-video genres, 15–30s, captions, match-stock-media workflow.
26. [capcut.com/template-detail/Scary-facts/7421931490465828102](https://www.capcut.com/template-detail/Scary-facts/7421931490465828102) — dark facts template exists.
27. [pippit.ai/templates/dark-documentary](https://www.pippit.ai/templates/dark-documentary) — Dark Documentary collection `?` UNVERIFIED (404 on fetch; search snippet only).
28. [etsy.com/market/faceless_video_bundle](https://www.etsy.com/market/faceless_video_bundle) — faceless bundle market exists.
29. [etsy.com/market/fact_video_bundle](https://www.etsy.com/market/fact_video_bundle) — fact-video bundle market (bundle-size claims unaudited).
30. [creativefabrica.com/product/dark-documentary-crime-youtube-thumbnail](https://www.creativefabrica.com/product/dark-documentary-crime-youtube-thumbnail/) — dark-documentary crime aesthetic demand.
31. [elements.envato.com/video-templates/saas+explainer+video](https://elements.envato.com/video-templates/saas+explainer+video) — SaaS UI-walkthrough category (device-mockup demand).
32. [videohive.net/item/explainer-video-icons-toolkit/39341113](https://videohive.net/item/explainer-video-icons-toolkit/39341113) — 250+ animated icons (icon-scene demand).
33. [trezalabs.com/tools/ai-fact-video-generator](https://www.trezalabs.com/tools/ai-fact-video-generator) — "Fact of the Day" generator format.
34. [elements.envato.com/video-templates/explainer+video](https://elements.envato.com/video-templates/explainer+video) — modular-scene explainer category.
35. [youtube.com/watch?v=W6WH-Mxy37Q](https://www.youtube.com/watch?v=W6WH-Mxy37Q) — Netflix-style documentary map animation convention.

*Datestamp: 2026-11-09. All star/sales/count figures are as observed on that date.*
