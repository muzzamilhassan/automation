// Super Admin — /api/users: every user with their channels, keys status,
// sessions and last activity, in one owner-only payload.
import { getUser } from '@/lib/route-auth';
import { db, dbReady } from '@/lib/db.mjs';
import { registryChannels, readRepoJSON } from '@/lib/channels-registry';
import { listAudit } from '@/lib/audit';
import { decryptKeys } from '@/lib/keys-vault';
import { channelOwnership, clientChannelCount, keysForChannels } from '@/lib/users-view.mjs';

export const dynamic = 'force-dynamic';

const KEYS_FILE = 'yt-mcp/channel-keys.json';

export async function GET(req) {
  const user = await getUser(req);
  if (!user || user.role !== 'owner') return Response.json({ error: 'owner only' }, { status: 403 });
  try {
    // users (Neon is source of truth; repo mirror + bundled file are fallbacks)
    let users = [];
    if (dbReady) {
      try {
        users = await db`SELECT email, role, name, created_at FROM users ORDER BY created_at, email`;
        users = users.map((u) => ({ email: u.email, role: u.role, name: u.name || '', createdAt: u.created_at }));
      } catch { }
    }
    if (!users.length) {
      const repo = (await readRepoJSON('yt-mcp/access.json'))?.users || [];
      users = repo.map((u) => ({ email: u.email, role: u.role || 'client', name: u.name || '' }));
    }

    const registry = await registryChannels();
    const keysFile = (await readRepoJSON(KEYS_FILE)) || {};
    const audit = await listAudit(300);

    // active sessions per email (all users — owner view)
    const sessCounts = {};
    if (dbReady) {
      try {
        const rows = await db`SELECT email, COUNT(*)::int AS n FROM sessions WHERE revoked = FALSE AND expires_at > now() GROUP BY email`;
        for (const r of rows) sessCounts[r.email] = r.n;
      } catch { }
    }

    // Live fix wave C4 (T5-12): channels bound to each user by registry
    // ownerEmail; a channel with NO ownerEmail is the owner's own. Only a
    // channel naming an email not on the team is "no owner assigned".
    const { byEmail, unbound } = channelOwnership(users, registry);
    const bound = (email) => byEmail.get(email) || [];

    // Vault keys per channel — the same file + decrypt /providers reads
    // (provider NAMES only; values stay encrypted, never returned).
    const keysBySlug = {};
    for (const [slug, entry] of Object.entries(keysFile)) {
      const keys = entry?.enc ? decryptKeys(entry.enc) : null;
      if (keys) keysBySlug[slug] = Object.keys(keys).filter((p) => keys[p]);
    }

    const list = users.map((u) => {
      const email = String(u.email).toLowerCase();
      const myChannels = bound(email);
      const lastAction = audit.find((a) => String(a.actor || '').toLowerCase() === email) || null;
      const recentActivity = audit
        .filter((a) => String(a.actor || '').toLowerCase() === email)
        .slice(0, 8)
        .map((a) => ({ at: a.at, action: a.action, detail: a.detail }));
      return {
        email: u.email,
        role: u.role,
        name: u.name,
        createdAt: u.createdAt || null,
        channels: myChannels,
        keys: keysForChannels(myChannels, keysBySlug),
        sessionsActive: sessCounts[email] || 0,
        lastAction: lastAction ? { at: lastAction.at, action: lastAction.action, detail: lastAction.detail } : null,
        recentActivity,
      };
    });

    // T4d (#106): the owner's own channels come from the registry bindings
    // (the requesting owner's bound entries), not a hardcoded legacy-4 list —
    // the wizard binds channels to the owner email the same way it does for
    // clients. Entries with no owner_email (and repo-file fallback entries)
    // count as the owner's own (live fix wave C4, T5-12).
    // Informational payload; the users page renders unboundChannels.
    const legacy = bound(String(user.email).toLowerCase()).map((c) => ({ slug: c.slug }));

    return Response.json({
      users: list,
      unboundChannels: unbound,
      clientChannels: clientChannelCount(list),
      legacyOwnerChannels: legacy,
      totalSessions: Object.values(sessCounts).reduce((a, b) => a + b, 0),
      auditWindow: 300,
    });
  } catch (e) {
    return Response.json({ error: e.message?.slice(0, 140) || 'failed', users: [] }, { status: 500 });
  }
}
