import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MOC_LUAN_WHEELS,
  QUAN_AM_TOPICS,
  canDrawQuanAmTopicToday,
  drawQuanAmStickId,
  evaluateKeoRounds,
  getAllQuanAmSticks,
  getMocLuanRitual,
  getMocLuanScope,
  getQuanAmStick,
  parseParentheticalSegments,
  resolveMocLuanEntry,
  rollMocLuanRound,
  sumMocLuanRounds,
  tossKeoCoins,
  type KeoToss,
} from '$lib/domain/practice/divination';

describe('Quan Âm Linh Xăm domain & data integrity', () => {
  it('bundles all 100 contiguous sticks without missing verses or watermarks', () => {
    const sticks = getAllQuanAmSticks();
    expect(sticks).toHaveLength(100);
    for (let id = 1; id <= 100; id += 1) {
      const stick = getQuanAmStick(id);
      expect(stick, `Stick ${id}`).not.toBeNull();
      expect(stick!.id).toBe(id);
      expect(stick!.poem.length, `Stick ${id} poem`).toBeGreaterThanOrEqual(4);
      expect(stick!.poemPhonetic.length).toBeGreaterThanOrEqual(4);
      expect(stick!.omen.trim().length, `Stick ${id} omen`).toBeGreaterThan(0);
      expect(stick!.comment, `Stick ${id} comment`).not.toMatch(/Đi[eê]m quẻ ứng/iu);
      expect(stick!.aspects.length).toBeGreaterThan(0);
      for (const aspect of stick!.aspects) {
        expect(aspect.value, `Stick ${id} aspect ${aspect.label}`).not.toMatch(/\*/u);
        expect(aspect.value, `Stick ${id} aspect ${aspect.label}`).not.toMatch(
          /\.\s*(Cầu tài|Gia đạo|Hôn nhân|Lục súc|Tìm người|Kiện tụng|Di dời|Vật mất|Bệnh tật|Phong thủy)/u,
        );
        expect(aspect.value, `Stick ${id} aspect ${aspect.label}`).not.toMatch(
          /ngại ngại|Lục suc|Tim người|Kiên tụng|Kiện thụng|Gai đạo|Khó hơp|\bCác$/u,
        );
        if (aspect.label === 'Phương diện khác') {
          expect(aspect.value.trim(), `Stick ${id} loose aspect`).not.toMatch(/^(Gia đạo|Người đi)$/u);
        }
      }
      const sourceText = [...stick!.poem, stick!.comment, stick!.omen].join('\n');
      expect(sourceText, `Stick ${id} source typo`).not.toMatch(
        /cữa|vui vẽ|chẵng|điều tốt|mõm non|quẻ quế|bảo tháo|trong gắp|bón biển|tổ vở|đã vở|thanh thảng|sau dể|giử cũ|chỉ rỏ|rỏ ràng|hưu nhỏ|mợi sự/iu,
      );
      expect(stick!.analysis.split('\n\n').length).toBeGreaterThanOrEqual(3);
      expect(stick!.cultivationAdvice.length).toBeGreaterThan(400);
      const prose = `${stick!.analysis}\n${stick!.cultivationAdvice}`;
      expect(prose, `Stick ${id} robotic prose`).not.toMatch(
        /Nó (khuyên|mời|nhấn|gợi)|dữ kiện|chứng từ|cơ quan có trách nhiệm|tài liệu chính thức|truyền bản|cổ bản|dị bản|phiên âm của quẻ|bằng giọng dịu hơn|khả năng có mặt|động tác trở về|bảo toàn con người|thay phương thức can thiệp|bất tương xứng/iu,
      );
      expect(stick!.cultivationAdvice, `Stick ${id} journaling homework`).not.toMatch(
        /^(Hãy viết|Viết riêng|Viết một|Ghi lại một việc)/u,
      );
    }
    expect(new Set(sticks.map(stick => stick.analysis)).size).toBe(100);
    expect(new Set(sticks.map(stick => stick.cultivationAdvice)).size).toBe(100);
    const raw = readFileSync('src/lib/data/quan-am-linh-xam.json', 'utf8');
    expect(raw).not.toMatch(/cohoc|http|\(C\)|bingf/i);
  });

  it('explains the promised letter and verification in stick 26', () => {
    const stick = getQuanAmStick(26)!;
    expect(stick.analysis).toMatch(/thư|thông tin|lời hứa/u);
    expect(stick.analysis).toMatch(/kiểm chứng|kiểm tra|xác minh|đối chiếu|xét lại/u);
    expect(stick.cultivationAdvice).not.toBe('Quẻ khuyên giữ tâm bình tĩnh, nhẫn nại chờ thời và làm việc chân chánh; siêng niệm danh hiệu Quán Thế Âm Bồ Tát và tích đức hằng ngày để chuyển duyên thuận lợi.');
  });

  it('preserves the checked meanings of the lamp, news and timely rain', () => {
    expect(getQuanAmStick(10)?.omen).toContain('tìm lửa');
    expect(getQuanAmStick(90)?.analysis).toContain('tin báo');
    expect(getQuanAmStick(99)?.poem[3]).toContain('mưa kịp');
    expect(getQuanAmStick(99)?.analysis).not.toContain('căn nhà đã thành tro');
    expect(getQuanAmStick(82)?.poemPhonetic[2]).toContain('chung bất hại');
  });

  it('draws deterministic stick IDs inside [1, 100]', () => {
    expect(drawQuanAmStickId(() => 0)).toBe(1);
    expect(drawQuanAmStickId(() => 0.999999)).toBe(100);
    expect(QUAN_AM_TOPICS.length).toBeGreaterThanOrEqual(10);
  });

  it('requires 3 coin tosses and marks redraw when 0/3 are Thánh keo', () => {
    const failRounds: KeoToss[] = [
      { round: 1, coin1: 'sap', coin2: 'sap', kind: 'am' },
      { round: 2, coin1: 'ngua', coin2: 'ngua', kind: 'tieu' },
      { round: 3, coin1: 'sap', coin2: 'sap', kind: 'am' },
    ];
    expect(evaluateKeoRounds(failRounds)).toEqual({
      complete: true,
      approved: false,
      thanhCount: 0,
      needsRedraw: true,
    });

    const partial: KeoToss[] = [{ round: 1, coin1: 'sap', coin2: 'ngua', kind: 'thanh' }];
    expect(evaluateKeoRounds(partial)).toEqual({
      complete: false,
      approved: false,
      thanhCount: 1,
      needsRedraw: false,
    });

    const approved: KeoToss[] = [
      { round: 1, coin1: 'sap', coin2: 'sap', kind: 'am' },
      { round: 2, coin1: 'sap', coin2: 'ngua', kind: 'thanh' },
      { round: 3, coin1: 'ngua', coin2: 'ngua', kind: 'tieu' },
    ];
    expect(evaluateKeoRounds(approved)).toEqual({
      complete: true,
      approved: true,
      thanhCount: 1,
      needsRedraw: false,
    });

    const mockToss = tossKeoCoins(1, () => 0.1);
    expect(['thanh', 'am', 'tieu']).toContain(mockToss.kind);
  });

  it('enforces one approved Quan Âm draw per topic per day', () => {
    const history = [
      {
        id: 'qa-1',
        kind: 'quan-am' as const,
        dateKey: '2026-11-26',
        createdAt: '2026-11-26T09:00:00+07:00',
        resultNumber: 1,
        title: 'Quẻ số 1',
        topicId: 'travel',
        topicLabel: 'Xuất hành & Đi xa',
        summary: 'Thượng Cát',
      },
    ];
    expect(canDrawQuanAmTopicToday(history, 'travel', '2026-11-26').allowed).toBe(false);
    expect(canDrawQuanAmTopicToday(history, 'wealth', '2026-11-26').allowed).toBe(true);
    expect(canDrawQuanAmTopicToday(history, 'travel', '2026-11-27').allowed).toBe(true);
  });
});

describe('Mộc Luân Chiêm Sát domain & 189 canonical verses', () => {
  it('keeps the offering contemplation and guides the full pre-casting ritual', () => {
    const ritual = getMocLuanRitual();
    expect(ritual.offeringVerse).toHaveLength(8);
    expect(ritual.offeringContemplation).toHaveLength(4);
    expect(ritual.sacredNameNote).toContain('1.000 câu');
    expect(ritual.castingInstruction).toMatch(/ba lượt.*189 tướng/u);
  });

  it('models 6 wooden wheels correctly so sums always range cleanly in [0, 189]', () => {
    expect(MOC_LUAN_WHEELS).toHaveLength(6);
    expect(MOC_LUAN_WHEELS.map(w => w.faces)).toEqual([
      [1, 2, 3, 0],
      [4, 5, 6, 0],
      [7, 8, 9, 0],
      [10, 11, 12, 0],
      [13, 14, 15, 0],
      [16, 17, 18, 0],
    ]);

    const minRoll = rollMocLuanRound(() => 0.99); // index 3 => face 0
    expect(minRoll.sum).toBe(0);
    const maxRoll = rollMocLuanRound(() => 0.74); // index 2 => 3,6,9,12,15,18 => sum 63
    expect(maxRoll.sum).toBe(63);
    expect(sumMocLuanRounds([63, 63, 63])).toBe(189);
    expect(sumMocLuanRounds([0, 0, 0])).toBe(0);
  });

  it('rejects total === 0 (Vô sở hữu) and maps all 189 signs to distinct readings and grounded lecture summaries', () => {
    expect(resolveMocLuanEntry(0)).toBeNull();
    expect(getMocLuanScope(49).id).toBe('present_practice');
    expect(getMocLuanScope(126).id).toBe('present_life');
    expect(getMocLuanScope(165).id).toBe('past_life');
    expect(getMocLuanScope(189).id).toBe('future_life');

    const analyses = new Set<string>();
    const guidance = new Set<string>();
    const practices = new Set<string>();
    for (let n = 1; n <= 189; n += 1) {
      const entry = resolveMocLuanEntry(n);
      expect(entry, `Mộc Luân ${n}`).not.toBeNull();
      expect(entry!.text.length).toBeGreaterThan(2);
      expect(entry!.lecture.length).toBeGreaterThan(200);
      expect(entry!.lecture).not.toMatch(/Khai thị tổng quan theo phân vùng|Lời căn dặn chuyển nghiệp|đoạn local/u);
      expect(entry!.deepMeaning.split(/\n\s*\n/u)).toHaveLength(3);
      expect(entry!.deepMeaning.length).toBeGreaterThan(650);
      expect(entry!.guidance.length).toBeGreaterThan(80);
      expect(entry!.practice.length).toBeGreaterThan(40);
      const mlProse = `${entry!.lecture}\n${entry!.deepMeaning}\n${entry!.guidance}\n${entry!.practice}`;
      expect(mlProse, `Mộc Luân ${n} robotic prose`).not.toMatch(
        /dữ kiện|chứng từ|lịch hẹn|nhân viên y tế|thô tháo|có căn cứ hơn|kết nối người có chuyên môn|đánh dấu sau mỗi lần|ngừng chuyển tiếp|người hiểu việc|kiểm soát mọi tình huống|bàn chân, hơi thở|lời giải tập trung làm rõ danh xưng|không mở rộng thành một lời bảo đảm|không cung cấp cách xác định nguyên nhân/iu,
      );
      analyses.add(entry!.deepMeaning);
      guidance.add(entry!.guidance);
      practices.add(entry!.practice);
    }
    expect(analyses.size).toBe(189);
    expect(guidance.size).toBe(189);
    expect(practices.size).toBe(189);

    const raw = readFileSync('src/lib/data/moc-luan-chiem-sat.json', 'utf8');
    expect(raw).not.toMatch(/phapduyen|http|\(C\)/i);
  });

  it('distinguishes overcoming a calamity by diligence from illness and treatment', () => {
    const calamity = resolveMocLuanEntry(143)!;
    expect(calamity.text).toBe('“Quán tuy có tai nạn, nhưng do tinh tấn mà thoát khỏi.”');
    expect(calamity.deepMeaning).toContain('tai nạn');
    expect(calamity.deepMeaning).toContain('tinh tấn');
    expect(calamity.deepMeaning).not.toMatch(/bệnh|thầy thuốc|thọ mạng/u);
    expect(calamity.guidance).toMatch(/kiên trì|an toàn/u);
    expect(calamity.practice).toMatch(/Địa Tạng|sám hối/u);
    expect(calamity.lecture).toContain('tinh tấn');
    expect(calamity.lecture).not.toMatch(/Tứ Đại|thầy thuốc|bệnh tật/u);
    expect(resolveMocLuanEntry(141)?.deepMeaning).toContain('lâu');
    expect(resolveMocLuanEntry(150)?.deepMeaning).toContain('bệnh');
    expect(resolveMocLuanEntry(150)?.guidance).toMatch(/điều trị|chữa trị/u);
  });

  it('keeps HT. Thích Mộng Tham lectures accurate without cross-verse contradictions or parsing leaks', () => {
    // No cross-verse mismatched cluster lectures (e.g. "bạn ác" on #13, "đã chết" on #76, "mạng sẽ hết" on #153/#155/#156, "cõi Phật" on #173)
    expect(resolveMocLuanEntry(13)!.lecture).not.toMatch(/bạn ác|Thập ngũ giả/u);
    expect(resolveMocLuanEntry(76)!.lecture).not.toMatch(/đã chết|Thất thập bát giả/u);
    expect(resolveMocLuanEntry(153)!.lecture).not.toMatch(/mạng sẽ hết|Nhất bách lục thập giả/u);
    expect(resolveMocLuanEntry(155)!.lecture).not.toMatch(/mạng sẽ hết|Nhất bách lục thập giả/u);
    expect(resolveMocLuanEntry(156)!.lecture).not.toMatch(/mạng sẽ hết|Nhất bách lục thập giả/u);
    expect(resolveMocLuanEntry(173)!.lecture).not.toMatch(/sanh tịnh Phật quốc|Nhất bách bát thập tứ giả/u);

    // Phân biệt nội dung tóm lược hiển thị với tư liệu nguyên văn được giữ lại.
    expect(resolveMocLuanEntry(118)!.lecture).not.toMatch(/Một trăm mười chín|Vua vô đạo/u);
    expect(resolveMocLuanEntry(119)!.lecture).toMatch(/người.*(cầm quyền|lãnh đạo|đứng đầu)|vua/iu);

    // Câu 75 không được lẫn vào phần tóm lược riêng của 73 và 74.
    for (const id of [73, 74]) {
      expect(resolveMocLuanEntry(id)!.lecture).not.toMatch(/75|bảy mươi lăm/u);
    }
    expect(resolveMocLuanEntry(75)!.lecture).toMatch(/Tập 8|Tập 9/u);

    // #146 ("phi nhân não") and #147 ("hợp phi nhân") match canonical meaning & HT. Mộng Tham's explanation
    const v146 = resolveMocLuanEntry(146)!;
    const v147 = resolveMocLuanEntry(147)!;
    expect(v146.text).toMatch(/do phi nhân/u);
    expect(v146.text).not.toContain('chẳng phải do con người');
    expect(v146.deepMeaning).toMatch(/phi nhân|quỷ thần/u);
    expect(v147.text).toMatch(/kết hợp.*phi nhân|hợp phi nhân|cả.*phi nhân/u);

    // Câu 92 được giải trong quan hệ với 93, không ghép lời kết chung vào mọi tướng.
    expect(resolveMocLuanEntry(92)!.lecture).toMatch(/92|ít phần/u);
    expect(resolveMocLuanEntry(1)!.lecture).not.toMatch(/:\s*\.\s*Địa Tạng|s ẽ|cùng dường|cho quý đi|liễu tử sanh/u);

    const raw = readFileSync('src/lib/data/moc-luan-chiem-sat.json', 'utf8');
    const dataset = JSON.parse(raw) as { verses: Array<{ id: number; directLecture: string }> };
    expect(dataset.verses.find(item => item.id === 119)?.directLecture)
      .toContain('Nhất bách nhất thập cửu giả, quân vô đạo, quốc tai loạn');
    expect(resolveMocLuanEntry(134)!.text).toContain('tinh tấn thì được an');
    expect(raw).not.toMatch(/s ẽ|cùng dường|cho quý đi|liễu tử sanh|:\s*\.\s*Địa Tạng/u);
  });

  it('parses parenthetical instructions into italic-marked segments cleanly', () => {
    const segs = parseParentheticalSegments('Đảnh lễ Phật (3 lễ), xưng danh hiệu (1.000 biến).');
    expect(segs).toEqual([
      { text: 'Đảnh lễ Phật ', italic: false },
      { text: '(3 lễ)', italic: true },
      { text: ', xưng danh hiệu ', italic: false },
      { text: '(1.000 biến)', italic: true },
      { text: '.', italic: false },
    ]);
  });

  it('renders Mộc Luân offering contemplation always expanded without collapsible details or toggle title', () => {
    const screen = readFileSync('src/lib/components/practice/divination/MocLuanDivinationScreen.svelte', 'utf8');
    expect(screen).toContain('class="ml-contemplation-body"');
    expect(screen).not.toContain('ml-contemplation-details');
    expect(screen).not.toContain('<details');
    expect(screen).not.toContain('<summary');
    expect(screen).not.toContain('Mở đọc đầy đủ văn quán tưởng cúng dường mười phương');
  });
});
