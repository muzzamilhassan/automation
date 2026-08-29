import fs from 'node:fs';

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function wrapText(text, maxChars = 34) {
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

// Build 100% exact match SVG for the left-aligned layout like "OWN THE PIPELINES"
function buildExactLayoutSvg(w, h, data) {
  const hLines = data.headlineLines || ['TIME IS A', 'LIQUID'];
  const pLines = wrapText(data.insight, 36);
  const rule = data.rule || 'Rule: Buy back your hours before they evaporate.';

  const startX = 72;
  const startY = 110;

  // Render Headline lines in massive bold condensed typography
  const headSvg = hLines.map((line, i) =>
    `<text x="${startX}" y="${startY + i * 82}" font-family="Arial Black, Impact, Arial, sans-serif" font-size="78" font-weight="900" fill="#0f172a" letter-spacing="1.5">${esc(line.toUpperCase())}</text>`
  ).join('\n');

  const pStartY = startY + hLines.length * 82 + 55;
  const pSvg = pLines.map((l, i) =>
    `<text x="${startX}" y="${pStartY + i * 34}" font-family="Arial, Helvetica, sans-serif" font-size="21.5" font-weight="500" fill="#1e293b" letter-spacing="0.1">${esc(l)}</text>`
  ).join('\n');

  const ruleY = h - 110;

  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Soft white marble-compatible scrim on left half for 100% contrast & legibility -->
    <linearGradient id="leftScrim" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.94"/>
      <stop offset="42%" stop-color="#ffffff" stop-opacity="0.88"/>
      <stop offset="60%" stop-color="#ffffff" stop-opacity="0.45"/>
      <stop offset="85%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <!-- Left Scrim -->
  <rect x="0" y="0" width="${Math.round(w * 0.62)}" height="${h}" fill="url(#leftScrim)"/>

  <!-- Main Headline -->
  ${headSvg}

  <!-- Body Insight Paragraph -->
  ${pSvg}

  <!-- Thin Dark Divider Line -->
  <line x1="${startX}" y1="${ruleY - 24}" x2="${startX + 280}" y2="${ruleY - 24}" stroke="#334155" stroke-width="1.8" stroke-opacity="0.7"/>

  <!-- Bottom Rule -->
  <text x="${startX}" y="${ruleY + 12}" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="800" fill="#0f172a">${esc(rule)}</text>
</svg>`;
}

async function generateExactMatchPost() {
  console.log('1. Generating 3D Conceptual Background with FLUX...');
  const seed = Math.floor(Math.random() * 999999);
  
  // Blueprint C: Right side contains luxury melting chrome/gold hourglass on white marble shelf
  const scenePrompt = 'Luxury advertising photography, right half shows a solid brushed champagne gold pipe and valve mounted to a white Carrara marble wall pouring liquid mercury silver stream into a black stone basin on a marble shelf, left half is clean empty white marble wall with ample negative space, soft ambient studio daylight, Hasselblad 80mm macro photography, 8k resolution, crisp photorealistic details';
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(scenePrompt)}?width=1024&height=1024&seed=${seed}&nologo=true&model=flux-realism&enhance=true`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pollinations error: ${res.status}`);
  const bgBuf = Buffer.from(await res.arrayBuffer());
  console.log(`   ✓ Fetched scene background (${Math.round(bgBuf.length / 1024)} KB)`);

  // 2. Build exact matching SVG
  const svg = buildExactLayoutSvg(1024, 1024, {
    headlineLines: ['OWN THE', 'PIPELINES'],
    insight: 'Job income is a bucket; it stops when you stop carrying it. Wealth is a pipeline—assets and systems that push cash to you on schedule. Each month, convert earned income into one more valve you own (cash-flowing equity, royalties, lending, or distribution), track payback period, and reinvest until your living costs are covered.',
    rule: 'Rule: Replace hours with flows.'
  });

  // 3. Composite using image-tools / format-variant
  console.log('2. Compositing exact vector typography overlay...');
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const multipartBody = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="headline"\r\n\r\nOWN THE PIPELINES\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="insight"\r\n\r\nJob income is a bucket; it stops when you stop carrying it. Wealth is a pipeline—assets and systems that push cash to you on schedule. Each month, convert earned income into one more valve you own (cash-flowing equity, royalties, lending, or distribution), track payback period, and reinvest until your living costs are covered.\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="takeaway"\r\n\r\nRule: Replace hours with flows.\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="style"\r\n\r\neditorial-clean\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="img.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
    bgBuf,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);

  // Send to image-tools overlay
  const overlayRes = await fetch('http://localhost:3210/overlay', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: multipartBody
  });

  // We also save both and composite using sharp via docker or fetch
  const outFile = 'post-preview-exact-match.jpg';
  
  // Direct Sharp composite via a short node script in docker or overlay endpoint
  const compRes = await fetch('http://localhost:3210/format-variant?style=editorial-clean', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: multipartBody
  });

  if (compRes.ok) {
    const finalBuf = Buffer.from(await compRes.arrayBuffer());
    fs.writeFileSync(outFile, finalBuf);
    console.log(`   ✓ Saved: ${outFile} (${Math.round(finalBuf.length / 1024)} KB)`);
  } else {
    fs.writeFileSync('temp-bg.jpg', bgBuf);
    fs.writeFileSync('temp-overlay.svg', Buffer.from(svg));
    console.log('Saved temp files for compositing');
  }
}

generateExactMatchPost().catch(console.error);
