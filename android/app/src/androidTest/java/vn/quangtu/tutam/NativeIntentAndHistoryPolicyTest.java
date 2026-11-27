package vn.quangtu.tutam;

import static org.junit.Assert.*;

import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Policy checks only: never starts an Activity or accesses an account. */
@RunWith(AndroidJUnit4.class)
public class NativeIntentAndHistoryPolicyTest {
    private static final String APP = "vn.quangtu.tutam";

    @Test public void externalIntentsCannotCarryExplicitInternalTargetsOrSelectors() {
        Intent unsafe = new Intent(Intent.ACTION_SEND, Uri.parse("fb://page/1"));
        unsafe.setComponent(new ComponentName(APP, APP + ".StartupActivity"));
        unsafe.setSelector(new Intent(Intent.ACTION_MAIN).setComponent(new ComponentName(APP, APP + ".MainActivity")));
        unsafe.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent sanitized = MainActivity.sanitizeExternalIntent(unsafe, APP, APP);
        assertSame(unsafe, sanitized);
        assertNull(sanitized.getComponent());
        assertNull(sanitized.getSelector());
        assertEquals(Intent.ACTION_VIEW, sanitized.getAction());
        assertTrue(sanitized.hasCategory(Intent.CATEGORY_BROWSABLE));
        assertEquals(0, sanitized.getFlags());
    }

    @Test public void ownPackageRequiresTheAppDeepLinkScheme() {
        assertNull(MainActivity.sanitizeExternalIntent(new Intent(Intent.ACTION_VIEW,
            Uri.parse("fb://page/1")).setPackage(APP), APP, APP));
        assertNotNull(MainActivity.sanitizeExternalIntent(new Intent(Intent.ACTION_VIEW,
            Uri.parse(APP + "://tu-tap?action=rosary")).setPackage(APP), APP, APP));
    }

    @Test public void fallbackRequiresAWebSchemeAndNonemptyHost() {
        for (String value : new String[]{"javascript:alert(1)", "file:///private/file", "intent://page", "https:///path", "https://", "https://user:pass@example.com/"}) {
            assertNull(value, MainActivity.browserFallbackUri(value));
        }
        assertEquals("https://example.com/path", MainActivity.browserFallbackUri("https://example.com/path").toString());
        assertEquals("http://example.com/path", MainActivity.browserFallbackUri("http://example.com/path").toString());
    }

    @Test public void shortHistoryKeysKeepTheirLegacyFileNames() {
        String key = "tutam:user:legacy:divination:v1";
        String encoded = Base64.encodeToString(key.getBytes(StandardCharsets.UTF_8), Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
        assertEquals("divination-" + encoded + ".json", DivinationHistoryPlugin.historyFileName(key));
    }

    @Test public void longUnicodeHistoryKeysHaveStableDistinctBoundedNames() {
        char[] letters = new char[160];
        java.util.Arrays.fill(letters, 'ệ');
        String key = new String(letters);
        String name = DivinationHistoryPlugin.historyFileName(key);
        assertTrue(name.getBytes(StandardCharsets.UTF_8).length + ".bak".length() <= 255);
        assertEquals(name, DivinationHistoryPlugin.historyFileName(key));
        assertNotEquals(name, DivinationHistoryPlugin.historyFileName(key.substring(1) + "ế"));
    }

    @Test public void mergedStartupActivityDeclaresEveryRequiredConfigurationChange() throws Exception {
        android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        android.content.pm.ActivityInfo info = context.getPackageManager().getActivityInfo(
            new ComponentName(context, StartupActivity.class), 0);
        int expected = android.content.pm.ActivityInfo.CONFIG_ORIENTATION | android.content.pm.ActivityInfo.CONFIG_KEYBOARD_HIDDEN
            | android.content.pm.ActivityInfo.CONFIG_KEYBOARD | android.content.pm.ActivityInfo.CONFIG_SCREEN_SIZE
            | android.content.pm.ActivityInfo.CONFIG_LOCALE | android.content.pm.ActivityInfo.CONFIG_SMALLEST_SCREEN_SIZE
            | android.content.pm.ActivityInfo.CONFIG_SCREEN_LAYOUT | android.content.pm.ActivityInfo.CONFIG_UI_MODE
            | android.content.pm.ActivityInfo.CONFIG_NAVIGATION;
        assertEquals(expected, info.configChanges & expected);
    }

    @Test public void startupInsetsReachArtworkBeforeWebViewConsumptionWithoutAccumulatingMargins() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
            android.widget.FrameLayout artwork = StartupArtworkView.create(context, 0);
            android.view.View loading = null;
            for (int i = 0; i < artwork.getChildCount(); i++) {
                if (artwork.getChildAt(i) instanceof android.widget.LinearLayout) loading = artwork.getChildAt(i);
            }
            assertNotNull(loading);
            int base = loading.getPaddingBottom();
            try {
                MainActivity activity = new MainActivity();
                field("startupScreen").set(activity, artwork);
                android.view.View webViewSurface = new android.view.View(context);
                webViewSurface.setLayoutParams(new android.widget.FrameLayout.LayoutParams(-1, -1));
                java.lang.reflect.Method listener = null;
                // Invoke the actual insets callback without booting a WebView or adding a production test seam.
                // Discover its unique signature rather than depending on the compiler's generated lambda name.
                for (java.lang.reflect.Method method : MainActivity.class.getDeclaredMethods()) {
                    if (method.isSynthetic() && method.getReturnType() == androidx.core.view.WindowInsetsCompat.class
                        && java.util.Arrays.equals(method.getParameterTypes(), new Class<?>[]{android.view.View.class, androidx.core.view.WindowInsetsCompat.class})) {
                        assertNull("Expected one inset owner", listener); listener = method;
                    }
                }
                assertNotNull(listener); listener.setAccessible(true);
                for (int bottom : new int[]{72, 24, 0}) {
                    androidx.core.view.WindowInsetsCompat insets = new androidx.core.view.WindowInsetsCompat.Builder()
                        .setInsets(androidx.core.view.WindowInsetsCompat.Type.navigationBars(), androidx.core.graphics.Insets.of(8, 0, 12, bottom))
                        .setInsets(androidx.core.view.WindowInsetsCompat.Type.statusBars(), androidx.core.graphics.Insets.of(0, 32, 0, 0))
                        .setVisible(androidx.core.view.WindowInsetsCompat.Type.systemBars(), true).build();
                    assertSame(androidx.core.view.WindowInsetsCompat.CONSUMED, listener.invoke(activity, webViewSurface, insets));
                    assertEquals(base + bottom, loading.getPaddingBottom());
                    android.view.ViewGroup.MarginLayoutParams margins = (android.view.ViewGroup.MarginLayoutParams) webViewSurface.getLayoutParams();
                    assertEquals(8, margins.leftMargin); assertEquals(32, margins.topMargin);
                    assertEquals(12, margins.rightMargin); assertEquals(bottom, margins.bottomMargin);
                }
            } catch (Exception error) { throw new AssertionError(error); }
        });
    }

    @Test public void practiceArtworkReusesFourLiveNinetySixPixelBitmapsAcrossRequests() throws Exception {
        android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        java.lang.reflect.Method artwork = vn.quangtu.tutam.widgets.PracticeWidgetProvider.class
            .getDeclaredMethod("artwork", android.content.Context.class, int.class);
        artwork.setAccessible(true);
        android.graphics.Bitmap[] first = new android.graphics.Bitmap[4];
        for (int round = 0; round < 3; round++) for (int index = 0; index < first.length; index++) {
            android.graphics.Bitmap bitmap = (android.graphics.Bitmap) artwork.invoke(null, context, index);
            assertNotNull(bitmap);
            assertFalse(bitmap.isRecycled());
            assertEquals(96, bitmap.getWidth());
            assertEquals(96, bitmap.getHeight());
            if (round == 0) first[index] = bitmap;
            else assertSame("Widget sizes and instances must share their cached artwork", first[index], bitmap);
        }
        for (int index = 1; index < first.length; index++) assertNotSame(first[0], first[index]);
    }

    @Test public void nullWidgetBroadcastsReturnBeforeAnyContextAccess() {
        android.content.Context trap = new android.content.ContextWrapper(null) {
            @Override public android.content.Context getApplicationContext() { throw new AssertionError("Unexpected widget work"); }
            @Override public Object getSystemService(String name) { throw new AssertionError("Unexpected service lookup"); }
            @Override public String getPackageName() { throw new AssertionError("Unexpected package lookup"); }
        };
        new vn.quangtu.tutam.widgets.BuddhistCalendarWidgetProvider().onReceive(trap, null);
        new vn.quangtu.tutam.widgets.PracticeWidgetProvider().onReceive(trap, null);
        new vn.quangtu.tutam.audio.DharmaAudioWidgetProvider().onReceive(trap, null);
    }

    private Field field(String name) throws Exception {
        Field field = MainActivity.class.getDeclaredField(name);
        field.setAccessible(true);
        return field;
    }

    @Test public void startupFailsafeDetachesWithoutFocusOrReadableFrame() {
        var instrumentation = InstrumentationRegistry.getInstrumentation();
        instrumentation.runOnMainSync(() -> {
            try {
                MainActivity activity = new MainActivity();
                android.widget.FrameLayout parent = new android.widget.FrameLayout(instrumentation.getTargetContext());
                android.widget.FrameLayout cover = new android.widget.FrameLayout(instrumentation.getTargetContext());
                parent.addView(cover);
                field("startupScreen").set(activity, cover);
                assertEquals(-1L, field("earliestStartupFadeAt").getLong(activity));
                assertFalse(cover.hasWindowFocus());
                ((Runnable) field("startupFailsafe").get(activity)).run();
                assertNull(field("startupScreen").get(activity));
                assertEquals(0, parent.getChildCount());
            } catch (Exception error) { throw new AssertionError(error); }
        });
    }

    @Test public void readyWarmLauncherDoesNotCreateAnotherStartupCover() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            try {
                MainActivity activity = new MainActivity();
                field("startupReady").setBoolean(activity, true);
                field("initialStartupHandled").setBoolean(activity, true);
                Intent warm = new Intent(Intent.ACTION_MAIN).putExtra(StartupArtworkView.EXTRA_INDEX, 1);
                activity.onNewIntent(warm);
                assertSame(warm, activity.getIntent());
                assertNull(field("startupScreen").get(activity));
            } catch (Exception error) { throw new AssertionError(error); }
        });
    }

    private static final class RecordedCall extends PluginCall {
        boolean resolved;
        String rejection;
        String value;
        RecordedCall(JSObject data) { super(null, "audit", "audit", "audit", data); }
        @Override public void resolve() { resolved = true; }
        @Override public void resolve(JSObject data) { resolved = true; value = data.optString("value"); }
        @Override public void reject(String message, String code, Exception error, JSObject data) { rejection = message; }
    }

    @Test public void readableLongLegacyHistorySurvivesTheNewAtomicFileName() throws Exception {
        android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        java.io.File directory = new java.io.File(context.getCacheDir(), "native-history-audit-" + java.util.UUID.randomUUID());
        assertTrue(directory.mkdir());
        android.content.Context isolated = new android.content.ContextWrapper(context) {
            @Override public java.io.File getNoBackupFilesDir() { return directory; }
        };
        DivinationHistoryPlugin plugin = new DivinationHistoryPlugin() {
            @Override public android.content.Context getContext() { return isolated; }
        };
        char[] letters = new char[59];
        java.util.Arrays.fill(letters, 'ệ');
        String key = new String(letters);
        String encoded = Base64.encodeToString(key.getBytes(StandardCharsets.UTF_8), Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
        java.io.File legacy = new java.io.File(directory, "divination-" + encoded + ".json");
        assertEquals(252, legacy.getName().length());
        try {
            try (java.io.FileOutputStream output = new java.io.FileOutputStream(legacy)) {
                output.write("[\"legacy\"]".getBytes(StandardCharsets.UTF_8));
            }
            RecordedCall readLegacy = new RecordedCall(new JSObject().put("key", key));
            plugin.read(readLegacy);
            assertEquals("[\"legacy\"]", readLegacy.value);
            RecordedCall write = new RecordedCall(new JSObject().put("key", key).put("value", "[\"updated\"]"));
            plugin.write(write);
            assertTrue(write.resolved);
            assertTrue(legacy.exists());
            RecordedCall readUpdated = new RecordedCall(new JSObject().put("key", key));
            plugin.read(readUpdated);
            assertEquals("[\"updated\"]", readUpdated.value);
        } finally {
            java.io.File[] files = directory.listFiles();
            if (files != null) for (java.io.File file : files) file.delete();
            directory.delete();
        }
    }

    @Test public void detachedUiPluginsFinishCallsWithoutDereferencingAnActivity() {
        RecordedCall haptic = new RecordedCall(new JSObject());
        new PracticeHapticsPlugin().rosaryBead(haptic);
        assertTrue(haptic.resolved);
        RecordedCall startup = new RecordedCall(new JSObject());
        new StartupScreenPlugin().ready(startup);
        assertTrue(startup.resolved);
        RecordedCall browser = new RecordedCall(new JSObject().put("url", "https://example.com/"));
        new ExternalLinksPlugin().openBrowser(browser);
        assertEquals("Activity unavailable", browser.rejection);
        RecordedCall export = new RecordedCall(new JSObject().put("fileName", "audit.png").put("base64", "iVBORw0KGgo="));
        new ImageExportPlugin().shareImage(export);
        assertEquals("Activity unavailable", export.rejection);
        RecordedCall bars = new RecordedCall(new JSObject());
        new AppSystemBarsPlugin().setFullscreen(bars);
        assertEquals("Activity unavailable", bars.rejection);
        RecordedCall reader = new RecordedCall(new JSObject());
        new ReaderSpeechPlugin().openSettings(reader);
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();
        assertEquals("Cannot open speech settings", reader.rejection);
    }
}
