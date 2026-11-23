'use client';
// Human voice as a panel setting (docs/qa/human-voice-panel-qa.md) — the
// per-channel Voice drawer: Human pacing on/off, mood, speed, Preview.
// + Emotional voice (docs/qa/emotional-voice-qa.md): the voice library picker
// (filters + ▶ per voice), the emotional switch + expression, this week's
// free-GPU use.
// Reads GET /api/channels/profile, saves POST /api/channels/profile with
// ONLY { kit: { voiceProfile, voice? } } — the route sends those keys through
// setChannelKitFields (Neon kit + only this entry in the engine file); voice
// is sent only when a library voice was picked (readiness item 5 reads kit.voice).
// Owner edits; staff sees the same view read-only (the route is owner-only).
//
// Drawer contract (same as ThumbnailAssignPanel): `frame(body, footer, { dirty })`
// lets the drawer own the layout with Save in its sticky footer (and warn on
// close while `dirty`); without a frame the panel falls back to an inline tile.
import { useCallback, useEffect, useState } from 'react';
import { Mic, CheckCircle2, XCircle, Info, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/untitledui/base/buttons/button';
import HumanVoiceSection from '@/components/HumanVoiceSection';
import EmotionalVoiceSection from '@/components/EmotionalVoiceSection';
import VoiceLibraryPicker from '@/components/VoiceLibraryPicker';
import { useMe } from '@/components/use-me';
import { VOICES } from '@/lib/voices';
import { DEFAULT_VOICE_SETTINGS, voiceSettingsOf, sameVoiceSettings } from '@/lib/human-voice.mjs';
import { emotionalOf } from '@/lib/emotional-voice.mjs';
import { libraryVoice } from '@/lib/voice-library.mjs';

export default function VoicePanel({ slug, frame }) {
  const me = useMe();
  const isOwner = me?.role === 'owner';
  const [voice, setVoice] = useState('');                         // the channel voice on the server
  const [voiceDraft, setVoiceDraft] = useState('');               // the library pick being edited
  const [saved, setSaved] = useState({ ...DEFAULT_VOICE_SETTINGS }); // the settings on the server
  const [draft, setDraft] = useState({ ...DEFAULT_VOICE_SETTINGS }); // the settings being edited
  const [loaded, setLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);                           // { ok, text }
  // a new library pick (only library voices are ever sent as kit.voice)
  const voiceChanged = loaded && voiceDraft !== voice && Boolean(libraryVoice(voiceDraft));
  // each key is sent only when it changed: a voice-only save never writes default settings
  const settingsChanged = loaded && !sameVoiceSettings(draft, saved);

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
        const v = c.voice || c.kit?.voice || d.legacy?.voice || '';
        setVoice(v);
        setVoiceDraft(v);
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
        body: JSON.stringify({ slug, kit: { ...(settingsChanged ? { voiceProfile: draft } : {}), ...(voiceChanged ? { voice: voiceDraft } : {}) } }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Save failed (HTTP ${r.status})`);
      setSaved(draft);
      setVoice(voiceDraft);
      const emo = draft.human && emotionalOf(draft).emotional;
      setMsg({ ok: true, text: emo ? 'Saved — the next long videos try the emotional voice.' : draft.human ? 'Saved — the next videos use human pacing.' : 'Saved — the next videos use the normal voice.' });
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

  const dirty = settingsChanged || voiceChanged;
  const lib = libraryVoice(voiceDraft);
  const voiceName = lib ? `${lib.name} · ${lib.note}` : VOICES.find((v) => v.id === voiceDraft)?.label || voiceDraft || 'Not picked';

  const body = (
    <div className="space-y-4 min-w-0">
      {!isOwner ? (
        <p className="flex items-start gap-1.5 t-12 text-muted">
          <Info size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--info-ink)' }} />
          <span>Read-only — only the owner can change the voice.</span>
        </p>
      ) : null}
      <p className="t-12 text-muted">
        Voice: <span className="font-semibold text-ink">{voiceName}</span>
      </p>
      <VoiceLibraryPicker value={voiceDraft} emotional={draft.human && emotionalOf(draft).emotional} mood={draft.mood} readOnly={!isOwner} onChange={(id) => { setVoiceDraft(id); setMsg(null); }} />
      <div className="border-t border-line pt-4">
        <HumanVoiceSection voice={voiceDraft} value={draft} readOnly={!isOwner} onChange={(v) => { setDraft(v); setMsg(null); }} />
      </div>
      <div className="border-t border-line pt-4">
        <EmotionalVoiceSection voice={voiceDraft} value={draft} readOnly={!isOwner} onChange={(v) => { setDraft(v); setMsg(null); }} />
      </div>
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
        <button type="button" className="btn btn-outline" onClick={() => { setDraft(saved); setVoiceDraft(voice); setMsg(null); }}>
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
