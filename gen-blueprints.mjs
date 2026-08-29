// Generate 3 test images for the Conceptual Breakthroughs blueprints via gpt-image-2 / OpenAI Image API.
import fs from 'node:fs';

const env = fs.readFileSync('C:/Users/Revnix/Documents/youtube-automation/.env', 'utf8');
const KEY = env.match(/^OPENAI_API_KEY=(.+)$/m)[1].trim();
const OUT = 'C:/Users/Revnix/Documents/youtube-automation/';

const BLUEPRINTS = [
  {
    id: 'blueprint-A-impossible-breakthrough',
    name: 'Blueprint A: The Impossible Breakthrough',
    prompt: `A highly clever, premium conceptual social media graphic. CONCEPTUAL BLUEPRINT: The Impossible Breakthrough. SUBJECT & TWIST: A massive, solid heavy grey concrete slab forcefully cracked wide open as a delicate, luminous vibrant green plant seedling erupts upward from beneath, shattering the dense stone with supernatural vigor. BACKGROUND: Monochromatic minimalist slate grey concrete floor with deep tactile fractures and debris. LIGHTING & TEXTURE: Bright crisp top-down morning sunlight illuminating translucent green leaf veins, extreme texture contrast against rough gritty porous concrete. TYPOGRAPHY & TEXT: Bold, clean, modern dark sans-serif typography framed with minimalist editorial brackets reading: "GROW ANYWHERE". TEXT PLACEMENT: Centered in the clean negative space at the upper half of the frame. AESTHETIC: Masterpiece, 8k, award-winning print ad, clever visual metaphor, crisp edges, immaculate negative space, surreal realism. Avoid: messy background, generic lifestyle, random humans, clutter, cheap typography, cursive fonts, cartoonish, low resolution, bad spelling, complex busy backgrounds, watercolor, painting.`
  },
  {
    id: 'blueprint-B-tension-snap',
    name: 'Blueprint B: The Tension Snap',
    prompt: `A highly clever, premium conceptual social media graphic. CONCEPTUAL BLUEPRINT: The Tension Snap. SUBJECT & TWIST: A thick, heavily rusted industrial iron chain caught in the exact micro-second of violently snapping in half. The broken ends are glowing with superheated, bright orange and yellow heat, with sparks and embers flying outward violently. BACKGROUND: Dark, moody, out-of-focus brushed steel or gritty wall. LIGHTING & TEXTURE: Cinematic, dark, with extreme sharp focus on the rusted texture and the bright glowing embers acting as the main light source. TYPOGRAPHY & TEXT: Bold, flawless uppercase editorial typography in white and gold reading: "BREAK YOUR LIMITS". TEXT PLACEMENT: Centered at the top above the snapping chain. AESTHETIC: Masterpiece, 8k, award-winning print ad, clever visual metaphor, crisp edges, immaculate negative space, surreal realism. Avoid: messy background, generic lifestyle, humans, clutter, cheap typography, cartoonish, low resolution, bad spelling, complex busy backgrounds, watercolor, painting.`
  },
  {
    id: 'blueprint-C-surreal-state-change',
    name: 'Blueprint C: The Surreal State Change',
    prompt: `A highly clever, premium conceptual social media graphic. CONCEPTUAL BLUEPRINT: The Surreal State Change. SUBJECT & TWIST: A highly reflective, chrome twin-bell alarm clock that is surrealistically melting and morphing into thick, glossy liquid metal. The liquid drips downward in a frozen moment. BACKGROUND: Pure stark white to light grey seamless studio background. LIGHTING & TEXTURE: Pristine advertising studio lighting, hyper-glossy reflections on the chrome, crisp 3D realism. TYPOGRAPHY & TEXT: Bold, flawless black editorial typography reading: "Don't waste time." A single drip of the clock is about to touch the text. TEXT PLACEMENT: Centered directly below the melting clock. AESTHETIC: Masterpiece, 8k, award-winning print ad, clever visual metaphor, crisp edges, immaculate negative space, surreal realism. Avoid: messy background, generic lifestyle, humans, clutter, cheap typography, cartoonish, low resolution, bad spelling, complex busy backgrounds, watercolor, painting.`
  }
];

for (const b of BLUEPRINTS) {
  console.log(`Generating ${b.name}...`);
  try {
    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-image-2', prompt: b.prompt, size: '1024x1024', n: 1 })
    });
    const j = await r.json();
    const d0 = j.data && j.data[0];
    if (d0 && d0.b64_json) {
      const outPath = OUT + b.id + '.jpg';
      fs.writeFileSync(outPath, Buffer.from(d0.b64_json, 'base64'));
      console.log(`[SUCCESS] Saved ${outPath} (${Math.round(d0.b64_json.length * 0.75 / 1024)} KB)`);
    } else if (d0 && d0.url) {
      const imgRes = await fetch(d0.url);
      const arrBuffer = await imgRes.arrayBuffer();
      const outPath = OUT + b.id + '.jpg';
      fs.writeFileSync(outPath, Buffer.from(arrBuffer));
      console.log(`[SUCCESS] Downloaded & Saved ${outPath}`);
    } else {
      console.log(`[FAIL] ${b.id}:`, JSON.stringify(j).substring(0, 200));
    }
  } catch (e) {
    console.error(`[ERROR] ${b.id}:`, e.message);
  }
}
