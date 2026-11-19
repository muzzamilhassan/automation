'use client';
// The template demo media — poster first (lazy), the CI-rendered MP4 plays
// muted+looped on hover (mouse) or tap (touch). Shared by the /templates
// gallery cards and the channel template drawer (TemplateAssignPanel), so
// there is ONE preview mechanism. A template without its own render says so
// (MediaPlaceholder) — never a borrowed or simulated video.
//
// item: { name, preview: { mp4, poster } | null, ratios: string[] }
// onOpen: mouse click on the media (gallery: open details; drawer: select).
// children: optional overlay (e.g. an "Assigned" badge).
import { useRef, useState } from 'react';
import { Play, Pause, Film, Monitor, Smartphone } from 'lucide-react';
import { Skeleton } from '@/components/ui';

const RATIO_ICON = { '16:9': Monitor, '9:16': Smartphone };

// What the media area says when there is nothing to show. Each state is a
// different truth: still loading, couldn't check, or genuinely not rendered.
export function MediaPlaceholder({ previewState, hasVideo, large = false }) {
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

export default function TemplatePreviewMedia({ item, previewState, onOpen, children }) {
  const [playing, setPlaying] = useState(false);
  const [posterBroken, setPosterBroken] = useState(false);
  const pointer = useRef('mouse');
  const mp4 = item.preview?.mp4 || null;
  const poster = posterBroken ? null : item.preview?.poster || null;
  const ratios = Array.isArray(item.ratios) ? item.ratios : [];

  // touch: tap the media to play/pause; mouse: click it to open the detail
  const onMediaClick = () => {
    if (pointer.current !== 'mouse' && mp4) {
      setPlaying((p) => !p);
      return;
    }
    if (onOpen) onOpen();
  };

  return (
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
        {ratios.map((r) => {
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
      {children}
    </div>
  );
}
