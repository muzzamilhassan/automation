'use client';
// Phase 2 (I5) — one channel = one place. Health, today's production, schedule,
// topics, recent uploads and settings shortcuts for ONE channel, all from real
// data (/api/overview + /api/me). Unknown data says so; it never reads "Healthy".
// Feedback round 1 (2026-11-19, D5): no warning-reason list — status tiles are
// shared with the Channels drawer (ChannelStatus) and a REAL open problem shows
// as ONE red line linking to the Inbox.
// 2026-11-21 ("100% ready before anything publishes"): a "Ready to publish
// N/7" checklist card (fixes open the drawers or Edit profile), and Resume
// stays locked until the channel is 7/7 — the flow route refuses it too (409).
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Tv, ArrowLeft, RefreshCw, Pause, Play, CalendarDays, Lightbulb, Film, Settings2,
  PenLine, Image as ImageIcon, BarChart3, Cpu, ExternalLink, AlertTriangle, Lock, SearchX,
} from 'lucide-react';
import { Card, CardHead, Chip, EmptyState, PageSkeleton, BrandMark } from '@/components/ui';
import { useBrands } from '@/components/use-brands';
import ChannelDrawers, { CHANNEL_DRAWERS, drawersFor } from '@/components/ChannelDrawers';
import { ChannelStatus } from '@/components/ChannelOverviewDrawer';
import ReadinessChecklist from '@/components/ReadinessChecklist';
import { useReadiness } from '@/components/use-readiness';
import { useConfirm } from '@/components/ConfirmDialog';
import { useOpenWarnings } from '@/components/use-open-warnings';
import { PageMissingMark } from '@/components/shell/page-missing';
import { fmt, when } from '@/lib/utils';
import {
  resolveChannelView, validSlots, realUploads, editHref,
} from '@/lib/channel-health.mjs';
import {
  channelHasRealProblem, recentUploads, slotLocalText, needsSetup, SETUP_TEXT,
} from '@/lib/channel-overview.mjs';
import { channelDisplayName, channelInitials } from '@/lib/channel-display.mjs';
import { KIND_LABEL } from '@/lib/library-view.mjs';

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

function safeDecode(v) {
  if (typeof v !== 'string') return '';
  try { return decodeURIComponent(v); } catch { return v; }
}

function Shortcut({ href, icon: Icon, title, sub }) {
  return (
    <Link href={href} className="inset-tile p-3 flex items-center gap-3 min-w-0 hover:bg-surface-2 transition-colors">
      <Icon size={16} className="text-muted shrink-0" />
      <span className="min-w-0">
        <span className="block t-13 font-semibold text-ink truncate">{title}</span>
        <span className="block t-11 text-faint truncate">{sub}</span>
      </span>
    </Link>
  );
}

// Same look as Shortcut, but opens one of the shared channel drawers in place.
function DrawerShortcut({ icon: Icon, title, sub, onClick }) {
  return (
    <button type="button" onClick={onClick} className="inset-tile p-3 flex items-center gap-3 min-w-0 text-left hover:bg-surface-2 transition-colors">
      <Icon size={16} className="text-muted shrink-0" aria-hidden />
      <span className="min-w-0">
        <span className="block t-13 font-semibold text-ink truncate">{title}</span>
        <span className="block t-11 text-faint truncate">{sub}</span>
      </span>
    </button>
  );
}

// Wave C3 (T3-10): this channel's OWN upload records (/api/library, the same
// source as the Library page) — never the 20-row global log, which skipped
// months and showed duplicate pairs. One row per title + day (the published
// one), newest 10. Dates are on the viewer's clock.
function RecentUploads({ slug }) {
  const [state, setState] = useState({ phase: 'loading', rows: [], note: '' });
  useEffect(() => {
    let live = true;
    fetch(`/api/library?slug=${encodeURIComponent(slug)}&limit=60`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        if (!live) return;
        const rows = recentUploads(d.items, 10);
        setState({ phase: 'done', rows, note: d.complete === false ? "Some upload records couldn't be read right now — this list may be missing some." : '' });
      })
      .catch(() => { if (live) setState({ phase: 'done', rows: [], note: "Couldn't load this channel's uploads right now." }); });
    return () => { live = false; };
  }, [slug]);

  if (state.phase === 'loading') return <p className="t-12 text-muted">Loading uploads…</p>;
  return (
    <div className="space-y-2">
      {state.note ? <p className="t-12 text-muted">{state.note}</p> : null}
      {state.rows.length ? (
        <ul className="divide-y divide-[var(--line)]">
          {state.rows.map((u) => (
            <li key={`${u.id || u.videoId || u.title}-${u.at}`} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
              <Chip tone={u.status === 'scheduled' ? 'info' : u.status === 'published' ? 'ok' : 'plain'}>
                {u.status === 'scheduled' ? 'Scheduled' : u.status === 'published' ? 'Published' : 'Unknown'}
              </Chip>
              <span className="t-11 text-faint shrink-0">{KIND_LABEL[u.kind] || 'Video'}</span>
              {u.videoId && YT_ID.test(u.videoId) ? (
                <a href={`https://www.youtube.com/watch?v=${u.videoId}`} target="_blank" rel="noreferrer" className="t-13 text-ink break-words min-w-0 flex-1 hover:underline">
                  {u.title} <ExternalLink size={11} className="inline text-faint" aria-hidden />
                </a>
              ) : (
                <span className="t-13 text-ink break-words min-w-0 flex-1">{u.title}</span>
              )}
              <span className="t-11 text-faint tnum shrink-0">{u.at ? when(u.at) : '—'}</span>
            </li>
          ))}
        </ul>
      ) : !state.note ? (
        <p className="t-12 text-muted">No uploads recorded for this channel yet.</p>
      ) : null}
    </div>
  );
}

// Live list from YouTube. /api/thumbs/videos is capped at 20 checks/hour, so it
// only runs when asked, at most once per page view.
function LiveUploads({ slug }) {
  const [state, setState] = useState({ phase: 'idle', videos: [], note: '' });
  const asked = useRef(false);
  const load = () => {
    if (asked.current) return;
    asked.current = true;
    setState({ phase: 'loading', videos: [], note: '' });
    fetch(`/api/thumbs/videos?slug=${encodeURIComponent(slug)}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (r.status === 429) return setState({ phase: 'done', videos: [], note: 'Too many YouTube checks this hour — try again later.' });
        if (r.status === 403) return setState({ phase: 'done', videos: [], note: 'This channel is not linked to your account.' });
        if (!r.ok) return setState({ phase: 'done', videos: [], note: "Couldn't reach YouTube right now." });
        const videos = realUploads(d.videos, slug);
        const note = d.error
          ? (videos.length ? "YouTube couldn't be reached — these come from the last run's record." : "Couldn't reach YouTube right now — no live list.")
          : (videos.length ? '' : 'YouTube returned no uploads for this channel.');
        setState({ phase: 'done', videos, note });
      })
      .catch(() => setState({ phase: 'done', videos: [], note: "Couldn't reach YouTube right now." }));
  };

  if (state.phase === 'idle') {
    return (
      <button type="button" className="btn btn-outline btn-sm" onClick={load}>
        <RefreshCw size={14} /> Check YouTube for the latest uploads
      </button>
    );
  }
  if (state.phase === 'loading') return <p className="t-12 text-muted">Checking YouTube…</p>;
  return (
    <div className="space-y-2">
      {state.note ? <p className="t-12 text-muted">{state.note}</p> : null}
      {state.videos.length ? (
        <ul className="grid sm:grid-cols-2 gap-2">
          {state.videos.slice(0, 6).map((v) => (
            <li key={v.videoId} className="inset-tile p-2 flex items-center gap-2.5 min-w-0">
              {/* remote YouTube thumbnail — no next/image domain config needed */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {v.thumb ? <img src={v.thumb} alt="" className="w-20 h-[45px] object-cover rounded shrink-0" loading="lazy" /> : null}
              <a href={`https://www.youtube.com/watch?v=${v.videoId}`} target="_blank" rel="noreferrer" className="min-w-0">
                <span className="block t-12 font-semibold text-ink truncate">{v.title}</span>
                <span className="block t-11 text-faint">{v.publishedAt ? when(v.publishedAt) : '—'}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function ChannelPage() {
  const params = useParams();
  const slug = safeDecode(params?.slug);
  const { bySlug } = useBrands();
  const [data, setData] = useState(null); // null = loading; { error } = failed
  const [role, setRole] = useState(null);
  const [meDone, setMeDone] = useState(false); // wait for the role so a client never flashes "not found"
  const confirm = useConfirm();
  const { rows: openWarningRows } = useOpenWarnings(); // REAL problems only → one red line
  // the 7-item publish checklist (same answer the engine uses)
  const { bySlug: readinessBySlug, status: readinessStatus, reload: reloadReadiness } = useReadiness(slug);
  // which shared channel drawer is open (schedule | templates | thumbnails | keys | routing)
  const [drawer, setDrawer] = useState(null);
  // stable (Drawer re-focuses when onClose changes); a closed drawer may have
  // changed a checklist item, so the readiness is read again
  const closeDrawer = useCallback(() => { setDrawer(null); reloadReadiness(); }, [reloadReadiness]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback((fresh = false) => {
    return fetch(fresh ? '/api/overview?fresh=1' : '/api/overview')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch(() => setData({ error: true }));
  }, []);

  useEffect(() => {
    load();
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setRole(d?.role || null))
      .catch(() => setRole(null))
      .finally(() => setMeDone(true));
  }, [load]);

  // pause/resume through the same flow route the Channels list uses
  const setFlow = async (on) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/channels/flow', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, on }),
      });
      const d = await r.json().catch(() => ({}));
      setMsg(r.ok
        ? { tone: 'ok', text: on ? 'Autopilot resumed — the next daily run will produce again.' : 'Autopilot paused — already-scheduled videos still publish.' }
        : r.status === 409
          ? { tone: 'bad', text: `Can't resume yet. ${d.error || 'This channel is not ready to publish.'}` }
          : { tone: 'bad', text: `${on ? 'Resume' : 'Pause'} failed — ${d.error || `HTTP ${r.status}`}` });
    } catch (e) {
      setMsg({ tone: 'bad', text: `${on ? 'Resume' : 'Pause'} failed — ${String(e?.message || e)}` });
    }
    setBusy(false);
    reloadReadiness();
    // the overview is cached; only the owner may force a fresh pull
    load(role === 'owner');
  };

  if (data === null || !meDone) return <PageSkeleton />;

  const back = (
    <Link href="/channels" className="btn btn-outline btn-sm">
      <ArrowLeft size={14} /> All channels
    </Link>
  );
  const view = resolveChannelView(slug, data, role);

  if (view.kind === 'error') {
    return (
      <Card className="p-5">
        <EmptyState icon={AlertTriangle} title="Couldn't load this channel right now" sub="The channel data didn't arrive. Nothing is wrong with the channel itself as far as we know — status unknown." />
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => { setData(null); load(); }}>
            <RefreshCw size={14} /> Retry
          </button>
          {back}
        </div>
      </Card>
    );
  }
  if (view.kind === 'not-linked') {
    return (
      <Card className="p-5">
        <EmptyState icon={Lock} title="This channel isn't linked to your account" sub="Ask the studio owner to link it if you should be able to see it." />
        <div className="flex justify-center">{back}</div>
      </Card>
    );
  }
  if (view.kind === 'not-found' || view.kind === 'invalid') {
    // T1-24: a clean, friendly not-found; the mark makes the shell's crumb say "Page not found"
    return (
      <Card className="p-5">
        <PageMissingMark />
        <EmptyState icon={SearchX} title="Channel not found" sub="This channel doesn't exist. It may have been removed or renamed." />
        <div className="flex justify-center">
          <Link href="/channels" className="btn btn-primary btn-sm">
            <ArrowLeft size={14} aria-hidden /> Back to Channels
          </Link>
        </div>
      </Card>
    );
  }
  if (view.kind === 'parked') {
    return (
      <div>
        <div className="mb-4">{back}</div>
        <Card className="p-5">
          <div className="flex items-center gap-3 min-w-0 mb-2">
            <BrandMark short={channelInitials(view.row.label, slug) || bySlug[slug]?.short || '•'} accent={view.row.accent || 'var(--faint)'} size={40} />
            <h1 className="font-display t-16 font-bold text-ink truncate">{channelDisplayName(view.row.label, slug)}</h1>
            <Chip tone="plain">Parked</Chip>
          </div>
          <p className="t-13 text-muted">{"This channel isn't producing, so there's no health or schedule to show. It wakes up when you activate it."}</p>
        </Card>
      </div>
    );
  }

  const c = view.row;
  const label = channelDisplayName(c.label, slug); // wave C3 (T3-23): one display name everywhere
  const now = new Date();
  const offsetMin = -now.getTimezoneOffset();
  const hasProblem = channelHasRealProblem(openWarningRows, slug);
  const slots = validSlots(c.slots);
  const longSlot = validSlots([c.longSlot])[0] || null;
  const handle = c.yt && !c.yt.error ? (c.yt.handle || c.yt.title) : c.handle;
  const isClient = role === 'client';
  const drawerKeys = drawersFor(role);
  const readiness = readinessBySlug[slug] || null; // null = still checking / unknown (the server still decides)
  const resumeLocked = Boolean(readiness && !readiness.ready);
  const askPause = async () => {
    const ok = await confirm({
      title: `Pause ${label}?`,
      body: 'Nothing new will be made. Videos already scheduled on YouTube still publish.',
      confirmLabel: 'Pause autopilot',
      tone: 'danger',
    });
    if (ok) setFlow(false);
  };
  // same confirm as the Channels list's Manage menu
  const askResume = async () => {
    const ok = await confirm({
      title: `Resume ${label}?`,
      body: 'The next daily run produces new videos again.',
      confirmLabel: 'Resume autopilot',
      tone: 'primary',
    });
    if (ok) setFlow(true);
  };

  return (
    <div>
      {/* breadcrumb + actions */}
      <nav aria-label="Breadcrumb" className="t-12 text-muted mb-3 flex items-center gap-1.5 min-w-0">
        <Link href="/channels" className="hover:text-ink">Channels</Link>
        <span aria-hidden>/</span>
        <span className="text-ink truncate">{label}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          <BrandMark short={channelInitials(c.label, slug) || bySlug[slug]?.short || '•'} accent={c.accent || 'var(--accent)'} size={48} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <h1 className="font-display font-bold leading-tight tracking-tight text-ink truncate" style={{ fontSize: 'var(--text-2xl)' }}>{label}</h1>
              {c.flowPaused ? <Chip tone="plain">Paused</Chip> : <Chip tone="ok" dot>Active</Chip>}
            </div>
            {needsSetup(c) ? (
              <p className="t-12 text-faint mt-0.5">
                {SETUP_TEXT}{handle ? ` · ${handle}` : ''} · <Link href={editHref(slug)} className="underline underline-offset-2 hover:text-ink">Finish setup</Link>
              </p>
            ) : (
              <p className="t-12 text-muted mt-0.5 truncate">
                {[c.niche, handle].filter(Boolean).join(' · ') || '—'}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {c.flowPaused ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || resumeLocked}
              title={resumeLocked ? `Not ready to publish (${readiness.done}/${readiness.total}) — finish the checklist below` : undefined}
              onClick={askResume}
            >
              <Play size={14} /> {resumeLocked ? `Resume — not ready (${readiness.done}/${readiness.total})` : 'Resume autopilot'}
            </button>
          ) : (
            <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={askPause}>
              <Pause size={14} /> Pause
            </button>
          )}
          <button type="button" className="btn btn-outline btn-sm" onClick={() => { setData(null); load(); }}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {msg ? (
        <p role="status" aria-live="polite" className="t-12 mb-3" style={{ color: msg.tone === 'bad' ? 'var(--bad-ink)' : 'var(--ok-ink)' }}>
          {msg.text}
        </p>
      ) : null}

      {/* status — facts only; a real problem is one red line to the Inbox */}
      <Card className="p-4 mb-4">
        <ChannelStatus c={c} logs={data.logs} now={now} hasProblem={hasProblem} />
      </Card>

      {/* the 7 things a channel needs before anything publishes */}
      <Card className="p-4 mb-4">
        <ReadinessChecklist slug={slug} r={readiness} status={readinessStatus} onOpen={setDrawer} canOpen={(place) => drawerKeys.includes(place)} />
      </Card>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        {/* today & schedule */}
        <Card>
          <CardHead
            title="Today & schedule"
            icon={CalendarDays}
            right={drawerKeys.includes('schedule') ? (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setDrawer('schedule')}>Change schedule</button>
            ) : null}
          />
          <dl className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="inset-tile p-3 min-w-0">
              <dt className="overline mb-1">Shorts upload slots</dt>
              <dd className="t-12 text-ink tnum">
                {slots.length ? slots.map((s) => `${s} UTC${slotLocalText(s, now, offsetMin) ? ` (your time: ${slotLocalText(s, now, offsetMin)})` : ''}`).join(' · ') : 'No slot set'}
              </dd>
            </div>
            <div className="inset-tile p-3 min-w-0">
              <dt className="overline mb-1">Long-form slot</dt>
              <dd className="t-12 text-ink tnum">{longSlot ? `${longSlot} UTC${slotLocalText(longSlot, now, offsetMin, c.docDays) ? ` (next, your time: ${slotLocalText(longSlot, now, offsetMin, c.docDays)})` : ''}` : '—'}</dd>
            </div>
            <div className="inset-tile p-3 min-w-0">
              <dt className="overline mb-1">Long-form days</dt>
              <dd className="t-12 text-ink">{Array.isArray(c.docDays) && c.docDays.length ? c.docDays.join(' · ') : 'None set'}</dd>
            </div>
            <div className="inset-tile p-3 min-w-0">
              <dt className="overline mb-1">Shorts come from</dt>
              <dd className="t-12 text-ink">
                {c.shortsSource === 'clips' ? 'Clips from long videos' : c.shortsSource === 'generated' ? 'Made fresh each day' : c.shortsSource || '—'}
                {c.clipQueue ? (
                  <span className="block t-11 text-faint mt-0.5 tnum">
                    Clip queue: {c.clipQueue.remaining} of {c.clipQueue.total} left{c.clipQueue.broken ? ` · ${c.clipQueue.broken} can't be posted` : ''}
                  </span>
                ) : null}
              </dd>
            </div>
          </dl>
        </Card>

        {/* topics */}
        <Card>
          <CardHead
            title="Topics"
            icon={Lightbulb}
            sub="The latest picks — each shows the day it was picked (UTC)"
          />
          <div className="px-5 pb-5 space-y-2.5">
            {/* wave A3: each pick carries its own date — never the frozen last-run date */}
            {c.episodeTopic ? (
              <div className="inset-tile p-3">
                <div className="overline mb-1">Long-form episode{c.episodeTopicAt ? ` · picked ${c.episodeTopicAt}` : ''}</div>
                <p className="t-13 text-ink">{c.episodeTopic}</p>
              </div>
            ) : null}
            {Array.isArray(c.todayTopics) && c.todayTopics.length ? (
              <div className="overline">Shorts topics{c.todayTopicsAt ? ` · picked ${c.todayTopicsAt}` : ''}</div>
            ) : null}
            {Array.isArray(c.todayTopics) && c.todayTopics.length ? (
              <ul className="space-y-1.5">
                {c.todayTopics.map((t, i) => (
                  <li key={`${i}-${t}`} className="t-12 text-ink flex gap-2 min-w-0">
                    <span className="text-faint tnum shrink-0">{i + 1}.</span>
                    <span className="min-w-0">{t}</span>
                  </li>
                ))}
              </ul>
            ) : !c.episodeTopic ? (
              <p className="t-12 text-muted">No topics recorded.</p>
            ) : null}
          </div>
        </Card>
      </div>

      {/* recent uploads */}
      <Card className="mb-4">
        <CardHead title="Recent uploads" icon={Film} sub="This channel's latest 10, newest first · dates in your time" />
        <div className="px-5 pb-5 space-y-3">
          <RecentUploads slug={slug} />
          <LiveUploads slug={slug} />
        </div>
      </Card>

      {/* audience (only numbers YouTube actually returned) */}
      {c.yt && !c.yt.error ? (
        <Card className="mb-4 p-4">
          <div className="flex flex-wrap gap-x-6 gap-y-2 t-12 text-muted">
            <span><b className="text-ink tnum">{fmt(c.yt.subs)}</b> subscribers</span>
            <span><b className="text-ink tnum">{fmt(c.yt.views)}</b> views all-time</span>
            <span><b className="text-ink tnum">{fmt(c.yt.videos)}</b> videos</span>
            {c.fb ? <span><b className="text-ink tnum">{fmt(c.fb.followers)}</b> Facebook followers</span> : null}
            {c.ig ? <span><b className="text-ink tnum">{fmt(c.ig.followers)}</b> Instagram followers</span> : null}
          </div>
        </Card>
      ) : null}

      {/* settings shortcuts */}
      <Card>
        <CardHead title="Settings" icon={Settings2} sub="Change how this channel works" />
        <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {!isClient ? <Shortcut href={editHref(slug)} icon={PenLine} title="Edit channel" sub="Niche, video style, voice, schedule" /> : null}
          {drawerKeys.map((k) => (
            <DrawerShortcut key={k} icon={CHANNEL_DRAWERS[k].icon} title={CHANNEL_DRAWERS[k].label} sub={CHANNEL_DRAWERS[k].description} onClick={() => setDrawer(k)} />
          ))}
          <Shortcut href="/thumbs" icon={ImageIcon} title="Thumbnail studio" sub="Make and test thumbnails" />
          <Shortcut href="/analytics" icon={BarChart3} title="Analytics" sub="Views, watch time, subscribers" />
          {!isClient ? <Shortcut href="/providers" icon={Cpu} title="AI services" sub="Workspace-wide AI providers & keys" /> : null}
          <Shortcut href="/channels" icon={Tv} title="All channels" sub="Back to the channel list" />
        </div>
      </Card>

      <ChannelDrawers slug={slug} label={label} open={drawer} onClose={closeDrawer} />
    </div>
  );
}
