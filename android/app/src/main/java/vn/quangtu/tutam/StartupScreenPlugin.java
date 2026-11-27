package vn.quangtu.tutam;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "StartupScreen")
public class StartupScreenPlugin extends Plugin {
    @PluginMethod
    public void setLocale(PluginCall call) {
        String locale = call.getString("locale");
        if (!"en".equals(locale) && !"vi".equals(locale)) {
            call.reject("Unsupported startup locale");
            return;
        }
        final android.app.Activity activity = getBridge() == null ? null : getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) { call.resolve(); return; }
        activity.runOnUiThread(() -> {
            if (!activity.isFinishing() && !activity.isDestroyed() && activity instanceof MainActivity) ((MainActivity) activity).setStartupLocale(locale);
            call.resolve();
        });
    }

    @PluginMethod
    public void ready(PluginCall call) {
        final android.app.Activity activity = getBridge() == null ? null : getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) { call.resolve(); return; }
        activity.runOnUiThread(() -> {
            if (!activity.isFinishing() && !activity.isDestroyed() && activity instanceof MainActivity) ((MainActivity) activity).finishStartupScreen();
            call.resolve();
        });
    }
}
