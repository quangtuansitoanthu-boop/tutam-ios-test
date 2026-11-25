package vn.quangtu.tutam;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import java.io.InputStream;
import com.getcapacitor.BridgeActivity;
import androidx.activity.EdgeToEdge;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeWebViewClient;
import com.codetrixstudio.capacitor.GoogleAuth.GoogleAuth;

public class MainActivity extends BridgeActivity {
    private static final long STARTUP_MIN_READING_MS = 3000;
    private static final long STARTUP_FADE_MS = 280;
    private static final long STARTUP_FAILSAFE_MS = 30000;
    private android.widget.FrameLayout startupScreen;
    private final android.os.Handler startupHandler = new android.os.Handler(android.os.Looper.getMainLooper());
    private boolean startupReady;
    private long earliestStartupFadeAt = -1;
    private boolean entranceFinished;
    private boolean startupDrawn;
    private boolean awaitingStartupFrame;
    private boolean initialStartupHandled;
    private final Runnable dismissStartup = this::removeStartupScreen;
    private final Runnable startupFailsafe = this::finishStartupScreen;

    private void showStartupScreen() {
        if (startupScreen != null) {
            // A second launcher can arrive after this cover painted but before it fades.
            if (earliestStartupFadeAt >= 0) StartupActivity.finishBehindMain();
            return;
        }
        android.view.ViewGroup content = findViewById(android.R.id.content);
        if (content == null) return;
        Intent launch = getIntent();
        boolean fromLauncher = launch != null && launch.hasExtra(StartupArtworkView.EXTRA_INDEX);
        int index = fromLauncher
            ? launch.getIntExtra(StartupArtworkView.EXTRA_INDEX, 0) : StartupArtworkView.nextIndex(this);
        android.widget.FrameLayout artwork = StartupArtworkView.create(this, index);
        startupScreen = artwork;
        earliestStartupFadeAt = -1;
        entranceFinished = false;
        startupDrawn = false;
        awaitingStartupFrame = false;
        content.addView(artwork, new android.view.ViewGroup.LayoutParams(-1, -1));
        // Retire the launcher only after its replacement has actually painted.
        // Finishing a separate launcher task during the fade can reveal Home.
        artwork.getViewTreeObserver().addOnDrawListener(new android.view.ViewTreeObserver.OnDrawListener() {
            private boolean posted;
            @Override public void onDraw() {
                if (posted) return;
                posted = true;
                content.post(() -> {
                    artwork.getViewTreeObserver().removeOnDrawListener(this);
                    if (isDestroyed()) return;
                    StartupActivity.finishBehindMain();
                    if (startupScreen != artwork) return;
                    startupDrawn = true;
                    awaitReadableStartupFrame();
                });
            }
        });
        startupHandler.postDelayed(startupFailsafe, STARTUP_FAILSAFE_MS);
    }

    @Override public void onEnterAnimationComplete() {
        super.onEnterAnimationComplete();
        if (entranceFinished) return;
        entranceFinished = true;
        if (startupScreen != null) {
            if (earliestStartupFadeAt >= 0) startupHandler.removeCallbacks(dismissStartup);
            earliestStartupFadeAt = -1;
            awaitReadableStartupFrame();
        }
    }

    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) awaitReadableStartupFrame();
        else if (startupScreen != null && earliestStartupFadeAt >= 0) {
            startupHandler.removeCallbacks(dismissStartup);
            earliestStartupFadeAt = -1;
        }
    }

    private void awaitReadableStartupFrame() {
        android.view.View screen = startupScreen;
        if (!startupDrawn || screen == null || !screen.hasWindowFocus()
            || earliestStartupFadeAt >= 0 || awaitingStartupFrame) return;
        awaitingStartupFrame = true;
        Runnable startReading = () -> {
            if (screen != startupScreen) return;
            awaitingStartupFrame = false;
            if (!screen.hasWindowFocus()) return;
            earliestStartupFadeAt = android.os.SystemClock.uptimeMillis() + STARTUP_MIN_READING_MS;
            maybeDismissStartupScreen();
        };
        // OnDraw can precede the first foreground buffer by several frames during a cold launch.
        // Let the compositor receive the artwork before starting the user's reading time.
        if (android.os.Build.VERSION.SDK_INT >= 29 && screen.isHardwareAccelerated()) {
            screen.getViewTreeObserver().registerFrameCommitCallback(() -> screen.postOnAnimation(startReading));
            screen.invalidate();
        } else {
            screen.postOnAnimation(() -> screen.postOnAnimation(startReading));
        }
    }

    public void finishStartupScreen() {
        startupReady = true;
        maybeDismissStartupScreen();
    }

    private void maybeDismissStartupScreen() {
        if (startupScreen == null || !startupReady || earliestStartupFadeAt < 0) return;
        startupHandler.removeCallbacks(dismissStartup);
        if (android.os.SystemClock.uptimeMillis() < earliestStartupFadeAt) {
            startupHandler.postAtTime(dismissStartup, earliestStartupFadeAt);
        } else {
            removeStartupScreen();
        }
    }

    private void removeStartupScreen() {
        startupHandler.removeCallbacks(dismissStartup);
        startupHandler.removeCallbacks(startupFailsafe);
        android.widget.FrameLayout screen = startupScreen;
        startupScreen = null;
        if (screen == null) return;
        screen.animate().alpha(0).setDuration(STARTUP_FADE_MS).withEndAction(() -> {
            if (screen.getParent() instanceof android.view.ViewGroup) ((android.view.ViewGroup) screen.getParent()).removeView(screen);
            screen.removeAllViews();
        }).start();
    }

    @Override
    public void onDestroy() {
        startupHandler.removeCallbacksAndMessages(null);
        startupScreen = null;
        super.onDestroy();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        if (intent != null) setIntent(intent);
        super.onNewIntent(intent);
        // Capacitor also dispatches the initial Intent here during super.onCreate().
        if (initialStartupHandled && intent != null && intent.hasExtra(StartupArtworkView.EXTRA_INDEX)) {
            showStartupScreen();
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        EdgeToEdge.enable(this);
        registerPlugin(GoogleAuth.class);
        registerPlugin(ReaderSpeechPlugin.class);
        registerPlugin(PracticeHapticsPlugin.class);
        registerPlugin(StartupScreenPlugin.class);
        registerPlugin(AppSystemBarsPlugin.class);
        registerPlugin(ImageExportPlugin.class);
        registerPlugin(ExternalLinksPlugin.class);
        registerPlugin(ScreenWakeLockPlugin.class);
        registerPlugin(vn.quangtu.tutam.audio.DharmaAudioPlugin.class);
        registerPlugin(vn.quangtu.tutam.reminders.DurableRemindersPlugin.class);
        registerPlugin(vn.quangtu.tutam.widgets.BuddhistCalendarWidgetPlugin.class);
        registerPlugin(vn.quangtu.tutam.widgets.PracticeWidgetPlugin.class);
        super.onCreate(savedInstanceState);
        showStartupScreen();
        initialStartupHandled = true;
        HomeScreenShortcuts.publish(this);

        try {
            android.webkit.CookieManager cookieManager = android.webkit.CookieManager.getInstance();
            cookieManager.setAcceptCookie(true);
            if (getBridge() != null && getBridge().getWebView() != null) {
                cookieManager.setAcceptThirdPartyCookies(getBridge().getWebView(), true);
            }
        } catch (Exception ignored) {
        }

        try {
            boolean isDebug = (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;
            WebView.setWebContentsDebuggingEnabled(isDebug);
        } catch (Exception ignored) {
        }

        final com.getcapacitor.Bridge bridge = getBridge();
        if (bridge != null && bridge.getWebView() != null) {
            try {
                WebView webView = bridge.getWebView();
                // Một owner tính cả bàn phím, tránh vừa bị che input vừa cộng inset hai lần.
                ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
                    Insets insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars()
                        | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime());
                    android.view.ViewGroup.MarginLayoutParams margins =
                        (android.view.ViewGroup.MarginLayoutParams) view.getLayoutParams();
                    if (margins.leftMargin != insets.left || margins.topMargin != insets.top
                        || margins.rightMargin != insets.right || margins.bottomMargin != insets.bottom) {
                        margins.setMargins(insets.left, insets.top, insets.right, insets.bottom);
                        view.setLayoutParams(margins);
                    }
                    return WindowInsetsCompat.CONSUMED;
                });
                ViewCompat.requestApplyInsets(webView);
                webView.setBackgroundColor(android.graphics.Color.rgb(255, 250, 242));
                android.webkit.WebSettings settings = webView.getSettings();
                settings.setSupportZoom(false);
                settings.setMediaPlaybackRequiresUserGesture(false);
                settings.setDomStorageEnabled(true);
                settings.setDatabaseEnabled(true);
                boolean isDebug = (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;
                if (isDebug) {
                    webView.clearCache(true);
                    settings.setCacheMode(android.webkit.WebSettings.LOAD_NO_CACHE);
                } else {
                    settings.setCacheMode(android.webkit.WebSettings.LOAD_DEFAULT);
                }
                settings.setAllowFileAccess(true);
                settings.setAllowContentAccess(true);
                bridge.getWebView().setOverScrollMode(WebView.OVER_SCROLL_IF_CONTENT_SCROLLS);
            } catch (Exception ignored) {
            }
            bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (url != null && handleExternalScheme(url.toString())) {
                    return true;
                }
                return super.shouldOverrideUrlLoading(view, request);
            }

            @Deprecated
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url != null && handleExternalScheme(url)) {
                    return true;
                }
                return super.shouldOverrideUrlLoading(view, url);
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                // Chỉ bundle cục bộ; URL ngoài phải đi qua pipeline mạng của Capacitor.
                if (url != null && bridge.getHost().equalsIgnoreCase(url.getHost())
                    && bridge.getScheme().equalsIgnoreCase(url.getScheme())) {
                    // Capacitor 7 sở hữu phản hồi 206/Content-Range và stream tua nhạc.
                    if (request.getRequestHeaders().containsKey("Range") || request.getRequestHeaders().containsKey("range")) {
                        return super.shouldInterceptRequest(view, request);
                    }
                    String path = url.getPath();
                    if (path != null) {
                        if (path.startsWith("/assets/") || path.startsWith("/covers/") || path.startsWith("/offline-data/") || path.startsWith("/_app/") || path.startsWith("/images/") || path.startsWith("/vendor/") || path.equals("/offline-bundled-articles.json") || path.equals("/manifest.json")) {
                            try {
                                String cleanPath = path.startsWith("/") ? path.substring(1) : path;
                                String assetPath = "public/" + cleanPath;
                                InputStream is = getAssets().open(assetPath);
                                String mimeType = getMimeType(path);
                                String encoding = isTextMimeType(mimeType) ? "UTF-8" : null;
                                java.util.Map<String, String> responseHeaders = new java.util.HashMap<>();
                                responseHeaders.put("Access-Control-Allow-Origin", "*");
                                responseHeaders.put("Cache-Control", "max-age=31536000, immutable");
                                return new WebResourceResponse(mimeType, encoding, 200, "OK", responseHeaders, is);
                            } catch (Exception ignored) {
                            }
                        }
                    }
                }
                return super.shouldInterceptRequest(view, request);
            }

            private boolean isTextMimeType(String mimeType) {
                if (mimeType == null) return false;
                return mimeType.startsWith("text/")
                    || mimeType.equals("application/json")
                    || mimeType.equals("application/javascript")
                    || mimeType.equals("image/svg+xml");
            }

            private String getMimeType(String path) {
                String lower = path.toLowerCase();
                if (lower.endsWith(".mp4")) return "video/mp4";
                if (lower.endsWith(".mp3")) return "audio/mpeg";
                if (lower.endsWith(".m4a")) return "audio/mp4";
                if (lower.endsWith(".aac")) return "audio/aac";
                if (lower.endsWith(".json")) return "application/json";
                if (lower.endsWith(".png")) return "image/png";
                if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
                if (lower.endsWith(".webp")) return "image/webp";
                if (lower.endsWith(".svg")) return "image/svg+xml";
                if (lower.endsWith(".woff2")) return "font/woff2";
                if (lower.endsWith(".woff")) return "font/woff";
                if (lower.endsWith(".ttf")) return "font/ttf";
                if (lower.endsWith(".otf")) return "font/otf";
                if (lower.endsWith(".css")) return "text/css";
                if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "application/javascript";
                if (lower.endsWith(".map")) return "application/json";
                return "application/octet-stream";
            }

            private boolean handleExternalScheme(String rawUrl) {
                if (rawUrl == null) {
                    return false;
                }
                if (rawUrl.startsWith("intent://") || rawUrl.startsWith("fb-messenger://") || rawUrl.startsWith("fb://")) {
                    try {
                        Intent intent;
                        if (rawUrl.startsWith("intent://")) {
                            intent = Intent.parseUri(rawUrl, Intent.URI_INTENT_SCHEME);
                        } else {
                            intent = new Intent(Intent.ACTION_VIEW, Uri.parse(rawUrl));
                        }
                        if (intent != null) {
                            try {
                                startActivity(intent);
                                return true;
                            } catch (ActivityNotFoundException ignored) {
                                String fallbackUrl = intent.getStringExtra("browser_fallback_url");
                                if (fallbackUrl != null) {
                                    Intent fallbackIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(fallbackUrl));
                                    startActivity(fallbackIntent);
                                    return true;
                                }
                            }
                        }
                    } catch (Exception ignored) {
                        return false;
                    }
                }
                return false;
            }
        });
        }
    }

    @com.getcapacitor.annotation.CapacitorPlugin(name = "ScreenWakeLock")
    public static class ScreenWakeLockPlugin extends com.getcapacitor.Plugin {
        @com.getcapacitor.PluginMethod
        public void setKeepScreenOn(com.getcapacitor.PluginCall call) {
            final boolean enabled = call.getBoolean("enabled", false);
            getActivity().runOnUiThread(() -> {
                try {
                    android.view.Window window = getActivity().getWindow();
                    if (window != null) {
                        if (enabled) window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                        else window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    }
                    call.resolve();
                } catch (RuntimeException error) {
                    call.reject("Unable to update screen wake lock", error);
                }
            });
        }
    }
}
