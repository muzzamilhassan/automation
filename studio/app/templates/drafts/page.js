'use client';
// The DRAFTS INBOX — the panel surface for the staged bot templates
// (studio/lib/template-bot-drafts/). Browse with their sample renders, then
// Approve (the draft joins the registry via a GitHub commit — the R4 front
// door, formerly CLI --approve) or Reject (the draft leaves the repo). Every
// action is owner-only and audited in the Neon template_approvals queue.
// After an approve, the template appears on /templates and becomes assignable
// from the channel pages (run the registry sync / next deploy to refresh).
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Inbox, Play, CheckCircle2, XCircle, RefreshCw, Film } from 'lucide-react';
import { PageHeader, Card, Chip } from '@/components/ui';

export default function DraftsInboxPage() {
  const router = useRouter();
  const [drafts, setDrafts] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null); // templateId while its POST runs
  const [notice, setNotice] = useState(null);
  const [preview, setPreview] = useState(null); // draft currently playing

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch('/api/templates/drafts');
      if (r.status === 401) { router.push('/login'); return; }
      const d = await r.json();
      if (d.error) setError(d.error);
      else setDrafts(d.drafts || []);
    } catch (e) {
      setError(String(e.message || e).slice(0, 140));
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const act = async (templateId, action) => {
    setBusy(templateId);
    setNotice(null);
    try {
      const r = await fetch('/api/templates/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, action }),
      });
      const d = await r.json();
      if (!r.ok) setNotice(`${action} failed: ${d.error || r.status}`);
      else if (action === 'approve') setNotice(`✅ ${templateId} approved${d.already ? ' (was already in the registry)' : ''} — run the registry sync / redeploy, then assign it from a channel page.`);
      else setNotice(`🗑️ ${templateId} rejected — the draft left the repo and its sample row dropped.`);
      await load();
    } catch (e) {
      setNotice(String(e.message || e).slice(0, 140));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Inbox}
        title="Drafts Inbox"
        sub="Staged bot templates awaiting your decision. Approve promotes a draft into the registry (assignable on channel pages); reject removes it from the repo entirely."
      >
        <button className="btn btn-outline" onClick={load} disabled={!!busy}>
          <RefreshCw size={16} className={drafts === null ? 'animate-spin' : ''} /> Refresh
        </button>
      </PageHeader>

      {notice ? (
        <Card className="p-4 text-sm whitespace-pre-wrap">{notice}</Card>
      ) : null}
      {error ? (
        <Card className="p-4 text-sm text-red-400">{error}</Card>
      ) : null}

      {drafts === null && !error ? (
        <Card className="p-8 text-sm opacity-60">Loading staged drafts…</Card>
      ) : null}

      {Array.isArray(drafts) && drafts.length === 0 ? (
        <Card className="p-8 text-sm opacity-60">
          No staged drafts right now. Draft new ones with the template bot (CLI or CI dispatch) — they land here with their sample renders.
        </Card>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {(drafts || []).map((d) => (
          <Card key={d.templateId} className="p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-[15px] leading-tight">{d.templateId}</div>
                <div className="text-xs opacity-60 mt-0.5">{(d.niches || []).join(' · ')}</div>
              </div>
              {d.approval ? (
                <Chip>{d.approval.action === 'approve' ? 'approved' : d.approval.status}</Chip>
              ) : (
                <Chip>staged</Chip>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {d.style ? <Chip>{d.style}</Chip> : null}
              {d.theme ? <Chip>{d.theme}</Chip> : null}
              {d.brand ? <Chip>{d.brand} {d.badge ? `// ${d.badge}` : ''}</Chip> : null}
              {d.voice ? <Chip>{d.voice}</Chip> : null}
              {d.musicMood ? <Chip>{d.musicMood}</Chip> : null}
            </div>

            {d.titles?.length ? (
              <div className="text-xs opacity-75 space-y-1">
                {d.titles.slice(0, 2).map((t, i) => (
                  <div key={i} className="truncate">“{String(t).replace(/^"|"$/g, '')}”</div>
                ))}
              </div>
            ) : null}

            {d.preview?.mp4 ? (
              <button
                className="relative rounded-lg overflow-hidden border border-white/10 group text-left"
                onClick={() => setPreview(d)}
              >
                {d.preview.poster ? (
                  <img src={d.preview.poster} alt="" className="w-full aspect-video object-cover" />
                ) : (
                  <div className="w-full aspect-video bg-black/40 flex items-center justify-center"><Film size={28} className="opacity-50" /></div>
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition">
                  <Play size={30} />
                </span>
                <span className="absolute bottom-1.5 left-2 text-[10px] opacity-70">sample · {new Date(d.preview.renderedAt).toLocaleDateString()}</span>
              </button>
            ) : (
              <div className="rounded-lg border border-dashed border-white/10 p-4 text-xs opacity-50 flex items-center gap-2">
                <Film size={16} /> no sample render yet
              </div>
            )}

            {d.disclaimer ? (
              <div className="text-[11px] opacity-45 leading-snug">{d.disclaimer}</div>
            ) : null}

            <div className="mt-auto flex gap-2 pt-1">
              <button
                className="btn btn-primary flex-1 text-sm"
                disabled={busy === d.templateId}
                onClick={() => act(d.templateId, 'approve')}
              >
                <CheckCircle2 size={15} /> {busy === d.templateId ? 'Working…' : 'Approve'}
              </button>
              <button
                className="btn btn-outline text-sm"
                disabled={busy === d.templateId}
                onClick={() => act(d.templateId, 'reject')}
              >
                <XCircle size={15} /> Reject
              </button>
            </div>
          </Card>
        ))}
      </div>

      {preview ? (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6" onClick={() => setPreview(null)}>
          <div className="max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold">{preview.templateId} — sample render</div>
              <button className="btn btn-outline text-xs" onClick={() => setPreview(null)}>Close</button>
            </div>
            <video src={preview.preview.mp4} poster={preview.preview.poster} controls autoPlay className="w-full rounded-lg border border-white/10" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
