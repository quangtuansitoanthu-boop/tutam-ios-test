import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DivinationHistoryEntry } from '$lib/domain/practice/divination';
import { clearDivinationHistory, loadDivinationHistory, saveDivinationHistoryEntry } from '$lib/browser/divination-storage';
import { principalStorageKey } from '$lib/browser/principal-storage';
import { DIVINATION_HISTORY_KEY } from '$lib/browser/storage-contract';

const { native, read, write } = vi.hoisted(() => ({ native: vi.fn(), read: vi.fn(), write: vi.fn() }));
vi.mock('$lib/browser/native-platform', () => ({ isNativeApp: native }));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({ read, write }) }));

const quanAm: DivinationHistoryEntry = {
  id: 'qa-1',
  kind: 'quan-am',
  dateKey: '2026-11-26',
  createdAt: '2026-11-26T00:01:00Z',
  resultNumber: 1,
  title: 'Quẻ số 1',
  topicLabel: 'Đi xa',
  topicId: 'travel',
  summary: 'Thượng Cát',
};
const mocLuan: DivinationHistoryEntry = {
  ...quanAm, id: 'ml-153', kind: 'moc-luan', resultNumber: 153, rounds: [51, 51, 51],
};

describe('device-only divination history', () => {
  const webFiles = new Map<string, string>();
  const deviceFiles = new Map<string, string>();
  const getItem = vi.fn((key: string) => webFiles.get(key) ?? null);
  const setItem = vi.fn((key: string, value: string) => webFiles.set(key, value));

  beforeEach(() => {
    vi.clearAllMocks();
    webFiles.clear();
    deviceFiles.clear();
    native.mockReturnValue(false);
    read.mockImplementation(async ({ key }: { key: string }) => ({ value: deviceFiles.get(key) ?? '[]' }));
    write.mockImplementation(async ({ key, value }: { key: string; value: string }) => {
      deviceFiles.set(key, value);
    });
    vi.stubGlobal('window', { localStorage: { getItem, setItem } });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('isolates accounts, keeps existing kinds during concurrent saves, and honors clearing site data', async () => {
    await Promise.all([
      saveDivinationHistoryEntry('first', quanAm),
      saveDivinationHistoryEntry('first', mocLuan),
      saveDivinationHistoryEntry('second', quanAm),
    ]);
    expect(await loadDivinationHistory('first', 'moc-luan')).toEqual([mocLuan]);
    expect(await loadDivinationHistory(null, 'quan-am')).toEqual([]);
    expect(await clearDivinationHistory('first', 'quan-am')).toEqual({ ok: true, entries: [] });
    expect(await loadDivinationHistory('first', 'moc-luan')).toEqual([mocLuan]);
    expect(await loadDivinationHistory('second', 'quan-am')).toEqual([quanAm]);
    webFiles.clear();
    expect(await loadDivinationHistory('first', 'moc-luan')).toEqual([]);
  });

  it('uses only the native store, including when the native write fails', async () => {
    native.mockReturnValue(true);
    const key = principalStorageKey(null, DIVINATION_HISTORY_KEY);
    webFiles.set(key, JSON.stringify([quanAm]));
    expect(await loadDivinationHistory(null, 'quan-am')).toEqual([]);
    expect(await saveDivinationHistoryEntry(null, mocLuan)).toEqual({ ok: true, entries: [mocLuan] });
    write.mockRejectedValueOnce(new Error('write failed'));
    expect(await clearDivinationHistory(null, 'moc-luan')).toEqual({ ok: false });
    expect(await loadDivinationHistory(null, 'moc-luan')).toEqual([mocLuan]);
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });
});
