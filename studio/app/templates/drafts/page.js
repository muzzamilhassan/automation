'use client';
// The DRAFTS INBOX — the panel surface for the staged bot templates
// (studio/lib/template-bot-drafts/). Browse with their sample renders, then
// Approve (the draft joins the registry via a GitHub commit — the R4 front
// door, formerly CLI --approve) or Reject (the draft leaves the repo). Every
// action is owner-only and audited in the Neon template_approvals queue.
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Inbox,
  Play,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Film,
  X,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { PageHeader, Card, Chip } from '@/components/ui';

function PosterTile({ draft, onOpen }) {
  const [imgErr, setImgErr] = useState(false);

  if (!draft.preview?.mp4) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface-2 aspect-video flex flex-col items-center justify-center gap-1.5 px-4 text-center">
        <Film size={20} className="text-faint" />
        <span className="text-xs font-medium text-muted">No sample render yet</span>
        <span className="text-[11px] text-faint">Run Template Previews to generate a demo video</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(draft)}
      className="relative w-full aspect-video rounded-xl overflow-hidden border border-line bg-neutral-950 group text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent"
      aria-label={`Play sample video for ${draft.templateId}`}
    >
      {draft.preview.poster && !imgErr ? (
        <img
          src={draft.preview.poster}
          alt={`${draft.templateId} preview frame`}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          onError={() => setImgErr(true)}
        />
      ) : (
        <div
          className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-white/75"
          style={{ background: 'linear-gradient(135deg, #111827 0%, #1e1b4b 100%)' }}
        >
          <Film size={24} className="opacity-70" />
          <span className="text-[11px] font-mono uppercase tracking-wider opacity-75">
            {draft.style || draft.theme || 'Sample MP4 Ready'}
          </span>
        </div>
      )}

      {/* Subtle gradient vignette so badges always read clearly over light or dark frames */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />

      {/* Always-visible centered play button */}
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="w-12 h-12 rounded-full bg-black/70 text-white border border-white/25 backdrop-blur-sm flex items-center justify-center shadow-lg transition-transform duration-200 group-hover:scale-110 group-hover:bg-accent group-hover:text-accent-ink">
          <Play size={20} className="ml-0.5 fill-current" />
        </span>
      </span>

      {/* Top-right format pill */}
      {draft.theme || draft.style ? (
        <span className="pointer-events-none absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/70 text-white/95 border border-white/15 backdrop-blur-sm text-[10.5px] font-mono">
          {draft.style || draft.theme}
        </span>
      ) : null}

      {/* Bottom caption */}
      <div className="pointer-events-none absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between gap-2 text-[11px] text-white/90">
        <span className="px-2 py-0.5 rounded-md bg-black/65 backdrop-blur-sm font-medium">
          Sample · {new Date(draft.preview.renderedAt).toLocaleDateString()}
        </span>
        <span className="px-2 py-0.5 rounded-md bg-black/65 backdrop-blur-sm text-[10.5px] font-semibold opacity-90 group-hover:opacity-100">
          Watch Demo
        </span>
      </div>
    </button>
  );
}

export default function DraftsInboxPage() {
  const router = useRouter();
  const [drafts, setDrafts] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const [preview, setPreview] = useState(null);
  const [videoErr, setVideoErr] = useState(false);

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

  useEffect(() => {
    let active = true;
    fetch('/api/templates/drafts')
      .then(async (r) => {
        if (!active) return;
        if (r.status === 401) { router.push('/login'); return; }
        const d = await r.json();
        if (!active) return;
        if (d.error) setError(d.error);
        else setDrafts(d.drafts || []);
      })
      .catch((e) => {
        if (active) setError(String(e.message || e).slice(0, 140));
      });
    return () => { active = false; };
  }, [router]);

  const closePreview = useCallback(() => {
    setPreview(null);
    setVideoErr(false);
  }, []);

  const openPreview = useCallback((d) => {
    setVideoErr(false);
    setPreview(d);
  }, []);

  useEffect(() => {
    if (!preview) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') closePreview();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [preview, closePreview]);

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
      if (!r.ok) {
        setNotice(`${action} failed: ${d.error || r.status}`);
      } else if (action === 'approve') {
        setNotice(`Approved ${templateId}${d.already ? ' (was already in the registry)' : ''} — run the registry sync / redeploy, then assign it from a channel page.`);
        if (preview?.templateId === templateId) closePreview();
      } else {
        setNotice(`Rejected ${templateId} — the draft left the repo and its sample row dropped.`);
        if (preview?.templateId === templateId) closePreview();
      }
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
        <Card className="p-4 text-sm text-ink whitespace-pre-wrap">{notice}</Card>
      ) : null}
      {error ? (
        <Card className="p-4 text-sm text-bad">{error}</Card>
      ) : null}

      {drafts === null && !error ? (
        <Card className="p-8 text-sm text-muted">Loading staged drafts…</Card>
      ) : null}

      {Array.isArray(drafts) && drafts.length === 0 ? (
        <Card className="p-8 text-sm text-muted">
          No staged drafts right now. Draft new ones with the template bot (CLI or CI dispatch) — they land here with their sample renders.
        </Card>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {(drafts || []).map((d) => (
          <Card key={d.templateId} className="p-5 flex flex-col gap-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-[15px] leading-tight text-ink truncate">{d.templateId}</div>
                <div className="text-xs text-muted mt-0.5 truncate">{(d.niches || []).join(' · ')}</div>
              </div>
              {d.approval ? (
                <Chip tone={d.approval.action === 'approve' ? 'ok' : 'plain'}>
                  {d.approval.action === 'approve' ? 'approved' : d.approval.status}
                </Chip>
              ) : (
                <Chip tone="accent">staged</Chip>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {d.style ? <Chip tone="info">{d.style}</Chip> : null}
              {d.theme ? <Chip>{d.theme}</Chip> : null}
              {d.brand ? <Chip>{d.brand}{d.badge ? ` // ${d.badge}` : ''}</Chip> : null}
              {d.voice ? <Chip>{d.voice}</Chip> : null}
              {d.musicMood ? <Chip>{d.musicMood}</Chip> : null}
            </div>

            {d.titles?.length ? (
              <div className="text-xs text-muted space-y-1 bg-surface-2 rounded-lg p-2.5 border border-line">
                {d.titles.slice(0, 2).map((t, i) => (
                  <div key={i} className="truncate text-ink/85">“{String(t).replace(/^"|"$/g, '')}”</div>
                ))}
              </div>
            ) : null}

            <PosterTile draft={d} onOpen={openPreview} />

            {d.disclaimer ? (
              <div className="text-[11px] text-faint leading-snug">{d.disclaimer}</div>
            ) : null}

            <div className="mt-auto flex gap-2 pt-1">
              <button
                type="button"
                className="btn btn-primary flex-1 text-sm"
                disabled={busy === d.templateId}
                onClick={() => act(d.templateId, 'approve')}
              >
                <CheckCircle2 size={15} /> {busy === d.templateId ? 'Working…' : 'Approve'}
              </button>
              <button
                type="button"
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
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="draft-preview-title"
          onClick={closePreview}
        >
          <div
            className="w-full max-w-4xl bg-surface text-ink border border-line rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-line bg-surface-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 id="draft-preview-title" className="font-display font-bold text-base text-ink">
                    {preview.templateId}
                  </h2>
                  {preview.style ? <Chip tone="info">{preview.style}</Chip> : null}
                  {preview.theme ? <Chip>{preview.theme}</Chip> : null}
                  {preview.voice ? <Chip>{preview.voice}</Chip> : null}
                </div>
                <p className="text-xs text-muted mt-1 truncate">
                  {(preview.niches || []).join(' · ')}
                  {preview.brand ? ` · ${preview.brand}${preview.badge ? ` (${preview.badge})` : ''}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={preview.preview.mp4}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-outline btn-sm"
                  title="Open raw MP4 in new tab"
                >
                  <ExternalLink size={13} /> Open
                </a>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={closePreview}
                  aria-label="Close preview modal"
                  title="Close (Esc)"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Video Stage */}
            <div className="relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden">
              {!videoErr ? (
                <video
                  key={preview.templateId}
                  src={preview.preview.mp4}
                  poster={preview.preview.poster || undefined}
                  controls
                  autoPlay
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-contain bg-black"
                  onError={() => setVideoErr(true)}
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 p-6 text-center text-white/85">
                  <AlertCircle size={28} className="text-amber-400" />
                  <div className="text-sm font-semibold">Unable to stream preview video</div>
                  <div className="text-xs text-white/60 max-w-md">
                    Verify BLOB_READ_WRITE_TOKEN is configured or re-render this template&apos;s sample preview.
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-t border-line bg-surface-2">
              <div className="min-w-0 flex-1">
                {preview.titles?.[0] ? (
                  <div className="text-xs text-ink font-medium truncate">
                    Sample pattern: “{String(preview.titles[0]).replace(/^"|"$/g, '')}”
                  </div>
                ) : null}
                <div className="text-[11px] text-faint mt-0.5 truncate">
                  {preview.disclaimer || `Rendered ${new Date(preview.preview.renderedAt).toLocaleString()}`}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={busy === preview.templateId}
                  onClick={() => act(preview.templateId, 'reject')}
                >
                  <XCircle size={14} /> Reject
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy === preview.templateId}
                  onClick={() => act(preview.templateId, 'approve')}
                >
                  <CheckCircle2 size={14} /> {busy === preview.templateId ? 'Working…' : 'Approve Draft'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
