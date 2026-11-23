// Settings › Accounts (owner-approved 2026-11-23) — GET every connected
// account with a REAL health check:
//   YouTube  — the saved key (readiness item 'youtube' = registry
//              tokenSecretSaved), the live read (ytChannels), open
//              token_revoked warnings (Neon), the review gate (state cache)
//   Facebook / Instagram — the fleet FB_PAGE_TOKEN checked against Graph
//              (lib/data.mjs fbPages swallows errors, so it isn't used here)
//   Threads  — the token the panel can see (env, else the local file)
// Owner only (route-roles.js + re-checked here, fail closed). Every live check
// runs in parallel under a deadline; a failed or slow check becomes "Can't
// check" rows, never a 500. No token, secret or raw error body is returned.
// ?fresh=1 drops the shared 5-minute caches first (owner, rate-limited).
import fs from 'node:fs';
import path from 'node:path';
import { ENV, brands, ytChannels, state, bustCache } from '@/lib/data.mjs';
import { getUser } from '@/lib/route-auth';
import { enforceLimits } from '@/lib/rate-limit.mjs';
import { deriveBrandList } from '@/lib/brand-list.mjs';
import { readinessFor } from '@/lib/channel-readiness.mjs';
import { getDefaultWarningsStore } from '@/lib/warnings-store.mjs';
import {
  buildAccounts,
  ytStatusFromChannels,
  gatesFromState,
  withTimeout,
  checkFacebook,
  checkThreads,
  threadsTokenFrom,
} from '@/lib/accounts-health.mjs';

export const dynamic = 'force-dynamic';

const LIVE_MS = 5_000;
const YT_MS = 12_000; // ytChannels refreshes one Google token per channel, in sequence
const SETUP_MS = 8_000;

// the Threads token file lives at the repo root — readable on the PC only
function threadsFileText() {
  try {
    return fs.readFileSync(path.resolve(process.cwd(), '..', 'threads-oauth-tokens.json'), 'utf8');
  } catch {
    return '';
  }
}

async function readSetup() {
  const { registryChannels, readRepoJSON } = await import('@/lib/channels-registry');
  const [registry, file, cadence] = await Promise.all([
    registryChannels(),
    readRepoJSON('yt-mcp/studio-channels.json'),
    readRepoJSON('yt-mcp/cadence.json'),
  ]);
  return { registry: Array.isArray(registry) ? registry : [], file, cadence };
}

async function openRevoked() {
  const store = await getDefaultWarningsStore();
  if (!store) return null;
  const r = await store.listOpenByCodes({ codes: ['token_revoked'] });
  return r.ok ? r.rows : null;
}

export async function GET(req) {
  const user = await getUser(req).catch(() => null);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  if (user.role !== 'owner') return Response.json({ error: 'owner only' }, { status: 403 });

  if (new URL(req.url).searchParams.get('fresh') === '1') {
    const limited = await enforceLimits(user, [{ bucket: 'accounts-fresh', limit: 10, windowSec: 3600 }]);
    if (limited) return limited;
    bustCache();
  }

  const threadsToken = threadsTokenFrom({
    envJson: ENV.THREADS_TOKEN_JSON,
    envToken: ENV.THREADS_ACCESS_TOKEN,
    fileText: threadsFileText(),
  });

  const [setup, yt, st, warnings, fb, threads] = await Promise.all([
    withTimeout(readSetup, SETUP_MS),
    withTimeout(() => ytChannels(), YT_MS),
    withTimeout(() => state(), SETUP_MS),
    withTimeout(openRevoked, LIVE_MS),
    withTimeout(() => checkFacebook({ token: ENV.FB_PAGE_TOKEN, timeoutMs: LIVE_MS }), LIVE_MS + 1_000),
    withTimeout(() => checkThreads({ ...(threadsToken || {}), timeoutMs: LIVE_MS }), LIVE_MS + 1_000),
  ]);

  // real channels only: the same live list the sidebar uses (/api/brands)
  const registry = setup.ok ? setup.value.registry : [];
  let legacy = {};
  try { legacy = brands() || {}; } catch { legacy = {}; }
  const bySlug = new Map(registry.map((e) => [e.slug, e]));
  const channels = deriveBrandList(legacy, registry).map((c) => ({
    slug: c.slug,
    name: c.label,
    fbPageId: bySlug.get(c.slug)?.destinations?.fbPageId || null,
    threadsHandle: bySlug.get(c.slug)?.destinations?.threadsHandle || null,
  }));

  // the 'youtube' readiness item — the same rule the engine's publish gate uses;
  // an unreadable registry file is null ("can't check"), never "not connected"
  const file = setup.ok ? setup.value.file : null;
  const readiness = file && Array.isArray(file.channels)
    ? Object.fromEntries(channels.map((c) => [c.slug, readinessFor({ registry: file, cadence: setup.value.cadence || {}, slug: c.slug })]))
    : null;

  const accounts = buildAccounts({
    channels,
    readiness,
    ytStatus: yt.ok ? ytStatusFromChannels(yt.value) : null,
    openWarnings: warnings.ok ? warnings.value : null,
    fbCheck: fb.ok ? fb.value : null,
    threadsCheck: threads.ok ? threads.value : null,
    gates: st.ok ? gatesFromState(st.value, channels.map((c) => c.slug)) : null,
    now: new Date(),
  });

  return Response.json({ ok: true, accounts, fetchedAt: new Date().toISOString() });
}
