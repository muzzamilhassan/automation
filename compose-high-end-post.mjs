import fs from 'node:fs';

async function fetchBackground(prompt) {
  console.log('Fetching 3D minimalist scene...');
  const seed = Math.floor(Math.random() * 999999);
  // High quality FLUX model with prompt engineered for clean top-left negative space
  const fullPrompt = `high-end minimalist product photography, lower half contains a luxury optical crystal prism refracting a single sharp beam of golden light on white Carrara marble, top half is clean empty minimalist off-white studio background with ample negative space, soft ambient natural lighting, Hasselblad 80mm macro photography, award winning Swiss luxury aesthetic, 8k resolution, photorealistic`;
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}?width=1024&height=1024&seed=${seed}&nologo=true&model=flux-realism&enhance=true`;
  
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pollinations error: ${res.status}`);
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

function buildEditorialSvg(w, h, data) {
  const headline = data.headline || 'FOCUS IS ELIMINATION';
  const lines = data.insight_lines || [
    'Clarity is not deciding what to do; it is the',
    'courage to delete everything else. Every',
    'secondary goal is a direct tax on progress.',
    'Mastery begins when you ruthlessly subtract.'
  ];
  const rule = data.rule || 'Rule: Subtract until only the essential remains.';

  const startX = 64;
  const startY = 110;
  
  // Headline lines (in case it breaks into 2 lines)
  const headWords = headline.split(' ');
  let hLine1 = headline, hLine2 = '';
  if (headWords.length > 2) {
    hLine1 = headWords.slice(0, 2).join(' ');
    hLine2 = headWords.slice(2).join(' ');
  }

  const pSvg = lines.map((l, i) =>
    `<text x="${startX}" y="${startY + 150 + i * 36}" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="500" fill="#1e293b" letter-spacing="0.2">${l}</text>`
  ).join('\n');

  const ruleY = startY + 160 + lines.length * 36 + 25;

  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Soft scrim for maximum text legibility -->
    <linearGradient id="textScrim" x1="0" y1="0" x2="0.6" y2="0.6">
      <stop offset="0%" stop-color="#fafaf9" stop-opacity="0.95"/>
      <stop offset="50%" stop-color="#fafaf9" stop-opacity="0.80"/>
      <stop offset="85%" stop-color="#fafaf9" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#fafaf9" stop-opacity="0"/>
    </linearGradient>
  </defs>
  
  <!-- Subtle gradient scrim behind text area for crisp contrast -->
  <rect x="0" y="0" width="${Math.round(w * 0.75)}" height="${Math.round(h * 0.65)}" fill="url(#textScrim)"/>

  <!-- Main Headline -->
  <text x="${startX}" y="${startY}" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="900" fill="#09090b" letter-spacing="1.5">${hLine1}</text>
  ${hLine2 ? `<text x="${startX}" y="${startY + 68}" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="900" fill="#09090b" letter-spacing="1.5">${hLine2}</text>` : ''}

  <!-- Paragraph Body -->
  ${pSvg}

  <!-- Divider Line -->
  <line x1="${startX}" y1="${ruleY - 14}" x2="${startX + 400}" y2="${ruleY - 14}" stroke="#b45309" stroke-width="1.8" stroke-opacity="0.75"/>

  <!-- Takeaway Rule -->
  <text x="${startX}" y="${ruleY + 16}" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="800" fill="#09090b">${rule}</text>
</svg>`;
}

async function run() {
  const bg = await fetchBackground();
  fs.writeFileSync('raw-bg.jpg', bg);
  console.log('✓ Saved raw-bg.jpg');

  const svg = buildEditorialSvg(1024, 1024, {
    headline: 'FOCUS IS ELIMINATION',
    insight_lines: [
      'Clarity is not deciding what to do; it is the',
      'courage to delete everything else. Every secondary',
      'goal you entertain is an active tax on your energy.',
      'Mastery begins when you ruthlessly subtract.'
    ],
    rule: 'Rule: Subtract until only the essential remains.'
  });

  // Call image-tools overlay via multipart
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const multipartBody = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nFOCUS IS ELIMINATION\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="img.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
    bg,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);

  // Use custom overlay endpoint or format-variant
  const res = await fetch('http://localhost:3210/format-variant', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="headline"\r\n\r\nFOCUS IS ELIMINATION\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="insight"\r\n\r\nClarity is not deciding what to do; it is the courage to delete everything else. Every secondary goal you entertain is an active tax on your energy.\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="takeaway"\r\n\r\nRule: Subtract until only the essential remains.\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="tag"\r\n\r\nSTRATEGIC POWER\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="style"\r\n\r\nvalue-dense\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="img.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
      bg,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ])
  });

  if (res.ok) {
    const finalBuf = Buffer.from(await res.arrayBuffer());
    const outFile = 'post-preview-focus-is-elimination.jpg';
    fs.writeFileSync(outFile, finalBuf);
    console.log(`✓ Saved ${outFile} (${Math.round(finalBuf.length / 1024)} KB)`);
  } else {
    console.error('image-tools error:', res.status, await res.text());
  }
}

run().catch(console.error);
