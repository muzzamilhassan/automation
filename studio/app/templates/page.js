'use client';
// Video Templates — the gallery of every REAL template (registry + base
// catalog families, deduped) with its CI-rendered demo: poster first (lazy),
// the MP4 plays muted+looped on hover (mouse) or tap (touch). A template
// without its own render says so — never a borrowed or simulated video.
// Data path is the Add Channel wizard's (#115): /api/templates for the
// registry view, /api/template-previews for the media. Merge/dedupe/filter
// rules live in lib/templates-gallery.mjs (tested).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Clapperboard, Search, Inbox, Play, Pause, Film, Monitor, Smartphone, RefreshCw,
  AlertTriangle, Layers, Tv, Mic, ShieldCheck, ListOrdered, Check, Loader2,
  ArrowLeft, ArrowRight, SlidersHorizontal, Sparkles, Target,
} from 'lucide-react';
import { PageHeader, Chip, EmptyState, Skeleton, Segmented, BrandMark } from '@/components/ui';
import Drawer from '@/components/Drawer';
import { friendlyReason } from '@/components/TemplateAssignPanel';
import { useBrands } from '@/components/use-brands';
import { TEMPLATES_DATA, TEMPLATE_CATEGORIES } from '@/lib/templates-catalog';
import {
  buildGallery, galleryFacets, filterGallery, createHref, registryDetailHref,
  voiceLabel, sectionLabel, majorOf,
} from '@/lib/templates-gallery.mjs';

const RATIO_ICON = { '16:9': Monitor, '9:16': Smartphone };
const RATIO_NOTE = { '16:9': 'long-form', '9:16': 'Shorts' };

export default function TemplatesPage() {
  // registry view: loading | ready | error (error → base families still shown)
  const [reg, setReg] = useState({ status: 'loading', templates: [], role: null, error: null });
  // previews: loading | ready | error (error → cards keep honest placeholders)
  const [prev, setPrev] = useState({ status: 'loading', samples: {} });
  const [kind, setKind] = useState('all');
  const [ratio, setRatio] = useState('all');
  const [niche, setNiche] = useState('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);

  const fetchRegistry = useCallback(() => {
    fetch('/api/templates')
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(r.status === 401 ? 'not signed in' : d.error || `HTTP ${r.status}`);
        setReg({ status: 'ready', templates: d.templates || [], role: d.role || null, error: null });
      })
      .catch((e) => setReg({ status: 'error', templates: [], role: null, error: String(e.message || e) }));
  }, []);
  const fetchPreviews = useCallback(() => {
    fetch('/api/template-previews')
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.samples) throw new Error(d.error || `HTTP ${r.status}`);
        setPrev({ status: 'ready', samples: d.samples });
      })
      .catch(() => setPrev({ status: 'error', samples: {} }));
  }, []);
  useEffect(() => {
    fetchRegistry();
    fetchPreviews();
  }, [fetchRegistry, fetchPreviews]);

  const retryRegistry = () => {
    setReg((s) => ({ ...s, status: 'loading', error: null }));
    fetchRegistry();
  };
  const retryPreviews = () => {
    setPrev({ status: 'loading', samples: {} });
    fetchPreviews();
  };

  const items = useMemo(
    () => buildGallery({ catalog: TEMPLATES_DATA, registryTemplates: reg.templates, samples: prev.samples, categories: TEMPLATE_CATEGORIES }),
    [reg.templates, prev.samples],
  );
  const facets = useMemo(() => galleryFacets(items), [items]);
  const shown = useMemo(() => filterGallery(items, { kind, ratio, niche, query }), [items, kind, ratio, niche, query]);
  const openItem = useMemo(() => items.find((it) => it.id === openId) || null, [items, openId]);
  const filtersOn = kind !== 'all' || ratio !== 'all' || niche !== 'all' || query.trim() !== '';
  const clearFilters = () => { setKind('all'); setRatio('all'); setNiche('all'); setQuery(''); };
  // stable, so the Drawer's focus-trap effect doesn't re-run on parent renders
  const closeDrawer = useCallback(() => setOpenId(null), []);

  const loading = reg.status === 'loading';

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Clapperboard}
        title="Video Templates"
        sub="Every template the engine can render, with its real demo. Hover or tap a card to play it; open one to see how it's built and where it's used."
      >
        <Link className="btn btn-outline" href="/templates/drafts">
          <Inbox size={14} /> Drafts Inbox
        </Link>
        <Link className="btn btn-outline" href="/templates/registry">
          <Layers size={14} /> Registry
        </Link>
      </PageHeader>

      {/* honest status strips — the list itself always renders */}
      {reg.status === 'error' ? (
        <StatusStrip
          tone="bad"
          text={reg.error === 'not signed in'
            ? 'You are signed out — showing the base families only. Sign in again to see the full template list.'
            : "The template registry can't load right now — showing the base families only."}
          onRetry={retryRegistry}
        />
      ) : null}
      {prev.status === 'error' ? (
        <StatusStrip tone="warn" text="Previews can't load right now — template list still shown." onRetry={retryPreviews} />
      ) : null}

      {/* filter bar */}
      <div className="card p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
            <input
              type="search"
              aria-label="Search templates"
              placeholder="Search by name, niche or style…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="input w-full pl-8"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Segmented
              value={ratio}
              onChange={setRatio}
              options={[
                { value: 'all', label: 'All formats' },
                { value: '16:9', label: '16:9' },
                { value: '9:16', label: '9:16' },
              ]}
            />
            <select
              aria-label="Filter by niche"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              className="input t-12 py-1.5 w-full sm:w-auto sm:max-w-64"
            >
              <option value="all">All niches</option>
              {facets.niches.map((n) => (
                <option key={n.id} value={n.id}>{n.id} ({n.count})</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by category">
          <FilterPill active={kind === 'all'} onClick={() => setKind('all')}>All · {items.length}</FilterPill>
          {facets.kinds.map((k) => (
            <FilterPill key={k.id} active={kind === k.id} onClick={() => setKind(k.id)}>
              {k.label} · {k.count}
            </FilterPill>
          ))}
        </div>
      </div>

      {/* count line — real numbers only */}
      {!loading ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="t-12 text-muted">
            Showing <span className="text-ink font-semibold">{shown.length}</span> of {items.length} templates
            {prev.status === 'ready' ? <> · {facets.withPreview} with a rendered preview</> : null}
          </p>
          {filtersOn ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear filters</button>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <GallerySkeleton />
      ) : shown.length === 0 ? (
        <div className="card">
          <EmptyState icon={SlidersHorizontal} title="No templates match these filters" sub="Clear the search or pick another category, format or niche." />
          {filtersOn ? (
            <div className="flex justify-center pb-6 -mt-6">
              <button type="button" className="btn btn-outline btn-sm" onClick={clearFilters}>Clear filters</button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {shown.map((it) => (
            <TemplateCard key={it.id} item={it} previewState={prev.status} onOpen={() => setOpenId(it.id)} />
          ))}
        </div>
      )}

      {openItem ? (
        <TemplateDrawer
          key={openItem.id}
          item={openItem}
          role={reg.role}
          previewState={prev.status}
          onClose={closeDrawer}
        />
      ) : null}
    </div>
  );
}

function StatusStrip({ tone, text, onRetry }) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-2.5 rounded-xl border px-4 py-3"
      style={{
        borderColor: `color-mix(in srgb, var(--${tone}) 34%, transparent)`,
        background: `color-mix(in srgb, var(--${tone}) 8%, transparent)`,
      }}
    >
      <AlertTriangle size={15} className="shrink-0" style={{ color: `var(--${tone}-ink)` }} />
      <p className="t-13 flex-1 min-w-0" style={{ color: `var(--${tone}-ink)` }}>{text}</p>
      <button type="button" className="btn btn-outline btn-sm" onClick={onRetry}>
        <RefreshCw size={12} /> Retry
      </button>
    </div>
  );
}

function FilterPill({ active, onClick, children }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`chip h-7 cursor-pointer ${active ? 'chip-accent' : 'hover:text-ink'}`}
    >
      {children}
    </button>
  );
}

function GallerySkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4" aria-busy="true" aria-label="Loading templates">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="card overflow-hidden">
          <Skeleton className="aspect-video w-full rounded-none" />
          <div className="p-4 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

// What the media area says when there is nothing to show. Each state is a
// different truth: still loading, couldn't check, or genuinely not rendered.
function MediaPlaceholder({ previewState, hasVideo, large = false }) {
  if (previewState === 'loading') return <Skeleton className="absolute inset-0 rounded-none" />;
  const text = hasVideo
    ? 'Preview ready — hover or tap to play'
    : previewState === 'error'
      ? "Preview can't load right now"
      : 'Preview not rendered yet';
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
      <span className="flex items-center justify-center w-10 h-10 rounded-xl" style={{ background: 'var(--surface)', color: 'var(--faint)' }}>
        {hasVideo ? <Play size={18} /> : <Film size={18} />}
      </span>
      <span className={`${large ? 't-13' : 't-12'} font-medium text-muted`}>{text}</span>
    </div>
  );
}

function TemplateCard({ item, previewState, onOpen }) {
  const [playing, setPlaying] = useState(false);
  const [posterBroken, setPosterBroken] = useState(false);
  const pointer = useRef('mouse');
  const mp4 = item.preview?.mp4 || null;
  const poster = posterBroken ? null : item.preview?.poster || null;
  const shownNiches = item.niches.slice(0, 2);
  const moreNiches = item.niches.length - shownNiches.length;

  // touch: tap the media to play/pause; mouse: click it to open the detail
  const onMediaClick = () => {
    if (pointer.current !== 'mouse' && mp4) {
      setPlaying((p) => !p);
      return;
    }
    onOpen();
  };

  return (
    <article className="card card-hover overflow-hidden flex flex-col min-w-0">
      <div
        className="relative aspect-video cursor-pointer overflow-hidden"
        style={{ background: 'var(--surface-2)' }}
        onPointerDown={(e) => { pointer.current = e.pointerType; }}
        onPointerEnter={(e) => { if (e.pointerType === 'mouse' && mp4) setPlaying(true); }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') setPlaying(false); }}
        onClick={onMediaClick}
      >
        {poster ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={poster}
            alt={`${item.name} preview frame`}
            loading="lazy"
            decoding="async"
            onError={() => setPosterBroken(true)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : null}
        {/* the video mounts only while playing — bytes load on demand and are freed on leave */}
        {mp4 && playing ? (
          <video
            src={mp4}
            poster={poster || undefined}
            autoPlay
            muted
            loop
            playsInline
            preload="none"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : null}
        {!poster && !(mp4 && playing) ? <MediaPlaceholder previewState={previewState} hasVideo={Boolean(mp4)} /> : null}

        <div className="absolute top-2 left-2 flex flex-wrap gap-1 pointer-events-none">
          {item.ratios.map((r) => {
            const Icon = RATIO_ICON[r] || Monitor;
            return (
              <span key={r} className="t-10 font-semibold inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 bg-black/65 text-white">
                <Icon size={10} /> {r}
              </span>
            );
          })}
        </div>
        {mp4 ? (
          <button
            type="button"
            data-kit="media"
            aria-label={playing ? `Pause ${item.name} preview` : `Play ${item.name} preview`}
            onClick={(e) => { e.stopPropagation(); setPlaying((p) => !p); }}
            className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full px-2.5 h-7 t-11 font-semibold bg-black/65 text-white hover:bg-black/80"
          >
            {playing ? <Pause size={12} /> : <Play size={12} />} {playing ? 'Pause' : 'Preview'}
          </button>
        ) : null}
      </div>

      <button type="button" data-kit="tile" onClick={onOpen} className="text-left p-4 flex-1 flex flex-col gap-2 min-w-0 cursor-pointer">
        <div className="min-w-0">
          <h3 className="t-14 font-semibold text-ink truncate">{item.name}</h3>
          <p className="t-11 text-faint truncate">{item.kindLabel}</p>
        </div>
        <p className="t-12 text-muted line-clamp-2 leading-relaxed">{item.description}</p>
        <div className="mt-auto flex flex-wrap items-center gap-1 pt-1">
          {shownNiches.map((n) => <Chip key={n} className="max-w-full min-w-0"><span className="truncate min-w-0">{n}</span></Chip>)}
          {moreNiches > 0 ? <Chip>+{moreNiches}</Chip> : null}
          {!item.assignable ? <Chip tone="info">base family</Chip> : null}
          {item.deprecated ? <Chip tone="warn">deprecated</Chip> : null}
        </div>
      </button>
    </article>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <section className="space-y-2.5">
      <h3 className="overline flex items-center gap-1.5">{Icon ? <Icon size={12} /> : null}{title}</h3>
      {children}
    </section>
  );
}

function Fact({ label, value }) {
  if (!value) return null;
  return (
    <div className="inset-tile px-3 py-2 min-w-0">
      <p className="t-10 uppercase tracking-wider text-faint font-semibold">{label}</p>
      <p className="t-13 text-ink font-medium truncate">{value}</p>
    </div>
  );
}

function TemplateDrawer({ item, role, previewState, onClose }) {
  const { bySlug, channels, loaded: brandsLoaded } = useBrands();
  const [mode, setMode] = useState('detail'); // detail | assign
  const [usage, setUsage] = useState({ status: item.assignable ? 'loading' : 'n/a', rows: [] });
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text, reasons? }
  const [posterBroken, setPosterBroken] = useState(false);
  const isOwner = role === 'owner';
  const mp4 = item.preview?.mp4 || null;
  const poster = posterBroken ? null : item.preview?.poster || null;

  // which channels use it — the registry's own usage query (read-only)
  const fetchUsage = useCallback(() => {
    if (!item.assignable) return;
    fetch(`/api/templates?template=${encodeURIComponent(item.id)}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d.error) throw new Error(d.error || `HTTP ${r.status}`);
        setUsage({ status: 'ready', rows: d.usage || [] });
      })
      .catch(() => setUsage({ status: 'error', rows: [] }));
  }, [item.assignable, item.id]);
  useEffect(() => { fetchUsage(); }, [fetchUsage]);

  const usedBy = new Set(usage.rows.map((u) => u.channel_id));
  const labelFor = (slug) => bySlug[slug]?.label || slug;

  const assign = async () => {
    if (!pick) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/templates/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: pick, templateId: item.id, pinnedMajor: majorOf(item.version) ?? 1 }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 422 && Array.isArray(d.reasons)) {
        setMsg({ ok: false, text: `${labelFor(pick)} can't use this template yet:`, reasons: d.reasons });
      } else if (!r.ok) {
        const why = Array.isArray(d.errors) && d.errors.length ? d.errors.join('; ') : d.error;
        setMsg({ ok: false, text: why ? `Couldn't assign: ${why}` : `Couldn't assign right now (error ${r.status}). Try again.` });
      } else {
        setMsg({ ok: true, text: `Assigned to ${labelFor(pick)} — pinned to v${d.resolvedVersion || item.version}.` });
        setPick('');
        setMode('detail');
        setUsage((u) => ({ ...u, status: 'loading' }));
        fetchUsage();
      }
    } catch {
      setMsg({ ok: false, text: "Couldn't reach the server — check your connection and try again." });
    } finally {
      setBusy(false);
    }
  };

  const footer = mode === 'assign' ? (
    <>
      <button type="button" className="btn btn-outline" onClick={() => { setMode('detail'); setMsg(null); }}>
        <ArrowLeft size={14} /> Back
      </button>
      <button type="button" className="btn btn-primary" onClick={assign} disabled={!pick || busy}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {busy ? 'Assigning…' : 'Assign template'}
      </button>
    </>
  ) : (
    <>
      <Link className="btn btn-outline" href={createHref(item.id)}>
        <Sparkles size={14} /> Create a video with this style
      </Link>
      {item.assignable && isOwner && !item.deprecated ? (
        <button type="button" className="btn btn-primary" onClick={() => { setMode('assign'); setMsg(null); }}>
          Use on a channel… <ArrowRight size={14} />
        </button>
      ) : null}
    </>
  );

  return (
    <Drawer
      open
      onClose={onClose}
      size="xl"
      icon={Clapperboard}
      title={item.name}
      description={[item.kindLabel, item.version ? `v${item.version}` : null].filter(Boolean).join(' · ')}
      footer={footer}
    >
      {msg ? (
        <div
          role="status"
          className="rounded-xl border px-3.5 py-2.5 mb-5"
          style={{
            borderColor: `color-mix(in srgb, var(${msg.ok ? '--ok' : '--bad'}) 34%, transparent)`,
            background: `color-mix(in srgb, var(${msg.ok ? '--ok' : '--bad'}) 8%, transparent)`,
          }}
        >
          <p className="t-13 font-medium" style={{ color: `var(${msg.ok ? '--ok-ink' : '--bad-ink'})` }}>{msg.text}</p>
          {msg.reasons?.length ? (
            <ul className="mt-1.5 space-y-1">
              {msg.reasons.map((rs, i) => <li key={i} className="t-12 text-muted">— {friendlyReason(rs)}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}

      {mode === 'assign' ? (
        <div className="space-y-4">
          <div>
            <p className="t-14 font-semibold text-ink">Pick the channel that should use this template</p>
            <p className="t-12 text-muted mt-1">
              The compatibility check (niche, format, provider keys) runs before anything is saved. You can unassign it later from the channel&apos;s Templates panel.
            </p>
          </div>
          {!brandsLoaded ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : channels.length === 0 ? (
            <div className="inset-tile p-4">
              <p className="t-13 text-ink font-medium">No channels connected yet.</p>
              <Link href="/channels/add" className="btn btn-outline btn-sm mt-2">Add a channel</Link>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Channel">
              {channels.map((c) => {
                const already = usedBy.has(c.slug);
                const selected = pick === c.slug;
                return (
                  <button
                    key={c.slug}
                    type="button"
                    role="radio"
                    data-kit="tile"
                    aria-checked={selected}
                    disabled={already}
                    onClick={() => setPick(c.slug)}
                    className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left min-w-0 disabled:opacity-55 disabled:cursor-not-allowed cursor-pointer"
                    style={{
                      borderColor: selected ? 'var(--accent)' : 'var(--line)',
                      background: selected ? 'var(--accent-soft)' : 'var(--surface-2)',
                    }}
                  >
                    <BrandMark short={c.short} accent={c.accent} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="block t-13 font-medium text-ink truncate">{c.label}</span>
                      <span className="block t-11 text-faint truncate">{already ? 'already uses this template' : c.slug}</span>
                    </span>
                    {selected ? <Check size={15} style={{ color: 'var(--accent)' }} className="shrink-0" /> : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* the real render, with controls */}
          <div>
            <div className="relative aspect-video rounded-xl overflow-hidden border border-line" style={{ background: 'var(--surface-2)' }}>
              {mp4 ? (
                <video
                  src={mp4}
                  poster={poster || undefined}
                  controls
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  className="absolute inset-0 w-full h-full object-contain bg-black"
                />
              ) : poster ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={poster} alt={`${item.name} preview frame`} onError={() => setPosterBroken(true)} className="absolute inset-0 w-full h-full object-contain" />
              ) : (
                <MediaPlaceholder previewState={previewState} hasVideo={false} large />
              )}
            </div>
            <p className="t-11 text-faint mt-1.5">
              {mp4
                ? `Real render from the engine${item.preview?.renderedAt ? ` · ${String(item.preview.renderedAt).slice(0, 10)}` : ''} — sound off by default, use the player to unmute.`
                : poster
                  ? 'Still frame only — the video preview has not rendered yet.'
                  : previewState === 'error'
                    ? "Previews can't load right now — try again in a minute."
                    : 'No preview has been rendered for this template yet.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Chip tone="accent">{item.kindLabel}</Chip>
            {item.ratios.map((r) => {
              const Icon = RATIO_ICON[r] || Monitor;
              return <Chip key={r}><Icon size={11} /> {r} {RATIO_NOTE[r] || ''}</Chip>;
            })}
            {!item.assignable ? <Chip tone="info">base family · not assignable</Chip> : null}
            {item.deprecated ? <Chip tone="warn">deprecated — no new assignments</Chip> : null}
          </div>

          <div className="space-y-1.5">
            <p className="t-13 text-muted leading-relaxed">{item.description}</p>
            {item.usedFor ? <p className="t-12 text-faint">Best for: {item.usedFor}</p> : null}
          </div>

          <Section icon={Target} title="What it's for">
            {item.niches.length ? (
              <div className="flex flex-wrap gap-1.5">{item.niches.map((n) => <Chip key={n}>{n}</Chip>)}</div>
            ) : (
              <p className="t-12 text-muted">No niches declared — this base family has no registry entry, so channels can&apos;t be assigned to it directly.</p>
            )}
          </Section>

          {item.structure.sections.length || item.structure.beats.length ? (
            <Section icon={ListOrdered} title="How each video is built">
              {item.structure.formatLabel ? <p className="t-13 text-ink font-medium">{item.structure.formatLabel}</p> : null}
              {item.structure.sections.length ? (
                <ol className="flex flex-wrap items-center gap-1.5">
                  {item.structure.sections.map((s, i) => (
                    <li key={`${s}-${i}`} className="flex items-center gap-1.5">
                      <span className="chip"><span className="text-faint">{i + 1}</span> {sectionLabel(s)}</span>
                      {i < item.structure.sections.length - 1 ? <ArrowRight size={11} className="text-faint" aria-hidden /> : null}
                    </li>
                  ))}
                </ol>
              ) : null}
              {item.structure.chapterMinWords ? (
                <p className="t-12 text-faint">Each chapter runs at least {item.structure.chapterMinWords} words.</p>
              ) : null}
              {item.structure.beats.length ? (
                <div className="inset-tile p-3">
                  <p className="t-11 font-semibold text-faint mb-1.5">Story beats</p>
                  <ol className="space-y-1.5 list-decimal pl-4">
                    {item.structure.beats.map((b, i) => <li key={i} className="t-12 text-muted">{b}</li>)}
                  </ol>
                </div>
              ) : null}
              {item.structure.hookClasses.length ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="t-11 text-faint font-semibold">Hook styles</span>
                  {item.structure.hookClasses.map((h) => <Chip key={h}>{h}</Chip>)}
                </div>
              ) : null}
              {item.structure.titlePatterns.length ? (
                <div>
                  <p className="t-11 font-semibold text-faint mb-1">Title patterns</p>
                  <ul className="space-y-1">{item.structure.titlePatterns.map((p, i) => <li key={i} className="t-12 text-muted">— {p}</li>)}</ul>
                </div>
              ) : null}
              {item.structure.payoffRule ? <p className="t-12 text-muted"><span className="text-faint font-semibold">Ending: </span>{item.structure.payoffRule}</p> : null}
            </Section>
          ) : null}

          <Section icon={Mic} title="Look & sound">
            {item.look.voice || item.look.musicMood || item.look.theme || item.look.style ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Fact label="Voice" value={voiceLabel(item.look.voice)} />
                <Fact label="Music mood" value={item.look.musicMood} />
                <Fact label="Visual theme" value={item.look.theme} />
                <Fact label="Style" value={item.look.style} />
              </div>
            ) : (
              <p className="t-12 text-muted">Uses the channel&apos;s own voice and music settings.</p>
            )}
            {item.look.layouts.length ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="t-11 text-faint font-semibold">Layout sequence</span>
                {item.look.layouts.map((l, i) => <Chip key={`${l}-${i}`}>{l}</Chip>)}
              </div>
            ) : null}
            {item.look.variants.length ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="t-11 text-faint font-semibold">Layout variants</span>
                {item.look.variants.map((v) => <Chip key={v}>{v}</Chip>)}
              </div>
            ) : null}
          </Section>

          {item.assignable ? (
            <Section icon={Tv} title="Channels using it">
              {usage.status === 'loading' ? (
                <div className="space-y-2">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
              ) : usage.status === 'error' ? (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="t-12 text-muted">Can&apos;t check which channels use this right now.</p>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => { setUsage({ status: 'loading', rows: [] }); fetchUsage(); }}>
                    <RefreshCw size={12} /> Retry
                  </button>
                </div>
              ) : usage.rows.length === 0 ? (
                <p className="t-12 text-muted">No channel uses this template yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {usage.rows.map((u) => {
                    const b = bySlug[u.channel_id];
                    return (
                      <li key={u.channel_id} className="inset-tile flex items-center gap-2.5 px-3 py-2 min-w-0">
                        {b ? <BrandMark short={b.short} accent={b.accent} size={26} /> : null}
                        <span className="min-w-0 flex-1">
                          <span className="block t-13 font-medium text-ink truncate">{labelFor(u.channel_id)}</span>
                          <span className="block t-11 text-faint">pinned v{u.pinned_version}</span>
                        </span>
                        <Link href={`/channels/${encodeURIComponent(u.channel_id)}`} className="btn btn-ghost btn-sm shrink-0">
                          Open <ArrowRight size={12} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
              {!isOwner && role ? <p className="t-11 text-faint">Only the owner can assign templates to channels.</p> : null}
            </Section>
          ) : null}

          {item.assignable ? (
            <Section icon={ShieldCheck} title="Safety & review">
              <div className="flex flex-wrap gap-1.5">
                {item.safety.sources ? <Chip tone="ok">sources required</Chip> : <Chip>sources optional</Chip>}
                {item.safety.review.length
                  ? item.safety.review.map((r) => <Chip key={r} tone="warn">{r} review before publish</Chip>)
                  : <Chip>no pre-publish review</Chip>}
              </div>
              {item.safety.disclaimers.map((d) => <p key={d} className="t-12 text-faint italic">&ldquo;{d}&rdquo;</p>)}
              <Link href={registryDetailHref(item.id)} className="btn btn-ghost btn-sm">
                Full registry record <ArrowRight size={12} />
              </Link>
            </Section>
          ) : null}
        </div>
      )}
    </Drawer>
  );
}
