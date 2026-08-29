import fs from 'node:fs';

const BLUEPRINTS = [
  {
    id: 'blueprint-A-impossible-breakthrough',
    name: 'Blueprint A: The Impossible Breakthrough',
    headline: 'GROW ANYWHERE',
    style: 'editorial-clean',
    insight: 'True resilience is converting the weight above you into kinetic force. When you refuse to surrender, the heaviest concrete becomes your launching pad. Life finds a way where comfort never dared to look.',
    takeaway: 'Rule: Outlast the friction, claim the ground.',
    prompt: 'Ultra-luxury minimalist advertising photography. Composition: the right 40% of the frame shows a massive solid raw grey concrete block cracked open with a delicate, luminous vibrant green plant seedling bursting through with translucent glowing leaves. The left 60% of the frame is completely clean, empty, minimalist soft white concrete studio background with wide open negative space. Bright crisp top-down morning sunlight, sharp tactile textures, award-winning Swiss print ad photography, 8k resolution.'
  },
  {
    id: 'blueprint-B-tension-snap',
    name: 'Blueprint B: The Tension Snap',
    headline: 'BREAK YOUR LIMITS',
    style: 'editorial-dark',
    insight: 'Every barrier that holds you back is brittle under concentrated pressure. The moment of release is violent and sudden—what seemed unbreakable shatters in a microsecond when conviction peaks.',
    takeaway: 'Rule: Pressure either crushes you or frees you.',
    prompt: 'Ultra-luxury cinematic advertising photography. Composition: the right 40% of the frame shows a thick, heavily rusted industrial iron chain caught in the exact micro-second of violently snapping with superheated molten glowing orange sparks and embers flying outward. The left 60% of the frame is completely clean, empty, dark brushed steel background with wide open negative space. Cinematic moody rim lighting, sharp rusted textures, 8k resolution.'
  },
  {
    id: 'blueprint-C-surreal-state-change',
    name: 'Blueprint C: The Surreal State Change',
    headline: "DON'T WASTE TIME",
    style: 'editorial-clean',
    insight: 'Time does not wait for preparation; it flows continuously into the void. When you hoard hours in hesitation, they evaporate. Convert transient seconds into durable assets that outlive your presence.',
    takeaway: 'Rule: Buy back your hours before they melt away.',
    prompt: 'Ultra-luxury surreal advertising photography. Composition: the right 40% of the frame shows a classic chrome and gold twin-bell alarm clock surrealistically melting into glossy liquid metal dripping into a black marble bowl on a white Carrara marble shelf. The left 60% of the frame is completely clean, empty, pristine white studio marble wall with wide open negative space. Pristine advertising studio lighting, hyper-glossy reflections, 8k resolution.'
  }
];

async function generate(b) {
  console.log(`\n========================================`);
  console.log(`Generating ${b.name}...`);
  console.log(`Headline: "${b.headline}"`);
  console.log(`========================================`);

  const seed = Math.floor(Math.random() * 999999);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(b.prompt)}?width=1024&height=1024&seed=${seed}&nologo=true&model=flux-realism&enhance=true`;

  console.log('1. Rendering 3D Scene with FLUX...');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch error: ${res.status}`);
  const bgBuf = Buffer.from(await res.arrayBuffer());

  console.log('2. Compositing Swiss Left-Column Typography Overlay...');
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const multipartBody = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="headline"\r\n\r\n${b.headline}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="insight"\r\n\r\n${b.insight}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="takeaway"\r\n\r\n${b.takeaway}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="style"\r\n\r\n${b.style}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="img.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
    bgBuf,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);

  const overlayRes = await fetch(`http://localhost:3210/format-variant?style=${b.style}`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: multipartBody
  });

  if (overlayRes.ok) {
    const finalBuf = Buffer.from(await overlayRes.arrayBuffer());
    const outFile = `${b.id}.jpg`;
    fs.writeFileSync(outFile, finalBuf);
    console.log(`✓ Successfully Saved: ${outFile} (${Math.round(finalBuf.length / 1024)} KB)`);
  } else {
    console.error(`Error on overlay for ${b.id}:`, overlayRes.status);
  }
}

async function run() {
  for (const b of BLUEPRINTS) {
    await generate(b);
  }
}

run().catch(console.error);
