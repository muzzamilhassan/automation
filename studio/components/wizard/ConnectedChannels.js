'use client';
// "Connected via Studio" — one clean row per channel. Managing a channel
// opens a Drawer (never an inline panel): its connection, its setup, edit /
// re-connect actions, and a danger zone whose Disconnect asks via useConfirm.
import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Layers, ChevronRight, RefreshCw, Smartphone, Pencil, ExternalLink, Unplug, Settings2 } from 'lucide-react';
import { Card, CardHead, Chip, EmptyState, BrandMark } from '@/components/ui';
import Drawer from '@/components/Drawer';
import { useConfirm } from '@/components/ConfirmDialog';
import { describeSlots } from '@/lib/wizard-steps.mjs';
// live fix wave A2 (T4-18): a saved legacy key (YT_TOKEN_<SLUG>) is healthy;
// a degraded registry read shows "status unknown", never "re-connect"
import { channelKeyStatus as keyStatus } from '@/lib/edit-prefill.mjs';
import { ConnectLinkBox, Notice } from './fields';

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3 py-1.5">
      <dt className="t-11 text-faint pt-0.5">{label}</dt>
      <dd className="t-13 text-ink break-words min-w-0">{children}</dd>
    </div>
  );
}

export default function ConnectedChannels({ reg, onRetry, onEdit, onChanged, names, link }) {
  const confirm = useConfirm();
  const [openSlug, setOpenSlug] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const close = useCallback(() => { setOpenSlug(null); setErr(''); }, []);
  const channels = reg?.channels || [];
  const c = openSlug ? channels.find((x) => x.slug === openSlug) : null;
  const offsetMin = -new Date().getTimezoneOffset();

  const disconnect = async (ch) => {
    const name = ch.label || ch.slug;
    const ok = await confirm({
      title: `Disconnect ${name}?`,
      body: 'Studio loses access immediately (the Google key is revoked), the stored key is deleted, and the channel leaves the dashboard. Videos already on the channel stay.',
      confirmLabel: 'Disconnect',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    setErr('');
    try {
      const r = await fetch('/api/channels/registry?slug=' + encodeURIComponent(ch.slug), { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Disconnect failed');
      close();
      onChanged();
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };

  return (
    <Card className="mt-6 overflow-hidden">
      <CardHead title="Connected via Studio" sub="Channels this wizard linked — they run on the nightly Channel Autopilot" icon={Layers} />
      {reg?.error ? (
        <div className="px-5 pb-5">
          <Notice tone="warn" title="Can't load connected channels right now" action={<button type="button" className="btn btn-sm btn-outline" onClick={onRetry}><RefreshCw size={13} /> Retry</button>}>
            The list is unavailable, so connection status is unknown.
          </Notice>
        </div>
      ) : channels.length ? (
        <ul className="divide-y divide-[var(--line)] border-t border-line">
          {channels.map((ch) => {
            const key = keyStatus(ch);
            return (
              <li key={ch.slug}>
                <button
                  type="button"
                  onClick={() => setOpenSlug(ch.slug)}
                  data-kit="row"
                  className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-[var(--surface-2)] transition-colors"
                  aria-label={`Manage ${ch.label || ch.slug}`}
                >
                  <BrandMark name={ch.label || ch.slug} short={(ch.label || ch.slug).slice(0, 2).toUpperCase()} accent={ch.accent || 'var(--accent)'} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block t-13 font-semibold text-ink truncate">{ch.label || ch.slug}</span>
                    <span className="block t-11 text-faint truncate">{ch.handle || ch.channelId || ch.slug}</span>
                  </span>
                  <span className="hidden sm:flex flex-wrap gap-1 justify-end">
                    {ch.style ? <Chip tone="accent">{names.style(ch.style) || ch.style}</Chip> : null}
                  </span>
                  <Chip tone={key.tone} dot>{key.label}</Chip>
                  <ChevronRight size={16} className="text-faint shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={Layers} title="No channels connected yet" sub="Use the Connect step above — the Google login takes about 30 seconds." />
      )}

      <Drawer
        open={Boolean(c)}
        onClose={close}
        title={c ? c.label || c.slug : 'Channel'}
        description={c ? c.handle || c.channelId || c.slug : ''}
        icon={Settings2}
        size="md"
        footer={
          c ? (
            <>
              <Link className="btn btn-outline" href={`/channels/${encodeURIComponent(c.slug)}`}>
                <ExternalLink size={14} /> Channel page
              </Link>
              <button type="button" className="btn btn-primary" onClick={() => { close(); onEdit(c); }}>
                <Pencil size={14} /> Edit setup
              </button>
            </>
          ) : null
        }
      >
        {c ? (
          <div className="space-y-6">
            <section>
              <h3 className="overline mb-1">Connection</h3>
              {(() => {
                const key = keyStatus(c);
                return (
                  <dl>
                    <Row label="Key"><span className="inline-flex flex-wrap items-center gap-2"><Chip tone={key.tone} dot>{key.label}</Chip>{key.secret ? <span className="font-mono t-12 text-muted">{key.secret}</span> : null}</span></Row>
                    <Row label="What this means"><span className="t-12 text-muted">{key.detail}</span></Row>
                    <Row label="YouTube channel ID"><span className="font-mono t-12">{c.channelId || '—'}</span></Row>
                  </dl>
                );
              })()}
              <div className="flex flex-wrap gap-2 mt-3">
                <button type="button" className="btn btn-sm btn-outline" onClick={link.onConnect} disabled={link.connecting}>
                  <RefreshCw size={13} /> {link.connecting ? 'Opening Google…' : 'Re-connect key with Google'}
                </button>
                <button type="button" className="btn btn-sm btn-outline" onClick={link.onMakeLink} disabled={link.makingLink}>
                  <Smartphone size={13} /> {link.makingLink ? 'Creating…' : 'Re-connect from another browser'}
                </button>
              </div>
              {link.error ? <div className="mt-3"><Notice tone="bad">{link.error}</Notice></div> : null}
              <div className="mt-3">
                <ConnectLinkBox
                  url={link.url}
                  copied={link.copied}
                  onCopy={link.onCopy}
                  onClear={link.onClear}
                  note={`Paste this in the browser where ${c.handle || 'this channel'}'s Gmail is logged in → choose that account → choose the same channel → Allow. Works once · 15 minutes.`}
                />
              </div>
            </section>

            <section>
              <h3 className="overline mb-1">Setup</h3>
              <dl>
                <Row label="Niche">{c.niche || 'Not set'}</Row>
                <Row label="Video style">{c.style ? names.style(c.style) || c.style : 'Not set'}</Row>
                <Row label="Voice">{c.voice ? names.voice(c.voice) || c.voice : 'Not set'}</Row>
                <Row label="Daily shorts">{describeSlots((c.slots?.length ? c.slots : c.kit?.slots || []).join(', '), offsetMin)}</Row>
                <Row label="Weekly episode">{c.docDay || c.kit?.docDay || 'Not set'}</Row>
                <Row label="Brand kit">{c.kit?.tags?.length ? 'Saved' : 'Not drafted yet'}</Row>
              </dl>
            </section>

            <section className="rounded-xl border p-4" style={{ borderColor: 'var(--bad)' }}>
              <h3 className="t-13 font-semibold" style={{ color: 'var(--bad-ink)' }}>Danger zone</h3>
              <p className="t-12 text-muted mt-1">Disconnecting revokes Studio&apos;s access, deletes the stored key and removes the channel from the dashboard. Videos on YouTube stay.</p>
              {err ? <div className="mt-3"><Notice tone="bad" title="Disconnect failed">{err}</Notice></div> : null}
              <button type="button" className="btn btn-danger mt-3" onClick={() => disconnect(c)} disabled={busy}>
                <Unplug size={14} /> {busy ? 'Disconnecting…' : 'Disconnect channel'}
              </button>
            </section>
          </div>
        ) : null}
      </Drawer>
    </Card>
  );
}
