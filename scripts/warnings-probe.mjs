#!/usr/bin/env node
// Thin runner over lib/warnings-probe.mjs for .github/workflows/warning-probe.yml
// (Phase 4 T4 — spec D11 / AC-P4-14). Nightly: re-test every parked channel
// with its cheap auto-verifiable probe (token_revoked = refresh + 1-unit
// channels.list); a pass auto-resolves the warning (resolved_by='probe') and
// the channel un-parks by morning. Probe activity is log-only — it never
// re-alerts (once per park EPISODE, D11).
// DB-down day: no probe enumeration is possible; ntfy still fires (the
// fallback channel) and the job exits 1 — AC-P4-5 degradation posture.
import { loadEnv } from '../lib/env.mjs';
import { sendAlert } from '../lib/ntfy-alert.mjs';

// Local runs read repo-root .env; CI injects everything via the workflow env.
// Order-safe: the Neon client is lazy-imported inside getDefaultWarningsStore,
// i.e. AFTER this line.
loadEnv();

const log = console.log;

try {
  const { getDefaultWarningsStore } = await import('../lib/warnings-store.mjs');
  const { probeParkedChannels } = await import('../lib/warnings-probe.mjs');

  const store = await getDefaultWarningsStore();
  if (!store) {
    log('[warning-probe] warnings store unavailable (no DATABASE_URL / schema failed) — cannot enumerate parked channels');
    await sendAlert({
      title: 'warning-probe: warnings store unreachable',
      text: 'Nightly warning probe could not open the warnings store (DATABASE_URL missing or Neon unreachable). Parked channels were NOT re-tested tonight — a dead channel stays parked, which is safe, but recovery waits for the next run (AC-P4-5: no rows on a dark-DB day, ntfy is the fallback).',
      issueTitle: 'warning-probe: warnings store unreachable (nightly job)',
    });
    process.exit(1);
  }

  const r = await probeParkedChannels({
    store,
    clientId: process.env.YOUTUBE_CLIENT_ID,
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
    log,
  });
  if (!r.ok) {
    log(`[warning-probe] probe run failed: ${r.error}`);
    await sendAlert({
      title: 'warning-probe: run failed',
      text: `Nightly warning probe failed to enumerate/run probes: ${r.error}. Parked channels were NOT re-tested tonight.`,
      issueTitle: 'warning-probe: run failed (nightly job)',
    });
    process.exit(1);
  }

  const resolved = r.results.filter((x) => x.resolved).length;
  const failed = r.results.filter((x) => !x.passed).length;
  log(`[warning-probe] done: ${r.openBlocking} open blocking row(s), ${r.checked} probed, ${resolved} auto-resolved, ${failed} still failing`);
  process.exit(0);
} catch (e) {
  log(`[warning-probe] unexpected runner failure: ${String(e && e.message ? e.message : e).slice(0, 160)}`);
  await sendAlert({
    title: 'warning-probe: runner crashed',
    text: `Nightly warning probe crashed before completing: ${String(e && e.message ? e.message : e).slice(0, 300)}`,
    issueTitle: 'warning-probe: runner crashed (nightly job)',
  }).catch(() => {});
  process.exit(1);
}
