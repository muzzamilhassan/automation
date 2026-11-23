'use client';
// Settings › Accounts — every connected account, checked for real by
// /api/accounts (lib/accounts-health.mjs). One row per account: platform,
// channel, a status chip with fixed words, one muted line, and the single fix
// button. Anything the server couldn't check reads "Can't check" — never a guess.
import { useCallback, useEffect, useState } from 'react';
import { AtSign, Loader2, RefreshCw, Plug } from 'lucide-react';
import Link from 'next/link';
import { Card, Chip, EmptyState, Skeleton } from '@/components/ui';
import { YoutubeIcon, FacebookIcon, InstagramIcon } from '@/components/BrandIcons';
import { STATUS_WORDS, accountsSummary, accountLine } from '@/lib/accounts-health.mjs';

const ICON = { youtube: YoutubeIcon, facebook: FacebookIcon, instagram: InstagramIcon, threads: AtSign };
const TONE = { connected: 'ok', needs_relogin: 'bad', not_connected: 'warn', unknown: 'plain' };

function FixButton({ fix, busy, onOauth }) {
  if (!fix) return null;
  if (fix.action === 'oauth') {
    return (
      <button type="button" className="btn btn-primary btn-sm shrink-0" disabled={busy} onClick={onOauth}>
        {busy ? <Loader2 size={13} className="animate-spin" /> : null}{fix.label}
      </button>
    );
  }
  if (!fix.href) return null;
  if (fix.href.startsWith('/')) return <Link href={fix.href} className="btn btn-outline btn-sm shrink-0">{fix.label}</Link>;
  return <a href={fix.href} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm shrink-0">{fix.label}</a>;
}

function AccountRow({ a, busy, onOauth }) {
  const Icon = ICON[a.kind] || Plug;
  const line = accountLine(a);
  return (
    <div className="flex items-center gap-3 inset-tile px-3 py-2.5 min-w-0">
      <Icon size={16} className="text-faint shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="t-12 font-semibold text-ink truncate">{a.channel?.name || a.label}</span>
          {a.handle ? <span className="t-11 text-faint truncate">{a.handle}</span> : null}
          <Chip tone={TONE[a.status] || 'plain'} dot>{STATUS_WORDS[a.status] || STATUS_WORDS.unknown}</Chip>
        </span>
        {line ? <span className="block t-11 text-muted truncate mt-0.5" title={line}>{line}</span> : null}
      </span>
      <FixButton fix={a.fix} busy={busy} onOauth={onOauth} />
    </div>
  );
}

export default function AccountsTab() {
  // null = loading · 'error' · { accounts, fetchedAt }
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(null);
  const [oauthErr, setOauthErr] = useState('');

  const load = useCallback(async (fresh = false) => {
    try {
      const r = await fetch('/api/accounts' + (fresh ? '?fresh=1' : ''), { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !Array.isArray(d.accounts)) throw new Error(d.error || 'HTTP ' + r.status);
      setData({ accounts: d.accounts, fetchedAt: d.fetchedAt });
    } catch {
      setData('error');
    }
  }, []);

  useEffect(() => {
    // deferred a tick: the loader sets state, which must not run synchronously in an effect
    let alive = true;
    Promise.resolve().then(() => { if (alive) load(); });
    return () => { alive = false; };
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  };
  const retry = () => {
    setData(null);
    load();
  };

  // the same Google sign-in the channel pages use (owner-only /api/oauth/start)
  const reconnect = async (id) => {
    setOauthBusy(id);
    setOauthErr('');
    try {
      const r = await fetch('/api/oauth/start');
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.url) {
        window.location.assign(d.url);
        return;
      }
      setOauthErr(d.error || `Couldn't start the Google sign-in (the server answered ${r.status}).`);
    } catch (e) {
      setOauthErr(`Couldn't start the Google sign-in — ${e.message || 'network error'}.`);
    }
    setOauthBusy(null);
  };

  const accounts = data && data !== 'error' ? data.accounts : [];
  const youtube = accounts.filter((a) => a.kind === 'youtube');
  const other = accounts.filter((a) => a.kind !== 'youtube');
  const summary = accountsSummary(accounts);

  return (
    <Card className="p-5 min-w-0">
      <div className="flex items-center justify-between gap-3 mb-4 min-w-0">
        <span className="t-13 font-semibold text-ink min-w-0 truncate">
          {data === null ? 'Checking accounts…' : data === 'error' ? 'Accounts' : summary.text}
        </span>
        <button
          type="button"
          className="btn btn-outline btn-sm shrink-0"
          onClick={refresh}
          disabled={refreshing || data === null}
          aria-label="Check all accounts again"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : undefined} /> Refresh
        </button>
      </div>

      {oauthErr ? <p className="t-12 mb-3" role="alert" style={{ color: 'var(--bad-ink)' }}>{oauthErr}</p> : null}

      {data === null ? (
        <div className="space-y-1.5" aria-busy="true">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
        </div>
      ) : data === 'error' ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="t-12" role="alert" style={{ color: 'var(--bad-ink)' }}>Can&apos;t load the accounts right now.</p>
          <button type="button" className="btn btn-outline btn-sm" onClick={retry}>Retry</button>
        </div>
      ) : !accounts.length ? (
        <EmptyState icon={Plug} title="No accounts yet">
          <Link href="/channels/add" className="btn btn-outline btn-sm mt-3">Add a channel</Link>
        </EmptyState>
      ) : (
        <div className="space-y-5">
          {[['YouTube', youtube], ['Other', other]].map(([title, rows]) => (rows.length ? (
            <section key={title} className="min-w-0">
              <div className="overline mb-2">{title}</div>
              <div className="space-y-1.5">
                {rows.map((a) => (
                  <AccountRow key={a.id} a={a} busy={oauthBusy === a.id} onOauth={() => reconnect(a.id)} />
                ))}
              </div>
            </section>
          ) : null))}
        </div>
      )}
    </Card>
  );
}
