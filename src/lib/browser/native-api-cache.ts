/**
 * Cache API "network-first" cho bản native (Capacitor).
 *
 * - Có mạng: luôn lấy dữ liệu mới nhất từ web (sách/PDF/album mới tự xuất hiện),
 *   đồng thời lưu bản sao vào Cache Storage của app.
 * - Mất mạng: trả bản đã lưu gần nhất; nếu chưa có thì dùng dữ liệu đóng gói sẵn.
 * - Không lưu bốn sách và ba album chỉ dành cho web.
 */
import { isOnlineOnlyAudioAlbum, isOnlineOnlyBook } from '$lib/domain/online-only-policy';
import { isIosExcludedContent } from '$lib/domain/ios-content-policy';
import { isHtmlResponse } from './native-api';
import { resolveOfflineBundledResponse, readUpdatedBundledContentResponse } from './offline-bundled-resolver';
import { openOfflineResponseCache, type OfflineResponseCache } from './offline-response-cache';

const PUBLIC_API_CACHE_NAME = 'tutam-api-v2-public';
const RESTRICTED_IDS_KEY = 'tutam_online_only_ids';
const CACHE_ORIGIN = 'https://tutam-cache.local';

/** ID đã biết của nội dung chỉ online (bổ sung động khi đọc catalog). */
const SEED_RESTRICTED_IDS = [
  'tt_1781529439696',
  'tt_1781529470187',
  'tt_1781529533555',
  'tt_tro_ve_tu_xu_tuyet',
  'pt_1782208869321',
  'pt_1782208945706',
  'pt_1782208975513',
];

/** Chỉ cache dữ liệu nội dung công khai, không cache dữ liệu cá nhân/phiên. */
const CACHEABLE_PATHS = [
  /^\/api\/articles(?:\/[^/]+(?:\/chapters)?)?$/u,
  /^\/api\/data\/(?:baiviet|tap_noi_dung|luot_xem)$/u,
  /^\/api\/talks(?:\/[^/]+)?$/u,
  /^\/api\/phap-bao$/u,
];

let restrictedIds: Set<string> | null = null;

function loadRestrictedIds(): Set<string> {
  if (restrictedIds) return restrictedIds;
  restrictedIds = new Set(SEED_RESTRICTED_IDS);
  try {
    const saved = JSON.parse(localStorage.getItem(RESTRICTED_IDS_KEY) || '[]');
    if (Array.isArray(saved)) saved.forEach((id) => restrictedIds!.add(String(id)));
  } catch {
    // Bỏ qua.
  }
  return restrictedIds;
}

function rememberRestrictedId(id: string): void {
  const ids = loadRestrictedIds();
  if (!id || ids.has(id)) return;
  ids.add(id);
  try {
    localStorage.setItem(RESTRICTED_IDS_KEY, JSON.stringify([...ids]));
  } catch {
    // Bỏ qua.
  }
}

function isRestrictedRow(row: unknown): boolean {
  if (!row || typeof row !== 'object') return false;
  const record = row as Record<string, unknown>;
  if (record.visibility != null && record.visibility !== 'public') return true;
  if (record.trang_thai != null && record.trang_thai !== 'Hoàn thành') return true;
  if (isIosExcludedContent(record)) return true;
  const id = String(record.id ?? '');
  const title = String(record.tieu_de ?? '');
  const restricted = id.startsWith('pt_')
    ? isOnlineOnlyAudioAlbum(title)
    : isOnlineOnlyBook(title, String(record.tac_gia ?? '')) || isOnlineOnlyAudioAlbum(title);
  if (restricted && id) rememberRestrictedId(id);
  return restricted || (id !== '' && loadRestrictedIds().has(id));
}

/** True nếu URL trỏ tới nội dung của một sách/album chỉ online. */
function urlTargetsRestricted(url: URL): boolean {
  const ids = loadRestrictedIds();
  const pathMatch = /^\/api\/(?:articles|talks)\/([^/]+)/u.exec(url.pathname);
  if (pathMatch && ids.has(decodeURIComponent(pathMatch[1]))) return true;
  for (const name of ['id', 'bai_viet_id']) {
    const value = url.searchParams.get(name);
    if (value?.startsWith('eq.') && ids.has(decodeURIComponent(value.slice(3)))) return true;
  }
  return false;
}

export function isCacheableApiPath(pathname: string): boolean {
  return CACHEABLE_PATHS.some((pattern) => pattern.test(pathname));
}

function publicApiCacheKey(url: URL): string {
  return `${CACHE_ORIGIN}${url.pathname}${url.search}`;
}

async function openCache(): Promise<OfflineResponseCache | null> {
  try {
    // Old versions did not filter private content. Never reuse that namespace.
    if (typeof caches !== 'undefined' && typeof caches.delete === 'function') void caches.delete('tutam-api-v1').catch(() => false);
    return await openOfflineResponseCache(PUBLIC_API_CACHE_NAME);
  } catch {
    return null;
  }
}

function jsonResponse(payload: unknown, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

function legacyArticleRow(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const row = payload as Record<string, unknown>;
  if (typeof row.tieu_de === 'string' || typeof row.title !== 'string') return payload;
  return { id: row.id, tieu_de: row.originalTitle ?? row.title, tom_tat: row.originalSummary ?? row.summary ?? '',
    noi_dung: row.content ?? '', danh_muc: row.category ?? 'KHÁC', tags: Array.isArray(row.tags) ? row.tags.join(',') : '',
    tac_gia: row.originalAuthor ?? row.author ?? '', anh_url: row.imageUrl ?? '', noi_bat: row.featured ? 1 : 0,
    ngay_dang: row.publishedAt ?? '', has_muc_luc: row.hasTableOfContents ? 1 : 0, so_tap: row.volumeCount ?? 0,
    trang_thai: row.status ?? '', pdf_url: row.pdfUrl ?? '', link_ngoai: row.externalUrl ?? '',
    created_at: row.createdAt, updated_at: row.updatedAt };
}

/** Explicit book downloads must fail if the complete public payload cannot be saved. */
export async function storeDownloadedBookResponse(path: string, payload: unknown): Promise<void> {
  const url = new URL(path, CACHE_ORIGIN);
  if (!/^\/api\/articles\/[^/]+(?:\/chapters)?$/u.test(url.pathname) || urlTargetsRestricted(url)
    || (Array.isArray(payload) ? payload.some(isRestrictedRow) : isRestrictedRow(payload))) {
    throw new Error('offline_book_not_public');
  }
  const cache = await openCache();
  if (!cache) throw new Error('offline_book_cache_unavailable');
  await cache.put(publicApiCacheKey(url), jsonResponse(payload, { 'x-tutam-cached-at': new Date().toISOString() }));
}

/** Lưu bản sao đã lọc nội dung bản quyền. Không chặn luồng chính. */
export async function storeApiResponse(url: URL, response: Response): Promise<void> {
  if (!isCacheableApiPath(url.pathname) || urlTargetsRestricted(url)) return;
  if (!response.ok || isHtmlResponse(response)) return;
  if (/(?:^|,)\s*(?:no-store|private)(?:\s|,|=|$)/i.test(response.headers.get('cache-control') || '')) return;
  let payload: unknown;
  try {
    payload = await response.clone().json();
  } catch {
    return;
  }

  if (Array.isArray(payload)) {
    const filtered = payload.filter((row) => !isRestrictedRow(row));
    // Danh sách chi tiết chỉ gồm nội dung bản quyền -> không lưu.
    if (payload.length > 0 && filtered.length === 0) return;
    payload = filtered;
  } else if (isRestrictedRow(payload)) {
    return;
  }

  const cache = await openCache();
  if (!cache) return;
  try {
    await cache.put(publicApiCacheKey(url), jsonResponse(payload, { 'x-tutam-cached-at': new Date().toISOString() }));
  } catch {
    // Hết quota: bỏ qua, lần sau thử lại.
  }
}

async function newerBundledApiResponse(url: URL, cached: Response): Promise<Response | null> {
  try {
    const detail = /^\/api\/articles\/([^/]+)(\/chapters)?$/u.exec(url.pathname);
    const legacyArticle = url.pathname === '/api/data/baiviet';
    const legacyChapters = url.pathname === '/api/data/tap_noi_dung';
    if (!detail && !legacyArticle && !legacyChapters) return null;
    const id = detail ? decodeURIComponent(detail[1])
      : (url.searchParams.get(legacyChapters ? 'bai_viet_id' : 'id') ?? '').replace(/^eq\./u, '');
    if (!id) return null;
    const ids = [id, id.startsWith('book_') ? id.slice(5) : `book_${id}`];
    const chapters = Boolean(detail?.[2]) || legacyChapters;
    const sourceDate = (payload: unknown, metadata: boolean): number | undefined => {
      const rows: unknown[] = Array.isArray(payload) ? payload : [payload];
      if (!rows.length || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) return NaN;
      const values = rows as Record<string, unknown>[];
      if (values.some(row => metadata ? !ids.includes(String(row.id ?? ''))
        : row.bai_viet_id != null && !ids.includes(String(row.bai_viet_id)))) return NaN;
      if (values.every(row => row.updated_at == null && row.updatedAt == null)) return undefined;
      const dates = values.map(row => Date.parse(String(row.updated_at ?? row.updatedAt ?? '')));
      return dates.every(Number.isFinite) ? Math.max(...dates) : NaN;
    };
    const date = sourceDate(await cached.clone().json(), !chapters);
    // Không dùng giờ ghi cache làm phiên bản; dữ liệu không rõ ngày vẫn được giữ.
    if (typeof date !== 'number' || !Number.isFinite(date)) return null;
    const metadata = await resolveOfflineBundledResponse(`/api/articles/${encodeURIComponent(id)}`);
    if (!metadata?.ok) return null;
    const bundledDate = sourceDate(await metadata.json(), true);
    if (typeof bundledDate !== 'number' || !Number.isFinite(bundledDate) || date >= bundledDate) return null;
    const response = await resolveOfflineBundledResponse(`${url.pathname}${url.search}`);
    if (!response?.ok) return null;
    const payload: unknown = await response.clone().json();
    return payload && typeof payload === 'object' && (Array.isArray(payload) ? payload.length > 0 : Object.keys(payload).length > 0) ? response : null;
  } catch {
    return null;
  }
}

/** Lấy bản đã lưu (nếu có), sau đó tới dữ liệu đóng gói sẵn trong app. */
export async function readOfflineApiResponse(url: URL): Promise<Response | null> {
  if (urlTargetsRestricted(url)) {
    return new Response(JSON.stringify({
      error: { code: 'online_only', message: 'Nội dung này chỉ xem/nghe trực tuyến. Vui lòng kết nối mạng.' },
    }), { status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  }
  const manuallySaved = await readUpdatedBundledContentResponse(url);
  if (manuallySaved) return manuallySaved;
  if (isCacheableApiPath(url.pathname)) {
    const cache = await openCache();
    try {
      const cached = await cache?.match(publicApiCacheKey(url));
      if (cached) {
        const newer = await newerBundledApiResponse(url, cached);
        if (newer) return newer;
        if (/^\/api\/articles\/[^/]+$/u.test(url.pathname)) {
          const original: unknown = await cached.clone().json();
          const row = legacyArticleRow(original);
          if (isRestrictedRow(row)) return resolveOfflineBundledResponse(`${url.pathname}${url.search}`);
          if (row !== original) return jsonResponse(row);
        }
        return cached;
      }
    } catch {
      // Rơi xuống bundle.
    }
  }
  return resolveOfflineBundledResponse(`${url.pathname}${url.search}`);
}
