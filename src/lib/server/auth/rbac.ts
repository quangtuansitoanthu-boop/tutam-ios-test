const RANK = { guest: 0, user: 1, admin: 2 } as const;

function normalizePrincipalRole(raw?: string | null): 'guest' | 'user' | 'admin' {
  if (raw === 'admin') return 'admin';
  if (raw === 'user' || raw === 'ctv') return 'user';
  return 'guest';
}

export function hasRole(session: { role?: string | null } | null | undefined, minimum: 'guest' | 'user' | 'admin'): boolean {
  const role = normalizePrincipalRole(session?.role);
  return RANK[role] >= RANK[minimum];
}

export function can(session: { role?: string | null } | null | undefined, capability: string): boolean {
  const role = normalizePrincipalRole(session?.role);
  const matrix: Record<string, Array<'guest' | 'user' | 'admin'>> = {
    'articles:read': ['guest', 'user', 'admin'],
    'articles:write': ['admin'],
    'articles:delete': ['admin'],
    'comments:create': ['guest', 'user', 'admin'],
    'comments:contact': ['admin'],
    'talks:read-private': ['admin'],
    'talks:write': ['admin'],
    'talks:delete': ['admin'],
    'talks:drive-scan': ['admin'],
    'downloads:use': ['user', 'admin'],
    'sync:own': ['user', 'admin'],
    'media:upload': ['admin'],
    'media:delete': ['admin'],
    'admin:dashboard': ['admin'],
    'members:manage': ['admin'],
    'notifications:read': ['admin'],
  };
  return matrix[capability]?.includes(role) === true;
}
