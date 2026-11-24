import { describe, it, expect, beforeEach } from 'vitest';
import { createPersonalPracticeStorage } from '$lib/browser/personal-practice-storage';

describe('Personal Practice Storage Nickname Persistence', () => {
  let memoryStore: Record<string, string>;
  let mockStorage: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
    clear: () => void;
    length: number;
    key: (index: number) => string | null;
  };

  beforeEach(() => {
    memoryStore = {};
    mockStorage = {
      getItem: (key: string) => memoryStore[key] ?? null,
      setItem: (key: string, value: string) => { memoryStore[key] = value; },
      removeItem: (key: string) => { delete memoryStore[key]; },
      clear: () => { memoryStore = {}; },
      get length() { return Object.keys(memoryStore).length; },
      key: (index: number) => Object.keys(memoryStore)[index] ?? null,
    };
  });

  it('saves and retrieves nickname for an anonymous principal', () => {
    const owner = createPersonalPracticeStorage(mockStorage, null);
    expect(owner.getNickname()).toBe('');

    owner.saveNickname('Đồng tu Giác Ngộ');
    expect(owner.getNickname()).toBe('Đồng tu Giác Ngộ');

    // Simulate opening the section again (new storage instance with same backend)
    const nextInstance = createPersonalPracticeStorage(mockStorage, null);
    expect(nextInstance.getNickname()).toBe('Đồng tu Giác Ngộ');
  });

  it('preserves nickname across dates and multiple accesses', () => {
    const owner = createPersonalPracticeStorage(mockStorage, 'user_456');
    owner.saveNickname('Liên Hoa Tâm');

    // Save reflection for date 1
    owner.saveReflection({
      date: '2026-11-23',
      repentance: 'Sám hối ba nghiệp Thân Khẩu Ý...',
      goodDeeds: 'Niệm Phật và phóng sanh...',
      updatedAt: new Date().toISOString(),
    });

    // Nickname remains intact
    expect(owner.getNickname()).toBe('Liên Hoa Tâm');

    // Save reflection for date 2
    owner.saveReflection({
      date: '2026-11-24',
      repentance: 'Nhìn lại tâm sân...',
      goodDeeds: 'Giúp đỡ đồng đạo...',
      updatedAt: new Date().toISOString(),
    });

    // Next access still has nickname
    const reloaded = createPersonalPracticeStorage(mockStorage, 'user_456');
    expect(reloaded.getNickname()).toBe('Liên Hoa Tâm');
  });

  it('rejects invalid or empty nickname without corrupting stored settings', () => {
    const owner = createPersonalPracticeStorage(mockStorage, null);
    owner.saveNickname('Tâm Thiện');
    expect(owner.getNickname()).toBe('Tâm Thiện');

    expect(() => owner.saveNickname('')).toThrow();
    expect(() => owner.saveNickname('   ')).toThrow();
    // Stored nickname is preserved
    expect(owner.getNickname()).toBe('Tâm Thiện');
  });
});
