import fs from 'node:fs';

const env = fs.readFileSync('.env', 'utf8');
const KEY = env.match(/^GEMINI_API_KEY=(.+)$/m)[1].trim();

async function testImagen() {
  console.log('Testing Imagen 3 API...');
  const prompt = 'A masterpiece luxury editorial graphic design poster, 1:1 square format. Left side has clean empty white Carrara marble negative space. Right side has a brushed brass plumbing valve pouring liquid mercury into a black marble bowl. Photorealistic 8k, award-winning Swiss ad photography.';
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${KEY}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio: '1:1', outputMimeType: 'image/jpeg' }
      })
    });
    console.log('Status:', res.status);
    const data = await res.json();
    if (res.ok && data.predictions?.[0]?.bytesBase64Encoded) {
      const buf = Buffer.from(data.predictions[0].bytesBase64Encoded, 'base64');
      fs.writeFileSync('imagen-test.jpg', buf);
      console.log('✓ Imagen 3 generated image successfully! Size:', buf.length);
    } else {
      console.log('Imagen response:', JSON.stringify(data).substring(0, 300));
    }
  } catch (e) {
    console.log('Imagen error:', e.message);
  }
}

testImagen();
