import { principalStorageKey } from './principal-storage';
import { BIORHYTHM_PROFILE_KEY, DREAM_JOURNAL_KEY } from './storage-contract';
import { readDivinationStorageValue, writeDivinationStorageValue } from './divination-storage';

export interface BiorhythmProfile {
  version: 1;
  name: string;
  birthDate: string;
}

export interface DreamJournalEntry {
  id: string;
  dreamId: string;
  title: string;
  createdAt: string;
  note: string;
}

interface JournalUpdate {
  ok: boolean;
  entries: DreamJournalEntry[];
}

const MAX_JOURNAL_ENTRIES = 50;
let pendingWrite: Promise<unknown> = Promise.resolve();

function serializeWrite<T>(operation: () => Promise<T>): Promise<T> {
  // Giữ thứ tự đọc–sửa–ghi kể cả khi người dùng lưu/xóa liên tiếp.
  const result = pendingWrite.then(async (): Promise<T> => {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      return await navigator.locks.request('quangtu-spiritual-tools-write', operation);
    }
    return await operation();
  });
  pendingWrite = result.catch(() => undefined);
  return result;
}

function isStoredDate(value: string): boolean {
  if (value === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(time.getTime()) && time.toISOString().slice(0, 10) === value;
}

function isProfile(value: unknown): value is BiorhythmProfile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Partial<BiorhythmProfile>;
  return profile.version === 1 && typeof profile.name === 'string' && profile.name.length <= 200
    && typeof profile.birthDate === 'string' && isStoredDate(profile.birthDate);
}

function isJournalEntry(value: unknown): value is DreamJournalEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<DreamJournalEntry>;
  return typeof entry.id === 'string' && entry.id.length > 0 && entry.id.length <= 128
    && typeof entry.dreamId === 'string' && entry.dreamId.length > 0 && entry.dreamId.length <= 128
    && typeof entry.title === 'string' && entry.title.length <= 300
    && typeof entry.note === 'string' && entry.note.length <= 5_000
    && typeof entry.createdAt === 'string' && Number.isFinite(Date.parse(entry.createdAt));
}

export async function loadBiorhythmProfile(principal: string | null | undefined): Promise<BiorhythmProfile | null> {
  await pendingWrite;
  const raw = await readDivinationStorageValue(principalStorageKey(principal, BIORHYTHM_PROFILE_KEY));
  if (!raw) return null;
  const parsed: unknown = JSON.parse(raw);
  // Bridge hiện có trả [] cho file chưa tồn tại.
  if (Array.isArray(parsed) && parsed.length === 0) return null;
  if (!isProfile(parsed)) throw new Error('invalid_biorhythm_profile');
  return parsed;
}

export async function saveBiorhythmProfile(
  principal: string | null | undefined,
  profile: BiorhythmProfile,
): Promise<boolean> {
  if (!isProfile(profile)) return false;
  const key = principalStorageKey(principal, BIORHYTHM_PROFILE_KEY);
  const value = JSON.stringify(profile);
  try {
    await serializeWrite(() => writeDivinationStorageValue(key, value));
    return true;
  } catch {
    return false;
  }
}

async function readJournal(key: string): Promise<DreamJournalEntry[]> {
  const raw = await readDivinationStorageValue(key);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every(isJournalEntry)) throw new Error('invalid_dream_journal');
  return parsed;
}

export async function loadDreamJournal(principal: string | null | undefined): Promise<DreamJournalEntry[]> {
  await pendingWrite;
  return readJournal(principalStorageKey(principal, DREAM_JOURNAL_KEY));
}

async function updateDreamJournal(
  principal: string | null | undefined,
  update: (entries: DreamJournalEntry[]) => DreamJournalEntry[],
): Promise<JournalUpdate> {
  const key = principalStorageKey(principal, DREAM_JOURNAL_KEY);
  try {
    return await serializeWrite(async () => {
      const entries = update(await readJournal(key));
      await writeDivinationStorageValue(key, JSON.stringify(entries));
      return { ok: true, entries };
    });
  } catch {
    return { ok: false, entries: [] };
  }
}

export function saveDreamJournalEntry(
  principal: string | null | undefined,
  entry: DreamJournalEntry,
): Promise<JournalUpdate> {
  if (!isJournalEntry(entry)) return Promise.resolve({ ok: false, entries: [] });
  const snapshot = { ...entry };
  return updateDreamJournal(principal, entries =>
    [snapshot, ...entries.filter(item => item.id !== snapshot.id)].slice(0, MAX_JOURNAL_ENTRIES));
}

export function deleteDreamJournalEntry(principal: string | null | undefined, id: string): Promise<JournalUpdate> {
  return updateDreamJournal(principal, entries => entries.filter(item => item.id !== id));
}

export function clearDreamJournal(principal: string | null | undefined): Promise<JournalUpdate> {
  return updateDreamJournal(principal, () => []);
}
