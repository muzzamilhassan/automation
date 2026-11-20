// #125 (S-12 sweep) — the pure core of the live brand list. The /api/brands
// route wires real sources (brands.json + registry); this module holds the
// testable rules:
//   legacy-first union, dedup by SLUG (live fix wave A2, T4-11: the old
//   extra de-dupe by label hid a real second channel that shared a name),
//   dormant (active: false) legacy brands stay hidden, short DERIVED from
//   the label (never stored in code).
export function deriveBrandList(legacy, registry) {
  const out = [];
  const seenSlug = new Set();
  const push = (slug, label, accent) => {
    const s = String(slug || '');
    if (!s || seenSlug.has(s)) return;
    const lab = String(label || s);
    seenSlug.add(s);
    out.push({
      slug: s,
      label: lab,
      short: (lab || s).slice(0, 2).toUpperCase(),
      accent: accent || '#38BDF8',
    });
  };
  for (const [slug, k] of Object.entries(legacy || {})) {
    if (k?.active === false) continue; // dormant brands stay hidden
    push(slug, k?.label, k?.accent);
  }
  for (const e of registry || []) {
    push(e.slug, e.label, e.accent);
  }
  return out;
}

// T4-11: the channel (other than selfSlug) already using this name, compared
// case-insensitively with outer spaces ignored; null when the name is free.
export function findLabelClash(label, channels, selfSlug = '') {
  const want = String(label || '').trim().toLowerCase();
  if (!want) return null;
  return (channels || []).find((c) => c && c.slug !== selfSlug && String(c.label || '').trim().toLowerCase() === want) || null;
}
