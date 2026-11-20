// Live fix wave C1 (T1-28, T4-19) — how the panel SHOWS a channel's name.
// Stored labels mix ALL CAPS ("THE MONEY RULEBOOK") and Mixed Case
// ("Debt-Free Doctrine"), and the derived short code was just the first two
// letters ("TH"). Display only — the stored label is never changed.
//   channelDisplayName  ALL CAPS label → Title Case; anything else as stored
//   channelInitials     first letters of the first two significant words
//                       ("The", "of", "and" … skipped): MR, QQ, IC, DF
//   displayChannel      a /api/brands row with both applied
//   isKnownChannelSlug  does /channels/<slug> belong to a real channel?
// Pure, no imports (plain `node --test` loads it). Spec + QA:
// docs/qa/live-fix-wave-c1-qa.md.

// Joining words: lower-case inside a Title Case name, skipped for initials.
const SMALL = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'for', 'to', 'in', 'on', 'at', 'by']);

const clean = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

function isAllCaps(s) {
  return /[A-Z]/.test(s) && !/[a-z]/.test(s);
}

// "DEBT-FREE" → "Debt-Free", "INVESTOR'S" → "Investor's"
function titleWord(word, first) {
  const lower = word.toLowerCase();
  if (!first && SMALL.has(lower)) return lower;
  return lower.replace(/(^|-)([a-z])/g, (_, sep, c) => sep + c.toUpperCase());
}

export function channelDisplayName(label, slug = '') {
  const s = clean(label);
  if (!s) return clean(slug);
  if (!isAllCaps(s)) return s;
  // Short-token labels are acronyms/handles ("YT-BOT", "AI OS") — keep them as
  // typed. Only labels with a real word (4+ letters) are shouted names.
  if (!s.split(/[\s\-_]+/).some((w) => w.replace(/[^\p{L}]/gu, '').length >= 4)) return s;
  return s.split(' ').map((w, i) => titleWord(w, i === 0)).join(' ');
}

function words(s) {
  return s
    .replace(/([a-z])([A-Z])/g, '$1 $2') // QuoteQuarry → Quote Quarry
    .split(/[\s\-_]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
}

export function channelInitials(label, slug = '') {
  const all = words(clean(label) || clean(slug));
  if (!all.length) return '';
  const significant = all.filter((w) => !SMALL.has(w.toLowerCase()));
  const pick = significant.length ? significant : all;
  if (pick.length === 1) return pick[0].slice(0, 2).toUpperCase();
  return (pick[0][0] + pick[1][0]).toUpperCase();
}

export function displayChannel(row) {
  if (!row || typeof row !== 'object') return null;
  return { ...row, label: channelDisplayName(row.label, row.slug), short: channelInitials(row.label, row.slug) };
}

// T1-24: a channel page exists for every brands.json slug (dormant ones too)
// and every registry entry (parked/paused too) — the same universe the
// overview and the channel page read. Own keys only (no "__proto__").
export function isKnownChannelSlug(slug, legacy, registry) {
  if (typeof slug !== 'string' || !slug) return false;
  if (legacy && typeof legacy === 'object' && Object.hasOwn(legacy, slug)) return true;
  return Array.isArray(registry) && registry.some((e) => e && e.slug === slug);
}
