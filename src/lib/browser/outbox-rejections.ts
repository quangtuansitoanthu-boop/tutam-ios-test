import type { StorageLike } from './storage-contract';

export interface RejectedOutboxOperation<T> {
  operation: T;
  status: number;
  rejectedAt: string;
}

export function isPermanentOutboxRejection(status: number): boolean {
  return status === 400 || status === 404 || status === 422;
}

export function readOutboxRejections<T>(storage: StorageLike, key: string): RejectedOutboxOperation<T>[] {
  const raw = storage.getItem(key);
  if (raw === null) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every(value => value && typeof value === 'object'
    && value.operation && typeof value.operation === 'object'
    && isPermanentOutboxRejection(value.status) && typeof value.rejectedAt === 'string')) {
    throw new Error('invalid_outbox_rejections');
  }
  return parsed;
}

export function quarantineOutboxOperation<T>(
  storage: StorageLike, key: string, operation: T, status: number, rejectedAt: string,
): void {
  const rejected = readOutboxRejections<T>(storage, key);
  const serialized = JSON.stringify(operation);
  if (rejected.some(entry => JSON.stringify(entry.operation) === serialized)) return;
  // Lưu bản gốc trước khi rời hàng đợi; quota/lỗi ghi không được làm mất dữ liệu.
  storage.setItem(key, JSON.stringify([...rejected, { operation, status, rejectedAt }]));
}

export function removeOutboxRejection<T>(storage: StorageLike, key: string, operation: T): void {
  const serialized = JSON.stringify(operation);
  const remaining = readOutboxRejections<T>(storage, key)
    .filter(entry => JSON.stringify(entry.operation) !== serialized);
  storage.setItem(key, JSON.stringify(remaining));
}
