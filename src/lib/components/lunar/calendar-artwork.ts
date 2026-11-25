import type { LunarEventNotificationInfo } from './lunar-events';

export const DAILY_CALENDAR_ARTWORKS = [
  'lotus-dawn', 'temple-mist', 'bamboo-path', 'bodhi-leaves', 'stupa-moon',
  'incense-lotus', 'rosary-stillness', 'lotus-lanterns', 'zen-garden', 'pagoda-hills',
].map(name => `/images/calendar/${name}.webp`);

export const THAP_TRAI_CALENDAR_ARTWORKS = Array.from(
  { length: 10 }, (_, index) => `/images/calendar/cu-si/${String(index + 1).padStart(2, '0')}.webp`
);

const traditional = (name: string) => `/images/le-phat/${name}.webp`;
const additional = (name: string) => `/images/calendar/feasts/${name}.webp`;
export const FEAST_CALENDAR_ARTWORKS: Record<string, string> = {
  '1-1': traditional('di-lac'),
  '2-8': traditional('thich-ca-mau-ni'), '2-15': traditional('thich-ca-mau-ni'),
  '2-19': traditional('quan-the-am-approved'), '2-21': traditional('pho-hien'),
  '3-6': additional('ca-diep-tranh'), '3-16': additional('chuan-de'),
  '4-4': traditional('van-thu-su-loi'), '4-8': traditional('thich-ca-mau-ni'),
  '4-15': traditional('thich-ca-mau-ni'), '4-20': additional('thich-quang-duc'),
  '4-23': traditional('pho-hien'), '4-28': traditional('duoc-su-approved'),
  '5-13': additional('gia-lam-tranh'), '6-3': additional('ho-phap-tranh'),
  '6-15': traditional('thich-ca-mau-ni'), '6-19': traditional('quan-the-am-approved'),
  '7-13': traditional('dai-the-chi-approved'), '7-30': traditional('dia-tang-vuong'),
  '8-8': additional('a-nan-tranh'), '8-22': additional('nhien-dang'),
  '9-19': traditional('quan-the-am-approved'), '9-30': traditional('duoc-su-approved'),
  '10-5': additional('bo-de-dat-ma-vuot-song'), '11-11': additional('tran-nhan-tong-tranh'),
  '11-17': traditional('a-di-da-approved'), '12-8': traditional('thich-ca-mau-ni'),
};

export function getCalendarArtwork(date: Date, event: LunarEventNotificationInfo, manualIndex: number | null = null) {
  const feastImage = event.viaKey ? FEAST_CALENDAR_ARTWORKS[event.viaKey] : null;
  if (feastImage) return { src: feastImage, feast: true, nextIndex: null };
  const choices = event.isThapTrai ? THAP_TRAI_CALENDAR_ARTWORKS : DAILY_CALENDAR_ARTWORKS;
  // Civil-day index: unaffected by DST or the device time zone offset.
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  const selected = manualIndex ?? event.thapTraiIndex ?? day;
  const index = ((selected % choices.length) + choices.length) % choices.length;
  return { src: choices[index], feast: false, nextIndex: (index + 1) % choices.length };
}
