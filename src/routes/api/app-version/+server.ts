import { version } from '$app/environment';
import { parseStoreRelease } from '$lib/contracts/native-app-update';
import type { RequestHandler } from './$types';

// Bump MIN_APP_VERSION only when a native shell release must be force-updated.
const MIN_APP_VERSION = '1.0.0';

export const GET: RequestHandler = ({ platform }) => {
  let policy: { ios?: unknown; android?: unknown } | null = null;
  try {
    const configured = platform?.env.NATIVE_APP_UPDATES;
    if (configured) policy = JSON.parse(configured);
  } catch {
    // Cấu hình sai không được chặn app hoặc ảnh hưởng client cũ.
  }
  return Response.json({
    minVersion: MIN_APP_VERSION,
    latestBuild: version,
    nativeUpdates: {
      ios: parseStoreRelease('ios', policy?.ios),
      android: parseStoreRelease('android', policy?.android),
    },
  }, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
};
