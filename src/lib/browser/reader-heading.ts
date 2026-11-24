function normalizedTitle(value: string): string {
  return value.normalize('NFC').replace(/\s+/gu, ' ').trim().toLocaleUpperCase('vi');
}

/** Chỉ nhận tiêu đề độc lập ở đầu nội dung; không sửa DOM hay dữ liệu sách. */
export function startsWithReaderHeading(html: string, title: string): boolean {
  if (!html || !title.trim() || typeof DOMParser === 'undefined') return false;
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  let container: Element = parsed.body;
  let first: ChildNode | undefined;
  while (true) {
    first = [...container.childNodes].find(node => node.nodeType !== 8
      && (node.nodeType !== 3 || Boolean(node.textContent?.trim())));
    if (!(first instanceof Element)) return false;
    if (!['DIV', 'SECTION', 'ARTICLE'].includes(first.tagName)) break;
    container = first;
  }
  const heading = first;
  const semanticHeading = /^H[1-6]$/u.test(heading.tagName);
  // Sách nhập từ PDF còn có tiêu đề là đoạn riêng, không có class/căn giữa.
  // So khớp toàn bộ đoạn ở dưới, không coi tiền tố của văn xuôi là tiêu đề.
  const sourceHeading = heading.tagName === 'P';
  if (!semanticHeading && !sourceHeading) return false;
  if ([...heading.querySelectorAll('*')].some(node => !['STRONG', 'B', 'EM', 'I', 'SPAN', 'BR', 'U'].includes(node.tagName))) return false;
  const headingText = normalizedTitle(heading.textContent ?? '');
  const bannerText = normalizedTitle(title);
  if (headingText === bannerText) return true;
  const unnumberedBanner = bannerText.replace(/^\d+\.\s+/u, '').trim();
  return Boolean(unnumberedBanner) && unnumberedBanner !== bannerText && headingText === unnumberedBanner;
}
