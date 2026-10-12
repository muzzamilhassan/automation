import sharp from 'sharp';
import fs from 'node:fs';
const { buildThumbSvg, TEMPLATES } = await import('./lib/thumb-templates.js');
const pr = await fetch('https://images.pexels.com/photos/210607/pexels-photo-210607.jpeg?auto=compress&cs=tinysrgb&w=1280'); const photo = 'data:image/jpeg;base64,' + Buffer.from(await pr.arrayBuffer()).toString('base64');
const cases = {
  clean: '4 Money Habits For Couples',
  poster: 'The Silent Wealth Trap Nobody Sees',
  paper: 'The Marcus Aurelius Rule Nobody Talks About',
  hero: 'Gold Reserves Are Moving East',
  statue: 'Stoic Discipline Beats Motivation',
  silhouette: 'Discipline',
  luxury: 'The Old Money Morning Routine',
  splitba: 'From Broke To Financial Freedom',
  vs: 'Cash vs Credit: The Real Winner',
  collage: 'The Man Who Fooled Wall Street',
  newspaper: 'Bank Strike Shocks The Nation',
  magazine: 'Inside The Quiet Empire',
  motion: 'The Crash Nobody Saw Coming',
  annotate: 'This Chart Predicts Everything',
  bignum: '7 Money Rules That Build Wealth',
  equation: '$1M = 1 Simple Idea',
  timeline: 'How Empires Actually Fall',
  stats: 'From $0 To $1 Million',
  glass: 'The System Running Your Life',
  duotone: 'Stoic Mind In A Loud World',
  question: 'Why Is Nobody Talking About This?',
  brutalist: 'BROKE Is A Choice',
  anime: 'The Last Exam',
  soft3d: 'The Money Machine',
  liminal: 'What Happened To This Place?',
  pov: 'Checking My Portfolio At 3AM',
  iso: 'How Money Actually Moves',
  map: 'The Trade Route That Changed Everything',
};
fs.mkdirSync('render-test', { recursive: true });
let pass = 0, fail = 0;
for (const [id, title] of Object.entries(cases)) {
  try {
    const svg = buildThumbSvg(id, { title, accent: '#E8C15A', chip: 'MONEY', brand: 'THE MONEY RULEBOOK', eyebrow: '2026', shade: '#120808', photoHref: TEMPLATES[id].needsPhoto ? photo : (Math.random() > 0.5 ? photo : '') });
    const out = `render-test/${id}.jpg`;
    const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
    fs.writeFileSync(out, buf);
    const st = await sharp(buf).stats();
    const mean = st.channels.map((c) => c.mean.toFixed(0)).join(',');
    const blank = st.channels.every((c) => c.mean < 4 || c.mean > 251);
    if (blank || buf.length < 30000) { console.log(`✗ ${id}: SUSPECT (mean ${mean}, ${buf.length}B)`); fail++; }
    else { console.log(`✓ ${id}: ${(buf.length / 1024).toFixed(0)}KB mean(${mean})`); pass++; }
  } catch (e) {
    console.log(`✗ ${id}: ERROR ${e.message.slice(0, 90)}`);
    fail++;
  }
}
console.log(`\n${pass}/28 pass, ${fail} fail`);
