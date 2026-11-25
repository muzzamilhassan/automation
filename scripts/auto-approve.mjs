#!/usr/bin/env node
// Every scheduler tick: approve the long-video scripts the owner did not answer in
// time, when their facts are checked (studio/lib/auto-approve.mjs — the rules).
// Uses the SAME approve action as the Review page's button. A script whose facts
// failed is never approved: the owner gets one alert. DRY_RUN=1 only prints.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** Pure run over injected parts (tests/auto-approve.test.mjs). */
export async function runAutoApprove({ store, channels, stateOf, approve, emit = async () => {}, now = () => new Date(), dry = false, log = console.log }) {
  const { decideAutoApprove, AUTO_APPROVE_BY } = await import('../studio/lib/auto-approve.mjs');
  const { DISCLOSURE_CATEGORIES } = await import('../studio/lib/review-actions.mjs');
  const pending = await store.pendingFor(null);
  if (!pending?.ok) throw new Error(`scripts unreadable: ${pending?.error || 'unknown'}`);
  const done = new Set(); // one approval per channel per tick
  const out = [];
  const newestFirst = [...(pending.scripts || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  for (const row of newestFirst) {
    const full = await store.getScript(row.id);
    const script = full?.ok && full.script ? { ...row, ...full.script } : null;
    if (!script) continue;
    const channel = channels.find((c) => c.slug === script.channel_id) || null;
    const onTheWay = await store.latestApproved(script.channel_id);
    const d = decideAutoApprove({
      script,
      channel,
      pausedUntil: stateOf(script.channel_id)?.pausedUntil || null,
      alreadyApproved: done.has(script.channel_id) || Boolean(onTheWay?.ok && onTheWay.script && !onTheWay.script.video_id && (now() - new Date(onTheWay.script.approval_at || 0)) < 24 * 3600_000),
      now: now(),
    });
    log(`[auto-approve] ${script.channel_id} "${String(script.title).slice(0, 60)}": ${d.action} — ${d.reason}`);
    out.push({ id: script.id, channel: script.channel_id, ...d });
    if (dry) continue;
    if (d.action === 'approve') {
      // the four official questions, true for how this engine makes videos: drawn
      // diagrams, stock footage and a synthetic voice; no generated people, places or music
      const disclosure = Object.fromEntries(DISCLOSURE_CATEGORIES.items.map((i) => [i.text, false]));
      const r = await approve({ scriptId: script.id, by: AUTO_APPROVE_BY, note: d.reason, disclosure });
      log(`[auto-approve] ${script.channel_id}: ${r.ok ? (r.dispatched ? 'approved — the video is being made' : 'approved — starts after the current run') : `FAILED (${r.error})`}`);
      if (r.approved) done.add(script.channel_id);
    } else if (d.action === 'needs_you') {
      await emit({
        channel_id: script.channel_id,
        severity: 'action_required',
        code: 'script_facts_unverified',
        title: `"${String(script.title).slice(0, 60)}" needs you — its facts could not be verified`,
        explanation: 'This script was not approved on its own because at least one number, name or quote has no source. Nothing is published until you decide.',
        evidence: d.reason,
        recommended_action: 'Open Inbox › Review: approve it only if you checked the facts yourself, or reject it and a new one is written.',
        auto_verifiable: false,
        job_id: script.job_id ?? null,
        dedupe_key: `${script.channel_id}:script_facts_unverified:${script.id}`,
      });
    }
  }
  return out;
}

async function main() {
  const { loadEnv } = await import('../lib/env.mjs');
  loadEnv();
  if (!process.env.DATABASE_URL) { console.error('[auto-approve] no DATABASE_URL'); return 1; }
  const { getScriptStore } = await import('../lib/script-store.mjs');
  const { emitWarning, getDefaultWarningsStore } = await import('../lib/warnings-store.mjs');
  const { approveScriptAndDispatch } = await import('../studio/lib/review-actions.mjs');
  const store = await getScriptStore();
  if (!store) { console.error('[auto-approve] script store unavailable — nothing approved'); return 1; }
  const warnings = await getDefaultWarningsStore();
  const channels = JSON.parse(fs.readFileSync(path.join(ROOT, 'yt-mcp', 'studio-channels.json'), 'utf8')).channels || [];
  const stateOf = (slug) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'yt-mcp', 'state', `${slug}.json`), 'utf8')); } catch { return {}; } };
  const token = process.env.GH_DISPATCH_TOKEN || process.env.GITHUB_TOKEN || '';
  const repo = process.env.GITHUB_REPOSITORY || 'muzzamilhassan/automation';
  const emit = (f) => emitWarning(warnings, f);
  await runAutoApprove({
    store,
    channels,
    stateOf,
    emit,
    dry: process.env.DRY_RUN === '1',
    approve: (a) => approveScriptAndDispatch({ scriptStore: store, warningsStore: warnings, emit: emitWarning, token, repo, log: console.log, ...a }),
  });
  return 0;
}

if (Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main().catch((e) => { console.error(`[auto-approve] ${String((e && e.message) || e).slice(0, 200)}`); return 1; }));
}
