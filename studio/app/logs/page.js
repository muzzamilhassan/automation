'use client';
import { useEffect, useState } from 'react';

export default function Logs() {
  const [data, setData] = useState(null);
  useEffect(() => { fetch('/api/overview').then(r => r.json()).then(setData).catch(() => { }); }, []);
  if (!data) return <div className="p-8 text-zinc-500">Loading logs…</div>;

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-white text-2xl font-bold mb-4">Posting logs</h1>
      <div className="card">
        <table className="data">
          <thead><tr><th>When (UTC)</th><th>Platform</th><th>Channel</th><th>Kind</th><th>Title</th></tr></thead>
          <tbody>
            {data.logs.map((l, i) => (
              <tr key={i}>
                <td className="text-zinc-400 whitespace-nowrap">{(l.at || '').slice(0, 16).replace('T', ' ')}</td>
                <td>{l.platform}</td>
                <td className="text-zinc-400">{l.slug}</td>
                <td><span className="chip">{l.kind}</span></td>
                <td>{l.title}{l.videoId ? <> · <a className="text-blue-400" href={`https://youtube.com/shorts/${l.videoId}`} target="_blank">open</a></> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-zinc-600 text-xs mt-3">Raw run logs: <code>studio-logs/</code> in the repo. Outbox states: <code>yt-mcp/schedule-state.json</code>.</p>
      </div>
    </div>
  );
}
