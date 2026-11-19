'use client';
// The DRAFTS INBOX — the panel surface for the staged bot templates
// (studio/lib/template-bot-drafts/). Browse with their sample renders, then
// Approve (the draft joins the registry via a GitHub commit — the R4 front
// door, formerly CLI --approve) or Reject (the draft leaves the repo). Every
// action is owner-only and audited in the Neon template_approvals queue.
// Round 2: kit tokens (both themes), the sample player opens in the shared
// Drawer, Reject confirms (it deletes the draft), the chapters toggle reverts
// and says so when the save fails, and the hard-coded "hook media active"
// claims are gone (nothing checked them).
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Inbox,
  Play,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Film,
  AlertCircle,
  ExternalLink,
  BookOpen,
  ListOrdered,
} from 'lucide-react';
import { PageHeader, Card, Chip, EmptyState, Segmented } from '@/components/ui';
import Drawer from '@/components/Drawer';
import { useConfirm } from '@/components/ConfirmDialog';

const FORMAT_FIELDS = (isChapters) => ({
  hasChapters: isChapters,
  narrativeFormat: isChapters ? 'chapters' : 'full_story',
  formatLabel: isChapters ? 'Chapter Breakdown' : 'Full Story',
  sections: isChapters
    ? ['cold_open', 'chapters:10', 'exhibits', 'outro']
    : ['cold_open', 'hook_escalation', 'deep_investigation', 'verdict_payoff', 'outro'],
  formatDescription: isChapters
    ? 'Structured 10-part chapter breakdown with numbered milestone cards and explicit section divides.'
    : 'Full continuous narrative documentary arc — seamless story progression with zero chapter dividers.',
});

function FormatChip({ chapters }) {
  return chapters ? (
    <Chip tone="accent"><ListOrdered size={11} /> Chapters</Chip>
  ) : (
    <Chip tone="ok"><BookOpen size={11} /> Full Story</Chip>
  );
}

function PosterTile({ draft, onOpen }) {
  const [imgErr, setImgErr] = useState(false);

  if (!draft.preview?.mp4) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface-2 aspect-video flex flex-col items-center justify-center gap-1.5 px-4 text-center">
        <Film size={20} className="text-faint" />
        <span className="t-12 font-medium text-muted">No sample render yet</span>
        <span className="t-11 text-faint">Run Template Previews to generate a demo video</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      data-kit="tile"
      onClick={() => onOpen(draft)}
      className="relative w-full aspect-video rounded-xl overflow-hidden border border-line bg-black group text-left cursor-pointer"
      aria-label={`Play sample video for ${draft.templateId}`}
    >
      {draft.preview.poster && !imgErr ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={draft.preview.poster}
          alt=""
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          onError={() => setImgErr(true)}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-white/75 bg-black">
          <Film size={24} className="opacity-70" />
          <span className="t-11 font-mono uppercase tracking-wider opacity-75">{draft.style || draft.theme || 'Sample ready'}</span>
        </div>
      )}
      {/* vignette so the overlay text reads over light or dark frames (video chrome, always dark) */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="w-12 h-12 rounded-full bg-black/70 text-white border border-white/25 flex items-center justify-center shadow-lg transition-transform duration-200 group-hover:scale-110">
          <Play size={20} className="ml-0.5 fill-current" />
        </span>
      </span>
      {draft.preview.renderedAt ? (
        <span className="pointer-events-none absolute bottom-2 left-2.5 px-2 py-0.5 rounded-md bg-black/65 t-11 text-white/90 font-medium">
          Sample · {new Date(draft.preview.renderedAt).toLocaleDateString()}
        </span>
      ) : null}
    </button>
  );
}

export default function DraftsInboxPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [drafts, setDrafts] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null); // { ok, text }
  const [preview, setPreview] = useState(null);
  const [videoErr, setVideoErr] = useState(false);
  const [filterFormat, setFilterFormat] = useState('all'); // 'all' | 'full_story' | 'chapters'
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const r = await fetch('/api/templates/drafts');
      if (r.status === 401) { router.push('/login'); return; }
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) setError(d.error || `the server answered ${r.status}`);
      else setDrafts(d.drafts || []);
    } catch (e) {
      setError(String(e.message || e).slice(0, 140));
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    let active = true;
    fetch('/api/templates/drafts')
      .then(async (r) => {
        if (!active) return;
        if (r.status === 401) { router.push('/login'); return; }
        const d = await r.json().catch(() => ({}));
        if (!active) return;
        if (!r.ok || d.error) setError(d.error || `the server answered ${r.status}`);
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

  const fullStoryCount = useMemo(() => (drafts || []).filter((d) => d.narrativeFormat === 'full_story').length, [drafts]);
  const chaptersCount = useMemo(() => (drafts || []).filter((d) => d.narrativeFormat === 'chapters').length, [drafts]);

  const visibleDrafts = useMemo(() => {
    if (!drafts) return [];
    if (filterFormat === 'all') return drafts;
    return drafts.filter((d) => d.narrativeFormat === filterFormat);
  }, [drafts, filterFormat]);

  const applyFormat = (templateId, isChapters) => {
    setDrafts((prev) => (prev || []).map((d) => (d.templateId === templateId ? { ...d, ...FORMAT_FIELDS(isChapters) } : d)));
    setPreview((prev) => (prev?.templateId === templateId ? { ...prev, ...FORMAT_FIELDS(isChapters) } : prev));
  };

  // Checking converts to chapters, unchecking to full story (the default).
  // Optimistic, but a refused save reverts and says so — never a silent lie.
  const toggleChapters = async (templateId, checked) => {
    const isChapters = Boolean(checked);
    applyFormat(templateId, isChapters);
    try {
      const r = await fetch('/api/templates/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, action: 'toggle_chapters', hasChapters: isChapters }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `the server answered ${r.status}`);
    } catch (e) {
      applyFormat(templateId, !isChapters);
      setNotice({ ok: false, text: `Couldn't change ${templateId}'s format — ${e.message}. It's back to how it was.` });
    }
  };

  const act = async (templateId, action) => {
    if (action === 'reject') {
      const ok = await confirm({
        title: `Reject ${templateId}?`,
        body: 'The draft is deleted from the repo and its sample row is dropped. This cannot be undone from the panel.',
        confirmLabel: 'Reject draft',
        tone: 'danger',
      });
      if (!ok) return;
    }
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
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setNotice({ ok: false, text: `${action === 'approve' ? 'Approve' : 'Reject'} failed: ${d.error || r.status}` });
      } else if (action === 'approve') {
        setNotice({ ok: true, text: `Approved ${templateId}${d.already ? ' (was already in the registry)' : ''} as ${targetDraft?.hasChapters ? 'Chapter Breakdown' : 'Full Story'} — run the registry sync / redeploy, then assign it from a channel page.` });
        if (preview?.templateId === templateId) closePreview();
      } else {
        setNotice({ ok: true, text: `Rejected ${templateId} — the draft left the repo and its sample row dropped.` });
        if (preview?.templateId === templateId) closePreview();
      }
      await load();
    } catch (e) {
      setNotice({ ok: false, text: String(e.message || e).slice(0, 140) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Inbox}
        title="Drafts Inbox"
        sub="Staged bot templates awaiting your decision — watch the sample, pick the format, then approve or reject."
      >
        <button className="btn btn-outline" onClick={load} disabled={!!busy || loading}>
          <RefreshCw size={16} className={drafts === null || loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </PageHeader>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-full overflow-x-auto">
          <Segmented
            value={filterFormat}
            onChange={setFilterFormat}
            options={[
              { value: 'all', label: drafts ? `All · ${drafts.length}` : 'All' },
              { value: 'full_story', label: drafts ? `Full stories · ${fullStoryCount}` : 'Full stories' },
              { value: 'chapters', label: drafts ? `Chapter breakdowns · ${chaptersCount}` : 'Chapter breakdowns' },
            ]}
          />
        </div>
        <span className="t-11 text-muted">
          {filterFormat === 'full_story'
            ? 'Continuous documentary stories — no chapter divider cards'
            : filterFormat === 'chapters'
              ? 'Step-by-step numbered breakdowns'
              : 'Every staged draft'}
        </span>
      </div>

      {notice ? (
        <p className="t-13 whitespace-pre-wrap" role={notice.ok ? 'status' : 'alert'} style={{ color: notice.ok ? 'var(--ok-ink)' : 'var(--bad-ink)' }}>{notice.text}</p>
      ) : null}

      {error ? (
        <Card className="p-4">
          <EmptyState icon={AlertCircle} title="Can't load the drafts right now" sub={`${error} — this is not an empty inbox.`}>
            <button className="btn btn-outline btn-sm mt-3" onClick={load}><RefreshCw size={13} /> Retry</button>
          </EmptyState>
        </Card>
      ) : drafts === null ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-96 rounded-2xl" />)}
        </div>
      ) : drafts.length === 0 ? (
        <Card className="p-4">
          <EmptyState icon={Inbox} title="No staged drafts right now" sub="Draft new ones with the template bot (CLI or CI dispatch) — they land here with their sample renders." />
        </Card>
      ) : visibleDrafts.length === 0 ? (
        <Card className="p-4">
          <EmptyState icon={Inbox} title="No drafts in this format" sub="Pick another format above." />
        </Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visibleDrafts.map((d) => (
            <Card key={d.templateId} className="p-5 flex flex-col gap-3.5 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold t-16 leading-tight text-ink truncate">{d.templateId}</div>
                  <div className="t-12 text-muted mt-0.5 truncate">{(d.niches || []).join(' · ')}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <FormatChip chapters={d.narrativeFormat !== 'full_story'} />
                  {d.approval ? (
                    <Chip tone={d.approval.action === 'approve' ? 'ok' : 'plain'}>
                      {d.approval.action === 'approve' ? 'approved' : d.approval.status}
                    </Chip>
                  ) : (
                    <Chip tone="info">staged</Chip>
                  )}
                </div>
              </div>

              <div className="t-11 text-muted flex items-center gap-1.5 bg-surface-2 px-2.5 py-1.5 rounded-lg border border-line min-w-0">
                <span className="font-semibold text-ink shrink-0">{d.narrativeFormat === 'full_story' ? 'Arc:' : 'Structure:'}</span>
                <span className="truncate">{d.sections?.length ? d.sections.join(' → ') : d.formatDescription}</span>
              </div>

              {/* has_chapters toggle (default = false / Full Story) — saved on change */}
              <label className="flex items-center justify-between gap-2 p-2 rounded-xl bg-surface-2 border border-line cursor-pointer select-none">
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(d.hasChapters)}
                    onChange={(e) => toggleChapters(d.templateId, e.target.checked)}
                    className="w-4 h-4 cursor-pointer accent-[var(--accent)]"
                  />
                  <span className="t-12 font-semibold text-ink">Split into 10 chapters</span>
                </span>
                <span className="t-10 font-mono text-faint">{d.hasChapters ? '10 chapters' : 'full story'}</span>
              </label>

              <div className="flex flex-wrap gap-1.5">
                {d.style ? <Chip tone="info">{d.style}</Chip> : null}
                {d.theme ? <Chip>{d.theme}</Chip> : null}
                {d.brand ? <Chip>{d.brand}{d.badge ? ` // ${d.badge}` : ''}</Chip> : null}
                {d.voice ? <Chip>{d.voice}</Chip> : null}
                {d.musicMood ? <Chip>{d.musicMood}</Chip> : null}
              </div>

              {d.titles?.length ? (
                <div className="t-12 text-muted space-y-1 bg-surface-2 rounded-lg p-2.5 border border-line">
                  {d.titles.slice(0, 2).map((t, i) => (
                    <div key={i} className="truncate text-ink">“{String(t).replace(/^"|"$/g, '')}”</div>
                  ))}
                </div>
              ) : null}

              <PosterTile draft={d} onOpen={openPreview} />

              {d.disclaimer ? <div className="t-11 text-faint leading-snug">{d.disclaimer}</div> : null}

              <div className="mt-auto flex gap-2 pt-1">
                <button type="button" className="btn btn-primary flex-1" disabled={busy === d.templateId} onClick={() => act(d.templateId, 'approve')}>
                  <CheckCircle2 size={15} /> {busy === d.templateId ? 'Working…' : 'Approve'}
                </button>
                <button type="button" className="btn btn-danger" disabled={busy === d.templateId} onClick={() => act(d.templateId, 'reject')}>
                  <XCircle size={15} /> Reject
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Drawer
        open={!!preview}
        onClose={closePreview}
        title={preview?.templateId || ''}
        description={preview ? [(preview.niches || []).join(' · '), preview.brand ? `${preview.brand}${preview.badge ? ` (${preview.badge})` : ''}` : null].filter(Boolean).join(' · ') : ''}
        icon={Film}
        size="xl"
        footer={preview ? (
          <>
            {preview.preview?.mp4 ? (
              <a href={preview.preview.mp4} target="_blank" rel="noreferrer" className="btn btn-outline mr-auto" title="Open the raw MP4 in a new tab">
                <ExternalLink size={14} /> Open MP4
              </a>
            ) : null}
            <button type="button" className="btn btn-danger" disabled={busy === preview.templateId} onClick={() => act(preview.templateId, 'reject')}>
              <XCircle size={14} /> Reject
            </button>
            <button type="button" className="btn btn-primary" disabled={busy === preview.templateId} onClick={() => act(preview.templateId, 'approve')}>
              <CheckCircle2 size={14} /> {busy === preview.templateId ? 'Working…' : 'Approve draft'}
            </button>
          </>
        ) : null}
      >
        {preview ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <FormatChip chapters={preview.narrativeFormat !== 'full_story'} />
              {preview.style ? <Chip tone="info">{preview.style}</Chip> : null}
              {preview.theme ? <Chip>{preview.theme}</Chip> : null}
              {preview.voice ? <Chip>{preview.voice}</Chip> : null}
              <label className="flex items-center gap-1.5 ml-auto t-12 font-semibold text-ink cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={Boolean(preview.hasChapters)}
                  onChange={(e) => toggleChapters(preview.templateId, e.target.checked)}
                  className="w-4 h-4 cursor-pointer accent-[var(--accent)]"
                />
                Split into 10 chapters
              </label>
            </div>
            <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden flex items-center justify-center">
              {preview.preview?.mp4 && !videoErr ? (
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
                  <AlertCircle size={28} className="text-white/80" />
                  <div className="t-13 font-semibold">Unable to stream the sample video</div>
                  <div className="t-12 text-white/60 max-w-md">Check that BLOB_READ_WRITE_TOKEN is configured, or re-render this template&apos;s sample.</div>
                </div>
              )}
            </div>
            {preview.titles?.[0] ? (
              <p className="t-13 text-ink">Sample title pattern: “{String(preview.titles[0]).replace(/^"|"$/g, '')}”</p>
            ) : null}
            <p className="t-12 text-muted">{preview.formatDescription || (preview.narrativeFormat === 'full_story' ? 'Full continuous story arc (0 chapters)' : 'Structured 10-part chapters')}</p>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
