import type { RequestHandler } from '@sveltejs/kit';
import { handleAppStatsRequest } from '$lib/server/http/api-handler';
import { apiError } from '$lib/server/http/responses';
import { getApiLocals, type EventLike } from '$lib/server/http/runtime';

export const GET: RequestHandler = async (event) => {
  const runtime = getApiLocals(event as unknown as EventLike);
  if (!runtime.env?.DB) {
    return apiError(503, 'platform_unavailable', 'Cloudflare bindings chưa sẵn sàng.', runtime.requestId);
  }
  if (!runtime.migrationSealed) {
    return apiError(503, 'migration_unsealed', 'Dữ liệu chưa được xác minh.', runtime.requestId);
  }
  return handleAppStatsRequest(runtime.env, runtime.requestId);
};
