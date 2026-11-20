# Session compact — motion templates, human voice, course template

*Living handoff file. Updated before every context compaction (owner rule, 2026-11-20).
Read this first after a compaction; it replaces re-reading the whole conversation.*

**Last updated:** 2026-11-20 · **main at:** `5718182`

---

## 1. What this session built (newest first)

| Commit | What | Where |
|---|---|---|
| `5718182` | **"Lecture Notes" paper template** refined to the reference lesson grammar and added to the template section (registry + Neon + gallery preview) | `explainer/remotion/diagram/Widgets.tsx`, `LivingDiagram.tsx`, `lib/paper-plan.mjs`, `lib/course-plan.mjs`, `scripts/store-template-preview.mjs`, `docs/qa/course-template-c1b-refine-qa.md` |
| `f85c954` | Course planner C2: outline → render-ready plan (one brain call per lecture) | `lib/course-plan.mjs`, `longvideo/generate-course-plan.mjs` |
| `d2a8115` | Course template C1: paper look + 6 teaching widgets | `explainer/remotion/diagram/Widgets.tsx` |
| `fad7283` | Registry repair: Drafts-Inbox approvals wrote BARE objects → registry was a SyntaxError; approvals now keyed + 409-race retry | `studio/lib/template-approvals.mjs`, `tests/template-approvals-race.test.mjs` |
| `8057c48` | Audio guide | `docs/audio/how-audio-works.md` |
| `6efe37b` | Step 1: Money Rulebook human voice + Living Diagram doc lane + money-flow/systems templates + CI dry-run workflow | `explainer/voice_lines.py`, `youtube-flow/narrate.py`, `lib/diagram-*.mjs`, `.github/workflows/diagram-dryrun.yml` |

Research: `research/motion-storytelling-templates-2026-11-16.md`,
`research/cloudxberry-course-format-audit-2026-11-17.md` (Cloud X Berry, LJ_HY0AKZnM).

## 2. Current state

- **Templates live in Studio (41):** all 20 inbox drafts approved; `money-flow-diagram` (tile), `systems-diagram`
  (glow), `lecture-notes-paper` (paper, gallery preview stored). Each takes name/colours/voice from the channel kit.
- **Lecture Notes look:** white page; headline changes every 9-23 s (one idea per beat, one *accent* word, underline
  bar); lecture badge on a lecture's first beat; widgets naked + centred (boxes with tag pills + orange pointer,
  counter card + ✓/✕ check card, code window with lit line, growth curve, takeaway cards, roadmap); uniform 1.36× scale.
  Demo: `longvideo/out/diagram-demo/course-hashmap-lecture.mp4` (2:00, 9 beats). Side-by-side vs reference:
  `longvideo/out/diagram-demo/course-vs-reference.png`.
- **Doc lane:** template `story_structure.doc_render: "diagram"` → Living Diagram; `doc_presentation.style`
  `tile|glow` → node planner, `paper` → `lib/paper-plan.mjs` (approved chapter sentences → lesson beats, words
  verbatim). Any failure → storybook fallback + ntfy. Upload tail unchanged.
- **Voice:** Money Rulebook has `voiceProfile` (Kokoro `bm_daniel`, 0.95, calm) in `lib/brands.json`; others use the
  old paths. Toggle: `node scripts/enable-human-voice.mjs <slug> [--off]`.
- **Channels:** there is NO ai-observer channel (planning leftover). The owner will **create a new tech channel**
  for the Lecture Notes / course format. Only real channels count (owner directive).
- **Tests:** `npm test` 1776/1777 (T4b reportChannels = pre-existing, never chase); pytest 116.

## 3. Open decisions / next steps (owner)

1. Create the new tech channel → assign `lecture-notes-paper` (or `systems-diagram`) → first doc day.
2. Course phases still to build: **C3** split render (long courses: one GitHub job per module + stitch;
   3.5 h ≈ 9 h single-job render > 6 h limit), **C4** course thumbnail + module/lecture timestamps, **C5** pilot.
3. Optional: Chatterbox-Turbo emotional voice via Kaggle free GPU (needs owner Kaggle account + token).

## 4. How to resume / verify

```
node --test tests/course-plan-gen.test.mjs tests/paper-plan.test.mjs tests/diagram-cues.test.mjs tests/diagram-plan.test.mjs
node longvideo/make-diagram-demo.mjs longvideo/diagram-demo/course-hashmap-lecture.plan.json      # local render
node longvideo/generate-course-plan.mjs <outline.json> <out.plan.json>                          # AI course plan
node scripts/store-template-preview.mjs <template_id> <sample.mp4> [poster.jpg] --clip 40        # gallery preview
node sync-template-registry.mjs                                                                  # registry -> Neon
cd studio && vercel --prod                                                                       # deploy panel
```
Cloud dry run (no upload): Actions → "🧪 Diagram dry run".

## 5. Gotchas learned (do not relearn)

- **Parallel sessions share this tree:** stage named files only; if `pull --rebase` is blocked by their edits, check
  overlap with incoming commits, then `git pull --rebase --autostash` (restores their edits). Never `git add -A`.
- **Registry entries must be KEYED** (`'id': {...}`); approved drafts must leave `studio/lib/template-bot-drafts/` (#124).
- **Anchors must match the TTS tokenisation**: Edge splits "takeaway" vs "take away"; the validator catches it.
- **Kokoro fp32 can fail to load under RAM pressure** → voice lane falls back to int8; int8 + af_heart can align weakly
  → use Edge Ava for demos then. Weak alignment fails loudly (never ships silence).
- **Remotion `--port` collisions** after a killed render → use a fresh port per render.
- **Disk:** C: hit 100 % twice; Docker data disk (16.3 GB) deleted 2026-11-20 (n8n workflows gone, owner accepted).
  Keep `~/.venvs/chatterbox` (owner: keep). Clear npm/pip caches + `studio/.next` first when low.
- **The DocV2 preview renderer cannot render diagram/paper templates** → use `scripts/store-template-preview.mjs`.
- **Free LLMs** (Groq gpt-oss / Gemini) slip on details → few-shot example in prompts + safe repair + bounded re-asks;
  429/503 bursts → scene gap + backoff.
