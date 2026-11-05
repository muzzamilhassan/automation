// Template PREVIEW builders (Phase C, docs/qa/template-previews-qa.md) —
// pure functions: a registry template's OWN DATA → a ~12s DocV2 sample doc.
// No script generation, no LLM: the preview IS the template — its palette,
// brand strings, layout cycle, and one line spoken in its voice.
//
//   previewTitle(meta)   the sample headline: the first exemplar title from
//                        the template's title_patterns; falls back to the id
//   previewLine(meta)    the one spoken sentence (the same title — the voice
//                        the channel would hear)
//   buildPreviewDoc(meta, beats, totalMs)  the DocV2 json: the template's
//                        theme/brand/eyebrow/badge over the PASSED beats

export function previewTitle(meta) {
  const pats = meta && typeof meta === 'object' ? meta.story_structure?.title_patterns : null;
  const first = Array.isArray(pats) && pats.length ? String(pats[0]) : '';
  const m = first.match(/"([^"]+)"/); // the exemplar title inside the quotes
  if (m && m[1]) return m[1];
  const id = meta && typeof meta === 'object' ? String(meta.template_id || '') : '';
  return id ? id.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') : 'Template Preview';
}

export function previewLine(meta) {
  return previewTitle(meta);
}

export function buildPreviewDoc(meta, beats, totalMs) {
  const pres = meta && typeof meta === 'object' && meta.doc_presentation && typeof meta.doc_presentation === 'object' ? meta.doc_presentation : {};
  const title = previewTitle(meta);
  return {
    title: `${title} — PREVIEW`,
    theme: pres.theme || 'vox',
    brand: pres.brand || '',
    eyebrow: pres.eyebrow || '',
    badge: pres.badge || '',
    progressParts: 3,
    width: 1280,
    height: 720,
    fps: 24,
    beats,
    totalMs: Math.round(totalMs),
  };
}
