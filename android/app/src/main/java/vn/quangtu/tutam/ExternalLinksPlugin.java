package vn.quangtu.tutam;

import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ExternalLinks")
public class ExternalLinksPlugin extends Plugin {
    @PluginMethod
    public void openStore(PluginCall call) {
        String url = call.getString("url");
        if (!"https://play.google.com/store/apps/details?id=vn.quangtu.tutam".equals(url)) {
            call.reject("Invalid Play Store URL");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                intent.setPackage("com.android.vending");
                getActivity().startActivity(intent);
                call.resolve();
            } catch (ActivityNotFoundException error) {
                openBrowser(call);
            } catch (RuntimeException error) {
                call.reject("Unable to open Play Store");
            }
        });
    }

    @PluginMethod
    public void openBrowser(PluginCall call) {
        String value = call.getString("url");
        Uri uri = value == null ? null : Uri.parse(value);
        if (uri == null || !"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null) {
            call.reject("Invalid HTTPS URL");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                // Chọn trình duyệt, tránh để liên kết Drive mở trong WebView hoặc ứng dụng Drive.
                Intent selector = new Intent(Intent.ACTION_MAIN);
                selector.addCategory(Intent.CATEGORY_APP_BROWSER);
                intent.setSelector(selector);
                try {
                    getActivity().startActivity(intent);
                } catch (ActivityNotFoundException selectorFallback) {
                    Intent fallback = new Intent(Intent.ACTION_VIEW, uri);
                    fallback.addCategory(Intent.CATEGORY_BROWSABLE);
                    getActivity().startActivity(fallback);
                }
                call.resolve();
            } catch (RuntimeException error) {
                call.reject("Unable to open browser");
            }
        });
    }
}
