import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ platform: 'ios', available: true }));
vi.mock('$lib/browser/native-platform', () => ({ isNativeApp: () => native.platform !== 'web', nativePlatform: () => native.platform }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isPluginAvailable: () => native.available }, registerPlugin: (name: string) => ({ name }) }));
vi.mock('$lib/browser/native-api', () => ({ resolveApiUrl: (url: string) => url }));
import { hasNativeTalkAudio, nativeTalkUrl } from '$lib/browser/native-talk-audio';
import { getNativeReaderSpeech } from '$lib/browser/native-reader-speech';
afterEach(() => { native.platform = 'ios'; native.available = true; vi.unstubAllGlobals(); });
it.each(['ios', 'android'])('uses the registered native playback and speech bridge on %s', platform => {
  native.platform = platform;
  expect(hasNativeTalkAudio()).toBe(true);
  expect(getNativeReaderSpeech()).not.toBeNull();
});
it('keeps web fallback and does not call a missing iOS plugin', () => {
  native.platform = 'web';
  expect(hasNativeTalkAudio()).toBe(false);
  expect(getNativeReaderSpeech()).toBeNull();
  native.platform = 'ios'; native.available = false;
  expect(hasNativeTalkAudio()).toBe(false);
  expect(getNativeReaderSpeech()).toBeNull();
});
it('maps iOS bundled audio to a local asset and preserves remote and Android URLs', () => {
  vi.stubGlobal('document', { baseURI: 'capacitor://localhost/' });
  expect(nativeTalkUrl('/assets/audio/nhac-thien-01.m4a')).toBe('asset:///public/assets/audio/nhac-thien-01.m4a');
  expect(nativeTalkUrl('https://localhost/assets/audio/nhac-thien-01.m4a')).toBe('asset:///public/assets/audio/nhac-thien-01.m4a');
  expect(nativeTalkUrl('https://media.quangtu.vn/talk.mp3')).toBe('https://media.quangtu.vn/talk.mp3');
});

it('disables video decoding in the Android audio service before restoring a queue', () => {
  const source = readFileSync('android/app/src/main/java/vn/quangtu/tutam/audio/DharmaPlaybackService.java', 'utf8');
  const beforeRestore = source.split('DharmaAudioWidgetStore.restore(this, player);')[0];
  expect(beforeRestore).toMatch(/player\.setTrackSelectionParameters\(player\.getTrackSelectionParameters\(\)\.buildUpon\(\)\s*\.setTrackTypeDisabled\(C\.TRACK_TYPE_VIDEO, true\)\.build\(\)\)/);
});

it('reloads a failed iOS audio item at its retained position before attempting playback again', () => {
  const source = readFileSync('ios/App/App/DharmaAudioPlugin.swift', 'utf8');
  const playback = source.split('private func startPlayback() throws {')[1]?.split('private func pausePlayback()')[0] ?? '';
  const retry = /if [^\n{]*player\.currentItem\?\.status == \.failed[^\n{]*\{([\s\S]*?)\}/.exec(playback);
  expect(retry, 'the shared native play path must replace a failed AVPlayerItem').not.toBeNull();
  const branch = retry?.[1] ?? '';
  expect(branch).toMatch(/try loadTrack\(position: retainedPosition, autoplay: true\)\s+return/);
  expect(branch).not.toMatch(/queueID\s*=|tracks\s*=|index\s*=|sleepRemaining\s*=|sleepAtEnd\s*=|stopAndClearWidget/);
  expect(playback.indexOf(retry?.[0] ?? '')).toBeLessThan(playback.indexOf('player.playImmediately'));
});

it('keeps legacy iOS audio bytes available while assigning recognized media extensions (source evidence)', () => {
  const source = readFileSync('ios/App/App/DharmaAudioPlugin.swift', 'utf8');
  const cache = source.split('private func cachedURL(')[1]?.split('private func sourceURL(')[0] ?? '';
  expect(cache).toContain('appendingPathExtension("audio")');
  expect(cache).toContain('try FileManager.default.moveItem(at: legacy, to: target)');
  expect(cache).toContain('catch { return FileManager.default.fileExists(atPath: target.path) ? target : legacy }');
  expect(cache).not.toContain('removeItem');
  expect(source).toContain('read(upToCount: 64)');
  expect(source).toContain('try root.setResourceValues(values)');
  const status = source.split('@objc public func cacheStatus(')[1]?.split('@objc public func cacheChunk(')[0] ?? '';
  expect(status).toContain('cachedURL(key)');
  const playback = source.split('private func playbackURL(')[1]?.split('private func loadTrack(')[0] ?? '';
  expect(playback).toContain('cachedURL(source)');
  const write = source.split('@objc public func cacheChunk(')[1]?.split('private func interrupted(')[0] ?? '';
  expect(write.indexOf('replaceItemAt(target, withItemAt: partial)')).toBeGreaterThan(write.indexOf('if call.getBool("last") == true'));
  expect(write.indexOf('for suffix in mediaExtensions + ["audio"]')).toBeGreaterThan(write.indexOf('moveItem(at: partial, to: target)'));
});

it('publishes iOS duration changes even while the prepared item is paused (source evidence)', () => {
  const source = readFileSync('ios/App/App/DharmaAudioPlugin.swift', 'utf8');
  expect(source).toContain('item.observe(\\.duration, options: [.new])');
  expect(source).toContain('itemDuration?.invalidate(); itemDuration = nil');
  const widget = source.split('private func publishWidget(')[1]?.split('deinit')[0] ?? '';
  expect(widget).toMatch(/let duration = trackDuration\(\)[\s\S]*let fingerprint = [^\n]*\\\(Int\(duration\.rounded\(\)\)\)/);
});

it('reloads iOS widget snapshots before an audio intent returns (source evidence)', () => {
  const source = readFileSync('ios/App/App/DharmaAudioPlugin.swift', 'utf8');
  const intent = source.split('@MainActor func widgetPerform(')[1]?.split('private func saveWidgetArtwork(')[0] ?? '';
  expect(intent).toContain('publishWidget(force: true, immediateReload: true)');
  const reload = source.split('private func scheduleWidgetReload(')[1]?.split('private func publishWidget(')[0] ?? '';
  expect(reload).toMatch(/if immediate[^\{]*\{\s*WidgetCenter\.shared\.reloadTimelines/);
  expect(reload).toContain('widgetReload?.cancel()');
});

it('handles only the current iOS item failure and cleans up its observer (source evidence)', () => {
  const source = readFileSync('ios/App/App/DharmaAudioPlugin.swift', 'utf8');
  const observer = source.split('forName: AVPlayerItem.failedToPlayToEndTimeNotification')[1]?.split('player.replaceCurrentItem')[0] ?? '';
  expect(observer).toContain('generation == self.itemGeneration');
  expect(observer).toContain('self.player.currentItem === item');
  expect(observer).toContain('AVPlayerItemFailedToPlayToEndTimeErrorKey');
  expect(observer).toContain('self.playbackFailed(');
  expect(source).toContain('if let observer = failureObserver { NotificationCenter.default.removeObserver(observer) }');
  const failure = source.split('private func playbackFailed(')[1]?.split('private func removeTrackObservers(')[0] ?? '';
  expect(failure).toContain('intendedPlaying = false');
  expect(failure).toContain('cancelPendingSeek(code: "PLAYBACK_FAILED"');
  expect(failure).toContain('player.pause()');
  expect(failure).not.toMatch(/trackFinished\(|ended = true|index [+=]/);
});

it('keeps interruption begin separate from explicit iOS audio-session deactivation (source evidence)', () => {
  const source = readFileSync('ios/App/App/DharmaAudioPlugin.swift', 'utf8');
  const interruption = source.split('private func interrupted(')[1]?.split('private func command(')[0] ?? '';
  const began = interruption.split('if type == .began {')[1]?.split('} else {')[0] ?? '';
  expect(began).toContain('player.pause()');
  expect(began).toContain('resumeAfterInterruption = intendedPlaying');
  expect(began).not.toMatch(/pausePlayback\(|NativeAudioSession\.deactivate/);
  expect(interruption).toContain('options.contains(.shouldResume)');
});

it('validates remote iOS commands on the main thread and disables rosary seeking controls (source evidence)', () => {
  const source = readFileSync('ios/App/App/DharmaAudioPlugin.swift', 'utf8');
  const command = source.split('private func command(')[1]?.split('private func moveTrack(')[0] ?? '';
  expect(command).toContain('remoteCommandStatus');
  const status = source.split('private func remoteCommandStatus(')[1]?.split('private func command(')[0] ?? '';
  expect(status).toContain('Thread.isMainThread');
  expect(status).toContain('DispatchQueue.main.sync');
  expect(command).toMatch(/return self\.remoteCommandStatus \{\s*guard !self\.queueID\.isEmpty else \{ return \.noActionableNowPlayingItem \}/);
  const controls = source.split('private func updateRemoteCommands(')[1]?.split('private func configureCommands(')[0] ?? '';
  for (const control of ['nextTrackCommand', 'previousTrackCommand', 'skipForwardCommand', 'skipBackwardCommand', 'changePlaybackPositionCommand']) {
    expect(controls).toContain(control);
  }
  expect(controls).toContain('!queueID.isEmpty && !isRosaryPlayback');
});

it('keeps the small iOS sleep caption readable without changing the accented timer control', () => {
  const source = readFileSync('ios/App/CalendarWidget/DharmaAudioWidget.swift', 'utf8');
  const face = source.split('private func sleepFace(_ audio: DharmaAudioWidgetData) -> some View {')[1]
    ?.split('@ViewBuilder private func sleepControl')[0] ?? '';
  expect(face).toMatch(/Text\(WidgetLocaleStore\.text\("\\\(audio\.sleepRemainingMinutes\) phút", "\\\(audio\.sleepRemainingMinutes\) min"\)\)\.font\(\.system\(size: 9\)\)\.foregroundColor\(secondary\)/);
  expect(face).toContain('Image(systemName: "timer").font(.system(size: 20))');
  expect(face).toContain('.frame(minWidth: 44, minHeight: 44).foregroundColor(audio.sleepRemainingMinutes > 0 ? accent : secondary)');
});

it('neutralizes both paused and playing iOS audio snapshots when their freshness window expires', () => {
  const source = readFileSync('ios/App/CalendarWidget/DharmaAudioWidget.swift', 'utf8');
  const timeline = source.split('func getTimeline(in context: Context, completion: @escaping (Timeline<DharmaAudioWidgetEntry>) -> Void) {')[1]
    ?.split('struct DharmaAudioWidgetView')[0] ?? '';
  expect(timeline).toContain('if let audio = audio {');
  expect(timeline).not.toContain('audio.isPlaying');
  expect(timeline).toContain('let staleAt = audio.updatedAt.addingTimeInterval(91)');
  expect(timeline).toContain('if staleAt > now { entries.append(DharmaAudioWidgetEntry(date: staleAt, audio: audio)) }');
  expect(timeline).toContain('policy: .after(now.addingTimeInterval(900))');
});

it('connects the Android audio widget using the application context instead of the restricted broadcast context', () => {
  const source = readFileSync('android/app/src/main/java/vn/quangtu/tutam/audio/DharmaAudioWidgetProvider.java', 'utf8');
  const command = source.split('if (ACTION.equals(intent.getAction())) {')[1]
    ?.split('if (Intent.ACTION_CONFIGURATION_CHANGED')[0] ?? '';
  expect(command).toContain('Context applicationContext = context.getApplicationContext();');
  expect(command).toContain('new androidx.media3.session.MediaController.Builder(applicationContext,');
  expect(command).toContain('new androidx.media3.session.SessionToken(applicationContext, new ComponentName(applicationContext, DharmaPlaybackService.class))');
  expect(command).toContain('androidx.core.content.ContextCompat.getMainExecutor(applicationContext)');
  expect(command).not.toContain('MediaController.Builder(context,');
  expect(command).not.toContain('SessionToken(context,');
});

it('finishes the Android widget broadcast when controller creation throws synchronously', () => {
  const source = readFileSync('android/app/src/main/java/vn/quangtu/tutam/audio/DharmaAudioWidgetProvider.java', 'utf8');
  const command = source.split('if (ACTION.equals(intent.getAction())) {')[1]
    ?.split('if (Intent.ACTION_CONFIGURATION_CHANGED')[0] ?? '';
  const guard = /try\s*\{\s*connection\s*=\s*new[\s\S]*?\.buildAsync\(\);\s*\}\s*catch\s*\(RuntimeException\s+\w+\)\s*\{([\s\S]*?)\}/u.exec(command);
  expect(guard, 'goAsync must not leak its PendingResult if bind/controller creation fails before returning a future').not.toBeNull();
  expect(guard?.[1]).toContain('pending.finish();');
  expect(guard?.[1]).toContain('android.util.Log.w(');
  expect(guard?.[1]).toContain('updateAll(applicationContext);');
  expect(guard?.[1]).toContain('return;');
});
