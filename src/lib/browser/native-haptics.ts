import { registerPlugin } from '@capacitor/core';
import { isNativeApp } from './native-platform';

const haptics = registerPlugin<{
  rosaryBead(options: { completedCycle: boolean }): Promise<void>;
}>('PracticeHaptics');

export async function triggerRosaryHaptic(completedCycle: boolean): Promise<void> {
  try {
    if (isNativeApp()) {
      await haptics.rosaryBead({ completedCycle });
      return;
    }
  } catch {
    // Older native shells may still use the browser vibration fallback.
  }
  try {
    if (typeof navigator !== 'undefined') navigator.vibrate?.(completedCycle ? [100, 50, 160] : 10);
  } catch {
    // Optional feedback cannot change the saved bead count.
  }
}
