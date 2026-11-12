// GET /api/thumbs/demo?id=<templateId>&accent=<hex>
// Renders a lightweight, high-performance 400x225 JPEG demo thumbnail for any template in the catalog.
// Publicly cacheable with HTTP 200 so template picker cards in Studio display genuine visual designs instantly.
import sharp from 'sharp';
import { TEMPLATES, buildThumbSvg } from '../../../../lib/thumb-templates.js';
import { isV2Template, renderV2ById } from '../../../../lib/thumb-templates-v2.js';

export const dynamic = 'force-dynamic';

const SAMPLES = {
  clean: { title: 'THE SILENT WEALTH TRAP', accentWord: 'WEALTH', chip: 'MONEY RULES', eyebrow: 'THE DAILY REPORT' },
  poster: { title: 'WHY QUIET LUXURY WINS', accentWord: 'LUXURY', chip: 'DEEP DIVE', eyebrow: 'RULE NO. 01' },
  paper: { title: 'THE LOST 1928 ARCHIVE', accentWord: 'LOST', chip: 'DOSSIER', eyebrow: 'CASE FILE' },
  hero: { title: 'THE $10,000 HABIT', accentWord: '$10,000', chip: 'HABITS', eyebrow: 'LESSON' },
  statue: { title: 'STOIC RULES FOR CHAOS', accentWord: 'CHAOS', chip: 'PHILOSOPHY', eyebrow: 'MARCUS AURELIUS' },
  silhouette: { title: 'THE UNSEEN ADVANTAGE', accentWord: 'UNSEEN', chip: 'STRATEGY', eyebrow: 'INSIGHT' },
  luxury: { title: 'THE WEALTH FORMULA', accentWord: 'WEALTH', chip: 'EDITION', eyebrow: 'PRIVATE ASSETS' },
  splitba: { title: 'BEFORE VS AFTER 30 DAYS', accentWord: 'AFTER', chip: 'CHALLENGE', eyebrow: 'RESULTS' },
  vs: { title: 'GOLD VS REAL ESTATE', accentWord: 'VS', chip: 'SHOWDOWN', eyebrow: 'PORTFOLIO' },
  collage: { title: 'HOW THE CRASH HAPPENED', accentWord: 'CRASH', chip: 'DOCUMENTARY', eyebrow: 'INVESTIGATION' },
  newspaper: { title: 'THE HEADLINE THEY HID', accentWord: 'HID', chip: 'DISPATCH', eyebrow: 'SPECIAL REPORT' },
  magazine: { title: 'THE POWER PLAYERS', accentWord: 'POWER', chip: 'ISSUE 04', eyebrow: 'EXCLUSIVE' },
  bignum: { title: '5 RULES TO FREEDOM', accentWord: '5', chip: 'BLUEPRINT', eyebrow: 'ESSENTIALS' },
  equation: { title: 'DISCIPLINE = FREEDOM', accentWord: '=', chip: 'TRUTH', eyebrow: 'CORE AXIOM' },
  timeline: { title: 'THE 10-YEAR JOURNEY', accentWord: '10-YEAR', chip: 'ROADMAP', eyebrow: 'MILESTONES' },
  stats: { title: '93% LOSE EVERYTHING', accentWord: '93%', chip: 'METRICS', eyebrow: 'HARD DATA' },
  brutalist: { title: 'NEVER COMPROMISE', accentWord: 'NEVER', chip: 'MANIFESTO', eyebrow: 'PROTOCOL' },
  anime: { title: 'THE FINAL AWAKENING', accentWord: 'FINAL', chip: 'EPISODE 01', eyebrow: 'CHAPTER' },
  soft3d: { title: 'THE FUTURE OF VALUE', accentWord: 'FUTURE', chip: 'INNOVATION', eyebrow: 'TECH' },
  liminal: { title: 'WHERE NO ONE GOES', accentWord: 'NO ONE', chip: 'MYSTERY', eyebrow: 'EXPEDITION' },
  pov: { title: 'IN YOUR OWN HANDS', accentWord: 'OWN', chip: 'ACTION', eyebrow: 'PERSPECTIVE' },
  iso: { title: 'THE FULL SYSTEM ARCHITECTURE', accentWord: 'SYSTEM', chip: 'DIAGRAM', eyebrow: 'INTERNAL' },
  map: { title: 'GLOBAL CAPITAL SHIFTS', accentWord: 'GLOBAL', chip: 'MACRO', eyebrow: 'MAPPING' },
};

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id') || 'clean';
  const accent = searchParams.get('accent') || '#E8C15A';
  const shade = searchParams.get('shade') || '#0A1128';

  const sample = SAMPLES[id] || {
    title: (id.replace(/^v2\//, '').replace(/-/g, ' ').toUpperCase() + ' // PREVIEW').slice(0, 32),
    accentWord: 'PREVIEW',
    chip: 'TEMPLATE',
    eyebrow: 'STYLE PREVIEW',
  };

  try {
    let svg;
    if (isV2Template(id)) {
      svg = renderV2ById(id, {
        title: sample.title,
        accentWord: sample.accentWord,
        accent,
        chip: sample.chip,
        eyebrow: sample.eyebrow,
        shade,
      });
    } else if (TEMPLATES[id]) {
      svg = buildThumbSvg(id, {
        title: sample.title,
        accentWord: sample.accentWord,
        accent,
        chip: sample.chip,
        eyebrow: sample.eyebrow,
        shade,
      });
    } else {
      svg = buildThumbSvg('clean', {
        title: sample.title,
        accentWord: sample.accentWord,
        accent,
        chip: sample.chip,
        eyebrow: sample.eyebrow,
        shade,
      });
    }

    const jpeg = await sharp(Buffer.from(svg))
      .resize(400, 225)
      .jpeg({ quality: 82 })
      .toBuffer();

    return new Response(jpeg, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(jpeg.length),
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch (e) {
    return new Response(null, { status: 500 });
  }
}
