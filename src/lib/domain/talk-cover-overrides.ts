const NIEM_PHAT_THAP_YEU_ALBUM_ID = 'pt_1781800562343';
const NIEM_PHAT_THAP_YEU_SOURCE =
  'https://i0.wp.com/tinhtan.org/wp-content/uploads/2019/08/HT.-Th%C3%ADch-H%E1%BA%A3i-Quang.jpg';

/** Keep the existing crop and let a later editorial cover change take precedence. */
export function bundledTalkCover(albumId: unknown, cover: string): string {
  if (albumId !== NIEM_PHAT_THAP_YEU_ALBUM_ID) return cover;
  const source = cover.split(/[?#]/u, 1)[0];
  if (source !== NIEM_PHAT_THAP_YEU_SOURCE) return cover;
  const crop = cover.indexOf('#pos=');
  return 'covers/niem-phat-thap-yeu-phap-thoai.webp' + (crop < 0 ? '' : cover.slice(crop));
}
