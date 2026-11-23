// "Ask the factory" (2026-11-23) — the shared read behind /api/factory/plan
// and /api/factory/start: the SAME two engine files the autopilot reads after
// checkout (yt-mcp/studio-channels.json + yt-mcp/cadence.json, like
// /api/channels/readiness), turned into the planner's real channel list.
// Not a route (no route.js) — a helper module private to this folder.
import { readRepoJSON } from '@/lib/channels-registry';
import { REGISTRY_META } from '@/lib/template-registry.data';
import { factoryChannels } from '@/lib/factory-plan.mjs';

/** @returns {Promise<{ registry: object|null, cadence: object|null, channels: object[] }>} throws when GitHub can't be read */
export async function loadFactorySetup() {
  const [registry, cadence] = await Promise.all([
    readRepoJSON('yt-mcp/studio-channels.json'),
    readRepoJSON('yt-mcp/cadence.json'),
  ]);
  return { registry, cadence, channels: factoryChannels(registry, cadence, REGISTRY_META) };
}

/** Plain 502 for a failed read — the panel shows the reason, never a guess. */
export function setupFailed(e) {
  return Response.json(
    { error: `Couldn't read your channel setup right now (${String(e?.message || e).slice(0, 80)}). Try again in a minute.` },
    { status: 502 },
  );
}
