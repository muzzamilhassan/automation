# Spec + QA — Emotional voice via the free Kaggle GPU + the voice library (2026-11-22)

Source: owner approval 2026-11-22 after the Chatterbox-Turbo demo (`muzzamilhassan/quarry-voice-demo`,
100% of script words heard). Owner follow-up the same day: the laughs and other sounds did **not**
sound natural → expression **None is the default** (natural delivery, no sound tags); Light / Rich are
opt-in. The GPU engine's model is **data** so a better open model can plug in later without code per channel.

## The setting

`kit.voiceProfile` gains three keys (Neon `channels.kit` + the engine file `yt-mcp/studio-channels.json`):

| Field | Values | Notes |
|---|---|---|
| `emotional` | `true` / `false` | the "Emotional voice (laughs, sighs) — free GPU" switch. Needs `human: true` (turning it on turns Human pacing on) |
| `expression` | `none` (default), `light`, `rich` | how many sound tags the doc writer may add |
| `model` | `chatterbox-turbo` (the only one built) | `studio/lib/emotional-voice.mjs` `GPU_VOICE_MODELS` + `explainer/kaggle_voice.py` `MODELS` |

The three keys are kept **only when the value carries them** — a profile without them reads byte-identically
to before (`{ human, mood, speed }`). The Voice drawer's library pick saves `kit.voice` **and** the top-level
`voice` (the engine reads the top-level voice first), so readiness item 5 and the narration agree.

Expression → allowed tags (Chatterbox-Turbo's tokenizer knows 19 tags; only narration-safe ones are used):

| Level | Tags a script may carry | Density |
|---|---|---|
| None | none | — |
| Light | `[sigh]` `[clear throat]` | at most 1 per 6 sentences |
| Rich | + `[chuckle]` `[laugh]` `[gasp]` | at most 1 per 4 sentences |

## Engine precedence (`resolveVoiceProfile` + `narrate.py voice_profile()`, one case table `tests/fixtures/voice-profile-cases.json`)

- `human: false` → the normal voice chain (always wins, even with `emotional: true`).
- `human: true`, `emotional: true`, a Kokoro voice → `{ engine: 'kokoro', voice, speed, mood, emotional: { model, expression } }`.
  The doc lanes put the GPU engine first; the Kokoro profile is the automatic fallback.
- `emotional` false / absent → exactly the human profile of before (no `emotional` key).
- A model that is not built, or junk in `emotional` / `expression` → an unreadable kit value → ignored (static profile, as before).

## Lanes

| Lane | Emotional voice? |
|---|---|
| Storybook doc lane (`yt-deepdive.mjs renderStorybookVisuals`) — Money Rulebook's daily long doc | **Yes**: `voice_lines.py --engine kokoro … --gpu-model … --expression … --gpu-tags … --gpu-slug <slug>`; speaks the tagged sentences |
| Living Diagram doc lane (`lib/diagram-episode.mjs`) | **Yes**, natural delivery only (its script is tag-free) |
| Shorts + legacy doc narration (`youtube-flow/narrate.py`) | No — Kokoro human voice (a ~5 min GPU setup per Short would waste the free quota) |

## Flow (`explainer/kaggle_voice.py gpu_narrate`)

1. Guards, in order (any one → whole-run fallback): model built? → this ISO week's GPU use below 25 h
   (sum of every channel's `yt-mcp/state/gpu-usage/<slug>.json`)? → a Kaggle key on the runner?
2. Reference: the channel voice through Kokoro saying `REF_TEXT` (licence-clean, ~60 KB mp3, inline base64).
3. Every sentence of every uncached line → ONE private kernel `<owner>/quarry-voice-<slug>` (GPU + internet),
   pushed with `-t 1800` (the kernel's own run limit). `none` = tags removed before the GPU sees the text.
4. Poll `kernels status` every 30 s (first wait 60 s) — hard timeout 30 min. A `complete` status whose
   `result.json` nonce is not this run's is the previous version → keep polling.
5. Download only `result.json` + `voice-out.tar` (one tar of FLACs — no output paging).
6. Per line: `voice_lines.human_tts` with the GPU clips (same pauses, lead, loudness via `to_mp3`), faster-whisper
   timings on the CLEAN text. **Quality gate**: fewer than 85% of the words heard, or under ~1 word/s → that line
   is left to the normal Kokoro loop.
   Mood sets the GPU temperature (calm 0.7 … excited 0.9); the speed slider applies to the standard voice only —
   the GPU voice keeps the model's natural pace (no time-stretching).
7. GPU wall time recorded in `yt-mcp/state/gpu-usage/<slug>.json` (also on failure — time spent still counts);
   the produce job's "Commit publishing state" step commits it. `voice-report.json` says what happened.

### Every fallback path

| What fails | What happens |
|---|---|
| Model not built / emotional junk | profile unreadable → today's voice (no GPU attempt) |
| Free GPU ≥ 25 h this week | whole run → Kokoro human voice; advisory |
| No Kaggle key on the runner | whole run → Kokoro; advisory |
| Both free GPU sessions busy ("Maximum batch GPU session count of 2") | the push is retried every 2 min for up to 10 min (inside the 30-min budget); still busy → whole run → Kokoro; advisory |
| Any other `kernels push` error (quota, network) | whole run → Kokoro; advisory (no GPU time counted — nothing ran) |
| Kernel `error` / cancelled / Python fatal (e.g. no CUDA) | whole run → Kokoro; advisory; GPU time recorded |
| 30-min hard timeout (incl. time QUEUED for a T4) | whole run → Kokoro; advisory; GPU time since the push recorded. The kernel carries the same absolute deadline: if Kaggle starts it later, it exits at once (the CLI cannot cancel a queued kernel), and it stops generating past the deadline |
| No `result.json` / no audio in the output | whole run → Kokoro; advisory |
| Any unexpected exception | whole run → Kokoro; advisory |
| One sentence failed in the kernel, or a line fails the 85% gate | that line → Kokoro; logged, no alert |
| Kokoro itself fails | unchanged: the lane fails loudly as today (never a silent line) |

The advisory: code `emotional_voice_fallback`, severity `advisory` ("For your information" — never a phone
push), title "emotional voice unavailable today — used the standard voice", one per channel per day.

## Tags: where they are added and where they are stripped

- **Added**: only `yt-deepdive.mjs` `LONG_PROMPT` gets `DOC_VOICE_TAGS` (appended last; `''` when off/None).
- **Sanitized at generation**: `sanitizeEpisodeTags` right after `llmScript` — titles/chapter titles lose every tag;
  narration keeps only this level's tags, ≤ 1 per sentence, never dangling, density-capped; unknown brackets dropped.
- **Stripped before anything is shown or published**: `renderAndShipEpisode` runs `stripEpisodeTags` first →
  slides (headline/text/sub), karaoke words, SRT, chapter lines, description, title, thumbnail text, the state
  `deepdiveVideo.text` (Brain), the FB/IG outbox all use the tag-free script. The tagged copy rides along under a
  non-enumerable symbol (never serialised) and is read back ONLY by the storybook narration (`spokenBeatTexts`).
- **Engine**: `voice_lines.clean` removes tags from the words used for timings/captions; `kaggle_voice._keep_tags`
  keeps only the allowed tags in what the GPU speaks. Diagram, legacy and Shorts narration never see a tag.
- Off / None: `sanitizeEpisodeTags` and `stripEpisodeTags` return the **same object** — byte-identical.

## Voice library (`studio/lib/voice-library.mjs`)

27 voices = every English Kokoro voice in `voices-v1.0.bin` (listed from the model: 11 `af_`, 9 `am_`, 4 `bf_`,
4 `bm_`) minus `am_santa` (novelty). Labels: gender, accent, character (Deep & calm, Warm storyteller, Energetic,
Soft & slow, Clear & neutral, Bright & friendly), a short note, 2–4 suggested niches (finance, business, history,
science, tech, education, news, motivation, fitness, wellness, sleep, stories, true crime, philosophy, lifestyle,
gaming, kids-safe). Labels are a listening guide — always ▶ preview.

Previews say the same line, **no tags** (owner: judge the voice, not the laughs):
"Here's something most people never notice... The small choices you make every day quietly shape everything else."
- `studio/public/voices/library/<id>.mp3` — standard Kokoro voice, human pacing (local)
- `studio/public/voices/emotional/<id>.mp3` — the GPU engine cloning that voice (ONE Kaggle GPU batch,
  kernel `quarry-voice-library`). Its 27 references (≈ 1.6 MB) are too big to inline, and uploads from the
  owner's PC to Kaggle hang (dataset create) or reset (a 500 KB push), so a tiny CPU-only kernel
  `quarry-voice-refs` (no GPU quota) builds them on Kaggle with the same Kokoro (`REF_TEXT`, kokoro-onnx 0.4.7)
  and the GPU batch reads them through `kernel_sources`. A channel's own run inlines its single ~60 KB reference.

## Requirements (EARS)

Setting
- EV-D1: THE GPU ENGINE MODEL SHALL be data (`GPU_VOICE_MODELS`); only `chatterbox-turbo` is accepted today.
- EV-D2: THE EXPRESSION SHALL be `none` (default), `light` or `rich`; `none` SHALL mean no tags at all; `light` SHALL never include a laugh.
- EV-D3/D4: `parseVoiceProfile` SHALL keep the 3 emotional keys only when sent, and refuse junk with a plain sentence.
- EV-D5: WHEN the Voice drawer saves a library voice, THE ROUTE SHALL write `kit.voice` and the top-level voice through `setChannelKitFields`; a non-library voice SHALL be refused (400).
- EV-D6: Readiness SHALL stay 7 items; the emotional keys SHALL change nothing in it.

Engine
- EV-E1: WHEN `human` and `emotional` are on with a Kokoro voice, THE DOC LANES SHALL try the GPU engine first with the Kokoro profile as fallback.
- EV-E2: WHEN `emotional` is off or absent, EVERY LANE SHALL behave exactly as before.
- EV-E3: `human: false` SHALL always win.
- EV-A1: THE GPU RUN SHALL batch all lines of one narration into ONE private kernel per channel (`quarry-voice-<slug>`).
- EV-A2: THE ASSEMBLY SHALL use the same human pacing, loudness target and clean-text word timings as the Kokoro lane.
- EV-A3: IF a line has fewer than 85% of its words heard, THAT LINE SHALL be re-read with the standard voice.
- EV-A4: IF anything fails for the whole run, THE NARRATION SHALL fall back to the Kokoro human voice, THE VIDEO SHALL still ship, and ONE advisory SHALL be recorded.
- EV-Q1: THE GUARD SHALL count GPU wall time per ISO week across all channels and SHALL skip Kaggle at 25 h (Kaggle allows ~30 h).
- EV-Q2: Failed runs' time SHALL still count.

Tags
- EV-T1: Tags SHALL never appear in captions, SRT, titles, descriptions, on-screen text or state.
- EV-T2: WHEN expression is Light/Rich, THE WRITER SHALL be asked for sparing tags; the reply SHALL be sanitized.
- EV-T3: WHEN off/None, THE PROMPT AND SCRIPT SHALL be byte-identical to today.

Panel
- EV-P2: THE VOICE DRAWER SHALL show the library picker (gender/accent/niche filters, ▶ per voice), Human pacing, and the emotional switch + None/Light/Rich + "Free GPU this week: X h of ~30 h".
- EV-P4: THE ▶ SHALL play the emotional clip when the emotional voice is on, else the standard clip — never another voice.
- EV-P5: Edit profile → Look & sound SHALL offer the same library (collapsed) and the same emotional section.

CI
- EV-C1/C2: THE KAGGLE CLI AND SECRETS SHALL reach a produce job only for a channel with the emotional voice on.
- EV-C3: Doc timeout 105 min (75 + the 30-min GPU hard timeout); produce job 150 min.
- EV-X1: `scripts/enable-emotional-voice.mjs <slug>` SHALL be a dry run unless `--apply`.
- EV-P1: THE PROOF RUN SHALL narrate one script through the GPU engine exactly like the storybook lane and SHALL NOT upload.

## Plain-English QA (what to check)

| # | Check | How | Expected |
|---|---|---|---|
| 1 | Default is unchanged | Open any channel's Voice drawer, save without touching the new section | Saved profile has no `emotional` key; next video sounds as before |
| 2 | Pick a voice from the library | Voice drawer → filter Niche: Sleep → ▶ Lewis → click Lewis → Save voice | Readiness "Voice chosen" still ticked; Edit profile shows Lewis |
| 3 | Emotional switch | Turn on "Emotional voice (laughs, sighs) — free GPU" | Human pacing turns on too; None / Light / Rich appear, None picked |
| 4 | Previews follow the switch | ▶ a voice with the switch off, then on | Off = standard voice; on = the emotional clip of the same voice |
| 5 | GPU use line | Look under the switch | "Free GPU this week: X h of ~30 h" |
| 6 | Proof run | Actions → 🧪 Emotional voice dry run → money-rulebook, expression none | Artifact `narration.mp3`; log says EMOTIONAL VOICE OK; no upload |
| 7 | Light tags | Same with expression light | A rare sigh; no "[sigh]" anywhere on screen or in captions |
| 8 | Fallback | Run the proof with the Kaggle secret removed (or wait for a busy GPU) | "FELL BACK to the standard voice"; narration still produced |
| 9 | Real run | After `enable-emotional-voice.mjs money-rulebook --apply` + commit | MR's next doc log shows "[voice] emotional voice (chatterbox-turbo) used"; video ships |
| 10 | Advisory | If the GPU was unavailable | Studio → Warnings → For your information: "emotional voice unavailable today — used the standard voice" (no phone push) |
