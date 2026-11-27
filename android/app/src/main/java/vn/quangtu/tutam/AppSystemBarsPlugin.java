package vn.quangtu.tutam;

import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import androidx.activity.EdgeToEdge;
import androidx.activity.SystemBarStyle;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AppSystemBars")
public class AppSystemBarsPlugin extends Plugin {
    private Boolean lastSystemDark;

    private JSObject appearance(Configuration configuration) {
        return new JSObject().put("dark", (configuration.uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES);
    }

    @PluginMethod
    public void getAppearance(PluginCall call) {
        final android.app.Activity activity = getBridge() == null ? null : getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) { call.reject("Activity unavailable"); return; }
        call.resolve(appearance(activity.getResources().getConfiguration()));
    }

    private void publishAppearance(Configuration configuration) {
        JSObject value = appearance(configuration);
        boolean dark = value.optBoolean("dark");
        if (lastSystemDark != null && lastSystemDark == dark) return;
        lastSystemDark = dark;
        notifyListeners("appearanceChanged", value);
    }

    @Override
    protected void handleOnConfigurationChanged(Configuration configuration) {
        publishAppearance(configuration);
    }

    @Override
    protected void handleOnResume() {
        final android.app.Activity activity = getBridge() == null ? null : getActivity();
        if (activity != null && !activity.isFinishing() && !activity.isDestroyed()) publishAppearance(activity.getResources().getConfiguration());
    }

    @PluginMethod
    public void setFullscreen(PluginCall call) {
        final boolean enabled = call.getBoolean("enabled", false);
        final android.app.Activity activity = getBridge() == null ? null : getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) { call.reject("Activity unavailable"); return; }
        activity.runOnUiThread(() -> {
            if (activity.isFinishing() || activity.isDestroyed()) { call.reject("Activity unavailable"); return; }
            try {
                android.view.Window window = activity.getWindow();
                WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
                // Giữ owner inset của MainActivity; chỉ ẩn/hiện thanh trạng thái.
                if (enabled) controller.hide(WindowInsetsCompat.Type.statusBars());
                else controller.show(WindowInsetsCompat.Type.statusBars());
                call.resolve();
            } catch (RuntimeException error) {
                call.reject("Unable to update fullscreen status", error);
            }
        });
    }

    @PluginMethod
    public void setStyle(PluginCall call) {
        final boolean dark = call.getBoolean("dark", false);
        final String backgroundColor = call.getString("backgroundColor");
        final int background;
        try {
            background = Color.parseColor(backgroundColor);
        } catch (IllegalArgumentException | NullPointerException error) {
            call.reject("Invalid system bar background color");
            return;
        }
        final androidx.appcompat.app.AppCompatActivity activity = getBridge() == null ? null : getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) { call.reject("Activity unavailable"); return; }
        activity.runOnUiThread(() -> {
            if (activity.isFinishing() || activity.isDestroyed()) { call.reject("Activity unavailable"); return; }
            try {
                android.view.Window window = activity.getWindow();
                SystemBarStyle style = dark ? SystemBarStyle.dark(background) : SystemBarStyle.light(background, background);
                EdgeToEdge.enable(activity, style, style);
                WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
                controller.setAppearanceLightStatusBars(!dark);
                controller.setAppearanceLightNavigationBars(!dark);
                // Nền cửa sổ hiện dưới thanh trong suốt; không đổi màu thanh bằng API cũ.
                window.setBackgroundDrawable(new ColorDrawable(background));
                call.resolve();
            } catch (RuntimeException error) {
                call.reject("Unable to update system bar appearance", error);
            }
        });
    }
}
