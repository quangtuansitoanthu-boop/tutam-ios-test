export interface TalkMediaClock extends EventTarget {
  currentTime: number;
  playbackRate: number;
  paused: boolean;
  ended: boolean;
  refreshVideoPosition?(): Promise<void>;
}

export interface TalkVideoSurface extends TalkMediaClock {
  readyState: number;
  seeking: boolean;
  muted: boolean;
  play(): Promise<void>;
  pause(): void;
  src?: string;
  currentSrc?: string;
  getAttribute?(name: string): string | null;
}

export interface TalkVideoGate {
  hold(): () => void;
  wantsPlayback(): boolean;
}

// Âm thanh gốc giữ quyền điều khiển; video chỉ phản chiếu hình khi đang mở.
export function attachTalkVideoMirror(
  audio: TalkMediaClock,
  video: TalkVideoSurface,
  visibility: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>,
  onBlocked: () => void,
  gate?: TalkVideoGate,
): () => void {
  let disposed = false;
  let pendingPlay = false;
  let playInterrupted = false;
  let blocked = false;
  let syncedAudioTime: number | undefined;
  let alignmentPending = true;
  let correctedVideoTime: number | undefined;
  let sampledAudioTime = audio.currentTime;
  let sampledAt = performance.now();
  let previousInterval = 0;
  let driftDirection = 0;
  let sampledVideoTime = video.currentTime;
  let rateCorrection = 0;
  let held = false;
  let releaseHold: (() => void) | undefined;
  let failed = false;
  let sourceGeneration = 0;
  let refreshingPosition = false;
  let refreshGeneration = 0;
  const wantsPlayback = () => gate ? gate.wantsPlayback() : !audio.paused;
  const release = () => {
    const callback = releaseHold;
    releaseHold = undefined;
    held = false;
    callback?.();
  };
  const hold = () => {
    if (!gate || held || visibility.hidden || !wantsPlayback()) return;
    held = true;
    releaseHold = gate.hold();
  };
  video.muted = true;
  const play = async () => {
    const generation = sourceGeneration;
    pendingPlay = true;
    playInterrupted = false;
    try { await video.play(); }
    catch (cause) {
      if (generation !== sourceGeneration) return;
      // Pause/ẩn app có thể hủy play đang chờ; đây không phải lỗi cấm phát.
      if (cause instanceof Error && cause.name === 'AbortError'
        && (playInterrupted || disposed || visibility.hidden || !wantsPlayback() || audio.ended)) return;
      blocked = true;
      hold();
      failed = true;
      if (!gate || visibility.hidden || !wantsPlayback()) release();
      if (!disposed) onBlocked();
    }
    finally {
      if (generation !== sourceGeneration) {
        if (disposed) video.pause();
        return;
      }
      pendingPlay = false;
      if (disposed || visibility.hidden || !wantsPlayback() || audio.ended) video.pause();
    }
  };
  const sync = (event?: Event) => {
    if (disposed) return;
    if (event?.type === 'visibilitychange' && visibility.hidden) {
      refreshGeneration += 1;
      refreshingPosition = false;
    }
    if (event?.type === 'visibilitychange' && !visibility.hidden && gate && audio.refreshVideoPosition) {
      const generation = ++refreshGeneration;
      refreshingPosition = true;
      sourceGeneration += 1;
      pendingPlay = false;
      hold();
      video.pause();
      void audio.refreshVideoPosition().then(() => {
        if (disposed || visibility.hidden || generation !== refreshGeneration) return;
        refreshingPosition = false;
        alignmentPending = true;
        sampledAt = performance.now();
        sampledAudioTime = audio.currentTime;
        previousInterval = 0;
        driftDirection = 0;
        sync();
      }).catch(() => {
        if (disposed || visibility.hidden || generation !== refreshGeneration) return;
        failed = true;
        refreshingPosition = false;
        video.pause();
        onBlocked();
      });
      return;
    }
    if (event?.type === 'loadstart' && event.target === video) {
      sourceGeneration += 1;
      failed = false;
      blocked = false;
      pendingPlay = false;
      alignmentPending = true;
      sampledAt = performance.now();
      sampledAudioTime = audio.currentTime;
      previousInterval = 0;
      driftDirection = 0;
      rateCorrection = 0;
    }
    if (event?.type === 'error' && event.target === video) {
      sourceGeneration += 1;
      pendingPlay = false;
      hold();
      failed = true;
      if (!gate || visibility.hidden || !wantsPlayback()) release();
      video.pause();
      return;
    }
    if (refreshingPosition) {
      if (!wantsPlayback()) release();
      else if (!audio.ended) hold();
      video.pause();
      return;
    }
    const videoEvent = event?.target === video;
    const frameEvent = videoEvent && ['loadeddata', 'seeked', 'playing'].includes(event.type);
    if (visibility.hidden || !wantsPlayback() || audio.ended) release();
    else if (!event || failed || video.readyState < 2 || video.seeking
      || (videoEvent && event.type === 'waiting')
      || (videoEvent && event.type === 'loadstart')
      || (event?.target === audio && event.type === 'seeking')
      || (event?.type === 'videoplaybackintent' && Math.abs(video.currentTime - audio.currentTime) > 0.35)
      || (event?.type === 'visibilitychange' && !visibility.hidden)) hold();
    const audioTime = audio.currentTime;
    let alignedNow = false;
    if (held && event?.type === 'videoplaybackintent' && wantsPlayback()) alignmentPending = true;
    if (held && frameEvent && Math.abs(video.currentTime - audioTime) > 0.35) alignmentPending = true;
    if ((event?.type === 'seeking' || event?.type === 'play') && event.target === audio) {
      alignmentPending = true;
      sampledAt = performance.now();
      sampledAudioTime = audioTime;
      previousInterval = 0;
      driftDirection = 0;
    }
    if (event?.type === 'visibilitychange') {
      alignmentPending = !visibility.hidden;
      sampledAt = performance.now();
      sampledAudioTime = audioTime;
      previousInterval = 0;
      driftDirection = 0;
    }
    if (event?.type === 'ratechange') {
      sampledAt = performance.now();
      sampledAudioTime = audioTime;
      previousInterval = 0;
      driftDirection = 0;
    }
    // Đồng hồ native cập nhật chậm hơn hình. Đo lại nhịp lấy mẫu sau khi mở lại app.
    let tolerance = 0.35;
    const freshSample = event?.type === 'timeupdate' && audioTime !== sampledAudioTime;
    const decodedProgress = video.currentTime > sampledVideoTime;
    if (freshSample) {
      const now = performance.now();
      const interval = (now - sampledAt) / 1000 * audio.playbackRate;
      tolerance = Math.max(tolerance, interval, previousInterval);
      // Tua từ màn hình khóa làm vị trí nhảy xa. Một mẫu tới trễ chỉ lệch theo nhịp cập nhật.
      if (audio.paused || Math.abs(audioTime - sampledAudioTime - interval) > tolerance) alignmentPending = true;
      previousInterval = interval;
      sampledAt = now;
      sampledAudioTime = audioTime;
      sampledVideoTime = video.currentTime;
    }
    // Chỉ tua khi có ý định rõ ràng. Độ lệch khi phát được bù bằng tốc độ
    // hình tối đa 25%, để không bắt bộ giải mã tải lại sau mỗi lần đệm chậm.
    const advanced = correctedVideoTime === undefined || video.currentTime > correctedVideoTime;
    if (!visibility.hidden && !video.seeking && video.readyState >= 1
      && (alignmentPending || (video.readyState >= 2 && advanced && decodedProgress))
      && (alignmentPending || (freshSample && audioTime !== syncedAudioTime))) {
      syncedAudioTime = audioTime;
      const drift = audioTime - video.currentTime;
      const direction = Math.abs(drift) > tolerance ? Math.sign(drift) : 0;
      if (alignmentPending) {
        if (Math.abs(drift) > 0.35) {
          video.currentTime = audioTime;
          correctedVideoTime = audioTime;
          alignedNow = true;
        }
        rateCorrection = 0;
        driftDirection = 0;
      } else {
        rateCorrection = direction !== 0 && direction === driftDirection ? direction * 0.25 : 0;
        driftDirection = direction;
      }
      alignmentPending = false;
    } else if (freshSample) {
      driftDirection = 0;
      rateCorrection = 0;
    }
    if (alignmentPending || audio.paused || audio.ended || visibility.hidden || event?.type === 'ratechange') rateCorrection = 0;
    video.playbackRate = audio.playbackRate * (1 + rateCorrection);
    if (held && !failed && frameEvent && !alignedNow && !alignmentPending && video.readyState >= 2 && !video.seeking
      && Math.abs(video.currentTime - audio.currentTime) <= 0.35) release();
    if (visibility.hidden || !wantsPlayback() || audio.ended || failed) {
      if (pendingPlay) playInterrupted = true;
      video.pause();
    } else if (video.paused && !pendingPlay && !blocked && (
      video.getAttribute ? Boolean(video.getAttribute('src')?.trim())
        : Boolean(video.src?.trim() || video.currentSrc?.trim())
          || (video.src === undefined && video.currentSrc === undefined && video.readyState >= 1)
    )) {
      void play();
    }
  };
  const events = ['play', 'pause', 'ended', 'seeking', 'seeked', 'timeupdate', 'ratechange', 'videoplaybackintent'];
  for (const event of events) audio.addEventListener(event, sync);
  const videoEvents = ['loadstart', 'loadedmetadata', 'loadeddata', 'seeked', 'playing', 'waiting', 'error'];
  for (const event of videoEvents) video.addEventListener(event, sync);
  visibility.addEventListener('visibilitychange', sync);
  sync();
  return () => {
    disposed = true;
    refreshGeneration += 1;
    release();
    for (const event of events) audio.removeEventListener(event, sync);
    for (const event of videoEvents) video.removeEventListener(event, sync);
    visibility.removeEventListener('visibilitychange', sync);
    video.pause();
  };
}
