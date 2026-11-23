'use client';
// The multi-niche voice library (docs/qa/emotional-voice-qa.md EV-L): every
// English Kokoro voice with plain labels, filters (gender, accent, niche) and a
// ▶ preview per voice. The preview is the emotional engine's clip when the
// emotional voice is on, else the standard voice (the human-pacing clip for
// this mood when one exists). One shared audio element: starting a preview
// stops the last one. Controlled: value = voice id, onChange(id).
// startCollapsed = a "Browse all N voices" button first (the wizard, under its
// own short voice list).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Square, Check } from 'lucide-react';
import { VOICES } from '@/lib/voices';
import { previewUrl } from '@/lib/human-voice.mjs';
import {
  VOICE_LIBRARY, GENDERS, ACCENTS, CHARACTERS, NICHES, filterLibrary, libraryPreviewUrl,
} from '@/lib/voice-library.mjs';

const PREVIEW_VOICE_IDS = VOICES.map((v) => v.id);
const NICHE_IDS = Object.keys(NICHES).filter((n) => VOICE_LIBRARY.some((x) => x.niches.includes(n)));

export default function VoiceLibraryPicker({ value, onChange, emotional = false, mood = 'warm', readOnly = false, startCollapsed = false }) {
  const audio = useRef(null);
  const [open, setOpen] = useState(!startCollapsed);
  const [gender, setGender] = useState('');
  const [accent, setAccent] = useState('');
  const [niche, setNiche] = useState('');
  const [playing, setPlaying] = useState(null); // the clip url that is playing
  const playToken = useRef(0);
  const list = useMemo(() => filterLibrary({ gender, accent, niche }), [gender, accent, niche]);

  // closing the drawer / leaving the step stops the preview mid-sentence
  useEffect(() => () => audio.current?.pause(), []);
  // the emotional switch flips every clip: stop the old one
  useEffect(() => {
    playToken.current += 1;
    audio.current?.pause();
  }, [emotional]);

  const clipFor = (id) => (emotional
    ? libraryPreviewUrl(id, { emotional: true })
    : previewUrl(id, mood, PREVIEW_VOICE_IDS) || libraryPreviewUrl(id, { emotional: false }));

  const toggle = (id) => {
    const el = audio.current;
    const src = clipFor(id);
    if (!el || !src) return;
    if (playing === src) {
      playToken.current += 1;
      el.pause();
      el.currentTime = 0;
      setPlaying(null);
      return;
    }
    const token = ++playToken.current;
    el.pause();
    el.src = src;
    el.currentTime = 0;
    setPlaying(src);
    const p = el.play();
    if (p && typeof p.catch === 'function') p.catch(() => { if (playToken.current === token) setPlaying(null); });
  };

  if (!open) {
    return (
      <button type="button" className="t-12 text-muted hover:text-ink underline underline-offset-2" onClick={() => setOpen(true)}>
        Browse all {VOICE_LIBRARY.length} voices
      </button>
    );
  }

  const select = (label, val, set, options) => (
    <label className="flex items-center gap-1.5 t-12 text-muted">
      <span>{label}</span>
      <select className="input h-8 t-12 py-0" value={val} onChange={(ev) => set(ev.target.value)}>
        <option value="">Any</option>
        {Object.entries(options).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </label>
  );

  return (
    <section className="space-y-2.5 min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="t-13 font-semibold text-ink">Voice library</h3>
        <p className="t-11 text-faint">{emotional ? 'Previews use the emotional voice' : 'Every preview says the same line'}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {select('Gender', gender, setGender, GENDERS)}
        {select('Accent', accent, setAccent, ACCENTS)}
        {select('Niche', niche, setNiche, Object.fromEntries(NICHE_IDS.map((n) => [n, NICHES[n]])))}
      </div>
      <audio ref={audio} onEnded={() => setPlaying(null)} className="hidden" />
      {list.length ? (
        <div role="radiogroup" aria-label="Voice library" className="grid sm:grid-cols-2 gap-2">
          {list.map((x) => {
            const selected = value === x.id;
            const src = clipFor(x.id);
            const isPlaying = Boolean(src) && playing === src;
            return (
              <div
                key={x.id}
                className="flex items-center gap-2 rounded-xl border pl-1 pr-2 py-1 min-w-0 transition-colors"
                style={selected ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : { borderColor: 'var(--line)' }}
              >
                {src ? (
                  <button type="button" className="icon-btn shrink-0" onClick={() => toggle(x.id)} aria-label={isPlaying ? `Stop ${x.name}` : `Play ${x.name}`}>
                    {isPlaying ? <Square size={11} fill="currentColor" /> : <Play size={12} />}
                  </button>
                ) : null}
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  data-kit="tile"
                  disabled={readOnly}
                  onClick={() => onChange(x.id)}
                  className="flex-1 min-w-0 text-left py-1.5 flex items-center gap-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block t-13 font-semibold text-ink truncate">{x.name} · {x.note}</span>
                    <span className="block t-11 text-faint truncate">
                      {GENDERS[x.gender]} · {ACCENTS[x.accent]} · {CHARACTERS[x.character]} · {x.niches.map((n) => NICHES[n]).join(', ')}
                    </span>
                  </span>
                  {selected ? <Check size={15} className="shrink-0" style={{ color: 'var(--accent)' }} /> : null}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="t-12 text-muted">No voice matches these filters.</p>
      )}
    </section>
  );
}
