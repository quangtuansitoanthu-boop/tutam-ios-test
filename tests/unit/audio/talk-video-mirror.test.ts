import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachTalkVideoMirror } from '../../../src/lib/browser/talk-video-mirror';

class Media extends EventTarget {
  currentTime = 0;
  playbackRate = 1;
  paused = true;
  ended = false;
  readyState = 1;
  seeking = false;
  muted = false;
  play = vi.fn(async () => { this.paused = false; });
  pause = vi.fn(() => { this.paused = true; });
}
class Visibility extends EventTarget { hidden = false; }
let sampledNow = 0;
beforeEach(() => {
  sampledNow = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => sampledNow);
});
afterEach(() => vi.restoreAllMocks());

function heldClock(audio: Media, synchronousPause = true) {
  let wanted = true;
  let leases = 0;
  const release = vi.fn(() => {
    leases -= 1;
    audio.paused = !wanted;
    audio.dispatchEvent(new Event(wanted ? 'play' : 'pause'));
  });
  const hold = vi.fn(() => {
    leases += 1;
    if (synchronousPause) {
      audio.paused = true;
      audio.dispatchEvent(new Event('pause'));
    }
    let active = true;
    return () => { if (active) { active = false; release(); } };
  });
  return {
    hold, release, wantsPlayback: () => wanted, get leases() { return leases; },
    intent(value: boolean) { wanted = value; audio.dispatchEvent(new Event('videoplaybackintent')); }
  };
}

describe('optional video readiness gate', () => {
  it('primes a replacement source at HAVE_NOTHING without releasing its audio hold', async () => {
    const audio = new Media();
    const video = Object.assign(new Media(), { src: '/first-video.mp4', readyState: 0 });
    const gate = heldClock(audio);
    const dispose = attachTalkVideoMirror(audio, video, new Visibility(), vi.fn(), gate);
    await Promise.resolve();
    video.dispatchEvent(new Event('error'));
    video.src = '/fallback-video.mp4';
    video.dispatchEvent(new Event('loadstart'));
    expect(video.play).toHaveBeenCalledTimes(2);
    expect(gate.leases).toBe(1);
    expect(gate.release).not.toHaveBeenCalled();
    video.readyState = 2;
    video.dispatchEvent(new Event('loadeddata'));
    expect(gate.leases).toBe(0);
    dispose();
  });

  it('primes a selected source whose browser defers metadata until muted play is requested', async () => {
    const audio = new Media();
    const video = Object.assign(new Media(), { src: '/selected-video.mp4', readyState: 0 });
    audio.currentTime = 8;
    const gate = heldClock(audio);
    video.play.mockImplementationOnce(async () => {
      video.paused = false;
      video.readyState = 1;
      video.dispatchEvent(new Event('loadedmetadata'));
      await Promise.resolve();
      video.readyState = 2;
      video.dispatchEvent(new Event('loadeddata'));
    });
    const dispose = attachTalkVideoMirror(audio, video, new Visibility(), vi.fn(), gate);
    expect(video.play).toHaveBeenCalledTimes(1);
    expect(video.muted).toBe(true);
    expect(video.currentTime).toBe(8);
    expect(gate.leases).toBe(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(gate.leases).toBe(0);
    expect(audio.paused).toBe(false);
    dispose();
  });

  it.each(['blank', 'hidden', 'paused', 'error'])('does not prime an unplayable initial state: %s', reason => {
    const audio = new Media();
    const video = Object.assign(new Media(), { src: reason === 'blank' ? '' : '/selected-video.mp4', readyState: 0 });
    const visibility = new Visibility();
    const gate = heldClock(audio);
    if (reason === 'hidden') visibility.hidden = true;
    if (reason === 'paused') gate.intent(false);
    if (reason === 'error') video.play.mockRejectedValueOnce(new Error('source failed'));
    const dispose = attachTalkVideoMirror(audio, video, visibility, vi.fn(), gate);
    if (reason === 'error') {
      video.dispatchEvent(new Event('error'));
      const attempts = video.play.mock.calls.length;
      audio.dispatchEvent(new Event('timeupdate'));
      expect(video.play).toHaveBeenCalledTimes(attempts);
    } else expect(video.play).not.toHaveBeenCalled();
    dispose();
  });

  it('reacquires a pending foreground barrier when Pause is followed by Play', async () => {
    const audio = new Media();
    const video = new Media();
    video.readyState = 2;
    const visibility = new Visibility();
    const gate = heldClock(audio);
    let finish!: () => void;
    (audio as Media & { refreshVideoPosition: () => Promise<void> }).refreshVideoPosition =
      () => new Promise(resolve => { finish = resolve; });
    const dispose = attachTalkVideoMirror(audio, video, visibility, vi.fn(), gate);
    video.dispatchEvent(new Event('loadeddata'));
    visibility.hidden = true;
    visibility.dispatchEvent(new Event('visibilitychange'));
    visibility.hidden = false;
    visibility.dispatchEvent(new Event('visibilitychange'));
    gate.intent(false);
    expect(gate.leases).toBe(0);
    gate.intent(true);
    expect(gate.leases).toBe(1);
    expect(audio.paused).toBe(true);
    const releases = gate.release.mock.calls.length;
    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(gate.leases).toBe(1);
    video.dispatchEvent(new Event('playing'));
    video.dispatchEvent(new Event('loadeddata'));
    expect(gate.leases).toBe(0);
    expect(gate.release).toHaveBeenCalledTimes(releases + 1);
    expect(audio.paused).toBe(false);
    dispose();
  });

  it.each(['seek', 'hidden', 'dispose', 'pause'])('ignores stale refresh completion after %s', async action => {
    const audio = new Media();
    const video = new Media();
    audio.currentTime = 10;
    video.currentTime = 10;
    video.readyState = 2;
    const visibility = new Visibility();
    const gate = heldClock(audio);
    let finish!: () => void;
    (audio as Media & { refreshVideoPosition: () => Promise<void> }).refreshVideoPosition =
      () => new Promise(resolve => { finish = resolve; });
    const dispose = attachTalkVideoMirror(audio, video, visibility, vi.fn(), gate);
    video.dispatchEvent(new Event('loadeddata'));
    visibility.hidden = true;
    visibility.dispatchEvent(new Event('visibilitychange'));
    visibility.hidden = false;
    visibility.dispatchEvent(new Event('visibilitychange'));
    if (action === 'seek') { audio.currentTime = 70; audio.dispatchEvent(new Event('seeking')); }
    else if (action === 'hidden') { visibility.hidden = true; visibility.dispatchEvent(new Event('visibilitychange')); }
    else if (action === 'dispose') dispose();
    else gate.intent(false);
    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(video.currentTime).toBe(action === 'seek' ? 70 : 10);
    expect(gate.leases).toBe(action === 'seek' ? 1 : 0);
    if (action !== 'seek') expect(video.paused).toBe(true);
    dispose();
  });

  it('keeps refresh errors silent until retry or background instead of leaking foreground audio', async () => {
    const audio = new Media();
    const video = new Media();
    const visibility = new Visibility();
    const gate = heldClock(audio);
    (audio as Media & { refreshVideoPosition: () => Promise<void> }).refreshVideoPosition =
      async () => { throw new Error('native read failed'); };
    const blocked = vi.fn();
    const dispose = attachTalkVideoMirror(audio, video, visibility, blocked, gate);
    video.readyState = 2;
    video.dispatchEvent(new Event('loadeddata'));
    visibility.hidden = true;
    visibility.dispatchEvent(new Event('visibilitychange'));
    visibility.hidden = false;
    visibility.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(blocked).toHaveBeenCalledTimes(1);
    expect(gate.leases).toBe(1);
    expect(audio.paused).toBe(true);
    video.dispatchEvent(new Event('playing'));
    expect(gate.leases).toBe(1);
    video.dispatchEvent(new Event('loadstart'));
    video.dispatchEvent(new Event('loadeddata'));
    expect(gate.leases).toBe(0);
    visibility.hidden = true;
    visibility.dispatchEvent(new Event('visibilitychange'));
    expect(audio.paused).toBe(false);
    dispose();
  });

  it('waits for a fresh held native clock before aligning after foreground return', async () => {
    const audio = new Media();
    const video = new Media();
    audio.currentTime = 50;
    video.currentTime = 50;
    video.readyState = 2;
    const visibility = new Visibility();
    const clock = heldClock(audio);
    let finishRefresh!: () => void;
    const refresh = vi.fn(() => new Promise<void>(resolve => { finishRefresh = resolve; }));
    (audio as Media & { refreshVideoPosition: typeof refresh }).refreshVideoPosition = refresh;
    const dispose = attachTalkVideoMirror(audio, video, visibility, vi.fn(), clock);
    video.dispatchEvent(new Event('loadeddata'));
    visibility.hidden = true;
    visibility.dispatchEvent(new Event('visibilitychange'));
    video.currentTime = 53;
    const writes: number[] = [];
    let decoded = video.currentTime;
    Object.defineProperty(video, 'currentTime', { get: () => decoded, set: (value: number) => { decoded = value; writes.push(value); } });
    visibility.hidden = false;
    visibility.dispatchEvent(new Event('visibilitychange'));
    expect(writes).toEqual([]);
    expect(video.paused).toBe(true);
    audio.currentTime = 55.253;
    audio.dispatchEvent(new Event('timeupdate'));
    expect(writes).toEqual([]);
    audio.currentTime = 57.94;
    finishRefresh();
    await Promise.resolve();
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(writes).toEqual([57.94]);
    expect(clock.leases).toBe(1);
    video.dispatchEvent(new Event('seeked'));
    expect(clock.leases).toBe(0);
    dispose();
  });

  it.each(['hidden', 'close', 'pause'])('keeps an errored foreground video silent until %s', async action => {
    const audio = new Media();
    const video = new Media();
    const visibility = new Visibility();
    const gate = heldClock(audio);
    const dispose = attachTalkVideoMirror(audio, video, visibility, vi.fn(), gate);
    await Promise.resolve();
    video.readyState = 2;
    video.dispatchEvent(new Event('loadeddata'));
    expect(gate.leases).toBe(0);
    video.dispatchEvent(new Event('error'));
    expect(gate.leases).toBe(1);
    expect(audio.paused).toBe(true);
    video.dispatchEvent(new Event('playing'));
    expect(gate.leases).toBe(1);
    if (action === 'hidden') { visibility.hidden = true; visibility.dispatchEvent(new Event('visibilitychange')); }
    else if (action === 'pause') gate.intent(false);
    else dispose();
    expect(gate.leases).toBe(0);
    expect(audio.paused).toBe(action === 'pause');
    if (action === 'pause') {
      gate.intent(true);
      expect(gate.leases).toBe(1);
      expect(audio.paused).toBe(true);
    }
    dispose();
  });

  it('retains the foreground hold when video play is rejected', async () => {
    const audio = new Media();
    const video = new Media();
    video.play.mockRejectedValueOnce(new Error('video blocked'));
    const gate = heldClock(audio);
    const blocked = vi.fn();
    const dispose = attachTalkVideoMirror(audio, video, new Visibility(), blocked, gate);
    await Promise.resolve();
    await Promise.resolve();
    expect(blocked).toHaveBeenCalledTimes(1);
    expect(gate.leases).toBe(1);
    expect(audio.paused).toBe(true);
    video.dispatchEvent(new Event('loadstart'));
    await Promise.resolve();
    video.readyState = 2;
    video.dispatchEvent(new Event('playing'));
    expect(gate.leases).toBe(0);
    expect(audio.paused).toBe(false);
    dispose();
  });

  it('retries a replacement source on the same video after a media error', async () => {
    const audio = new Media();
    const video = new Media();
    audio.currentTime = 30;
    const gate = heldClock(audio);
    const dispose = attachTalkVideoMirror(audio, video, new Visibility(), vi.fn(), gate);
    await Promise.resolve();
    video.dispatchEvent(new Event('error'));
    expect(gate.leases).toBe(1);
    expect(audio.paused).toBe(true);
    expect(gate.release).not.toHaveBeenCalled();
    video.readyState = 0;
    video.dispatchEvent(new Event('loadstart'));
    expect(gate.leases).toBe(1);
    video.currentTime = 0;
    video.readyState = 1;
    video.dispatchEvent(new Event('loadedmetadata'));
    await Promise.resolve();
    expect(video.currentTime).toBe(30);
    expect(video.paused).toBe(false);
    expect(gate.leases).toBe(1);
    video.readyState = 2;
    video.dispatchEvent(new Event('loadeddata'));
    expect(gate.leases).toBe(0);
    expect(audio.paused).toBe(false);
    dispose();
  });

  it('ignores an obsolete play rejection after a replacement source starts', async () => {
    const audio = new Media();
    const video = new Media();
    let rejectOld!: (reason: Error) => void;
    video.play.mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectOld = reject; }));
    const gate = heldClock(audio);
    const blocked = vi.fn();
    const dispose = attachTalkVideoMirror(audio, video, new Visibility(), blocked, gate);
    video.dispatchEvent(new Event('error'));
    rejectOld(new Error('previous source failed'));
    await Promise.resolve();
    await Promise.resolve();
    expect(blocked).not.toHaveBeenCalled();
    video.dispatchEvent(new Event('loadstart'));
    await Promise.resolve();
    expect(video.paused).toBe(false);
    video.readyState = 2;
    video.dispatchEvent(new Event('playing'));
    expect(gate.leases).toBe(0);
    dispose();
  });

  it('holds a play intent before audio starts when the existing frame belongs to an old target', () => {
    const audio = new Media();
    const video = new Media();
    const gate = heldClock(audio);
    gate.intent(false);
    video.readyState = 2;
    const dispose = attachTalkVideoMirror(audio, video, new Visibility(), vi.fn(), gate);
    audio.currentTime = 60;
    gate.intent(true);
    expect(gate.leases).toBe(1);
    expect(audio.paused).toBe(true);
    expect(video.currentTime).toBe(60);
    video.dispatchEvent(new Event('seeked'));
    expect(gate.leases).toBe(0);
    expect(audio.paused).toBe(false);
    dispose();
  });

  it.each([true, false])('prepares the muted image while audio is held (synchronous pause %s)', async synchronous => {
    const audio = new Media();
    const video = new Media();
    audio.paused = false;
    audio.currentTime = 30;
    const gate = heldClock(audio, synchronous);
    const dispose = attachTalkVideoMirror(audio, video, new Visibility(), vi.fn(), gate);
    await Promise.resolve();
    expect(gate.leases).toBe(1);
    expect(video.play).toHaveBeenCalledTimes(1);
    expect(video.currentTime).toBe(30);
    expect(video.muted).toBe(true);
    video.readyState = 2;
    video.seeking = true;
    video.dispatchEvent(new Event('loadeddata'));
    expect(gate.release).not.toHaveBeenCalled();
    video.seeking = false;
    video.dispatchEvent(new Event('seeked'));
    expect(gate.leases).toBe(0);
    expect(gate.release).toHaveBeenCalledTimes(1);
    expect(audio.paused).toBe(false);
    dispose();
    expect(gate.release).toHaveBeenCalledTimes(1);
  });

  it('keeps one lease through repeated seeks and releases only the latest decoded target', () => {
    const audio = new Media();
    const video = new Media();
    audio.currentTime = 30;
    const gate = heldClock(audio);
    const dispose = attachTalkVideoMirror(audio, video, new Visibility(), vi.fn(), gate);
    video.seeking = true;
    for (const target of [60, 50]) {
      audio.currentTime = target;
      audio.dispatchEvent(new Event('seeking'));
    }
    expect(gate.hold).toHaveBeenCalledTimes(1);
    video.seeking = false;
    video.readyState = 2;
    video.dispatchEvent(new Event('seeked'));
    expect(video.currentTime).toBe(50);
    expect(gate.leases).toBe(1);
    video.dispatchEvent(new Event('seeked'));
    expect(gate.leases).toBe(0);
    dispose();
    expect(gate.release).toHaveBeenCalledTimes(1);
  });

  it.each(['hidden', 'dispose', 'pause'])('releases a metadata-only hold on %s', reason => {
    const audio = new Media();
    const video = new Media();
    video.readyState = 0;
    const visibility = new Visibility();
    const gate = heldClock(audio);
    const dispose = attachTalkVideoMirror(audio, video, visibility, vi.fn(), gate);
    expect(gate.leases).toBe(1);
    expect(video.play).not.toHaveBeenCalled();
    if (reason === 'hidden') { visibility.hidden = true; visibility.dispatchEvent(new Event('visibilitychange')); }
    else if (reason === 'pause') gate.intent(false);
    else dispose();
    expect(gate.leases).toBe(0);
    expect(gate.release).toHaveBeenCalledTimes(1);
    expect(audio.paused).toBe(reason === 'pause');
    dispose();
    expect(gate.release).toHaveBeenCalledTimes(1);
  });

  it('reacquires on buffering and foreground, while a manual pause stops video preparation', async () => {
    const audio = new Media();
    const video = new Media();
    const visibility = new Visibility();
    const gate = heldClock(audio);
    const dispose = attachTalkVideoMirror(audio, video, visibility, vi.fn(), gate);
    await Promise.resolve();
    video.readyState = 2;
    video.dispatchEvent(new Event('loadeddata'));
    video.readyState = 1;
    video.dispatchEvent(new Event('waiting'));
    expect(gate.leases).toBe(1);
    gate.intent(false);
    expect(video.paused).toBe(true);
    expect(gate.leases).toBe(0);
    gate.intent(true);
    await Promise.resolve();
    expect(gate.leases).toBe(1);
    expect(video.paused).toBe(false);
    visibility.hidden = true;
    visibility.dispatchEvent(new Event('visibilitychange'));
    expect(gate.leases).toBe(0);
    expect(audio.paused).toBe(false);
    visibility.hidden = false;
    visibility.dispatchEvent(new Event('visibilitychange'));
    expect(gate.leases).toBe(1);
    video.readyState = 2;
    video.dispatchEvent(new Event('playing'));
    expect(gate.leases).toBe(0);
    dispose();
  });
});

describe('silent talk video follows the persistent audio owner', () => {
  it('slows an ahead video without seeking backwards and returns to the user rate', () => {
    const audio = new Media();
    const video = new Media();
    audio.paused = false;
    audio.currentTime = 10;
    video.currentTime = 10;
    video.readyState = 4;
    const dispose = attachTalkVideoMirror(audio, video, new Visibility(), vi.fn());
    let decodedTime = 14;
    const hardSeek = vi.fn();
    Object.defineProperty(video, 'currentTime', {
      get: () => decodedTime,
      set: hardSeek
    });
    let slowed = false;
    for (let tick = 0; tick < 80; tick += 1) {
      sampledNow += 500;
      audio.currentTime += 0.5;
      decodedTime += video.playbackRate * 0.5;
      audio.dispatchEvent(new Event('timeupdate'));
      slowed ||= video.playbackRate < 1;
    }
    expect(hardSeek).not.toHaveBeenCalled();
    expect(slowed).toBe(true);
    expect(Math.abs(audio.currentTime - decodedTime)).toBeLessThanOrEqual(0.5);
    expect(video.playbackRate).toBe(1);
    dispose();
  });

  it.each([0.5, 1, 2].flatMap(rate => [3.5, 8].map(delay => ({ rate, delay }))))(
    'converges after a $delay second decode at $rate x without another hard seek', ({ rate, delay }) => {
      const audio = new Media();
      const video = new Media();
      audio.paused = false;
      audio.currentTime = 36.871;
      audio.playbackRate = rate;
      let decodedTime = audio.currentTime;
      const hardSeeks: number[] = [];
      Object.defineProperty(video, 'currentTime', {
        get: () => decodedTime,
        set: (value: number) => { decodedTime = value; hardSeeks.push(value); }
      });
      const dispose = attachTalkVideoMirror(audio, video, new Visibility(), vi.fn());
      audio.currentTime = 66.871;
      audio.dispatchEvent(new Event('seeking'));
      expect(hardSeeks).toEqual([66.871]);
      hardSeeks.length = 0;
      video.seeking = true;
      for (let elapsed = 0; elapsed < delay; elapsed += 0.5) {
        sampledNow += 500;
        audio.currentTime += rate * 0.5;
        audio.dispatchEvent(new Event('timeupdate'));
      }
      video.seeking = false;
      video.readyState = 4;
      video.dispatchEvent(new Event('seeked'));
      let accelerated = false;
      for (let tick = 0; tick < 200; tick += 1) {
        sampledNow += 500;
        audio.currentTime += rate * 0.5;
        decodedTime += video.playbackRate * 0.5;
        audio.dispatchEvent(new Event('timeupdate'));
        accelerated ||= video.playbackRate > rate;
        expect(video.playbackRate).toBeGreaterThanOrEqual(rate * 0.75);
        expect(video.playbackRate).toBeLessThanOrEqual(rate * 1.25);
      }
      expect(hardSeeks).toEqual([]);
      expect(accelerated).toBe(true);
      expect(Math.abs(audio.currentTime - decodedTime)).toBeLessThanOrEqual(rate * 0.5 + 0.35);
      expect(video.playbackRate).toBe(rate);
      expect(audio.playbackRate).toBe(rate);
      dispose();
    }
  );

  it('does not treat one decoded frame followed by a stall as sustained playback drift', () => {
    const audio = new Media();
    const video = new Media();
    audio.paused = false;
    audio.currentTime = 30;
    video.readyState = 2;
    const dispose = attachTalkVideoMirror(audio, video, new Visibility(), vi.fn());
    video.currentTime = 30.1;
    for (const position of [31, 32, 33]) {
      sampledNow += 1000;
      audio.currentTime = position;
      audio.dispatchEvent(new Event('timeupdate'));
      expect(video.currentTime).toBe(30.1);
    }
    dispose();
  });

  it.each([1, 2])('keeps paired clocks running through native sampling jitter at %sx', (rate) => {
    const audio = new Media();
    const video = new Media();
    audio.paused = false;
    audio.currentTime = 10;
    audio.playbackRate = rate;
    video.currentTime = 10;
    video.readyState = 4;
    const dispose = attachTalkVideoMirror(audio, video, new Visibility(), vi.fn());
    for (const [milliseconds, nativeSeconds] of [[790, 0.027], [1000, 0.9], [1100, 1], [2000, 1.9], [3000, 2.9]]) {
      sampledNow = milliseconds;
      audio.currentTime = 10 + nativeSeconds * rate;
      const decodedTime = 10 + milliseconds / 1000 * rate;
      video.currentTime = decodedTime;
      audio.dispatchEvent(new Event('timeupdate'));
      expect(video.currentTime).toBe(decodedTime);
      expect(video.playbackRate).toBe(rate);
    }
    dispose();
  });

  it('aligns a paused lock-screen position change without requiring another sample', () => {
    const audio = new Media();
    const video = new Media();
    audio.currentTime = 10;
    const dispose = attachTalkVideoMirror(audio, video, new Visibility(), vi.fn());
    sampledNow = 60_000;
    audio.currentTime = 58.315;
    audio.dispatchEvent(new Event('timeupdate'));
    expect(video.currentTime).toBe(58.315);
    expect(video.paused).toBe(true);
    dispose();
  });

  it('does not rewind the first decoded frames to a late, barely advanced native sample', () => {
    let now = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    const audio = new Media();
    const video = new Media();
    audio.paused = false;
    audio.currentTime = 7.184;
    video.currentTime = 7.184;
    video.readyState = 2;
    const dispose = attachTalkVideoMirror(audio, video, new Visibility(), vi.fn());
    try {
      now = 790;
      audio.currentTime = 7.211;
      video.currentTime = 7.974;
      audio.dispatchEvent(new Event('timeupdate'));
      expect(video.currentTime).toBe(7.974);
    } finally { dispose(); clock.mockRestore(); }
  });

  it('does not chase advancing native samples before the decoder has a frame', () => {
    const audio = new Media();
    const video = new Media();
    audio.paused = false;
    audio.currentTime = 30;
    const dispose = attachTalkVideoMirror(audio, video, new Visibility(), vi.fn());
    for (const position of [31, 32, 33]) {
      sampledNow += 1000;
      audio.currentTime = position;
      audio.dispatchEvent(new Event('timeupdate'));
      video.dispatchEvent(new Event('seeked'));
    }
    expect(video.currentTime).toBe(30);
    video.readyState = 2;
    audio.dispatchEvent(new Event('timeupdate'));
    expect(video.currentTime).toBe(30);
    video.currentTime = 30.1;
    audio.dispatchEvent(new Event('timeupdate'));
    expect(video.currentTime).toBe(30.1);
    sampledNow += 1000;
    audio.currentTime = 34;
    audio.dispatchEvent(new Event('timeupdate'));
    sampledNow += 1000;
    audio.currentTime = 35;
    video.currentTime = 30.2;
    audio.dispatchEvent(new Event('timeupdate'));
    expect(video.currentTime).toBe(30.2);
    expect(video.playbackRate).toBe(1.25);
    dispose();
  });

  it('honors explicit paused seeks, including the same target after a clock correction', () => {
    const audio = new Media();
    const video = new Media();
    audio.currentTime = 30;
    const dispose = attachTalkVideoMirror(audio, video, new Visibility(), vi.fn());
    video.currentTime = 29;
    audio.dispatchEvent(new Event('seeking'));
    expect(video.currentTime).toBe(30);
    video.seeking = true;
    audio.currentTime = 80;
    audio.dispatchEvent(new Event('seeking'));
    expect(video.currentTime).toBe(30);
    video.seeking = false;
    video.dispatchEvent(new Event('seeked'));
    expect(video.currentTime).toBe(80);
    expect(video.paused).toBe(true);
    expect(audio.pause).not.toHaveBeenCalled();
    dispose();
  });

  it('allows one native sampling interval of drift without repeatedly seeking', () => {
    let now = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    const audio = new Media();
    const video = new Media();
    audio.paused = false;
    audio.currentTime = 30;
    video.readyState = 2;
    const dispose = attachTalkVideoMirror(audio, video, new Visibility(), vi.fn());
    try {
      for (const position of [31, 32, 33]) {
        now += 1000;
        audio.currentTime = position;
        video.currentTime = position - 0.6;
        audio.dispatchEvent(new Event('timeupdate'));
        expect(video.currentTime).toBe(position - 0.6);
      }
      now += 1000;
      audio.currentTime = 34;
      video.currentTime = 32.5;
      audio.dispatchEvent(new Event('timeupdate'));
      expect(video.currentTime).toBe(32.5);
      now += 1000;
      audio.currentTime = 35;
      video.currentTime = 32.6;
      audio.dispatchEvent(new Event('timeupdate'));
      expect(video.currentTime).toBe(32.6);
      expect(video.playbackRate).toBe(1.25);
    } finally { dispose(); clock.mockRestore(); }
  });

  it.each(['seeked', 'ratechange', 'pause'])('does not seek backwards to a stale audio sample on %s', (event) => {
    const audio = new Media();
    const video = new Media();
    audio.paused = false;
    audio.currentTime = 30;
    const dispose = attachTalkVideoMirror(audio, video, new Visibility(), vi.fn());
    video.currentTime = 30.6;
    if (event === 'seeked') video.dispatchEvent(new Event(event));
    else audio.dispatchEvent(new Event(event));
    expect(video.currentTime).toBe(30.6);
    audio.dispatchEvent(new Event('timeupdate'));
    expect(video.currentTime).toBe(30.6);
    audio.currentTime = 35;
    video.readyState = 2;
    audio.dispatchEvent(new Event('timeupdate'));
    expect(video.currentTime).toBe(35);
    dispose();
  });

  it('waits for late metadata before consuming the latest audio clock', () => {
    const audio = new Media();
    const video = new Media();
    audio.paused = false;
    audio.currentTime = 30;
    video.readyState = 0;
    const dispose = attachTalkVideoMirror(audio, video, new Visibility(), vi.fn());
    audio.currentTime = 33;
    audio.dispatchEvent(new Event('timeupdate'));
    expect(video.currentTime).toBe(0);
    video.readyState = 1;
    video.dispatchEvent(new Event('loadedmetadata'));
    expect(video.currentTime).toBe(33);
    expect(video.play).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('lets a slow video seek complete before following the advancing audio clock', async () => {
    const audio = new Media();
    const video = new Media();
    audio.paused = false;
    audio.currentTime = 30;
    const dispose = attachTalkVideoMirror(audio, video, new Visibility(), vi.fn());
    video.seeking = true;
    for (const position of [31, 32, 33]) {
      sampledNow += 1000;
      audio.currentTime = position;
      audio.dispatchEvent(new Event('timeupdate'));
    }
    expect(video.currentTime).toBe(30);
    video.seeking = false;
    video.readyState = 2;
    video.dispatchEvent(new Event('seeked'));
    expect(video.currentTime).toBe(30);
    video.currentTime = 30.1;
    audio.dispatchEvent(new Event('timeupdate'));
    expect(video.currentTime).toBe(30.1);
    sampledNow += 1000;
    audio.currentTime = 34;
    audio.dispatchEvent(new Event('timeupdate'));
    sampledNow += 1000;
    audio.currentTime = 35;
    video.currentTime = 30.2;
    audio.dispatchEvent(new Event('timeupdate'));
    expect(video.currentTime).toBe(30.2);
    expect(video.playbackRate).toBe(1.25);
    dispose();
  });

  it.each(['pause', 'hidden'])('recovers from an interrupted pending video play after %s', async (reason) => {
    const audio = new Media();
    const video = new Media();
    const visibility = new Visibility();
    let rejectPlay!: (error: Error) => void;
    video.play.mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectPlay = reject; }));
    const onBlocked = vi.fn();
    const dispose = attachTalkVideoMirror(audio, video, visibility, onBlocked);
    audio.paused = false;
    audio.dispatchEvent(new Event('play'));
    if (reason === 'pause') {
      audio.paused = true;
      audio.dispatchEvent(new Event('pause'));
      audio.paused = false;
      audio.dispatchEvent(new Event('play'));
    } else {
      visibility.hidden = true;
      visibility.dispatchEvent(new Event('visibilitychange'));
      visibility.hidden = false;
      visibility.dispatchEvent(new Event('visibilitychange'));
    }
    rejectPlay(new DOMException('Playback interrupted by pause', 'AbortError'));
    await Promise.resolve();
    await Promise.resolve();
    audio.dispatchEvent(new Event('timeupdate'));
    await Promise.resolve();
    expect(video.play).toHaveBeenCalledTimes(2);
    expect(video.paused).toBe(false);
    expect(onBlocked).not.toHaveBeenCalled();
    expect(audio.pause).not.toHaveBeenCalled();
    dispose();
  });

  it('follows playback, seek and speed, and only pauses the image when hidden', async () => {
    const audio = new Media();
    const video = new Media();
    const visibility = new Visibility();
    const dispose = attachTalkVideoMirror(audio, video, visibility, vi.fn());
    audio.paused = false;
    audio.currentTime = 30;
    audio.playbackRate = 1.5;
    audio.dispatchEvent(new Event('play'));
    await Promise.resolve();
    expect(video.muted).toBe(true);
    expect(video.currentTime).toBe(30);
    expect(video.playbackRate).toBe(1.5);
    expect(video.paused).toBe(false);
    visibility.hidden = true;
    visibility.dispatchEvent(new Event('visibilitychange'));
    expect(video.paused).toBe(true);
    expect(audio.paused).toBe(false);
    expect(audio.pause).not.toHaveBeenCalled();
    audio.currentTime = 45;
    visibility.hidden = false;
    visibility.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(video.currentTime).toBe(45);
    expect(video.paused).toBe(false);
    dispose();
    audio.currentTime = 70;
    audio.dispatchEvent(new Event('timeupdate'));
    expect(video.currentTime).toBe(45);
    expect(video.paused).toBe(true);
    expect(audio.paused).toBe(false);
  });

  it('does not repeatedly retry a blocked video or interrupt audio', async () => {
    const audio = new Media();
    audio.paused = false;
    const video = new Media();
    video.play.mockRejectedValue(new Error('blocked'));
    const onBlocked = vi.fn();
    const dispose = attachTalkVideoMirror(audio, video, new Visibility(), onBlocked);
    await Promise.resolve();
    await Promise.resolve();
    for (let i = 0; i < 5; i++) audio.dispatchEvent(new Event('timeupdate'));
    expect(video.play).toHaveBeenCalledTimes(1);
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(audio.pause).not.toHaveBeenCalled();
    dispose();
  });

  it('keeps a late play resolution paused after the viewer closes', async () => {
    const audio = new Media();
    audio.paused = false;
    const video = new Media();
    let finish: (() => void) | undefined;
    video.play.mockImplementation(() => new Promise<void>((resolve) => {
      finish = () => { video.paused = false; resolve(); };
    }));
    const dispose = attachTalkVideoMirror(audio, video, new Visibility(), vi.fn());
    dispose();
    finish?.();
    await Promise.resolve();
    expect(video.paused).toBe(true);
    expect(audio.pause).not.toHaveBeenCalled();
  });
});
