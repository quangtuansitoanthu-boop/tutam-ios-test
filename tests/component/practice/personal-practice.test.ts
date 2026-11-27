import fs from 'node:fs';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import PersonalJournal from '../../../src/lib/components/practice/personal/PersonalJournal.svelte';
import PersonalPracticePanel from '../../../src/lib/components/practice/personal/PersonalPracticePanel.svelte';
import { createPersonalPracticeStorage } from '../../../src/lib/browser/personal-practice-storage';
import { personalPracticeCopy } from '../../../src/lib/i18n/personal-practice-copy';
vi.mock('../../../src/lib/stores/locale.svelte', () => ({ getLocaleContext: () => ({ current: 'vi' }) }));

function storage() {
  const values = new Map<string, string>();
  return createPersonalPracticeStorage({ getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } }, 'test-principal');
}
describe('personal practice surfaces', () => {
  it('renders the expanded guide by default without requiring community submit capability', () => {
    const html = render(PersonalJournal, { props: { storage: storage() } }).body;
    expect(html).toContain('Hướng Dẫn Quán Chiếu Thiện Ác');
    expect(html).toContain('aria-expanded="true"');
    expect(html).not.toContain('Android/iOS');
  });
  it('renders reflection without a nested routine tab or changing stored data', () => {
    const owner = storage();
    const html = render(PersonalPracticePanel, { props: { storage: owner } }).body;
    expect(html).toContain('Hướng Dẫn Quán Chiếu Thiện Ác');
    expect(html).not.toContain('Khóa lễ');
    expect(html).not.toContain('Tạo thời khóa mới');
    expect(owner.getReflections()).toEqual([]);
    expect(owner.getRoutines()).toEqual([]);
  });
  it('omits the redundant nickname placeholder, removes duplicate tab icons, and binds font sizes to UI tokens', () => {
    const html = render(PersonalJournal, { props: { storage: storage() } }).body;
    expect(html).not.toContain('placeholder="Biệt danh đồng tu"');
    expect(personalPracticeCopy.vi.repentanceMobileTab).toBe('Sám hối lỗi lầm');
    expect(personalPracticeCopy.vi.goodDeedsMobileTab).toBe('Việc thiện lành');
    expect(personalPracticeCopy.en.repentanceMobileTab).toBe('Repentance');
    expect(personalPracticeCopy.en.goodDeedsMobileTab).toBe('Good deeds');

    const journalCss = fs.readFileSync('src/lib/components/practice/personal/PersonalJournal.svelte', 'utf8');
    const guideCss = fs.readFileSync('src/lib/components/practice/personal/ReflectionGuide.svelte', 'utf8');
    const communityCss = fs.readFileSync('src/lib/components/practice/community/MindfulCommunity.svelte', 'utf8');

    expect(journalCss).not.toContain('placeholder={copy.nickname}');
    expect(journalCss).toContain('.quote-text {\n    margin: 0;\n    font-family: var(--font-reader);\n    font-style: italic;\n    font-size: var(--font-size-body);');
    expect(guideCss).toContain('h2 {\n    margin: 0;\n    font-size: calc(var(--font-size-section-title) * var(--guide-font-scale, 1));');
    expect(guideCss).toContain('h3 {\n    margin: 0 0 calc(var(--space-page) * 0.5);\n    font-size: calc(var(--font-size-card-title) * var(--guide-font-scale, 1));');
    expect(communityCss).toContain('.content {\n    margin: 0;\n    white-space: pre-wrap;\n    overflow-wrap: anywhere;\n    font-family: var(--font-reader);\n    font-size: var(--font-size-input);');
  });
});
