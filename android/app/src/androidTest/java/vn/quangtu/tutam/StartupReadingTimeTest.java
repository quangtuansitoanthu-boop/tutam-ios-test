package vn.quangtu.tutam;

import static org.junit.Assert.assertTrue;

import android.content.Intent;
import android.os.SystemClock;
import android.view.View;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.runner.lifecycle.ActivityLifecycleCallback;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitor;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import java.util.ArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class StartupReadingTimeTest {
    @Test public void coldLauncherIntentKeepsTitleOpaqueWhenHomeIsReadyImmediately() throws Exception {
        var instrumentation = InstrumentationRegistry.getInstrumentation();
        ActivityLifecycleMonitor lifecycle = ActivityLifecycleMonitorRegistry.getInstance();
        AtomicLong firstDraw = new AtomicLong(-1);
        AtomicLong firstFade = new AtomicLong(-1);
        CountDownLatch faded = new CountDownLatch(1);
        ActivityLifecycleCallback observe = (activity, stage) -> {
            if (!(activity instanceof MainActivity) || stage != Stage.CREATED) return;
            View content = activity.findViewById(android.R.id.content);
            ArrayList<View> titles = new ArrayList<>();
            content.findViewsWithText(titles, "Dành cho cư sĩ tại gia", View.FIND_VIEWS_WITH_CONTENT_DESCRIPTION);
            if (titles.isEmpty()) return;
            View cover = (View) titles.get(0).getParent();
            content.getViewTreeObserver().addOnDrawListener(() -> {
                long now = SystemClock.uptimeMillis();
                if (cover.isAttachedToWindow() && cover.getAlpha() == 1f) firstDraw.compareAndSet(-1, now);
                else if (firstDraw.get() >= 0 && firstFade.compareAndSet(-1, now)) faded.countDown();
            });
            ((MainActivity) activity).finishStartupScreen();
        };
        // StartupActivity passes this extra. Capacitor redelivers this same intent inside onCreate.
        Intent launch = new Intent(instrumentation.getTargetContext(), MainActivity.class)
            .putExtra(StartupArtworkView.EXTRA_INDEX, 0)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        instrumentation.runOnMainSync(() -> lifecycle.addLifecycleCallback(observe));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(launch)) {
            assertTrue("The native artwork must fade into Home", faded.await(20, TimeUnit.SECONDS));
            long opaque = firstFade.get() - firstDraw.get();
            assertTrue("Native title was opaque for only " + opaque + " ms", opaque >= 3000);
        } finally {
            instrumentation.runOnMainSync(() -> lifecycle.removeLifecycleCallback(observe));
        }
    }
}
