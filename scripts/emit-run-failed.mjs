#!/usr/bin/env node
// Live fix wave A4 (T2-01, 2026-11-20) — a failed autopilot run raises ONE
// real alert. DFD's run 44656112937 failed at 07:19 PKT and nothing said so:
// channel-pipeline.mjs only raises doc_render_failed, so a job failing in any
// other step (token, install, render setup, a pipeline crash) was silent.
//
// WIRING: channel-autopilot.yml's produce job, LAST step, `if: failure()`,
// continue-on-error + a short timeout — this step can never fail the job
// further. Env: SLUG (the job env), GITHUB_RUN_ID / GITHUB_SERVER_URL /
// GITHUB_REPOSITORY (runner defaults), DATABASE_URL + NTFY_TOPIC (the same
// secrets the pipeline uses), GH_TOKEN (github.token, actions: read — only to
// name the failed step; the alert goes out without it).
//
// The alert: action_required `run_failed`, channel_id = slug, the run link,
// dedupe key `${slug}:run_failed:${run_id}` (one per failed run). It clears
// when a later pipeline run for the channel finishes (channel-pipeline.mjs
// resolveOpenFor at its summary).
import { pathToFileURL } from 'node:url';

/** The alert row for this failed run, or null when no channel is known. */
export function buildRunFailedAlert({ env = process.env, step = null } = {}) {
  const slug = String(env.SLUG || '').trim();
  if (!slug) return null;
  const runId = String(env.GITHUB_RUN_ID || 'unknown');
  const server = env.GITHUB_SERVER_URL || 'https://github.com';
  const runUrl = env.GITHUB_REPOSITORY ? `${server}/${env.GITHUB_REPOSITORY}/actions/runs/${runId}` : null;
  return {
    channel_id: slug,
    severity: 'action_required',
    code: 'run_failed',
    title: step ? `today's run failed — ${String(step).slice(0, 80)}` : "today's run failed",
    explanation: 'The autopilot run for this channel stopped with an error, so nothing more was made or uploaded by it.',
    evidence: `run ${runId}${step ? `, failed step: ${step}` : ''}${runUrl ? ` — ${runUrl}` : ''}`,
    recommended_action: runUrl ? `Open the run log: ${runUrl}` : 'Open the latest run on the Runs page.',
    auto_verifiable: false,
    job_id: null,
    dedupe_key: `${slug}:run_failed:${runId}`,
  };
}

/** The failed step of THIS channel's produce job in a GitHub jobs payload. */
export function failedStepOf(payload, slug) {
  if (!payload || !Array.isArray(payload.jobs) || !slug) return null;
  const esc = String(slug).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mine = new RegExp(`(^|[\\s(,])${esc}([\\s),]|$)`);
  for (const job of payload.jobs) {
    if (!mine.test(String(job?.name || ''))) continue;
    const step = (job.steps || []).find((s) => s?.conclusion === 'failure');
    if (step?.name) return step.name;
  }
  return null;
}

async function lookupFailedStep({ env, fetchImpl }) {
  try {
    if (!env.GH_TOKEN || !env.GITHUB_REPOSITORY || !env.GITHUB_RUN_ID) return null;
    const res = await fetchImpl(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}/jobs?per_page=100`, {
      headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'quarry-autopilot' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res?.ok) return null;
    return failedStepOf(await res.json(), env.SLUG);
  } catch {
    return null;
  }
}

/** Emit the alert. Never throws; { ok:false } when nothing was written. */
export async function emitRunFailed({ env = process.env, store, emit, fetchImpl = fetch, log = () => {} } = {}) {
  try {
    const step = await lookupFailedStep({ env, fetchImpl });
    const fields = buildRunFailedAlert({ env, step });
    if (!fields) return { ok: false, error: 'no channel slug' };
    const r = await emit(store, fields);
    log(`[run-failed] ${fields.channel_id}: ${fields.title} (${r?.ok ? (r.deduped ? 'already open' : 'alert raised') : `store: ${r?.error || 'unavailable'}`})`);
    return { ok: true, fields, write: r };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e).slice(0, 200) };
  }
}

export async function main() {
  const { loadEnv } = await import('../lib/env.mjs');
  loadEnv(); // repo-root .env (CI env always wins)
  const { emitWarning, getDefaultWarningsStore } = await import('../lib/warnings-store.mjs');
  const store = await getDefaultWarningsStore(); // null -> emitWarning falls back to ntfy only
  const emitOrPush = async (s, f) => (s ? emitWarning(s, f) : emitWarning({ openWarning: async () => ({ ok: false, error: 'warnings store unavailable' }) }, f));
  const r = await emitRunFailed({ store, emit: emitOrPush, log: (m) => console.log(m) });
  if (!r.ok) console.log(`[run-failed] not raised: ${r.error}`);
  return 0; // never fails the job further
}

if (Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
