import quanAmData from '$lib/data/quan-am-linh-xam.json';
import mocLuanData from '$lib/data/moc-luan-chiem-sat.json';

export interface QuanAmAspect {
  label: string;
  value: string;
}

export interface QuanAmStick {
  id: number;
  title: string;
  level: string;
  levelRaw: string;
  poemPhonetic: string[];
  poem: string[];
  story: string;
  comment: string;
  omen: string;
  aspects: QuanAmAspect[];
  analysis: string;
  cultivationAdvice: string;
}

export interface QuanAmTopicOption {
  id: string;
  label: string;
  aspectKeywords: readonly string[];
}

export type KeoCoinFace = 'sap' | 'ngua';
export type KeoKind = 'thanh' | 'am' | 'tieu';

export interface KeoToss {
  round: 1 | 2 | 3;
  coin1: KeoCoinFace;
  coin2: KeoCoinFace;
  kind: KeoKind;
}

export interface KeoEvaluation {
  complete: boolean;
  approved: boolean;
  thanhCount: number;
  needsRedraw: boolean;
}

export interface MocLuanWheelSpec {
  idx: 1 | 2 | 3 | 4 | 5 | 6;
  faces: readonly [number, number, number, number];
}

export interface MocLuanRitualHomage {
  title: string;
  prayer: string;
}

export interface MocLuanRitual {
  title: string;
  subtitle: string;
  openingNote: string;
  homages: readonly MocLuanRitualHomage[];
  offeringVerse: readonly string[];
  offeringContemplation: readonly string[];
  petitionLead: string;
  petitionTemplate: string;
  sacredName: string;
  sacredNameNote: string;
  closingPrayer: string;
  castingInstruction: string;
}

export type MocLuanScopeId = 'present_practice' | 'present_life' | 'past_life' | 'future_life';

export interface MocLuanScopeInfo {
  id: MocLuanScopeId;
  badge: string;
  realmRole: string;
  rangeLabel: string;
}

export interface MocLuanResolvedEntry {
  id: number;
  scope: MocLuanScopeInfo;
  text: string;
  lecture: string;
  deepMeaning: string;
  guidance: string;
  topicGuide: string;
  practice: string;
}

export interface DivinationHistoryEntry {
  id: string;
  kind: 'quan-am' | 'moc-luan';
  dateKey: string;
  createdAt: string;
  resultNumber: number;
  title: string;
  topicId?: string;
  topicLabel: string;
  summary: string;
  rounds?: number[];
}

export const QUAN_AM_DAILY_VOW_NOTE =
  'Mỗi ngày xin 1 việc gì thì chỉ gieo đúng 1 lần; sau khi niệm danh hiệu Đức Quán Thế Âm Bồ Tát (3 lần), tâm phải chí thành xin gia hộ thì kết quả mới ứng nghiệm đúng.';

export const QUAN_AM_PRAYER_CHANT =
  'Nam mô Đại Từ Đại Bi, Tầm Thanh Cứu Khổ Cứu Nạn, Linh Cảm Ứng Quán Thế Âm Bồ Tát (3 lần).';

export const QUAN_AM_TOPICS: readonly QuanAmTopicOption[] = [
  { id: 'family', label: 'Gia đạo & Bình an', aspectKeywords: ['gia đạo', 'phong thủy'] },
  { id: 'career', label: 'Công danh & Sự nghiệp', aspectKeywords: ['tự thân', 'giao dịch'] },
  { id: 'wealth', label: 'Cầu tài & Kinh doanh', aspectKeywords: ['cầu tài', 'giao dịch', 'điền vụ'] },
  { id: 'travel', label: 'Xuất hành & Đi xa', aspectKeywords: ['người đi', 'di dời', 'xuất hành'] },
  { id: 'marriage', label: 'Hôn nhân & Tình duyên', aspectKeywords: ['hôn nhân'] },
  { id: 'children', label: 'Cầu tự (Cầu con)', aspectKeywords: ['cầu tự', 'sinh con', 'lục giáp', 'gia đạo'] },
  { id: 'health', label: 'Bệnh tật & Sức khỏe', aspectKeywords: ['bệnh tật'] },
  { id: 'lost', label: 'Tìm người / Vật thất lạc', aspectKeywords: ['tìm người', 'vật mất'] },
  { id: 'legal', label: 'Kiện tụng & Tranh chấp', aspectKeywords: ['kiện tụng'] },
  { id: 'practice', label: 'Hướng tu tập & Tự thân', aspectKeywords: ['tự thân', 'gia đạo'] },
  { id: 'other', label: 'Việc khác (tự ghi chú)…', aspectKeywords: [] },
];

export const MOC_LUAN_WHEELS: readonly MocLuanWheelSpec[] = [
  { idx: 1, faces: [1, 2, 3, 0] },
  { idx: 2, faces: [4, 5, 6, 0] },
  { idx: 3, faces: [7, 8, 9, 0] },
  { idx: 4, faces: [10, 11, 12, 0] },
  { idx: 5, faces: [13, 14, 15, 0] },
  { idx: 6, faces: [16, 17, 18, 0] },
];

export const MOC_LUAN_HAN_NUMERALS: Record<number, string> = {
  0: '∅',
  1: '一',
  2: '二',
  3: '三',
  4: '四',
  5: '五',
  6: '六',
  7: '七',
  8: '八',
  9: '九',
  10: '十',
  11: '十一',
  12: '十二',
  13: '十三',
  14: '十四',
  15: '十五',
  16: '十六',
  17: '十七',
  18: '十八',
};

const QUAN_AM_STICKS = quanAmData as readonly QuanAmStick[];
const QUAN_AM_MAP = new Map<number, QuanAmStick>(QUAN_AM_STICKS.map((item) => [item.id, item]));

interface RawMocLuanDataset {
  ritual: MocLuanRitual;
  clusterLectures: string[];
  closingPositive: string;
  closingNegative: string;
  verses: Array<{
    id: number;
    text: string;
    analysis: string;
    lectureSummary: string;
    guidance: string;
    practice: string;
    directLecture: string;
    clusterIdx: number;
  }>;
}

const MOC_LUAN_DATASET = mocLuanData as unknown as RawMocLuanDataset;
const MOC_LUAN_MAP = new Map(MOC_LUAN_DATASET.verses.map((item) => [item.id, item]));

export function getAllQuanAmSticks(): readonly QuanAmStick[] {
  return QUAN_AM_STICKS;
}

export function getQuanAmStick(id: number): QuanAmStick | null {
  return QUAN_AM_MAP.get(id) ?? null;
}

export function getMocLuanRitual(): MocLuanRitual {
  return MOC_LUAN_DATASET.ritual;
}

export function formatVietnamDateKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

export function drawQuanAmStickId(rng: () => number = Math.random): number {
  const clamped = Math.min(0.999999999, Math.max(0, rng()));
  return Math.floor(clamped * 100) + 1;
}

export function tossKeoCoins(round: 1 | 2 | 3, rng: () => number = Math.random): KeoToss {
  const coin1: KeoCoinFace = rng() < 0.5 ? 'sap' : 'ngua';
  const coin2: KeoCoinFace = rng() < 0.5 ? 'sap' : 'ngua';
  const kind: KeoKind = coin1 !== coin2 ? 'thanh' : coin1 === 'sap' ? 'am' : 'tieu';
  return { round, coin1, coin2, kind };
}

export function evaluateKeoRounds(tosses: readonly KeoToss[]): KeoEvaluation {
  const thanhCount = tosses.filter((t) => t.kind === 'thanh').length;
  const complete = tosses.length >= 3;
  const approved = complete && thanhCount >= 1;
  return {
    complete,
    approved,
    thanhCount,
    needsRedraw: complete && thanhCount === 0,
  };
}

export function findAspectForTopic(stick: QuanAmStick, topicId: string): QuanAmAspect | null {
  const topic = QUAN_AM_TOPICS.find((t) => t.id === topicId);
  if (!topic || !topic.aspectKeywords.length) return null;
  for (const kw of topic.aspectKeywords) {
    const matched = stick.aspects.find((a) => a.label.toLowerCase().includes(kw));
    if (matched) return matched;
  }
  return null;
}

export function canDrawQuanAmTopicToday(
  history: readonly DivinationHistoryEntry[],
  topicId: string,
  todayKey: string,
): { allowed: boolean; existingEntry: DivinationHistoryEntry | null } {
  if (!topicId || topicId === 'other') {
    return { allowed: true, existingEntry: null };
  }
  const existing = history.find(
    (entry) => entry.kind === 'quan-am' && entry.dateKey === todayKey && entry.topicId === topicId,
  );
  return existing ? { allowed: false, existingEntry: existing } : { allowed: true, existingEntry: null };
}

export function rollMocLuanRound(rng: () => number = Math.random): {
  faces: [number, number, number, number, number, number];
  sum: number;
} {
  const faces = MOC_LUAN_WHEELS.map((w) => {
    const idx = Math.floor(Math.min(0.999999999, Math.max(0, rng())) * 4);
    return w.faces[idx];
  }) as [number, number, number, number, number, number];
  return {
    faces,
    sum: faces.reduce((acc, value) => acc + value, 0),
  };
}

export function sumMocLuanRounds(rounds: readonly number[]): number {
  return rounds.reduce((acc, value) => acc + value, 0);
}

export function getMocLuanScope(total: number): MocLuanScopeInfo {
  if (total <= 49) {
    return {
      id: 'present_practice',
      badge: 'ĐỜI HIỆN TẠI · CÔNG PHU TU TẬP (1 – 49)',
      realmRole: 'Kiểm chứng tín tâm, giới hạnh, thiền định & chánh pháp',
      rangeLabel: '1 – 49',
    };
  }
  if (total <= 160) {
    return {
      id: 'present_life',
      badge: 'ĐỜI HIỆN TẠI · NHÂN DUYÊN & ĐỜI SỐNG (50 – 160)',
      realmRole: 'Quả báo & sự việc đang diễn ra ở đời hiện tại',
      rangeLabel: '50 – 160',
    };
  }
  if (total <= 171) {
    return {
      id: 'past_life',
      badge: 'ĐỜI QUÁ KHỨ (161 – 171)',
      realmRole: 'Nghiệp nhân và cội nguồn tái sinh từ đời trước',
      rangeLabel: '161 – 171',
    };
  }
  return {
    id: 'future_life',
    badge: 'ĐỜI TƯƠNG LAI (172 – 189)',
    realmRole: 'Quả báo và hướng chuyển sinh sau khi xả báo thân',
    rangeLabel: '172 – 189',
  };
}

export function resolveMocLuanEntry(total: number): MocLuanResolvedEntry | null {
  if (!Number.isInteger(total) || total < 1 || total > 189) return null;
  const raw = MOC_LUAN_MAP.get(total);
  if (!raw) return null;

  const scope = getMocLuanScope(total);

  return {
    id: total,
    scope,
    text: `“${raw.text.endsWith('.') ? raw.text : `${raw.text}.`}”`,
    lecture: raw.lectureSummary,
    deepMeaning: raw.analysis,
    guidance: raw.guidance,
    topicGuide: 'Đối chiếu ý chính của câu kinh với đúng việc đã tác bạch. Nếu hai việc khác nhau, hãy đọc kết quả như một lời nhắc tu học chung.',
    practice: raw.practice,
  };
}

export interface TextSegment {
  text: string;
  italic: boolean;
}

/** Tách mọi đoạn trong ngoặc đơn để luôn in nghiêng cả dấu ngoặc theo quy chuẩn trình bày nghi thức. */
export function parseParentheticalSegments(source: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const pattern = /(\([^)]*\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: source.slice(lastIndex, match.index), italic: false });
    }
    segments.push({ text: match[1], italic: true });
    lastIndex = match.index + match[1].length;
  }
  if (lastIndex < source.length) {
    segments.push({ text: source.slice(lastIndex), italic: false });
  }
  return segments;
}
