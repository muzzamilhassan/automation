import fs from 'node:fs';

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function wrapText(text, maxChars = 40) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length <= maxChars) {
      cur = (cur + ' ' + w).trim();
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export function buildVariantSvg(w, h, aiData) {
  const headline = esc(aiData.headline || 'GROW ANYWHERE').toUpperCase();
  const insightLines = wrapText(aiData.insight_body || 'True power is built in silence where market noise cannot dilute your strategic focus.', 42);
  const takeaway = esc(aiData.takeaway || 'Rule: Value privacy over applause.').toUpperCase();
  const brand = esc(aiData.brand || 'SILENT WEALTH').toUpperCase();

  const insightSvg = insightLines.map((l, i) =>
    `<text x="50%" y="${h - 180 + i * 32}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="600" fill="#f1f5f9">${esc(l)}</text>`
  ).join('\n');

  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="topGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.88"/>
      <stop offset="60%" stop-color="#000000" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="botGrad" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.95"/>
      <stop offset="60%" stop-color="#000000" stop-opacity="0.80"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <!-- Top Scrim -->
  <rect width="${w}" height="${Math.round(h * 0.35)}" fill="url(#topGrad)"/>
  <!-- Top Tag -->
  <text x="50%" y="70" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700" fill="#94a3b8" letter-spacing="4">[ ${brand} ]</text>
  <!-- Main Headline -->
  <text x="50%" y="135" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="900" fill="#ffffff" letter-spacing="2" stroke="#000000" stroke-width="2" paint-order="stroke">${headline}</text>
  <!-- Bottom Scrim -->
  <rect y="${Math.round(h * 0.52)}" width="${w}" height="${Math.round(h * 0.48)}" fill="url(#botGrad)"/>
  <!-- Insight Paragraph -->
${insightSvg}
  <!-- Takeaway Rule Box -->
  <rect x="${Math.round(w * 0.5 - 240)}" y="${h - 80}" width="480" height="46" rx="23" fill="rgba(255,180,0,0.18)" stroke="#fbbf24" stroke-width="1.5"/>
  <text x="50%" y="${h - 51}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="800" fill="#fef08a" letter-spacing="1">${takeaway}</text>
</svg>`;
}

async function run() {
  const svg = buildVariantSvg(1024, 1024, {
    headline: 'THE ASYMMETRY OF SILENCE',
    insight_body: 'True leverage is built in the shadows where your competition cannot calculate your next move. When you broadcast your strategy, you invite unnecessary friction and arbitrage.',
    takeaway: 'Rule: Assets over applause, always.',
    brand: 'SILENT WEALTH'
  });

  // Call image-tools overlay or fitfb
  const imgBuf = fs.readFileSync('post-116157974886564-1787856065166.jpg');
  
  // Composite with image-tools server via multipart
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const multipartBody = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nTHE ASYMMETRY OF SILENCE\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="img.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
    imgBuf,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);

  const res = await fetch('http://localhost:3210/overlay', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: multipartBody
  });

  if (res.ok) {
    const compBuf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync('C:/Users/Revnix/.gemini/antigravity-ide/brain/d74f0000-4b35-485f-a635-487f4aba64d5/variant-composed-post.jpg', compBuf);
    console.log('✓ Composited Masterpiece Post Size:', compBuf.length);
  } else {
    console.log('Overlay response:', res.status, await res.text());
  }
}

run().catch(console.error);
