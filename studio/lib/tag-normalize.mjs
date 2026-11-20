// live fix wave B2 (T4-07) — the ONE place SEO tags are cleaned. Used by the
// kit draft route (template + AI paths), the wizard draft merge, and the
// wizard's SEO-tags input. Drafted tags used to contain commas ("stoic
// quotes, timeless wisdom explained"), so the comma field split them into 18
// tags with "timeless wisdom" six times.
// Rules: split on commas, strip a leading '#', collapse spaces, trim,
// lowercase, de-duplicate, drop pieces shorter than 2 characters, drop the
// characters YouTube rejects in tags (< >), then stop at the YouTube budget.

// YouTube counts the tag field as: every tag's length, +2 for the quotes it
// adds around a tag that contains a space, +1 per comma between tags; the
// total must stay within 500. maxCount keeps the list readable — YouTube
// itself only caps characters.
export const TAG_LIMITS = Object.freeze({ maxCount: 15, maxChars: 500, minLength: 2 });

const pieces = (input) => {
  if (input == null) return [];
  const list = Array.isArray(input) ? input : [input];
  return list.flatMap((x) => String(x ?? '').split(','));
};

const cleanOne = (s) =>
  String(s)
    .replace(/[<>]/g, '')
    .replace(/^\s*#+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const costOf = (tag) => tag.length + (tag.includes(' ') ? 2 : 0);

// YouTube-style character count of a tag list.
export function tagCharCount(tags) {
  const list = Array.isArray(tags) ? tags : [];
  if (!list.length) return 0;
  return list.reduce((n, t) => n + costOf(String(t)), 0) + (list.length - 1);
}

// string | string[] | null → clean, unique, capped string[]
export function normalizeTags(input, { maxCount = TAG_LIMITS.maxCount, maxChars = TAG_LIMITS.maxChars } = {}) {
  const out = [];
  const seen = new Set();
  let used = 0;
  for (const raw of pieces(input)) {
    if (out.length >= maxCount) break;
    const tag = cleanOne(raw);
    if (tag.length < TAG_LIMITS.minLength || seen.has(tag)) continue;
    const add = costOf(tag) + (out.length ? 1 : 0);
    if (used + add > maxChars) continue; // skip, never cut a tag mid-word
    seen.add(tag);
    out.push(tag);
    used += add;
  }
  return out;
}

// The comma field the wizard's SEO-tags input shows.
export function tagsToField(input, opts) {
  return normalizeTags(input, opts).join(', ');
}
