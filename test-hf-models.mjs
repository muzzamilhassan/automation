import fs from 'node:fs';

const env = fs.readFileSync('.env', 'utf8');
const HF_TOKEN = env.match(/^HF_TOKEN=(.+)$/m)?.[1]?.trim();
const GEMINI_API_KEY = env.match(/^GEMINI_API_KEY=(.+)$/m)?.[1]?.trim();

console.log('Testing image generation backends...');
console.log('HF_TOKEN present:', Boolean(HF_TOKEN));
console.log('GEMINI_API_KEY present:', Boolean(GEMINI_API_KEY));

const prompt = `A masterpiece luxury editorial graphic design poster, 1:1 square format. LEFT SIDE: clean empty white marble background with bold black typography reading 'OWN THE PIPELINES'. Insight paragraph below explaining leverage. Bottom line 'Rule: Replace hours with flows.' RIGHT SIDE: Brushed brass pipe mounted on white Carrara marble wall pouring liquid mercury into a minimalist black stone bowl. 8k resolution, award-winning Swiss ad photography.`;

// 1. Test HF Inference API (new router endpoint and legacy endpoint)
async function testHF() {
  const models = [
    'black-forest-labs/FLUX.1-dev',
    'black-forest-labs/FLUX.1-schnell',
    'stabilityai/stable-diffusion-3.5-large'
  ];

  for (const m of models) {
    try {
      console.log(`[HF] Testing ${m}...`);
      const res = await fetch(`https://router.huggingface.co/hf-inference/models/${m}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${HF_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ inputs: prompt })
      });
      console.log(`[HF] ${m} status:`, res.status);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        console.log(`[HF] ${m} SUCCESS! Image size:`, buf.length);
        fs.writeFileSync(`hf-${m.split('/')[1]}.jpg`, buf);
        return { success: true, model: m, buf };
      } else {
        const txt = await res.text();
        console.log(`[HF] ${m} response:`, txt.substring(0, 200));
      }
    } catch (e) {
      console.log(`[HF] ${m} error:`, e.message);
    }
  }
  return { success: false };
}

// 2. Test Pollinations FLUX.1-dev
async function testPollinations() {
  try {
    console.log('[Pollinations] Testing flux-dev / flux-realism...');
    const seed = 42;
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&seed=${seed}&nologo=true&model=flux&enhance=true`;
    const res = await fetch(url);
    console.log('[Pollinations] status:', res.status);
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      console.log('[Pollinations] SUCCESS! Image size:', buf.length);
      fs.writeFileSync('pollinations-flux.jpg', buf);
      return { success: true, buf };
    }
  } catch (e) {
    console.log('[Pollinations] error:', e.message);
  }
  return { success: false };
}

async function run() {
  await testHF();
  await testPollinations();
}

run();
