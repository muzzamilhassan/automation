// Video Templates gallery — the pure merge/dedupe/filter core behind
// app/templates/page.js. Framework-free and import-free so node --test can
// pin it (tests/templates-gallery.test.mjs).
//
// Inputs are all live data, never hand-written lists:
//   catalog            — TEMPLATES_DATA (the visual families)
//   registryTemplates  — /api/templates `templates` (validated registry view)
//   samples            — /api/template-previews `samples` (CI-rendered media)
//
// Honesty rule: a card only ever shows ITS OWN rendered preview. A family's
// latest sample is NOT borrowed for a sibling template — a storybook card must
// never play some other template's video. No own render → `preview: null` and
// the UI says "Preview not rendered yet".

const RATIO_FOR_FORMAT = { long: '16:9', short: '9:16' };
const RATIO_ORDER = ['16:9', '9:16'];

// Engine render modes (story_structure.doc_render) → plain names. Engine
// vocabulary, not brand data; an unknown mode falls back to its own id.
const RENDER_KIND_LABELS = {
  storybook: 'Storybook documentary',
  diagram: 'Animated diagram',
};

const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === 'string' ? v : '');

export function ratiosForFormats(formats) {
  const out = new Set(arr(formats).map((f) => RATIO_FOR_FORMAT[f]).filter(Boolean));
  return RATIO_ORDER.filter((r) => out.has(r));
}

// "mr-case-files-storybook" → "MR Case Files Storybook". Short tokens (mr, ai)
// read as acronyms.
export function humanizeId(id) {
  return str(id)
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

// "en-GB-RyanNeural" → "Ryan (en-GB)"; anything else passes through.
export function voiceLabel(voice) {
  const m = /^([a-z]{2}-[A-Z]{2})-([A-Za-z]+?)(?:Neural)?$/.exec(str(voice));
  return m ? `${m[2]} (${m[1]})` : str(voice);
}

// "cold_open" → "Cold open"; "chapters:10" → "10 chapters".
export function sectionLabel(section) {
  const s = str(section);
  const ch = /^chapters:(\d+)$/.exec(s);
  if (ch) return `${ch[1]} chapters`;
  const words = s.replace(/[_:]+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : '';
}

// The template's OWN rendered preview. Drafts approved through the Drafts
// Inbox keep their render under `draft-<id>` (the media route resolves both).
export function previewFor(id, samples) {
  const pick = (s) => (s && typeof s === 'object' && (s.mp4 || s.poster)
    ? { mp4: s.mp4 || null, poster: s.poster || null, renderedAt: s.renderedAt || null }
    : null);
  const map = samples && typeof samples === 'object' ? samples : {};
  return pick(map[id]) || pick(map[`draft-${id}`]);
}

export function createHref(id) {
  return `/create?template=${encodeURIComponent(str(id))}`;
}

export function registryDetailHref(id) {
  return `/templates/registry/detail?template=${encodeURIComponent(str(id))}`;
}

export function majorOf(version) {
  const n = parseInt(String(version || '').split('.')[0], 10);
  return Number.isInteger(n) ? n : null;
}

function categoryLabel(id, categories) {
  const hit = arr(categories).find((c) => c && c.id === id);
  return hit?.label || humanizeId(id);
}

function fromRegistry(t, catalogEntry, categories, samples) {
  const reg = t.registry || {};
  const ss = reg.story_structure || {};
  const dp = reg.doc_presentation || {};
  const isFamilyItself = t.templateId === (t.family || t.templateId);
  const renderKind = str(ss.doc_render);
  const kind = renderKind || str(catalogEntry?.category) || 'other';
  const kindLabel = renderKind
    ? (RENDER_KIND_LABELS[renderKind] || humanizeId(renderKind))
    : categoryLabel(kind, categories);
  const niches = arr(reg.niches);
  const ratios = ratiosForFormats(reg.formats);
  // Description: the template's own words first; the family blurb only when
  // the template IS that family; else a plain sentence built from its data.
  const description = str(ss.format_description)
    || (isFamilyItself ? str(catalogEntry?.desc) : '')
    || `${kindLabel} template${niches.length ? ` for ${niches[0]}${niches.length > 1 ? ` and ${niches.length - 1} more niche${niches.length > 2 ? 's' : ''}` : ''}` : ''}.`;
  return {
    id: t.templateId,
    name: isFamilyItself ? (str(catalogEntry?.name) || str(t.name) || humanizeId(t.templateId)) : humanizeId(t.templateId),
    description,
    usedFor: isFamilyItself ? str(catalogEntry?.usedFor) : '',
    kind,
    kindLabel,
    family: t.family || t.templateId,
    familyName: str(catalogEntry?.name) || str(t.name),
    niches,
    formats: arr(reg.formats),
    ratios: ratios.length ? ratios : arr(catalogEntry?.aspectRatios),
    assignable: true,
    deprecated: reg.deprecated === true,
    version: str(reg.version),
    preview: previewFor(t.templateId, samples),
    structure: {
      formatLabel: str(ss.format_label),
      sections: arr(ss.sections),
      chapterMinWords: Number.isFinite(ss.chapter_min_words) ? ss.chapter_min_words : null,
      beats: arr(ss.beats),
      hookClasses: arr(ss.hook_classes),
      titlePatterns: arr(ss.title_patterns),
      payoffRule: str(ss.payoff_rule),
    },
    look: {
      voice: str(dp.voice),
      musicMood: str(dp.music_mood),
      theme: str(dp.theme),
      style: str(dp.style),
      layouts: arr(dp.doc_layouts),
      variants: isFamilyItself ? arr(catalogEntry?.variants) : [],
    },
    capabilities: arr(reg.required_capabilities),
    safety: {
      sources: reg.safety?.required_sources === true,
      review: arr(reg.safety?.review_required),
      disclaimers: arr(reg.safety?.disclaimers),
    },
  };
}

function fromCatalog(c, categories, samples) {
  return {
    id: c.id,
    name: str(c.name) || humanizeId(c.id),
    description: str(c.desc),
    usedFor: str(c.usedFor),
    kind: str(c.category) || 'other',
    kindLabel: categoryLabel(c.category, categories),
    family: c.family || c.id,
    familyName: str(c.name),
    niches: [],
    formats: [],
    ratios: arr(c.aspectRatios),
    // no registry metadata → the validator would refuse it; never offer assign
    assignable: false,
    deprecated: false,
    version: '',
    preview: previewFor(c.id, samples),
    structure: { formatLabel: '', sections: [], chapterMinWords: null, beats: [], hookClasses: [], titlePatterns: [], payoffRule: '' },
    look: { voice: '', musicMood: '', theme: str(c.previewTheme), style: '', layouts: [], variants: arr(c.variants) },
    capabilities: [],
    safety: { sources: false, review: [], disclaimers: [] },
  };
}

// One deduped list: every registry template (registry wins), plus each
// catalog family that has no registry entry of its own. Ready previews
// first, then A→Z, so the page opens on real footage.
export function buildGallery({ catalog, registryTemplates, samples, categories } = {}) {
  const families = arr(catalog).filter((c) => c && typeof c === 'object' && c.id);
  const byFamily = new Map(families.map((c) => [c.family || c.id, c]));
  const seen = new Set();
  const items = [];
  for (const t of arr(registryTemplates)) {
    if (!t || !t.templateId || seen.has(t.templateId)) continue;
    seen.add(t.templateId);
    items.push(fromRegistry(t, byFamily.get(t.family || t.templateId), categories, samples));
  }
  for (const c of families) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    items.push(fromCatalog(c, categories, samples));
  }
  const rank = (it) => (it.preview?.mp4 ? 0 : it.preview?.poster ? 1 : 2);
  return items.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

// Filter options built from the items themselves (counts are real).
export function galleryFacets(items) {
  const kinds = new Map();
  const niches = new Map();
  for (const it of arr(items)) {
    const k = kinds.get(it.kind) || { id: it.kind, label: it.kindLabel, count: 0 };
    k.count += 1;
    kinds.set(it.kind, k);
    for (const n of it.niches) niches.set(n, (niches.get(n) || 0) + 1);
  }
  return {
    kinds: [...kinds.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    niches: [...niches.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => a.id.localeCompare(b.id)),
    withPreview: arr(items).filter((it) => it.preview?.mp4 || it.preview?.poster).length,
  };
}

export function filterGallery(items, { kind = 'all', ratio = 'all', niche = 'all', query = '' } = {}) {
  const q = str(query).trim().toLowerCase();
  return arr(items).filter((it) => {
    if (kind !== 'all' && it.kind !== kind) return false;
    if (ratio !== 'all' && !it.ratios.includes(ratio)) return false;
    if (niche !== 'all' && !it.niches.includes(niche)) return false;
    if (!q) return true;
    const hay = [it.name, it.id, it.description, it.usedFor, it.kindLabel, ...it.niches].join(' ').toLowerCase();
    return hay.includes(q);
  });
}
