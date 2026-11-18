// #125 (S-12 sweep) — the pure core of the live brand list. The /api/brands
// route wires real sources (brands.json + registry); this module holds the
// testable rules:
//   legacy-first union, dedup by slug AND lowercase label (the overview
//   route's own rule), dormant (active: false) legacy brands stay hidden,
//   short DERIVED from the label (never stored in code).
export function deriveBrandList(legacy, registry) {
  const out = [];
  const seenSlug = new Set();
  const seenLabel = new Set();
  const push = (slug, label, accent) => {
    const s = String(slug || '');
    if (!s || seenSlug.has(s)) return;
    const lab = String(label || s);
    if (seenLabel.has(lab.toLowerCase())) return;
    seenSlug.add(s);
    seenLabel.add(lab.toLowerCase());
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
