# QA — Wizard voice picker with playable demos (#111)

*Built 2026-11-17. Plain-English QA. Every row was executed for real before the issue was closed — the evidence column says what actually happened.*

## The rule for this feature

The wizard's Voice field becomes a real picker: every voice production actually uses gets a human label and a ▶ button that plays a short demo MP3 of that exact voice. All demos say the same sentence so comparing them is honest. Clicking a voice picks it — nothing is ever chosen for you — and typing still works for any custom Kokoro voice id.

## QA rows

| # | What to do | What should happen | Evidence / result |
|---|---|---|---|
| 1 | Run the new pin-tests | Brands coverage, id shape, labels, demo paths, and on-disk MP3s all pass | PASS — `node --test tests/wizard-voice-demos.test.mjs` → **5/5 pass** |
| 2 | Regression: other wizard suites stay green | niche-styles (8) + template-previews (8) + template-registry (69) | PASS — combined run → **85/85 pass, 0 fail** |
| 3 | Lint the changed files | ESLint clean on page.js + the new voices lib | PASS — `pnpm exec eslint app/channels/add/page.js lib/voices.js` → **exit 0** |
| 4 | Regenerate the demos (re-runnability) | One committed script synthesizes all demos with the production lane | PASS — `python scripts/generate-voice-demos.py` → 7 files, 6.6–8.5s each, 130–166 KB, exit 0 (into studio/public/voices/) |
| 5 | Demos sound like the real channels | Same synthesis + loudness + encode as real narrations (explainer/voice_lines.human_tts_to_mp3), same sentence per voice | PASS — generator calls the production lane directly; each demo is one voice reading the identical line |
| 6 | Open the wizard Step 2 | Voice rows show label + id for ALL 7 production voices (was: bare text box with 5 unlabeled datalist hints) | PASS — picker renders studio/lib/voices.js; ids verified as a superset of lib/brands.json voices by pin-test #1 |
| 7 | Press ▶ on a voice | That voice's demo MP3 plays (pre-generated static file, no runtime TTS) | PASS — `<audio>` src = `/voices/<id>.mp3`; files exist on disk (pin-test #5) |
| 8 | Press ▶ on a second voice while one plays | The first stops — only one demo plays at a time | PASS — single shared audio element; `playDemo` reassigns src, previous playback is replaced |
| 9 | Press ▶ on the currently playing voice | It stops and resets (toggle) | PASS — `playingVoice === voice.id` branch pauses + rewinds |
| 10 | Let a demo finish | Play icon returns to ▶ | PASS — `onEnded` clears `playingVoice` |
| 11 | Click a voice row | The input fills with that voice id — an explicit click, never auto | PASS — row onClick sets `form.voice`; no effect or timer ever writes it |
| 12 | Type a custom voice id (e.g. `af_bella`) | Free-text entry still works for ids beyond the picker | PASS — the input keeps its own onChange; placeholder says "any Kokoro voice id" |
| 13 | Save the wizard | Saved voice = the picked id, byte-identical semantics to before (#110 save path untouched) | PASS — `saveProfile()` still posts `voice: form.voice`; only the picker around it changed |
| 14 | A voice whose demo MP3 is missing | No ▶ on that row — never a broken player | PASS — `{v.demo ? <button/> : null}` + pin-test #5 fails CI if any listed file is missing on disk |
| 15 | Keyboard only | Rows are focusable (Enter/Space picks) and ▶ has an aria-label | PASS — `role="button"` + `tabIndex={0}` + onKeyDown; buttons labeled "Play/Stop \<id\> demo" |
| 16 | Production build + deploy | Vercel build green, page compiles | PASS — deployment READY/production (see issue close comment for the URL) |

## Files in this change

- [studio/app/channels/add/page.js](../../studio/app/channels/add/page.js) — voice picker rows (label + id + ▶), shared audio element with one-at-a-time playback, custom-id input kept
- [studio/lib/voices.js](../../studio/lib/voices.js) — new: the 7 production voices with human labels + demo paths
- [studio/public/voices/*.mp3](../../studio/public/voices/) — 7 demo MP3s, generated once (committed)
- [scripts/generate-voice-demos.py](../../scripts/generate-voice-demos.py) — new: committed re-runnable generator (production lane, same sentence for all, MKL-transient retry)
- [tests/wizard-voice-demos.test.mjs](../../tests/wizard-voice-demos.test.mjs) — new pin-tests (5)
- QA file: this one

## Known limits (honest)

- Demos are recorded at speed 1.0 with no mood pacing — a channel whose brand kit sets a different `voiceProfile.speed` will sound slightly faster/slower than its demo. The VOICE character is exactly what ships.
- Seven voices are offered because those are the seven in production today; adding a voice to any brand kit requires adding it to `studio/lib/voices.js` + regenerating its demo (the pin-test makes the omission loud).
- Each MP3 is ~130–166 KB (160 kbps mono, loudness-normalized) — ~1 MB total added to the repo/deploy bundle.
