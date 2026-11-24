<script lang="ts">
  import { getBadgeDefinition, type PracticeBadgeId } from '$lib/domain/practice/progress-achievements';

  let { badgeId = null }: { badgeId?: PracticeBadgeId | null } = $props();
  // Các ô của ảnh 11 bậc, theo thứ tự từ trái sang phải.
  const columns = ['2.4%', '33.9%', '65.5%', '97.2%'];
  const rows = ['2.3%', '49.1%', '95.5%'];
  const index = $derived((getBadgeDefinition(badgeId)?.tier ?? 1) - 1);
</script>

<span
  class="practice-badge-icon"
  class:practice-badge-icon--starter={!badgeId}
  data-milestone={badgeId}
  style:--badge-x={columns[index % 4]}
  style:--badge-y={rows[Math.floor(index / 4)]}
  aria-hidden="true"
></span>

<style>
  .practice-badge-icon {
    display: block;
    position: relative;
    width: var(--practice-badge-size, 28px);
    height: var(--practice-badge-size, 28px);
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: 0 0 0 1.5px var(--gold), 0 0 0 2.5px var(--card);
  }

  .practice-badge-icon::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: var(--gold) url('/practice-badges/home-milestones.webp') no-repeat;
    background-size: 433.5% 325.1%;
    background-position: var(--badge-x) var(--badge-y);
  }

  .practice-badge-icon--starter::before {
    background-image: url('/practice-badges/home-new-practitioner.webp');
    background-size: 254.1% 130%;
    background-position: 93.1% 35.7%;
    filter: sepia(1) saturate(1.8);
  }

  .practice-badge-icon[data-milestone='streak-30']::before {
    filter: grayscale(1) contrast(0.24) brightness(1.6);
  }

  .practice-badge-icon[data-milestone='streak-90']::before {
    filter: hue-rotate(32deg) saturate(1.2);
  }

  .practice-badge-icon[data-milestone='streak-180']::before {
    filter: grayscale(1) sepia(1) saturate(4) hue-rotate(313deg) brightness(0.84);
  }

  .practice-badge-icon[data-milestone='streak-800']::before {
    filter: grayscale(1) contrast(0.58) sepia(0.7) brightness(1.28);
  }

  .practice-badge-icon[data-milestone='streak-3000']::before {
    filter: grayscale(1) sepia(1) saturate(3.2) hue-rotate(185deg) brightness(1.38);
  }

  .practice-badge-icon[data-milestone='streak-10000']::before {
    filter: saturate(0.78) brightness(1.22);
  }
</style>
