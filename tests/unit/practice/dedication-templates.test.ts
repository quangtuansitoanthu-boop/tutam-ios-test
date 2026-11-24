// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
vi.mock('$app/environment', () => ({ browser: true }));
import { extractDedicationText, loadPracticeDedicationTemplates, loadRoutineRepentanceText } from '$lib/browser/practice-dedication-templates';

describe('bundled dedication templates', () => {
  it('starts the converted closing at its logical heading despite split formatting runs', () => {
    const html = '<div class="tt-converted-book"><p>Đọc đến PHÁT NGUYỆN &amp; HỒI HƯỚNG.</p><p class="source-heading"><strong>PHÁT</strong><strong> NGUYỆN &amp; </strong><strong>HỒI HƯỚNG</strong></p><p>Nguyện đem công đức này.</p></div>';
    expect(extractDedicationText(html, true)).toBe('PHÁT NGUYỆN & HỒI HƯỚNG\n\nNguyện đem công đức này.');
    expect(extractDedicationText('<p>PHÁT NGUYỆN &amp; HỒI HƯỚNG</p><p>Lời cũ.</p>', true)).toBe('PHÁT NGUYỆN & HỒI HƯỚNG\n\nLời cũ.');
    expect(() => extractDedicationText('<div class="tt-converted-book"><p>Không có tiêu đề hồi hướng.</p></div>', true)).toThrow('dedication_section_missing');
  });
  it('extracts the actual Vietnamese ritual sections without surrounding mantras or trailing notes', () => {
    for (const [book, chapter] of [['tt_1781274943336', '2343'], ['tt_1781275267452', '1958']]) {
      const chapters = JSON.parse(readFileSync(`static/offline-data/chapters/${book}.json`, 'utf8'));
      const original = chapters.find((item: { id: string }) => String(item.id) === chapter).noi_dung;
      const text = extractDedicationText(original);
      expect(text.startsWith('HỒI HƯỚNG\n')).toBe(true);
      expect(text).toContain('công đức');
      expect(text).not.toContain('{align:');
      expect(text).not.toContain('CHÚ TĂNG TRƯỞNG');
      expect(text).not.toContain('Ghi chú:');
      expect(text).toMatch(/\((?:3 lần|lạy)\)/u);
    }
  });
  it('coalesces repeated loads into the same three static file reads and never calls an API', async () => {
    const fetcher = vi.fn(async (url: string) => {
      const path = `static${url}`;
      return { ok: true, json: async () => JSON.parse(readFileSync(path, 'utf8')) } as Response;
    });
    const [first, second] = await Promise.all([
      loadPracticeDedicationTemplates(fetcher as unknown as typeof fetch),
      loadPracticeDedicationTemplates(fetcher as unknown as typeof fetch),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(first).toEqual(second);
    expect(first).toHaveLength(3);
    expect(first[2].text).toContain('PHÁT NGUYỆN & HỒI HƯỚNG');
    expect(first[2].text.startsWith('PHÁT NGUYỆN & HỒI HƯỚNG\n')).toBe(true);
    expect(first[2].text).toContain('(3 lần)');
    expect(first[2].text).not.toContain('QUYỂN HẠ HẾT');
    expect(fetcher.mock.calls.every(([url]) => url.startsWith('/offline-data/chapters/'))).toBe(true);
  });
  it('rejects a missing source section instead of inventing dedication text', () => {
    expect(() => extractDedicationText('Nội dung không có phần hồi hướng')).toThrow('dedication_section_missing');
  });
  it('keeps the original vow before the full repentance section from Kinh Địa Tạng', async () => {
    const fetcher = vi.fn(async (url: string) => new Response(readFileSync(`static${url}`, 'utf8')));
    const text = await loadRoutineRepentanceText(fetcher as typeof fetch);
    const source = JSON.parse(readFileSync('static/offline-data/chapters/tt_1780910773084.json', 'utf8'));
    const container = document.createElement('div');
    container.innerHTML = source.find((item: { id: string }) => item.id === '13617').noi_dung;
    const paragraphs = [...container.querySelectorAll('.book-paragraph')].map(node => node.textContent.trim());
    const start = paragraphs.indexOf('LỜI NGUYỆN TRƯỚC KHI TỤNG KINH');
    const end = paragraphs.indexOf('BÀI TÁN', start);
    expect(text.split('\n\n')).toEqual(paragraphs.slice(start, end).filter(Boolean));
    expect(text).toContain('SÁM OAN GIA TRÁI CHỦ');
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
