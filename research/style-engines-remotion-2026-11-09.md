# Style Engines for Remotion: Building 8+ Distinct Template Families

**Date:** 2026-11-09
**Scope:** Libraries, npm packages, and Remotion capabilities for fully distinct scene-renderer FAMILIES (not palette-swap themes). Deterministic server-side render (chrome-headless-shell), no licensed assets, Node-side orchestration via `npx remotion render`.
**Status:** Research only. Every package below was verified against npm registry JSON, the remotion-dev GitHub monorepo source, or remotion.dev docs on 2026-11-09 unless explicitly marked UNVERIFIED.

---

## Summary (verdict first)

1. **Remotion already ships most of the "hard" primitives.** `@remotion/transitions` has **21 built-in presentations including a page-turn (`bookFlip()`)**, a documented API for authoring custom presentations (ink-reveal, whip, etc. are ~100–150 lines each), and a shader escape hatch (`makeHtmlInCanvasPresentation`).
2. **`@remotion/rough-notation` (official, MIT) is the whiteboard/comic unlock**: hand-drawn Highlight/Box/Circle/StrikeThrough annotations with a `seed` prop (determinism) and `progress` (draw-on). Pair with `roughjs` (MIT, seeded) for full-scene sketch rendering.
3. **`@remotion/paths` gives handwriting/draw-on for free**: `evolvePath`, `getLength`, `getPointAtLength`, `warpPath` (20 functions, MIT). Stroke-dasharray tricks become frame-exact math.
4. **Maps without any map runtime**: `d3-geo` (ISC) + `topojson-client` (ISC) + `world-atlas` (ISC; Natural Earth public-domain data) project to plain SVG path strings offline. Mapbox/Leaflet are runtime-map libs — **not suitable** for deterministic Remotion render.
5. **Charts: hand-roll SVG.** Recharts only works if you disable its animations and drive data from `useCurrentFrame()` (official issue #995); for our stat/chart scenes, ~200 lines of custom SVG + `@remotion/paths` is lighter and fully deterministic.
6. **Kinetic type gets a big upgrade for free**: GSAP 3.13+ made ALL plugins free (SplitText, DrawSVG, MorphSVG) after the Webflow acquisition, and `@remotion/gsap` (official, MIT) makes GSAP deterministic by seeking a paused timeline to the current frame.
7. **Two corrections to the brief:** `@remotion/curves` **does not exist** (npm registry returns 404 — verified 2026-11-09; use core `Easing.bezier()` / `@remotion/paths` instead), and the captions package is **`@remotion/install-whisper-cpp`** (not "-caps").
8. **Licensing landmine:** LottieFiles is **NOT CC0** — it's the "Lottie Simple License" (free commercial use, but not public domain). Cleanest attribution-free Lottie lane found: UseAnimations (MIT, 300 icon animations). Official `@remotion/animated-emoji` artwork is CC BY 4.0 (attribution required).
9. **Determinism rules stay the same everywhere:** everything must be a pure function of `useCurrentFrame()`; seeded randomness only (`@remotion/noise` seeded 2D/3D/4D simplex; roughjs `seed` 1..2^31; `randomSeed()`/`random()` from core). One caveat found: `@remotion/google-fonts` fetches woff2 from fonts.gstatic.com at load time (URLs are version-pinned, e.g. Playfair Display v40) — for fully hermetic renders, pre-download and load via `@remotion/fonts`.
10. **License check (2026-11-09):** Remotion core packages are free for individuals/companies ≤3 employees (exact quote verified from LICENSE.md); utility sub-packages (`paths`, `shapes`, `noise`, `google-fonts`, `rough-notation`, `gsap`, `layout-utils`, `rounded-text-box`, `install-whisper-cpp`) are MIT; `@remotion/lottie` and `@remotion/animated-emoji` carry the Remotion License. Pin all `@remotion/*` to the exact same version (`--save-exact`, no `^`).

---

## 1. Remotion official packages (verified npm names)

All `@remotion/*` packages must be kept at one exact version (install snippet on every docs page says: "Also update `remotion` and all `@remotion/*` packages to the same version. Remove all `^` characters"). Latest seen on registry 2026-11-09: **4.0.542**. Docs reference a future v5.0 behavior change ("From v5.0, `weights` and `subsets` are required" — google-fonts page), so pin 4.x exactly.

| Package | What it gives us | License (verified) | Bundle/render cost | Determinism | Family unlock |
|---|---|---|---|---|---|
| `@remotion/transitions` | `<TransitionSeries>`, `linearTiming()`, `springTiming()`, 21 built-in presentations (incl. `bookFlip()` page-turn, `clockWipe()`, `iris()`, `dissolve()`, `cube()`, `crosswarp()`, `ripple()`, `swap()`, `slide()`, `fade()`, `flip()`, `wipe()`, `zoomBlur()`, `zoomInOut()`, new-gen `blurSlide()`, `crossZoom()`, `dreamyZoom()`, `filmBurn()`, `linearBlur()`, `pushCut()`), custom `TransitionPresentation` API, `makeHtmlInCanvasPresentation()` + `HtmlInCanvasShader` types | Remotion License (docs) / source MIT-labeled per package | Per-transition: both scenes render during overlap; shader variants cost GPU | All frame-driven; custom presentations are pure functions of `presentationProgress` | ALL — each family gets its own transition vocabulary (paper: bookFlip; poster: pushCut; terminal: clockWipe; dossier: iris) |
| `@remotion/shapes` | 11 SVG shape components (`Arrow`, `Callout`, `Circle`, `Ellipse`, `Heart`, `Pie`, `Polygon`, `Rect`, `Spark`, `Star`, `Triangle`) + 11 `make*` factory functions returning path data | MIT | Trivial (path strings) | Pure geometry | comic-panel (bursts, arrows), scrapbook (badges), editorial (rules/ornaments) |
| `@remotion/paths` | 20 functions: `getLength`, `evolvePath`, `getPointAtLength`, `getTangentAtLength`, `getInstructionIndexAtLength`, `interpolatePath(s)`, `parsePath`, `serializeInstructions`, `normalizePath`, `resetPath`, `reversePath`, `translatePath`, `scalePath`, `centerPath`, `cutPath`, `getBoundingBox`, `getSubpaths`, `reduceInstructions`, `extendViewBox`, `warpPath` | MIT | Trivial | Pure math; usable outside Remotion too | whiteboard-sketch + handwriting-on effects everywhere; map border draw-on |
| `@remotion/noise` | `noise2D(seed, x, y)`, `noise3D(seed, x, y, z)`, `noise4D(seed, x, y, z, w)`; wraps `simplex-noise` 4.0.1; seed is `string \| number`; FIFO cache of 10 generators | MIT | Trivial | Deterministic per (seed, coords) — pure function | paper grain drift, grease-pencil jitter, scanline wobble, halftone distortion |
| `@remotion/motion-blur` | `<HtmlInCanvasMotionBlur>` (state-of-the-art), `<CameraMotionBlur>` (`shutterAngle`, `samples`), `<Trail>` | Docs page doesn't state; treat as Remotion License (UNVERIFIED) | Renders frame multiple times + blends (samples × render cost) | Frame-based | poster (rapid cuts with streaks), comic speed lines |
| `@remotion/rough-notation` | Hand-drawn annotation components: `<Highlight>`, `<Box>`, `<Circle>`, `<StrikeThrough>` (all four doc pages verified); props: `progress` (0–1 draw-on), `seed` ("Change the integer on every frame to animate the shape"), `roughness`, `bowing`, `maxRandomnessOffset`, `color`, `strokeWidth`, `iterations`; built on Rough.js. Available from v4.0.490 | MIT | Tiny | Seeded — deterministic | whiteboard-sketch (primary), dossier-evidence (red circles), comic-panel (emphasis) |
| `@remotion/google-fonts` | Type-safe per-font modules: `import {loadFont} from '@remotion/google-fonts/PlayfairDisplay'`; returns `{fontFamily}`; `getInfo()`, `getAvailableFonts()`; `waitUntilDone()` for gating | MIT | Loads only requested weights/subsets | **Caveat:** fetches woff2 from fonts.gstatic.com at load time (version-pinned URLs, e.g. `v40`) — fine for renders with network; for hermetic renders pre-download and use `@remotion/fonts` | ALL — see font matrix below |
| `@remotion/lottie` (+ peer `lottie-web`) | `<Lottie>` component playing Lottie JSON frame-synced; `getLottieMetadata()` | Remotion License | lottie-web bundle; expression support is partial — docs warn expressions may render non-deterministically ("flickering") via `.goToAndStop()` — vet per-file | Frame-synced EXCEPT expressions | scrapbook stickers, prop animations (if we adopt Lottie at all) |
| `@remotion/gif` | `<Gif>` component synchronized with `useCurrentFrame()` | Docs page doesn't state (UNVERIFIED) | GIF decode per frame | Frame-synced by design | dossier "exhibit footage", scrapbook stickers |
| `@remotion/media-utils` | Audio analysis for waveform/beat visuals (`useAudioData()` + related functions; all but the hook usable outside Remotion) | MIT | decodeAudioData cost | Frame-driven | audiogram-style scenes in any family; poster beat cuts |
| `@remotion/captions` | `parseSrt`, `parseVtt`, `serializeSrt`, **`createTikTokStyleCaptions`** (word-level `TikTokToken`s / `TikTokPage`s — the official word-highlight primitive), `ensureMaxCharactersPerLine` | Not stated on docs page (UNVERIFIED; monorepo package) | Trivial | Pure data transforms | karaoke captions — overlaps our existing captions lane; adopt the data format, keep our renderer |
| `@remotion/install-whisper-cpp` | Local Whisper.cpp install + `transcribe()` with `tokenLevelTimestamps: true` + `toCaptions()` | MIT | Native compile + model download (offline after) | Offline transcription | overlap only — our captions lane already covers this; exact npm name is `install-whisper-cpp` (not "-caps") |
| `@remotion/gsap` | "Use GSAP timelines in Remotion"; docs: "This package builds a paused GSAP timeline and seeks it to the current frame" — deterministic. Available from v4.0.517; peer dep `gsap` | MIT | GSAP runtime | Deterministic by seek design | kinetic typography via SplitText (below) |
| `@remotion/layout-utils` | "Utility functions for creating dynamic layouts" (text measurement for fit-to-box) — from v4.0.50 | MIT | Trivial | Frame-safe (needs fonts loaded first) | terminal boards, stat cards, any auto-sized text |
| `@remotion/rounded-text-box` | "Create a TikTok-like multiline text box SVG path with rounded corners" — from v4.0.360 | MIT | Trivial | Pure geometry | scrapbook labels, comic captions/callouts |
| `@remotion/animated-emoji` | Google Noto animated emoji as components (from v4.0.187); artwork "licensed under CC BY 4.0" (attribution required), package under Remotion License | Remotion License + CC BY 4.0 assets | Small | Frame-driven | scrapbook stickers (with credit line) |
| `@remotion/animation-utils` | "Functions that support you in animating CSS styles" (from v4.0.92) | MIT | Trivial | Frame-driven | shared helpers |
| `@remotion/skia` | Listed in docs sidebar as official package (React Native Skia wrapper for GPU drawing/shaders). Details UNVERIFIED this session (docs page fetch failed) — evaluate later only if SVG/CSS halftone proves insufficient | UNVERIFIED | GPU | Presumed frame-driven (UNVERIFIED) | optional: halftone/noise shaders |
| `@remotion/curves` | **DOES NOT EXIST.** npm registry returns 404 (verified 2026-11-09). For bezier easing use core `Easing.bezier()`; for curve path data use `@remotion/shapes` `make*` factories + `@remotion/paths`; note `@remotion/effects` has a `curves()` but it is color-grade tonal curves, not motion curves | — | — | — | — |

### Custom TransitionPresentations — yes, we can author page-turn/ink-reveal/whip ourselves

From the official docs (remotion.dev/docs/transitions/presentations/custom): a custom presentation is a factory returning `{component, props}` where the component receives `children`, `presentationDirection` ('entering' | 'exiting'), `presentationProgress` (0–1), and `passedProps`. The official example builds an SVG star-mask reveal via `clipPath: url(#id)` driven by progress — the same pattern gives us:

- **ink-reveal**: SVG mask with a blot/wash path animated via `@remotion/paths` `evolvePath` — dossier/evidence + paper families.
- **whip-pan**: translate + directional `@remotion/motion-blur` `<LinearBlur>`-style blur — poster family.
- **page-turn with our own paper texture**: built-in `bookFlip()` exists already (v4.0.466+, shader-based, "bends the outgoing and incoming scenes into a shaded page-turning book flip"; fragment shader adapted from the MIT-licensed BookFlip GL Transition). Note: bookFlip/HTML-in-canvas presentations need the canvas-draw-element capability — docs say preview in Studio requires a Chrome flag, but server rendering is supported (Node.js, Bun, serverless listed on the bookFlip page).

Built-in presentation source files verified at `packages/transitions/src/presentations/` (21 files incl. `book-flip.tsx`, `clock-wipe.tsx`, `iris.tsx`) — reading those is the recommended template for authoring ours. Import note: classic presentations are imported via **subpath** (`import {slide} from '@remotion/transitions/slide'`; same for book-flip), because the package `index.ts` only re-exports the six new-gen ones (verified from source 2026-11-09).

---

## 2. Hand-drawn / sketch stack (whiteboard-sketch family)

| Tool | npm name | What it enables | License | Cost | Determinism |
|---|---|---|---|---|---|
| Rough.js | `roughjs` | Sketchy lines/rects/ellipses/polygons/paths on **Canvas and SVG**; "a small (<9 kB) graphics library"; hachure/cross-hatch fills, `roughness`, `bowing` | MIT (repo readme: "MIT License (c) Preet Shihn") | <9 kB | **Seed option verified** in API wiki: "An optional numeric value that sets the seed for creating random values used in shape generation... useful for creating the exact shape when re-generating with the same parameters" — range 1..2^31; omit/0 = nondeterministic, so ALWAYS pass a seed |
| @remotion/rough-notation | `@remotion/rough-notation` | Animated hand-drawn Highlight/Box/Circle/StrikeThrough around any JSX, with `progress` draw-on and `seed` | MIT | Tiny | Seeded |
| svg2roughjs | `svg2roughjs` | Converts SVG scenes into Rough.js drawings (candidate for re-styling imported icon SVGs into sketch style) | UNVERIFIED license this session — check before adopting | Moderate | Depends on seed config |

Recommended pattern for the sketch family: one `sketchCanvas` renderer component that takes our existing scene JSON and draws rects/arrows/underlines via RoughSVG with a per-element seeded RNG (`randomSeed()` from Remotion core or roughjs `seed`), plus rough-notation components for text emphasis. No canvas APIs at render time beyond what Remotion already handles — Rough.js outputs SVG nodes, which render fine headless.

---

## 3. Maps (map-atlas family) — offline, deterministic

**Do NOT use Mapbox GL / Leaflet / MapLibre in compositions** — they are runtime tile/network engines, not frame-pure renderers. The whole family needs zero runtime network:

| Package | Role | License | Notes |
|---|---|---|---|
| `d3-geo` | Projections (`geoEqualEarth`, `geoNaturalEarth1`, `geoOrthographic` for globe-spin via `projection.rotate([lambda, 0])` driven by frame), `geoPath()` → SVG `d` string | ISC | Pure math — perfectly deterministic |
| `topojson-client` | `feature(topology, object)` → GeoJSON for d3-geo | ISC | TopoJSON stores shared borders as arcs (small files) |
| `world-atlas` | "Pre-built TopoJSON from Natural Earth", v2.0.2 (2019-09-05, ISC, mbostock); `countries-50m.json` (~800 KB) — v2 renamed from `world/50m.json` | ISC; underlying Natural Earth data is public domain | Import statically via `staticFile()` or JSON import; fully offline |
| (recipe) great-circle flights | `d3.geoInterpolate(a, b)` sampled N points → path → draw-on with `evolvePath` | — | Frame-driven arc reveal |

Verified demo pattern: Observable "World Atlas Demo with d3.geo + TopoJSON" shows exactly the projection + path pipeline we need. Country fill animations = interpolate each country's fill between two colors from `useCurrentFrame()`; border draw-on = project border arcs, feed through `evolvePath`.

---

## 4. Charts — recommendation: custom SVG, Recharts only with caveats

- **Verified constraint (official issue #995, remotion-dev/remotion):** Recharts' built-in animations break frame-deterministic rendering; they must be disabled (`isAnimationActive={false}`) and motion re-implemented from `useCurrentFrame()`/`interpolate()`.
- **Recommendation:** our stat/chart scenes stay hand-rolled SVG: bars = `<rect>` heights via `interpolate()`; line/area draw-on = `@remotion/paths` `evolvePath` on the path `d` (exact, no stroke-dasharray hacks); pie/radial = `@remotion/shapes` `Pie`/`makePie`. This is ~200–300 lines for a tiny chart kit shared across families, styled per family (sketch via roughjs, editorial via thin rules, terminal via ASCII-ish mono bars). Adopt Recharts only if we later need complex axes/legends, always with animations off.

---

## 5. Paper / collage / halftone / tape (techniques, no new packages)

We already do SVG `feTurbulence` fiber grain. Round out the family toolbox with pure SVG/CSS, all deterministic when driven by frame math:

- **Halftone dots:** SVG `<pattern>` of circles with per-cell radius from `@remotion/noise`/frame — comic-panel + poster. (Shader-based halftone via `@remotion/skia` is the fallback if SVG patterns get slow — UNVERIFIED.)
- **Torn edges:** `clip-path: polygon(...)` with jittered vertex lists generated once from a seeded RNG per prop (not per frame) — scrapbook + dossier.
- **Tape/pins/stickers:** absolutely-positioned divs with rotated `linear-gradient` tape strips, `@remotion/shapes` `Star`/`Spark` badges, `@remotion/rounded-text-box` labels — scrapbook.
- **Sepia/archival photo treatment:** plain CSS `filter: sepia() contrast() brightness()` is a pure style function of its inputs (no animation) — safe; animate only filter *values* through `interpolate()`, never via CSS transitions (docs: "Don't use CSS animations in Remotion").
- **Grease-pencil circles:** already in our vox pack; standardize on `@remotion/rough-notation` `<Circle>` for the variant families.

---

## 6. Split-flap / departure-board (split-flap-board family)

The flip is trivial and best hand-rolled to match our token system: each character = two hinged halves; top half `transform: rotateX(0 → -90deg)` then bottom half `90deg → 0`, driven by `interpolate()` against a per-character cascade delay — all frame math, no library. Cycle letters alphabetically to the target char (deterministic count).

Verified npm alternatives if we'd rather adopt (npm registry search, 2026-11-09):

| Package | Version (date) | Downloads/mo | License | Note |
|---|---|---|---|---|
| `react-split-flap-effect` | 1.0.0 (2019-11-25) | ~12,303 | MIT | oldest/still-popular |
| `@daformat/react-split-flap-display` | 1.0.3 (2026-05-19) | ~14,833 | 0-Clause BSD | zero dependencies |
| `react-split-flap` | 0.2.1 (2026-07-15) | ~4,320 | MIT | maintained 2026 |
| `clackboard` | 1.1.2 (2026-04-15) | ~1,167 | MIT | composable, 3D flip, zero deps |
| `split-flap-elements` | 0.2.0 (2026-07-18) | low | MIT | web components (skip — we want React) |

Recommendation: hand-roll (~250–400 lines incl. board layout, mono font from `@remotion/google-fonts/IBMPlexMono` or `SpaceGrotesk`); it stays inside our one-engine token contract.

---

## 7. Kinetic typography helpers

- **Word-level karaoke captions:** `createTikTokStyleCaptions()` from `@remotion/captions` produces `TikTokPage`/`TikTokToken` word timings — the same data the official TikTok template renders. Our captions lane already exists; adopt this data format as the shared input, keep our per-family renderers (mono terminal karaoke vs. highlighter sweeps).
- **Scramble/decode text:** no official package; hand-roll ~60 lines (per-char reveal order from seeded RNG, char subset cycle, driven by `useCurrentFrame()`). Fits terminal-data-board and dossier.
- **Typewriter with variable speed:** substring slice per frame with a speed curve; pair with `@remotion/paths` for a caret path or a blinking block driven by `frame % n` (pure frame math).
- **GSAP SplitText (the big freebie):** GSAP 3.13+ (Webflow acquisition, April 2025) made all previously-paid plugins free — SplitText, DrawSVG, MorphSVG (current release 3.15.1 on GitHub, 2026-11-09). Via `@remotion/gsap` (MIT), timelines are built paused and **seeked to the current frame** — deterministic. Use for per-line/per-word stagger reveals in editorial/poster families without hand-rolling split logic.
- **Text measurement:** `@remotion/layout-utils` (MIT) for fit-to-box sizing in stat cards and terminal rows.

---

## 8. Lottie / icon asset sources (licensing flags)

| Source | License | Verdict |
|---|---|---|
| LottieFiles free catalog | **Lottie Simple License** — free commercial use, but NOT CC0/public domain | Usable, but keep an attribution/license ledger per file; plan-level restrictions apply to assets *created with their editor* |
| UseAnimations | MIT, "300 free Lottie icons", JSON download, no attribution required | Cleanest found for icon-scale animations |
| GitHub topic `lottie-animation` (933 repos) | per-repo | Vet per repo |
| `@remotion/animated-emoji` | Google Noto artwork CC BY 4.0 | Fine with a credits file |
| Iconify (`@iconify/json` offline data bundles) | Software MIT; **each icon set keeps its own license** (check per set at icon-sets.iconify.design). Offline requires bundling icon data (API-driven usage "unusable for offline applications") | Use `@iconify/json` + bundled data for prop icons in dossier/scrapbook; record set license per icon |

Given `@remotion/lottie`'s expression caveat, our default remains procedural SVG; Lottie only for pre-made micro-animations where drawing them is not worth it.

---

## 9. Remotion template gallery — what to mine (remotion.dev/templates, 2026-11-09)

Free templates worth reading for scene-system ideas: **TikTok** ("Generate animated word-by-word captions" — overlaps our captions lane), **Code Hike** ("Beautiful code animations" — direct reference for terminal-data-board scenes), **Stargazer** (animated repo-stats video — animated counter/stat reveals), **Audiogram** and **Music Visualization** (waveform scenes), **Overlay** (editing overlays), **Element Library** (publishable component-pack structure — a good model for how we package families), **3D** (R3F starter — out of scope for now), **Skia** starter (for the shader path), **Prompt to Motion Graphics SaaS Starter Kit** and **Prompt to Video** (pipeline references). Paid: **Watercolor Map** ("A beautiful 2D map for travel videos") — the closest commercial precedent for our map-atlas family; worth buying only if the d3-geo route stalls.

---

## 10. Engine constraints (Remotion 4.x)

- **Versions:** registry latest 4.0.542 (2026-11-09); install snippets reference 4.0.532. Pin every `remotion`/`@remotion/*` at one exact version, no `^` (stated on every package docs page). Docs already mention v5.0 requirements — don't float.
- **React:** Remotion 4.x supports React 18/19 (per docs matrix); our compositions are pure server renders — no Player needed.
- **Determinism contract:** every component is "a function that transforms a frame number" (docs/flickering); never CSS animations/time-based transitions (docs/troubleshooting/css-animations); randomness only via seeded APIs (`randomSeed()`, `random(seed)` core; `@remotion/noise` seeded; roughjs `seed`). No `Date.now()`/`Math.random()`, no runtime network in compositions (exception to evaluate: google-fonts fetch, or pre-bundle).
- **HTML-in-canvas features** (`bookFlip`, `makeHtmlInCanvasPresentation`, `HtmlInCanvasMotionBlur`): supported for Node/server rendering ("Rendering needs no configuration" per motion-blur docs); Studio preview needs the Chrome canvas flag. Test one render early if we adopt them.
- **Render path:** `npx remotion render` with `chrome-headless-shell`; fonts gate via `waitUntilDone()`/`continueRender` patterns.
- **Licensing:** free for "individuals, non-profits, those still evaluating the tool, and small for-profit companies... a for-profit organization with up to 3 employees" (LICENSE.md, verified 2026-11-09). We fit. If the studio business grows past 3 employees, a Company License becomes due — flag now, not later.

---

## Coverage matrix — family → packages → estimated new-code lines

Estimates are for family-specific renderers/scenes on top of the shared engine (token Theme stays bg/ink/accent/fonts/grain/motion); they are engineering guesses, not quotes.

| Family | New packages needed | Reuses | Est. new-code lines |
|---|---|---|---|
| paper-collage (vox, exists) | none | existing | 0 (baseline) |
| poster (exists) | none (`@remotion/motion-blur` optional for streak cuts) | existing | 0–150 |
| whiteboard-sketch | `roughjs`, `@remotion/rough-notation` | paths (draw-on), Caveat/Patrick Hand fonts | 600–900 (sketch renderer + 3–4 scenes) |
| magazine-editorial | none new | paths, shapes, google-fonts (Playfair Display, DM Serif Display, Space Grotesk), GSAP SplitText via `@remotion/gsap` | 400–600 (grid system + pull-quote/stat scenes) |
| comic-panel | `@remotion/rough-notation` (shared) | shapes (Arrow/Star/Spark/bursts), SVG halftone patterns, Archivo Black | 600–800 (panel grid + caption boxes + SFX type) |
| terminal-data-board | none new | IBMPlexMono, noise (scanline flicker), typewriter/scramble (~60–80 lines) | 300–500 |
| map-atlas | `d3-geo`, `topojson-client`, `world-atlas` | paths (border/flight draw-on), shapes (markers) | 700–1000 (projection pipeline + 3 scene types) |
| split-flap-board | none (hand-roll) or `react-split-flap` | IBMPlexMono/Space Grotesk, layout-utils | 250–400 |
| dossier-evidence | `@iconify/json` (optional icons), `@remotion/gif` (optional exhibits) | rough-notation Circle, Special Elite, tape/clip-path techniques, noise | 400–600 |
| scrapbook | `@remotion/rounded-text-box`, optionally `@remotion/lottie`+`lottie-web` | paper grain, shapes, Caveat, animated-emoji (CC BY) | 300–500 |
| shared: family transitions | `@remotion/transitions` custom presentations | — | 80–150 per presentation (2–3: ink-reveal, whip, paper-fold) |
| shared: chart kit | none | paths, shapes, interpolate | 200–300 |

**Total to reach all 9 new/refreshed families: roughly 3,800–5,700 lines**, installable surface = 5–8 small deps (roughjs, d3-geo, topojson-client, world-atlas, @iconify/json, optional lottie/gsap).

---

## Risks / gaps

1. **`@remotion/lottie` expressions** can flicker (docs admit `.goToAndStop()` + expressions may render nondeterministically) — only use expression-free Lottie files; vet each file.
2. **Google Fonts at render time** is network-dependent; version-pinned but still an external fetch. Hermetic alternative: `@remotion/fonts` + committed woff2 (we already commit Anton/Cinzel/Inter TTFs under `thumbnails/fonts/`).
3. **HTML-in-canvas transitions** (bookFlip, shader presentations, HtmlInCanvasMotionBlur) are the newest machinery — schedule a one-composition smoke render before committing a family to them; docs say server render needs no config, but verify on our runner.
4. **`@remotion/skia`, `@remotion/media-utils` full export lists, `@remotion/captions` license, `@remotion/motion-blur`/`gif` licenses**: not fully verified this session (docs TOC placeholders / 404s) — marked UNVERIFIED above; check license fields at install time (`npm view <pkg> license`).
5. **Recharts** is only safe with animations disabled — and at that point its value-add is small; keep chart code in-house.
6. **world-atlas data is from 2019** (Natural Earth v4.1) — fine for stylized maps; do not use for anything politically precise.
7. **CC BY 4.0 assets** (animated-emoji) require attribution — keep a credits lane in end cards if adopted.
8. **Remotion ≤3-employee license ceiling** — revisit if headcount grows.

## Open questions

1. Do we want GSAP (`@remotion/gsap` + free SplitText/DrawSVG) as a second animation engine alongside our hand-rolled spring/interpolate system, or keep one paradigm? (Bundle + mental-model cost vs. saved kinetic-type code.)
2. Buy the paid **Watercolor Map** template as a map-atlas reference, or commit to the d3-geo build?
3. For hermetic renders: commit font woff2 files per family kit (consistent with kit/registry data being channel-specific), or accept gstatic fetches at render?
4. `@remotion/skia` evaluation: only if SVG halftone/grain proves too slow at 1080p.

---

## Sources

1. https://www.remotion.dev/docs/transitions — TransitionSeries package overview, install, license link (Remotion License), min version 4.0.53
2. https://www.remotion.dev/docs/transitions/presentations/custom — custom `TransitionPresentation` API (component/props/progress/direction), star-mask example
3. https://www.remotion.dev/docs/transitions/presentations — "presentation + timing forms a transition" concept
4. https://www.remotion.dev/docs/transitions/presentations/slide — slide() options, **subpath import** `@remotion/transitions/slide`, enterStyle/exitStyle from 4.0.84
5. https://www.remotion.dev/docs/transitions/presentations/book-flip — built-in page-turn, 4.0.466+, HTML-in-canvas, MIT-credited GL Transition shader
6. https://github.com/remotion-dev/remotion/tree/main/packages/transitions/src/presentations — 21 presentation source files (book-flip, clock-wipe, iris, dissolve, cube, crosswarp, ripple, swap, ...)
7. https://raw.githubusercontent.com/remotion-dev/remotion/main/packages/transitions/src/index.ts — exports: linearTiming/springTiming/TransitionSeries/makeHtmlInCanvasPresentation + 6 new-gen presentations + shader types (classic ones are subpath-only)
8. https://www.remotion.dev/docs/shapes — @remotion/shapes MIT
9. https://raw.githubusercontent.com/remotion-dev/remotion/main/packages/shapes/src/index.ts — 11 shape components + 11 make* factories (verified names)
10. https://www.remotion.dev/docs/paths — @remotion/paths MIT, built on svg-path-properties/svgpath/d3-interpolate-path et al.
11. https://raw.githubusercontent.com/remotion-dev/remotion/main/packages/paths/src/index.ts — 20 exported functions (evolvePath, getLength, warpPath, ...)
12. https://www.remotion.dev/docs/noise — @remotion/noise package
13. https://raw.githubusercontent.com/remotion-dev/remotion/main/packages/noise/src/index.ts — noise2D/3D/4D signatures, seeded
14. https://registry.npmjs.org/@remotion%2Fnoise — MIT, 4.0.542, wraps simplex-noise 4.0.1
15. https://registry.npmjs.org/@remotion%2Fpaths — MIT, 4.0.542
16. https://registry.npmjs.org/@remotion%2Fcurves — **404: package does not exist** (checked 2026-11-09)
17. https://www.remotion.dev/docs/google-fonts — per-font modules, loadFont(weights/subsets), gstatic fetch URLs, v5.0 note, MIT
18. https://raw.githubusercontent.com/remotion-dev/remotion/main/packages/google-fonts/src/PlayfairDisplay.ts (also Cinzel.ts, Caveat.ts, PatrickHand.ts, IBMPlexMono.ts, SpaceGrotesk.ts, SpecialElite.ts, DMSerifDisplay.ts; ArchivoBlack.ts seen in directory listing) — all 9 requested font modules verified
19. https://www.remotion.dev/docs/lottie — features/unsupported (expression flicker warning), Remotion License
20. https://www.remotion.dev/docs/gif — frame-synced GIF component
21. https://www.remotion.dev/docs/media-utils — audio info/visualization utilities, MIT
22. https://www.remotion.dev/docs/motion-blur — HtmlInCanvasMotionBlur / CameraMotionBlur / Trail, "Rendering needs no configuration"
23. https://www.remotion.dev/docs/rough-notation/api — annotation props: progress, seed, roughness, bowing; MIT; v4.0.490+
24. https://www.remotion.dev/docs/rough-notation/circle — Circle component verified (strokeWidth 20 default, iterations, curveFitting)
25. https://www.remotion.dev/docs/rough-notation/highlight, /box, /strike-through — component doc pages (via search results)
26. https://www.remotion.dev/docs/gsap — "builds a paused GSAP timeline and seeks it to the current frame"; MIT; v4.0.517+
27. https://github.com/greensock/GSAP — current 3.15.1; free-plugin change since 3.13 (Webflow) reported by gsap.com forums/agency guides (e.g. agencenorry.com guide; tympanus.net Codrops 2026-01-14)
28. https://www.remotion.dev/docs/rounded-text-box — TikTok-like rounded text-box SVG path; MIT; v4.0.360+
29. https://www.remotion.dev/docs/layout-utils — dynamic layout utilities; MIT; v4.0.50+
30. https://www.remotion.dev/docs/animated-emoji — Google Noto animated emoji; artwork CC BY 4.0; v4.0.187+
31. https://www.remotion.dev/docs/animation-utils — CSS animation helpers; MIT; v4.0.92+
32. https://www.remotion.dev/docs/install-whisper-cpp — exact name, MIT, tokenLevelTimestamps, toCaptions
33. https://raw.githubusercontent.com/remotion-dev/remotion/main/packages/captions/src/index.ts — parseSrt/parseVtt/serializeSrt/createTikTokStyleCaptions exports
34. https://raw.githubusercontent.com/remotion-dev/remotion/main/LICENSE.md — free ≤3-employee for-profit orgs (exact quote)
35. https://www.remotion.dev/license — "completely free to use for any individual or small company"
36. https://github.com/rough-stuff/rough — Rough.js MIT ("(c) Preet Shihn"), <9 kB, Canvas+SVG
37. https://github.com/rough-stuff/rough/wiki — seed option (1..2^31) for deterministic shapes
38. https://registry.npmjs.org/-/v1/search?text=world-atlas — world-atlas 2.0.2, ISC, "Pre-built TopoJSON from Natural Earth"
39. https://github.com/topojson/world-atlas/releases — v2 renamed countries-50m.json
40. https://observablehq.com/@roblabs/world-atlas-demo-with-d3-geo-topojson — d3-geo + TopoJSON rendering pattern
41. https://github.com/remotion-dev/remotion/issues/995 — Recharts animations must be disabled; drive from useCurrentFrame
42. https://www.remotion.dev/docs/troubleshooting/css-animations — no CSS animations (determinism)
43. https://www.remotion.dev/docs/flickering — "component as function of frame number"
44. https://lottiefiles.com/page/license — Lottie Simple License (not CC0)
45. https://useanimations.com/lottie-icons — MIT, 300 Lottie icon animations
46. https://iconify.design + https://iconify.design/docs/usage — MIT software, per-set icon licenses, offline requires bundled data
47. https://www.remotion.dev/templates — template gallery names/descriptions (2026-11-09)
48. https://registry.npmjs.org/-/v1/search?text=split-flap — split-flap package names, versions, dates, downloads, licenses (2026-11-09)
