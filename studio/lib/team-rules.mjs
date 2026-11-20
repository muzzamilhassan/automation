// Live fix wave C4 (T5-09 / T5-10): team rules shared by /api/team and its
// tests. Pure — no imports.

export const TEAM_NAME_MAX = 60;
// The panel changes roles between staff and client only. Owners are not
// made from the UI ("Ask Claude to add another owner").
export const ASSIGNABLE_ROLES = ['staff', 'client'];

// What is stored is what is echoed: control characters out, spaces collapsed,
// at most 60 characters.
export function cleanTeamName(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TEAM_NAME_MAX)
    .trim();
}

// null = allowed; otherwise the plain reason it is refused.
export function roleChangeError(users, email, role) {
  if (!ASSIGNABLE_ROLES.includes(role)) return 'role must be staff or client — ask Claude to add another owner';
  const list = Array.isArray(users) ? users : [];
  const key = String(email || '').toLowerCase();
  const target = list.find((u) => String(u.email).toLowerCase() === key);
  if (!target) return 'unknown email';
  const owners = list.filter((u) => u.role === 'owner');
  if (target.role === 'owner' && owners.length <= 1) return 'cannot demote the last owner';
  return null;
}
