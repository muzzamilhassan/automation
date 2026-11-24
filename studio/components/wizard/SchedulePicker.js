'use client';
// Step 5 — when videos go out. The owner picks hours on the shared
// SlotTimeline in THEIR local clock; the form keeps storing UTC "HH:MM"
// (what the profile route and the engine read — unchanged).
//
// Feedback r1 (item F): other channels' publish hours come from the live
// registry (GET /api/channels/registry, owner-only like this wizard) and are
// greyed "taken by …"; 3 starred hours come from lib/slot-planner.mjs — the
// audience the owner picks below (#112 presets), else the niche table. No
// per-hour analytics API exists yet, so none is claimed.
//
// Props stay compatible with channels/add/page.js. `slug`/`niche` are
// optional; without them the channel is read from the wizard URL
// (?edit= / ?connected=) and its niche from the registry row.
//
// Live fix wave B4: no stars or picks until the registry arrives (T4-13);
// "Add a short" lands on a free hour with the 1-hour gap (T4-09); zero shorts
// warn and block Next (T4-10 — stepIssues); an existing channel's saved hours
// stay pickable even when another channel shares them (T3-09, `editing`).
import { useEffect, useState } from 'react';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { AUDIENCES, suggestionFor } from '@/lib/audiences';
import { MAX_SLOTS, parseSlots, slotsToString, utcToLocal, formatClock, removeSlot, addSlot, shiftHHMM, stepIssues } from '@/lib/wizard-steps.mjs';
import SlotTimeline from '@/components/SlotTimeline';
import { channelTimes, takenHours, suggestHours, parseHHMM, toHHMM, freeSlotTime } from '@/lib/slot-planner.mjs';
import { UPLOAD_DAYS, dayList, toggleDay, weekdayFor } from '@/lib/wizard-days.mjs';
import { Notice } from './fields';

// a new slot starts 4 hours after the last one (two shorts at the same
// minute would collide), or at the usual evening slot when there are none
function nextSlotDefault(rows) {
  const last = [...rows].reverse().find((r) => r.utc)?.utc;
  return last ? shiftHHMM(last, 240).time : '22:35';
}

// One row of day toggles (several can be on).
function DayRow({ label, value, onChange, disabled }) {
  const on = dayList(value);
  return (
    <fieldset className="min-w-0">
      <legend className="t-13 font-semibold text-ink mb-2">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {UPLOAD_DAYS.map((d) => {
          const active = on.includes(d);
          return (
            <button
              key={d}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onChange(toggleDay(value, d))}
              data-kit="chip"
              className="w-14 rounded-xl border py-2 t-13 font-semibold transition-colors disabled:opacity-50"
              style={active ? { borderColor: 'var(--accent)', color: 'var(--accent)', background: 'var(--accent-soft)' } : { borderColor: 'var(--line)', color: 'var(--muted)' }}
            >
              {d}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function wizardSlug(slug) {
  if (slug) return slug;
  if (typeof window === 'undefined') return '';
  const q = new URLSearchParams(window.location.search);
  return q.get('edit') || q.get('connected') || '';
}

// Upload days (docs/qa/wizard-upload-days-qa.md): `docDays`/`shortDays` are the
// channel's saved schedule as comma strings; `daysStatus` = loading | ready | error.
export default function SchedulePicker({ slots, docDay, docDays = '', shortDays = '', daysStatus = 'loading', onSlots, onDocDay, onDocDays, onShortDays, onRetryDays, audience, onAudience, slug, niche, editing = false }) {
  const offsetMin = -new Date().getTimezoneOffset();
  const rows = parseSlots(slots);
  const issues = stepIssues('schedule', { form: { slots, docDay, docDays, shortDays }, daysReady: daysStatus === 'ready' });
  const [active, setActive] = useState(0);
  const [times, setTimes] = useState([]);
  const [ownSlug, setOwnSlug] = useState('');
  const [loaded, setLoaded] = useState(false); // registry arrived (or failed) — until then no stars

  // every channel's times, live from the registry (state set only when the request settles)
  useEffect(() => {
    let alive = true;
    const own = wizardSlug(slug);
    fetch('/api/channels/registry')
      .then((r) => (r.ok ? r.json() : { channels: [] }))
      .then((d) => {
        if (!alive) return;
        setTimes(channelTimes(d.channels || []));
        setOwnSlug(own);
        setLoaded(true);
      })
      .catch(() => {
        if (alive) setLoaded(true);
      });
    return () => { alive = false; };
  }, [slug]);

  const idx = Math.min(active, Math.max(rows.length - 1, 0));
  const current = rows[idx]?.utc ? parseHHMM(rows[idx].utc) : null;
  const taken = takenHours(times, { exclude: ownSlug, kind: 'publish' });
  const preset = suggestionFor(audience);
  const channelNiche = niche || times.find((t) => t.slug === ownSlug)?.niche || '';
  const suggestions = suggestHours({ niche: channelNiche, takenHours: taken, preset });
  // the channel's saved publish hours (registry) — a new channel has none yet
  const ownHours = editing ? (times.find((t) => t.slug === ownSlug)?.publish || []).map(parseHHMM).filter(Boolean).map((p) => p.hour) : [];

  // T4-09: a new short goes to the nearest free hour (other channels + this
  // channel's other shorts), keeping the 4-hours-later default when it is free
  const addShort = () => {
    const prefer = nextSlotDefault(rows);
    const free = freeSlotTime({ prefer, taken, own: rows.map((r) => r.utc).filter(Boolean) });
    onSlots(addSlot(slots, free || prefer));
    setActive(rows.length);
  };

  // the picked hour replaces the selected short's hour (its minute is kept)
  const pick = (hour) => {
    const list = rows.map((r) => r.utc ?? r.raw);
    const next = toHHMM(hour, current ? current.minute : 0);
    if (!list.length) {
      onSlots(addSlot(slots, next));
      return;
    }
    list[idx] = next;
    onSlots(slotsToString(list));
  };

  return (
    <div className="space-y-6">
      <section>
        <h3 className="t-13 font-semibold text-ink mb-2">Who watches?</h3>
        <div role="radiogroup" aria-label="Main audience" className="flex flex-wrap gap-1.5">
          {AUDIENCES.map((a) => {
            const on = audience === a.id;
            return (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onAudience(on ? '' : a.id)}
                data-kit="chip"
                className="rounded-xl border px-3 py-1.5 t-12 font-semibold transition-colors"
                style={on ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)', color: 'var(--ink)' } : { borderColor: 'var(--line)', color: 'var(--muted)' }}
              >
                {a.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* daily shorts: pick which short, then its hour on the timeline */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Daily shorts">
          {rows.map((r, i) => {
            const l = r.utc ? utcToLocal(r.utc, offsetMin) : null;
            const on = i === idx;
            return (
              <span key={i} className="inline-flex items-center rounded-xl border" style={on ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : { borderColor: 'var(--line)' }}>
                <button type="button" data-kit="chip" aria-pressed={on} onClick={() => setActive(i)} className="pl-3 pr-1.5 py-1.5 t-12 font-semibold text-ink">
                  Short {i + 1} · {l ? formatClock(l.time) : <span style={{ color: 'var(--bad-ink)' }}>unreadable “{r.raw}”</span>}
                </button>
                <button type="button" className="icon-btn" onClick={() => { onSlots(removeSlot(slots, i)); setActive(0); }} aria-label={`Remove short time ${i + 1}`}>
                  <Trash2 size={13} />
                </button>
              </span>
            );
          })}
          {rows.length < MAX_SLOTS ? (
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={addShort}
            >
              <Plus size={13} /> Add a short
            </button>
          ) : null}
        </div>
        {!rows.length ? (
          <p className="t-12" style={{ color: 'var(--warn-ink)' }} role="status">
            At least one daily short is needed. Pick an hour below. For long videos only, turn off Shorts days in the channel&apos;s Schedule after saving.
          </p>
        ) : null}
        <SlotTimeline
          label={rows.length > 1 ? `Short ${idx + 1} goes public at` : 'Short goes public at'}
          value={current}
          onPick={pick}
          taken={taken}
          suggestions={suggestions}
          own={ownHours}
          loading={!loaded}
        />
      </section>

      {/* the saved schedule's days — the same ones the Schedule drawer edits */}
      <section className="space-y-5" aria-label="Upload days">
        <DayRow label="Shorts days" value={shortDays} onChange={onShortDays} disabled={daysStatus !== 'ready'} />
        <DayRow
          label="Long video days"
          value={docDays}
          onChange={(v) => { onDocDays(v); onDocDay(weekdayFor(v, docDay)); }}
          disabled={daysStatus !== 'ready'}
        />
        {daysStatus === 'error' ? (
          <Notice tone="warn" title="Couldn't load the upload days" action={<button type="button" className="btn btn-sm btn-outline" onClick={onRetryDays}><RefreshCw size={13} /> Retry</button>}>
            Saving keeps the days the channel already has.
          </Notice>
        ) : null}
      </section>

      {issues.length ? (
        <Notice tone="warn" title="Fix before saving">
          <ul className="list-disc ml-4">{issues.map((m) => <li key={m}>{m}</li>)}</ul>
        </Notice>
      ) : null}
    </div>
  );
}
