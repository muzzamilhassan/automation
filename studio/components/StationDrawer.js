'use client';
// Creator City — Station drawer (research §5 item 7, 2026-11-23). One
// station of one channel: its settings in ONE place, then its last 5 results.
// Opened from the big dots in RunStepsDrawer and from the Stations row on
// /channels/[slug]. Owner + staff only (the history API refuses clients).
//
// Settings are never rebuilt here — lib/station-settings.mjs maps each
// station to what already exists:
//   panel    the SAME manage panel ChannelDrawers embeds (VoicePanel,
//            SchedulePanel), through an inline `frame`; its unsaved edits
//            make this drawer ask "Discard?" before closing (dirty)
//   facts    a compact summary from the APIs those panels read
//   access   a 401/403 on a fact or panel source = a calm muted "Owner only"
//            line; real failures stay red with Retry (lib sourceState)
//   actions  open the existing Manage drawer (ChannelDrawers, nested on top),
//            or go to /topics, /review, Edit channel
// Last 5: GET /api/stations/history (fixed state words from STATE_WORD).
//
// Nested drawers: every open Drawer listens for Escape on the document, so
// the drawer UNDER a nested one ignores close requests while the nested one
// is open (useGuardedClose) — Escape / Back close only the top drawer.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Lightbulb, PenLine, UserCheck, Mic, Film, Image as ImageIcon, Upload,
  History, AlertTriangle, RotateCw, Settings2, ArrowUpRight,
} from 'lucide-react';
import Drawer from '@/components/Drawer';
import ChannelDrawers from '@/components/ChannelDrawers';
import VoicePanel from '@/components/VoicePanel';
import SchedulePanel from '@/components/SchedulePanel';
import { Chip, EmptyState, Skeleton } from '@/components/ui';
import apiFetch from '@/components/shell/api-fetch';
import {
  settingsFor, factSources, panelSources, panelSourceOf, panelAccess, sourceState, factsFailed, stationFacts,
  historyUrl, historyView, OWNER_ONLY,
} from '@/lib/station-settings.mjs';
import { editHref } from '@/lib/channel-health.mjs';
import { stamp } from '@/lib/runs-view.mjs';

const ICON = { topic: Lightbulb, script: PenLine, approval: UserCheck, voice: Mic, render: Film, thumbnail: ImageIcon, upload: Upload };

// The manage panels small enough to sit inside the station drawer (the rest
// open their own Manage drawer). Same components ChannelDrawers renders.
const PANELS = { voice: VoicePanel, schedule: SchedulePanel };

const SOURCE_URL = {
  profile: (slug) => `/api/channels/profile?slug=${encodeURIComponent(slug)}`,
  templates: (slug) => `/api/templates?channel=${encodeURIComponent(slug)}`,
  schedule: (slug) => `/api/channels/schedule?slug=${encodeURIComponent(slug)}`,
};

const TONE_INK = { warn: 'var(--warn-ink)', bad: 'var(--bad-ink)', muted: 'var(--muted)' };

/**
 * onClose for a drawer that can have another drawer open ON TOP of it: while
 * `childOpen`, close requests are ignored (the child closes itself). The ref
 * is updated after render, so the Escape that closes the child is still
 * ignored here even though this drawer's listener runs first.
 */
export function useGuardedClose(onClose, childOpen) {
  const childRef = useRef(childOpen);
  useEffect(() => { childRef.current = childOpen; }, [childOpen]);
  return useCallback(() => { if (!childRef.current) onClose?.(); }, [onClose]);
}

// Inline frame for an embedded panel: body, then its own actions; reports
// the panel's unsaved state up so the station drawer can guard its close.
function InlineFrame({ id, body, footer, dirty, onDirty }) {
  useEffect(() => { onDirty(id, dirty); }, [id, dirty, onDirty]);
  useEffect(() => () => onDirty(id, false), [id, onDirty]);
  return (
    <div className="space-y-3 min-w-0">
      {body}
      {footer ? <div className="flex flex-wrap items-center justify-end gap-2">{footer}</div> : null}
    </div>
  );
}

// source = the probe of the API the panel reads: wait while loading, a calm
// "Owner only" when this role is refused, else the panel itself (it shows its
// own load error + Retry on a real failure).
function EmbeddedPanel({ drawer, slug, onDirty, source }) {
  const frame = useCallback(
    (body, footer, opts) => <InlineFrame id={drawer} body={body} footer={footer} dirty={Boolean(opts?.dirty)} onDirty={onDirty} />,
    [drawer, onDirty],
  );
  const Panel = PANELS[drawer];
  if (!Panel) return null;
  const access = panelAccess(source);
  if (access === 'loading') return <Skeleton className="h-24 rounded-xl" />;
  if (access === 'denied') return <p className="t-12 text-muted">{OWNER_ONLY}</p>;
  return <Panel slug={slug} frame={frame} />;
}

// Live data for a list of sources (lib sourceState: ok | denied | error).
// Reloads when `version` changes (a Manage drawer closed, or Retry).
function useSources(slug, wanted, version) {
  const [state, setState] = useState({ key: null, sources: {} });
  const list = wanted.join(',');
  const key = `${slug}:${list}:${version}`;
  useEffect(() => {
    if (!list) return;
    let alive = true;
    for (const src of list.split(',')) {
      apiFetch(SOURCE_URL[src](slug))
        .then(async (r) => sourceState(r.status, await r.json().catch(() => null)))
        .catch(() => ({ status: 'error' }))
        .then((got) => {
          if (alive) setState((s) => ({ key, sources: { ...(s.key === key ? s.sources : {}), [src]: got } }));
        });
    }
    return () => { alive = false; };
  }, [slug, list, key]);
  return state.key === key ? state.sources : {};
}

function Facts({ facts, failed, onRetry }) {
  if (!facts.length) return null;
  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {facts.map((f) => (
          <div key={f.label} className="inset-tile p-3 min-w-0">
            <dt className="overline mb-1">{f.label}</dt>
            <dd className="t-13 text-ink break-words" style={TONE_INK[f.tone] ? { color: TONE_INK[f.tone] } : undefined}>
              {f.value == null ? <Skeleton className="h-4 w-24" /> : f.value}
            </dd>
          </div>
        ))}
      </dl>
      {failed ? (
        <button type="button" className="btn btn-outline btn-sm" onClick={onRetry}>
          <RotateCw size={13} aria-hidden /> Retry
        </button>
      ) : null}
    </div>
  );
}

function Actions({ items, slug, onManage }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((a) => {
        if (a.type === 'manage') {
          return (
            <button key={`m-${a.drawer}-${a.label}`} type="button" className="btn btn-outline btn-sm" onClick={() => onManage(a.drawer)}>
              <Settings2 size={13} aria-hidden /> {a.label}
            </button>
          );
        }
        const href = a.type === 'edit' ? editHref(slug) : a.href;
        return (
          <Link key={`l-${href}`} href={href} className="btn btn-outline btn-sm">
            {a.label} <ArrowUpRight size={13} aria-hidden />
          </Link>
        );
      })}
    </div>
  );
}

function LastFive({ slug, station }) {
  const url = historyUrl(slug, station);
  const [attempt, setAttempt] = useState(0);
  const key = `${url}#${attempt}`;
  const [res, setRes] = useState({ key: null, view: null });

  useEffect(() => {
    if (!url) return;
    let alive = true;
    apiFetch(url)
      .then((r) => r.json().catch(() => null))
      .then((body) => { if (alive) setRes({ key, view: historyView(body) }); })
      .catch(() => { if (alive) setRes({ key, view: { kind: 'error', rows: [] } }); });
    return () => { alive = false; };
  }, [url, key]);

  const view = !url ? { kind: 'error', rows: [] } : res.key === key ? res.view : null;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  if (!view) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading results">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-9 rounded-lg" />)}
      </div>
    );
  }
  if (view.kind === 'error') {
    return (
      <EmptyState icon={AlertTriangle} title="Couldn't load results">
        <button type="button" className="btn btn-outline btn-sm mt-3" onClick={() => setAttempt((a) => a + 1)}>
          <RotateCw size={13} aria-hidden /> Retry
        </button>
      </EmptyState>
    );
  }
  if (view.kind === 'empty') return <EmptyState icon={History} title="No results yet" />;
  return (
    <ol className="rounded-xl border border-line divide-y divide-[var(--line)]">
      {view.rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 min-w-0">
          <Chip tone={r.tone}>{r.word}</Chip>
          <span className="t-12 text-muted tnum min-w-0 flex-1">{r.at ? stamp(r.at, timeZone) : '—'}</span>
          {r.duration ? <span className="t-11 text-faint tnum font-mono">{r.duration}</span> : null}
          {r.error ? <p className="basis-full t-12 break-words" style={{ color: 'var(--bad-ink)' }}>{r.error}</p> : null}
          {!r.error && r.note ? <p className="basis-full t-12 text-muted break-words">{r.note}</p> : null}
        </li>
      ))}
    </ol>
  );
}

function StationBody({ slug, label, station, onClose }) {
  const cfg = settingsFor(station);
  const [dirtyBy, setDirtyBy] = useState({});
  const onDirty = useCallback((id, v) => setDirtyBy((m) => (Boolean(m[id]) === v ? m : { ...m, [id]: v })), []);
  const dirty = Object.values(dirtyBy).some(Boolean);
  const [manage, setManage] = useState(null); // ChannelDrawers key open on top, or null
  const [version, setVersion] = useState(0);
  // a closed Manage drawer may have changed a setting → read the facts again
  const closeManage = useCallback(() => { setManage(null); setVersion((v) => v + 1); }, []);
  const guardedClose = useGuardedClose(onClose, Boolean(manage));
  const sources = useSources(slug, factSources(station), version);
  const facts = stationFacts(station, sources);
  const retryFacts = useCallback(() => setVersion((v) => v + 1), []);
  // the panel probe never reloads (a reload would remount the panel and drop its edits)
  const panelProbe = useSources(slug, panelSources(station), 0);

  return (
    <>
      <Drawer open onClose={guardedClose} title={`${cfg.title} · ${label || slug}`} icon={ICON[station]} size="lg" dirty={dirty}>
        <div className="space-y-6 min-w-0">
          <section aria-label="Settings" className="space-y-3 min-w-0">
            {cfg.sections.map((sec, i) => {
              if (sec.kind === 'facts') return <Facts key={i} facts={facts} failed={factsFailed(station, sources)} onRetry={retryFacts} />;
              if (sec.kind === 'actions') return <Actions key={i} items={sec.items} slug={slug} onManage={setManage} />;
              if (sec.kind === 'panel') return <EmbeddedPanel key={i} drawer={sec.drawer} slug={slug} onDirty={onDirty} source={panelProbe[panelSourceOf(sec.drawer)]} />;
              return null;
            })}
          </section>
          <section className="min-w-0">
            <h3 className="overline mb-2">Last 5</h3>
            <LastFive slug={slug} station={station} />
          </section>
        </div>
      </Drawer>
      <ChannelDrawers slug={slug} label={label} open={manage} onClose={closeManage} />
    </>
  );
}

/** open + slug + station (a lib/stations.mjs key); label = the channel's display name. */
export default function StationDrawer({ open, onClose, slug, label, station }) {
  if (!open || !slug || !settingsFor(station)) return null;
  // key: switching station/channel never carries one panel's unsaved edits into another
  return <StationBody key={`${slug}:${station}`} slug={slug} label={label} station={station} onClose={onClose} />;
}
