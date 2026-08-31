import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {
  PALETTES,
  renderGraphicAccent,
  exportPoster
} from './typography-poster-engine.mjs';

const GOOGLE_FONTS_LINK = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo+Black&family=Inter:wght@400;600;800&family=Oswald:wght@200;400;500;700&family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,900&display=swap" rel="stylesheet">`;

const FONT_STACKS = {
  editorialHeadline: `'Playfair Display', 'Bodoni MT', 'Didot', 'Georgia', serif`,
  editorialBody: `'Playfair Display', 'Georgia', serif`,
  boldImpactHeadline: `'Anton', 'Impact', 'Arial Black', sans-serif`,
  boldImpactBody: `'Oswald', 'Arial Narrow', 'Franklin Gothic Medium', sans-serif`,
  condensedHeadline: `'Oswald', 'Arial Narrow', 'Impact', sans-serif`,
  condensedBody: `'Oswald', 'Arial Narrow', 'Segoe UI', sans-serif`,
  grotesqueHeadline: `'Archivo Black', 'Arial Black', 'Impact', sans-serif`,
  grotesqueBody: `'Inter', 'Segoe UI', -apple-system, Arial, sans-serif`
};

export const PAGE_POSTERS = [
  {
    pageId: '114550268199751',
    pageName: 'Reliq North',
    id: 'page-1-reliq-north',
    title: 'Page 1: Reliq North (Cream Editorial / Playfair / Highlighter)',
    paletteName: 'P1 CREAM EDITORIAL',
    pairingName: 'A. EDITORIAL SERIF',
    layoutName: 'L1 STACKED LEFT',
    emphasisName: 'E2 HIGHLIGHTER',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <!-- Full-bleed background -->
  <rect width="1080" height="1350" fill="${PALETTES.P1.bg}"/>
  ${renderGraphicAccent('large-circle', PALETTES.P1)}
  
  <!-- Eyebrow -->
  <text x="100" y="240" font-family="${FONT_STACKS.editorialHeadline}" font-weight="700" font-size="30" letter-spacing="6" fill="${PALETTES.P1.accent}">DAILY LESSON // RELIQ NORTH</text>

  <!-- Highlighter behind PLANS (E2) -->
  <rect x="86" y="580" width="760" height="135" fill="${PALETTES.P1.highlight}"/>

  <!-- Headline Block (A. EDITORIAL SERIF) -->
  <text x="100" y="440" font-family="${FONT_STACKS.editorialHeadline}" font-weight="900" font-size="120" fill="${PALETTES.P1.ink}">DO NOT TELL</text>
  <text x="100" y="558" font-family="${FONT_STACKS.editorialHeadline}" font-weight="900" font-size="120" fill="${PALETTES.P1.ink}">PEOPLE YOUR</text>
  <text x="100" y="676" font-family="${FONT_STACKS.editorialHeadline}" font-weight="900" font-size="120" fill="${PALETTES.P1.ink}">PLANS.</text>

  <!-- Body Block -->
  <text x="100" y="860" font-family="${FONT_STACKS.editorialBody}" font-weight="400" font-size="56" fill="${PALETTES.P1.ink}">Show them your results instead.</text>
  <text x="100" y="940" font-family="${FONT_STACKS.editorialBody}" font-weight="400" font-size="56" fill="${PALETTES.P1.ink}">Let your success speak for you.</text>

  <!-- Footer -->
  <text x="100" y="1260" font-family="${FONT_STACKS.editorialBody}" font-weight="400" font-size="26" letter-spacing="3" fill="${PALETTES.P1.muted}">reliqnorth.com</text>
</svg>`
  },

  {
    pageId: '108044922375174',
    pageName: 'Strategic Silence',
    id: 'page-2-strategic-silence',
    title: 'Page 2: Strategic Silence (Paper Electric / Anton / Colour Swap)',
    paletteName: 'P3 PAPER ELECTRIC',
    pairingName: 'B. BOLD IMPACT',
    layoutName: 'L1 STACKED LEFT',
    emphasisName: 'E1 COLOUR SWAP',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <!-- Full-bleed background -->
  <rect width="1080" height="1350" fill="${PALETTES.P3.bg}"/>
  ${renderGraphicAccent('crack', PALETTES.P3)}

  <!-- Eyebrow -->
  <text x="100" y="240" font-family="${FONT_STACKS.boldImpactBody}" font-weight="500" font-size="30" letter-spacing="6" fill="${PALETTES.P3.muted}">CORE RULE // STRATEGIC SILENCE</text>

  <!-- Headline Block (B. BOLD IMPACT + E1 Colour Swap on BIG) -->
  <text x="100" y="420" font-family="${FONT_STACKS.boldImpactHeadline}" font-size="120" fill="${PALETTES.P3.ink}">SMALL HABITS</text>
  <text x="100" y="538" font-family="${FONT_STACKS.boldImpactHeadline}" font-size="120" fill="${PALETTES.P3.ink}">MAKE</text>
  <text x="100" y="656" font-family="${FONT_STACKS.boldImpactHeadline}" font-size="120" fill="${PALETTES.P3.accent}">BIG</text>
  <text x="100" y="774" font-family="${FONT_STACKS.boldImpactHeadline}" font-size="120" fill="${PALETTES.P3.ink}">CHANGES.</text>

  <!-- Body Block -->
  <text x="100" y="940" font-family="${FONT_STACKS.boldImpactBody}" font-weight="500" font-size="52" fill="${PALETTES.P3.ink}">What you do every day matters</text>
  <text x="100" y="1014" font-family="${FONT_STACKS.boldImpactBody}" font-weight="500" font-size="52" fill="${PALETTES.P3.ink}">more than what you do once in a while.</text>

  <!-- Footer -->
  <text x="100" y="1260" font-family="${FONT_STACKS.boldImpactBody}" font-size="26" letter-spacing="3" fill="${PALETTES.P3.muted}">strategicsilence.com</text>
</svg>`
  },

  {
    pageId: '106473735839651',
    pageName: 'The Boundaries Club',
    id: 'page-3-boundaries-club',
    title: 'Page 3: The Boundaries Club (Midnight / Oswald / Underline)',
    paletteName: 'P2 MIDNIGHT',
    pairingName: 'C. CONDENSED MINIMAL',
    layoutName: 'L4 EYEBROW LEAD',
    emphasisName: 'E3 UNDERLINE',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <!-- Full-bleed background -->
  <rect width="1080" height="1350" fill="${PALETTES.P2.bg}"/>
  ${renderGraphicAccent('dots', PALETTES.P2, { dotX: 840, dotY: 200 })}

  <!-- Eyebrow -->
  <text x="100" y="200" font-family="${FONT_STACKS.condensedHeadline}" font-weight="500" font-size="30" letter-spacing="6" fill="${PALETTES.P2.muted}">MINDSET TIP // THE BOUNDARIES CLUB</text>

  <!-- Headline Block (C. CONDENSED MINIMAL + E3 Underline) -->
  <text x="100" y="380" font-family="${FONT_STACKS.condensedHeadline}" font-weight="700" letter-spacing="2" font-size="104" fill="${PALETTES.P2.ink}">STOP COMPLAINING.</text>
  <text x="100" y="482" font-family="${FONT_STACKS.condensedHeadline}" font-weight="700" letter-spacing="2" font-size="104" fill="${PALETTES.P2.ink}">START</text>
  <text x="100" y="584" font-family="${FONT_STACKS.condensedHeadline}" font-weight="700" letter-spacing="2" font-size="104" fill="${PALETTES.P2.ink}">WORKING.</text>

  <!-- Underline under WORKING -->
  <line x1="100" y1="602" x2="540" y2="602" stroke="${PALETTES.P2.accent}" stroke-width="5" stroke-linecap="round"/>

  <!-- Body Block -->
  <text x="100" y="780" font-family="${FONT_STACKS.condensedBody}" font-size="56" fill="${PALETTES.P2.ink}">Complaining changes nothing.</text>
  <text x="100" y="860" font-family="${FONT_STACKS.condensedBody}" font-size="56" fill="${PALETTES.P2.ink}">Working hard changes everything.</text>

  <!-- Footer -->
  <text x="100" y="1260" font-family="${FONT_STACKS.condensedBody}" font-size="26" letter-spacing="3" fill="${PALETTES.P2.muted}">boundariesclub.com</text>
</svg>`
  },

  {
    pageId: '1077306835630491',
    pageName: 'Eon Ventures',
    id: 'page-4-eon-ventures',
    title: 'Page 4: Eon Ventures (Signal Orange / Archivo Black / Split Weight)',
    paletteName: 'P4 SIGNAL ORANGE',
    pairingName: 'D. MODERN GROTESQUE',
    layoutName: 'L3 SPLIT WEIGHT',
    emphasisName: 'E1 COLOUR SWAP',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <!-- Full-bleed background -->
  <rect width="1080" height="1350" fill="${PALETTES.P4.bg}"/>
  ${renderGraphicAccent('thick-rule', PALETTES.P4, { ruleY: 620 })}

  <!-- Eyebrow -->
  <text x="100" y="240" font-family="${FONT_STACKS.grotesqueBody}" font-weight="800" font-size="30" letter-spacing="6" fill="${PALETTES.P4.accent}">TAKE ACTION // EON VENTURES</text>

  <!-- Headline Block (D. MODERN GROTESQUE + E1 Colour Swap on DON'T) -->
  <text x="100" y="380" font-family="${FONT_STACKS.grotesqueHeadline}" font-size="110" fill="${PALETTES.P4.accent}">DON'T WAIT</text>
  <text x="100" y="488" font-family="${FONT_STACKS.grotesqueHeadline}" font-size="110" fill="${PALETTES.P4.ink}">FOR THE</text>
  <text x="100" y="596" font-family="${FONT_STACKS.grotesqueHeadline}" font-size="110" fill="${PALETTES.P4.ink}">RIGHT TIME.</text>

  <!-- Body Block (L3 SPLIT WEIGHT starting at y=980) -->
  <text x="100" y="980" font-family="${FONT_STACKS.grotesqueBody}" font-weight="400" font-size="52" fill="${PALETTES.P4.ink}">The perfect time will never come.</text>
  <text x="100" y="1054" font-family="${FONT_STACKS.grotesqueBody}" font-weight="400" font-size="52" fill="${PALETTES.P4.ink}">Start today with what you have.</text>

  <!-- Footer -->
  <text x="100" y="1260" font-family="${FONT_STACKS.grotesqueBody}" font-weight="600" font-size="26" letter-spacing="3" fill="${PALETTES.P4.muted}">eonventures.co</text>
</svg>`
  },

  {
    pageId: '116157974886564',
    pageName: 'Silent Wealth',
    id: 'page-5-silent-wealth',
    title: 'Page 5: Silent Wealth (Carbon Yellow / Anton Centred / Chevrons)',
    paletteName: 'P5 CARBON YELLOW',
    pairingName: 'B. BOLD IMPACT',
    layoutName: 'L2 CENTRED BLOCK',
    emphasisName: 'E1 COLOUR SWAP',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <!-- Full-bleed background -->
  <rect width="1080" height="1350" fill="${PALETTES.P5.bg}"/>
  ${renderGraphicAccent('chevrons', PALETTES.P5)}

  <!-- Eyebrow (Centred) -->
  <text text-anchor="middle" x="540" y="280" font-family="${FONT_STACKS.boldImpactBody}" font-weight="500" font-size="30" letter-spacing="6" fill="${PALETTES.P5.muted}">SIMPLE TRUTH // SILENT WEALTH</text>

  <!-- Headline Block (L2 CENTRED BLOCK + Colour Swap on VALUABLE) -->
  <text text-anchor="middle" x="540" y="440" font-family="${FONT_STACKS.boldImpactHeadline}" font-size="110" fill="${PALETTES.P5.ink}">TIME IS</text>
  <text text-anchor="middle" x="540" y="548" font-family="${FONT_STACKS.boldImpactHeadline}" font-size="110" fill="${PALETTES.P5.accent}">MORE VALUABLE</text>
  <text text-anchor="middle" x="540" y="656" font-family="${FONT_STACKS.boldImpactHeadline}" font-size="110" fill="${PALETTES.P5.ink}">THAN MONEY.</text>

  <!-- Body Block -->
  <text text-anchor="middle" x="540" y="840" font-family="${FONT_STACKS.boldImpactBody}" font-weight="500" font-size="52" fill="${PALETTES.P5.ink}">You can always make more money.</text>
  <text text-anchor="middle" x="540" y="914" font-family="${FONT_STACKS.boldImpactBody}" font-weight="500" font-size="52" fill="${PALETTES.P5.ink}">You can never get back lost time.</text>

  <!-- Footer -->
  <text text-anchor="middle" x="540" y="1260" font-family="${FONT_STACKS.boldImpactBody}" font-size="26" letter-spacing="3" fill="${PALETTES.P5.muted}">silentwealth.co</text>
</svg>`
  }
];

async function run() {
  console.log('Rendering 5 Distinct Typography Posters for 5 Facebook Pages...');
  const renderedImages = [];

  for (const d of PAGE_POSTERS) {
    console.log(`\nRendering ${d.title}...`);
    const res = await exportPoster(d.svg, d.id);
    console.log(`✓ Saved ${res.svgPath} and ${res.pngPath} (${res.jpgPath})`);
    renderedImages.push({
      ...d,
      pngPath: res.pngPath,
      jpgPath: res.jpgPath,
      svgPath: res.svgPath
    });
  }

  // Create a 5-card Combined Contact Sheet Showcase (5 in a single row or 3+2 layout)
  console.log('\nCreating 5 Pages Showcase Contact Sheet...');
  const cellWidth = 500;
  const cellHeight = 625;
  const cols = 5;
  const margin = 24;

  const totalWidth = cols * cellWidth + (cols + 1) * margin;
  const totalHeight = cellHeight + 2 * margin + 120; // top title space

  const composites = [];

  for (let i = 0; i < renderedImages.length; i++) {
    const left = margin + i * (cellWidth + margin);
    const top = 120 + margin;

    const resizedBuf = await sharp(renderedImages[i].pngPath)
      .resize(cellWidth, cellHeight)
      .toBuffer();

    composites.push({
      input: resizedBuf,
      left,
      top
    });
  }

  // Header SVG for contact sheet
  const headerSvg = Buffer.from(`
    <svg width="${totalWidth}" height="${totalHeight}">
      <text x="${totalWidth / 2}" y="55" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-size="34" font-weight="bold" fill="#111111">5 PAGES TYPOGRAPHY POSTER SHOWCASE (EASY ENGLISH)</text>
      <text x="${totalWidth / 2}" y="92" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-size="18" fill="#555555">Reliq North • Strategic Silence • The Boundaries Club • Eon Ventures • Silent Wealth</text>
    </svg>
  `);

  composites.unshift({ input: headerSvg, left: 0, top: 0 });

  await sharp({
    create: {
      width: totalWidth,
      height: totalHeight,
      channels: 4,
      background: { r: 236, g: 238, b: 242, alpha: 1 }
    }
  })
    .composite(composites)
    .png({ quality: 95 })
    .toFile('5-pages-typography-showcase.png');

  console.log('✓ 5 Pages Showcase saved: 5-pages-typography-showcase.png');

  // Build Interactive HTML Showcase
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>5 Pages Typography Posters — Showcase</title>
  ${GOOGLE_FONTS_LINK}
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0f1117;
      color: #e5e7eb;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 40px 20px;
    }
    header {
      text-align: center;
      margin-bottom: 40px;
    }
    header h1 {
      font-size: 32px;
      font-weight: 800;
      letter-spacing: -0.5px;
      margin-bottom: 8px;
      color: #ffffff;
    }
    header p {
      color: #9ca3af;
      font-size: 16px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 28px;
      max-width: 1600px;
      margin: 0 auto;
    }
    .card {
      background: #1a1d26;
      border: 1px solid #2d3342;
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .card-preview {
      position: relative;
      width: 100%;
      padding-top: 125%;
      background: #000;
    }
    .card-preview img {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .card-info {
      padding: 18px;
    }
    .card-title {
      font-size: 17px;
      font-weight: 700;
      color: #f3f4f6;
      margin-bottom: 10px;
    }
    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .tag {
      font-size: 11px;
      font-weight: 600;
      padding: 4px 8px;
      border-radius: 4px;
      background: #252b3b;
      color: #60a5fa;
    }
    .tag.palette { background: #37283d; color: #f472b6; }
    .tag.page { background: #1e3a5f; color: #38bdf8; font-weight: bold; }
    .tag.layout { background: #3c3422; color: #fbbf24; }
  </style>
</head>
<body>
  <header>
    <h1>5 Pages Typography Posters — Showcase</h1>
    <p>Each Poster Custom Designed for One Specific Brand Page with Easy English Copy</p>
  </header>
  <div class="grid">
    ${renderedImages.map(d => `
      <div class="card">
        <div class="card-preview">
          <img src="${d.pngPath}" alt="${d.title}" />
        </div>
        <div class="card-info">
          <div class="card-title">${d.title}</div>
          <div class="tags">
            <span class="tag page">${d.pageName}</span>
            <span class="tag palette">${d.paletteName}</span>
            <span class="tag layout">${d.layoutName}</span>
            <span class="tag">${d.emphasisName}</span>
          </div>
        </div>
      </div>
    `).join('')}
  </div>
</body>
</html>`;

  fs.writeFileSync('preview-posters.html', htmlContent);
  console.log('✓ Interactive HTML preview saved: preview-posters.html');
}

run().catch(console.error);
