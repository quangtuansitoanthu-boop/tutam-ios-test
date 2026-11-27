import { deleteCachedContentResponse, ensureResponseStorage, putCachedContentResponse, readCachedContentResponses } from './offline-content-index';

export type OfflineResponseCache = Pick<Cache, 'match' | 'put' | 'keys' | 'delete'>;

function requestUrl(input: RequestInfo | URL): string {
  const source = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
  const url = new URL(source, typeof location === 'undefined' ? 'https://localhost/' : location.href);
  url.hash = '';
  return url.href;
}
function matches(stored: string, requested: string, options?: CacheQueryOptions): boolean {
  if (!options?.ignoreSearch) return stored === requested;
  const left = new URL(stored), right = new URL(requested);
  left.search = ''; right.search = '';
  return left.href === right.href;
}

/** Cùng namespace/URL cũ; IDB giữ bản offline khi WebView không có CacheStorage. */
export async function openOfflineResponseCache(cacheName: string): Promise<OfflineResponseCache> {
  let cache: Cache | undefined;
  try { if (typeof caches !== 'undefined') cache = await caches.open(cacheName); } catch { /* Dùng IDB bên dưới. */ }
  if (!cache) await ensureResponseStorage();
  const records = async (url?: string) => {
    try { return await readCachedContentResponses(cacheName, url); }
    catch (cause) { if (!cache) throw cause; return []; }
  };
  return {
    async match(input, options) {
      try { const saved = await cache?.match(input, options); if (saved) return saved; } catch { /* Đọc bản IDB đã lưu. */ }
      const url = requestUrl(input);
      const record = (await records(options?.ignoreSearch ? undefined : url)).find(value => matches(value.url, url, options));
      return record ? new Response(record.body, { status: record.status, statusText: record.statusText, headers: record.headers }) : undefined;
    },
    async put(input, response) {
      if (cache) { await cache.put(input, response); return; }
      if (input instanceof Request && input.method !== 'GET') throw new TypeError('Only GET responses can be saved offline');
      const record = { cacheName, url: requestUrl(input), body: await response.blob(), status: response.status,
        statusText: response.statusText, headers: [...response.headers.entries()] };
      await putCachedContentResponse(record);
    },
    async keys(input, options) {
      const saved = cache ? [...await cache.keys(input, options)] : [];
      const requested = input ? requestUrl(input) : undefined;
      const urls = new Set(saved.map(request => request.url));
      const extra = (await records()).filter(record => !requested || matches(record.url, requested, options));
      for (const record of extra) if (!urls.has(record.url)) { saved.push(new Request(record.url)); urls.add(record.url); }
      return saved;
    },
    async delete(input, options) {
      let removed = cache ? await cache.delete(input, options) : false;
      const requested = requestUrl(input);
      for (const record of await records(options?.ignoreSearch ? undefined : requested)) {
        if (!matches(record.url, requested, options)) continue;
        await deleteCachedContentResponse(cacheName, record.url); removed = true;
      }
      return removed;
    },
  };
}
