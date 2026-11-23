'use client';
// Creator City Phase 2 item 5 — one Library item, full size, in the shared
// Drawer. Scripts: the full text + Copy + Download (.txt). Thumbnails: the
// large image + Download. Voice: the player + Download. Research: topic,
// seed, sources (links) and claims + Copy.
// Bytes come from /api/library/artifacts/<id> (auth-checked, hash-verified);
// a 410 means the bytes passed their 30-day retention → said plainly.
import { useEffect, useState } from 'react';
import { FileText, Mic, Image as ImageIcon, Lightbulb, Copy, Check, Download, ExternalLink, RotateCw } from 'lucide-react';
import Drawer from '@/components/Drawer';
import { Chip, BrandMark, Skeleton } from '@/components/ui';
import { when } from '@/lib/utils';
import { fmtBytes, DOWNLOAD_MAX } from '@/lib/library-artifacts.mjs';

const ICON = { script: FileText, voice: Mic, thumbnail: ImageIcon, research: Lightbulb };
const GONE_TEXT = {
  expired: 'No longer stored (kept 30 days)',
  not_stored: 'This file was never saved',
  store_unavailable: 'File storage is unreachable right now',
  unreadable: "This file couldn't be read",
};
export const goneText = (reason) => GONE_TEXT[reason] || "Couldn't load this file";
export const itemUrl = (id) => `/api/library/artifacts/${encodeURIComponent(id)}`;
export const canDownload = (item) => !item.gone && (item.bytes == null || item.bytes <= DOWNLOAD_MAX);

// A broken <img>/<audio> can't read its HTTP status — ask the route once
// (one byte) and turn its JSON reason into words. OK bytes = a player/codec
// problem → the generic "Couldn't load this file".
export async function probeReason(id) {
  try {
    const r = await fetch(itemUrl(id), { headers: { Range: 'bytes=0-0' } });
    if (r.ok) return 'failed';
    const j = await r.json().catch(() => ({}));
    return j.reason || 'failed';
  } catch {
    return 'failed';
  }
}

const STATUS = {
  awaiting_review: { tone: 'warn', word: 'Waiting for you' },
  approved: { tone: 'info', word: 'Approved' },
  consumed: { tone: 'ok', word: 'Used' },
  rejected: { tone: 'bad', word: 'Rejected' },
  draft: { tone: 'plain', word: 'Draft' },
};
export function StatusChip({ status }) {
  const s = STATUS[status];
  return s ? <Chip tone={s.tone}>{s.word}</Chip> : null;
}

function GoneNote({ reason }) {
  return (
    <div className="inset-tile p-4 t-13 text-muted text-center">{goneText(reason)}</div>
  );
}

function saveText(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function researchText(data) {
  const it = data?.item || {};
  const lines = [it.topic, it.seed && it.seed !== it.topic ? it.seed : null].filter(Boolean);
  for (const s of data?.sources || []) lines.push(`${s.title || s.url || 'Source'}${s.url ? ` — ${s.url}` : ''}`);
  for (const c of data?.claims || []) lines.push(`• ${c.claim}`);
  return lines.join('\n');
}

export default function ArtifactViewer({ item, open, onClose, brand, label }) {
  const [nonce, setNonce] = useState(0);
  const [res, setRes] = useState({ key: null, data: null, error: null });
  const [copiedId, setCopiedId] = useState(null);
  const [imgFail, setImgFail] = useState({ id: null, reason: null });

  const id = item?.id || null;
  const needsJson = !!(open && item && !item.gone && (item.kind === 'script' || item.kind === 'research'));
  const key = needsJson ? `${id}#${nonce}` : null;

  useEffect(() => {
    if (!key || !id) return undefined;
    let alive = true;
    fetch(itemUrl(id))
      .then(async (r) => {
        if (r.status === 410) {
          const j = await r.json().catch(() => ({}));
          return { gone: j.reason || 'expired' };
        }
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((data) => alive && setRes({ key, data, error: null }))
      .catch(() => alive && setRes({ key, data: null, error: 'failed' }));
    return () => {
      alive = false;
    };
  }, [key, id]);

  if (!item) return null;
  const loading = needsJson && res.key !== key;
  const data = needsJson && !loading ? res.data : null;
  const failed = needsJson && !loading && res.error;
  const gone = item.gone || data?.gone || (imgFail.id === item.id ? imgFail.reason : null);
  const text = item.kind === 'script' ? data?.text || '' : item.kind === 'research' && data && !data.gone ? researchText(data) : '';

  const copy = () => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => setCopiedId(item.id)).catch(() => setCopiedId(null));
  };

  // a broken <img>/<audio> can't read its status — ask the route once to say why
  const onMediaError = () => {
    const forId = item.id;
    probeReason(forId).then((reason) => setImgFail({ id: forId, reason }));
  };

  const fileName = `${item.channel || 'channel'}-${item.kind}-${item.id}.txt`;
  const canCopy = !gone && !!text;
  const footer = (
    <>
      {canCopy ? (
        <button type="button" className="btn btn-sm btn-outline" onClick={copy}>
          {copiedId === item.id ? <><Check size={13} aria-hidden /> Copied</> : <><Copy size={13} aria-hidden /> Copy</>}
        </button>
      ) : null}
      {canCopy && item.kind === 'script' ? (
        <button type="button" className="btn btn-sm btn-outline" onClick={() => saveText(fileName, text)}>
          <Download size={13} aria-hidden /> Download
        </button>
      ) : null}
      {!gone && canDownload(item) && (item.kind === 'thumbnail' || item.kind === 'voice') ? (
        <a href={`${itemUrl(item.id)}?download=1`} className="btn btn-sm btn-outline">
          <Download size={13} aria-hidden /> Download
        </a>
      ) : null}
      {item.videoId ? (
        <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(item.videoId)}`} target="_blank" rel="noreferrer noopener" className="btn btn-sm btn-ghost">
          Video <ExternalLink size={12} aria-hidden />
        </a>
      ) : null}
    </>
  );

  return (
    <Drawer open={open} onClose={onClose} title={item.title} icon={ICON[item.kind] || FileText} size="lg" footer={footer}>
      <div className="flex items-center gap-2 flex-wrap mb-4 t-12 text-muted min-w-0">
        <BrandMark short={brand?.short || '•'} accent={brand?.accent || 'var(--faint)'} size={20} />
        <span className="truncate max-w-[14rem]">{label}</span>
        {item.createdAt ? <><span aria-hidden>·</span><time dateTime={item.createdAt} className="tnum">{when(item.createdAt)}</time></> : null}
        {fmtBytes(item.bytes) ? <><span aria-hidden>·</span><span className="tnum">{fmtBytes(item.bytes)}</span></> : null}
        <StatusChip status={item.status} />
      </div>

      {gone ? (
        <GoneNote reason={gone} />
      ) : item.kind === 'thumbnail' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={itemUrl(item.id)}
          alt={item.title}
          onError={onMediaError}
          className="w-full aspect-video object-contain rounded-xl"
          style={{ background: 'var(--surface-2)' }}
        />
      ) : item.kind === 'voice' ? (
        <audio controls preload="metadata" src={itemUrl(item.id)} onError={onMediaError} className="w-full">
          <track kind="captions" />
        </audio>
      ) : loading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      ) : failed ? (
        <div className="inset-tile p-4 flex items-center gap-3 flex-wrap">
          <p className="t-13 text-ink flex-1 min-w-0">Couldn&apos;t load this right now.</p>
          <button type="button" className="btn btn-sm btn-outline" onClick={() => setNonce((n) => n + 1)}>
            <RotateCw size={13} aria-hidden /> Retry
          </button>
        </div>
      ) : item.kind === 'script' ? (
        <pre className="whitespace-pre-wrap break-words font-sans t-13 text-ink leading-relaxed">{text || 'This script has no text saved.'}</pre>
      ) : (
        <ResearchBody data={data} />
      )}
    </Drawer>
  );
}

function ResearchBody({ data }) {
  const it = data?.item || {};
  const sources = data?.sources || [];
  const claims = data?.claims || [];
  return (
    <div className="space-y-4 min-w-0">
      {it.topic ? <p className="t-14 font-semibold text-ink break-words">{it.topic}</p> : null}
      {it.seed && it.seed !== it.topic ? <p className="t-13 text-muted break-words">{it.seed}</p> : null}
      {it.scriptTitle ? (
        <p className="t-12 text-faint break-words">
          <FileText size={12} className="inline -mt-px mr-1" aria-hidden />{it.scriptTitle}
        </p>
      ) : null}
      <section>
        <h3 className="t-12 font-semibold text-muted mb-1.5">Sources · {sources.length}</h3>
        {sources.length ? (
          <ul className="space-y-2">
            {sources.map((s, i) => (
              <li key={`${s.url || 'src'}-${i}`} className="inset-tile p-3 min-w-0">
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer noopener" className="t-13 font-medium text-ink underline break-words">
                    {s.title || s.url}
                  </a>
                ) : (
                  <span className="t-13 font-medium text-ink break-words">{s.title || 'Source'}</span>
                )}
                {s.snippet ? <p className="t-12 text-muted mt-1 break-words line-clamp-3">{s.snippet}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-12 text-faint">None saved</p>
        )}
      </section>
      {claims.length ? (
        <section>
          <h3 className="t-12 font-semibold text-muted mb-1.5">Claims · {claims.length}</h3>
          <ul className="space-y-1.5">
            {claims.map((c, i) => (
              <li key={i} className="t-13 text-ink flex items-start gap-2 min-w-0">
                <Chip tone={c.verification === 'verified' ? 'ok' : c.verification === 'flagged' ? 'bad' : 'plain'}>{c.verification}</Chip>
                <span className="break-words min-w-0">{c.claim}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
