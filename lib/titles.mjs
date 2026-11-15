// YouTube video titles: hard limit 100 characters. Doc titles append the
// channel authority ("… | Market Wisdom"); the old `.slice(0, 95)` cut words
// in half on the live channel. Keep the suffix only when it fits; otherwise
// drop it; an over-long title is trimmed at a word boundary with "…".
export const YT_TITLE_MAX = 100;

export function trimToWords(text, max = YT_TITLE_MAX) {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > max * 0.5 ? cut.slice(0, at) : cut).replace(/[\s,;:|–—-]+$/, '')}…`;
}

export function docTitleFor(title, authority, max = YT_TITLE_MAX) {
  const t = String(title || '').trim();
  const a = String(authority || '').trim();
  if (a && `${t} | ${a}`.length <= max) return `${t} | ${a}`;
  return trimToWords(t, max);
}
