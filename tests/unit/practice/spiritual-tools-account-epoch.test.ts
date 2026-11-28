import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('$lib/browser/native-platform', () => ({ isNativeApp: () => false }));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({}) }));

const web = new Map<string, string>();
const remove = vi.fn((key: string) => { web.delete(key); });
const tails = new Map<string, Promise<unknown>>();
const profile = { version: 1 as const, name: 'An', birthDate: '1992-08-15' };
const history = { id: 'qa-1', kind: 'quan-am' as const, dateKey: '2026-11-28', createdAt: '2026-11-28T01:00:00Z', resultNumber: 1, title: 'Quẻ 1', topicLabel: 'Gia đình', summary: 'Riêng tư' };

beforeEach(() => {
  vi.resetModules(); web.clear(); tails.clear(); remove.mockReset();
  remove.mockImplementation((key: string) => { web.delete(key); });
  vi.stubGlobal('window', { localStorage: {
    get length() { return web.size; }, key: (index: number) => [...web.keys()][index] ?? null,
    getItem: (key: string) => web.get(key) ?? null,
    setItem: (key: string, value: string) => { web.set(key, value); }, removeItem: remove,
  } });
  vi.stubGlobal('navigator', { locks: {
    request: (name: string, run: () => Promise<unknown>) => {
      const result = (tails.get(name) ?? Promise.resolve()).then(run);
      tails.set(name, result.catch(() => undefined));
      return result;
    },
  } });
});
afterEach(() => vi.unstubAllGlobals());

it('fences queued and newly requested old-session writes in a second updated tab, then permits a verified recreated same UID', async () => {
  const first = await import('$lib/browser/spiritual-tools-storage');
  const firstEpoch = await import('$lib/browser/spiritual-tools-operations');
  const { principalStorageKey } = await import('$lib/browser/principal-storage');
  firstEpoch.selectSpiritualToolsSession('A', true, 'old-session');
  await first.saveBiorhythmProfile('A', profile);
  await first.saveBiorhythmProfile('B', { ...profile, name: 'B' });
  await first.saveBiorhythmProfile(null, { ...profile, name: 'Guest' });
  vi.resetModules();
  const second = await import('$lib/browser/spiritual-tools-storage');
  const secondHistory = await import('$lib/browser/divination-storage');
  const secondEpoch = await import('$lib/browser/spiritual-tools-operations');
  secondEpoch.selectSpiritualToolsSession('A', true, 'old-session');
  let release!: () => void;
  const held = navigator.locks.request('quangtu-spiritual-tools-write', () => new Promise<void>(resolve => { release = resolve; }));
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  const queuedProfile = second.saveBiorhythmProfile('A', { ...profile, name: 'Stale queued A' });
  const queuedHistory = secondHistory.saveDivinationHistoryEntry('A', history);
  const purging = first.purgeSpiritualToolsForAccount('A');
  release(); await held;
  await Promise.all([queuedProfile, queuedHistory, purging]);
  expect(await second.saveBiorhythmProfile('A', profile)).toBe(false);
  expect((await secondHistory.saveDivinationHistoryEntry('A', history)).ok).toBe(false);
  secondEpoch.selectSpiritualToolsSession('A', true, 'old-session');
  expect(await second.saveBiorhythmProfile('A', profile)).toBe(false);
  secondEpoch.selectSpiritualToolsSession('A', false, null);
  expect(await second.saveBiorhythmProfile('A', profile)).toBe(false);
  secondEpoch.selectSpiritualToolsSession('A', true, 'recreated-session');
  expect(await second.saveBiorhythmProfile('A', { ...profile, name: 'Recreated A' })).toBe(true);
  expect(JSON.parse(web.get(principalStorageKey('B', 'tt_biorhythm_profile_v1'))!)).toMatchObject({ name: 'B' });
  expect(JSON.parse(web.get(principalStorageKey(null, 'tt_biorhythm_profile_v1'))!)).toMatchObject({ name: 'Guest' });
});

it('retains a failed receipt across reload, blocks cached offline A, and retries locally while guest', async () => {
  const store = await import('$lib/browser/spiritual-tools-storage');
  const epoch = await import('$lib/browser/spiritual-tools-operations');
  epoch.selectSpiritualToolsSession('A', true, 'deleted-session');
  await store.saveBiorhythmProfile('A', profile);
  remove.mockImplementationOnce(() => { throw new Error('storage blocked'); });
  await expect(store.purgeSpiritualToolsForAccount('A')).rejects.toThrow();
  vi.resetModules();
  const reloaded = await import('$lib/browser/spiritual-tools-storage');
  const reloadedEpoch = await import('$lib/browser/spiritual-tools-operations');
  reloadedEpoch.selectSpiritualToolsSession('A', false, null);
  expect(await reloaded.saveBiorhythmProfile('A', profile)).toBe(false);
  expect(reloadedEpoch.pendingSpiritualToolsPurgePrincipals()).toEqual(['A']);
  reloadedEpoch.selectSpiritualToolsSession(null, true, null);
  await reloadedEpoch.retryPendingSpiritualToolsPurges();
  expect(reloadedEpoch.pendingSpiritualToolsPurgePrincipals()).toEqual([]);
  reloadedEpoch.selectSpiritualToolsSession('A', true, 'new-session');
  expect(await reloaded.saveBiorhythmProfile('A', { ...profile, name: 'New A' })).toBe(true);
});
