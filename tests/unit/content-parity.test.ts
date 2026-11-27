import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
type Row = { id: string | number; bai_viet_id: string; so_thu_tu: number; tieu_de: string; noi_dung: string };
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const chapters = (id: string, en = false): Row[] => read(`static/offline-data/chapters${en ? '-en' : ''}/${id}.json`);

it.each(['1788356229855_48d01c4c', 'book_1788356229855_48d01c4c', '1788617549554_84d86968',
  'book_1788617549554_84d86968', '1788620832166_04b4ffd5', 'book_1788620832166_04b4ffd5', 'tt_1781615695204'])(
  'preserves English chapter IDs and maps the existing Vietnamese order for %s', id => {
    const english = chapters(id, true), vietnamese = chapters(id.startsWith('book_') || id.startsWith('tt_') ? id : `book_${id}`);
    expect(english).toHaveLength(vietnamese.length);
    expect(english.map(row => row.id)).toEqual(['chap_1', 'chap_2']);
    expect(english.map(row => [row.bai_viet_id, row.so_thu_tu])).toEqual(vietnamese.map(row => [row.bai_viet_id, row.so_thu_tu]));
    expect(english.every(row => row.noi_dung.trim() && row.tieu_de.trim())).toBe(true);
  }
);

it('keeps the Facebook collection aligned by ID and source order, with the complete new chapter', () => {
  const id = 'tuyen-tap-phap-facebook-quang-tu';
  const english = chapters(id, true), vietnamese = chapters(id);
  expect(english).toHaveLength(515);
  expect(english.map(row => [String(row.id), row.bai_viet_id, row.so_thu_tu])).toEqual(
    vietnamese.map(row => [String(row.id), row.bai_viet_id, row.so_thu_tu]));
  const translated = english.find(row => String(row.id) === '14532')!;
  const original = vietnamese.find(row => String(row.id) === '14532')!;
  expect(translated.noi_dung).not.toBe(original.noi_dung);
  expect(translated.noi_dung.match(/<[^>]+>/gu)).toEqual(original.noi_dung.match(/<[^>]+>/gu));
  expect(translated.noi_dung.match(/Sino-Vietnamese recitation:/gu)).toHaveLength(7);
  expect(translated.noi_dung).toContain('Amitābhāya-tathāgatāya');
  expect(translated.noi_dung).toContain('eight billion kalpas');
  expect(english.filter(row => /\/videos\//u.test(row.noi_dung))).toHaveLength(
    vietnamese.filter(row => /\/videos\//u.test(row.noi_dung)).length);
});

it.each(['nghi-thuc-tri-chu-phat-danh-ton-thang-da-la-ni', 'tt_nghi_thuc_tri_chu_phat_danh_ton_thang'])(
  'provides real single-article English content for %s', id => {
    const articles = read('static/offline-data/articles-en.json');
    expect(articles[id].noi_dung).toBe(chapters(id, true)[0].noi_dung);
    expect(articles[id].noi_dung.length).toBeGreaterThan(1000);
  }
);

it('verifies every English pack entry against actual bytes after the schema/content corrections', () => {
  const manifest = read('src/lib/data/english-pack-manifest.json');
  expect(manifest.entries).toHaveLength(99);
  expect(read('static/offline-data/english-pack-manifest.json')).toEqual(manifest);
  for (const entry of manifest.entries) {
    const bytes = readFileSync(`static/offline-data/chapters-en/${entry.file}`);
    expect(bytes.length, entry.file).toBe(entry.bytes);
    expect(createHash('sha256').update(bytes).digest('hex'), entry.file).toBe(entry.sha256);
  }
});
