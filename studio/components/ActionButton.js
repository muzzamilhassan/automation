'use client';
import { useState } from 'react';

export default function ActionButton({ action, slug = null, label, small = false }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const run = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, slug }) });
      const d = await r.json();
      setMsg(d.started ? '▶ started — watch Logs' : (d.error || 'failed'));
    } catch (e) { setMsg('error: ' + e.message); }
    setBusy(false);
  };
  return (
    <span>
      <button onClick={run} disabled={busy} className={(small ? 'text-xs px-2.5 py-1 ' : 'px-3.5 py-1.5 text-sm ') + 'rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 hover:border-zinc-500 text-zinc-100 transition disabled:opacity-40'}>
        {busy ? '⏳ starting…' : label}
      </button>
      {msg ? <span className="ml-2 text-xs text-zinc-400">{msg}</span> : null}
    </span>
  );
}
