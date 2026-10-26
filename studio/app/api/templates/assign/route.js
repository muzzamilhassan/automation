// Template assignment writes (issue #102 Phase 1, Task 7).
// POST = assign (compatibility validator gates the save — spec D4/AC-3),
// DELETE = unassign. Owner-only writes (AC-9); audit rows are written by the
// DB layer itself — this route only parses, gates, and calls the libs.
import { getUser } from '@/lib/route-auth';
import { readRegistry, readRepoJSON } from '@/lib/channels-registry';
import { decryptKeys } from '@/lib/keys-vault';
import { loadRegistryTemplates, validateAssignment } from '@/lib/template-registry';
import { TEMPLATES_DATA } from '@/lib/templates-catalog';
import { REGISTRY_META } from '@/lib/template-registry.data';
import { getRegistryDb } from '@/lib/template-registry-db';

export const dynamic = 'force-dynamic';

const KEYS_FILE = 'yt-mcp/channel-keys.json';

// Vault provider -> registry capability (spec D4: a capability counts as
// available only when a configured provider covers it; every key in the vault
// passed live validateKey() at save time, so "configured" implies "working").
// Engine knowledge, not brand data — brand specifics stay in kit/registry.
const CAPABILITY_PROVIDERS = {
  'script-gen': ['gemini', 'groq', 'cerebras', 'mistral', 'hf', 'openrouter'],
  'tts': ['openai', 'elevenlabs'],
  'captions': ['openai'],
  // PHASE-2 UPGRADE: the vault holds no image-generation provider today
  // (pixabay/pexels are stock *search* keys, not generators), so image-gen
  // cannot be expressed — it stays unavailable here until Phase 2 adds a
  // generator provider to the vault.
  'image-gen': [],
};

// channelConfig from the channel registry's real shape (spec D4 "live data"):
// - niches: the channel's main niche plus its configured sub-niches
// - formats: the channel registry stores no per-channel format field; every
//   lane is a Shorts-first vertical lane, so 'short' is always produced, and
//   a channel with a long-form slot configured (kit.longSlot) also gets
//   'long'. PHASE-2 UPGRADE: add an explicit per-channel formats field to the
//   channels table instead of deriving it.
// - brand_kit: present when the channel has any kit data saved.
function buildChannelConfig(entry) {
  const kit = entry?.kit || {};
  const niches = [...new Set([entry?.niche, ...(Array.isArray(kit.niches) ? kit.niches : [])]
    .filter((n) => typeof n === 'string' && n.length > 0))];
  const formats = kit.longSlot ? ['short', 'long'] : ['short'];
  const brand_kit = Boolean(entry?.kit && Object.keys(entry.kit).length > 0);
  return { formats, niches, brand_kit };
}

// capabilityMap from the BYOK vault (per-channel provider keys, keyed by slug).
// Fail-closed: an unreadable vault means every capability is unavailable and
// the validator blocks the assignment with exact missing_capability codes.
async function buildCapabilityMap(slug) {
  const map = {};
  let keys = null;
  try {
    const file = (await readRepoJSON(KEYS_FILE)) || {};
    const entry = file[slug];
    keys = entry?.enc ? decryptKeys(entry.enc) : null;
  } catch {
    keys = null; // vault unreachable -> nothing counts as available
  }
  for (const [cap, providers] of Object.entries(CAPABILITY_PROVIDERS)) {
    map[cap] = providers.some((p) => keys?.[p]);
  }
  return map;
}

const denyOwner = async (req) => {
  const user = await getUser(req);
  return user?.role === 'owner' ? user : null;
};

async function findChannelEntry(channelId) {
  // readRegistry is DB-first — the canonical channel store (Neon, with the
  // repo file as the CI feed), same accessor the other /api/channels routes use.
  const reg = await readRegistry().catch(() => null);
  const channels = Array.isArray(reg?.channels) ? reg.channels : [];
  return channels.find((c) => c.slug === channelId || c.channelId === channelId) || null;
}

export async function POST(req) {
  const user = await denyOwner(req);
  if (!user) return Response.json({ error: 'owner only' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { channelId, familyId } = body || {};
  const pinnedMajor = Number(body?.pinnedMajor);
  if (!channelId || !familyId) return Response.json({ error: 'channelId and familyId are required' }, { status: 400 });
  if (!Number.isInteger(pinnedMajor) || pinnedMajor < 0) return Response.json({ error: 'pinnedMajor must be a non-negative integer' }, { status: 400 });

  // Resolve the template's validated registry meta from the loader. Families
  // without (valid) metadata are not assignable — 404, never a silent pass.
  const view = loadRegistryTemplates(TEMPLATES_DATA, REGISTRY_META);
  const template = view.templates.find((t) => t.familyId === familyId);
  if (!template) {
    const invalid = view.invalid.find((v) => v.familyId === familyId);
    return Response.json({ error: invalid ? `template "${familyId}" has invalid registry metadata and is not assignable` : `unknown template family "${familyId}"`, invalid: invalid?.errors || [] }, { status: 404 });
  }

  const entry = await findChannelEntry(channelId);
  if (!entry) return Response.json({ error: `unknown channel "${channelId}"` }, { status: 404 });

  // Validator gate BEFORE anything touches the DB (spec D4: blocks the save).
  const channelConfig = buildChannelConfig(entry);
  const capabilityMap = await buildCapabilityMap(entry.slug || channelId);
  // Phase 1 renderers all ship in-repo with the CI render lane, so renderer
  // availability is trivially true for registry-declared renderers.
  // PHASE-2 UPGRADE: track per-renderer availability in the vault/config
  // instead of asserting it here.
  capabilityMap[template.registry.renderer] = true;
  const verdict = validateAssignment(template.registry, channelConfig, capabilityMap);
  if (!verdict.ok) return Response.json({ error: 'incompatible', reasons: verdict.reasons }, { status: 422 });

  try {
    const db = await getRegistryDb();
    await db.ensureSchema();
    const result = await db.assignTemplate(channelId, familyId, pinnedMajor, user.email);
    if (!result.ok) return Response.json({ error: 'assign failed', errors: result.errors || [result.error] }, { status: 422 });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }
}

export async function DELETE(req) {
  const user = await denyOwner(req);
  if (!user) return Response.json({ error: 'owner only' }, { status: 403 });

  // Body first, query params as fallback.
  let { channelId, familyId } = (await req.json().catch(() => ({}))) || {};
  const q = new URL(req.url).searchParams;
  channelId = channelId || q.get('channelId') || q.get('channel');
  familyId = familyId || q.get('familyId');
  if (!channelId || !familyId) return Response.json({ error: 'channelId and familyId are required' }, { status: 400 });

  try {
    const db = await getRegistryDb();
    const result = await db.unassignTemplate(channelId, familyId, user.email);
    if (!result.ok) {
      const status = result.error === 'no_active_assignment' ? 404 : 400;
      return Response.json({ error: result.error }, { status });
    }
    return Response.json({ ok: true, channelId, familyId });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }
}
