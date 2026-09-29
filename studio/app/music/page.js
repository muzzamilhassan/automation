'use client';
import { useState } from 'react';
import {
  Music,
  Play,
  Pause,
  Lock,
  ListMusic,
  Disc3,
  Hourglass,
  Check,
} from 'lucide-react';
import { Card, CardHead, Chip, PageHeader, BrandMark } from '@/components/ui';
import { MUSIC_POOL, MUSIC_MOODS, BRAND_META } from '@/lib/site-data';
import { cn } from '@/lib/utils';

const MOODS = ['EPIC', 'CALM', 'TECH', 'DRIVE'];
const MOOD_COLOR = {
  EPIC: '#f59e0b',
  CALM: '#34d399',
  TECH: '#38bdf8',
  DRIVE: '#8b70ff',
};

export default function MusicPage() {
  const [mood, setMood] = useState('ALL');
  const [playing, setPlaying] = useState(null);

  const tracks = MUSIC_POOL.filter((t) => mood === 'ALL' || t.mood === mood);

  return (
    <div>
      <PageHeader icon={Music} title="Music" sub="The locked 13-track pool + each channel's mood rules · 52+ tracks in the wider engine library" />

      {/* banner */}
      <Card className="p-4 mb-5 flex items-center gap-3.5" style={{ background: 'var(--accent-soft)', borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)' }}>
        <span className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>
          <Hourglass size={16} />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-ink">Keeper picks still pending</p>
          <p className="text-[12px] text-muted">You are reviewing the 40-track per-channel menu. Only tracks you approve will stay in rotation.</p>
        </div>
        <div className="ml-auto hidden sm:flex gap-2">
          <Chip tone="ok"><Check size={11} /> demo pool locked</Chip>
          <Chip tone="warn">shorts menu open</Chip>
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* pool */}
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHead
            title="Locked pool"
            sub="13 tracks approved Sep 16 · one track per video, looped"
            icon={Lock}
            right={
              <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-line bg-surface-2">
                {['ALL', ...MOODS].map((m) => (
                  <button
                    key={m}
                    onClick={() => setMood(m)}
                    className={cn('px-2 h-6 rounded-md text-[10.5px] font-bold transition-colors', mood === m ? 'text-ink' : 'text-faint hover:text-muted')}
                    style={mood === m ? { background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--line-strong)' } : undefined}
                  >
                    {m}
                  </button>
                ))}
              </div>
            }
          />
          <div className="px-2 pb-2">
            {tracks.map((t) => (
              <div key={t.name} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-2 transition-colors group">
                <button
                  className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-transform group-hover:scale-105"
                  style={{ background: `color-mix(in srgb, ${MOOD_COLOR[t.mood]} 14%, transparent)`, color: MOOD_COLOR[t.mood] }}
                  onClick={() => setPlaying(playing === t.name ? null : t.name)}
                  aria-label={playing === t.name ? `Pause ${t.name}` : `Preview ${t.name}`}
                >
                  {playing === t.name ? <Pause size={13} /> : <Play size={13} />}
                </button>
                <span className="flex-1 min-w-0">
                  <span className="block text-[12.5px] font-semibold text-ink truncate">{t.name}</span>
                  <span className="block text-[10.5px] text-faint">
                    Kevin MacLeod · CC BY · credit added automatically
                  </span>
                </span>
                {playing === t.name ? (
                  <span className="flex items-end gap-[2px] h-4" aria-hidden>
                    {[0.5, 0.9, 0.6, 1, 0.4].map((h, i) => (
                      <span
                        key={i}
                        className="w-[3px] rounded-full"
                        style={{ height: `${h * 100}%`, background: MOOD_COLOR[t.mood], animation: `pulse-dot 1s ${i * 0.12}s ease-in-out infinite` }}
                      />
                    ))}
                  </span>
                ) : null}
                <Chip tone="plain">{t.mood}</Chip>
                <Chip tone={t.brand === 'shared' ? 'info' : 'accent'}>{t.brand === 'shared' ? 'shared' : t.brand === 'tech' ? 'tech' : BRAND_META[t.brand]?.short || t.brand}</Chip>
              </div>
            ))}
          </div>
        </Card>

        {/* mood rules */}
        <div className="space-y-4">
          <Card>
            <CardHead title="Channel moods" sub="What each brand asks the music engine for" icon={Disc3} />
            <div className="px-4 pb-4 space-y-3">
              {Object.entries(MUSIC_MOODS).map(([slug, moods]) => (
                <div key={slug} className="inset-tile p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <BrandMark short={BRAND_META[slug]?.short} accent={BRAND_META[slug]?.accent} size={22} />
                    <span className="text-[12px] font-semibold text-ink truncate">{slug}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {moods.map((m) => (
                      <Chip key={m} tone="accent">{m}</Chip>
                    ))}
                  </div>
                </div>
              ))}
              <div className="inset-tile p-3">
                <div className="flex items-center gap-2 mb-2">
                  <BrandMark short="TW" accent="#39D5FF" size={22} />
                  <span className="text-[12px] font-semibold text-ink">Tech explainers</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Chip tone="info">Deliberate Thought @ 0.10</Chip>
                  <Chip tone="info">Cut Trance</Chip>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHead title="Rules the engine follows" icon={ListMusic} />
            <div className="px-4 pb-4 space-y-2 text-[12px] text-muted leading-relaxed">
              <p>· One track per video, looped to length — never shuffled mid-video.</p>
              <p>· Never reuse a track you rejected by name (Black Vortex, Shiny Tech II are out forever).</p>
              <p>· Per-brand moods only — no keyword curation. Niche research picks the pool.</p>
              <p>· Incompetech CC BY credit is appended to captions automatically.</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
