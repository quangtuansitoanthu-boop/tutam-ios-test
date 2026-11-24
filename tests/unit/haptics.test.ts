import { afterEach, describe, expect, it, vi } from 'vitest';

const rosaryBead = vi.hoisted(() => vi.fn());
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({ rosaryBead }) }));

import { triggerHaptic } from '../../src/lib/utils/haptics';

afterEach(() => {
  vi.unstubAllGlobals();
  rosaryBead.mockReset();
});

describe('triggerHaptic', () => {
  it('triggers native haptics on native platform', async () => {
    const vibrate = vi.fn();
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true });
    vi.stubGlobal('navigator', { vibrate });

    triggerHaptic('selection');
    // Allow microtask / promise to settle
    await Promise.resolve();

    expect(rosaryBead).toHaveBeenCalledWith({ completedCycle: false });
    expect(vibrate).not.toHaveBeenCalled();

    rosaryBead.mockClear();
    triggerHaptic('success');
    await Promise.resolve();

    expect(rosaryBead).toHaveBeenCalledWith({ completedCycle: true });
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('preserves browser vibration on web platform', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('Capacitor', { isNativePlatform: () => false });
    vi.stubGlobal('navigator', { vibrate });

    triggerHaptic('selection');
    expect(rosaryBead).not.toHaveBeenCalled();
    expect(vibrate).toHaveBeenCalledWith(6);

    triggerHaptic('light');
    expect(vibrate).toHaveBeenCalledWith(10);

    triggerHaptic('medium');
    expect(vibrate).toHaveBeenCalledWith(20);

    triggerHaptic('success');
    expect(vibrate).toHaveBeenCalledWith([10, 40, 15]);

    triggerHaptic('warning');
    expect(vibrate).toHaveBeenCalledWith([25, 40, 25]);
  });
});
