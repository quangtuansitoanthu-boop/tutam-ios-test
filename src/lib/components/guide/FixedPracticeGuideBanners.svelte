<script lang="ts">
  import { getLocaleContext } from '$lib/stores/locale.svelte';

  const localeStore = getLocaleContext();
  const isEn = $derived(localeStore.current === 'en');
</script>

<div class="fixed-practice-banners" aria-label={isEn ? 'Practice Guides' : 'Hướng dẫn tu tập'}>
  <!-- 1. BANNER HƯỚNG DẪN CHO NGƯỜI MỚI TÌM HIỂU -->
  <div class="tt-guide-banner-wrap">
    <a
      href="/huong-dan?phan=tu-hoc#huong-dan-nguoi-moi"
      class="tt-guide-banner tt-newbie-banner"
      aria-label={isEn ? 'Buddhist practice guide for beginners' : 'Hướng dẫn tu học Phật cho người mới tìm hiểu'}
    >
      <div class="tt-guide-banner__top">
        <div class="tt-guide-banner__icon-box tt-icon-box--green" aria-hidden="true">
          <span class="tt-guide-banner__icon">🌱</span>
        </div>
        <div class="tt-guide-banner__tag tt-tag--green">
          <span>{isEn ? 'For Beginners' : 'Dành cho người mới tìm hiểu'}</span>
        </div>
        <div class="tt-guide-banner__cta" aria-hidden="true">
          <span class="tt-guide-banner__cta-arrow">→</span>
        </div>
      </div>
      <div class="tt-guide-banner__body">
        <h2 class="tt-guide-banner__title">
          {isEn ? 'Buddhist Practice Guide for Beginners' : 'Hướng dẫn tu học Phật cho người mới tìm hiểu'}
        </h2>
        <p class="tt-guide-banner__desc">
          {isEn
            ? '4-Stage Roadmap: Karma Books · Great Compassion Mantra · Dharma Talks · Daily Practice'
            : 'Lộ trình 4 giai đoạn: Sách nhân quả · Trì chú Đại Bi · Nghe giảng kinh · Công phu mỗi ngày'}
        </p>
      </div>
    </a>
  </div>

  <!-- 2. BANNER HƯỚNG DẪN BỐ THÍ PHÁP ĐỘ VONG LINH -->
  <div class="tt-guide-banner-wrap">
    <a
      href="/huong-dan?phan=tu-hoc#bo-thi-may-nghe-phap"
      class="tt-guide-banner tt-dharma-giving-banner"
      aria-label={isEn ? 'Dharma Giving Guide — Recitation players for spirits' : 'Hướng dẫn bố thí pháp máy nghe pháp độ vong linh'}
    >
      <div class="tt-guide-banner__top">
        <div class="tt-guide-banner__icon-box tt-icon-box--amber" aria-hidden="true">
          <span class="tt-guide-banner__icon">📻</span>
        </div>
        <div class="tt-guide-banner__tag tt-tag--amber">
          <span>{isEn ? 'Dharma Giving' : 'Bố Thí Pháp · Độ Vong Linh'}</span>
        </div>
        <div class="tt-guide-banner__cta" aria-hidden="true">
          <span class="tt-guide-banner__cta-arrow">→</span>
        </div>
      </div>
      <div class="tt-guide-banner__body">
        <h2 class="tt-guide-banner__title">
          {isEn ? 'Offering Recitation Players — Aiding Departed Spirits' : 'Bố thí máy nghe pháp — Trợ duyên cõi u minh'}
        </h2>
        <p class="tt-guide-banner__desc">
          {isEn
            ? 'Great compassionate merits: Setting up chanting players at cemeteries, hospitals, and accident sites to guide departed souls.'
            : 'Công đức thù thắng từ bi: Hướng dẫn đặt máy niệm Phật tại nghĩa trang, bệnh viện, điểm tai nạn... trợ duyên hương linh vãng sinh.'}
        </p>
      </div>
    </a>
  </div>
</div>

<style>
  .fixed-practice-banners {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
    width: 100%;
    box-sizing: border-box;
  }

  @media (min-width: 720px) {
    .fixed-practice-banners {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
  }

  .tt-guide-banner-wrap {
    width: 100%;
    box-sizing: border-box;
    display: flex;
  }

  .tt-guide-banner {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    padding: 13px 14px;
    text-decoration: none;
    border-radius: var(--radius-card);
    border: 1px solid rgba(200, 150, 62, 0.35);
    background: linear-gradient(135deg, rgba(200, 150, 62, 0.1) 0%, rgba(39, 174, 96, 0.06) 100%);
    box-shadow: var(--shadow-sm);
    transition: transform var(--motion-fast) var(--ease-standard), box-shadow var(--motion-fast) var(--ease-standard), border-color var(--motion-fast) var(--ease-standard);
    overflow: hidden;
    box-sizing: border-box;
  }

  :global([data-theme='dark']) .tt-guide-banner {
    background: linear-gradient(135deg, rgba(200, 150, 62, 0.16) 0%, rgba(39, 174, 96, 0.1) 100%);
    border-color: rgba(200, 150, 62, 0.36);
    box-shadow: var(--shadow-sm);
  }

  .tt-guide-banner:hover {
    transform: translateY(-2px);
    border-color: var(--gold, #c8963e);
    box-shadow: var(--shadow);
  }

  .tt-guide-banner:active {
    transform: scale(0.99);
  }

  .tt-guide-banner:hover .tt-guide-banner__cta-arrow {
    transform: translateX(3px);
  }

  .tt-newbie-banner {
    border-color: rgba(39, 174, 96, 0.28);
    background: linear-gradient(135deg, rgba(39, 174, 96, 0.09) 0%, rgba(200, 150, 62, 0.06) 100%);
  }

  :global([data-theme='dark']) .tt-newbie-banner {
    border-color: rgba(39, 174, 96, 0.36);
    background: linear-gradient(135deg, rgba(39, 174, 96, 0.15) 0%, rgba(200, 150, 62, 0.1) 100%);
  }

  .tt-dharma-giving-banner {
    border-color: rgba(217, 119, 6, 0.3);
    background: linear-gradient(135deg, rgba(217, 119, 6, 0.1) 0%, rgba(245, 158, 11, 0.06) 100%);
  }

  :global([data-theme='dark']) .tt-dharma-giving-banner {
    background: linear-gradient(135deg, rgba(217, 119, 6, 0.17) 0%, rgba(245, 158, 11, 0.09) 100%);
    border-color: rgba(217, 119, 6, 0.36);
  }

  .tt-guide-banner__top {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
  }

  .tt-guide-banner__icon-box {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    border-radius: 11px;
  }

  .tt-icon-box--green {
    background: rgba(39, 174, 96, 0.14);
    border: 1px solid rgba(39, 174, 96, 0.24);
  }

  :global([data-theme='dark']) .tt-icon-box--green {
    background: rgba(39, 174, 96, 0.2);
    border-color: rgba(39, 174, 96, 0.35);
  }

  .tt-icon-box--amber {
    background: rgba(217, 119, 6, 0.14);
    border: 1px solid rgba(217, 119, 6, 0.24);
  }

  :global([data-theme='dark']) .tt-icon-box--amber {
    background: rgba(217, 119, 6, 0.22);
    border-color: rgba(217, 119, 6, 0.38);
  }

  .tt-guide-banner__icon {
    font-size: 18px;
    line-height: 1;
  }

  .tt-guide-banner__body {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .tt-guide-banner__tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    width: fit-content;
    max-width: 100%;
    box-sizing: border-box;
    overflow-wrap: anywhere;
    padding: 3px 9px;
    border-radius: 999px;
    font-family: inherit;
    font-size: var(--font-size-meta);
    font-weight: 800;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    line-height: 1.3;
  }

  .tt-tag--green {
    background: rgba(39, 174, 96, 0.12);
    color: #1e7e34;
  }

  :global([data-theme='dark']) .tt-tag--green {
    background: rgba(46, 204, 113, 0.16);
    color: #4cd964;
  }

  .tt-tag--amber {
    background: rgba(217, 119, 6, 0.12);
    color: #b45309;
  }

  :global([data-theme='dark']) .tt-tag--amber {
    background: rgba(245, 158, 11, 0.16);
    color: #fbbf24;
  }

  .tt-guide-banner__title {
    margin: 0;
    font-family: inherit;
    font-size: var(--font-size-card-title);
    font-weight: 700;
    line-height: 1.35;
    color: var(--text);
    letter-spacing: -0.01em;
  }

  .tt-guide-banner__desc {
    margin: 0;
    font-family: inherit;
    font-size: var(--font-size-body);
    line-height: 1.5;
    color: var(--text2);
  }

  .tt-guide-banner__cta {
    display: flex;
    align-items: center;
    margin-left: auto;
    flex-shrink: 0;
  }

  .tt-guide-banner__cta-arrow {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    font-size: 15px;
    font-weight: 700;
    transition: transform var(--motion-fast) var(--ease-standard);
  }

  .tt-newbie-banner .tt-guide-banner__cta-arrow {
    background: rgba(39, 174, 96, 0.14);
    color: #1e7e34;
  }

  .tt-dharma-giving-banner .tt-guide-banner__cta-arrow {
    background: rgba(217, 119, 6, 0.14);
    color: #b45309;
  }

  :global([data-theme='dark']) .tt-newbie-banner .tt-guide-banner__cta-arrow {
    background: rgba(46, 204, 113, 0.18);
    color: #4cd964;
  }

  :global([data-theme='dark']) .tt-dharma-giving-banner .tt-guide-banner__cta-arrow {
    background: rgba(245, 158, 11, 0.18);
    color: #fbbf24;
  }

  .tt-guide-banner:hover .tt-guide-banner__cta-arrow {
    transform: scale(1.06);
  }

  @media (prefers-reduced-motion: reduce) {
    .tt-guide-banner,
    .tt-guide-banner__cta-arrow {
      transition: none;
    }
  }
</style>
