# Hassan video-editing skills — findings + integration plan (2026-11-05)

Source: youtube.com/watch?v=dntQ8OKeFuk · repos cloned read-only to
`C:\tmp\hassan-repos\{skills,app}` (no LICENSE files — the reuse grant is
verbal in-video; we adopt ARCHITECTURE + schema patterns, never vendor code).

## What the system is

A Claude-Code-style skill pair (`awh-intro-editor`, `awh-long-form-editor`)
that edits presenter videos: transcript → word timestamps → an
**editorial-directive.json PLAN** → owner approval → Remotion render → frame
verification. The app repo is a job orchestrator (React UI + server prompts);
the motion graphics are agent-authored React guided by theme tokens.

## The core artifact — editorial-directive.json (the piece we lack)

- `theme`: one of 7 token-defined themes (`warm-paper` — cream `#F5F3EE`,
  ink, cobalt, yellow marker, Shantell Sans titles — is literally our
  storybook look; plus personal / black-circle / warner / dark-sketch /
  blackboard-style / colorful-purple)
- `beats[]`: `{start, end, spoken_text, role, treatment, purpose,
  on_screen_copy[], layout{}, reveal_sync[{element, time}], rationale}`
  — roles: hook/context/problem/promise/reveal/definition/process/proof/
  reassurance/CTA
- **6 treatments per beat**: CLEAN_PRESENTER, OVERLAY_CARD, FULLSCREEN_MOTION,
  PRESENTER_INSET, SELECTIVE_TEXT, TRANSITION — with a rubric for choosing
  each, reveal timing on the spoken payoff word, and treatment-share
  accounting (percentages describe the plan, not quotas)
- `approval{status, approved_scope, ambiguities}` — the review gate lives
  INSIDE the plan artifact
- `protected_regions` (face-safe), `reveal_sync` (word-timed element reveals),
  brand icons fetched from the brand's own source fired on the spoken word
- `validate_directive.py` — shape/theme/treatment validator before render
- Feedback loop: lessons append to feedback-log.md; repeated preferences
  promote into brand-system.md (self-improving rules)

## Mapping to our stack

| Theirs | Ours | Gap |
|---|---|---|
| editorial-directive.json | approved script render-input (review queue) | **no beat/treatment/reveal layer** |
| word timestamps | Edge-TTS word timings (shipped) | ✓ have it |
| 7 theme token sets | template DATA tokens (doc_render/thumb_design) | ✓ same pattern — themes become storybook template variants |
| approval in plan | Studio > Review | ✓ have it |
| validate_directive.py | docStoryPlan/registry validators | add a directive validator |
| agent-authored React per video | fixed DocV2 engine + DATA | **ours is better for scale** — keep ours, feed it the directive |

## Integration plan (the win)

**Directive-planner step for the storybook lane** — one LLM step between
approve and render: reads the word-timed SRT + script → emits our
`story-directive.json` (beats with roles + treatments mapped to DocV2 slide
kinds + reveal_sync elements) → validator → DocV2 renders from the directive
instead of plain chapters. Effects:

1. Mid-chapter graphics land on the spoken word (logos/photos/stat cards)
2. Rhythm control (clean-slide moments are deliberate, not absent)
3. 7 themes → 7 storybook template variants (pure DATA — the template factory
   Phase B gets its first real batch)
4. Selective-text payoff moments (his SELECTIVE_TEXT) — the yellow-marker hook

Phasing: (a) schema + validator port (ours, new code, patterns cited);
(b) planner prompt on the brain/ai-adapter seam; (c) DocV2 slide-kinds for
treatments; (d) theme variants as registry DATA. Model: Kimi route via
ai-adapter optional (long-context planning).
