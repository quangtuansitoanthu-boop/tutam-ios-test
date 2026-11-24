import { canAccessAudioAlbum, getOfflineTrack, type OfflineAudioAccess } from './offline-audio-database';
import { isContentAvailable } from './ios-content-policy';
import { NativeTalkAudio, hasNativeTalkAudio, cacheNativeTalk, nativePlaybackRequested, MEDITATION_AUDIO_ALBUM_ID, ROSARY_AUDIO_ALBUM_ID, type NativeAudioState } from './native-talk-audio';
import { resolveApiUrl } from './native-api';
import publicTalkStreams from '$lib/data/public-talk-streams.json';
import { createAlbumPlayReporter } from './album-plays';
import { createPracticeEvidenceController, type PracticeEvidenceHandle } from './practice-evidence-controller';
import {
  createPracticeSessionOutbox,
  getBrowserPracticeSessionOutbox,
  isPracticeOutboxCapacityError,
  type PracticeSessionClientSession,
} from './practice-session-outbox';
import { fetchWithSessionRefresh } from './session-csrf';
import { ANONYMOUS_STORAGE_PRINCIPAL } from './principal-storage';
import {
  configureMediaSession,
  updateMediaSessionMetadata,
  updateMediaSessionPlaybackState,
  updateMediaSessionPositionState,
} from './media-session';
import {
  applyRemotePlayerSync,
  dispatchAudioStorageEvent,
  pushRecentAlbum,
  readPlayerSyncPayload,
  readStoredRecentAlbums,
  selectAudioSyncPrincipal,
  type StoredPlayerState,
  writeStoredAlbumPosition,
  writeStoredPlayerState,
} from './audio-sync';

export interface AudioTrack {
  title: string;
  url: string;
  media_type?: 'video';
}

export interface AudioAlbum {
  id: string;
  title: string;
  description: string;
  artwork?: string;
  tracks: AudioTrack[];
  visibility?: 'public' | 'private';
}

export interface PracticeAudioLease {
  pause(): void;
  play(): Promise<void>;
  stop(): void;
  refresh(): Promise<void>;
  setVolume(volume: number): void;
}

export interface AudioPlayerSnapshot {
  album: AudioAlbum | null;
  trackIndex: number;
  playing: boolean;
  currentTime: number;
  duration: number;
  speed: number;
  repeat: 0 | 1 | 2;
  volume: number;
  muted: boolean;
  retry: number;
  error: string | null;
  recentAlbumIds: string[];
  sleepTimerRemainingMs: number;
  sleepTimerEndOfTrack: boolean;
}

const RETRY_DELAYS = [2_000, 4_000, 6_000, 8_000] as const;
const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
const BAO_UNG_HIEN_DOI_ALBUM_ID = 'pt_bao_ung_hien_doi';
const PUBLIC_TALK_STREAMS: Record<string, Record<string, string>> = publicTalkStreams;

export type AudioPlayerSession = Omit<PracticeSessionClientSession, 'user'> & {
  user: null | { id: string; role?: string };
};

interface DharmaTalkEvidenceState {
  activeStartedAtMs: number | null;
  clientStartedAtMs: number;
  handle: PracticeEvidenceHandle;
  hidden: boolean;
  hiddenElapsedMs: number;
  playedElapsedMs: number;
  seekCount: number;
  sourceId: string;
}

interface AudioPlayerControllerDependencies {
  nowMs?: () => number;
}

const GUEST_AUDIO_SESSION: AudioPlayerSession = {
  authenticated: false,
  csrfToken: null,
  user: null,
};

function normalizeSession(session: AudioPlayerSession | null | undefined): AudioPlayerSession {
  const principalId = session?.authenticated ? String(session.user?.id ?? '').trim() : '';
  if (!principalId) return { ...GUEST_AUDIO_SESSION };
  return {
    authenticated: true,
    csrfToken: typeof session?.csrfToken === 'string' && session.csrfToken ? session.csrfToken : null,
    user: { id: principalId, role: session?.user?.role?.trim() || 'user' },
  };
}

function sessionPrincipal(session: AudioPlayerSession): string | null {
  return session.authenticated ? session.user?.id ?? null : null;
}

function readAvailableRecentAlbums(): string[] {
  try { return readStoredRecentAlbums(); }
  catch { return []; }
}

export class AudioPlayerController {
  private practicePlayback?: { token: symbol; armed: boolean; onState: (state: NativeAudioState) => void; onInterrupted: () => void; removeAbort: () => void };
  private isPracticeAudio(): boolean {
    return Boolean(this.practicePlayback) || (this.audio instanceof NativeTalkAudio && this.audio.isPracticePlayback);
  }
  readonly audio: HTMLAudioElement | NativeTalkAudio;
  readonly ready: Promise<void>;
  snapshot: AudioPlayerSnapshot = {
    album: null,
    trackIndex: 0,
    playing: false,
    currentTime: 0,
    duration: 0,
    speed: 1,
    repeat: 0,
    volume: 1,
    muted: false,
    retry: 0,
    error: null,
    recentAlbumIds: [],
    sleepTimerRemainingMs: 0,
    sleepTimerEndOfTrack: false
  };

  private listeners = new Set<(snapshot: AudioPlayerSnapshot) => void>();
  private reportAlbumPlay = createAlbumPlayReporter();
  private retryTimer?: ReturnType<typeof setTimeout>;
  private sourceTimeout?: ReturnType<typeof setTimeout>;
  private fallbackStage = 0;
  private fallbackTrack?: AudioTrack;
  private wantsPlayback = false;
  private videoFrameHolds = new Set<symbol>();
  private videoPause?: symbol;
  private videoTrack?: { url: string; generation: number };
  private startingPlay?: symbol;
  private announcingPlay = false;
  private pendingMetadataResume?: () => void;
  private pendingResumeTarget?: { generation: number; seconds: number };
  private pendingSeekTarget?: number;
  private seekPreparation?: Promise<void>;
  private seekRequest?: AbortController;
  private seekMetadataReady?: () => void;
  private loadGeneration = 0;
  private playbackIntentGeneration = 0;
  private objectUrl?: string;
  private lastSavedAt = 0;
  private disposeMediaSession: () => void;
  private sleepTimerId?: ReturnType<typeof setInterval>;
  private sleepTimerLastTick = 0;
  private syncTimer?: ReturnType<typeof setTimeout>;
  private lastRemoteSyncAt = 0;
  private session: AudioPlayerSession;
  private principalId: string | null;
  private principalGeneration = 0;
  private remoteRequests = new Set<AbortController>();
  private practiceOutbox: ReturnType<typeof createPracticeSessionOutbox> | null = null;
  private practiceEvidence: ReturnType<typeof createPracticeEvidenceController> | null = null;
  private dharmaTalkEvidence: DharmaTalkEvidenceState | null = null;
  private practiceEvidenceNotice: string | null = null;
  private readonly nowMs: () => number;
  private readonly onVisibilityChange = () => {
    if (this.isPracticeAudio()) return;
    this.updateDharmaTalkEvidence();
    if (this.dharmaTalkEvidence) this.dharmaTalkEvidence.hidden = document.visibilityState === 'hidden';
    if (this.snapshot.sleepTimerRemainingMs > 0 || this.snapshot.sleepTimerEndOfTrack) {
      this.tickSleepTimer();
    }
    if (document.visibilityState === 'hidden') {
      if (this.videoFrameHolds.size) {
        this.videoFrameHolds.clear();
        if (this.wantsPlayback && this.videoTrack?.generation === this.loadGeneration) void this.play();
      }
      this.savePosition();
      void this.pushRemoteSync(true);
    }
  };
  private readonly onPageHide = () => {
    if (this.isPracticeAudio()) return;
    this.finishDharmaTalkEvidence();
    this.savePosition();
    void this.pushRemoteSync(true);
  };
  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (this.isPracticeAudio()) return;
    if (
      event.defaultPrevented
      || event.isComposing
      || event.altKey
      || event.ctrlKey
      || event.metaKey
      || event.shiftKey
      || !this.snapshot.album
      || this.shortcutTargetIsInteractive(event.target)
    ) return;

    if (event.code === 'Space') {
      event.preventDefault();
      if (this.snapshot.playing) this.pause();
      else void this.play().catch(() => {});
    } else if (event.code === 'ArrowRight') {
      event.preventDefault();
      this.seekBy(5);
    } else if (event.code === 'ArrowLeft') {
      event.preventDefault();
      this.seekBy(-5);
    } else if (event.code === 'KeyM') {
      event.preventDefault();
      this.toggleMute();
    }
  };

  constructor(
    initialSession: AudioPlayerSession = GUEST_AUDIO_SESSION,
    dependencies: AudioPlayerControllerDependencies = {},
  ) {
    this.session = normalizeSession(initialSession);
    this.principalId = sessionPrincipal(this.session);
    this.nowMs = dependencies.nowMs ?? (() => Date.now());
    selectAudioSyncPrincipal(this.principalId);
    this.snapshot = { ...this.snapshot, recentAlbumIds: readAvailableRecentAlbums() };
    try {
      if (typeof localStorage !== 'undefined') {
        this.practiceOutbox = getBrowserPracticeSessionOutbox(fetchWithSessionRefresh, localStorage);
        this.practiceEvidence = createPracticeEvidenceController(this.practiceOutbox, { principalId: () => this.principalId ?? ANONYMOUS_STORAGE_PRINCIPAL });
        this.applyPracticeSession(this.session);
      }
    } catch {
      // Playback remains available when browser storage is blocked.
    }
    this.audio = hasNativeTalkAudio() ? new NativeTalkAudio() : new Audio();
    this.audio.preload = 'metadata';
    this.bindAudioEvents();
    this.disposeMediaSession = this.audio instanceof NativeTalkAudio ? () => {} : configureMediaSession({
      play: () => void this.play(),
      pause: () => this.pause(),
      stop: () => this.pause(),
      next: () => void this.next(),
      previous: () => void this.previous(),
      seekTo: (seconds) => this.seek(seconds),
      seekBackward: (seconds) => this.seekBy(-seconds),
      seekForward: (seconds) => this.seekBy(seconds)
    });
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('pagehide', this.onPageHide);
    window.addEventListener('keydown', this.onKeyDown);
    this.ready = Promise.all([
      this.hydrateRemoteSync(this.principalGeneration),
      this.recoverNativePlayback(),
    ]).then(() => {});
  }

  private async recoverNativePlayback(): Promise<void> {
    const audio = this.audio;
    if (!(audio instanceof NativeTalkAudio)) return;
    const generation = this.loadGeneration;
    try {
      const state = await audio.recover();
      if (!state?.album || generation !== this.loadGeneration) return;
      if (!isContentAvailable(state.album)) { audio.removeAttribute('src'); return; }
      if ([MEDITATION_AUDIO_ALBUM_ID, ROSARY_AUDIO_ALBUM_ID].includes(state.album.id)) return;
      let recoveredAlbum = state.album;
      const sources = PUBLIC_TALK_STREAMS[state.album.id];
      if (sources && state.album.visibility !== 'private') {
        // Native recovery stores the actual URL. Keep progress and downloads keyed by the catalog URL.
        const archiveFirst = state.album.id === BAO_UNG_HIEN_DOI_ALBUM_ID;
        const tracks = state.album.tracks.map(track => {
          const match = Object.entries(sources).find(([id, archive]) => track.url === archive || track.url === this.publicDriveUrl(id));
          if (!match) return track;
          const original = { ...track, url: archiveFirst ? match[1] : `/api/audio/drive/${match[0]}` };
          if (track === state.album?.tracks[state.trackIndex]) {
            this.fallbackTrack = original;
            this.fallbackStage = track.url === match[1] ? 1 : 2;
          }
          return original;
        });
        recoveredAlbum = { ...state.album, visibility: 'public', tracks };
      }
      this.wantsPlayback = nativePlaybackRequested(state);
      this.snapshot = { ...this.snapshot, album: recoveredAlbum, trackIndex: state.trackIndex,
        currentTime: state.position, duration: state.duration, playing: this.wantsPlayback,
        speed: state.speed, repeat: state.repeat ?? 0, volume: state.volume,
        sleepTimerRemainingMs: state.sleepRemainingMs, sleepTimerEndOfTrack: state.sleepAtEnd };
      audio.adopt(state);
      this.reportAlbumPlay.select(state.album.id, this.snapshot.album?.tracks[state.trackIndex]?.url ?? '');
      this.emit();
    } catch { /* No active native session to restore. */ }
  }

  subscribe(listener: (snapshot: AudioPlayerSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  setSession(nextSession: AudioPlayerSession): void {
    const next = normalizeSession(nextSession);
    const nextPrincipalId = sessionPrincipal(next);
    const principalChanged = nextPrincipalId !== this.principalId;
    if (!principalChanged && next.user?.role === this.session.user?.role) {
      this.session = next;
      this.applyPracticeSession(next);
      return;
    }

    this.principalGeneration += 1;
    clearTimeout(this.syncTimer);
    this.syncTimer = undefined;
    this.cancelRemoteRequests();
    try {
      this.finishDharmaTalkEvidence();
      this.savePosition(false);
      this.stopPlaybackForPrincipalChange();
    } catch {
      this.practiceEvidenceNotice = 'Không thể đóng hoàn toàn phiên nghe cũ; tài khoản mới vẫn được chuyển an toàn.';
    } finally {
      this.dharmaTalkEvidence = null;
      this.reportAlbumPlay.reset();
      this.session = next;
      this.principalId = nextPrincipalId;
      this.applyPracticeSession(next);
    }

    selectAudioSyncPrincipal(nextPrincipalId);
    this.lastRemoteSyncAt = 0;
    this.lastSavedAt = 0;
    this.snapshot = {
      ...this.snapshot,
      album: null,
      trackIndex: 0,
      playing: false,
      currentTime: 0,
      duration: 0,
      speed: 1,
      repeat: 0,
      volume: 1,
      muted: false,
      retry: 0,
      error: this.practiceEvidenceNotice,
      recentAlbumIds: readAvailableRecentAlbums(),
      sleepTimerRemainingMs: 0,
      sleepTimerEndOfTrack: false
    };
    this.audio.playbackRate = 1;
    this.audio.volume = 1;
    this.audio.muted = false;
    this.updateMetadata();
    this.emit();
    try { dispatchAudioStorageEvent('quangtu:player-sync-updated', readPlayerSyncPayload()); }
    catch { /* Storage bị chặn không được ngăn thu hồi playback của phiên cũ. */ }
    if (principalChanged) void this.hydrateRemoteSync(this.principalGeneration);
  }

  async load(album: AudioAlbum, trackIndex = 0, resumeSeconds = 0): Promise<boolean> {
    if (!isContentAvailable(album)) return false;
    if (album.visibility === 'private' && (!this.session.authenticated || this.session.user?.role !== 'admin')) return false;
    const track = album.tracks[trackIndex];
    if (!track) {
      this.patch({ error: 'Bài pháp thoại không tồn tại.' });
      return false;
    }
    const generation = ++this.loadGeneration;
    const access: OfflineAudioAccess = { session: this.session, album, isCurrent: () => generation === this.loadGeneration };
    if (this.audio instanceof NativeTalkAudio && !await canAccessAudioAlbum(album, access).catch(() => false)) return false;
    if (generation !== this.loadGeneration) return false;
    this.forgetVideoHolds();
    this.clearPublicSourceTimeout();
    this.setPlaybackIntent(false);
    this.fallbackStage = 0;
    this.fallbackTrack = undefined;
    this.releasePracticePlayback();
    this.finishDharmaTalkEvidence();
    this.pendingSeekTarget = undefined;
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.clearPendingResume();
    this.revokeObjectUrl();
    const offline = await getOfflineTrack(track.url, access).catch(() => null);
    if (generation !== this.loadGeneration) return false;
    const effectiveResume = Math.max(0, resumeSeconds);
    if (effectiveResume >= 10) {
      this.pendingResumeTarget = { generation, seconds: effectiveResume };
      this.pendingMetadataResume = () => {
        const target = this.pendingResumeTarget;
        if (target?.generation === generation && generation === this.loadGeneration) {
          this.seek(target.seconds);
          this.clearPendingResume();
        }
      };
      this.audio.addEventListener('loadedmetadata', this.pendingMetadataResume, { once: true });
    }
    if (this.audio instanceof NativeTalkAudio) {
      // Native MediaSession owns the real player; WebView must not play a second copy.
    } else if (offline?.blob) {
      this.objectUrl = URL.createObjectURL(offline.blob);
      this.audio.src = this.objectUrl;
    } else {
      this.audio.src = resolveApiUrl(track.url);
    }
    let recentAlbumIds: string[];
    try { recentAlbumIds = pushRecentAlbum(album.id); }
    catch {
      // Lịch sử chỉ là tiện ích; thiếu dung lượng lưu không được chặn phát bài.
      recentAlbumIds = [album.id, ...(this.snapshot.recentAlbumIds ?? []).filter(id => id !== album.id)].slice(0, 10);
    }
    this.snapshot = {
      ...this.snapshot,
      album,
      trackIndex,
      currentTime: effectiveResume,
      retry: 0,
      error: null,
      recentAlbumIds
    };
    if (this.audio instanceof NativeTalkAudio) {
      try {
        if (offline?.blob) await cacheNativeTalk(track.url, offline.blob, undefined, () => generation === this.loadGeneration);
        // Migrate earlier WebView downloads, so native playlist advancement also works offline.
        const migrate = async () => {
          const { getOfflineTracksForAlbum } = await import('./offline-audio-database');
          const saved = await getOfflineTracksForAlbum(album.id, access);
          for (const row of saved) {
            if (generation !== this.loadGeneration) return;
            if (row.url !== track.url) await cacheNativeTalk(row.url, row.blob, undefined, () => generation === this.loadGeneration);
          }
        };
        if (typeof navigator !== 'undefined' && navigator.onLine === false) await migrate();
        else void migrate().catch(() => {});
        if (generation !== this.loadGeneration) return false;
        await this.audio.setQueue(album, trackIndex, effectiveResume);
        this.audio.setRepeat(this.snapshot.repeat);
        this.audio.volume = this.snapshot.volume;
        this.audio.muted = this.snapshot.muted;
      } catch {
        if (generation !== this.loadGeneration) return false;
        if (!this.publicSource() || !this.audio.error) {
          this.patch({ playing: false, error: 'Không thể mở trình phát nền. Vui lòng thử lại.' });
          return false;
        }
      }
    }
    if (generation !== this.loadGeneration) return false;
    this.reportAlbumPlay.select(album.id, track.url);
    this.audio.playbackRate = this.snapshot.speed;
    try { dispatchAudioStorageEvent('quangtu:recent-updated', recentAlbumIds); }
    catch { /* Playback vẫn hoạt động khi trình duyệt không cho truy cập storage. */ }
    this.updateMetadata();
    this.emit();
    return generation === this.loadGeneration;
  }

  async playTrack(album: AudioAlbum, index = 0, position = 0): Promise<void> {
    const intent = this.playbackIntentGeneration;
    if (await this.load(album, index, position) && intent === this.playbackIntentGeneration) await this.play();
  }

  /** An explicit Play all action starts one complete pass, independent of repeat-one. */
  async playAll(album: AudioAlbum): Promise<void> {
    const intent = this.playbackIntentGeneration;
    if (!await this.load(album, 0, 0) || intent !== this.playbackIntentGeneration) return;
    this.setRepeat(0);
    await this.play();
  }

  get videoPlaybackRequested(): boolean { return this.wantsPlayback; }

  private get viewingVideo(): boolean {
    const track = this.snapshot.album?.tracks[this.snapshot.trackIndex];
    return Boolean(track && (track.media_type === 'video' || track.url === this.videoTrack?.url));
  }

  private setPlaybackIntent(requested: boolean): void {
    if (this.wantsPlayback === requested) return;
    this.wantsPlayback = requested;
    this.audio.dispatchEvent(new Event('videoplaybackintent'));
  }

  private forgetVideoHolds(): void {
    this.videoFrameHolds.clear();
    this.videoPause = undefined;
    this.videoTrack = undefined;
    this.startingPlay = undefined;
  }

  private pauseForVideoFrame(): void {
    if (this.videoPause || (this.audio.paused && !this.startingPlay)) return;
    const token = this.videoPause = Symbol();
    const completion = this.audio.pause();
    // DOM audio dispatches pause when the command takes effect. Native also
    // acknowledges no-op pauses, which have no corresponding player event.
    if (completion) void completion.finally(() => { if (this.videoPause === token) this.videoPause = undefined; });
  }

  holdVideoPlayback(url: string): () => void {
    if (!url || this.snapshot.album?.tracks[this.snapshot.trackIndex]?.url !== url || document.visibilityState === 'hidden') return () => {};
    const generation = this.loadGeneration;
    this.videoTrack = { url, generation };
    const lease = Symbol();
    this.videoFrameHolds.add(lease);
    if (this.videoFrameHolds.size === 1) {
      this.suspendDharmaTalkEvidence();
      this.pauseForVideoFrame();
      if (this.wantsPlayback && !this.snapshot.playing) this.patch({ playing: true });
    }
    return () => {
      if (!this.videoFrameHolds.delete(lease) || this.videoFrameHolds.size || !this.wantsPlayback || generation !== this.loadGeneration) return;
      void this.play();
    };
  }

  async play(): Promise<void> {
    if (!this.audio.src || this.announcingPlay) return;
    this.announcingPlay = true;
    try { this.setPlaybackIntent(true); }
    finally { this.announcingPlay = false; }
    if (!this.wantsPlayback) return;
    if (this.videoFrameHolds.size) {
      this.patch({ playing: true, error: null });
      return;
    }
    const generation = this.loadGeneration;
    const intent = this.playbackIntentGeneration;
    const source = this.audio.src;
    if (this.audio.error && this.tryPublicSourceFallback()) return;
    this.armPublicSourceTimeout();
    if (this.seekPreparation) {
      await this.seekPreparation;
      if (generation !== this.loadGeneration || intent !== this.playbackIntentGeneration || this.videoFrameHolds.size) return;
    }
    const attempt = this.startingPlay = Symbol();
    try {
      if (this.audio.ended) this.seek(0);
      if (this.videoFrameHolds.size) return;
      if (this.audio instanceof NativeTalkAudio) {
        await this.audio.play(() => generation === this.loadGeneration && intent === this.playbackIntentGeneration
          && this.wantsPlayback && !this.videoFrameHolds.size && this.startingPlay === attempt);
      } else await this.audio.play();
      if (this.startingPlay !== attempt) return;
    } catch (cause) {
      if (this.startingPlay !== attempt || this.videoFrameHolds.size || generation !== this.loadGeneration || intent !== this.playbackIntentGeneration || source !== this.audio.src
        || (cause instanceof Error && cause.name === 'AbortError')) return;
      if (!(cause instanceof Error && cause.name === 'NotAllowedError') && this.tryPublicSourceFallback()) return;
      if (this.viewingVideo) this.setPlaybackIntent(false);
      this.patch({
        playing: false,
        error: this.snapshot.retry > 0 ? this.snapshot.error
          : cause instanceof Error && cause.name === 'NotAllowedError'
            ? 'Chạm nút Phát để tiếp tục nghe.'
            : 'Không thể phát bài — vui lòng kiểm tra kết nối hoặc thử bài khác.',
      });
      return;
    } finally {
      if (this.startingPlay === attempt) this.startingPlay = undefined;
    }
    if (this.videoFrameHolds.size || generation !== this.loadGeneration || intent !== this.playbackIntentGeneration || source !== this.audio.src) return;
    const target = this.pendingResumeTarget;
    if (target?.generation === this.loadGeneration) {
      this.seek(target.seconds);
      this.clearPendingResume();
    }
  }

  pause(): void {
    this.setPlaybackIntent(false);
    this.clearPublicSourceTimeout();
    this.playbackIntentGeneration += 1;
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.audio.pause();
    this.patch({ playing: false, retry: 0, ...(this.snapshot.retry > 0 ? { error: null } : {}) });
    this.savePosition();
    void this.pushRemoteSync();
  }

  seek(seconds: number): void {
    if (!Number.isFinite(seconds)) return;
    if (this.dharmaTalkEvidence) this.dharmaTalkEvidence.seekCount += 1;
    const currentTime = Math.max(0, Math.min(seconds, this.audio.duration || seconds));
    this.pendingSeekTarget = currentTime;
    this.patch({ currentTime });
    if (this.seekPreparation) return;
    if (!(this.audio instanceof NativeTalkAudio) && !this.objectUrl && currentTime > 0 && this.audio.seekable) {
      const ranges = this.audio.seekable;
      let seekable = false;
      for (let index = 0; index < ranges.length; index += 1) {
        if (ranges.end(index) > ranges.start(index) && currentTime >= ranges.start(index) && currentTime <= ranges.end(index)) seekable = true;
      }
      if (!seekable && /^(https?:|\/)/u.test(this.audio.src)) {
        this.prepareSeekSource();
        return;
      }
    }
    try {
      this.audio.currentTime = currentTime;
      if (Math.abs((this.audio.currentTime || 0) - currentTime) <= 0.25) this.pendingSeekTarget = undefined;
    } catch { /* Metadata may still be loading; the pending target is retried. */ }
  }

  /** Load once only when the streaming source cannot seek. No persistent cache or D1 reads. */
  private prepareSeekSource(): void {
    const generation = this.loadGeneration;
    const intent = this.playbackIntentGeneration;
    const resume = this.snapshot.playing;
    const source = this.audio.src;
    const request = new AbortController();
    this.seekRequest = request;
    this.seekPreparation = (async () => {
      try {
        const response = await fetch(source, { signal: request.signal });
        if (!response.ok) throw new Error(`audio_seek_${response.status}`);
        const blob = await response.blob();
        if (request.signal.aborted || generation !== this.loadGeneration) return;
        this.objectUrl = URL.createObjectURL(blob);
        this.seekMetadataReady = () => {
          this.seekMetadataReady = undefined;
          if (generation === this.loadGeneration) this.applyPendingSeek();
        };
        this.audio.addEventListener('loadedmetadata', this.seekMetadataReady, { once: true });
        this.audio.src = this.objectUrl;
        this.audio.playbackRate = this.snapshot.speed;
        if (resume && intent === this.playbackIntentGeneration) void this.play();
      } catch {
        if (!request.signal.aborted && generation === this.loadGeneration) {
          this.pendingSeekTarget = undefined;
          this.patch({ currentTime: this.audio.currentTime || 0, error: 'Không thể tua bài — vui lòng kiểm tra kết nối rồi thử lại.' });
        }
      } finally {
        if (this.seekRequest === request) {
          this.seekRequest = undefined;
          this.seekPreparation = undefined;
        }
      }
    })();
  }

  seekBy(seconds: number): void {
    if (!Number.isFinite(seconds)) return;
    // Use the published snapshot as the base position. Mobile WebKit can
    // report the previous media time for one task after a seek assignment;
    // reading the element directly here would make a quick -10/+30 sequence
    // lose the second seek even though the UI already reflects the first.
    this.seek(this.snapshot.currentTime + seconds);
  }

  async next(): Promise<void> {
    const album = this.snapshot.album;
    if (!album) return;
    const nextIndex = this.snapshot.trackIndex + 1;
    if (nextIndex < album.tracks.length) {
      await this.playTrack(album, nextIndex);
    } else if (this.snapshot.repeat === 2) {
      await this.playTrack(album, 0);
    }
  }

  async previous(): Promise<void> {
    const album = this.snapshot.album;
    if (!album) return;
    if (this.audio.currentTime > 3 || this.snapshot.trackIndex === 0) return this.seek(0);
    await this.playTrack(album, this.snapshot.trackIndex - 1);
  }

  cycleSpeed(): void {
    const index = (SPEEDS.indexOf(this.snapshot.speed as (typeof SPEEDS)[number]) + 1) % SPEEDS.length;
    const speed = SPEEDS[index];
    this.audio.playbackRate = speed;
    this.snapshot = { ...this.snapshot, speed };
    this.emit();
  }

  setSpeed(speed: number): void {
    if (!SPEEDS.includes(speed as (typeof SPEEDS)[number])) return;
    this.audio.playbackRate = speed;
    this.snapshot = { ...this.snapshot, speed };
    this.emit();
  }

  cycleRepeat(): void {
    this.setRepeat(((this.snapshot.repeat + 1) % 3) as 0 | 1 | 2);
  }

  setRepeat(repeat: 0 | 1 | 2): void {
    this.snapshot = { ...this.snapshot, repeat };
    if (this.audio instanceof NativeTalkAudio) this.audio.setRepeat(repeat);
    this.emit();
  }

  setVolume(volume: number): void {
    if (!Number.isFinite(volume)) return;
    const nextVolume = Math.max(0, Math.min(1, volume));
    this.audio.volume = nextVolume;
    this.patch({ volume: nextVolume });
  }

  toggleMute(): void {
    this.audio.muted = !this.audio.muted;
    this.patch({ muted: this.audio.muted });
  }

  /**
   * Ends the visible playback session without destroying the reusable
   * application-wide controller. The current position is persisted first so
   * opening the album again can still offer to resume.
   */
  close(): void {
    this.forgetVideoHolds();
    this.setPlaybackIntent(false);
    this.clearPublicSourceTimeout();
    this.releasePracticePlayback();
    this.finishDharmaTalkEvidence();
    this.loadGeneration += 1;
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.clearSleepTimer();
    this.savePosition();
    this.clearPendingResume();
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.revokeObjectUrl();
    this.snapshot = {
      ...this.snapshot,
      album: null,
      trackIndex: 0,
      playing: false,
      currentTime: 0,
      duration: 0,
      retry: 0,
      error: null,
      sleepTimerRemainingMs: 0,
      sleepTimerEndOfTrack: false
    };
    this.updateMetadata();
    this.emit();
  }

  destroy(): void {
    this.forgetVideoHolds();
    this.setPlaybackIntent(false);
    this.clearPublicSourceTimeout();
    this.releasePracticePlayback();
    this.finishDharmaTalkEvidence();
    this.reportAlbumPlay.reset();
    this.loadGeneration += 1;
    clearTimeout(this.retryTimer);
    clearTimeout(this.syncTimer);
    this.cancelRemoteRequests();
    this.clearSleepTimer();
    this.savePosition(false);
    this.clearPendingResume();
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    if (this.audio instanceof NativeTalkAudio) this.audio.dispose();
    this.revokeObjectUrl();
    this.disposeMediaSession();
    updateMediaSessionPlaybackState('none');
    updateMediaSessionMetadata(null);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('pagehide', this.onPageHide);
    window.removeEventListener('keydown', this.onKeyDown);
    this.listeners.clear();
  }

  private releasePracticePlayback(): void {
    const slot = this.practicePlayback;
    if (!slot) return;
    this.practicePlayback = undefined;
    slot.removeAbort();
    if (this.audio instanceof NativeTalkAudio) this.audio.setSleep(0, false);
    slot.onInterrupted();
  }

  async refreshPracticePlayback(): Promise<void> {
    if (this.practicePlayback && this.audio instanceof NativeTalkAudio) await this.audio.refreshState();
  }

  /** Mượn transport root, không ghi nhạc thiền vào lịch sử/sync/bằng chứng pháp thoại. */
  async beginPracticePlayback(
    album: AudioAlbum, remainingMs: number,
    onState: (state: NativeAudioState) => void, onInterrupted: () => void, signal?: AbortSignal,
    options: { finite?: boolean; volume?: number; onStartupStep?: (step: string) => void } = {},
  ): Promise<PracticeAudioLease | null> {
    options.onStartupStep?.('player-ready');
    const audio = this.audio;
    if (!(audio instanceof NativeTalkAudio) || !Number.isFinite(remainingMs) || remainingMs <= 0 || signal?.aborted) return null;
    const generation = this.loadGeneration;
    const principal = this.principalGeneration;
    await this.ready;
    if (generation !== this.loadGeneration || principal !== this.principalGeneration || signal?.aborted) return null;
    this.close();
    const slot = { token: Symbol(), armed: false, onState, onInterrupted, removeAbort: () => {} };
    this.practicePlayback = slot;
    const owns = () => this.practicePlayback === slot;
    const abort = () => { if (owns()) this.close(); };
    signal?.addEventListener('abort', abort, { once: true });
    slot.removeAbort = () => signal?.removeEventListener('abort', abort);
    try {
      options.onStartupStep?.('set-queue');
      await audio.setQueue(album, 0, 0);
      if (!owns()) return null;
      audio.playbackRate = 1;
      audio.setRepeat(options.finite ? 0 : 1);
      const hasExplicitVolume = options.volume !== undefined && Number.isFinite(options.volume);
      audio.muted = hasExplicitVolume ? false : this.snapshot.muted;
      audio.volume = hasExplicitVolume ? Math.max(0, Math.min(1, options.volume!)) : this.snapshot.volume;
      audio.setSleep(options.finite ? 0 : remainingMs, false);
      options.onStartupStep?.('play');
      await audio.play();
      if (!owns()) return null;
      slot.armed = true;
      options.onStartupStep?.('read-player-state');
      await audio.refreshState();
      if (!owns()) return null;
      if (audio.error) throw new Error(audio.error.message);
    } catch (cause) {
      if (owns()) this.close();
      throw cause;
    }
    return {
      pause: () => { if (owns()) audio.pause(); },
      play: async () => { if (owns()) await audio.play(); },
      stop: () => { if (owns()) this.close(); },
      refresh: async () => { if (owns()) await audio.refreshState(); },
      setVolume: (volume: number) => {
        if (!owns() || !Number.isFinite(volume)) return;
        const clamped = Math.max(0, Math.min(1, volume));
        audio.muted = false;
        audio.volume = clamped;
      },
    };
  }

  setSleepTimer(minutes: number): void {
    this.clearSleepTimer();
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    this.snapshot = {
      ...this.snapshot,
      sleepTimerRemainingMs: Math.round(minutes * 60_000),
      sleepTimerEndOfTrack: false
    };
    this.sleepTimerLastTick = this.nowMs();
    if (this.audio instanceof NativeTalkAudio) {
      this.audio.setSleep(this.snapshot.sleepTimerRemainingMs, false);
      this.emit();
      return;
    }
    this.sleepTimerId = setInterval(() => this.tickSleepTimer(), 1_000);
    this.emit();
  }

  setSleepTimerEndOfTrack(): void {
    this.clearSleepTimer();
    const duration = this.audio.duration || this.snapshot.duration || 0;
    const current = this.audio.currentTime || this.snapshot.currentTime || 0;
    const remainingMs = duration > 0 ? Math.max(0, Math.round((duration - current) * 1_000)) : 0;
    this.snapshot = {
      ...this.snapshot,
      sleepTimerRemainingMs: remainingMs,
      sleepTimerEndOfTrack: true
    };
    this.sleepTimerLastTick = this.nowMs();
    if (this.audio instanceof NativeTalkAudio) {
      this.audio.setSleep(0, true);
      this.emit();
      return;
    }
    this.sleepTimerId = setInterval(() => this.tickSleepTimer(), 1_000);
    this.emit();
  }

  clearSleepTimer(): void {
    if (this.audio instanceof NativeTalkAudio) this.audio.setSleep(0, false);
    if (this.sleepTimerId) clearInterval(this.sleepTimerId);
    this.sleepTimerId = undefined;
    if (this.snapshot.sleepTimerRemainingMs !== 0 || this.snapshot.sleepTimerEndOfTrack) {
      this.snapshot = {
        ...this.snapshot,
        sleepTimerRemainingMs: 0,
        sleepTimerEndOfTrack: false
      };
      this.emit();
    }
  }

  private bindAudioEvents(): void {
    if (this.audio instanceof NativeTalkAudio) {
      this.audio.addEventListener('trackchange', event => {
        if (this.isPracticeAudio()) return;
        const index = (event as CustomEvent<number>).detail;
        const album = this.snapshot.album;
        if (!album?.tracks[index] || index === this.snapshot.trackIndex) return;
        this.forgetVideoHolds();
        this.setPlaybackIntent(false);
        this.clearPublicSourceTimeout();
        this.finishDharmaTalkEvidence();
        this.clearPendingResume();
        this.pendingSeekTarget = undefined;
        this.snapshot = { ...this.snapshot, trackIndex: index, currentTime: this.audio.currentTime, duration: this.audio.duration };
        this.setPlaybackIntent(!this.audio.paused && !this.audio.ended);
        this.reportAlbumPlay.select(album.id, album.tracks[index].url);
        this.emit();
        if (this.snapshot.playing) this.resumeDharmaTalkEvidence();
      });
      this.audio.addEventListener('nativesleep', event => {
        if (this.practicePlayback) {
          if (this.practicePlayback.armed) this.practicePlayback.onState((event as CustomEvent<NativeAudioState>).detail);
          return;
        }
        if (this.audio instanceof NativeTalkAudio && this.audio.isPracticePlayback) return;
        const state = (event as CustomEvent<NativeAudioState>).detail;
        if (this.videoFrameHolds.size && this.wantsPlayback && !state.playWhenReady && !state.sleepAtEnd
          && !state.sleepRemainingMs && (this.snapshot.sleepTimerRemainingMs > 0 || this.snapshot.sleepTimerEndOfTrack)) {
          this.setPlaybackIntent(false);
          this.patch({ playing: false });
        }
        this.snapshot = { ...this.snapshot, speed: state.speed, sleepTimerRemainingMs: state.sleepRemainingMs, sleepTimerEndOfTrack: state.sleepAtEnd };
      });
    }
    this.audio.addEventListener('play', () => {
      if (this.isPracticeAudio()) return;
      if (this.viewingVideo && !this.startingPlay && !this.videoPause) this.setPlaybackIntent(true);
      if (this.videoFrameHolds.size) {
        this.pauseForVideoFrame();
        this.patch({ playing: this.wantsPlayback });
        return;
      }
      this.sleepTimerLastTick = this.nowMs();
      this.patch({ playing: true, error: null });
    });
    this.audio.addEventListener('pause', () => {
      if (this.isPracticeAudio()) return;
      this.suspendDharmaTalkEvidence();
      if (this.snapshot.sleepTimerRemainingMs > 0 && !this.snapshot.sleepTimerEndOfTrack) {
        const now = this.nowMs();
        const elapsed = Math.max(0, now - this.sleepTimerLastTick);
        const remaining = Math.max(0, this.snapshot.sleepTimerRemainingMs - elapsed);
        this.snapshot = {
          ...this.snapshot,
          sleepTimerRemainingMs: remaining
        };
        this.sleepTimerLastTick = now;
      }
      if (this.videoPause) {
        if (!(this.audio instanceof NativeTalkAudio)) this.videoPause = undefined;
        if (this.wantsPlayback) return;
      }
      if (this.viewingVideo) this.setPlaybackIntent(false);
      this.patch({ playing: false });
    });
    this.audio.addEventListener('loadedmetadata', () => {
      if (this.isPracticeAudio()) return;
      this.patch({ duration: this.audio.duration || 0 });
      this.applyPendingSeek();
      if (this.snapshot.sleepTimerEndOfTrack) {
        this.tickSleepTimer();
      }
    });
    this.audio.addEventListener('canplay', () => this.applyPendingSeek());
    this.audio.addEventListener('durationchange', () => this.applyPendingSeek());
    this.audio.addEventListener('timeupdate', () => {
      if (this.isPracticeAudio()) return;
      if (this.applyPendingSeek()) return;
      const current = this.audio.currentTime || 0;
      const updates: Partial<AudioPlayerSnapshot> = { currentTime: current };
      this.patch(updates);
      if (this.snapshot.sleepTimerRemainingMs > 0 || this.snapshot.sleepTimerEndOfTrack) {
        this.tickSleepTimer();
      }
      if (!this.videoFrameHolds.size && !this.videoPause && Date.now() - this.lastSavedAt > 2_000) this.savePosition();
    });
    this.audio.addEventListener('playing', () => {
      if (this.isPracticeAudio()) return;
      if (this.videoFrameHolds.size) {
        this.pauseForVideoFrame();
        return;
      }
      this.clearPublicSourceTimeout();
      if (this.snapshot.album) void this.reportAlbumPlay.playing();
      this.resumeDharmaTalkEvidence();
      this.patch({ retry: 0, error: this.practiceEvidenceNotice });
    });
    this.audio.addEventListener('waiting', () => {
      this.suspendDharmaTalkEvidence();
      if (!this.isPracticeAudio()) this.armPublicSourceTimeout();
    });
    this.audio.addEventListener('ended', () => {
      if (this.isPracticeAudio()) return;
      if (this.viewingVideo) this.setPlaybackIntent(false);
      this.clearPublicSourceTimeout();
      this.reportAlbumPlay.ended();
      this.finishDharmaTalkEvidence();
      // Android advances/repeats its complete playlist without waking WebView.
      // STATE_ENDED means that native queue is finished, never an instruction to reload it.
      if (this.audio instanceof NativeTalkAudio) {
        this.patch({ playing: false });
        this.savePosition();
        return;
      }
      if (this.snapshot.sleepTimerEndOfTrack) {
        this.clearSleepTimer();
        this.pause();
        return;
      }
      if (this.snapshot.repeat === 1) {
        this.seek(0);
        void this.play();
      } else if (this.snapshot.album && (this.snapshot.trackIndex < this.snapshot.album.tracks.length - 1 || this.snapshot.repeat === 2)) {
        void this.next();
      } else {
        this.patch({ playing: false });
        this.savePosition();
      }
    });
    this.audio.addEventListener('error', () => { if (!this.isPracticeAudio()) this.handleError(); });
  }

  private clearPendingResume(): void {
    this.pendingResumeTarget = undefined;
    if (this.pendingMetadataResume) {
      this.audio.removeEventListener('loadedmetadata', this.pendingMetadataResume);
      this.pendingMetadataResume = undefined;
    }
  }

  private applyPendingSeek(): boolean {
    if (this.seekPreparation && !this.objectUrl) return true;
    const pending = this.pendingSeekTarget;
    if (pending === undefined) return false;
    const duration = this.audio.duration;
    const target = Number.isFinite(duration) && duration > 0 ? Math.min(pending, duration) : pending;
    // Metadata tới muộn có thể cho biết bài ngắn hơn thời điểm người dùng đã tua.
    this.pendingSeekTarget = target;
    const actual = this.audio.currentTime || 0;
    if (Math.abs(actual - target) <= 0.25) {
      this.pendingSeekTarget = undefined;
      if (pending !== target) this.patch({ currentTime: actual });
      return false;
    }
    try {
      this.audio.currentTime = target;
    } catch {
      return false;
    }
    this.patch({ currentTime: target });
    return true;
  }

  private publicSource() {
    const { album, trackIndex } = this.snapshot;
    const track = album?.tracks[trackIndex];
    if (album?.visibility !== 'public' || !track || track.media_type === 'video' || this.objectUrl) return;
    const sources = PUBLIC_TALK_STREAMS[album.id];
    if (!sources) return;
    const proxyId = /^\/api\/audio\/drive\/([\w-]+)$/u.exec(track.url)?.[1];
    const id = proxyId ?? (album.id === BAO_UNG_HIEN_DOI_ALBUM_ID
      ? Object.keys(sources).find(key => sources[key] === track.url)
      : undefined);
    const archive = id && sources[id];
    if (id && archive) return { album, track, id, archive, trackIndex };
  }

  private armPublicSourceTimeout(): void {
    if (!this.wantsPlayback || this.sourceTimeout || !this.publicSource()) return;
    this.sourceTimeout = setTimeout(() => {
      this.sourceTimeout = undefined;
      if (!this.tryPublicSourceFallback()) {
        this.wantsPlayback = false;
        this.audio.pause();
        this.patch({ playing: false, error: 'Không thể phát bài — vui lòng kiểm tra kết nối mạng.' });
      }
    }, 8_000);
  }

  private clearPublicSourceTimeout(): void {
    clearTimeout(this.sourceTimeout);
    this.sourceTimeout = undefined;
  }

  private publicDriveUrl(id: string): string {
    return `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
  }

  private tryPublicSourceFallback(): boolean {
    if (!this.wantsPlayback) return false;
    const source = this.publicSource();
    if (!source) return false;
    if (this.fallbackTrack !== source.track) {
      this.fallbackTrack = source.track;
      // Bản Báo Ứng Hiện Đời đã dùng Archive làm URL gốc.
      this.fallbackStage = source.track.url === source.archive ? 1 : 0;
    }
    if (this.fallbackStage >= 2) return false;
    this.clearPublicSourceTimeout();
    const stage = ++this.fallbackStage;
    const url = stage === 1 ? source.archive : this.publicDriveUrl(source.id);
    const generation = this.loadGeneration;
    const intent = this.playbackIntentGeneration;
    const position = this.pendingSeekTarget ?? (this.audio.currentTime || this.snapshot.currentTime);
    const audio = this.audio;
    const isCurrent = () => generation === this.loadGeneration && intent === this.playbackIntentGeneration
      && stage === this.fallbackStage && this.snapshot.album === source.album && this.snapshot.trackIndex === source.trackIndex;
    const switchSource = async () => {
      if (audio instanceof NativeTalkAudio) {
        const tracks = source.album.tracks.map((track, index) => index === source.trackIndex ? { ...track, url } : track);
        await audio.setQueue({ ...source.album, tracks }, source.trackIndex, position);
        if (!isCurrent()) return;
        audio.setRepeat(this.snapshot.repeat);
        audio.playbackRate = this.snapshot.speed;
        audio.volume = this.snapshot.volume;
        audio.muted = this.snapshot.muted;
        audio.setSleep(this.snapshot.sleepTimerRemainingMs, this.snapshot.sleepTimerEndOfTrack);
      } else {
        this.pendingSeekTarget = position > 0 ? position : undefined;
        audio.src = url;
      }
      await this.play();
    };
    void switchSource().catch(() => {
      if (isCurrent() && !this.tryPublicSourceFallback()) {
        this.patch({ playing: false, error: 'Không thể phát bài — vui lòng kiểm tra kết nối mạng.' });
      }
    });
    return true;
  }

  private handleError(): void {
    if (!this.audio.error || this.audio.error.code === MediaError.MEDIA_ERR_ABORTED) return;
    if (this.tryPublicSourceFallback()) return;
    if (this.publicSource() && this.fallbackStage >= 2) {
      this.clearPublicSourceTimeout();
      this.wantsPlayback = false;
      this.patch({ playing: false, retry: 0, error: 'Không thể phát bài — vui lòng kiểm tra kết nối mạng.' });
      return;
    }
    console.error('[AudioPlayer] Audio playback error:', {
      code: this.audio.error.code,
      message: this.audio.error.message,
      src: this.audio.src,
      trackTitle: this.snapshot.album?.tracks[this.snapshot.trackIndex]?.title
    });
    if (this.audio.error.code === MediaError.MEDIA_ERR_NETWORK && this.snapshot.retry < RETRY_DELAYS.length) {
      const generation = this.loadGeneration;
      const retry = this.snapshot.retry + 1;
      const position = this.audio.currentTime || this.snapshot.currentTime;
      const source = this.audio.src;
      this.patch({ retry, error: `Lỗi mạng, đang thử lại (${retry}/4)…` });
      clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => {
        if (generation !== this.loadGeneration) return;
        this.audio.src = source;
        this.audio.addEventListener('loadedmetadata', () => {
          if (generation === this.loadGeneration) this.seek(position);
        }, { once: true });
        void this.play().catch(() => {});
      }, RETRY_DELAYS[retry - 1]);
      return;
    }
    if (this.viewingVideo) this.setPlaybackIntent(false);
    this.patch({ retry: 0, error: 'Không thể phát bài — vui lòng kiểm tra kết nối mạng.' });
  }

  private savePosition(pushRemote = true): boolean {
    const album = this.snapshot.album;
    if (!album) return true;
    const savedAt = Date.now();
    // Khi metadata chưa sẵn sàng, mốc khôi phục/tua đã chọn đáng tin hơn media time 0 tạm thời.
    const pendingPosition = this.pendingSeekTarget ?? this.pendingResumeTarget?.seconds;
    const state: StoredPlayerState = {
      albumId: album.id,
      trackIndex: this.snapshot.trackIndex,
      pos: pendingPosition !== undefined && Number.isFinite(pendingPosition) ? pendingPosition : this.audio.currentTime || 0,
      savedAt,
      albumTitle: album.title,
      trackTitle: album.tracks[this.snapshot.trackIndex]?.title ?? '',
      trackUrl: album.tracks[this.snapshot.trackIndex]?.url ?? '',
      artwork: album.artwork,
      description: album.description
    };
    this.lastSavedAt = savedAt;
    try {
      writeStoredPlayerState(state);
      writeStoredAlbumPosition(state);
      dispatchAudioStorageEvent('quangtu:player-sync-updated', readPlayerSyncPayload());
    } catch {
      // Playback teardown and navigation must remain available when browser
      // storage is unavailable, full, or blocked by privacy settings.
      return false;
    }
    if (pushRemote) void this.pushRemoteSync();
    return true;
  }

  private applyPracticeSession(session: AudioPlayerSession): void {
    if (!this.practiceOutbox) return;
    this.practiceOutbox.setSession(session);
    if (this.practiceOutbox.getStatus().phase === 'pending') void this.practiceOutbox.flush().catch(() => undefined);
  }

  private resumeDharmaTalkEvidence(): void {
    const album = this.snapshot.album;
    if (!album) return;
    const now = this.nowMs();
    const sourceId = `${album.id}:${this.snapshot.trackIndex}`;
    if (!this.dharmaTalkEvidence || this.dharmaTalkEvidence.sourceId !== sourceId) {
      this.finishDharmaTalkEvidence(now);
      const duration = this.audio.duration;
      const targetDurationSeconds = Math.floor(duration);
      let handle: PracticeEvidenceHandle | undefined;
      try {
        handle = this.practiceEvidence?.start({
          activityType: 'dharma_talk',
          sourceId,
          sourceKind: 'dharma_talk',
          targetCount: null,
          targetDurationSeconds: Number.isSafeInteger(targetDurationSeconds)
            && targetDurationSeconds >= 1
            && targetDurationSeconds <= 86_400
            ? targetDurationSeconds
            : null,
        });
        this.practiceEvidenceNotice = null;
      } catch (cause) {
        this.reportPracticeEvidenceFailure(cause);
        return;
      }
      if (!handle) return;
      this.dharmaTalkEvidence = {
        activeStartedAtMs: now,
        clientStartedAtMs: now,
        handle,
        hidden: document.visibilityState === 'hidden',
        hiddenElapsedMs: 0,
        playedElapsedMs: 0,
        seekCount: 0,
        sourceId,
      };
      return;
    }
    if (this.dharmaTalkEvidence.activeStartedAtMs === null) {
      this.dharmaTalkEvidence.activeStartedAtMs = now;
      this.dharmaTalkEvidence.hidden = document.visibilityState === 'hidden';
    }
  }

  private updateDharmaTalkEvidence(observedAtMs = this.nowMs()): void {
    const state = this.dharmaTalkEvidence;
    if (!state || state.activeStartedAtMs === null) return;
    const elapsed = Math.max(0, observedAtMs - state.activeStartedAtMs);
    state.playedElapsedMs += elapsed;
    if (state.hidden) state.hiddenElapsedMs += elapsed;
    state.activeStartedAtMs = observedAtMs;
  }

  private suspendDharmaTalkEvidence(): void {
    const state = this.dharmaTalkEvidence;
    if (!state || state.activeStartedAtMs === null) return;
    this.updateDharmaTalkEvidence();
    state.activeStartedAtMs = null;
  }

  private finishDharmaTalkEvidence(observedAtMs = this.nowMs()): void {
    const state = this.dharmaTalkEvidence;
    if (!state) return;
    this.updateDharmaTalkEvidence(observedAtMs);
    const album = this.snapshot.album;
    const track = album?.tracks[this.snapshot.trackIndex];
    const albumTitle = album?.title ?? '';
    const trackTitle = track?.title ?? '';
    const talkTitle = trackTitle ? `${albumTitle} - ${trackTitle}` : albumTitle;
    try {
      this.practiceEvidence?.finish(state.handle, {
        clientElapsedSeconds: Math.max(0, Math.floor((observedAtMs - state.clientStartedAtMs) / 1_000)),
        hiddenSeconds: Math.max(0, Math.floor(state.hiddenElapsedMs / 1_000)),
        playedSeconds: Math.max(0, Math.floor(state.playedElapsedMs / 1_000)),
        seekCount: state.seekCount,
        dharmaTalk: {
          albumId: album?.id ?? '',
          albumTitle,
          trackTitle,
        },
        title: talkTitle,
      });
    } catch (cause) {
      this.reportPracticeEvidenceFailure(cause);
    } finally {
      this.dharmaTalkEvidence = null;
    }
  }

  private reportPracticeEvidenceFailure(cause: unknown): void {
    this.practiceEvidenceNotice = isPracticeOutboxCapacityError(cause)
      ? 'Hàng đợi tu tập ngoại tuyến đã đầy; phiên nghe này chưa được ghi nhận.'
      : 'Không thể lưu bằng chứng nghe Pháp thoại trên thiết bị; phiên này chưa được ghi nhận.';
    this.patch({ error: this.practiceEvidenceNotice });
  }

  private stopPlaybackForPrincipalChange(): void {
    this.forgetVideoHolds();
    this.setPlaybackIntent(false);
    this.clearPublicSourceTimeout();
    this.releasePracticePlayback();
    this.loadGeneration += 1;
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.clearPendingResume();
    if (this.sleepTimerId) clearInterval(this.sleepTimerId);
    this.sleepTimerId = undefined;
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.revokeObjectUrl();
  }

  private cancelRemoteRequests(): void {
    for (const controller of this.remoteRequests) controller.abort();
    this.remoteRequests.clear();
  }

  private updateMetadata(): void {
    if (this.audio instanceof NativeTalkAudio) return;
    const album = this.snapshot.album;
    const track = album?.tracks[this.snapshot.trackIndex];
    updateMediaSessionMetadata(album && track ? {
      title: track.title,
      artist: album.description || 'Tu Tập Phật Pháp',
      album: album.title,
      artwork: album.artwork
    } : null);
    updateMediaSessionPlaybackState(!album || !track ? 'none' : this.snapshot.playing ? 'playing' : 'paused');
  }

  private patch(patch: Partial<AudioPlayerSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.emit();
  }

  private emit(): void {
    if (!(this.audio instanceof NativeTalkAudio)) {
    updateMediaSessionPositionState(
      this.snapshot.duration,
      this.snapshot.currentTime,
      this.snapshot.speed,
    );
    updateMediaSessionPlaybackState(!this.snapshot.album ? 'none' : this.snapshot.playing ? 'playing' : 'paused'
    );
    }
    for (const listener of this.listeners) listener(this.snapshot);
  }

  private shortcutTargetIsInteractive(target: EventTarget | null): boolean {
    const eventTarget = target instanceof Element
      ? target
      : document.activeElement instanceof Element
        ? document.activeElement
        : null;
    if (eventTarget?.closest([
      'input',
      'textarea',
      'select',
      'button',
      'a[href]',
      '[contenteditable]:not([contenteditable="false"])',
      '[role="textbox"]',
      '[role="button"]',
      '[role="link"]',
      '[role="slider"]',
      'dialog',
      '[role="dialog"]',
    ].join(','))) return true;
    return Boolean(document.querySelector?.('dialog[open],[role="dialog"][aria-modal="true"]'));
  }

  private revokeObjectUrl(): void {
    this.pendingSeekTarget = undefined;
    this.seekRequest?.abort();
    this.seekRequest = undefined;
    this.seekPreparation = undefined;
    if (this.seekMetadataReady) this.audio.removeEventListener('loadedmetadata', this.seekMetadataReady);
    this.seekMetadataReady = undefined;
    if (!this.objectUrl) return;
    URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = undefined;
  }

  private tickSleepTimer(): void {
    if (this.audio instanceof NativeTalkAudio) return;
    if (!this.sleepTimerId && this.snapshot.sleepTimerRemainingMs <= 0 && !this.snapshot.sleepTimerEndOfTrack) return;

    if (this.snapshot.sleepTimerEndOfTrack) {
      const duration = this.audio.duration || this.snapshot.duration || 0;
      const current = this.audio.currentTime || this.snapshot.currentTime || 0;
      const remaining = duration > 0 ? Math.max(0, Math.round((duration - current) * 1_000)) : 0;
      if (this.snapshot.sleepTimerRemainingMs !== remaining) {
        this.snapshot = {
          ...this.snapshot,
          sleepTimerRemainingMs: remaining
        };
        this.emit();
      }
      if (duration > 0 && (current >= duration - 0.25 || remaining <= 0) && (this.snapshot.playing || current > 0)) {
        this.clearSleepTimer();
        this.pause();
      }
      return;
    }

    if (this.snapshot.sleepTimerRemainingMs <= 0) {
      this.clearSleepTimer();
      return;
    }

    const now = this.nowMs();
    const isPlaying = this.snapshot.playing && !this.audio.paused;
    if (isPlaying) {
      const elapsed = Math.max(0, now - this.sleepTimerLastTick);
      if (elapsed > 0) {
        const remaining = Math.max(0, this.snapshot.sleepTimerRemainingMs - elapsed);
        this.snapshot = {
          ...this.snapshot,
          sleepTimerRemainingMs: remaining
        };
        this.emit();
        if (remaining <= 0) {
          this.clearSleepTimer();
          this.pause();
          return;
        }
      }
    }
    this.sleepTimerLastTick = now;
  }

  private async hydrateRemoteSync(generation: number): Promise<void> {
    const session = this.session;
    if (!session.authenticated || generation !== this.principalGeneration) return;
    const controller = new AbortController();
    this.remoteRequests.add(controller);

    try {
      const response = await fetchWithSessionRefresh('/api/player-sync', {
        headers: { accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok || generation !== this.principalGeneration) return;
      const remote = await response.json();
      if (generation !== this.principalGeneration) return;
      const payload = applyRemotePlayerSync(remote);
      if (payload) {
        this.patch({ recentAlbumIds: payload.pt_recent_albums });
        dispatchAudioStorageEvent('quangtu:player-sync-updated', payload);
      }
    } catch {
      // Local playback remains available when sync is unreachable.
    } finally {
      this.remoteRequests.delete(controller);
    }
  }

  private async pushRemoteSync(force = false): Promise<void> {
    if (!force && Date.now() - this.lastRemoteSyncAt < 30_000) return;
    if (!force && this.syncTimer) return;
    if (!force) {
      this.syncTimer = setTimeout(() => {
        this.syncTimer = undefined;
        void this.pushRemoteSync(true);
      }, 1_500);
      return;
    }

    clearTimeout(this.syncTimer);
    this.syncTimer = undefined;
    const generation = this.principalGeneration;
    const session = this.session;
    if (!session.authenticated || !session.csrfToken) return;
    const controller = new AbortController();
    this.remoteRequests.add(controller);

    try {
      const response = await fetchWithSessionRefresh('/api/player-sync', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': session.csrfToken
        },
        body: JSON.stringify(readPlayerSyncPayload()),
        keepalive: true,
        signal: controller.signal,
      });
      if (response.ok && generation === this.principalGeneration) this.lastRemoteSyncAt = Date.now();
    } catch {
      // Sync retries on the next save/visibility lifecycle.
    } finally {
      this.remoteRequests.delete(controller);
    }
  }
}
