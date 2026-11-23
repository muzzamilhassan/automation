'use client';
// #106 Phase 4 T5 (S4) — /review: the script approval desk (D16/AC-P4-20/21).
// Script text left, sources right, claim↔source links, flagged-claims panel,
// the Phase 3 dedupe verdict, and — WHERE disclosure is required — the four
// official synthetic-media categories VERBATIM (support.google.com/youtube/
// answer/14328491 via research §5.7); every item must be answered before
// Approve enables (the route re-checks server-side) — pre-seeded per script
// with the owner's production-style answers (adjustable before approving).
// Approve dispatches the resume run; a dispatch failure is surfaced +
// warned, never silent. The
// thumbnail candidates render with pick buttons (D18: swap before publishAt,
// recorded-only after; unpicked = candidate 1).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, ScrollText, ShieldCheck, ThumbsUp, ThumbsDown, RefreshCw, Image as ImageIcon, AlertTriangle, ExternalLink, ArrowLeft } from 'lucide-react';
import { Card, CardHead, Chip, PageHeader, EmptyState } from '@/components/ui';
import DataTable from '@/components/DataTable';
import { useConfirm } from '@/components/ConfirmDialog';
import apiFetch from '@/components/shell/api-fetch';
import { DISCLOSURE_CATEGORIES, reviewStatusView } from '@/lib/review-actions.mjs';

const when = (iso) => (iso ? String(iso).replace('T', ' ').slice(0, 16) : '—');
const ageOf = (iso) => {
  if (!iso) return '—';
  const h = Math.max(0, (Date.now() - new Date(iso).getTime()) / 3600_000);
  return h < 1 ? `${Math.round(h * 60)}m` : h < 48 ? `${Math.round(h)}h` : `${Math.floor(h / 24)}d`;
};
const verdictTone = (v) => (v === 'pass' || v === 'unique' ? 'ok' : v ? 'warn' : 'plain');

// The owner's production style (AI voice narration + AI-generated scene
// images) pre-selects the honest synthetic-media answers: No real person /
// altered footage, Yes realistic scene + the fourth category. Defaults are
// SEEDS, not answers — the owner can change any per script before approving,
// and a future unmapped category stays unanswered (the gate still holds it).
// Defaults match the owner's documentary production: AI voice narration (NOT music-as-main-focus) +
// AI-illustrated scenes. Background music is NOT category 4 — flip music_focus per script if a video
// is genuinely centered on music.
const DISCLOSURE_DEFAULTS = { real_person: false, alters_footage: false, realistic_scene: true, music_focus: false };
const disclosureDefaults = (d) => {
  let input = d?.script?.full_render_input;
  if (typeof input === 'string') { try { input = JSON.parse(input); } catch { input = null; } }
  if (input?.disclosure?.synthetic_media_required !== true) return {}; // no checklist = no phantom answers
  return Object.fromEntries(
    DISCLOSURE_CATEGORIES.items
      .filter((i) => i.id in DISCLOSURE_DEFAULTS)
      .map((i) => [i.text, DISCLOSURE_DEFAULTS[i.id]]),
  );
};

export default function ReviewDeskPage() {
  const [pending, setPending] = useState(null);
  const [err, setErr] = useState('');
  const [detail, setDetail] = useState(null); // { script, sources, claims, thumbCandidates, thumbPick, defaultCandidate }
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [disclosure, setDisclosure] = useState({}); // category text -> boolean
  const [banner, setBanner] = useState(null);
  // approved-but-dispatch-failed (202) keeps the detail open: only THEN is
  // Redispatch a real action (the route 409s on a script that isn't approved)
  const [approvedNoDispatch, setApprovedNoDispatch] = useState(false);
  const confirm = useConfirm();

  const load = () => {
    setDetail(null);
    setNote('');
    setDisclosure({});
    setApprovedNoDispatch(false);
    apiFetch('/api/review')
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok || d.error) setErr(d.error || 'failed');
        else setPending(d.scripts || []);
      })
      .catch((e) => setErr(e.message));
  };

  const open = async (id) => {
    setErr('');
    try {
      const r = await apiFetch(`/api/review?id=${encodeURIComponent(id)}`);
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'failed');
      setDisclosure(disclosureDefaults(d)); // production-style defaults pre-selected (adjust per script)
      setDetail(d);
    } catch (e) {
      setErr(e.message);
    }
  };

  // /review?id=<script> opens that script directly (the dispatch-failure
  // warning and the Tasks list point here). Deferred a tick: both loaders
  // set state, which must not run synchronously inside an effect.
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (!alive) return;
      load();
      const id = new URLSearchParams(window.location.search).get('id');
      if (id) open(id);
    });
    return () => { alive = false; };
  }, []);

  const act = async (body, confirmText) => {
    if (confirmText && !(await confirm({ title: 'Reject this script?', body: confirmText, confirmLabel: 'Reject script', tone: 'danger' }))) return null;
    setBusy(body.action);
    setBanner(null);
    try {
      const r = await apiFetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok && r.status !== 202) throw new Error(d.error || 'failed');
      if (r.status === 202) {
        setBanner(d.warning || d.error || 'recorded');
        if (d.approved) setApprovedNoDispatch(true);
      }
      setBusy('');
      if (r.status !== 202) load();
      return d;
    } catch (e) {
      setErr(e.message);
      setBusy('');
      return null;
    }
  };

  const requiresDisclosure = (() => {
    if (!detail) return false;
    let input = detail.script.full_render_input;
    if (typeof input === 'string') { try { input = JSON.parse(input); } catch { input = null; } }
    return input?.disclosure?.synthetic_media_required === true;
  })();
  // P5 T5d (D4): the machine-appended compliance line the save recorded — the
  // owner sees EXACTLY the disclaimer text that ships in the upload
  // description. Absent (nothing declared) = nothing rendered.
  const disclaimerBlock = (() => {
    if (!detail) return '';
    let input = detail.script.full_render_input;
    if (typeof input === 'string') { try { input = JSON.parse(input); } catch { input = null; } }
    const block = input?.disclaimer_block;
    return typeof block === 'string' && block.trim() ? block : '';
  })();
  const disclosureDone = !requiresDisclosure || DISCLOSURE_CATEGORIES.items.every((i) => typeof disclosure[i.text] === 'boolean');
  // Live fix wave A4 (T2-08): the deep-link shows the script's REAL status and
  // only the actions valid for it (approved → Redispatch; published/rejected → none).
  const view = detail ? reviewStatusView(detail.script) : null;
  const flagged = (detail?.claims || []).filter((c) => c.verification && c.verification !== 'verified');

  const columns = [
    {
      key: 'title', label: 'Script', rowHeader: true,
      render: (r) => (
        <button onClick={() => open(r.id)} className="text-left cursor-pointer min-h-[44px] md:min-h-0 w-full">
          <div className="t-13 font-semibold text-ink">{r.title || '(untitled)'}</div>
          <div className="t-11 text-muted">{r.template_id || 'no template'}{r.template_version ? ` @ v${r.template_version}` : ''}</div>
        </button>
      ),
    },
    { key: 'channel_id', label: 'Channel', render: (r) => <span className="t-12">{r.channel_id}</span> },
    {
      key: 'dedupe', label: 'Dedupe',
      render: (r) => (r.dedupe_verdict
        ? <Chip tone={verdictTone(r.dedupe_verdict)} dot>{String(r.dedupe_verdict)}{r.dedupe_score != null ? ` ${(r.dedupe_score).toFixed(2)}` : ''}</Chip>
        : <span className="text-faint t-11">—</span>),
    },
    { key: 'age', label: 'Waiting', render: (r) => <span className="t-12 tnum">{ageOf(r.created_at)}</span> },
    { key: 'created', label: 'Generated', render: (r) => <span className="t-12 tnum text-muted">{when(r.created_at)}</span> },
    { key: 'publish', label: 'Slot publishAt', render: (r) => <span className="t-12 tnum text-muted">{when(r.publish_at)}</span> },
  ];

  return (
    <div>
      <PageHeader
        icon={ScrollText}
        title="Review Desk"
        sub="Fail-closed script approvals — nothing renders, uploads, or schedules until an owner approves here (staff read + prepare)."
      />

      {err && detail ? <p className="t-13 mb-4" role="alert" style={{ color: 'var(--bad-ink)' }}>{err}</p> : null}
      {banner ? (
        <p className="t-13 mb-4" role="status" style={{ color: 'var(--warn-ink)' }}>{banner}</p>
      ) : null}

      {!detail && err ? (
        <Card className="p-5 text-center">
          <p className="t-13 font-semibold text-ink">Can&apos;t load the review queue</p>
          <p className="t-12 text-faint mt-1">{err} — held scripts are safe, nothing publishes until you approve.</p>
          <button className="btn btn-outline mt-3" onClick={load}>Try again</button>
        </Card>
      ) : !detail && !pending ? (
        <div className="flex items-center gap-2 text-muted t-13 py-8"><Loader2 size={15} className="animate-spin" /> Loading queue…</div>
      ) : !detail ? (
        <Card>
          <CardHead icon={ScrollText} title="Awaiting review" sub="held scripts across the network — newest last" />
          <div className="px-5 pb-5">
            <DataTable
              label="Awaiting review"
              rows={pending || []}
              columns={columns}
              pageSize={12}
              emptyIcon={ScrollText}
              emptyTitle="Nothing awaiting review"
              emptySub="Review-gated channels hold their scripts here before any render."
            />
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={load} className="btn btn-ghost btn-sm min-h-[44px] md:min-h-0"><ArrowLeft size={14} aria-hidden />Back to queue</button>
          </div>

          <Card>
            <CardHead
              icon={ScrollText}
              title={detail.script.title || '(untitled)'}
              sub={`${detail.script.channel_id}${view.slot ? ` · ${view.slot}` : ''} · ${detail.script.template_id || 'no template'}${detail.script.template_version ? ` @ v${detail.script.template_version}` : ''} · job ${detail.script.job_id || '—'}`}
              right={<Chip tone={view.tone} dot>{view.label}</Chip>}
            />
            <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-5 min-w-0">
              {/* script text LEFT (top on phones) */}
              <div className="min-w-0">
                <h4 className="t-12 font-semibold text-muted mb-2">Script</h4>
                {disclaimerBlock ? (
                  <div className="t-12 bg-surface-2 border border-line rounded-lg p-3 mb-2">
                    <div className="t-11 font-semibold flex items-center gap-1 mb-1" style={{ color: 'var(--ok-ink)' }}>
                      <ShieldCheck size={11} /> Compliance — machine-appended to the upload description
                    </div>
                    <div className="whitespace-pre-wrap">{disclaimerBlock}</div>
                  </div>
                ) : null}
                <pre className="t-12 whitespace-pre-wrap break-words bg-surface-2 border border-line rounded-lg p-3 max-h-[420px] overflow-auto">{detail.script.text}</pre>
              </div>
              {/* sources RIGHT (below on phones) */}
              <div className="min-w-0">
                <h4 className="t-12 font-semibold text-muted mb-2">Sources</h4>
                <ul className="space-y-2 max-h-[420px] overflow-auto">
                  {detail.sources.map((s) => (
                    <li key={s.id} className="t-12 bg-surface-2 border border-line rounded-lg p-3">
                      <a href={s.url} target="_blank" rel="noreferrer" className="font-medium inline-flex items-center gap-1 break-all">
                        {s.title || s.url} <ExternalLink size={10} />
                      </a>
                      {s.snippet ? <div className="text-muted mt-1">{s.snippet}</div> : null}
                    </li>
                  ))}
                  {!detail.sources.length ? <li className="text-faint t-12">No sources recorded.</li> : null}
                </ul>
              </div>
            </div>
          </Card>

          {/* claims ↔ sources */}
          <Card>
            <CardHead icon={ShieldCheck} title="Claims" sub="every claim links the source it cites — non-verified claims are the flagged panel" />
            <div className="px-5 pb-5 space-y-2">
              {detail.claims.map((c, i) => {
                const src = detail.sources.find((x) => x.id === c.source_id);
                return (
                  <div key={c.id ?? i} className="flex flex-wrap items-start gap-2 t-12">
                    <Chip tone={c.verification === 'verified' ? 'ok' : c.verification === 'flagged' ? 'warn' : 'info'} dot>{c.verification}</Chip>
                    <span className="flex-1 min-w-0 break-words">{c.claim}</span>
                    {src
                      ? <a href={src.url} target="_blank" rel="noreferrer" className="text-muted underline break-all">source: {src.title || src.url}</a>
                      : <span className="text-faint">unsourced</span>}
                  </div>
                );
              })}
              {!detail.claims.length ? <span className="text-faint t-12">No claims recorded.</span> : null}
            </div>
          </Card>

          {flagged.length ? (
            <Card>
              <CardHead icon={AlertTriangle} title="Flagged claims" sub="every non-verified claim — resolve these before approving" />
              <div className="px-5 pb-5 space-y-2">
                {flagged.map((c, i) => (
                  <div key={c.id ?? i} className="t-12 flex flex-wrap items-center gap-2">
                    <Chip tone={c.verification === 'flagged' ? 'warn' : 'info'} dot>{c.verification}</Chip>
                    <span className="flex-1 min-w-0 break-words">{c.claim}</span>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {/* disclosure checklist — OFFICIAL wording (AC-P4-21) */}
          {requiresDisclosure && view.actions.includes('approve') ? (
            <Card>
              <CardHead
                icon={ShieldCheck}
                title="AI disclosure checklist (required)"
                sub={`Official four-category wording — ${DISCLOSURE_CATEGORIES.source} (via ${DISCLOSURE_CATEGORIES.citedFrom})`}
              />
              <div className="px-5 pb-5 space-y-3">
                {DISCLOSURE_CATEGORIES.items.map((i) => (
                  <div key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 t-12">
                    <span className="flex-1 min-w-0 basis-full md:basis-0">&ldquo;{i.text}&rdquo;</span>
                    {[true, false].map((v) => (
                      <label key={String(v)} className="inline-flex items-center gap-1 cursor-pointer min-h-[44px] md:min-h-0 px-2 md:px-0">
                        <input
                          type="radio"
                          name={`disc-${i.id}`}
                          checked={disclosure[i.text] === v}
                          onChange={() => setDisclosure((d) => ({ ...d, [i.text]: v }))}
                        />
                        {v ? 'yes' : 'no'}
                      </label>
                    ))}
                  </div>
                ))}
                <p className="t-11 text-muted">Defaults match your standard AI-voice + AI-illustrated production — adjust per script if needed.</p>
                <p className="t-11 text-muted">Disclosure itself won&rsquo;t limit reach or earnings — non-disclosure risks the label being applied manually or penalties. Answer every item; the route re-checks.</p>
              </div>
            </Card>
          ) : null}

          {/* thumbnails (D18) */}
          {detail.thumbCandidates.length ? (
            <Card>
              <CardHead
                icon={ImageIcon}
                title="Thumbnail candidates"
                sub={`pick swaps via thumbnails.set any time before publishAt — after publishAt the pick is recorded only · unpicked = candidate ${detail.defaultCandidate} · before the video uploads a pick is refused (candidate 1 is auto-set at upload)`}
              />
              <div className="px-5 pb-5 flex gap-4 flex-wrap">
                {detail.thumbCandidates.map((c) => (
                  <div key={c.idx} className="space-y-1">
                    {/* private store: the bytes are served by the route (server-side
                        meta resolution + hash check) — the raw blob URL 401s in a browser */}
                    {c.url ? <img src={`/api/review?thumb=1&id=${detail.script.id}&idx=${c.idx}`} alt={`candidate ${c.idx}`} className="rounded-lg w-40" /> : <div className="w-40 h-24 bg-surface-2 border border-line rounded-lg" />}
                    <div className="flex items-center gap-2">
                      <span className="t-11 text-muted">#{c.idx}</span>
                      {detail.thumbPick?.candidate === c.idx ? <Chip tone="accent" dot>picked</Chip> : null}
                      <button
                        onClick={() => act({ action: 'pick-thumb', id: detail.script.id, candidate: c.idx })}
                        disabled={busy === 'pick-thumb'}
                        className="btn btn-outline btn-sm min-h-[44px] md:min-h-0"
                      >
                        pick
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {/* approve / reject — only the actions valid for this status */}
          <Card>
            <CardHead
              icon={ShieldCheck}
              title="Decision"
              sub={approvedNoDispatch || view.actions.includes('redispatch')
                ? 'Approved — if no video came out, start the run again.'
                : !view.actions.includes('approve') ? `This script is ${view.label} — nothing to decide.`
                : requiresDisclosure && !disclosureDone ? 'answer every disclosure item to enable Approve (AC-P4-21)' : 'approve dispatches channel-autopilot with resume=job — the run resumes at render'}
            />
            <div className="px-5 pb-5 space-y-3">
              {view.actions.includes('approve') || view.actions.includes('reject') ? (
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="review note (recorded on the approval/rejection)"
                className="input w-full t-12"
                rows={2}
                aria-label="Review note"
              />
              ) : null}
              {/* phones: Approve + Reject share a full-width row of 44px buttons */}
              <div className="flex flex-wrap items-center gap-3">
                {view.actions.includes('approve') && !approvedNoDispatch ? (
                <button
                  onClick={() => act({ action: 'approve', id: detail.script.id, note, disclosure }, null)}
                  disabled={busy === 'approve' || !disclosureDone}
                  className="btn btn-primary min-h-[44px] md:min-h-0 flex-1 md:flex-none"
                >
                  {busy === 'approve' ? <Loader2 size={14} className="animate-spin" /> : <ThumbsUp size={14} />} Approve + resume run
                </button>
                ) : null}
                {view.actions.includes('reject') && !approvedNoDispatch ? (
                <button
                  onClick={() => act({ action: 'reject', id: detail.script.id, note }, 'Reject this script? It never uploads and the slot is skipped today.')}
                  disabled={busy === 'reject'}
                  className="btn btn-danger min-h-[44px] md:min-h-0 flex-1 md:flex-none"
                >
                  {busy === 'reject' ? <Loader2 size={14} className="animate-spin" /> : <ThumbsDown size={14} />} Reject
                </button>
                ) : null}
                {approvedNoDispatch || view.actions.includes('redispatch') ? (
                <button
                  onClick={() => act({ action: 'redispatch', id: detail.script.id }, null)}
                  disabled={busy === 'redispatch'}
                  className="btn btn-ghost btn-sm min-h-[44px] md:min-h-0 w-full md:w-auto"
                  title="re-trigger the resume dispatch for an approved script (a dispatch failure warning points here)"
                >
                  <RefreshCw size={11} /> Redispatch the approved run
                </button>
                ) : null}
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
