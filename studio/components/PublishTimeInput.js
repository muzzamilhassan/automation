'use client';
// One "goes public at" time (2026-11-21, owner-approved: the Schedule drawer
// edits the Shorts and long-video go-public times). The owner picks the time
// in THEIR clock; the value stays UTC 'HH:MM' — what the engine reads
// (kit.slots / kit.longSlot). The UTC time is always shown beside it.
// Clock maths: lib/wizard-steps.mjs (the same helpers the setup wizard uses).
//
// 2026-11-25 (owner: "manually write also"): a plain text box. The browser's
// own time box stayed empty unless the click landed on its hour part. What was
// typed is read on Enter or when the box is left (lib/wizard-times.mjs
// parseClock); an unreadable text is named and never changes the saved time.
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { utcToLocal, localToUtc, formatClock } from '@/lib/wizard-steps.mjs';
import { parseClock } from '@/lib/wizard-times.mjs';

export default function PublishTimeInput({ id, label, value, onChange, onRemove = null, disabled = false }) {
  const offsetMin = -new Date().getTimezoneOffset();
  const local = value ? utcToLocal(value, offsetMin) : null;
  const [draft, setDraft] = useState(null); // text being typed; null = show the value
  const [bad, setBad] = useState(false);
  const shown = draft ?? (local ? formatClock(local.time) : '');

  const commit = () => {
    if (draft === null) return;
    const text = draft.trim();
    const at = text ? parseClock(text) : null;
    if (text && !at) {
      setBad(true);
      return;
    }
    setBad(false);
    setDraft(null);
    const utc = at ? localToUtc(at, offsetMin) : null;
    onChange(utc ? utc.time : '');
  };

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <label htmlFor={id} className="sr-only">{label} (your time)</label>
        <input
          id={id}
          type="text"
          autoComplete="off"
          className="input w-36 tnum"
          placeholder="10:07 pm"
          value={shown}
          disabled={disabled}
          aria-invalid={bad}
          aria-describedby={bad ? `${id}-bad` : undefined}
          onChange={(e) => {
            const text = e.target.value;
            setDraft(text);
            setBad(false);
            // a complete time counts at once ("10:07 pm", "22:07"), so a Save
            // button that waits for a change is ready before the box is left
            const at = /(?:[ap]\.?m\.?|^\s*\d{2}:\d{2})\s*$/i.test(text) ? parseClock(text) : null;
            const utc = at ? localToUtc(at, offsetMin) : null;
            if (utc && utc.time !== value) onChange(utc.time);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape' && draft !== null) { e.stopPropagation(); setDraft(null); setBad(false); }
          }}
        />
        <span className="t-12 text-muted tnum">{value && local ? `your time · ${value} UTC` : 'not set'}</span>
        {onRemove ? (
          <button type="button" className="icon-btn" onClick={onRemove} disabled={disabled} aria-label={`Remove ${label}`}>
            <Trash2 size={13} aria-hidden />
          </button>
        ) : null}
      </div>
      {bad ? <p id={`${id}-bad`} className="t-12 mt-1" style={{ color: 'var(--bad-ink)' }} role="alert">Write it like 10:07 pm or 22:07.</p> : null}
    </div>
  );
}
