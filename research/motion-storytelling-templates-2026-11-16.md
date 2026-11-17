# Motion-graphics storytelling templates — research + proposal (2026-11-16)

Read-only research. No code, workflow or state file was changed. The owner asked for
suggestions first ("don't start directly working"). Nothing here is approved yet.

Inputs the owner shared:

| Ref | Video | Channel | Facts (yt-dlp, 2026-11-16) |
|---|---|---|---|
| R1 | "10 Free Tools That Turn Claude Into a Motion Graphics Studio" | Make First Million (Badar Munir) | 10:22, 28K views, 122K subs. A list of 10 GitHub repos |
| R2 | "How Modern Companies Release Software: Deployment Strategies Explained" | Visualcoders | 9:00, 6.9K views, 11.1K subs |
| R3 | "The ENTIRE History of AI: The 8 Researchers Who Built Modern AI" | Built From Nothing | 16:19, **172K views on a 1.57K-sub channel** |

---

## 0. TL;DR

1. **Why every template still looks the same: the beat model, not the fonts.** Every
   template, including the 8 families from 2026-11-09, renders "one slide per beat":
   pick 1 of 11 layouts (`hero/split/stat/quote/...`), fill headline + sub, spring it
   in. Each beat already has word-level timings (`V2Beat.words[]`,
   `explainer/remotion/longscenes2.tsx:233`). Only the captions and one pop chip use
   them (`longscenes2.tsx:549`, `:797`). Families restyle the slide. They don't change
   what moves or when it moves.
2. **The two reference channels are opposites, and neither is a slideshow.** Frames
   were extracted and cuts counted with ffmpeg scene detection:
   - **R2 Visualcoders: 0 hard cuts in 9 minutes.** It's one persistent diagram
     (customers → traffic router → server group → database). The narration makes it
     **mutate word by word**: packets flow, servers recolour v1→v2, a "DRAINING" state
     appears, a health panel shows metrics, a 95% / 5% traffic split counts up. A
     "2/6 ROLLING" chapter chip sits top-left.
   - **R3 Built From Nothing: 302 cuts in 16:19, one new image every ~3.2 s.** Every
     image is an **AI-generated illustration** in one locked graphic-novel style
     (muted ink-wash, one red accent). **It does not use free stock photos.** Motion
     on top is minimal: a slow push-in, red-underlined name cards ("ALAN TURING /
     Computing Machinery and Intelligence"), red phrase stamps ("THE SECOND AI
     WINTER") and map scenes (beige Europe, the country in red, a pin).
   - **Our engine sits in the worst spot between them:** few cuts, and the beats are
     text cards. Neither a living diagram nor a stream of fresh pictures.
3. **The policy risk points the same way.** YouTube's July-2025 "inauthentic content"
   rule names "AI-generated content made with generic or unoriginal templates giving the
   impression of mass production" and "channels that heavily rely on generic
   templates" (support.google.com/youtube/answer/1311392). Videos whose visuals are
   generated from each script are the protection; restyled slides are not.
4. **Recommendation: two new lanes, both rendered by Remotion, both built once and
   driven by data.**
   - **Lane A — "Living Diagram"** (the R2 look) for explainer channels. The LLM writes
     a small *scene graph* plus a *cue list anchored to word indexes*. A
     renderer written once animates it. $0 per video, CPU-cheap SVG. **Pilot on
     Money Rulebook** (per the MR-first directive): money flows between you, the bank and
     the taxman map perfectly onto it.
   - **Lane B — "Illustrated Documentary"** (the R3 look) for story channels
     (ai-observer, founders-margin, old-money-code, investors-compass). Two sub-options:
     **B1 AI illustrations** (~$0.90 per 16-min video at FLUX-schnell prices; needs
     owner OK on spend) and **B2 free archival** ($0, real public-domain/CC photos
     with smart Ken Burns, 2.5D parallax and paper cut-outs). B2 is the $0 base; B1
     adds pictures for scenes no archive has.
   - The **story layer** (cold open, numbered acts, a final comparison) matters as much
     as motion. Both refs use it. See §4.

---

## 1. What the reference videos actually do (frame evidence)

### R2 Visualcoders — "one canvas that keeps changing"
- Black background and a small, consistent icon set: person, router (diamond), server
  stack, database cylinder, metric panel. Thin connector lines with moving chevron
  "packets".
- **State changes, not scene changes.** In a 1-fps strip (02:20–02:28) the layout
  never moves. Only small things change: an arrow lights up, one server turns purple, a
  `+ coupon` field appears on the DB schema. Every change matches what the narrator is
  saying at that moment.
- Text appears only when it carries meaning: node labels, a big two-colour statement
  ("DOWNTIME IS **POSSIBLE**", "BACKWARD COMPATIBILITY **MATTERS**"), percentage
  counters. No burned-in subtitles.
- Chapter device: a numbered chip, e.g. "4/6 CANARY". The video ends on "all six
  compared".

### R3 Built From Nothing — "a new picture every 3 seconds"
- Every image shares one style. That consistency comes from a fixed style prompt, not
  from photography.
- Overlays (all cheap to build): a lower-third name card (bold condensed caps, red
  underline, small subtitle), a red-box phrase stamp, a map scene with the country in
  red and a pin label, a newspaper or paper close-up.
- It draws real people (Turing, Musk, Altman) as illustrations. See §5 for why we
  should *not* copy that part.
- Structure: a cold open ("The paper that changed everything"), 13 dated chapters, and
  a "Why it matters" close.

### R1 — the 10-repo video
Verified in §3. Only 2 of the 10 are useful for our headless CPU pipeline.

---

## 2. Lane A — "Living Diagram" (the R2 look)

### Idea
Replace "one slide per beat" with "one canvas per chapter that the narration
mutates". The LLM no longer writes headlines. It writes **what is on stage and what
happens on which word**.

```jsonc
// one chapter (shape is illustrative, not a final schema)
{
  "stage": {
    "nodes": [
      {"id": "you",  "kind": "person",   "label": "You"},
      {"id": "bank", "kind": "bank",     "label": "Bank"},
      {"id": "irs",  "kind": "building", "label": "Taxman"},
      {"id": "acct", "kind": "vault",    "label": "Roth IRA"}
    ],
    "edges": [{"id": "e1", "from": "you", "to": "acct"}, {"id": "e2", "from": "acct", "to": "irs"}]
  },
  "cues": [
    {"at": 4,  "do": "appear",  "node": "you"},
    {"at": 9,  "do": "flow",    "edge": "e1", "label": "$6,500"},
    {"at": 17, "do": "counter", "node": "acct", "from": 6500, "to": 74000},
    {"at": 23, "do": "block",   "edge": "e2"},                 // the taxman gets nothing
    {"at": 25, "do": "stamp",   "text": "TAX-FREE", "accent": true}
  ]
}
```

`at` is a **word index** into the TTS `words[]` we already have. The renderer converts
it to a frame (`words[at].t0`). That is the word-by-word sync the owner asked for.

### How it is built once and runs forever
- **Layout:** automatic graph layout (dagre or ELK → x/y). The LLM never places
  pixels, so it can't produce broken layouts.
- **Verb vocabulary, fixed and small (~15):** appear, flow (packets along an edge),
  pulse, recolor, swap (v1→v2), drain, fail (red X), block, label, counter, panel
  (metric box), group (box around nodes), stamp (big statement text), zoom (camera to a
  node; `@remotion/effects` `magnify()` exists since 4.0.542), chapter-chip.
- **Icon vocabulary:** Lucide / Tabler / Phosphor (ISC/MIT, no on-screen credit). Which
  icon `kind`s a channel uses lives in brand-kit data (no-static-maps rule).
- **Validator gate** (same pattern as the HyperFrames `check-gate retry`): every cue's
  `at` must be a real word index, every node/edge id must exist, cues must be in order,
  and the minimum spacing must hold. If it fails, re-ask the LLM; then fall back to the
  current beat renderer. No bad video ships.
- **Reuse:** `@remotion/paths` for drawing connectors, `kits.tsx` counters and stamps,
  and theme tokens for colours. Each channel gets a different palette and icon set from
  the same renderer.

### Why Remotion, not HyperFrames or Manim, for this
- HyperFrames (our lane has the LLM write HTML per video) gives high variance and needs a
  check-gate loop on every video. A fixed renderer plus LLM-written *data* is
  deterministic and testable.
- Manim + manim-voiceover is the only tool with built-in "animate on word X", but it is
  a second render stack (Python and LaTeX). Not worth it when we already own word
  timings in Remotion.

### Where it fits
money-rulebook (pilot), tax-shield, policy-brief, escrow-estate, investors-compass,
ai-observer (tech explainers), sleep-architect and longevity-code (body-system flows).

---

## 3. Lane B — "Illustrated Documentary" (the R3 look)

### B1 — AI illustrations (closest to R3)
- **Volume:** R3 has ~300 shots in 16 min. With some reuse (map scenes, held shots),
  plan for **~150–300 images per long video**.
- **Cost (prices verified in earlier research):** FLUX-schnell via fal.ai/Together
  ≈ $0.003/image → **~$0.45–0.90 per video**. gpt-image-1 medium ≈ $0.063 → $10–19 per
  video. Cloudflare Workers AI has a free tier, but its quota in images/day is
  UNVERIFIED.
- **Consistency:** each channel gets a "style bible" (style prompt, palette, negative
  prompt, seed policy) stored as brand-kit data. One shot list per video comes from the
  script, one prompt per clause (~8–10 words).
- This is the "paid AI restart" the owner described when the cartoon lane was removed
  (2026-11-11). The art problem then was library clip-art, not AI generation.

### B2 — Free archival + motion ($0)
Verified sources and order for an automatic picker:
1. **Wikidata P18 → Commons** for any named person. Tested: Alan Turing (Q7251) →
   `Alan Turing (1951) (crop).jpg`, public domain, no attribution needed. **New in
   2026:** Wikimedia rate limits are 10 req/min without an identifying User-Agent and
   200/min for a compliant bot UA, so the pipeline must send a descriptive UA.
2. **NARA** (free key, 10K queries/month) and **Library of Congress** (no key,
   20 req/min) for 1900s–1990s events.
3. Smithsonian Open Access (CC0) and Europeana (`reusability=open`) for objects.
4. Pexels/Pixabay (already integrated) for generic mood shots.

Turning stills into motion, all CPU, all commercial-OK:

| Technique | Tool | Licence | Notes |
|---|---|---|---|
| Smart Ken Burns (pan toward the face/subject) | smartcrop.js + YuNet face boxes | MIT / MIT | <20 ms per image. The default for every still |
| 2.5D parallax | **Depth Anything V2 *Small*** | Apache-2.0 | Base/Large are **CC-BY-NC**, so never use them. CPU time on our 2-vCPU private runner is UNVERIFIED (estimate 1–3 s/image); benchmark first. MiDaS small (MIT) is the fallback |
| Cut-outs (paper / cork-board / newspaper collage) | BiRefNet-lite or MODNet via rembg | MIT / Apache-2.0 | **Not BRIA RMBG** (rembg's default: non-commercial) |
| Grain, vignette, sepia, paper texture | Remotion CSS/SVG filters | own code | ~0 cost |

The R3 overlays (name card, phrase stamp, map + pin) can all be built on our
existing `kits.tsx` and the `mapAtlas` family.

### Recommendation for Lane B
Start with **B2 + the overlay kit** ($0, real photos of real people with correct
licences). Add **B1** for abstract scenes once the owner approves ~$1/video. Pilot
candidate: **ai-observer**, which covers literally the same topic as R3.

---

## 4. The story layer (often the bigger lever)

Both refs share a structure that our script brain doesn't enforce today:
- **A cold open on the most dramatic fact** before any intro ("The paper that changed
  everything"; "the dangerous part: getting it in front of real users").
- **Numbered acts** shown on screen (R2 "2/6"; R3 has 13 dated chapters). This gives
  the viewer progress and a reason to stay.
- **A payoff section:** R2 "All six compared", R3 "Why it matters".
- **A visual change every few seconds:** R3 cuts every ~3.2 s; R2 changes state about
  every 1–3 s with no cut.

Suggested contract change (later, spec first): the script brain outputs
`hook → stakes → numbered acts → twist → payoff`, and each act carries a *visual intent*
(diagram / portrait / map / stat) that routes to Lane A or Lane B renderers. A mixed
video (diagram acts plus documentary acts) then comes for free.

---

## 5. Risks and things we must not copy

- **AI pictures of real people.** R3 draws Musk and Altman. YouTube requires disclosure
  for realistic content that "makes a real person appear to say or do something they
  didn't do" (answer/14328491). Disclosure itself doesn't hurt monetisation, but repeated
  non-disclosure can lead to removal or YPP suspension. Rule: real people come only from
  licensed real photos (B2). AI scenes show unnamed figures, objects and places.
- **Press/agency photos of living people:** fair use is decided case by case and can't
  be automated safely across 16–30 channels. Don't.
- **Logos:** company name in our own type, or a small logo only where the story needs
  it. Never as branding.
- **Licences that look free but aren't:** lemo-opuscar style prompts (CC BY-NC),
  Depth Anything V2 Base/Large (CC BY-NC), BRIA RMBG (non-commercial), unDraw (no bulk
  or automated download), Lordicon free tier (credit required, no edits).
- **WebGL on CI:** three.js / postprocessing need `--gl=swangle` on GitHub Actions (no
  GPU), and private runners are 2 vCPU / 8 GB. Keep WebGL out of the default path.

---

## 6. The 10 repos from R1 (verified 2026-11-16)

| # | Repo | Licence | Verdict for us |
|---|---|---|---|
| 1 | lemomo-ai/lemo-opuscar (99 film styles) | code MIT, **styles CC BY-NC** | ideas only. Interactive, 30–60 min/film, NC licence |
| 2 | three.js / @remotion/three | MIT | rare 3D beats only. Slow on CPU (swangle) |
| 3 | patch-gg/pixelfx (244 pixel effects) | MIT | marginal. Pre-render a few overlays if a channel ever wants pixel style |
| 4 | ahujasid/blender-mcp (video says "mcp-for-blender") | MIT | no. Needs a running Blender desktop |
| 5 | awesome-opus5-5-videos / opus-video-prompts | MIT / none | inspiration only |
| 6 | ClaudeAnimationBase (p5.js cartoon) | MIT | no. Cartoon lane was removed |
| 7 | react-three-rapier (physics) | MIT | no. Non-deterministic across render workers unless pre-baked |
| 8 | react-postprocessing | MIT | no. `@remotion/effects` now covers glow, blur and noise natively |
| 9 | **librosa** (v1.0.1) | ISC | **yes.** Music beat grid → land cuts and stamps on beats |
| 10 | **video-shotcraft** (150 motion shots, Remotion) | Apache-2.0 | **yes, mine it.** Same engine; its shot catalog and headless-CI notes port into our kits |

Engine versions: we pin Remotion **4.0.524**; latest is **4.0.543** (new
`@remotion/effects`: magnify, pageTurn, wipe, lensBlur, fractalNoise; `parseVtt`).
We pin HyperFrames **0.8.152**; latest is **0.9.53** (~450 registry blocks, Apache-2.0).
`@remotion/effects` is under the Remotion licence (free ≤3 people).

---

## 7. Proposed phases (nothing starts without owner approval; each gets an EARS spec + QA file first)

| Phase | What | Pilot | Cost/video | Size |
|---|---|---|---|---|
| A1 | Living Diagram renderer + cue schema + validator + fallback | 1 MR episode, side-by-side vs current | $0 | M–L |
| A2 | Script brain emits the stage + cues (word-anchored) | MR | $0 | M |
| B1 | Archival picker (Wikidata/Commons/NARA/LoC, licence-checked, attribution auto-added to description) + smart Ken Burns + overlay kit (name card, stamp, map pin) | ai-observer | $0 | M |
| B2 | Parallax + cut-out kit (Depth Anything V2 Small, BiRefNet) after a CPU benchmark | ai-observer | $0 (CI minutes) | M |
| B3 | AI illustration lane with per-channel style bible | ai-observer | ~$0.5–1 | M |
| S1 | Story-structure contract (hook, numbered acts, payoff, visual intent per act) | MR | $0 | S–M |
| E0 | Engine upkeep: Remotion 4.0.524→4.0.543 (needed for `magnify`) | — | — | S |

## 8. Owner decisions needed
1. Which lane first? Recommended: **A (Living Diagram) on Money Rulebook**.
2. Approve ~$0.5–1 per long video for AI illustrations (B3), or stay $0 with archival
   only (B1–B2)?
3. HyperFrames lane: keep it experimental, or freeze it and put everything into Remotion?

## UNCERTAIN register
- Depth Anything V2 Small CPU time on a 2-vCPU runner (benchmark needed).
- Cloudflare Workers AI free-tier image quota.
- `@remotion/effects` behaviour and speed under swangle on Actions.
- Whether HyperFrames' `transcript.json` accepts our own TTS word timings.
- Smithsonian/Europeana rate limits (docs returned 403).

## Sources
- Frames + cut counts: yt-dlp + ffmpeg `select='gt(scene,0.35)'` on 360p copies,
  2026-11-16 (copies deleted after analysis).
- YouTube policy: https://support.google.com/youtube/answer/1311392 ·
  https://support.google.com/youtube/answer/14328491 ·
  https://support.google.com/youtube/answer/9783148
- Wikimedia: https://www.wikidata.org/wiki/Property:P18 ·
  https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits ·
  https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy
- Archives: https://www.archives.gov/research/catalog/help/api ·
  https://www.loc.gov/apis/json-and-yaml/working-within-limits/ ·
  https://edan.si.edu/openaccess/docs/ · https://metmuseum.github.io/
- Motion: https://github.com/jwagner/smartcrop.js ·
  https://huggingface.co/depth-anything/Depth-Anything-V2-Small-hf ·
  https://github.com/isl-org/MiDaS · https://huggingface.co/briaai/RMBG-1.4
- Engines: https://registry.npmjs.org/remotion/latest ·
  https://github.com/remotion-dev/remotion/releases · https://www.remotion.dev/docs/gl-options ·
  https://www.remotion.dev/docs/effects/magnify · https://github.com/heygen-com/hyperframes/releases ·
  https://github.com/ManimCommunity/manim-voiceover
- R1 repos: https://github.com/lemomo-ai/lemo-opuscar · https://github.com/Vincentwei1021/video-shotcraft ·
  https://github.com/librosa/librosa · https://github.com/ahujasid/blender-mcp ·
  https://github.com/patch-gg/pixelfx · https://github.com/pmndrs/react-postprocessing
- Icons: https://lucide.dev/license · https://github.com/tabler/tabler-icons ·
  https://github.com/phosphor-icons/core · https://undraw.co/license · https://lordicon.com/licenses
- Prior repo research reused: research/full-template-families-2026-11-09.md,
  research/platform-stock-assets-thumbnails-2026-10-24.md, memory (AI image prices).
