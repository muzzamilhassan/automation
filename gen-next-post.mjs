import fs from 'node:fs';
import { exec } from 'node:child_process';

const env = fs.readFileSync('.env', 'utf8');
const KEY = env.match(/^OPENAI_API_KEY=(.+)$/m)[1].trim();

const prompt = `A masterpiece luxury editorial graphic design poster, 1:1 square format, clean minimalist layout on fine textured warm cream paper.

UPPER SECTION TYPOGRAPHY:
Large bold, authoritative black sans-serif uppercase headline reading:
PATIENCE IS A WEAPON

Directly below the headline, a clean, highly legible left-aligned editorial paragraph in modern sans-serif:
The amateur seeks instant applause; the strategist operates on decade-long horizons.
When your foundation is engineered for endurance, short-term turbulence is irrelevant.
Time destroys those who rush, and rewards those who cannot be shaken.

Below the paragraph, a thin horizontal golden accent line, and a bold takeaway line reading:
Rule: Out-wait those who seek shortcuts.

LOWER SECTION VISUAL OBJECT:
On a refined light stone surface, a luxury architectural minimalist hourglass crafted from solid brushed champagne gold and smoked crystal glass with dense fine gold sand flowing in a frozen moment, casting crisp soft morning shadows.

Immaculate negative space, 8k resolution, Swiss design aesthetic, award-winning editorial print quality.`;

async function generate() {
  console.log('Generating image with OpenAI API...');
  let res, data;
  
  // Try gpt-image-2 first
  for (const model of ['gpt-image-2', 'dall-e-3']) {
    try {
      console.log(`Trying model: ${model}...`);
      res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          size: '1024x1024',
          n: 1
        })
      });
      data = await res.json();
      if (res.ok) {
        console.log(`Success with ${model}!`);
        break;
      } else {
        console.log(`${model} error:`, data.error?.message || data);
      }
    } catch (err) {
      console.log(`${model} fetch error:`, err.message);
    }
  }

  const d0 = data && data.data && data.data[0];
  if (d0) {
    const outFile = 'post-preview-patience-is-a-weapon.jpg';
    if (d0.b64_json) {
      fs.writeFileSync(outFile, Buffer.from(d0.b64_json, 'base64'));
      console.log(`✓ Saved ${outFile} from b64`);
    } else if (d0.url) {
      const imgRes = await fetch(d0.url);
      const arr = await imgRes.arrayBuffer();
      fs.writeFileSync(outFile, Buffer.from(arr));
      console.log(`✓ Downloaded & Saved ${outFile}`);
    }
  } else {
    console.error('Failed to get image data:', data);
  }
}

generate();
