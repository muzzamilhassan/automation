// Live-fix wave A3 (2026-11-20) — today's channel-autopilot runs for
// /api/overview, so Today can show a FAILED run as failed (DFD run
// 44656112937 failed on 2026-11-20 and Today showed nothing).
// One GitHub call: only today's (UTC) runs of channel-autopilot.yml, mapped
// with the same rules /runs uses (runs-view mapRuns: run-name "<slug> · <event>").
// Honest: a failed read returns { ok: false } — never an empty list that would
// read as "no run today". Relative imports only (testable with node --test).
import { mapRuns } from './runs-view.mjs';

export const AUTOPILOT_WORKFLOW = 'channel-autopilot.yml';
const PER_PAGE = 100; // heartbeats fire every 30 min (48/day) + one run per channel

let memo = null; // { key, at, value } — the home page polls every minute

/**
 * @returns {Promise<{ ok: true, rows, coveredSince } | { ok: false, error }>}
 * rows = runs-view rows (newest first); coveredSince = the oldest run seen when
 * the page was FULL (older runs today may exist), else null.
 */
export async function fetchAutopilotRunsToday({ repo, token, now = new Date(), channels = [], fetchImpl = fetch, cacheMs = 60_000 } = {}) {
  if (!token) return { ok: false, error: 'the panel has no GitHub token' };
  const day = now.toISOString().slice(0, 10); // the UTC day (channel-activity DAY_BASIS)
  const key = `${repo}|${day}`;
  if (cacheMs > 0 && memo && memo.key === key && Date.now() - memo.at < cacheMs) return memo.value;
  try {
    const url = `https://api.github.com/repos/${repo}/actions/workflows/${AUTOPILOT_WORKFLOW}/runs?per_page=${PER_PAGE}&created=${encodeURIComponent('>=' + day)}`;
    const res = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'quarry-studio',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, error: `GitHub answered ${res.status}` };
    const body = await res.json();
    const raw = Array.isArray(body?.workflow_runs) ? body.workflow_runs : null;
    if (!raw) return { ok: false, error: 'GitHub sent an unreadable answer' };
    const rows = mapRuns([raw], channels, [AUTOPILOT_WORKFLOW]);
    const coveredSince = raw.length >= PER_PAGE ? raw[raw.length - 1]?.created_at || null : null;
    const value = { ok: true, rows, coveredSince };
    if (cacheMs > 0) memo = { key, at: Date.now(), value };
    return value;
  } catch (e) {
    return { ok: false, error: String(e?.message || 'network error').slice(0, 80) };
  }
}
