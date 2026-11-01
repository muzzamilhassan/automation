// #106 T4b — registry-driven discovery for the crossposting + reporting lanes.
// ONE implementation of the two facts every lane needs from the studio
// registry (yt-mcp/studio-channels.json):
//
//   active-filter — a channel is in scope when its entry does not opt out
//     (active !== false — the same gate channel-autopilot.yml's discover step
//     applies; tokenSecretSaved is an autopilot-only concern, because a cache
//     restore or report fetch for a channel without data is a harmless miss).
//   envSlug — the YT_TOKEN_<ENSSLUG> secret suffix (dashes → underscores).
//
// The inline discover steps in the lane workflows (fb-now, ig-slot-poster,
// daily-sweeper, reporting-daily) mirror this logic exactly — the house
// pattern from channel-autopilot.yml is an inline `node -e` discover step.
// This module is the importable form for scripts (daily-excel-report.mjs,
// sweeper.mjs) and tests; keep the two in sync.
//
// T4b fix round 1 also hosts the SWEEPER HEAL-ROUTING split: daily-sweeper.yml
// is ONE job and a single job cannot construct secret names
// (`secrets[format('YT_TOKEN_{0}', ...)]` needs a matrix), so its env block
// maps the legacy 4's tokens literally. Registry channels WITHOUT a mapped
// token would silently never heal — healRouteFor routes those to a
// channel-autopilot.yml dispatch (channel=<slug>, topup=1), where the
// autopilot's per-channel matrix resolves the dynamic secret. Legacy
// channels keep the in-process env path (and today's warn-and-skip when
// their token is absent).
import fs from 'node:fs';

// quote-quarry -> QUOTE_QUARRY : the secret-name convention every lane shares.
export function envSlugFor(slug) {
  return String(slug || '').toUpperCase().replace(/-/g, '_');
}

export function loadRegistryChannels(registryPath = 'yt-mcp/studio-channels.json') {
  try {
    const reg = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    return reg.channels || [];
  } catch {
    return []; // unreadable registry = empty lane, never a crash
  }
}

// Pure filter+shape over raw registry entries: active channels in registry
// order, carrying the fields the lanes need (display label, YT handle, secret
// suffix). Malformed entries are dropped, not fatal.
export function activeRegistryChannels(entries) {
  return (entries || [])
    .filter((c) => c && c.slug && c.active !== false)
    .map((c) => ({
      slug: c.slug,
      label: c.label || c.slug,
      handle: c.handle || '',
      envSlug: envSlugFor(c.slug),
    }));
}

// 'in-process' — the sweeper heals the channel itself (a local token exists
// via env or token file; or a legacy channel, whose absent token keeps
// today's warn-and-skip inside the sweep).
// 'dispatch'   — no local token: heal by dispatching channel-autopilot.yml
// (channel=<slug>, topup=1); dedupe with shouldDispatchHealToday so a dead
// secret cannot spam dispatches all night.
// 'none'       — not registry-active: out of scope entirely.
export function healRouteFor(slug, { legacySlugs = [], hasLocalToken = false, registryActive = true } = {}) {
  if (hasLocalToken) return 'in-process';
  if (!registryActive) return 'none';
  if ((legacySlugs || []).includes(slug)) return 'in-process';
  return 'dispatch';
}

// One heal-dispatch per channel per day — `seen` is the persisted
// { slug: lastDispatchDate } map (yt-mcp/state/heal-dispatches.json,
// committed with the sweeper's logs).
export function shouldDispatchHealToday(seen, slug, today) {
  return !(seen && seen[slug] === today);
}
