# PsychToons-Style Video Pipeline — Deep Research & Build Notes (2026-09-20)

Reference video: **"Psychology of Intelligence: Learn Anything So Fast It's Almost Unfair"**
https://www.youtube.com/watch?v=f1gkkzHZxNg — channel **PsychToons** (121K subs)

| Fact | Value |
|---|---|
| Length | 15:03 (903 s) |
| Views | 2,084,058 |
| Likes | 32,812 (≈1.6% like ratio — very strong) |
| Uploaded | 2026-08-30 (≈3 weeks to 2M views) |
| Category | Education (psychology of learning) |
| Narration | 2,812 words ≈ 187 wpm, calm male US voice |
| Structure | Hook → relatable pain → myth-bust → 5 "laws" with researcher stories (Bjork, Karpicke/Roediger 2008 Science study, Rohrer, Chase & Simon 1973) → payoff + comment CTA |

## 1. Why this video works (what we must copy)

1. **One idea on screen at a time.** Every scene = one metaphor drawn in the same
   hand-drawn world. Scenes change every 5–10 s, locked to the narration beat.
2. **The character IS the viewer.** A simple round-headed figure sits at desks,
   fails, celebrates. Zero facial detail = universal self-insert.
3. **Metaphor props carry the science**: calendar with X's ("9 DAYS"), pile of
   clocks crossed out, brick wall, winding road loop, signboards.
4. **Big handwritten caps labels** stamp the concept into memory
   ("DESIRABLE DIFFICULTIES", "THURSDAY", "72%", "A GIFT").
5. **Earthy muted palette that rotates per scene**: mustard/rust/sage/teal/cream
   bands — never saturated, never corporate. Paper grain + vignette on top.
6. **Evergreen educational topic + listicle spine** = long shelf life + strong
   CTR ("5 laws" structure).

## 2. Style DNA measured from 30 sampled frames

- Background = 2–3 flat horizontal color bands (wall 78% / floor 22%), thin
  darker seam line at the join.
- Characters: big white oval head (~40% of body height), thin ink-line limbs,
  flat colored shirt (rust/teal/mustard/blue/green/red), optional dot-eyes +
  smile. Mostly blank heads.
- Ink color: warm charcoal ≈ #2f2b26. Paper: ≈ #f2e8d5.
- Props: wooden tables/chairs (flat brown + darker legs), stacked books,
  signboards, calendar grids, lollipop trees, block pyramids, chess tables.
- Subtle idle animation: characters bob/blink, camera slowly pushes in.
- Scene transitions: hard cuts with quick zoom drift — not crossfades.

## 3. Visual production approach — tested, not guessed

We tested AI image generation first (Pollinations FLUX, multiple prompt
recipes, fixed seeds): results were **soft/painterly**, drifted in character
design scene-to-scene, and cannot animate characters. For a 90-scene video,
style drift is fatal — this genre lives on consistency.

**Chosen approach: 100% programmatic vector scenes (SVG in Remotion).**
The style is literally flat bands + ink lines + flat fills — ideal for code.
Wins: perfect consistency at any length, real character animation (walk cycle,
poses, breathing bob), $0 per-image cost, instant scene edits, crisp 4K-ready
lines. The grain/paper feel comes from an feTurbulence SVG filter + vignette.

## 4. Pipeline architecture (built today)

```
explainer/public/psych-storyboard.json   ← script + scene specs (JSON)
        │
        ▼
explainer/make-psych-demo.mjs            ← orchestrator
   1. Edge TTS per scene (en-US-AndrewNeural, rate -2%) via edge_batch.py
      (per-beat resume, 3 retries, never dies)
   2. ffprobe real mp3 durations → scene lengths = speech + 480 ms pad
   3. timeline JSON → public/psych-demo.json (scenes, starts, music)
        │
        ▼
explainer/remotion/psych-toon.tsx        ← style engine ("PsychToon" comp)
   SetBg (banded palettes) · Char rig (11 poses, walk cycle, bob, blink)
   · 25-prop library (desk, chair, books, sign, calendar, clock pile, brain,
     loop arrows, phone, blocks, flag, tree, road, rug, plant, window…)
   · handwritten caps labels (Patrick Hand) · text cards (underline draws on)
   · Ken Burns push per scene · spring pop-ins · grain + vignette
        │
        ▼
npx remotion render remotion/index.ts PsychToon out/psych-demo.mp4
   --props=public/psych-demo.json          (+ looping music track, −2.5 s fade)
```

Commands:
```bash
cd explainer
node make-psych-demo.mjs --render   # full demo rebuild + render
```

## 5. Library choices (all $0, commercial-safe)

| Need | Pick | Why |
|---|---|---|
| Renderer | Remotion 4 (already licensed/used) | props-driven, free for solo |
| Narration | Edge TTS `en-US-AndrewNeural` | calm male US ≈ ref voice; free |
| Fonts | Patrick Hand (labels/cards), Caveat (accent) | OFL, match ref handwriting |
| Music | incompetech via music-engine cache (`inc-concentration`) | CC-BY, credit auto-flow exists |
| Grain/texture | SVG feTurbulence + radial vignette | no assets, resolution-proof |
| Script brain (scale-up) | existing Gemini→Groq chain | writes genre narration JSON |

## 6. Demo delivered

`explainer/out/psych-demo.mp4` — 1920×1080, ~76 s, 8 scenes, topic
"The Psychology of Procrastination" (same genre, different topic, to prove
the pipeline generalizes). Hook → pain → research reframe → mechanism → loop →
fix → CTA, mirroring the reference's narrative beats.

## 7. Known gaps vs the real PsychToons (and plan)

1. **Full limb animation** — ref animates arms per-sentence (pointing, page
   turns). We have 11 poses + bob/walk; adding per-sentence "gesture cues"
   (spec: `actions: [{t:2.5, pose:"point"}]`) is a small extension.
2. **Scene-internal cuts** — ref changes camera mid-scene. We can split long
   scenes into 2 shots sharing one palette.
3. **Lip-sync feel** — ref head bobs with speech; we can modulate bob speed by
   the TTS word-boundary data edge_batch already saves.
4. **15-min scale** — a full episode ≈ 90–100 scenes; storyboard JSON is
   hand-writable but the script brain should emit it directly (next step).
   Render time is the long pole → run on GitHub Actions (quarry-render
   pattern) once style is approved.

## 8. Gotchas discovered (for future sessions)

- `--props` passes the doc RAW and Remotion shallow-merges it over
  `defaultProps` — a stale `psych`/wrapper key survives. Both
  `calculateMetadata` AND the component must check the raw shape first.
- Scene content must live inside an `<svg>` — `<g>` outside `<svg>` silently
  renders nothing (cost us one debugging round: blank paper frames).
- edge_batch.py "cached" resume: stale beat mp3s from other pipelines using
  the same `audio/beat-XX.mp3` names WILL be reused — delete before re-use
  (`rm public/audio/beat-*.mp3`).
- Remotion `remotion still` + calculateMetadata returned defaultProps duration;
  `remotion render --frames=N-M` works — use slices for frame QC.
- Local QC loop: render `--frames=start-end` 3-frame slice → ffmpeg extract
  → Read the PNG. ~40 s per check.
