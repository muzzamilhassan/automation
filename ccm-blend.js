const CATEGORIES = ['motivation', 'motivation', 'tip', 'aitool', 'freetool', 'businessq'];
const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
let inspiration = [];
for (const item of $input.all()) {
  const j = item.json;
  const raw = typeof j === 'string' ? j : (j.data || JSON.stringify(j));
  if (raw && raw.charAt(0) === '<') {
    const items = [...raw.matchAll(/<item>[\s\S]*?<\/item>/g)].slice(0, 8);
    for (const m of items) {
      const t = (m[0].match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1];
      if (t && t.length > 8) inspiration.push(t.trim());
    }
  } else if (j && j.hits) {
    for (const h of j.hits.slice(0, 8)) if (h.title) inspiration.push(h.title);
  }
}
if (!inspiration.length) inspiration = ['discipline beats motivation', 'small daily improvements'];
const guide = {
  motivation: 'A punchy motivational quote poster. Provide 2-4 SHORT lines (max 14 chars each), Title Case.',
  tip: 'A practical tech/career tip. Provide a 3-5 word bold headline for the image plus the tip text.',
  aitool: 'An insight about AI coding tools (Claude Code, Copilot, Cursor etc). Provide a 3-5 word headline.',
  freetool: 'A free tool recommendation for professionals. Provide a 3-5 word headline naming the benefit.',
  businessq: 'A thought-provoking business question that makes owners stop scrolling. Provide the question as a short headline.'
};
const subjectGuide = {
  motivation: 'a serene real-life photographic scene that metaphorically matches the quote (e.g. lone runner at sunrise, mountain trail, calm workspace at dawn)',
  tip: 'a concrete object scene related to the tip (e.g. mechanical keyboard close-up, open notebook with coffee)',
  aitool: 'a premium futuristic tech scene related to the insight (e.g. glowing terminal, holographic interface)',
  freetool: 'a clean minimal workspace scene related to the tool (e.g. laptop with soft screen glow, organized desk)',
  businessq: 'a modern business scene that fits the question (e.g. glass office tower, strategy table, city skyline)'
};
const prompt = 'You are a viral content creator for a premium Facebook page. CATEGORY: ' + category + '\nTASK: ' + guide[category] + '\nINSPIRATION (recent trending titles in this niche - get the vibe, NEVER copy them):\n' + inspiration.slice(0, 10).join('\n') + '\n\nCreate ORIGINAL content. Return ONLY valid JSON:\n{"lines": ["line1", "line2"] (only for motivation category, else []), "headline": "3-5 word image headline", "image_subject": "' + subjectGuide[category] + '", "caption_title": "post headline", "description": "2-3 sentence engaging text", "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4"]}';
return [{ json: {
  category: category,
  payload: { model: 'gpt-5', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' } },
  ollamaPayload: { model: 'llama3.1:8b', prompt: prompt, format: 'json', stream: false, options: { temperature: 0.85 } }
} }];
