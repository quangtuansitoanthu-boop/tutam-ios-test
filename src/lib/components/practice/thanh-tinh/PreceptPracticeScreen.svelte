<script lang="ts">
  import { onMount } from 'svelte';
  import { ChevronLeft, X } from '@lucide/svelte';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { getPreceptPracticeCopy } from '$lib/i18n/precept-practice-ui';
  import PreceptsPanel from './PreceptsPanel.svelte';
  import EightPreceptsPanel from './EightPreceptsPanel.svelte';

  const GUIDE_FONT_SCALE_KEY = 'tutam_guide_font_scale_v1';

  let { open, mode = 'daily', onClose, onOpenAbstinence, onOpenActivity, resumeReflection = false, resumeTestingPrincipal = null, testingConductConfirmed = false, testingConductAnswer }: {
    open: boolean; mode?: 'daily' | 'eight'; onClose: () => void; onOpenAbstinence: (options: { sessionId: string; principal: string | null }) => void;
    resumeReflection?: boolean;
    resumeTestingPrincipal?: string | null; testingConductConfirmed?: boolean;
    testingConductAnswer?: 'kept' | 'review';
    onOpenActivity?: (target: 'books' | 'talks' | 'practice') => void;
  } = $props();
  const locale = getLocaleContext();
  const c = $derived(getPreceptPracticeCopy(locale.current === 'en'));
  const isEn = $derived(locale.current === 'en');
  let eightView = $state<'prepare' | 'rite' | 'active' | 'reflection' | 'ended'>('prepare');
  let dailyPanel = $state<{ handleBack: () => boolean }>();
  let guideFontScale = $state(1);

  onMount(() => {
    try {
      const saved = Number(localStorage.getItem(GUIDE_FONT_SCALE_KEY));
      if (Number.isFinite(saved) && saved >= 0.85 && saved <= 1.35) guideFontScale = saved;
    } catch { /* ignore storage errors */ }
  });

  function stepFontScale(delta: number): void {
    const next = Math.max(0.85, Math.min(1.35, Number((guideFontScale + delta).toFixed(2))));
    guideFontScale = next;
    try { localStorage.setItem(GUIDE_FONT_SCALE_KEY, String(next)); } catch { /* ignore */ }
  }

  export function handleBack(): boolean {
    if (mode !== 'eight') return dailyPanel?.handleBack() ?? false;
    if (eightView === 'rite') { eightView = 'prepare'; return true; }
    if (eightView === 'reflection') { eightView = 'active'; return true; }
    return false;
  }
  function back() { if (!handleBack()) onClose(); }

</script>

{#if open}
  <dialog use:modalDialog class="thanh-tinh-overlay precept-practice-screen" data-testid="precept-practice-screen" aria-labelledby="precept-practice-title" oncancel={(event) => { event.preventDefault(); back(); }}>
    <header>
      <button class="btn-back icon-button" aria-label={c.back} onclick={back}><ChevronLeft size={22} /></button>
      <h1 id="precept-practice-title" tabindex="-1" data-modal-focus>{mode === 'eight' ? c.tabEight : c.featureTitle}</h1>
      <div class="font-controls" role="group" aria-label={isEn ? 'Adjust text size' : 'Chỉnh cỡ chữ'}>
        <button class="font-btn" type="button" aria-label={isEn ? 'Decrease text size' : 'Giảm cỡ chữ'} disabled={guideFontScale <= 0.85} onclick={() => stepFontScale(-0.1)}>A−</button>
        <button class="font-btn" type="button" aria-label={isEn ? 'Increase text size' : 'Tăng cỡ chữ'} disabled={guideFontScale >= 1.35} onclick={() => stepFontScale(0.1)}>A+</button>
      </div>
      <button class="icon-button" aria-label={c.close} onclick={onClose}><X size={20} /></button>
    </header>
    <main style={`--guide-font-scale:${guideFontScale}`}>
      {#if mode === 'eight'}
        <EightPreceptsPanel bind:view={eightView} {onOpenActivity} onReturnToPractice={onClose} />
      {:else}
        <PreceptsPanel bind:this={dailyPanel} {onOpenAbstinence} {resumeReflection} {resumeTestingPrincipal} {testingConductConfirmed} {testingConductAnswer} onReturnToPractice={onClose} />
      {/if}
    </main>
  </dialog>
{/if}

<style>
  .precept-practice-screen { position: fixed; inset: 0; margin: 0; width: 100%; height: 100dvh; max-width: none; max-height: none; border: 0; padding: 0; background: var(--bg); color: var(--text); font-family: var(--font-app); overflow: auto; }
  header { display: flex; align-items: center; gap: 6px; position: sticky; top: 0; z-index: 10; background: color-mix(in srgb, var(--bg) 95%, transparent); backdrop-filter: blur(10px); border-bottom: 1px solid var(--border); padding: max(var(--radius-sm), env(safe-area-inset-top)) var(--radius-sm) var(--radius-sm); }
  h1 { flex: 1; min-width: 0; margin: 0; font-size: var(--font-size-card-title); text-align: center; font-weight: 800; color: var(--brown-dark); letter-spacing: 0.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  :global([data-theme='dark']) h1 { color: var(--gold2); }
  :global([data-theme='dark']) .icon-button, :global([data-theme='dark']) .font-btn { color: var(--gold2); }
  button { font: inherit; color: inherit; cursor: pointer; }
  .icon-button { min-width: 44px; min-height: 44px; display: grid; place-items: center; border: 1px solid var(--border); background: linear-gradient(155deg, var(--card), var(--bg2)); border-radius: 50%; color: var(--brown); box-shadow: inset 0 1.5px 0 color-mix(in srgb, var(--card) 88%, transparent), inset 0 -2px 0 rgba(60, 40, 10, 0.1), var(--shadow-sm); transition: transform 0.12s ease, border-color 0.15s ease; }
  .icon-button:active { transform: translateY(1.5px) scale(0.96); }
  .font-controls { display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; }
  .font-btn { min-width: 44px; min-height: 44px; padding: 0 8px; border: 1px solid var(--border); border-radius: 999px; background: linear-gradient(155deg, var(--card), var(--bg2)); color: var(--brown); font-size: var(--font-size-label); font-weight: 800; box-shadow: inset 0 1.5px 0 color-mix(in srgb, var(--card) 88%, transparent), inset 0 -2px 0 rgba(60, 40, 10, 0.1), var(--shadow-sm); transition: transform 0.12s ease; }
  .font-btn:active { transform: translateY(1.5px) scale(0.96); }
  .font-btn:disabled { opacity: 0.45; cursor: default; }
  main { max-width: var(--practice-dialog-width); margin: auto; padding: var(--space-page); padding-bottom: max(var(--space-page), env(safe-area-inset-bottom)); font-size: calc(1rem * var(--guide-font-scale, 1)); }
  button:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
</style>


