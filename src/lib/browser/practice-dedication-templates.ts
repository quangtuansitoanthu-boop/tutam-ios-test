import { browser } from '$app/environment';

export interface PracticeDedicationTemplate { id: string; title: string; text: string }

const DIA_TANG_BOOK = 'tt_1780910773084';
const SOURCES = [
  { book: 'tt_1781274943336', chapter: '2343', title: 'NGHI THỨC TRÌ TỤNG CHÚ ĐẠI BI' },
  { book: 'tt_1781275267452', chapter: '1958', title: 'NGHI THỨC TRÌ TỤNG THẦN CHÚ THỦ LĂNG NGHIÊM' },
  { book: DIA_TANG_BOOK, chapter: '13618', title: 'KINH ĐỊA TẠNG BỒ TÁT BỔN NGUYỆN' },
] as const;

let diaTangChapters: Promise<unknown> | undefined;

async function fetchChapters(book: string, fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(`/offline-data/chapters/${book}.json`, { cache: 'force-cache' });
  if (!response.ok) throw new Error('dedication_source_unavailable');
  return response.json();
}

async function chapterText(book: string, id: string, fetcher: typeof fetch): Promise<string> {
  let chapters: unknown;
  if (book === DIA_TANG_BOOK && fetcher === fetch) {
    diaTangChapters ??= fetchChapters(book, fetcher);
    try { chapters = await diaTangChapters; }
    catch (error) { diaTangChapters = undefined; throw error; }
  } else chapters = await fetchChapters(book, fetcher);
  if (!Array.isArray(chapters)) throw new Error('dedication_source_invalid');
  const chapter = chapters.find(item => item && typeof item === 'object' && String(item.id) === id);
  if (!chapter || typeof chapter.noi_dung !== 'string') throw new Error('dedication_chapter_missing');
  return chapter.noi_dung;
}

/** Giữ cả lời nguyện và đoạn sám oan gia, đến trước tiêu đề Bài tán. */
export async function loadRoutineRepentanceText(fetcher: typeof fetch = fetch): Promise<string> {
  const html = await chapterText(DIA_TANG_BOOK, '13617', fetcher);
  const container = document.createElement('template');
  container.innerHTML = html;
  const headings = [...container.content.querySelectorAll('.source-heading')];
  const heading = headings.find(node => node.textContent?.trim() === 'LỜI NGUYỆN TRƯỚC KHI TỤNG KINH');
  const repentance = headings.find(node => node.textContent?.trim() === 'SÁM OAN GIA TRÁI CHỦ');
  if (!heading || !repentance || headings.indexOf(repentance) !== headings.indexOf(heading) + 1) throw new Error('repentance_section_missing');
  const paragraphs: string[] = [];
  for (let node: Element | null = heading; node; node = node.nextElementSibling) {
    if (node !== heading && node !== repentance && node.classList.contains('source-heading')) break;
    const text = node.textContent?.replace(/\(C\)/gu, '').trim();
    if (text) paragraphs.push(text);
  }
  if (paragraphs.length < 2) throw new Error('repentance_text_missing');
  return paragraphs.join('\n\n');
}

/** Preserve the bundled source wording and paragraph/verse boundaries in the editable copy. */
export function extractDedicationText(content: string, wholeChapter = false): string {
  if (!browser) return '';
  let section = content;
  if (!wholeChapter) {
    const heading = /\{align:(?:center|justify)\|\*\*HỒI HƯỚNG\*\*\}/u.exec(content);
    if (!heading || heading.index === undefined) throw new Error('dedication_section_missing');
    section = content.slice(heading.index);
    const note = section.indexOf('{align:justify|**Ghi chú:**}');
    if (note >= 0) section = section.slice(0, note);
  }
  const container = document.createElement('div');
  container.innerHTML = section.replace(/\{align:(?:center|justify|left|right)\|([^{}]*)\}/gu, '$1\n');
  container.querySelectorAll('script,style,iframe,object').forEach(node => node.remove());
  const converted = wholeChapter ? container.querySelector('.tt-converted-book') : null;
  if (converted) {
    // Bản Word có phần tán trước hồi hướng; lấy đúng tiêu đề, không lấy lời dẫn nhắc tới nó.
    const heading = [...converted.querySelectorAll('.source-heading,h1,h2,h3,h4,h5,h6')]
      .find(node => node.textContent?.normalize('NFC').replace(/\s+/gu, ' ').trim() === 'PHÁT NGUYỆN & HỒI HƯỚNG');
    if (!heading) throw new Error('dedication_section_missing');
    const range = document.createRange();
    range.setStartBefore(heading);
    range.setEnd(converted, converted.childNodes.length);
    container.replaceChildren(range.cloneContents());
  }
  container.querySelectorAll('br').forEach(node => node.replaceWith('\n'));
  container.querySelectorAll('p,div,li,h1,h2,h3,h4,h5,h6').forEach(node => node.append('\n'));
  return (container.textContent ?? '').replace(/\*\*([^*]+)\*\*/gu, '$1')
    .replace(/_([^_]+)_/gu, '$1').replace(/\(C\)/gu, '')
    .split('\n').map(line => line.trim()).filter(Boolean).join('\n\n');
}

let pending: Promise<PracticeDedicationTemplate[]> | undefined;

/** Three bundled static files, once per page lifetime; no API, auth, D1 or remote fallback. */
export async function loadPracticeDedicationTemplates(fetcher: typeof fetch = fetch): Promise<PracticeDedicationTemplate[]> {
  if (!browser) return [];
  if (!pending) {
    pending = Promise.all(SOURCES.map(async source => {
      const text = extractDedicationText(await chapterText(source.book, source.chapter, fetcher), source.chapter === '13618');
      if (!text) throw new Error('dedication_text_missing');
      return { id: `${source.book}:${source.chapter}`, title: source.title, text };
    }));
    try { return await pending; }
    catch (cause) { pending = undefined; throw cause; }
  }
  return pending;
}
