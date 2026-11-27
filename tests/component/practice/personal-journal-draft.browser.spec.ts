import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { alertInApp } from '$lib/browser/app-dialog';
vi.mock('$lib/browser/app-dialog', () => ({ alertInApp: vi.fn().mockResolvedValue(undefined) }));
import { flushSync, mount, unmount } from 'svelte';
import PersonalJournal from '$lib/components/practice/personal/PersonalJournal.svelte';
import { createPersonalPracticeStorage } from '$lib/browser/personal-practice-storage';
import { getVietnamIsoDate } from '$lib/domain/practice/stats';
import { dismissTopModal, modalDialog } from '$lib/browser/modal-dialog';
import { principalStorageKey } from '$lib/browser/principal-storage';
import type { MindfulPostReceipt } from '$lib/contracts/mindful-community';
import { MindfulCommunityError } from '$lib/browser/mindful-community-client';

const localeMock = vi.hoisted(() => ({ store: null as null | { readonly current: 'vi' | 'en'; setLocale(locale: 'vi' | 'en'): void } }));
vi.mock('$lib/stores/locale.svelte', async (importOriginal) => {
  const original = await importOriginal<typeof import('$lib/stores/locale.svelte')>();
  return { ...original, getLocaleContext: () => localeMock.store ??= original.createLocaleStore('vi') };
});
let component: ReturnType<typeof PersonalJournal> | undefined;
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); flushSync(); };
function storage() {
  const values = new Map<string, string>();
  return createPersonalPracticeStorage({ getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } }, 'journal-owner');
}
function fill(node: HTMLTextAreaElement | HTMLInputElement, value: string) {
  node.value = value; node.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
}
beforeEach(() => { vi.clearAllMocks(); localeMock.store = null; localStorage.setItem('tt_reflection_guide_seen_v1', '1'); });
afterEach(async () => { if (component) await unmount(component); component = undefined; document.body.replaceChildren(); localStorage.clear(); });

async function readyJournal(owner: ReturnType<typeof storage>, onShare?: (kind: 'repentance' | 'good_deed', content: string, nickname: string) => Promise<MindfulPostReceipt | void>) {
  component = mount(PersonalJournal, { target: document.body, props: { storage: owner, onShare } }); await settle();
  document.querySelector<HTMLButtonElement>('.guide-toggle-button')!.click(); await settle();
}

const pendingReceipt: MindfulPostReceipt = {
  id: 'pending-receipt', kind: 'repentance', nickname: 'Đồng Tu', content: 'từ '.repeat(50).trim(),
  isOwn: true, status: 'hidden', reviewState: 'pending', reviewDueAt: '2026-11-23T09:00:00.000Z',
  createdAt: '2026-11-21T09:00:00.000Z', reactionCount: 0, viewerReacted: false,
};

it('keeps the community nickname with the current journal owner across visits', async () => {
  const first = createPersonalPracticeStorage(localStorage, 'journal-first');
  const second = createPersonalPracticeStorage(localStorage, 'journal-second');
  const input = () => document.querySelector<HTMLInputElement>('.meta-field--nickname input')!;
  await readyJournal(first);
  fill(input(), 'Đồng Tu');
  input().dispatchEvent(new Event('change', { bubbles: true }));
  expect(first.getNickname()).toBe('Đồng Tu');
  await unmount(component!);
  localStorage.setItem('tt_last_community_nickname', 'Biệt danh cũ trên máy');
  await readyJournal(second);
  expect(input().value).toBe('');
  expect(second.getNickname()).toBe('');
  await unmount(component!);
  await readyJournal(first);
  expect(input().value).toBe('Đồng Tu');
});
async function confirmShare() {
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === 'Gửi cộng đồng sám hối')!.click();
  await settle();
  document.querySelector<HTMLButtonElement>('.practice-confirm__primary')!.click();
  await settle();
}

it('uploads only after confirmation and shows an authoritative pending receipt without losing private writing', async () => {
  const owner = storage(); owner.saveNickname('Đồng Tu');
  const share = vi.fn(async () => pendingReceipt);
  await readyJournal(owner, share);
  fill(document.querySelector('textarea')!, 'từ '.repeat(50));
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === 'Gửi cộng đồng sám hối')!.click(); await settle();
  expect(share).not.toHaveBeenCalled();
  expect(alertInApp).not.toHaveBeenCalled();
  const confirmation = document.querySelector('.practice-confirm')!;
  expect(confirmation.textContent).toContain('duyệt trong 48 giờ');
  expect(confirmation.textContent).toContain('Tài khoản có thể bị khóa vĩnh viễn.');
  expect(document.getElementById(confirmation.getAttribute('aria-describedby')!)?.textContent).toContain('duyệt trong 48 giờ');
  document.querySelector<HTMLButtonElement>('.practice-confirm__primary')!.click(); await settle();
  expect(share).toHaveBeenCalledExactlyOnceWith('repentance', pendingReceipt.content, 'Đồng Tu');
  expect(alertInApp).toHaveBeenCalledExactlyOnceWith('Đã gửi bài, vui lòng chờ quản trị viên duyệt trong 48 giờ !');
  const notices = document.querySelectorAll('.reflection-review-notice[data-review-state=pending]');
  expect(notices).toHaveLength(1);
  const notice = notices[0];
  expect(notice.textContent).toContain('Đã gửi bài · Chờ duyệt');
  const details = notice.querySelector('button')!;
  expect(details.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(details);
  expect(notice.querySelector('time')).toBeNull();
  details.click(); await settle();
  expect(notice.querySelector('time[datetime="2026-11-23T09:00:00.000Z"]')).not.toBeNull();
  details.click(); await settle();
  expect(notice.querySelector('time')).toBeNull();
  expect(alertInApp).toHaveBeenCalledTimes(1);
  expect(document.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('');
  expect(owner.getReflections()[0].repentance).toBe('từ '.repeat(50));
});

it('ignores a pending receipt that arrives after leaving the journal', async () => {
  const owner = storage(); owner.saveNickname('Đồng Tu');
  let accept!: (receipt: MindfulPostReceipt) => void;
  await readyJournal(owner, () => new Promise(resolve => { accept = resolve; }));
  fill(document.querySelector('textarea')!, 'từ '.repeat(50));
  await confirmShare();
  await unmount(component!); component = undefined;
  accept(pendingReceipt); await settle();
  expect(alertInApp).not.toHaveBeenCalled();
});

it('prevents a duplicate pending submission but allows an edited draft and the other kind', async () => {
  const owner = storage(); owner.saveNickname('Đồng Tu');
  const edited = 'Sửa '.repeat(50);
  const share = vi.fn().mockResolvedValueOnce(pendingReceipt)
    .mockResolvedValueOnce({ ...pendingReceipt, id: 'edited-receipt', content: edited.trim() });
  await readyJournal(owner, share);
  const fields = document.querySelectorAll<HTMLTextAreaElement>('.journal-columns textarea');
  fill(fields[0], 'từ '.repeat(50)); await confirmShare();
  const sendButton = document.querySelectorAll<HTMLButtonElement>('.journal-columns .actions button')[1];
  expect(fields[0].value).toBe('');
  expect(sendButton.disabled).toBe(true);
  fill(fields[0], `  ${'từ '.repeat(50).normalize('NFD')} `); await settle();
  expect(sendButton.disabled).toBe(true);
  expect(sendButton.textContent?.trim()).toBe('Đang chờ duyệt');
  // A stale enabled DOM control still must not reopen the same accepted intent.
  sendButton.disabled = false; sendButton.click(); await settle();
  expect(document.querySelector('.practice-confirm')).toBeNull();
  expect(share).toHaveBeenCalledTimes(1);
  sendButton.disabled = true;
  fill(fields[1], 'Thiện '.repeat(50));
  const goodButton = document.querySelectorAll<HTMLButtonElement>('.journal-columns .actions button')[3];
  expect(goodButton.disabled).toBe(false);
  expect(goodButton.textContent?.trim()).toBe('Chia sẻ việc lành');
  fill(fields[0], edited); await settle();
  expect(sendButton.disabled).toBe(false);
  expect(sendButton.textContent?.trim()).toBe('Gửi cộng đồng sám hối');
  await confirmShare();
  expect(share).toHaveBeenCalledTimes(2);
  expect(share.mock.calls[1]).toEqual(['repentance', edited.trim(), 'Đồng Tu']);
  expect(owner.getReflections()[0].repentance).toBe(edited);
});

it.each([undefined, 'approved'] as const)('clears confirmed published posts with review state %s and accepts a new draft', async reviewState => {
  const owner = storage(); owner.saveNickname('Đồng Tu');
  const share = vi.fn(async (): Promise<MindfulPostReceipt> => ({ ...pendingReceipt, status: 'published', reviewState }));
  await readyJournal(owner, share);
  const editor = document.querySelector('textarea')!;
  fill(editor, 'từ '.repeat(50)); await confirmShare();
  const button = document.querySelectorAll<HTMLButtonElement>('.journal-columns .actions button')[1];
  expect(editor.value).toBe('');
  expect(button.disabled).toBe(true);
  expect(document.querySelector('[role=status]')?.textContent).toContain('Đã chia sẻ lên cộng đồng');
  expect(alertInApp).not.toHaveBeenCalled();
  expect(owner.getReflections()[0].repentance).toBe('từ '.repeat(50));
  fill(editor, 'Mới '.repeat(50));
  expect(button.disabled).toBe(false);
  expect(button.textContent?.trim()).toBe('Gửi cộng đồng sám hối');
});

it('keeps a draft without claiming success when the callback returns no receipt', async () => {
  const owner = storage(); owner.saveNickname('Đồng Tu');
  await readyJournal(owner, async () => undefined);
  const editor = document.querySelector('textarea')!;
  fill(editor, 'từ '.repeat(50)); await confirmShare();
  expect(editor.value).toBe('từ '.repeat(50));
  expect(document.querySelector('[role=status]')?.textContent).toContain('Chưa gửi được bài');
  expect(alertInApp).not.toHaveBeenCalled();
});

it.each([
  [401, 'Phiên đăng nhập đã hết hạn'], [403, 'không được phép gửi bài'],
  [429, 'tối đa 2 bài'], [503, 'hiện chưa sẵn sàng'],
])('shows safe HTTP %i feedback and retains a failed submission for retry', async (status, expected) => {
  const owner = storage(); owner.saveNickname('Đồng Tu');
  const share = vi.fn().mockRejectedValue(new MindfulCommunityError(status as number, 'failed', '<img src=x>'));
  await readyJournal(owner, share);
  fill(document.querySelector('textarea')!, 'từ '.repeat(50));
  await confirmShare();
  expect(document.querySelector('[role=status]')?.textContent).toContain(expected);
  expect(document.body.textContent).not.toContain('<img');
  expect(document.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('từ '.repeat(50));
  expect(owner.getReflections()[0].repentance).toBe('từ '.repeat(50));
  expect(share).toHaveBeenCalledTimes(1);
});

it('shows the committed account lock reason while keeping private editing and save available', async () => {
  const owner = storage(); owner.saveNickname('Đồng Tu');
  const share = vi.fn(async (): Promise<MindfulPostReceipt> => ({ ...pendingReceipt, status: 'removed', reviewState: 'removed', accountLocked: true, accountLockReason: 'Vi phạm chính sách quyên góp tiền.' }));
  await readyJournal(owner, share);
  fill(document.querySelector('textarea')!, 'từ '.repeat(50)); await confirmShare();
  expect(document.querySelector('.reflection-review-notice')?.textContent).toContain('Vi phạm chính sách quyên góp tiền.');
  expect(document.querySelector('.reflection-review-notice')?.textContent).toContain('Tài khoản đã bị khóa');
  const send = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === 'Gửi cộng đồng sám hối')!;
  expect(send.disabled).toBe(true);
  expect(document.querySelector<HTMLButtonElement>('.actions button:first-child')!.disabled).toBe(false);
  fill(document.querySelector('textarea')!, 'Still private '.repeat(30));
  expect(component!.preserveDraft()).toBe(true);
  expect(owner.getReflections()[0].repentance).toBe('Still private '.repeat(30));
});

it.each([
  ['fundraising_solicitation', 'Nội dung trực tiếp kêu gọi chuyển tiền hoặc quyên góp không được phép trong cộng đồng.', 'Direct requests for money transfers or donations are not allowed in the community.'],
  ['political_mobilization', 'Nội dung trực tiếp kêu gọi huy động chính trị hoặc lật đổ không được phép trong cộng đồng.', 'Direct calls for political mobilization or overthrow are not allowed in the community.'],
  ['superstition_promotion', 'Nội dung trực tiếp quảng bá, mời chào dịch vụ tà đạo hoặc mê tín không được phép trong cộng đồng.', 'Direct promotion or solicitation of harmful sect or superstition services is not allowed in the community.'],
] as const)('localizes the automated %s lock reason when the interface changes to English', async (policyCode, serverReason, englishReason) => {
  const owner = storage(); owner.saveNickname('Đồng Tu');
  const share = vi.fn(async (): Promise<MindfulPostReceipt> => ({ ...pendingReceipt, status: 'removed', reviewState: 'removed',
    policyCode, reviewReason: serverReason, accountLocked: true, accountLockReason: serverReason }));
  await readyJournal(owner, share);
  fill(document.querySelector('textarea')!, 'từ '.repeat(50)); await confirmShare();
  expect(document.querySelector('.reflection-review-notice .reason')?.textContent).toContain(serverReason);
  localeMock.store!.setLocale('en'); await settle();
  expect(document.querySelector('.reflection-review-notice .reason')?.textContent).toContain(englishReason);
  expect(document.querySelector('.reflection-review-notice .reason')?.textContent).not.toContain(serverReason);
  expect(share).toHaveBeenCalledTimes(1);
});

it('preserves an administrator rejection verbatim in the English interface even with an old policy code', async () => {
  const owner = storage(); owner.saveNickname('Đồng Tu');
  const manualReason = 'Vui lòng bỏ thông tin riêng của người khác trước khi gửi lại.';
  const share = vi.fn(async (): Promise<MindfulPostReceipt> => ({ ...pendingReceipt, reviewState: 'rejected',
    policyCode: 'fundraising_solicitation', reviewReason: manualReason }));
  await readyJournal(owner, share);
  fill(document.querySelector('textarea')!, 'từ '.repeat(50)); await confirmShare();
  localeMock.store!.setLocale('en'); await settle();
  expect(document.querySelector('.reflection-review-notice .reason')?.textContent).toContain(manualReason);
  expect(document.querySelector('.reflection-review-notice .reason')?.textContent).not.toContain('Direct requests for money');
});

it.each([0, 1])('warns at49words and confirms a50word manual save in section %i', async index => {
  const owner = storage();
  const write = vi.spyOn(owner, 'saveReflection');
  await readyJournal(owner);
  expect(document.body.textContent).toContain('Chia sẻ cộng đồng chưa sẵn sàng');
  const editor = document.querySelectorAll('textarea')[index];
  const saveButton = document.querySelectorAll<HTMLButtonElement>('.actions button:first-child')[index];
  fill(editor, 'từ '.repeat(49)); saveButton.click(); await settle();
  expect(alertInApp).toHaveBeenLastCalledWith(expect.stringContaining('còn thiếu 1 từ'));
  expect(write).not.toHaveBeenCalled();
  expect(editor.value).toBe('từ '.repeat(49));
  fill(editor, 'từ '.repeat(50)); saveButton.click(); await settle();
  expect(write).toHaveBeenCalledTimes(1);
  expect(alertInApp).toHaveBeenLastCalledWith(expect.stringContaining('Đã lưu riêng trên thiết bị.'));
  expect(vi.mocked(alertInApp).mock.lastCall?.[0]).toContain('bạn có thể mất dữ liệu này');
  expect(owner.getReflections()[0][index ? 'goodDeeds' : 'repentance']).toBe('từ '.repeat(50));
});

it('reports a failed manual save in a dialog without claiming success or discarding writing', async () => {
  const owner = storage();
  vi.spyOn(owner, 'saveReflection').mockImplementation(() => { throw new Error('quota'); });
  await readyJournal(owner);
  const editor = document.querySelector('textarea')!;
  fill(editor, 'từ '.repeat(50)); document.querySelector<HTMLButtonElement>('.actions button')!.click(); await settle();
  expect(alertInApp).toHaveBeenLastCalledWith('Chưa lưu được trên thiết bị. Vui lòng thử lại.');
  expect(editor.value).toBe('từ '.repeat(50));
});

it('persists clearing both fields before a same-owner remount', async () => {
  const owner = storage();
  owner.saveReflection({ date: getVietnamIsoDate(), repentance: 'Old reflection', goodDeeds: 'Old good deed', updatedAt: new Date().toISOString() });
  await readyJournal(owner);
  const fields = [...document.querySelectorAll('textarea')];
  fill(fields[0], ''); fill(fields[1], '');
  expect(component.preserveDraft()).toBe(true);
  expect(owner.getReflections()[0]).toMatchObject({ repentance: '', goodDeeds: '' });
});

it('moves focus to writing without suppressing the guide on future visits', async () => {
  localStorage.removeItem('tt_reflection_guide_seen_v1');
  component = mount(PersonalJournal, { target: document.body, props: { storage: storage() } }); await settle();
  const start = document.querySelector<HTMLButtonElement>('.start-button')!;
  start.focus(); start.click(); await settle();
  expect(document.querySelector('[data-testid=reflection-guide]')).toBeNull();
  expect(localStorage.getItem('tt_reflection_guide_seen_v1')).toBeNull();
  expect(document.activeElement).toBe(document.querySelector('textarea'));
});

it('persists clearing both fields before selecting another date', async () => {
  const owner = storage(); const today = getVietnamIsoDate();
  owner.saveReflection({ date: today, repentance: 'Old reflection', goodDeeds: '', updatedAt: new Date().toISOString() });
  await readyJournal(owner);
  fill(document.querySelector('textarea')!, '');
  const date = document.querySelector<HTMLInputElement>('input[type=date]')!;
  date.value = '2026-01-01'; date.dispatchEvent(new Event('change', { bubbles: true })); await settle();
  expect(owner.getReflections().find(item => item.date === today)?.repentance).toBe('');
});

it('keeps a saved reflection when the separate nickname settings cannot be read', async () => {
  const values = new Map<string, string>();
  const owner = createPersonalPracticeStorage({ getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } }, 'journal-owner');
  const saved = { date: getVietnamIsoDate(), repentance: 'Previously saved private reflection', goodDeeds: 'Previously saved good deed', updatedAt: new Date().toISOString() };
  owner.saveReflection(saved);
  const settingsKey = principalStorageKey('journal-owner', 'tt_personal_settings_v1');
  values.set(settingsKey, '{broken-json');
  await readyJournal(owner);
  expect(document.querySelector('[role=status]')?.textContent).toContain('Chưa đọc được');
  document.querySelector<HTMLButtonElement>('.actions button')!.click(); await settle();
  expect(owner.getReflections()[0]).toMatchObject({ repentance: saved.repentance, goodDeeds: saved.goodDeeds });
  expect(document.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe(saved.repentance);
  expect(values.get(settingsKey)).toBe('{broken-json');
});

it('does not reload a private draft on locale change while nickname reading fails', async () => {
  const owner = storage();
  owner.saveReflection({ date: getVietnamIsoDate(), repentance: 'Saved reflection', goodDeeds: '', updatedAt: new Date().toISOString() });
  vi.spyOn(owner, 'getNickname').mockImplementation(() => { throw new Error('personal_practice_storage_invalid'); });
  await readyJournal(owner);
  fill(document.querySelector<HTMLTextAreaElement>('textarea')!, 'Unsaved latest draft');
  localeMock.store!.setLocale('en'); await settle();
  expect(document.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('Unsaved latest draft');
  expect(document.querySelector('.actions button')?.textContent).toBe('Save privately');
});

it.each([
  { content: 'word '.repeat(601), nickname: 'Diệu Âm' },
  { content: 'Valid reflection '.repeat(25), nickname: 'person@example.test' },
  { content: `Valid\u0000reflection ${'word '.repeat(50)}`, nickname: 'Diệu Âm' },
])('rejects invalid public input locally without submitting: $nickname', async ({ content, nickname }) => {
  const owner = storage(); owner.saveNickname(nickname); const share = vi.fn();
  await readyJournal(owner, share);
  fill(document.querySelector('textarea')!, content);
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Gửi cộng đồng sám hối')!.click(); await settle();
  expect(document.querySelector('.practice-confirm')).toBeNull();
  expect(document.querySelector('[role=status]')?.textContent).toMatch(/3\.000|Biệt danh/u);
  expect(share).not.toHaveBeenCalled();
});

it('closes full-screen writing through hardware Back without losing the draft', async () => {
  const owner = storage();
  await readyJournal(owner);
  const trigger = document.querySelector<HTMLButtonElement>('.zen-open-btn')!;
  expect(document.activeElement).not.toBe(trigger);
  trigger.click(); await settle();
  const editor = document.querySelector<HTMLTextAreaElement>('.zen-textarea')!;
  fill(editor, 'Unsaved private draft');
  expect(dismissTopModal()).toBe(true); await settle();
  expect(document.querySelector('.zen-overlay')).toBeNull();
  expect(document.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('Unsaved private draft');
  expect(document.activeElement).toBe(trigger);
  expect(owner.getReflections()).toEqual([]);
});

it('focuses full-screen writing and closes Escape without clearing the draft', async () => {
  await readyJournal(storage());
  document.querySelector<HTMLButtonElement>('.zen-open-btn')!.click(); await settle();
  const editor = document.querySelector<HTMLTextAreaElement>('.zen-textarea')!;
  expect(document.activeElement).toBe(editor);
  fill(editor, 'Escape keeps this draft');
  editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await settle();
  expect(document.querySelector('.zen-overlay')).toBeNull();
  expect(document.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('Escape keeps this draft');
});

it('does not resurrect a removed fallback dialog during action teardown', async () => {
  const dialog = document.createElement('dialog');
  Object.defineProperty(dialog, 'showModal', { value: undefined });
  Object.defineProperty(dialog, 'close', { value: undefined });
  document.body.append(dialog);
  const action = modalDialog(dialog); await settle();
  dialog.remove(); action.destroy();
  expect(document.querySelector('dialog')).toBeNull();
  expect(document.body.childNodes).toHaveLength(0);
  expect(document.body.style.overflow).not.toBe('hidden');
});

it('announces a failed local save inside full-screen writing and retains the draft', async () => {
  const owner = storage(); vi.spyOn(owner, 'saveReflection').mockImplementation(() => { throw new Error('quota'); });
  await readyJournal(owner);
  document.querySelector<HTMLButtonElement>('.zen-open-btn')!.click(); await settle();
  fill(document.querySelector<HTMLTextAreaElement>('.zen-textarea')!, 'Keep this writing '.repeat(20));
  document.querySelector<HTMLButtonElement>('.zen-save-btn')!.click(); await settle();
  expect(document.querySelector('.zen-overlay [role=status]')?.textContent).toContain('Chưa lưu được');
  expect(document.querySelector<HTMLTextAreaElement>('.zen-textarea')?.value).toBe('Keep this writing '.repeat(20));
});

it('does not let a quick section invalidate a maximum-length private draft', async () => {
  const owner = storage();
  await readyJournal(owner);
  document.querySelector<HTMLButtonElement>('.zen-open-btn')!.click(); await settle();
  const editor = document.querySelector<HTMLTextAreaElement>('.zen-textarea')!;
  const content = 'x '.repeat(10_000); fill(editor, content);
  document.querySelector<HTMLButtonElement>('.snippet-pill')!.click(); await settle();
  expect(editor.value).toBe(content);
  document.querySelector<HTMLButtonElement>('.zen-save-btn')!.click(); await settle();
  expect(owner.getReflections()[0]?.repentance).toBe(content);
});

it('keeps longer private writing available despite the public limit', async () => {
  const owner = storage();
  await readyJournal(owner);
  const privateText = 'x '.repeat(2500);
  fill(document.querySelector('textarea')!, privateText);
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Lưu riêng tư')!.click(); await settle();
  expect(owner.getReflections()[0].repentance).toBe(privateText);
});

it('opens the guide on every visit despite the legacy seen flag, and allows manual collapse without losing writing', async () => {
 const owner=storage(); component=mount(PersonalJournal,{target:document.body,props:{storage:owner}});await settle();
 expect(document.querySelector('[data-testid=reflection-guide]')).not.toBeNull();
 expect(document.querySelector('.remember-label')).toBeNull();
 const toggle=document.querySelector<HTMLButtonElement>('.guide-toggle-button')!;toggle.click();await settle();
 expect(toggle.getAttribute('aria-expanded')).toBe('false');
 const text='từ '.repeat(50);fill(document.querySelector('textarea')!,text);
 toggle.click();await settle();expect(toggle.getAttribute('aria-expanded')).toBe('true');
 toggle.click();await settle();expect(document.querySelector('textarea')!.value).toBe(text);
 await unmount(component!);component=mount(PersonalJournal,{target:document.body,props:{storage:owner}});await settle();
 expect(document.querySelector('[data-testid=reflection-guide]')).not.toBeNull();
});
