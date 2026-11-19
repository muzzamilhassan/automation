'use client';
// Add Channel — a 7-step wizard (Connect → Identity → Look & sound →
// Thumbnails → Schedule → Destinations → Review & start). One form state for
// the whole flow, so moving between steps never loses anything; the steps
// themselves live in components/wizard/*, the step rules in
// lib/wizard-steps.mjs (pinned by tests/wizard-rebuild.test.mjs).
//
// API calls (all pre-existing): /api/channels/registry (GET list, DELETE in
// ConnectedChannels), /api/channels/profile (GET prefill, POST save),
// /api/channels/kit (#113 AI draft), /api/oauth/start (+ ?mode=link),
// /api/templates + /api/template-previews + /api/templates/assign (#115).
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { UserPlus, CheckCircle2, ArrowLeft, ArrowRight, Plus, Pencil, ExternalLink, Play, PauseCircle } from 'lucide-react';
import { Card, PageHeader, PageSkeleton } from '@/components/ui';
import { STYLE_BY_ID } from '@/lib/styles-catalog';
import { VOICES } from '@/lib/voices';
import { STEPS, STEP_INDEX, EMPTY_FORM, stepIssues, allIssues, canOpenStep, stepStates, reviewSummary } from '@/lib/wizard-steps.mjs';
import StepIndicator from '@/components/wizard/StepIndicator';
import ConnectStep from '@/components/wizard/ConnectStep';
import IdentityStep from '@/components/wizard/IdentityStep';
import TemplatePicker from '@/components/wizard/TemplatePicker';
import VoicePicker from '@/components/wizard/VoicePicker';
import AccentPicker from '@/components/wizard/AccentPicker';
import ThumbnailStep from '@/components/wizard/ThumbnailStep';
import SchedulePicker from '@/components/wizard/SchedulePicker';
import DestinationsStep from '@/components/wizard/DestinationsStep';
import ReviewStep from '@/components/wizard/ReviewStep';
import ConnectedChannels from '@/components/wizard/ConnectedChannels';
import GoogleSetupDrawer from '@/components/wizard/GoogleSetupDrawer';
import { Notice } from '@/components/wizard/fields';

const NAMES = {
  style: (id) => STYLE_BY_ID[id]?.name || '',
  voice: (id) => VOICES.find((v) => v.id === id)?.label || '',
};

const STEP_COPY = {
  connect: { title: 'Connect a YouTube channel', sub: "You'll sign in on Google's own page — Studio never sees your password." },
  identity: { title: 'What is the channel about?', sub: 'Name, niche, and the content pillars daily research rotates through.' },
  look: { title: 'Look & sound', sub: 'How the videos look and who narrates them.' },
  thumbnails: { title: 'Thumbnails', sub: 'The branding that goes on every cover.' },
  schedule: { title: 'When videos go out', sub: 'Pick times in your own clock — Studio converts them to UTC for the scheduler.' },
  destinations: { title: 'Also post to other platforms', sub: 'Optional cross-posting to Facebook, Instagram, Threads and TikTok.' },
  review: { title: 'Review & start', sub: 'Check every choice, then save. Nothing publishes until you start the autopilot.' },
};

function originNow() {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

async function readRegistry() {
  try {
    const x = await fetch('/api/channels/registry');
    const d = await x.json().catch(() => ({}));
    // a failed read is said out loud (Retry), never shown as "no channels"
    return x.ok && Array.isArray(d.channels) ? d : { channels: [], error: d.error || `HTTP ${x.status}` };
  } catch {
    return { channels: [], error: 'network error' };
  }
}

export default function AddChannel() {
  const [reg, setReg] = useState(null); // { channels, mode, canWriteSecrets, error? }
  const [connectedSlug, setConnectedSlug] = useState('');
  const [editing, setEditing] = useState(false); // an existing channel's saved settings
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [step, setStep] = useState(0);
  const [visited, setVisited] = useState([0]);
  const headingRef = useRef(null);
  const navigated = useRef(false);

  // connect / link
  const [connectError, setConnectError] = useState('');
  const [secretWarning, setSecretWarning] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [makingLink, setMakingLink] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showSetup, setShowSetup] = useState(false);

  // #113 — LLM kit drafts: reviewable per-field suggestions with explicit
  // Apply. Template fallback fills as before and is stated as such.
  const [fillingKit, setFillingKit] = useState(false);
  const [kitMood, setKitMood] = useState('');
  const [kitDraft, setKitDraft] = useState(null); // { kit, suggestion, applied }
  const [kitNote, setKitNote] = useState('');
  const [kitError, setKitError] = useState('');

  // #115 — production templates + CI sample MP4s, per-template assign state
  const [tpl, setTpl] = useState({ status: 'loading', templates: [], assignedIds: [] });
  const [samples, setSamples] = useState({ status: 'loading', samples: {}, familySamples: {} });
  const [assignState, setAssignState] = useState({}); // templateId -> { state, msg? }

  // #112 — target audience for the slot suggestion; wizard-local, not saved
  const [audience, setAudience] = useState('');

  // review / save
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const [started, setStarted] = useState(false);

  const setField = useCallback((key, value) => setForm((f) => ({ ...f, [key]: value })), []);
  const closeSetup = useCallback(() => setShowSetup(false), []);

  const loadReg = useCallback(() => readRegistry().then(setReg), []);

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

  // the saved profile wins; the registry row is the fallback
  const loadProfile = (slug, channels) => {
    const fallback = () => {
      const entry = (channels || []).find((c) => c.slug === slug);
      if (entry) prefill(entry);
    };
    return fetch(`/api/channels/profile?slug=${encodeURIComponent(slug)}`)
      .then((x) => x.json())
      .then((d) => (d?.channel ? prefill(d.channel) : fallback()))
      .catch(fallback);
  };

  // first load: registry + the OAuth return (?connected= / ?error= /
  // ?secretWarning=) or edit mode (?edit=slug opens ANY channel's setup)
  useEffect(() => {
    let alive = true;
    (async () => {
      const q = new URLSearchParams(window.location.search);
      const r = await readRegistry();
      if (!alive) return;
      setReg(r);
      if (q.get('error')) setConnectError(q.get('error'));
      if (q.get('secretWarning')) setSecretWarning(q.get('secretWarning'));
      const editSlug = q.get('edit');
      const slug = editSlug || q.get('connected');
      if (slug) {
        setConnectedSlug(slug);
        if (editSlug) {
          setEditing(true);
          setStep(1);
          setVisited([0, 1]);
        }
        loadProfile(slug, r.channels);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // #115 — registry templates (with this channel's current assignments when
  // known) + CI sample MP4s. Failures show a Retry instead of hiding.
  const tplReq = useRef(0); // only the newest templates response may land
  const loadTemplates = useCallback((slug) => {
    const id = ++tplReq.current;
    const url = slug ? `/api/templates?channel=${encodeURIComponent(slug)}` : '/api/templates';
    return fetch(url)
      .then(async (r) => ({ r, d: await r.json().catch(() => ({})) }))
      .then(({ r, d }) => {
        if (id !== tplReq.current) return;
        if (!Array.isArray(d?.templates)) throw new Error('no templates');
        setTpl({
          status: 'ready',
          templates: d.templates,
          assignedIds: Array.isArray(d.assignments) ? d.assignments.map((a) => a.family_id) : [],
          assignError: Boolean(slug && (!r.ok || d.error)),
        });
      })
      .catch(() => {
        if (id === tplReq.current) setTpl({ status: 'error', templates: [], assignedIds: [] });
      });
  }, []);
  const loadSamples = useCallback(() => {
    return fetch('/api/template-previews')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setSamples({ status: 'ready', samples: d?.samples || {}, familySamples: d?.familySamples || {} }))
      .catch(() => setSamples({ status: 'error', samples: {}, familySamples: {} }));
  }, []);
  useEffect(() => {
    loadSamples();
  }, [loadSamples]);
  useEffect(() => {
    loadTemplates(connectedSlug);
  }, [connectedSlug, loadTemplates]);

  // move focus to the new step's heading so keyboard + screen-reader users
  // land on it (skipped on first render)
  useEffect(() => {
    if (!navigated.current) return;
    const h = headingRef.current;
    if (!h) return;
    h.focus({ preventScroll: true });
    if (h.getBoundingClientRect().top < 0) h.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [step]);

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
        throw new Error(d.error === 'incompatible' ? `Not compatible: ${(d.reasons || []).join('; ')}` : (d.error || 'Assign failed'));
      }
      setAssignState((s) => ({ ...s, [templateId]: { state: 'done' } }));
    } catch (e) {
      setAssignState((s) => ({ ...s, [templateId]: { state: 'error', msg: e.message } }));
    }
  };

  const autoFillKit = async () => {
    if (!form.niche.trim()) {
      setKitError('Type a niche first — the kit generator drafts from it.');
      return;
    }
    setFillingKit(true);
    setKitError('');
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
        // suggestion with an explicit Apply action.
        setKitDraft({ kit: d.kit, suggestion: d.suggestion || {}, applied: {} });
      } else {
        // template path (or AI fallback) — fills as before, and says which path
        setKitDraft(null);
        setKitNote(d.note ? `AI unavailable (${d.note}) — drafted by the template generator and filled in.` : 'Drafted by the template generator and filled in.');
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
      setKitError(e.message);
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
    setConnectError('');
    try {
      const r = await fetch('/api/oauth/start?mode=link');
      const d = await r.json();
      if (!r.ok) {
        setConnectError(d.error || 'Could not create the connect link.');
        setMakingLink(false);
        return;
      }
      setLinkUrl(d.url);
    } catch {
      setConnectError('Network error creating the link.');
    }
    setMakingLink(false);
  };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(linkUrl); } catch { }
    setCopied(true);
  };
  const clearLink = () => { setLinkUrl(''); setCopied(false); };

  const connect = async () => {
    setConnecting(true);
    setConnectError('');
    try {
      const r = await fetch('/api/oauth/start');
      const d = await r.json();
      if (!r.ok) {
        setConnectError(d.error || 'Could not start the Google login.');
        if (r.status === 500) setShowSetup(true);
        setConnecting(false);
        return;
      }
      window.location.href = d.url;
    } catch {
      setConnectError('Network error starting the login.');
      setConnecting(false);
    }
  };

  // start=undefined saves settings and leaves the autopilot flag alone;
  // start === true records consent and flips the autopilot on (YouTube API
  // express-consent requirement). A plain save must never send `false` —
  // that used to switch live channels off.
  const saveProfile = async (start) => {
    setSaving(true);
    setSaveError('');
    try {
      const subNichesList = String(form.subNiches || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
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
            tags: String(form.tags || '').split(',').map((t) => t.trim()).filter(Boolean),
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
      setStarted(start === true);
      loadReg();
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const ctx = { form, connectedSlug };

  const goTo = (i) => {
    if (i < 0 || i >= STEPS.length || !canOpenStep(i, ctx)) return;
    navigated.current = true;
    setStep(i);
    setVisited((v) => (v.includes(i) ? v : [...v, i]));
  };

  const resetWizard = () => {
    setSaved(false);
    setStarted(false);
    setConnectedSlug('');
    setEditing(false);
    setForm({ ...EMPTY_FORM });
    setKitMood('');
    setKitDraft(null);
    setKitNote('');
    setKitError('');
    setAssignState({});
    setAudience('');
    setConsent(false);
    setSaveError('');
    setSecretWarning('');
    setConnectError('');
    clearLink();
    navigated.current = true;
    setStep(0);
    setVisited([0]);
    // drop ?edit= / ?connected= so a reload doesn't reopen the old channel
    try { window.history.replaceState(null, '', window.location.pathname); } catch { }
  };

  const editChannel = (c) => {
    resetWizard();
    setConnectedSlug(c.slug);
    setEditing(true);
    prefill(c);
    setStep(1);
    setVisited([0, 1]);
    // after the drawer closes (and hands focus back to its row), bring the
    // owner up to the wizard heading
    setTimeout(() => {
      const h = headingRef.current;
      if (!h) return;
      h.focus({ preventScroll: true });
      h.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 80);
  };

  if (!reg) return <PageSkeleton />;

  const entry = reg.channels?.find((c) => c.slug === connectedSlug);
  const current = STEPS[step];
  const states = stepStates(ctx, { current: step, visited, editing });
  const currentIssues = stepIssues(current.id, ctx);
  const blocking = allIssues(ctx);
  const channelName = form.label || entry?.label || connectedSlug;
  const copy = current.id === 'connect' && connectedSlug ? { title: 'Is this the right channel?', sub: 'Studio is connected to this YouTube channel through Google.' } : STEP_COPY[current.id];
  const canSave = Boolean(connectedSlug) && !saving && form.niche.trim() && blocking.length === 0;
  const linkProps = { onConnect: connect, connecting, onMakeLink: makeLink, makingLink, url: linkUrl, copied, onCopy: copyLink, onClear: clearLink, error: connectError };

  return (
    <div className="max-w-5xl">
      <PageHeader
        icon={UserPlus}
        title={editing && connectedSlug ? `Edit ${channelName}` : 'Add channel'}
        sub={editing && connectedSlug ? 'Change any step, then save from Review & start.' : 'Connect a YouTube channel, set it up step by step, then start the autopilot.'}
      />

      {saved ? (
        <Card className="p-6">
          <div className="flex items-start gap-3">
            {started ? (
              <CheckCircle2 size={22} className="shrink-0 mt-0.5" style={{ color: 'var(--ok-ink)' }} />
            ) : (
              <PauseCircle size={22} className="shrink-0 mt-0.5" style={{ color: 'var(--info-ink)' }} />
            )}
            <div className="min-w-0">
              <p className="t-16 font-bold text-ink">
                {started ? `${channelName} is live — the nightly run produces from tonight` : `${channelName} is saved — the autopilot is off`}
              </p>
              <p className="t-13 text-muted mt-1.5 leading-relaxed">
                {started
                  ? `One short per day at your times, a long episode every ${form.docDay}, Sunday off. Your consent to automated publishing was recorded on ${new Date().toLocaleDateString()} (YouTube API policy). Pause any time from the Channels page.`
                  : 'Nothing publishes until you start it — come back here and press “Save & start autopilot”, or use Resume on the Channels page.'}
              </p>
              <div className="flex flex-wrap gap-2 mt-4">
                <Link className="btn btn-primary" href={`/channels/${encodeURIComponent(connectedSlug)}`}>
                  <ExternalLink size={14} /> Open channel page
                </Link>
                <button type="button" className="btn btn-outline" onClick={() => { setSaved(false); navigated.current = true; setStep(STEP_INDEX.review); }}>
                  <Pencil size={14} /> Review settings again
                </button>
                <button type="button" className="btn btn-outline" onClick={resetWizard}>
                  <Plus size={14} /> Connect another channel
                </button>
                <Link className="btn btn-ghost" href="/channels">Back to channels</Link>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-[13.5rem_minmax(0,1fr)] gap-5 items-start">
          <StepIndicator steps={STEPS} states={states} current={step} onSelect={goTo} />

          <Card className="min-w-0 overflow-hidden">
            <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-line">
              <p className="overline">Step {step + 1} of {STEPS.length}{current.optional ? ' · optional' : ''}</p>
              <h2 ref={headingRef} tabIndex={-1} className="font-display t-16 font-bold text-ink mt-1 outline-none">{copy.title}</h2>
              <p className="t-13 text-muted mt-0.5">{copy.sub}</p>
            </div>

            <div className="px-5 sm:px-6 py-5">
              {connectError && current.id !== 'connect' ? (
                <div className="mb-4">
                  <Notice tone="bad" title="Google connection problem" action={<button type="button" className="btn btn-sm btn-outline" onClick={() => setShowSetup(true)}>Setup help</button>}>{connectError}</Notice>
                </div>
              ) : null}

              {current.id === 'connect' ? (
                <ConnectStep
                  connectedSlug={connectedSlug}
                  entry={entry}
                  secretWarning={secretWarning}
                  error={connectError}
                  connecting={connecting}
                  onConnect={connect}
                  makingLink={makingLink}
                  onMakeLink={makeLink}
                  linkUrl={linkUrl}
                  copied={copied}
                  onCopyLink={copyLink}
                  onClearLink={clearLink}
                  onOpenSetup={() => setShowSetup(true)}
                  onContinue={() => goTo(STEP_INDEX.identity)}
                  onStartOver={resetWizard}
                />
              ) : null}

              {current.id === 'identity' ? (
                <IdentityStep
                  form={form}
                  setField={setField}
                  setForm={setForm}
                  names={NAMES}
                  kit={{
                    filling: fillingKit,
                    onAutoFill: autoFillKit,
                    draft: kitDraft,
                    note: kitNote,
                    mood: kitMood,
                    error: kitError,
                    onApply: applyDraftField,
                    onApplyAll: applyAllDraftFields,
                    onDiscard: () => setKitDraft(null),
                  }}
                />
              ) : null}

              {current.id === 'look' ? (
                <div className="space-y-8">
                  <TemplatePicker
                    style={form.style}
                    onStyle={(id) => setField('style', id)}
                    niche={form.niche}
                    connectedSlug={connectedSlug}
                    templates={tpl}
                    samples={samples}
                    assignState={assignState}
                    onAssign={assignTemplate}
                    onRetryTemplates={() => { setTpl((t) => ({ ...t, status: 'loading' })); loadTemplates(connectedSlug); }}
                    onRetrySamples={() => { setSamples((s) => ({ ...s, status: 'loading' })); loadSamples(); }}
                  />
                  <div className="border-t border-line pt-6">
                    <VoicePicker value={form.voice} onChange={(v) => setField('voice', v)} />
                  </div>
                  <div className="border-t border-line pt-6">
                    <AccentPicker value={form.accent} onChange={(c) => setField('accent', c)} />
                  </div>
                </div>
              ) : null}

              {current.id === 'thumbnails' ? (
                <ThumbnailStep form={form} setField={setField} onEditAccent={() => goTo(STEP_INDEX.look)} />
              ) : null}

              {current.id === 'schedule' ? (
                <SchedulePicker
                  slots={form.slots}
                  docDay={form.docDay}
                  onSlots={(v) => setField('slots', v)}
                  onDocDay={(d) => setField('docDay', d)}
                  audience={audience}
                  onAudience={setAudience}
                />
              ) : null}

              {current.id === 'destinations' ? <DestinationsStep form={form} setField={setField} /> : null}

              {current.id === 'review' ? (
                <ReviewStep
                  sections={reviewSummary(form, { channel: entry || { slug: connectedSlug, label: channelName }, offsetMin: -new Date().getTimezoneOffset(), names: NAMES })}
                  onEdit={(id) => goTo(STEP_INDEX[id])}
                  issues={blocking}
                  consent={consent}
                  onConsent={setConsent}
                  channelName={channelName}
                  accent={form.accent}
                />
              ) : null}
            </div>

            {current.id !== 'connect' ? (
              <div className="px-5 sm:px-6 py-4 border-t border-line flex flex-wrap items-center gap-2" style={{ background: 'var(--surface-2)' }}>
                <button type="button" className="btn btn-ghost" onClick={() => goTo(step - 1)}>
                  <ArrowLeft size={14} /> Back
                </button>
                {current.id === 'review' ? (
                  <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                    {saveError ? <p className="t-12 w-full text-right" style={{ color: 'var(--bad-ink)' }} role="alert">Couldn&apos;t save: {saveError}</p> : null}
                    <button type="button" className="btn btn-outline" onClick={() => saveProfile()} disabled={!canSave} title="Saves every step; the autopilot stays as it is">
                      {saving ? 'Saving…' : 'Save, keep paused'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => saveProfile(true)}
                      disabled={!canSave || !consent}
                      title={consent ? 'Saves, records your consent, and starts the nightly autopilot' : 'Tick the consent box first'}
                    >
                      <Play size={14} /> {saving ? 'Saving…' : 'Save & start autopilot'}
                    </button>
                  </div>
                ) : (
                  <div className="ml-auto flex flex-wrap items-center justify-end gap-3 min-w-0">
                    {currentIssues.length ? <p className="t-12 min-w-0" style={{ color: 'var(--warn-ink)' }}>{currentIssues[0]}</p> : null}
                    <button type="button" className="btn btn-primary" onClick={() => goTo(step + 1)} disabled={currentIssues.length > 0}>
                      {current.optional ? 'Continue' : 'Next'}: {STEPS[step + 1].label} <ArrowRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </Card>
        </div>
      )}

      <ConnectedChannels reg={reg} onRetry={loadReg} onEdit={editChannel} onChanged={loadReg} names={NAMES} link={linkProps} />

      <GoogleSetupDrawer open={showSetup} onClose={closeSetup} origin={originNow()} />
    </div>
  );
}
