// #123 (OPS-12) — SAFE panel-password rotation, post-#120 reality.
//
// The panel password (STUDIO_PASSWORD) is ALSO the HMAC key for every
// session cookie (session.js) — so the moment the new value is deployed,
// every device is signed out automatically. Nothing else keys off the
// password anymore: channel tokens live under MASTER_KEY (#120). The ONLY
// rotation hazard left is a pre-#120 legacy (v1) tokenEnc row, which is
// keyed by the OLD password — this endpoint re-encrypts any stragglers to
// v2 BEFORE the owner changes the value on Vercel.
//
// The server NEVER sets the password itself (R7): changing STUDIO_PASSWORD
// requires a Vercel-API token powerful enough to rewrite env vars, and that
// token is account-scoped — full power over every project. Too much to hand
// the panel for a once-a-year action. So: this route verifies + validates +
// re-protects, then returns the exact manual steps. A hijacked owner session
// gains nothing here — it can only validate a candidate, never install one.
import { getUser } from '@/lib/route-auth';
import { enforceLimits } from '@/lib/rate-limit.mjs';
import { appendAudit } from '@/lib/audit';
import { db, dbReady } from '@/lib/db';
import { decryptJSON, encryptJSON, classifyTokenEncRow } from '@/lib/channels-registry';

export const dynamic = 'force-dynamic';

export const ROTATION_STEPS = [
  'Open the Vercel environment-variables page (link below).',
  'Update STUDIO_PASSWORD to your new password (overwrite the value).',
  'Redeploy: dashboard Redeploy button, or run: cd studio && vercel --prod',
  'Sign in with the new password. All devices were signed out automatically the moment the new deploy went live.',
  'Note: don\'t rotate while a channel Google-connect is mid-flow — in-flight connect links are signed with the old password and would die.',
];

export async function POST(req) {
  const user = await getUser(req);
  if (!user || user.role !== 'owner') return Response.json({ error: 'not signed in' }, { status: 401 });

  // #121 limiter: this endpoint verifies a password — never hammerable
  const limited = await enforceLimits(user, [{ bucket: 'pw-rotate', limit: 5, windowSec: 3600 }]);
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const { currentPassword, newPassword, confirm } = body;

  // R2 — verify the human knows the current password before anything happens
  if (!currentPassword || currentPassword !== process.env.STUDIO_PASSWORD) {
    return Response.json({ error: 'Current password is wrong — nothing was changed.' }, { status: 401 });
  }

  // R3 — the new one must be worth having
  const pw = String(newPassword || '');
  if (pw.length < 12 || pw.length > 128) {
    return Response.json({ error: 'New password must be 12–128 characters.' }, { status: 400 });
  }
  if (pw === currentPassword) {
    return Response.json({ error: 'The new password must be different from the current one.' }, { status: 400 });
  }
  if (confirm !== undefined && confirm !== pw) {
    return Response.json({ error: 'New password and confirmation don\'t match.' }, { status: 400 });
  }

  // R4 — rotation precondition: v2 must exist, or legacy rows can't be saved
  if (!process.env.MASTER_KEY) {
    return Response.json({ error: 'MASTER_KEY is not set on this server — password rotation is disabled because legacy token rows could not be re-protected. Set MASTER_KEY first (issue #120).' }, { status: 503 });
  }

  // R5 — re-protect any password-keyed (v1) token rows BEFORE the value changes
  if (!dbReady || !db) {
    return Response.json({ error: 'Database unavailable — cannot verify token rows are rotation-safe. Try again.' }, { status: 503 });
  }
  let scanned = 0, migrated = 0, unreadable = 0;
  try {
    const rows = await db`SELECT slug, token_enc FROM channels WHERE token_enc IS NOT NULL`;
    for (const r of rows) {
      scanned += 1;
      const kind = classifyTokenEncRow(r.token_enc);
      if (kind === 'v2') continue;
      if (kind === 'legacy') {
        const obj = decryptJSON(r.token_enc); // dual-read works NOW (old password still live)
        if (!obj) { unreadable += 1; continue; }
        const newEnc = encryptJSON(obj); // MASTER_KEY set → guaranteed v2
        await db`UPDATE channels SET token_enc = ${newEnc} WHERE slug = ${r.slug}`;
        migrated += 1;
      } else {
        unreadable += 1; // already broken before rotation — warn, don't block
      }
    }
  } catch (e) {
    return Response.json({ error: `Token pre-flight failed: ${String(e.message).slice(0, 120)} — rotation NOT confirmed ready.` }, { status: 502 });
  }

  // R6 — one audit row, COUNTS ONLY. The passwords never touch it.
  const actor = user.email;
  await appendAudit(actor, 'password-rotate-prepare', `${scanned} tokens scanned · ${migrated} re-protected · ${unreadable} unreadable`);

  // R7 — steps, not installation
  return Response.json({
    ok: true,
    scanned,
    migrated,
    unreadable,
    steps: ROTATION_STEPS,
    dashboardUrl: 'https://vercel.com/muzzamilhassans-projects/quarry-studio/settings/environment-variables',
    ...(unreadable > 0 ? { warning: `${unreadable} token row(s) were already unreadable before rotation (likely from an old key change). Rotation is still safe — they were broken anyway.` } : {}),
  });
}
