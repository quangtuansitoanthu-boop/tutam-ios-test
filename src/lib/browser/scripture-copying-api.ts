import { fetchNativeJsonMutation } from './native-api';
import { fetchWithSessionRefresh } from './session-csrf';
import { refreshBrowserSession } from '$lib/stores/session.svelte';
import type { CopyAck, CopyAuth, CopySaveInput } from './scripture-copying-workspace';
import { COPYING_BOOKS, type CopyBookId } from '$lib/domain/practice/scripture-copying';
import { requestDeadline } from './network-deadline';

export interface CopyCloudSnapshot extends CopyAck {
  sutraId: CopyBookId; chapter: number; runId: string; sourceVersion: string;
  texts: string[]; completedBlocks: number; complete: boolean;
}
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

export async function readLatestCopyingSnapshot(signal: AbortSignal): Promise<CopyCloudSnapshot | null> {
  if (signal.aborted) throw new Error('principal_changed');
  const deadline = requestDeadline(signal, 4_000);
  let stopWaiting = () => {};
  // Không để bước refresh phiên hoặc đọc body giữ màn local sau hạn chờ.
  const aborted = new Promise<never>((_, reject) => {
    stopWaiting = () => reject(signal.aborted ? new Error('principal_changed') : deadline.signal.reason ?? new Error('copy_read_timed_out'));
    deadline.signal.addEventListener('abort', stopWaiting, { once: true });
  });
  try {
    const read = async (): Promise<CopyCloudSnapshot | null> => {
      const response = await fetchWithSessionRefresh('/api/practice/copying?latest=1', { signal: deadline.signal, credentials: 'include', cache: 'no-store' });
      const body = await response.json();
      if (signal.aborted) throw new Error('principal_changed');
      if (deadline.signal.aborted) throw deadline.signal.reason ?? new Error('copy_read_timed_out');
      if (!response.ok) throw new Error(body?.error?.message ?? 'Không đọc được bản hệ thống.');
      const copy = body?.copy;
      if (copy === null) return null;
      if (!copy || !COPYING_BOOKS.some(book => book.id === copy.sutraId) || !Number.isSafeInteger(copy.chapter) || copy.chapter < 1
        || typeof copy.runId !== 'string' || !UUID.test(copy.runId) || typeof copy.sourceVersion !== 'string' || !copy.sourceVersion
        || !Array.isArray(copy.texts) || !copy.texts.length || !copy.texts.every((text: unknown) => typeof text === 'string')
        || !Number.isSafeInteger(copy.revision) || copy.revision < 1 || typeof copy.savedAt !== 'string' || !Number.isFinite(Date.parse(copy.savedAt))
        || !Number.isSafeInteger(copy.completedBlocks) || copy.completedBlocks < 0 || copy.completedBlocks > copy.texts.length || typeof copy.complete !== 'boolean') {
        throw new Error('Bản lưu không hợp lệ; bản đang chép được giữ nguyên.');
      }
      return { sutraId: copy.sutraId, chapter: copy.chapter, runId: copy.runId, sourceVersion: copy.sourceVersion,
        texts: copy.texts, revision: copy.revision, savedAt: copy.savedAt, completedBlocks: copy.completedBlocks, complete: copy.complete };
    };
    return await Promise.race([read(), aborted]);
  } finally {
    deadline.signal.removeEventListener('abort', stopWaiting);
    deadline.dispose();
  }
}

/** Called only by the user's Save action. Never replay a write on any failure. */
export async function sendCopyingSnapshot(payload: CopySaveInput, auth: CopyAuth, signal: AbortSignal): Promise<CopyAck> {
  if (signal.aborted) throw new Error('principal_changed');
  const init: RequestInit = { method: 'PUT', signal, credentials: 'include',
    headers: { 'content-type': 'application/json', 'x-csrf-token': auth.csrfToken }, body: JSON.stringify(payload) };
  const native = await fetchNativeJsonMutation('/api/practice/copying', init);
  const response = native ?? await fetchWithSessionRefresh('/api/practice/copying', init);
  if (signal.aborted) throw new Error('principal_changed');
  if (native && response.status === 401) await refreshBrowserSession().catch(() => undefined);
  if (signal.aborted) throw new Error('principal_changed');
  const body = await response.json();
  if (signal.aborted) throw new Error('principal_changed');
  if (!response.ok) throw new Error(body.error?.message ?? 'Không thể lưu lên hệ thống.');
  if (!Number.isSafeInteger(body.revision) || typeof body.savedAt !== 'string') throw new Error('Phản hồi lưu chưa hợp lệ.');
  return body;
}
