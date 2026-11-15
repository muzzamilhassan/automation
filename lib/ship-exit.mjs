// Exit code for a lane's ship step (audit 2026-11-13 #6). renderAndShipEpisode
// resolves to { ok, videoId } (uploaded), { claimed, videoId } (an earlier
// attempt's upload was recovered) or { skipped } (dup / intent gate) — all
// successes for the pipeline; failures throw. Anything else is a bug → 1.
export function shipExitCode(result) {
  return result && (result.ok === true || result.claimed === true || Boolean(result.skipped)) ? 0 : 1;
}
