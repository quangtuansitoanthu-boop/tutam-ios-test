import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MEDITATION_SETUP } from '../../../src/lib/browser/practice-meditation';
import { createPracticeAudioController } from '../../../src/lib/browser/practice-audio';
import { createAmbientSoundController } from '../../../src/lib/browser/ambient-sound';
import { AudioPlayerController } from '../../../src/lib/browser/audio-player-controller';
import { NativeTalkAudio, type NativeAudioState, type NativeTalkPlugin } from '../../../src/lib/browser/native-talk-audio';

describe('Meditation Volume Controls', () => {
  beforeAll(() => {
    class MockAudio {
      src = '';
      loop = false;
      preload = '';
      volume = 1;
      currentTime = 0;
      pause() {}
      play() { return Promise.resolve(); }
      addEventListener() {}
      removeEventListener() {}
    }
    (globalThis as unknown as { Audio: unknown }).Audio = MockAudio;
  });

  it('defines default volume levels in DEFAULT_MEDITATION_SETUP', () => {
    expect(DEFAULT_MEDITATION_SETUP.musicVolume).toBe(0.8);
    expect(DEFAULT_MEDITATION_SETUP.ambientVolume).toBe(0.6);
  });

  it('manages meditation volume correctly via practice audio controller', () => {
    const controller = createPracticeAudioController();
    expect(controller.getMeditationVolume()).toBe(0.8);

    controller.setMeditationVolume(0.5);
    expect(controller.getMeditationVolume()).toBe(0.5);

    // Clamping to [0, 1]
    controller.setMeditationVolume(1.5);
    expect(controller.getMeditationVolume()).toBe(1);

    controller.setMeditationVolume(-0.2);
    expect(controller.getMeditationVolume()).toBe(0);

    // Ignores non-finite values
    controller.setMeditationVolume(Number.NaN);
    expect(controller.getMeditationVolume()).toBe(0);

    controller.destroy();
  });

  it('controls ambient sound volume safely', () => {
    const ambient = createAmbientSoundController();
    expect(() => ambient.setVolume(0.75)).not.toThrow();
    expect(() => ambient.setVolume(0)).not.toThrow();
    expect(() => ambient.setVolume(1)).not.toThrow();
    ambient.destroy();
  });

  it('MeditationScreen supports dynamic music and ambient sound adjustments during session', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/lib/components/practice/meditation/MeditationScreen.svelte', 'utf8');
    // Must support callbacks for switching tracks and ambient sounds during session
    expect(source).toContain('onMusicTrackChange?: (track: MeditationTrack | null) => void');
    expect(source).toContain('onAmbientSoundChange?: (sound: AmbientSoundType) => void');
    // Must provide track selection inside the sound bottom sheet
    expect(source).toContain('selectMusicTrack');
    expect(source).toContain('selectAmbientSound');
    // Must render the bottom sheet standard layout with backdrop
    expect(source).toContain('meditation-sound-sheet');
    expect(source).toContain('meditation-sound-sheet-backdrop');
  });

  it('forwards practice meditation volume directly to native DharmaAudio without mute trap or mutating talk volume', async () => {
    const prevDoc = (globalThis as { document?: unknown }).document;
    const prevWin = (globalThis as { window?: unknown }).window;
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible', baseURI: 'https://localhost/' });
    const win = Object.assign(new EventTarget(), {
      location: new URL('https://localhost/'),
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      setInterval: globalThis.setInterval.bind(globalThis),
      clearInterval: globalThis.clearInterval.bind(globalThis)
    });
    (globalThis as { document?: unknown }).document = doc;
    (globalThis as { window?: unknown }).window = win;

    const optionCalls: Array<{ speed?: number; volume?: number; repeat?: number }> = [];
    let currentState: NativeAudioState = {
      queueId: '',
      trackIndex: 0,
      position: 0,
      duration: 60,
      playing: false,
      playWhenReady: false,
      buffering: false,
      ended: false,
      speed: 1,
      volume: 1,
      error: '',
      sleepRemainingMs: 0,
      sleepAtEnd: false
    };

    const plugin: NativeTalkPlugin = {
      selectPrincipal: vi.fn(async () => {}),
      setQueue: vi.fn(async (opts) => {
        currentState = { ...currentState, queueId: opts.queueId, trackIndex: opts.index, position: opts.position };
        return { ...currentState };
      }),
      play: vi.fn(async () => {
        currentState = { ...currentState, playing: true, playWhenReady: true };
        return { ...currentState };
      }),
      pause: vi.fn(async () => {
        currentState = { ...currentState, playing: false, playWhenReady: false };
        return { ...currentState };
      }),
      stop: vi.fn(async () => {
        currentState = { ...currentState, queueId: '', playing: false, playWhenReady: false };
        return { ...currentState };
      }),
      seek: vi.fn(async () => ({ ...currentState })),
      options: vi.fn(async (opts) => {
        optionCalls.push(opts);
        if (typeof opts.volume === 'number') currentState = { ...currentState, volume: opts.volume };
        return { ...currentState };
      }),
      sleep: vi.fn(async () => ({ ...currentState })),
      getState: vi.fn(async () => ({ ...currentState })),
      peek: vi.fn(async () => ({})),
      cacheStatus: vi.fn(async () => ({ bytes: 0 })),
      cacheChunk: vi.fn(async () => {}),
      backgroundStatus: vi.fn(async () => ({ restricted: false, batteryOptimized: false })),
      openBackgroundSettings: vi.fn(async () => {}),
      addListener: vi.fn(async () => ({ remove: async () => {} }))
    };

    try {
      const nativeAudio = new NativeTalkAudio(plugin);
      const controller = new AudioPlayerController({ authenticated: false, csrfToken: null });
      (controller as unknown as { audio: NativeTalkAudio }).audio = nativeAudio;
      let snap = { volume: 1, muted: false };
      const unsub = controller.subscribe((next) => {
        snap = { volume: next.volume, muted: next.muted };
      });
      // Simulate user previously muting a Dharma Talk while keeping talk volume at 1
      controller.toggleMute();
      expect(snap.muted).toBe(true);
      expect(snap.volume).toBe(1);

      const lease = await controller.beginPracticePlayback(
        { id: 'practice:meditation', title: 'Thiền định', description: '', tracks: [{ title: 'Nhạc thiền', url: '/assets/audio/nhac-thien-1.mp3' }] },
        600_000,
        () => {},
        () => {},
        undefined,
        { volume: 0.45 }
      );
      expect(lease).not.toBeNull();
      // Initial native volume must be applied unmuted at 0.45
      expect(optionCalls.some((c) => c.volume === 0.45)).toBe(true);
      // Talk snapshot remains intact
      expect(snap.volume).toBe(1);
      expect(snap.muted).toBe(true);

      // Live slider update through lease
      lease!.setVolume(0.25);
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(optionCalls.some((c) => c.volume === 0.25)).toBe(true);

      // After stop, stale lease setVolume calls are ignored
      const countBeforeStop = optionCalls.length;
      lease!.stop();
      lease!.setVolume(0.9);
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(optionCalls.slice(countBeforeStop).some((c) => c.volume === 0.9)).toBe(false);

      unsub();
      nativeAudio.dispose();
    } finally {
      (globalThis as { document?: unknown }).document = prevDoc;
      (globalThis as { window?: unknown }).window = prevWin;
    }
  });
});
