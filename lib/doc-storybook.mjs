// Storybook doc-lane adapter (spec docs/superpowers/specs/2026-11-04-storybook-doc-lane-spec.md)
// — the doc lane's STORYBOOK visual layer as pure, importable functions
// (yt-deepdive.mjs executes top-level code, so its logic lives in lib/ for the
// suite — the lib/doc-template.mjs / lib/doc-frames.mjs pattern).
//
// The owner's wanted look (research/storybook-doc-template-2026-11-04.md, the
// BFCa-bRy-3M reference) is ALREADY the DocV2 "vox" engine
// (explainer/remotion/longscenes2.tsx): cream paper, red letterspaced kicker,
// dashed progress track, ghost-numeral chapter dividers, alternating rounded
// photo cards with serif excerpts, salmon-box karaoke captions on real word
// timings. So there is NO new renderer here — this module plans the DOC JSON
// that yt-deepdive renders through `npx remotion render DocV2` when — and only
// when — the assigned template's story_structure declares
// `doc_render: 'storybook'` (template DATA; no-static-maps: any channel's
// template can opt in with zero code changes).
//
//   docRenderOf        the DATA read: 'storybook' or null (null = legacy
//                      b-roll lane, byte-identical)
//   docPresentation    brand/eyebrow/badge strings — the template's
//                      doc_presentation block wins, the kit label/eyebrow and
//                      the label initials fall back
//   edgeVoiceFor       a real Edge-TTS voice for edge_batch.py (the kit voice
//                      when Edge-shaped, else en-US-AndrewNeural — kokoro ids
//                      like bm_daniel are NOT edge voices and would fail every
//                      beat; karaoke needs edge_batch's REAL WordBoundary
//                      timings, which is also why narrate.py (per-call Kokoro
//                      reload, ESTIMATED word lengths) is never used here)
//   buildStorybookBeats  script {title,intro,chapters[],outro} -> DocV2 beats:
//                      hero -> per chapter a divider then one split slide per
//                      sentence -> end (the reference's structure)
//   timeBeats          make-longform's proven pacing (800ms lead-in, spoken
//                      beats max(spoken+600,3000), dividers 3500, end 4000,
//                      1500 tail) + per-beat audio binding + caption words
//                      {w,t0,t1} in ms
//   buildStorybookDoc  the DocV2 doc json (vox theme + presentation +
//                      progressParts = one dash per chapter)
//   storybookPhotoGate the #106 fail-closed doctrine for the photo lane: zero
//                      photos across the slides is systemic — refuse before
//                      render spend; partial coverage degrades to text-only
//                      slides and ships
//   photoQueryFor      portrait stock query: chapter subject + rotating kit
//                      niche words (cleaned, capped)
//   srtFromBeats       the episode SRT from the beat word timings through the
//                      shared cuesFromWords/toSrt (the clips-first lane parses
//                      the same format unchanged)
import { cuesFromWords, toSrt } from './srt.mjs';

const EDGE_VOICE_SHAPE = /^[a-z]{2}-[A-Z]{2}-[A-Za-z0-9]+Neural$/;
const EDGE_VOICE_FALLBACK = 'en-US-AndrewNeural'; // the voice make-longform proves on this exact engine

export function docRenderOf(meta) {
  const story = meta && typeof meta === 'object' && !Array.isArray(meta) ? meta.story_structure : null;
  const v = story && typeof story === 'object' && !Array.isArray(story) ? story.doc_render : null;
  return v === 'storybook' ? 'storybook' : null;
}

export function docPresentation(meta, kit) {
  const block = meta && typeof meta === 'object' && !Array.isArray(meta) ? meta.doc_presentation : null;
  const pick = (k, fb) => (block && typeof block === 'object' && String(block[k] || '').trim()) || String(fb || '').trim();
  const label = pick('brand', kit && kit.label);
  return {
    brand: label,
    eyebrow: pick('eyebrow', kit && kit.eyebrow),
    badge: pick('badge', String(label || '').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 3).toUpperCase()),
    // step 3/5 seams: the named DocV2 palette, the sentence-slide layout
    // cycle, and the P4 voice/music mood ride the presentation block too.
    // Undefined = the defaults (vox / all-split / kit voice / channel pool) —
    // templates without the fields render byte-identically.
    theme: block && typeof block === 'object' && String(block.theme || '').trim() || undefined,
    docLayouts: block && typeof block === 'object' && Array.isArray(block.doc_layouts) ? block.doc_layouts.filter((x) => typeof x === 'string' && x) : undefined,
    voice: block && typeof block === 'object' && String(block.voice || '').trim() || undefined,
    musicMood: block && typeof block === 'object' && String(block.music_mood || '').trim() || undefined,
  };
}

export function edgeVoiceFor(voice) {
  const v = String(voice || '').trim();
  return EDGE_VOICE_SHAPE.test(v) ? v : EDGE_VOICE_FALLBACK;
}

// The sentence splitter — the same boundary rule make-longform plans beats with.
export function sentences(text) {
  return String(text || '').split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
}

export function buildStorybookBeats(script, opts = {}) {
  const followLine = opts.followLine || 'Follow for more stories.';
  // R3 (doc-layouts-qa): opts.docLayouts rotates the sentence slides through a
  // declared cycle (template DATA). Structural layouts (hero/chapter/end) are
  // excluded from the cycle. Absent = every sentence slide is a plain split,
  // byte-identically.
  const cycle = (Array.isArray(opts.docLayouts) ? opts.docLayouts : [])
    .filter((x) => typeof x === 'string' && x && !['hero', 'chapter', 'end'].includes(x));
  const layoutFor = (k) => (cycle.length ? cycle[k % cycle.length] : 'split');
  const beats = [];
  const push = (b) => { b.i = beats.length; beats.push(b); };
  const intro = String(script.intro || '').trim();
  push({ layout: 'hero', kicker: '', headline: String(script.title || '').trim(), sub: sentences(intro)[0] || '', text: intro });
  (Array.isArray(script.chapters) ? script.chapters : []).forEach((ch, ci) => {
    push({ layout: 'chapter', n: ci + 1, chapterTitle: String(ch.title || '').trim(), text: '' });
    let k = 0;
    for (const snt of sentences(ch.text)) {
      push({ layout: layoutFor(k++), n: ci + 1, chapterTitle: String(ch.title || '').trim(), headline: snt, text: snt });
    }
  });
  push({ layout: 'end', headline: followLine, text: String(script.outro || '').trim() });
  return beats;
}

// durs: iterable of {i, ms, words:[{w,s,d}]} (edge_batch's tts-durations.json);
// audioFor: (i) => public-relative mp3 path or null (existence checked by the
// caller — this stays pure). Mutates beats with ms/startMs/audio/words and
// returns { beats, totalMs }.
export function timeBeats(beats, durs, audioFor) {
  const durByI = new Map((durs || []).map((d) => [d.i, d]));
  const buildWords = (ws) => (ws || []).map((w) => ({ w: w.w, t0: Math.round(w.s * 1000), t1: Math.round((w.s + w.d) * 1000) }));
  let cursor = 800;
  for (const b of beats) {
    const d = durByI.get(b.i);
    const spokenMs = d ? Math.max(d.ms || 0, 0) : 0;
    b.ms = b.layout === 'end' ? 4000 : b.layout === 'chapter' ? 3500 : Math.max(Math.round(spokenMs) + 600, 3000);
    b.startMs = Math.round(cursor);
    b.audio = audioFor ? audioFor(b.i) : null;
    b.words = buildWords(d && d.words);
    cursor += b.ms;
  }
  return { beats, totalMs: Math.round(cursor + 1500) };
}

export function buildStorybookDoc({ title, presentation, beats, totalMs, music = null, progressParts = 0 }) {
  return {
    title: String(title || '').trim(),
    // The look is template DATA: doc_presentation.theme names a DocV2 palette
    // ('vox' | 'history' | 'wisdom' | 'science' — longscenes2 THEMES). Absent =
    // 'vox', the original storybook palette (cream/red/Playfair) — templates
    // without the field render byte-identically (default-inert).
    theme: presentation.theme || 'vox',
    brand: presentation.brand,
    eyebrow: presentation.eyebrow,
    badge: presentation.badge,
    progressParts,
    ...(music ? { music } : {}), // no track = no key (DocV2 renders the silent bed)
    width: 1920,
    height: 1080,
    fps: 24,
    beats,
    totalMs,
  };
}

// ---- step 4: the word-timed stat directives (the Hassan planner, v1) ----
// Deterministic v1 (docs/qa/storybook-directives-qa.md): every number the
// narration SPEAKS is a number the viewer should SEE. A beat whose spoken
// words contain a stat token ($65 billion, 70%, 1920, 3,000,000, 1.5 million)
// gets `pop = { kind: 'stat', text, w }` — w = the word index, so the DocV2
// chip fires at that word's exact timing — and the word is flagged key. The
// LLM enrichment seam (entities/logos/keyphrases beyond numbers) is a later
// slice; numbers need no model.
const STAT_RE = /(?:[$€£]\s?\d[\d,.]*|\d[\d,.]*\s?%|\b\d{4}\b|\b\d{1,3}(?:,\d{3})+\b|\b\d+(?:[.,]\d+)?\s?(?:billion|million|trillion|thousand)\b)/i;

export function planStoryDirectives(beats) {
  let pops = 0;
  for (const b of beats) {
    const words = Array.isArray(b.words) ? b.words : [];
    if (!words.length) continue;
    const idx = words.findIndex((w) => STAT_RE.test(String(w.w || '')));
    if (idx < 0) continue;
    b.pop = { kind: 'stat', text: String(words[idx].w), w: idx };
    words[idx].key = true;
    pops++;
  }
  return { beats, pops };
}

// ---- step 5: entity pops — the name fires on the word it's spoken on ----
// Deterministic v1: proper-noun detection (capitalized token groups, never
// sentence-initial, ≥3 letters, not acronyms-of-1). Fills beats the stat pass
// left open (R7: stat wins). The LLM + brand-logo-domain upgrade is a later
// slice; a name chip needs no model and no network.
const NOT_ENTITY = new Set(['The', 'A', 'An', 'And', 'But', 'For', 'Its', "It's", 'His', 'Her', 'Their', 'This', 'That', 'These', 'Those', 'When', 'Where', 'What', 'How', 'Why', 'Who', 'By', 'On', 'In', 'At', 'To', 'As', 'Part']);

export function planEntityDirectives(beats) {
  let pops = 0;
  for (const b of beats) {
    if (b.pop) continue; // R7: the stat pop wins
    const words = Array.isArray(b.words) ? b.words : [];
    if (words.length < 2) continue;
    let run = null, best = null;
    const close = (nextLower) => {
      // a lone capitalized token only counts when a lowercase word follows it
      // ("Happens MR" — a title fragment — is not a name; "Madoff, who..." is)
      if (run && (run.toks.length >= 2 || nextLower) && (!best || run.toks.length > best.toks.length)) best = run;
    };
    for (let i = 0; i < words.length; i++) {
      const w = String(words[i].w || '');
      const prev = String(words[i - 1]?.w || '');
      // a capital right after a function word is a VERB ("When It Happens"),
      // never a name
      const prevIsFn = NOT_ENTITY.has(prev);
      const isCap = /^[A-Z][a-z]{2,}/.test(w);
      const sentenceStart = i === 0 || /[.!?]$/.test(prev);
      const eligible = isCap && !sentenceStart && !NOT_ENTITY.has(w) && !prevIsFn;
      if (eligible) {
        if (run) run.toks.push(w); else run = { start: i, toks: [w] };
      } else {
        close(/^[a-z]/.test(w));
        run = null;
      }
    }
    close(true);
    if (best) {
      b.pop = { kind: 'entity', text: best.toks.join(' '), w: best.start };
      pops++;
    }
  }
  return { beats, pops };
}

export function storybookPhotoGate(totalSlides, slidesWithPhotos) {
  const total = Number(totalSlides) || 0;
  const withPhotos = Number(slidesWithPhotos) || 0;
  if (total < 1 || withPhotos > 0) return { ok: true, total, withPhotos };
  return {
    ok: false,
    total,
    withPhotos,
    reason: `0/${total} story slides carry a photo — every fetch failed or returned nothing, so the episode would ship as bare text on paper; refusing before the render spend`,
  };
}

const cleanQ = (t) => String(t || '').replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 4).join(' ');

export function photoQueryFor(chapterTitle, nicheWords, idx, titleWords = []) {
  // P5 premium queries: the chapter's subject + the episode's subject + a
  // niche word — "too much related to the video", not generic stock.
  const words = Array.isArray(nicheWords) && nicheWords.length ? nicheWords : ['story'];
  const t = Array.isArray(titleWords) ? titleWords.filter(Boolean) : [];
  const q = [cleanQ(chapterTitle), t.slice(0, 2).join(' '), String(words[idx % words.length] || '').trim()].filter(Boolean).join(' ').trim();
  return q.slice(0, 60);
}

// The episode SRT: each beat's edge_batch words [{w,s,d}] shifted onto the
// episode timeline (beat.startMs), through the SAME cuesFromWords/toSrt the
// legacy lane feeds — parseSrt (tiktok-clips) reads it back untouched.
export function srtFromBeats(beats, durs) {
  const durByI = new Map((durs || []).map((d) => [d.i, d]));
  const cues = [];
  for (const b of beats) {
    const d = durByI.get(b.i);
    if (!d || !Array.isArray(d.words) || !d.words.length) continue;
    cues.push(...cuesFromWords(d.words, b.startMs / 1000));
  }
  return toSrt(cues);
}
