// Creator City item 6 — Inbox "questions" (typed asks with buttons).
//
//   GET  /api/asks  owner + staff. Syncs first — derives the current questions
//        from REAL sources (the channel's latest run failed at a station;
//        open approved_not_published / approval_dispatch_failed /
//        review_timeout / upload_failed warnings; approved scripts with no
//        video), inserts new ones (one per source_key, ever), expires stale
//        ones — then returns the pending ones: { ok, asks:[…], canAnswer }.
//   POST /api/asks { id, optionId }  OWNER ONLY (re-checked here; fail
//        closed). Claims the ask, runs the STORED option's action through the
//        existing safe paths (asks-store.mjs performAskAction), records the
//        answer. A failed action puts the ask back to pending with its error.
//
// The rules (sources, dedupe, expiry) are the pure studio/lib/asks.mjs. The
// bell is untouched: it counts warnings; an ask made from a warning covers
// that warning on the Inbox page instead of adding a second item.
import { getUser } from '@/lib/route-auth';
import { db, dbReady } from '@/lib/db.mjs';
import { adaptPostgres } from '@/lib/provider-routing';
import { makeJobsRead } from '@/lib/jobs-read.mjs';
import { makeScriptStore, adaptPostgresTransact } from '@/lib/script-store.mjs';
import { makeWarningsStore, resolveStaleReviewAlerts, scriptLookups } from '@/lib/warnings-store.mjs';
import { dispatchResumeRun, channelRunBusy } from '@/lib/review-actions.mjs';
import { enforceLimits } from '@/lib/rate-limit.mjs';
import { appendAudit } from '@/lib/audit';
import { ENV } from '@/lib/data.mjs';
import { makeAsksStore, performAskAction } from '@/lib/asks-store.mjs';
import {
  ASK_WARNING_CODES, DISPATCH_ACTIONS,
  deriveAsks, staleAsks, newAskRow, presentAsk, parseAnswer, findOption, titleScriptIds,
} from '@/lib/asks.mjs';

export const dynamic = 'force-dynamic';

const REPO = ENV.GITHUB_REPO || 'muzzamilhassan/automation';
const TOKEN = ENV.GITHUB_TOKEN || ENV.GITHUB_PAT || '';

function stores() {
  const client = adaptPostgres(db);
  return {
    asks: makeAsksStore(client),
    jobs: makeJobsRead(client),
    warnings: makeWarningsStore(client),
    scripts: makeScriptStore({ dbClient: client, transact: adaptPostgresTransact(db) }),
  };
}

// Derive → insert new → expire stale → the pending list. A reader that fails
// is null: it adds nothing and expires nothing (unknown is not resolved).
async function sync(s, now) {
  const [today, warn, unpub] = await Promise.all([
    s.jobs.loadToday({ now }).catch(() => null),
    s.warnings.listOpenByCodes({ codes: [...ASK_WARNING_CODES] }).catch(() => null),
    s.scripts.approvedNotPublished({ olderThanHours: 6 }).catch(() => null),
  ]);
  const warnings = warn?.ok ? warn.rows : null;
  const unpublished = unpub?.ok ? unpub.scripts : null;

  // station asks name the script ("Voice failed for “…”") — the jobs reader
  // carries no titles, so read the few it needs through the script store.
  const titles = {};
  if (today) {
    await Promise.all(titleScriptIds(today).map(async (id) => {
      const g = await s.scripts.getScript(id).catch(() => null);
      if (g?.ok && g.script?.title) titles[id] = g.script.title;
    }));
  }

  const candidates = deriveAsks({ today, warnings, unpublished, titles });
  const ins = await s.asks.upsertAsks([...candidates.values()].map((c) => newAskRow(c, now)));
  if (!ins.ok) return { ok: false };
  const pending = await s.asks.listPending();
  if (!pending.ok) return { ok: false };
  const stale = staleAsks(pending.rows, {
    candidates, today, now,
    read: { today: Boolean(today), warnings: Boolean(warnings), unpublished: Boolean(unpublished) },
  });
  if (stale.length) await s.asks.expireAsks(stale);
  const gone = new Set(stale.map((x) => x.id));
  return {
    ok: true,
    asks: pending.rows.filter((r) => !gone.has(String(r.id))).map((r) => presentAsk(r, candidates.get(r.source_key))),
  };
}

export async function GET(req) {
  const user = await getUser(req).catch(() => null);
  if (!user) return Response.json({ ok: false, error: 'not signed in' }, { status: 401 });
  if (!['owner', 'staff'].includes(user.role)) {
    return Response.json({ ok: false, error: 'your role does not allow this' }, { status: 403 });
  }
  if (!dbReady || !db) return Response.json({ ok: false, error: 'asks_unavailable' }, { status: 503 });

  let synced;
  try {
    synced = await sync(stores(), new Date());
  } catch {
    synced = { ok: false };
  }
  if (!synced.ok) return Response.json({ ok: false, error: 'asks_unavailable' }, { status: 503 });
  return Response.json({ ok: true, asks: synced.asks, canAnswer: user.role === 'owner' });
}

export async function POST(req) {
  const user = await getUser(req).catch(() => null);
  if (!user) return Response.json({ ok: false, error: 'not signed in' }, { status: 401 });
  // answers change production (runs, script status, alerts): owner only,
  // re-checked here — the proxy's owner+staff rule is only the front door.
  if (user.role !== 'owner') return Response.json({ ok: false, error: 'owner only' }, { status: 403 });
  const limited = await enforceLimits(user, [{ bucket: 'asks', limit: 30, windowSec: 3600 }]);
  if (limited) return limited;
  if (!dbReady || !db) return Response.json({ ok: false, error: 'asks_unavailable' }, { status: 503 });

  const parsed = parseAnswer(await req.json().catch(() => null));
  if (!parsed.ok) return Response.json({ ok: false, error: parsed.reason }, { status: 400 });

  const s = stores();
  const got = await s.asks.getAsk(parsed.id);
  if (!got.ok) return Response.json({ ok: false, error: 'asks_unavailable' }, { status: 503 });
  if (!got.ask) return Response.json({ ok: false, error: 'not found' }, { status: 404 });
  if (got.ask.status !== 'pending') return Response.json({ ok: false, error: `already ${got.ask.status}` }, { status: 409 });
  const option = findOption(got.ask, parsed.optionId);
  if (!option) return Response.json({ ok: false, error: 'unknown option' }, { status: 400 });

  // a retry is a billable GitHub Actions run — the same shared caps as /api/action
  if (DISPATCH_ACTIONS.includes(option.action)) {
    const limitedRun = await enforceLimits(user, [
      { bucket: 'dispatch', limit: 10, windowSec: 3600 },
      { bucket: 'dispatch', limit: 30, windowSec: 86400 },
    ]);
    if (limitedRun) return limitedRun;
  }

  const claimed = await s.asks.claim(parsed.id, user.email);
  if (!claimed.ok) {
    if (claimed.reason === 'not_open') return Response.json({ ok: false, error: 'already answered or expired' }, { status: 409 });
    return Response.json({ ok: false, error: 'asks_unavailable' }, { status: 503 });
  }

  const r = await performAskAction(claimed.ask, option, {
    by: user.email,
    scriptStore: s.scripts,
    warningsStore: s.warnings,
    dispatchResume: ({ slug, jobId }) => dispatchResumeRun({ slug, jobId, token: TOKEN, repo: REPO }),
    runBusy: ({ slug }) => channelRunBusy({ slug, token: TOKEN, repo: REPO }),
    resolveAlerts: ({ channelId, dispatchedScriptId = null }) =>
      resolveStaleReviewAlerts(s.warnings, { channelId, dispatchedScriptId, ...scriptLookups(s.scripts) }),
  });
  await appendAudit(user.email, 'ask-answer',
    `${parsed.id} · ${claimed.ask.source_key} · ${option.id}${r.ok ? ` · ${r.result}` : ` · FAILED (${r.error})`}`);

  if (!r.ok) {
    await s.asks.release(parsed.id, r.error);
    return Response.json({ ok: false, error: r.error }, { status: 502 });
  }
  await s.asks.finalize(parsed.id, { optionId: option.id, label: option.label, action: option.action, result: r.result });
  return Response.json({ ok: true, result: r.result });
}
