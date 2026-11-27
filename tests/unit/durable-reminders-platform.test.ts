import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ platform: 'android', replacePlan: vi.fn(), clearPersonal: vi.fn() }));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => mocks }));
vi.mock('$lib/browser/native-platform', () => ({ nativePlatform: () => mocks.platform }));
import { clearDurablePersonalReminders, replaceDurableReminderPlan, type DurableReminderPlan } from '$lib/browser/durable-reminders';
afterEach(() => { vi.clearAllMocks(); mocks.platform = 'android'; });
const plan = { version: 1 } as DurableReminderPlan;
it.each(['ios', 'web'])('never invokes the Android-only plugin on %s', async platform => {
  mocks.platform = platform;
  expect(await replaceDurableReminderPlan(plan)).toEqual({ ruleCount: 0, alarmMode: 'off' });
  await clearDurablePersonalReminders();
  expect(mocks.replacePlan).not.toHaveBeenCalled();
  expect(mocks.clearPersonal).not.toHaveBeenCalled();
});
it('preserves Android plugin results and failures for the reminder owner', async () => {
  mocks.replacePlan.mockResolvedValueOnce({ ruleCount: 3, alarmMode: 'exact' });
  expect(await replaceDurableReminderPlan(plan)).toEqual({ ruleCount: 3, alarmMode: 'exact' });
  expect(mocks.replacePlan).toHaveBeenCalledWith({ plan });
  await clearDurablePersonalReminders();
  expect(mocks.clearPersonal).toHaveBeenCalledOnce();
  mocks.replacePlan.mockRejectedValueOnce(new Error('denied'));
  await expect(replaceDurableReminderPlan(plan)).rejects.toThrow('denied');
});
