import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import NotificationPromptModal from '../../../src/lib/components/notifications/NotificationPromptModal.svelte';

const permissions = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/browser/native-platform', () => ({ isNativeApp: () => false }));
vi.mock('$lib/browser/native-notifications', () => ({
  getUnifiedNotificationPermission: permissions.read,
  getExactReminderPermission: vi.fn(),
}));

let component: ReturnType<typeof NotificationPromptModal>;
beforeEach(() => {
  vi.useFakeTimers();
  permissions.read.mockReset().mockResolvedValue('prompt');
  component = mount(NotificationPromptModal, { target: document.body });
  flushSync();
});
afterEach(async () => {
  await unmount(component);
  document.body.replaceChildren();
  vi.useRealTimers();
});

it.each(['input', 'textarea', 'contenteditable'])('preserves focused %s during the delayed permission check and retries after editing', async kind => {
  let release!: (state: string) => void;
  permissions.read.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  await vi.advanceTimersByTimeAsync(1800);
  await vi.dynamicImportSettled();
  const editor = document.createElement(kind === 'contenteditable' ? 'div' : kind);
  if (kind === 'contenteditable') {
    editor.setAttribute('contenteditable', 'true');
    editor.tabIndex = 0;
    Object.defineProperty(editor, 'isContentEditable', { value: true }); // jsdom omits this browser property.
  }
  const nextInput = document.createElement('input');
  const done = document.createElement('button');
  document.body.append(editor, nextInput, done);
  editor.focus();
  release('prompt');
  await vi.advanceTimersByTimeAsync(32);
  flushSync();
  expect(document.activeElement).toBe(editor);
  expect(document.querySelector('.notification-modal-card')).toBeNull();

  nextInput.focus();
  await vi.advanceTimersByTimeAsync(32);
  expect(document.activeElement).toBe(nextInput);
  expect(permissions.read).toHaveBeenCalledTimes(1);
  done.focus();
  await vi.advanceTimersByTimeAsync(32);
  flushSync();
  expect(document.querySelector('.notification-modal-card')).not.toBeNull();
  expect(permissions.read).toHaveBeenCalledTimes(2);
});

it.each(['pointerup', 'pointercancel'])('waits for %s before presenting after a pointer leaves the editor', async endEvent => {
  const editor = document.createElement('input');
  const done = document.createElement('button');
  document.body.append(editor, done);
  editor.focus();
  await vi.advanceTimersByTimeAsync(1800);
  await vi.dynamicImportSettled();
  // jsdom lacks PointerEvent but dispatches its event types through the DOM normally.
  const pointer = (type: string) => Object.assign(new Event(type, { bubbles: true }), { pointerId: 11, isPrimary: true });
  done.dispatchEvent(pointer('pointerdown'));
  done.focus();
  await vi.advanceTimersByTimeAsync(150);
  flushSync();
  expect(document.querySelector('.notification-modal-card')).toBeNull();
  expect(permissions.read).toHaveBeenCalledTimes(1);
  done.dispatchEvent(pointer(endEvent));
  expect(document.querySelector('.notification-modal-card')).toBeNull();
  await vi.advanceTimersByTimeAsync(32);
  flushSync();
  expect(document.querySelector('.notification-modal-card')).not.toBeNull();
  expect(permissions.read).toHaveBeenCalledTimes(2);
});
