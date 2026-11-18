// #125 (S-12 sweep) — THE one live brand list. Replaces the deleted static
// 16-brand maps: the sidebar, the thumbs picker and the 8 mark-using pages
// all read THIS — connect a
// channel and it appears, disconnect and it disappears, zero code edits
// (no-static-maps directive).
//
// Sources (the same rule the overview route applies):
//   legacy brands  — lib/brands.json via brands() (real brand data, active only)
//   registry       — registryChannels() (wizard + yt-bot), appended when the
//                    slug OR lowercase label isn't already covered
// `short` is DERIVED (first 2 chars of label/slug, uppercased) — never stored
// in code. Clients only ever see channels linked to their account.
import { getUser } from '@/lib/route-auth';
import { slugsForUser } from '@/lib/access';
import { brands } from '@/lib/data.mjs';
import { deriveBrandList } from '@/lib/brand-list.mjs';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const user = await getUser(req).catch(() => null);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  // fail-closed scope (clients see only their channels; a registry blip = [])
  const owned = await slugsForUser(user).catch(() => []);
  let registry = [];
  try {
    const { registryChannels } = await import('@/lib/channels-registry');
    registry = await registryChannels();
  } catch { }
  if (owned) registry = registry.filter((c) => owned.includes(c.slug));
  const legacy = brands() || {};
  // clients: owned is their slug list (fail-closed []); owner/staff: null = all
  const channels = deriveBrandList(legacy, registry).filter((c) => (owned ? owned.includes(c.slug) : true));
  return Response.json({ channels });
}
