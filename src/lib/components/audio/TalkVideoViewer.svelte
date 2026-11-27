<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { ArrowLeft, Expand, ListVideo, Smartphone } from '@lucide/svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { talkVideoText } from '$lib/i18n/talk-video';
  import { audioPlayer, getAudioPlayer } from '$lib/stores/audio-player.svelte';
  import { attachTalkVideoMirror } from '$lib/browser/talk-video-mirror';
  import VideoTransport from './VideoTransport.svelte';
  import { publicMediaFallback } from '$lib/browser/public-media-fallback';
  import { resolveApiUrl } from '$lib/browser/native-api';
  import { getOfflineTrack } from '$lib/browser/offline-audio-database';
  import { setImmersiveFullscreen } from '$lib/browser/native-fullscreen';

  let { url, title, poster, landscape = false, expanded = $bindable(true), onBack }: { url: string; title: string; poster?: string; landscape?: boolean; expanded?: boolean; onBack: () => void } = $props();
  const localeStore = getLocaleContext();
  const text = $derived(talkVideoText[localeStore.current === 'en' ? 'en' : 'vi']);
  let video = $state<HTMLVideoElement | null>(null);
  let videoSource = $state('');
  let unavailable = $state(false);
  let mounted = $state(false);
  let hintVisible = $state(false);
  let listButton = $state<HTMLButtonElement | null>(null);
  let expandButton = $state<HTMLButtonElement | null>(null);
  let figure = $state<HTMLElement | null>(null);
  let immersiveOwned = $state(false);
  let loading = $state(true);
  let bufferingTimer: ReturnType<typeof setTimeout> | undefined;
  let retryCount = $state(0);
  let hudVisible = $state(true);
  let hudActivity = $state(0);
  let pointerHeld = $state(false);
  let keyboardFocus = $state(false);
  let transportError = $state(false);
  let keyboardInput = false;
  const playing = $derived($audioPlayer.playing);
  const playerError = $derived(Boolean($audioPlayer.error));
  const hudHidden = $derived(expanded && !hudVisible);

  function showHud(): void { hudVisible = true; untrack(() => { hudActivity += 1; }); }
  function hudPointerDown(): void { pointerHeld = true; showHud(); }
  function hudFocusIn(): void { keyboardFocus = keyboardInput; showHud(); }
  function hudFocusOut(event: FocusEvent): void {
    if (!(event.relatedTarget instanceof Node) || !figure?.contains(event.relatedTarget)) keyboardFocus = false;
  }
  $effect(() => {
    void hudActivity;
    if (!mounted || !expanded || !playing || loading || unavailable || playerError || transportError || pointerHeld || keyboardFocus) {
      hudVisible = true;
      return;
    }
    const timer = setTimeout(() => { hudVisible = false; }, 3_000);
    return () => clearTimeout(timer);
  });

  async function enterFullscreen(): Promise<void> {
    expanded = true;
    await tick();
    if (!mounted) return;
    immersiveOwned = true;
    await setImmersiveFullscreen(true, figure);
  }

  function shrink(): void { expanded = false; }

  function clearBufferingTimer(): void {
    clearTimeout(bufferingTimer);
    bufferingTimer = undefined;
  }

  function framesReady(): void {
    clearBufferingTimer();
    loading = false;
  }

  function framesWaiting(): void {
    if (loading || unavailable || bufferingTimer !== undefined) return;
    // Một lần tua có thể báo waiting trong vài khung hình.
    bufferingTimer = setTimeout(() => {
      bufferingTimer = undefined;
      loading = true;
    }, 650);
  }

  function retryVideo(): void {
    clearBufferingTimer();
    unavailable = false;
    loading = true;
    retryCount += 1;
    video?.load();
  }

  onMount(() => {
    mounted = true;
    video?.setAttribute('webkit-playsinline', 'true');
    let cancelled = false;
    let localUrl: string | undefined;
    const fullscreenChanged = () => {
      if (landscape && immersiveOwned && !document.fullscreenElement) { immersiveOwned = false; expanded = false; }
    };
    document.addEventListener('fullscreenchange', fullscreenChanged);
    const keyboardActivity = () => {
      keyboardInput = true;
      if (figure?.contains(document.activeElement)) { keyboardFocus = true; showHud(); }
    };
    const pointerActivity = () => { keyboardInput = false; keyboardFocus = false; };
    const pointerReleased = () => { if (pointerHeld) { pointerHeld = false; showHud(); } };
    document.addEventListener('keydown', keyboardActivity, true);
    document.addEventListener('pointerdown', pointerActivity, true);
    document.addEventListener('pointerup', pointerReleased);
    document.addEventListener('pointercancel', pointerReleased);
    async function loadSource(): Promise<void> {
      const saved = await getOfflineTrack(url, { album: $audioPlayer.album ?? undefined }).catch(() => null);
      if (cancelled) return;
      if (saved?.blob) localUrl = URL.createObjectURL(saved.blob);
      videoSource = localUrl ?? resolveApiUrl(url);
    }
    void loadSource();
    return () => {
      mounted = false;
      cancelled = true;
      clearBufferingTimer();
      document.removeEventListener('fullscreenchange', fullscreenChanged);
      document.removeEventListener('keydown', keyboardActivity, true);
      document.removeEventListener('pointerdown', pointerActivity, true);
      document.removeEventListener('pointerup', pointerReleased);
      document.removeEventListener('pointercancel', pointerReleased);
      if (immersiveOwned) void setImmersiveFullscreen(false);
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  });

  $effect(() => {
    if (!expanded && immersiveOwned) {
      immersiveOwned = false;
      void setImmersiveFullscreen(false);
    }
  });

  $effect(() => {
    if (mounted) (expanded ? listButton : expandButton)?.focus({ preventScroll: true });
  });

  $effect(() => {
    if (!mounted || !expanded || landscape) { hintVisible = false; return; }
    hintVisible = true;
    const timer = setTimeout(() => { hintVisible = false; }, 5_000);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    const surface = video;
    void retryCount;
    if (!mounted || !surface) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    async function connect(): Promise<void> {
      try {
        const player = await getAudioPlayer();
        if (cancelled) return;
        dispose = attachTalkVideoMirror(player.audio, surface!, document, () => { unavailable = true; }, {
          hold: () => player.holdVideoPlayback(url),
          wantsPlayback: () => player.videoPlaybackRequested,
        });
      } catch { if (!cancelled) unavailable = true; }
    }
    void connect();
    return () => { cancelled = true; dispose?.(); };
  });

  function time(value: number): string {
    const seconds = Math.max(0, Math.floor(value));
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  }
</script>

<figure bind:this={figure} class="talk-video" class:expanded class:landscape>
  <div class="video-stage" role="group" aria-label={title} onpointerdown={hudPointerDown} onfocusin={hudFocusIn} onfocusout={hudFocusOut}>
  <div class="video-media">
  <video bind:this={video} src={videoSource || undefined} {poster} muted playsinline preload="auto" aria-label={title}
    onloadeddata={framesReady} oncanplay={framesReady} onplaying={framesReady} onwaiting={framesWaiting}
    onseeked={(event) => { if (event.currentTarget.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) framesReady(); }}
    onerror={() => {
      const fallback = videoSource.startsWith('https://media.quangtu.vn/') ? publicMediaFallback(videoSource) : undefined;
      if (fallback) videoSource = fallback;
      else { unavailable = true; framesReady(); }
    }}></video>
  {#if landscape && !expanded}<button class="video-expand" bind:this={expandButton} type="button" onclick={() => void enterFullscreen()} aria-label={text.enterFullscreen} title={text.enterFullscreen}><Expand size={20} aria-hidden="true" /></button>{/if}
  </div>
  {#if expanded}
    <button class="video-hud-reveal" type="button" aria-label={text.showControls} aria-expanded={!hudHidden} onclick={showHud}></button>
    <div class="video-topbar" class:hud-hidden={hudHidden} inert={hudHidden} aria-hidden={hudHidden}>
      <button type="button" onclick={landscape ? shrink : onBack}><ArrowLeft size={20} aria-hidden="true" />{text.back}</button>
      <button bind:this={listButton} type="button" onclick={shrink}><ListVideo size={20} aria-hidden="true" />{landscape ? text.exitFullscreen : text.list}</button>
    </div>
    {#if hintVisible}
      <div class="background-hint" role="status">
        <Smartphone size={24} aria-hidden="true" />
        <div><strong>{text.backgroundHint}</strong><small>{text.hintTimeout}</small></div>
      </div>
    {/if}
    {#if unavailable && !landscape}<p class="video-error" role="status">{text.unavailable}</p>{/if}
  {/if}
  <div class="video-caption" class:hud-hidden={hudHidden} inert={hudHidden} aria-hidden={hudHidden}>
    {#if landscape}
      {#if unavailable}
        <p role="status">{text.videoUnavailable}</p><button type="button" onclick={retryVideo}>{text.retry}</button>
      {:else if loading}<p class="video-loading" role="status">{text.loading}</p>{/if}
      <VideoTransport {title} compact={!expanded} onErrorChange={(value) => { transportError = value; }} />
    {:else if expanded}
      <VideoTransport {title} onErrorChange={(value) => { transportError = value; }} />
    {:else}
      <button bind:this={expandButton} type="button" onclick={() => { expanded = true; }}><Expand size={18} aria-hidden="true" />{text.fullscreen}</button>
      <span class="playing-label">{text.playing} · {text.track} {$audioPlayer.trackIndex + 1}</span>
      <strong>{title}</strong>
      <span class="time-label">{time($audioPlayer.currentTime)} / {time($audioPlayer.duration)}</span>
      <progress max={$audioPlayer.duration || 1} value={$audioPlayer.currentTime} aria-label={text.seek}></progress>
      {#if unavailable}<p role="status">{text.unavailable}</p>{/if}
    {/if}
  </div>
  </div>
</figure>

<style>
  .talk-video { display: grid; grid-template-columns: minmax(0, 35%) minmax(0, 1fr); flex: none; margin: .5em; border: 1px solid var(--border2); border-radius: var(--radius-card); overflow: hidden; background: var(--bg2); }
  .video-stage { display: contents; }
  .landscape .video-stage { display: block; position: relative; block-size: 100%; }
  .landscape:not(.expanded) { display: block; margin: 0; background: var(--bg); }
  .video-media { display: contents; }
  .landscape:not(.expanded) .video-media { display: block; position: relative; }
  .video-expand { position: absolute; inset-block-end: .5em; inset-inline-end: .5em; padding: 0; }
  @media (orientation: portrait) and (pointer: coarse), (orientation: portrait) and (max-width: 799px) {
    .landscape.expanded .video-stage {
      position: absolute;
      inset: 50% auto auto 50%;
      inline-size: 100dvh;
      block-size: 100dvw;
      transform: translate(-50%, -50%) rotate(90deg);
    }
    .landscape.expanded .video-topbar {
      top: max(.75em, env(safe-area-inset-right, 0px));
      left: max(.75em, env(safe-area-inset-top, 0px));
      right: max(.75em, env(safe-area-inset-bottom, 0px));
    }
    .landscape.expanded .video-caption {
      padding-left: max(1em, env(safe-area-inset-top, 0px));
      padding-right: max(1em, env(safe-area-inset-bottom, 0px));
      padding-bottom: max(.5em, env(safe-area-inset-left, 0px));
    }
  }
  .landscape:not(.expanded) video { aspect-ratio: 16 / 9; block-size: auto; }
  .landscape .video-caption > p { color: inherit; padding: var(--space-page); }
  .landscape:not(.expanded) .video-caption { position: relative; display: block; padding: 0; }
  .landscape .video-caption > .video-loading { position: absolute; inset-inline-start: 0; inset-block-end: 100%; padding: .5em .75em; background: var(--video-surface); color: var(--video-ink); pointer-events: none; }

  video { display: block; inline-size: 100%; block-size: min(25dvh, 14rem); object-fit: contain; background: var(--video-surface); }
  .video-caption { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: .5em; min-inline-size: 0; padding: .75em; }
  button { display: inline-flex; align-items: center; justify-content: center; gap: .5em; min-block-size: 44px; min-inline-size: 44px; padding: .5em .75em; border: 1px solid var(--border2); border-radius: 999px; background: var(--bg); color: var(--text); font: inherit; font-size:var(--font-size-label); cursor: pointer; touch-action: manipulation; }
  button:focus-visible { outline: 2px solid var(--gold); outline-offset: -2px; }
  .video-caption > button { align-self: flex-end; }
  .video-caption > strong { color: var(--text); font-size:var(--font-size-body); line-height: 1.4; overflow-wrap: anywhere; }
  .playing-label { color: var(--brown); font-size:var(--font-size-meta); }
  .time-label { color: var(--muted); font-size: .75em; font-variant-numeric: tabular-nums; }
  progress { inline-size: 100%; block-size: .35em; accent-color: var(--gold); }
  p { margin: 0; font-size:var(--font-size-body); color: var(--muted); }
  .expanded { position: fixed; inset: 0; z-index: 2000; display: block; margin: 0; border: 0; border-radius: 0; background: var(--video-surface); color: var(--video-ink); }
  .expanded video { inline-size: 100%; block-size: 100%; }
  .expanded:not(.landscape) .video-stage { display: block; position: relative; block-size: 100%; }
  .video-hud-reveal { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; padding: 0; border: 0; border-radius: 0; background: transparent; }
  .hud-hidden { visibility: hidden; pointer-events: none; }
  .video-topbar { position: absolute; top: max(.75em, var(--app-safe-top, env(safe-area-inset-top, 0px))); right: max(.75em, env(safe-area-inset-right, 0px)); left: max(.75em, env(safe-area-inset-left, 0px)); display: flex; justify-content: space-between; gap: .5em; }
  .video-topbar button { border-color: color-mix(in srgb, var(--video-ink) 50%, transparent); color: var(--video-ink); background: color-mix(in srgb, var(--video-surface) 70%, transparent); }
  .expanded .video-caption { position: absolute; inset-inline: 0; bottom: 0; display: block; padding: 0; }
  .background-hint { position: absolute; top: calc(max(.75em, var(--app-safe-top, env(safe-area-inset-top, 0px))) + 54px); inset-inline: .75em; display: flex; align-items: center; gap: .75em; padding: .75em; border: 1px solid var(--gold); border-radius: var(--radius-control); background: color-mix(in srgb, var(--video-surface) 90%, transparent); color: var(--video-ink); pointer-events: none; }
  .background-hint :global(svg) { flex: none; }
  .background-hint strong { display: block; font-size:var(--font-size-body); line-height: 1.4; }
  .background-hint small { display: block; margin-top: .3em; font-size:var(--font-size-meta); opacity: .8; }
  .video-error { position: absolute; top: 35%; inset-inline: 1em; padding: .75em; color: var(--video-ink); background: var(--video-surface); }
  @media (max-width: 600px) { .video-caption { gap: .35em; padding: .5em; } }
  @media (orientation: landscape) and (max-height: 500px) { .background-hint { max-inline-size: 25em; } }
</style>
