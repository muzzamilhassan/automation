'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Pickaxe, Loader2, Lock } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/';
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const d = await r.json();
      if (r.ok && d.ok) {
        router.replace(next);
        router.refresh();
      } else {
        setError(d.error || 'Could not sign in.');
      }
    } catch {
      setError('Network error — try again.');
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="w-full max-w-sm card p-7 pop-in">
      <div className="flex items-center gap-3 mb-6">
        <span
          className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
          style={{ background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #22d3ee))' }}
        >
          <Pickaxe size={18} color="var(--accent-ink)" strokeWidth={2.4} />
        </span>
        <div>
          <h1 className="font-display font-bold text-[17px] tracking-tight text-ink leading-none">Quarry Studio</h1>
          <p className="text-[11px] text-faint mt-1">Command Center · private</p>
        </div>
      </div>

      <label className="overline block mb-2" htmlFor="studio-password">Password</label>
      <div className="relative">
        <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input
          id="studio-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          placeholder="Your studio password"
          className="w-full h-11 pl-9 pr-3 rounded-xl border border-line bg-surface-2 text-[14px] text-ink placeholder:text-faint outline-none focus:border-line-strong"
        />
      </div>

      {error ? <p className="text-[12px] mt-3 px-1" style={{ color: 'var(--bad)' }}>{error}</p> : null}

      <button type="submit" disabled={busy || !password} className="btn btn-primary w-full mt-5 h-11">
        {busy ? <Loader2 size={15} className="animate-spin" /> : null}
        {busy ? 'Checking…' : 'Open the studio'}
      </button>

      <p className="text-[11px] text-faint mt-5 leading-relaxed">
        The password lives in the server's environment settings, never in the code.
        After signing in, this device stays trusted for 30 days.
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 page-glow relative bg-bg">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
