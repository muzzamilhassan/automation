# How the audio works: narration, voices, timings and music

*Written 2026-11-17, after step 1 (commit `6efe37b`). This covers the whole audio side: where the
voice comes from, every engine we use and why, how each word gets its exact time, how music is
mixed in, what runs on GitHub, what can go wrong, and how to change things.*

---

## 0. The short version

- Every video's voice is made by a **text-to-speech (TTS) engine** from the approved script.
  No human records anything.
- There are **three voice paths** in the code today. Which one runs depends on the *kind* of video
  and the channel's settings:

| Path | Script | Used for |
|---|---|---|
| **A** | `youtube-flow/narrate.py` | Shorts, the regular (b-roll) doc lane, weekly compilations |
| **B** | `explainer/edge_batch.py` | storybook doc episodes, template previews, older demos |
| **C (new, step 1)** | `explainer/voice_lines.py`, the **human voice lane** | channels with a `voiceProfile` (only **Money Rulebook** today): its Shorts, regular docs, storybook docs and the new Living Diagram docs |

- Path C is the newest. It reads **one sentence at a time** in the channel's own voice, puts
  **real pauses** between sentences, gives **every word its exact time**, and makes every line
  equally loud. It runs **on the GitHub machine itself**, so no internet voice service can fail
  in the middle of a video.
- **Exact word times** are the reason this matters. They drive the captions, the YouTube CC file,
  and every animation in the diagram videos ("the money flows on the word *rent*").
- If path C fails for any reason, the video falls back to the older path automatically. **A video
  is never shipped with silence instead of words.** This used to happen in path B; see §11.

---

## 1. Where audio is used

```
                     ┌────────────── approved script (Studio > Review) ──────────────┐
                     │                                                               │
              SHORTS (daily)                                              DOC EPISODES (doc day)
   youtube-engine.mjs  narrate()                               yt-deepdive.mjs  renderAndShipEpisode()
                     │                                  ┌──────────────┬──────────────┼──────────────┐
                     ▼                                  ▼              ▼              ▼              │
              PATH A narrate.py               legacy b-roll lane   storybook lane   diagram lane   │
       (human path first if profile)          PATH A per chapter   PATH B (or C if  PATH C          │
                     │                                             profile)         (Edge if no     │
                     ▼                                                              profile)        │
   captions (word-timed) + music bed            episode.mp4 + episode.srt (YouTube CC) + chapters ◄─┘
                                                        │
                                                        └──► clips-first Shorts lane reuses the episode audio
```

| Video type | Voice comes from | Word times used for |
|---|---|---|
| Shorts | path A (path C first if the channel has a profile) | burned-in captions |
| Doc, **legacy b-roll** look | path A, one call per chapter | `episode.srt`, uploaded as YouTube captions |
| Doc, **storybook** look | path B (path C if the channel has a profile) | karaoke captions in the video + `episode.srt` |
| Doc, **Living Diagram** look | path C (Edge Multilingual if no profile) | every animation cue + `episode.srt` |
| Clips-first Shorts | cut from the doc episode, so its audio is reused | sentence-aligned cuts from `episode.srt` |
| Weekly compilation | path A | captions |
| Template previews / demos | path B | preview captions |

---

## 2. Path A: `youtube-flow/narrate.py` (Shorts and the legacy doc lane)

Called as `python narrate.py <script.txt> <out.mp3> <out.words.json>`. It always writes
`<out.mp3>.meta.json` with `{engine, audio, words:[{w, s, d}], duration}`. `s` is a word's start
time and `d` its length, both in seconds. Callers only read this meta file, which is why a new
engine could be added without touching any caller.

It tries engines **in order** and the first that works wins:

```
0. HUMAN VOICE LANE (step 1)   only if lib/brands.json[channel].voiceProfile exists
        │ fails? -> logs "human voice failed (...) falling back to the legacy chain"
        ▼
1. OpenAI gpt-4o-mini-tts      only if OPENAI_API_KEY works (voice "onyx", narrator instructions,
        │                      speed 0.95; word times from OpenAI whisper-1). Today the key has
        │ fails?               no credits, so this step fails and is skipped.
        ▼
2. Kokoro-82M (old way)        the channel voice (bm_daniel, af_heart ...), speed from env
        │                      (Shorts 1.0, legacy doc 0.92). Model files must be in pixabay-pool/.
        │ fails?               Word times are GUESSED from word length, not measured.
        ▼
3. Edge TTS                    Microsoft's free online voices. Default en-US-BrianMultilingualNeural;
                               real word times (WordBoundary), rate +2%.
```

**How it knows the channel:** from the `SLUG` environment variable (set by every GitHub job)
or `YT_VOICE_CHANNEL`.

**Weak spots before step 1:**
- **Guessed timings:** with old Kokoro, a short word and a long word in the same sentence get
  times proportional to their letters, not to how they were actually spoken. Captions can drift.
- **No pauses:** the whole text is read in one breath, so the delivery is flat.
- **Unknown engine:** whether Kokoro or Edge ran depended on whether the model was in the
  shared cache, and the logs don't record which one won.

---

## 3. Path B: `explainer/edge_batch.py` (the storybook lane's original voice)

- **One Edge TTS call per beat** (a beat is usually one sentence). Each call has a 90-second
  limit and **3 attempts**.
- **Real word times** come from Edge's `WordBoundary` events. This is why the storybook karaoke
  captions use Edge.
- **Resume cache:** a beat whose text didn't change reuses its old audio, keyed by text hash.
- **The design flaw:** after 3 failed attempts it writes an **8-second silent placeholder** and
  carries on ("the pipeline never dies"). Edge sometimes answers *"No audio was received"*, so
  silent beats can reach YouTube. See §11.
- **Voice:** the template's `doc_presentation.voice` if it's a real Edge voice name, otherwise
  `en-US-AndrewNeural`. Kokoro names like `bm_daniel` aren't valid Edge voices, so **every
  storybook channel whose template doesn't name an Edge voice sounds like the same "Andrew"**,
  Money Rulebook included before step 1. (Some templates do name one; `history-storybook`
  uses `en-GB-RyanNeural`.)

Channels with a `voiceProfile` now skip this path: the storybook lane calls path C instead (§4),
with the same file layout.

---

## 4. Path C: the human voice lane (`explainer/voice_lines.py`, step 1)

### 4.1 What happens to one piece of narration

```
"Most people think budgeting is about cutting coffee. It isn't. Here's the truth... your paycheck
 disappears in the first ten days."
        │
 1. SPLIT into sentences (we do it, deterministically; quotes stay with their sentence)
        │   ["Most people think budgeting is about cutting coffee.", "It isn't.", "Here's the truth...", ...]
        ▼
 2. SPEED per sentence = channel base speed × mood × punctuation   (clamped 0.70 – 1.30)
        ▼
 3. KOKORO reads each sentence (on the runner's CPU, no internet)
        ▼
 4. SILENCE between sentences, sized by punctuation ("..." 650 ms, "?" 430 ms, "." 340 ms ...)
    + 120 ms of lead-in silence at the start
        ▼
 5. JOIN everything into one track
        ▼
 6. ALIGN: find the exact time of every KNOWN word (faster-whisper tiny.en listens once to the
    whole track; its words are matched to OUR script words; misheard words are filled in between
    their neighbours)
        │   weak match (< 80 % of words heard)? -> align sentence by sentence instead
        │   still weak (< 60 %)?                -> FAIL LOUDLY (the caller falls back, nothing silent ships)
        ▼
 7. LOUDNESS: one target for everything (-16 LUFS, peaks under -1.5 dB), saved as 44.1 kHz mono MP3
        ▼
 OUTPUT: line-XX.mp3 (or beat-XX.mp3) + words [{w, s, d}] that are exactly the script's words
```

Real result on a Money Rulebook test paragraph: **40 of 40 words heard**, a clear pause after
"truth…", −16.6 LUFS, 18.7 s of audio made in 24 s on the laptop.

### 4.2 Why each step exists

| Step | Why |
|---|---|
| Split into sentences ourselves | Pauses need sentence boundaries. In diagram videos it also guarantees the spoken words are exactly the approved words; the AI never rewrites them. |
| Speed per sentence | A question is read a touch slower, an exclamation a touch faster. The channel's mood sets the base (Money Rulebook: calm). |
| Kokoro on the runner | Free (Apache-2.0), good quality, each channel keeps its own voice, and **no network call to fail**. |
| Real silences | This is the biggest "human" difference. People breathe between sentences, and a longer pause after "…" builds suspense. |
| Alignment of known words | Kokoro has no timing output. Recognising the audio and matching it back to the known script gives exact times without trusting the recogniser's spelling. |
| One pass, then a fallback | One pass over the whole track is about 3× faster. The per-sentence fallback catches the rare bad pass; base.en once heard only 10 of 40 words, tiny.en heard 40 of 40. |
| Fail loudly | Silence on YouTube is worse than a fallback voice. |
| One loudness target | No line jumps louder or quieter, and the music bed sits evenly underneath. |

### 4.3 The rules, in numbers

**Pause after a sentence** (`PAUSE_MS`):

| Sentence ends with | Pause |
|---|---|
| `...` or `…` | 650 ms |
| `?` | 430 ms |
| `:` | 420 ms |
| `!` | 380 ms |
| `.` | 340 ms |
| `;` | 300 ms |
| anything else | 300 ms |

In diagram videos the planner can also set a longer `pauseMs` after a line, up to 1.5 s, before a
reveal.

**Mood** (one per line in diagram videos; otherwise the channel's default mood):

| Mood | Kokoro speed × | Edge rate / pitch | Chatterbox temperature |
|---|---|---|---|
| calm | 0.96 | −4% / −2 Hz | 0.7 |
| warm | 1.00 | 0% / 0 Hz | 0.8 |
| excited | 1.08 | +7% / +3 Hz | 0.9 |
| serious | 0.94 | −6% / −3 Hz | 0.7 |
| tense | 1.03 | +3% / −1 Hz | 0.85 |
| sad | 0.90 | −10% / −4 Hz | 0.7 |
| playful | 1.05 | +5% / +2 Hz | 0.9 |

**Punctuation on top:** `!` × 1.04, `?` × 0.98, `…` × 0.97. Final speed is always clamped to
0.70–1.30.

**Alignment thresholds:** `MIN_HEARD = 0.8` (below this, redo per sentence) and
`FAIL_HEARD = 0.6` (below this, fail).

### 4.4 Who calls path C

| Caller | How |
|---|---|
| `narrate.py` (path A) | `voice_profile()` reads the channel's profile → `try_human()` → `human_tts_to_mp3()`. Meta `engine: "kokoro-human"`. |
| Storybook lane (`yt-deepdive.mjs`) | `voiceProfileFor(slug)` → `voice_lines.py … --engine kokoro --layout edge_batch`, the same file names path B wrote. |
| Diagram lane (`lib/diagram-episode.mjs`) | `voice_lines.py … --engine kokoro` with each line's mood. Without a profile: `--engine edge` with an Edge Multilingual voice. |
| Local demos / dry runs | `longvideo/make-diagram-demo.mjs`, `longvideo/diagram-episode-dryrun.mjs` |

### 4.5 Other engines inside `voice_lines.py`

The batch tool (`python voice_lines.py <lines.json> <outdir> --engine …`) also supports:

- **`edge`:** mood becomes rate/pitch per line, with real WordBoundary times. **4 attempts**
  (waits of 3, 6 and 9 s), then it **exits with an error**. It never writes a silent placeholder.
- **`chatterbox`:** Resemble AI's Chatterbox-Turbo through its free Hugging Face Space.
  It understands emotion tags like `[sigh]`, `[chuckle]`, `[gasp]` and `[laugh]`, and copies the
  voice of a reference clip, which we make with Kokoro so the channel keeps its voice. **Demo
  only:** the free daily GPU quota ran out after 7 lines.
- **`chatterbox-local`:** Chatterbox on this laptop (`explainer/chatterbox_local.py`, separate
  environment `~/.venvs/chatterbox`). **Not used:** the small "Nano" model skipped words on 7 of
  21 lines.

Emotion tags are spoken as sounds, never as words, and never used as animation triggers.

**Caching:** every line is cached by a key built from engine, voice, reference clip, text, mood
and speed. Re-running a video only re-makes lines that changed.

---

## 5. The engines compared: what we use and why

| Engine | Licence / cost | Runs where | Emotion | Word times | Status |
|---|---|---|---|---|---|
| **Kokoro-82M** (ONNX) | Apache-2.0, **$0** | on the GitHub machine (CPU) | speed only; we add pauses and moods | measured by our alignment (path C) or guessed (old path A) | **main engine for path C** |
| **Edge TTS** (Microsoft online voices) | free, unofficial endpoint | Microsoft's servers (internet) | rate/pitch only; custom SSML is blocked | real (WordBoundary) | path B, path A last fallback, diagram voice without a profile |
| **OpenAI gpt-4o-mini-tts** | paid API | OpenAI servers | narrator instructions | via OpenAI whisper-1 | first in path A, but **inactive** (key has no credits) |
| **Chatterbox-Turbo** | MIT, $0 to run | needs a GPU (HF Space for demos) | **real sighs, chuckles, laughs, gasps** | measured by our alignment | demo only. Future: Kaggle's free GPU, §13 |
| **Chatterbox-Nano** | MIT | CPU | tags | measured | **rejected**: skipped words |
| **faster-whisper tiny.en** | MIT, $0 | CPU | n/a | it IS the timer | path C alignment |

**Why Kokoro is the base:** it costs nothing, runs without internet, sounds natural, and has a
different voice per channel (`bm_daniel`, `af_heart`, `am_michael` …). On GitHub's 2-core machine
it reads an 8.8-minute episode in about 7 minutes. The full-precision model (`kokoro-v1.0.onnx`,
325 MB) is *faster* on CPUs than the small int8 one: 4.3 s vs 11.5 s for 5.5 s of audio.

**Why not Edge for everything:** it really is free and has exact word times, but it needs the
internet and sometimes returns nothing ("No audio was received"). That caused the silent-beat
incident. Microsoft also blocks the voice-style controls (SSML), and it has only a handful of
natural English voices, so many channels would sound the same.

**Why not Chatterbox yet:** it's the only free model with real laughs and sighs, but it needs a
GPU to be fast and good. Free hosted quota is a few minutes a day, and the CPU-friendly version
skips words.

---

## 6. Word timings: why every lane cares

The voice engine gives sound. The **word timings** say exactly when each word is spoken, and almost
everything visual hangs on them:

| Use | Needs |
|---|---|
| Shorts captions (1–3 words at a time, highlighted as spoken) | start time of every word |
| Storybook karaoke captions + entity/stat pop-ups ("the name fires on the word it's spoken on") | every word |
| `episode.srt`, uploaded to YouTube as closed captions | every word, grouped into ≤ 8-word cues |
| Clips-first Shorts (cut on sentence boundaries) | `episode.srt` |
| **Living Diagram** cues ("flow on *rent*", "counter on *$3,200*") | the exact word, in the exact line |

How each engine gets them:

| Engine | Method | Accuracy |
|---|---|---|
| Edge | the server reports each word as it speaks | exact |
| OpenAI | separate whisper-1 transcription | exact |
| Kokoro, **old** path A | proportional to word length | **approximate**; can drift |
| Kokoro, **path C** | faster-whisper listens, then the **known** words are matched (§4.1 step 6) | exact; 40/40 in tests |
| Chatterbox | same as path C | exact |

Because path C maps onto the **script's own words**, the words list always matches the text
exactly, including punctuation. A diagram cue anchored to "rent" will always find "rent".

---

## 7. Where the voice settings live (all data, no code per channel)

| Setting | File / field | Who reads it |
|---|---|---|
| Channel's base voice (Kokoro id) | `lib/brands.json` → `voice`, and the kits in `yt-brands/brands.mjs` + Studio registry | Shorts (path A), legacy doc lane |
| **Human voice lane on/off + settings** | `lib/brands.json` → **`voiceProfile`** `{ engine: "kokoro", voice, speed, mood }` | `narrate.py voice_profile()`, `lib/voice-profile.mjs voiceProfileFor()` (one shared reader) |
| Storybook template voice (Edge name) | template `doc_presentation.voice` | path B only |
| Diagram look + music mood | template `doc_presentation.style` (`tile`/`glow`), `music_mood` | diagram lane |
| Engine overrides (advanced) | env `KOKORO_DIR`, `VOICE_ALIGN_MODEL` (default `tiny.en`), `YT_KOKORO_SPEED`, `YT_EDGE_VOICE`, `EXPLAINER_VOICE`, `CHATTERBOX_SPACE`, `CHATTERBOX_PYTHON` | the scripts above |

**Today's channel voices** (`lib/brands.json`):

| Channel | Kokoro voice | Human lane |
|---|---|---|
| money-rulebook | bm_daniel (British male) | **ON**: speed 0.95, mood calm |
| quotequarry | am_michael | off |
| investors-compass | bm_george | off |
| debt-free-doctrine | am_fenrir | off |
| escrow-estate · founders-margin | bm_george · am_adam | off (paused channel) |
| policy-brief · tax-shield | am_michael | off (paused) |
| old-money-code · ai-observer · longevity-code · sleep-architect | af_heart (US female) | off (paused) |
| closing-table · deep-work-os | am_onyx | off (paused) |
| corner-office | bm_daniel | off (paused) |
| iron-discipline | am_fenrir | off (paused) |

Kokoro voice ids: first letter = accent (`a` American, `b` British), second = `f` female / `m` male.

---

## 8. Music and mixing

The voice is made first. Music is laid **under** it:

- **Which track:** only from the channel's **approved music pool** (`yt-brands/approved-music.json`),
  chosen by `music-engine.mjs pickApprovedTrack()`. The template's `music_mood` is a preference,
  not a rule.
- **Diagram videos:** mixed inside the Remotion render at volume **0.11** (quiet), fading in over
  1.5 s and out over the last 2 s, looping if the episode is longer than the track.
- **Storybook videos:** mixed by the DocV2 renderer under the narration.
- **Legacy b-roll docs:** mixed with ffmpeg; the same track loops and is never swapped mid-episode.
- **Loudness check:** finished diagram episodes measured **−17.0 LUFS**, in the normal YouTube range.

---

## 9. What runs on GitHub (your laptop can be off)

Every production job runs on a GitHub machine (2 CPU cores, 7–8 GB RAM). The audio setup lives in
`.github/actions/setup-render/action.yml`:

1. **Always:** installs `edge-tts`, `kokoro-onnx` and `soundfile`.
2. **Only when the job's channel has a `voiceProfile`** (other channels skip this entirely):
   installs `faster-whisper`, and downloads the full Kokoro model (325 MB) plus voices (28 MB)
   into `pixabay-pool/` if the shared cache doesn't already have them.
   - **Why the download:** the shared cache `pixabay-pool-v1` was saved before the model was
     added, so the first cloud test showed it missing. The download takes about 30 s.
   - **Never fatal:** nothing in this step can fail the job, because path A falls back on its own.
3. The aligner (`tiny.en`, about 75 MB) downloads from Hugging Face on first use.

**Measured on GitHub** (cloud dry run, 2026-11-17; 8.8-min Money Rulebook episode, 64 sentences):

| Stage | Time |
|---|---|
| Human voice for the whole episode | **7.2 min** |
| AI diagram planning | 6.1 min |
| Render | 22.4 min |
| Whole run | 37.5 min (job limit 90 min) |

---

## 10. When something goes wrong: what you'll see in the logs

| Log line | Meaning | Action |
|---|---|---|
| `engine:kokoro-human` / `human voice: bm_daniel 18.6s, 40/40 words heard` | path C worked | none |
| `human voice failed (...) falling back to the legacy chain` | path C failed; the old voice was used for this piece | read the reason: model missing, alignment too weak … |
| `alignment too weak: 20/40 words heard` | the recogniser couldn't follow the audio | usually a bad sentence or odd symbols; the old voice was used |
| `kokoro model missing in [...]` | model files not on the machine | check the "Human voice lane" setup step |
| `[storybook] tts: 48 spoken beats, human voice bm_daniel` | storybook used path C | none |
| `[storybook] tts: … voice en-US-AndrewNeural` + `SILENT PLACEHOLDER (network)` | path B (no profile) and Edge failed a beat | that beat is silent in the video. Turn the human lane on for the channel |
| `[voice] edge retry 2: No audio was received` | Edge hiccup in path C's Edge engine | it retries 4×, then stops with an error (no silence) |
| `[diagram] voice done (7.2 min)` | diagram voice finished | none |
| `[diagram] FAILED — diagram voice failed` | voice failed inside the diagram lane | that episode falls back to the storybook look; you get an ntfy alert |

---

## 11. Incidents and lessons

| Date | What happened | Lesson / fix |
|---|---|---|
| 2026-11-16 | Money Rulebook episode `oXAT8NGLV4Q` ("The $100K Barrier…") went public with **8 silent beats**, including the opening hook. Edge returned "No audio" 3× on 8 of 48 beats; path B inserted 8 s of silence each time and continued. | Path C runs locally (no network TTS) and fails loudly. The video was set **private** on 2026-11-17. |
| 2026-11-17 | Whole-track alignment with `base.en` heard only 10/40 words. | `tiny.en` is the default (40/40, about 3× faster), plus the per-sentence fallback and the 60% fail line. |
| 2026-11-17 | The int8 Kokoro model was slower than the full model on CPU (11.5 s vs 4.3 s). | Path C prefers `kokoro-v1.0.onnx`. |
| 2026-11-16 | Chatterbox free Space quota ran out after 7 lines; local Nano dropped words. | Chatterbox stays demo-only until a GPU route (Kaggle) is built. |
| Windows only (dev) | Chatterbox crashed on an MP3 reference clip; float64 audio error; torchaudio needs torchcodec to save. | Reference converted to WAV, loudness step skipped, files saved with soundfile. GitHub (Linux) is unaffected. |

---

## 12. How to …

**Turn the human voice on for a channel** (takes effect on its next run; commit and push after):
```
node scripts/enable-human-voice.mjs quotequarry                  # its own Kokoro voice
node scripts/enable-human-voice.mjs quotequarry --speed 0.95 --mood warm
node scripts/enable-human-voice.mjs quotequarry --voice am_adam  # a different Kokoro voice
node scripts/enable-human-voice.mjs quotequarry --off            # back to the old paths
```

**Listen to a voice locally** (needs the Kokoro model in `~/.cache/kokoro/` or `pixabay-pool/`):
```
SLUG=money-rulebook python youtube-flow/narrate.py text.txt out.mp3 out.words.json
# out.mp3.meta.json shows engine, every word with its time, and the duration
```

**Hear a full diagram episode without uploading:**
- Local: `node longvideo/diagram-episode-dryrun.mjs money-rulebook longvideo/diagram-demo/mr-silent-money-leaks.script.json studio/lib/template-bot-drafts/money-flow-diagram.json`
- Cloud: **Actions → 🧪 Diagram dry run → Run workflow** (the MP4 is attached to the run).

**Run the audio tests:**
`python -m pytest services/ai/tests/test_voice_human.py` (13 tests, no models needed)
and `node --test tests/diagram-plan.test.mjs`.

---

## 13. What's next for the voice

- **Real emotions (laughs, sighs) for $0:** run Chatterbox-Turbo on **Kaggle's free GPU**
  (about 30 GPU-hours a week, started by API from GitHub; laptop not needed). It would copy each
  channel's Kokoro voice, so viewers hear the same person, just more alive. It needs a
  phone-verified Kaggle account and an API token as a GitHub secret. Kaggle's commercial-use
  terms still need checking.
- **Rolling out the human lane:** Money Rulebook first (now live), then the other active channels
  (quotequarry, investors-compass, debt-free-doctrine), then paused channels as they reopen. One
  command per channel (§12).
- **Storybook channels without a profile still use path B** and can still get silent beats. Turning
  the profile on fixes that channel. Hardening path B itself is a separate small fix if wanted.

---

## 14. File map

| File | Role |
|---|---|
| `youtube-flow/narrate.py` | path A: engine chain + human lane entry (`voice_profile`, `try_human`) |
| `explainer/edge_batch.py` | path B: per-beat Edge batch (silent placeholder on failure) |
| `explainer/voice_lines.py` | path C: human lane core (`split_sentences`, `pause_after`, `sentence_speed`, `human_tts`, `map_to_script`, `whisper_aligner`, `human_tts_to_mp3`) + the batch CLI (edge / kokoro / chatterbox engines) |
| `explainer/chatterbox_local.py` | local Chatterbox helper (not used in production) |
| `lib/voice-profile.mjs` | the one reader of `voiceProfile` for the Node side |
| `scripts/enable-human-voice.mjs` | turn the lane on/off per channel |
| `lib/brands.json` | channel voices + `voiceProfile` data |
| `yt-deepdive.mjs` | doc lanes: legacy (path A per chapter), storybook (B or C), diagram (C) |
| `youtube-engine.mjs` | Shorts: `narrate()` → path A |
| `lib/diagram-episode.mjs` | diagram lane voice call + timeline |
| `lib/srt.mjs` | word timings → `episode.srt` cues |
| `music-engine.mjs`, `yt-brands/approved-music.json` | music beds |
| `.github/actions/setup-render/action.yml` | installs engines on GitHub (+ the profile-only step) |
| `services/ai/tests/test_voice_human.py` | voice lane tests |
| `docs/qa/step1-mr-voice-moneyflow-qa.md` | step 1 spec, QA rows and results |
