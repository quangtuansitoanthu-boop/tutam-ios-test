import { sanitizeStoredHtml } from '$lib/domain/content-sanitizer';
import { renderPracticeContent, replaceCustomTags } from '$lib/domain/practice/content';
import mobileImages from '../../../../assets/book-content/mobile-image-variants.json' with { type: 'json' };

const HTML_ELEMENT_PATTERN = /<\/?[a-z][^>]*>/iu;
const HTML_TOKEN_PATTERN = /(<[^>]+>)/gu;
const mobileImagePaths = new Map(mobileImages.superseded.map(entry => [
  `/assets/book-content/converted/${entry.source}`, `/assets/book-content/converted/${entry.target}`,
]));

function resolveMobileIllustrations(html: string): string {
  // Bản sách đã lưu có thể còn URL PNG/JPEG cũ; chỉ đổi src khi hiển thị.
  return html.replace(/(<img\b[^>]*\bsrc=["'])([^"']+)(["'])/giu, (_match, before: string, source: string, after: string) => {
    const suffixIndex = source.search(/[?#]/u);
    const pathname = suffixIndex < 0 ? source : source.slice(0, suffixIndex);
    const suffix = suffixIndex < 0 ? '' : source.slice(suffixIndex);
    return `${before}${mobileImagePaths.get(pathname) ?? pathname}${suffix}${after}`;
  });
}

function renderInlineMarkdown(value: string): string {
  return value
    .replace(/(?:^|\n)#{1,6}\s+([^\n]+)/gu, '\n<strong>$1</strong>')
    .replace(/\*\*(.+?)\*\*/gu, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/gu, '<em>$1</em>')
    .replace(/__(.+?)__/gu, '<u>$1</u>')
    .replace(/_(.+?)_/gu, '<em>$1</em>');
}

function prepareRitualLayout(html: string): string {
  // Chỉ đổi lời dẫn có nhãn riêng; không đụng chú giải trong sách hoặc dữ liệu đã lưu.
  let output = html.replace(
    /\{align:justify\|\*{0,2}Ghi chú:\*{0,2}\s*\}\s*\{align:justify\|([^{}]+)\}/giu,
    (_match, body: string) => `{align:justify|*(${body.trim()})*}`,
  );
  if (!output.includes('tt-converted-book') || !output.includes('KINH ĐỊA TẠNG')) return output;

  output = output.replace(
    /(?:<strong>)?<sup>1<\/sup>(?:<\/strong>)?(<\/p>)\s*<div class="footnote"><p class="note-label">CHÚ THÍCH 1<\/p><p>([\s\S]*?)<\/p><\/div>/u,
    (_match, paragraphEnd: string, body: string) => `${paragraphEnd}<p class="tt-ritual-note"><em>(${body.trim()})</em></p>`,
  );
  return output.replace(/<p\b[^>]*class="book-paragraph"[^>]*>([\s\S]*?)<\/p>/gu, (paragraph, body: string) => {
    const text = body.replace(/<[^>]+>/gu, '').trim();
    // Chỉ nhận dòng nhãn + chỗ trống; dấu chấm trong lời tụng/văn xuôi vẫn nguyên.
    if (!/^(?:[^:.…]+:\s*[.…]{6,}\s*)+$/u.test(text)) return paragraph;
    return [...text.matchAll(/([^:.…]+:)\s*([.…]{6,})/gu)].map((match) =>
      `<p class="tt-ritual-entry"><strong>${match[1].trim()}</strong><span class="tt-ritual-blank">${match[2]}</span></p>`,
    ).join('');
  });
}

function stripLeadingDuplicatePlainHeading(raw: string): string {
  return raw.replace(
    /^(\s*\{align:center\|\*\*([^*\n{}]+)\*\*\})\s*\n+[ \t]*([^\n]+)[ \t]*(?=\n|$)/u,
    (full, alignedHeading: string, titleText: string, nextLine: string) =>
      nextLine.trim() === titleText.trim() ? alignedHeading : full,
  );
}

export function renderReaderContent(raw: string): string {
  if (!raw) return '';
  const sanitized = prepareRitualLayout(sanitizeStoredHtml(stripLeadingDuplicatePlainHeading(raw)));
  if (!HTML_ELEMENT_PATTERN.test(sanitized)) {
    return resolveMobileIllustrations(sanitizeStoredHtml(renderPracticeContent(sanitized)));
  }

  let withCustomTags = replaceCustomTags(sanitized);
  // Audited Địa Tạng chapter 1 repeats this heading before its opening ritual.
  // Keep the heading immediately before the scripture; leave source data intact.
  const diaTangHeading = /<p\b[^>]*>\s*<strong>\s*Phẩm Thứ Nhất\s*<\/strong>\s*<\/p>\s*<p\b[^>]*>\s*<strong>\s*Thần Thông Trên Cung Trời Đao Lợi\s*<\/strong>\s*<\/p>/giu;
  const repeatedHeadings = [...withCustomTags.matchAll(diaTangHeading)];
  if (repeatedHeadings.length === 2) withCustomTags = withCustomTags.replace(repeatedHeadings[0][0], '');

  const rendered = withCustomTags
    .split(HTML_TOKEN_PATTERN)
    .map((token) => (token.startsWith('<') ? token : renderInlineMarkdown(token)))
    .join('');

  return resolveMobileIllustrations(sanitizeStoredHtml(rendered));
}
