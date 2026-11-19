'use client';
// Social — every account the engine posts to, from LIVE data only
// (/api/overview: YouTube, Facebook, Instagram stats + registry Threads
// handles). Round 2 removed the hand-written TikTok/Pinterest tabs and the
// static "platform health" notes: they showed statuses ("LIVE", "token
// expiring Oct 29") that nothing checked — the honesty doctrine forbids that.
// Health below is computed from the same payload, so it is never stale.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Share2, AtSign, CheckCircle2, AlertTriangle, RefreshCw, ChevronRight } from 'lucide-react';
import { YoutubeIcon, FacebookIcon, InstagramIcon } from '@/components/BrandIcons';
import { Card, CardHead, Chip, PageHeader, PageSkeleton, BrandMark, EmptyState, Segmented } from '@/components/ui';
import { useBrands } from '@/components/use-brands'; // #125: live brand marks
import { fmt } from '@/lib/utils';

const PLATFORMS = [
  { value: 'youtube', label: 'YouTube', icon: YoutubeIcon, unit: 'subs' },
  { value: 'facebook', label: 'Facebook', icon: FacebookIcon, unit: 'followers' },
  { value: 'instagram', label: 'Instagram', icon: InstagramIcon, unit: 'followers' },
  { value: 'threads', label: 'Threads', icon: AtSign, unit: null },
];

const stripAt = (h) => String(h || '').replace(/^@/, '');

// one row per channel for the chosen platform — { linked, handle, count, error }
function accountOf(c, platform) {
  if (platform === 'youtube') {
    if (!c.yt) return { linked: false };
    if (c.yt.error) return { linked: true, error: c.yt.error, handle: c.yt.handle };
    return { linked: true, handle: c.yt.handle || c.yt.title, count: c.yt.subs };
  }
  if (platform === 'facebook') return c.fb ? { linked: true, handle: c.fb.username || c.fb.name, count: c.fb.followers } : { linked: false };
  if (platform === 'instagram') return c.ig ? { linked: true, handle: c.ig.username, count: c.ig.followers } : { linked: false };
  return c.threadsHandle ? { linked: true, handle: c.threadsHandle, count: null } : { linked: false };
}

export default function Social() {
  const { bySlug: BRAND } = useBrands(); // #125: live short/accent per slug

  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('youtube');
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    fetch('/api/overview')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`the server answered ${r.status}`))))
      .then((d) => { if (alive) { setData(d); setErr(''); } })
      .catch((e) => { if (alive) setErr(e.message || 'network error'); });
    return () => { alive = false; };
  }, [nonce]);

  if (err && !data) {
    return (
      <div>
        <PageHeader icon={Share2} title="Social" sub="Every account the engine posts to — live reach and link status" />
        <Card className="p-4">
          <EmptyState icon={AlertTriangle} title="Can't load your accounts right now" sub={`${err} — this is not "no accounts", the list just couldn't be read.`}>
            <button className="btn btn-outline btn-sm mt-3" onClick={() => setNonce((n) => n + 1)}><RefreshCw size={13} /> Retry</button>
          </EmptyState>
        </Card>
      </div>
    );
  }
  if (!data) return <PageSkeleton />;
  const active = (data.channels || []).filter((c) => c.active);
  const platform = PLATFORMS.find((p) => p.value === tab) || PLATFORMS[0];

  // per-platform roll-up from the same live payload (never hand-written)
  const roll = Object.fromEntries(PLATFORMS.map((p) => {
    const rows = active.map((c) => accountOf(c, p.value));
    const linked = rows.filter((r) => r.linked);
    return [p.value, {
      linked: linked.length,
      errors: linked.filter((r) => r.error).length,
      total: p.unit ? linked.reduce((a, r) => a + (r.count || 0), 0) : null,
    }];
  }));

  return (
    <div>
      <PageHeader icon={Share2} title="Social" sub="Every account the engine posts to — live reach and link status" />

      <div className="flex items-center gap-3 mb-4 flex-wrap min-w-0">
        <div className="max-w-full overflow-x-auto">
          <Segmented
            options={PLATFORMS.map((p) => ({ value: p.value, label: roll[p.value].total != null && roll[p.value].linked ? `${p.label} · ${fmt(roll[p.value].total)}` : p.label }))}
            value={tab}
            onChange={setTab}
          />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* accounts */}
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHead
            title={`${platform.label} accounts`}
            sub={platform.unit ? 'Live from each platform’s API' : 'Handles from each channel’s destinations (no follower API)'}
            icon={platform.icon}
          />
          <div className="px-2 pb-2">
            {active.length === 0 ? (
              <EmptyState icon={Share2} title="No active channels" sub="Accounts appear here once a channel is connected.">
                <Link href="/channels/add" className="btn btn-primary btn-sm mt-3">Add a channel</Link>
              </EmptyState>
            ) : active.map((c) => {
              const a = accountOf(c, tab);
              return (
                <Link key={c.slug} href={`/channels/${c.slug}`} className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-surface-2 transition-colors min-w-0">
                  <BrandMark short={BRAND[c.slug]?.short || '•'} accent={c.accent || 'var(--accent)'} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block t-13 font-semibold text-ink truncate">{c.label || c.slug}</span>
                    <span className="block t-11 text-faint font-mono truncate">
                      {a.linked ? (a.handle ? `@${stripAt(a.handle)}` : 'linked') : 'not linked'}
                    </span>
                  </span>
                  {a.error ? (
                    <Chip tone="bad" className="shrink-0">can&apos;t read stats</Chip>
                  ) : platform.unit ? (
                    <span className="text-right shrink-0">
                      <span className="block tnum t-13 font-bold text-ink">{a.linked && a.count != null ? fmt(a.count) : '—'}</span>
                      <span className="block overline">{platform.unit}</span>
                    </span>
                  ) : (
                    <Chip tone={a.linked ? 'ok' : 'plain'} className="shrink-0">{a.linked ? 'linked' : 'not linked'}</Chip>
                  )}
                  <ChevronRight size={15} className="text-faint shrink-0" />
                </Link>
              );
            })}
          </div>
        </Card>

        {/* computed health */}
        <Card className="self-start">
          <CardHead title="Link status" sub="Computed from live data on every load" icon={CheckCircle2} />
          <div className="px-4 pb-4 space-y-2.5">
            {PLATFORMS.map((p) => {
              const r = roll[p.value];
              const tone = r.errors ? 'bad' : r.linked === 0 ? 'plain' : r.linked < active.length ? 'warn' : 'ok';
              const Icon = p.icon;
              return (
                <div key={p.value} className="inset-tile p-3 flex items-center gap-2.5 min-w-0">
                  <Icon size={14} className="shrink-0 text-muted" />
                  <span className="t-12 font-semibold text-ink flex-1 min-w-0 truncate">{p.label}</span>
                  <Chip tone={tone} dot>
                    {r.errors ? `${r.errors} can't be read` : `${r.linked} of ${active.length} linked`}
                  </Chip>
                </div>
              );
            })}
            <p className="t-11 text-faint pt-1">Link or fix an account from its channel page.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
