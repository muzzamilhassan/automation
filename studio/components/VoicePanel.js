'use client';
// Human voice as a panel setting (docs/qa/human-voice-panel-qa.md) — the
// per-channel Voice drawer: Human pacing on/off, mood, speed, Preview.
// Reads GET /api/channels/profile, saves POST /api/channels/profile with
// ONLY { kit: { voiceProfile } } — the route sends that one key through
// setChannelKitFields (Neon kit + only this entry in the engine file).
// The voice itself is picked in Edit profile; this drawer previews it.
// Owner edits; staff sees the same view read-only (the route is owner-only).
//
// Drawer contract (same as ThumbnailAssignPanel): `frame(body, footer, { dirty })`
// lets the drawer own the layout with Save in its sticky footer (and warn on
// close while `dirty`); without a frame the panel falls back to an inline tile.
import { useCallback, useEffect, useState } from 'react';
import { Mic, CheckCircle2, XCircle, Info, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/untitledui/base/buttons/button';
import HumanVoiceSection from '@/components/HumanVoiceSection';
import { useMe } from '@/components/use-me';
import { VOICES } from '@/lib/voices';
import { DEFAULT_VOICE_SETTINGS, voiceSettingsOf, sameVoiceSettings } from '@/lib/human-voice.mjs';

export default function VoicePanel({ slug, frame }) {
  const me = useMe();
  const isOwner = me?.role === 'owner';
  const [voice, setVoice] = useState('');                         // the channel voice (Edit profile picks it)
  const [saved, setSaved] = useState({ ...DEFAULT_VOICE_SETTINGS }); // the settings on the server
  const [draft, setDraft] = useState({ ...DEFAULT_VOICE_SETTINGS }); // the settings being edited
  const [loaded, setLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);                           // { ok, text }

  // state is only set when the request settles (never synchronously in the effect)
  const load = useCallback(() => {
    fetch(`/api/channels/profile?slug=${encodeURIComponent(slug)}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.channel) throw new Error(d.error || `HTTP ${r.status}`);
        return d;
      })
      .then((d) => {
        const c = d.channel;
        const s = voiceSettingsOf(c.kit?.voiceProfile);
        setVoice(c.voice || c.kit?.voice || d.legacy?.voice || '');
        setSaved(s);
        setDraft(s);
        setLoadErr(null);
        setLoaded(true);
      })
      .catch((e) => {
        // a failed load never shows defaults that Save could write back
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
    if (!isOwner || !loaded) return;
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch('/api/channels/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, kit: { voiceProfile: draft } }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Save failed (HTTP ${r.status})`);
      setSaved(draft);
      setMsg({ ok: true, text: draft.human ? 'Saved — the next videos use human pacing.' : 'Saved — the next videos use the normal voice.' });
    } catch (e) {
      setMsg({ ok: false, text: String(e.message || e) });
    } finally {
      setSaving(false);
    }
  };

  // B4 drawer contract: `dirty` = the edited settings differ from the saved ones
  const wrap = (body, footer, dirty = false) => {
    if (frame) return frame(body, footer, { dirty });
    return (
      <div className="inset-tile p-4 mt-1 space-y-4">
        <div className="flex items-center gap-2 overline"><Mic size={12} /> Voice</div>
        {body}
        {footer ? <div className="flex flex-wrap items-center justify-end gap-2">{footer}</div> : null}
      </div>
    );
  };

  if (loadErr) {
    return wrap(
      <div role="alert" className="flex flex-wrap items-center gap-2 t-13" style={{ color: 'var(--bad-ink)' }}>
        <XCircle size={14} className="shrink-0" />
        <span className="min-w-0 flex-1">This channel&apos;s voice settings can&apos;t load: {loadErr}</span>
        <button type="button" className="btn btn-outline btn-sm" onClick={retry}><RefreshCw size={13} /> Retry</button>
      </div>,
      null,
    );
  }
  if (!loaded) {
    return wrap(
      <div className="flex items-center gap-2 text-muted t-13">
        <Loader2 size={14} className="animate-spin" /> Loading voice settings…
      </div>,
      null,
    );
  }

  const dirty = loaded && !sameVoiceSettings(draft, saved);
  const voiceName = VOICES.find((v) => v.id === voice)?.label || voice || 'Not picked';

  const body = (
    <div className="space-y-4 min-w-0">
      {!isOwner ? (
        <p className="flex items-start gap-1.5 t-12 text-muted">
          <Info size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--info-ink)' }} />
          <span>Read-only — only the owner can change the voice.</span>
        </p>
      ) : null}
      <p className="t-12 text-muted">
        Voice: <span className="font-semibold text-ink">{voiceName}</span> <span className="text-faint">· change it in Edit profile</span>
      </p>
      <HumanVoiceSection voice={voice} value={draft} readOnly={!isOwner} onChange={(v) => { setDraft(v); setMsg(null); }} />
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
        <button type="button" className="btn btn-outline" onClick={() => { setDraft(saved); setMsg(null); }}>
          Undo changes
        </button>
      ) : null}
      <Button color="primary" onClick={save} isDisabled={!dirty || saving || !loaded}>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Save voice
        </span>
      </Button>
    </>
  ) : null;

  return wrap(body, footer, dirty);
}
