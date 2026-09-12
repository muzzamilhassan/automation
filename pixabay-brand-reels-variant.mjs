// Brand REELS v2: 4K Pixabay clip backgrounds + brand typography overlay.
// Mirrors the poster set (same copy/fonts/colors) at 1080x1920, with music.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const FF = 'ffmpeg-bin/ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe';
const KEY = (fs.readFileSync('.env', 'utf8').match(/^PIXABAY_API_KEY=(.+)$/m) || [])[1]?.trim();
const FONTFILE = (f) => `fontfile=image-tools/fonts/${f}`;
const spaced = (s) => s.split('').join(' ');

const BRANDS = {
  SW: { clip: '336755', t: 8.8, dur: 13, music: 'image-tools/audio/sunset-drive.mp3',
    scrim: ['rgba(13,13,13,0.40)', 'rgba(13,13,13,0.60)', 'rgba(13,13,13,0.80)'] },
  SS: { clip: '164360', t: 16.4, dur: 13, music: 'image-tools/audio/quiet-night.mp3',
    scrim: ['rgba(247,243,236,0.55)', 'rgba(247,243,236,0.88)', 'rgba(247,243,236,0.96)'] },
  BC: { clip: '19368', t: 18.4, dur: 13, music: 'image-tools/audio/illusions.mp3',
    scrim: ['rgba(10,10,10,0.35)', 'rgba(10,10,10,0.60)', 'rgba(10,10,10,0.78)'] },
  EV: { clip: '203681', t: 3.5, dur: 12.5, music: 'image-tools/audio/hope-for-tomorrow.mp3',
    scrim: ['rgba(232,84,31,0.55)', 'rgba(232,84,31,0.84)', 'rgba(232,84,31,0.95)'] },
  RN: { clip: '260397', t: 16, dur: 13, music: 'image-tools/audio/awakening-dew.mp3',
    scrim: ['rgba(245,241,232,0.48)', 'rgba(245,241,232,0.86)', 'rgba(245,241,232,0.95)'] }
};

const COPY = {
  SW: { eyebrow: 'OLD MONEY RULE // SILENT WEALTH', footer: 'silentwealth.co', ink: '#FFFFFF', accent: '#F5E31C',
    hl: [['WEALTH IS'], ['WHAT YOU'], ["DON'T SHOW.", '#F5E31C']],
    body: ['Old money stays quiet.', 'New money stays loud.'] },
  SS: { eyebrow: 'CORE RULE // STRATEGIC SILENCE', footer: 'strategicsilence.com', ink: '#111111', accent: '#1A56E8',
    hl: [['SMALL HABITS'], ['MAKE'], ['BIG', '#1A56E8'], ['CHANGES.']],
    body: ['What you do every day matters', 'more than what you do once in a while.'] },
  BC: { eyebrow: 'MINDSET TIP // THE BOUNDARIES CLUB', footer: 'boundariesclub.com', ink: '#FFFFFF', accent: '#FF8A1E',
    hl: [['STOP COMPLAINING.'], ['START'], ['WORKING.']],
    body: ['Complaining changes nothing.', 'Working hard changes everything.'] },
  EV: { eyebrow: 'TAKE ACTION // EON VENTURES', footer: 'eonventures.co', ink: '#FFFFFF', accent: '#141414',
    hl: [["DON'T WAIT", '#141414'], ['FOR THE'], ['RIGHT TIME.']],
    body: ['The perfect time will never come.', 'Start today with what you have.'] },
  RN: { eyebrow: 'DAILY LESSON // RELIQ NORTH', footer: 'reliqnorth.com', ink: '#141414', accent: '#C8202D',
    hl: [['DO NOT TELL'], ['PEOPLE YOUR'], ['PLANS.']],
    body: ['Show them your results instead.', 'Let your success speak for you.'] }
};

// per-brand drawtext spec
// text specs mirror each brand's live SVG poster EXACTLY (same font files/
// weights, same px sizes and line spacings — canvas width is 1080 in both).
// lineSp = poster baseline spacing; bodyTop/bodySp per poster body block.
const SPEC = {
  SW: { font: 'Anton-Regular.ttf', hSize: 110, align: 'middle', lineSp: 108, eyeY: 340, hlTop: 540, eyeFont: 'Oswald-500.ttf', bodyFont: 'Oswald-500.ttf', bSize: 52, bodySp: 74, bodyTop: 1210, footTop: 1700 },
  SS: { font: 'Anton-Regular.ttf', hSize: 120, align: 'start', lineSp: 118, eyeY: 340, hlTop: 530, eyeFont: 'Oswald-500.ttf', bodyFont: 'Oswald-500.ttf', bSize: 52, bodySp: 74, bodyTop: 1210, footTop: 1700 },
  BC: { font: 'Oswald-700.ttf', hSize: 104, align: 'start', lineSp: 102, eyeY: 330, hlTop: 530, eyeFont: 'Oswald-500.ttf', bodyFont: 'Oswald-400.ttf', bSize: 56, bodySp: 80, bodyTop: 1180, footTop: 1700 },
  EV: { font: 'ArchivoBlack-Regular.ttf', hSize: 110, align: 'start', lineSp: 108, eyeY: 340, hlTop: 540, eyeFont: 'Inter-ExtraBold.ttf', bodyFont: 'Inter-Regular.ttf', bSize: 52, bodySp: 74, bodyTop: 1210, footTop: 1700 },
  RN: { font: 'PlayfairDisplay-ExtraBold.ttf', hSize: 120, align: 'start', lineSp: 118, eyeY: 340, hlTop: 540, eyeFont: 'PlayfairDisplay-Bold.ttf', bodyFont: 'PlayfairDisplay-Variable.ttf', bSize: 56, bodySp: 80, bodyTop: 1210, footTop: 1700 }
};

const X = (al) => (al === 'middle' ? 'x=(w-text_w)/2' : 'x=100');

async function clipUrl(clipId) {
  const res = await fetch(`https://pixabay.com/api/videos/?key=${KEY}&id=${clipId}`);
  return (await res.json()).hits[0].videos.large.url; // 4K
}

const tfFiles = [];
const tf = (name, text) => { fs.writeFileSync(name, text); tfFiles.push(name); return `textfile=${name}`; };
const dt = (font, size, color, al, y, name, text) =>
  `drawtext=${FONTFILE(font)}:${tf(name, text)}:fontcolor=${color}:fontsize=${size}:${X(al)}:y=${y}:shadowcolor=black@0.4:shadowx=0:shadowy=4`;

const only = process.argv[2];
for (const [brand, spec] of Object.entries(BRANDS)) {
  if (only && brand !== only) continue;
  const copy = COPY[brand], s = SPEC[brand];
  console.log(`\n=== ${brand} reel (clip ${spec.clip}) ===`);
  const out = `pixabay-brand-reel-${brand}.mp4`;

  execFileSync('curl', ['-s', '--retry', '3', '--retry-delay', '2', '-L', '-o', 'pixabay-bg-tmp.mp4', await clipUrl(spec.clip)]);
  console.log(`  bg ${(fs.statSync('pixabay-bg-tmp.mp4').size / 1048576).toFixed(1)}MB`);

  const [c0, c1, c2] = spec.scrim;
  const scrimSvg = `<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${c0}"/><stop offset="0.4" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
  </linearGradient></defs><rect width="1080" height="1920" fill="url(#g)"/></svg>`;
  await sharp(Buffer.from(scrimSvg)).png().toFile('scrim-tmp.png');

  const textBits = [];
  // eyebrow colors mirror each brand's live SVG (lightened variants on dark bgs)
  const EYECOLOR = { SW: '#C9C9BD', SS: '#6B6B6B', BC: '#B8B8B8', EV: '#141414', RN: '#C8202D' };
  textBits.push(dt(s.eyeFont, 30, EYECOLOR[brand], s.align, s.eyeY, 'eye.txt', spaced(copy.eyebrow)));
  copy.hl.forEach((line, i) => {
    textBits.push(dt(s.font, s.hSize, line[1] || copy.ink, s.align, s.hlTop + i * s.lineSp, `hl${i}.txt`, line[0]));
  });
  copy.body.forEach((line, i) => {
    textBits.push(dt(s.bodyFont, s.bSize, copy.ink, s.align, s.bodyTop + i * s.bodySp, `bd${i}.txt`, line));
  });
  textBits.push(dt(s.eyeFont, 26, copy.ink === '#FFFFFF' ? '#C9C9BD' : '#8A8A80', s.align, s.footTop, 'ft.txt', spaced(copy.footer)));

  const boxes = [];
  if (brand === 'BC') boxes.push(`drawbox=x=100:y=${s.hlTop + 2 * s.lineSp + 14}:w=430:h=5:color=0xFF8A1E@0.95:t=fill`);
  if (brand === 'RN') boxes.push(`drawbox=x=86:y=${s.hlTop + 2 * s.lineSp - 12}:w=600:h=${Math.round(s.hSize * 1.04)}:color=0xF2E24B@0.8:t=fill`);
  if (brand === 'EV') boxes.push(`drawbox=x=100:y=${s.hlTop + 3 * s.lineSp + 4}:w=280:h=5:color=0x141414@0.9:t=fill`);
  if (brand === 'SS') boxes.push(`drawbox=x=760:y=180:w=5:h=520:color=0x1A56E8@0.85:t=fill`);
  if (brand === 'SW') boxes.push(`drawbox=x=460:y=${s.bodyTop - 64}:w=160:h=4:color=0xF5E31C@0.9:t=fill`);

  // attach output label directly to the last filter (no comma before [v])
  const visualTail = [`[bv][sc]overlay=0:0`, ...boxes, ...textBits].join(',') + `[v]`;
  const chain = [
    `[0:v]crop=ih*9/16:ih,scale=1080:1920,eq=saturation=1.06:contrast=1.04,fade=t=in:st=0:d=0.7,fade=t=out:st=${spec.dur - 0.9}:d=0.9[bv]`,
    `[1:v]scale=1080:1920[sc]`,
    visualTail
  ].join(';') + `;[2:a]volume=0.85,afade=t=in:st=0:d=1,afade=t=out:st=${spec.dur - 1.5}:d=1.5[a]`;

  try {
    execFileSync(FF, [
      '-y', '-ss', String(spec.t), '-i', 'pixabay-bg-tmp.mp4', '-i', 'scrim-tmp.png', '-stream_loop', '-1', '-i', spec.music,
      '-filter_complex', chain, '-map', '[v]', '-map', '[a]',
      '-t', String(spec.dur), '-r', '30',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out
    ], { stdio: ['ignore', 'ignore', fs.openSync('ffmpeg-err.log', 'w')] });
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString() : e.message; console.error("CHAIN=" + chain);
    console.error('FFMPEG ERROR (last 800 chars):\n' + msg.slice(0,1200));
    process.exit(1);
  }

  console.log(`  ✓ ${out} (${(fs.statSync(out).size / 1048576).toFixed(1)}MB)`);
}
tfFiles.forEach(f => fs.existsSync(f) && fs.unlinkSync(f));
fs.existsSync('scrim-tmp.png') && fs.unlinkSync('scrim-tmp.png');
fs.existsSync('pixabay-bg-tmp.mp4') && fs.unlinkSync('pixabay-bg-tmp.mp4');
console.log('\nAll 5 brand reels rendered.');
