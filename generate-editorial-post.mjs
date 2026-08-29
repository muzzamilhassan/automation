import fs from 'node:fs';

async function generateEditorialPost({ headline, insight_body, takeaway, subject_prompt, outFile }) {
  console.log(`\n========================================`);
  console.log(`Generating: "${headline}"`);
  console.log(`========================================`);

  // 1. Fetch High-Res 3D Minimalist Scene from Pollinations FLUX
  const seed = Math.floor(Math.random() * 999999);
  const prompt = `${subject_prompt}, minimalist product photography, bottom half object placement, top half clean empty negative space, soft ambient natural lighting, Hasselblad 80mm macro photography, luxury aesthetic, 8k resolution, photorealistic`;
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&seed=${seed}&nologo=true&model=flux-realism&enhance=true`;

  console.log('1. Fetching 3D scene from FLUX...');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch error: ${res.status}`);
  const bgBuf = Buffer.from(await res.arrayBuffer());
  console.log(`   ✓ Fetched background (${Math.round(bgBuf.length / 1024)} KB)`);

  // 2. Composite using image-tools format-variant with style="editorial-clean"
  console.log('2. Compositing Swiss editorial typography...');
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const parts = [
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="headline"\r\n\r\n${headline}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="insight"\r\n\r\n${insight_body}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="takeaway"\r\n\r\n${takeaway}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="style"\r\n\r\neditorial-clean\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="img.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
    bgBuf,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ];

  const overlayRes = await fetch('http://localhost:3210/format-variant?style=editorial-clean', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: Buffer.concat(parts)
  });

  if (overlayRes.ok) {
    const finalBuf = Buffer.from(await overlayRes.arrayBuffer());
    fs.writeFileSync(outFile, finalBuf);
    console.log(`   ✓ Successfully Saved: ${outFile} (${Math.round(finalBuf.length / 1024)} KB)`);
    return outFile;
  } else {
    throw new Error(`Overlay error: ${overlayRes.status} ${await overlayRes.text()}`);
  }
}

async function main() {
  await generateEditorialPost({
    headline: 'PATIENCE IS A WEAPON',
    insight_body: 'The amateur seeks instant applause; the strategist operates on decade-long horizons. When your foundation is engineered for endurance, short-term turbulence is irrelevant.',
    takeaway: 'Rule: Out-wait those who seek shortcuts.',
    subject_prompt: 'On a refined light sand-beige marble surface, a luxury architectural minimalist hourglass crafted from brushed champagne gold and smoked crystal glass with dense fine gold sand in mid-flow, soft morning shadows',
    outFile: 'post-preview-patience-is-a-weapon.jpg'
  });
}

main().catch(console.error);
