package vn.quangtu.tutam.audio;

import android.app.ActivityManager;
import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Base64;
import androidx.core.content.ContextCompat;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;
import androidx.media3.common.PlaybackException;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;
import com.getcapacitor.JSObject;
import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.common.util.concurrent.ListenableFuture;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "DharmaAudio")
@androidx.annotation.OptIn(markerClass = androidx.media3.common.util.UnstableApi.class)
public class DharmaAudioPlugin extends Plugin {
    private final Handler main = new Handler(Looper.getMainLooper());
    private ListenableFuture<MediaController> connecting;
    private MediaController controller;
    private boolean destroyed;
    private boolean foreground = true;
    private boolean ticking;
    private PracticeSounds practiceSounds;
    private volatile int principalGeneration;
    private String widgetRefreshPrincipal;
    private final Runnable ticker = new Runnable() {
        @Override public void run() { ticking = false; if (shouldTick()) { publish(); updateTicker(); } }
    };
    private boolean shouldTick() {
        if (destroyed || !foreground || controller == null) return false;
        return controller.isPlaying();
    }
    private void updateTicker() {
        if (!shouldTick()) { main.removeCallbacks(ticker); ticking = false; }
        else if (!ticking) { ticking = true; main.postDelayed(ticker, 1000); }
    }
    private interface Operation { void run(MediaController c) throws Exception; }
    private void execute(PluginCall call, Operation operation) {
        execute(call, operation, false);
    }
    private void execute(PluginCall call, Operation operation, boolean includeAlbum) {
        final int selectedGeneration = principalGeneration;
        main.post(() -> {
            if (destroyed) { call.reject("Audio bridge is closed"); return; }
            if (selectedGeneration != principalGeneration) { call.reject("Audio principal changed"); return; }
            boolean initialize = connecting == null;
            if (initialize) {
                try {
                    SessionToken token = new SessionToken(getContext(), new ComponentName(getContext(), DharmaPlaybackService.class));
                    connecting = new MediaController.Builder(getContext(), token).setListener(new MediaController.Listener() {
                        @Override public void onDisconnected(MediaController disconnected) {
                            if (controller == disconnected && connecting != null) resetConnection(connecting);
                        }
                    }).buildAsync();
                } catch (RuntimeException error) { call.reject("Cannot connect native audio", error); return; }
            }
            final ListenableFuture<MediaController> connection = connecting;
            if (initialize) {
                connection.addListener(() -> {
                    try {
                        if (destroyed) return;
                        if (connecting != connection) return;
                        controller = connection.get();
                        controller.addListener(new Player.Listener() {
                            @Override public void onPlayWhenReadyChanged(boolean ready, int reason) {
                                if (destroyed || controller == null || practiceSounds == null) return;
                                if (ready || reason == Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_FOCUS_LOSS) {
                                    practiceSounds.suspend(!ready || controller.getPlaybackSuppressionReason() != Player.PLAYBACK_SUPPRESSION_REASON_NONE);
                                }
                            }
                            @Override public void onPlaybackSuppressionReasonChanged(int reason) {
                                if (destroyed || controller == null || practiceSounds == null) return;
                                if (reason != Player.PLAYBACK_SUPPRESSION_REASON_NONE || controller.getPlayWhenReady()) {
                                    practiceSounds.suspend(reason != Player.PLAYBACK_SUPPRESSION_REASON_NONE);
                                }
                            }
                            @Override public void onEvents(Player player, Player.Events events) { publish(); updateTicker(); }
                            @Override public void onPlayerError(PlaybackException error) { publish(); }
                        });
                        updateTicker();
                    } catch (Exception error) { resetConnection(connection); }
                }, ContextCompat.getMainExecutor(getContext()));
            }
            connection.addListener(() -> {
                MediaController connected;
                try { connected = connection.get(); }
                catch (Exception error) { resetConnection(connection); call.reject("Cannot connect native audio", error); return; }
                try {
                    if (destroyed) { call.reject("Audio bridge is closed"); return; }
                    if (selectedGeneration != principalGeneration) { call.reject("Audio principal changed"); return; }
                    if (connecting != connection) { call.reject("Native audio connection changed"); return; }
                    operation.run(connected);
                    call.resolve(state(includeAlbum));
                } catch (Exception e) { call.reject("Native audio: " + e.getMessage(), e); }
            }, ContextCompat.getMainExecutor(getContext()));
        });
    }

    private void resetConnection(ListenableFuture<MediaController> connection) {
        if (connecting != connection) return;
        connecting = null;
        controller = null;
        main.removeCallbacks(ticker);
        ticking = false;
        MediaController.releaseFuture(connection);
    }

    private JSObject state() { return state(false); }
    private JSObject state(boolean includeAlbum) {
        JSObject out = new JSObject();
        MediaController c = controller;
        if (c == null) return out;
        MediaItem item = c.getCurrentMediaItem();
        Bundle extras = item == null ? null : item.mediaMetadata.extras;
        out.put("queueId", extras == null ? "" : extras.getString("queueId", ""));
        out.put("trackIndex", c.getCurrentMediaItemIndex());
        out.put("position", c.getCurrentPosition() / 1000.0);
        out.put("observedAtMs", System.currentTimeMillis());
        out.put("duration", c.getDuration() == C.TIME_UNSET ? 0 : c.getDuration() / 1000.0);
        out.put("playing", c.isPlaying());
        out.put("playWhenReady", c.getPlayWhenReady());
        out.put("buffering", c.getPlaybackState() == Player.STATE_BUFFERING);
        out.put("ended", c.getPlaybackState() == Player.STATE_ENDED);
        out.put("speed", c.getPlaybackParameters().speed);
        out.put("repeat", c.getRepeatMode());
        out.put("volume", c.getVolume());
        PlaybackException error = c.getPlayerError();
        out.put("error", error == null ? "" : error.getMessage());
        DharmaPlaybackService service = DharmaPlaybackService.active;
        out.put("sleepRemainingMs", service == null ? 0 : service.getSleepRemainingMs());
        out.put("sleepAtEnd", service != null && service.getSleepAtEnd());
        if (includeAlbum && item != null && extras != null) {
            JSObject album = new JSObject();
            album.put("id", extras.getString("albumId", ""));
            album.put("title", String.valueOf(item.mediaMetadata.albumTitle));
            album.put("description", String.valueOf(item.mediaMetadata.artist));
            album.put("artwork", extras.getString("originalArtwork", ""));
            JSArray tracks = new JSArray();
            for (int i = 0; i < c.getMediaItemCount(); i++) {
                MediaItem track = c.getMediaItemAt(i);
                JSObject row = new JSObject(); row.put("url", track.mediaId); row.put("title", String.valueOf(track.mediaMetadata.title));
                tracks.put(row);
            }
            album.put("tracks", tracks);
            out.put("album", album);
        }
        return out;
    }
    private void publish() { if (!destroyed && controller != null) notifyListeners("state", state()); }

    @PluginMethod public void selectPrincipal(PluginCall call) {
        String key = call.getString("principalKey", "");
        if (key.isEmpty() || key.length() > 512) { call.reject("Invalid audio principal"); return; }
        main.post(() -> {
            if (destroyed) { call.reject("Audio bridge is closed"); return; }
            android.util.AtomicFile marker = new android.util.AtomicFile(new File(getContext().getNoBackupFilesDir(), "dharma-audio-principal-v1.txt"));
            String previous = "";
            try { previous = new String(marker.readFully(), StandardCharsets.UTF_8); } catch (Exception ignored) { }
            if (key.equals(previous)) {
                if (!key.equals(widgetRefreshPrincipal)) {
                    DharmaAudioWidgetProvider.updateAll(getContext());
                    widgetRefreshPrincipal = key;
                }
                call.resolve(); return;
            }
            // Chặn command cũ đang chờ kết nối trước khi chọn tài khoản/role mới.
            principalGeneration++;
            if (practiceSounds != null) practiceSounds.release();
            DharmaPlaybackService active = DharmaPlaybackService.active;
            if (active != null) active.clearForPrincipal();
            DharmaAudioWidgetStore.clear(getContext());
            DharmaAudioWidgetProvider.updateAll(getContext());
            FileOutputStream output = null;
            try {
                output = marker.startWrite(); output.write(key.getBytes(StandardCharsets.UTF_8)); marker.finishWrite(output);
                widgetRefreshPrincipal = key;
                call.resolve();
            } catch (Exception error) {
                if (output != null) marker.failWrite(output);
                call.reject("Cannot select audio principal", error);
            }
        });
    }

    @PluginMethod public void setQueue(PluginCall call) {
        execute(call, c -> {
            JSONArray rows = call.getArray("tracks");
            if (rows == null || rows.length() == 0 || rows.length() > 5000) throw new IllegalArgumentException("Invalid playlist");
            ArrayList<MediaItem> items = new ArrayList<>();
            String queueId = call.getString("queueId", "");
            String album = call.getString("album", "Pháp thoại");
            String artist = call.getString("artist", getContext().getString(vn.quangtu.tutam.R.string.app_name));
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.getJSONObject(i);
                String url = row.getString("url");
                File cached = cacheFile(url, false);
                Uri uri = !evictionMarker(cached).exists() && cached.isFile() && cached.length() > 0 ? Uri.fromFile(cached) : Uri.parse(url);
                String scheme = uri.getScheme();
                if (!"https".equals(scheme) && !"http".equals(scheme) && !"asset".equals(scheme) && !"file".equals(scheme)) throw new IllegalArgumentException("Unsupported audio source");
                Bundle extras = new Bundle(); extras.putString("queueId", queueId);
                extras.putString("albumId", call.getString("albumId", ""));
                extras.putString("originalArtwork", call.getString("originalArtwork", ""));
                MediaMetadata.Builder metadata = new MediaMetadata.Builder()
                    .setTitle(row.getString("title")).setAlbumTitle(album).setArtist(artist).setExtras(extras);
                String artwork = call.getString("artwork");
                if (artwork != null && !artwork.isEmpty()) metadata.setArtworkUri(Uri.parse(artwork));
                items.add(new MediaItem.Builder().setMediaId(url).setUri(uri).setMediaMetadata(metadata.build()).build());
            }
            int index = call.getInt("index", 0);
            if (index < 0 || index >= items.size()) throw new IllegalArgumentException("Invalid track index");
            c.setPlayWhenReady(false);
            c.setMediaItems(items, index, Math.max(0, Math.round(call.getDouble("position", 0.0) * 1000)));
            c.prepare();
        });
    }
    @PluginMethod public void play(PluginCall call) { execute(call, c -> {
        if (DharmaPlaybackService.active != null && DharmaPlaybackService.active.isRosaryPlayback() && c.getPlaybackState() == Player.STATE_ENDED) throw new IllegalStateException("Rosary session has completed");
        if (c.getPlaybackState() == Player.STATE_ENDED) c.seekTo(0);
        if (DharmaPlaybackService.active != null) DharmaPlaybackService.active.rewindRecoveredEndForPlay();
        if (c.getPlaybackState() == Player.STATE_IDLE) c.prepare();
        c.play();
    }); }
    @PluginMethod public void pause(PluginCall call) { execute(call, MediaController::pause); }
    @PluginMethod public void stop(PluginCall call) { execute(call, c -> { c.stop(); c.clearMediaItems(); if (DharmaPlaybackService.active != null) DharmaPlaybackService.active.setSleep(0, false); }); }
    @PluginMethod public void seek(PluginCall call) { execute(call, c -> {
        if (DharmaPlaybackService.active != null && DharmaPlaybackService.active.isRosaryPlayback()) throw new IllegalStateException("Rosary seeking is unavailable");
        c.seekTo(Math.max(0, Math.round(call.getDouble("position", 0.0) * 1000)));
    }); }
    @PluginMethod public void options(PluginCall call) {
        execute(call, c -> {
            if (DharmaPlaybackService.active != null && DharmaPlaybackService.active.isRosaryPlayback()) {
                if ((call.hasOption("speed") && call.getDouble("speed", 1.0) != 1.0)
                        || (call.hasOption("repeat") && call.getInt("repeat", 0) != 0)) throw new IllegalStateException("Rosary cadence is fixed for this session");
            }
            if (call.hasOption("speed")) c.setPlaybackSpeed((float) Math.max(.25, Math.min(3, call.getDouble("speed", 1.0))));
            if (call.hasOption("volume")) c.setVolume((float) Math.max(0, Math.min(1, call.getDouble("volume", 1.0))));
            if (call.hasOption("repeat")) c.setRepeatMode(call.getInt("repeat", 0));
        });
    }
    @PluginMethod public void sleep(PluginCall call) {
        execute(call, c -> {
            // JSON represents ordinary timer values as Integer, not Long.
            long remaining = Math.max(0, Math.round(call.getData().optDouble("remainingMs", 0)));
            if (DharmaPlaybackService.active != null) DharmaPlaybackService.active.setSleep(remaining, call.getBoolean("atEnd", false));
        });
    }
    @PluginMethod public void getState(PluginCall call) { execute(call, c -> {}); }
    @PluginMethod public void peek(PluginCall call) {
        main.post(() -> {
            if (DharmaPlaybackService.active == null) call.resolve(new JSObject());
            else execute(call, c -> {}, true);
        });
    }

    static Uri resolveCached(android.content.Context context, Uri original) {
        try { File cached = audioCacheFile(context, original.toString(), false); if (!evictionMarker(cached).exists() && cached.isFile() && cached.length() > 0) return Uri.fromFile(cached); }
        catch (Exception ignored) { }
        return original;
    }

    private File cacheFile(String key, boolean partial) throws Exception {
        return audioCacheFile(getContext(), key, partial);
    }
    private static File evictionMarker(File file) { return new File(file.getPath() + ".evict"); }
    private static void deleteCacheFile(File file) throws java.io.IOException {
        if (file.exists() && !file.delete()) throw new java.io.IOException("Cannot evict offline audio");
    }
    private static void finishCacheEviction(File marker, java.util.Set<String> retained) throws java.io.IOException {
        if (!marker.isFile()) return;
        File target = new File(marker.getPath().substring(0, marker.getPath().length() - ".evict".length()));
        if (retained.contains(target.getAbsolutePath())) return;
        deleteCacheFile(target);
        deleteCacheFile(new File(target.getPath().replaceFirst("\\.audio$", ".partial")));
        deleteCacheFile(marker);
    }
    static synchronized void flushCacheEvictions(android.content.Context context) {
        File[] markers = new File(context.getCacheDir(), "dharmatalks").listFiles((directory, name) -> name.matches("[a-f0-9]{64}\\.audio\\.evict"));
        if (markers == null) return;
        java.util.Set<String> retained = DharmaPlaybackService.active == null ? java.util.Collections.emptySet() : DharmaPlaybackService.active.cachedPaths();
        for (File marker : markers) {
            try { finishCacheEviction(marker, retained); }
            catch (java.io.IOException error) { android.util.Log.w("TuTapDharmaAudio", "Deferred audio eviction unavailable", error); }
        }
    }
    @PluginMethod public void evictCache(PluginCall call) {
        main.post(() -> {
            try {
                if (destroyed) throw new IllegalStateException("Audio bridge is closed");
                JSONArray keys = call.getArray("keys");
                if (keys == null || keys.length() > 5000) throw new IllegalArgumentException("Invalid audio cache keys");
                ArrayList<File> targets = new ArrayList<>();
                for (int i = 0; i < keys.length(); i++) {
                    String key = keys.getString(i);
                    if (key.isEmpty() || key.length() > 8192) throw new IllegalArgumentException("Invalid audio cache key");
                    targets.add(cacheFile(key, false));
                }
                synchronized (DharmaAudioPlugin.class) {
                    java.util.Set<String> retained = DharmaPlaybackService.active == null ? java.util.Collections.emptySet() : DharmaPlaybackService.active.cachedPaths();
                    for (File target : targets) {
                        File marker = evictionMarker(target);
                        if (!marker.exists() && !marker.createNewFile()) throw new java.io.IOException("Cannot mark audio eviction");
                        finishCacheEviction(marker, retained);
                    }
                }
                call.resolve();
            } catch (Exception error) { call.reject("Cannot evict offline audio", error); }
        });
    }
    private static File audioCacheFile(android.content.Context context, String key, boolean partial) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(key.getBytes(StandardCharsets.UTF_8));
        StringBuilder name = new StringBuilder(); for (byte b : digest) name.append(String.format("%02x", b));
        File directory = new File(context.getCacheDir(), "dharmatalks"); directory.mkdirs();
        return new File(directory, name + (partial ? ".partial" : ".audio"));
    }
    @PluginMethod public void cacheStatus(PluginCall call) {
        try { File file = cacheFile(call.getString("key", ""), false); JSObject out = new JSObject(); out.put("bytes", !evictionMarker(file).exists() && file.isFile() ? file.length() : 0); call.resolve(out); }
        catch (Exception e) { call.reject("Cannot inspect audio cache", e); }
    }
    @PluginMethod public void cacheChunk(PluginCall call) {
        synchronized (DharmaAudioPlugin.class) {
        try {
            String key = call.getString("key", "");
            int offset = call.getInt("offset", -1);
            String data = call.getString("data", "");
            if (key.isEmpty() || data.length() > 800000 || offset < 0) throw new IllegalArgumentException("Invalid audio chunk");
            File partial = cacheFile(key, true);
            if (offset != 0 && partial.length() != offset) throw new IllegalArgumentException("Audio cache offset mismatch");
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            if (offset == 0) deleteCacheFile(evictionMarker(cacheFile(key, false)));
            try (FileOutputStream out = new FileOutputStream(partial, offset != 0)) { out.write(bytes); }
            if (call.getBoolean("last", false)) {
                File target = cacheFile(key, false);
                // Cùng thư mục/filesystem: rename thay thế nguyên tử và giữ file cũ nếu thất bại (API 21+).
                android.system.Os.rename(partial.getAbsolutePath(), target.getAbsolutePath());
            }
            call.resolve();
        } catch (Exception e) { call.reject("Cannot cache offline audio", e); }
        }
    }
    @PluginMethod public void backgroundStatus(PluginCall call) {
        ActivityManager activity = (ActivityManager) getContext().getSystemService(android.content.Context.ACTIVITY_SERVICE);
        PowerManager power = (PowerManager) getContext().getSystemService(android.content.Context.POWER_SERVICE);
        JSObject out = new JSObject();
        out.put("restricted", Build.VERSION.SDK_INT >= 28 && activity != null && activity.isBackgroundRestricted());
        out.put("batteryOptimized", power != null && !power.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        call.resolve(out);
    }
    @PluginMethod public void openBackgroundSettings(PluginCall call) {
        main.post(() -> {
            Activity activity = getActivity();
            if (destroyed || activity == null || activity.isFinishing() || activity.isDestroyed()) { call.reject("Application activity is unavailable"); return; }
            try { activity.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()))); call.resolve(); }
            catch (Exception e) { call.reject("Cannot open application settings", e); }
        });
    }
    @PluginMethod public void practiceSound(PluginCall call) {
        final int selectedGeneration = principalGeneration;
        main.post(() -> {
            try {
                if (destroyed) throw new IllegalStateException("Audio bridge is closed");
                if (selectedGeneration != principalGeneration) throw new IllegalStateException("Audio principal changed");
                if (practiceSounds == null) practiceSounds = new PracticeSounds(getContext(), main);
                String channel = call.getString("channel", "");
                if (call.getBoolean("stop", false)) practiceSounds.stop(channel);
                else if (channel.equals("ambient")) {
                    float volume = (float) Math.max(0, Math.min(1, call.getDouble("volume", 0.5)));
                    if (call.getString("source") == null) practiceSounds.volume(volume);
                    else practiceSounds.ambient(call.getString("source", ""), volume);
                }
                else if (channel.equals("cue")) practiceSounds.cue(call.getString("cue", ""),
                    Math.max(0, Math.min(5000, call.getInt("delayMs", 0))));
                else throw new IllegalArgumentException("Invalid sound channel");
                call.resolve();
            } catch (Exception error) { call.reject("Cannot play practice sound", error); }
        });
    }

    @Override protected void handleOnPause() {
        foreground = false;
        updateTicker();
        super.handleOnPause();
    }
    @Override protected void handleOnResume() {
        foreground = true;
        publish();
        updateTicker();
        super.handleOnResume();
    }
    @Override protected void handleOnDestroy() {
        destroyed = true;
        if (practiceSounds != null) practiceSounds.release();
        main.removeCallbacksAndMessages(null);
        ListenableFuture<MediaController> connection = connecting;
        connecting = null;
        controller = null;
        if (connection != null) MediaController.releaseFuture(connection);
        // Releasing the UI controller deliberately leaves the playback service running.
        super.handleOnDestroy();
    }
}
