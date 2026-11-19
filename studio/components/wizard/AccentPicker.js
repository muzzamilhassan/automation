'use client';
// Step 3c — brand accent colour: a few starting swatches, the system colour
// picker, and a hex field. Only a valid #RRGGBB reaches the form.
import { useState } from 'react';
import { Check } from 'lucide-react';

// generic starting points (not channel data — any colour is allowed)
const SWATCHES = ['#38BDF8', '#E8C15A', '#3DDC97', '#F4766F', '#A78BFA', '#F97316', '#C1272D', '#5EEAD4'];
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export default function AccentPicker({ value, onChange }) {
  const [draft, setDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  // keep the text box in sync when the value changes from outside (swatch, AI apply, prefill)
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value);
  }
  const valid = HEX_RE.test(draft);
  return (
    <section>
      <h3 className="t-13 font-semibold text-ink mb-1">Accent colour</h3>
      <p className="t-11 text-faint mb-2.5">Used for captions, highlights and thumbnail accents.</p>
      <div className="flex flex-wrap items-center gap-2">
        {SWATCHES.map((c) => {
          const on = value.toLowerCase() === c.toLowerCase();
          return (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              aria-label={`Use ${c}`}
              aria-pressed={on}
              data-kit="swatch"
              className="w-8 h-8 rounded-full border-2 flex items-center justify-center"
              style={{ background: c, borderColor: on ? 'var(--ink)' : 'transparent' }}
            >
              {on ? <Check size={14} strokeWidth={3} color="#0b0f14" /> : null}
            </button>
          );
        })}
        <label className="relative w-8 h-8 rounded-full border border-dashed border-line overflow-hidden cursor-pointer" title="Pick any colour">
          <input type="color" value={HEX_RE.test(value) ? value : '#38BDF8'} onChange={(e) => onChange(e.target.value.toUpperCase())} className="absolute inset-0 opacity-0 cursor-pointer" aria-label="Pick any colour" />
          <span className="absolute inset-0 flex items-center justify-center t-14 text-muted pointer-events-none">+</span>
        </label>
        <input
          className="input font-mono t-12 w-28"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (HEX_RE.test(e.target.value)) onChange(e.target.value.toUpperCase());
          }}
          aria-label="Accent colour hex code"
          aria-invalid={!valid}
        />
      </div>
      {!valid ? <p className="t-11 mt-1.5" style={{ color: 'var(--bad-ink)' }}>Use a colour code like #38BDF8.</p> : null}
    </section>
  );
}
