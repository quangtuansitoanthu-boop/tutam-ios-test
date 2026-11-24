export const APP_VERSION_PATH = '/api/app-version';

export const STORE_URLS = {
  ios: 'https://apps.apple.com/app/id6829182305',
  android: 'https://play.google.com/store/apps/details?id=vn.quangtu.tutam',
} as const;

export type UpdatePlatform = keyof typeof STORE_URLS;
export type StoreRelease = { version: string; storeUrl: string; build?: string };

function versionParts(value: unknown): number[] | null {
  if (typeof value !== 'string' || !/^\d{1,9}(?:\.\d{1,9}){1,2}$/u.test(value)) return null;
  return value.split('.').map(Number);
}

function androidBuild(value: unknown): number | null {
  return typeof value === 'string' && /^[1-9]\d{0,9}$/u.test(value) && Number(value) <= 2_100_000_000
    ? Number(value) : null;
}

export function parseStoreRelease(platform: UpdatePlatform, value: unknown): StoreRelease | null {
  if (!value || typeof value !== 'object') return null;
  const { version, storeUrl: suppliedUrl, build } = value as Record<string, unknown>;
  const storeUrl = STORE_URLS[platform];
  if (typeof version !== 'string' || !versionParts(version) || suppliedUrl !== storeUrl) return null;
  if (platform === 'android') {
    if (typeof build !== 'string' || androidBuild(build) === null) return null;
    return { version, storeUrl, build };
  }
  return { version, storeUrl };
}

export function isOlderNativeBuild(
  platform: UpdatePlatform,
  installed: { version: string; build: string },
  release: StoreRelease,
): boolean {
  const versionOrder = compareVersions(installed.version, release.version);
  if (versionOrder === null || versionOrder > 0) return false;
  if (platform === 'android') {
    const current = androidBuild(installed.build);
    const target = androidBuild(release.build);
    return current !== null && target !== null && current < target;
  }
  return versionOrder < 0;
}

function compareVersions(left: string, right: string): number | null {
  const current = versionParts(left);
  const target = versionParts(right);
  if (!current || !target) return null;
  for (let index = 0; index < 3; index += 1) {
    const difference = (current[index] ?? 0) - (target[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}
