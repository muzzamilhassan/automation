// 10-05 CHANNEL FACTORY — brand resolution for the engine.
// Legacy 4 channels keep their hand-made kits (yt-brands/brands.mjs). Channels
// added through the Studio wizard live in yt-mcp/studio-channels.json — this
// module turns a registry entry into the SAME shape the engine expects, so a
// wizard-added channel runs with zero code changes. Registry kits contain NO
// secrets (the token lives in the YT_TOKEN_<SLUG> GitHub secret).
import fs from 'node:fs';
import path from 'node:path';

const REG_PATH = path.resolve(process.cwd(), 'yt-mcp', 'studio-channels.json');

export function registryToKit(e) {
  const kit = e.kit || {};
  const label = e.label || (e.slug || 'channel').toUpperCase();
  const niche = e.niche || kit.theme || 'everyday wisdom';
  return {
    slug: e.slug,
    label,
    handle: e.handle || '',
    niche,
    cpmTier: 'registry channel',
    accent: e.accent || '#38BDF8',
    bg: kit.bg || '#0A0A0E',
    ink: kit.ink || '#F5F7FA',
    eyebrow: kit.eyebrow || `${niche.toUpperCase()} // ${label.toUpperCase()}`,
    tagline: kit.tagline || '',
    keyword: kit.keyword || niche.toLowerCase(),
    kwShort: kit.kwShort || niche.toLowerCase().split(/\s+/).slice(0, 2).join(' '),
    theme: kit.theme || niche,
    niches: kit.niches?.length ? kit.niches : [niche.toLowerCase()],
    authority: kit.authority || `${niche} Wisdom`,
    tags: kit.tags?.length ? kit.tags : parseKeywords(e.ytKeywords) || [niche.toLowerCase()],
    hashtags: kit.tags?.length ? kit.tags.slice(0, 6).map((t) => '#' + String(t).replace(/[^a-z0-9]/gi, '')).join(' ') : '',
    musicFeels: kit.musicFeels || ['inspir', 'calming'],
    musicPool: kit.musicPool || null, // explicit approved titles beat mood rotation
    voice: e.voice || kit.voice || 'am_michael',
    slots: Array.isArray(e.slots) && e.slots.length ? e.slots : ['22:35'],
    longSlot: kit.longSlot || null,
    docDay: e.docDay || kit.docDay || null,
    description: kit.description || e.ytDescription || '',
    script: kit.script || { targetSeconds: 32, points: 4, lineWords: '9-12', titleStyle: 'numbered listicle + stakes', titleExamples: '"7 Habits That Quietly Set You Apart", "The Rule Nobody Talks About"' },
    active: e.active !== false,
    fromRegistry: true,
  };
}

// YouTube channel keywords come as a messy quoted/comma/space string — split
// into clean tags
function parseKeywords(raw) {
  const s = String(raw || '').trim();
  if (!s) return [];
  const parts = s.includes('"') ? s.match(/"([^"]+)"/g)?.map((x) => x.replace(/"/g, '')) || [] : [];
  const rest = s.replace(/"[^"]+"/g, ' ').split(/[,\s]+/).filter((w) => w.length > 2);
  return [...new Set([...parts, ...rest])].slice(0, 12);
}

export async function resolveBrand(slug) {
  const { bySlug } = await import('../yt-brands/brands.mjs');
  if (bySlug[slug]) return bySlug[slug]; // legacy hand-made kit wins
  try {
    const reg = JSON.parse(fs.readFileSync(REG_PATH, 'utf8'));
    const e = (reg.channels || []).find((c) => c.slug === slug);
    if (e) return registryToKit(e);
  } catch { }
  return null;
}
