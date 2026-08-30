import fs from 'node:fs';

const envStr = (() => { try { return fs.readFileSync('.env', 'utf8'); } catch (e) { return ''; } })();
const HF_TOKEN = process.env.HF_TOKEN || (envStr.match(/^HF_TOKEN=(.+)$/m) || [])[1]?.trim() || '';

async function checkHFModels() {
  const models = [
    'black-forest-labs/FLUX.1-schnell',
    'black-forest-labs/FLUX.1-dev',
    'stabilityai/stable-diffusion-xl-base-1.0',
    'runwayml/stable-diffusion-v1-5',
    'prompthero/openjourney'
  ];

  for (const m of models) {
    try {
      const res = await fetch(`https://api-inference.huggingface.co/models/${m}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${HF_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ inputs: 'A simple test prompt' })
      });
      console.log(`${m}: ${res.status}`);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        console.log(`✓ ${m} generated ${buf.length} bytes`);
        return m;
      } else {
        console.log(`  msg: ${(await res.text()).substring(0, 150)}`);
      }
    } catch (e) {
      console.log(`${m} error:`, e.message);
    }
  }
}

checkHFModels();
