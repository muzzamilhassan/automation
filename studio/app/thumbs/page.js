'use client';
// Thumbnail Studio — /thumbs. Pick channel → video → template → customize
// (title, accent word, chip, eyebrow, accent color, photo) → live preview at
// full + mobile size with a legibility checklist → attach to the video.
import { useEffect, useRef, useState } from 'react';
import { Loader2, Image as ImageIcon, Smartphone as Mobile, CheckCircle2, XCircle, Search, Upload, Wand2, Paperclip } from 'lucide-react';

const TEMPLATES = [
  { id: 'clean', label: 'Clean Frame', desc: 'Full-bleed photo + centered headline' },
  { id: 'poster', label: 'Bold Poster', desc: 'Shade panel + huge left headline' },
  { id: 'paper', label: 'Paper Doc', desc: 'Warm paper, masked photo, serif' },
];

const fmtDay = (s) => (s ? String(s).slice(0, 10) : '');

export default function ThumbsPage() {
  const [channels, setChannels] = useState([]);
  const [slug, setSlug] = useState('');
  const [accent, setAccent] = useState('#E8C15A');
  const [brand, setBrand] = useState('');
  const [videos, setVideos] = useState(null);
  const [video, setVideo] = useState(null); // {videoId,title}
  const [template, setTemplate] = useState('clean');
  const [title, setTitle] = useState('');
  const [accentWord, setAccentWord] = useState('');
  const [chip, setChip] = useState('');
  const [eyebrow, setEyebrow] = useState('');
  const [shade, setShade] = useState('#0A1128');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const [photoQuery, setPhotoQuery] = useState('');
  const [photos, setPhotos] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [preview, setPreview] = useState(null); // {image, bytes, words, checklist}
  const [previewErr, setPreviewErr] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [attachMsg, setAttachMsg] = useState(null);
  const debounce = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    fetch('/api/overview')
      .then((r) => r.json())
      .then((d) => {
        const list = (d.channels || []).map((c) => ({ slug: c.slug, label: c.label, accent: c.accent, tags: c.todayTopics ? undefined : undefined, brand: c.label }));
        setChannels(list);
        if (list.length) pickChannel(list[0]);
      })
      .catch(() => setChannels([]));
  }, []);

  const pickChannel = (c) => {
    setSlug(c.slug);
    setAccent(c.accent || '#E8C15A');
    setBrand(c.label || '');
    setVideo(null);
    setVideos(null);
    fetch(`/api/thumbs/videos?slug=${encodeURIComponent(c.slug)}`)
      .then((r) => r.json())
      .then((d) => setVideos(d.videos || []))
      .catch(() => setVideos([]));
  };

  const pickVideo = (v) => {
    setVideo(v);
    setTitle(v.title.replace(/\s*[|#].*$/, '').trim() || v.title);
    setAccentWord('');
    setAttachMsg(null);
  };

  const reqBody = () => ({
    template, title, accent, accentWord, chip, eyebrow, shade, brand,
    photoDataUrl: photoDataUrl || undefined,
    photoUrl: !photoDataUrl && photoUrl ? photoUrl : undefined,
  });

  const renderPreview = () => {
    if (!title.trim()) { setPreview(null); return; }
    setPreviewing(true);
    setPreviewErr('');
    fetch('/api/thumbs/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reqBody()) })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok || d.error) { setPreviewErr(d.error || 'render failed'); setPreview(null); }
        else setPreview(d);
      })
      .catch((e) => { setPreviewErr(e.message); setPreview(null); })
      .finally(() => setPreviewing(false));
  };

  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(renderPreview, 650);
    return () => clearTimeout(debounce.current);
  }, [template, title, accentWord, accent, chip, eyebrow, shade, photoUrl, photoDataUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const searchPhotos = () => {
    if (!photoQuery.trim()) return;
    setPhotoBusy(true);
    fetch(`/api/thumbs/photos?q=${encodeURIComponent(photoQuery)}`)
      .then((r) => r.json())
      .then((d) => setPhotos(d.photos || []))
      .catch(() => setPhotos([]))
      .finally(() => setPhotoBusy(false));
  };

  const onUpload = (f) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { setPhotoDataUrl(String(reader.result)); setPhotoUrl(''); setPhotos(null); };
    reader.readAsDataURL(f);
  };

  const attach = async () => {
    if (!preview || !video) return;
    setAttaching(true);
    setAttachMsg(null);
    try {
      const r = await fetch('/api/thumbs/attach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, videoId: video.videoId, imageDataUrl: preview.image }),
      });
      const d = await r.json();
      setAttachMsg(d.ok ? { ok: true, text: `Attached to "${video.title.slice(0, 40)}…" — live on YouTube shortly.` } : { ok: false, text: d.error });
    } catch (e) {
      setAttachMsg({ ok: false, text: e.message });
    } finally {
      setAttaching(false);
    }
  };

  const words = title.trim().split(/\s+/).filter(Boolean).length;
  const ck = preview?.checklist;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight flex items-center gap-2"><ImageIcon size={18} /> Thumbnails</h1>
          <p className="text-[12px] text-muted mt-0.5">Design from templates, preview at mobile size, attach straight to YouTube.</p>
        </div>
        <select value={slug} onChange={(e) => pickChannel(channels.find((c) => c.slug === e.target.value) || channels[0])} className="ml-auto text-[13px] px-3 py-2 rounded-lg border border-line bg-surface">
          {channels.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
        </select>
      </div>

      <div className="grid lg:grid-cols-[1fr_420px] gap-5">
        {/* Left column: video pick + controls */}
        <div className="space-y-4">
          <div className="border border-line rounded-xl bg-surface p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted mb-2 flex items-center gap-1.5"><Paperclip size={12} /> 1 · Pick a video</div>
            {!videos ? (
              <div className="flex items-center gap-2 text-muted text-[12.5px] py-2"><Loader2 size={13} className="animate-spin" /> Loading videos…</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(videos || []).map((v) => (
                  <button key={v.videoId} onClick={() => pickVideo(v)}
                    className={`text-left rounded-lg overflow-hidden border transition-colors ${video?.videoId === v.videoId ? 'border-accent' : 'border-line hover:border-line-strong'}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={v.thumb} alt="" className="w-full aspect-video object-cover" />
                    <div className="p-1.5 text-[10.5px] text-muted leading-tight line-clamp-2">{v.title}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="border border-line rounded-xl bg-surface p-4 space-y-3">
            <div className="text-[11px] uppercase tracking-wide text-muted flex items-center gap-1.5"><Wand2 size={12} /> 2 · Design</div>
            <div className="grid grid-cols-3 gap-2">
              {TEMPLATES.map((t) => (
                <button key={t.id} onClick={() => setTemplate(t.id)}
                  className={`text-left p-2.5 rounded-lg border ${template === t.id ? 'border-accent bg-bg-soft' : 'border-line hover:border-line-strong'}`}>
                  <div className="text-[12.5px] font-semibold">{t.label}</div>
                  <div className="text-[10.5px] text-muted leading-snug mt-0.5">{t.desc}</div>
                </button>
              ))}
            </div>
            <label className="block">
              <span className="text-[11px] text-muted">Headline (≤4 words clicks best)</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. The Silent Wealth Trap"
                className="mt-1 w-full text-[13px] px-3 py-2 rounded-lg border border-line bg-bg-soft" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[11px] text-muted">Accent word (highlighted)</span>
                <input value={accentWord} onChange={(e) => setAccentWord(e.target.value)} placeholder="auto-picked if empty"
                  className="mt-1 w-full text-[13px] px-3 py-2 rounded-lg border border-line bg-bg-soft" />
              </label>
              <label className="block">
                <span className="text-[11px] text-muted">Category chip</span>
                <input value={chip} onChange={(e) => setChip(e.target.value)} placeholder="e.g. MARKETS"
                  className="mt-1 w-full text-[13px] px-3 py-2 rounded-lg border border-line bg-bg-soft" />
              </label>
              <label className="block">
                <span className="text-[11px] text-muted">Eyebrow (small top text)</span>
                <input value={eyebrow} onChange={(e) => setEyebrow(e.target.value)} placeholder="optional"
                  className="mt-1 w-full text-[13px] px-3 py-2 rounded-lg border border-line bg-bg-soft" />
              </label>
              <label className="block">
                <span className="text-[11px] text-muted">Accent color</span>
                <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)}
                  className="mt-1 w-full h-[38px] rounded-lg border border-line bg-bg-soft" />
              </label>
            </div>
            <div>
              <span className="text-[11px] text-muted flex items-center gap-1.5 mb-1"><Search size={11} /> 3 · Photo — search Pexels or upload</span>
              <div className="flex gap-2">
                <input value={photoQuery} onChange={(e) => setPhotoQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchPhotos()}
                  placeholder="e.g. old money, wall street, marble statue"
                  className="flex-1 text-[13px] px-3 py-2 rounded-lg border border-line bg-bg-soft" />
                <button onClick={searchPhotos} disabled={photoBusy} className="text-[12.5px] font-medium px-3 py-2 rounded-lg border border-line hover:bg-surface-2 disabled:opacity-50 flex items-center gap-1.5">
                  {photoBusy ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} Search
                </button>
                <button onClick={() => fileRef.current?.click()} className="text-[12.5px] px-3 py-2 rounded-lg border border-line hover:bg-surface-2 flex items-center gap-1.5" title="Upload your own photo">
                  <Upload size={13} />
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onUpload(e.target.files?.[0])} />
              </div>
              {photos?.length ? (
                <div className="grid grid-cols-4 gap-1.5 mt-2">
                  {photos.map((p, i) => (
                    <button key={i} onClick={() => { setPhotoUrl(p.url); setPhotoDataUrl(''); }}
                      className={`rounded-lg overflow-hidden border ${photoUrl === p.url ? 'border-accent' : 'border-line hover:border-line-strong'}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.thumb} alt={p.alt} className="w-full aspect-video object-cover" />
                    </button>
                  ))}
                </div>
              ) : null}
              {photoDataUrl ? <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: 'var(--ok)' }}><CheckCircle2 size={11} /> uploaded photo in use</p> : null}
            </div>
          </div>
        </div>

        {/* Right column: preview + checklist + attach */}
        <div className="space-y-4 lg:sticky lg:top-[76px] self-start">
          <div className="border border-line rounded-xl bg-surface p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted mb-2">4 · Preview {previewing ? '· rendering…' : ''}</div>
            {previewErr ? (
              <p className="text-[12px]" style={{ color: 'var(--bad)' }}>{previewErr}</p>
            ) : preview ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview.image} alt="thumbnail preview" className="w-full rounded-lg border border-line" />
                <div className="mt-3 flex items-end gap-4">
                  <div>
                    <div className="text-[10.5px] uppercase tracking-wide text-faint mb-1 flex items-center gap-1"><Mobile size={11} /> Mobile size</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview.image} alt="mobile preview" className="w-[168px] rounded border border-line" />
                  </div>
                  <div className="text-[11.5px] space-y-1.5">
                    <div className="flex items-center gap-1.5" style={{ color: ck?.wordsOk ? 'var(--ok)' : 'var(--warn)' }}>
                      {ck?.wordsOk ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {words} word{words === 1 ? '' : 's'} (≤7 recommended)
                    </div>
                    <div className="flex items-center gap-1.5" style={{ color: ck?.photoOk ? 'var(--ok)' : 'var(--warn)' }}>
                      {ck?.photoOk ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {template === 'poster' ? 'panel layout' : 'photo set'}
                    </div>
                    <div className="flex items-center gap-1.5" style={{ color: ck?.sizeOk ? 'var(--ok)' : 'var(--bad)' }}>
                      {ck?.sizeOk ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {(preview.bytes / 1024).toFixed(0)} KB (limit 2 MB)
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-[12.5px] text-muted py-6 text-center">Pick a video and type a headline — the preview renders here.</p>
            )}
          </div>

          <div className="border border-line rounded-xl bg-surface p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted mb-2">5 · Attach to YouTube</div>
            <p className="text-[12px] text-muted leading-snug">
              {video ? <>Target: <span className="text-ink font-medium">{video.title.slice(0, 48)}{video.title.length > 48 ? '…' : ''}</span> ({fmtDay(video.publishedAt)})</> : 'Pick a video in step 1 first.'}
            </p>
            <button onClick={attach} disabled={!preview || !video || attaching}
              className="mt-3 w-full text-[13px] font-semibold px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-40"
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>
              {attaching ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />} Attach thumbnail
            </button>
            <p className="text-[10.5px] text-faint mt-2">Goes live on YouTube within minutes · max 10 attaches per channel per day.</p>
            {attachMsg ? (
              <p className="text-[12px] mt-2 flex items-start gap-1.5" style={{ color: attachMsg.ok ? 'var(--ok)' : 'var(--bad)' }}>
                {attachMsg.ok ? <CheckCircle2 size={13} className="shrink-0 mt-0.5" /> : <XCircle size={13} className="shrink-0 mt-0.5" />} {attachMsg.text}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
