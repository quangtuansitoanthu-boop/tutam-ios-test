import type { AppLocale } from './translations';

const spiritDreamIds = new Set([
  'pt_drive_69bc37dd604011a70e5c4e38337865a8',
  'pt_drive_c435791b562e6f6e9d345b414df4a273',
  'pt_drive_f72e42f4cbb7db4312f96f4a1f28e2b4',
  'tt_1781081372340_1_xqcxo',
]);
const journeyIds = new Set([
  'thien-duong-du-ki',
  'tt_1781452671270',
  'tt_1781517395283',
  'pt_drive_74959767068eaae1db4846f62b62eda8',
  'pt_drive_d22e45028d45ede832a28bc87237d5d3',
]);
const hueHienAlbumId = 'pt_1781961851755';
const facebookCollectionId = 'tuyen-tap-phap-facebook-quang-tu';
const buddhistJourneyIds = new Set(['phat-tu-thien-dia-du-ky-quyen-1', 'phat-tu-thien-dia-du-ky-quyen-2']);
const amLuatVoTinhIds = new Set([
  'tt_1781604218473',
  'book_tt_1781604218473',
  'tt_1781604252515',
  'book_tt_1781604252515',
]);

export function hasContentExperienceNotice(id: string): boolean {
  return (
    spiritDreamIds.has(id) ||
    journeyIds.has(id) ||
    id === hueHienAlbumId ||
    buddhistJourneyIds.has(id) ||
    id === facebookCollectionId ||
    amLuatVoTinhIds.has(id)
  );
}

export function formatNoticeTimeout(seconds: number, locale: AppLocale): string {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  return locale === 'en'
    ? `Disappears in ${safeSeconds}s`
    : `Tự ẩn sau ${safeSeconds} giây`;
}

export function contentExperienceNotice(id: string, locale: AppLocale) {
  const kind = spiritDreamIds.has(id)
    ? 'spiritDreams'
    : journeyIds.has(id)
      ? 'journeys'
      : id === hueHienAlbumId
        ? 'hueHienDreams'
        : buddhistJourneyIds.has(id)
          ? 'buddhistDreams'
          : id === facebookCollectionId
            ? 'facebookCollection'
            : amLuatVoTinhIds.has(id)
              ? 'amLuatVoTinh'
              : null;
  return kind ? { ...copy[locale], message: copy[locale][kind] } : null;
}

const copy = {
  vi: {
    title: 'Lưu ý về nội dung',
    timeout: 'Tự ẩn sau 10 giây',
    amLuatVoTinh: 'Sách này dựa trên các trải nghiệm cá nhân, không khẳng định tất cả đều là sự thực, quý vị tin thì suy ngẫm không tin xem giải trí, mong quý vị tôn trọng và không phỉ báng các nội dung có trong sách',
    spiritDreams: 'Các câu chuyện được kể trong album này đều từ những giấc mơ độ vong của chị Hoa và các anh thầy pháp, đây đều là các trải nghiệm cá nhân, không khẳng định tất cả đều là sự thực, do đó quý vị tin thì suy ngẫm, không tin xem giải trí, mong quý vị tôn trọng và không phỉ báng các nội dung có trong sách ạ',
    journeys: 'Sách này dựa trên trải nghiệm cá nhân trong các giấc mộng của cư sĩ Dương Sinh ở Thánh Hiền đường, không khẳng định tất cả đều là sự thực, do đó quý vị tin thì suy ngẫm, không tin xem giải trí, mong quý vị tôn trọng và không phỉ báng các nội dung có trong sách ạ',
    hueHienDreams: 'Các câu chuyện được kể trong album này đều từ những giấc mơ của cư sĩ Thích Nữ Huệ Hiền, đây đều là các trải nghiệm cá nhân, không khẳng định tất cả đều là sự thực, do đó quý vị tin thì suy ngẫm, không tin xem giải trí, mong quý vị tôn trọng và không phỉ báng các nội dung có trong sách ạ',
    buddhistDreams: 'Các câu chuyện được kể trong sách này đều từ những giấc mơ của phật tử, đây đều là các trải nghiệm cá nhân, không khẳng định tất cả đều là sự thực, do đó quý vị tin thì suy ngẫm, không tin xem giải trí, mong quý vị tôn trọng và không phỉ báng các nội dung có trong sách ạ',
    facebookCollection: 'Các thông tin trong tuyển tập này được tổng hợp từ các kênh công khai, hiểu biết của tác giả và Internet, đều là những trải nghiệm cá nhân, không khẳng định tất cả đều có thật, do đó quý vị tin thì suy ngẫm không tin xem giải trí, mong quý vị tôn trọng và không phỉ báng các nội dung có trong sách ạ',
  },
  en: {
    title: 'About these stories',
    timeout: 'Disappears after 10 seconds',
    amLuatVoTinh: 'This book is based on personal experiences, and we do not assert that everything is true. If you believe them, please reflect on them; if not, please enjoy them as entertainment. Please be respectful and refrain from disparaging the contents of this book.',
    spiritDreams: 'The stories in this album come from Ms Hoa’s and the ritual practitioners’ dreams about helping departed spirits. These are personal experiences, and we do not assert that everything is true. If you believe them, you are welcome to reflect on them; if not, please enjoy them as entertainment. Please be respectful and refrain from disparaging the contents of this book.',
    journeys: 'This book is based on lay practitioner Duong Sinh’s personal dream experiences at Thanh Hien Duong. These are personal experiences, and we do not assert that everything is true. If you believe them, you are welcome to reflect on them; if not, please enjoy them as entertainment. Please be respectful and refrain from disparaging the contents of this book.',
    hueHienDreams: 'The stories in this album come from lay practitioner Thich Nu Hue Hien’s dreams. These are personal experiences, and we do not assert that everything is true. If you believe them, you are welcome to reflect on them; if not, please enjoy them as entertainment. Please be respectful and refrain from disparaging the contents of this book.',
    buddhistDreams: 'The stories in this book come from a Buddhist practitioner’s dreams. These are personal experiences, and we do not assert that everything is true. If you believe them, you are welcome to reflect on them; if not, please enjoy them as entertainment. Please be respectful and refrain from disparaging the contents of this book.',
    facebookCollection: 'The information in this collection is compiled from public channels, the author’s knowledge and the Internet. These are personal experiences, and we do not assert that everything is true. If you believe them, please reflect on them; if not, please enjoy them as entertainment. Please be respectful and refrain from disparaging the contents of this book.',
  },
};
