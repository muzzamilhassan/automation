'use client';
// Feedback round 1 (2026-11-19, item H) — "Open channel" on the Channels list
// opens THIS large drawer instead of leaving the list. It shows the channel's
// status, today, the next upload and the schedule, plus quick actions that
// open the shared manage drawers (ChannelDrawers). The parent keeps ONE drawer
// state, so a quick action REPLACES this drawer — never two open at once:
//
//   const manageFromOverview = useCallback((which) => setDrawer((d) => (d ? { ...d, which } : d)), []);
//   <ChannelOverviewDrawer open={drawer?.which === 'overview'} onManage={manageFromOverview} … />
//
// Item D: no warning sentences anywhere. A REAL open problem (bell/Inbox) shows
// as one small red dot / one red line linking to the Inbox — nothing more.
// `ChannelStatus` is shared with /channels/[slug] so both read the same.
import Link from 'next/link';
import { Tv, CalendarDays } from 'lucide-react';
import Drawer from '@/components/Drawer';
import { Chip } from '@/components/ui';
import { CHANNEL_DRAWERS, drawersFor } from '@/components/ChannelDrawers';
import { when, timeAgo } from '@/lib/utils';
import { youtubeConnection, nextScheduled, channelHref } from '@/lib/channel-health.mjs';
import {
  todayStatus, uploadedToday, nextSlot, scheduleSummary, INBOX_HREF, PROBLEM_LABEL,
} from '@/lib/channel-overview.mjs';

function localTime(at) {
  return at ? at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
}

/** Small red dot for a card: "Has a problem — see Inbox". */
export function ProblemDot() {
  return (
    <Link
      href={INBOX_HREF}
      aria-label={PROBLEM_LABEL}
      title={PROBLEM_LABEL}
      className="inline-flex items-center justify-center w-6 h-6 rounded-full shrink-0 hover:bg-surface-2"
    >
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--bad)' }} aria-hidden />
    </Link>
  );
}

/** The same signal as one short line (drawer + per-channel page). */
function ProblemLine() {
  return (
    <Link href={INBOX_HREF} className="t-12 font-semibold inline-flex items-center gap-1.5 hover:underline" style={{ color: 'var(--bad-ink)' }}>
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--bad)' }} aria-hidden />
      {PROBLEM_LABEL}
    </Link>
  );
}

function StatusTile({ label, value, tone = 'plain', sub }) {
  const color = { ok: 'var(--ok-ink)', bad: 'var(--bad-ink)' }[tone] || 'var(--ink)';
  return (
    <div className="inset-tile p-3 min-w-0">
      <div className="overline mb-1">{label}</div>
      <div className="t-13 font-semibold truncate" style={{ color }} title={typeof value === 'string' ? value : undefined}>{value}</div>
      {sub ? <div className="t-11 text-faint mt-0.5 truncate" title={sub}>{sub}</div> : null}
    </div>
  );
}

/** Status tiles for one overview row: YouTube, autopilot, today, next upload. Facts only. */
export function ChannelStatus({ c, logs, now, hasProblem }) {
  const conn = youtubeConnection(c);
  const today = todayStatus(c, now);
  const live = uploadedToday(logs, c.slug, now);
  const next = nextScheduled(logs, c.slug, now);
  const slot = next ? null : nextSlot(c, now);
  return (
    <div className="space-y-3">
      {hasProblem ? <ProblemLine /> : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        <StatusTile label="YouTube" value={conn.text} tone={conn.state === 'ok' ? 'ok' : conn.state === 'error' ? 'bad' : 'plain'} sub={conn.detail} />
        <StatusTile label="Autopilot" value={c.flowPaused ? 'Paused' : 'On'} tone={c.flowPaused ? 'plain' : 'ok'} />
        <StatusTile label="Today" value={today.text} tone={today.tone} sub={live ? `${live} uploaded today` : 'None uploaded yet today'} />
        {next ? (
          <StatusTile label="Next upload" value={when(next.at)} sub={`${timeAgo(next.at)} · ${next.kind || 'video'}`} />
        ) : slot ? (
          <StatusTile label="Next slot" value={`${slot.hhmm} UTC`} sub={`${slot.kind} · ${localTime(slot.at)} your time`} />
        ) : (
          <StatusTile label="Next slot" value="No slot set" />
        )}
      </div>
    </div>
  );
}

export default function ChannelOverviewDrawer({ channel, logs, open, onClose, onManage, role, hasProblem }) {
  if (!open || !channel) return null;
  const now = new Date();
  const schedule = scheduleSummary(channel);
  return (
    <Drawer open onClose={onClose} title={channel.label || channel.slug} icon={Tv} size="xl">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {channel.flowPaused ? <Chip tone="plain">Paused</Chip> : <Chip tone="ok" dot>Active</Chip>}
          <Link href={channelHref(channel.slug)} className="t-12 text-muted hover:text-ink hover:underline">
            Full page ↗
          </Link>
        </div>

        <ChannelStatus c={channel} logs={logs} now={now} hasProblem={hasProblem} />

        <section>
          <h3 className="overline mb-2 flex items-center gap-1.5"><CalendarDays size={11} aria-hidden /> Schedule</h3>
          {schedule.length ? (
            <ul className="space-y-1">
              {schedule.map((line) => (
                <li key={line} className="t-13 text-ink tnum">{line}</li>
              ))}
            </ul>
          ) : (
            <p className="t-12 text-faint">No slot set</p>
          )}
        </section>

        <section>
          <h3 className="overline mb-2">Manage</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {drawersFor(role).map((k) => {
              const d = CHANNEL_DRAWERS[k];
              const Icon = d.icon;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => onManage(k)}
                  className="inset-tile p-3 flex items-center gap-2.5 min-w-0 text-left hover:bg-surface-2 transition-colors"
                >
                  <Icon size={16} className="text-muted shrink-0" aria-hidden />
                  <span className="t-13 font-semibold text-ink truncate">{d.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </Drawer>
  );
}
