import { describe, expect, it } from 'vitest';
import {
  getCanonicalVietnameseArticle,
  getEnglishBookMeta,
  getLocalizedArticle,
  prepareLocalizedReadingContent,
  ENGLISH_TRANSLATION_NOTICE,
  hasEnglishChapters,
  hasEnglishReadingContent,
  isMachineTranslatedEnglish
} from '../../src/lib/domain/library/localized-article';
import type { LibraryArticle } from '../../src/lib/components/library/article';

describe('localized-article domain', () => {
  const sampleBookId = 'book_cfab6dea8430aada3d2cf19180dd4d27';

  it('uses the revised description even when a cached article holds the original text', () => {
    for (const id of ['tt_1781081372340_1_xqcxo', 'book_tt_1781081372340_1_xqcxo']) {
      const cached = { id, title: 'Sứ Mệnh Độ Vong', summary: 'Mô tả cũ', originalSummary: 'Mô tả cũ' } as LibraryArticle;
      const english = getLocalizedArticle(cached, 'en');
      expect(english.summary).toContain('makes no claim');
      const vietnamese = getLocalizedArticle(english, 'vi');
      expect(vietnamese.summary).toContain('nhóm chị Hoa');
      expect(vietnamese.summary).toContain('không khẳng định');
    }
  });

  it('uses canonical Kinh Dia Tang title with Bo Tat even when cached/D1 row carries old Bo Tat typo', () => {
    for (const id of ['tt_1780910773084', 'book_tt_1780910773084']) {
      const stale = {
        id,
        title: 'KINH ĐỊA TẠNG BỒ TẤT BỔN NGUYỆN',
        originalTitle: 'KINH ĐỊA TẠNG BỒ TẤT BỔN NGUYỆN'
      } as LibraryArticle;
      const resolved = getLocalizedArticle(stale, 'vi');
      expect(resolved.title).toBe('KINH ĐỊA TẠNG BỒ TÁT BỔN NGUYỆN');
    }
  });

  it('removes only optional standalone website-source paragraphs in English reading content', () => {
    const body = '<p>Keep the teaching.</p><p style="text-align:justify">Source: nhanqua.com.vn</p><p>Source: https://cafef.vn</p><video><source src="/videos/teaching.mp4"></video>';
    expect(prepareLocalizedReadingContent(body, 'en')).toBe('<p>Keep the teaching.</p><video><source src="/videos/teaching.mp4"></video>');
    expect(prepareLocalizedReadingContent(body, 'vi')).toBe(body);
  });

  it('preserves authors, translators, licences, uncertain source credits and doctrinal uses of source', () => {
    const body = '<p>English translation by Bhikkhu Sujato, via SuttaCentral (public domain, CC0).</p>'
      + '<p>English Translation by Tsugunari Kubo and Akira Yuyama — CC BY-NC-SA 3.0.</p>'
      + '<p>English translation: Buddhist Text Translation Society. Source: cttbusa.org.</p>'
      + '<p>Source: Lê Tơ Hồng</p><p>Source: dharmasite.net</p>'
      + '<p>The source of suffering is craving. Source: https://cafef.vn</p>'
      + '{align:center|*(Source: Cattāri Brahmavihārā & Buddhist Text Translation Society / Sagely City of Ten Thousand Buddhas)*}';
    expect(prepareLocalizedReadingContent(body, 'en')).toBe(body);
  });

  it('discloses AI preparation and possible errors without claiming every English work is AI translated', () => {
    expect(ENGLISH_TRANSLATION_NOTICE).toBe('AI is used to prepare English translations, which may contain errors. Please refer to the Vietnamese original when needed.');
  });

  it('recognizes a loaded single-article translation without changing chapter availability', () => {
    const id = 'tt_kinh_duoc_su';
    expect(hasEnglishChapters(id)).toBe(false);
    expect(hasEnglishReadingContent(id, null)).toBe(false);
    expect(hasEnglishReadingContent(id, '   ')).toBe(false);
    expect(hasEnglishReadingContent(id, '<p>English translation</p>')).toBe(true);
    expect(hasEnglishReadingContent(sampleBookId, null)).toBe(true);
    expect(hasEnglishChapters(id)).toBe(false);
  });

  it('provides canonical Vietnamese metadata and English translations for bundled books', () => {
    const viMeta = getCanonicalVietnameseArticle(sampleBookId);
    expect(viMeta).toBeDefined();
    expect(viMeta?.title).toBe('Lá Thư Tịnh Độ');
    expect(viMeta?.summary).toContain('Bức tâm thư quý giá đúc kết');

    const enMeta = getEnglishBookMeta(sampleBookId);
    expect(enMeta).toBeDefined();
    expect(enMeta?.title).toBe('Letters from the Pure Land');
    expect(enMeta?.summary).toContain('Collection of letters');
  });

  it('works with both book_ prefixed and raw un-prefixed IDs', () => {
    const rawId = sampleBookId.replace(/^book_/, '');
    const vi1 = getCanonicalVietnameseArticle(sampleBookId);
    const vi2 = getCanonicalVietnameseArticle(rawId);
    expect(vi1?.title).toBe(vi2?.title);

    const en1 = getEnglishBookMeta(sampleBookId);
    const en2 = getEnglishBookMeta(rawId);
    expect(en1?.title).toBe(en2?.title);
  });

  it('localizes a Vietnamese article to English when locale is en', () => {
    const baseArticle: LibraryArticle = {
      id: sampleBookId,
      title: 'Lá Thư Tịnh Độ',
      summary: 'Bản dịch truyền cảm...',
      author: 'Ấn Quang Pháp Sư',
      content: '<p>Content</p>',
      category: 'SÁCH KHUYẾN THIỆN',
      tags: ['Tịnh Độ'],
      imageUrl: '',
      featured: false,
      publishedAt: '2026-01-01',
      hasTableOfContents: true,
      volumeCount: 1,
      status: 'Hoàn thành',
      pdfUrl: '',
      originalTitle: 'Lá Thư Tịnh Độ',
      originalSummary: 'Bản dịch truyền cảm...',
      originalAuthor: 'Ấn Quang Pháp Sư'
    };

    const enArticle = getLocalizedArticle(baseArticle, 'en');
    expect(enArticle.title).toBe('Letters from the Pure Land');
    expect(enArticle.summary).toContain('Collection of letters');
    expect(enArticle.originalTitle).toBe('Lá Thư Tịnh Độ');
  });

  it('reliably restores canonical Vietnamese title and summary when switching to vi mode', () => {
    // Giả lập tình huống article đang mang tên và mô tả tiếng Anh (do tải từ cache hoặc phiên EN trước)
    const englishArticle: LibraryArticle = {
      id: sampleBookId,
      title: 'Letters from the Pure Land',
      summary: 'Collection of letters and Dharma instructions...',
      author: 'Master Yin Kuang',
      content: '<p>Content</p>',
      category: 'SÁCH KHUYẾN THIỆN',
      tags: ['Pure Land'],
      imageUrl: '',
      featured: false,
      publishedAt: '2026-01-01',
      hasTableOfContents: true,
      volumeCount: 1,
      status: 'Completed',
      pdfUrl: ''
    };

    // Khi chuyển về vi:
    const viArticle = getLocalizedArticle(englishArticle, 'vi');
    expect(viArticle.title).toBe('Lá Thư Tịnh Độ');
    expect(viArticle.summary).toContain('Bức tâm thư quý giá đúc kết');
    expect(viArticle.author).toContain('Ấn Quang');
  });

  it('restores using originalTitle if article has custom original metadata', () => {
    const articleWithOriginal: LibraryArticle = {
      id: 'custom_book_123',
      title: 'English Title',
      summary: 'English Summary',
      author: 'English Author',
      content: '',
      category: 'KHÁC',
      tags: [],
      imageUrl: '',
      featured: false,
      publishedAt: '',
      hasTableOfContents: false,
      volumeCount: 0,
      status: '',
      pdfUrl: '',
      originalTitle: 'Tiêu Đề Gốc Tiếng Việt',
      originalSummary: 'Mô Tả Gốc Tiếng Việt',
      originalAuthor: 'Tác Giả Gốc'
    };

    const viArticle = getLocalizedArticle(articleWithOriginal, 'vi');
    expect(viArticle.title).toBe('Tiêu Đề Gốc Tiếng Việt');
    expect(viArticle.summary).toBe('Mô Tả Gốc Tiếng Việt');
    expect(viArticle.author).toBe('Tác Giả Gốc');
  });

  it('serves English content instead of Vietnamese chapters for single-article books in articles-en.json', async () => {
    const { readFileSync } = await import('node:fs');
    const { vi } = await import('vitest');
    const articlesEn = readFileSync('static/offline-data/articles-en.json', 'utf8');
    const bundled = readFileSync('static/offline-bundled-articles.json', 'utf8');
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => key === 'tutam_locale' ? 'en' : null,
      setItem: () => {},
      removeItem: () => {},
    });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/offline-bundled-articles.json')) return new Response(bundled, { headers: { 'content-type': 'application/json' } });
      if (url.includes('/offline-data/articles-en.json')) return new Response(articlesEn, { headers: { 'content-type': 'application/json' } });
      return new Response('null', { status: 404 });
    }));
    const { resolveOfflineBundledResponse } = await import('../../src/lib/browser/offline-bundled-resolver');
    const res = await resolveOfflineBundledResponse('/api/articles/book_1788147908838_8001cf50/chapters');
    const rows = await res?.json();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows[0]?.noi_dung).toContain('BUDDHISM OF WISDOM AND FAITH');
    expect(rows[0]?.noi_dung).not.toContain('PHẬT PHÁP VỚI ĐỜI SỐNG');
    vi.unstubAllGlobals();
  });

  it.each(['luong-hoang-sam', 'tu-bi-thuy-sam-phap'])('keeps the full chapter structure and verified English pack for %s', async (id) => {
    const { readFileSync } = await import('node:fs');
    const { createHash } = await import('node:crypto');
    type Chapter = { id: string; bai_viet_id: string; so_thu_tu: number; tieu_de: string; noi_dung: string };
    const original = JSON.parse(readFileSync(`static/offline-data/chapters/${id}.json`, 'utf8')) as Chapter[];
    const bytes = readFileSync(`static/offline-data/chapters-en/${id}.json`);
    const english = JSON.parse(bytes.toString('utf8')) as Chapter[];
    const manifest = JSON.parse(readFileSync('src/lib/data/english-pack-manifest.json', 'utf8')) as {
      entries: Array<{ file: string; bytes: number; sha256: string }>;
    };
    expect(getEnglishBookMeta(id)?.title).toMatch(/REPENTANCE/);
    expect(getEnglishBookMeta(`book_${id}`)).toEqual(getEnglishBookMeta(id));
    expect(hasEnglishChapters(id)).toBe(true);
    expect(isMachineTranslatedEnglish(id)).toBe(true);
    expect(english.map(row => [row.id, row.bai_viet_id, row.so_thu_tu])).toEqual(
      original.map(row => [row.id, row.bai_viet_id, row.so_thu_tu])
    );
    for (const [index, chapter] of english.entries()) {
      expect(chapter.tieu_de).not.toBe(original[index].tieu_de);
      expect(chapter.noi_dung).not.toBe(original[index].noi_dung);
      // Không mất khổ kệ, chỉ dẫn in nghiêng hoặc căn lề khi tạo bản dịch.
      expect(chapter.noi_dung.match(/<[^>]+>/gu)).toEqual(original[index].noi_dung.match(/<[^>]+>/gu));
      // Chân ngôn giữ âm tụng gốc, tránh dịch nhầm "Án" thành nghĩa thông thường.
      for (const mantra of original[index].noi_dung.matchAll(/>(Án[^<]+)</gu)) {
        expect(chapter.noi_dung).toContain(mantra[1]);
      }
    }
    expect(manifest.entries.find(entry => entry.file === `${id}.json`)).toEqual({
      file: `${id}.json`, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')
    });
    expect(readFileSync('static/offline-data/english-pack-manifest.json', 'utf8')).toBe(
      readFileSync('src/lib/data/english-pack-manifest.json', 'utf8')
    );
  });

  it('provides English metadata and reading content for every non-comic bundled book, sutra, and ritual', async () => {
    const { existsSync, readFileSync } = await import('node:fs');
    const bundled = JSON.parse(readFileSync('static/offline-bundled-articles.json', 'utf8')) as Array<{
      id: string;
      tieu_de: string;
      has_muc_luc?: number;
      so_tap?: number;
    }>;
    const articlesEn = JSON.parse(readFileSync('static/offline-data/articles-en.json', 'utf8')) as Record<string, { noi_dung?: string; content?: string }>;
    const missingMeta: string[] = [];
    const missingContent: string[] = [];

    for (const item of bundled) {
      if (!getEnglishBookMeta(item.id)) {
        missingMeta.push(`${item.id} (${item.tieu_de})`);
      }
      const isPdfComic = /^tt_17832635/.test(item.id) || (
        (item.has_muc_luc ?? 0) === 0
        && (item.so_tap ?? 0) === 0
        && !existsSync(`static/offline-data/chapters/${item.id}.json`)
      );
      if (isPdfComic) continue;
      const hasChaptersFile = existsSync(`static/offline-data/chapters-en/${item.id}.json`);
      const single = articlesEn[item.id];
      const hasSingleArticle = Boolean((single?.noi_dung ?? single?.content)?.trim());
      if (!hasChaptersFile && !hasSingleArticle) {
        missingContent.push(`${item.id} (${item.tieu_de})`);
      }
    }

    expect(missingMeta).toEqual([]);
    expect(missingContent).toEqual([]);
  });
});
