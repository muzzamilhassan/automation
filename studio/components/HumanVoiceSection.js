'use client';
// Human voice as a panel setting (docs/qa/human-voice-panel-qa.md) — the one
// Voice section shared by the Voice drawer (VoicePanel) and the Edit profile
// wizard's Look & sound step. Controlled: value = { human, mood, speed }
// (lib/human-voice.mjs), onChange gets the whole next value.
//
// Preview: Kokoro can't run on Vercel, so every picker voice x mood has a
// pre-rendered clip (scripts/generate-human-voice-previews.py — the real
// human-pacing path at speed 1.0). The slider speed is applied as the audio
// playbackRate, an approximation. A voice with no clip gets no preview —
// never a stand-in voice.
import { useEffect, useRef, useState } from 'react';
import { Play, Square } from 'lucide-react';
import { Switch } from '@/components/ui';
import { VOICES } from '@/lib/voices';
import {
  HUMAN_MOODS, MOOD_LABEL, SPEED_MIN, SPEED_MAX, SPEED_STEP, HUMAN_PACING_HINT,
  clampSpeed, speedWord, previewUrl, isKokoroVoice,
} from '@/lib/human-voice.mjs';

const PREVIEW_VOICE_IDS = VOICES.map((v) => v.id);

export default function HumanVoiceSection({ voice, value, onChange, readOnly = false }) {
  const audio = useRef(null);
  const src = previewUrl(voice, value.mood, PREVIEW_VOICE_IDS);
  const kokoro = isKokoroVoice(voice);
  // the clip that is playing; a new voice or mood is a different clip, so the
  // button reads "Preview" again without any state change
  const [playingSrc, setPlayingSrc] = useState(null);
  const playing = Boolean(src) && playingSrc === src;

  // closing the drawer / leaving the step stops the preview mid-sentence
  useEffect(() => () => audio.current?.pause(), []);

  // a new mood or voice = a different clip: stop the old one
  useEffect(() => {
    audio.current?.pause();
  }, [src]);

  const set = (patch) => onChange({ ...value, ...patch });

  const togglePreview = () => {
    const el = audio.current;
    if (!el || !src) return;
    if (playing) {
      el.pause();
      el.currentTime = 0;
      setPlayingSrc(null);
      return;
    }
    if (!el.src.endsWith(src)) el.src = src;
    el.currentTime = 0;
    el.playbackRate = value.speed;
    setPlayingSrc(src);
    const p = el.play();
    if (p && typeof p.catch === 'function') p.catch(() => setPlayingSrc((cur) => (cur === src ? null : cur)));
  };

  // the slider moves while it plays: follow it
  useEffect(() => {
    if (audio.current) audio.current.playbackRate = value.speed;
  }, [value.speed]);

  return (
    <section className="space-y-4 min-w-0">
      <fieldset disabled={readOnly} className="space-y-4 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="t-13 font-semibold text-ink">Human pacing</h3>
            <p className="t-12 text-muted">{HUMAN_PACING_HINT}</p>
            {!value.human ? <p className="t-11 text-faint mt-0.5">Off: the normal voice, at the mood and speed below.</p> : null}
            {value.human && !kokoro ? <p className="t-11 mt-0.5" style={{ color: 'var(--warn-ink)' }}>Works with the voices above only.</p> : null}
          </div>
          <Switch checked={value.human} onChange={(on) => set({ human: on })} label="Human pacing" />
        </div>

        <div>
          <p className="t-12 font-semibold text-ink mb-1.5">Mood</p>
          <div role="radiogroup" aria-label="Mood" className="flex flex-wrap gap-1.5">
            {HUMAN_MOODS.map((m) => {
              const on = value.mood === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-kit="tile"
                  onClick={() => set({ mood: m })}
                  className="px-3 h-8 rounded-lg border t-12 font-semibold transition-colors"
                  style={on ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)', color: 'var(--ink)' } : { borderColor: 'var(--line)', color: 'var(--muted)' }}
                >
                  {MOOD_LABEL[m]}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <label htmlFor="human-voice-speed" className="t-12 font-semibold text-ink">Speed</label>
            <span className="t-11 text-faint tabular-nums">{speedWord(value.speed)} · {value.speed.toFixed(2)}×</span>
          </div>
          <input
            id="human-voice-speed"
            type="range"
            className="w-full"
            min={SPEED_MIN}
            max={SPEED_MAX}
            step={SPEED_STEP}
            value={value.speed}
            onChange={(e) => set({ speed: clampSpeed(Number(e.target.value)) })}
          />
          <div className="flex justify-between t-11 text-faint" aria-hidden="true">
            <span>Slower</span>
            <span>Normal</span>
            <span>Faster</span>
          </div>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <audio ref={audio} onEnded={() => setPlayingSrc(null)} onPause={() => setPlayingSrc(null)} className="hidden" />
        {src ? (
          <button type="button" className="btn btn-outline btn-sm" onClick={togglePreview} aria-label={playing ? 'Stop the preview' : `Preview ${MOOD_LABEL[value.mood]} mood`}>
            {playing ? <Square size={11} fill="currentColor" /> : <Play size={12} />} {playing ? 'Stop' : 'Preview'}
          </button>
        ) : (
          <span className="t-11 text-faint">No preview for this voice.</span>
        )}
        {src ? <span className="t-11 text-faint">A short sample in this voice and mood.</span> : null}
      </div>
    </section>
  );
}
