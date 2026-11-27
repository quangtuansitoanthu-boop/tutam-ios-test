import { describe, expect, it } from 'vitest';

import { createPracticeLog, normalizePracticeLogs } from '../../../src/lib/domain/practice/logs';
import {
  INITIAL_EXIT_STATE,
  cancelExitConfirmation,
  confirmExitConfirmation,
  createPracticeExitDraft,
  filterPracticeCatalog,
  getSutraPriorityRank,
  isDiaTangScripture,
  isDuocSuScripture,
  mergePracticeLogs,
  openExitConfirmation,
  sortPracticeCatalog
} from '../../../src/lib/domain/practice/state';
import { orderPracticeChapters } from '../../../src/lib/domain/practice/state';

describe('practice logs and exit confirmation', () => {
  it('shows Vietnamese ritual before Sanskrit without changing bookmark indices or source order', () => {
    const chapters = [{ index: 0, title: 'NGHI THỨC TRÌ TỤNG BẢN TIẾNG PHẠN' }, { index: 1, title: 'NGHI THỨC TRÌ TỤNG BẢN TIẾNG VIỆT' }, { index: 2, title: 'CÔNG NĂNG' }];
    expect(orderPracticeChapters(chapters, 'TRÌ CHÚ').map(row => row.index)).toEqual([1, 0, 2]);
    expect(chapters.map(row => row.index)).toEqual([0, 1, 2]);
    expect(orderPracticeChapters(chapters, 'KINH PHẬT')).toBe(chapters);
    const english = [{ title: 'Liturgy (Sanskrit Pronunciation)' }, { title: 'Liturgy (Traditional East-Asian Pronunciation)' }];
    expect(orderPracticeChapters(english, 'TRÌ CHÚ')).toEqual([english[1], english[0]]);
  });
  it('removes only the retired Buddha-name ritual from Vietnamese and translated catalogs', () => {
    const base = { category: 'CÁC NGHI THỨC' as const, publishedAt: '', author: '', imageUrl: '', hasTableOfContents: false, tags: [] };
    const articles = [
      { ...base, id: 'tt_1781742129070', title: 'NIỆM DANH HIỆU CÁC VỊ PHẬT BỒ TÁT' },
      { ...base, id: 'other', title: 'Nghi thức sám hối' },
    ];
    for (const category of ['all', 'NGHI THỨC KHÁC', 'CÁC NGHI THỨC'] as const) {
      expect(filterPracticeCatalog(articles, '', category).map(item => item.id)).toEqual(['other']);
      expect(filterPracticeCatalog([{ ...articles[0], title: 'Buddha name recitation' }], '', category)).toEqual([]);
    }
    expect(articles).toHaveLength(2);
  });
  it('normalizes and sorts practice logs by date then created', () => {
    const logs = normalizePracticeLogs([
      { id: 2, date: '2026-07-30', type: 'Khác', count: 2, note: '', created: '2026-07-30T00:00:00.000Z' },
      { id: 1, date: '2026-07-31', type: 'Tụng kinh', count: 1, note: '', created: '2026-07-31T00:00:00.000Z' }
    ]);

    expect(logs.map((log) => log.id)).toEqual([1, 2]);
  });

  it('creates a prefilled exit draft for the exact practice category', () => {
    const draft = createPracticeExitDraft(
      { category: 'KINH PHẬT', title: 'Kinh A Di Đà' },
      108,
      new Date('2026-07-31T03:00:00.000Z')
    );

    expect(draft).toEqual({
      count: 108,
      date: '2026-07-31',
      note: 'Công phu: Kinh A Di Đà',
      type: 'Tụng kinh'
    });
  });

  it('commits an exit confirmation exactly once and cancels with zero writes', () => {
    const opened = openExitConfirmation(INITIAL_EXIT_STATE, {
      count: 12,
      date: '2026-07-31',
      note: 'Công phu: Kinh Phổ Môn',
      type: 'Tụng kinh'
    });

    expect(cancelExitConfirmation(opened).open).toBe(false);

    const firstCommit = confirmExitConfirmation(opened);
    const secondCommit = confirmExitConfirmation(firstCommit.next);

    expect(firstCommit.shouldWrite).toBe(true);
    expect(secondCommit.shouldWrite).toBe(false);
  });

  it('preserves created timestamp when editing a manual log', () => {
    const log = createPracticeLog({
      id: 9,
      date: '2026-07-31',
      type: 'Niệm danh hiệu',
      count: 10,
      note: 'Nam mô A Di Đà Phật',
      created: '2026-07-31T12:34:56.000Z'
    });

    expect(log.created).toBe('2026-07-31T12:34:56.000Z');
  });

  it('identifies Kinh Dia Tang by title, id, or tags', () => {
    expect(isDiaTangScripture({ title: 'KINH ĐỊA TẠNG BỒ TÁT BỔN NGUYỆN' })).toBe(true);
    expect(isDiaTangScripture({ title: 'Kinh Địa Tạng' })).toBe(true);
    expect(isDiaTangScripture({ title: 'Kinh Thủ Lăng Nghiêm', tags: ['Địa Tạng'] })).toBe(true);
    expect(isDiaTangScripture({ title: 'Kinh Thủ Lăng Nghiêm', id: 'kinh-dia-tang' })).toBe(true);
    expect(isDiaTangScripture({ title: 'Nghi thức sám hối' })).toBe(false);
  });

  it('always promotes Kinh Dia Tang to the first position in practice catalog', () => {
    const items = [
      { id: '1', title: 'Nghi thức sám hối', category: 'CÁC NGHI THỨC' as const, author: '', imageUrl: '', hasTableOfContents: false, tags: [], publishedAt: '2026-09-01', updatedAt: '2026-09-10' },
      { id: '2', title: 'KINH ĐỊA TẠNG BỒ TÁT BỔN NGUYỆN', category: 'KINH PHẬT' as const, author: '', imageUrl: '', hasTableOfContents: false, tags: [], publishedAt: '2026-01-01', updatedAt: '2026-01-01' },
      { id: '3', title: 'Kinh Thủ Lăng Nghiêm', category: 'KINH PHẬT' as const, author: '', imageUrl: '', hasTableOfContents: false, tags: [], publishedAt: '2026-08-01', updatedAt: '2026-08-01' },
    ];

    const sorted = sortPracticeCatalog(items);
    expect(sorted[0]?.title).toBe('KINH ĐỊA TẠNG BỒ TÁT BỔN NGUYỆN');

    const filteredAll = filterPracticeCatalog(items, '', 'all');
    expect(filteredAll[0]?.title).toBe('KINH ĐỊA TẠNG BỒ TÁT BỔN NGUYỆN');

    const filteredKinh = filterPracticeCatalog(items, '', 'KINH PHẬT');
    expect(filteredKinh[0]?.title).toBe('KINH ĐỊA TẠNG BỒ TÁT BỔN NGUYỆN');
    expect(filteredKinh[1]?.title).toBe('Kinh Thủ Lăng Nghiêm');
  });

  it('identifies Kinh Duoc Su by title, id, or tags', () => {
    expect(isDuocSuScripture({ title: 'KINH DƯỢC SƯ' })).toBe(true);
    expect(isDuocSuScripture({ title: 'Kinh Dược Sư Lưu Ly Quang Như Lai' })).toBe(true);
    expect(isDuocSuScripture({ id: 'tt_kinh_duoc_su' })).toBe(true);
    expect(isDuocSuScripture({ tags: ['Kinh Dược Sư'] })).toBe(true);
    expect(isDuocSuScripture({ title: 'Kinh Kim Cang' })).toBe(false);
  });

  it('ranks Kinh Duoc Su after Kinh Lang Nghiem in foundational sutras (#5)', () => {
    expect(getSutraPriorityRank({ title: 'KINH ĐỊA TẠNG BỒ TÁT BỔN NGUYỆN' })).toBe(1);
    expect(getSutraPriorityRank({ title: 'Kinh Kim Cang' })).toBe(2);
    expect(getSutraPriorityRank({ title: 'Kinh Diệu Pháp Liên Hoa' })).toBe(3);
    expect(getSutraPriorityRank({ title: 'Kinh Thủ Lăng Nghiêm' })).toBe(4);
    expect(getSutraPriorityRank({ title: 'KINH DƯỢC SƯ' })).toBe(5);

    const items = [
      { id: '1', title: 'Kinh Dược Sư', category: 'KINH PHẬT' as const, author: '', imageUrl: '', hasTableOfContents: false, tags: [], publishedAt: '2026-09-01', updatedAt: '2026-09-10' },
      { id: '2', title: 'Kinh Thủ Lăng Nghiêm', category: 'KINH PHẬT' as const, author: '', imageUrl: '', hasTableOfContents: false, tags: [], publishedAt: '2026-08-01', updatedAt: '2026-08-01' },
      { id: '3', title: 'KINH ĐỊA TẠNG BỒ TÁT BỔN NGUYỆN', category: 'KINH PHẬT' as const, author: '', imageUrl: '', hasTableOfContents: false, tags: [], publishedAt: '2026-01-01', updatedAt: '2026-01-01' },
    ];

    const sorted = sortPracticeCatalog(items);
    expect(sorted.map(s => s.title)).toEqual([
      'KINH ĐỊA TẠNG BỒ TÁT BỔN NGUYỆN',
      'Kinh Thủ Lăng Nghiêm',
      'Kinh Dược Sư'
    ]);
  });

  it('safely merges local offline logs with cloud logs without losing records', () => {
    const cloudLogs = [
      createPracticeLog({ id: 101, date: '2026-09-01', type: 'Tụng kinh', count: 1, created: '2026-09-01T10:00:00.000Z' }),
      createPracticeLog({ id: 102, date: '2026-09-02', type: 'Niệm danh hiệu', count: 108, created: '2026-09-02T10:00:00.000Z' }),
    ];
    const localLogs = [
      createPracticeLog({ id: 103, date: '2026-09-03', type: 'Lễ Phật', count: 21, created: '2026-09-03T10:00:00.000Z' }),
    ];

    // Local has 1 log, cloud has 2 logs -> Both must be retained (total 3 logs)
    const merged = mergePracticeLogs(localLogs, cloudLogs);
    expect(merged).toHaveLength(3);
    expect(merged.map((l) => l.id)).toEqual([103, 102, 101]);

    // Same id with newer update in local
    const updatedLocal = [
      createPracticeLog({ id: 102, date: '2026-09-02', type: 'Niệm danh hiệu', count: 1080, note: 'Tăng biến số', created: '2026-09-02T12:00:00.000Z' }),
    ];
    const mergedUpdate = mergePracticeLogs(updatedLocal, cloudLogs);
    expect(mergedUpdate).toHaveLength(2);
    const updatedEntry = mergedUpdate.find((l) => l.id === 102);
    expect(updatedEntry?.count).toBe(1080);
    expect(updatedEntry?.note).toBe('Tăng biến số');
  });
});

