'use client';
// Step 1 — connect a YouTube channel with Google's own login, or confirm the
// channel that just came back from Google ("Is this the right channel?").
import { ArrowRight, CheckCircle2, ShieldCheck, Smartphone, RefreshCw, HelpCircle } from 'lucide-react';
import { Chip } from '@/components/ui';
import { keyStatus } from '@/lib/wizard-steps.mjs';
import { ConnectLinkBox, Notice } from './fields';

const WHAT_YOU_SEE = ['Choose your Gmail account', 'Choose the YouTube channel', 'Press Allow'];

export default function ConnectStep({
  connectedSlug, entry, secretWarning, error,
  connecting, onConnect, makingLink, onMakeLink, linkUrl, copied, onCopyLink, onClearLink,
  onOpenSetup, onContinue, onStartOver,
}) {
  const linkNote = connectedSlug
    ? `Paste this in the browser where ${entry?.handle || 'this channel'}'s Gmail is logged in → choose that account → choose the same channel → Allow. Works once · 15 minutes. It refreshes the stored key; your settings here are kept.`
    : 'Paste this in the browser where your Gmail is logged in → choose the account → choose the channel → Allow. Works once and expires in 15 minutes — treat it like a password. Then finish the setup here.';

  const errorBox = error ? (
    <Notice
      tone="bad"
      title="Google connection problem"
      action={<button type="button" className="btn btn-sm btn-outline" onClick={onOpenSetup}>Setup help</button>}
    >
      {error}
      {/redirect_uri_mismatch/i.test(error) ? (
        <p className="t-11 text-faint mt-1">Google doesn&apos;t know this Studio address yet. “Setup help” shows the one-time fix.</p>
      ) : null}
    </Notice>
  ) : null;

  if (connectedSlug) {
    const key = entry ? keyStatus(entry) : null;
    return (
      <div className="space-y-4">
        {errorBox}
        <div className="rounded-xl border border-line p-4 flex items-start gap-3" style={{ background: 'var(--surface-2)' }}>
          <CheckCircle2 size={20} className="shrink-0 mt-0.5" style={{ color: 'var(--ok-ink)' }} />
          <div className="min-w-0 flex-1">
            <p className="t-14 font-bold text-ink truncate">{entry?.label || connectedSlug}</p>
            <p className="t-12 text-muted truncate">{entry?.handle || entry?.channelId || 'Connected through Google'}</p>
            {key ? (
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <Chip tone={key.tone} dot>{key.label}</Chip>
                {key.secret ? <span className="t-11 font-mono text-faint truncate">{key.secret}</span> : null}
              </div>
            ) : (
              <p className="t-11 text-faint mt-2">This channel isn&apos;t in the Studio registry yet — its key status is unknown until you save.</p>
            )}
          </div>
        </div>

        {secretWarning ? (
          <Notice tone="warn" title="The key couldn't be stored for the cloud runner">
            The channel is registered, but nightly runs can&apos;t use it until the key is stored ({secretWarning}). Re-connecting with Google
            below retries it.
            <details className="mt-1.5">
              <summary className="t-11 text-faint cursor-pointer">Developer fix</summary>
              <span className="font-mono t-11 block mt-1 break-all">gh secret set {entry?.tokenSecret || '<SECRET_NAME>'} {'<'} token.json</span>
            </details>
          </Notice>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={onContinue}>
            Yes, set it up <ArrowRight size={14} />
          </button>
          <button type="button" className="btn btn-outline" onClick={onConnect} disabled={connecting} title="Refresh this channel's stored key">
            <RefreshCw size={14} /> {connecting ? 'Opening Google…' : 'Re-connect key with Google'}
          </button>
          <button type="button" className="btn btn-outline" onClick={onMakeLink} disabled={makingLink}>
            <Smartphone size={14} /> {makingLink ? 'Creating…' : 'Re-connect from another browser'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onStartOver}>
            Connect a different channel
          </button>
        </div>
        <ConnectLinkBox url={linkUrl} copied={copied} onCopy={onCopyLink} onClear={onClearLink} note={linkNote} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {errorBox}
      <div>
        <p className="t-12 font-semibold text-ink mb-2">What you&apos;ll see on Google</p>
        <ol className="grid sm:grid-cols-3 gap-2">
          {WHAT_YOU_SEE.map((t, i) => (
            <li key={t} className="inset-tile rounded-xl p-3 flex items-center gap-2.5 min-w-0">
              <span className="flex items-center justify-center w-6 h-6 rounded-full t-11 font-bold shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                {i + 1}
              </span>
              <span className="t-12 text-ink min-w-0">{t}</span>
            </li>
          ))}
        </ol>
      </div>

      <div>
        <button type="button" className="btn btn-primary w-full sm:w-auto" onClick={onConnect} disabled={connecting}>
          <ShieldCheck size={15} /> {connecting ? 'Opening Google…' : 'Connect with Google'} <ArrowRight size={14} />
        </button>
        <p className="t-11 text-faint mt-2 leading-relaxed">
          Your password never touches Studio. Channels on several Gmail accounts? Connect them one at a time — each connect is its own login,
          and only the channel&apos;s ID and name are saved.
        </p>
      </div>

      <details className="rounded-xl border border-line px-4 py-3 group">
        <summary className="t-13 font-semibold text-ink cursor-pointer flex items-center gap-2">
          <Smartphone size={14} className="text-muted" /> Connecting from another browser or phone?
        </summary>
        <div className="mt-3 space-y-3">
          {!linkUrl ? (
            <button type="button" className="btn btn-outline w-full sm:w-auto" onClick={onMakeLink} disabled={makingLink}>
              {makingLink ? 'Creating…' : 'Generate a one-time connect link'}
            </button>
          ) : null}
          <ConnectLinkBox url={linkUrl} copied={copied} onCopy={onCopyLink} onClear={onClearLink} note={linkNote} />
        </div>
      </details>

      <details className="rounded-xl border border-line px-4 py-3">
        <summary className="t-13 font-semibold text-ink cursor-pointer flex items-center gap-2">
          <HelpCircle size={14} className="text-muted" /> Why does Studio need these permissions?
        </summary>
        <ul className="mt-2 space-y-1 t-12 text-muted list-disc ml-5">
          <li>Upload videos to the channel you pick (the autopilot&apos;s job).</li>
          <li>Read the channel&apos;s videos and settings, and manage titles, captions and thumbnails.</li>
          <li>Read YouTube Analytics so the dashboard shows real numbers.</li>
        </ul>
        <p className="t-11 text-faint mt-2">You can revoke access any time with “Disconnect” — videos on the channel stay.</p>
      </details>
    </div>
  );
}
