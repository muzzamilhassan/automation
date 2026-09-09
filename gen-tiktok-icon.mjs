import sharp from 'sharp';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#141a24"/><stop offset="1" stop-color="#05070c"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="0" fill="url(#bg)"/>
  <circle cx="512" cy="512" r="420" fill="none" stroke="#F5E31C" stroke-width="34"/>
  <circle cx="512" cy="512" r="368" fill="none" stroke="#FFFFFF" stroke-opacity="0.14" stroke-width="6"/>
  <text x="512" y="640" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="360" fill="#FFFFFF">QS</text>
  <circle cx="512" cy="742" r="26" fill="#F5E31C"/>
</svg>`;
await sharp(Buffer.from(svg), { density: 96 }).png().toFile('tiktok-app-site/icon-1024.png');
console.log('icon written: tiktok-app-site/icon-1024.png');
const meta = await sharp('tiktok-app-site/icon-1024.png').metadata();
console.log('size:', meta.width + 'x' + meta.height, '| format:', meta.format);
const desc = 'Connect your TikTok account once — schedule and publish your brand videos from one studio, with AI-content disclosure controls.';
console.log('desc chars:', desc.length);
