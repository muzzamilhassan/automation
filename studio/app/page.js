'use client';
import { useEffect, useState } from 'react';
import ActionButton from '@/components/ActionButton';

export default function Overview() {
  const [data, setData] = useState(null);
  const load = () => fetch('/api/overview').then(r => r.json()).then(setData).catch(() => { });
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);

  if (!data) return <div className="p-8 text-zinc-500">Loading empire status…</div>;
  const { channels, totals, logs, trends } = data;
  const active = channels.filter(c => c.active);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">Overview</h1>
          <p className="text-zinc-500 text-sm">{active.length} active channels · 3 platforms · content brain running</p>
        </div>
        <button onClick={load} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-900">↻ Refresh</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[['YouTube subs', totals.ytSubs], ['YouTube views', totals.ytViews], ['YT videos', totals.ytVideos], ['FB followers', totals.fbFollowers], ['IG followers', totals.igFollowers]].map(([label, v]) => (
          <div key={label} className="card">
            <div className="text-zinc-500 text-xs">{label}</div>
            <div className="stat-num">{v.toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-semibold">Today&apos;s production line</h2>
          <div className="flex gap-2 flex-wrap">
            <ActionButton action="yt-daily" slug="investors-compass" label="▶ IC Shorts" small />
            <ActionButton action="yt-daily" slug="money-rulebook" label="▶ MR Shorts" small />
            <ActionButton action="yt-daily" slug="debt-free-doctrine" label="▶ DFD Shorts" small />
            <ActionButton action="fb-crosspost" label="FB Reels" small />
            <ActionButton action="ig-crosspost" label="IG Reels" small />
            <ActionButton action="fb-images" label="FB posters" small />
          </div>
        </div>
        <table className="data">
          <thead><tr><th>Channel</th><th>Queued today</th><th>Poster</th><th>Episode</th><th>Slots (UTC)</th></tr></thead>
          <tbody>
            {channels.filter(c => c.active).map(c => (
              <tr key={c.slug}>
                <td><span style={{ color: c.accent }}>●</span> {c.label}</td>
                <td>{c.todayVideos ? `${c.todayVideos} queued` : <span className="chip chip-warn">not run today</span>}</td>
                <td>{c.imageDate === today ? <span className="chip chip-ok">done</span> : <span className="chip chip-off">—</span>}</td>
                <td>{c.deepdiveDate ? <span className="chip chip-ok">{c.deepdiveDate}</span> : <span className="chip chip-off">—</span>}</td>
                <td className="text-zinc-400">{c.slots.join(' · ')}{c.longSlot ? ` + ${c.longSlot}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="text-white font-semibold mb-3">Latest scheduled posts</h2>
          <table className="data">
            <thead><tr><th>When (UTC)</th><th>Title</th><th>Channel</th></tr></thead>
            <tbody>
              {logs.filter(l => l.videoId).slice(0, 8).map((l, i) => (
                <tr key={i}>
                  <td className="text-zinc-400 whitespace-nowrap">{(l.at || '').slice(0, 16).replace('T', ' ')}</td>
                  <td>{l.title}</td>
                  <td className="text-zinc-500">{l.slug}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2 className="text-white font-semibold mb-3">🔥 Trend radar (live from YouTube)</h2>
          {Object.entries(trends).length === 0 ? <p className="text-zinc-500 text-sm">No trend cache yet — runs with the next production batch.</p> : (
            Object.entries(trends).map(([slug, t]) => (
              <div key={slug} className="mb-3">
                <div className="text-zinc-300 text-sm font-medium mb-1">{slug}</div>
                <div className="flex flex-wrap gap-1.5">{t.keywords.map(k => <span key={k} className="chip">{k}</span>)}</div>
                <div className="text-zinc-500 text-xs mt-1.5">viral now: {t.viral.map(v => v.title).join(' · ').slice(0, 110)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
