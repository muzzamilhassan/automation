# Spec — `market-files` P2: the script brain (2026-11-10)

Source: research/paper-billions-cartoon-market-lane-2026-11-10.md P2. Owner
approved ("start P2"). P1 shipped the scenes; P2 ships the WRITER: a
LangGraph brain that turns a topic + a FACT SHEET into a Paper-Billions-style
episode script (schema below), validated and staged — plus the multi-voice
contract (who speaks which beat) that P4's audio pipeline will execute.

Honest-limits note: the brain writes STYLE, not facts. Every number in a
script must come from the operator-supplied fact sheet (R2); the review node
flags suspect numbers. P3's data layer will feed fact sheets automatically.

## EARS requirements

- R1: THE /bot/script endpoint SHALL be key-gated exactly like /bot/draft —
  a missing GROQ_API_KEY returns 503 and nothing else in the sidecar is
  affected. No silent deterministic fallback script.
- R2: THE brain SHALL treat the operator's FACT SHEET as the only legal
  source of numbers: the drafting prompt states the rule, and the review
  node lists every number found in the draft that does not appear in the
  fact sheet (the "suspect numbers" critique).
- R3: EVERY staged script SHALL pass the Node validator
  (validateMarketScript) first; a failing script is dropped with named
  errors, never staged.
- R4: THE script schema SHALL be: {version, script_id, topic, voices:
  {narrator, dialogue}, beats: [{layout, text, scene?:
  {location?, mood?, time?, day?}, dialogue?: {speaker, line}}]} — layouts
  only from the family-supported set (hero, chapter, split, stat, quote,
  process, timeline, end); scene.location from the built sets (trading,
  office, datacenter, stage); scene.mood from the five moods; voices from
  the sidecar's ALLOWED_VOICES pool.
- R5: buildMarketBeats(script) SHALL convert a validated script into
  DocV2-ready beats deterministically: layout/text/scene carried through,
  voice per beat (narration beats → voices.narrator, beats carrying a
  dialogue line → voices.dialogue). Same script → same beats, always.
- R6: voiceGroups(beats) SHALL return {voice: [beatIndex,...]} — the P4
  TTS batching contract (one edge_batch run per voice).
- R7: THE drafting prompt SHALL embed the Paper Billions style guide —
  cold-open hook with the shocking stat, short present-tense sentences,
  concrete numbers, one vivid analogy per chapter, minute-by-minute
  timestamped sequences for event days, short dialogue asides voiced by a
  second speaker, an ending that lands on an ordinary person — plus the
  fact-discipline rule (R2).
- R8: STAGING SHALL write to content/market-scripts/<script_id>.json with
  status "draft" — the registry, sync CLI, gallery, and template drafts dir
  never read it (isolation).
