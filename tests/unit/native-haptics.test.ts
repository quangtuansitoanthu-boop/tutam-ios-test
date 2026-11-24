import { afterEach, expect, it, vi } from 'vitest';

const rosaryBead = vi.hoisted(() => vi.fn());
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({ rosaryBead }) }));

import { triggerRosaryHaptic } from '../../src/lib/browser/native-haptics';

afterEach(() => {
  vi.unstubAllGlobals();
  rosaryBead.mockReset();
});

it('signals either a bead or a completed cycle to the native shell', async () => {
  const vibrate = vi.fn();
  vi.stubGlobal('Capacitor', { isNativePlatform: () => true });
  vi.stubGlobal('navigator', { vibrate });

  await triggerRosaryHaptic(false);
  await triggerRosaryHaptic(true);

  expect(rosaryBead.mock.calls).toEqual([[{ completedCycle: false }], [{ completedCycle: true }]]);
  expect(vibrate).not.toHaveBeenCalled();
});

it('preserves browser vibration patterns on web and old native shells', async () => {
  const vibrate = vi.fn();
  vi.stubGlobal('navigator', { vibrate });
  vi.stubGlobal('Capacitor', { isNativePlatform: () => false });
  await triggerRosaryHaptic(false);
  expect(rosaryBead).not.toHaveBeenCalled();

  vi.stubGlobal('Capacitor', { isNativePlatform: () => true });
  rosaryBead.mockRejectedValueOnce(new Error('Plugin unavailable'));
  await triggerRosaryHaptic(true);

  expect(vibrate.mock.calls).toEqual([[10], [[100, 50, 160]]]);
});
