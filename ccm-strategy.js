// 04 Editorial Strategy — builds the editorial mega-prompt from config, trend context and content memory.
const cfg = $('01 Config & Memory').first().json;

// Trend context from the merged sources (Pinterest RSS titles + Hacker News).
let trends = [];
for (const item of $input.all()) {
  const j = item.json;
  const raw = typeof j === 'string' ? j : (j.data || JSON.stringify(j));
  if (raw && raw.charAt(0) === '<') {
    const items = [...raw.matchAll(/<item>[\s\S]*?<\/item>/g)].slice(0, 8);
    for (const m of items) {
      const t = (m[0].match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1];
      if (t && t.length > 8) trends.push(t.trim());
    }
  } else if (j && j.hits) {
    for (const h of j.hits.slice(0, 8)) if (h.title) trends.push(h.title);
  }
}
trends = [...new Set(trends)].slice(0, 12);

const VISUAL_STYLES = {
  'cinematic human': 'human subject in dramatic environment, realistic photography, cinematic lighting, shallow depth of field, premium editorial (good: discipline, resilience, confidence, courage)',
  'luxury editorial': 'architectural interiors, premium materials, sophisticated workspace, black/cream neutrals, controlled composition (good: quiet ambition, career, money, leadership)',
  'nature philosophy': 'mountains, forests, ocean, roads, trees, sunrise, fog, rain (good: growth, patience, purpose, resilience)',
  'analog offline': 'notebooks, books, film cameras, coffee, wooden desks, handwritten notes, warm natural light (good: digital detox, slow living, focus, intentional life)',
  'futuristic human': 'subtle futuristic architecture, sophisticated technology aesthetic, human silhouette, cinematic light — never cheesy sci-fi (good: AI-era growth, future careers, adaptability)',
  'minimal typography': 'extremely simple background, strong negative space, minimal objects, editorial poster design (good: boundaries, confidence, self-respect, philosophy)',
  'transformation': 'visual metaphor of change: seed to tree, darkness to light, closed door to open landscape, storm to calm (good: reinvention, growth, recovery, starting over)'
};
const METAPHOR_LIBRARY = {
  growth: ['seed becoming a tree', 'tree rings', 'staircase', 'mountain trail at dawn', 'construction site', 'sunrise'],
  focus: ['single spotlight', 'isolated desk', 'one straight road', 'clean workspace'],
  digital_detox: ['phone face down', 'device in a drawer', 'person outdoors without a phone', 'paper notebook'],
  reinvention: ['open door', 'crossroads', 'new road', 'broken wall with light behind'],
  resilience: ['tree bent by wind still standing', 'storm clearing', 'ocean after rain', 'mountain in clouds'],
  quiet_ambition: ['late-night office light', 'empty early workspace', 'blueprint on a desk', 'unfinished structure rising']
};
const HOOK_EXAMPLES = {
  'contrarian': 'Being busy is not the same as moving forward.',
  'observation': 'Most people don\'t lose focus all at once. They lose it notification by notification.',
  'reframe': 'Rest isn\'t the opposite of discipline. Sometimes it\'s what makes discipline sustainable.',
  'question': 'What would change if you stopped trying to impress people who aren\'t building your life?',
  'paradox': 'The fastest way to burn out is to treat every day like a deadline.',
  'direct statement': 'Build quietly.',
  'modern problem': 'Your biggest distraction may fit inside your pocket.',
  'identity': 'Become the person who keeps promises to themselves.',
  'future consequence': 'The habits you ignore today become the life you inherit later.',
  'philosophical': 'A peaceful life can still be an ambitious life.'
};

const styleKeys = Object.keys(VISUAL_STYLES);
const styleGuide = cfg.picks.map((p, i) => {
  const style = styleKeys[(cfg.memoryCount + i) % styleKeys.length]; // deterministic rotation across posts
  return 'POST ' + (i + 1) + ' must use visual style "' + style + '": ' + VISUAL_STYLES[style];
}).join('\n');

const prompt = 'You are the editorial engine of a premium self-improvement page. Niche: "Modern self-improvement for ambitious people living in a noisy, digital, AI-heavy world." Voice: calm, intelligent, mature, concise, emotionally strong, modern, reflective, confident. NEVER generic motivational-speaker content, no hustle shouting, no excessive emojis (max 1, usually 0), no fake stories, no fake statistics, no invented research, no engagement bait.\n\n'
+ 'PLATFORM: ' + cfg.config.PLATFORM + ' (adapt caption depth/tone to it).\n'
+ 'Generate ' + cfg.picks.length + ' COMPLETELY DIFFERENT posts, one per category below. For EACH post internally generate 3-5 candidate concepts, evaluate them for originality/emotional impact/visual potential/non-cliche quality, and output ONLY the strongest one per category.\n\n'
+ 'CATEGORIES FOR THIS RUN:\n' + cfg.picks.map((p, i) => 'POST ' + (i + 1) + ' — ' + p.name + ' (core idea: ' + p.core + '). Pick ONE subtopic/angle: ' + p.subs.join('; ') + '. The post must express ONE specific content angle (a concrete insight, not a vague theme).').join('\n') + '\n\n'
+ (cfg.config.TREND_RESEARCH_ENABLED && trends.length ? 'TREND CONTEXT (recent titles from this niche — get the vibe of what people discuss, NEVER copy wording):\n' + trends.join('\n') + '\n\n' : '')
+ 'HOOK SYSTEM: rotate hook styles across posts. Styles with examples: ' + Object.entries(HOOK_EXAMPLES).map(([k, v]) => k + ' ("' + v + '")').join('; ') + '. Assign a DIFFERENT hook style to each post.\n'
+ 'VISUAL METAPHOR LIBRARY (draw from these for the poster subject, never repeat the same metaphor as recent content): ' + Object.entries(METAPHOR_LIBRARY).map(([k, v]) => k + ': ' + v.join(', ')).join(' | ') + '\n'
+ 'COLOR: the poster system is monochrome + ONE accent per image — choose the accent to fit the emotion (warm gold = legacy/time/value, deep crimson = power/urgency, golden-yellow = predator focus). Never rainbow, never pastel.\n\n'
+ 'PREMIUM VALUE-POSTER SYSTEM (CRITICAL): Every post generates an image that contains COMPLETE READABLE VALUE. The viewer should be able to read the image text alone in 5 seconds, understand the entire lesson, and immediately want to save/like the post.\n'
+ 'For EVERY post provide an "image" object with:\n'
+ '- "layout": one of the twelve visual layouts (isolated_beast, duality_split, matrix_grid, infographic, dark_icon, impossible_breakthrough, tension_snap, surreal_state_change, transformative_reflection, corrupting_touch, degradation_split, inevitable_loop)\n'
+ '- "subject": rich visual description of the symbolic objects/scene/metaphor — no humans, no faces\n'
+ '- "accent": single accent color (e.g. golden-yellow, deep crimson, warm gold, emerald green, amber)\n'
+ '- "headline": 2-5 WORDS, ALL CAPS, punchy concept title (e.g. "THE LAW OF SILENT LEVERAGE" or "THE COST OF PROVING YOURSELF")\n'
+ '- "insight_body": 2-3 COMPLETE, PROFOUND, HIGH-VALUE SENTENCES explaining the core insight directly on the image so the viewer gets the full meaning instantly without opening the caption.\n'
+ '- "takeaway": ONE sharp concluding rule/truth line (e.g. "Rule: Value privacy over applause." or "Truth: Real power never has to shout.")\n'
+ '- "subtext": short fallback combination of insight_body and takeaway\n'
+ 'plus layout extras (duality_split: left_text, right_text, left_subject, right_subject; matrix_grid: accent_word; infographic: items and closing_line; transformative_reflection: reflection_subject; degradation_split: destroyer; impossible_breakthrough: surface).\n\n'
+ 'IMAGE/CAPTION RULE: The image contains the full core value lesson. The caption expands upon it with deeper nuance and context.\n\n'
+ 'CAPTION LENGTH: ' + cfg.captionLength + '.\n'
+ 'CTA: include a natural, non-bait CTA on roughly ' + Math.round(cfg.config.CTA_FREQUENCY * 100) + '% of posts (question inviting genuine reflection); empty string "" otherwise.\n'
+ 'HASHTAGS: 3-' + cfg.config.HASHTAG_LIMIT + ' highly relevant (core niche + topic), lowercase with #, no generic viral stuffing.\n\n'
+ (cfg.recentContent.length ? 'ORIGINALITY CONTEXT — recent posts already published (DO NOT repeat their hooks, headlines, angles, metaphors or wording; your output must be clearly distinct):\n' + cfg.recentContent.map(r => '- [' + r.category + '] hook: "' + r.hook + '" | headline: "' + (Array.isArray(r.headline) ? r.headline.join(' / ') : r.headline) + '" | angle: ' + r.angle).join('\n') + '\n\n' : '')
+ 'Return ONLY valid JSON:\n{"posts":[{"content_id":"' + Date.now() + '-N","category":"","subcategory":"","trend_context":"one line on the underlying human concern (or empty)","content_angle":"","hook_style":"","hook":"","subheadline":"","core_message":"","visual_style":"","visual_concept":"","metaphor":"","image":{"layout":"","subject":"","accent":"","headline":"","insight_body":"","takeaway":"","subtext":"","accent_word":"","left_text":"","right_text":"","left_subject":"","right_subject":"","closing_line":"","reflection_subject":"","destroyer":"","items":[{"label":"","object":""}]},"caption":"","cta":"","hashtags":["#"],"platform":"' + cfg.config.PLATFORM + '","self_quality_score":0}]}';

const payload = { model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, max_tokens: 1200 };
const ollamaPayload = { model: 'llama3.1:8b', prompt: prompt, format: 'json', stream: false, options: { temperature: 0.85 } };

return [{ json: { payload: payload, ollamaPayload: ollamaPayload, meta: { batch: cfg.picks.length, trendCount: trends.length, at: cfg.generatedAt } } }];
