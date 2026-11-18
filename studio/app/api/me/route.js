// Phase 0 (P0-7): who is signed in? The client chrome (account menu) renders
// the real session identity instead of a hardcoded owner card.
import { getUser } from '@/lib/route-auth';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const user = await getUser(req).catch(() => null);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  return Response.json({ email: user.email, name: user.name || '', role: user.role });
}
