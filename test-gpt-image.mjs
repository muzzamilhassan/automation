import fs from 'node:fs';

const env = fs.readFileSync('.env', 'utf8');
const KEY = env.match(/^OPENAI_API_KEY=(.+)$/m)[1].trim();

async function testGptImage2() {
  console.log('Testing gpt-image-2 generation...');
  const prompt = 'A highly clever, premium conceptual social media graphic. CONCEPTUAL BLUEPRINT: The Impossible Breakthrough. SUBJECT: A massive dark grey concrete slab forcefully cracked wide open with a luminous green sprout erupting upward. TYPOGRAPHY: Bold dark sans-serif typography reading [ GROW ANYWHERE ].';
  try {
    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-image-2', prompt, size: '1024x1024', n: 1 })
    });
    console.log('Status:', r.status);
    const j = await r.json();
    console.log('Response:', JSON.stringify(j).substring(0, 300));
  } catch (e) {
    console.log('Error:', e.message);
  }
}
testGptImage2();
