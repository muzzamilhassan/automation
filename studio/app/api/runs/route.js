// Phase 2 run history (OPS-01): GET recent GitHub Actions runs of the
// production workflows so the owner can see whether today's automation
// actually succeeded — the dispatch buttons only ever learned "started".
// Same token + repo the run buttons use (api/action/route.js). Read-only.
// Honesty: if GitHub doesn't answer we return 502 — never an empty list that
// would read as "nothing ran / all good".
import { ENV, brands } from '@/lib/data.mjs';
import { getUser } from '@/lib/route-auth';
import { enforceLimits } from '@/lib/rate-limit.mjs';
import { deriveBrandList } from '@/lib/brand-list.mjs';
import { mapRuns, PRODUCTION_WORKFLOWS } from '@/lib/runs-view.mjs';

export const dynamic = 'force-dynamic';

const REPO = ENV.GITHUB_REPO || 'muzzamilhassan/automation';
const TOKEN = ENV.GITHUB_TOKEN || ENV.GITHUB_PAT || '';
const CACHE_MS = 60_000;
// channel-autopilot heartbeats fire every 30 min (48/day) — 100 covers ~2 days;
// the other workflows run a few times a day at most.
const PER_PAGE = { 'channel-autopilot.yml': 100 };
const DEFAULT_PER_PAGE = 20;

let cache = null; // { at, payload } — shared: owner and staff see the same runs

async function fetchWorkflowRuns(workflow) {
  const perPage = PER_PAGE[workflow] || DEFAULT_PER_PAGE;
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/runs?per_page=${perPage}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'quarry-studio',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`${workflow}: GitHub answered ${res.status}`);
  const body = await res.json();
  const runs = Array.isArray(body?.workflow_runs) ? body.workflow_runs : null;
  if (!runs) throw new Error(`${workflow}: GitHub sent an unreadable answer`);
  // a FULL page means older runs exist that we didn't read
  const oldest = runs.length >= perPage ? runs[runs.length - 1]?.created_at || null : null;
  return { runs, oldest };
}

// slug + label of every real channel, so run names resolve to channels from data
async function knownChannels() {
  let registry = [];
  try {
    const { registryChannels } = await import('@/lib/channels-registry');
    registry = await registryChannels();
  } catch { }
  try {
    return deriveBrandList(brands() || {}, registry);
  } catch {
    return [];
  }
}

export async function GET(req) {
  const user = await getUser(req).catch(() => null);
  if (!user) return Response.json({ ok: false, error: 'not signed in' }, { status: 401 });
  // the engine room: owner + staff only (clients never see fleet-wide runs)
  if (!['owner', 'staff'].includes(user.role)) {
    return Response.json({ ok: false, error: 'your role does not allow this' }, { status: 403 });
  }

  if (cache && Date.now() - cache.at < CACHE_MS) return Response.json(cache.payload);

  // only cache misses spend GitHub API calls, so only they count against the limit
  const limited = await enforceLimits(user, [{ bucket: 'runs-read', limit: 30, windowSec: 3600 }]);
  if (limited) return limited;

  if (!TOKEN) {
    return Response.json({ ok: false, error: "The panel has no GitHub token, so it can't read run history." }, { status: 502 });
  }

  let results;
  try {
    results = await Promise.all(PRODUCTION_WORKFLOWS.map(fetchWorkflowRuns));
  } catch (e) {
    return Response.json({ ok: false, error: `GitHub didn't answer (${e?.message || 'network error'}).` }, { status: 502 });
  }

  const channels = await knownChannels();
  const runs = mapRuns(results.map((r) => r.runs), channels);
  // the latest "oldest run on a full page" = the point before which we can't vouch
  const cutoffs = results.map((r) => r.oldest).filter(Boolean).sort();
  const payload = {
    ok: true,
    runs,
    coveredSince: cutoffs.length ? cutoffs[cutoffs.length - 1] : null,
    fetchedAt: new Date().toISOString(),
    workflows: PRODUCTION_WORKFLOWS,
  };
  cache = { at: Date.now(), payload };
  return Response.json(payload);
}
