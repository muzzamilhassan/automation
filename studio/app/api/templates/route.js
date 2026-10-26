// Template registry view (issue #102 Phase 1, Task 7).
// GET: the registry-assignable templates (git catalog + metadata, loaded
// fail-closed by template-registry.js) plus, for ?channel=<id>, that
// channel's active assignments from Neon.
// Read-only surface: owner AND staff (AC-9). Writes live in ./assign.
import { requireRole } from '@/lib/route-auth';
import { loadRegistryTemplates } from '@/lib/template-registry';
import { TEMPLATES_DATA } from '@/lib/templates-catalog';
import { REGISTRY_META } from '@/lib/template-registry.data';
import { getRegistryDb } from '@/lib/template-registry-db';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  if (!(await requireRole(req, ['owner', 'staff']))) return Response.json({ error: 'not signed in' }, { status: 401 });

  // Loader is pure and fail-closed: families without (valid) metadata are
  // simply absent; invalid blocks are reported in `invalid`, never listed.
  const view = loadRegistryTemplates(TEMPLATES_DATA, REGISTRY_META);

  const channelId = new URL(req.url).searchParams.get('channel');
  if (!channelId) {
    return Response.json({ templates: view.templates, invalid: view.invalid });
  }

  try {
    const db = await getRegistryDb();
    const assignments = await db.listAssignments(channelId);
    return Response.json({ channelId, templates: view.templates, invalid: view.invalid, assignments });
  } catch (e) {
    return Response.json({ error: e.message, channelId, templates: view.templates, invalid: view.invalid, assignments: [] }, { status: 502 });
  }
}
