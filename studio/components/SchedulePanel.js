'use client';
// #100 — per-channel production scheduling panel: doc days, short days,
// shorts source, live quota projection. Writes through /api/channels/schedule
// (owner/staff); the engine reads yt-mcp/cadence.json (overlay merged last in
// lib/brand-resolve.mjs).
import { useEffect, useState } from 'react';
import { CalendarDays, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/untitledui/base/buttons/button';
import { Chip } from '@/components/ui';
import { projection, DAY_NAMES } from '@/lib/schedule-projection';

const PER_UPLOAD = 1700;

function DayPicker({ label, days, onToggle }) {
  return (
    <div>
      <div className="overline mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-1">
        {DAY_NAMES.map((d) => {
          const on = days.includes(d);
          return (
            <button
              key={d}
              type="button"
              onClick={() => onToggle(d)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
                on ? 'border-transparent text-white bg-[#1a1d24]' : 'border-[--border] text-muted hover:text-ink'
              }`}
              style={on ? { background: '#2b6cb0' } : undefined}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
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

export default function SchedulePanel({ slug, accent }) {
  const [schedule, setSchedule] = useState(null);
  const [serverProj, setServerProj] = useState(null);
  const [gateCron, setGateCron] = useState('');
  const [modelWarnings, setModelWarnings] = useState([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    fetch(`/api/channels/schedule?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) => {
        setSchedule(d.schedule || { docDays: [], shortDays: [], shortsSource: 'generated' });
        setServerProj(d.projection || null);
        setGateCron(d.gateCron || '');
        setModelWarnings(d.projection?.warnings || []);
      })
      .catch(() => setSchedule({ docDays: [], shortDays: [], shortsSource: 'generated' }));
  }, [slug]);

  const draft = schedule || { docDays: [], shortDays: [], shortsSource: 'generated' };
  const proj = projection({ ...draft, ...deriveModelParams(serverProj) });
  const cronState = parseGateCron(gateCron);

  const toggleDay = (field) => (d) =>
    setSchedule((s) => ({
      ...s,
      [field]: (s?.[field] || []).includes(d) ? s[field].filter((x) => x !== d) : [...(s?.[field] || []), d],
    }));

  const save = async () => {
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
        setMsg({ tone: 'ok', text: 'saved — next runs pick this up' });
        const saveWarnings = [...new Set([...(j.projection?.warnings || []), ...(j.warnings || [])])];
        if (saveWarnings.length) setMsg({ tone: 'warn', text: saveWarnings.join(' ') });
      }
    } catch (e) {
      setMsg({ tone: 'error', text: String(e.message || e) });
    } finally {
      setSaving(false);
    }
  };

  const toneColor = proj.tone === 'over' ? '#e11d48' : proj.tone === 'warn' ? '#d97706' : '#10b981';

  return (
    <div className="inset-tile p-4 mt-1">
      <div className="flex items-center gap-2 overline mb-3">
        <CalendarDays size={12} /> Production scheduling
        <Chip tone={proj.tone === 'over' ? 'bad' : proj.tone === 'warn' ? 'warn' : 'ok'}>
          {proj.worstDayUnits}/{proj.budget} units worst day ({proj.pct}%)
        </Chip>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-3">
        <DayPicker label="Long-form days (docs/week)" days={draft.docDays} onToggle={toggleDay('docDays')} />
        <DayPicker label="Shorts days (clips posted these days)" days={draft.shortDays} onToggle={toggleDay('shortDays')} />
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="overline">Shorts source:</span>
        {['generated', 'clips'].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSchedule((s0) => ({ ...s0, shortsSource: s }))}
            className={`px-3 py-1 rounded-md text-[11.5px] font-semibold border transition-colors ${
              draft.shortsSource === s ? 'border-transparent text-white' : 'border-[--border] text-muted hover:text-ink'
            }`}
            style={draft.shortsSource === s ? { background: accent || '#2b6cb0' } : undefined}
          >
            {s === 'clips' ? 'Clips from long-forms' : 'Generated daily'}
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <span className="overline">Autopilot gate cron (UTC):</span>
        <input
          type="text"
          value={gateCron}
          onChange={(e) => setGateCron(e.target.value)}
          placeholder="e.g. 13 2 * * *"
          className="px-2.5 py-1 rounded-md border border-[--border] bg-black/20 font-mono text-[11.5px] text-ink w-36"
        />
        {cronState.valid && cronState.label ? (
          <span className="text-[11px] text-muted font-mono">{cronState.label}</span>
        ) : !cronState.valid ? (
          <span className="text-[11px] text-red-400">Use M H * * * (0-59, 0-23)</span>
        ) : null}
      </div>

      <div className="mb-3">
        <div className="h-1.5 rounded-full bg-black/30 overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, proj.pct)}%`, background: toneColor }} />
        </div>
        <p className="text-[11px] text-muted mt-1">
          Busiest day: {proj.worstDayUploads} uploads ≈ {proj.worstDayUnits.toLocaleString()} units · ~{proj.weeklyUploads} uploads/week · shared pool {proj.budget.toLocaleString()} units/day
        </p>
      </div>

      {msg ? (
        <div className={`flex items-start gap-1.5 text-[12px] mb-2 ${msg.tone === 'error' ? 'text-red-400' : msg.tone === 'warn' ? 'text-amber-400' : 'text-emerald-400'}`}>
          {msg.tone === 'warn' ? <AlertTriangle size={13} className="mt-0.5" /> : null}
          <span>{msg.text}</span>
        </div>
      ) : null}

      {modelWarnings.length ? (
        <div className="flex items-start gap-1.5 text-[12px] mb-2 text-amber-400">
          <AlertTriangle size={13} className="mt-0.5" />
          <span>{modelWarnings.join(' ')}</span>
        </div>
      ) : null}

      {proj.blocked ? (
        <p className="text-[12px] text-red-400 mb-2">
          Over budget: the busiest day would exceed the shared daily pool — spread days or lower the cadence before saving.
        </p>
      ) : null}

      <Button color="primary" onClick={save} isDisabled={saving || proj.blocked || !cronState.valid}>
        {saving ? 'Saving…' : 'Save scheduling'}
      </Button>
    </div>
  );
}
