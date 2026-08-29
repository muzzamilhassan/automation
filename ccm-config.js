// 01 Config & Memory — central configuration + weighted category/style rotation + content memory.
// Everything tunable lives in CONFIG. Webhook body (Manual Fire) can override: {batch, publish, categories:[...]}.
const CONFIG = {
  PLATFORM: 'facebook',
  BATCH_SIZE: 1,                    // posts per execution (1/5/10/20)
  CAPTION_LENGTH: 'rotate',         // 'short' | 'medium' | 'long' | 'rotate'
  IMAGE_ASPECT_RATIO: '4:5',        // '4:5' | '2:3' | '1:1' | '9:16'
  QUALITY_THRESHOLD: 80,            // publish gate (0-100)
  SIMILARITY_THRESHOLD: 0.55,       // Jaccard overlap that flags a duplicate
  MAX_RETRIES: 0,                   // auto-regeneration rounds (0 = reject & log with critique)
  CTA_FREQUENCY: 0.4,               // ~40% of posts get a natural CTA
  HASHTAG_LIMIT: 8,                 // 5-10, never stuffed
  TREND_RESEARCH_ENABLED: true,     // use live Pinterest/HN titles as trend context
  AUTO_PUBLISH_ENABLED: true,       // LIVE daily flow — Manual Fire {"publish":false} for dry runs
  IMAGE_SIZE: '1024x1536',          // gpt-image-2 vertical (2:3)
  CONTENT_LANGUAGE: 'en',
  MEMORY_LIMIT: 200                 // keep last N content records
};

const ASPECTS = { '4:5': [1000, 1250], '2:3': [1000, 1500], '1:1': [1080, 1080], '9:16': [810, 1440] };

// 20-category editorial system (weights sum ~100).
const CATEGORIES = [
  { id: 'quiet_ambition', name: 'Quiet Ambition', weight: 10, core: 'Build without needing constant validation.', subs: ['building privately', 'silent progress', 'results over announcements', 'ambition without performance', 'letting results speak', 'long-term thinking', 'sustainable ambition'] },
  { id: 'discipline_no_hustle', name: 'Discipline Without Hustle', weight: 8, core: 'Discipline without burnout or toxic productivity.', subs: ['keeping promises to yourself', 'discipline without motivation', 'rest as part of discipline', 'showing up on difficult days', 'identity-based habits', 'boring consistent work'] },
  { id: 'ai_era_growth', name: 'AI-Era Self Improvement', weight: 10, core: 'How humans should develop themselves in an AI-heavy world.', subs: ['human judgment', 'critical thinking', 'becoming harder to replace', 'using AI instead of fearing it', 'avoiding intellectual laziness', 'continuous learning'] },
  { id: 'future_proof_career', name: 'Future-Proof Career', weight: 7, core: 'Build valuable skills instead of depending on titles.', subs: ['skill stacking', 'portfolio over credentials', 'proof of work', 'career reinvention', 'building leverage'] },
  { id: 'digital_detox', name: 'Digital Detox', weight: 8, core: 'Reclaim attention from phones, feeds and algorithms.', subs: ['doomscrolling', 'phone-free mornings', 'notifications', 'creating instead of consuming', 'digital minimalism', 'protecting mental space'] },
  { id: 'slow_living', name: 'Slow Living', weight: 6, core: 'A meaningful life does not have to be rushed.', subs: ['peaceful mornings', 'ordinary moments', 'quality over speed', 'offline hobbies', 'intentional routines'] },
  { id: 'deep_work', name: 'Deep Work & Focus', weight: 7, core: 'Attention is a competitive advantage.', subs: ['single-tasking', 'phone-free work', 'creating before consuming', 'protecting mornings', 'attention management'] },
  { id: 'resilience', name: 'Emotional Resilience', weight: 6, core: 'Strength is the ability to recover and stay grounded.', subs: ['setbacks', 'patience', 'staying calm', 'responding instead of reacting', 'difficult seasons'] },
  { id: 'self_trust', name: 'Self-Trust & Confidence', weight: 4, core: 'Confidence comes from evidence created by your own actions.', subs: ['keeping promises', 'decision-making', 'confidence through action', 'being misunderstood', 'personal standards'] },
  { id: 'small_wins', name: 'Small Wins & Micro Habits', weight: 7, core: 'Small actions compound.', subs: ['1% improvement', 'tiny habits', 'compound effect', 'habit stacking', 'starting small'] },
  { id: 'anti_comparison', name: 'Anti-Comparison', weight: 4, core: 'Stop measuring your life against highlights.', subs: ['different timelines', 'staying in your lane', 'defining your own success', 'comparison traps', 'gratitude'] },
  { id: 'burnout_recovery', name: 'Burnout & Recovery', weight: 4, core: 'Exhaustion is not proof of ambition.', subs: ['rest', 'recovery', 'boundaries', 'energy management', 'sustainable productivity', 'saying no'] },
  { id: 'career_growth', name: 'Career Growth', weight: 5, core: 'Become more valuable before demanding the next title.', subs: ['mentorship', 'professional reputation', 'communication', 'visibility', 'building proof'] },
  { id: 'money_discipline', name: 'Money & Financial Discipline', weight: 3, core: 'Build stability instead of performing wealth. Educational and behavioral only — never specific investment advice.', subs: ['delayed gratification', 'lifestyle inflation', 'quiet wealth', 'spending discipline', 'avoiding status spending'] },
  { id: 'leadership', name: 'Leadership & Character', weight: 2, core: 'Leadership begins with character and self-control.', subs: ['responsibility', 'integrity', 'listening', 'leading by example', 'accountability'] },
  { id: 'boundaries', name: 'Boundaries & Self-Respect', weight: 3, core: 'Protect your time, attention, energy and dignity. No toxic "cut everyone off" messaging.', subs: ['saying no', 'overexplaining', 'people pleasing', 'protecting peace', 'mutual effort'] },
  { id: 'reinvention', name: 'Reinvention & Starting Over', weight: 3, core: 'You are allowed to change direction.', subs: ['new beginnings', 'changing careers', 'rebuilding', 'second chances', 'leaving old versions of yourself'] },
  { id: 'courage', name: 'Courage & Discomfort', weight: 3, core: 'Growth often begins where comfort ends.', subs: ['starting before ready', 'difficult conversations', 'rejection', 'publishing work', 'learning publicly'] },
  { id: 'purpose', name: 'Purpose & Meaning', weight: 2, core: 'Success without meaning can still feel empty.', subs: ['defining success', 'values', 'meaningful work', 'personal philosophy'] },
  { id: 'intentional_life', name: 'Intentional Life', weight: 8, core: 'Stop living on autopilot.', subs: ['intentional choices', 'simplifying life', 'priorities', 'environment design', 'meaningful experiences'] }
];

const HOOK_PATTERNS = ['contrarian', 'observation', 'reframe', 'question', 'paradox', 'direct statement', 'modern problem', 'identity', 'future consequence', 'philosophical'];
const CAPTION_LENGTHS = ['short: 40-80 words', 'medium: 80-150 words', 'long: 150-250 words'];
const FORMATS = ['single image + caption', 'minimal quote poster', 'cinematic image + short statement', 'conceptual visual metaphor', 'question-based image', 'two-line philosophical statement', 'practical micro-advice', 'contrarian insight', 'short educational insight', 'reflection'];
const PALETTES = ['warm earth', 'charcoal + cream', 'muted green', 'deep blue', 'warm amber', 'soft gray monochrome', 'natural wood', 'subtle metallic'];

// Group share pool (user-joined public groups, 2026-08-24). Each published post is assigned the NEXT
// block of 4 groups (consecutive, non-overlapping, wraps around the pool).
const GROUP_POOL = [
  { id: '557093121330339', name: 'Group 01', url: 'https://www.facebook.com/groups/557093121330339/' },
  { id: '3068652839830302', name: 'Group 02', url: 'https://www.facebook.com/groups/3068652839830302/' },
  { id: '1277931033721000', name: 'Group 03', url: 'https://www.facebook.com/groups/1277931033721000/' },
  { id: '224170823053655', name: 'Group 04', url: 'https://www.facebook.com/groups/224170823053655/' },
  { id: '175076773308988', name: 'Group 05', url: 'https://www.facebook.com/groups/175076773308988/' },
  { id: '112168158884874', name: 'Group 06', url: 'https://www.facebook.com/groups/112168158884874/' },
  { id: 'billionairmindsetquotes', name: 'Group 07', url: 'https://www.facebook.com/groups/billionairmindsetquotes/' },
  { id: 'billionairesthinking', name: 'Group 08', url: 'https://www.facebook.com/groups/billionairesthinking/' },
  { id: 'successquotess', name: 'Group 09', url: 'https://www.facebook.com/groups/successquotess/' },
  { id: '1076951029899388', name: 'Group 10', url: 'https://www.facebook.com/groups/1076951029899388/' },
  { id: '186297316379630', name: 'Group 11', url: 'https://www.facebook.com/groups/186297316379630/' },
  { id: '1400779753809224', name: 'Group 12', url: 'https://www.facebook.com/groups/1400779753809224/' },
  { id: '835580721364268', name: 'Group 13', url: 'https://www.facebook.com/groups/835580721364268/' },
  { id: '2498396733824085', name: 'Group 14', url: 'https://www.facebook.com/groups/2498396733824085/' },
  { id: '1936803896580105', name: 'Group 15', url: 'https://www.facebook.com/groups/1936803896580105/' }
];
const GROUPS_PER_POST = 4;

const staticData = null; // memory lives in the CCM Memory Store workflow now
const storeResp = (() => { try { return $('01b Load Memory').first().json || {}; } catch (e) { return {}; } })();
const memory = storeResp.content || [];

// Webhook body overrides (batch size, forced categories, one-off publish) — only present on Manual Fire runs.
const body = (() => { try { return $('Manual Fire').first().json.body || {}; } catch (e) { return {}; } })();
if (body.batch) CONFIG.BATCH_SIZE = Math.min(20, Math.max(1, parseInt(body.batch, 10) || 1));
if (typeof body.publish === 'boolean') CONFIG.AUTO_PUBLISH_ENABLED = body.publish;
const forcedCategories = Array.isArray(body.categories) && body.categories.length ? body.categories.slice(0, 20) : null;

function pickWeighted(exclude) {
  const pool = CATEGORIES.filter(c => !exclude.includes(c.id));
  const list = pool.length ? pool : CATEGORIES;
  let total = 0; for (const c of list) total += c.weight;
  let r = Math.random() * total;
  for (const c of list) { r -= c.weight; if (r <= 0) return c; }
  return list[list.length - 1];
}
// Avoid the categories used by the most recent posts.
const exclude = memory.slice(-2).map(m => String(m.category || '').toLowerCase().replace(/[^a-z]+/g, '_'));
const picked = [];
const n = CONFIG.BATCH_SIZE;
for (let i = 0; i < n; i++) {
  if (forcedCategories) {
    const fc = CATEGORIES.find(c => c.id === forcedCategories[i % forcedCategories.length] || c.name === forcedCategories[i % forcedCategories.length]);
    if (fc) picked.push(fc); else picked.push(pickWeighted(picked.map(p => p.id)));
  } else {
    picked.push(pickWeighted(picked.map(p => p.id)));
  }
}

// Rotation: avoid repeating the last-used values.
function rotate(arr, last) { const pool = arr.filter(v => !last.includes(v)); return (pool.length ? pool : arr)[Math.floor(Math.random() * (pool.length ? pool.length : arr.length))]; }
const styleRotation = picked.map((_, i) => rotate(FORMATS, [])); // format varies freely per post

// Recent content summary for the originality engine (last 15 posts).
const recent = memory.slice(-15).map(m => ({ category: m.category, hook: m.hook, headline: m.headline, angle: m.angle, metaphor: m.visual_concept || m.metaphor }));
// Recent poster layouts so the Creator rotates styles instead of repeating (last 8 that have one).
const recentLayouts = memory.slice(-8).map(m => m.layout).filter(Boolean);

// Group rotation: the Nth post ever stored gets groups [(N*4) .. (N*4+3)] wrapped around the pool.
// storeResp.total = records BEFORE this run, so post i in this batch advances the cursor by 4 each.
const groupTargets = picked.map((_, i) => {
  const start = ((storeResp.total || memory.length) + i) * GROUPS_PER_POST % GROUP_POOL.length;
  return { start,
    groups: Array.from({ length: GROUPS_PER_POST }, (_, k) => GROUP_POOL[(start + k) % GROUP_POOL.length]) };
});

return [{ json: {
  config: CONFIG,
  aspect: ASPECTS[CONFIG.IMAGE_ASPECT_RATIO] || ASPECTS['2:3'],
  picks: picked.map(p => ({ id: p.id, name: p.name, core: p.core, subs: p.subs })),
  captionLength: CONFIG.CAPTION_LENGTH === 'rotate' ? CAPTION_LENGTHS[Math.floor(Math.random() * CAPTION_LENGTHS.length)] : CONFIG.CAPTION_LENGTH + ' words',
  recentContent: recent,
  recentLayouts: recentLayouts,
  groupTargets: groupTargets,
  memoryCount: storeResp.total || memory.length,
  generatedAt: new Date().toISOString()
} }];
