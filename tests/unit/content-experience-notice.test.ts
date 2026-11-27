import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contentExperienceNotice, hasContentExperienceNotice } from '../../src/lib/i18n/content-experience-notice';

describe('Facebook Quang Từ collection notice', () => {
  it.each([
    ['vi', 'Các thông tin trong tuyển tập này được tổng hợp từ các kênh công khai, hiểu biết của tác giả và Internet, đều là những trải nghiệm cá nhân, không khẳng định tất cả đều có thật, do đó quý vị tin thì suy ngẫm không tin xem giải trí, mong quý vị tôn trọng và không phỉ báng các nội dung có trong sách ạ'],
    ['en', 'The information in this collection is compiled from public channels, the author’s knowledge and the Internet. These are personal experiences, and we do not assert that everything is true. If you believe them, please reflect on them; if not, please enjoy them as entertainment. Please be respectful and refrain from disparaging the contents of this book.'],
  ] as const)('shows the collection wording with the existing banner in %s', (locale, message) => {
    const id = 'tuyen-tap-phap-facebook-quang-tu';
    expect(hasContentExperienceNotice(id)).toBe(true);
    const notice = contentExperienceNotice(id, locale);
    expect(notice && { title: notice.title, timeout: notice.timeout, message: notice.message }).toEqual({
      title: locale === 'vi' ? 'Lưu ý về nội dung' : 'About these stories',
      timeout: locale === 'vi' ? 'Tự ẩn sau 10 giây' : 'Disappears after 10 seconds',
      message,
    });
  });
});

describe('Thiên Đường Du Kí notice', () => {
  it.each(['vi', 'en'] as const)('shares the approved Địa Ngục Du Ký notice in %s', locale => {
    expect(hasContentExperienceNotice('thien-duong-du-ki')).toBe(true);
    expect(contentExperienceNotice('thien-duong-du-ki', locale)).toEqual(
      contentExperienceNotice('tt_1781452671270', locale)
    );
    expect(contentExperienceNotice('thien-duong-du-ki', locale)?.timeout).toBe(
      locale === 'vi' ? 'Tự ẩn sau 10 giây' : 'Disappears after 10 seconds'
    );
  });
});

describe('Âm Luật Vô Tình notice', () => {
  it.each(['tt_1781604218473', 'tt_1781604252515'] as const)('shows notice for Âm Luật Vô Tình %s', id => {
    expect(hasContentExperienceNotice(id)).toBe(true);
    const viNotice = contentExperienceNotice(id, 'vi');
    expect(viNotice?.message).toBe(
      'Sách này dựa trên các trải nghiệm cá nhân, không khẳng định tất cả đều là sự thực, quý vị tin thì suy ngẫm không tin xem giải trí, mong quý vị tôn trọng và không phỉ báng các nội dung có trong sách'
    );
    const enNotice = contentExperienceNotice(id, 'en');
    expect(enNotice?.message).toContain('Please be respectful and refrain from disparaging the contents of this book.');
  });
});

describe('All story notices', () => {
  it('keeps existing story notices and verifies respectful clause', () => {
    for (const id of [
      'thien-duong-du-ki',
      'tt_1781452671270',
      'tt_1781517395283',
      'tt_1781081372340_1_xqcxo',
      'pt_1781961851755',
      'phat-tu-thien-dia-du-ky-quyen-1',
      'tuyen-tap-phap-facebook-quang-tu',
      'tt_1781604218473',
      'tt_1781604252515',
    ]) {
      expect(hasContentExperienceNotice(id)).toBe(true);
      const viMessage = contentExperienceNotice(id, 'vi')?.message ?? '';
      expect(viMessage).toMatch(/không khẳng định tất cả đều (là sự thực|có thật)/);
      expect(viMessage).toContain('quý vị tin thì suy ngẫm');
      expect(viMessage).toContain('mong quý vị tôn trọng và không phỉ báng các nội dung có trong sách');

      const enMessage = contentExperienceNotice(id, 'en')?.message ?? '';
      expect(enMessage).toContain('do not assert that everything is true');
      expect(enMessage).toContain('refrain from disparaging the contents of this book');
    }
    expect(hasContentExperienceNotice('unrelated-book')).toBe(false);
    expect(contentExperienceNotice('unrelated-book', 'vi')).toBeNull();
  });

  it('exposes a manual close button with accessible touch area and 3D crystal styling on ContentExperienceNotice', () => {
    const source = readFileSync('src/lib/components/shared/ContentExperienceNotice.svelte', 'utf8');
    expect(source).toContain('let dismissed = $state(false);');
    expect(source).toContain('dismissed = false;');
    expect(source).toContain('!dismissed');
    expect(source).toContain('class="cen-close"');
    expect(source).toContain('Đóng thông báo');
    expect(source).toContain('Close notice');
    expect(source).toContain('border-radius:var(--radius-card)');
  });
});
