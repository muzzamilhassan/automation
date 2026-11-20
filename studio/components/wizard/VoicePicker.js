'use client';
// Step 3b — #111 voice cards with play demos. One shared audio element, so
// starting a demo stops the previous one. Picking is always an explicit click;
// a custom Kokoro id stays possible under "Use a custom voice id".
import { useEffect, useRef, useState } from 'react';
import { Play, Square, Check } from 'lucide-react';
import { VOICES } from '@/lib/voices';

export default function VoicePicker({ value, onChange }) {
  const audio = useRef(null);
  const [playing, setPlaying] = useState(null);
  // live fix wave B2 (T4-12): every play gets a token. Starting voice 2 while
  // voice 1 is still loading rejects voice 1's play() promise; only the
  // CURRENT token may clear the state, so voice 2 keeps its Stop button.
  const playToken = useRef(0);
  const isCustom = Boolean(value) && !VOICES.some((v) => v.id === value);
  const [showCustom, setShowCustom] = useState(isCustom);

  // leaving the step (unmount) stops any demo mid-sentence
  useEffect(() => () => audio.current?.pause(), []);

  const playDemo = (voice) => {
    const el = audio.current;
    if (!el) return;
    if (playing === voice.id) {
      playToken.current += 1;
      el.pause();
      el.currentTime = 0;
      setPlaying(null);
      return;
    }
    const token = ++playToken.current;
    el.pause();
    el.src = voice.demo;
    setPlaying(voice.id);
    const p = el.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        if (playToken.current === token) setPlaying(null);
      });
    }
  };

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2.5">
        <h3 className="t-13 font-semibold text-ink">Voice</h3>
        <p className="t-11 text-faint">Every demo says the same line, so you can compare fairly</p>
      </div>
      <audio ref={audio} onEnded={() => setPlaying(null)} className="hidden" />
      <div role="radiogroup" aria-label="Voice" className="grid sm:grid-cols-2 gap-2">
        {VOICES.map((v) => {
          const selected = value === v.id;
          const [accentLabel, ...rest] = v.label.split(' · ');
          return (
            <div
              key={v.id}
              className="flex items-center gap-2 rounded-xl border pl-1 pr-2 py-1 min-w-0 transition-colors"
              style={selected ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : { borderColor: 'var(--line)' }}
            >
              {v.demo ? (
                <button
                  type="button"
                  className="icon-btn shrink-0"
                  onClick={() => playDemo(v)}
                  aria-label={playing === v.id ? `Stop the ${v.label} demo` : `Play the ${v.label} demo`}
                >
                  {playing === v.id ? <Square size={11} fill="currentColor" /> : <Play size={12} />}
                </button>
              ) : null}
              <button type="button" role="radio" aria-checked={selected} data-kit="tile" onClick={() => onChange(v.id)} className="flex-1 min-w-0 text-left py-1.5 flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block t-13 font-semibold text-ink truncate">{rest.join(' · ') || accentLabel}</span>
                  <span className="block t-11 text-faint truncate">{rest.length ? accentLabel : ''} · {v.id}</span>
                </span>
                {selected ? <Check size={15} className="shrink-0" style={{ color: 'var(--accent)' }} /> : null}
              </button>
            </div>
          );
        })}
      </div>
      <div className="mt-2.5">
        {showCustom ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="t-12 text-muted" htmlFor="wizard-custom-voice">Custom voice id</label>
            <input id="wizard-custom-voice" className="input font-mono t-12 w-56 max-w-full" value={value} onChange={(e) => onChange(e.target.value)} placeholder="any Kokoro voice id" />
            {isCustom ? <span className="t-11 text-faint">Custom voices have no demo.</span> : null}
          </div>
        ) : (
          <button type="button" className="t-11 text-faint hover:text-ink underline underline-offset-2" onClick={() => setShowCustom(true)}>
            Use a custom voice id
          </button>
        )}
      </div>
    </section>
  );
}
