# yihui-dev video prompt/template repos — audit (2026-10-20)

Question from owner: does github.com/yihui-dev have video prompts/templates we can use, and would they produce similar videos?

## Verdict

**Yes, usable (MIT), and yes — same video family we already produce.** The flagship repo's prompts make a coding agent author animations as HTML/Canvas/SVG/Three.js code — the exact execution model of our HyperFrames engine (LLM-authored HTML + check-gate, ADR-C) and how-dev-works's tech engine. They are not text-to-video-model prompts (mostly), so no new model dependency is required to run them.

## Inventory (account: Yihui / 熠辉, "independent developer building AI products, creative tools, and reusable Agent Skills")

| Repo | ⭐ | License | What it is | Fit |
|---|---|---|---|---|
| **awesome-opus5-5-videos** | 6,969 | **MIT** | 703 curated prompts (418 with live remakes on Skillry). Categories: motion graphics (58), explainers (16), 3D scenes (14), games (12), + 285 latest (mostly explainers/3D). Each entry: creator credit + category + stack (Three.js/GLSL/Canvas/SVG) + the raw prompt + link to the creator's original post. Machine-readable index: `data/videos.json`. | **Primary prize** — directly executable by HyperFrames |
| awesome-gemini4-argon-videos | 21 | — | 304 Gemini 4 Argon (video-gen model) creations + prompts | Needs a video-gen model API — not our pipeline today |
| awesome-claude-motion-videos | 7 | — | 134 community motion videos from X | Reference gallery |
| awesome-fable5-5-videos | 66 | — | Same format, Fable 5.5 | Reference gallery |
| yh-chatcut-skills | 81 | MIT | `yh-chatcut-edit` (ChatCut-bound, not useful) + `yh-tools-video2srt` (timestamp-accurate SRT from video/audio; needs ElevenLabs key) | Low — our narrate() already emits word timestamps; in-pipeline SRT (#96) is cheaper and exact |
| linggan-talking-cards | 2 | MIT | Spoken script → 10-style presentation cards | Minor inspiration for doc card styles |

## What a prompt looks like (sampled)

Natural language, creator-attributed, e.g. a Games category entry is a 3-sentence brief for an X-wing Three.js game. The motion-graphics/explainer entries are visual-composition briefs (scene, motion, typography, color) — precisely the input shape HyperFrames takes. Prompt files are one `.md` per creator-video under `prompts/` (`<creator>-<id>.md`), so import can be per-file and selective.

## Can we use them?

- **License: MIT** on all relevant repos — free to use, adapt, commercialize. Prompts are data/ideas; each entry credits the original creator and links their post. Etiquette (and good practice): keep a source-credit field when a prompt shapes a published video.
- **No new infrastructure**: HyperFrames already runs LLM-authored HTML renders in CI (`hyperframes-create.yml`, hf-out job contract). A prompt from the pack is just a different brief.

## Will it create similar videos?

**Same family, not pixel-identical.** The originals were authored by an agentic coder writing HTML/Canvas/Three.js — the same operation HyperFrames performs. Differences to expect:

1. Each render is unique (LLM-authored code varies run to run) — style converges, frames don't.
2. Our engine adds what the originals lack: 9:16 reframing, brand fonts/accent, TTS narration + burned captions. So ours will look *branded*, the originals are ambient/musical pieces.
3. Category filter needed: motion-graphics + explainers fit faceless channels; 3D scenes are possible but heavier; games/interactive are out of scope.
4. Quality is community-varied — prompts need curation + adaptation (aspect, duration, text lanes) before production use. The 418 live remakes on Skillry are a good signal that the styles reproduce reliably.

## Strategic fit with the approved clips-first plan (#95–#101)

- **No conflict**: the 4 live channels' Shorts are clips-of-docs (approved, flipped lane). These prompts power the *generated-visual* lane, not the clip lane.
- Highest-value uses, in order:
  1. **New-channel motion-graphics Shorts** — the how-dev-works "Publish Short" pattern (branded vertical) but with HyperFrames + a curated prompt as the brief, instead of a fixed Remotion style. This is the "video template" the Studio wizard's style picker always implied.
  2. **Long-form section upgrades** — the beat schema (#26/#27: `diagram`, `stat`, `document` beats) can source compositions from curated prompts via HyperFrames, feeding better material into the clip lane (better docs → better clips).
  3. **Prompt-pack registry** — import selected prompts as data entries (thumb-catalog-v2 pattern: "a new template = a data entry, zero code") into the deferred template-registry issue; each entry: `{id, source, credit-url, category, nicheFit, promptFragment, aspect: '9:16', engine: 'hyperframes'}`.

## Recommendation

1. Pilot (small, no pipeline change): import ~10 explainer/motion prompts into a `templates/motion/` data dir, render 3-5 through HyperFrames at 9:16 with a test channel's branding, review against the design-critic blacklist. Cost: a few CI runs.
2. If the pilot passes: fold "motion prompt-pack" into the deferred template-registry issue as a data pack + a `kind: motion-short` manifest kind, and wire a picker into the Studio styles gallery.
3. Skip `yh-chatcut-skills` for #96/#97 — our narration pipeline already produces exact word timestamps; adding an ElevenLabs dependency buys nothing.

## Sources

- Account + repos: github.com/yihui-dev (fetched via gh api 2026-10-20)
- awesome-opus5-5-videos README + prompts/ + LICENSE (MIT)
- yh-chatcut-skills README (MIT; ElevenLabs requirement for video2srt)
- linggan-talking-cards (MIT)

## Pilot result (2026-10-20, same day)

Imported 10 prompts → `templates/motion/pack-yihui-opus55-2026-10-20.json`; rendered 3 through the repo's own pipeline (`hyperframes/generate.mjs`, 1080×1920, TTS + check-gate):

| Pilot | Source prompt | DNA | Result |
|---|---|---|---|
| 1 doodle money-history | @songkeys | vox-paper | rendered 29.8s, attempt 1 clean |
| 2 kinetic quote | @nolkeeg | luxury | rendered 25.9s, check-gate caught text overflow → attempt 2 clean |
| 3 routine recipe | @ror-fly | neon-tech | rendered, check-gate caught overlap → attempt 2 clean |

Renders: `hyperframes/work/motion-pilot-{1,2,3}*/gen/renders/` · stills: `hyperframes/work/motion-pilot-stills/` (9).

Design-critic verdict (fresh-context, 9 frames): V1 PASS-WITH-FIXES, V2 PASS-WITH-FIXES, V3 FAIL — overall "polished caption-template level, not yet competitive": the design brain honored palettes/typography but flattened the prompts' distinct visual systems (doodle craft, recipe icon-assembly) into one house layout — the exact "template sameness" the market research warns about. Engine mechanics fully proven: brief → LLM design → check-gate feedback → render in 75-130s.

**Conclusion:** prompts are compatible and executable today; prompt-fidelity of VISUAL SYSTEMS is the gap. Upgrade path: give the brief a layout-authoritative `visual` field so the yihui craft instructions steer layout, not just palette — this converges with #26/#27 beat templates and the deferred template registry.
