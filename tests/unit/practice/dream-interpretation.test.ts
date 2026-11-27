import { describe, expect, it } from 'vitest';
import {
  DREAM_ENTRIES,
  DREAM_ENTRY_COUNT,
  DREAM_TOPICS,
  filterDreamEntries,
  getDreamEntry,
  getPopularDreamEntries,
} from '$lib/domain/practice/dream-interpretation';

describe('offline dream catalog', () => {
  it('has unique entries across all ten source topic groups', () => {
    expect(DREAM_ENTRY_COUNT).toBeGreaterThanOrEqual(120);
    expect(DREAM_TOPICS).toHaveLength(10);
    expect(new Set(DREAM_ENTRIES.map(entry => entry.id)).size).toBe(DREAM_ENTRY_COUNT);
    const categories = new Set(DREAM_TOPICS.map(topic => String(topic.id)));
    for (const entry of DREAM_ENTRIES) expect(categories.has(entry.category)).toBe(true);
    for (const topic of DREAM_TOPICS) {
      expect(filterDreamEntries('', topic.id).length).toBeGreaterThanOrEqual(12);
    }
  });

  it('keeps case-specific paragraphs and a complete reading sheet', () => {
    const paragraphs: string[] = [];
    for (const entry of DREAM_ENTRIES) {
      expect(entry.overview.length).toBeGreaterThan(0);
      expect(entry.buddhist.length).toBeGreaterThan(0);
      expect(entry.advice.length).toBeGreaterThan(0);
      const cases = entry.scenarioGroups.flatMap(group => group.items);
      expect(cases.length).toBeGreaterThanOrEqual(2);
      for (const scenario of cases) {
        expect(scenario.paragraphs.length).toBeGreaterThanOrEqual(2);
        for (const paragraph of scenario.paragraphs) {
          expect(paragraph.trim().split(/\s+/).length).toBeGreaterThanOrEqual(15);
          paragraphs.push(paragraph);
        }
      }
    }
    expect(new Set(paragraphs).size).toBe(paragraphs.length);
  });

  it('finds accented Vietnamese, aliases, case titles and topic intersections', () => {
    expect(filterDreamEntries('ran can').some(entry => entry.id === 'ran-bi-can')).toBe(true);
    expect(filterDreamEntries('ran can')[0].id).toBe('ran-bi-can');
    expect(filterDreamEntries('rụng răng').some(entry => entry.id === 'rung-rang')).toBe(true);
    expect(filterDreamEntries('nguoi mat cho tien').some(entry => entry.id === 'nguoi-mat')).toBe(true);
    expect(filterDreamEntries('ran can chan').some(entry => entry.id === 'ran-bi-can')).toBe(true);
    expect(filterDreamEntries('ran can', 'tien-bac')).toEqual([]);
    expect(filterDreamEntries('zzzz nonexistent dream')).toEqual([]);
    expect(filterDreamEntries('', 'unknown-topic')).toEqual([]);
    expect(getDreamEntry('missing-id')).toBeUndefined();
  });

  it('ranks exact keywords and case titles before ambiguous scattered tokens', () => {
    expect(filterDreamEntries('cho can')[0].id).toBe('cho');
    expect(filterDreamEntries('chó cắn tay mình')[0].id).toBe('cho');
    expect(filterDreamEntries('Rắn cắn tay chảy máu')[0].id).toBe('ran-bi-can');
    // Keep broad token matches available; this correction changes their order, not membership.
    expect(filterDreamEntries('cho can').some(entry => entry.id === 'quan-am')).toBe(true);
  });

  it('normalizes keyword ranking across accents, case and query whitespace', () => {
    for (const query of ['chó cắn', 'CHO CAN', 'chó cắn'.normalize('NFD'), ' \tcho   can\n ']) {
      expect(filterDreamEntries(query)[0].id, query).toBe('cho');
    }
  });

  it('keeps a main-title phrase ahead of an exact keyword on another entry', () => {
    const results = filterDreamEntries('người chết');
    expect(results[0].id).toBe('nhieu-nguoi-mat');
    expect(results.findIndex(entry => entry.id === 'nguoi-mat')).toBeGreaterThan(0);
  });

  it('preserves catalog order for ties and empty queries while respecting the topic', () => {
    const original = DREAM_ENTRIES.map(entry => entry.id);
    expect(filterDreamEntries('').map(entry => entry.id)).toEqual(original);
    expect(filterDreamEntries(' \t\n ').map(entry => entry.id)).toEqual(original);
    const tiedIds = ['ran-bi-can', 'cho'];
    expect(filterDreamEntries('tay can', 'con-vat').filter(entry => tiedIds.includes(entry.id)).map(entry => entry.id))
      .toEqual(original.filter(id => tiedIds.includes(id)));
    const animalMatches = filterDreamEntries('cho can', 'con-vat');
    expect(animalMatches[0].id).toBe('cho');
    expect(animalMatches.every(entry => entry.category === 'con-vat')).toBe(true);
  });

  it('supplements every deceased topic with clearly attributed scripture explanations', () => {
    const entries = filterDreamEntries('', 'nguoi-da-khuat');
    expect(entries.length).toBeGreaterThanOrEqual(12);
    for (const entry of entries) {
      expect(entry.scripture).toHaveLength(2);
      expect(entry.scripture?.[0].title).toContain('Phẩm 6');
      expect(entry.scripture?.[1].title).toContain('Phẩm 7');
      expect(entry.scripture?.every(section => section.quotation === false)).toBe(true);
      expect(entry.scripture?.every(section => section.source.includes('Thích Trí Tịnh'))).toBe(true);
    }
    expect(getDreamEntry('ban-tho')?.scripture).toHaveLength(2);
  });

  it('keeps source URLs and gambling material out of user-facing content', () => {
    const content = JSON.stringify(DREAM_ENTRIES);
    expect(content).not.toMatch(/https?:\/\//i);
    expect(content).not.toMatch(/đánh con gì|xổ số|lô đề|con số may mắn|sourceUrl/i);
    expect(content).not.toMatch(
      /lối liên tưởng văn hóa|bối cảnh riêng của người mơ|tạo ra căn cứ|không đo được mức nguy hiểm|sự mềm mại|chứng từ|kênh độc lập|kênh chính thức|nhân viên y tế|bằng việc cụ thể|cách nhìn có giới hạn|không biến mỗi giấc mơ thành một thông báo|bối cảnh giáo lý bổ sung|cảm giác mình đã bị thay thế|giá trị của bản thân không phụ thuộc|nhờ hỗ trợ khi quá tải/iu,
    );
  });

  it('gives the main lookup articles sufficient scenario depth', () => {
    const caseCount = (id: string) => getDreamEntry(id)?.scenarioGroups.flatMap(group => group.items).length ?? 0;
    expect(caseCount('ran-bi-can')).toBeGreaterThanOrEqual(8);
    expect(caseCount('nguoi-mat')).toBeGreaterThanOrEqual(7);
    expect(caseCount('rung-rang')).toBeGreaterThanOrEqual(6);
    expect(caseCount('mo-thay-tien')).toBeGreaterThanOrEqual(6);
    expect(caseCount('vo-guong')).toBeGreaterThanOrEqual(6);
  });

  it('keeps the specific snake and dog bite meanings attached to their matching details', () => {
    const cases = (id: string) => getDreamEntry(id)!.scenarioGroups.flatMap(group => group.items);
    const handBleeding = cases('ran-bi-can').find(item => /tay/u.test(item.title) && /chảy máu/u.test(item.title));
    expect(handBleeding).toBeDefined();
    expect(handBleeding!.paragraphs[0]).toMatch(/tiền (?:bạc|nong)|tài chính/u);
    const dogHand = cases('cho').find(item => /cắn tay/u.test(item.title) && !/máu/u.test(item.title));
    expect(dogHand).toBeDefined();
    expect(dogHand!.paragraphs[0]).toMatch(/công việc|giao dịch/u);
  });

  it('returns exactly 10 unique popular dreams for the default list', () => {
    const popular = getPopularDreamEntries();
    expect(popular).toHaveLength(10);
    expect(new Set(popular.map(entry => entry.id)).size).toBe(10);
    expect(popular.map(entry => entry.id)).toEqual(
      expect.arrayContaining(['nguoi-mat', 'ran-bi-can', 'rung-rang', 'mo-thay-tien', 'vo-guong']),
    );
  });
});
