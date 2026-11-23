'use client';
// Emotional voice via the free Kaggle GPU (docs/qa/emotional-voice-qa.md) —
// the section shared by the Voice drawer (VoicePanel) and the Edit profile
// wizard's Look & sound step. Controlled: value = the whole voiceProfile
// ({ human, mood, speed, emotional?, expression?, model? }); onChange gets the
// whole next value. Turning it on also turns Human pacing on (the emotional
// voice uses the same pacing, and the human voice is its fallback).
// Shows this week's free-GPU use from GET /api/voice/gpu-usage.
import { useEffect, useState } from 'react';
import { Switch } from '@/components/ui';
import { isKokoroVoice } from '@/lib/human-voice.mjs';
import {
  EXPRESSIONS, EXPRESSION_LABEL, EXPRESSION_HINT, EMOTIONAL_LABEL, EMOTIONAL_HINT, DEFAULT_GPU_MODEL, emotionalOf,
} from '@/lib/emotional-voice.mjs';

export default function EmotionalVoiceSection({ voice, value, onChange, readOnly = false }) {
  const [usage, setUsage] = useState(null); // { line } | { error }
  const e = emotionalOf(value);
  const on = Boolean(value.human) && e.emotional;
  const kokoro = isKokoroVoice(voice);

  // state is only set when the request settles (never synchronously in the effect)
  useEffect(() => {
    let live = true;
    fetch('/api/voice/gpu-usage')
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        return d;
      })
      .then((d) => { if (live) setUsage({ line: d.line }); })
      .catch(() => { if (live) setUsage({ error: true }); });
    return () => { live = false; };
  }, []);

  const set = (patch) => onChange({ ...value, emotional: e.emotional, expression: e.expression, model: e.model || DEFAULT_GPU_MODEL, ...patch });

  return (
    <section className="space-y-3 min-w-0">
      <fieldset disabled={readOnly} className="space-y-3 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="t-13 font-semibold text-ink">{EMOTIONAL_LABEL}</h3>
            <p className="t-12 text-muted">{EMOTIONAL_HINT}</p>
            {on && !kokoro ? <p className="t-11 mt-0.5" style={{ color: 'var(--warn-ink)' }}>Works with the library voices only.</p> : null}
          </div>
          <Switch checked={on} onChange={(next) => set(next ? { emotional: true, human: true } : { emotional: false })} label="Emotional voice" />
        </div>

        {on ? (
          <div>
            <p className="t-12 font-semibold text-ink mb-1.5">Expression</p>
            <div role="radiogroup" aria-label="Expression" className="flex flex-wrap gap-1.5">
              {EXPRESSIONS.map((x) => {
                const picked = e.expression === x;
                return (
                  <button
                    key={x}
                    type="button"
                    role="radio"
                    aria-checked={picked}
                    data-kit="tile"
                    title={EXPRESSION_HINT[x]}
                    onClick={() => set({ expression: x })}
                    className="px-3 h-8 rounded-lg border t-12 font-semibold transition-colors"
                    style={picked ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)', color: 'var(--ink)' } : { borderColor: 'var(--line)', color: 'var(--muted)' }}
                  >
                    {EXPRESSION_LABEL[x]}
                  </button>
                );
              })}
            </div>
            <p className="t-11 text-faint mt-1">{EXPRESSION_HINT[e.expression]}</p>
          </div>
        ) : null}
      </fieldset>
      {usage?.line ? <p className="t-11 text-faint tabular-nums">{usage.line}</p> : null}
      {usage?.error ? <p className="t-11 text-faint">Free GPU use can&apos;t load right now.</p> : null}
    </section>
  );
}
