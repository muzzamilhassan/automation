// Brand posters v2: 4K Pixabay frame backgrounds + exact brand typography
// from the current SVG system (eyebrow / caps headline with accent swap /
// 2-line body / footer + graphic accent). 1080x1350, rendered via sharp.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { EMBEDDED_FONTS_CSS, exportPoster } from './typography-poster-engine.mjs';

const FF = 'ffmpeg-bin/ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe';
const KEY = (fs.readFileSync('.env', 'utf8').match(/^PIXABAY_API_KEY=(.+)$/m) || [])[1]?.trim();
const FONT = (f) => `'${f}'`;

const BRANDS = {
  SW: { clip: '336755', t: 8.8,
    eyebrow: 'SIMPLE TRUTH // SILENT WEALTH', footer: 'silentwealth.co', footerFill: '#9B9B8F', accent: '#F5E31C', ink: '#FFFFFF',
    scrim: ['rgba(13,13,13,0.42)', 'rgba(13,13,13,0.62)', 'rgba(13,13,13,0.80)'],
    accentType: 'chevrons' },
  SS: { clip: '164360', t: 16.4,
    eyebrow: 'CORE RULE // STRATEGIC SILENCE', footer: 'strategicsilence.com', footerFill: '#6B6B6B', accent: '#1A56E8', ink: '#111111',
    scrim: ['rgba(247,243,236,0.55)', 'rgba(247,243,236,0.90)', 'rgba(247,243,236,0.96)'],
    accentType: 'crack' },
  BC: { clip: '19368', t: 18.4,
    eyebrow: 'MINDSET TIP // THE BOUNDARIES CLUB', footer: 'boundariesclub.com', footerFill: '#B8B8B8', accent: '#FF8A1E', ink: '#FFFFFF',
    scrim: ['rgba(10,10,10,0.38)', 'rgba(10,10,10,0.62)', 'rgba(10,10,10,0.80)'],
    accentType: 'dots' },
  EV: { clip: '203681', t: 5.2,
    eyebrow: 'TAKE ACTION // EON VENTURES', footer: 'eonventures.co', footerFill: '#FFD9C7', accent: '#141414', ink: '#FFFFFF',
    scrim: ['rgba(232,84,31,0.55)', 'rgba(232,84,31,0.82)', 'rgba(232,84,31,0.94)'],
    accentType: 'thick-rule' },
  RN: { clip: '260397', t: 16,
    eyebrow: 'DAILY LESSON // RELIQ NORTH', footer: 'reliqnorth.com', footerFill: '#7A7A7A', accent: '#C8202D', ink: '#141414',
    scrim: ['rgba(245,241,232,0.50)', 'rgba(245,241,232,0.90)', 'rgba(245,241,232,0.96)'],
    accentType: 'large-circle' }
};

// headline lines: [text, colorOverride?] — same copy as the current live SVGs
const COPY = {
  SW: { hl: [['TIME IS'], ['MORE VALUABLE', '#F5E31C'], ['THAN MONEY.']],
        body: ['You can always make more money.', 'You can never get back lost time.'] },
  SS: { hl: [['SMALL HABITS'], ['MAKE'], ['BIG', '#1A56E8'], ['CHANGES.']],
        body: ['What you do every day matters', 'more than what you do once in a while.'] },
  BC: { hl: [['STOP COMPLAINING.'], ['START'], ['WORKING.']],
        body: ['Complaining changes nothing.', 'Working hard changes everything.'] },
  EV: { hl: [["DON'T WAIT", '#141414'], ['FOR THE'], ['RIGHT TIME.']],
        body: ['The perfect time will never come.', 'Start today with what you have.'] },
  RN: { hl: [['DO NOT TELL'], ['PEOPLE YOUR'], ['PLANS.']],
        body: ['Show them your results instead.', 'Let your success speak for you.'] }
};

const ACCENTS = {
  chevrons: (a) => `<polyline points="910,1140 940,1160 910,1180" fill="none" stroke="${a}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
        <polyline points="928,1140 958,1160 928,1180" fill="none" stroke="${a}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  crack: (a) => `<polyline points="840,160 808,380 870,590 818,830 892,1050 850,1210" fill="none" stroke="${a}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>`,
  dots: (a) => `<circle cx="840" cy="200" r="6" fill="${a}"/><circle cx="864" cy="200" r="6" fill="${a}"/><circle cx="888" cy="200" r="6" fill="${a}"/><circle cx="912" cy="200" r="6" fill="${a}"/>`,
  'thick-rule': (a) => `<line x1="100" y1="620" x2="360" y2="620" stroke="${a}" stroke-width="6" stroke-linecap="square"/>`,
  'large-circle': (a) => `<circle cx="780" cy="560" r="180" fill="none" stroke="${a}" stroke-width="3" opacity="0.35"/>`
};

async function getFrame(clipId, t, out) {
  const res = await fetch(`https://pixabay.com/api/videos/?key=${KEY}&id=${clipId}`);
  const h = (await res.json()).hits[0];
  const url = h.videos.large.url; // 4K
  execFileSync('curl', ['-s', '--retry', '3', '--retry-delay', '2', '-L', '-o', 'pixabay-bg-tmp.mp4', url]);
  execFileSync(FF, ['-y', '-v', 'error', '-ss', String(t), '-i', 'pixabay-bg-tmp.mp4', '-frames:v', '1', '-vf', 'crop=ih*4/5:ih', out]);
  fs.unlinkSync('pixabay-bg-tmp.mp4');
  console.log(`  frame ${out} (${h.videos.large.width}x${h.videos.large.height} source)`);
}

async function buildPoster(brand, spec) {
  console.log(`\n=== ${brand} (clip ${spec.clip}) ===`);
  const frameFile = `pixabay-frame-${brand}.jpg`;
  await getFrame(spec.clip, spec.t, frameFile);
  const b64 = (await sharp(frameFile).jpeg({ quality: 85 }).toBuffer()).toString('base64');
  const copy = COPY[brand];

  const [c0, c1, c2] = spec.scrim;
  // [family, size, weight, align] — mirrors each brand's live SVG exactly
  const head = {
    SW: ['Anton', 110, 400, 'middle'], SS: ['Anton', 120, 400, 'start'],
    BC: ['Oswald', 104, 700, 'start'], EV: ['Archivo Black', 110, 400, 'start'],
    RN: ['Playfair Display', 120, 900, 'start']
  }[brand];
  const body = {
    SW: ['Oswald', 500, 52, 'middle', 840], SS: ['Oswald', 500, 52, 'start', 940],
    BC: ['Oswald', 400, 56, 'start', 780], EV: ['Inter', 400, 52, 'start', 980],
    RN: ['Playfair Display', 400, 56, 'start', 860]
  }[brand];
  const eye = {
    SW: ['Oswald', 500, 'middle', 280, '#6E6E6E'], SS: ['Oswald', 500, 'start', 240, '#6B6B6B'],
    BC: ['Oswald', 500, 'start', 200, '#7A7A7A'], EV: ['Inter', 800, 'start', 240, '#141414'],
    RN: ['Playfair Display', 700, 'start', 240, '#C8202D']
  }[brand];
  const anchor = (al) => (al === 'middle' ? 'text-anchor="middle" x="540"' : 'x="100"');
  const ls = brand === 'BC' ? ' letter-spacing="2"' : '';
  // headline baselines copied from each brand's live SVG
  const baseYs = { SW: [440, 548, 656], SS: [420, 538, 656, 774], BC: [380, 482, 584], EV: [380, 488, 596], RN: [440, 558, 676] };

  const hlText = copy.hl.map((line, i) =>
    `<text ${anchor(head[3])}${ls} font-family=${FONT(head[0])} font-weight="${head[2]}" font-size="${head[1]}" fill="${line[1] || spec.ink}" y="${baseYs[brand][i]}">${line[0]}</text>`
  ).join('\n  ');
  const bodyText = copy.body.map((line, i) =>
    `<text ${anchor(body[3])} font-family=${FONT(body[0])} font-weight="${body[1]}" font-size="${body[2]}" fill="${spec.ink}" y="${body[4] + i * 74}">${line}</text>`
  ).join('\n  ');
  const footerFont = brand === 'RN' ? 'Playfair Display' : brand === 'EV' ? 'Inter' : 'Oswald';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <defs>
    <style>${EMBEDDED_FONTS_CSS}</style>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c0}"/>
      <stop offset="0.45" stop-color="${c1}"/>
      <stop offset="1" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <image href="data:image/jpeg;base64,${b64}" x="0" y="0" width="1080" height="1350" preserveAspectRatio="xMidYMid slice"/>
  <rect width="1080" height="1350" fill="url(#scrim)"/>
  ${ACCENTS[spec.accentType](spec.accent)}
  <text ${anchor(eye[2])} font-family=${FONT(eye[0])} font-weight="${eye[1]}" font-size="30" letter-spacing="6" fill="${eye[4]}" y="${eye[3]}">${spec.eyebrow}</text>
  ${hlText}
  ${brand === 'RN' ? `<rect x="86" y="580" width="760" height="135" fill="#F2E24B" opacity="0.9"/>` : ''}
  ${brand === 'BC' ? `<line x1="100" y1="602" x2="540" y2="602" stroke="#FF8A1E" stroke-width="5" stroke-linecap="round"/>` : ''}
  ${bodyText}
  <text ${anchor(body[3])} font-family=${FONT(footerFont)} font-weight="${brand === 'EV' ? 600 : 400}" font-size="26" letter-spacing="3" fill="${spec.footerFill}" y="1260">${spec.footer}</text>
</svg>`;

  const out = await exportPoster(svg, `cinematic-${brand}`);
  console.log(`  ✓ ${out.jpgPath}`);
  fs.unlinkSync(frameFile);
}

for (const [brand, spec] of Object.entries(BRANDS)) await buildPoster(brand, spec);
console.log('\nAll 5 posters rendered.');
