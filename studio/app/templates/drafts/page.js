'use client';
// The DRAFTS INBOX — the panel surface for the staged bot templates
// (studio/lib/template-bot-drafts/). Browse with their sample renders, then
// Approve (the draft joins the registry via a GitHub commit — the R4 front
// door, formerly CLI --approve) or Reject (the draft leaves the repo). Every
// action is owner-only and audited in the Neon template_approvals queue.
import { useState, useEffect, useCallback, useMemo } from 'react';
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
  BookOpen,
  ListOrdered,
  Sparkles,
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

  const isFullStory = draft.narrativeFormat === 'full_story';

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

      {/* Top-left Format Pill */}
      <div className="pointer-events-none absolute top-2.5 left-2.5 z-10">
        {isFullStory ? (
          <span className="px-2 py-0.5 rounded-md bg-emerald-950/85 text-emerald-300 border border-emerald-500/40 backdrop-blur-sm text-[10.5px] font-medium flex items-center gap-1 shadow-sm">
            <BookOpen size={11} className="text-emerald-400" /> Full Story
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded-md bg-purple-950/85 text-purple-300 border border-purple-500/40 backdrop-blur-sm text-[10.5px] font-medium flex items-center gap-1 shadow-sm">
            <ListOrdered size={11} className="text-purple-400" /> Chapter Breakdown
          </span>
        )}
      </div>

      {/* Always-visible centered play button */}
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="w-12 h-12 rounded-full bg-black/70 text-white border border-white/25 backdrop-blur-sm flex items-center justify-center shadow-lg transition-transform duration-200 group-hover:scale-110 group-hover:bg-accent group-hover:text-accent-ink">
          <Play size={20} className="ml-0.5 fill-current" />
        </span>
      </span>

      {/* Top-right style/theme pill */}
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
        <span className="px-2 py-0.5 rounded-md bg-black/65 backdrop-blur-sm text-[10.5px] font-semibold opacity-90 group-hover:opacity-100 flex items-center gap-1">
          <Sparkles size={11} className="text-amber-400" /> Hook Media Active
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
  const [filterFormat, setFilterFormat] = useState('all'); // 'all' | 'full_story' | 'chapters'

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

  const fullStoryCount = useMemo(() => (drafts || []).filter((d) => d.narrativeFormat === 'full_story').length, [drafts]);
  const chaptersCount = useMemo(() => (drafts || []).filter((d) => d.narrativeFormat === 'chapters').length, [drafts]);

  const visibleDrafts = useMemo(() => {
    if (!drafts) return [];
    if (filterFormat === 'all') return drafts;
    return drafts.filter((d) => d.narrativeFormat === filterFormat);
  }, [drafts, filterFormat]);

  // Dynamic toggle: checking converts to chapters (true), unchecking converts to full story (false, default)
  const toggleChapters = async (templateId, checked) => {
    const isChapters = Boolean(checked);
    setDrafts((prev) =>
      (prev || []).map((d) => {
        if (d.templateId !== templateId) return d;
        return {
          ...d,
          hasChapters: isChapters,
          narrativeFormat: isChapters ? 'chapters' : 'full_story',
          formatLabel: isChapters ? 'Chapter Breakdown' : 'Full Story',
          sections: isChapters
            ? ['cold_open', 'chapters:10', 'exhibits', 'outro']
            : ['cold_open', 'hook_escalation', 'deep_investigation', 'verdict_payoff', 'outro'],
          formatDescription: isChapters
            ? 'Structured 10-part chapter breakdown with numbered milestone cards and explicit section divides.'
            : 'Full continuous narrative documentary arc — seamless story progression with zero chapter dividers.',
        };
      })
    );

    if (preview?.templateId === templateId) {
      setPreview((prev) => ({
        ...prev,
        hasChapters: isChapters,
        narrativeFormat: isChapters ? 'chapters' : 'full_story',
        formatLabel: isChapters ? 'Chapter Breakdown' : 'Full Story',
        sections: isChapters
          ? ['cold_open', 'chapters:10', 'exhibits', 'outro']
          : ['cold_open', 'hook_escalation', 'deep_investigation', 'verdict_payoff', 'outro'],
        formatDescription: isChapters
          ? 'Structured 10-part chapter breakdown with numbered milestone cards and explicit section divides.'
          : 'Full continuous narrative documentary arc — seamless story progression with zero chapter dividers.',
      }));
    }

    try {
      await fetch('/api/templates/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          action: 'toggle_chapters',
          hasChapters: isChapters,
        }),
      });
    } catch (e) {
      console.warn('Failed to persist template chapters toggle:', e);
    }
  };

  const act = async (templateId, action) => {
    setBusy(templateId);
    setNotice(null);
    const targetDraft = (drafts || []).find((x) => x.templateId === templateId);
    try {
      const r = await fetch('/api/templates/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          action,
          hasChapters: Boolean(targetDraft?.hasChapters),
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setNotice(`${action} failed: ${d.error || r.status}`);
      } else if (action === 'approve') {
        setNotice(`Approved ${templateId}${d.already ? ' (was already in the registry)' : ''} as ${targetDraft?.hasChapters ? 'Chapter Breakdown' : 'Full Story'} — run the registry sync / redeploy, then assign it from a channel page.`);
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
        sub="Staged bot templates awaiting your decision. Browse continuous full stories or chapter breakdowns with real opening hook media."
      >
        <button className="btn btn-outline" onClick={load} disabled={!!busy}>
          <RefreshCw size={16} className={drafts === null ? 'animate-spin' : ''} /> Refresh
        </button>
      </PageHeader>

      {/* Narrative Format Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-2 p-3 rounded-xl border border-line">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterFormat('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filterFormat === 'all'
                ? 'bg-ink text-surface shadow-sm'
                : 'bg-surface hover:bg-surface-3 text-muted hover:text-ink border border-line'
            }`}
          >
            All Templates ({drafts ? drafts.length : 0})
          </button>
          <button
            type="button"
            onClick={() => setFilterFormat('full_story')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              filterFormat === 'full_story'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-surface hover:bg-surface-3 text-emerald-400 hover:text-emerald-300 border border-emerald-500/30'
            }`}
          >
            <BookOpen size={13} /> Full Stories ({fullStoryCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterFormat('chapters')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              filterFormat === 'chapters'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-surface hover:bg-surface-3 text-purple-400 hover:text-purple-300 border border-purple-500/30'
            }`}
          >
            <ListOrdered size={13} /> Chapter Breakdowns ({chaptersCount})
          </button>
        </div>
        <div className="text-[11px] text-muted">
          {filterFormat === 'full_story'
            ? 'Continuous documentary stories with seamless narrative arc and zero chapter divider cards'
            : filterFormat === 'chapters'
            ? 'Step-by-step numbered breakdown lists and challenges'
            : 'Select Full Stories or Chapter Breakdowns'}
        </div>
      </div>

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
        {visibleDrafts.map((d) => (
          <Card key={d.templateId} className="p-5 flex flex-col gap-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-[15px] leading-tight text-ink truncate">{d.templateId}</div>
                <div className="text-xs text-muted mt-0.5 truncate">{(d.niches || []).join(' · ')}</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {d.narrativeFormat === 'full_story' ? (
                  <span className="px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <BookOpen size={11} /> Full Story
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30 flex items-center gap-1">
                    <ListOrdered size={11} /> Chapters
                  </span>
                )}
                {d.approval ? (
                  <Chip tone={d.approval.action === 'approve' ? 'ok' : 'plain'}>
                    {d.approval.action === 'approve' ? 'approved' : d.approval.status}
                  </Chip>
                ) : (
                  <Chip tone="accent">staged</Chip>
                )}
              </div>
            </div>

            <div className="text-[11.5px] text-muted flex items-center gap-1.5 bg-surface-2 px-2.5 py-1.5 rounded-lg border border-line">
              <span className="font-semibold text-ink/90">
                {d.narrativeFormat === 'full_story' ? 'Arc:' : 'Structure:'}
              </span>
              <span className="truncate">
                {d.sections?.length ? d.sections.join(' → ') : d.formatDescription}
              </span>
            </div>

            {/* Dynamic has_chapters toggle (default = false / Full Story) */}
            <div className="flex items-center justify-between p-2 rounded-xl bg-surface-2 border border-line">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={Boolean(d.hasChapters)}
                  onChange={(e) => toggleChapters(d.templateId, e.target.checked)}
                  className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 bg-surface border-line cursor-pointer"
                />
                <span className="text-xs font-semibold text-ink">
                  {d.hasChapters ? 'Chapter Breakdown (Checked)' : 'Full Story (Default)'}
                </span>
              </label>
              <span className={`text-[10.5px] font-mono px-2 py-0.5 rounded font-medium ${d.hasChapters ? 'text-purple-300 bg-purple-500/20' : 'text-emerald-300 bg-emerald-500/20'}`}>
                {d.hasChapters ? '10 Chapters' : '0 Chapters'}
              </span>
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
                  {preview.narrativeFormat === 'full_story' ? (
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
                      <BookOpen size={12} /> Full Story (Continuous Arc)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-500/20 text-purple-400 border border-purple-500/40 flex items-center gap-1">
                      <ListOrdered size={12} /> Chapter Breakdown (10 Parts)
                    </span>
                  )}
                  <label className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-surface-3 border border-line cursor-pointer text-[11px] font-semibold hover:border-purple-500/50 transition select-none">
                    <input
                      type="checkbox"
                      checked={Boolean(preview.hasChapters)}
                      onChange={(e) => toggleChapters(preview.templateId, e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-purple-500 bg-surface border-line cursor-pointer"
                    />
                    <span>{preview.hasChapters ? 'Chapters Mode' : 'Full Story (Default)'}</span>
                  </label>
                  {preview.style ? <Chip tone="info">{preview.style}</Chip> : null}
                  {preview.theme ? <Chip>{preview.theme}</Chip> : null}
                  {preview.voice ? <Chip>{preview.voice}</Chip> : null}
                </div>
                <div className="flex items-center gap-2 mt-1.5 text-xs text-muted flex-wrap">
                  <span>{(preview.niches || []).join(' · ')}</span>
                  {preview.brand ? <span>· {preview.brand}{preview.badge ? ` (${preview.badge})` : ''}</span> : null}
                  <span className="text-emerald-400 font-medium">· 95%-100% Matched Opening Hook Media Active</span>
                </div>
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
                  {preview.formatDescription || (preview.narrativeFormat === 'full_story' ? 'Full continuous story arc (0 chapters)' : 'Structured 10-part chapters')}
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
