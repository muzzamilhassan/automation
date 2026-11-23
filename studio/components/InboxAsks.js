'use client';
// Creator City item 6 — the Inbox "Questions" group: one compact card per
// pending ask (GET /api/asks), channel mark, one-line title, one muted line,
// buttons (primary first), a tiny "expires in 5 h". Server-defined confirm
// text gates the destructive Skip (useConfirm). Answers POST { id, optionId }
// — owner only; staff see the cards with the buttons disabled. A failed
// answer keeps the card with its error; nothing renders when there are no
// questions (no "no questions" box — owner rule: less text).
//
// sonner's <Toaster /> is mounted here (no app-wide toaster exists yet) and
// stays mounted after the last card goes, so the final toast still shows.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Toaster, toast } from 'sonner';
import { MessageCircleQuestion } from 'lucide-react';
import { Card, BrandMark } from '@/components/ui';
import { useConfirm } from '@/components/ConfirmDialog';
import { useBrands } from '@/components/use-brands';
import { expiresLabel } from '@/lib/asks.mjs';

const primaryFirst = (opts) => [...(opts || [])].sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)));

export default function InboxAsks({ asks = [], canAnswer = false, onAnswered }) {
  const confirm = useConfirm();
  const { bySlug } = useBrands();
  const [busy, setBusy] = useState(null); // ask id in flight
  const [errors, setErrors] = useState({}); // ask id → error from this session
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  async function answer(ask, opt) {
    if (opt.confirm) {
      const ok = await confirm({
        title: opt.confirm.title,
        body: opt.confirm.body,
        confirmLabel: opt.confirm.confirmLabel || opt.label,
        tone: opt.confirm.tone || 'primary',
      });
      if (!ok) return;
    }
    setBusy(ask.id);
    try {
      const r = await fetch('/api/asks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ask.id, optionId: opt.id }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) {
        setErrors((e) => {
          const next = { ...e };
          delete next[ask.id];
          return next;
        });
        toast.success(`${opt.label} — done`);
        onAnswered?.(ask.id);
      } else {
        const msg = d.error || `Failed (${r.status})`;
        setErrors((e) => ({ ...e, [ask.id]: msg }));
        toast.error(msg);
      }
    } catch {
      setErrors((e) => ({ ...e, [ask.id]: 'Network error — nothing changed' }));
      toast.error('Network error — nothing changed');
    } finally {
      setBusy(null);
    }
  }

  const list = Array.isArray(asks) ? asks : [];
  return (
    <>
      <Toaster position="bottom-center" theme="system" />
      {list.length ? (
        <section className="mb-4" aria-label="Questions">
          <div className="flex items-center gap-2 mb-2">
            <MessageCircleQuestion size={15} style={{ color: 'var(--warn-ink)' }} aria-hidden />
            <h2 className="section-title">Questions</h2>
            <span className="t-11 text-faint">{list.length}</span>
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {list.map((a) => {
              const brand = bySlug[a.channel];
              const err = errors[a.id] || a.error;
              const exp = expiresLabel(a.expiresAt, now);
              const inFlight = busy === a.id;
              return (
                <li key={a.id} className="min-w-0">
                  <Card className="p-4 min-w-0 h-full">
                    <div className="flex items-start gap-3 min-w-0">
                      <BrandMark short={brand?.short || '•'} accent={brand?.accent || 'var(--accent)'} size={28} />
                      <div className="min-w-0 flex-1">
                        <p className="t-13 font-semibold text-ink break-words [overflow-wrap:anywhere]">{a.title}</p>
                        <p className="t-12 text-faint break-words [overflow-wrap:anywhere]">{[brand?.label || a.channel, a.body].filter(Boolean).join(' · ')}</p>
                      </div>
                    </div>
                    {err ? <p className="t-11 mt-2 break-words [overflow-wrap:anywhere]" style={{ color: 'var(--bad-ink)' }} role="alert">{err}</p> : null}
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      {primaryFirst(a.options).map((o) =>
                        o.href ? (
                          <Link key={o.id} href={o.href} className={`btn ${o.primary ? 'btn-primary' : 'btn-ghost'} btn-sm min-h-[44px] md:min-h-0`}>
                            {o.label}
                          </Link>
                        ) : (
                          <button
                            key={o.id}
                            type="button"
                            onClick={() => answer(a, o)}
                            disabled={!canAnswer || inFlight}
                            title={canAnswer ? undefined : 'Only the owner can answer'}
                            className={`btn ${o.primary ? 'btn-primary' : 'btn-outline'} btn-sm min-h-[44px] md:min-h-0`}
                          >
                            {o.label}
                          </button>
                        ),
                      )}
                      {exp ? <span className="t-10 text-faint ml-auto">{exp}</span> : null}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </>
  );
}
