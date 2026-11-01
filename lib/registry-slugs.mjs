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
// This module is the importable form for scripts (daily-excel-report.mjs)
// and tests; keep the two in sync.
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
