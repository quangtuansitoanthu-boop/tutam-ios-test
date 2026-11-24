const RANK = { guest: 0, user: 1, admin: 2 };

function normalizeRole(raw) {
  if (raw === 'admin') return 'admin';
  if (raw === 'user' || raw === 'ctv') return 'user';
  return 'guest';
}

export function hasRole(session, minimum) {
  const role = normalizeRole(session?.role);
  return RANK[role] >= (RANK[minimum] ?? Infinity);
}

export function can(session, capability) {
  const role = normalizeRole(session?.role);
  const matrix = {
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
  };
  return matrix[capability]?.includes(role) === true;
}
