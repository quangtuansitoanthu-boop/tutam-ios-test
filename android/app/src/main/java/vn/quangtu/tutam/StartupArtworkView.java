package vn.quangtu.tutam;

import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.view.animation.LinearInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import java.io.InputStream;
import java.util.Locale;

/** Shared native startup identity; all artwork is bundled for offline use. */
public final class StartupArtworkView {
    public static final String EXTRA_INDEX = "tutam.startupArtworkIndex";
    private static final int ARTWORK_COUNT = 10;
    private static final String PREFERENCES = "startup-artwork";
    private static final String LOCALE = "locale";
    private final Context context;
    private ImageView title;
    private TextView loadingLabel;
    private String locale;

    private StartupArtworkView(Context context) {
        this.context = context;
    }

    public static int nextIndex(Context context) {
        SharedPreferences preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
        int previous = -1;
        try {
            previous = preferences.getInt("last-index", -1);
        } catch (ClassCastException ignored) {
            // An invalid saved index starts a new cycle.
        }
        int index = previous >= 0 && previous < ARTWORK_COUNT ? (previous + 1) % ARTWORK_COUNT : 0;
        preferences.edit().putInt("last-index", index).apply();
        return index;
    }

    public static FrameLayout create(Context context, int index) {
        return new StartupArtworkView(context).createView(Math.floorMod(index, ARTWORK_COUNT));
    }

    static void rememberLocale(Context context, String locale) {
        SharedPreferences preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
        if (!locale.equals(preferences.getString(LOCALE, null))) {
            preferences.edit().putString(LOCALE, locale).apply();
        }
    }

    static boolean updateLocale(FrameLayout screen, String locale) {
        if (screen == null || !(screen.getTag() instanceof StartupArtworkView)) return false;
        StartupArtworkView artwork = (StartupArtworkView) screen.getTag();
        if (locale.equals(artwork.locale)) return false;
        artwork.showLocale(locale);
        return true;
    }

    private int dp(int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }

    private Bitmap decodeAssetBitmap(String path) {
        try (InputStream stream = context.getAssets().open("public/" + path)) {
            return BitmapFactory.decodeStream(stream);
        } catch (Exception ignored) {
            return null;
        }
    }

    private FrameLayout createView(int index) {
        FrameLayout screen = new FrameLayout(context);
        screen.setBackgroundColor(Color.rgb(246, 239, 224));
        screen.setClickable(true);

        String path = String.format(Locale.ROOT, "images/calendar/cu-si/%02d.webp", index + 1);
        Bitmap artworkBitmap = decodeAssetBitmap(path);

        if (artworkBitmap != null) {
            ImageView blurredBackdrop = new ImageView(context);
            blurredBackdrop.setScaleType(ImageView.ScaleType.CENTER_CROP);
            screen.addView(blurredBackdrop, new FrameLayout.LayoutParams(-1, -1));
            ImageView artwork = new ImageView(context);
            artwork.setImageBitmap(artworkBitmap);
            screen.addView(artwork, new FrameLayout.LayoutParams(-1, -1));

            title = new ImageView(context);
            screen.addView(title, new FrameLayout.LayoutParams(-1, -1));

            screen.addOnLayoutChangeListener((v, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> {
                int width = right - left;
                int height = bottom - top;
                // Match app.html on tablets, landscape and unusually tall phones.
                boolean contain = width * 5 >= height * 3 || width * 20 <= height * 9;
                ImageView.ScaleType fit = contain ? ImageView.ScaleType.FIT_CENTER : ImageView.ScaleType.CENTER_CROP;
                artwork.setScaleType(fit);
                title.setScaleType(fit);
                if (contain && blurredBackdrop.getDrawable() == null) {
                    blurredBackdrop.setImageBitmap(Bitmap.createScaledBitmap(artworkBitmap, 28, 50, true));
                }
                blurredBackdrop.setVisibility(contain ? View.VISIBLE : View.GONE);
            });
        }

        View bottomScrim = new View(context);
        bottomScrim.setBackground(new GradientDrawable(
            GradientDrawable.Orientation.BOTTOM_TOP,
            new int[] { Color.argb(150, 24, 17, 10), Color.argb(68, 24, 17, 10), Color.argb(0, 24, 17, 10) }
        ));
        FrameLayout.LayoutParams scrimParams = new FrameLayout.LayoutParams(-1, dp(104), Gravity.BOTTOM);
        screen.addView(bottomScrim, scrimParams);

        LinearLayout loadingRow = new LinearLayout(context);
        loadingRow.setOrientation(LinearLayout.HORIZONTAL);
        loadingRow.setGravity(Gravity.CENTER_VERTICAL);
        loadingRow.setPadding(dp(18), dp(8), dp(18), dp(22));

        SpinnerRingView spinner = new SpinnerRingView(context, dp(15));
        loadingRow.addView(spinner, new LinearLayout.LayoutParams(dp(15), dp(15)));

        loadingLabel = new TextView(context);
        loadingLabel.setVisibility(View.GONE);
        loadingLabel.setTextSize(12.5f);
        loadingLabel.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        loadingLabel.setLetterSpacing(0.015f);
        loadingLabel.setTextColor(Color.rgb(255, 248, 234));
        loadingLabel.setShadowLayer(dp(4), 0f, dp(1), Color.argb(166, 18, 11, 4));
        LinearLayout.LayoutParams labelParams = new LinearLayout.LayoutParams(-2, -2);
        labelParams.leftMargin = dp(8);
        loadingRow.addView(loadingLabel, labelParams);

        FrameLayout.LayoutParams loadingParams = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        screen.addView(loadingRow, loadingParams);

        ViewCompat.setOnApplyWindowInsetsListener(screen, (view, windowInsets) -> {
            Insets insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            int baseBottom = dp(22);
            loadingRow.setPadding(dp(18), dp(8), dp(18), baseBottom + insets.bottom);
            scrimParams.height = dp(104) + insets.bottom;
            bottomScrim.setLayoutParams(scrimParams);
            return windowInsets;
        });

        screen.setTag(this);
        String savedLocale = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).getString(LOCALE, null);
        // Older installations have only the WebView preference. Wait for its locale before painting text.
        if ("en".equals(savedLocale) || "vi".equals(savedLocale)) showLocale(savedLocale);
        return screen;
    }

    private void showLocale(String locale) {
        this.locale = locale;
        boolean english = "en".equals(locale);
        if (title != null) {
            title.setImageBitmap(decodeAssetBitmap(english ? "images/calendar/cu-si-title-en.webp" : "images/calendar/cu-si-title.webp"));
            title.setContentDescription(english ? "Buddhist Practice App. For lay practitioners." : "Ứng dụng Tu tập Phật pháp. Dành cho cư sĩ tại gia.");
        }
        loadingLabel.setText(english ? "Loading app..." : "Đang tải ứng dụng...");
        loadingLabel.setVisibility(View.VISIBLE);
    }

    private static final class SpinnerRingView extends View {
        private final Paint trackPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint arcPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF arcBounds = new RectF();
        private ObjectAnimator animator;

        SpinnerRingView(Context context, int sizePx) {
            super(context);
            float stroke = Math.max(2f, sizePx * 0.14f);
            trackPaint.setStyle(Paint.Style.STROKE);
            trackPaint.setStrokeWidth(stroke);
            trackPaint.setColor(Color.argb(78, 255, 245, 222));

            arcPaint.setStyle(Paint.Style.STROKE);
            arcPaint.setStrokeWidth(stroke);
            arcPaint.setStrokeCap(Paint.Cap.ROUND);
            arcPaint.setColor(Color.rgb(245, 206, 122));
        }

        @Override
        protected void onSizeChanged(int w, int h, int oldw, int oldh) {
            float halfStroke = arcPaint.getStrokeWidth() / 2f;
            arcBounds.set(halfStroke, halfStroke, w - halfStroke, h - halfStroke);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            canvas.drawOval(arcBounds, trackPaint);
            canvas.drawArc(arcBounds, -90f, 210f, false, arcPaint);
        }

        @Override
        protected void onAttachedToWindow() {
            super.onAttachedToWindow();
            if (android.os.Build.VERSION.SDK_INT < 26 || ValueAnimator.areAnimatorsEnabled()) {
                animator = ObjectAnimator.ofFloat(this, View.ROTATION, 0f, 360f);
                animator.setDuration(900);
                animator.setRepeatCount(ValueAnimator.INFINITE);
                animator.setInterpolator(new LinearInterpolator());
                animator.start();
            }
        }

        @Override
        protected void onDetachedFromWindow() {
            if (animator != null) {
                animator.cancel();
                animator = null;
            }
            super.onDetachedFromWindow();
        }
    }
}
