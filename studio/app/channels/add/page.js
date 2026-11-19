'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { UserPlus, ShieldCheck, CheckCircle2, AlertTriangle, ArrowRight, Layers, Settings2, Plus, Sparkles, X, Play, Square } from 'lucide-react';
import { Card, CardHead, Chip, PageHeader, EmptyState, PageSkeleton } from '@/components/ui';
import { STYLE_CATALOG, STYLE_BY_ID } from '@/lib/styles-catalog';
import { NICHE_CATALOG, NICHE_MAP, recommendedStyleFor } from '@/lib/niches';
import { previewSourceFor, popupAnchorFor } from '@/lib/wizard-preview-helpers';
import { VOICES } from '@/lib/voices';
import { AUDIENCES, suggestionFor, suggestionText } from '@/lib/audiences';

const DOC_DAYS = ['Tue', 'Wed', 'Thu', 'Fri'];

function originNow() {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

export default function AddChannel() {
  const [reg, setReg] = useState(null); // { channels, mode, canWriteSecrets }
  const [error, setError] = useState('');
  const [connectedSlug, setConnectedSlug] = useState('');
  const [secretWarning, setSecretWarning] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [makingLink, setMakingLink] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [saved, setSaved] = useState(false);
  const [started, setStarted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fillingKit, setFillingKit] = useState(false);
  const [kitMood, setKitMood] = useState('');
  // #113 — LLM kit drafts: reviewable per-field suggestions with explicit
  // Apply. Template fallback fills as before and is stated as such.
  const [kitDraft, setKitDraft] = useState(null); // { kit, suggestion, applied }
  const [kitNote, setKitNote] = useState('');
  // #115 — production-template browser: the registry view + CI sample MP4s,
  // one hover popup at a time, per-template assign state.
  const [tplView, setTplView] = useState(null); // { templates } from /api/templates
  const [tplSamples, setTplSamples] = useState(null); // { samples, familySamples } from /api/template-previews
  const [hoveredTpl, setHoveredTpl] = useState(null); // { id, rect }
  const [assignState, setAssignState] = useState({}); // templateId -> { state, msg? }
  const POPUP = { width: 360, height: 300 }; // must match popupAnchorFor sizing
  const openTimer = useRef(null);
  const closeTimer = useRef(null);
  // #111 — voice demos: one shared audio element, so starting a demo stops
  // the previous one. Picking a voice is always an explicit click.
  const voiceAudio = useRef(null);
  const [playingVoice, setPlayingVoice] = useState(null);
  // #112 — target-audience choice for the slot suggestion. Local to the
  // wizard (not part of the saved brand kit); applying needs an explicit click.
  const [audience, setAudience] = useState('');
  const playDemo = (voice) => {
    const el = voiceAudio.current;
    if (!el) return;
    if (playingVoice === voice.id) {
      el.pause();
      el.currentTime = 0;
      setPlayingVoice(null);
      return;
    }
    el.src = voice.demo;
    el.play().catch(() => setPlayingVoice(null));
    setPlayingVoice(voice.id);
  };
  useEffect(() => () => voiceAudio.current?.pause(), []);
  const [form, setForm] = useState({
    label: '', niche: '', subNiches: '', style: 'cinematic', voice: 'am_michael', accent: '#38BDF8', slots: '22:35',
    docDay: 'Tue', eyebrow: '', tagline: '', tags: '', description: '',
    fbPageId: '', igHandle: '', threadsHandle: '', tiktokHandle: '',
  });

  const loadReg = () => fetch('/api/channels/registry').then((r) => r.json()).then(setReg).catch(() => setReg({ channels: [] }));

  const prefill = (entry) => {
    const rawNiches = Array.isArray(entry.kit?.niches)
      ? entry.kit.niches
      : Array.isArray(entry.niches)
        ? entry.niches
        : (entry.niche ? [entry.niche] : []);
    setForm((f) => ({
      ...f,
      label: entry.label || '',
      niche: entry.niche || '',
      subNiches: rawNiches.join(', '),
      style: entry.style || f.style || 'cinematic',
      voice: entry.voice || f.voice || 'am_michael',
      accent: entry.accent || f.accent || '#38BDF8',
      slots: Array.isArray(entry.slots) ? entry.slots.join(', ') : (entry.slots || '22:35'),
      docDay: entry.docDay || entry.kit?.docDay || 'Tue',
      eyebrow: entry.kit?.eyebrow || '',
      tagline: entry.kit?.tagline || '',
      tags: entry.kit?.tags?.length ? entry.kit.tags.join(', ') : (entry.ytKeywords || ''),
      description: entry.kit?.description || entry.ytDescription || '',
      fbPageId: entry.destinations?.fbPageId || '',
      igHandle: entry.destinations?.igHandle || '',
      threadsHandle: entry.destinations?.threadsHandle || '',
      tiktokHandle: entry.destinations?.tiktokHandle || '',
    }));
  };

  // #115 — registry templates + CI sample MP4s (both owner-gated; both
  // degrade quietly: no templates list → section hidden; no sample for a
  // template → card without a preview affordance, never a broken player).
  useEffect(() => {
    let alive = true;
    fetch('/api/templates')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.templates?.length) setTplView({ templates: d.templates }); })
      .catch(() => { });
    fetch('/api/template-previews')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.samples) setTplSamples({ samples: d.samples, familySamples: d.familySamples || {} }); })
      .catch(() => { });
    return () => { alive = false; };
  }, []);

  // hover lifecycle: open after a 300ms dwell (no flicker crossing the
  // grid), close on a 150ms grace so the pointer can travel from the card
  // to the adjacent popup without killing it.
  const clearTimers = () => { clearTimeout(openTimer.current); clearTimeout(closeTimer.current); };
  const captureRect = (t, el) => {
    const r = el.getBoundingClientRect();
    return { id: t.templateId, rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom } };
  };
  const openPreview = (t, el) => {
    clearTimers();
    openTimer.current = setTimeout(() => setHoveredTpl(captureRect(t, el)), 300);
  };
  const openPreviewNow = (t, el) => {
    clearTimers();
    setHoveredTpl(captureRect(t, el));
  };
  const scheduleClose = () => {
    clearTimers();
    closeTimer.current = setTimeout(() => setHoveredTpl(null), 150);
  };
  const cancelClose = () => clearTimeout(closeTimer.current);
  const closePreview = () => { clearTimers(); setHoveredTpl(null); };
  useEffect(() => () => clearTimers(), []);

  // while a popup is open, any scroll (in any container) or Escape closes it
  useEffect(() => {
    if (!hoveredTpl) return;
    const close = () => setHoveredTpl(null);
    const onScroll = () => close();
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('keydown', onKey);
    };
  }, [hoveredTpl]);

  // #115 — assign through the existing lane (its validator decides fit);
  // every outcome lands in per-template state the card renders honestly.
  const assignTemplate = async (templateId) => {
    setAssignState((s) => ({ ...s, [templateId]: { state: 'assigning' } }));
    try {
      const r = await fetch('/api/templates/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: connectedSlug, templateId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(d.error === 'incompatible' ? `not compatible: ${(d.reasons || []).join('; ')}` : (d.error || 'assign failed'));
      }
      setAssignState((s) => ({ ...s, [templateId]: { state: 'done' } }));
    } catch (e) {
      setAssignState((s) => ({ ...s, [templateId]: { state: 'error', msg: e.message } }));
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      const q = new URLSearchParams(window.location.search);
      const r = await fetch('/api/channels/registry')
        .then((x) => x.json())
        .catch(() => ({ channels: [] }));
      if (!alive) return;
      setReg(r?.channels ? r : { channels: [] });
      if (q.get('error')) setError(q.get('error'));
      if (q.get('secretWarning')) setSecretWarning(q.get('secretWarning'));
      if (q.get('connected')) {
        const connSlug = q.get('connected');
        setConnectedSlug(connSlug);
        fetch(`/api/channels/profile?slug=${connSlug}`)
          .then((x) => x.json())
          .then((d) => { if (d?.channel) prefill(d.channel); })
          .catch(() => {
            const entry = (r?.channels || []).find((c) => c.slug === connSlug);
            if (entry) prefill(entry);
          });
      }
      // edit mode: ?edit=slug opens the setup form for ANY channel (living or registry)
      if (q.get('edit')) {
        const editSlug = q.get('edit');
        setConnectedSlug(editSlug);
        fetch(`/api/channels/profile?slug=${editSlug}`)
          .then((x) => x.json())
          .then((d) => { if (d?.channel) prefill(d.channel); })
          .catch(() => {
            const entry = (r?.channels || []).find((c) => c.slug === editSlug);
            if (entry) prefill(entry);
          });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const autoFillKit = async () => {
    if (!form.niche.trim()) {
      setError('Type a niche first — the kit generator drafts from it.');
      return;
    }
    setFillingKit(true);
    setError('');
    setKitNote('');
    try {
      const r = await fetch('/api/channels/kit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: connectedSlug, niche: form.niche, label: form.label, useLLM: true }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Kit generation failed');
      setKitMood(d.kit.mood || '');
      if (d.source === 'llm') {
        // AI draft — NEVER fills silently: every field becomes a reviewable
        // suggestion below with an explicit Apply action.
        setKitDraft({ kit: d.kit, suggestion: d.suggestion || {}, applied: {} });
      } else {
        // template path (or AI fallback) — fills as before, and says which path
        setKitDraft(null);
        setKitNote(d.note ? `AI unavailable (${d.note}) — drafted by the template generator.` : 'Drafted by the template generator.');
        setForm((f) => ({
          ...f,
          subNiches: Array.isArray(d.kit.niches) ? d.kit.niches.join(', ') : f.subNiches,
          eyebrow: d.kit.eyebrow || f.eyebrow,
          tagline: d.kit.tagline || f.tagline,
          tags: (d.kit.tags || []).join(', '),
          description: d.kit.description || f.description,
        }));
      }
    } catch (e) {
      setError(e.message);
    }
    setFillingKit(false);
  };

  // #113 — one explicit Apply per drafted field; the form only changes on click.
  const applyDraftField = (key) => {
    if (!kitDraft) return;
    const { kit, suggestion } = kitDraft;
    setForm((f) => {
      switch (key) {
        case 'eyebrow': return { ...f, eyebrow: kit.eyebrow || f.eyebrow };
        case 'tagline': return { ...f, tagline: kit.tagline || f.tagline };
        case 'description': return { ...f, description: kit.description || f.description };
        case 'tags': return { ...f, tags: (kit.tags || []).join(', ') || f.tags };
        case 'subNiches': return { ...f, subNiches: (kit.niches || []).join(', ') || f.subNiches };
        case 'voice': return suggestion.voice ? { ...f, voice: suggestion.voice } : f;
        case 'style': return suggestion.style ? { ...f, style: suggestion.style } : f;
        default: return f;
      }
    });
    setKitDraft((kd) => ({ ...kd, applied: { ...kd.applied, [key]: true } }));
  };

  const applyAllDraftFields = () => {
    if (!kitDraft) return;
    ['eyebrow', 'tagline', 'description', 'tags', 'subNiches', ...(kitDraft.suggestion.voice ? ['voice'] : []), ...(kitDraft.suggestion.style ? ['style'] : [])].forEach(applyDraftField);
  };

  const makeLink = async () => {
    setMakingLink(true);
    setCopied(false);
    setError('');
    try {
      const r = await fetch('/api/oauth/start?mode=link');
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || 'Could not create the connect link.');
        setMakingLink(false);
        return;
      }
      setLinkUrl(d.url);
    } catch {
      setError('Network error creating the link.');
    }
    setMakingLink(false);
  };

  const connect = async () => {
    setConnecting(true);
    setError('');
    try {
      const r = await fetch('/api/oauth/start');
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || 'Could not start the Google login.');
        if (r.status === 500) setShowSetup(true);
        setConnecting(false);
        return;
      }
      window.location.href = d.url;
    } catch {
      setError('Network error starting the login.');
      setConnecting(false);
    }
  };

  // start=false saves settings with autopilot OFF; start=true records consent
  // and flips the autopilot on (YouTube API express-consent requirement)
  // start === true only when the owner explicitly starts the autopilot — a plain
  // save must never touch it (a sent `false` used to switch live channels off)
  const saveProfile = async (start) => {
    setSaving(true);
    setError('');
    const subNichesList = form.subNiches
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    try {
      const r = await fetch('/api/channels/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: connectedSlug,
          label: form.label,
          niche: form.niche,
          subNiches: subNichesList,
          style: form.style,
          voice: form.voice,
          accent: form.accent,
          slots: form.slots,
          docDay: form.docDay,
          ...(start === true ? { startAutopilot: true } : {}),
          kit: {
            eyebrow: form.eyebrow,
            tagline: form.tagline,
            tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
            niches: subNichesList.length ? subNichesList : (form.niche ? [form.niche.toLowerCase()] : []),
            description: form.description,
          },
          destinations: {
            fbPageId: form.fbPageId,
            igHandle: form.igHandle,
            threadsHandle: form.threadsHandle,
            tiktokHandle: form.tiktokHandle,
          },
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Save failed');
      setSaved(true);
      setStarted(start);
      loadReg();
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  };

  if (!reg) return <PageSkeleton />;
  const entry = reg.channels?.find((c) => c.slug === connectedSlug);
  const origin = originNow();
  // #110 — the per-niche template suggestion. Display-only: it drives a badge
  // and a hint line, never the selection (the owner always clicks the card).
  const nicheRec = recommendedStyleFor(form.niche);

  return (
    <div className="max-w-3xl">
      <PageHeader icon={UserPlus} title="Add Channel" sub="Log in with Google → pick the channel → pick niche + template. One login connects ONE YouTube channel." />

      {error ? (
        <Card className="p-4 mb-4" style={{ borderColor: '#ef444455' }}>
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-t-13 font-semibold text-ink">Connect problem</p>
              <p className="text-t-12 text-muted mt-1 break-words">{error}</p>
              <p className="text-t-11 text-faint mt-2">
                Reconnect errors like <span className="font-mono">redirect_uri_mismatch</span> mean the callback URL is not registered yet — see
                “One-time Google setup” below.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {/* STEP 1 — connect */}
      {!connectedSlug ? (
        <Card className="p-5 mb-4">
          <CardHead title="Step 1 · Connect a YouTube channel" sub="Google's own login screen — your password never touches Studio" icon={ShieldCheck} />
          <div className="inset-tile p-3.5 mb-4">
            <div className="flex items-start gap-2.5">
              <Layers size={15} className="text-accent shrink-0 mt-0.5" />
              <div>
                <p className="text-t-12 font-semibold text-ink">Multiple Gmails, multiple channels — all fine.</p>
                <p className="text-t-12 text-muted mt-1 leading-relaxed">
                  Every connect is a fresh Google login: choose <b>any of your Gmail accounts</b>, then <b>any of its YouTube channels</b>, and Allow.
                  Connect Mail A&apos;s channel today, Mail B&apos;s tomorrow — they all land in the same registry and run on the same autopilot, each
                  with its own key, niche, template and schedule. To add another channel on the same Gmail, run this wizard again and pick a different
                  channel. Your Gmail address is never stored; only each channel&apos;s ID and name are saved.
                </p>
              </div>
            </div>
          </div>
          <button className="btn btn-primary w-full sm:w-auto" onClick={connect} disabled={connecting}>
            {connecting ? 'Opening Google…' : 'Connect with Google'} <ArrowRight size={14} />
          </button>

          {/* connect from ANOTHER browser — copyable one-time link */}
          <div className="mt-4 pt-4 border-t border-line">
            <p className="overline mb-2">Or connect from another browser / phone</p>
            {!linkUrl ? (
              <button className="btn btn-outline w-full sm:w-auto" onClick={makeLink} disabled={makingLink}>
                {makingLink ? 'Creating…' : 'Generate connect link'}
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input readOnly value={linkUrl} onFocus={(e) => e.target.select()} className="input flex-1 font-mono text-t-11" />
                  <button
                    className="btn btn-primary shrink-0"
                    onClick={async () => {
                      try { await navigator.clipboard.writeText(linkUrl); } catch { }
                      setCopied(true);
                    }}
                  >
                    {copied ? 'Copied ✓' : 'Copy link'}
                  </button>
                  <button className="btn btn-ghost shrink-0" onClick={() => { setLinkUrl(''); setCopied(false); }}>
                    <X size={14} />
                  </button>
                </div>
                <p className="text-t-11 text-faint leading-relaxed">
                  Paste this in the browser where your Gmail is logged in → choose the account → choose the channel → Allow. The link works ONCE and
                  expires in 15 minutes — treat it like a password. After allowing, finish Step 2 (niche + template) here in this browser.
                </p>
              </div>
            )}
          </div>
        </Card>
      ) : null}

      {/* STEP 2 — profile */}
      {connectedSlug && !saved ? (
        <Card className="p-5 mb-4">
          <CardHead
            title="Step 2 · Set up the channel"
            sub={entry ? `Connected: ${entry.label} ${entry.handle ? `(${entry.handle})` : ''} — key saved as ${entry.tokenSecret}` : 'Connected'}
            icon={Settings2}
          />
          {secretWarning ? (
            <div className="inset-tile p-3 mb-4" style={{ borderColor: '#f59e0b55' }}>
              <p className="text-t-12 text-muted">
                <b className="text-ink">Warning:</b> the GitHub token secret could not be written ({secretWarning}). The channel is registered, but CI
                can&apos;t use it until the secret <span className="font-mono">{entry?.tokenSecret}</span> exists. Run locally:{' '}
                <span className="font-mono text-t-11">gh secret set {entry?.tokenSecret} {'<'} token.json</span>
              </p>
            </div>
          ) : null}
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="overline block mb-1.5">Channel name</span>
              <input className="input w-full" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="OLD MONEY CODE" />
            </label>
            <label className="block">
              <span className="overline block mb-1.5">Niche</span>
              <input className="input w-full" value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} placeholder="Old money & quiet luxury" />
            </label>
            <div className="sm:col-span-2 -mt-1">
              <div className="flex flex-wrap gap-1.5">
                {NICHE_CATALOG.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className="inset-tile px-2.5 py-1 text-t-11 font-semibold text-muted hover:text-ink rounded-md transition-[color,border-color,background-color,transform] duration-100 ease-out cursor-pointer active:scale-[0.96]"
                    style={form.niche === n ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
                    onClick={() => {
                      const subs = NICHE_MAP[n] || [];
                      setForm({
                        ...form,
                        niche: n,
                        subNiches: subs.length ? subs.join(', ') : form.subNiches,
                      });
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-t-10 text-faint mt-1.5">One tap = niche filled + smart sub-niches auto-loaded. Or type your own.</p>
            </div>

            {/* 10-16 PRODUCT SCALE: Sub-niches field */}
            <label className="block sm:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="overline block">Sub-niches & Content Pillars (Comma separated)</span>
                <span className="text-t-11 text-faint">Daily research automatically rotates across these pillars</span>
              </div>
              <textarea
                className="input w-full font-mono text-t-12"
                rows={2}
                value={form.subNiches}
                onChange={(e) => setForm({ ...form, subNiches: e.target.value })}
                placeholder="e.g. power of silence, dark psychology defense, samurai mindset, emotional detachment, boundary setting"
              />
              {NICHE_MAP[form.niche]?.length ? (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-t-11 text-muted mr-1">Recommended pillars:</span>
                  {NICHE_MAP[form.niche].map((sn) => {
                    const currentSubs = form.subNiches.split(',').map((s) => s.trim().toLowerCase());
                    const active = currentSubs.includes(sn.toLowerCase());
                    return (
                      <button
                        key={sn}
                        type="button"
                        className="inset-tile px-2 py-0.5 text-t-10 font-medium rounded-md transition-[color,border-color,background-color,transform] duration-100 ease-out cursor-pointer active:scale-[0.96]"
                        style={active ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : { color: 'var(--muted)' }}
                        onClick={() => {
                          if (active) {
                            const filtered = currentSubs.filter((s) => s !== sn.toLowerCase());
                            setForm({ ...form, subNiches: filtered.join(', ') });
                          } else {
                            const next = form.subNiches.trim() ? `${form.subNiches.trim().replace(/,$/, '')}, ${sn}` : sn;
                            setForm({ ...form, subNiches: next });
                          }
                        }}
                      >
                        {active ? '✓ ' : '+ '} {sn}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <p className="text-t-10 text-faint mt-1.5">
                The research engine searches YouTube for live viral videos in each sub-niche, ensuring your channel never runs out of fresh, high-performing ideas.
              </p>
            </label>
            {/* #110 — template picker as preview cards (replaces the plain
                dropdown): real render frames + live/demo chips + per-niche
                recommendation badge. Click-to-select; nothing auto-picks. */}
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="overline block">Video template</span>
                <span className="text-t-11 text-faint">Previews are real frames from actual renders</span>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {STYLE_CATALOG.map((s) => {
                  const selected = form.style === s.id;
                  const recommended = nicheRec?.style === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setForm({ ...form, style: s.id })}
                      className="inset-tile p-2.5 flex gap-2.5 items-start text-left rounded-lg transition-[color,border-color,background-color,transform] duration-100 ease-out cursor-pointer active:scale-[0.99]"
                      style={selected ? { borderColor: 'var(--accent)' } : undefined}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.preview} alt="" className="w-14 h-14 rounded-md object-cover shrink-0" style={{ background: 'var(--surface-2)' }} />
                      <span className="min-w-0 flex-1 block">
                        <span className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-t-12 font-bold" style={selected ? { color: 'var(--accent)' } : undefined}>{s.name}</span>
                          <Chip tone={s.status === 'live' ? 'ok' : 'warn'}>{s.status}</Chip>
                          {recommended ? <Chip tone="accent">★ Recommended for this niche</Chip> : null}
                        </span>
                        <span className="text-t-11 text-muted mt-1 leading-snug block">{s.desc}</span>
                        <span className="text-t-10 text-faint mt-1 block">{s.formats.join(' · ')}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {nicheRec ? (
                <p className="text-t-11 text-faint mt-1.5">
                  Suggested for your niche: <b className="text-muted">{STYLE_BY_ID[nicheRec.style]?.name}</b> — {nicheRec.reason}. Nothing is chosen
                  for you; click that card if you want it.
                </p>
              ) : null}
            </div>
            {/* #115 — production templates: the CURRENT registry set (what the
                engine actually renders), each with its CI video demo on hover.
                Assigning uses the existing assign lane; the base-style choice
                above and the saved `style` value are untouched. */}
            {tplView?.templates?.length ? (
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="overline block">Production templates ({tplView.templates.length})</span>
                  <span className="text-t-11 text-faint">Hover a card to watch its demo · “Use” assigns it to this channel</span>
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {tplView.templates.map((t) => {
                    const src = previewSourceFor(t.templateId, t.family, tplSamples?.samples, tplSamples?.familySamples);
                    const a = assignState[t.templateId];
                    return (
                      <div
                        key={t.templateId}
                        className="inset-tile p-2.5 rounded-lg"
                        onMouseEnter={(e) => openPreview(t, e.currentTarget)}
                        onMouseLeave={scheduleClose}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-t-12 font-bold text-ink truncate">{t.name}</p>
                            <p className="text-t-11 text-muted mt-0.5 line-clamp-2 leading-snug">{t.catalog?.desc}</p>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {(t.registry?.formats || []).slice(0, 3).map((f) => (
                                <Chip key={f} tone="accent">{f}</Chip>
                              ))}
                              {src?.mp4 ? (
                                <span className="text-t-10 text-faint inline-flex items-center gap-0.5">
                                  <Play size={9} /> demo
                                </span>
                              ) : null}
                            </div>
                          </div>
                          {src?.mp4 ? (
                            <button
                              type="button"
                              className="icon-btn w-8 h-8 rounded-md shrink-0"
                              title="Watch the demo"
                              onClick={(e) => openPreviewNow(t, e.currentTarget)}
                            >
                              <Play size={14} />
                            </button>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            type="button"
                            className="btn btn-outline text-t-11 px-2.5 py-1"
                            onClick={() => assignTemplate(t.templateId)}
                            disabled={!connectedSlug || a?.state === 'assigning' || a?.state === 'done'}
                          >
                            {a?.state === 'assigning' ? 'Assigning…' : a?.state === 'done' ? 'Assigned ✓' : 'Use for this channel'}
                          </button>
                          {a?.state === 'error' ? <span className="text-t-10 text-red-400 truncate">{a.msg}</span> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div>
              <span className="overline block mb-1.5">Voice</span>
              <audio ref={voiceAudio} onEnded={() => setPlayingVoice(null)} className="hidden" />
              <input className="input w-full" value={form.voice} onChange={(e) => setForm({ ...form, voice: e.target.value })} placeholder="any Kokoro voice id" />
              <div className="mt-2 grid gap-1.5">
                {VOICES.map((v) => (
                  <div
                    key={v.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={form.voice === v.id}
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 cursor-pointer transition-colors ${form.voice === v.id ? 'border-sky-400/60 bg-sky-400/10' : 'border-white/10 hover:border-white/25'}`}
                    onClick={() => setForm({ ...form, voice: v.id })}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setForm({ ...form, voice: v.id }); }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-t-12 font-medium truncate">{v.label}</div>
                      <div className="text-t-10 font-mono text-white/45 truncate">{v.id}</div>
                    </div>
                    {v.demo ? (
                      <button
                        type="button"
                        aria-label={playingVoice === v.id ? `Stop ${v.id} demo` : `Play ${v.id} demo`}
                        className="shrink-0 w-7 h-7 rounded-full grid place-items-center bg-white/10 hover:bg-white/20 text-white/80"
                        onClick={(e) => { e.stopPropagation(); playDemo(v); }}
                      >
                        {playingVoice === v.id ? <Square size={11} fill="currentColor" /> : <Play size={11} />}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              <span className="text-t-10 text-white/40 mt-1.5 block">Demos all say the same line — compare them fairly. Clicking a voice picks it; typing keeps a custom id.</span>
            </div>
            <label className="block">
              <span className="overline block mb-1.5">Accent color</span>
              <input type="color" className="input w-full h-[38px] p-1" value={form.accent} onChange={(e) => setForm({ ...form, accent: e.target.value })} />
            </label>
            <div>
              <span className="overline block mb-1.5">Target audience</span>
              <select
                className="input w-full"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
              >
                <option value="">— pick a target audience —</option>
                {AUDIENCES.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
              {suggestionText(audience) ? (
                <div className="mt-2 rounded-lg border border-sky-400/40 bg-sky-400/10 px-2.5 py-2">
                  <div className="text-t-12 text-sky-200">{suggestionText(audience)}</div>
                  <button
                    type="button"
                    className="mt-1.5 text-t-11 font-medium text-sky-300 hover:text-sky-200 underline underline-offset-2"
                    onClick={() => {
                      const s = suggestionFor(audience);
                      if (s) setForm({ ...form, slots: s.utc });
                    }}
                  >
                    Use suggestion
                  </button>
                </div>
              ) : null}
              <span className="text-t-10 text-white/40 mt-1.5 block">Presets are a starting point for new channels — later, suggestions can come from your own YouTube Analytics viewer hours.</span>
            </div>
            <label className="block">
              <span className="overline block mb-1.5">Short slot UTC (evening is best)</span>
              <input className="input w-full font-mono" value={form.slots} onChange={(e) => setForm({ ...form, slots: e.target.value })} />
            </label>
            <label className="block">
              <span className="overline block mb-1.5">Weekly episode day</span>
              <select className="input w-full" value={form.docDay} onChange={(e) => setForm({ ...form, docDay: e.target.value })}>
                {DOC_DAYS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2">
              <button className="btn btn-outline w-full sm:w-auto" onClick={autoFillKit} disabled={fillingKit}>
                <Sparkles size={14} /> {fillingKit ? 'Drafting…' : 'Auto-fill brand kit from niche'}
              </button>
              {kitMood ? <span className="text-t-11 text-faint ml-2">music mood: {kitMood}</span> : null}
              {kitNote ? <span className="text-t-11 text-amber-300/80 ml-2">{kitNote}</span> : null}
              {kitDraft ? (
                <div className="mt-3 rounded-xl border border-sky-400/40 bg-sky-400/5 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-t-12 font-medium text-sky-200">AI draft — review each field, then apply what you like</span>
                    <div className="flex gap-2">
                      <button type="button" className="text-t-11 font-medium text-sky-300 hover:text-sky-200 underline underline-offset-2" onClick={applyAllDraftFields}>Apply all</button>
                      <button type="button" className="text-t-11 text-white/50 hover:text-white/80 underline underline-offset-2" onClick={() => setKitDraft(null)}>Discard</button>
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    {[
                      ['eyebrow', 'Eyebrow', kitDraft.kit.eyebrow],
                      ['tagline', 'Tagline', kitDraft.kit.tagline],
                      ['description', 'Description', kitDraft.kit.description],
                      ['tags', 'Tags', (kitDraft.kit.tags || []).join(', ')],
                      ['subNiches', 'Sub-niches', (kitDraft.kit.niches || []).join(', ')],
                      ...(kitDraft.suggestion.voice ? [['voice', 'Voice', kitDraft.suggestion.voice]] : []),
                      ...(kitDraft.suggestion.style ? [['style', 'Style', kitDraft.suggestion.style]] : []),
                    ].map(([key, label, value]) => (
                      <div key={key} className="flex items-start gap-2 rounded-lg border border-white/10 px-2.5 py-1.5">
                        <div className="min-w-0 flex-1">
                          <div className="text-t-10 text-white/45">{label}</div>
                          <div className="text-t-12 text-white/85 line-clamp-2">{value || '—'}</div>
                        </div>
                        {kitDraft.applied[key] ? (
                          <span className="shrink-0 text-t-11 text-emerald-400 font-medium pt-1">Applied ✓</span>
                        ) : (
                          <button type="button" className="shrink-0 text-t-11 font-medium text-sky-300 hover:text-sky-200 underline underline-offset-2 pt-1" onClick={() => applyDraftField(key)}>Apply</button>
                        )}
                      </div>
                    ))}
                  </div>
                  <span className="text-t-10 text-white/40 mt-2 block">Drafted by AI (Groq) from your niche. Nothing here touches the form until you press Apply.</span>
                </div>
              ) : null}
            </div>
            <label className="block sm:col-span-2">
              <span className="overline block mb-1.5">Eyebrow (on-video label)</span>
              <input className="input w-full font-mono" value={form.eyebrow} onChange={(e) => setForm({ ...form, eyebrow: e.target.value })} placeholder="OLD MONEY HABITS // OLD MONEY CODE" />
            </label>
            <label className="block">
              <span className="overline block mb-1.5">Tagline</span>
              <input className="input w-full" value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} placeholder="Wealth whispers." />
            </label>
            <label className="block">
              <span className="overline block mb-1.5">SEO tags (comma separated)</span>
              <input className="input w-full" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="old money, quiet luxury, wealth habits" />
            </label>
            <label className="block sm:col-span-2">
              <span className="overline block mb-1.5">Channel description</span>
              <textarea className="input w-full" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            {/* #106 T4c: destinations — the cross-posting lanes (FB posters, IG
                reels, Threads daily, the report rows) read these from the
                registry; a channel without one is skipped, never guessed. */}
            <div className="sm:col-span-2 inset-tile p-3">
              <span className="overline block mb-1.5">Destinations (cross-posting)</span>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="overline block mb-1.5">Facebook page ID</span>
                  <input className="input w-full font-mono" value={form.fbPageId} onChange={(e) => setForm({ ...form, fbPageId: e.target.value })} placeholder="114550268199751" />
                </label>
                <label className="block">
                  <span className="overline block mb-1.5">Instagram handle</span>
                  <input className="input w-full font-mono" value={form.igHandle} onChange={(e) => setForm({ ...form, igHandle: e.target.value })} placeholder="@channel" />
                </label>
                <label className="block">
                  <span className="overline block mb-1.5">Threads handle</span>
                  <input className="input w-full font-mono" value={form.threadsHandle} onChange={(e) => setForm({ ...form, threadsHandle: e.target.value })} placeholder="@channel" />
                </label>
                <label className="block">
                  <span className="overline block mb-1.5">TikTok handle</span>
                  <input className="input w-full font-mono" value={form.tiktokHandle} onChange={(e) => setForm({ ...form, tiktokHandle: e.target.value })} placeholder="@channel" />
                </label>
              </div>
              <p className="text-t-10 text-faint mt-1.5">
                The FB page ID is the numeric page form (or the new UC… form) — the page must be linked to the FB token for posting. Handles are saved
                without the leading @. Leave a field empty when the channel has no account there — the lanes skip it honestly.
              </p>
            </div>
          </div>
          <div className="flex gap-2 mt-4 flex-wrap">
            <button className="btn btn-primary" onClick={() => saveProfile(true)} disabled={saving || !form.niche.trim()} title="Saves, records your consent, and starts the nightly autopilot">
              {saving ? 'Saving…' : 'Save & start autopilot'}
            </button>
            <button className="btn btn-outline" onClick={() => saveProfile()} disabled={saving || !form.niche.trim()}>
              {saving ? 'Saving…' : 'Save, keep paused'}
            </button>
            <button className="btn btn-outline" onClick={connect} disabled={connecting} title="Refresh this channel's stored key (fixes 're-connect once' notices)">
              {connecting ? 'Opening Google…' : 'Re-connect key with Google'}
            </button>
            <button className="btn btn-outline" onClick={makeLink} disabled={makingLink} title="Paste this in the browser where this Gmail is logged in">
              {makingLink ? 'Creating…' : 'Copy re-connect link (other browser)'}
            </button>
            <Link className="btn btn-outline" href="/styles">
              Browse templates
            </Link>
          </div>
          {linkUrl ? (
            <div className="mt-3 space-y-2">
              <div className="flex gap-2">
                <input readOnly value={linkUrl} onFocus={(e) => e.target.select()} className="input flex-1 font-mono text-t-11" />
                <button
                  className="btn btn-primary shrink-0"
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(linkUrl); } catch { }
                    setCopied(true);
                  }}
                >
                  {copied ? 'Copied ✓' : 'Copy link'}
                </button>
                <button className="btn btn-ghost shrink-0" onClick={() => { setLinkUrl(''); setCopied(false); }}>
                  <X size={14} />
                </button>
              </div>
              <p className="text-t-11 text-faint leading-relaxed">
                Paste this in the browser where <b>{entry?.handle || 'this channel'}</b>&apos;s Gmail is logged in → choose that account → choose the same
                channel → Allow. Works once · 15 minutes. This upgrades the stored key — your settings here are kept.
              </p>
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* DONE */}
      {connectedSlug && saved ? (
        <Card className="p-5 mb-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={20} className="text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-t-14 font-bold text-ink">{started ? 'Autopilot started ✓ — the nightly run produces from tonight' : 'Saved ✓ — autopilot is OFF. Press “Save & start autopilot” (or Resume on Channels) when you want it to produce.'}</p>
              <p className="text-t-12 text-muted mt-1 leading-relaxed">
                {started ? (
                  <>
                    <b className="text-ink">{form.label || connectedSlug}</b> is live: 1 short per day at your slot, weekly episode on {form.docDay},
                    Sunday off. Your explicit consent for automated publishing was recorded {new Date().toLocaleDateString()} (YouTube API policy). Pause
                    anytime from the Channels page.
                  </>
                ) : (
                  <>
                    <b className="text-ink">{form.label || connectedSlug}</b> settings are saved but the autopilot is OFF — nothing publishes until you
                    start it with “Save & start autopilot”, or Resume from the Channels page.
                  </>
                )}
              </p>
              <div className="flex gap-2 mt-3">
                <Link className="btn btn-primary" href="/channels">
                  Back to channels
                </Link>
                <button
                  className="btn btn-outline"
                  onClick={() => {
                    setSaved(false);
                    setStarted(false);
                    setConnectedSlug('');
                    setKitMood('');
                    setKitDraft(null);
                    setKitNote('');
                    setForm({ label: '', niche: '', style: 'cinematic', voice: 'am_michael', accent: '#38BDF8', slots: '22:35', docDay: 'Tue', eyebrow: '', tagline: '', tags: '', description: '', fbPageId: '', igHandle: '', threadsHandle: '', tiktokHandle: '' });
                  }}
                >
                  <Plus size={14} /> Connect another channel
                </button>
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Connected list */}
      <Card className="mt-5 overflow-hidden">
        <CardHead title="Connected via Studio" sub="Channels this wizard linked — they run on the nightly Channel Autopilot" icon={Layers} />
        {!reg ? (
          <PageSkeleton />
        ) : reg.channels?.length ? (
          <div className="px-4 pb-4 space-y-2">
            {reg.channels.map((c) => (
              <div key={c.slug} className="inset-tile p-3 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-t-11 font-bold" style={{ background: `${c.accent}22`, color: c.accent }}>
                  {(c.label || c.slug).slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-t-12 font-semibold text-ink truncate">{c.label || c.slug}</p>
                  <p className="text-t-11 text-faint truncate font-mono">
                    {c.handle || c.channelId} · key: {c.tokenSecret}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1 justify-end shrink-0">
                  {c.style ? <Chip tone="accent">{STYLE_BY_ID[c.style]?.name || c.style}</Chip> : null}
                  {c.kit?.tags?.length ? <Chip tone="ok">kit saved</Chip> : null}
                  <Chip tone={c.tokenSecretSaved === false ? 'warn' : 'ok'}>{c.tokenSecretSaved === false ? 'secret missing' : 'key saved'}</Chip>
                  <button
                    className="icon-btn w-8 h-8 rounded-md shrink-0"
                    title="Open the setup form for this channel (also use this to re-connect and upgrade its dashboard data)"
                    onClick={() => {
                      setSaved(false);
                      setConnectedSlug(c.slug);
                      prefill(c);
                      setError('');
                    }}
                  >
                    <Settings2 size={14} />
                  </button>
                  <button
                    className="icon-btn w-8 h-8 rounded-md shrink-0 text-red-400 hover:text-red-300 hover:border-red-500/40"
                    title="Disconnect: revoke access, delete the key, remove from Studio. Videos on the channel stay."
                    onClick={async () => {
                      if (!window.confirm(`Disconnect ${c.label || c.slug}? The machine loses access immediately (key revoked) and it leaves the dashboard. Videos on the channel stay. Continue?`)) return;
                      const r = await fetch('/api/channels/registry?slug=' + c.slug, { method: 'DELETE' });
                      const d = await r.json().catch(() => ({}));
                      if (!r.ok) { setError(d.error || 'Disconnect failed'); return; }
                      loadReg();
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Layers} title="No channels connected yet" sub="Use Step 1 above — the Google login takes ~30 seconds." />
        )}
      </Card>

      {/* #115 — the hover demo popup (one at a time). Video bytes load only
          when it opens and are freed the moment it unmounts. */}
      {hoveredTpl && tplView
        ? (() => {
            const t = tplView.templates.find((x) => x.templateId === hoveredTpl.id);
            if (!t) return null;
            const src = previewSourceFor(t.templateId, t.family, tplSamples?.samples, tplSamples?.familySamples);
            const pos = popupAnchorFor(hoveredTpl.rect, POPUP, { width: window.innerWidth, height: window.innerHeight });
            const a = assignState[t.templateId];
            return (
              <div
                className="tpl-pop fixed z-50"
                style={{ left: pos.left, top: pos.top, width: POPUP.width }}
                onMouseEnter={cancelClose}
                onMouseLeave={scheduleClose}
              >
                {src?.mp4 ? (
                  <video
                    src={src.mp4}
                    poster={src.poster || undefined}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="w-full rounded-lg border border-line"
                    style={{ background: 'var(--surface-2)', aspectRatio: '16 / 9', objectFit: 'cover' }}
                  />
                ) : src?.poster ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={src.poster} alt="" className="w-full rounded-lg border border-line" style={{ background: 'var(--surface-2)' }} />
                ) : null}
                <div className="inset-tile p-3 mt-2 rounded-lg">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-t-13 font-bold text-ink">{t.name}</p>
                    <button type="button" className="icon-btn w-7 h-7 rounded-md shrink-0" onClick={closePreview} title="Close (Esc)">
                      <X size={13} />
                    </button>
                  </div>
                  <p className="text-t-11 text-muted mt-1 leading-relaxed">{t.catalog?.desc}</p>
                  {t.catalog?.usedFor ? <p className="text-t-10 text-faint mt-1">{t.catalog.usedFor}</p> : null}
                  <button
                    type="button"
                    className="btn btn-primary w-full mt-2"
                    onClick={() => assignTemplate(t.templateId)}
                    disabled={!connectedSlug || a?.state === 'assigning' || a?.state === 'done'}
                  >
                    {a?.state === 'assigning' ? 'Assigning…' : a?.state === 'done' ? 'Assigned ✓ — picked for this channel' : 'Use for this channel'}
                  </button>
                  {a?.state === 'error' ? <p className="text-t-10 text-red-400 mt-1">{a.msg}</p> : null}
                </div>
              </div>
            );
          })()
        : null}
      <style>{`@keyframes tplpop{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}.tpl-pop{animation:tplpop .14s ease-out}`}</style>

      {/* Setup */}
      <Card className="mt-5 overflow-hidden">
        <button className="w-full text-left" onClick={() => setShowSetup(!showSetup)}>
          <CardHead title="One-time Google setup" sub="If the login fails with redirect_uri_mismatch, register the callback URLs" icon={Settings2} />
        </button>
        {showSetup ? (
          <div className="px-4 pb-4 text-t-12 text-muted leading-relaxed">
            <ol className="list-decimal ml-4 space-y-1.5">
              <li>
                Open <span className="font-mono text-ink">console.cloud.google.com → APIs &amp; Services → Credentials</span> and open the OAuth client whose
                ID matches <span className="font-mono text-ink">YOUTUBE_CLIENT_ID</span>.
              </li>
              <li>
                Under <b className="text-ink">Authorized redirect URIs</b>, add both:
                <br />
                <span className="font-mono text-accent block mt-1">{origin}/api/oauth/callback</span>
                <span className="font-mono text-accent block">http://localhost:3000/api/oauth/callback</span>
              </li>
              <li>Save (may take a few minutes to apply), then press “Connect with Google” again.</li>
            </ol>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
