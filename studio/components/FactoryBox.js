'use client';
// "Ask the factory" (2026-11-23, research/creator-city-agent-factory-2026-11-23.md
// §5 item 9 + owner decision d). The owner types one sentence, presses
// Plan it, and sees the PLAN — channel, video type, topic and the 7 fixed
// stations. NOTHING happens until Start (confirmed). Logic lives server-side:
// /api/factory/plan (no side effects) and /api/factory/start (re-validates,
// 7/7 ready gate, then dispatches the channel's normal run).
import { useRef, useState } from 'react';
import Link from 'next/link';
import { Factory, Play, Pencil, X, Loader2 } from 'lucide-react';
import { Card, CardHead, Chip } from '@/components/ui';
import { useConfirm } from '@/components/ConfirmDialog';
import { FACTORY_TEXT_MAX } from '@/lib/factory-plan.mjs';

const LANE_WORD = { doc: 'Documentary', short: 'Short' };

// The station marker, in the StationDots language: not yet = hollow ring,
// "needs you" (the approval station on a gated channel) = warn ring.
function Marker({ needsYou }) {
  return (
    <span
      aria-hidden
      className="block rounded-full shrink-0 mt-1"
      style={{ width: 12, height: 12, border: needsYou ? '2.5px solid var(--warn-ink)' : '1.5px solid var(--faint)' }}
    />
  );
}

async function postJSON(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let j = {};
  try { j = await res.json(); } catch { j = {}; }
  if (!res.ok) throw new Error(j.error || `The server answered ${res.status}.`);
  return j;
}

export default function FactoryBox() {
  const confirm = useConfirm();
  const inputRef = useRef(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(null); // 'plan' | 'start' | null
  const [plan, setPlan] = useState(null);
  const [note, setNote] = useState(null);
  const [error, setError] = useState(null);
  const [started, setStarted] = useState(null); // { runUrl, label }

  const clearResult = () => { setPlan(null); setNote(null); setError(null); setStarted(null); };

  async function planIt(e) {
    e?.preventDefault();
    if (!text.trim() || busy) return;
    clearResult();
    setBusy('plan');
    try {
      const j = await postJSON('/api/factory/plan', { text: text.trim() });
      setPlan(j.plan);
      setNote(j.note || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function start() {
    if (!plan || busy) return;
    const ok = await confirm({
      title: 'Start this video?',
      body: `${plan.channelLabel} · ${LANE_WORD[plan.lane]} · ${plan.topic}. A real run starts on GitHub now${plan.reviewGate === false ? '.' : '; the script still waits for your OK at Review.'}`,
      confirmLabel: 'Start',
    });
    if (!ok) return;
    setError(null);
    setBusy('start');
    try {
      const j = await postJSON('/api/factory/start', { plan: { channel: plan.channel, lane: plan.lane, topic: plan.topic } });
      setStarted({ runUrl: j.runUrl || '/runs', label: plan.channelLabel });
      setPlan(null);
      setNote(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  function change() {
    setPlan(null);
    setNote(null);
    setError(null);
    inputRef.current?.focus();
  }

  function cancel() {
    clearResult();
    setText('');
  }

  return (
    <Card>
      <CardHead icon={Factory} title="Ask the factory" sub="One sentence in, a plan out. Nothing runs until you press Start." />
      <div className="px-5 pb-5 space-y-3">
        <form onSubmit={planIt} className="space-y-2">
          <label htmlFor="factory-text" className="sr-only">What should the factory make?</label>
          <textarea
            id="factory-text"
            ref={inputRef}
            className="input w-full t-14"
            rows={2}
            maxLength={FACTORY_TEXT_MAX}
            placeholder="e.g. Make a Money Rulebook video about credit-card float"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) planIt(e); }}
            disabled={busy === 'start'}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="btn btn-primary min-h-[44px] md:min-h-0" disabled={!text.trim() || Boolean(busy)}>
              {busy === 'plan' ? <Loader2 size={14} className="motion-safe:animate-spin" aria-hidden /> : null}
              {busy === 'plan' ? 'Planning…' : 'Plan it'}
            </button>
            <span className="t-11 text-faint">{text.length}/{FACTORY_TEXT_MAX}</span>
          </div>
        </form>

        {error ? <p role="alert" className="t-13" style={{ color: 'var(--bad-ink)' }}>{error}</p> : null}

        {started ? (
          <p role="status" className="t-13" style={{ color: 'var(--ok-ink)' }}>
            Started for {started.label}.{' '}
            <Link href={started.runUrl} className="underline font-semibold">Watch it on Runs</Link>
          </p>
        ) : null}

        {plan ? (
          <section aria-label="The plan" className="rounded-lg border p-4 space-y-3" style={{ borderColor: 'var(--line-strong)', background: 'var(--surface-2)' }}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="t-14 font-semibold text-ink">{plan.channelLabel}</span>
              <Chip tone="info">{LANE_WORD[plan.lane]}</Chip>
              <Chip tone="plain">{plan.source === 'ai' ? 'Planned by the AI' : 'Planned by simple rules'}</Chip>
            </div>
            <p className="t-13 text-ink break-words"><span className="text-muted">Topic: </span>{plan.topic}</p>

            <ol className="space-y-2" aria-label="Steps">
              {plan.steps.map((s) => (
                <li key={s.key} className="flex items-start gap-2.5">
                  <Marker needsYou={s.key === 'approval' && plan.reviewGate !== false} />
                  <div className="min-w-0">
                    <span className="t-13 font-semibold text-ink">{s.label}</span>
                    <span className="t-12 text-muted"> — {s.note}</span>
                  </div>
                </li>
              ))}
            </ol>

            <div className="space-y-1">
              <p className="t-12 text-muted">Publishes at the channel’s next slot{plan.when ? ` (${plan.when.replace(/^next slot /, '')})` : ''}.</p>
              {plan.reviewGate === false ? null : (
                <p className="t-12" style={{ color: 'var(--warn-ink)' }}>
                  The script still waits for your approval at Review{plan.reviewGate === true ? '' : ' if this channel has the review gate'} — nothing is voiced or rendered before that.
                </p>
              )}
              {plan.warnings.map((w) => <p key={w} className="t-12" style={{ color: 'var(--warn-ink)' }}>{w}</p>)}
              {note ? <p className="t-11 text-faint">{note}</p> : null}
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" className="btn btn-primary min-h-[44px] md:min-h-0" onClick={start} disabled={Boolean(busy)}>
                {busy === 'start' ? <Loader2 size={14} className="motion-safe:animate-spin" aria-hidden /> : <Play size={14} aria-hidden />}
                {busy === 'start' ? 'Starting…' : 'Start'}
              </button>
              <button type="button" className="btn btn-outline min-h-[44px] md:min-h-0" onClick={change} disabled={Boolean(busy)}>
                <Pencil size={14} aria-hidden /> Change
              </button>
              <button type="button" className="btn btn-ghost min-h-[44px] md:min-h-0" onClick={cancel} disabled={Boolean(busy)}>
                <X size={14} aria-hidden /> Cancel
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </Card>
  );
}
