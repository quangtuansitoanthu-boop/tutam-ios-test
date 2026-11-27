package vn.quangtu.tutam;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Build;
import android.util.Log;
import androidx.annotation.RequiresApi;
import java.util.Arrays;

final class HomeScreenShortcuts {
    private HomeScreenShortcuts() {}

    static void publish(Context context) {
        publish(context, null);
    }

    static void publish(Context context, String locale) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) return;
        context = locale == null
            ? vn.quangtu.tutam.widgets.PracticeWidgetProvider.localizedContext(context)
            : vn.quangtu.tutam.widgets.PracticeWidgetProvider.localizedContext(context, locale);
        ShortcutManager manager = context.getSystemService(ShortcutManager.class);
        if (manager == null) return;

        try {
            // Lối tắt động giữ task của app để WebView đang chạy nhận được liên kết mới.
            manager.addDynamicShortcuts(Arrays.asList(
                shortcut(context, "scriptures", "/kinh-sach", R.string.shortcut_scriptures, R.drawable.shortcut_scriptures, 0),
                shortcut(context, "practice", "/tu-tap", R.string.shortcut_practice, R.drawable.shortcut_practice, 1),
                shortcut(context, "talks", "/phap-thoai", R.string.shortcut_talks, R.drawable.shortcut_talks, 2)
            ));
        } catch (IllegalArgumentException | IllegalStateException error) {
            Log.w("HomeScreenShortcuts", "Could not publish home screen shortcuts", error);
        }
    }

    @RequiresApi(Build.VERSION_CODES.N_MR1)
    private static ShortcutInfo shortcut(Context context, String id, String path, int label, int icon, int rank) {
        Uri uri = Uri.parse(context.getString(R.string.custom_url_scheme) + "://" + path);
        Intent open = new Intent(Intent.ACTION_VIEW, uri, context, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        return new ShortcutInfo.Builder(context, id)
            .setActivity(new ComponentName(context, StartupActivity.class))
            .setIntent(open)
            .setRank(rank)
            .setShortLabel(context.getText(label))
            .setIcon(Icon.createWithResource(context, icon))
            .build();
    }
}
