# COMBINED: Vox-Style & Animated Diagrams — Best Solutions (2026-09-15)

**Merged from two independent research passes:** ZCode research (vox-style-and-diagram-research-2026-09.md) + Antigravity research (animated-diagrams-vox-style-and-variants-2026-09.md). Same goal: $0 animated diagrams + Vox-style videos, fully automatable on the current stack (Remotion + LLM scripts + Edge-TTS + Pexels/Pixabay + FFmpeg). Nothing implemented yet — this is the merged master plan.

---

## 1. THE MERGED TOOL STACK (best picks from both research passes)

### Code-driven engines
| Tool | License | Use | Notes |
|---|---|---|---|
| **Remotion 4.0.524** (installed) | Free solo/≤3 | The core engine — everything plugs in here | Frame-perfect, Edge-TTS synced, CI-ready |
| **Revideo** | MIT | Drop-in if ever needing 100% open license | Fork of Motion Canvas, headless-first |
| **Manim CE** (Python) | MIT | Math/formula variant only | 3Blue1Brown engine; separate pipeline |
| **Motion Canvas** | MIT | Hand-crafted educational anims | Alternative authoring tool |

### Diagram-as-code (Antigravity's key finds — huge for automation)
| Tool | License | Why it matters |
|---|---|---|
| **D2 (d2lang)** | MPL 2.0 | **Text → animated diagram with ZERO coordinates.** Native `--animate-interval` step-through, auto arrow routing. LLM writes D2 text → animated architecture diagram. Best automation-per-effort of anything found |
| **Mermaid.js** | MIT | Markdown-like syntax, animated edges (`animate: true`) + stroke-dasharray path animations; headless via Playwright |
| **Rough.js** | MIT | Turns ANY clean shape into hand-drawn sketchy style — the whiteboard/Vox-doodle look programmatically |
| **Vizzu** | Apache 2.0 | **Morphing data charts** (bar → treemap → line) — made for finance channels: interest curves, chart races, GDP stories |
| **D3.js** | ISC | Force-directed network graphs, bar-chart races, fully custom |

### Maps (Johnny Harris style)
| Tool | License | Notes |
|---|---|---|
| **MapLibre GL JS** | BSD-3 | Camera fly-throughs, pitch/zoom, route lines |
| **OpenFreeMap** tiles | $0 free vector tiles | No Mapbox key needed |
| **maplibre-gl-video-export** | Open source | Exports the animation to MP4 → feeds Remotion |
| **Playwright** (already in repo) | — | Headless capture alternative |

### Free assets (both lists merged)
unDraw (recolorable SVGs) · Open Peeps / Humaaans / Open Doodles (CC0 characters/doodles) · Storyset (attribution) · LottieFiles + **@remotion/lottie** (official) · SVG Repo CC0 · Lucide Icons · **Library of Congress + Wikimedia + rawpixel PD** (archival photos/documents) · **Internet Archive** (PD footage) · **Pixabay SFX** (earcons) · **Pollinations.ai** (free AI illustrations, NO API KEY, prompt "flat vector illustration minimal")

---

## 2. THE VOX LOOK — merged deconstruction (7 pillars) + ready recipes

1. **Paper-cutout collage** — white-edge clipped photos, `drop-shadow(4px 4px 0 rgba(0,0,0,.15))`, tilted 2–5°
2. **Stepped motion ("on 2s")** — `useSteppedFrame()` hook: `Math.floor(frame / 2) * 2` (12–15fps feel)
3. **Paper grain** — procedural `<feTurbulence>` SVG noise overlay at 0.18 opacity, multiply blend (zero asset downloads — Antigravity recipe)
4. **Off-white/off-black palette** — `#FAF5EE` / `#1C1E21`, never pure white/black
5. **Document archival treatment** — PD documents slide in + **yellow highlighter bar** (`rgba(255,230,0,.55)`, animate across lines with word timestamps) + **red grease-pencil circle** (`#E63946` sketchy ellipse, strokeDashoffset draw-on) + Ken Burns zoom (all three recipes already written by Antigravity — ready to paste)
6. **Kinetic editorial typography** — Space Grotesk / Playfair / slab fonts stamping in
7. **Earcons & foley** — paper slide, marker squeak, shutter click, thud — synced per beat (Pixabay SFX)

---

## 3. THE 8 STYLE VARIANTS (merged matrix)

| # | Style | Palette | Core visuals | Engine | Difficulty | Best for |
|---|---|---|---|---|---|---|
| 1 | **Vox Investigative** | Cream #FAF5EE, Red #E63946, Yellow #FFD000 | Paper cutouts, highlights, red circles, stamps | Remotion + Sharp | Low-Med | History, scandals, policy stories |
| 2 | **Johnny Harris Map** | Sepia, terracotta, navy | Tilted maps, routes, borders | MapLibre + OpenFreeMap + Playwright | Medium | Geopolitics, trade, travel economics |
| 3 | **Modern Dev/Systems** | Slate #0F172A, cyan, orange | Server cards, packets, crash/fix | Remotion (BUILT — long-paulson demo) | Low (done) | Tech explainers |
| 4 | **3Blue1Brown Math** | Black, cyan #58C4DD | Plots, equations, transforms | Manim CE | Medium | Math niche only |
| 5 | **Sketchy Whiteboard** | White/blackboard, pastel | Sketchy flowcharts, doodles | Rough.js / Excalidraw JSON | Low-Med | Concept explainers |
| 6 | **Financial/Economic** | Bank navy #0A2540, money green, debt red | Chart races, flow pipelines, scales | **Vizzu** + Remotion | Low-Med | **Silent Wealth / Money Rulebook / IC** ★ |
| 7 | **Lemmino Dark Noir** | Vantablack, cold white, gold | Floating 2.5D photos, cinematic pans | Remotion + React-Three-Fiber | High | True-story mysteries |
| 8 | **Kinetic Motion Poster** | Black/white + neon | Giant stamped type, rapid cuts | Remotion + CSS | Very Low | Dan Koe/Fireship-style shorts |

---

## 4. THE COMBINED BEST SOLUTION (final architecture)

**One engine, three layers, rotating style packs:**

```
LAYER 1 — Script + storyboard (BUILT)
   Gemini/Groq dedicated keys → outline → chapters → beats JSON
LAYER 2 — Visual scenes (Remotion, rotating style packs)
   Pack A "Documentary" (BUILT — long-paulson demo: footage + icons + numbers)
   Pack B "Vox Investigative" (paper collage + highlighter + doodles + earcons)
   Pack C "Financial Charts" (Vizzu morphs + chart races)  ← money channels ★
   Pack D "Maps" (MapLibre/OpenFreeMap exports)             ← geopolitics/trade stories
   Pack E "Kinetic Poster" (pure CSS — fastest builds)       ← shorts/reels
LAYER 3 — Voice + publish (BUILT)
   Edge-TTS -7% + word timings → upload pipeline (IC re-auth pending)
```

**Build order (recommended):**
1. **Vox scene pack** — stepped motion hook, PaperTextureOverlay (feTurbulence), VoxHighlighter + DoodleCircle (recipes exist), earcon track from Pixabay SFX. Days. → re-render Paulson demo in Vox style for side-by-side.
2. **Financial chart pack** — Vizzu morphs + D3 bar races as Remotion components. Directly serves the 3 money brands.
3. **D2/Mermaid auto-diagrams** — LLM writes D2 text → `d2 --animate-interval` renders animated architecture/flow diagrams → mux. Zero-coordinate diagram automation.
4. **Map pack** — MapLibre + OpenFreeMap + Playwright capture (playwright-core already in repo).
5. **Pollinations AI illustrations** — per-scene keyword → flat illustration → Remotion (optional spice).

## 5. Cost: $0 everywhere. Every tool above is free/open-source for solo use.

## 6. Risks/notes
- Remotion license: free solo/≤3 people (re-verify if the team grows) — Revideo is the MIT escape hatch
- Pollinations free tier may rate-limit heavy use → cache generated images per keyword
- MapLibre headless capture needs Playwright + a local tile/server setup (playwright-core already in repo)
- Vizzu is browser-based → render via Playwright frame capture like maps

## 7. Full references
See the two source docs: animated-diagrams-vox-style-and-variants-2026-09.md (Antigravity — D2, Vizzu, Mermaid, Rough.js, OpenFreeMap, style matrix, code recipes) + vox-style-and-diagram-research-2026-09.md (ZCode — asset libraries, Pollinations, style references, phase roadmap).
