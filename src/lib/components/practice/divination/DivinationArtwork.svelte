<script lang="ts">
  interface Props {
    kind: 'quan-am' | 'moc-luan' | 'biorhythm' | 'dream';
    size?: number;
  }

  let { kind, size = 48 }: Props = $props();

  const frames: Record<Props['kind'], string> = {
    'quan-am': '0 0 512 512',
    'moc-luan': '512 0 512 512',
    biorhythm: '0 0 512 512',
    dream: '512 0 512 512',
  };

  const frame = $derived(frames[kind]);
  const sprite = $derived(kind === 'biorhythm' || kind === 'dream'
    ? '/images/icons/spiritual-tools-crystal-v1.webp'
    : '/images/icons/divination-crystal-v1.webp');
</script>

<svg
  class="divination-artwork"
  width={size}
  height={size}
  viewBox={frame}
  fill="none"
  aria-hidden="true"
  focusable="false"
>
  <image href={sprite} width="1024" height="512" />
</svg>

<style>
  .divination-artwork {
    display: block;
    flex-shrink: 0;
    max-width: 100%;
    height: auto;
    aspect-ratio: 1;
    overflow: hidden;
  }
</style>
