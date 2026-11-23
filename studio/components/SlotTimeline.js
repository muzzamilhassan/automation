'use client';
// Feedback r1 (item F) — THE schedule picker. One 24-hour timeline in the
// viewer's own clock: other channels' hours are greyed "taken by …", up to 3
// starred suggestions carry a one-line honest reason, and a click picks the
// hour. Used by the Schedule drawer (autopilot start) and the Add Channel
// wizard (when a short goes public). All maths lives in lib/slot-planner.mjs;
// this file only draws. Values are UTC { hour, minute } under the hood.
//
// Live fix wave B4:
//   own      the channel's SAVED hour(s) — always pickable, even when another
//            channel shares the hour (T3-09); tagged "saved" / "shared"
//   loading  the registry has not arrived — no stars, no suggestions, no
//            picks, so a taken hour is never starred (T4-13)
//   legend   "Taken:" sorted by your clock, real minutes (T4-20, T3-21)
//   tags     short ("shared" / "taken" / "saved") so cells never truncate (T3-25)
import { Clock, Star } from 'lucide-react';
import { timelineHours, zoneLabel, localClock, timelineCell, takenLegend } from '@/lib/slot-planner.mjs';

function viewerZone() {
  const offsetMin = -new Date().getTimezoneOffset();
  let name = '';
  try { name = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { name = ''; }
  return { offsetMin, name };
}

export default function SlotTimeline({ label, value, onPick, taken = [], suggestions = [], own = [], loading = false, disabled = false, footer = null }) {
  const { offsetMin, name } = viewerZone();
  const cells = timelineHours(offsetMin);
  const takenBy = new Map();
  for (const t of taken) takenBy.set(t.hour, [...(takenBy.get(t.hour) || []), t.label]);
  const starred = new Map(suggestions.map((s) => [s.hour, s]));
  const ownHours = new Set((Array.isArray(own) ? own : [own]).filter((h) => Number.isInteger(h)));
  const minute = value?.minute ?? 0;
  const legend = takenLegend(taken, offsetMin);

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        {label ? <h3 className="t-13 font-semibold text-ink">{label}</h3> : null}
        <span className="t-11 text-faint inline-flex items-center gap-1"><Clock size={11} /> {zoneLabel(name)}</span>
      </div>

      {loading ? <p className="t-12 text-muted" role="status">Loading times…</p> : null}

      {!loading && suggestions.length ? (
        <ul className="space-y-1.5" aria-label="Suggested times">
          {suggestions.map((s) => {
            const on = value?.hour === s.hour;
            return (
              <li key={s.hour}>
                <button
                  type="button"
                  disabled={disabled}
                  aria-pressed={on}
                  onClick={() => onPick(s.hour)}
                  data-kit="tile"
                  className="w-full text-left rounded-lg border px-3 py-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 transition-colors min-w-0"
                  style={on ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : { borderColor: 'var(--line)' }}
                >
                  <span className="t-13 font-semibold text-ink tnum">{localClock(s.hour, minute, offsetMin)}</span>
                  <span className="t-11 text-muted min-w-0 inline-flex items-center gap-1">
                    <Star size={12} aria-hidden fill="currentColor" className="shrink-0" style={{ color: 'var(--warn-ink)' }} />
                    {s.reason}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div role="group" aria-label={label || 'Pick an hour'} className="grid grid-cols-4 sm:grid-cols-6 gap-1" aria-busy={loading || undefined}>
        {cells.map((c) => {
          const selected = value?.hour === c.hour;
          const owners = takenBy.get(c.hour);
          const mine = ownHours.has(c.hour);
          const cell = timelineCell({ owners, selected, own: mine, star: starred.get(c.hour), loading });
          const star = cell.star ? starred.get(c.hour) : null;
          const title = owners ? `taken by ${owners.join(', ')}` : star ? star.reason : `Pick ${c.label}`;
          return (
            <button
              key={c.hour}
              type="button"
              aria-pressed={selected}
              aria-label={`${c.label}${selected ? ', picked' : ''}${mine ? ', your saved time' : ''}${owners ? `, taken by ${owners.join(', ')}` : ''}${star ? ', suggested' : ''}`}
              title={title}
              disabled={disabled || cell.blocked}
              onClick={() => onPick(c.hour)}
              data-kit="tile"
              className="min-h-[44px] rounded-md border px-1 py-1 flex flex-col items-center justify-center leading-tight transition-colors min-w-0 disabled:cursor-not-allowed"
              style={
                selected
                  ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--accent-ink)' }
                  : cell.strike
                    ? { background: 'var(--surface-2)', borderColor: 'var(--line)', color: 'var(--faint)' }
                    : mine
                      ? { borderColor: 'var(--accent)', borderStyle: 'dashed', color: 'var(--ink)' }
                      : star
                        ? { borderColor: 'var(--accent)', color: 'var(--ink)' }
                        : { borderColor: 'var(--line)', color: 'var(--muted)' }
              }
            >
              <span className={`t-12 font-semibold tnum ${cell.strike ? 'line-through' : ''}`}>{c.label}</span>
              {cell.tag ? (
                <span className="t-10">{cell.tag}</span>
              ) : star ? (
                <Star size={10} aria-hidden fill="currentColor" style={{ color: 'var(--warn-ink)' }} />
              ) : null}
            </button>
          );
        })}
      </div>

      {legend.length ? <p className="t-11 text-faint">Taken: {legend.join(' · ')}</p> : null}
      {footer}
    </div>
  );
}
