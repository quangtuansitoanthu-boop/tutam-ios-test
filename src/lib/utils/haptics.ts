/**
 * Micro-haptic tactile feedback helper for Android/Capacitor WebView.
 * Provides subtle physical vibration feedback on button presses, tab switches,
 * rosary bead clicks, and bell taps to create a native Flutter/Rust-like tactile sensation.
 */

import { triggerRosaryHaptic } from '$lib/browser/native-haptics';
import { isNativeApp } from '$lib/browser/native-platform';

export type HapticStyle = 'selection' | 'light' | 'medium' | 'success' | 'warning';

export function triggerHaptic(style: HapticStyle = 'selection'): void {
  if (isNativeApp()) {
    void triggerRosaryHaptic(style === 'success' || style === 'warning');
    return;
  }

  if (typeof navigator === 'undefined' || !navigator.vibrate) return;

  try {
    switch (style) {
      case 'selection':
        // Micro-pulse for tab clicks or dropdown selects (6ms)
        navigator.vibrate(6);
        break;
      case 'light':
        // Light tap for regular buttons, toggles, chips (10ms)
        navigator.vibrate(10);
        break;
      case 'medium':
        // Medium tap for important action triggers, bell/mo taps (20ms)
        navigator.vibrate(20);
        break;
      case 'success':
        // Two crisp pulses on completion (bowing finish, bookmark saved)
        navigator.vibrate([10, 40, 15]);
        break;
      case 'warning':
        // Double warning pulse
        navigator.vibrate([25, 40, 25]);
        break;
    }
  } catch {
    // Graceful fallback if device policy disables vibration
  }
}
