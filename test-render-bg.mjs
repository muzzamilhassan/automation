import fs from 'node:fs';

const HF_TOKEN = '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';

async function generateWithHF(prompt) {
  console.log('Generating base image with Hugging Face FLUX...');
  const models = [
    'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell',
    'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-dev'
  ];
  
  for (const url of models) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HF_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ inputs: prompt })
      });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 5000) {
          console.log(`✓ HF image generated (${Math.round(buf.length / 1024)} KB)`);
          return buf;
        }
      } else {
        console.log('HF error:', res.status, (await res.text()).substring(0, 150));
      }
    } catch (e) {
      console.log('HF fetch error:', e.message);
    }
  }
  return null;
}

async function generateWithPollinations(prompt) {
  console.log('Generating base image with Pollinations FLUX...');
  const seed = Math.floor(Math.random() * 1000000);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&seed=${seed}&nologo=true&model=flux-realism&enhance=true`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 5000) {
        console.log(`✓ Pollinations image generated (${Math.round(buf.length / 1024)} KB)`);
        return buf;
      }
    }
  } catch (e) {
    console.log('Pollinations error:', e.message);
  }
  return null;
}

async function renderPoster() {
  const bgPrompt = 'Minimalist luxury editorial aesthetic, warm textured off-white cream background, clean negative space at the top half, lower half has a luxury architectural minimalist hourglass made of polished champagne gold and smoked crystal glass with fine gold sand frozen in mid-flow resting on refined sandstone, soft morning studio lighting, crisp shadows, 8k product photography, award-winning Swiss design';
  
  let baseImg = await generateWithHF(bgPrompt);
  if (!baseImg) {
    baseImg = await generateWithPollinations(bgPrompt);
  }
  
  if (!baseImg) {
    console.error('Failed to generate base image');
    return;
  }
  
  fs.writeFileSync('base-test.jpg', baseImg);
  console.log('✓ Base image saved to base-test.jpg');
}

renderPoster();
