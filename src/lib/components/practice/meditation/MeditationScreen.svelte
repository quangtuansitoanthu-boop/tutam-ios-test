<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onDestroy, onMount, tick } from 'svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import type { MeditationSessionState } from '$lib/domain/practice/guided-sessions';
  import type { MeditationSetup } from '$lib/browser/practice-meditation';
  import { formatPracticeTime } from '$lib/browser/practice-meditation';
  import type { MeditationMotionSnapshot } from '$lib/browser/practice-motion';
  import {
    AMBIENT_SOUND_OPTIONS,
    AMBIENT_SOUND_LABELS_EN,
    type AmbientSoundType,
    createAmbientSoundController,
    getAmbientSoundLabel
  } from '$lib/browser/ambient-sound';
  import { MEDITATION_TRACK_OPTIONS, type MeditationTrack } from '$lib/browser/practice-audio';
  import { DAILY_CALENDAR_ARTWORKS } from '$lib/components/lunar/calendar-artwork';
  import { createMeditationWater } from '$lib/browser/meditation-water';
  import { uiMotion } from '$lib/browser/ui-motion';
  import { setImmersiveFullscreen } from '$lib/browser/native-fullscreen';
  import { isNativeApp } from '$lib/browser/native-platform';
  import { overrideNativeSystemBars } from '$lib/browser/native-system-bars';

  interface Props {
    routineControls?: Snippet;
    session: MeditationSessionState;
    setup: MeditationSetup;
    initialBackgroundArtwork?: string | null;
    motion: MeditationMotionSnapshot;
    onClose: () => void;
    onEnd: () => void;
    onPause: () => void;
    onResume: () => void;
    onMusicVolumeChange?: (volume: number) => void;
    onAmbientVolumeChange?: (volume: number) => void;
    onMusicTrackChange?: (track: MeditationTrack | null) => void;
    onAmbientSoundChange?: (sound: AmbientSoundType) => void;
  }

  let { session, setup, initialBackgroundArtwork = null, motion, onClose, onEnd, onPause, onResume, routineControls, onMusicVolumeChange, onAmbientVolumeChange, onMusicTrackChange, onAmbientSoundChange }: Props = $props();
  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t.practice);
  const isEn = $derived(localeStore.current === 'en');

  let screen = $state<HTMLElement>();
  let waterCanvas = $state<HTMLCanvasElement>();
  let water = $state<ReturnType<typeof createMeditationWater> | null>(null);
  let contentScrollable = $state(true);

  onMount(() => {
    if (!screen) return;
    return overrideNativeSystemBars(true, getComputedStyle(screen).getPropertyValue('--meditation-surface').trim());
  });

  $effect(() => {
    if (!screen) return;
    const main = screen.querySelector('main');
    const content = screen.querySelector('.meditation-screen__content');
    if (!main || !content) return;
    // Giữ cuộn dọc khi chữ lớn/màn thấp; vùng vừa màn nhận đủ đường vuốt nước.
    const observer = new ResizeObserver(() => { contentScrollable = main.scrollHeight > main.clientHeight; });
    observer.observe(main);
    observer.observe(content);
    return () => observer.disconnect();
  });

  $effect(() => {
    if (!screen || !waterCanvas) return;
    const renderer = createMeditationWater(screen, waterCanvas);
    water = renderer;
    return () => { renderer.destroy(); water = null; };
  });
  $effect(() => {
    water?.setEnabled($uiMotion.effective && !backgroundPickerOpen && session.phase !== 'completed' && session.phase !== 'cancelled');
  });
  $effect(() => {
    selectedBackground;
    water?.invalidate();
  });
  let focused = $state(false);
  let focusDelay = $state('0s');
  let focusTrigger = $state<HTMLButtonElement>();
  let focusExit = $state<HTMLButtonElement>();
  const canFocus = $derived(session.phase === 'preparing' || session.phase === 'active');
  // Follow the existing session clock so toggling Focus never restarts the breath.
  const breathProgress = $derived(((session.preparationElapsedMs + session.activeElapsedMs) % 10_000) / 10_000);
  const breathCue = $derived(breathProgress < .5 ? t.breatheIn : t.breatheOut);
  $effect(() => {
    if (focused && !canFocus) exitFocus();
  });
  let backgroundPickerOpen = $state(false);
  let selectedBackground = $state<string | null>(null);
  let failedBackgrounds = $state<string[]>([]);
  let backgroundTrigger = $state<HTMLButtonElement>();
  let backgroundPanel = $state<HTMLElement>();
  const backgroundPickerId = $props.id();
  const backgroundChoices = [0, 1, 2, 3, 4, 8, 7, 9, 5, 6].map(index => ({
    artwork: DAILY_CALENDAR_ARTWORKS[index],
    labelIndex: index,
  }));

  $effect(() => {
    selectedBackground = initialBackgroundArtwork && DAILY_CALENDAR_ARTWORKS.includes(initialBackgroundArtwork)
      ? initialBackgroundArtwork : null;
  });

  $effect(() => {
    if (backgroundPickerOpen) backgroundPanel?.focus();
  });

  async function closeBackgroundPicker(): Promise<void> {
    backgroundPickerOpen = false;
    await tick();
    backgroundTrigger?.focus();
  }

  function selectBackground(background: string | null): void {
    selectedBackground = background && failedBackgrounds.includes(background) ? null : background;
  }

  let musicVolume = $state(0.8);
  let ambientVolume = $state(0.6);
  let volumeInitialized = false;

  let currentMusicTrack = $state<MeditationTrack | null>(null);
  let currentAmbientSound = $state<AmbientSoundType>('none');
  let soundInitialized = false;

  $effect(() => {
    if (!volumeInitialized) {
      musicVolume = setup.musicVolume ?? 0.8;
      ambientVolume = setup.ambientVolume ?? 0.6;
      volumeInitialized = true;
    }
    if (!soundInitialized) {
      currentMusicTrack = setup.musicTrack ?? null;
      currentAmbientSound = setup.ambientSound ?? 'none';
      soundInitialized = true;
    }
  });
  let activeVolumePopover = $state<'none' | 'music' | 'ambient'>('none');

  function toggleVolumePopover(type: 'music' | 'ambient'): void {
    if (activeVolumePopover === type) {
      activeVolumePopover = 'none';
    } else {
      backgroundPickerOpen = false;
      activeVolumePopover = type;
    }
  }

  function handleVolumeInput(type: 'music' | 'ambient', val: number): void {
    if (type === 'music') {
      musicVolume = val;
      onMusicVolumeChange?.(val);
    } else {
      ambientVolume = val;
      ambientController.setVolume(val);
      onAmbientVolumeChange?.(val);
    }
  }

  function selectMusicTrack(track: MeditationTrack | null): void {
    currentMusicTrack = track;
    if (track !== null && musicVolume === 0) {
      musicVolume = 0.8;
    }
    onMusicTrackChange?.(track);
  }

  function selectAmbientSound(sound: AmbientSoundType): void {
    currentAmbientSound = sound;
    if (sound !== 'none' && ambientVolume === 0) {
      ambientVolume = 0.6;
    }
    const phase = session.phase;
    if ((phase === 'preparing' || phase === 'active') && sound !== 'none') {
      ambientController.start(sound);
    } else {
      ambientController.stop();
    }
    onAmbientSoundChange?.(sound);
  }

  const ambientController = createAmbientSoundController(() => Boolean(currentMusicTrack));

  $effect(() => {
    ambientController.setVolume(ambientVolume);
  });

  $effect(() => {
    const phase = session.phase;
    const sound = currentAmbientSound || 'none';
    if ((phase === 'preparing' || phase === 'active') && sound !== 'none') {
      ambientController.start(sound);
    } else {
      ambientController.stop();
    }
  });

  onDestroy(() => {
    ambientController.destroy();
    if (focused) {
      void setImmersiveFullscreen(false, screen);
    }
  });

  const preparationRemaining = $derived(Math.max(0, session.preparationSeconds - session.preparationElapsedMs / 1_000));
  const activeRemaining = $derived(Math.max(0, session.targetSeconds - session.activeElapsedMs / 1_000));
  const phaseLabel = $derived(
    session.phase === 'preparing'
      ? t.phasePreparing
      : session.phase === 'paused'
        ? t.phasePaused
        : session.phase === 'completed'
          ? t.phaseCompleted
          : session.phase === 'cancelled'
            ? t.phaseCancelled
          : t.phaseActive,
  );
  const timeLabel = $derived(
    session.phase === 'preparing' || (session.phase === 'paused' && preparationRemaining > 0)
      ? preparationRemaining
      : session.phase === 'cancelled' ? session.activeElapsedMs / 1_000
        : activeRemaining,
  );
  const timeAriaLabel = $derived(session.phase === 'cancelled'
    ? (isEn ? `${formatPracticeTime(timeLabel)} elapsed` : `Đã thiền ${formatPracticeTime(timeLabel)}`)
    : (isEn ? `${formatPracticeTime(timeLabel)} remaining` : `Còn ${formatPracticeTime(timeLabel)}`));
  const motionCapabilityLabel = $derived(
    motion.status === 'disabled'
      ? (isEn ? 'Motion sensor is disabled.' : 'Cảm biến chuyển động không được bật.')
      : motion.status === 'requesting'
        ? (isEn ? 'Awaiting motion sensor permissions.' : 'Đang chờ quyền truy cập cảm biến chuyển động.')
        : motion.status === 'unsupported'
          ? (isEn ? 'This browser does not support motion sensors.' : 'Trình duyệt này không hỗ trợ cảm biến chuyển động.')
          : motion.status === 'denied'
            ? (isEn ? 'Motion sensor permission was denied.' : 'Quyền cảm biến chuyển động chưa được cấp.')
            : motion.status === 'error'
              ? (isEn ? 'Cannot read motion sensor.' : 'Không thể đọc cảm biến chuyển động.')
              : (isEn ? 'Motion sensor is enabled.' : 'Cảm biến chuyển động đã bật.'),
  );
  const motionLabel = $derived(
    motion.status === 'disabled'
      ? (isEn ? 'Motion sensor is disabled. Meditation session is tracked by active duration.' : 'Cảm biến chuyển động không được bật. Thời thiền vẫn được ghi nhận bằng thời gian hoạt động.')
      : motion.status === 'requesting'
        ? (isEn ? 'Awaiting motion sensor permissions…' : 'Đang chờ quyền truy cập cảm biến chuyển động…')
        : motion.status === 'unsupported'
          ? (isEn ? 'This browser does not support motion sensors. Meditation session functions normally.' : 'Trình duyệt này không hỗ trợ cảm biến chuyển động. Thời thiền vẫn hoạt động bình thường.')
          : motion.status === 'denied'
            ? (isEn ? 'Motion sensor permission was denied. Meditation session functions normally.' : 'Quyền cảm biến chuyển động chưa được cấp. Thời thiền vẫn hoạt động bình thường.')
            : motion.status === 'error'
              ? (isEn ? 'Cannot read motion sensor. Meditation session functions normally.' : 'Không thể đọc cảm biến chuyển động. Thời thiền vẫn hoạt động bình thường.')
              : motion.sampleCount < 1
                ? (isEn ? 'Motion sensor is enabled; no valid samples received yet.' : 'Cảm biến chuyển động đã bật; chưa nhận được mẫu hợp lệ.')
                : (isEn ? `Sensor support: ${motion.sampleCount} samples, ${motion.stillnessPercent ?? 0}% low-motion stillness${motion.sampleLimitReached ? ' (target reached)' : ''}.` : `Cảm biến hỗ trợ: ${motion.sampleCount} mẫu, ${motion.stillnessPercent ?? 0}% ở mức chuyển động thấp${motion.sampleLimitReached ? ' (đã đủ số mẫu)' : ''}.`),
  );

  function handleCancel(event: Event): void {
    event.preventDefault();
    if (activeVolumePopover !== 'none') {
      activeVolumePopover = 'none';
      return;
    }
    if (focused) {
      exitFocus();
      return;
    }
    if (backgroundPickerOpen) {
      closeBackgroundPicker();
      return;
    }
    if (session.phase === 'completed' || session.phase === 'cancelled') onClose();
    else if (session.phase !== 'paused') onPause();
  }

  function enterFocus(): void {
    const elapsed = session.phase === 'active'
      ? ((session.activeElapsedMs % 10_000) / 1000).toFixed(2)
      : '0';
    focusDelay = `-${elapsed}s`;
    focused = true;
    void setImmersiveFullscreen(true, screen);
    void tick().then(() => focusExit?.focus({ preventScroll: true }));
  }

  function exitFocus(leaveFullscreen = true): void {
    focused = false;
    if (leaveFullscreen) void setImmersiveFullscreen(false, screen);
    void tick().then(() => {
      (canFocus ? focusTrigger : screen)?.focus({ preventScroll: true });
    });
  }
</script>

<svelte:window onfullscreenchange={() => {
  if (isNativeApp()) return;
  if (focused && !document.fullscreenElement) exitFocus(false);
  if (!focused && document.fullscreenElement === screen) void setImmersiveFullscreen(false, screen);
}} />

<dialog use:modalDialog class="meditation-modal" aria-label={isEn ? 'Meditation Session' : 'Phiên thiền'} oncancel={handleCancel}>
<section bind:this={screen} class="meditation-screen" class:is-focused={focused} class:breath-paused={session.phase !== 'active'} aria-label={t.meditationTitle} tabindex="-1" data-modal-focus>
  <canvas bind:this={waterCanvas} class="meditation-screen__water" aria-hidden="true"></canvas>
  {#if selectedBackground}
    <div class="meditation-screen__photo" aria-hidden="true">
      <img src={selectedBackground} alt="" onload={() => water?.invalidate()} onerror={() => selectedBackground = null} />
    </div>
  {/if}
  {#if focused}
    <div class="meditation-focus">
      <button class="meditation-focus__stage" type="button" tabindex="-1"
        aria-label={`${t.exitFocus} · ${t.breathingGuide}`} onclick={() => exitFocus()}>
        <span class="meditation-screen__visual" aria-hidden="true">
          <span class="meditation-screen__breath" style:--focus-delay={focusDelay}><span>🪷</span></span>
        </span>
        <span class="meditation-focus__cue">{breathCue}</span>
      </button>
      <header><button bind:this={focusExit} type="button" onclick={() => exitFocus()}>{t.exitFocus}</button></header>
    </div>
  {/if}
  <div class="meditation-screen__controls" hidden={focused}>
  <header inert={backgroundPickerOpen}>
    <div><span aria-hidden="true">🪷</span><strong>{t.meditationTitle}</strong></div>
    <div class="meditation-screen__header-actions">
      <div class="meditation-screen__volume-group">
        <button
          type="button"
          class="meditation-screen__icon-btn"
          class:active={activeVolumePopover === 'music'}
          class:muted={!currentMusicTrack || musicVolume === 0}
          aria-label={isEn ? `Music Volume (${!currentMusicTrack ? 'Off' : `${Math.round(musicVolume * 100)}%`})` : `Âm lượng nhạc thiền (${!currentMusicTrack ? 'Tắt' : `${Math.round(musicVolume * 100)}%`})`}
          aria-expanded={activeVolumePopover === 'music'}
          onclick={() => toggleVolumePopover('music')}
        >
          <span aria-hidden="true">🎵</span>
          <span class="meditation-screen__btn-percent">{!currentMusicTrack ? (isEn ? 'Off' : 'Tắt') : `${Math.round(musicVolume * 100)}%`}</span>
        </button>

        <button
          type="button"
          class="meditation-screen__icon-btn"
          class:active={activeVolumePopover === 'ambient'}
          class:muted={!currentAmbientSound || currentAmbientSound === 'none' || ambientVolume === 0}
          aria-label={isEn ? `Ambient Sound Volume (${!currentAmbientSound || currentAmbientSound === 'none' ? 'Off' : `${Math.round(ambientVolume * 100)}%`})` : `Âm lượng âm thanh khác (${!currentAmbientSound || currentAmbientSound === 'none' ? 'Tắt' : `${Math.round(ambientVolume * 100)}%`})`}
          aria-expanded={activeVolumePopover === 'ambient'}
          onclick={() => toggleVolumePopover('ambient')}
        >
          <span aria-hidden="true">🌊</span>
          <span class="meditation-screen__btn-percent">{!currentAmbientSound || currentAmbientSound === 'none' ? (isEn ? 'Off' : 'Tắt') : `${Math.round(ambientVolume * 100)}%`}</span>
        </button>
      </div>

    <button bind:this={backgroundTrigger} type="button" aria-expanded={backgroundPickerOpen} aria-controls={backgroundPickerId} onclick={() => { activeVolumePopover = 'none'; backgroundPickerOpen = !backgroundPickerOpen; }}>{t.changeMeditationBackground}</button>
    {#if canFocus}
      <button bind:this={focusTrigger} type="button" onclick={enterFocus}>{t.focusMode}</button>
    {/if}
    </div>
  </header>
  {#if activeVolumePopover !== 'none'}
    <div
      class="meditation-sound-sheet-backdrop"
      onclick={() => activeVolumePopover = 'none'}
      aria-hidden="true"
    ></div>
    <section
      class="meditation-sound-sheet"
      data-dialog-glass
      aria-label={activeVolumePopover === 'music' ? (isEn ? 'Meditation Music Settings' : 'Cài đặt nhạc thiền') : (isEn ? 'Ambient Sound Settings' : 'Cài đặt âm thanh khác')}
    >
      <div class="meditation-sound-sheet__handle" aria-hidden="true"></div>
      <div class="meditation-sound-sheet__header">
        <div class="meditation-sound-sheet__title">
          <span aria-hidden="true">{activeVolumePopover === 'music' ? '🎵' : '🌊'}</span>
          <strong>{activeVolumePopover === 'music' ? (isEn ? 'Meditation Music' : 'Nhạc thiền') : (isEn ? 'Ambient Sound' : 'Âm thanh khác')}</strong>
        </div>
        <div class="meditation-sound-sheet__actions">
          <span class="meditation-sound-sheet__percent">
            {activeVolumePopover === 'music' ? `${Math.round(musicVolume * 100)}%` : `${Math.round(ambientVolume * 100)}%`}
          </span>
          <button
            type="button"
            class="meditation-sound-sheet__close"
            aria-label={isEn ? 'Close' : 'Đóng'}
            onclick={() => activeVolumePopover = 'none'}
          >
            ×
          </button>
        </div>
      </div>

      <div class="meditation-sound-sheet__volume-card">
        <button
          type="button"
          class="meditation-sound-sheet__mute"
          aria-label={isEn ? 'Toggle mute' : 'Bật/Tắt âm'}
          onclick={() => {
            if (activeVolumePopover === 'music') {
              handleVolumeInput('music', musicVolume === 0 ? 0.8 : 0);
            } else {
              handleVolumeInput('ambient', ambientVolume === 0 ? 0.6 : 0);
            }
          }}
        >
          {(activeVolumePopover === 'music' ? musicVolume : ambientVolume) === 0 ? '🔇' : (activeVolumePopover === 'music' ? musicVolume : ambientVolume) < 0.5 ? '🔉' : '🔊'}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={activeVolumePopover === 'music' ? musicVolume : ambientVolume}
          oninput={(e) => handleVolumeInput(activeVolumePopover as 'music' | 'ambient', Number((e.currentTarget as HTMLInputElement).value))}
          class="meditation-volume-slider"
          aria-label={activeVolumePopover === 'music' ? 'Nhạc thiền volume slider' : 'Âm thanh khác volume slider'}
        />
      </div>

      <div class="meditation-sound-sheet__section-title">
        {activeVolumePopover === 'music' ? (isEn ? 'Select track:' : 'Chọn bài nhạc thiền:') : (isEn ? 'Select ambient sound:' : 'Chọn âm thanh nền:')}
      </div>

      {#if activeVolumePopover === 'music'}
        <div class="meditation-sound-sheet__grid">
          <button
            type="button"
            class="meditation-sound-sheet__option"
            class:selected={currentMusicTrack === null}
            aria-pressed={currentMusicTrack === null}
            onclick={() => selectMusicTrack(null)}
          >
            <span class="meditation-sound-sheet__option-icon" aria-hidden="true">🔇</span>
            <div class="meditation-sound-sheet__option-info">
              <span class="meditation-sound-sheet__option-label">{isEn ? 'No music' : 'Tắt nhạc thiền'}</span>
              <span class="meditation-sound-sheet__option-desc">{isEn ? 'Silence, focus only on breath' : 'Tĩnh lặng, chỉ tập trung hơi thở'}</span>
            </div>
            {#if currentMusicTrack === null}
              <span class="meditation-sound-sheet__check" aria-hidden="true">✓</span>
            {/if}
          </button>

          {#each MEDITATION_TRACK_OPTIONS as option (option.track)}
            <button
              type="button"
              class="meditation-sound-sheet__option"
              class:selected={currentMusicTrack === option.track}
              aria-pressed={currentMusicTrack === option.track}
              onclick={() => selectMusicTrack(option.track)}
            >
              <span class="meditation-sound-sheet__option-icon" aria-hidden="true">🎵</span>
              <div class="meditation-sound-sheet__option-info">
                <span class="meditation-sound-sheet__option-label">{option.label}</span>
                <span class="meditation-sound-sheet__option-desc">{isEn ? 'Meditative harmony' : 'Giai điệu thanh tịnh, lắng dịu'}</span>
              </div>
              {#if currentMusicTrack === option.track}
                <span class="meditation-sound-sheet__check" aria-hidden="true">✓</span>
              {/if}
            </button>
          {/each}
        </div>
      {:else if activeVolumePopover === 'ambient'}
        <div class="meditation-sound-sheet__grid">
          {#each AMBIENT_SOUND_OPTIONS as option (option.id)}
            <button
              type="button"
              class="meditation-sound-sheet__option"
              class:selected={currentAmbientSound === option.id}
              aria-pressed={currentAmbientSound === option.id}
              onclick={() => selectAmbientSound(option.id)}
            >
              <span class="meditation-sound-sheet__option-icon" aria-hidden="true">{option.icon}</span>
              <div class="meditation-sound-sheet__option-info">
                <span class="meditation-sound-sheet__option-label">{isEn ? AMBIENT_SOUND_LABELS_EN[option.id] : option.label}</span>
                <span class="meditation-sound-sheet__option-desc">{option.description}</span>
              </div>
              {#if currentAmbientSound === option.id}
                <span class="meditation-sound-sheet__check" aria-hidden="true">✓</span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
  {@render routineControls?.()}

  {#if backgroundPickerOpen}
    <section bind:this={backgroundPanel} id={backgroundPickerId} class="meditation-background-picker" aria-labelledby={`${backgroundPickerId}-title`} tabindex="-1" data-dialog-glass>
      <div class="meditation-background-picker__heading">
        <h2 id={`${backgroundPickerId}-title`}>{t.meditationBackgroundTitle}</h2>
        <button type="button" aria-label={t.closeMeditationBackground} onclick={closeBackgroundPicker}>×</button>
      </div>
      <div class="meditation-background-picker__grid">
        <button class="meditation-background-picker__tile" class:selected={selectedBackground === null} type="button" aria-pressed={selectedBackground === null} onclick={() => selectBackground(null)}>
          <span class="meditation-background-picker__default" aria-hidden="true"></span>
          <span>{t.meditationBackgroundDefault}</span>
          {#if selectedBackground === null}<span class="meditation-background-picker__selected"><span aria-hidden="true">✓</span><span class="meditation-screen__sr-only">{t.meditationBackgroundSelected}</span></span>{/if}
        </button>
        {#each backgroundChoices as { artwork, labelIndex } (artwork)}
          <button class="meditation-background-picker__tile" class:selected={selectedBackground === artwork} type="button" aria-pressed={selectedBackground === artwork} onclick={() => selectBackground(artwork)}>
            {#if failedBackgrounds.includes(artwork)}
              <span class="meditation-background-picker__default" aria-hidden="true"></span>
            {:else}
              <img src={artwork} alt="" loading="lazy" decoding="async" onerror={() => { failedBackgrounds = [...failedBackgrounds, artwork]; if (selectedBackground === artwork) selectedBackground = null; }} />
            {/if}
            <span>{t.meditationBackgroundArtworkNames[labelIndex]}</span>
            {#if selectedBackground === artwork}<span class="meditation-background-picker__selected"><span aria-hidden="true">✓</span><span class="meditation-screen__sr-only">{t.meditationBackgroundSelected}</span></span>{/if}
          </button>
        {/each}
      </div>
      <div class="meditation-background-picker__footer">
        <button type="button" onclick={closeBackgroundPicker}>{t.doneMeditationBackground}</button>
      </div>
    </section>
  {/if}

  <main inert={backgroundPickerOpen} style:touch-action={contentScrollable ? 'pan-y' : 'none'}>
    <div class="meditation-screen__content">
      {#if setup.fullscreenVisual}
        <div class="meditation-screen__visual" aria-hidden="true">
          <div class="meditation-screen__breath"><span>🪷</span></div>
        </div>
        <div class="meditation-screen__breathing-cue" class:inactive={session.phase !== 'active' && session.phase !== 'paused'} aria-hidden="true">
          <span class="breathing-cue-in">{t.breatheIn}</span>
          <span class="breathing-cue-out">{t.breatheOut}</span>
        </div>
        <span class="meditation-screen__sr-only">{t.breathingGuide}</span>
      {:else}
        <div class="meditation-screen__still" aria-hidden="true">☸</div>
      {/if}

      {#if session.phase === 'preparing'}
        <div class="meditation-screen__badge meditation-screen__badge--prep" role="status">
          <span aria-hidden="true">⏳</span>
          <span>{t.prepCountdown} <strong>{Math.ceil(preparationRemaining)}s</strong></span>
        </div>
      {:else if session.phase === 'active'}
        <div class="meditation-screen__badge meditation-screen__badge--active" role="status">
          <span class="meditation-screen__pulse-dot" aria-hidden="true"></span>
          <span>{t.nowMeditating}</span>
        </div>
      {:else if session.phase === 'paused'}
        <div class="meditation-screen__badge meditation-screen__badge--paused" role="status">
          <span aria-hidden="true">⏸️</span>
          <span>{t.sessionPaused}</span>
        </div>
      {:else if session.phase === 'completed'}
        <div class="meditation-screen__badge meditation-screen__badge--completed" role="status">
          <span aria-hidden="true">🌸</span>
          <span>{t.sessionCompleted}</span>
        </div>
      {/if}

      <p class="meditation-screen__phase" aria-live="polite">{phaseLabel}</p>
      <strong class="meditation-screen__time" aria-label={timeAriaLabel}>{formatPracticeTime(timeLabel)}</strong>
      <div class="meditation-screen__instruction">
        {#if session.phase === 'preparing'}
          <p>{t.prepInstruction}</p>
        {:else if session.phase === 'active'}
          <div class="meditation-screen__guide-list">
            <div class="meditation-screen__guide-item">
              <strong>{t.calmMindTitle}</strong> – {t.calmMindDesc}
            </div>
            <div class="meditation-screen__guide-item">
              <strong>{t.mindfulnessTitle}</strong> – {t.mindfulnessDesc}
            </div>
            <div class="meditation-screen__guide-item">
              <strong>{t.contemplationTitle}</strong> – {t.contemplationDesc}
            </div>
          </div>
        {:else if session.phase === 'paused'}
          <p>{t.pausedInstruction}</p>
        {:else if session.phase === 'completed'}
          <p>{t.completedInstruction}</p>
        {:else}
          <p>{t.defaultInstruction}</p>
        {/if}
      </div>

      <div class="meditation-screen__layers" aria-label={isEn ? 'Active audio layers' : 'Âm thanh đang dùng'}>
        <span>{currentMusicTrack ? `${t.hasMusic} (${Math.round(musicVolume * 100)}%)` : t.noMusicActive}</span>
        {#if currentAmbientSound && currentAmbientSound !== 'none'}
          <span>{getAmbientSoundLabel(currentAmbientSound, isEn)} ({Math.round(ambientVolume * 100)}%)</span>
        {/if}
        <span>{setup.woodenFishEnabled ? t.woodenFishActive.replace('{bpm}', String(setup.woodenFishBpm)) : t.noWoodenFishActive}</span>
      </div>
      {#if motion.status !== 'disabled'}
        <p class="meditation-screen__motion">{motionLabel}</p>
      {/if}
    </div>
    <span class="meditation-screen__sr-only" role="status" aria-live="polite">{motionCapabilityLabel}</span>
  </main>

  <footer inert={backgroundPickerOpen}>
    {#if session.phase === 'completed' || session.phase === 'cancelled'}
      <button class="primary" type="button" onclick={onClose}>{t.finish}</button>
    {:else}
      <button type="button" onclick={onEnd}>{t.endEarly}</button>
      {#if session.phase === 'paused'}
        <button class="primary" type="button" onclick={onResume}>{t.resume}</button>
      {:else}
        <button class="primary" type="button" onclick={onPause}>{t.pause}</button>
      {/if}
    {/if}
  </footer>
  </div>
</section>
</dialog>

<style>
  .meditation-modal{inset:0;width:100%;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:#171320;overflow:hidden}
  .meditation-modal::backdrop{background:#171320}
  .meditation-screen{box-sizing:border-box;position:fixed;z-index:11000;inset:0;display:grid;width:100%;height:100dvh;grid-template-rows:auto 1fr auto;background:radial-gradient(circle at 50% 35%,#44365f 0%,#241d35 46%,var(--meditation-surface) 100%);color:#fff;font-family:var(--font-app);isolation:isolate}
  .meditation-screen::before{position:absolute;z-index:-1;inset:0;background-image:radial-gradient(circle at 20% 20%,rgba(229,195,255,.08) 0 1px,transparent 1.5px),radial-gradient(circle at 80% 70%,rgba(255,231,178,.08) 0 1px,transparent 1.5px);background-size:46px 46px,64px 64px;content:''}
  .meditation-screen__photo{position:absolute;z-index:-1;inset:0;pointer-events:none}
  .meditation-screen__water{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0}
  .meditation-screen header,.meditation-screen main,.meditation-screen footer{position:relative;z-index:1}
  .meditation-screen main{user-select:none;-webkit-user-select:none}
  .meditation-screen__photo img{width:100%;height:100%;object-fit:cover}
  .meditation-screen__photo::after{position:absolute;inset:0;background:color-mix(in srgb,var(--copy-paper-ink) 60%,transparent);content:''}
  .meditation-background-picker{box-sizing:border-box;position:absolute;z-index:2;bottom:0;left:50%;display:grid;grid-template-rows:auto minmax(0,1fr) auto;width:100%;max-width:520px;max-height:calc(100dvh - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px) - var(--space-page) * 2);overflow:hidden;transform:translateX(-50%);padding:var(--radius-control);padding-bottom:max(var(--radius-control),env(safe-area-inset-bottom,0px));border:1px solid rgba(255,255,255,.16);border-bottom:0;border-radius:var(--radius-card) var(--radius-card) 0 0;background:rgba(26,20,38,.96);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);color:#fff;box-shadow:0 -8px 32px rgba(0,0,0,.5)}
  .meditation-background-picker__heading{display:flex;align-items:center;justify-content:space-between;gap:var(--radius-sm);margin-bottom:var(--radius-control)}
  .meditation-background-picker__heading h2{margin:0;font:700 1rem/1.5 var(--font-app);text-align:center;color:#ffd98c}
  .meditation-background-picker__heading button{width:44px;height:44px;flex-shrink:0;border:1px solid rgba(255,255,255,.16);border-radius:50%;background:rgba(255,255,255,.08);color:rgba(255,255,255,.85);font:inherit;font-size:1.5rem;cursor:pointer}
  .meditation-background-picker__grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-rows:max-content;align-content:start;gap:var(--radius-sm);overflow-y:auto;overscroll-behavior:contain;padding:var(--radius-sm)}
  .meditation-background-picker__tile{position:relative;display:flex;min-width:0;min-height:44px;flex-direction:column;gap:var(--radius-sm);padding:var(--radius-sm);border:2px solid var(--border);border-radius:var(--radius-control);background:rgba(255,255,255,.08);color:inherit;cursor:pointer;font:inherit;font-size:var(--font-size-label);line-height:1.5;text-align:center;overflow-wrap:anywhere}
  .meditation-background-picker__tile.selected{border-color:var(--gold)}
  .meditation-background-picker__tile img,.meditation-background-picker__default{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--radius-sm)}
  .meditation-background-picker__default{background:radial-gradient(circle at 50% 35%,#44365f 0%,#241d35 46%,var(--meditation-surface) 100%)}
  .meditation-background-picker__selected{position:absolute;top:var(--radius-sm);right:var(--radius-sm);padding:0 var(--radius-sm);border-radius:var(--radius-sm);background:var(--gold);color:var(--on-gold);font-weight:700}
  .meditation-background-picker__footer{display:flex;justify-content:flex-end;padding-top:var(--radius-control)}
  .meditation-background-picker__footer button{width:100%;min-width:44px;min-height:44px;padding:0 var(--space-page);border:1px solid var(--gold);border-radius:var(--radius-control);background:var(--gold);color:var(--on-gold);font:700 1rem/1.5 var(--font-app);cursor:pointer}
  .meditation-screen header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:calc(16px + var(--app-safe-top,env(safe-area-inset-top,0px))) max(24px,env(safe-area-inset-right,0px)) 14px max(24px,env(safe-area-inset-left,0px))}
  .meditation-screen header>div:first-child{display:flex;align-items:center;gap:8px;min-width:0}
  .meditation-screen header>div:first-child>span{font-size:22px;line-height:1}
  .meditation-screen__header-actions{display:flex;align-items:center;gap:8px}
  .meditation-screen header button,.meditation-screen footer button{min-height:44px;padding:0 18px;border:1px solid rgba(255,255,255,.32);border-radius:999px;background:rgba(255,255,255,.08);color:#fff;cursor:pointer;font:700 13px/1 var(--font-app);transition:background .2s,border-color .2s,transform .15s}
  .meditation-screen header button:hover,.meditation-screen footer button:not(.primary):hover{background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.45)}
  .meditation-screen main{display:flex;min-height:0;overflow-y:auto;overscroll-behavior:contain;align-items:center;justify-content:flex-start;flex-direction:column;padding:16px 24px;text-align:center}
  .meditation-screen__content{display:flex;flex-shrink:0;flex-direction:column;align-items:center;justify-content:center;margin:auto 0;width:100%;max-width:680px;text-align:center}
  .meditation-screen__visual{display:grid;width:min(38vw,240px);aspect-ratio:1;place-items:center}
  .meditation-screen__breath{display:grid;width:68%;aspect-ratio:1;place-items:center;border:1px solid rgba(239,220,255,.5);border-radius:50%;background:radial-gradient(circle,rgba(223,187,255,.34),rgba(165,126,211,.1) 62%,transparent 66%);box-shadow:0 0 80px rgba(186,143,225,.22);animation:guided-breath 10s ease-in-out infinite}
  .meditation-screen__breath span{font-size:clamp(50px,7.5vw,78px);filter:drop-shadow(0 0 18px rgba(250,226,255,.45))}
  .meditation-screen__still{display:grid;width:140px;height:140px;place-items:center;color:#dbc5ed;font-size:72px}
  
  .meditation-screen__badge{display:inline-flex;align-items:center;gap:8px;margin:14px 0 6px;padding:7px 18px;border-radius:999px;font-size:var(--font-size-label);font-weight:700;letter-spacing:.02em;animation:tt-badge-in .25s ease-out}
  .meditation-screen__badge strong{color:#fff;font-weight:800}
  .meditation-screen__badge--prep{border:1px solid rgba(245,210,140,.55);background:rgba(217,160,54,.2);color:#fedda2;box-shadow:0 0 24px rgba(217,160,54,.18)}
  .meditation-screen__badge--active{border:1px solid rgba(239,220,255,.4);background:rgba(165,126,211,.22);color:#f3e8ff;box-shadow:0 0 24px rgba(165,126,211,.2)}
  .meditation-screen__badge--paused{border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.08);color:#e2e8f0}
  .meditation-screen__badge--completed{border:1px solid rgba(244,114,182,.45);background:rgba(236,72,153,.18);color:#fbcfe8}
  .meditation-screen__pulse-dot{width:8px;height:8px;border-radius:50%;background:var(--gold2);box-shadow:0 0 8px var(--gold2);animation:dot-pulse 1.8s ease-in-out infinite}
  @keyframes dot-pulse{0%,100%{transform:scale(.85);opacity:.65}50%{transform:scale(1.25);opacity:1}}
  @keyframes tt-badge-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}

  .meditation-screen__phase{margin:4px 0 4px;color:#eadff2;font-size:var(--font-size-label);font-weight:700;letter-spacing:.06em;text-transform:uppercase}
  .meditation-screen__time{font-size:clamp(56px,11vw,108px);font-variant-numeric:tabular-nums;line-height:1;margin:4px 0}
  .meditation-screen__instruction{max-width:620px;margin:14px auto 0;color:#d2c8dc;font-size:var(--font-size-body);line-height:1.7}
  .meditation-screen__guide-list{display:flex;flex-direction:column;gap:8px;text-align:left;margin:0 auto;background:rgba(255,255,255,.05);border:1px solid rgba(239,220,255,.14);border-radius:12px;padding:12px 18px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
  .meditation-screen__guide-item{font-size:var(--font-size-body);line-height:1.55;color:#e8def2}
  .meditation-screen__guide-item strong{color:#ffd98c;font-weight:700}
  .meditation-screen__layers{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:16px}
  .meditation-screen__layers span{padding:6px 12px;border:1px solid rgba(255,255,255,.16);border-radius:999px;background:rgba(255,255,255,.06);color:#d9d0e1;font-size:var(--font-size-meta)}
  .meditation-screen__motion{max-width:620px;margin:10px auto 0;color:#cfc2da;font-size:var(--font-size-meta);line-height:1.5}
  .meditation-screen__sr-only{position:absolute;width:1px;height:1px;overflow:hidden;margin:-1px;padding:0;border:0;clip:rect(0 0 0 0);white-space:nowrap}
  .meditation-screen footer{display:flex;justify-content:center;gap:10px;padding:16px max(24px,env(safe-area-inset-right,0px)) max(26px,env(safe-area-inset-bottom,0px)) max(24px,env(safe-area-inset-left,0px))}
  .meditation-screen footer .primary{border-color:#e0b766;background:#c9973f;color:var(--on-gold);box-shadow:0 8px 30px rgba(201,151,63,.28)}
  button:focus-visible{outline:3px solid #f2d495;outline-offset:3px}
  @keyframes guided-breath{0%,100%{transform:scale(.78);opacity:.72}45%,55%{transform:scale(1.2);opacity:1}}
  .meditation-screen__breathing-cue{display:grid;min-height:1.5em;margin:4px 0;color:inherit;font-size:20px;font-weight:700;line-height:1.5}
  .meditation-screen__breathing-cue.inactive{opacity:0}
  .meditation-screen__breathing-cue span{grid-area:1 / 1;animation:breathing-cue-in 10s steps(1,end) infinite}
  .meditation-screen__breathing-cue .breathing-cue-out{animation-name:breathing-cue-out}
  .breath-paused .meditation-screen__breath,.breath-paused .meditation-screen__breathing-cue span{animation-play-state:paused}
  @keyframes breathing-cue-in{0%{visibility:visible}55%,100%{visibility:hidden}}
  @keyframes breathing-cue-out{0%{visibility:hidden}55%,100%{visibility:visible}}
  @media(prefers-reduced-motion:reduce){.meditation-screen__breath{animation:none;transform:none}.meditation-screen::before{background-image:none}}
  @media(prefers-reduced-motion:reduce){.meditation-screen__breathing-cue{display:flex;flex-wrap:wrap;justify-content:center;gap:8px}.meditation-screen__breathing-cue span{animation:none;visibility:inherit}}

  .meditation-screen__controls{display:contents}
  .meditation-screen__controls[hidden]{display:none}
  .meditation-focus{position:absolute;inset:0;display:grid;grid-template-areas:"stage"}
  .meditation-focus header{grid-area:stage;align-self:start;justify-content:flex-end;pointer-events:none}
  .meditation-focus header button{pointer-events:auto}
  .meditation-focus__stage{
    grid-area:stage;display:grid;place-content:center;justify-items:center;gap:var(--space-page);
    min-width:0;min-height:0;padding:max(var(--space-page),env(safe-area-inset-top,0px))
      max(var(--space-page),env(safe-area-inset-right,0px)) max(var(--space-page),env(safe-area-inset-bottom,0px))
      max(var(--space-page),env(safe-area-inset-left,0px));
    border:0;background:transparent;color:inherit;font:inherit;text-align:center;cursor:pointer;
  }
  .meditation-focus__stage .meditation-screen__visual{width:min(52vw,32dvh,250px);aspect-ratio:1;height:auto}
  .meditation-focus__stage .meditation-screen__breath{
    width:68%;
    animation:guided-breath 10s ease-in-out infinite;
    animation-delay:var(--focus-delay,0s);
  }
  .meditation-focus__stage .meditation-screen__breath span{font-size:clamp(50px,7.5vw,78px);filter:drop-shadow(0 0 18px rgba(250,226,255,.45))}
  .meditation-focus__cue{font-size:clamp(1.25rem,5vw,2rem);font-weight:700;line-height:1.4;text-shadow:0 2px 10px rgba(0,0,0,.65)}
  @media(prefers-reduced-motion:reduce){.meditation-focus__stage .meditation-screen__breath{animation:none;transform:none}}

  @media(max-width:520px){
    .meditation-screen header{flex-direction:column;align-items:stretch;gap:8px;padding:calc(12px + var(--app-safe-top,env(safe-area-inset-top,0px))) max(12px,env(safe-area-inset-right,0px)) 10px max(12px,env(safe-area-inset-left,0px))}
    .meditation-screen header>div:first-child{justify-content:center}
    .meditation-screen__header-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;width:100%}
    .meditation-screen__volume-group{grid-column:1 / -1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;width:100%}
    .meditation-screen__header-actions>button,.meditation-screen__volume-group .meditation-screen__icon-btn{width:100%;min-width:0;justify-content:center;padding:0 10px;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .meditation-screen header strong{font-size:14px}
    .meditation-screen__visual{width:54vw}
    .meditation-screen__guide-list{padding:10px 12px;gap:6px}
    .meditation-screen__guide-item{font-size:var(--font-size-body);line-height:1.45}
    .meditation-screen footer{display:grid;grid-template-columns:1fr 1fr}
    .meditation-screen footer button:only-child{grid-column:1/-1}
  }

  @media(max-height:520px){
    .meditation-screen header{padding-block:calc(8px + var(--app-safe-top,env(safe-area-inset-top,0px))) 8px}
    .meditation-screen main{padding:6px 16px}
    .meditation-screen__visual,.meditation-screen__still{width:64px;height:64px;font-size:40px}
    .meditation-screen__breath span{font-size:32px}
    .meditation-screen__badge{margin:4px 0 2px;padding:4px 12px;font-size:var(--font-size-label)}
    .meditation-screen__phase{margin:2px 0;font-size:var(--font-size-label)}
    .meditation-screen__time{font-size:44px}
    .meditation-screen__instruction,.meditation-screen__layers{margin-top:6px}
    .meditation-screen footer{padding-top:8px;padding-bottom:max(8px,env(safe-area-inset-bottom,0px))}
  }
  .meditation-screen .meditation-focus header{
    padding:calc(var(--space-page) + var(--app-safe-top,env(safe-area-inset-top,0px)))
      max(var(--space-page),env(safe-area-inset-right,0px)) 0
      max(var(--space-page),env(safe-area-inset-left,0px));
  }
  .meditation-screen__volume-group {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .meditation-screen__icon-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 44px;
    padding: 0 12px;
    border: 1px solid rgba(255, 255, 255, 0.32);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
    cursor: pointer;
    font: 700 13px/1 var(--font-app);
    transition: background 0.2s, border-color 0.2s, transform 0.15s;
  }
  .meditation-screen__icon-btn:hover,
  .meditation-screen__icon-btn.active {
    background: rgba(255, 255, 255, 0.2);
    border-color: var(--gold);
    color: #ffd98c;
  }
  .meditation-screen__icon-btn.muted {
    opacity: 0.55;
  }
  .meditation-screen__icon-btn span[aria-hidden='true'] {
    font-size: 16px;
    line-height: 1;
  }
  .meditation-screen__btn-percent {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .meditation-sound-sheet-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10000;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    animation: sound-sheet-fade 0.2s ease-out;
  }
  @keyframes sound-sheet-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .meditation-sound-sheet {
    box-sizing: border-box;
    position: fixed;
    z-index: 10001;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 100%;
    max-width: 520px;
    max-height: calc(85dvh - env(safe-area-inset-top, 0px));
    display: flex;
    flex-direction: column;
    padding: 16px;
    padding-bottom: max(20px, env(safe-area-inset-bottom, 0px));
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-bottom: 0;
    border-radius: 20px 20px 0 0;
    background: rgba(26, 20, 38, 0.96);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.5);
    color: #fff;
    animation: sound-sheet-slide 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }
  @keyframes sound-sheet-slide {
    from { transform: translate(-50%, 100%); }
    to { transform: translate(-50%, 0); }
  }

  .meditation-sound-sheet__handle {
    width: 38px;
    height: 4px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.25);
    margin: 0 auto 12px;
  }
  .meditation-sound-sheet__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
  }
  .meditation-sound-sheet__title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 1.05rem;
  }
  .meditation-sound-sheet__title strong {
    color: #ffd98c;
  }
  .meditation-sound-sheet__actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .meditation-sound-sheet__percent {
    font-weight: 700;
    color: var(--gold);
    font-variant-numeric: tabular-nums;
    font-size: 0.95rem;
  }
  .meditation-sound-sheet__close {
    width: 44px;
    height: 44px;
    min-width: 44px;
    min-height: 44px;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    font-size: 1.25rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, color 0.15s;
  }
  .meditation-sound-sheet__close:hover {
    background: rgba(255, 255, 255, 0.18);
    color: #fff;
  }

  .meditation-sound-sheet__volume-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.05);
    margin-bottom: 16px;
  }
  .meditation-sound-sheet__mute {
    min-width: 44px;
    min-height: 44px;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
    font-size: 1.3rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .meditation-sound-sheet .meditation-volume-slider {
    flex: 1;
    min-height: 44px;
    height: 6px;
    accent-color: var(--gold);
    cursor: pointer;
  }

  .meditation-sound-sheet__section-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.7);
    margin-bottom: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .meditation-sound-sheet__grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-right: 2px;
    max-height: 42dvh;
  }
  .meditation-sound-sheet__option {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    min-height: 48px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.04);
    color: #fff;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s, border-color 0.15s;
  }
  .meditation-sound-sheet__option:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.25);
  }
  .meditation-sound-sheet__option.selected {
    border-color: var(--gold);
    background: rgba(217, 160, 54, 0.15);
  }
  .meditation-sound-sheet__option-icon {
    font-size: 1.35rem;
    flex-shrink: 0;
  }
  .meditation-sound-sheet__option-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .meditation-sound-sheet__option-label {
    font-weight: 600;
    font-size: 0.95rem;
    color: #fff;
  }
  .meditation-sound-sheet__option.selected .meditation-sound-sheet__option-label {
    color: #ffd98c;
  }
  .meditation-sound-sheet__option-desc {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.6);
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meditation-sound-sheet__check {
    font-weight: 700;
    color: var(--gold);
    font-size: 1.1rem;
    flex-shrink: 0;
  }
</style>
