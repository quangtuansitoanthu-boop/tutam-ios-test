// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { startsWithReaderHeading } from '../../../src/lib/browser/reader-heading';
import { renderReaderContent } from '../../../src/lib/components/reader/content-renderer';

describe('duplicate reader chapter banner', () => {
  it('suppresses only the extra banner, leaving canonical rendered content mounted', () => {
    const boundary = readFileSync('src/lib/components/library/ReaderBoundary.svelte', 'utf8');
    expect(boundary).toContain('const hasSourceChapterHeading = $derived(startsWithReaderHeading(displayContent, activeTitle));');
    expect(boundary).toContain('{#if chapterIndex !== null && !hasSourceChapterHeading}');
    expect(boundary).toContain('{@html displayContent}');
  });
  it('recognizes the first centered bold source title without changing content', () => {
    const html = '<p style="text-align:center"><strong>HOẦNG TÉ</strong></p><p>Hoằng Tế<sup>1</sup></p>';
    expect(startsWithReaderHeading(html, 'HOẦNG TÉ')).toBe(true);
    expect(html).toContain('<p>Hoằng Tế<sup>1</sup></p>');
  });
  it('matches decoded source entities, NFC, whitespace and letter case', () => {
    expect(startsWithReaderHeading(' \n<div class="tt-converted-book"><h2> Hoằng&nbsp; Tế &amp; bạn </h2></div>', 'HOẰNG TẾ & BẠN')).toBe(true);
  });
  it('preserves titles with different accents, numbering or introductory content', () => {
    expect(startsWithReaderHeading('<h2>HOẦNG TÉ</h2>', 'HOẰNG TẾ')).toBe(false);
    expect(startsWithReaderHeading('<h2>1. HOẰNG TẾ</h2>', 'HOẰNG TẾ')).toBe(false);
    expect(startsWithReaderHeading('<p>Mở đầu</p><h2>HOẰNG TẾ</h2>', 'HOẰNG TẾ')).toBe(false);
    expect(startsWithReaderHeading('<div><img src="cover.webp"><h2>HOẰNG TẾ</h2></div>', 'HOẰNG TẾ')).toBe(false);
    expect(startsWithReaderHeading('<p>HOẰNG TẾ Đại sư, họ Dao.</p>', 'HOẰNG TẾ')).toBe(false);
  });
  it('keeps banners for headings with references or distinct subtitles', () => {
    expect(startsWithReaderHeading('<h2>HOẰNG TẾ<sup>1</sup></h2>', 'HOẰNG TẾ')).toBe(false);
    expect(startsWithReaderHeading('<h2>HOẰNG TẾ — Tiểu sử</h2>', 'HOẰNG TẾ')).toBe(false);
  });
  it('recognizes standalone paragraph titles in imported ordinary books', () => {
    expect(startsWithReaderHeading('<div class="tt-converted-book"><p class="book-paragraph">Lời giới thiệu</p><p>An Sĩ toàn thư</p></div>', 'Lời giới thiệu')).toBe(true);
    expect(startsWithReaderHeading('<p><strong>LỜI MỞ ĐẦU</strong></p><p>Nội dung</p>', 'Lời Mở Đầu')).toBe(true);
  });
  it('suppresses duplicate banner when banner title has numeric prefix but source heading omits it', () => {
    expect(startsWithReaderHeading('<p style="text-align:center"><strong>THIẾU NIÊN BẤT LƯƠNG</strong></p><p>Nội dung</p>', '03. THIẾU NIÊN BẤT LƯƠNG')).toBe(true);
    expect(startsWithReaderHeading('<p>Lời người dịch</p><p>Cuốn sách này...</p>', '01. Lời người dịch')).toBe(true);
  });
  it('recognizes tt-content__line centered heading and story-prefixed chapter titles (Sứ Mệnh Độ Vong)', () => {
    const introHtml = renderReaderContent('{align:center|**MỞ ĐẦU**}\n\nMỞ ĐẦU\nTôi tên là Đỗ Chân Đức.');
    expect(startsWithReaderHeading(introHtml, 'MỞ ĐẦU')).toBe(true);
    expect(introHtml.match(/MỞ ĐẦU/gu)?.length).toBe(1);

    const ch1Html = renderReaderContent('{align:center|**ĂN CỨT 10 NĂM**}\nNgười đời thường nói.');
    expect(startsWithReaderHeading(ch1Html, 'Câu chuyện 1: ĂN CỨT 10 NĂM')).toBe(true);

    const enCh1Html = renderReaderContent('{align:center|**STORY 1: TEN YEARS OF TORMENT**}\nPeople often say.');
    expect(startsWithReaderHeading(enCh1Html, 'Story 1: Ten Years of Torment')).toBe(true);
  });
});
