'use client';
// Create Video — generative HyperFrames wizard (owner + staff).
// topic + style -> CI renders a bespoke-designed vertical short -> watch inline.
// Round 2: rebuilt on the kit (tokens, t-NN, btn) so it reads in BOTH themes,
// and the job list is honest: a failed read is "can't load", never "no videos".
import { Suspense, useCallback, useEffect, useState } from 'react';
import { Sparkles, Loader2, PlayCircle, RefreshCw, XCircle, Download, Film, AlertTriangle } from 'lucide-react';
import { Card, CardHead, Chip, PageHeader, EmptyState } from '@/components/ui';

const STATE_CHIP = {
  queued: { tone: 'warn', label: 'Rendering on CI…' },
  done: { tone: 'ok', label: 'Ready' },
  failed: { tone: 'bad', label: 'Failed' },
  unknown: { tone: 'plain', label: 'In progress…' },
};

// the poster frame sits next to the rendered mp4 — derive it from the URL the
// server gave us instead of hardcoding a repo path here
const posterOf = (videoUrl) => (videoUrl ? videoUrl.replace(/video\.mp4$/, 'frame-a.jpg') : null);

function CreatePageContent() {
  const [meta, setMeta] = useState(null);
  const [styleNote, setStyleNote] = useState('');
  const [jobs, setJobs] = useState([]);
  const [jobsErr, setJobsErr] = useState('');
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [form, setForm] = useState(() => ({ topic: '', dna: (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('template')) || 'luxury', genre: 'documentary', brand: '', subline: '', voice: 'en-US-AndrewNeural', beatCount: 5 }));
  // P0-16 handled in the form initializer above (reads ?template= once)
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [playing, setPlaying] = useState(null);

  const loadJobs = useCallback(() => {
    setLoadingJobs(true);
    fetch('/api/create-video')
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (r.status === 401 || r.status === 403) throw new Error('Creating videos is for the owner and staff only.');
        if (!r.ok) throw new Error(d.error || `the server answered ${r.status}`);
        setMeta(d);
        // ?template= may name a gallery template that isn't one of Create's
        // own styles — keep it only if valid, else fall back to the first
        // real style and SAY so (the API rejects unknown styles).
        const ids = (d?.styles || []).map((x) => x.id);
        setForm((f) => {
          if (!ids.length || ids.includes(f.dna)) return f;
          setStyleNote(`"${f.dna}" isn't a Create style yet — using ${ids[0]} instead. Pick another below.`);
          return { ...f, dna: ids[0] };
        });
        setJobs(d.jobs || []);
        // the route answers 200 with error set when GitHub couldn't be read
        setJobsErr(d.error ? `Couldn't read the render history (${d.error}).` : '');
      })
      .catch((e) => setJobsErr(e.message || 'network error'))
      .finally(() => setLoadingJobs(false));
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => { if (alive) loadJobs(); }); // deferred: loadJobs sets state
    return () => { alive = false; };
  }, [loadJobs]);
  useEffect(() => {
    const t = setInterval(loadJobs, 45000);
    return () => clearInterval(t);
  }, [loadJobs]);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setOkMsg(''); setBusy(true);
    try {
      const r = await fetch('/api/create-video', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) setErr(d.error || `The server answered ${r.status}.`);
      else {
        setOkMsg(`Job ${d.id} queued — the AI is writing the script and designing the video now. This page updates itself.`);
        loadJobs();
      }
    } catch (e2) { setErr(String(e2.message)); }
    finally { setBusy(false); }
  };

  const label = 'block t-11 font-semibold uppercase tracking-wider text-muted mb-1.5';
  const ghOff = meta && !meta.gh; // only known once the server answered
  const canSubmit = !busy && !ghOff && meta && form.topic.trim().length >= 6 && form.brand.trim().length >= 2;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        icon={Sparkles}
        title="Create video"
        sub="Give a topic. The AI writes the script, designs a bespoke look, and renders a vertical short with voice + music."
      />

      <Card className="p-5 mb-6">
        <form onSubmit={submit} className="space-y-5">
          <div>
            <label className={label} htmlFor="cv-topic">Video topic</label>
            <input id="cv-topic" className="input w-full" placeholder="e.g. Why quiet money beats loud money" value={form.topic}
              onChange={(e) => setForm({ ...form, topic: e.target.value })} />
            <p className="t-11 text-faint mt-1">At least 6 characters.</p>
          </div>

          <fieldset>
            <legend className={label}>Visual style (the AI designs within this look)</legend>
            {!meta ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-16 rounded-lg" />)}</div>
            ) : (
              <>
              {styleNote ? <p className="t-12 mb-2" style={{ color: 'var(--warn-ink)' }} role="status">{styleNote}</p> : null}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {(meta.styles || []).map((s) => {
                  const on = form.dna === s.id;
                  return (
                    <button type="button" data-kit="tile" key={s.id} onClick={() => setForm({ ...form, dna: s.id })} aria-pressed={on}
                      className="rounded-lg border p-3 text-left transition-colors min-w-0"
                      style={on
                        ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' }
                        : { borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
                      <div className="t-13 font-semibold text-ink truncate">{s.name}</div>
                      <div className="mt-0.5 t-11 leading-snug text-muted">{s.desc}</div>
                    </button>
                  );
                })}
              </div>
              </>
            )}
          </fieldset>

          {meta?.genres?.length ? (
            <fieldset className="flex flex-wrap items-center gap-2">
              <legend className="sr-only">Genre</legend>
              <span className="t-11 font-semibold uppercase tracking-wider text-muted mr-1">Genre</span>
              {meta.genres.map((g) => {
                const on = form.genre === g.id;
                return (
                  <button type="button" data-kit="chip" key={g.id} onClick={() => setForm({ ...form, genre: g.id })} aria-pressed={on}
                    className="rounded-full border px-3 py-1.5 t-12 font-medium transition-colors"
                    style={on
                      ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)', color: 'var(--ink)' }
                      : { borderColor: 'var(--line)', background: 'var(--surface-2)', color: 'var(--muted)' }}>
                    {g.name}
                  </button>
                );
              })}
            </fieldset>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={label} htmlFor="cv-brand">Brand name (end card)</label>
              <input id="cv-brand" className="input w-full" placeholder="e.g. Old Money Code" value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })} />
            </div>
            <div>
              <label className={label} htmlFor="cv-subline">Tagline (optional)</label>
              <input id="cv-subline" className="input w-full" placeholder="e.g. Quiet wealth · every day" value={form.subline}
                onChange={(e) => setForm({ ...form, subline: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="min-w-0">
                <label className={label} htmlFor="cv-voice">Voice</label>
                <select id="cv-voice" className="input w-full" value={form.voice} onChange={(e) => setForm({ ...form, voice: e.target.value })}>
                  {(meta?.voices || []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div className="min-w-0">
                <label className={label} htmlFor="cv-beats">Beats</label>
                <select id="cv-beats" className="input w-full" value={form.beatCount} onChange={(e) => setForm({ ...form, beatCount: Number(e.target.value) })}>
                  {[4, 5, 6, 7].map((n) => <option key={n} value={n}>{n} (~{n * 4}s)</option>)}
                </select>
              </div>
            </div>
          </div>

          {err ? <p className="t-13" role="alert" style={{ color: 'var(--bad-ink)' }}>{err}</p> : null}
          {okMsg ? <p className="t-13" role="status" style={{ color: 'var(--ok-ink)' }}>{okMsg}</p> : null}
          {ghOff ? (
            <p className="t-12 flex items-center gap-1.5" style={{ color: 'var(--warn-ink)' }}>
              <AlertTriangle size={13} /> Rendering is switched off — the server has no GitHub token, so nothing can be queued.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {busy ? 'Queueing…' : 'Generate video'}
            </button>
            {!canSubmit && !busy && !ghOff && meta ? <span className="t-11 text-faint">Add a topic and a brand name to start.</span> : null}
          </div>
        </form>
      </Card>

      <Card>
        <CardHead
          icon={Film}
          title="Rendered videos"
          sub="Newest first · refreshes itself every 45s"
          right={(
            <button type="button" onClick={loadJobs} className="btn btn-outline btn-sm" disabled={loadingJobs}>
              <RefreshCw size={13} className={loadingJobs ? 'animate-spin' : ''} /> Refresh
            </button>
          )}
        />
        <div className="px-5 pb-5">
          {jobsErr ? (
            <p className="t-12 mb-3" role="alert" style={{ color: 'var(--bad-ink)' }}>{jobsErr} This is not an empty list.</p>
          ) : null}
          {!meta && !jobsErr ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[0, 1].map((i) => <div key={i} className="skeleton h-64 rounded-xl" />)}</div>
          ) : jobs.length === 0 && !jobsErr ? (
            <EmptyState icon={Film} title="No videos yet" sub="Create your first one above — it shows up here while it renders." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {jobs.map((j) => {
                const chip = STATE_CHIP[j.state] || STATE_CHIP.unknown;
                return (
                  <div key={j.id} className="overflow-hidden rounded-xl border border-line bg-surface-2 min-w-0">
                    {playing === j.id && j.videoUrl ? (
                      <video src={j.videoUrl} controls autoPlay className="w-full aspect-[9/16] max-h-[480px] bg-black object-contain" />
                    ) : j.state === 'done' && j.videoUrl ? (
                      <button type="button" data-kit="tile" aria-label={`Play "${j.topic || j.id}"`} onClick={() => setPlaying(j.id)} className="relative block w-full bg-black">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={posterOf(j.videoUrl)} alt="" className="w-full aspect-[9/16] max-h-[480px] object-cover opacity-90" />
                        <span className="absolute inset-0 flex items-center justify-center">
                          <PlayCircle className="w-14 h-14 text-white drop-shadow-lg" />
                        </span>
                      </button>
                    ) : (
                      <div className="flex w-full items-center justify-center aspect-[9/16] max-h-[480px]" style={{ background: 'var(--surface-3)' }}>
                        <div className="flex items-center gap-2 t-13 text-muted">
                          {j.state === 'failed' ? <XCircle size={20} style={{ color: 'var(--bad-ink)' }} /> : <Loader2 size={20} className="animate-spin" />}
                          {chip.label}
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 t-13 text-ink min-w-0">
                          <Chip tone={chip.tone} dot>{chip.label}</Chip>
                          <span className="truncate">{j.topic || j.id}</span>
                        </div>
                        <div className="mt-0.5 t-11 text-faint truncate">{[j.brand, j.dna, j.durationSec ? `${j.durationSec}s` : null].filter(Boolean).join(' · ')}</div>
                      </div>
                      {j.state === 'done' && j.videoUrl ? (
                        <a href={j.videoUrl} download className="icon-btn shrink-0" title="Download MP4" aria-label="Download MP4">
                          <Download size={16} />
                        </a>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// kept inside Suspense (P0-16): the page reads ?template= on first render
export default function CreatePage() {
  return (
    <Suspense fallback={null}>
      <CreatePageContent />
    </Suspense>
  );
}
