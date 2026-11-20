// Live fix wave C3 (T3-19) — a SOFT format hint for a pasted API key. Only
// providers whose key format is well known are listed; every other provider
// gets no hint. A hint never blocks "Save & test" (the live test decides).
// Pure, no imports. Spec + QA: docs/qa/live-fix-wave-c3-qa.md.

// provider id (lib/keys-vault.js) → the start every key of that kind has
const KEY_PREFIX = {
  groq: 'gsk_',
  openai: 'sk-',
  openrouter: 'sk-or-',
  gemini: 'AIza',
  hf: 'hf_',
  cerebras: 'csk-',
};

/** A plain hint when `value` doesn't look like a `provider` key; null otherwise. */
export function keyFormatHint(provider, value, label = '') {
  const v = String(value ?? '').trim();
  const prefix = KEY_PREFIX[provider];
  if (!v || !prefix || v.startsWith(prefix)) return null;
  return `${label || provider} keys usually start with ${prefix} — check you copied the whole key.`;
}
