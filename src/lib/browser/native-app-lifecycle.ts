import { isNativeApp } from './native-platform';

/**
 * Subscribe to native app foreground transitions without exposing @capacitor/app to UI components.
 */
export function addAppActiveListener(onActive: () => void): () => void {
  if (!isNativeApp()) return () => {};
  let disposed = false;
  let listenerHandle: { remove: () => Promise<void> } | null = null;
  void import('@capacitor/app')
    .then(async ({ App }) => {
      const listener = await App.addListener('appStateChange', ({ isActive }) => {
        if (!disposed && isActive) onActive();
      });
      if (disposed) {
        await listener.remove().catch(() => {});
      } else {
        listenerHandle = listener;
      }
    })
    .catch(() => {
      // Fallback vẫn có visibilitychange ở component gọi.
    });
  return () => {
    disposed = true;
    if (listenerHandle) {
      void listenerHandle.remove().catch(() => {});
    }
  };
}
