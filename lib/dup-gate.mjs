// 10-05 DUPLICATE TITLE GATE — the mass near-duplicate uploads ("Stop Begging
// For Respect" 4x in 5 days, "Conquer Yourself First" 3x in one day) are the
// #1 "inauthentic/mass-produced content" signal, and the Oct-1 feed collapse
// hit ALL 4 channels the same day (research/qq-view-collapse-diagnosis… was
// recorded in session; state kept only the LAST run's titles, so cross-day
// dupes were invisible). This module gives every producer the same checks:
//   normTitle          — strips " | suffix", punctuation, stopwords, digits
//   isDupTitle(a, b)   — exact / containment / token-Jaccard >= 0.6
//   recentUploadTitles — last ~45 upload titles straight from YouTube (the
//                        state file can be stale or days thin — live wins)
//   findDup            — first conflicting title, or null

const STOP = new Set(['a','an','the','your','you','for','of','to','now','this','that','these','those','is','are','be','it','its']);

export function normTitle(s) {
  return String(s || '')
    .split('|')[0] // drop " | Stoicism Philosophy" style suffixes — every title shares one
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b\d+\b/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .join(' ');
}

export function isDupTitle(a, b) {
  const A = normTitle(a);
  const B = normTitle(b);
  if (!A || !B) return false;
  if (A === B) return true;
  if (A.includes(B) || B.includes(A)) return true;
  const ta = new Set(A.split(' '));
  const tb = new Set(B.split(' '));
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  const union = new Set([...ta, ...tb]).size;
  return union > 0 && inter / union >= 0.6;
}

// yt = a google.youtube v3 client already authed for the channel.
export async function recentUploadTitles(yt, { max = 45 } = {}) {
  try {
    const ch = await yt.channels.list({ part: 'contentDetails', mine: true });
    const up = ch.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!up) return [];
    const pi = await yt.playlistItems.list({ part: 'snippet', maxResults: max, playlistId: up });
    return (pi.data.items || []).map((i) => i.snippet?.title || '').filter(Boolean);
  } catch (e) {
    console.log(`  [dup-gate] live titles unavailable: ${String(e.message).slice(0, 60)}`);
    return [];
  }
}

// history = [{t, at}] from state.titleHistory (+ any plain strings). Returns
// the first existing title this one collides with, or null.
export function findDup(title, history = [], also = []) {
  for (const h of [...also, ...history]) {
    const t = typeof h === 'string' ? h : h?.t;
    if (t && isDupTitle(t, title)) return t;
  }
  return null;
}
