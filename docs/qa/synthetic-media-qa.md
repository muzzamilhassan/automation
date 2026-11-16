# Spec + QA — B1: YouTube AI disclosure on every upload (2026-11-16)

Owner chose option B (YouTube policy fixes). Audit cg-03: the review desk's
four official synthetic-media answers were dropped, and no upload set
`status.containsSyntheticMedia` (confirmed settable on videos.insert/update:
https://developers.google.com/youtube/v3/docs/videos).

Policy (https://support.google.com/youtube/answer/14328491): disclose REALISTIC
synthetic content only — real person made to say/do something, altered
footage of a real event/place, a realistic scene that didn't occur, AI music
as the focus. AI help with scripts/thumbnails/titles/captions does not need it.
"Disclosing AI content alone won't limit a video's audience or affect its
eligibility to earn money." Persistent non-disclosure risks a forced label,
removal or YPP suspension.

## Requirements (EARS)

- R1: WHEN the owner approves a script with disclosure answers, THE SCRIPT
  STORE SHALL keep them in `scripts.meta.disclosure_answers`.
- R2: EVERY upload (doc, Shorts ×2, clips) SHALL set
  `status.containsSyntheticMedia`.
- R3: THE VALUE SHALL be true WHEN any stored answer is yes; otherwise the
  channel's `kit.syntheticMedia`; default false.
- R4: `kit.syntheticMedia` SHALL be declared-only in the registry → kit merge.

## QA rows

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | R3 | any yes → true; all no → false; no answers → kit flag, default false; channel true wins | automated | `node --test tests/synthetic-media.test.mjs` |
| 2 | R1 | approve() issues the meta merge with the answers | automated | same |
| 3 | R2 | every `status: { privacyStatus: 'private' …}` block in the 3 lane files carries the flag; doc uses reviewScript answers, Shorts resume uses found.script answers | automated | same (source pin) |
| 4 | R4 | registryToKit/mergeBrand carry a declared syntheticMedia | automated | same |
| 5 | R2 | next upload: YouTube Studio → video → "Altered content" shows the declared value | manual | YouTube Studio |

Follow-up (panel plan): a per-channel "Contains realistic AI content" toggle
writing `kit.syntheticMedia`.
