// Live fix wave C4 (T5-12): who owns which channel, and which channels have
// vault keys, for the /users super-admin view. Pure — no imports.

const lower = (v) => String(v || '').toLowerCase();

// A registry channel belongs to the user its ownerEmail names. A channel with
// NO ownerEmail is the owner's own (the wizard leaves it blank for them), so
// it goes to every owner account. Only a channel naming an email that is not
// on the team stays "no owner assigned".
export function channelOwnership(users, registry) {
  const byEmail = new Map();
  for (const u of users || []) byEmail.set(lower(u.email), []);
  const owners = (users || []).filter((u) => u.role === 'owner').map((u) => lower(u.email));
  const unbound = [];
  for (const e of registry || []) {
    if (!e?.slug) continue;
    const ch = { slug: e.slug, label: e.label || e.slug };
    const who = lower(e.ownerEmail);
    if (who && byEmail.has(who)) byEmail.get(who).push(ch);
    else if (!who && owners.length) for (const o of owners) byEmail.get(o).push(ch);
    else unbound.push(ch);
  }
  return { byEmail, unbound };
}

// Channels bound to CLIENT accounts — the owner's own channels never count.
export function clientChannelCount(list) {
  return (list || []).filter((u) => u.role === 'client').reduce((n, u) => n + (u.channels?.length || 0), 0);
}

// keysBySlug: { slug: [providerId, …] } (decrypted server-side; names only).
export function keysForChannels(channels, keysBySlug) {
  const out = [];
  for (const c of channels || []) {
    const providers = [...new Set(keysBySlug?.[c.slug] || [])].sort();
    if (providers.length) out.push({ slug: c.slug, label: c.label || c.slug, providers });
  }
  return out;
}
