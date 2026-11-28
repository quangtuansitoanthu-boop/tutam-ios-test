import { registerPlugin } from '@capacitor/core';
import { principalStorageKey } from './principal-storage';
import { isNativeApp } from './native-platform';
import { BIORHYTHM_PROFILE_KEY, DIVINATION_HISTORY_KEY, DREAM_JOURNAL_KEY, getBrowserStorage } from './storage-contract';
import type { DivinationHistoryEntry } from '$lib/domain/practice/divination';
import { beginSpiritualToolsOperation, registerSpiritualToolsPurgeHandler, withSpiritualToolsWriteLock } from './spiritual-tools-operations';

const MAX_HISTORY_ENTRIES = 50;
const nativeHistory = registerPlugin<{
  read(options: { key: string }): Promise<{ value: string }>;
  write(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
}>('DivinationHistory');

type HistoryKind = DivinationHistoryEntry['kind'];
type HistoryUpdate = { ok: true; entries: DivinationHistoryEntry[] } | { ok: false };

let pendingWrite = Promise.resolve();

export async function readDivinationStorageValue(key: string): Promise<string | null> {
  return isNativeApp() ? (await nativeHistory.read({ key })).value : getBrowserStorage().getItem(key);
}

export async function writeDivinationStorageValue(key: string, value: string): Promise<void> {
  if (isNativeApp()) await nativeHistory.write({ key, value });
  else getBrowserStorage().setItem(key, value);
}

export async function removeDivinationStorageValue(key: string): Promise<void> {
  // Native installs can still contain a browser fallback written by an older app.
  const results = await Promise.allSettled([
    ...(isNativeApp() ? [Promise.resolve().then(() => nativeHistory.remove({ key }))] : []),
    Promise.resolve().then(() => {
      const storage = getBrowserStorage();
      if (!storage.removeItem) throw new Error('browser_storage_unavailable');
      storage.removeItem(key);
    }),
  ]);
  if (results.some(result => result.status === 'rejected')) throw new Error('spiritual_tools_purge_failed');
}

async function readList(key: string): Promise<DivinationHistoryEntry[]> {
  const raw = await readDivinationStorageValue(key);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (item): item is DivinationHistoryEntry =>
      item !== null &&
      typeof item === 'object' &&
      (item.kind === 'quan-am' || item.kind === 'moc-luan') &&
      typeof item.id === 'string' &&
      typeof item.dateKey === 'string' &&
      typeof item.createdAt === 'string' &&
      typeof item.title === 'string' &&
      typeof item.topicLabel === 'string' &&
      typeof item.summary === 'string' &&
      Number.isInteger(item.resultNumber),
  );
}

async function updateHistory(
  principalId: string | null | undefined,
  kind: HistoryKind,
  newEntry?: DivinationHistoryEntry,
): Promise<HistoryUpdate> {
  const operation = beginSpiritualToolsOperation(principalId);
  // Cùng một hàng đợi cho lượt đọc–sửa–ghi để hai màn hình không ghi đè lịch sử của nhau.
  const previousWrite = pendingWrite;
  let finishWrite!: () => void;
  pendingWrite = new Promise<void>((resolve) => {
    finishWrite = resolve;
  });
  try {
    await previousWrite;
    return await withSpiritualToolsWriteLock<HistoryUpdate>(async () => {
      operation.assertCurrent();
      const key = principalStorageKey(principalId, DIVINATION_HISTORY_KEY);
      const all = await readList(key);
      operation.assertCurrent();
      const entries = newEntry
        ? [newEntry, ...all.filter((item) => item.kind === kind && item.id !== newEntry.id)].slice(0, MAX_HISTORY_ENTRIES)
        : [];
      const value = JSON.stringify([...entries, ...all.filter((item) => item.kind !== kind)]);
      await writeDivinationStorageValue(key, value);
      operation.assertCurrent();
      return { ok: true, entries };
    });
  } catch {
    return { ok: false };
  } finally {
    finishWrite();
    operation.finish();
  }
}

export async function loadDivinationHistory(
  principalId: string | null | undefined,
  kind: HistoryKind,
): Promise<DivinationHistoryEntry[]> {
  const operation = beginSpiritualToolsOperation(principalId);
  try {
    await pendingWrite;
    operation.assertCurrent();
    const entries = await readList(principalStorageKey(principalId, DIVINATION_HISTORY_KEY));
    operation.assertCurrent();
    return entries.filter((entry) => entry.kind === kind);
  } catch {
    return [];
  } finally {
    operation.finish();
  }
}

export function saveDivinationHistoryEntry(
  principalId: string | null | undefined,
  entry: DivinationHistoryEntry,
): Promise<HistoryUpdate> {
  return updateHistory(principalId, entry.kind, entry);
}

export function clearDivinationHistory(
  principalId: string | null | undefined,
  kind: HistoryKind,
): Promise<HistoryUpdate> {
  return updateHistory(principalId, kind);
}

registerSpiritualToolsPurgeHandler(async owner => {
  const results = await Promise.allSettled(
    [DIVINATION_HISTORY_KEY, BIORHYTHM_PROFILE_KEY, DREAM_JOURNAL_KEY]
      .map(key => removeDivinationStorageValue(principalStorageKey(owner, key))),
  );
  if (results.some(result => result.status === 'rejected')) throw new Error('spiritual_tools_purge_failed');
});
