import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { refugeReleaseBlocks, refugeReleaseCopy } from '../../src/lib/i18n/refuge-release';

describe('short refuge and life release reading', () => {
  it('preserves the complete supplied ritual, its order and repetitions', () => {
    const text = refugeReleaseBlocks.map(block => block.text).join(' ').normalize('NFC').replace(/\s+/gu, ' ').trim();
    // Dấu vân tay toàn văn đã duyệt, chỉ bỏ khác biệt xuống dòng/khoảng trắng.
    expect(createHash('sha256').update(text).digest('hex')).toBe('7467ca96c332d27079075d802947633fa4f6df98d78fe48ccf1f94d32207edc5');
    expect(refugeReleaseBlocks.filter(block => block.kind === 'heading').map(block => block.text)).toEqual([
      'CÁCH GIÚP CHÚNG SINH QUY Y TAM BẢO DỄ NHẤT',
      'NGHI THỨC PHÓNG SINH NGẮN GỌN',
    ]);
    expect(text.match(/Chúng con xin Quy Y Phật/gu)).toHaveLength(3);
    expect(text.match(/Chúng con đã Quy Y Phật rồi/gu)).toHaveLength(3);
  });

  it('keeps recitation lines together and retains the practice directions', () => {
    const verses = refugeReleaseBlocks.filter(block => block.kind === 'verse');
    expect(verses.filter(block => block.text.startsWith('Nam Mô A Di Đa Bà Dạ.'))).toHaveLength(2);
    expect(verses.some(block => block.text.includes('NAM MÔ A DI ĐÀ PHẬT (3 lần)'))).toBe(true);
    expect(refugeReleaseBlocks.some(block => block.text === '(Sau khi quy y xong thì thả luôn)')).toBe(true);
    expect(refugeReleaseBlocks.some(block => block.text.includes('( tối thiểu 3 biến, nhiều hơn càng tốt)'))).toBe(true);
  });

  it('localizes the banner and controls while keeping the supplied Vietnamese text', () => {
    expect(refugeReleaseCopy.vi.title).toBe('Bài quy y & phóng sinh ngắn');
    expect(refugeReleaseCopy.en.title).toBe('Short refuge & life release ritual');
    expect(refugeReleaseCopy.vi.close).toBe('Đóng bài đọc');
    expect(refugeReleaseCopy.en.close).toBe('Close reading');
    expect(refugeReleaseCopy.vi.fontSize).toBe('Cỡ chữ');
    expect(refugeReleaseCopy.en.fontSize).toBe('Font size');
    expect(refugeReleaseCopy.vi.decreaseFont).toBe('Giảm cỡ chữ');
    expect(refugeReleaseCopy.vi.increaseFont).toBe('Tăng cỡ chữ');
  });
});
