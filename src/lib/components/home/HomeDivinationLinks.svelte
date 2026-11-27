<script lang="ts">
  import { goto } from '$app/navigation';
  import DivinationArtwork from '$lib/components/practice/divination/DivinationArtwork.svelte';
  import { getDivinationCopy } from '$lib/i18n/divination-ui';
  import { getLocaleContext } from '$lib/stores/locale.svelte';

  const locale = getLocaleContext();
  const copy = $derived(getDivinationCopy(locale.current === 'en'));
  const links = $derived([
    { kind: 'quan-am', href: '/tu-tap/quan-am-linh-xam', copy: copy.homeQuanAm },
    { kind: 'moc-luan', href: '/tu-tap/moc-luan-chiem-sat', copy: copy.homeMocLuan },
    { kind: 'biorhythm', href: '/tu-tap/nhip-sinh-hoc', copy: copy.homeBiorhythm },
    { kind: 'dream', href: '/tu-tap/giai-mong', copy: copy.homeDream },
  ] as const);

  function openLink(event: MouseEvent, href: string): void {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void goto(href, { state: { homeDivination: true } });
  }
</script>

<section class="home-divination" aria-labelledby="home-divination-title">
  <h2 id="home-divination-title">{copy.groupTitle}</h2>
  <div class="divination-links">
    {#each links as link (link.kind)}
      <a
        class="divination-link"
        href={link.href}
        data-sveltekit-preload-data="off"
        onclick={(event) => openLink(event, link.href)}
      >
        <span class="divination-icon" aria-hidden="true">
          <DivinationArtwork kind={link.kind} size={48} />
        </span>
        <span class="divination-label">
          <strong><span>{link.copy.title[0]}</span>{' '}<span>{link.copy.title[1]}</span></strong>
          <small><span class="divination-activity">{link.copy.activity} · </span>{link.copy.count}</small>
        </span>
        <span class="divination-arrow" aria-hidden="true">→</span>
      </a>
    {/each}
  </div>
</section>

<style>
  .home-divination {
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  h2 {
    margin: 0;
    color: var(--text);
    font-size: var(--font-size-section-title);
    line-height: 1.4;
  }

  .divination-links {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .divination-link {
    box-sizing: border-box;
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    min-width: 0;
    min-height: max(88px, var(--touch-target-size));
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--card);
    color: var(--text);
    text-decoration: none;
  }

  .divination-link:focus-visible {
    outline: 2px solid var(--brown);
    outline-offset: 2px;
  }

  @media (hover: hover) {
    .divination-link:hover {
      background: var(--gold-light);
    }
  }

  .divination-icon {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    border-radius: var(--radius);
    background: var(--bg2);
  }

  .divination-label {
    display: grid;
    gap: 3px;
    min-width: 0;
    overflow-wrap: anywhere;
    line-height: 1.35;
  }

  strong {
    max-width: 100%;
    font-size: var(--font-size-card-title);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  small {
    color: var(--brown);
    font-size: var(--font-size-label);
  }

  .divination-arrow {
    color: var(--brown);
  }

  @media (max-width: 540px) {
    .divination-link {
      position: relative;
      grid-template-columns: minmax(0, 1fr);
      align-content: start;
      justify-items: center;
      gap: 6px;
      padding: 10px 8px;
      text-align: center;
    }

    strong {
      font-size: clamp(11px, 3.4vw, var(--font-size-card-title));
    }

    .divination-activity {
      display: none;
    }

    .divination-arrow {
      position: absolute;
      inset-block-start: 10px;
      inset-inline-end: 10px;
    }
  }
</style>
