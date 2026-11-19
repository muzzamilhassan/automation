'use client';
// Step 5 — when videos go out. The owner edits times in THEIR local clock;
// the form keeps storing UTC "HH:MM" (what the scheduler reads), shown
// underneath every time. #112 audience presets are one explicit click away.
// No raw schedule expressions, no timezone maths for the owner.
import { Plus, Trash2, Clock } from 'lucide-react';
import { AUDIENCES, suggestionFor, suggestionText } from '@/lib/audiences';
import { DOC_DAYS, MAX_SLOTS, parseSlots, utcToLocal, formatClock, formatOffset, setSlotFromLocal, removeSlot, addSlot, shiftHHMM, stepIssues } from '@/lib/wizard-steps.mjs';
import { Notice } from './fields';

// a new slot starts 4 hours after the last one (two shorts at the same
// minute would collide), or at the usual evening slot when there are none
function nextSlotDefault(rows) {
  const last = [...rows].reverse().find((r) => r.utc)?.utc;
  return last ? shiftHHMM(last, 240).time : '22:35';
}

function localZone() {
  const offsetMin = -new Date().getTimezoneOffset();
  let name = '';
  try { name = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { name = ''; }
  return { offsetMin, name };
}

export default function SchedulePicker({ slots, docDay, onSlots, onDocDay, audience, onAudience }) {
  const { offsetMin, name } = localZone();
  const rows = parseSlots(slots);
  const issues = stepIssues('schedule', { form: { slots, docDay } });
  const preset = suggestionFor(audience);
  const zoneLabel = `${name ? `${name.replace(/_/g, ' ')}, ` : ''}${formatOffset(offsetMin)}`;

  return (
    <div className="space-y-6">
      {/* audience presets */}
      <section>
        <h3 className="t-13 font-semibold text-ink mb-1">Who watches?</h3>
        <p className="t-11 text-faint mb-2.5">Pick your main audience for a suggested evening time. General starting points — nothing changes until you press “Use this time”.</p>
        <div role="radiogroup" aria-label="Main audience" className="flex flex-wrap gap-1.5">
          {AUDIENCES.map((a) => {
            const on = audience === a.id;
            const l = utcToLocal(a.utc, offsetMin);
            return (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onAudience(on ? '' : a.id)}
                data-kit="tile"
                className="rounded-xl border px-3 py-1.5 text-left transition-colors"
                style={on ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : { borderColor: 'var(--line)' }}
              >
                <span className="block t-12 font-semibold text-ink">{a.label}</span>
                <span className="block t-11 text-faint">{formatClock(l.time)} your time</span>
              </button>
            );
          })}
        </div>
        {preset ? (
          <div className="mt-3 rounded-xl border p-3 flex flex-wrap items-center justify-between gap-2" style={{ borderColor: 'var(--accent)', background: 'var(--surface-2)' }}>
            <div className="min-w-0">
              <p className="t-12 text-ink">{suggestionText(audience)}</p>
              <p className="t-11 text-faint mt-0.5">
                That&apos;s {formatClock(utcToLocal(preset.utc, offsetMin).time)} your time. Using it replaces your daily short time{rows.length > 1 ? 's' : ''} below.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-primary shrink-0"
              onClick={() => {
                const s = suggestionFor(audience);
                if (s) onSlots(s.utc);
              }}
            >
              Use this time
            </button>
          </div>
        ) : null}
      </section>

      {/* daily shorts */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
          <h3 className="t-13 font-semibold text-ink">Daily short</h3>
          <p className="t-11 text-faint inline-flex items-center gap-1"><Clock size={11} /> Times in your zone: {zoneLabel}</p>
        </div>
        <p className="t-11 text-faint mb-2.5">One short is published at each time, every day (Sunday off). Evening slots usually do best.</p>
        {rows.length ? (
          <ul className="space-y-2">
            {rows.map((r, i) => {
              const l = r.utc ? utcToLocal(r.utc, offsetMin) : null;
              return (
                <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line px-3 py-2">
                  {l ? (
                    <>
                      <input
                        type="time"
                        className="input w-36"
                        value={l.time}
                        onChange={(e) => e.target.value && onSlots(setSlotFromLocal(slots, i, e.target.value, offsetMin))}
                        aria-label={`Short ${i + 1} time, your local time`}
                      />
                      <span className="t-12 text-muted">{formatClock(l.time)}{l.dayShift ? ` · ${l.dayShift > 0 ? 'next' : 'previous'} day vs UTC` : ''}</span>
                      <span className="t-11 text-faint font-mono">= {r.utc} UTC</span>
                    </>
                  ) : (
                    <span className="t-12" style={{ color: 'var(--bad-ink)' }}>Saved time “{r.raw}” can&apos;t be read — remove it and add a new one.</span>
                  )}
                  <button type="button" className="icon-btn ml-auto" onClick={() => onSlots(removeSlot(slots, i))} aria-label={`Remove short time ${i + 1}`}>
                    <Trash2 size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="t-12 text-faint rounded-xl border border-dashed border-line px-3 py-2.5">No daily short time is set — this channel keeps its existing gate schedule.</p>
        )}
        {rows.length < MAX_SLOTS ? (
          <button type="button" className="btn btn-sm btn-outline mt-2.5" onClick={() => onSlots(addSlot(slots, nextSlotDefault(rows)))}>
            <Plus size={13} /> Add a short time
          </button>
        ) : (
          <p className="t-11 text-faint mt-2">That&apos;s the maximum of {MAX_SLOTS} short times.</p>
        )}
      </section>

      {/* weekly long episode */}
      <section>
        <h3 className="t-13 font-semibold text-ink mb-1">Weekly long episode</h3>
        <p className="t-11 text-faint mb-2.5">The day the 10-minute episode goes out each week.</p>
        <div role="radiogroup" aria-label="Weekly episode day" className="flex flex-wrap gap-1.5">
          {DOC_DAYS.map((d) => {
            const on = docDay === d;
            return (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onDocDay(d)}
                data-kit="chip"
                className="w-14 rounded-xl border py-2 t-13 font-semibold transition-colors"
                style={on ? { borderColor: 'var(--accent)', color: 'var(--accent)', background: 'var(--accent-soft)' } : { borderColor: 'var(--line)', color: 'var(--muted)' }}
              >
                {d}
              </button>
            );
          })}
        </div>
      </section>

      {issues.length ? (
        <Notice tone="warn" title="Fix before saving">
          <ul className="list-disc ml-4">{issues.map((m) => <li key={m}>{m}</li>)}</ul>
        </Notice>
      ) : null}
    </div>
  );
}
