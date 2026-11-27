import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (name: string) => readFileSync(`android/app/src/main/java/vn/quangtu/tutam/audio/${name}.java`, 'utf8');

describe('Android native audio lifecycle contracts (source evidence)', () => {
  it('retains the widget connection until Media3 actually reaches foreground or playback stops', () => {
    const receiver = source('DharmaAudioWidgetProvider');
    const command = receiver.split('if (ACTION.equals(intent.getAction())) {')[1]
      ?.split('if (Intent.ACTION_CONFIGURATION_CHANGED')[0] ?? '';
    expect(command).toContain('service.isPlaybackOngoing()');
    expect(command).toContain('service.hasPendingWidgetPlayback()');
    expect(command).toContain('handler.postDelayed(this, 50)');
    expect(command).toContain('handler.postDelayed(finish, 8000)');
    expect(command).not.toMatch(/finally\s*\{\s*handler\.removeCallbacks\(finish\);\s*finish\.run\(\);/);
    expect(command).not.toContain('startForegroundService');
    expect(receiver.indexOf('if (intent == null) return;')).toBeLessThan(receiver.indexOf('super.onReceive(context, intent);'));
  });

  it('only invalidates the failed connection instance and keeps operation errors separate', () => {
    const plugin = source('DharmaAudioPlugin');
    expect(plugin).toContain('final ListenableFuture<MediaController> connection = connecting;');
    expect(plugin).toContain('if (connecting != connection) return;');
    expect(plugin).toContain('resetConnection(connection);');
    expect(plugin).not.toContain('operation.run(connecting.get());');
    const reset = plugin.split('private void resetConnection(ListenableFuture<MediaController> connection) {')[1]?.split('private JSObject state')[0] ?? '';
    expect(reset).toContain('if (connecting != connection) return;');
    expect(reset).toContain('connecting = null;');
    expect(reset).toContain('main.removeCallbacks(ticker);');
  });

  it('stops idle and background UI ticks but keeps player events and the service owner', () => {
    const plugin = source('DharmaAudioPlugin');
    expect(plugin).toContain('controller.isPlaying()');
    expect(plugin).toContain('!foreground');
    expect(plugin).toContain('handleOnPause()');
    expect(plugin).toContain('handleOnResume()');
    expect(plugin).not.toContain('publish(); main.postDelayed(this, 1000);');
    expect(plugin).toContain('onEvents(Player player, Player.Events events) { publish(); updateTicker(); }');
    const service = source('DharmaPlaybackService');
    expect(service).toContain('handler.removeCallbacks(ticker);');
    expect(service).toContain('if (player != null && player.isPlaying()) handler.postDelayed(ticker, 1000);');
    const destroy = service.split('@Override public void onDestroy() {')[1] ?? '';
    expect(destroy.indexOf('active = null;')).toBeLessThan(destroy.indexOf('publishWidget();'));
  });

  it('atomically replaces an offline file without deleting the previous completed audio', () => {
    const plugin = source('DharmaAudioPlugin');
    const commit = plugin.split('if (call.getBoolean("last", false)) {')[1]?.split('call.resolve();')[0] ?? '';
    expect(commit).not.toContain('target.delete()');
    expect(commit).toContain('android.system.Os.rename(partial.getAbsolutePath(), target.getAbsolutePath());');
    expect(source('DharmaAudioWidgetStore')).toContain('new File(context.getApplicationInfo().dataDir).getCanonicalPath() + File.separator');
  });

  it('guards destroyed activities, absent services and asynchronous ambient playback errors', () => {
    const plugin = source('DharmaAudioPlugin');
    expect(plugin).toContain('activity != null && activity.isBackgroundRestricted()');
    expect(plugin).toContain('power != null && !power.isIgnoringBatteryOptimizations');
    expect(plugin).toContain('activity == null || activity.isFinishing() || activity.isDestroyed()');
    const sounds = source('PracticeSounds');
    expect(sounds).toContain('catch (IllegalStateException error)');
    expect(sounds).toContain('if (ambient != player) return;');
    expect(sounds).toContain('ambientPrepared = false;');
  });

  it('evicts only explicit hashed files and defers files held by the native queue (source evidence)', () => {
    const plugin = source('DharmaAudioPlugin');
    expect(plugin).toContain('@PluginMethod public void evictCache(PluginCall call)');
    expect(plugin).toContain('if (retained.contains(target.getAbsolutePath())) return;');
    expect(plugin).toContain('deleteCacheFile(evictionMarker(cacheFile(key, false)))');
    expect(plugin).toContain('name.matches("[a-f0-9]{64}\\\\.audio\\\\.evict")');
    const ios = readFileSync('ios/App/App/DharmaAudioPlugin.swift', 'utf8');
    expect(ios).toContain('@objc public func evictCache(_ call: CAPPluginCall)');
    expect(ios).toContain('mediaExtensions + ["audio", "part", "evict"]');
    expect(ios).toContain('asset.url.deletingPathExtension().standardizedFileURL == base.standardizedFileURL { return }');
    expect(ios).toContain('hash.count == 64');
  });
});
