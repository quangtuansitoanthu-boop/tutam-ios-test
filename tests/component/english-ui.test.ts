import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { translations } from '../../src/lib/i18n/translations';
import CommentsPanel from '../../src/lib/components/comments/CommentsPanel.svelte';
import WeeklyLunarStrip from '../../src/lib/components/home/WeeklyLunarStrip.svelte';
import BuddhistDailyArtCard from '../../src/lib/components/home/BuddhistDailyArtCard.svelte';
import AudioResumePrompt from '../../src/lib/components/audio/AudioResumePrompt.svelte';
import ReaderImageLightbox from '../../src/lib/components/reader/ReaderImageLightbox.svelte';
import ReaderMediaModal from '../../src/lib/components/reader/ReaderMediaModal.svelte';
import ReaderToolbar from '../../src/lib/components/reader/ReaderToolbar.svelte';
import MostViewedArticles from '../../src/lib/components/reader/MostViewedArticles.svelte';
import ReadingAnnotations from '../../src/lib/components/reader/ReadingAnnotations.svelte';
import { buildDayDetail, buildMonthCalendar, buildWeekCalendar } from '../../src/lib/components/lunar/lunar-week';
import type { LibraryArticle } from '../../src/lib/components/library/article';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

vi.mock('$lib/stores/locale.svelte', () => ({
  getLocaleContext: () => ({ current: 'en', t: translations.en }),
}));

describe('English user interface', () => {
  it('offers to resume listening in English while preserving the track title', () => {
    const html = render(AudioResumePrompt, { props: {
      trackTitle: 'Bài giảng', positionSeconds: 125, visible: true,
      onStartOver: () => {}, onResume: () => {}, onClose: () => {},
    } }).body;
    expect(html).toContain('Bài giảng');
    expect(html).toContain('Stopped at');
    expect(html).toContain('2:05');
    expect(html).toContain('Start from beginning');
    expect(html).toContain('Resume ▶');
    expect(html).not.toMatch(/Đang nghe dở|Đến phút|Bạn có muốn/);
  });
  it('renders comment controls and the sign-in prompt in English', () => {
    const html = render(CommentsPanel, { props: { articleId: 'test' } }).body;
    expect(html).toContain('Comments &amp; Feedback');
    expect(html).toContain('Loading comments...');
    expect(html).toContain('Sign in to comment');
    expect(html).toContain('Choose a sign-in method');
    expect(html).toContain('aria-label="Write a comment"');
    expect(html).not.toMatch(/Bình luận|Đăng nhập|Gửi bình luận|Thành viên/);
  });

  it('renders calendar navigation and cyclical dates in English', () => {
    const date = new Date(2026, 9, 22);
    const strip = render(WeeklyLunarStrip, { props: { selectedDate: date } }).body;
    const card = render(BuddhistDailyArtCard, { props: { currentDate: date } }).body;
    expect(strip).toContain('View month');
    expect(strip).not.toMatch(/Xem lịch|Thu gọn|Tháng/);
    expect(card).toContain('Fire Horse');
    expect(card).not.toMatch(/Bính Ngọ|Tháng|Ngày âm lịch/);
    for (const calendar of [buildWeekCalendar(date, date, 'en'), buildMonthCalendar(date, date, 'en')]) {
      for (const day of calendar.days) {
        const detail = buildDayDetail(day, 'en');
        expect(detail.solarWeekday).toMatch(/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/);
        expect(detail.dayCanChiName).not.toMatch(/[À-ỹ]/);
        expect(detail.lunarYearCanChi).not.toMatch(/[À-ỹ]/);
      }
    }
  });

  it('renders reader controls and modals in English without Vietnamese text leaks', () => {
    const lightboxHtml = render(ReaderImageLightbox, {
      props: { source: '/img.webp', alt: 'Illustration', onClose: () => {} },
    }).body;
    expect(lightboxHtml).toContain('aria-label="View image: Illustration"');
    expect(lightboxHtml).toContain('aria-label="Close image"');
    expect(lightboxHtml).not.toMatch(/Xem ảnh|Đóng ảnh/);

    const mediaHtml = render(ReaderMediaModal, {
      props: {
        title: 'Book',
        mediaType: 'image',
        count: 0,
        totalCount: 10,
        cachedBytes: 0,
        totalBytes: 1024 * 1024,
        isBusy: false,
        onDownloadAll: async () => {},
        onClearAll: async () => {},
        onClose: () => {},
      },
    }).body;
    expect(mediaHtml).toContain('🖼️ Image');
    expect(mediaHtml).not.toContain('🖼️ Ảnh');

    const toolbarHtml = render(ReaderToolbar, {
      props: {
        scrollElement: null,
        mediaInfo: { type: 'image', title: 'Book', count: 0, total: 5, cachedBytes: 0, totalBytes: 5000, onOpenModal: () => {} },
        fontSize: 15, bold: false, background: 'cream', fontFamily: 'bookerly', lineHeight: 1.9,
        textAlign: 'justify', ttsSpeed: 1, ttsVoice: 'female', bookmarked: false,
        ttsActive: false, ttsLoading: false, autoScrollActive: false, autoScrollSpeed: 0.5,
        onFont: () => {}, onBold: () => {}, onBackground: () => {}, onFontFamily: () => {},
        onLineHeight: () => {}, onTextAlign: () => {}, onTtsSpeed: () => {}, onTtsVoice: () => {},
        onBookmark: () => {}, onSpeak: () => {}, onShare: () => {}, onAutoScroll: () => {},
        onAutoScrollSpeed: () => {}, onNotify: () => {}, onClose: () => {},
      },
    }).body;
    expect(toolbarHtml).toContain('Manage offline illustration downloads');
    expect(toolbarHtml).not.toContain('Quản lý tải ảnh');

    const baseArticle: LibraryArticle = {
      id: 'b1', title: 'Series Book', summary: '', content: '', category: 'SÁCH KHUYẾN THIỆN',
      tags: [], author: 'Author', imageUrl: '', featured: false, publishedAt: '',
      hasTableOfContents: true, volumeCount: 1, status: 'Hoàn thành', pdfUrl: '',
    };
    const otherArticle: LibraryArticle = { ...baseArticle, id: 'b2', title: 'Series Book Companion' };
    const mostViewedHtml = render(MostViewedArticles, {
      props: { currentArticle: baseArticle, articles: [baseArticle, otherArticle] },
    }).body;
    expect(mostViewedHtml).toContain('Same series');
    expect(mostViewedHtml).not.toContain('Cùng bộ');

    const annotationsHtml = render(ReadingAnnotations, {
      props: {
        contentElement: null, contentTitle: 'Book', contentId: 'b1',
        contentKind: 'book', sectionId: 'root', contentVersion: 'v1',
        session: { authenticated: false }, onNotify: () => {},
      },
    }).body;
    expect(annotationsHtml).not.toMatch(/Đang tải trích dẫn/);
  });

  it('has English translations for all non-admin localizeUi keys', () => {
    const enMap = JSON.parse(readFileSync('src/lib/i18n/interface-en.json', 'utf8')) as Record<string, string>;
    const copyEnMap = JSON.parse(readFileSync('src/lib/i18n/copying-interface-en.json', 'utf8')) as Record<string, string>;
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.(svelte|ts)$/.test(e.name) && !p.includes(`${path.sep}admin${path.sep}`) && !p.includes(`${path.sep}i18n${path.sep}`)) out.push(p);
      }
      return out;
    };
    const missing: string[] = [];
    for (const file of walk('src')) {
      const txt = readFileSync(file, 'utf8');
      const isCopying = file.includes('chep-kinh') || file.includes('copying');
      for (const m of txt.matchAll(/localizeUi\(\s*(['"])((?:\\.|(?!\1).)*)\1/g)) {
        const key = m[2].replace(/\\'/g, "'").replace(/\\"/g, '"');
        if (isCopying ? (!copyEnMap[key] && !enMap[key]) : !enMap[key]) {
          missing.push(`${file}: ${key}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
