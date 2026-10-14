# Premium animation libraries research — 2026-10-14

Context: CloudXBerry-style dev explainer demos felt "cheap — same 4-5 repeating patterns, not animations". Research goal: find libraries/frameworks to make generative HTML→MP4 videos genuinely premium, deterministic, and varied per topic.

## The big unlock: GSAP is now 100% free (incl. all "pro" plugins)

Webflow acquired GreenSock; since GSAP 3.13 (May 2025) every plugin is free, commercial use included:
- **DrawSVGPlugin** — real draw-on strokes for SVG lines/curves (no manual dashoffset math). Perfect for commit graphs, connector chains, orbits, underline sweeps.
- **MotionPathPlugin** — move any element along an SVG path (packets traveling network routes, commits sliding onto a branch, message bubbles between client/server).
- **MorphSVGPlugin** — morph shapes with different point counts (icon → icon transformations, blob transitions).
- **ScrambleTextPlugin** — terminal-style character scramble/typing for code lines.
- **SplitText** — professional kinetic typography (per-char cascades).
- **CustomEase / CustomBounce / CustomWiggle** — bespoke motion signatures per brand.
Sources: [CSS-Tricks — GSAP is now completely free](https://css-tricks.com/gsap-is-now-completely-free-even-for-commercial-use), [Codrops — 5 demos with free GSAP plugins](https://tympanus.net/codrops/2025/05/14/from-splittext-to-morphsvg-5-creative-demos-using-free-gsap-plugins), [MorphSVG docs](https://gsap.com/docs/v3/Plugins/MorphSVGPlugin), [GSAP alternatives comparison](https://annnimate.com/compare/gsap-alternatives).
CDN: same dist folder as core (`gsap@3.14.2/dist/DrawSVGPlugin.min.js` etc). Deterministic: everything registers as tweens on the ONE paused timeline the HyperFrames engine seeks → repeat:-1 loops and MotionPath are seek-safe.

## 3D: Three.js (MIT)

Wireframe/point-cloud globe with bezier arcs + traveling packets is ~80 lines of code. Deterministic when the render is a pure function of timeline time (rotation = t*k, packet = curve.getPointAt((t*speed+offset)%1), render inside `tl.eventCallback('onUpdate')`). UMD build: `three@0.128.0/build/three.min.js` (later versions are ESM-only). Sources: [three.js examples](https://threejs.org/examples), [three-globe](https://github.com/vasturiano/three-globe), [Globe.GL](https://globe.gl), [Shopify BFCM 3D viz writeup](https://shopify.engineering/bfcm-3d-data-visualization). Risk: WebGL in headless capture — verified by render test; fallback = 2D projected SVG globe.

## Frameworks evaluated and NOT adopted (for now)

- **Remotion** (React, TS): excellent for data-driven templated video at scale; our HyperFrames pipeline already covers this niche (memory: Remotion free-forever only for solo — company use needs paid license). [Comparison](https://rendercomp.com/blog/remotion-vs-motion-canvas-comparison), [2026 three-way](https://www.pkgpulse.com/guides/remotion-vs-motion-canvas-vs-revideo-programmatic-video-2026).
- **Motion Canvas** (TS): best-in-class choreographed 2D, but it's its own renderer — would bypass the HyperFrames HTML→MP4 engine entirely. Keep for a future dedicated "motion engine" if ever needed. [pexo.ai alternatives](https://pexo.ai/blog/remotion-alternatives-4966), [Manim→Motion Canvas guide](https://slama.dev/motion-canvas/introduction).
- **Manim** (Python): 3Blue1Brown math style; Python render path, different pipeline. Not for dev-explainer brand.
- **Rive / Lottie**: need authored .riv/.json assets — no authoring pipeline for generative topics.
- **anime.js / mo.js / Vivus / Flubber**: all now redundant — GSAP covers their niches free (MotionPath≈anime path, MorphSVG≈Flubber, DrawSVG≈Vivus).

## What this means for the demos (applied this round)

1. **Continuous motion everywhere** — nothing static: flowing dashed connectors, pulsing glows, drifting aurora + dust particles, shimmer sweeps, blinking carets.
2. **Per-topic animation machinery** (kills the "all 3 look same" problem):
   - DNS → **rotating 3D wireframe globe** with gold arcs and traveling request packets (Three.js)
   - Git → **animated commit graph**: lines draw on (DrawSVG), branch splits, commits slide onto main via MotionPath during rebase
   - WebSockets → **live wire** between client and server: request/reply packets (MotionPath), wire death flash, then continuous two-way duplex streams
3. **Typing effects**: URLs type on char-by-char, code lines reveal terminal-style with blinking carets (ScrambleText/clip reveals).
4. **Count-up numbers** (0.02s), draw-on rings, elastic pops — replaces static pop-ins.
