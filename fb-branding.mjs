// Updates Facebook Page branding: names (where API allows), SEO descriptions,
// and reports state. US-audience keyword-first copy.
// Usage: node fb-branding.mjs [--apply]   (dry-run default)
import fs from 'node:fs';

const DRY = !process.argv.includes('--apply');
const envStr = fs.readFileSync('.env', 'utf8');
const TOKEN = (envStr.match(/^FB_PAGE_TOKEN=(.+)$/m) || [])[1]?.trim();

const PAGES = [
  {
    id: '116157974886564', name: 'Silent Wealth',
    about: 'Money mindset, investing psychology and wealth wisdom — daily posters, reels and episodes that build silent wealth. Follow Silent Wealth for daily money psychology.',
    username: 'silentwealthpage'
  },
  {
    id: '108044922375174', name: 'Strategic Silence',
    about: 'Stoicism, power moves and dark psychology — daily wisdom to master your mind. New videos every day. Follow Strategic Silence for daily stoic philosophy.',
    username: 'strategicsilencepage'
  },
  {
    id: '106473735839651', name: 'The Boundaries Club',
    about: 'Self respect, boundaries, emotional intelligence and daily debt-freedom psychology. Strong minds set strong boundaries. Follow The Boundaries Club.',
    username: 'theboundariesclubpage'
  },
  {
    id: '1077306835630491', name: 'Eon Ventures',
    about: 'Money rules, success habits and relentless daily execution — practical finance wisdom for builders and founders. Follow Eon Ventures for daily money rules.',
    username: 'eonventurespage'
  },
  {
    id: '114550268199751', name: 'Reliq North',
    about: 'Calm mind, inner peace and modern stoic living — daily calm for a noisy world. Follow Reliq North for daily stoic calm.',
    username: 'reliqnorthpage'
  }
];

let pageTokensCache = null;
async function getPageToken(pageId) {
  if (!pageTokensCache) {
    pageTokensCache = {};
    const res = await fetch(`https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(TOKEN)}`);
    const data = await res.json();
    for (const p of data.data || []) pageTokensCache[p.id] = p.access_token;
  }
  return pageTokensCache[pageId] || TOKEN;
}

async function graphPost(pageId, fields) {
  const token = await getPageToken(pageId);
  const res = await fetch(`https://graph.facebook.com/v20.0/${pageId}?access_token=${encodeURIComponent(token)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields)
  });
  return res.json();
}

for (const p of PAGES) {
  console.log(`\n=== ${p.name} (${p.id}) ===`);
  if (DRY) { console.log(`  [dry] about: ${p.about.slice(0, 70)}... | name: "${p.name}" | username: @${p.username}`); continue; }
  const r1 = await graphPost(p.id, { about: p.about });
  console.log(`  about: ${r1.error ? '✗ ' + JSON.stringify(r1.error).slice(0, 100) : '✓ updated'}`);
  const r2 = await graphPost(p.id, { name: p.name });
  console.log(`  name:  ${r2.error ? '✗ ' + JSON.stringify(r2.error).slice(0, 100) : '✓ ' + p.name} (API name changes are often blocked — change once in Studio if so)`);
  const r3 = await graphPost(p.id, { username: p.username });
  console.log(`  user:  ${r3.error ? '✗ ' + JSON.stringify(r3.error).slice(0, 100) : '✓ @' + p.username}`);
}
console.log(`\n${DRY ? 'DRY RUN — rerun with --apply' : 'branding pass complete'}`);
