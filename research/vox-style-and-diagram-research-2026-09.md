# Vox-Style + Animated Diagrams — Deep Research (2026-09-15)

**Goal:** find the best FREE / open-source ways to create animated diagrams and Vox-style explainer visuals at **$0**, how they fit our current automated pipeline (Remotion + LLM scripts + Edge TTS + Pixabay/Pexels chain), and other style variants worth building. RESEARCH ONLY — nothing implemented.

---

## 1. What "Vox style" actually is (deconstructed)

The signature look = 6 ingredients (all replicable in code):
1. **Paper-cutout collage** — photos/illustrations placed like torn paper pieces, slightly rotated, with drop shadows
2. **Off-white / off-black palette** (never pure white/black) + subtle paper grain / dust overlays → tactile "print" feel
3. **Low frame-rate stepped animation** (animating "on 2s") with subtle easing — this is the #1 trick (source: Chris Moran's Vox breakdowns)
4. **Hand-drawn animated doodle lines** — circles, arrows, underlines drawing themselves over imagery/documents
5. **Archival photos/documents + highlight treatment** — red circles, yellow highlights, magnified crops
6. **Earcons** — tiny sound effects synced to every visual beat (whoosh, pop, stamp, paper rustle) + vo-style music beds

Reference: [PremiumBeat's 5 Vox motion-graphic breakdowns](https://www.premiumbeat.com/blog/replicating-vox-motion-graphic/), [Chris Moran's "How Vox nails their animation style"](https://www.tiktok.com/@chrismoran__/video/7518151565258067230), [Vox sound-design system tutorial](https://www.youtube.com/watch?v=UgVgzSZVu-8), [documentary sound design Vox-style](https://www.youtube.com/watch?v=pVRW1GGTNZc).

## 2. Style variants worth building (ranked for our money channels)

| Style | Look | Fit for automation | Reference channels/videos |
|---|---|---|---|
| **A. Clean flat diagram** (current pipeline) | Boxes, arrows, icons, big numbers on navy/gold | ✅ Already built (long-paulson demo) | [How Money Works](https://www.youtube.com/@HowMoneyWorks) — e.g. "How America Got So Good At Buying Sh*t" (2.5M views) |
| **B. Vox paper-collage** | Cutouts + doodle lines + archival + earcons | ✅ High — 90% is code on top of current Remotion system | [Vox](https://www.youtube.com/@Vox) — Earworm / Border series; [PremiumBeat style breakdown](https://www.premiumbeat.com/blog/replicating-vox-motion-graphic/) |
| **C. Johnny Harris map-documentary** | Vintage maps, drawn routes, camera fly-throughs, archive photos | ✅ Medium — needs a map scene type (see §4.3) | [Johnny Harris](https://www.youtube.com/@johnnyharris); tutorial: [Flat Pack FX map animation](https://www.youtube.com/watch?v=QU0tdH-dlIA) |
| **D. Whiteboard hand-drawn** (Excalidraw) | Sketchy diagrams drawing themselves | ✅ Medium — Excalidraw scene JSON → animate | Excalidraw + [StoryMotion](https://news.ycombinator.com/item?id=47434920) |
| **E. 3Blue1Brown math** (Manim) | Precise math/graph animations (Python) | ⚠️ Separate Python engine — only if a math niche is wanted | [3Blue1Brown](https://www.youtube.com/@3blue1brown); [Manim CE](https://github.com/3b1b/manim) |
| **F. Kurzgesagt rich illustration** | Dense flat-gradient art | ❌ Needs human illustrators — skip | Kurzgesagt |

## 3. Free / open-source assets at $0 (the "Vox art supply closet")

| Asset type | Source | License | Use in pipeline |
|---|---|---|---|
| Flat vector illustrations (recolorable) | [unDraw](https://undraw.co/) | Free, no attribution, commercial OK | SVG → color-tint per brand → animate with springs |
| Hand-drawn characters | [Open Peeps](https://www.openpeeps.com/), Humaaans, [Open Doodles](https://www.opendoodles.com/) | CC0 | Character scenes (people icons with poses) |
| Illustrated scene packs | [Storyset by Freepik](https://storyset.com/) | Free w/ attribution | Animated插画 scenes (export SVG, animate layers) |
| Motion animations (JSON) | [LottieFiles](https://lottiefiles.com/) free library | Free tier | `<Lottie>` via @remotion/lottie — instant premium motion |
| Icons/diagrams | [SVG Repo](https://www.svgrepo.com/) (CC0/MIT packs) | CC0/MIT | Icon scene vocabulary ×1000s |
| **Archival photos/documents** | [Library of Congress](https://www.loc.gov/free-to-use/), [Wikimedia Commons](https://commons.wikimedia.org/), [rawpixel PD](https://www.rawpixel.com/public-domain) | Public domain | Vox's "document + red circle" scenes for history/business stories |
| **Archival footage** | [Internet Archive](https://archive.org/) (+ Prelinger), [NASA](https://images.nasa.gov/) | Public domain | Real historical clips behind narrated stories |
| Sound FX (earcons) | [Pixabay SFX](https://pixabay.com/sound-effects/) (key already in .env), freesound CC0 | Free | Pop/whoosh/stamp synced to beats |
| Paper/grain textures | rawpixel PD, generate procedurally | PD | The tactile Vox layer |

## 4. Free / open-source tech (how each piece renders)

| Piece | Tool | Cost | Notes |
|---|---|---|---|
| Base engine | **Remotion 4.0.524** (already installed) | $0 (solo license) | Everything below plugs into it |
| **Vox paper look** | Code: stepped frame-hold (render at 30, hold every 2nd frame), paper-grain overlay PNG, off-white/off-black palette variant | $0 | Pure code — phase 1 |
| **Doodle lines** | Already built (draw-in Connector/AnimatedIcon use pathLength) + SVG scribble paths | $0 | Already have the primitives |
| **Lottie animations** | **@remotion/lottie** (official) + LottieFiles free JSONs | $0 | Drop-in premium micro-animations |
| **Map animations** | **MapLibre GL JS** (open source) + GeoJSON + [maplibre-gl-video-export](https://github.com/bjperson/maplibre-gl-video-export) → mp4 → Remotion | $0 (free tiles) | Route-draw, camera fly-through — [camera anims](https://www.maplibre.org/maplibre-gl-js/docs/examples/customize-camera-animations/), [animate a line](https://www.maplibre.org/maplibre-gl-js/docs/examples/animate-a-line/) |
| **Whiteboard variant** | Excalidraw scene JSON → render frames ourselves, or [StoryMotion](https://news.ycombinator.com/item?id=47434920) | $0 | Phase-later |
| **Math variant** | Manim CE (Python) → mp4 → mux into our pipeline | $0 | Only if a math niche is chosen |
| **AI flat illustrations** | **Pollinations.ai** — free image API, NO API KEY, no signup ([edenai roundup](https://www.edenai.co/post/top-free-image-generation-tools-apis-and-open-source-models), [pollinations.ai](https://pollinations.ai/)) — prompt "flat vector illustration, minimal, off-white background" | $0 | Auto-generate custom illustrations per scene keyword |
| Archival clips | archive.org advancedsearch API | $0 | Public-domain footage |

## 5. Automation fit with the CURRENT pipeline

Already possible today with what we own:
- ✅ Remotion engine + icon draw-in + connector lines + footage chain + Edge TTS + LLM scripts
- ✅ Pexels/Pixabay video chain (b-roll) — extends to Pexels PHOTOS for Vox-style "photo cutout + circle highlight" scenes

What we'd ADD (each is a scene template + small pipeline step, all $0):
1. **Vox scene pack** (phase 1, pure code): paper texture + stepped animation + doodle circles/arrows + off-white palette variant → instant "Vox-lite"
2. **IllustrationScene** (phase 2): unDraw/Open Peeps SVGs + Lottie micro-animations
3. **ArchiveScene** (phase 3): archive.org/Library of Congress photo + red-circle/highlight + zoom
4. **MapScene** (phase 4): MapLibre → video export → mux (route-draw like Johnny Harris)
5. **Earcon track** (phase 5): Pixabay SFX synced to scene transitions (Vox sound design system)
6. **AI illustration scenes** (optional): Pollinations free API per scene keyword

Honest effort note: phases 1+2 are days; 3–5 are ~a week each including QA. Everything stays $0 and cloud/local automated.

## 6. Reference videos & images (what the output would look like)

**Vox style references:**
- Vox channel: https://www.youtube.com/@Vox (Earworm series = purest style sample)
- Style breakdown: https://www.premiumbeat.com/blog/replicating-vox-motion-graphic/
- Chris Moran Vox tricks: https://www.tiktok.com/@chrismoran__/video/7518151565258067230
- Vox sound design: https://www.youtube.com/watch?v=UgVgzSZVu-8
- AI Vox-style example workflow: https://www.youtube.com/watch?v=HD5ylyJANfU

**Johnny Harris map style:**
- Channel: https://www.youtube.com/@johnnyharris
- Map animation tutorial: https://www.youtube.com/watch?v=QU0tdH-dlIA
- How I animate vintage maps: https://www.facebook.com/JohnnyHarrisVox/videos/2494015224317264/

**Clean diagram style (what we already build):**
- How Money Works: https://www.youtube.com/@HowMoneyWorks

**Asset galleries (images of the style elements):**
- unDraw gallery: https://undraw.co/ · Open Peeps: https://www.openpeeps.com/ · Open Doodles: https://www.opendoodles.com/
- LottieFiles free animations: https://lottiefiles.com/ · SVG Repo CC0: https://www.svgrepo.com/
- Storyset scenes: https://storyset.com/ · CC0 illustration roundup: https://allsvgicons.com/cc0-illustrations/

**Map style samples:**
- MapLibre animate-a-line (route draw): https://www.maplibre.org/maplibre-gl-js/docs/examples/animate-a-line/
- maplibre-gl-video-export: https://github.com/bjperson/maplibre-gl-video-export

## 7. Recommendation

Build a **"Vox-lite" scene pack** on the existing engine first (paper palette + stepped motion + doodle lines + earcons — pure code, days of work, zero new dependencies), then add unDraw/Open Peeps illustration scenes + Lottie, then the archive.org photo scene, then maps. This gives 2 new visual styles (Vox-lite + maps) that cycle with the current clean-diagram style — matching how Vox itself rotates visual treatments within one video.
