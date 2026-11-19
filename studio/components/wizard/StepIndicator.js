'use client';
// Persistent wizard stepper. Desktop: a vertical list with names + state.
// Phones: a compact "Step 3 of 7" bar with a progress track and numbered
// dots. Locked steps can't be clicked; done/attention steps always can.
import { Check, AlertTriangle, Lock } from 'lucide-react';

const STATE_TEXT = { current: 'current step', done: 'complete', attention: 'needs attention', todo: 'not started', locked: 'locked until earlier steps are done' };

function Dot({ index, state }) {
  const base = 'flex items-center justify-center w-7 h-7 rounded-full shrink-0 t-11 font-bold border transition-colors';
  if (state === 'done') {
    return (
      <span className={base} style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--surface)' }}>
        <Check size={13} strokeWidth={3} />
      </span>
    );
  }
  if (state === 'attention') {
    return (
      <span className={base} style={{ borderColor: 'var(--warn)', color: 'var(--warn-ink)' }}>
        <AlertTriangle size={12} />
      </span>
    );
  }
  if (state === 'current') {
    return (
      <span className={base} style={{ borderColor: 'var(--accent)', color: 'var(--accent)', background: 'var(--accent-soft)' }}>
        {index + 1}
      </span>
    );
  }
  if (state === 'locked') {
    return (
      <span className={base} style={{ borderColor: 'var(--line)', color: 'var(--faint)' }}>
        <Lock size={11} />
      </span>
    );
  }
  return (
    <span className={base} style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>
      {index + 1}
    </span>
  );
}

export default function StepIndicator({ steps, states, current, onSelect }) {
  const pct = Math.round(((current + 1) / steps.length) * 100);
  return (
    <>
      {/* phones / tablets */}
      <div className="lg:hidden mb-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="t-13 font-semibold text-ink truncate min-w-0">
            Step {current + 1} of {steps.length} · {steps[current].label}
          </p>
          {current + 1 < steps.length ? <p className="t-11 text-faint shrink-0">Next: {steps[current + 1].label}</p> : null}
        </div>
        <div className="h-1.5 rounded-full mt-2 overflow-hidden" style={{ background: 'var(--surface-2)' }}>
          <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
        </div>
        <ol className="flex flex-wrap gap-1.5 mt-3" aria-label="Wizard steps">
          {steps.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onSelect(i)}
                disabled={states[i] === 'locked'}
                aria-current={i === current ? 'step' : undefined}
                aria-label={`Step ${i + 1}: ${s.label} — ${STATE_TEXT[states[i]]}`}
                data-kit="step-dot"
                className="rounded-full disabled:cursor-not-allowed"
              >
                <Dot index={i} state={states[i]} />
              </button>
            </li>
          ))}
        </ol>
      </div>

      {/* desktop */}
      <nav className="hidden lg:block" aria-label="Wizard steps">
        <ol className="space-y-1 sticky top-4">
          {steps.map((s, i) => {
            const st = states[i];
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onSelect(i)}
                  disabled={st === 'locked'}
                  aria-current={i === current ? 'step' : undefined}
                  data-kit="step"
                  className="w-full flex items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  style={i === current ? { background: 'var(--surface-2)' } : undefined}
                >
                  <Dot index={i} state={st} />
                  <span className="min-w-0">
                    <span className={`block t-13 font-semibold truncate ${st === 'locked' ? 'text-faint' : 'text-ink'}`}>
                      {s.label}
                      {s.optional ? <span className="t-11 font-normal text-faint"> · optional</span> : null}
                    </span>
                    <span className="block t-11 text-faint truncate">{st === 'attention' ? 'Needs attention' : s.hint}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
