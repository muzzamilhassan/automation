// Which channels the panel's overview shows (admin-panel review 2026-11-15,
// bug #2). The old filter kept only channels with live YouTube stats, so a
// LIVE channel whose YouTube read failed (expired/revoked token) disappeared
// from /channels and /production exactly when it needed a re-login.
// Rule: show every channel that is producing (has stats) OR is flagged
// active; label its health. Dormant/parked brands (active:false, no stats)
// stay hidden as before.
export function channelHealth(c) {
  if (c?.yt?.error) return 'youtube_error';
  if (!c?.yt) return 'no_youtube_data';
  return 'ok';
}

export function selectVisibleChannels(channels = []) {
  return channels
    .filter((c) => {
      const producing = c?.yt && !c.yt.error && (c.yt.subs > 0 || c.yt.views > 0);
      return producing || c?.active === true;
    })
    .map((c) => ({ ...c, health: channelHealth(c) }));
}
