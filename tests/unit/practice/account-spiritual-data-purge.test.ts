import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearDivinationHistory, loadDivinationHistory, saveDivinationHistoryEntry } from '$lib/browser/divination-storage';
import {
  loadBiorhythmProfile, loadDreamJournal, purgeSpiritualToolsForAccount,
  saveBiorhythmProfile, saveDreamJournalEntry,
} from '$lib/browser/spiritual-tools-storage';
import { principalStorageKey } from '$lib/browser/principal-storage';
import { selectSpiritualToolsSession } from '$lib/browser/spiritual-tools-operations';
import { BIORHYTHM_PROFILE_KEY, DIVINATION_HISTORY_KEY, DREAM_JOURNAL_KEY } from '$lib/browser/storage-contract';

const { native, read, write, remove } = vi.hoisted(() => ({
  native: vi.fn(), read: vi.fn(), write: vi.fn(), remove: vi.fn(),
}));
vi.mock('$lib/browser/native-platform', () => ({ isNativeApp: native }));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({ read, write, remove }) }));

const keys = [DIVINATION_HISTORY_KEY, BIORHYTHM_PROFILE_KEY, DREAM_JOURNAL_KEY];
const files = new Map<string, string>();
const web = new Map<string, string>();
const profile = { version: 1 as const, name: 'An', birthDate: '1992-08-15' };
const dream = { id: 'dream-1', dreamId: 'dam-cuoi', title: 'Giấc mơ', note: 'Ghi chú riêng', createdAt: '2026-11-28T01:00:00Z' };
const history = { id: 'qa-1', kind: 'quan-am' as const, dateKey: '2026-11-28', createdAt: '2026-11-28T01:00:00Z', resultNumber: 1, title: 'Quẻ 1', topicLabel: 'Gia đình', summary: 'Riêng tư' };
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
};

beforeEach(() => {
  vi.resetAllMocks(); files.clear(); web.clear();
  native.mockReturnValue(false);
  read.mockImplementation(async ({ key }: { key: string }) => ({ value: files.get(key) ?? '[]' }));
  write.mockImplementation(async ({ key, value }: { key: string; value: string }) => { files.set(key, value); });
  remove.mockImplementation(async ({ key }: { key: string }) => { files.delete(key); });
  vi.stubGlobal('window', { localStorage: {
    get length() { return web.size; }, key: (index: number) => [...web.keys()][index] ?? null,
    getItem: (key: string) => web.get(key) ?? null,
    setItem: (key: string, value: string) => { web.set(key, value); },
    removeItem: (key: string) => { web.delete(key); },
  } });
  selectSpiritualToolsSession(null, true, null);
  selectSpiritualToolsSession('A', true, 'test-session');
});
afterEach(() => vi.unstubAllGlobals());

async function saveAll(owner: string | null) {
  expect((await saveDivinationHistoryEntry(owner, history)).ok).toBe(true);
  expect(await saveBiorhythmProfile(owner, profile)).toBe(true);
  expect((await saveDreamJournalEntry(owner, dream)).ok).toBe(true);
}

it.each([false, true])('purges exactly the deleted UID across all three stores, preserving guest/B and old native browser fallback (native=%s)', async useNative => {
  native.mockReturnValue(useNative);
  for (const owner of ['A', 'B', null]) await saveAll(owner);
  if (useNative) for (const owner of ['A', 'B', null]) for (const key of keys) web.set(principalStorageKey(owner, key), 'old browser fallback');
  const beforeB = keys.map(key => (useNative ? files : web).get(principalStorageKey('B', key)));
  const beforeGuest = keys.map(key => (useNative ? files : web).get(principalStorageKey(null, key)));
  await purgeSpiritualToolsForAccount('A');
  for (const key of keys) {
    expect(files.has(principalStorageKey('A', key))).toBe(false);
    expect(web.has(principalStorageKey('A', key))).toBe(false);
  }
  expect(keys.map(key => (useNative ? files : web).get(principalStorageKey('B', key)))).toEqual(beforeB);
  expect(keys.map(key => (useNative ? files : web).get(principalStorageKey(null, key)))).toEqual(beforeGuest);
  expect(remove.mock.calls.map(([call]) => call.key).sort()).toEqual(useNative ? keys.map(key => principalStorageKey('A', key)).sort() : []);
});

it('drains issued native writes and rejects old queued epochs without permanently blocking a recreated identical UID', async () => {
  native.mockReturnValue(true);
  const gate = deferred();
  write.mockImplementationOnce(async ({ key, value }: { key: string; value: string }) => { await gate.promise; files.set(key, value); });
  const issued = saveBiorhythmProfile('A', profile);
  await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
  const queuedJournal = saveDreamJournalEntry('A', dream);
  const queuedProfile = saveBiorhythmProfile('A', { ...profile, name: 'Old queued name' });
  const purging = purgeSpiritualToolsForAccount('A');
  const duringPurge = saveDreamJournalEntry('A', { ...dream, id: 'during-purge' });
  expect(remove).not.toHaveBeenCalled();
  gate.resolve();
  await Promise.all([issued, queuedJournal, queuedProfile, duringPurge, purging]);
  expect(files.has(principalStorageKey('A', BIORHYTHM_PROFILE_KEY))).toBe(false);
  expect(files.has(principalStorageKey('A', DREAM_JOURNAL_KEY))).toBe(false);
  expect(write).toHaveBeenCalledOnce();
  selectSpiritualToolsSession(null, true, null);
  selectSpiritualToolsSession('A', true, 'recreated-session');
  expect((await saveDreamJournalEntry('A', { ...dream, id: 'new-account' })).ok).toBe(true);
  expect(await saveBiorhythmProfile('A', { ...profile, name: 'Recreated A' })).toBe(true);
  expect(await loadBiorhythmProfile('A')).toEqual({ ...profile, name: 'Recreated A' });
  expect((await loadDreamJournal('A')).map(entry => entry.id)).toEqual(['new-account']);
});

it('invalidates both queues while an old history read is in flight and cannot recreate history after purge', async () => {
  native.mockReturnValue(true);
  const gate = deferred();
  read.mockImplementationOnce(async () => { await gate.promise; return { value: JSON.stringify([history]) }; });
  const readingHistory = saveDivinationHistoryEntry('A', { ...history, id: 'old' });
  await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
  const queuedHistory = clearDivinationHistory('A', 'quan-am');
  const purging = purgeSpiritualToolsForAccount('A');
  expect(remove).not.toHaveBeenCalled();
  gate.resolve();
  await Promise.all([readingHistory, queuedHistory, purging]);
  expect(write).not.toHaveBeenCalled();
  expect(await loadDivinationHistory('A', 'quan-am')).toEqual([]);
  selectSpiritualToolsSession(null, true, null);
  selectSpiritualToolsSession('A', true, 'recreated-history-session');
  expect((await saveDivinationHistoryEntry('A', history)).ok).toBe(true);
});

it('does not return a private late read from an invalidated generation', async () => {
  native.mockReturnValue(true);
  const gate = deferred();
  read.mockImplementationOnce(async () => { await gate.promise; return { value: JSON.stringify(profile) }; });
  const reading = loadBiorhythmProfile('A');
  const outcome = reading.then(() => { throw new Error('Expected the old private read to reject'); }, error => error);
  await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
  const purging = purgeSpiritualToolsForAccount('A');
  gate.resolve();
  const [error] = await Promise.all([outcome, purging]);
  expect(error).toMatchObject({ message: 'spiritual_tools_operation_invalidated' });
});

it('reports removal failure, attempts every owned key, and permits idempotent local retry', async () => {
  native.mockReturnValue(true); await saveAll('A'); await saveAll('B');
  remove.mockRejectedValueOnce(new Error('device remove failed'));
  await expect(purgeSpiritualToolsForAccount('A')).rejects.toThrow();
  expect(remove).toHaveBeenCalledTimes(3);
  expect(keys.every(key => files.has(principalStorageKey('B', key)))).toBe(true);
  await purgeSpiritualToolsForAccount('A');
  expect(keys.every(key => !files.has(principalStorageKey('A', key)))).toBe(true);
});

it('reports an uncleared old browser fallback even when all native removals succeeded', async () => {
  native.mockReturnValue(true); await saveAll('A');
  for (const key of keys) web.set(principalStorageKey('A', key), 'legacy browser data');
  const storage = window.localStorage;
  vi.spyOn(storage, 'removeItem').mockImplementationOnce(() => { throw new Error('browser removal blocked'); });
  await expect(purgeSpiritualToolsForAccount('A')).rejects.toThrow();
  expect(remove).toHaveBeenCalledTimes(3);
  expect(keys.every(key => !files.has(principalStorageKey('A', key)))).toBe(true);
  await purgeSpiritualToolsForAccount('A');
  expect(keys.every(key => !web.has(principalStorageKey('A', key)))).toBe(true);
});

it.each([null, undefined, '', 'anonymous', ' anonymous '])('refuses to purge the guest namespace: %s', async owner => {
  await saveAll(null);
  const before = [...web];
  await expect(purgeSpiritualToolsForAccount(owner as string)).rejects.toThrow();
  expect([...web]).toEqual(before); expect(remove).not.toHaveBeenCalled();
});
