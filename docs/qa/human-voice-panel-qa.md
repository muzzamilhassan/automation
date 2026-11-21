# Spec + QA — Human voice as a panel setting (2026-11-21)

Source: owner rule "Everything should be handled by the admin panel" + no-static-maps.
Before this, only Money Rulebook used human pacing, through a hand-written
`voiceProfile` in `lib/brands.json` toggled by `scripts/enable-human-voice.mjs`.
Now every channel has a **Voice** section in the panel.

## The setting

`kit.voiceProfile = { human: boolean, mood, speed }` in the channel's registry kit
(Neon `channels.kit` + the engine file `yt-mcp/studio-channels.json`).

| Field | Values | Notes |
|---|---|---|
| `human` | `true` / `false` | the "Human pacing" switch |
| `mood` | `calm`, `warm`, `excited`, `serious`, `tense`, `sad`, `playful` | exactly `explainer/voice_lines.py` `MOOD`; absent = `warm` |
| `speed` | 0.8 – 1.2 | base speed; out of range is clamped; absent = 1 |

The voice itself stays the channel voice (`voice` / `kit.voice`, picked in Edit profile).
Rules live once on the Node side in `studio/lib/human-voice.mjs`; `youtube-flow/narrate.py`
mirrors them. Both are pinned to one case table: `tests/fixtures/voice-profile-cases.json`.

## Engine precedence

1. The registry `kit.voiceProfile` (the panel) **wins**:
   - `human: false` → no human profile → the channel's normal voice chain (even if `lib/brands.json` has one).
   - `human: true` → `{ engine: 'kokoro', voice, speed, mood }`, voice = entry `voice` → `kit.voice` → static profile voice → static kit voice. If that voice is not a Kokoro voice → normal voice chain.
   - an unreadable kit value (wrong types, unknown mood) with the switch not off → ignored (step 2).
2. No kit field → `lib/brands.json[slug].voiceProfile`, read exactly as before (byte-identical).

## Lanes

| Lane | How it narrates | Reads the profile? |
|---|---|---|
| Daily Shorts (`yt-daily.mjs` → `youtube-engine.mjs narrate()`) | `youtube-flow/narrate.py` → `voice_profile()` (slug from `SLUG`, set by `channel-autopilot.yml`) → `try_human()` | Yes |
| Regular doc lane (`yt-deepdive.mjs narrate()`) | `narrate.py`, same as Shorts | Yes |
| Storybook doc lane (`yt-deepdive.mjs`) | `voiceProfileFor(slug)` → `voice_lines.py --engine kokoro --layout edge_batch` | Yes |
| Living Diagram doc lane (`lib/diagram-episode.mjs`, + `longvideo/diagram-episode-dryrun.mjs`) | `kit.voiceProfile = voiceProfileFor(slug)` → `diagramVoiceArgs` → `voice_lines.py --engine kokoro` | Yes |
| Render setup (`.github/actions/setup-render`) | installs faster-whisper + the fp32 Kokoro model | gate now asks `voiceProfileFor` (kit first) |
| Clips (`youtube-clips.mjs`, `longvideo/shorts-clips.mjs`) | no narration (cuts of existing videos) | n/a |
| Weekly compilation (`weekly-compilation.mjs`) | `narrate.py`, but its workflow sets no `SLUG` | No — always the normal chain (not a per-channel lane) |
| Old long-form lane (`longvideo/make-longform.mjs`, `longform-daily.yml`, schedule commented out) | Edge `edge_batch.py` only | No Kokoro human pacing at all |
| Template preview renders (`scripts/render-template-preview.mjs`) | Edge `edge_batch.py` | No (template samples, not a channel) |

## Requirements (EARS)

Setting (`studio/lib/human-voice.mjs`)
- HV-D1: THE MOOD LIST SHALL be exactly the 7 moods of `voice_lines.py` `MOOD`, each shown as one plain word.
- HV-D2: THE SPEED SHALL be 0.8–1.2; a number outside SHALL be clamped; anything not a number SHALL be refused.
- HV-D3/D4: `parseVoiceProfile` SHALL keep only `human`, `mood`, `speed`. IF `human` is not a boolean or the mood is unknown, IT SHALL refuse with a plain sentence.
- HV-D6: WHEN a voice has no pre-rendered clip, THE PANEL SHALL offer no preview — never another voice.

Engine (`lib/voice-profile.mjs`, `narrate.py voice_profile()`)
- HV-E1: WHEN the kit has `human: true` and a mood, EVERY LANE SHALL narrate with that mood and speed in the channel's Kokoro voice.
- HV-E2: WHEN the kit has `human: false`, EVERY LANE SHALL use the normal voice chain, even if `lib/brands.json` has a profile.
- HV-E3: WHEN the kit has no `voiceProfile`, EVERY LANE SHALL behave exactly as before (byte-identical).
- HV-E4: THE VOICE SHALL be the channel voice (entry, then kit, then the static kit).
- HV-E5: IF that voice is not a Kokoro voice, THE LANE SHALL use the normal voice chain.
- HV-E6: A hand-edited out-of-range speed SHALL be clamped; an unreadable value with the switch on SHALL be ignored.
- HV-L3: THE RENDER SETUP SHALL install the aligner for exactly the channels `voiceProfileFor` says are human.

Saving
- HV-S1: `POST /api/channels/profile` SHALL validate `kit.voiceProfile` via `kitFieldPatch` and answer 400 on a bad value.
- HV-S2/S3: WHEN the body is only `{ slug, kit: { voiceProfile } }` (the Voice drawer), THE ROUTE SHALL save that one key through `setChannelKitFields` (Neon kit + only this entry in the engine file), never the full upsert, and write an audit row. Owner only.
- HV-S4: THE WIZARD SHALL send `kit.voiceProfile` only once it is set; an untouched edit SHALL never send it.
- HV-S5: Review SHALL list "Human pacing" once it is set.

Panel
- HV-P1: EVERY CHANNEL SHALL have a staff-only "Voice" manage drawer (same `frame(body, footer, { dirty })` contract).
- HV-P2: THE DRAWER SHALL warn before closing over unsaved changes; Save is enabled only when something changed; staff see it read-only.
- HV-P3: THE SECTION SHALL show: Human pacing switch + "Natural pauses and pace between sentences"; 7 moods; a 0.8–1.2 slider labelled Slower / Normal / Faster.
- HV-P4: Preview SHALL play this voice in the chosen mood; the slider speed SHALL be applied as playback rate. Closing stops it.
- HV-P5: THE EDIT PROFILE WIZARD'S Look & sound step SHALL show the same section under the voice picker.

Preview clips
- HV-C1: THERE SHALL be one clip per picker voice × mood in `studio/public/voices/human/<voice>-<mood>.mp3`, each small.
- HV-C2: THE CLIPS SHALL be made by `scripts/generate-human-voice-previews.py` with the real `human_tts` path at speed 1.0, without alignment.

Migration (`scripts/migrate-voice-profile.mjs`)
- HV-M1: THE SCRIPT SHALL copy every static `voiceProfile` into the registry kit as `{ human: true, mood, speed }` (Money Rulebook: on, calm, 0.95). No channel is named in code.
- HV-M2/M3: IT SHALL skip, with a reason, any channel already set in the panel, missing from the registry, or whose sound would change.
- HV-M4: IT SHALL be a dry run unless `--apply` is given; `--apply` writes through `setChannelKitFields`.

Readiness
- HV-R1: THE 7 READINESS ITEMS SHALL be unchanged; human voice is optional and never affects readiness.

## How to check it (plain English)

1. Open **Channels**, pick a channel, open **Manage → Voice**.
   - You see the channel's voice name, a "Human pacing" switch with the line
     "Natural pauses and pace between sentences", 7 mood buttons and a speed slider
     with Slower / Normal / Faster under it.
2. Press **Preview**. You hear a short sample in this channel's voice and the chosen mood.
   Pick another mood: the sample changes. Move the slider while it plays: it speeds up or slows down.
   A custom voice shows "No preview for this voice."
3. Change the mood, then try to close the drawer: it asks before throwing the change away.
4. Press **Save voice**. The message says the next videos use human pacing (or the normal voice).
   Re-open the drawer: your choice is still there.
5. Sign in as staff: the drawer is read-only and has no Save button.
6. Open **Edit profile → Look & sound**: the same Voice section sits under the voice picker.
   Change it, go to **Review**: a "Human pacing" row shows your choice. Save.
7. Money Rulebook, after the migration has been run: the drawer shows Human pacing **on**,
   mood **Calm**, speed **0.95** — the same as before. Its videos sound the same.
8. Turn Human pacing **off** for Money Rulebook and save: the next run uses its normal
   voice chain (the run log shows no "human voice" line). Turn it back on to undo.
9. The readiness checklist still has 7 items; the voice setting never changes it.

## Running it

- Tests: `node --test tests/human-voice-panel.test.mjs` and
  `python -m pytest services/ai/tests/test_voice_human.py`.
- Clips: `python scripts/generate-human-voice-previews.py [voice]` (local Kokoro + ffmpeg).
- Migration: `node scripts/migrate-voice-profile.mjs` (dry run), then `--apply`, then commit
  `yt-mcp/studio-channels.json`.
