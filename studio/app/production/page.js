'use client';
import {
  Zap,
  Clapperboard,
  Film,
  Music2,
  Share2,
  Image as ImageIcon,
  AtSign,
  ArrowRight,
  FileText,
  Clock,
} from 'lucide-react';
import ActionButton from '@/components/ActionButton';
import { Card, CardHead, Chip, PageHeader, EmptyState } from '@/components/ui';
import { PIPELINES } from '@/lib/site-data';

const ICONS = { clapperboard: Clapperboard, film: Film, music2: Music2, share2: Share2, image: ImageIcon, 'at-sign': AtSign };

export default function Production() {
  return (
    <div>
      <PageHeader
        icon={Zap}
        title="Production"
        sub="Every pipeline that makes and ships content. Buttons start real jobs on this machine or on GitHub Actions."
      >
        <a href="/logs" className="btn btn-outline">
          <FileText size={14} /> Open logs
        </a>
      </PageHeader>

      <div className="grid md:grid-cols-2 gap-4">
        {PIPELINES.map((p) => {
          const Icon = ICONS[p.icon] || Zap;
          return (
            <Card key={p.id} hover className="p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                    <Icon size={19} strokeWidth={2.1} />
                  </div>
                  <div>
                    <h2 className="section-title">{p.name}</h2>
                    <p className="text-[11.5px] text-faint mt-0.5">{p.engine}</p>
                  </div>
                </div>
                <Chip tone="ok" dot>live</Chip>
              </div>

              <p className="text-[12.5px] text-muted leading-relaxed -mt-1">{p.desc}</p>

              {/* stage flow */}
              <div className="flex items-center flex-wrap gap-y-2">
                {p.stages.map((s, i) => (
                  <span key={s} className="flex items-center">
                    <span className="inset-tile px-2.5 py-1 text-[11px] font-semibold text-muted">{s}</span>
                    {i < p.stages.length - 1 ? <ArrowRight size={11} className="mx-1 text-faint shrink-0" /> : null}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-2 text-[11.5px] text-faint">
                <Clock size={12} />
                <span className="font-mono">{p.schedule}</span>
              </div>

              {p.actions.length ? (
                <div className="flex flex-wrap gap-2 pt-1 mt-auto">
                  {p.actions.map((a) => (
                    <ActionButton key={a.action + (a.slug || '')} small action={a.action} slug={a.slug || null} label={a.label} />
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-faint pt-1 mt-auto">Runs on its own schedule — no manual button for this one.</p>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="mt-5 p-5">
        <div className="flex items-start gap-3">
          <FileText size={16} className="text-faint mt-0.5 shrink-0" />
          <div className="text-[12.5px] text-muted leading-relaxed">
            <span className="font-semibold text-ink">How runs report back.</span> Every button spawns the real script
            (same ones GitHub Actions uses) and writes output to <code className="font-mono text-accent">studio-logs/</code> in the
            repo. The{' '}
            <a href="/logs" className="text-accent hover:underline">
              Logs page
            </a>{' '}
            shows what actually got published. If a job fails, it fails closed — nothing broken goes public.
          </div>
        </div>
      </Card>
    </div>
  );
}
