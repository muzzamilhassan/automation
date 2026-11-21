'use client';
// One "goes public at" time (2026-11-21, owner-approved: the Schedule drawer
// edits the Shorts and long-video go-public times). The owner picks the time
// in THEIR clock; the value stays UTC 'HH:MM' — what the engine reads
// (kit.slots / kit.longSlot). The UTC time is always shown beside it.
// Clock maths: lib/wizard-steps.mjs (the same helpers the setup wizard uses).
import { Trash2 } from 'lucide-react';
import { utcToLocal, localToUtc } from '@/lib/wizard-steps.mjs';

export default function PublishTimeInput({ id, label, value, onChange, onRemove = null, disabled = false }) {
  const offsetMin = -new Date().getTimezoneOffset();
  const local = value ? utcToLocal(value, offsetMin) : null;
  return (
    <div className="flex flex-wrap items-center gap-2 min-w-0">
      <label htmlFor={id} className="sr-only">{label} (your time)</label>
      <input
        id={id}
        type="time"
        className="input w-36 tnum"
        value={local ? local.time : ''}
        disabled={disabled}
        onChange={(e) => {
          const utc = e.target.value ? localToUtc(e.target.value, offsetMin) : null;
          onChange(utc ? utc.time : '');
        }}
      />
      <span className="t-12 text-muted tnum">{value && local ? `your time · ${value} UTC` : 'not set'}</span>
      {onRemove ? (
        <button type="button" className="icon-btn" onClick={onRemove} disabled={disabled} aria-label={`Remove ${label}`}>
          <Trash2 size={13} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
