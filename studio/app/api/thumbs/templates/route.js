// GET /api/thumbs/templates — registry metadata for the /thumbs gallery UI.
import { getUser } from '@/lib/route-auth';
import { TEMPLATES } from '@/lib/thumb-templates';
import { v2List } from '@/lib/thumb-templates-v2';

export const dynamic = 'force-dynamic';

// Legacy V1 templates that duplicate modern V2 catalog designs:
const DUPLICATE_V1_IDS = new Set([
  'clean',      // duplicate of v2/frame-line
  'paper',      // duplicate of v2/field-notes
  'luxury',     // duplicate of v2/gold-standard
  'splitba',    // duplicate of v2/seam
  'vs',         // duplicate of v2/split-verdict
  'newspaper',  // duplicate of v2/tabloid
  'bignum',     // duplicate of v2/big-number
  'equation',   // duplicate of v2/strike-truth
  'stats',      // duplicate of v2/data-callout
  'brutalist',  // duplicate of v2/slab-core
  'question',   // duplicate of v2/question-economy
]);

export async function GET(req) {
  // Public template metadata catalog for Studio and preview surfaces
  const v1Entries = Object.entries(TEMPLATES)
    .filter(([id]) => !DUPLICATE_V1_IDS.has(id))
    .map(([id, t]) => ({
      id,
      label: t.label,
      desc: t.desc,
      category: t.category,
      needsPhoto: Boolean(t.needsPhoto),
      aiPreset: t.aiPreset || null,
    }));

  const all = [...v1Entries, ...v2List()];
  const seenIds = new Set();
  const seenLabels = new Set();
  const deduped = [];
  for (const t of all) {
    const norm = t.label.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!seenIds.has(t.id) && !seenLabels.has(norm)) {
      seenIds.add(t.id);
      seenLabels.add(norm);
      deduped.push(t);
    }
  }

  return Response.json({ templates: deduped });
}
