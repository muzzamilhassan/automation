'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Music,
  Play,
  Pause,
  Lock,
  ListMusic,
  Disc3,
  Volume2,
  Loader2,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardHead, Chip, PageHeader, BrandMark, EmptyState, PageSkeleton } from '@/components/ui';
import { moodText } from '@/lib/channel-overview.mjs'; // wave C3 (T3-07): live kit mood, no static map
import { useBrands } from '@/components/use-brands'; // #125: live brand marks
import MUSIC_URLS from '@/lib/music-urls.json';
import { cn } from '@/lib/utils';

export default function MusicPage() {
  const { bySlug: BRAND } = useBrands(); // #125: live short/accent per slug

  // no hardcoded default channel: the first live channel is picked once the
  // overview answers (no-static-maps directive)
  const [slug, setSlug] = useState('');
  const [chans, setChans] = useState(null); // T4d: registry-driven tabs from the overview payload
  const [loadErr, setLoadErr] = useState('');
  const [nonce, setNonce] = useState(0);
  const [playingTitle, setPlayingTitle] = useState(null);
  const [loadingTitle, setLoadingTitle] = useState(null);
  const [playErr, setPlayErr] = useState('');
  const audioRef = useRef(null);

  const tracks = MUSIC_URLS[slug] || [];

  useEffect(() => {
    let alive = true;
    (async () => {
      const d = await fetch('/api/overview').then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!alive) return;
      if (!d) { setLoadErr("Can't load your channels right now."); return; }
      // Round 1 (#106): controlChannels (unfiltered by the production filter)
      // keeps a channel's tab when its live YouTube read errors.
      const list = (d?.controlChannels || d?.channels || []).map((c) => ({ slug: c.slug, label: c.label || c.slug, accent: c.accent, musicFeels: c.musicFeels }));
      setLoadErr('');
      setChans(list);
      // first channel that actually has a pool, else the first channel
      setSlug((cur) => cur || (list.find((c) => (MUSIC_URLS[c.slug] || []).length) || list[0])?.slug || '');
    })();
    return () => { alive = false; };
  }, [nonce]);

  // stop audio when leaving the page
  useEffect(() => () => { if (audioRef.current) audioRef.current.pause(); }, []);

  const switchChannel = (s) => {
    if (audioRef.current) audioRef.current.pause();
    setPlayingTitle(null);
    setSlug(s);
  };

  const toggle = (track) => {
    if (!track.url) return;
    if (playingTitle === track.title) {
      audioRef.current.pause();
      setPlayingTitle(null);
      return;
    }
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.pause();
    audioRef.current = new Audio(track.url);
    audioRef.current.volume = 0.7;
    setLoadingTitle(track.title);
    audioRef.current.onplaying = () => { setPlayingTitle(track.title); setLoadingTitle(null); };
    audioRef.current.onended = () => setPlayingTitle(null);
    setPlayErr('');
    const fail = () => { setLoadingTitle(null); setPlayingTitle(null); setPlayErr(`Couldn't play "${track.title}" — the free source didn't answer. Renders use the stored original, so videos are unaffected.`); };
    audioRef.current.onerror = fail;
    audioRef.current.play().catch(fail);
  };

  const header = <PageHeader icon={Music} title="Music" sub="Each channel's own approved tracks — click play to preview (streams from the free source; renders download the original)" />;
  if (loadErr && !chans) {
    return (
      <div>
        {header}
        <Card className="p-4">
          <EmptyState icon={AlertTriangle} title={loadErr} sub="The music pools are fine — only this view couldn't read the channel list.">
            <button className="btn btn-outline btn-sm mt-3" onClick={() => setNonce((n) => n + 1)}><RefreshCw size={13} /> Retry</button>
          </EmptyState>
        </Card>
      </div>
    );
  }
  if (!chans) return <PageSkeleton />;
  const moodLine = moodText(chans.find((c) => c.slug === slug)?.musicFeels);
  const moods = moodLine ? moodLine.split(' · ') : null;

  return (
    <div>
      <PageHeader icon={Music} title="Music" sub="Each channel's own approved tracks — click play to preview (streams from the free source; renders download the original)" />

      {/* channel selector */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <div className="inline-flex items-center gap-0.5 p-1 rounded-xl border border-line bg-surface flex-wrap">
          {chans.map((c) => (
            <button
              key={c.slug}
              type="button"
              aria-pressed={slug === c.slug}
              onClick={() => switchChannel(c.slug)}
              className={cn('px-3 h-8 rounded-lg t-11 font-semibold transition-colors flex items-center gap-1.5', slug === c.slug ? 'text-ink' : 'text-faint hover:text-muted')}
              style={slug === c.slug ? { background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line-strong)' } : undefined}
            >
              <BrandMark short={BRAND[c.slug]?.short || '•'} accent={c.accent || 'var(--accent)'} size={16} />
              {c.label}
            </button>
          ))}
        </div>
        {slug ? <Chip tone="accent">{tracks.length} tracks in this channel&apos;s pool</Chip> : null}
      </div>
      {playErr ? <p className="t-12 mb-3" role="alert" style={{ color: 'var(--bad-ink)' }}>{playErr}</p> : null}

      <div className="grid lg:grid-cols-3 gap-4">
        {/* playable pool */}
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHead
            title={(chans.find((c) => c.slug === slug)?.label || slug) + ' — approved pool'}
            sub="These are the only tracks this channel's videos use · one track per video"
            icon={Lock}
          />
          <div className="px-2 pb-2">
            {!tracks.length ? (
              <EmptyState icon={Music} title="No approved tracks for this channel" sub="Videos for this channel render without a pool track until one is added." />
            ) : null}
            {tracks.map((t) => {
              const isPlaying = playingTitle === t.title;
              const isLoading = loadingTitle === t.title;
              const disabled = !t.url;
              return (
                <div key={t.title} className={cn('flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors', !disabled && 'hover:bg-surface-2')}>
                  <button
                    disabled={disabled}
                    className="icon-btn shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                    style={isPlaying ? { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'var(--accent)' } : undefined}
                    onClick={() => toggle(t)}
                    aria-label={isPlaying ? `Pause ${t.title}` : `Play ${t.title}`}
                  >
                    {isLoading ? <Loader2 size={13} className="animate-spin" /> : isPlaying ? <Pause size={13} /> : <Play size={13} />}
                  </button>
                  <span className="flex-1 min-w-0">
                    <span className={cn('block t-12 font-semibold truncate', isPlaying ? 'text-accent' : 'text-ink')}>{t.title}</span>
                    <span className="block t-10 text-faint">
                      {disabled ? 'no online preview — file kept locally' : 'Kevin MacLeod · CC BY · credit added automatically'}
                    </span>
                  </span>
                  {isPlaying ? (
                    <span className="flex items-end gap-[2px] h-4" aria-hidden>
                      {[0.5, 0.9, 0.6, 1, 0.4].map((h, i) => (
                        <span
                          key={i}
                          className="w-[3px] rounded-full"
                          style={{ height: `${h * 100}%`, background: 'var(--accent)', animation: `pulse-dot 1s ${i * 0.12}s ease-in-out infinite` }}
                        />
                      ))}
                    </span>
                  ) : (
                    <Volume2 size={13} className="text-faint" />
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* side cards */}
        <div className="space-y-4">
          {moods ? (
            <Card>
              <CardHead title="Requested moods" sub="The feel this channel's pool aims for" icon={Disc3} />
              <div className="px-4 pb-4 flex flex-wrap gap-1.5">
                {moods.map((m) => <Chip key={m} tone="accent">{m}</Chip>)}
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHead title="Rules the engine follows" icon={ListMusic} />
            <div className="px-4 pb-4 space-y-2 t-12 text-muted leading-relaxed">
              <p>· Only THIS channel&apos;s approved pool — on shorts, episodes and reels alike.</p>
              <p>· One track per video. Long videos RESTART the same track when it ends — never a second song.</p>
              <p>· Renders download the original file; this page streams a preview.</p>
              <p>· Kevin MacLeod CC BY credit is added to captions automatically.</p>
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}
