import fs from 'node:fs';

async function formatVariant(imgFile, headline, insight, takeaway, tag, style, outFile) {
  const imgBuf = fs.readFileSync(imgFile);
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const parts = [
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="headline"\r\n\r\n${headline}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="insight"\r\n\r\n${insight}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="takeaway"\r\n\r\n${takeaway}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="tag"\r\n\r\n${tag}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="style"\r\n\r\n${style}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="img.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
    imgBuf,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ];

  const res = await fetch('http://localhost:3210/format-variant', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: Buffer.concat(parts)
  });

  if (res.ok) {
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(outFile, buf);
    console.log('✓ Rendered:', outFile, '(' + Math.round(buf.length / 1024) + ' KB)');
  } else {
    console.error('Error on', outFile, ':', res.status, await res.text());
  }
}

async function main() {
  // 1. Bracket Blueprint Style (like GROW ANYWHERE)
  await formatVariant(
    'C:/Users/Revnix/.gemini/antigravity-ide/brain/d74f0000-4b35-485f-a635-487f4aba64d5/variant-pro-breakthrough.jpg',
    'GROW ANYWHERE',
    'True resilience is converting the weight into kinetic force. When you refuse to surrender, the heaviest stone becomes your launching pad.',
    'Rule: Outlast the friction, claim the territory.',
    'RELIQ NORTH',
    'bracket',
    'C:/Users/Revnix/.gemini/antigravity-ide/brain/d74f0000-4b35-485f-a635-487f4aba64d5/variant-live-bracket-sample.jpg'
  );

  // 2. Full Value-Dense Glassmorphism Card Style
  await formatVariant(
    'C:/Users/Revnix/.gemini/antigravity-ide/brain/d74f0000-4b35-485f-a635-487f4aba64d5/test-3d-cinematic.jpg',
    'THE ASYMMETRY OF SILENCE',
    'When your assets compound in complete privacy, you eliminate market arbitrage and predatory scrutiny. Sovereign power is never having to announce your next move.',
    'Rule: Build in private, execute in sovereignty.',
    'SILENT WEALTH',
    'value-dense',
    'C:/Users/Revnix/.gemini/antigravity-ide/brain/d74f0000-4b35-485f-a635-487f4aba64d5/variant-live-valuedense-sample.jpg'
  );
}

main().catch(console.error);
