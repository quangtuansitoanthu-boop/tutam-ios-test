<script module lang="ts">
  export interface RosarySelectOption { value: string; label: string; group?: string; disabled?: boolean; key?: string }
</script>

<script lang="ts">
  import { Check, ChevronDown, Plus, X } from '@lucide/svelte';
  import { tick, type Snippet } from 'svelte';
  import { browser } from '$app/environment';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { rosaryPickerCopy } from '$lib/i18n/ui-copy';
  interface Props {
    label: string; accessibleLabel: string; value: string; options: RosarySelectOption[];
    onChange: (value: string) => void | boolean; recitation?: boolean; bold?: boolean;
    addLabel?: string; onAdd?: () => void;
    open?: boolean; anchor?: HTMLElement; children?: Snippet; showHeader?: boolean;
  }
  let { label, accessibleLabel, value, options, onChange, recitation = false, bold = false, addLabel, onAdd, open = $bindable(false), anchor, children, showHeader = true }: Props = $props();
  const locale = getLocaleContext();
  const copy = $derived(rosaryPickerCopy[locale.current === 'en' ? 'en' : 'vi']);
  const id = $props.id();
  let trigger = $state<HTMLButtonElement>();
  const selected = $derived(options.find(option => option.value === value)?.label ?? addLabel ?? value);
  function show() { open = true; }
  function choose(next: string) { if (onChange(next) !== false) open = false; }
  function add() { open = false; onAdd?.(); }

  // Cuộn lựa chọn hiện tại vào tầm nhìn bên trong danh sách (không cuộn viewport/panel gây giật).
  function place(panel: HTMLElement) {
    if (!browser) return;
    void tick().then(() => {
      if (!panel.isConnected) return;
      const list = panel.querySelector<HTMLElement>('.rosary-select__options');
      const active = list?.querySelector<HTMLElement>('[aria-pressed="true"], [aria-current="page"], .active');
      if (list && active) {
        const top = active.offsetTop - list.clientHeight / 2 + active.offsetHeight / 2;
        list.scrollTop = Math.max(0, top);
      }
    });
  }
  function navigate(event: KeyboardEvent) {
    // Không để phím trong bộ chọn lọt tới phím tắt đếm hạt của màn phía dưới.
    event.stopPropagation();
    if (event.defaultPrevented) return;
    if (!browser) return;
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    if (event.isComposing) return;
    const controls = [...(event.currentTarget as HTMLDialogElement).querySelectorAll<HTMLElement>('.rosary-select__options button:not(:disabled),.rosary-select__options a[href]')];
    if (!controls.length) return;
    const index = controls.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? controls.length - 1
      : index < 0 ? (event.key === 'ArrowUp' ? controls.length - 1 : 0)
      : (index + (event.key === 'ArrowUp' ? -1 : 1) + controls.length) % controls.length;
    event.preventDefault(); controls[next].focus();
  }
</script>

{#if !anchor}
<div class="rosary-select-field" class:recitation>
  <label for={id}>{label}</label>
  <button bind:this={trigger} id={id} type="button" class="rosary-select__trigger" data-dialog-glass class:bold role="combobox"
    aria-label={accessibleLabel} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${id}-dialog` : undefined}
    onclick={show} onkeydown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(); } }}>
    <span>{selected}</span><ChevronDown size={18} aria-hidden="true" />
  </button>
</div>
{/if}
{#if open}
  <dialog id={`${id}-dialog`} class="rosary-select__dialog" use:modalDialog aria-labelledby={showHeader ? `${id}-title` : undefined} aria-label={showHeader ? undefined : accessibleLabel}
    oncancel={event => { event.preventDefault(); event.stopPropagation(); open = false; }}
    onclick={event => { if (event.target === event.currentTarget) open = false; }} onkeydown={navigate}>
    <div class="rosary-select__panel" data-dialog-glass use:place>
      <div class="rosary-select__handle" aria-hidden="true"></div>
      {#if showHeader}<header><div><h2 id={`${id}-title`}>{recitation ? copy.title : label}</h2>{#if recitation}<p>{copy.subtitle}</p>{/if}</div><button class="rosary-select__close" type="button" aria-label={copy.close} onclick={() => open = false}><X size={20} /></button></header>{/if}
      <div class="rosary-select__options" class:rosary-select__options--custom={Boolean(children)}>
        {#if children}{@render children()}{:else}
        {#each options as option, index (option.key ?? option.value)}
          {#if option.group && option.group !== options[index - 1]?.group}<p class="rosary-select__group">{option.group}</p>{/if}
          <button class="rosary-select__option" class:bold type="button" disabled={option.disabled} aria-pressed={option.value === value} data-value={option.value} onclick={() => choose(option.value)}>
            <span>{option.label}</span><span class="rosary-select__check" aria-hidden="true">{#if option.value === value}<Check size={20} />{/if}</span>
          </button>
        {/each}
        {/if}
      </div>
      {#if addLabel && onAdd}<footer><button class="rosary-select__add" type="button" onclick={add}><Plus size={20} aria-hidden="true" />{addLabel}</button></footer>{/if}
    </div>
  </dialog>
{/if}

<style>
  .rosary-select-field{min-width:0;display:grid;align-content:start;gap:calc(var(--space-page)*.2)}
  label{color:var(--muted);font-size:var(--font-size-label);font-weight:800;letter-spacing:.04em;text-transform:uppercase}
  button{font:inherit;box-sizing:border-box;cursor:pointer}button:focus-visible{outline:3px solid var(--gold);outline-offset:2px}
  .rosary-select__trigger{display:flex;width:100%;min-height:44px;align-items:center;justify-content:space-between;gap:calc(var(--space-page)*.6);padding:calc(var(--space-page)*.6);border:1px solid var(--border);border-radius:var(--radius-control);background:var(--dialog-surface-background,var(--card));color:var(--text);font-family:var(--font-app);font-size:var(--font-size-label);font-weight:700;text-align:left}
  .rosary-select__trigger span{min-width:0;overflow-wrap:anywhere}.rosary-select__trigger :global(svg){flex-shrink:0}.bold{font-weight:700}
  .rosary-select__option:disabled{opacity:.5;cursor:not-allowed}
  .rosary-select__dialog{
    display:none;
    position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;
    margin:0;padding:0;border:0;background:transparent;color:var(--text);font-family:var(--font-app);
    z-index:10000;overflow:hidden
  }
  .rosary-select__dialog[open]{
    display:flex;flex-direction:column;justify-content:flex-end;align-items:center
  }
  .rosary-select__dialog::backdrop{
    background:var(--practice-dialog-backdrop,rgba(0,0,0,0.45));
    backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);
    animation:select-backdrop-enter .2s ease-out
  }
  .rosary-select__panel{
    position:relative;box-sizing:border-box;left:auto;right:auto;bottom:0;
    width:100%;max-width:min(100%,560px);margin-inline:auto;
    max-height:min(85dvh,600px);
    padding-bottom:max(env(safe-area-inset-bottom,0px),16px);
    display:flex;flex-direction:column;overflow:hidden;
    background:var(--dialog-surface-background,var(--card));
    border:1px solid var(--border);border-bottom:0;
    border-radius:var(--radius-feature,24px) var(--radius-feature,24px) 0 0;
    box-shadow:0 -8px 32px rgba(0,0,0,0.22);font-weight:700;
    will-change:transform
  }
  .rosary-select__dialog[open] .rosary-select__panel{
    animation:select-sheet-enter .26s cubic-bezier(.16,1,.3,1) both
  }
  :global(html[data-native-app='true']) .rosary-select__panel{
    --dialog-surface-background:var(--card);
    --dialog-surface-filter:none;
  }
  header{display:flex;align-items:center;justify-content:space-between;gap:calc(var(--space-page)*.5);padding:calc(var(--space-page)*.4) calc(var(--space-page)*.8) calc(var(--space-page)*.6)}header h2{margin:0;font-size:var(--font-size-card-title);font-weight:700}header p{margin:calc(var(--space-page)*.2) 0 0;color:var(--text2);font-size:var(--font-size-meta)}
  .rosary-select__close{display:grid;place-items:center;flex-shrink:0;width:44px;min-height:44px;border:0;background:transparent;color:var(--text2);border-radius:var(--radius-control)}
  .rosary-select__handle{flex-shrink:0;width:calc(var(--space-page)*2);height:5px;margin:10px auto 4px;background:var(--border);border-radius:var(--radius-sm)}
  .rosary-select__options{overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;min-height:0;max-height:380px;padding:0 calc(var(--space-page)*.5) calc(var(--space-page)*.5);scroll-padding:calc(var(--space-page)*.5)}
  .rosary-select__options--custom{display:flex;flex-direction:column}
  .rosary-select__option{display:flex;align-items:center;justify-content:space-between;gap:calc(var(--space-page)*.7);width:100%;min-height:52px;padding:calc(var(--space-page)*.6);border:0;border-radius:var(--radius);background:transparent;color:var(--text);font-size:var(--font-size-body);line-height:1.6;text-align:left;transition:background .15s}
  .rosary-select__option span:first-child{min-width:0;overflow-wrap:anywhere}.rosary-select__option[aria-pressed=true]{background:var(--gold-light);color:var(--brown)}.rosary-select__check{display:flex;width:20px;flex-shrink:0;color:var(--brown)}
  .rosary-select__group{margin:0;padding:calc(var(--space-page)*.5) calc(var(--space-page)*.6);color:var(--text2);font-size:var(--font-size-meta)}
  footer{padding:calc(var(--space-page)*.5) calc(var(--space-page)*.8);border-top:1px solid var(--border2)}
  .rosary-select__add{display:flex;align-items:center;gap:calc(var(--space-page)*.4);min-height:44px;width:100%;padding:calc(var(--space-page)*.4);border:0;border-radius:var(--radius);background:transparent;color:var(--brown);font-size:var(--font-size-label);font-weight:700;text-align:left}
  header,footer{flex-shrink:0}@media(hover:hover){.rosary-select__option:hover,.rosary-select__add:hover{background:var(--gold-light)}}
  @media(max-width:680px){.rosary-select-field.recitation{grid-column:1/-1}}
  @keyframes select-sheet-enter{from{transform:translateY(100%)}to{transform:translateY(0)}}
  @keyframes select-backdrop-enter{from{opacity:0}to{opacity:1}}
  @media(prefers-reduced-motion:reduce){
    .rosary-select__panel{transform:none}
    .rosary-select__dialog[open] .rosary-select__panel{animation:none}
    .rosary-select__dialog::backdrop{animation:none}
  }
</style>
