import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { principalStorageKey } from '$lib/browser/principal-storage';
import { BIORHYTHM_PROFILE_KEY, DIVINATION_HISTORY_KEY, DREAM_JOURNAL_KEY } from '$lib/browser/storage-contract';
import {
  clearDreamJournal, deleteDreamJournalEntry, loadBiorhythmProfile, loadDreamJournal,
  saveBiorhythmProfile, saveDreamJournalEntry, type DreamJournalEntry,
} from '$lib/browser/spiritual-tools-storage';

const { native, read, write } = vi.hoisted(() => ({ native: vi.fn(), read: vi.fn(), write: vi.fn() }));
vi.mock('$lib/browser/native-platform', () => ({ isNativeApp: native }));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({ read, write }) }));

const entry = (id: string): DreamJournalEntry => ({
  id, dreamId: 'nguoi-mat', title: 'Mơ thấy người thân', note: 'Một giấc mơ', createdAt: '2026-11-27T01:00:00Z',
});

describe('principal-scoped spiritual tools storage', () => {
  const web = new Map<string, string>();
  const files = new Map<string, string>();
  const setItem = vi.fn((key: string, value: string) => { web.set(key, value); });
  beforeEach(() => {
    vi.clearAllMocks();
    web.clear(); files.clear();
    native.mockReturnValue(false);
    read.mockImplementation(async ({ key }: { key: string }) => ({ value: files.get(key) ?? '[]' }));
    write.mockImplementation(async ({ key, value }: { key: string; value: string }) => { files.set(key, value); });
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => web.get(key) ?? null, setItem } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps profiles separate from guest, other accounts, and existing divination history', async () => {
    const oldHistory = '[{"id":"old-result"}]';
    web.set(principalStorageKey('A', DIVINATION_HISTORY_KEY), oldHistory);
    const profile = { version: 1 as const, name: 'An', birthDate: '1992-08-15' };
    expect(await saveBiorhythmProfile('A', profile)).toBe(true);
    expect(await loadBiorhythmProfile('A')).toEqual(profile);
    expect(await loadBiorhythmProfile('B')).toBeNull();
    expect(await loadBiorhythmProfile(null)).toBeNull();
    expect(web.get(principalStorageKey('A', DIVINATION_HISTORY_KEY))).toBe(oldHistory);
    expect(await saveBiorhythmProfile('A', { ...profile, birthDate: '' })).toBe(true);
    expect(await saveBiorhythmProfile('A', { ...profile, birthDate: '2025-02-31' })).toBe(false);
  });

  it('serializes concurrent journal saves, deduplicates ids and preserves another principal', async () => {
    await Promise.all([saveDreamJournalEntry('A', entry('1')), saveDreamJournalEntry('A', entry('2')), saveDreamJournalEntry('B', entry('3'))]);
    await saveDreamJournalEntry('A', { ...entry('1'), note: 'Đã sửa' });
    expect((await loadDreamJournal('A')).map(item => item.id)).toEqual(['1', '2']);
    expect((await loadDreamJournal('A'))[0].note).toBe('Đã sửa');
    await deleteDreamJournalEntry('A', '1');
    expect(await loadDreamJournal('A')).toEqual([entry('2')]);
    await clearDreamJournal('A');
    expect(await loadDreamJournal('A')).toEqual([]);
    expect(await loadDreamJournal('B')).toEqual([entry('3')]);
  });

  it('limits the journal to the 50 most recently saved entries', async () => {
    await Promise.all(Array.from({ length: 52 }, (_, index) => saveDreamJournalEntry(null, entry(String(index)))));
    const journal = await loadDreamJournal(null);
    expect(journal).toHaveLength(50);
    expect(journal[0].id).toBe('51');
    expect(journal.at(-1)?.id).toBe('2');
  });

  it('reports corrupt reads and failed writes without replacing saved data', async () => {
    const key = principalStorageKey('A', DREAM_JOURNAL_KEY);
    web.set(key, '{broken');
    await expect(loadDreamJournal('A')).rejects.toThrow();
    expect((await saveDreamJournalEntry('A', entry('1'))).ok).toBe(false);
    expect(web.get(key)).toBe('{broken');
    web.set(principalStorageKey('A', BIORHYTHM_PROFILE_KEY), '{broken');
    await expect(loadBiorhythmProfile('A')).rejects.toThrow();
    web.delete(key);
    setItem.mockImplementationOnce(() => { throw new Error('quota'); });
    expect((await saveDreamJournalEntry('A', entry('2'))).ok).toBe(false);
    expect(await loadDreamJournal('A')).toEqual([]);
  });

  it('uses the existing native bridge and retains data if a native write fails', async () => {
    native.mockReturnValue(true);
    expect(await loadBiorhythmProfile('A')).toBeNull();
    expect(await saveBiorhythmProfile('A', { version: 1, name: '', birthDate: '' })).toBe(true);
    expect((await saveDreamJournalEntry('A', entry('1'))).ok).toBe(true);
    write.mockRejectedValueOnce(new Error('native write failed'));
    expect((await clearDreamJournal('A')).ok).toBe(false);
    expect(await loadDreamJournal('A')).toEqual([entry('1')]);
    expect(setItem).not.toHaveBeenCalled();
  });
});
