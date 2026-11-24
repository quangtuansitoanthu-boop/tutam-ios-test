export const DIA_TANG_VIDEO_ALBUM_ID = 'pt_drive_0cbcd85f1caa5411a50fb3edf38156d3';

// Mục lục bản HT. Thích Trí Tịnh trong Kinh sách (tt_1780910773084).
const chapterNames: Readonly<Record<string, string>> = {
  1: 'THẦN THÔNG TRÊN CUNG TRỜI ĐAO LỢI',
  2: 'PHÂN THÂN TẬP HỘI',
  3: 'QUÁN CHÚNG SINH NGHIỆP DUYÊN',
  4: 'NGHIỆP CẢM CỦA CHÚNG SINH',
  5: 'DANH HIỆU CỦA ĐỊA NGỤC',
  6: 'NHƯ LAI TÁN THÁN',
  7: 'LỢI ÍCH KẺ CÒN NGƯỜI MẤT',
  8: 'CÁC VUA DIÊM LA KHEN NGỢI',
  9: 'XƯNG DANH HIỆU CHƯ PHẬT',
  10: 'SO SÁNH NHƠN DUYÊN CÔNG ĐỨC CỦA SỰ BỐ THÍ',
  11: 'ĐỊA THẦN HỘ PHÁP',
  12: 'THẤY NGHE ĐƯỢC LỢI ÍCH',
  13: 'DẶN DÒ CỨU ĐỘ NHÂN THIÊN',
};

export function completeDiaTangVideoTrackTitle(albumId: string, title: string): string {
  if (albumId !== DIA_TANG_VIDEO_ALBUM_ID) return title;
  // Chỉ bổ sung nhãn rút gọn để bản chỉnh sửa sau này tiếp tục được ưu tiên.
  const match = /^PHẨM ([1-9]|1[0-3])(?: (\(PHẦN [1-9]\d*\)))?$/iu.exec(title.trim());
  if (!match) return title;
  const [, chapter, part] = match;
  return `PHẨM ${chapter}: ${chapterNames[chapter]}${part ? ` ${part.toUpperCase()}` : ''}`;
}
