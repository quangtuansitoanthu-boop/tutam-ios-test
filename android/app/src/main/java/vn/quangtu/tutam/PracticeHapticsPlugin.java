package vn.quangtu.tutam;

import android.os.Build;
import android.view.HapticFeedbackConstants;
import android.webkit.WebView;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PracticeHaptics")
public class PracticeHapticsPlugin extends Plugin {
    @PluginMethod
    public void rosaryBead(PluginCall call) {
        boolean completedCycle = call.getBoolean("completedCycle", false);
        final android.app.Activity activity = getBridge() == null ? null : getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) { call.resolve(); return; }
        activity.runOnUiThread(() -> {
            if (activity.isFinishing() || activity.isDestroyed()) { call.resolve(); return; }
            WebView webView = getBridge() == null ? null : getBridge().getWebView();
            if (webView != null && webView.hasWindowFocus()) {
                int feedback = completedCycle
                    ? (Build.VERSION.SDK_INT >= 30 ? HapticFeedbackConstants.CONFIRM : HapticFeedbackConstants.LONG_PRESS)
                    : (Build.VERSION.SDK_INT >= 34 ? HapticFeedbackConstants.SEGMENT_TICK : HapticFeedbackConstants.CLOCK_TICK);
                webView.performHapticFeedback(feedback);
            }
            call.resolve();
        });
    }
}
