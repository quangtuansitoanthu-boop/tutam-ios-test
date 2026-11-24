import { describe, expect, it } from 'vitest';
import {
  formatPracticeRitualHtml,
  preparePracticeHeadings,
} from '../../../src/lib/domain/practice/content';

describe('practice ritual HTML formatting & auto TOC headings', () => {
  it('italicizes plain parenthetical instructions, trims space before ), and avoids nested <em>', () => {
    const raw = '<p>Nam mô A Di Đà Phật (3 lần ) và <em>(1 lạy)</em> rồi (chắp tay).</p>';
    const formatted = formatPracticeRitualHtml(raw);
    expect(formatted).toContain('<em class="tt-content__paren">(3 lần)</em>');
    expect(formatted).toContain('<em>(1 lạy)</em>');
    expect(formatted).not.toContain('<em><em');
    expect(formatted).toContain('<em class="tt-content__paren">(chắp tay)</em>');
    // Idempotent when applied twice
    expect(formatPracticeRitualHtml(formatted)).toBe(formatted);
  });

  it('strips (C) bell marks, external source URLs, and raw &#8211; entities without touching image src', () => {
    const raw =
      '<p>Tụng chú (C) (3 lần) &#8211; Nguồn: <a href="https://example.org/kinh">kinh.org</a> https://spam.test/ref</p>' +
      '<img src="/assets/book-content/a(1).webp" alt="Minh họa (1)">';
    const formatted = formatPracticeRitualHtml(raw);
    expect(formatted).not.toContain('(C)');
    expect(formatted).not.toContain('https://example.org');
    expect(formatted).not.toContain('https://spam.test');
    expect(formatted).not.toContain('&#8211;');
    expect(formatted).toContain('–');
    expect(formatted).toContain('<em class="tt-content__paren">(3 lần)</em>');
    expect(formatted).toContain('src="/assets/book-content/a(1).webp"');
  });

  it('extracts h2/h3 headings and injects unique jump IDs for long scriptures without chapters', () => {
    const html = '<h2>Nghi thức Khai kinh</h2><p>Nội dung...</p><h3>Tán hương</h3><p>Kệ...</p><h2>Hồi hướng</h2>';
    const result = preparePracticeHeadings(html);
    expect(result.headings).toEqual([
      { id: 'tt-sec-0', title: 'Nghi thức Khai kinh', level: 2 },
      { id: 'tt-sec-1', title: 'Tán hương', level: 3 },
      { id: 'tt-sec-2', title: 'Hồi hướng', level: 2 },
    ]);
    expect(result.html).toContain('<h2 id="tt-sec-0">Nghi thức Khai kinh</h2>');
    expect(result.html).toContain('<h3 id="tt-sec-1">Tán hương</h3>');
    expect(result.html).toContain('<h2 id="tt-sec-2">Hồi hướng</h2>');
  });
});
