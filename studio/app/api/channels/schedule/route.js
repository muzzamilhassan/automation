// #100 — per-channel production scheduling (cadence): docDays, shortDays,
// shortsSource. Stored in yt-mcp/cadence.json via the repo — the engine merges
// this overlay LAST in lib/brand-resolve.mjs, so Studio edits reach the daily
// runs without touching kit code. Writes: owner + staff only (this controls
// production); clients read their own channel. Quota projection blocks saves
// that would stack a day past the shared 10k-unit pool (#99 constants).
//
// #104 Task 6 addendum (Task 8 review carry-forwards CF-1/2/3): the
// projection is now MODEL-AWARE at schedule time (AC-P2-6/7 end-to-end) —
//   CF-3: projectWithQuotaModel wired with the loader injected,
//   CF-2: ensureQuotaModelSchema runs at this wiring point; TABLE-MISSING vs
//         ROW-MISSING are distinguished log lines,
//   CF-1: when a live model's insertCostUnits differs from the legacy 1,700
//         (the ~17x relaxation), one log line + one UI warning fire — never
//         silent. Every quota-store failure degrades to the legacy constants
//         (a broken DB must not block schedule saves).
import { getUser } from '@/lib/route-auth';
import { canAccessChannelSlug } from '@/lib/access';
import { readRepoJSON, writeRepoJSON, readRegistry, setChannelCron, setChannelKitFields } from '@/lib/channels-registry';
import { appendAudit } from '@/lib/audit';
import { validateSchedule, projection, projectWithQuotaModel, cronFromSlots } from '@/lib/schedule-projection';
import { ensureQuotaModelSchema, loadQuotaModel } from '@/lib/quota-ledger';
import { adaptPostgres } from '@/lib/provider-routing';
import { db, dbReady } from '@/lib/db';
import { channelTimes, parsePublishTimes } from '@/lib/slot-planner.mjs';
import { autoApproveHours, parseAutoApproveHours } from '@/lib/auto-approve.mjs';

export const dynamic = 'force-dynamic';

const FILE = 'yt-mcp/cadence.json';

// The quota pool is workspace-wide (ONE shared OAuth project — see
// studio/lib/quota-ledger.mjs), so youtube_quota_models rows are keyed by this
// id. Set YT_GCP_PROJECT_ID to the real GCP project id to key rows by it; the
// sentinel keeps the default row addressable when the env is unset.
const QUOTA_PROJECT_ID = process.env.YT_GCP_PROJECT_ID || 'workspace-default';

// Pre-#104 per-upload cost (insert 1,600 + thumbnail 50 + pinned comment 50).
// CF-1: any live model row that diverges from this number must announce itself.
const LEGACY_INSERT_COST = 1700;

const loadFile = async () => (await readRepoJSON(FILE)) || {};
const quotaLog = (msg) => console.log(`[schedule] quota model: ${msg}`);

// CF-1: one advisory string per divergence — the ~17x relaxation must never
// be silent (log + UI warning). No threshold band: the row is owner-authored
// data, so ANY divergence from legacy gets the line.
export function insertCostAdvisories(model) {
  const cost = Number(model?.insertCostUnits);
  if (!Number.isFinite(cost) || cost === LEGACY_INSERT_COST) return [];
  return [
    `Quota advisory: this project's uploads are gated at ${cost} units/upload (legacy math assumed ${LEGACY_INSERT_COST} — ${(LEGACY_INSERT_COST / cost).toFixed(1)}x cheaper), so the shared pool now allows far more uploads per day than the old projection. Edit the youtube_quota_models row (project "${QUOTA_PROJECT_ID}") to change this.`,
  ];
}

// CF-2: load the schedule-time quota model, distinguishing TABLE-MISSING from
// ROW-MISSING in the log (a silently-DEFAULT-forever store is the failure mode
// the review flagged). Fail-soft: every failure path returns null and the
// caller projects with the legacy constants.
async function loadScheduleQuotaModel() {
  if (!dbReady || !db) {
    quotaLog('database not configured — legacy projection constants (10,000 units pool / 1,700 per upload)');
    return null;
  }
  const client = adaptPostgres(db);
  try {
    await ensureQuotaModelSchema(client);
  } catch (e) {
    quotaLog(`table MISSING or unwritable (${String(e?.message || e).slice(0, 120)}) — legacy projection constants`);
    return null;
  }
  let rowPresent = false;
  try {
    const rows = await client('SELECT project_id FROM youtube_quota_models WHERE project_id = $1', [QUOTA_PROJECT_ID]);
    rowPresent = Array.isArray(rows) && rows.length > 0;
  } catch { rowPresent = false; }
  if (!rowPresent) {
    quotaLog(`no row for project "${QUOTA_PROJECT_ID}" — DEFAULT model in effect (100 units/upload, 100 inserts/day)`);
  }
  let model = null;
  try {
    model = await loadQuotaModel(QUOTA_PROJECT_ID, client);
  } catch (e) {
    // reachable-but-erroring store (transient failure, malformed row) — same
    // fail-soft contract as the schema path above: legacy constants, never a 500
    quotaLog(`store ERROR loading model for "${QUOTA_PROJECT_ID}" (${String(e?.message || e).slice(0, 120)}) — legacy projection constants`);
    return null;
  }
  for (const advisory of insertCostAdvisories(model)) quotaLog(`ADVISORY: ${advisory}`);
  return model;
}

// Schedule-time projection: model-aware when the quota store is reachable
// (CF-3, loader injected — the model is already loaded and logged above),
// legacy constants otherwise. proj.warnings carries the model's insert-bucket
// advisory (Task 8) plus the CF-1 cost advisory.
async function scheduleProjection(schedule) {
  const { docDays = [], shortDays = [] } = schedule || {};
  const model = await loadScheduleQuotaModel();
  if (!model) return { proj: projection({ docDays, shortDays }), advisories: [] };
  let proj;
  try {
    proj = await projectWithQuotaModel({
      docDays,
      shortDays,
      projectId: QUOTA_PROJECT_ID,
      dbClient: adaptPostgres(db),
      loadQuotaModel: async () => model,
    });
  } catch (e) {
    // a throw inside the model-aware projection must never fail the request —
    // degrade to the legacy verdict (a broken quota store never blocks saves)
    quotaLog(`projection ERROR with live model (${String(e?.message || e).slice(0, 120)}) — legacy projection constants`);
    return { proj: projection({ docDays, shortDays }), advisories: [] };
  }
  const advisories = insertCostAdvisories(model);
  proj.warnings = [...(proj.warnings || []), ...advisories];
  return { proj, advisories };
}

export async function GET(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  const slug = new URL(req.url).searchParams.get('slug') || '';
  if (!(await canAccessChannelSlug(user, slug))) return Response.json({ error: 'this channel is not linked to your account' }, { status: 403 });
  const e = (await loadFile())[slug] || {};
  const { docDays = [], shortDays = [], shortsSource = 'generated' } = e;
  let gateCron = null;
  // Feedback r1 (item F): the SlotTimeline needs every channel's times to
  // grey out taken hours (live registry — no per-channel maps) and this
  // channel's "goes public" slots. Other channels' names/times are for
  // owner/staff only; a client sees just their own channel.
  let channels = [];
  let publish = { slots: [], long: null };
  let approveHours = autoApproveHours(null);
  try {
    const reg = await readRegistry();
    const entry = (reg.channels || []).find((c) => c.slug === slug);
    gateCron = entry?.cron || entry?.kit?.gateCron || null;
    approveHours = autoApproveHours(entry?.kit);
    const own = channelTimes(entry ? [entry] : [])[0];
    if (own) publish = { slots: own.publish, long: own.long };
    channels = ['owner', 'staff'].includes(user.role) ? channelTimes(reg.channels || []) : [];
  } catch { }
  const { proj } = await scheduleProjection({ docDays, shortDays });
  return Response.json({ slug, schedule: { docDays, shortDays, shortsSource }, gateCron, publish, autoApproveHours: approveHours, channels, projection: proj });
}

const DAILY_CRON_RE = /^(\d{1,2}) (\d{1,2}) \* \* \*$/;
function validGateCron(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const s = String(raw).trim();
  const m = DAILY_CRON_RE.exec(s);
  if (!m) return false;
  const min = Number(m[1]), hr = Number(m[2]);
  if (min > 59 || hr > 23) return false;
  return `${min} ${hr} * * *`;
}

export async function POST(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  // scheduling controls production — owner + staff only (clients: read-only)
  if (!['owner', 'staff'].includes(user.role)) {
    return Response.json({ error: 'only owner and staff can change scheduling' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const { slug, gateCron: rawGateCron, slots: rawSlots, longSlot: rawLongSlot, autoApproveHours: rawApprove, ...schedule } = body || {};
  if (!(await canAccessChannelSlug(user, slug))) return Response.json({ error: 'this channel is not linked to your account' }, { status: 403 });

  const explicitCron = validGateCron(rawGateCron);
  if (explicitCron === false) {
    return Response.json({ error: 'gateCron must be daily UTC cron "M H * * *" (e.g. "13 2 * * *")' }, { status: 400 });
  }
  // 2026-11-21 (owner-approved): the Shorts and long-video go-public times are
  // edited here too, so every schedule setting lives in one drawer. Only sent
  // fields change; a blank is refused (never wipes a filled time). Checked
  // before ANY write, so a bad time never half-saves the schedule.
  const times = parsePublishTimes({
    ...(rawSlots !== undefined ? { slots: rawSlots } : {}),
    ...(rawLongSlot !== undefined ? { longSlot: rawLongSlot } : {}),
  });
  if (!times.ok) return Response.json({ error: times.error }, { status: 400 });
  // only a changed choice is sent; stored in the kit the engine reads
  if (rawApprove !== undefined) {
    // approvals are owner-only (OQ-5): staff can never turn them automatic
    if (user.role !== 'owner') return Response.json({ error: 'only the owner can change what happens to unanswered scripts' }, { status: 403 });
    const ap = parseAutoApproveHours(rawApprove);
    if (!ap.ok) return Response.json({ error: ap.error }, { status: 400 });
    times.kitPatch.autoApproveHours = ap.value;
  }

  const v = validateSchedule(schedule);
  if (!v.ok) return Response.json({ error: v.errors.join('; ') }, { status: 400 });
  const { proj, advisories } = await scheduleProjection(v.clean);
  if (proj.blocked) {
    return Response.json({
      error: `blocked: the busiest day would use ${proj.worstDayUnits} of the shared ${proj.budget} unit daily pool (${proj.worstDayUploads} uploads) — spread the days or lower the cadence`,
      projection: proj,
    }, { status: 400 });
  }

  const file = await loadFile();
  file[slug] = {
    ...(file[slug] || {}),
    ...v.clean,
    updated: new Date().toISOString(),
    updatedBy: user.email,
  };
  await writeRepoJSON(FILE, file, `schedule: ${slug} cadence updated (#100)`);
  // Step C1a shadow week: mirror the cadence into Neon (best-effort; the repo
  // file stays the truth until C1b)
  if (dbReady && db) {
    try {
      const { mirrorCadenceToNeon } = await import('@/lib/registry-feed.mjs');
      await mirrorCadenceToNeon((t, p) => db.unsafe(t, p), file);
    } catch (e) {
      console.error('[schedule] neon cadence mirror failed:', String(e.message).slice(0, 100));
    }
  }

  // 2026-11-21: the go-public times → kit.slots (+ top-level slots) and
  // kit.longSlot in Neon and the engine file (kit-only write; other channels
  // untouched). Written BEFORE the gate-cron step, which reads entry.slots.
  let timesNote = '';
  let publishSaved = null;
  if (Object.keys(times.kitPatch).length) {
    try {
      const res = await setChannelKitFields(slug, times.kitPatch, { top: times.top, message: `schedule: go-public times for ${slug}` });
      if (res.ok) publishSaved = times.kitPatch;
      else timesNote = 'Go-public times not saved: the channel is not in the engine list yet.';
    } catch (e) {
      timesNote = `Go-public times not saved (${String(e?.message || e).slice(0, 120)}) — try again.`;
    }
  }

  // T4a (round 1): re-derive the registry gate cron on every save from the
  // channel's SHORT slots only when no gateCron is set yet (never overwrite an
  // existing hand-tuned 02:13-03:53 gate cron unless explicit gateCron is sent).
  // Live-test fix: a degraded repo overlay (reg.overlayDegraded) can make an
  // entry LOOK cron-less — never auto-derive a gate cron from that.
  let gateNote = '';
  let resolvedCron = null;
  try {
    const reg = await readRegistry();
    const entry = (reg.channels || []).find((c) => c.slug === slug);
    const oldCron = entry?.cron || entry?.kit?.gateCron || '';
    resolvedCron = oldCron || null;
    const cron = explicitCron || (!oldCron && !reg.overlayDegraded && entry?.slots?.length ? cronFromSlots(entry.slots) : null);
    if (cron && cron !== oldCron) {
      const res = await setChannelCron(slug, cron, `schedule: gate cron ${cron} for ${slug} (T4a slot gating)`);
      if (!res.ok) {
        gateNote = `Gate time not updated: the channel is not in the engine registry yet (yt-mcp/studio-channels.json).`;
      } else {
        resolvedCron = cron;
        const [cronMinute, cronHour] = cron.split(' ');
        const hhmm = `${cronHour}:${String(cronMinute).padStart(2, '0')}`;
        gateNote = `Gate time set to ${hhmm} UTC${oldCron && oldCron !== cron ? ` (was ${oldCron})` : ''}`;
      }
    }
  } catch (e) {
    gateNote = `cron sync failed (${String(e?.message || e).slice(0, 120)}) — the gate time keeps its previous value`;
  }

  try { await appendAudit(user.email, 'channel schedule set', slug); } catch { }
  return Response.json({ ok: true, slug, schedule: v.clean, gateCron: resolvedCron, ...(publishSaved ? { publishSaved } : {}), projection: proj, warnings: [...(v.warnings || []), ...advisories, ...(gateNote ? [gateNote] : []), ...(timesNote ? [timesNote] : [])] });
}
