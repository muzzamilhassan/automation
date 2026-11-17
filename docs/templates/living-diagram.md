# Living Diagram templates — use them on any channel

The Living Diagram is a doc-video look where the narration moves one diagram per chapter, word
by word: boxes, money/data flows, live counters, badges and statement screens. It is a normal
registry template, so a channel switches to it with **no code change**.

| Template | Look | Fits these niches |
|---|---|---|
| `money-flow-diagram` | **tile**: rounded tiles on dark, brand accent | personal finance, investing, old money, real estate, insurance, small-business tax, entrepreneurship. Finance review + "Education, not financial advice." disclaimer |
| `systems-diagram` | **glow**: Visualcoders-style neon icons on black | AI & tech, science, productivity, psychology, leadership, sales, travel |

Both read the channel's **own** name, colours and voice from its kit. Nothing in the template is
channel-specific.

## Put a channel on it (owner, in Studio)
1. **Templates → Drafts Inbox → Approve** the template (once; later channels reuse it).
2. Open the **channel page → assign** `money-flow-diagram` or `systems-diagram`. The channel's
   niche must be one of the template's niches.
3. The channel's next doc day renders in the diagram look. You still approve the script at
   **Review** as today. The diagram only changes the visuals, never your approved words.

If anything in the diagram step fails, that episode **falls back to the storybook look**, you get
an ntfy alert, and the upload still happens.

## Give a channel the human voice (one command)
```
node scripts/enable-human-voice.mjs <slug>                     # the channel's own Kokoro voice
node scripts/enable-human-voice.mjs <slug> --speed 0.95 --mood calm
node scripts/enable-human-voice.mjs <slug> --off               # back to the old voice paths
```
This writes `lib/brands.json[slug].voiceProfile`; commit and push it. From the next run, the channel's
Shorts and docs use the human voice: sentence pacing, real pauses, exact word timings, Kokoro
on the runner (no network TTS). Without a profile, diagram episodes use an Edge Multilingual voice.

## Check a template before going live (no upload)
- Local: `node longvideo/diagram-episode-dryrun.mjs <slug> <script.json> studio/lib/template-bot-drafts/<template>.json`
  (add `--plan-only` for a 2-minute planning check).
- Cloud: **Actions → "Diagram dry run" → Run workflow** (slug + template). It renders on GitHub
  and attaches the MP4 as a downloadable artifact. Nothing goes to YouTube.

## Where the code lives
`lib/diagram-plan.mjs` (planner) · `lib/diagram-episode.mjs` (lane) · `lib/diagram-cues.mjs`
(cue rules) · `explainer/remotion/diagram/` (renderer) · `explainer/voice_lines.py` (voice) ·
spec + QA: `docs/qa/step1-mr-voice-moneyflow-qa.md`.
