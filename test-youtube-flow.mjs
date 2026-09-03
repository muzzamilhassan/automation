// Local test for the dedicated YouTube Shorts flow (no AI keys, no posting).
// Generates ONE narrated YT Short per brand using built-in offline lesson
// content and prints the SEO metadata + next scheduled publish slot.
// Usage: node test-youtube-flow.mjs [brandIndex]
import fs from 'node:fs';
import { renderYouTubeShort, buildYouTubeMeta, nextYouTubeSlotISO } from './youtube-engine.mjs';

const SAMPLE = {
  headline: 'PROTECT YOUR PEACE.',
  insight_body: 'Your calm is an asset. Every argument you refuse to join keeps your mind clear and your standards high.',
  takeaway: 'Rule: Respond with silence, not anger.'
};

const PAGES = [
  { id: '116157974886564', name: 'Silent Wealth' },
  { id: '108044922375174', name: 'Strategic Silence' },
  { id: '1077306835630491', name: 'Eon Ventures' },
  { id: '114550268199751', name: 'Reliq North' },
  { id: '106473735839651', name: 'The Boundaries Club' }
];

const idx = process.argv[2] && !isNaN(parseInt(process.argv[2], 10)) ? parseInt(process.argv[2], 10) : 3;
const page = PAGES[idx];

console.log(`Rendering YouTube Short for ${page.name}...`);
console.log(`Next scheduled YT slot (PKT 05:45/13:30/18:45): ${nextYouTubeSlotISO()}`);
const { buffer, meta, duration } = await renderYouTubeShort(page, SAMPLE);
const out = `yt-test-${page.name.toLowerCase().replace(/\s+/g, '-')}.mp4`;
fs.writeFileSync(out, buffer);
console.log(`\nSaved: ${out} (${Math.round(buffer.length / 1024)} KB, ${duration}s)`);
console.log(`Title:       ${meta.title}`);
console.log(`Format:      ${meta.format} | keyword: ${meta.keyword}`);
console.log(`Description: ${meta.description.split('\n').join(' / ')}`);
console.log(`Tags:        ${meta.tags.join(', ')}`);
