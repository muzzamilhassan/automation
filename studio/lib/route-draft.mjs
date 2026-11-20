// Live fix wave A1 (T3-11) — AI routing edits are a local DRAFT until the
// owner presses Save. Pure helpers (no '@/' imports) used by
// components/ProviderRoutingPanel.js:
//   chainIdsFor   saved routes → provider ids for one layer + capability
//   moveInDraft   swap a provider with its neighbour (copy, never mutates)
//   planChainSave saved rows + draft order → the minimal POST list
//   sameOrder     is the draft different from what is saved?

export const PRIORITY_STEP = 100;

// channelId null = the workspace default layer
export function chainIdsFor(routes, capability, channelId) {
  return (Array.isArray(routes) ? routes : [])
    .filter((r) => r && r.capability === capability && (channelId ? r.channel_id === channelId : r.channel_id === null))
    .sort((a, b) => a.priority - b.priority)
    .map((r) => r.provider_id);
}

export function moveInDraft(ids, idx, dir) {
  const out = [...ids];
  const swap = idx + dir;
  if (idx < 0 || idx >= out.length || swap < 0 || swap >= out.length) return out;
  [out[idx], out[swap]] = [out[swap], out[idx]];
  return out;
}

export function sameOrder(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// savedRows: [{ provider_id, priority }] for ONE layer + capability.
// Draft position i gets priority (i+1)*step; only rows whose priority changes
// (or are new) are written; rows dropped from the draft are deactivated.
export function planChainSave(savedRows, draftIds, step = PRIORITY_STEP) {
  const saved = new Map((savedRows || []).map((r) => [r.provider_id, r.priority]));
  const ops = [];
  draftIds.forEach((providerId, i) => {
    const priority = (i + 1) * step;
    if (saved.get(providerId) !== priority) ops.push({ action: 'set-route', providerId, priority });
  });
  const keep = new Set(draftIds);
  for (const providerId of saved.keys()) {
    if (!keep.has(providerId)) ops.push({ action: 'deactivate-route', providerId });
  }
  return ops;
}
