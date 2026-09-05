// Generates complete IG branding image assets per account into
// ig-branding-assets/<slug>/ : profile pic (square) + 3 story-highlight
// covers (1080x1920, icon centered in the visible circle).
// Usage: node ig-branding-gen.mjs
import sharp from 'sharp';
import fs from 'node:fs';
import { EMBEDDED_FONTS_CSS } from './typography-poster-engine.mjs';
import { bySlug } from './yt-brands/brands.mjs';

const ACCOUNTS = [
  { slug: 'investors-compass', label: 'Silent Wealth', highlights: ['RULES', 'MINDSET', 'WEALTH'] },
  { slug: 'money-rulebook', label: 'The Money Rulebook', highlights: ['RULES', 'SAVE', 'START'] },
  { slug: 'debt-free-doctrine', label: 'Debt-Free Doctrine', highlights: ['DEBT', 'CREDIT', 'WINS'] }
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
function monogram(label) {
  return label.split(/\s+/).filter(w => w.toUpperCase() !== 'THE').map(w => w[0]).join('').replace(/[^A-Z']/g, '').split('').filter(c => /[A-Z]/.test(c)).slice(0, 2).join('');
}

const circleDefs = `<defs><style>${EMBEDDED_FONTS_CSS}</style>
  <radialGradient id="g" cx="50%" cy="42%" r="75%">
    <stop offset="0%" stop-color="ACCENT" stop-opacity="0.25"/><stop offset="100%" stop-color="BG"/>
  </radialGradient></defs>`;

for (const a of ACCOUNTS) {
  const b = bySlug[a.slug];
  if (!b) { console.error('no kit for', a.slug); continue; }
  const dir = `ig-branding-assets/${a.slug}`;
  fs.mkdirSync(dir, { recursive: true });

  // 1. profile pic — monogram avatar, clean square (IG crops the circle)
  const avatar = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">
  ${circleDefs.replace('ACCENT', b.accent).replace('BG', b.bg)}
  <circle cx="400" cy="400" r="330" fill="none" stroke="${b.accent}" stroke-width="16"/>
  <circle cx="400" cy="400" r="290" fill="none" stroke="#FFFFFF" stroke-opacity="0.15" stroke-width="3"/>
  <text x="400" y="482" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="300" letter-spacing="6" fill="${b.ink}">${esc(monogram(b.label))}</text>
  <circle cx="400" cy="596" r="16" fill="${b.accent}"/>
</svg>`;
  await sharp(Buffer.from(avatar), { density: 96 }).png().toFile(`${dir}/profile-pic.png`);

  // 2. highlight covers — centered badge inside the profile-visible circle
  for (let i = 0; i < a.highlights.length; i++) {
    const label = a.highlights[i];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
  ${circleDefs.replace('ACCENT', b.accent).replace('BG', b.bg)}
  <circle cx="540" cy="960" r="270" fill="#0d0d0d" fill-opacity="0.92"/>
  <circle cx="540" cy="960" r="270" fill="none" stroke="${b.accent}" stroke-width="10"/>
  <text x="540" y="930" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="150" fill="${b.ink}">${esc(label)}</text>
  <circle cx="540" cy="1010" r="12" fill="${b.accent}"/>
  <text x="540" y="1620" text-anchor="middle" font-family="Oswald" font-weight="500" font-size="40" letter-spacing="10" fill="${b.ink}" fill-opacity="0.5">${esc(b.label)}</text>
</svg>`;
    await sharp(Buffer.from(svg), { density: 96 }).png().toFile(`${dir}/highlight-${i + 1}-${label.toLowerCase()}.png`);
  }
  console.log(`✓ ${dir}/ — profile-pic.png + ${a.highlights.length} highlight covers (${a.label})`);
}
