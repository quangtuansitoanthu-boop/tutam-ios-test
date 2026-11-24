import { isNativeApp } from './native-platform';

export function isNativeAdminReadOnly(role: string | undefined): boolean {
  return role === 'admin' && isNativeApp();
}

// Giữ quyền web và thao tác cá nhân; app chỉ ghi qua các ngoại lệ quản trị cụ thể.
export async function blocksNativeAdminWrite(input: RequestInfo | URL, init: RequestInit | undefined, role: string | undefined): Promise<boolean> {
  if (!isNativeAdminReadOnly(role)) {
    if (!isNativeApp()) return false;
    try {
      const path = new URL(input instanceof Request ? input.url : String(input), 'https://quangtu.vn').pathname;
      return /^\/api\/admin\/community\/moderation(?:\/|$)/u.test(path);
    } catch { return false; }
  }
  const request = input instanceof Request ? input : null;
  const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return false;
  const path = new URL(request?.url ?? String(input), 'https://quangtu.vn').pathname;
  // Đọc/nghe và bình luận vẫn là luồng sử dụng cá nhân, không phải sửa nội dung quản trị.
  if (method === 'POST' && (/^\/api\/articles\/[^/]+\/(views|comments)$/u.test(path)
    || /^\/api\/talks\/[^/]+\/plays$/u.test(path))) return false;
  if (/^\/api\/practice\/campaigns(?:\/[^/]+)?$/u.test(path)) return true;
  if (!/^\/api\/(admin|articles|talks|upload|media)(\/|$)/u.test(path)) return false;
  const moderation = /^\/api\/admin\/community\/moderation\/(comments|profiles|reports)\/[^/]+$/u.exec(path);
  const mindful = /^\/api\/admin\/community\/moderation\/mindful\/([A-Za-z0-9][A-Za-z0-9._:-]{0,99})$/u.exec(path);
  const mindfulDecision = method === 'PATCH' && mindful && mindful[1] !== 'approve-all';
  const mindfulPrepare = method === 'POST' && path === '/api/admin/community/moderation/mindful/approve-all/prepare';
  const mindfulBulk = method === 'POST' && path === '/api/admin/community/moderation/mindful/approve-all';
  const campaignLinkUpdate = method === 'PUT' && input === '/api/admin/phap-bao/link-shopee';
  if (!campaignLinkUpdate && !mindfulDecision && !mindfulPrepare && !mindfulBulk
    && (method !== 'PATCH' || (!moderation && !/^\/api\/admin\/members\/(?:google\/)?[^/]+$/u.test(path)))) return true;
  try {
    const raw = init?.body ?? (request ? await request.clone().text() : null);
    if (typeof raw !== 'string') return true;
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return true;
    const update = body as Record<string, unknown>;
    if (mindfulDecision || mindfulPrepare || mindfulBulk) {
      const validOperationId = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value);
      if (mindfulDecision) {
        if (Object.keys(update).some(key => !['action', 'revision', 'reason', 'operationId'].includes(key))
          || !['approve', 'reject', 'delete'].includes(String(update.action))
          || !Number.isSafeInteger(update.revision) || Number(update.revision) < 1
          || (update.operationId !== undefined && !validOperationId(update.operationId))
          || (update.reason != null && (typeof update.reason !== 'string' || update.reason.length > 1000))
          || (update.action === 'reject' && (typeof update.reason !== 'string' || !update.reason.trim()))) return true;
        return false;
      }
      const fields = mindfulPrepare ? ['operationId', 'postKind'] : ['operationId', 'postKind', 'cutoff', 'after'];
      if (Object.keys(update).some(key => !fields.includes(key)) || !validOperationId(update.operationId)
        || (update.postKind !== undefined && update.postKind !== 'repentance' && update.postKind !== 'good_deed')) return true;
      if (mindfulBulk && (typeof update.cutoff !== 'string' || update.cutoff.length > 40
        || !/^\d{4}-\d{2}-\d{2}T/u.test(update.cutoff) || !Number.isFinite(Date.parse(update.cutoff))
        || (update.after != null && (typeof update.after !== 'string' || !update.after.length || update.after.length > 512)))) return true;
      return false;
    }
    if (campaignLinkUpdate) {
      return Object.keys(update).length !== 1 || typeof update.link_shopee !== 'string'
        || !update.link_shopee.trim() || update.link_shopee.trim().length > 2000;
    }
    if (moderation) {
      if (Object.keys(update).some(key => !['action', 'revision', 'reason'].includes(key))) return true;
      const action = update.action;
      if (typeof action !== 'string' || !(moderation[1] === 'reports' ? ['resolve'] : ['approve', 'reject', 'hide']).includes(action)) return true;
      if (typeof update.revision !== 'number' || !Number.isInteger(update.revision) || update.revision <= 0) return true;
      if (update.reason !== undefined && !(action === 'hide' && update.reason === null)
        && (typeof update.reason !== 'string' || update.reason.length > 1000)) return true;
      if (action === 'reject' && (typeof update.reason !== 'string' || !update.reason.trim())) return true;
      return false;
    }
    return Object.keys(update).length !== 1 || !['active', 'suspended'].includes(String(update.status));
  } catch {
    return true;
  }
}
