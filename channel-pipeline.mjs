// Quarry Channel Pipeline — one command = everything for one channel.
// Produces Shorts → YouTube, cross-posts FB Reels, IG Reels, niche posters.
// Adding a new platform later = add one step here. No workflow changes needed.
//
// Usage: node channel-pipeline.mjs <slug> [--no-episode] [--force] [--resume [job_id]]
// Each step is independent: if one fails, the rest continue.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const slug = process.argv[2];
const FORCE = process.argv.includes('--force');
const SKIP_EPISODE = process.argv.includes('--no-episode');
// --topup=N: heal/backfill mode (sweeper semantics) — produce the first N slots
// even if today already ran; yt-daily marks the NEXT day done so the morning
// cron can't double-produce the healed reels.
const topupArg = process.argv.find(a => a.startsWith('--topup'));
const TOPUP_N = topupArg ? Math.max(0, Number(topupArg.split('=')[1]) || 0) : 0;
// 10-05 CHANNEL FACTORY: registry channels (Studio wizard) resolve from
// yt-mcp/studio-channels.json when lib/brands.json has no entry.
// #100: resolve through brand-resolve for EVERY channel — the cadence overlay
// (yt-mcp/cadence.json: docDays/shortDays/shortsSource) merges there; reading
// lib/brands.json directly would bypass scheduling for legacy channels.
const { resolveBrand } = await import('./lib/brand-resolve.mjs');
let b = await resolveBrand(slug);
if (!b) { console.error(`[pipeline] unknown slug: ${slug}`); process.exit(1); }

const today = new Date().toISOString().slice(0, 10);
// 09-20: per-channel state files are the source of truth (lib/state.mjs)
import { loadAllStates } from './lib/state.mjs';
// #106 T5b: the review-seam flag parser (PURE module — zero imports of its
// own, so the flag-off contract's "no store imports" is untouched).
import { flagOn } from './lib/review-seams.mjs';
import { docShippedThisRun } from './lib/doc-days.mjs';
// 10-09 BYOK: this channel's own provider keys (encrypted yt-mcp/channel-keys.json)
// replace the shared keys for the rest of the run — children inherit process.env.
import { applyChannelKeys, checkChannelKeys, dropChannelKeys } from './lib/channel-keys.mjs';
// #99 shared YouTube quota budget + #91-style alerts that always report outcome
import { evaluate } from './lib/quota-ledger.mjs';
import { sendAlert } from './lib/ntfy-alert.mjs';
const loadState = () => loadAllStates();

const log = (msg) => console.log(`[${slug}] ${msg}`);
// nothingDue (audit #7): the clips lane ran and no Short was due today (off
// day / queue consumed between docs) — distinct from shorts:false (failed).
const results = { shorts: false, nothingDue: false, episode: false, fbReels: false, igReels: false, poster: false };
const errors = [];

// ---- #106 T2 — JOB RECORDING / PARK-CHECK / RESUME (Phase 4 S1+S3) --------
// FLAG CONTRACT: JOB_STORE_ENABLED unset = byte-identical legacy behavior —
// no store imports, no DB, no Blob, no new log lines (pinned by
// tests/pipeline-jobstore.test.mjs). When enabled, the run records a job
// (lib/job-store.mjs), indexes the resume/approval-critical bytes it can
// reach (lib/artifact-store.mjs), parks on open blocking warnings (D11), and
// supports --resume (D4). Every store call is fail-open: a dead Neon
// degrades to log-only with ONE warn (AC-P4-5) and never changes the
// pipeline's exit semantics (AC-P4-3).
const JOB_STORE_ENABLED = flagOn(process.env.JOB_STORE_ENABLED);
const RESUME_ARG = process.argv.includes('--resume');
const _resumeVal = RESUME_ARG ? process.argv[process.argv.indexOf('--resume') + 1] : undefined;
const RESUME_JOB_ID = RESUME_ARG && _resumeVal && !String(_resumeVal).startsWith('--') ? _resumeVal : null;
const TRIGGER_VOCAB = ['cron', 'dispatch', 'resume', 'studio'];

let jobCtl = null; // job recorder (null = flag off, or the store is unavailable)
let warnStore = null; // warnings store for the park-check + emitters (null = off/unavailable)
let emitWarningFn = null;

function sha256Text(s) {
  return createHash('sha256').update(String(s)).digest('hex');
}

function jobKind(shortsStep) {
  // kind mapped from the run shape (D1): an episode-free generated run is a
  // shorts job, an episode-free clips run is a clips job, everything else is
  // the pipeline wrapper.
  if (SKIP_EPISODE) return shortsStep === 'clips' ? 'clips' : 'shorts';
  return 'pipeline';
}

function jobTrigger() {
  if (RESUME_ARG) return 'resume';
  const envTrg = process.env.PIPELINE_TRIGGER;
  if (envTrg && TRIGGER_VOCAB.includes(envTrg)) return envTrg;
  if (process.env.GITHUB_EVENT_NAME === 'schedule') return 'cron';
  return 'dispatch';
}

// Planned steps in D2's order; PLATFORMS_PAUSED lanes use the skipped-*
// vocabulary so the step list is stable whether or not platforms are paused.
function plannedSteps(shortsStep) {
  const steps = [{ name: 'preflight' }, { name: shortsStep }, { name: 'brain-embed' }, { name: 'verify' }];
  steps.push(PLATFORMS_PAUSED ? { name: 'skipped-fb', status: 'skipped' } : { name: 'fb' });
  steps.push(PLATFORMS_PAUSED ? { name: 'skipped-poster', status: 'skipped' } : { name: 'poster' });
  steps.push({ name: 'episode' }, { name: 'staging' });
  return steps;
}

function makePipelineJobController({ slug, jobs, artifacts, brandKit }) {
  const state = { id: null, planned: [], shortsStep: null, skip: new Set(), closed: new Set(), parent: null };
  let warned = false;
  const safe = async (fn) => {
    try {
      return await fn();
    } catch (e) {
      if (!warned) {
        warned = true;
        log(`[job] WARN step recording degraded (non-fatal): ${String((e && e.message) || e).slice(0, 120)}`);
      }
      return null;
    }
  };
  // D4 resume key: template id+version + brand-kit hash, carried in jobs.meta.
  const resumeKey = (template) => ({ template: template || null, kit: sha256Text(JSON.stringify(brandKit)) });

  return {
    get id() { return state.id; },

    // #106 T5b: on --resume, the HELD job's id — the /review approval keys
    // the resume dispatch by it, and the child lane resolves the approved
    // script by the same id (PIPELINE_RESUME_JOB_ID threading below).
    get parentJobId() { return state.parent?.job?.id ?? null; },

    // --resume lookup: getJob(<id>) or latestResumableJob(slug, 30 min window —
    // REQUIRED: a live-running job must never become a resume target).
    async loadParent() {
      if (!RESUME_ARG) return null;
      return safe(async () => {
        let got;
        if (RESUME_JOB_ID) {
          got = await jobs.getJob(RESUME_JOB_ID);
          if (!got.ok || !got.job) { log(`resume: job ${RESUME_JOB_ID} not found — running fresh`); return null; }
        } else {
          got = await jobs.latestResumableJob(slug, { staleAfterMs: 30 * 60_000 });
          if (!got.ok || !got.job) { log('resume: no stale job found (30 min window) — running fresh'); return null; }
        }
        state.parent = got;
        return got;
      });
    },

    // Called after preflight + park-check: opens the job, registers the
    // planned steps, decides the resume skips (D4: parent step succeeded AND
    // artifact bytes retrievable AND a fresh resume key), closes preflight
    // (it already passed — the job only exists after it did).
    async begin({ shortsStep, template }) {
      await safe(async () => {
        state.shortsStep = shortsStep;
        const kind = jobKind(shortsStep);
        const trigger = jobTrigger();
        const started = await jobs.startJob({
          channel: slug,
          kind,
          trigger,
          meta: { resume_key: resumeKey(template), template_id: template?.id ?? null, template_version: template?.version ?? null },
          resumedFromJobId: RESUME_ARG && state.parent?.job ? state.parent.job.id : undefined,
        });
        if (!started.ok) { log(`[job] WARN job row not written (${started.error}) — continuing log-only`); return; }
        state.id = started.id;
        log(`[job] recording ${kind} job ${state.id} (trigger ${trigger})`);
        state.planned = plannedSteps(shortsStep);
        for (let i = 0; i < state.planned.length; i++) {
          const p = state.planned[i];
          p.idx = i;
          await jobs.recordStep(state.id, i, p.name, p.status ? { status: p.status } : {});
        }
        await jobs.startStep(state.id, 0);
        await jobs.finishStep(state.id, 0, { status: 'succeeded' });
        state.closed.add('preflight');
        for (const p of state.planned) if (p.status) state.closed.add(p.name); // skipped-* lanes

        const parent = state.parent;
        if (parent && parent.job) {
          const fresh = JSON.stringify(parent.job.meta?.resume_key ?? null) === JSON.stringify(resumeKey(template));
          if (!fresh) log('resume: stale key (template/brand-kit changed) — prior artifacts ignored, steps re-run');
          for (const p of state.planned) {
            if (p.status || !fresh) continue; // config-disabled lanes never resume-skip; stale re-runs all
            const prow = (parent.steps || []).find((s) => s.name === p.name);
            if (!prow || prow.status !== 'succeeded') continue;
            const arts = (parent.artifacts || []).filter((a) => a.step === p.name);
            if (!arts.length) continue; // no artifact row -> re-run (D4)
            let verified = true;
            for (const a of arts) {
              const got = await artifacts.getBytes(a.blob_url || a.content_hash, { expectedHash: a.content_hash });
              if (!got || !got.ok) { verified = false; break; }
            }
            if (verified) {
              state.skip.add(p.name);
              await jobs.finishStep(state.id, p.idx, { status: 'skipped', error: 'resume: artifact verified' });
              state.closed.add(p.name);
            } else {
              log(`resume: re-run ${p.name} (bytes not retrievable)`);
            }
          }
        }
      });
    },

    isSkipped: (name) => state.skip.has(name),

    async startStep(name) {
      const p = state.planned.find((x) => x.name === name);
      if (!p || state.id === null) return;
      await safe(() => jobs.startStep(state.id, p.idx));
    },

    async finishStep(name, status, error) {
      const p = state.planned.find((x) => x.name === name);
      if (!p || state.id === null) return;
      state.closed.add(name);
      await safe(() => jobs.finishStep(state.id, p.idx, { status, error: error ?? null }));
    },

    // D3: index the pipeline-reachable script payload — the run's state
    // entries (videoId + script text, the same record the brain embeds). The
    // child lane's FULL render-input persistence lands with the child task.
    async indexScriptPayload(entries) {
      if (state.id === null || !entries?.length) return;
      await safe(async () => {
        const payload = JSON.stringify({ slug, kind: 'shorts', date: today, entries }, null, 2);
        const put = await artifacts.putBytes('script_payload', payload, { contentType: 'application/json' });
        if (put?.ok) {
          await jobs.indexArtifact(state.id, {
            step: state.shortsStep,
            kind: 'script_payload',
            contentHash: put.hash,
            blobUrl: put.blob_url ?? null,
            size: Buffer.byteLength(payload),
            meta: { entries: entries.length },
          });
          log(`[job] indexed script_payload (${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}${put.degraded ? ', blob degraded — index-only' : ''})`);
        }
      });
    },

    // D3: index the doc lane's TTS narration bytes (demos/deepdive-<slug>/narr-*).
    async indexEpisodeTts() {
      if (state.id === null) return;
      await safe(async () => {
        const dir = path.join('demos', `deepdive-${slug}`);
        let files = [];
        try { files = fs.readdirSync(dir).filter((f) => /^narr-.+\.(mp3|wav)$/i.test(f)).sort(); } catch { return; }
        for (const f of files) {
          const bytes = fs.readFileSync(path.join(dir, f));
          const put = await artifacts.putBytes('tts_audio', bytes);
          if (put?.ok) {
            await jobs.indexArtifact(state.id, {
              step: 'episode',
              kind: 'tts_audio',
              contentHash: put.hash,
              blobUrl: put.blob_url ?? null,
              size: bytes.length,
              meta: { file: f },
            });
          }
        }
        if (files.length) log(`[job] indexed tts_audio x${files.length}`);
      });
    },

    // Pending-step sweep + terminal (AC-P4-3): succeeded = the video shipped
    // clean; partial = shipped but a lane failed; failed = no upload.
    // Shorts-primary by design: 'failed' (rather than 'held'/'skipped') is
    // what lets a bare --resume heal a run whose shorts never shipped — and a
    // skipped post step is never a resume-skip target (it has no succeeded
    // parent row), so a quota-skipped day can never double-produce.
    async end() {
      if (state.id === null) return;
      await safe(async () => {
        for (const p of state.planned) {
          if (!state.closed.has(p.name)) await jobs.finishStep(state.id, p.idx, { status: 'skipped', error: 'not reached' });
        }
        // audit #7: nothing due (off day) with no lane errors is a clean day.
        const terminal = results.shorts
          ? (errors.length ? 'partial' : 'succeeded')
          : (results.nothingDue && !errors.length ? 'succeeded' : 'failed');
        await jobs.finishJob(state.id, { status: terminal, error: errors.length ? errors.join('; ').slice(0, 400) : null });
        log(`[job] job closed: ${terminal}${errors.length ? ` (${errors.length} lane error(s))` : ''}`);
      });
    },
  };
}

if (JOB_STORE_ENABLED) {
  try {
    const wsm = await import('./lib/warnings-store.mjs');
    emitWarningFn = wsm.emitWarning;
    warnStore = await wsm.getDefaultWarningsStore(); // null -> log-only (AC-P4-5)
  } catch { warnStore = null; }
  try {
    const { getJobStore } = await import('./lib/job-store.mjs');
    const { makeArtifactStore } = await import('./lib/artifact-store.mjs');
    const jobs = await getJobStore(); // throws without DATABASE_URL — the AC-P4-5 catch below
    const artifacts = makeArtifactStore();
    jobCtl = makePipelineJobController({ slug, jobs, artifacts, brandKit: b });
    await jobCtl.loadParent();
  } catch (e) {
    jobCtl = null;
    log(`[job] WARN job store unavailable — running log-only (AC-P4-5): ${String((e && e.message) || e).slice(0, 120)}`);
  }
}

// Child-lane runner. Returns { ok, status, signal, ms, timedOut }. Audit #7:
// a non-zero exit, a kill signal or a timeout is LOGGED with how long the
// child ran — a 45-min timeout used to look exactly like a fast crash.
function runChild(script, args = [], opts = {}) {
  log(`▶ ${script} ${args.join(' ')}`);
  const t0 = Date.now();
  try {
    // opts.timeoutMs: per-lane bound. The default 900s predates the
    // 10-chapter doc class — a long documentary (10 chapters x >=170 words:
    // ~10 clip downloads + TTS + render) needs ~30 min, and the 15-min kill
    // landed mid-download exactly at 900000 ms (2026-11-04 resume run).
    const r = spawnSync('node', [script, ...args], { stdio: 'inherit', timeout: opts.timeoutMs ?? 900000 });
    const ms = Date.now() - t0;
    const timedOut = r.error?.code === 'ETIMEDOUT';
    if (r.status !== 0) {
      log(`  ${script} exited status=${r.status ?? 'none'} signal=${r.signal || 'none'} after ${(ms / 1000).toFixed(1)}s${timedOut ? ` (TIMEOUT at ${Math.round((opts.timeoutMs ?? 900000) / 1000)}s)` : ''}${r.error && !timedOut ? ` error=${String(r.error.message).slice(0, 80)}` : ''}`);
    }
    return { ok: r.status === 0, status: r.status, signal: r.signal || null, ms, timedOut };
  } catch (e) {
    errors.push(`${script}: ${e.message}`);
    return { ok: false, status: null, signal: null, ms: Date.now() - t0, timedOut: false };
  }
}

function run(script, args = [], opts = {}) {
  return runChild(script, args, opts).ok;
}

// shorts-clips post-next exit contract (audit #7): 0 posted (or already
// posted today / recovered), 3 nothing due today, 4 due but no clip could be
// posted (queue empty+stale / exhausted / quota) — anything else = failure.
const CLIPS_NOTHING_DUE = 3;
const CLIPS_NO_CLIP = 4;

// ---- Load state ----
const state = loadState();
const _keysApplied = applyChannelKeys(slug);
if (_keysApplied) {
  // BYOK health check: a dead channel key must NOT silently degrade production —
  // drop it from env (shared key takes over) and alert the owner/client.
  const _check = await checkChannelKeys(slug);
  if (_check.dead.length) {
    dropChannelKeys(_check.dead.map((d) => d.provider));
    for (const d of _check.dead) log(`[keys] WARN ${d.provider} key DEAD (${d.detail}) - dropped, shared key covering`);
    if (process.env.NTFY_TOPIC) {
      fetch(`https://ntfy.sh/${process.env.NTFY_TOPIC}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', Title: `[${slug}] dead API key - shared key covering` },
        body: `Channel keys failed validation: ${_check.dead.map((d) => `${d.provider} (${d.detail})`).join('; ')}. Replace them in Studio > API Keys.`,
      }).catch(() => { });
    }
  }
  const _alive = _check.ok.filter((x) => _keysApplied.includes(x));
  log(_alive.length ? `[keys] channel overrides active: ${_alive.join(', ')}` : '[keys] channel keys all failed validation - using shared keys');
} else {
  log('[keys] using shared keys');
}
const shortsDone = state[slug]?.lastRunDate === today;
// A --resume run re-renders the APPROVED held episode regardless of the
// once-per-day guard: the owner explicitly approved that script at the review
// desk, so the day-guard must not silently starve the render slot (found live
// 2026-11-04: the storybook resume fell through with Episode ✗, Errors: 0 —
// the previous day's b-roll doc had already set deepdiveDate).
const episodeDone = state[slug]?.deepdiveDate === today && !RESUME_JOB_ID;

// 2026-10-23 OWNER DIRECTIVE: YouTube-only focus — all non-YouTube platform
// publishing (FB/IG/TikTok) is paused until YouTube work is fully finished.
// Default is PAUSED; to resume later set PLATFORMS_PAUSED=0 in the workflow
// env (or locally) — no other change needed.
const PLATFORMS_PAUSED = process.env.PLATFORMS_PAUSED !== '0';

// ---- Phase 0: shared YouTube quota budget (#99/#104/D24) — fail closed BEFORE
// any render/LLM spend when one more upload would breach the daily budget.
// D24/AC-P4-32: the gate consumes the youtube_quota_models row (#104) when the
// DB is reachable — the Dec-2025 reality is ~100 units/upload from the uploads'
// own bucket, so legacy math (10k pool @ ~1,700/upload) falsely parks after
// ~5 uploads/day network-wide and cannot bound 30-channel scale. The legacy
// constants remain the NO-DB fallback only.
async function quotaGate(label) {
  let model = null;
  try {
    const { db, dbReady } = await import('./studio/lib/db.mjs');
    if (dbReady && db) {
      const { adaptPostgres } = await import('./studio/lib/provider-routing.js');
      const { loadQuotaModel } = await import('./lib/quota-ledger.mjs');
      // Same workspace key as the Studio schedule route (the pool is
      // workspace-wide — ONE shared OAuth project); loadQuotaModel falls back
      // to the #104 DEFAULT model when no row exists and never throws.
      model = await loadQuotaModel(process.env.YT_GCP_PROJECT_ID || 'workspace-default', adaptPostgres(db));
    }
  } catch { model = null; } // an unreadable model store = the no-DB path, never a crash
  const q = model ? evaluate(loadState(), { model }) : evaluate(loadState());
  if (q.allowed) return true;
  log(`[quota] ${label} skipped — shared pool ${q.usedUnits}/${q.dailyLimit} units today (${q.uploadsToday} uploads) — resets midnight PT`);
  await sendAlert({ text: `${slug}: ${label} skipped — YouTube API daily budget reached (${q.usedUnits}/${q.dailyLimit} units, ${q.uploadsToday} uploads today). Resets midnight PT.`, title: `[${slug}] daily upload budget reached` });
  // #106 T2 (D24): the durable row behind the push. H9 constraint: the LEDGER
  // gate is NOT a publishing-path emitter — severity 'warning', never
  // blocking (this is our own budget math, not a YouTube 403). The existing
  // sendAlert above stays THE push; the row write stays silent (noop send) so
  // a budget skip never double-pages — re-fires dedupe in the store anyway.
  if (warnStore && emitWarningFn) {
    try {
      await emitWarningFn(warnStore, {
        channel_id: slug,
        severity: 'warning',
        code: 'quota_exceeded',
        title: `daily upload budget reached — ${label} skipped`,
        explanation: 'The shared YouTube API budget for today is exhausted, so this upload was skipped before any spend. This is our ledger, not a YouTube-side block; production resumes at the midnight PT reset.',
        evidence: `quota ledger: ${q.usedUnits}/${q.dailyLimit} units used, ${q.remainingUnits} remaining, ${q.uploadsToday} uploads today`,
        recommended_action: 'No action needed — the ledger resets midnight PT. Investigate only if uploads sit at the cap day after day.',
        auto_verifiable: true,
        job_id: jobCtl?.id ?? null,
      }, { sendAlert: async () => ({ channel: 'none', ok: true }) });
    } catch { }
  }
  return false;
}

// ---- Phase 0.5: #102 TEMPLATE PREFLIGHT — enforce only for assigned channels ----
// Channels WITH an active registry assignment (Phase 1: the pilot only) get
// their pinned template resolved against catalog registry data + compatibility
// validated BEFORE any generation spend; a blocked verdict ntfy-alerts and
// exits non-zero. Everyone else takes the legacy path — zero new code (D5).
// ROLLBACK: flip this constant to false (or delete this block) — the pipeline
// is then byte-for-byte today's behavior; the preflight module isn't imported.
const TEMPLATE_PREFLIGHT_ENABLED = true;
let PREFLIGHT_TEMPLATE = null; // #106 T2: resolved template feeds the resume key (jobs.meta)
if (TEMPLATE_PREFLIGHT_ENABLED) {
  const { runPreflight, capabilityMapFromAppliedProviders } = await import('./lib/template-preflight.mjs');
  const { TEMPLATES_DATA } = await import('./studio/lib/templates-catalog.js');
  const { REGISTRY_META } = await import('./studio/lib/template-registry.data.js');
  const { getRegistryDb } = await import('./studio/lib/template-registry-db.js');
  // Same raw channel registry entry the Studio assign route validated against
  // at save time (yt-mcp/studio-channels.json is the CI feed of the Neon
  // registry). Absent/unreadable -> null -> empty config -> assigned channels
  // fail closed on niche_mismatch; legacy channels are unaffected (no lookup).
  let channelEntry = null;
  try {
    const reg = JSON.parse(fs.readFileSync(path.join('yt-mcp', 'studio-channels.json'), 'utf8'));
    channelEntry = (reg.channels || []).find((c) => c.slug === slug) || null;
  } catch { channelEntry = null; }
  let pre;
  try {
    pre = await runPreflight({
      channelId: slug,
      registryDb: await getRegistryDb(),
      catalog: TEMPLATES_DATA,
      meta: REGISTRY_META,
      channelEntry,
      capabilityMap: capabilityMapFromAppliedProviders(_keysApplied),
    });
  } catch (e) {
    // FIX ROUND 1 (spec D5 governs): anything that is NOT a known blocked
    // assignment falls back to today's exact path — an unreachable or
    // unconfigured registry DB must never halt production (the Oct 21-23 P0
    // class: all channels dark, workflows green). This catch covers the
    // db-layer construction (getRegistryDb throws without DATABASE_URL);
    // getActiveAssignment failures are converted inside runPreflight.
    pre = {
      mode: 'legacy',
      verdict: null,
      warning: 'registry db unavailable — legacy path, no template enforcement',
      warning_detail: String(e && e.message ? e.message : e).slice(0, 160),
    };
  }
  if (pre.warning) {
    // ONE visibility warning, labeled WARNING (not a block) — then proceed
    // exactly as today.
    log(`[template] WARN ${pre.warning}${pre.warning_detail ? ` (${pre.warning_detail})` : ''}`);
    await sendAlert({
      text: `${slug}: WARNING — ${pre.warning}${pre.warning_detail ? ` (${pre.warning_detail})` : ''}. No template enforcement ran; production proceeded on the legacy path.`,
      title: `[${slug}] template preflight warning - legacy path`,
    });
  }
  if (pre.mode === 'enforce') {
    if (!pre.verdict.ok) {
      const codes = pre.verdict.reasons.map((r) => r.code).join(', ');
      log(`✗ template preflight BLOCKED — generation stopped before any spend (${codes})`);
      await sendAlert({
        text: `${slug}: generation BLOCKED by template preflight — ${codes}. Fix the mismatch in Studio > Templates, or unassign the channel there.`,
        title: `[${slug}] template preflight blocked generation`,
      });
      process.exit(1);
    }
    const v = pre.verdict;
    // Phase-1 run record = these log lines + the job console output (the
    // pipeline keeps no structured run record of its own — AC-7/AC-13
    // "present and logged in Phase 1"; the JSON line is machine-readable).
    log(`[template] enforce: ${v.template_id} @ v${v.resolved_version}${v.pinned_version && v.pinned_version !== v.resolved_version ? ` (auto-adopted from pinned v${v.pinned_version})` : ''}${v.major_update_available ? ' — MAJOR update available (re-pin in Studio to adopt)' : ''}`);
    log(`[template] ${JSON.stringify({ template_id: v.template_id, resolved_version: v.resolved_version, variation_rules: v.metaSummary.variation_rules, safety: v.metaSummary.safety })}`);
    PREFLIGHT_TEMPLATE = { id: v.template_id, version: v.resolved_version };
  }
  // legacy mode (with or without warning): nothing else changed (spec D5)
}

// ---- Phase 1: YouTube Shorts ----
// #98 SHORTS SOURCE: kit field shortsSource 'generated' (default, yt-daily
// research->script->render) or 'clips' (publisher posts one queued doc clip).
// Flipping a channel = one kit field; rolling back = flip it back.
const shortsSource = b.shortsSource || 'generated';
const SHORTS_STEP = shortsSource === 'clips' ? 'clips' : 'post'; // #106 T2 step vocabulary

// ---- Phase 0.7: #106 T2 PARK-CHECK (D11 / AC-P4-13) — after preflight,
// BEFORE any spend. WHILE a Blocking warning is open for this channel the run
// skips production — but only after the cheap auto-verifiable probes ran (a
// probe pass resolves the warning and the run proceeds same-day). The park
// predicate is openBlockingFor (blocks_publishing rows) — NEVER severity
// matching. Other channels are unaffected (the matrix isolates lanes).
// Once-per-park-EPISODE alerting is the store's job: re-finding the open row
// through emitWarning bumps last_checked silently; only a genuinely new row
// takes the episode's single push.
if (warnStore) {
  try {
    const { probeParkedChannels } = await import('./lib/warnings-probe.mjs');
    const open = await warnStore.openBlockingFor(slug);
    if (open.ok && open.rows.length) {
      log(`[park] ${open.rows.length} open blocking warning(s) [${open.rows.map((r) => r.code).join(', ')}] — probing auto-verifiable codes before skipping (D11)`);
      const probe = await probeParkedChannels({ store: warnStore, channelId: slug, log });
      const still = await warnStore.openBlockingFor(slug);
      if (still.ok && still.rows.length) {
        log(`[park] still parked after probe (checked ${probe?.checked ?? 0}) — production skipped for ${slug} only (exit 0)`);
        for (const row of still.rows) {
          try {
            await emitWarningFn(warnStore, {
              channel_id: row.channel_id || slug,
              severity: 'blocking',
              code: row.code,
              title: row.title || `channel parked (${row.code})`,
              explanation: row.explanation || 'Open blocking warning — production is parked (D11).',
              evidence: row.evidence || undefined,
              policy_quote: row.policy_quote,
              policy_url: row.policy_url,
              auto_verifiable: row.auto_verifiable === true,
              blocks_publishing: true,
            });
          } catch { }
        }
        process.exit(0);
      }
      log('[park] probe cleared the blocking warning — proceeding with production');
    }
  } catch (e) {
    log(`[park] WARN park-check skipped (non-fatal): ${String((e && e.message) || e).slice(0, 120)}`);
  }
}

// ---- #106 T2: the job opens here — after preflight + park-check, before any
// production spend. Preflight-blocked and parked runs leave no job row.
if (jobCtl) await jobCtl.begin({ shortsStep: SHORTS_STEP, template: PREFLIGHT_TEMPLATE });

// ---- #106 T5b: thread the started job (+ the resolved template version) to
// the child lanes — T3's intent rows and T5b's script rows link to THIS job
// through process.env.PIPELINE_JOB_ID (spawnSync inherits the parent env).
// Flag-off (no job row) sets nothing: the children stay byte-identical.
if (jobCtl?.id) {
  process.env.PIPELINE_JOB_ID = jobCtl.id;
  if (PREFLIGHT_TEMPLATE?.version) process.env.PIPELINE_TEMPLATE_VERSION = String(PREFLIGHT_TEMPLATE.version);
}
// #106 T5b SEAM 1 (resume): the approval dispatches resume=<held job id> —
// the CHILD must receive it so it renders from the STORED script input
// instead of generating (never threaded = the child would run fresh and
// bypass the approval). Bare --resume takes the resolved parent job id.
if (RESUME_ARG) process.env.PIPELINE_RESUME_JOB_ID = RESUME_JOB_ID || jobCtl?.parentJobId || '';

// ---- #106 T5 REVIEW-QUEUE GATE (D14-D18 / AC-P4-18/19) — flag REVIEW_QUEUE_ENABLED
// unset = byte-identical behavior (zero imports, zero calls; pinned by
// tests/review-gate.test.mjs). Membership-driven ONLY (D15): the assigned
// template's review_required list decides — generator risk flags never gate.
// Unreadable assignment state holds FAIL-CLOSED via the LAST-KNOWN-ASSIGNMENT
// cache in this channel's state file (C2); drift writes M3's
// review_gating_inactive row. A hold = the S4-era lane terminal (slot skipped
// today, exit 0 — same shape as the park-check exit), recorded in T2's job
// vocabulary as a 'review' step + the 'held' job terminal, and approval later
// resumes at render via the /review dispatch (channel + resume=job_id).
const REVIEW_QUEUE_ENABLED = flagOn(process.env.REVIEW_QUEUE_ENABLED);
async function runClipsPhase1() {
  if (jobCtl?.isSkipped(SHORTS_STEP)) {
    log(`resume: skip ${SHORTS_STEP} (artifact verified)`);
    results.shorts = true;
    return;
  }
  log(`Phase 1 — Clips lane (shortsSource=clips) for ${b.label}...`);
  if (await quotaGate('Shorts (clips)')) {
    await jobCtl?.startStep(SHORTS_STEP);
    const clip = runChild('longvideo/shorts-clips.mjs', ['post-next', slug]);
    if (clip.ok) {
      results.shorts = true;
      log(`✓ Clip Short processed`);
      await jobCtl?.finishStep(SHORTS_STEP, 'succeeded');
    } else if (clip.status === CLIPS_NOTHING_DUE) {
      results.nothingDue = true;
      log(`– no Short due today (off day or queue consumed until the next doc) — nothing posted, by design`);
      await jobCtl?.finishStep(SHORTS_STEP, 'skipped', 'nothing due today');
    } else if (clip.status === CLIPS_NO_CLIP) {
      const why = 'Shorts skipped — no clip available (queue empty/exhausted or quota; see clips log)';
      errors.push(why);
      log(`✗ ${why}`);
      await jobCtl?.finishStep(SHORTS_STEP, 'skipped', why);
    } else {
      errors.push('Clip Short posting failed');
      log(`✗ Clip posting failed`);
      await jobCtl?.finishStep(SHORTS_STEP, 'failed', 'Clip Short posting failed');
    }
  } else {
    errors.push('Shorts skipped — daily quota budget');
    await jobCtl?.finishStep(SHORTS_STEP, 'skipped', 'daily quota budget');
  }
}

if (REVIEW_QUEUE_ENABLED) {
  let gate = null;
  let REGISTRY_META = null;
  try {
    const { evaluateReviewGate } = await import('./lib/review-gate.mjs');
    const stateMod = await import('./lib/state.mjs');
    const registryMod = await import('./studio/lib/template-registry.data.js');
    REGISTRY_META = registryMod.REGISTRY_META;
    const { loadChannelState, saveChannelState } = stateMod;
    const { getRegistryDb } = await import('./studio/lib/template-registry-db.js');
    const { getScriptStore } = await import('./lib/script-store.mjs');
    const entry = loadChannelState(slug) || {};
    gate = await evaluateReviewGate({
      slug,
      slotDate: today,
      scriptStore: await getScriptStore(), // null -> gate says { ok:false }, run continues (AC-P4-5)
      registryDb: () => getRegistryDb(), // thunk: construction failure = the C2 unreadable path, never a crash
      templateMeta: (familyId) => REGISTRY_META[familyId] ?? null,
      cache: entry.reviewGate ?? null,
      saveCache: (next) => saveChannelState(slug, { ...(loadChannelState(slug) || {}), reviewGate: next }),
      warningsStore: warnStore,
      emit: emitWarningFn,
      jobId: jobCtl?.id ?? null,
      // round-1 MAJOR 5 + T5b round 1 minor 4: the held job's id keys the
      // approval on a resumed run — and on a BARE --resume the parent job id
      // (the gate and the child must agree, or the resumed run holds while
      // the child renders, and the shipped video never brain-embeds).
      resumeJobId: RESUME_JOB_ID || jobCtl?.parentJobId || null,
      log,
    });
  } catch (e) {
    log(`[review] WARN review gate unavailable — continuing (a gate crash never darkens production): ${String((e && e.message) || e).slice(0, 120)}`);
  }
  if (gate && gate.ok && gate.action === 'run') {
    // T5b round 1: the gate found an APPROVED script (slot lookup on a plain
    // scheduled run, or the resumed run's job lookup) — the CHILD must render
    // THAT stored script, never generate fresh (the fresh generation would
    // ship an unreviewed text while the approved one rots). Resume semantics
    // on every approved run; --resume keeps its own threading above.
    if (gate.script?.job_id && !process.env.PIPELINE_RESUME_JOB_ID) {
      process.env.PIPELINE_RESUME_JOB_ID = String(gate.script.job_id);
      log(`[review] approved script on the slot — the child renders the STORED input (job ${String(gate.script.job_id).slice(0, 12)}…), no fresh generation`);
    }
    // #106 T5b SEAM 2 (D18/OQ-4): WHERE the assigned template's DATA enables
    // picking (review_thumb_pick — the same config surface the gate reads),
    // the child renders emit N thumbnail candidates. Unset = 1 = today's
    // single candidate (byte-identical, AC-P4-23).
    try {
      const { thumbCandidateCount } = await import('./lib/review-seams.mjs');
      const tmeta = gate.gating?.familyId ? REGISTRY_META?.[gate.gating.familyId] : null;
      const n = thumbCandidateCount(tmeta);
      if (n > 1) {
        process.env.REVIEW_THUMB_CANDIDATES = String(n);
        log(`[review] thumbnail picking enabled — ${n} candidates per render (template ${gate.gating.familyId}; candidate 1 ships, swap at Studio > Review)`);
      }
    } catch { }
  }
  if (gate && gate.ok && gate.action === 'hold') {
    // Clips-lane Shorts come from an already-published/approved documentary, so
    // a doc-review hold (no_approved_script / awaiting_review / rejected)
    // applies only to the NEXT documentary and must not block posting today's
    // queued Short. Fail-closed conditions (unreadable_*, drift,
    // script_store_unavailable) still hold everything.
    if (shortsSource === 'clips' && ['no_approved_script', 'awaiting_review', 'rejected'].includes(gate.reason)) {
      await runClipsPhase1();
    }
    // #106 T5b/T5c SEAM 1 (generate-only): the gate held because NO script
    // exists for today's slot — the channel's SCRIPT LANE generates + persists
    // the survivor awaiting_review and STOPS: no TTS, no render, no upload
    // (AC-P4-17 + D15: nothing renders until an approval row exists).
    // Approval then dispatches resume=<this job id> and the child renders from
    // the STORED input. A GENERATED channel's script lane is yt-daily (shorts
    // scripts); a CLIPS-source channel's only script lane is the DOC
    // (yt-deepdive — T5b's skip-exact hold left the /review desk with nothing
    // to approve for them; the docDay cadence is bypassed by the child's
    // GENERATE_ONLY flag, the pause/already-produced guards still apply).
    const generateOnly = gate.reason === 'no_approved_script';
    if (generateOnly && shortsSource !== 'clips') {
      log(`[review] no approved script for slot ${today} — generate-only run (REVIEW_GENERATE_ONLY): scripts are saved awaiting_review, nothing renders or uploads`);
      process.env.REVIEW_GENERATE_ONLY = '1';
      process.env.REVIEW_SCRIPT_SLOT_DATE = today;
      await jobCtl?.startStep(SHORTS_STEP);
      const okGen = run('yt-daily.mjs', [slug, '--no-episode', ...(FORCE ? ['--force'] : [])]);
      await jobCtl?.finishStep(SHORTS_STEP, okGen ? 'succeeded' : 'failed', okGen ? null : 'generate-only generation failed');
    } else if (generateOnly) {
      log(`[review] no approved doc script — generate-only run on the DOC lane (REVIEW_GENERATE_ONLY): the episode script is saved awaiting_review, nothing renders or uploads`);
      process.env.REVIEW_GENERATE_ONLY = '1';
      process.env.REVIEW_SCRIPT_SLOT_DATE = today;
      await jobCtl?.startStep('episode');
      // FORCE threads into the child (parity with the docDay path below): a
      // force_doc dispatch must regenerate even when today's doc already
      // shipped — otherwise the child's own produced-guard silently skips,
      // nothing is saved, and the /review desk stays empty (found live
      // 2026-11-03: the first red-flags-explained generate-only run no-op'd
      // on the day-guard set by that morning's pilot render).
      const okGen = run('yt-deepdive.mjs', [slug, ...(FORCE ? ['--force'] : [])]);
      await jobCtl?.finishStep('episode', okGen ? 'succeeded' : 'failed', okGen ? null : 'generate-only doc generation failed');
    } else {
      log(`[review] held — slot skipped today (${gate.reason}); approve at Studio > Review to resume at render (D17)`);
    }
    // T5c round 1 (minor 4): the note is deliberately SOFT — the pipeline
    // cannot see whether the child saved a survivor (store down / dup-block /
    // pause guards all exit 0), so the terminal must not claim a generation
    // that may not exist.
    const holdNote = generateOnly ? 'review hold: generate-only run (scripts awaiting review where produced)' : `review hold: ${gate.reason}`;
    if (jobCtl?.id) {
      try {
        const { getJobStore } = await import('./lib/job-store.mjs');
        const jobs = await getJobStore();
        await jobs.recordStep(jobCtl.id, 90, 'review'); // idx 90: outside the planned range (PK job_id+idx)
        await jobs.finishStep(jobCtl.id, 90, { status: 'skipped', error: `held: ${generateOnly ? 'generate-only' : gate.reason}` });
        await jobs.finishJob(jobCtl.id, { status: 'held', error: holdNote });
      } catch (e) {
        log(`[review] WARN hold recording degraded (non-fatal): ${String((e && e.message) || e).slice(0, 120)}`);
      }
    }
    process.exit(0); // before end(): the 'held' terminal stands (same exit shape as the park-check)
  }
  if (gate && !gate.ok) {
    log(`[review] WARN review state unavailable (${gate.error}) — continuing (AC-P4-5: a dead store never darkens production)`);
  }
}

if (shortsSource === 'clips') {
  await runClipsPhase1();
} else if (jobCtl?.isSkipped(SHORTS_STEP)) {
  log(`resume: skip ${SHORTS_STEP} (artifact verified)`);
  results.shorts = true;
} else if ((!shortsDone || FORCE || TOPUP_N > 0) && (await quotaGate('Shorts production'))) {
  // #98 REGRESSION FIX (2026-10-23 audit): the #98 restructure dropped this
  // produce body — generated channels logged the skip text and produced
  // NOTHING since Oct 21 (caught by the 3-day audit; doctor STALE flags +
  // ntfy alerts were firing the whole time).
  log(`Phase 1 — Producing ${TOPUP_N > 0 ? `topup ${TOPUP_N}/${b.slots.length}` : b.slots.length} Shorts for ${b.label}...`);
  await jobCtl?.startStep(SHORTS_STEP);
  const ok = run('yt-daily.mjs', [slug, '--no-episode', ...(FORCE ? ['--force'] : []), ...(TOPUP_N > 0 ? [`--topup=${TOPUP_N}`] : [])]);
  if (ok) { results.shorts = true; log(`✓ Shorts queued`); await jobCtl?.finishStep(SHORTS_STEP, 'succeeded'); }
  else { errors.push('Shorts production failed'); log(`✗ Shorts failed`); await jobCtl?.finishStep(SHORTS_STEP, 'failed', 'Shorts production failed'); }
} else if (!shortsDone && !FORCE && TOPUP_N === 0) {
  // quota gate said no — already logged + alerted inside quotaGate
  errors.push('Shorts skipped — daily quota budget');
  await jobCtl?.finishStep(SHORTS_STEP, 'skipped', 'daily quota budget');
} else {
  log(`Shorts already produced today — skipping`);
  results.shorts = true;
  await jobCtl?.finishStep(SHORTS_STEP, 'skipped', 'already produced today');
}

// ---- Phase 1a: #105 Brain write-time embedding (shorts) ----
// AC-P3-2: embed only what YouTube ACCEPTED (real videoId — no ghost vectors);
// AC-P3-17: this is the shorts script text's first durable home. Gated by
// BRAIN_EMBED_ENABLED (default off — zero behavior change until the CI flip);
// NEVER fatal — the video is already uploaded, an embedding failure is logged
// and the run continues. Re-POSTing the same script is safe (content-hash
// keyed UPDATE in the brain, no duplicates).
if (results.shorts && shortsSource !== 'clips') {
  await jobCtl?.startStep('brain-embed');
  // Import guarded too (fix round 1): a partial deploy / corrupt checkout
  // must behave exactly like an unreachable brain — one log line, run
  // continues. embedPublishedScripts itself never throws; the dynamic
  // import is the only remaining fatal path.
  try {
    const { embedPublishedScripts } = await import('./lib/brain-embed.mjs');
    const entries = (loadState()[slug]?.lastVideos || [])
      .filter((v) => v?.videoId && v?.text)
      .map((v) => ({ videoId: v.videoId, text: v.text }));
    await embedPublishedScripts({ slug, kind: 'shorts', entries, log });
    await jobCtl?.finishStep('brain-embed', 'succeeded');
  } catch (e) {
    log(`[brain] WARN publish embedding skipped (non-fatal): ${String(e?.message || e).slice(0, 120)}`);
    await jobCtl?.finishStep('brain-embed', 'failed', 'publish embedding failed (non-fatal)');
  }
}

// ---- Phase 1a-2: #106 T2 (D3) — index the shorts script payload. The
// pipeline's exact point for "after script-gen": the shorts lane finished and
// the script record is in state (lastVideos). Blob persists it (fail-open);
// a degraded upload lands as an index-only entry (resume re-runs then).
if (jobCtl && results.shorts && shortsSource !== 'clips') {
  const entries = (loadState()[slug]?.lastVideos || []).filter((v) => v?.videoId && v?.text);
  if (entries.length) await jobCtl.indexScriptPayload(entries);
}

// ---- Phase 1b: Proof-of-publication (09-20) ----
// 09-19 lesson: a dead token printed "✓ Shorts queued / Errors: 0" while
// nothing was uploaded. Verify the claimed uploads REALLY exist on YouTube.
// (Clips lane self-verifies inside post-next — running it twice would double
// alert on the same upload.)
if (results.shorts && shortsSource !== 'clips') {
  await jobCtl?.startStep('verify');
  if (run('verify-run.mjs', [slug])) {
    log(`✓ Uploads verified on YouTube`);
    await jobCtl?.finishStep('verify', 'succeeded');
  } else {
    errors.push('Upload verification failed — check ntfy alert');
    await jobCtl?.finishStep('verify', 'failed', 'Upload verification failed — check ntfy alert');
    // #106 T2 (D9 emitter a): the durable verify-run row. verify_publication_missing
    // IS on the publishing-path allowlist, but per the policy §4.1 ladder it is
    // action_required, not blocking: the slot must be re-produced; parking is
    // for hard-block conditions. verify-run.mjs already pushed AND filed its
    // issue — the row write stays silent (noop send) so the failure never
    // double-pages; re-fires dedupe in the store anyway.
    // auto_verifiable false: PROBES (lib/warnings-probe.mjs) maps token_revoked
    // only — flip to true when a verify probe lands (tracked follow-up).
    if (warnStore && emitWarningFn) {
      try {
        await emitWarningFn(warnStore, {
          channel_id: slug,
          severity: 'action_required',
          code: 'verify_publication_missing',
          title: 'claimed upload(s) missing from YouTube',
          explanation: 'verify-run.mjs failed — a claimed upload is missing from YouTube or the check could not run. Publishing is unconfirmed.',
          evidence: 'verify-run.mjs exited non-zero (missing videoIds in the run log / ntfy alert)',
          recommended_action: 'Re-run node verify-run.mjs <slug>; if the video is truly missing, re-produce the slot.',
          auto_verifiable: false,
          job_id: jobCtl?.id ?? null,
        }, { sendAlert: async () => ({ channel: 'none', ok: true }) });
      } catch { }
    }
  }
}

// ---- Phase 2: Facebook Reels (cross-post from outbox) ----
if (PLATFORMS_PAUSED) {
  log(`Phase 2 — FB Reels skipped (platforms paused — YouTube-only focus)`);
} else {
  log(`Phase 2 — Cross-posting to Facebook...`);
  await jobCtl?.startStep('fb');
  if (run('fb-crosspost.mjs')) { results.fbReels = true; log(`✓ FB Reels done`); await jobCtl?.finishStep('fb', 'succeeded'); }
  else { errors.push('FB cross-post failed'); await jobCtl?.finishStep('fb', 'failed', 'FB cross-post failed'); }
}

// ---- Phase 3: Instagram Reels ----
// IG has no scheduling API, so posting here meant reels went live whenever the
// run finished. They are now posted by ig-slot-poster.yml 3x/day at fixed slot
// times, pulling the produced reels from the run's saved outbox cache.
// ---- Phase 2b: TikTok — PAUSED (10-17 owner decision) ----
// Zernio removed (issue #89 comment + owner go): publishing moves to the
// Quarry Studio TikTok app once its developer approval lands (docs staged in
// tt-lf/ + artifacts by Phase 6; quarry-studio-server + tiktok-app-site are
// the future publisher). Until then this phase is intentionally a no-op.


log(`Phase 3 — IG reels: handled by ig-slot-poster (3x/day at slot times)`);

// ---- Phase 4: Niche poster to FB page ----
if (PLATFORMS_PAUSED) {
  log(`Phase 4 — FB poster skipped (platforms paused — YouTube-only focus)`);
} else {
  log(`Phase 4 — Posting niche poster...`);
  await jobCtl?.startStep('poster');
  if (run('fb-images.mjs', [slug])) { results.poster = true; log(`✓ Poster done`); await jobCtl?.finishStep('poster', 'succeeded'); }
  else { errors.push('Poster failed'); await jobCtl?.finishStep('poster', 'failed', 'Poster failed'); }
}

// ---- Phase 5: Long-form episode (enable when ready) ----
if (jobCtl?.isSkipped('episode')) {
  log(`resume: skip episode (artifact verified)`);
  results.episode = true;
} else if (!SKIP_EPISODE && !episodeDone && (await quotaGate('Episode'))) {
  log(`Phase 5 — Producing daily episode...`);
  await jobCtl?.startStep('episode');
  // 75-min bound (was 45): the 2026-11-18 MR resume render was SIGTERM'd at
  // exactly 2700s mid-render — the 10-chapter doc class with human-voice TTS
  // can exceed 45 min on a slow runner. The produce job's timeout-minutes
  // must stay above this (see channel-autopilot.yml).
  const DOC_TIMEOUT_MS = 4500000;
  const ep = runChild('yt-deepdive.mjs', [slug, ...(FORCE ? ['--force'] : [])], { timeoutMs: DOC_TIMEOUT_MS });
  if (ep.ok) { results.episode = true; log(`✓ Episode done`); await jobCtl?.finishStep('episode', 'succeeded'); }
  else {
    results.episodeFailed = true;
    const cause = ep.timedOut
      ? `timed out after ${Math.round(ep.ms / 60000)} min (limit ${DOC_TIMEOUT_MS / 60000} min)`
      : `crashed (exit ${ep.status ?? 'none'}${ep.signal ? `, signal ${ep.signal}` : ''}) after ${Math.round(ep.ms / 60000)} min`;
    errors.push(`Episode failed: ${cause}`);
    await jobCtl?.finishStep('episode', 'failed', `Episode failed: ${cause}`);
    // 2026-11-19 owner report: Nov 17 (voice-alignment crash) and Nov 18
    // (timeout) were APPROVED docs that never published, yet the run ended
    // green and logged 'not docDay' — nobody was told. Now: a real
    // (action_required) warning → bell + phone, and a red annotation.
    console.log(`::error title=${slug}: documentary render failed::${cause}${RESUME_JOB_ID ? ` (approved script, resume ${RESUME_JOB_ID})` : ''}`);
    if (warnStore && emitWarningFn) {
      try {
        await emitWarningFn(warnStore, {
          channel_id: slug,
          severity: 'action_required',
          code: 'doc_render_failed',
          title: `documentary render failed — ${cause}`,
          explanation: RESUME_JOB_ID
            ? 'An APPROVED documentary did not render, so it was NOT published. The approval still stands.'
            : "Today's documentary did not render, so nothing was published for this slot.",
          evidence: `yt-deepdive.mjs ${cause}${RESUME_JOB_ID ? `; resume job ${RESUME_JOB_ID}` : ''}`,
          recommended_action: RESUME_JOB_ID
            ? 'Retry from Studio > Review (Redispatch on the approved script), or reject it to skip this video.'
            : 'Check the run log on the Runs page; the next scheduled run tries again.',
          auto_verifiable: false,
          job_id: RESUME_JOB_ID || null,
          dedupe_key: `${slug}:doc_render_failed:${RESUME_JOB_ID || today}`,
        });
      } catch (e) {
        log(`[warn] doc_render_failed row not written: ${String(e?.message || e).slice(0, 100)}`);
      }
    }
  }
} else if (SKIP_EPISODE) {
  log(`Episode skipped (--no-episode or paused)`);
  await jobCtl?.finishStep('episode', 'skipped', '--no-episode');
} else if (!episodeDone) {
  // quota gate said no — already logged + alerted inside quotaGate
  await jobCtl?.finishStep('episode', 'skipped', 'daily quota budget');
} else {
  await jobCtl?.finishStep('episode', 'skipped', 'already produced today');
}

// ---- #106 T2 (D3): index the doc lane's TTS narration bytes. The pipeline's
// exact point for "after TTS": the episode lane finished and the narration
// audio is on disk (demos/deepdive-<slug>/narr-*).
if (jobCtl && results.episode) await jobCtl.indexEpisodeTts();

// ---- Phase 5a: #105 Brain write-time embedding (doc) ----
// Same contract as Phase 1a. Only a doc rendered THIS run embeds (deepdiveDate
// is written by the child only after the upload was accepted — the duplicate
// gate inside yt-deepdive exits without it); the narration text rides in
// state on deepdiveVideo.
// #106 T2: both embedding passes share the ONE planned 'brain-embed' step —
// on doc days the doc pass re-opens it and the store overwrites the closed
// step (legal per job-store), so the row reflects the LAST pass.
const docState = loadState();
if (docState[slug]?.deepdiveDate === today) {
  await jobCtl?.startStep('brain-embed');
  // Import guarded too (fix round 1) — same contract as Phase 1a.
  try {
    const { embedPublishedScripts } = await import('./lib/brain-embed.mjs');
    const dv = docState[slug]?.deepdiveVideo;
    const entries = dv?.videoId && dv?.text ? [{ videoId: dv.videoId, text: dv.text }] : [];
    await embedPublishedScripts({ slug, kind: 'doc', entries, log });
    await jobCtl?.finishStep('brain-embed', 'succeeded');
  } catch (e) {
    log(`[brain] WARN publish embedding skipped (non-fatal): ${String(e?.message || e).slice(0, 120)}`);
    await jobCtl?.finishStep('brain-embed', 'failed', 'publish embedding failed (non-fatal)');
  }
}

// ---- Phase 6: Stage doc render for TikTok clips (docDay only) ----
// Ported from channel-quotequarry.yml, which had this as QQ-only YAML logic —
// MR/IC/DFD docs never reached the TikTok queue (issue #77). Generic per-slug:
// the channel workflows upload tt-lf/lf-<slug>.* as artifacts named lf-<slug> /
// lf-meta-<slug>, which longvideo/tiktok-clips.mjs consumes per run.
await jobCtl?.startStep('staging');
try {
  const epFile = path.join('demos', `deepdive-${slug}`, 'episode.mp4');
  // audit #9: stage only a doc that SHIPPED this run (new, non-recovered
  // deepdiveVideo) — a render whose upload failed, or a recovered claim's local
  // render, must never become clip material for a video not on YouTube.
  const shipped = docShippedThisRun(state[slug], loadState()[slug], today);
  if (fs.existsSync(epFile) && !shipped) {
    log('doc rendered but not shipped this run — not staged for clips');
    await jobCtl?.finishStep('staging', 'skipped', 'doc not shipped this run');
  } else if (fs.existsSync(epFile)) {
    fs.mkdirSync('tt-lf', { recursive: true });
    fs.copyFileSync(epFile, path.join('tt-lf', `lf-${slug}.mp4`));
    let title = '';
    try {
      const files = fs.readdirSync(path.join('fb-outbox', slug)).filter(f => f.endsWith('.json')).reverse();
      for (const f of files) {
        const j = JSON.parse(fs.readFileSync(path.join('fb-outbox', slug, f), 'utf8'));
        if (j.kind === 'episode' && j.title) { title = j.title; break; }
      }
    } catch { }
    if (!title) title = `${b.label} documentary`;
    const keyword = (b.tags && b.tags[0]) || b.niche || 'documentary';
    fs.writeFileSync(path.join('tt-lf', `lf-meta-${slug}.json`), JSON.stringify({ title, keyword }, null, 2));
    // #96: SRT alongside the render — word-accurate cues for the clips lane (#97)
    const srtSrc = path.join('demos', `deepdive-${slug}`, 'episode.srt');
    if (fs.existsSync(srtSrc)) fs.copyFileSync(srtSrc, path.join('tt-lf', `lf-srt-${slug}.srt`));
    log(`✓ staged doc render for TikTok clips: "${title}" (keyword: ${keyword})`);
    await jobCtl?.finishStep('staging', 'succeeded');
  } else {
    // Say WHY there's no doc — 'not docDay' used to hide failed renders.
    log(results.episodeFailed ? 'doc render FAILED this run — nothing staged for TikTok' : 'no doc rendered today (not docDay) — nothing staged for TikTok');
    await jobCtl?.finishStep('staging', 'skipped', results.episodeFailed ? 'doc render failed' : 'no doc rendered today');
  }
} catch (e) {
  log(`⚠ TikTok staging failed (non-fatal): ${String(e.message).slice(0, 90)}`);
  await jobCtl?.finishStep('staging', 'failed', 'TikTok staging failed');
}

// ---- Phase 5b: doc-day clips (clips source only) ----
// The doc rendered THIS run (deepdiveDate === today): feed it to the clipper
// from the local files (its GitHub artifacts don't exist until the workflow's
// upload steps run after this job) and give the publisher its turn — Phase 1
// ran before the doc existed. Once per doc day (createdAt guard); post-next's
// own guards handle short-days and duplicates.
try {
  const feedDir = path.join('tt-lf', `clipfeed-${slug}`);
  // yt-deepdive (child) wrote deepdiveDate after this pipeline loaded state — reload
  const freshState = loadState();
  const docToday = freshState[slug]?.deepdiveDate === today;
  const fedToday = freshState[slug]?.clipQueue && String(freshState[slug].clipQueue.createdAt || '').slice(0, 10) === today;
  if (shortsSource === 'clips' && docToday && !fedToday && fs.existsSync(path.join('tt-lf', `lf-${slug}.mp4`))) {
    log(`Phase 5b — doc-day clips: feeding today's doc to the clipper...`);
    fs.mkdirSync(feedDir, { recursive: true });
    fs.copyFileSync(path.join('tt-lf', `lf-${slug}.mp4`), path.join(feedDir, 'video.mp4'));
    if (fs.existsSync(path.join('tt-lf', `lf-srt-${slug}.srt`))) fs.copyFileSync(path.join('tt-lf', `lf-srt-${slug}.srt`), path.join(feedDir, 'episode.srt'));
    fs.copyFileSync(path.join('tt-lf', `lf-meta-${slug}.json`), path.join(feedDir, 'meta.json'));
    // --max 4: 2 doc-days/week × 4 clips = 8/week supply for 7 short-days
    // (#101) — 2/doc starved the queue ~3 days a week at daily Shorts cadence
    // (#96) CI runners are ephemeral: in CI, --archive uploads the cut clips to
    // the clips Release so every post-docDay post survives the runner's death
    const { ensureQueueArgs } = await import('./longvideo/shorts-clips.mjs');
    if (run('longvideo/shorts-clips.mjs', ensureQueueArgs({ slug, feedDir, ci: process.env.GITHUB_ACTIONS === 'true' }))) {
      run('longvideo/shorts-clips.mjs', ['post-next', slug]);
    } else { errors.push('Doc-day clip feed failed'); log(`✗ doc-day clip feed failed`); }
  }
} catch (e) {
  log(`⚠ Phase 5b doc-day clips failed (non-fatal): ${String(e.message).slice(0, 90)}`);
}

// ---- Summary ----
log(`══ PIPELINE COMPLETE ══`);
log(`  Shorts: ${results.shorts ? '✓' : (results.nothingDue ? '– nothing due' : '✗')}`);
// audit #7: a run that published nothing when something was due is visible on
// the Actions run page (annotation) — the exit code stays 0 (AC-P4-3).
if (!results.shorts && !results.nothingDue) {
  console.log(`::warning title=${slug}: no Short published::${errors.length ? errors.join('; ').slice(0, 300) : 'no Short shipped this run'}`);
}
log(`  FB Reels: ${results.fbReels ? '✓' : '✗'}`);
log(`  IG Reels: 📅 via ig-slot-poster (3x/day)`);
log(`  Poster: ${results.poster ? '✓' : '✗'}`);
log(`  Episode: ${results.episode ? '✓' : (SKIP_EPISODE ? '⏸ paused' : '✗')}`);
log(`  Errors: ${errors.length}`);
if (errors.length) errors.forEach(e => log(`    ! ${e}`));

// ---- Live fix wave A4 (T2-01): this run finished, so earlier failed-run
// alerts for the channel are over (scripts/emit-run-failed.mjs raises them).
if (warnStore && typeof warnStore.resolveOpenFor === 'function') {
  try {
    const rf = await warnStore.resolveOpenFor({ channel_id: slug, code: 'run_failed', by: 'auto-resolve', note: `auto-resolved: a later run finished (run ${process.env.GITHUB_RUN_ID || 'local'})` });
    if (rf.ok && rf.resolved) log(`[warn] ${rf.resolved} earlier failed-run alert(s) resolved`);
  } catch { }
}

// ---- #106 T2: close the job (pending-step sweep + terminal) — never fatal
if (jobCtl) await jobCtl.end();

// Always exit 0 — individual failures are logged, not fatal
process.exit(0);
