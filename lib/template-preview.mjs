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

// High-precision semantic query extractor for 95%-100% matched visuals
export function extractVisualQuery(meta, title = '', hook = '') {
  const combined = `${meta?.template_id || ''} ${title} ${hook} ${(meta?.niches || []).join(' ')}`.toLowerCase();

  if (/receipt|grocery|audit|wallet|shopping|price/i.test(combined)) {
    return 'grocery supermarket receipt shopping';
  }
  if (/sleep|circadian|insomnia|recovery|overnight|memory|night/i.test(combined)) {
    return 'deep sleep night bedroom alarm clock';
  }
  if (/old money|luxury|quiet rule|tailor|suit|wealth|heirloom/i.test(combined)) {
    return 'bespoke luxury suit tailoring quiet luxury';
  }
  if (/training|gym|lift|deadlift|barbell|workout|muscle|fitness|athlete/i.test(combined)) {
    return 'barbell gym strength workout athlete';
  }
  if (/ai|artificial intelligence|recruiter|algorithm|data center|server|silicon/i.test(combined)) {
    return 'data center server artificial intelligence coding';
  }
  if (/tax|bakery|small business|deduction|irs|irs election/i.test(combined)) {
    return 'bakery kitchen commercial bakery accounting';
  }
  if (/seneca|marcus aurelius|stoic|wisdom|prompt|letter|quill/i.test(combined)) {
    return 'ancient roman statue marble library writing journal';
  }
  if (/focus|52\/17|pomodoro|multitasking|switchboard|operator/i.test(combined)) {
    return 'deep work focus desk stopwatch typing';
  }
  if (/empire|mountain pass|river crossing|army|battle|war/i.test(combined)) {
    return 'ancient mountain fortress mist castle';
  }
  if (/emergency fund|savings|no-spend|challenge|piggy bank|dollar|budget/i.test(combined)) {
    return 'piggy bank cash savings budgeting money';
  }

  // Fallback: extract strong content nouns from title
  const nouns = (title || '')
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !/^(what|when|where|which|really|finds|every|most|this|that|your|with|from|than|into)$/i.test(w))
    .slice(0, 3)
    .join(' ');
  return (nouns || meta?.niches?.[0] || 'cinematic documentary').toLowerCase();
}

export function buildPreviewDoc(meta, beats, totalMs) {
  const pres = meta && typeof meta === 'object' && meta.doc_presentation && typeof meta.doc_presentation === 'object' ? meta.doc_presentation : {};
  const title = previewTitle(meta);
  return {
    title: `${title} — PREVIEW`,
    theme: pres.theme || 'vox',
    style: pres.style || undefined, // the template FAMILY — undefined = engine layouts
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
