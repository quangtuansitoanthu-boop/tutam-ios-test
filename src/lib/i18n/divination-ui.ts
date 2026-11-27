interface DivinationShortcutCopy {
  title: readonly [string, string];
  activity: string;
  count: string;
}

export interface DivinationUiCopy {
  groupTitle: string;
  hubQuanAmTitle: string;
  hubQuanAmDesc: string;
  hubMocLuanTitle: string;
  hubMocLuanDesc: string;
  homeQuanAm: DivinationShortcutCopy;
  homeMocLuan: DivinationShortcutCopy;
  homeBiorhythm: DivinationShortcutCopy;
  homeDream: DivinationShortcutCopy;
  hubBiorhythmTitle: string;
  hubBiorhythmDesc: string;
  hubDreamTitle: string;
  hubDreamDesc: string;
  backToPractice: string;
  backToHome: string;
  guideBtn: string;
  closeLabel: string;
  saveHistoryBtn: string;
  savedHistoryToast: string;
  storageErrorToast: string;
  clearHistoryBtn: string;
  historyEmpty: string;
  historyLocalNote: string;
  clearedHistoryToast: string;
  noTopicChoice: string;
  noTopic: string;
  privateWish: string;
  noNote: string;
  referenceOnly: string;
  phoneticOnly: string;
  oracleStickLanded: (number: number) => string;
  coinFaceUp: string;
  coinFaceDown: string;
}

const viHome = {
  quanAm: { title: ['Quan Âm', 'Linh Xăm'], activity: 'Xin xăm', count: '100 quẻ' },
  mocLuan: { title: ['Mộc Luân', 'Chiêm Sát'], activity: 'Chiêm sát', count: '189 tướng' },
} as const;

const vi: DivinationUiCopy = {
  groupTitle: 'Cảm ứng tâm linh',
  hubQuanAmTitle: viHome.quanAm.title.join(' '),
  hubQuanAmDesc: 'Xem các công việc thường ngày: xuất hành, đi xa, cầu tài, cầu con…',
  hubMocLuanTitle: viHome.mocLuan.title.join(' '),
  hubMocLuanDesc:
    'Kiểm chứng công phu tu tập, sám hối & soi xét nhân quả ba đời (việc đạo, an cư, bệnh tật, vãng sinh…)',
  homeQuanAm: viHome.quanAm,
  homeMocLuan: viHome.mocLuan,
  homeBiorhythm: { title: ['Nhịp', 'Sinh Học'], activity: 'Chu kỳ', count: '3 đường sóng' },
  homeDream: { title: ['Giải', 'Mộng'], activity: 'Tra cứu', count: '120+ giấc mơ' },
  hubBiorhythmTitle: 'Nhịp Sinh Học',
  hubBiorhythmDesc: 'Khám phá chu kỳ thể chất, tình cảm và trí tuệ theo ngày sinh',
  hubDreamTitle: 'Giải Mộng',
  hubDreamDesc: 'Tra cứu giấc mơ, góc nhìn Phật giáo và lời khuyên an tâm',
  backToPractice: 'Quay lại Tu Tập',
  backToHome: 'Quay lại Trang chủ',
  guideBtn: 'Hướng dẫn',
  closeLabel: 'Đóng',
  saveHistoryBtn: 'Lưu nhật ký',
  savedHistoryToast: 'Đã lưu vào nhật ký trên thiết bị',
  storageErrorToast: 'Không thể lưu vào bộ nhớ thiết bị.',
  clearHistoryBtn: 'Xóa lịch sử',
  historyEmpty: 'Chưa có lượt gieo nào được lưu trên thiết bị này.',
  historyLocalNote: 'Lịch sử chỉ lưu trên thiết bị này. Gỡ ứng dụng hoặc xóa dữ liệu ứng dụng sẽ mất lịch sử.',
  clearedHistoryToast: 'Đã xóa lịch sử trên thiết bị.',
  noTopicChoice: 'Không chọn sự việc',
  noTopic: 'Không chọn sự việc',
  privateWish: 'Việc tâm nguyện riêng',
  noNote: 'Không ghi chú',
  referenceOnly: 'Kết quả tham khảo, không lưu vào lịch sử.',
  phoneticOnly: 'Bản phiên âm Hán–Việt',
  oracleStickLanded: (number) => `Thẻ xăm số ${number} đã rơi ra.`,
  coinFaceUp: 'Mặt ngửa',
  coinFaceDown: 'Mặt sấp',
};

const enHome = {
  quanAm: { title: ['Guan Yin', 'Oracle Sticks'], activity: 'Draw a stick', count: '100 sticks' },
  mocLuan: { title: ['Ksitigarbha', 'Wood Wheels'], activity: 'Cast the wheels', count: '189 outcomes' },
} as const;

const en: DivinationUiCopy = {
  groupTitle: 'Spiritual Divination',
  hubQuanAmTitle: enHome.quanAm.title.join(' '),
  hubQuanAmDesc: 'Seek guidance on daily matters: travel, work, wealth, family, health…',
  hubMocLuanTitle: enHome.mocLuan.title.join(' '),
  hubMocLuanDesc:
    'Verify cultivation, repentance & karmic causes across three lifetimes (practice, dwelling, illness, rebirth…)',
  homeQuanAm: enHome.quanAm,
  homeMocLuan: enHome.mocLuan,
  homeBiorhythm: { title: ['Biorhythm', 'Cycles'], activity: 'Cycles', count: '3 waves' },
  homeDream: { title: ['Dream', 'Interpretation'], activity: 'Explore', count: '120+ dreams' },
  hubBiorhythmTitle: 'Biorhythms',
  hubBiorhythmDesc: 'Explore physical, emotional and intellectual cycles by birth date',
  hubDreamTitle: 'Dream Interpretation',
  hubDreamDesc: 'Explore dreams, Buddhist perspectives and reassuring guidance',
  backToPractice: 'Back to Practice',
  backToHome: 'Back to Home',
  guideBtn: 'Guide',
  closeLabel: 'Close',
  saveHistoryBtn: 'Save to journal',
  savedHistoryToast: 'Saved to local device journal',
  storageErrorToast: 'Unable to save to device storage.',
  clearHistoryBtn: 'Clear history',
  historyEmpty: 'No entries saved on this device yet.',
  historyLocalNote: 'History stays on this device. Uninstalling the app or clearing its data deletes your history.',
  clearedHistoryToast: 'History cleared on this device.',
  noTopicChoice: 'No topic selected',
  noTopic: 'No topic selected',
  privateWish: 'Personal wish',
  noNote: 'No note',
  referenceOnly: 'For reference only. This result is not saved.',
  phoneticOnly: 'Sino-Vietnamese reading',
  oracleStickLanded: (number) => `Oracle stick no. ${number} has fallen.`,
  coinFaceUp: 'Inscribed side',
  coinFaceDown: 'Reverse side',
};

export function getDivinationCopy(isEn: boolean): DivinationUiCopy {
  return isEn ? en : vi;
}
