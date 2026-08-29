import fs from 'node:fs';

const envStr = fs.readFileSync('.env', 'utf8');
const key = envStr.match(/^GEMINI_API_KEY=(.+)$/m)?.[1]?.trim();

async function test() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: 'Return a JSON object: {"status": "success", "headline": "STAY SILENT"}' }] }]
    })
  });
  const data = await res.json();
  console.log('Gemini status:', res.status);
  console.log('Gemini candidates:', JSON.stringify(data.candidates, null, 2));
}
test().catch(console.error);
