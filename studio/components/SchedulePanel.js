'use client';
// #100 — per-channel production scheduling: doc days, short days, shorts
// source, gate cron and the live quota projection. Writes through
// /api/channels/schedule (owner/staff); the engine reads yt-mcp/cadence.json
// (overlay merged last in lib/brand-resolve.mjs).
//
// Round 2: rendered inside a Drawer via ChannelDrawers. `frame(body, footer)`
// lets the drawer own the layout (sticky Save in its footer); without a frame
// the panel falls back to a plain inline tile.
//
// Feedback r1 (items E + F): no help lines under headings; the autopilot
// start time is picked on the shared SlotTimeline (local clock, other
// channels' hours greyed, starred free hours that leave review time before
// the video goes public). The cron is computed under the hood and only shown
// inside "Advanced". Taken hours come from this route's GET `channels`
// (live registry, owner/staff only).
//
// Live fix wave B4: `saved` is the schedule as loaded / last saved. Save stays
// disabled until something differs from it (T3-18), the drawer asks before
// discarding the difference (T3-05, frame opts.dirty), and the saved start
// hour stays pickable on the timeline even when another channel shares it
// (T3-09).
import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/untitledui/base/buttons/button';
import { Chip, Progress } from '@/components/ui';
import { projection, DAY_NAMES } from '@/lib/schedule-projection';
import SlotTimeline from '@/components/SlotTimeline';
import { parseDailyCron, cronFromUtc, parseHHMM, takenHours, suggestStartHours, localClock, scheduleDirty } from '@/lib/slot-planner.mjs';

const TONE_INK = { error: 'var(--bad-ink)', warn: 'var(--warn-ink)', ok: 'var(--ok-ink)' };

function DayPicker({ label, days, onToggle }) {
  return (
    <fieldset className="min-w-0">
      <legend className="t-13 font-semibold text-ink mb-2">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {DAY_NAMES.map((d) => {
          const on = days.includes(d);
          return (
            <button
              key={d}
              type="button"
              data-kit="toggle"
              aria-pressed={on}
              onClick={() => onToggle(d)}
              className="min-w-[44px] h-8 px-2.5 rounded-md t-12 font-semibold border transition-colors"
              style={
                on
                  ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--accent-ink)' }
                  : { borderColor: 'var(--line-strong)', color: 'var(--muted)', background: 'var(--surface)' }
              }
            >
              {d}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

// empty = keep the current time; otherwise the daily UTC form the engine gates on
function parseGateCron(raw) {
  const s = String(raw || '').trim();
  if (!s) return { valid: true, at: null };
  const at = parseDailyCron(s);
  return { valid: Boolean(at), at };
}

function deriveModelParams(serverProj) {
  if (!serverProj) return {};
  const out = {};
  if (Number.isFinite(serverProj.budget)) out.dailyLimit = serverProj.budget + 100;
  if (Number.isFinite(serverProj.model?.insertCostUnits)) {
    out.perUpload = serverProj.model.insertCostUnits;
  } else if (serverProj.worstDayUploads > 0 && Number.isFinite(serverProj.worstDayUnits)) {
    out.perUpload = Math.round(serverProj.worstDayUnits / serverProj.worstDayUploads);
  }
  return out;
}

export default function SchedulePanel({ slug, frame }) {
  const [schedule, setSchedule] = useState(null);
  const [serverProj, setServerProj] = useState(null);
  const [gateCron, setGateCron] = useState('');
  const [modelWarnings, setModelWarnings] = useState([]);
  const [channels, setChannels] = useState([]); // every channel's times (live registry) → taken hours
  const [publish, setPublish] = useState([]); // this channel's "goes public" slots (UTC HH:MM)
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  // Admin-panel review #3: a failed load used to fall back to an EMPTY
  // schedule, and Save then wiped the channel's real days. Remember the
  // failure, show it, and keep Save disabled until a successful (re)load.
  const [loadError, setLoadError] = useState(null);
  const [saved, setSaved] = useState(null); // { docDays, shortDays, shortsSource, gateCron } as loaded/saved

  // state is only set when the request settles (never synchronously in the effect)
  const load = useCallback(() => {
    fetch(`/api/channels/schedule?slug=${encodeURIComponent(slug)}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        return d;
      })
      .then((d) => {
        const loaded = d.schedule || { docDays: [], shortDays: [], shortsSource: 'generated' };
        setLoadError(null);
        setSchedule(loaded);
        setSaved({ ...loaded, gateCron: d.gateCron || '' });
        setServerProj(d.projection || null);
        setGateCron(d.gateCron || '');
        setModelWarnings(d.projection?.warnings || []);
        setChannels(Array.isArray(d.channels) ? d.channels : []);
        setPublish(Array.isArray(d.publish?.slots) ? d.publish.slots : []);
      })
      .catch((e) => {
        setSchedule(null);
        setLoadError(String(e.message || e));
      });
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  const retry = () => {
    setLoadError(null);
    load();
  };

  const draft = schedule || { docDays: [], shortDays: [], shortsSource: 'generated' };
  const proj = projection({ ...draft, ...deriveModelParams(serverProj) });
  const cronState = parseGateCron(gateCron);
  const dirty = scheduleDirty(saved, { ...draft, gateCron });
  const savedAt = saved ? parseGateCron(saved.gateCron).at : null; // the channel's own saved start
  const offsetMin = -new Date().getTimezoneOffset();
  const taken = takenHours(channels, { exclude: slug, kind: 'start' });
  const publishAt = publish.map(parseHHMM).filter(Boolean);
  const suggestions = suggestStartHours({ publishHours: publishAt.map((p) => p.hour), takenHours: taken });
  // keep the channel's existing minute; only the hour changes
  const pickHour = (hour) => setGateCron(cronFromUtc(hour, cronState.at ? cronState.at.minute : 0));

  const toggleDay = (field) => (d) =>
    setSchedule((s) => ({
      ...s,
      [field]: (s?.[field] || []).includes(d) ? s[field].filter((x) => x !== d) : [...(s?.[field] || []), d],
    }));

  const save = async () => {
    if (loadError || !schedule) return;
    setSaving(true);
    setMsg(null);
    try {
      const payload = { slug, ...draft, ...(gateCron.trim() ? { gateCron: gateCron.trim() } : {}) };
      const r = await fetch('/api/channels/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) setMsg({ tone: 'error', text: j.error || 'save failed' });
      else {
        if (j.projection) setServerProj(j.projection);
        if (j.gateCron) setGateCron(j.gateCron);
        setSaved({ ...draft, gateCron: j.gateCron || gateCron });
        setMsg({ tone: 'ok', text: 'Saved — the next runs pick this up.' });
        const saveWarnings = [...new Set([...(j.projection?.warnings || []), ...(j.warnings || [])])];
        if (saveWarnings.length) setMsg({ tone: 'warn', text: saveWarnings.join(' ') });
      }
    } catch (e) {
      setMsg({ tone: 'error', text: String(e.message || e) });
    } finally {
      setSaving(false);
    }
  };

  const barColor = proj.tone === 'over' ? 'var(--bad)' : proj.tone === 'warn' ? 'var(--warn)' : 'var(--ok)';
  const loading = !schedule && !loadError;

  const body = (
    <div className="space-y-6 min-w-0">
      {loadError ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 t-13" style={{ color: 'var(--bad-ink)' }}>
          <AlertTriangle size={14} className="shrink-0" />
          <span className="min-w-0 flex-1">Couldn&apos;t load this channel&apos;s schedule ({loadError}) — saving is disabled so nothing gets overwritten.</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={retry}>
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      ) : null}
      {loading ? <p className="t-12 text-muted">Loading this channel&apos;s schedule…</p> : null}

      {/* quota first: it is what limits every choice below */}
      <section aria-label="Daily upload quota" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="t-13 font-semibold text-ink">Daily YouTube upload quota</span>
          <Chip tone={proj.tone === 'over' ? 'bad' : proj.tone === 'warn' ? 'warn' : 'ok'}>
            {proj.pct}% on the busiest day
          </Chip>
        </div>
        <Progress pct={proj.pct} color={barColor} />
        <p className="t-11 text-faint tnum">
          Busiest day: {proj.worstDayUploads} uploads ≈ {proj.worstDayUnits.toLocaleString()} of {proj.budget.toLocaleString()} units · ~{proj.weeklyUploads} uploads a week (shared pool)
        </p>
      </section>

      <DayPicker label="Long-form days" days={draft.docDays} onToggle={toggleDay('docDays')} />
      <DayPicker label="Shorts days" days={draft.shortDays} onToggle={toggleDay('shortDays')} />

      <fieldset className="min-w-0">
        <legend className="t-13 font-semibold text-ink mb-2">Where Shorts come from</legend>
        <div className="flex flex-wrap gap-1.5">
          {['generated', 'clips'].map((s) => {
            const on = draft.shortsSource === s;
            return (
              <button
                key={s}
                type="button"
                data-kit="toggle"
                aria-pressed={on}
                onClick={() => setSchedule((s0) => ({ ...s0, shortsSource: s }))}
                className="h-8 px-3 rounded-md t-12 font-semibold border transition-colors"
                style={on ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)', color: 'var(--ink)' } : { borderColor: 'var(--line-strong)', color: 'var(--muted)' }}
              >
                {s === 'clips' ? 'Clips from long videos' : 'Made fresh each day'}
              </button>
            );
          })}
        </div>
      </fieldset>

      <SlotTimeline
        label="Autopilot start time"
        value={cronState.at}
        onPick={pickHour}
        taken={taken}
        own={savedAt ? [savedAt.hour] : []}
        suggestions={schedule ? suggestions : []}
        loading={loading}
        disabled={!schedule}
        footer={
          <>
            {publishAt.length ? (
              <p className="t-12 text-muted">
                Goes public at {publishAt.map((p) => localClock(p.hour, p.minute, offsetMin)).join(', ')} your time. The start time doesn&apos;t change that.
              </p>
            ) : null}
            <details className="t-12">
              <summary className="cursor-pointer text-faint select-none">Advanced</summary>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label htmlFor={`gate-cron-${slug}`} className="t-11 text-faint">Schedule code (UTC)</label>
                <input
                  id={`gate-cron-${slug}`}
                  type="text"
                  value={gateCron}
                  onChange={(e) => setGateCron(e.target.value)}
                  placeholder="13 2 * * *"
                  aria-invalid={!cronState.valid}
                  className="input font-mono w-full sm:w-40"
                />
                {!cronState.valid ? (
                  <span className="t-12" style={{ color: 'var(--bad-ink)' }}>Use M H * * * (minute 0-59, hour 0-23)</span>
                ) : null}
              </div>
            </details>
          </>
        }
      />

      {modelWarnings.length ? (
        <div className="flex items-start gap-1.5 t-12" style={{ color: 'var(--warn-ink)' }}>
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span className="min-w-0">{modelWarnings.join(' ')}</span>
        </div>
      ) : null}

      {proj.blocked ? (
        <p className="t-12" style={{ color: 'var(--bad-ink)' }}>
          Over the daily upload limit. Remove a day before saving.
        </p>
      ) : null}
    </div>
  );

  const footer = (
    <>
      {msg ? (
        <p role="status" aria-live="polite" className="mr-auto min-w-0 flex-1 basis-full sm:basis-0 flex items-start gap-1.5 t-12" style={{ color: TONE_INK[msg.tone] }}>
          {msg.tone === 'ok' ? <CheckCircle2 size={13} className="mt-0.5 shrink-0" /> : <AlertTriangle size={13} className="mt-0.5 shrink-0" />}
          <span className="min-w-0">{msg.text}</span>
        </p>
      ) : null}
      <Button color="primary" onClick={save} isDisabled={saving || Boolean(loadError) || !schedule || proj.blocked || !cronState.valid || !dirty}>
        {saving ? 'Saving…' : 'Save schedule'}
      </Button>
    </>
  );

  if (frame) return frame(body, footer, { dirty });
  return (
    <div className="inset-tile p-4 mt-1 space-y-4">
      <div className="flex items-center gap-2 overline"><CalendarDays size={12} /> Production scheduling</div>
      {body}
      <div className="flex flex-wrap items-center justify-end gap-2">{footer}</div>
    </div>
  );
}
