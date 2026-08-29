let ai = {};
try {
  const resp = ($json.choices && $json.choices[0] && $json.choices[0].message && $json.choices[0].message.content) || $json.response || ($json.candidates && $json.candidates[0].content.parts[0].text) || '{}';
  ai = typeof resp === 'string' ? JSON.parse(resp) : resp;
} catch (e) { throw new Error('AI returned non-JSON: ' + String($json.response || '').substring(0, 150)); }
const category = $('Blend and Direct').first().json.category;
const tags = (ai.hashtags || []).filter(h => h.startsWith('#')).join(' ');
const caption = (ai.caption_title || '') + '\n\n' + (ai.description || '') + (tags ? '\n\n' + tags : '');

// Fixed premium art direction per category (style DNA is constant; the AI only picks the subject)
const GEMINI_MODEL = 'gemini-3.1-flash-image';
const ART = {
  motivation: 'warm editorial lifestyle photography, golden-hour sunlight, soft long shadows, serene minimalist composition, generous empty space in the center for typography, muted earth tones with one warm accent, subtle film grain',
  tip: 'clean modern workspace flat-lay photographed from above, natural window light, muted earth-tone palette, tactile paper and wood textures, gentle shadows, minimal composition with empty center',
  aitool: 'macro product photography of a sleek device on a matte charcoal surface, single electric-cyan rim light, dark moody background with soft bokeh, ultra-shallow depth of field, premium tech-advertising look',
  freetool: 'minimal Scandinavian desk scene, laptop with softly glowing screen in creamy bokeh, warm neutral palette, airy negative space in the middle, high-key soft light',
  businessq: 'modern glass-and-steel architecture photographed from a low angle, dramatic directional light with geometric shadows, deep navy blues with one warm amber accent, editorial magazine look'
};
const subject = String(ai.image_subject || ai.image_prompt || '').substring(0, 220);
const fullPrompt = 'Premium editorial social-media background image: ' + (subject || 'abstract premium texture, elegant minimal scene') + '. Art direction: ' + (ART[category] || ART.tip) + '. Vertical 2:3 portrait composition. Absolutely NO text, words, letters, numbers, logos or watermarks - pure photographic background only.';

// Hugging Face FLUX.1-schnell via fal-ai provider (free with HF token).
const hfPayload = {
  prompt: fullPrompt,
  image_size: { width: 1000, height: 1500 },
  num_inference_steps: 4,
  seed: Math.floor(Math.random() * 999999)
};

// Fallback if HF is unavailable: same premium prompt via Pollinations, vertical 2:3.
const imageUrl = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(fullPrompt) + '?width=1000&height=1500&nologo=true&model=flux&seed=' + Math.floor(Math.random() * 99999);

// Every category now gets a photographic background + crisp local typography on top.
const overlayTitle = category === 'motivation'
  ? (ai.lines || []).slice(0, 4).join(' ')
  : String(ai.headline || ai.caption_title || 'INSIGHT').substring(0, 40);
const overlayUrl = 'http://yt-image-tools:3210/overlay?title=' + encodeURIComponent(overlayTitle) + (category === 'businessq' ? '&tstyle=serif' : '');

const fbUrl = 'https://graph.facebook.com/v20.0/114550268199751/photos?access_token=' + encodeURIComponent($env.FB_PAGE_TOKEN) + '&caption=' + encodeURIComponent(caption);
return [{ json: { hfPayload: hfPayload, imageUrl: imageUrl, overlayUrl: overlayUrl, fbUrl: fbUrl, needsOverlay: true, caption: caption, category: category } }];
