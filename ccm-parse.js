// 06 Parse & Validate — schema validation, cliché + duplicate detection, poster-prompt assembly (gpt-image-2 style engine).
const cfgData = $('01 Config & Memory').first().json;
const CONFIG = cfgData.config;

let ai = {};
try {
  const resp = ($json.choices && $json.choices[0] && $json.choices[0].message && $json.choices[0].message.content) || $json.response || ($json.candidates && $json.candidates[0].content.parts[0].text) || '{}';
  ai = typeof resp === 'string' ? JSON.parse(resp) : resp;
} catch (e) { throw new Error('AI returned non-JSON: ' + String($json.response || $json.choices || '').substring(0, 200)); }

const posts = ai.posts || (Array.isArray(ai) ? ai : []);
if (!posts.length) throw new Error('AI returned no posts');

// Cliché detection (banned generic phrases; allowed only if genuinely subverted).
const CLICHES = ['never give up', 'believe in yourself', 'dream big', 'work hard', 'stay positive', 'success takes time', 'everything happens for a reason', 'you can do anything', 'keep pushing', 'be yourself', 'great things take time', 'hustle harder'];
const memory = (() => { try { return ($('01b Load Memory').first().json || {}).content || []; } catch (e) { return []; } })();

// Jaccard word-overlap similarity for duplicate detection.
function tokens(s) { return new Set(String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3)); }
function similarity(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

// ── PREMIUM POSTER STYLE KIT (proven 2026-08-24, variants A–J + user-supplied conceptual blueprints) ──
// To add a new style later: append a template below + describe it in the 04 strategy prompt.
const POSTER_BASE = 'A highly realistic, premium minimalist social media editorial graphic. ';
const POSTER_NEG = ' Avoid: messy background, lifestyle photography, humans, cafes, offices, cluttered desk, busy city, generic motivational poster, cursive fonts, cartoon, illustration, 3d render, plastic, low resolution, misspelled text, rainbow colors, pastels, vintage, sepia, text covering the subject.';
const q = t => String(t || '').replace(/"/g, "'").trim();

const POSTER_TEMPLATES = {
  isolated_beast: im =>
    'LAYOUT STYLE: The Value Poster. SUBJECT: ' + q(im.subject) + ', placed gracefully in the lower half. BACKGROUND: Pure studio white with a subtle soft grey gradient. LIGHTING: Dramatic high-contrast studio lighting, sharp shadows. COLOR GRADING: Monochrome white and charcoal with a single ' + q(im.accent || 'golden-yellow') + ' accent. TYPOGRAPHY AND FULL VALUE TEXT: In the clean upper negative space, bold uppercase concept title reading exactly: "' + q(im.headline) + '" followed by full readable insight text in crisp modern typography reading exactly: "' + q(im.insight_body || im.subtext) + '" and concluding with takeaway rule line reading exactly: "' + q(im.takeaway || '') + '" TEXT PLACEMENT: Upper half, perfectly centered, pristine typography, high contrast, 100% readable. AESTHETIC: Masterpiece, 8k, photorealistic, advertising photography, crisp edges, immaculate negative space.',
  duality_split: im =>
    'LAYOUT STYLE: The Duality Split. SUBJECT: A perfect 50/50 vertical split image. LEFT half: pure white background with ' + q(im.left_subject) + '. RIGHT half: pitch black background with ' + q(im.right_subject) + '. LIGHTING: High contrast, sharp studio light on both subjects. COLOR GRADING: Pure black and pure white only. TYPOGRAPHY AND FULL VALUE TEXT: Color-inverted editorial typography reading exactly "' + q(im.left_text) + '" in black text on the white left side and "' + q(im.right_text) + '" in white text on the black right side, both with readable insight subtext below: "' + q(im.insight_body || im.subtext) + '" AESTHETIC: Masterpiece, 8k, photorealistic, advertising photography, crisp edges, immaculate negative space.',
  matrix_grid: im =>
    'LAYOUT STYLE: The Matrix Textured Grid. SUBJECT: ' + q(im.subject) + ', its form partly formed from shattered bold typographic letterforms. BACKGROUND: Stark white fading into light grey texture. LIGHTING: High contrast studio lighting, stark shadows. COLOR GRADING: Monochrome black and white with a deep crimson red accent. TYPOGRAPHY AND FULL VALUE TEXT: Massive bold sans-serif headline reading: "' + q(im.headline) + '" with full value insight text clearly rendered below reading: "' + q(im.insight_body || im.subtext) + '" and rule line: "' + q(im.takeaway || '') + '" AESTHETIC: Masterpiece, 8k, photorealistic, advertising photography, crisp edges, immaculate negative space.',
  infographic: im => {
    const items = (im.items || []).slice(0, 4);
    const objs = items.map((it, i) => (i + 1) + '. ' + q(it.object)).join(', ');
    const labels = items.map(it => '"' + q(it.label) + '"').join(', ');
    return 'LAYOUT STYLE: The Premium Infographic. SUBJECT: Four vertically stacked circular gold-rimmed frames on the left side, each containing a hyper-realistic object: ' + objs + '. BACKGROUND: Pitch black. LIGHTING: Dramatic studio rim lighting on each object. COLOR GRADING: Deep black with rich gold accents and crisp white. TYPOGRAPHY AND FULL VALUE TEXT: To the right of each circle, flawless editorial typography: main words in gold reading exactly ' + labels + ' with clear explanatory text under each. Bottom center in bold white: "' + q(im.closing_line || im.headline) + '" with takeaway: "' + q(im.takeaway || im.insight_body || '') + '" AESTHETIC: Masterpiece, 8k, photorealistic, advertising photography, crisp edges, immaculate negative space.';
  },
  dark_icon: im =>
    'LAYOUT STYLE: The Dark Value Poster. SUBJECT: ' + q(im.subject) + ', placed centrally, subtle reflection below. BACKGROUND: Pure pitch black. LIGHTING: Dramatic rim lighting outlining the object, single warm gold glow. COLOR GRADING: Deep black with rich ' + q(im.accent || 'gold') + ' accent only. TYPOGRAPHY AND FULL VALUE TEXT: Massive flawless bold white sans-serif headline reading: "' + q(im.headline) + '" with full readable insight paragraph in clean crisp typography reading: "' + q(im.insight_body || im.subtext) + '" and concluding rule: "' + q(im.takeaway || '') + '" TEXT PLACEMENT: Upper half, perfectly spaced, high legibility. AESTHETIC: Masterpiece, 8k, photorealistic, advertising photography, crisp edges, immaculate negative space.',
  // ── Conceptual Metaphor & Surreal Realism blueprints ──
  impossible_breakthrough: im =>
    'LAYOUT STYLE: The Impossible Breakthrough. SUBJECT & TWIST: ' + q(im.surface || 'A massive solid heavy grey concrete slab') + ' forcefully cracked wide open as ' + q(im.subject || 'a delicate, luminous vibrant green plant seedling') + ' erupts upward from beneath, shattering the dense stone with supernatural vigor. BACKGROUND: Monochromatic minimalist slate grey concrete floor with deep tactile fractures and debris. LIGHTING & TEXTURE: Bright crisp top-down studio and natural morning sunlight illuminating translucent green leaf veins, extreme texture contrast. TYPOGRAPHY AND FULL VALUE TEXT: Bold, clean, modern dark typography framed with minimalist editorial brackets reading: "' + q(im.headline) + '" followed by full readable insight text: "' + q(im.insight_body || im.subtext) + '" and takeaway rule: "' + q(im.takeaway || '') + '" TEXT PLACEMENT: Upper half clean space. AESTHETIC: Masterpiece, 8k, award-winning print ad, clever visual metaphor, crisp edges, immaculate negative space, surreal realism.',
  tension_snap: im =>
    'LAYOUT STYLE: The Tension Snap. SUBJECT & TWIST: ' + q(im.subject || 'A thick, heavily rusted industrial iron chain') + ' caught in the exact micro-second of violently snapping in half. The broken ends are glowing with superheated, bright orange and yellow heat, with sparks and embers flying outward violently. BACKGROUND: Dark, moody, out-of-focus brushed steel or gritty wall. LIGHTING & TEXTURE: Cinematic, dark, with extreme sharp focus on the rusted texture and the bright glowing embers acting as the main light source. TYPOGRAPHY AND FULL VALUE TEXT: Bold uppercase typography reading: "' + q(im.headline) + '" with full readable insight breakdown: "' + q(im.insight_body || im.subtext) + '" and takeaway: "' + q(im.takeaway || '') + '" TEXT PLACEMENT: Centered at top. AESTHETIC: Masterpiece, 8k, award-winning print ad, clever visual metaphor, crisp edges, immaculate negative space, surreal realism.',
  surreal_state_change: im =>
    'LAYOUT STYLE: The Surreal State Change. SUBJECT & TWIST: ' + q(im.subject || 'A highly reflective, chrome twin-bell alarm clock') + ' that is surrealistically melting and morphing into thick, glossy liquid metal. The liquid drips downward in a frozen moment. BACKGROUND: Pure stark white to light grey seamless studio background. LIGHTING & TEXTURE: Pristine advertising studio lighting, hyper-glossy reflections on the chrome, crisp 3D realism. TYPOGRAPHY AND FULL VALUE TEXT: Bold, flawless black editorial typography reading: "' + q(im.headline) + '" with full readable insight text: "' + q(im.insight_body || im.subtext) + '" and takeaway rule: "' + q(im.takeaway || '') + '" AESTHETIC: Masterpiece, 8k, award-winning print ad, clever visual metaphor, crisp edges, immaculate negative space, surreal realism.',
  transformative_reflection: im =>
    'LAYOUT STYLE: The Transformative Reflection. SUBJECT & TWIST: ' + q(im.subject) + ' standing on a highly reflective surface of dark still water. The reflection looking back at it is ' + q(im.reflection_subject) + ', massive and powerful. BACKGROUND: Dark moody cinematic deep charcoal, making the reflection glow with presence. LIGHTING: Moody cinematic rim light, one soft spotlight on the small subject. COLOR GRADING: Dark monochrome with a single ' + q(im.accent || 'warm gold') + ' accent glow inside the reflection. TYPOGRAPHY AND FULL VALUE TEXT: Bold headline: "' + q(im.headline) + '" with full insight paragraph: "' + q(im.insight_body || im.subtext) + '" and rule line: "' + q(im.takeaway || '') + '" AESTHETIC: Masterpiece, 8k, award-winning print ad, clever visual metaphor, crisp edges, immaculate negative space.',
  corrupting_touch: im =>
    'LAYOUT STYLE: The Corrupting Touch. SUBJECT & TWIST: ' + q(im.subject) + ' placed side-by-side on a surface — one object completely ruined, shriveled and rotten; the other pristine and glossy, except one small spot of rot spreading into it exactly at the point where the two touch. BACKGROUND: Pure stark white studio background. LIGHTING: Extremely bright clean high-end advertising studio lighting, hyper-detailed macro textures. TYPOGRAPHY AND FULL VALUE TEXT: Bold headline in ' + q(im.accent || 'deep red') + ' and black: "' + q(im.headline) + '" with full insight explanation: "' + q(im.insight_body || im.subtext) + '" and rule: "' + q(im.takeaway || '') + '" AESTHETIC: Masterpiece, 8k, award-winning print ad, clever visual metaphor, crisp edges, immaculate negative space.',
  degradation_split: im =>
    'LAYOUT STYLE: The 50/50 Degradation Split. SUBJECT & TWIST: A single ' + q(im.subject) + ' centered in the frame, split perfectly down the middle: the left half pristine, glossy and untouched; the right half actively being destroyed by ' + q(im.destroyer || 'swarming flies and spreading decay') + '. BACKGROUND: Also split perfectly down the middle. LIGHTING: High-end macro photography, surreal realism. TYPOGRAPHY AND FULL VALUE TEXT: Bold headline: "' + q(im.headline) + '" with full insight explanation: "' + q(im.insight_body || im.subtext) + '" and takeaway rule: "' + q(im.takeaway || '') + '" AESTHETIC: Masterpiece, 8k, award-winning print ad, clever visual metaphor, crisp edges, immaculate negative space.',
  inevitable_loop: im =>
    'LAYOUT STYLE: The Inevitable Loop. SUBJECT & TWIST: ' + q(im.subject) + ', the action traveling through two floating pitch-black space portals and immediately returning to strike the subject from behind, one glowing ' + q(im.accent || 'electric amber') + ' trajectory line tracing the full path of cause and effect. BACKGROUND: Flat solid dark grey, minimal and clean. TYPOGRAPHY AND FULL VALUE TEXT: Bold headline: "' + q(im.headline) + '" with full insight text: "' + q(im.insight_body || im.subtext) + '" and takeaway: "' + q(im.takeaway || '') + '" AESTHETIC: Masterpiece, 8k, award-winning print ad, clever visual metaphor, crisp edges, immaculate negative space.'
};

// Map each category to the appropriate managed Facebook Page
const PAGE_ROUTING = {
  // Silent Wealth
  'money_discipline': { id: '116157974886564', name: 'Silent Wealth' },
  'quiet_ambition': { id: '116157974886564', name: 'Silent Wealth' },
  'future_proof_career': { id: '116157974886564', name: 'Silent Wealth' },
  // Strategic Silence
  'ai_era_growth': { id: '108044922375174', name: 'Strategic Silence' },
  'deep_work': { id: '108044922375174', name: 'Strategic Silence' },
  'anti_comparison': { id: '108044922375174', name: 'Strategic Silence' },
  'self_trust': { id: '108044922375174', name: 'Strategic Silence' },
  // Eon Ventures
  'discipline_no_hustle': { id: '1077306835630491', name: 'Eon Ventures' },
  'small_wins': { id: '1077306835630491', name: 'Eon Ventures' },
  'courage': { id: '1077306835630491', name: 'Eon Ventures' },
  'career_growth': { id: '1077306835630491', name: 'Eon Ventures' },
  // Reliq North
  'slow_living': { id: '114550268199751', name: 'Reliq North' },
  'digital_detox': { id: '114550268199751', name: 'Reliq North' },
  'resilience': { id: '114550268199751', name: 'Reliq North' },
  'purpose': { id: '114550268199751', name: 'Reliq North' },
  'intentional_life': { id: '114550268199751', name: 'Reliq North' },
  // The Boundaries Club
  'boundaries': { id: '106473735839651', name: 'The Boundaries Club' },
  'burnout_recovery': { id: '106473735839651', name: 'The Boundaries Club' },
  'leadership': { id: '106473735839651', name: 'The Boundaries Club' },
  'reinvention': { id: '106473735839651', name: 'The Boundaries Club' }
};

// Normalize the AI's image spec: valid layout with required fields, else graceful fallback.
function buildImageSpec(p) {
  const im = p.image || {};
  let layout = POSTER_TEMPLATES[im.layout] ? im.layout : 'isolated_beast';
  if (layout === 'duality_split' && !(im.left_text && im.right_text && im.left_subject && im.right_subject)) layout = 'isolated_beast';
  if (layout === 'infographic' && (!Array.isArray(im.items) || im.items.length < 3)) layout = 'dark_icon';
  if (layout === 'transformative_reflection' && !im.reflection_subject) layout = 'dark_icon';
  
  const headline = String(im.headline || p.hook || 'FOCUS.').substring(0, 50).toUpperCase();
  const insight_body = String(im.insight_body || p.core_message || p.subheadline || '').substring(0, 200);
  const takeaway = String(im.takeaway || '').substring(0, 80);
  const subtext = insight_body + (takeaway ? ' ' + takeaway : '');

  const spec = { ...im, layout,
    subject: String(im.subject || p.visual_concept || p.metaphor || 'a powerful symbolic scene'),
    headline: headline,
    insight_body: insight_body,
    takeaway: takeaway,
    subtext: subtext,
    accent: im.accent || (layout === 'matrix_grid' ? 'deep crimson' : (layout === 'tension_snap' ? 'white and gold' : 'warm gold'))
  };

  spec.expectedText = 'the headline "' + q(spec.headline) + '" and the readable insight text "' + q(spec.insight_body || spec.subtext).substring(0, 100) + '"';
  const neg = layout === 'inevitable_loop' ? POSTER_NEG.replace('3d render, ', '') : POSTER_NEG;
  const prompt = POSTER_BASE + POSTER_TEMPLATES[layout](spec) + neg;
  return { spec, prompt };
}

const out = [];
for (let pi = 0; pi < posts.length; pi++) {
  const p = posts[pi];
  const catKey = String(p.category || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const targetPage = PAGE_ROUTING[catKey] || { id: '114550268199751', name: 'Reliq North' };
  
  const errors = [];
  if (!p.hook) errors.push('missing hook');
  if (!p.image || !p.image.headline) errors.push('missing image.headline');
  if (!p.caption || p.caption.length < 40) errors.push('caption too short');
  const text = (p.hook + ' ' + ((p.image && p.image.headline) || '') + ' ' + p.caption).toLowerCase();
  const clicheHits = CLICHES.filter(c => text.includes(c));

  // Duplicate check vs memory (hook + image headline + caption combined).
  const candidateText = p.hook + ' ' + ((p.image && p.image.headline) || '') + ' ' + p.caption;
  let maxSim = 0, simVs = '';
  for (const m of memory.slice(-40)) {
    const s = similarity(candidateText, (m.hook || '') + ' ' + (m.image_headline || m.headline || '') + ' ' + (m.caption || ''));
    if (s > maxSim) { maxSim = s; simVs = m.content_id || ''; }
  }
  const duplicate = maxSim >= CONFIG.SIMILARITY_THRESHOLD;

  const { spec: imageSpec, prompt: imagePrompt } = buildImageSpec(p);
  const caption = (p.hook ? p.hook + '\n\n' : '') + (p.caption || '') + (p.cta ? '\n\n' + p.cta : '') + ((p.hashtags || []).length ? '\n\n' + (p.hashtags || []).join(' ') : '');

  const post = {
    content_id: p.content_id || (Date.now() + '-' + Math.random().toString(36).slice(2, 7)),
    category: p.category || '', subcategory: p.subcategory || '', trend_context: p.trend_context || '',
    angle: p.content_angle || '', hook_style: p.hook_style || '', hook: p.hook || '',
    headline: [imageSpec.headline], subheadline: p.subheadline || '', core_message: p.core_message || '',
    visual_style: p.visual_style || '', visual_concept: p.visual_concept || p.metaphor || '', metaphor: p.metaphor || '',
    caption_full: caption, cta: p.cta || '', hashtags: p.hashtags || [],
    self_quality_score: p.self_quality_score || 0,
    targetPage: targetPage,
    validation: { errors, clicheHits, maxSimilarity: Math.round(maxSim * 100) / 100, duplicate, simVs },
    imageSpec: imageSpec,
    imagePrompt: imagePrompt,
    imageGenPayload: { model: 'gpt-image-2', prompt: imagePrompt, size: CONFIG.IMAGE_SIZE || '1024x1536', n: 1 },
    group_targets: (cfgData.groupTargets && cfgData.groupTargets[pi]) || null,
    fbUrl: 'https://graph.facebook.com/v20.0/' + targetPage.id + '/photos?access_token=' + encodeURIComponent($env.FB_PAGE_TOKEN) + '&caption=' + encodeURIComponent(caption),
    qcPayload: {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'You are a strict quality-control editor for a premium self-improvement page (calm, intelligent, modern voice; niche: modern self-improvement for ambitious people in a noisy AI-heavy world). Score this post 0-100. Breakdown: originality 0-20, clarity 0-15, emotional impact 0-15, usefulness 0-15, shareability 0-10, visual strength 0-10, brand fit 0-10, non-cliche quality 0-5. Post:\nCATEGORY: ' + p.category + '\nPAGE: ' + targetPage.name + '\nANGLE: ' + p.content_angle + '\nHOOK (' + p.hook_style + '): ' + p.hook + '\nPOSTER: layout ' + imageSpec.layout + ' — headline "' + imageSpec.headline + '" / insight "' + imageSpec.insight_body + '" / takeaway "' + imageSpec.takeaway + '"\nCAPTION: ' + p.caption + '\nCTA: ' + (p.cta || 'none') + '\nReturn ONLY JSON: {"score":0,"subs":{"originality":0,"clarity":0,"emotional_impact":0,"usefulness":0,"shareability":0,"visual_strength":0,"brand_fit":0,"non_cliche":0},"verdict":"approve|reject","critique":"one sentence"}' }],
      response_format: { type: 'json_object' },
      max_tokens: 300
    }
  };
  out.push({ json: post });
}
return out;
