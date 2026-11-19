'use client';
// #100 — per-channel production scheduling: doc days, short days, shorts
// source, gate cron and the live quota projection. Writes through
// /api/channels/schedule (owner/staff); the engine reads yt-mcp/cadence.json
// (overlay merged last in lib/brand-resolve.mjs).
//
// Round 2: rendered inside a Drawer via ChannelDrawers. `frame(body, footer)`
// lets the drawer own the layout (sticky Save in its footer); without a frame
// the panel falls back to a plain inline tile.
import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/untitledui/base/buttons/button';
import { Chip, Progress } from '@/components/ui';
import { projection, DAY_NAMES } from '@/lib/schedule-projection';

const TONE_INK = { error: 'var(--bad-ink)', warn: 'var(--warn-ink)', ok: 'var(--ok-ink)' };

function DayPicker({ label, hint, days, onToggle }) {
  return (
    <fieldset className="min-w-0">
      <legend className="t-13 font-semibold text-ink">{label}</legend>
      {hint ? <p className="t-11 text-faint mt-0.5 mb-2">{hint}</p> : null}
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

const DAILY_CRON_RE = /^(\d{1,2}) (\d{1,2}) \* \* \*$/;
function parseGateCron(raw) {
  const s = String(raw || '').trim();
  if (!s) return { valid: true, label: '' };
  const m = DAILY_CRON_RE.exec(s);
  if (!m) return { valid: false, label: '' };
  const min = Number(m[1]), hr = Number(m[2]);
  if (min > 59 || hr > 23) return { valid: false, label: '' };
  return { valid: true, label: `${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')} UTC` };
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
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  // Admin-panel review #3: a failed load used to fall back to an EMPTY
  // schedule, and Save then wiped the channel's real days. Remember the
  // failure, show it, and keep Save disabled until a successful (re)load.
  const [loadError, setLoadError] = useState(null);

  // state is only set when the request settles (never synchronously in the effect)
  const load = useCallback(() => {
    fetch(`/api/channels/schedule?slug=${encodeURIComponent(slug)}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        return d;
      })
      .then((d) => {
        setLoadError(null);
        setSchedule(d.schedule || { docDays: [], shortDays: [], shortsSource: 'generated' });
        setServerProj(d.projection || null);
        setGateCron(d.gateCron || '');
        setModelWarnings(d.projection?.warnings || []);
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

      <DayPicker label="Long-form days" hint="Days a full-length video is made." days={draft.docDays} onToggle={toggleDay('docDays')} />
      <DayPicker label="Shorts days" hint="Days Shorts are posted." days={draft.shortDays} onToggle={toggleDay('shortDays')} />

      <fieldset className="min-w-0">
        <legend className="t-13 font-semibold text-ink">Where Shorts come from</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
          {['generated', 'clips'].map((s) => {
            const on = draft.shortsSource === s;
            return (
              <button
                key={s}
                type="button"
                data-kit="toggle"
                aria-pressed={on}
                onClick={() => setSchedule((s0) => ({ ...s0, shortsSource: s }))}
                className="text-left rounded-lg border p-3 transition-colors min-w-0"
                style={on ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : { borderColor: 'var(--line-strong)' }}
              >
                <span className="block t-13 font-semibold text-ink">{s === 'clips' ? 'Clips from long-forms' : 'Made fresh each day'}</span>
                <span className="block t-11 text-faint mt-0.5">
                  {s === 'clips' ? 'Cut from this channel’s long videos.' : 'A new Short is generated for each slot.'}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="min-w-0">
        <label htmlFor={`gate-cron-${slug}`} className="t-13 font-semibold text-ink">Autopilot start time (advanced)</label>
        <p className="t-11 text-faint mt-0.5 mb-2">A daily cron in UTC, written as minute hour * * *. Leave empty to keep the current time.</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id={`gate-cron-${slug}`}
            type="text"
            value={gateCron}
            onChange={(e) => setGateCron(e.target.value)}
            placeholder="e.g. 13 2 * * *"
            aria-invalid={!cronState.valid}
            className="input font-mono w-full sm:w-48"
          />
          {cronState.valid && cronState.label ? (
            <span className="t-12 text-muted font-mono">runs at {cronState.label}</span>
          ) : !cronState.valid ? (
            <span className="t-12" style={{ color: 'var(--bad-ink)' }}>Use M H * * * (minute 0-59, hour 0-23)</span>
          ) : null}
        </div>
      </div>

      {modelWarnings.length ? (
        <div className="flex items-start gap-1.5 t-12" style={{ color: 'var(--warn-ink)' }}>
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span className="min-w-0">{modelWarnings.join(' ')}</span>
        </div>
      ) : null}

      {proj.blocked ? (
        <p className="t-12" style={{ color: 'var(--bad-ink)' }}>
          Over budget: the busiest day would exceed the shared daily pool — spread the days out or lower the cadence before saving.
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
      <Button color="primary" onClick={save} isDisabled={saving || Boolean(loadError) || !schedule || proj.blocked || !cronState.valid}>
        {saving ? 'Saving…' : 'Save schedule'}
      </Button>
    </>
  );

  if (frame) return frame(body, footer);
  return (
    <div className="inset-tile p-4 mt-1 space-y-4">
      <div className="flex items-center gap-2 overline"><CalendarDays size={12} /> Production scheduling</div>
      {body}
      <div className="flex flex-wrap items-center justify-end gap-2">{footer}</div>
    </div>
  );
}
