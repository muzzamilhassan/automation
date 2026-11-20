'use client';
// Feedback r1 A — per-channel thumbnail designs: the designs this channel's
// covers take turns through on uploads (kit.thumbTemplates, read by the
// engine's registryThumbCandidates via lib/brand-resolve.mjs).
// Reads GET /api/channels/profile, saves POST /api/channels/profile with
// ONLY { kit: { thumbTemplates } } — the route patches just that key.
// Owner edits; staff sees the same view read-only (the route is owner-only).
//
// Drawer contract (same as SchedulePanel): `frame(body, footer, { dirty })`
// lets the drawer own the layout with Save in its sticky footer (and warn on
// close while `dirty`); without a frame the panel falls back to an inline tile.
import { useCallback, useEffect, useState } from 'react';
import { ImageIcon, CheckCircle2, XCircle, Info, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/untitledui/base/buttons/button';
import ThumbnailDesignPicker from '@/components/ThumbnailDesignPicker';
import { useMe } from '@/components/use-me';
import { canSaveThumbSet } from '@/lib/channel-kit-ui.mjs';

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

export default function ThumbnailAssignPanel({ slug, frame }) {
  const me = useMe();
  const isOwner = me?.role === 'owner';
  const [channel, setChannel] = useState(null); // { accent, niche, kit }
  const [saved, setSaved] = useState([]);       // the set on the server
  const [picked, setPicked] = useState([]);     // the set being edited
  const [loaded, setLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);         // { ok, text }

  // state is only set when the request settles (never synchronously in the effect)
  const load = useCallback(() => {
    fetch(`/api/channels/profile?slug=${encodeURIComponent(slug)}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.channel) throw new Error(d.error || `HTTP ${r.status}`);
        return d.channel;
      })
      .then((c) => {
        const set = Array.isArray(c.kit?.thumbTemplates) ? c.kit.thumbTemplates : [];
        setChannel(c);
        setSaved(set);
        setPicked(set);
        setLoadErr(null);
        setLoaded(true);
      })
      .catch((e) => {
        // a failed load never shows an empty set that Save could write back
        setLoaded(false);
        setLoadErr(String(e.message || e));
      });
  }, [slug]);
  useEffect(() => { load(); }, [load]);

  const retry = () => {
    setLoadErr(null);
    load();
  };

  const save = async () => {
    if (!isOwner || !canSaveThumbSet(picked.length)) return;
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch('/api/channels/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, kit: { thumbTemplates: picked } }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Save failed (HTTP ${r.status})`);
      setSaved(picked);
      setMsg({ ok: true, text: picked.length ? `Saved — new uploads take turns through ${picked.length} designs.` : 'Saved — covers use frames from the video.' });
    } catch (e) {
      setMsg({ ok: false, text: String(e.message || e) });
    } finally {
      setSaving(false);
    }
  };

  // B4 drawer contract: `dirty` = the picked set differs from the saved one,
  // so the drawer can warn before closing over unsaved changes.
  const wrap = (body, footer, dirty = false) => {
    if (frame) return frame(body, footer, { dirty });
    return (
      <div className="inset-tile p-4 mt-1 space-y-4">
        <div className="flex items-center gap-2 overline"><ImageIcon size={12} /> Thumbnail designs</div>
        {body}
        {footer ? <div className="flex flex-wrap items-center justify-end gap-2">{footer}</div> : null}
      </div>
    );
  };

  if (loadErr) {
    return wrap(
      <div role="alert" className="flex flex-wrap items-center gap-2 t-13" style={{ color: 'var(--bad-ink)' }}>
        <XCircle size={14} className="shrink-0" />
        <span className="min-w-0 flex-1">This channel&apos;s thumbnail settings can&apos;t load: {loadErr}</span>
        <button type="button" className="btn btn-outline btn-sm" onClick={retry}><RefreshCw size={13} /> Retry</button>
      </div>,
      null,
    );
  }
  if (!loaded) {
    return wrap(
      <div className="flex items-center gap-2 text-muted t-13">
        <Loader2 size={14} className="animate-spin" /> Loading thumbnail designs…
      </div>,
      null,
    );
  }

  const dirty = loaded && !sameSet(picked, saved);

  const body = (
    <div className="space-y-4 min-w-0">
      {!isOwner ? (
        <p className="flex items-start gap-1.5 t-12 text-muted">
          <Info size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--info-ink)' }} />
          <span>Read-only — only the owner can change thumbnail designs.</span>
        </p>
      ) : null}
      <ThumbnailDesignPicker
        value={picked}
        onChange={(ids) => { setPicked(ids); setMsg(null); }}
        accent={channel?.accent}
        niche={channel?.niche}
        readOnly={!isOwner}
      />
      {msg ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-1.5 rounded-lg border p-3 t-12"
          style={{
            borderColor: `color-mix(in srgb, ${msg.ok ? 'var(--ok)' : 'var(--bad)'} 35%, transparent)`,
            background: `color-mix(in srgb, ${msg.ok ? 'var(--ok)' : 'var(--bad)'} 8%, transparent)`,
            color: msg.ok ? 'var(--ok-ink)' : 'var(--bad-ink)',
          }}
        >
          {msg.ok ? <CheckCircle2 size={13} className="mt-0.5 shrink-0" /> : <XCircle size={13} className="mt-0.5 shrink-0" />}
          <span className="min-w-0">{msg.text}</span>
        </div>
      ) : null}
    </div>
  );

  const footer = isOwner ? (
    <>
      {dirty ? (
        <button type="button" className="btn btn-outline" onClick={() => { setPicked(saved); setMsg(null); }}>
          Undo changes
        </button>
      ) : null}
      <Button color="primary" onClick={save} isDisabled={!canSaveThumbSet(picked.length) || saving || !loaded}>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Save designs
        </span>
      </Button>
    </>
  ) : null;

  return wrap(body, footer, dirty);
}
