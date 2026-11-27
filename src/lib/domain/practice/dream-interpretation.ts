import symbols from '$lib/data/dream-symbols.json';
import { matchesVietnameseSearch, removeVietnameseDiacritics } from '$lib/utils/vietnamese-search';

export interface DreamScenario {
  title: string;
  paragraphs: string[];
}

export interface DreamScripture {
  title: string;
  source: string;
  paragraphs: string[];
  quotation?: boolean;
}

export interface DreamEntry {
  id: string;
  category: string;
  title: string;
  keywords: string[];
  short: string;
  overview: string[];
  scenarioGroups: { title: string; items: DreamScenario[] }[];
  buddhist: string[];
  advice: string[];
  scripture?: DreamScripture[];
}

export const DREAM_TOPICS = [
  { id: 'nguoi-da-khuat', title: 'Mơ về người đã khuất', titleEn: 'Those who have passed', icon: 'candle' },
  { id: 'tam-linh', title: 'Mơ về tâm linh', titleEn: 'Spiritual dreams', icon: 'lotus' },
  { id: 'con-vat', title: 'Mơ thấy con vật', titleEn: 'Animals', icon: 'paw' },
  { id: 'diem-bao', title: 'Điềm báo & Hiện tượng', titleEn: 'Signs & Experiences', icon: 'sparkles' },
  { id: 'tien-bac', title: 'Tiền bạc & Tài sản', titleEn: 'Money & Possessions', icon: 'wallet' },
  { id: 'co-the', title: 'Cơ thể & Sinh nở', titleEn: 'Body & Birth', icon: 'heart' },
  { id: 'thien-nhien', title: 'Thiên nhiên & Cây cối', titleEn: 'Nature & Plants', icon: 'leaf' },
  { id: 'su-viec', title: 'Sự việc & Tình huống', titleEn: 'Events & Situations', icon: 'compass' },
  { id: 'nguoi', title: 'Mơ thấy người', titleEn: 'People', icon: 'users' },
  { id: 'tinh-yeu', title: 'Tình yêu & Hôn nhân', titleEn: 'Love & Marriage', icon: 'rings' },
] as const;

// Đã đối chiếu Phẩm 6/7 của bản kinh trong kho nội dung. Các đoạn dưới là diễn ý.
const deceasedScripture: DreamScripture[] = [
  {
    title: 'Phẩm 6 — Như Lai Tán Thán · Diễn ý',
    source: 'KINH ĐỊA TẠNG BỒ TÁT BỔN NGUYỆN · HT. Thích Trí Tịnh Việt dịch',
    quotation: false,
    paragraphs: [
      'Trong đoạn nói với Bồ Tát Phổ Quảng, kinh đề cập đến chiêm bao thấy các hình ảnh quỷ thần hoặc quyến thuộc quá khứ mang vẻ buồn khổ, sợ sệt. Lời dạy hướng người thân đến việc tạo phước và hồi hướng cho quyến thuộc.',
      'Phương tiện được nêu trong đoạn kinh là đối trước hình tượng chư Phật, chư Bồ Tát, chí tâm tự đọc hoặc thỉnh người đọc Kinh Địa Tạng đủ ba biến hay bảy biến. Đây là diễn ý một đoạn kinh có bối cảnh cụ thể. Một giấc mơ riêng lẻ không đủ để xác định cảnh giới hay tình trạng của người đã mất.',
    ],
  },
  {
    title: 'Phẩm 7 — Lợi Ích Kẻ Còn Người Mất · Diễn ý',
    source: 'KINH ĐỊA TẠNG BỒ TÁT BỔN NGUYỆN · HT. Thích Trí Tịnh Việt dịch',
    quotation: false,
    paragraphs: [
      'Phẩm này khuyên thân quyến vì người mới mất mà tu tạo phước lành, đặc biệt nhắc đến thời gian bốn mươi chín ngày. Nội dung đặt trọng tâm vào sự thành kính, giữ gìn điều thiện và việc làm có lợi ích cho người còn lẫn người mất.',
      'Kinh trình bày việc hồi hướng với hình ảnh bảy phần công đức: người mất được một phần, sáu phần thuộc người đang tu tạo. Người thực hành có thể tụng kinh, niệm Phật, bố thí hoặc cúng dường tùy khả năng rồi hồi hướng. Mốc bốn mươi chín ngày trong đoạn kinh không biến mỗi giấc mơ thành một thông báo về người mất.',
    ],
  },
];

export const DREAM_ENTRIES: readonly DreamEntry[] = (symbols as DreamEntry[]).map(entry =>
  entry.category === 'nguoi-da-khuat' || entry.id === 'ban-tho'
    ? { ...entry, scripture: deceasedScripture }
    : entry,
);

export const DREAM_ENTRY_COUNT = DREAM_ENTRIES.length;

const entriesById = new Map(DREAM_ENTRIES.map(entry => [entry.id, entry]));

export const POPULAR_DREAM_IDS = [
  'nguoi-mat',
  'ran-bi-can',
  'rung-rang',
  'mo-thay-tien',
  'vo-guong',
  'phat-bo-tat',
  'nuoc-lua',
  'dam-cuoi',
  'gap-ma',
  'cho',
] as const;

export function getDreamEntry(id: string): DreamEntry | undefined {
  return entriesById.get(id);
}

/** Trả về tối đa `limit` giấc mơ tiêu biểu cho danh sách tra cứu nhiều mặc định. */
export function getPopularDreamEntries(limit = 10): DreamEntry[] {
  const picked: DreamEntry[] = [];
  const seen = new Set<string>();
  for (const id of POPULAR_DREAM_IDS) {
    const entry = entriesById.get(id);
    if (entry && !seen.has(entry.id)) {
      picked.push(entry);
      seen.add(entry.id);
      if (picked.length >= limit) return picked;
    }
  }
  for (const entry of DREAM_ENTRIES) {
    if (!seen.has(entry.id)) {
      picked.push(entry);
      seen.add(entry.id);
      if (picked.length >= limit) break;
    }
  }
  return picked;
}

export function filterDreamEntries(query: string, category = 'all'): DreamEntry[] {
  const phrase = removeVietnameseDiacritics(query);
  return DREAM_ENTRIES.filter(entry =>
    (category === 'all' || entry.category === category)
    && matchesVietnameseSearch([
      entry.title, entry.short, ...entry.keywords,
      ...entry.scenarioGroups.flatMap(group => group.items.map(scenario => scenario.title)),
    ], query),
  ).sort((left, right) =>
    Number(removeVietnameseDiacritics(right.title).includes(phrase))
    - Number(removeVietnameseDiacritics(left.title).includes(phrase)),
  );
}
