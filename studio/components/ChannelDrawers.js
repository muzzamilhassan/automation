'use client';
// Round 2 — every per-channel "manage X" feature opens in its own Drawer
// (never expanded inline inside a card). Shared by the Channels list and the
// per-channel page so both open the SAME drawers:
//
//   const [drawer, setDrawer] = useState(null);           // { slug, which } | null
//   const closeDrawer = useCallback(() => setDrawer(null), []);   // keep it stable
//   <ChannelDrawers slug={drawer?.slug} label={…} open={drawer?.which} onClose={closeDrawer} />
//
// Each panel receives `frame(body, footer, opts)` and hands its content back,
// so the Drawer owns the layout (title, scroll area, sticky footer actions).
// opts = { dirty } — true while the panel holds unsaved edits.
import { CalendarDays, Layers, Image as ImageIcon, KeyRound, Route } from 'lucide-react';
import Drawer from '@/components/Drawer';
import SchedulePanel from '@/components/SchedulePanel';
import TemplateAssignPanel from '@/components/TemplateAssignPanel';
import ThumbnailAssignPanel from '@/components/ThumbnailAssignPanel';
import ChannelKeysPanel from '@/components/ChannelKeysPanel';
import ProviderRoutingPanel from '@/components/ProviderRoutingPanel';

// The drawers, in menu order. `staffOnly` = the API refuses clients, so
// clients never see the entry (no control that can't work). Descriptions stay
// at five words or fewer (owner: less text in drawer headers).
export const CHANNEL_DRAWERS = {
  schedule: { label: 'Schedule', title: 'Production schedule', description: 'Upload days and daily quota', icon: CalendarDays, size: 'md', staffOnly: true },
  templates: { label: 'Templates', title: 'Video template', description: 'Template and pinned version', icon: Layers, size: 'md', staffOnly: true },
  thumbnails: { label: 'Thumbnails', title: 'Thumbnail designs', description: 'Designs this channel uses', icon: ImageIcon, size: 'lg', staffOnly: true },
  keys: { label: 'API keys', title: 'API keys', description: 'This channel’s own keys', icon: KeyRound, size: 'lg', staffOnly: false },
  routing: { label: 'AI routing', title: 'AI routing', description: 'Which AI runs first', icon: Route, size: 'lg', staffOnly: true },
};

/** Drawer keys a given role may open (unknown role → all; the server still enforces). */
export function drawersFor(role) {
  return Object.keys(CHANNEL_DRAWERS).filter((k) => !(role === 'client' && CHANNEL_DRAWERS[k].staffOnly));
}

export default function ChannelDrawers({ slug, label, open, onClose }) {
  const cfg = open ? CHANNEL_DRAWERS[open] : null;
  if (!slug || !cfg) return null;

  // opts.dirty (live fix wave B4, T3-05): the panel has unsaved edits → the
  // Drawer asks "Discard your changes?" before any close (incl. Back).
  const frame = (body, footer, opts) => (
    <Drawer
      open
      onClose={onClose}
      title={cfg.title}
      description={`${label || slug} · ${cfg.description}`}
      icon={cfg.icon}
      size={cfg.size}
      footer={footer || undefined}
      dirty={Boolean(opts?.dirty)}
    >
      {body}
    </Drawer>
  );

  // key = slug+drawer so switching channels never carries one channel's
  // unsaved form state into another's drawer
  const k = `${open}:${slug}`;
  if (open === 'schedule') return <SchedulePanel key={k} slug={slug} frame={frame} />;
  if (open === 'templates') return <TemplateAssignPanel key={k} slug={slug} frame={frame} />;
  if (open === 'thumbnails') return <ThumbnailAssignPanel key={k} slug={slug} frame={frame} />;
  if (open === 'keys') return <ChannelKeysPanel key={k} slug={slug} frame={frame} />;
  if (open === 'routing') return <ProviderRoutingPanel key={k} slug={slug} frame={frame} />;
  return null;
}
