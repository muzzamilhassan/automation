#!/usr/bin/env node
// YT-BOT ("Behind The AI Bill") YouTube branding: logo, banner, watermark.
// Pure HTML/CSS/SVG drawn here and photographed with Chromium — no stock art, no
// AI images, our own bundled fonts. Sizes are YouTube's published ones
// (support.google.com/youtube/answer/10456525, read 2026-11-24): banner 2560x1440 with
// the text inside the centre safe area (1235x338 at 2048 wide = 1544x423 at 2560),
// profile picture drawn circle-safe, watermark square and under 1 MB.
//
// Usage: node scripts/make-ytbot-branding.mjs <output-folder>
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const OUT = process.argv[2];
if (!OUT) { console.error('usage: node scripts/make-ytbot-branding.mjs <output-folder>'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.resolve(import.meta.dirname, '..');
const font = (f) => `data:font/ttf;base64,${fs.readFileSync(path.join(ROOT, 'image-tools', 'fonts', f)).toString('base64')}`;
const C = { bg: '#0A1120', line: '#1B2A44', paper: '#F3F0E6', ink: '#0B1220', blue: '#38BDF8', mute: '#8FA3C2' };

const css = `
@font-face{font-family:Arch;src:url(${font('ArchivoBlack-Regular.ttf')})}
@font-face{font-family:Mono;font-weight:700;src:url(${font('SpaceMono-Bold.ttf')})}
@font-face{font-family:Int;font-weight:600;src:url(${font('Inter-SemiBold.ttf')})}
*{box-sizing:border-box;margin:0;padding:0}html,body{overflow:hidden}`;

// a torn-receipt outline: straight sides, zig-zag top and bottom
function receipt(w, h, teeth, depth) {
  const s = w / teeth;
  let d = `M0 ${depth}`;
  for (let i = 0; i < teeth; i++) d += ` L${(i + 0.5) * s} 0 L${(i + 1) * s} ${depth}`;
  d += ` L${w} ${h - depth}`;
  for (let i = teeth; i > 0; i--) d += ` L${(i - 0.5) * s} ${h} L${(i - 1) * s} ${h - depth}`;
  return `${d} Z`;
}

// the mark: a receipt whose only item is "AI" and whose total is highlighted
function mark(size) {
  const w = size * 0.56, h = size * 0.74, x = (size - w) / 2, y = (size - h) / 2;
  const u = size / 100;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="${C.bg}"/>
    <g transform="translate(${x} ${y})">
      <path d="${receipt(w, h, 7, 4.2 * u)}" fill="${C.paper}"/>
      <text x="${w / 2 + 0.7 * u}" y="${h * 0.555}" text-anchor="middle" font-family="Arch" font-size="${38 * u}" fill="${C.ink}" letter-spacing="${-0.6 * u}">AI</text>
      <rect x="${w * 0.14}" y="${h * 0.66}" width="${w * 0.72}" height="${10 * u}" rx="${1.2 * u}" fill="${C.blue}"/>
    </g></svg>`;
}

const row = (k) => `<div class="r"><span>${k}</span><i></i><b>?</b></div>`;
const banner = `<style>${css}
body{width:2560px;height:1440px;background:${C.bg};position:relative}
.grid{position:absolute;inset:0;background-image:linear-gradient(${C.line} 2px,transparent 2px),linear-gradient(90deg,${C.line} 2px,transparent 2px);background-size:120px 120px;background-position:-2px -2px;opacity:.38}
.safe{position:absolute;left:508px;top:509px;width:1544px;height:422px;padding:26px 44px;display:flex;align-items:center;justify-content:space-between}
h1{font:400 126px/1 Arch;color:#fff;letter-spacing:-2px}
h1 em{font-style:normal;color:${C.blue}}
p{font:600 46px/1.2 Int;color:${C.mute};margin-top:30px}
.paper{width:480px;height:370px;position:relative;flex:none}
.paper svg{position:absolute;inset:0}
.in{position:absolute;inset:40px 44px 36px;font:700 31px/1 Mono;color:${C.ink};display:flex;flex-direction:column;justify-content:space-between}
.r{display:flex;align-items:baseline;gap:12px}.r i{flex:1;border-bottom:5px dotted #B9B29C;transform:translateY(-5px)}
.t{background:${C.blue};padding:12px 16px;border-radius:6px;margin:0 -16px}.t i{border-color:${C.ink}66}
</style><div class="grid"></div><div class="safe">
<div><h1>BEHIND THE<br><em>AI BILL</em></h1><p>Who really pays for AI?</p></div>
<div class="paper"><svg width="480" height="370" viewBox="0 0 480 370"><path d="${receipt(480, 370, 15, 18)}" fill="${C.paper}"/></svg>
<div class="in">${row('CHIPS')}${row('POWER')}${row('DEALS')}${row('JOBS')}<div class="r t"><span>TOTAL</span><i></i><b>?</b></div></div></div></div>`;

const logo = (n) => `<style>${css}body{width:${n}px;height:${n}px}</style>${mark(n)}`;

const exe = process.env.CHROMIUM_PATH || 'C:/Users/Revnix/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const b = await chromium.launch({ executablePath: exe, headless: true });
async function shot(html, w, h, file) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.setContent(html, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(OUT, file), clip: { x: 0, y: 0, width: w, height: h } });
  await p.close();
  console.log(file, `${w}x${h}`, `${Math.round(fs.statSync(path.join(OUT, file)).size / 1024)} KB`);
}
await shot(logo(800), 800, 800, '1-logo-profile-picture.png');
await shot(banner, 2560, 1440, '2-banner.png');
await shot(logo(300), 300, 300, '3-video-watermark.png');
await b.close();
