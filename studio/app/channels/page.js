'use client';
import { useEffect, useState } from 'react';

export default function Channels() {
  const [data, setData] = useState(null);
  useEffect(() => { fetch('/api/overview').then(r => r.json()).then(setData).catch(() => { }); }, []);
  if (!data) return <div className="p-8 text-zinc-500">Loading channels…</div>;

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <h1 className="text-white text-2xl font-bold">Channels — all platforms</h1>
      <div className="grid md:grid-cols-2 gap-4">
        {data.channels.map(c => (
          <div key={c.slug} className="card">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span style={{ color: c.accent }} className="text-lg">●</span>
                <span className="text-white font-semibold">{c.label}</span>
              </div>
              <span className={'chip ' + (c.active ? 'chip-ok' : 'chip-off')}>{c.active ? 'ACTIVE' : 'PARKED'}</span>
            </div>
            <div className="text-zinc-500 text-xs mb-3">{c.niche}</div>
            <table className="data">
              <thead><tr><th>Platform</th><th>Handle</th><th>Followers</th><th>Posts</th></tr></thead>
              <tbody>
                {c.yt ? <tr><td>▶ YouTube</td><td>{c.yt.handle || c.yt.title}</td><td>{c.yt.subs.toLocaleString()}</td><td>{c.yt.videos}</td></tr> : null}
                {c.fb ? <tr><td>📘 Facebook</td><td>@{c.fb.username || '—'}</td><td>{c.fb.followers.toLocaleString()}</td><td>—</td></tr> : null}
                {c.ig ? <tr><td>📸 Instagram</td><td>@{c.ig.username}</td><td>{c.ig.followers.toLocaleString()}</td><td>{c.ig.posts}</td></tr> : null}
                {c.slug === 'investors-compass' ? <tr><td>🎵 TikTok</td><td className="text-zinc-500">audit in progress</td><td>—</td><td>—</td></tr> : null}
              </tbody>
            </table>
            {c.yt ? <div className="text-zinc-600 text-xs mt-2">{c.yt.views.toLocaleString()} total YouTube views</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
