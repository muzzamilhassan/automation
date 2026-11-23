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

// An authoring instruction, not viewer-facing content: older templates write
// their beats as slot directions ("slot 1 states the popular money myth…").
// 2026-11-23: the preview printed these ON SCREEN and spoke them aloud.
export function isAuthoringNote(s) {
  return /^\s*slot\s*\d/i.test(String(s || ''));
}

const BEAT_PREFIX = /^(Opening|Evidence(?: at #?\d+)?|Mechanism|Payoff|Rule \w+|Exhibit \w+):\s*/i;

// The preview's viewer-facing lines: real sample beats first; when the beats
// are authoring notes, the template's own exemplar titles (the quoted strings
// in title_patterns) stand in; generic lines only as a last resort.
export function previewLines(meta) {
  const ss = (meta && typeof meta === 'object' && meta.story_structure) || {};
  const beats = (Array.isArray(ss.beats) ? ss.beats : [])
    .filter((b) => !isAuthoringNote(b))
    .map((b) => String(b).replace(BEAT_PREFIX, '').trim())
    .filter(Boolean);
  const exemplars = (Array.isArray(ss.title_patterns) ? ss.title_patterns : [])
    .map((p) => (String(p).match(/"([^"]+)"/) || [])[1] || (/"/.test(String(p)) ? '' : String(p)))
    .map((t) => t.trim())
    .filter(Boolean);
  const title = previewTitle(meta);
  const others = exemplars.filter((t) => t !== title);
  return {
    hook: beats[0] || others[0] || title,
    photoLine: beats[1] || others[1] || 'Every principle is backed by documented evidence and real practice.',
    sub: beats[2] || undefined,
    videoLine: beats[2] || beats[3] || others[2] || 'Consistency and disciplined execution create compounding results.',
  };
}

// [whole-word alternatives, stock query] — first match wins.
const VISUAL_RULES = [
  ['receipts?|grocery|groceries|audit|wallet|shopping|prices?', 'grocery supermarket receipt shopping'],
  ['sleep|circadian|insomnia|recovery|overnight|memory|night', 'deep sleep night bedroom alarm clock'],
  ['old money|luxury|quiet rule|tailor|suits?|wealth|heirloom', 'bespoke luxury suit tailoring quiet luxury'],
  ['training|gym|lift|deadlift|barbell|workout|muscle|fitness|athlete', 'barbell gym strength workout athlete'],
  ['ai|artificial intelligence|recruiters?|algorithms?|data center|servers?|silicon', 'data center server artificial intelligence coding'],
  ['tax|taxes|bakery|small business|deductions?|irs', 'bakery kitchen commercial bakery accounting'],
  ['seneca|marcus aurelius|stoic|stoics|wisdom|letters?|quill|verses?', 'ancient roman statue marble library writing journal'],
  ['focus|52/17|pomodoro|multitasking|switchboard|operators?', 'deep work focus desk stopwatch typing'],
  ['empires?|mountain pass|river crossing|army|armies|battles?|war|banners?|kingdoms?', 'ancient mountain fortress mist castle'],
  ['emergency fund|savings|no-spend|challenge|piggy bank|dollars?|budget', 'piggy bank cash savings budgeting money'],
];

// High-precision semantic query extractor for 95%-100% matched visuals.
// WHOLE WORDS only (2026-11-23): a bare /ai/ matched "mountain", "explained",
// "chain", "paid" — a medieval-atlas template got an AI code screenshot.
export function extractVisualQuery(meta, title = '', hook = '') {
  const combined = `${meta?.template_id || ''} ${title} ${hook} ${(meta?.niches || []).join(' ')}`.toLowerCase();
  for (const [words, query] of VISUAL_RULES) {
    if (new RegExp(`\\b(?:${words})\\b`, 'i').test(combined)) return query;
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
