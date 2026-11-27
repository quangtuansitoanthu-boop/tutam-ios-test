<script lang="ts">
  import {
    ARTWORK_HEIGHT,
    ARTWORK_WIDTH,
    COIN_MOTION_MS,
    STICK_MOTION_MS,
    createQuanAmPainter,
    type CoinPalette,
    type CoinFaces,
  } from './quan-am-artwork';

  type Scene =
    | { kind: 'tube'; number: number | null; shaking: boolean; landed: boolean }
    | { kind: 'coins'; faces: CoinFaces; landing: CoinFaces | undefined };

  let { scene, onMotionEnd }: { scene: Scene; onMotionEnd: (reducedMotion: boolean) => void } = $props();
  let canvas = $state<HTMLCanvasElement>();

  $effect(() => {
    if (!canvas) return;
    const current = scene;
    const finish = onMotionEnd;
    const moving = current.kind === 'tube' ? current.shaking : current.landing !== undefined;
    const duration = current.kind === 'tube' ? STICK_MOTION_MS : COIN_MOTION_MS;
    const density = Math.min(2, window.devicePixelRatio || 1);
    const pixelWidth = Math.round(ARTWORK_WIDTH * density);
    const pixelHeight = Math.round(ARTWORK_HEIGHT * density);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    const pen = canvas.getContext('2d');
    const styles = getComputedStyle(canvas);
    const palette: CoinPalette = {
      glint: styles.getPropertyValue('--practice-coin-glint').trim(),
      gold: styles.getPropertyValue('--practice-coin-gold').trim(),
      amber: styles.getPropertyValue('--practice-coin-amber').trim(),
      copper: styles.getPropertyValue('--practice-coin-copper').trim(),
      brown: styles.getPropertyValue('--practice-coin-brown').trim(),
      rim: styles.getPropertyValue('--practice-coin-rim').trim(),
    };
    const painter = pen ? createQuanAmPainter(pen, palette) : undefined;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame: number | undefined;
    let start: number | undefined;
    let elapsed = current.kind === 'tube' && current.landed ? duration : 0;
    let cancelled = false;
    let finished = false;

    function paint(): void {
      if (!pen || !painter) return;
      pen.setTransform(pixelWidth / ARTWORK_WIDTH, 0, 0, pixelHeight / ARTWORK_HEIGHT, 0, 0);
      pen.clearRect(0, 0, ARTWORK_WIDTH, ARTWORK_HEIGHT);
      if (current.kind === 'tube') {
        painter.drawTube(elapsed, current.number);
      } else {
        painter.drawCoins(elapsed, current.faces, current.landing);
      }
    }

    function complete(reducedMotion: boolean): void {
      if (cancelled || finished) return;
      finished = true;
      elapsed = duration;
      paint();
      finish(reducedMotion);
    }

    function animate(now: number): void {
      start ??= now;
      elapsed = now - start;
      if (elapsed >= duration) {
        complete(false);
      } else {
        paint();
        frame = requestAnimationFrame(animate);
      }
    }

    function finishWhenReduced(): void {
      if (!motion.matches) return;
      if (frame !== undefined) cancelAnimationFrame(frame);
      complete(true);
    }

    if (moving) {
      if (motion.matches || !painter) queueMicrotask(() => complete(motion.matches));
      else frame = requestAnimationFrame(animate);
      motion.addEventListener('change', finishWhenReduced);
    } else {
      paint();
    }

    return () => {
      cancelled = true;
      if (frame !== undefined) cancelAnimationFrame(frame);
      motion.removeEventListener('change', finishWhenReduced);
    };
  });
</script>

<div class="qa-artwork" data-qa-artwork={scene.kind}>
  <canvas bind:this={canvas} width={ARTWORK_WIDTH} height={ARTWORK_HEIGHT} aria-hidden="true"></canvas>
</div>

<style>
  .qa-artwork {
    width: min(100%, 440px);
    margin-inline: auto;
    overflow: hidden;
    border-radius: var(--radius-card);
    background: radial-gradient(ellipse at 50% 58%, var(--bg), var(--bg2) 75%);
  }

  canvas {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 350/234;
  }
</style>
