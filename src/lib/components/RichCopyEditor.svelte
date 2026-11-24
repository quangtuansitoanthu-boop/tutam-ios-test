<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { measureCopyPages, renderCopyRuns, renderGhostRuns, renderTracedCopyRuns } from '$lib/browser/copying-layout';
  import type { TypedRun } from '$lib/domain/practice/copying-typed-format';
  import { alignGhostRuns, canonicalizeGhostPrefix, nextExpectedGhostWord, reconcileGhostInput } from '$lib/domain/practice/copying-ghost-format';
  import { richCopyText, richCopySelection, setRichCopySelection } from '$lib/browser/copying-rich-text';
  let { value, runs, label, placeholder, invalid, maxlength, font, size = 20, scale = 1, allowPaste = false, readonly = false, ghostRuns = [], canonicalGhostRuns = [], showGhost = false, traceCanonical = true, mismatch = false, editingContext = '', onlayout, onreferencepaste, onvalue, onbeforeinput, ondisallow, oncaret, oncomposing, onmismatch }:
    { value: string; runs: TypedRun[]; label: string; placeholder: string; invalid: boolean; maxlength: number; font: string; size?: number; scale?: number; allowPaste?: boolean; readonly?: boolean;
      ghostRuns?: TypedRun[]; canonicalGhostRuns?: TypedRun[]; showGhost?: boolean; traceCanonical?: boolean; mismatch?: boolean; editingContext?: string;
      onvalue: (value: string, inputType: string) => void; onbeforeinput: (event: InputEvent) => void;
      ondisallow: (event: Event) => void; oncaret: () => void; oncomposing: (active: boolean) => void; onlayout?: () => void; onreferencepaste?: (text: string) => Promise<boolean>; onmismatch?: (expectedWord: string) => void } = $props();
  let element = $state<HTMLDivElement>();
  let ghostElement = $state<HTMLDivElement>();
  let paperScrollTop = $state(0);
  let composing = $state(false);
  let compositionReference = '';
  const compositionKey = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replaceAll('đ', 'd');
  let compositionCommitTimer: ReturnType<typeof setTimeout> | undefined;
  let selecting = $state(false);
  let pendingSelection: [number, number] | null = null;
  let rememberedSelection: [number, number] | null = null;
  let renderedRuns = '';
  let renderedGhostRuns = '';
  const canonicalGhostSource = $derived(canonicalGhostRuns.length > 0 ? canonicalGhostRuns : ghostRuns);
  const canonicalGhost = $derived(showGhost && canonicalGhostSource.length > 0 ? canonicalGhostSource.map(r => r.text).join('') : '');
  const canonicalMatched = $derived(Boolean(showGhost && traceCanonical && canonicalGhost && canonicalizeGhostPrefix(canonicalGhost, value).matched));
  const alignedGhost = $derived(
    !showGhost
      ? null
      : !composing && canonicalMatched
        ? canonicalGhostSource
        : alignGhostRuns(canonicalGhostSource, value)
  );
  function focused() {
    if (element && !selecting) {
      const selection = rememberedSelection ?? [value.length, value.length];
      setRichCopySelection(element, Math.min(selection[0], value.length), Math.min(selection[1], value.length));
    }
    oncaret();
  }
  type Snapshot = { value: string; selection: [number, number] };
  let undoStack: Snapshot[] = [], redoStack: Snapshot[] = [];
  let beforeEdit: Snapshot | null = null;
  let lastCommitted: string | undefined;
  let previousEditingContext = untrack(() => editingContext);
  $effect(() => {
    const context = editingContext;
    if (context === previousEditingContext) return;
    previousEditingContext = context;
    undoStack = []; redoStack = []; beforeEdit = null; lastCommitted = undefined; compositionReference = '';
    pendingSelection = null; rememberedSelection = null;
    if (compositionCommitTimer !== undefined) {
      clearTimeout(compositionCommitTimer); compositionCommitTimer = undefined;
    }
    if (composing) { composing = false; oncomposing(false); }
  });
  const snapshot = (): Snapshot => ({ value, selection: element && richCopySelection(element) || [value.length, value.length] });
  function commit(next: string, type: string) {
    if (!composing && next !== (beforeEdit?.value ?? value)) {
      undoStack.push(beforeEdit ?? snapshot());
      if (undoStack.length > 100) undoStack.shift();
      redoStack = [];
    }
    if (!composing) beforeEdit = null;
    lastCommitted = next; onvalue(next, type);
  }
  function history(redo = false) {
    if (composing) return;
    const from = redo ? redoStack : undoStack, to = redo ? undoStack : redoStack;
    const saved = from.pop();
    if (!saved) return;
    to.push(snapshot()); pendingSelection = saved.selection; lastCommitted = saved.value;
    onvalue(saved.value, redo ? 'historyRedo' : 'historyUndo');
  }
  function keys(event: KeyboardEvent) {
    if (readonly || composing || event.isComposing || !(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (event.key.toLowerCase() === 'z' || event.key.toLowerCase() === 'y') {
      event.preventDefault(); history(event.shiftKey || event.key.toLowerCase() === 'y');
    }
  }
  export function focus(options?: FocusOptions) { element?.focus(options); }
  export function getValue() { return element ? richCopyText(element) : value; }
  export function getSelectionEnd() { return element ? richCopySelection(element)?.[1] ?? value.length : value.length; }
  export function hasFocus() { return element === document.activeElement; }
  export function pageStarts(text: string, allRuns: TypedRun[]) { return element ? measureCopyPages(element, text, allRuns) : [0]; }
  export function setSelectionRange(start: number, end: number) { if (element) setRichCopySelection(element, start, end); }
  export function resetScroll() {
    if (element) element.scrollTop = 0;
    if (ghostElement) ghostElement.scrollTop = 0;
    paperScrollTop = 0;
  }
  function handleScroll() {
    paperScrollTop = element?.scrollTop ?? 0;
    if (ghostElement && element) ghostElement.scrollTop = element.scrollTop;
  }
  function caretRect() {
    const selection = window.getSelection();
    if (!element || document.activeElement !== element || !selection?.rangeCount || !selection.isCollapsed) return null;
    const range = selection.getRangeAt(0).cloneRange();
    let rect = range.getClientRects()[0];
    if (!rect && range.startContainer.nodeType === 3 && range.startOffset) {
      range.setStart(range.startContainer, range.startOffset - 1); rect = range.getBoundingClientRect();
    }
    return rect;
  }
  export function needsPage() {
    if (!element) return false;
    const selection = richCopySelection(element), rect = caretRect();
    if (!selection || selection[0] !== selection[1] || selection[1] !== getValue().length || !rect) return false;
    const style = getComputedStyle(element), line = parseFloat(style.lineHeight);
    return rect.bottom - element.getBoundingClientRect().top + element.scrollTop > element.clientHeight - parseFloat(style.paddingBottom) - Math.min(line, element.clientHeight / 6);
  }
  export function followCaret() {
    const rect = caretRect();
    if (!element || !rect) return;
    const bounds = element.getBoundingClientRect(), line = parseFloat(getComputedStyle(element).lineHeight);
    if (rect.bottom > bounds.bottom - line) element.scrollTop += rect.bottom - bounds.bottom + line;
    else if (rect.top < bounds.top + line / 2) element.scrollTop -= bounds.top + line / 2 - rect.top;
    handleScroll();
  }
  $effect(() => {
    const target = ghostElement, ghostList = alignedGhost ?? ghostRuns, enabled = showGhost, typedLen = value.length;
    if (!target || !enabled) { renderedGhostRuns = ''; return; }
    untrack(() => {
      const signature = JSON.stringify(ghostList) + ':' + typedLen;
      if (signature === renderedGhostRuns) return;
      renderedGhostRuns = signature;
      renderGhostRuns(target, ghostList, typedLen);
      if (element) target.scrollTop = element.scrollTop;
    });
  });
  $effect(() => {
    const target = element, content = value, formatted = runs, reference = alignedGhost ?? ghostRuns;
    const tracing = showGhost && canonicalGhost && alignedGhost !== null;
    if (!target || composing || selecting) return;
    untrack(() => {
      if (content !== lastCommitted) { undoStack = []; redoStack = []; lastCommitted = content; }
      const selection = pendingSelection ?? (document.activeElement === target ? richCopySelection(target) : null);
      pendingSelection = null;
      const signature = JSON.stringify(tracing ? reference : formatted) + ':' + content.length + ':' + Boolean(tracing);
      if (signature === renderedRuns && richCopyText(target) === content) return;
      renderedRuns = signature;
      const scrollTop = target.scrollTop;
      if (tracing) renderTracedCopyRuns(target, reference, content.length);
      else renderCopyRuns(target, formatted);
      // A zero-width placeholder is structural, never part of the user's saved string.
      if ((!content || content.endsWith('\n')) && (!tracing || content.length === canonicalGhost.length)) {
        const br = document.createElement('br'); br.dataset.copyPlaceholder = '';
        const typed = target.querySelectorAll('[data-copy-typed]');
        (tracing ? typed.item(typed.length - 1)?.parentElement ?? target : target.lastElementChild ?? target).append(br);
      }
      if (selection) setRichCopySelection(target, Math.min(selection[0], content.length), Math.min(selection[1], content.length));
      target.scrollTop = scrollTop;
    });
  });
  onMount(() => {
    if (!element) return;
    const pointerDown = () => { selecting = true; };
    const pointerUp = () => { if (selecting) { selecting = false; oncaret(); } };
    element.addEventListener('pointerdown', pointerDown);
    window.addEventListener('pointerup', pointerUp);
    window.addEventListener('pointercancel', pointerUp);
    window.addEventListener('blur', pointerUp);
    let width = 0, height = 0;
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => {
      if (!element || (width === element.clientWidth && height === element.clientHeight)) return;
      width = element.clientWidth; height = element.clientHeight; onlayout?.();
    });
    observer?.observe(element);
    const fontsChanged = () => onlayout?.();
    document.fonts?.addEventListener('loadingdone', fontsChanged);
    return () => {
      if (compositionCommitTimer !== undefined) clearTimeout(compositionCommitTimer);
      if (composing) { composing = false; oncomposing(false); }
      element?.removeEventListener('pointerdown', pointerDown);
      window.removeEventListener('pointerup', pointerUp);
      window.removeEventListener('pointercancel', pointerUp);
      window.removeEventListener('blur', pointerUp);
      observer?.disconnect(); document.fonts?.removeEventListener('loadingdone', fontsChanged);
    };
  });
  function flushPendingComposition() {
    if (compositionCommitTimer === undefined) return;
    clearTimeout(compositionCommitTimer);
    compositionCommitTimer = undefined;
    composing = false;
    changed(new Event('compositionend'));
    compositionReference = '';
    oncomposing(false);
  }
  function changed(event: Event) {
    if (!element) return;
    let next = richCopyText(element);
    const previous = beforeEdit?.value;
    const atEnd = !beforeEdit || beforeEdit.selection.every(offset => offset >= Math.min(previous?.length ?? 0, next.length));
    if (compositionReference && previous !== undefined && next.startsWith(previous) && !compositionReference.startsWith(compositionKey(next))) {
      // Some mobile IMEs wrap a word fragment in a DIV. Remove the resulting
      // separator only when the appended text still traces the same reference.
      const joined = previous + next.slice(previous.length).replace(/\n/gu, '');
      if (joined !== next && compositionReference.startsWith(compositionKey(joined))) {
        next = joined;
        if (!composing) pendingSelection = [next.length, next.length];
      }
    }
    if (!composing && showGhost && traceCanonical && canonicalGhost && previous !== undefined && atEnd) {
      const prefix = canonicalizeGhostPrefix(canonicalGhost, previous);
      if (prefix.matched) {
        const prevNfc = previous.normalize('NFC');
        const nextNfc = next.normalize('NFC');
        if (nextNfc.startsWith(prevNfc) && nextNfc.length > prevNfc.length) {
          const res = reconcileGhostInput(canonicalGhost, prefix.text, { incoming: nextNfc.slice(prevNfc.length) });
          if (res.mismatch) {
            next = prefix.text;
            renderedRuns = '';
            pendingSelection = [next.length, next.length];
            onmismatch?.(res.expectedWord ?? '');
          } else {
            next = res.text;
            renderedRuns = '';
            pendingSelection = [next.length, next.length];
          }
        } else if (nextNfc !== prevNfc) {
          // Handles mobile IME re-composition, case changes, NFD/NFC shifts,
          // or rapid consecutive words before DOM flush.
          const full = canonicalizeGhostPrefix(canonicalGhost, nextNfc);
          if (full.matched) {
            next = full.text;
            renderedRuns = '';
            pendingSelection = [next.length, next.length];
          } else if (nextNfc.length >= prevNfc.length) {
            next = prefix.text;
            renderedRuns = '';
            pendingSelection = [next.length, next.length];
            onmismatch?.(nextExpectedGhostWord(canonicalGhost, prefix.text.length));
          }
        }
      }
    }
    if (!composing && next.length > maxlength) {
      next = next.slice(0, maxlength);
    }
    commit(next, (event as InputEvent).inputType ?? ''); oncaret();
  }
  function startComposition() {
    flushPendingComposition();
    const effectiveValue = lastCommitted ?? value;
    const currentSelection = pendingSelection ?? (element ? richCopySelection(element) : null);
    beforeEdit = { value: effectiveValue, selection: currentSelection ?? [effectiveValue.length, effectiveValue.length] };
    const domLen = element ? richCopyText(element).length : effectiveValue.length;
    const atEnd = beforeEdit.selection.every(offset => offset >= Math.min(effectiveValue.length, domLen));
    compositionReference = showGhost && atEnd && canonicalizeGhostPrefix(canonicalGhost, effectiveValue).matched ? compositionKey(canonicalGhost) : '';
    composing = true; oncomposing(true);
  }
  function endComposition(event: CompositionEvent) {
    if (!composing) return;
    // Chromium can send its final replacement input after compositionend.
    // Keep the composing DOM/range alive until that native commit has finished.
    changed(event);
    if (compositionCommitTimer !== undefined) clearTimeout(compositionCommitTimer);
    compositionCommitTimer = setTimeout(() => {
      flushPendingComposition();
    }, 0);
  }
  function before(event: InputEvent) {
    onbeforeinput(event);
    if (event.defaultPrevented || !element) return;
    if (compositionCommitTimer !== undefined && (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak' || event.inputType === 'deleteContentBackward')) {
      flushPendingComposition();
    }
    if (composing || event.isComposing) return;
    if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
      event.preventDefault(); history(event.inputType === 'historyRedo'); return;
    }
    const currentValue = lastCommitted ?? value;
    const selection = pendingSelection ?? richCopySelection(element);
    beforeEdit = { value: currentValue, selection: selection ?? [currentValue.length, currentValue.length] };
    const prefix = showGhost && traceCanonical && canonicalGhost ? canonicalizeGhostPrefix(canonicalGhost, currentValue) : { text: currentValue, matched: false };
    // Only trace at the end of an unchanged canonical prefix. Existing drafts
    // and edits within the text retain the browser's normal selection behavior.
    const domLen = richCopyText(element).length;
    const atEnd = selection?.[0] === selection?.[1] && selection?.[1] !== undefined
      && (selection[1] === currentValue.length || selection[1] === domLen);
    const tracing = showGhost && traceCanonical && canonicalGhost && prefix.matched && atEnd;
    if (tracing && event.data !== '(' && event.data !== '（') {
      if (event.inputType === 'deleteContentBackward') {
        event.preventDefault();
        const res = reconcileGhostInput(canonicalGhost, prefix.text, { isBackspace: true });
        pendingSelection = [res.text.length, res.text.length];
        commit(res.text, 'deleteContentBackward');
        return;
      }
      if (event.inputType === 'deleteContentForward') {
        event.preventDefault();
        return;
      }
      if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak' || event.inputType === 'insertText') {
        event.preventDefault();
        const res = reconcileGhostInput(canonicalGhost, prefix.text, {
          incoming: event.data ?? '\n',
          inputType: event.inputType,
        });
        if (res.mismatch) {
          onmismatch?.(res.expectedWord ?? '');
          return;
        }
        pendingSelection = [res.text.length, res.text.length];
        commit(res.text, event.inputType);
        return;
      }
    }
    if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') {
      event.preventDefault();
      const [start, end] = richCopySelection(element) ?? [value.length, value.length];
      const next = value.slice(0, start) + '\n' + value.slice(end);
      if (next.length > maxlength) return;
      pendingSelection = [start + 1, start + 1];
      commit(next, event.inputType);
    }
  }
  async function paste(event: ClipboardEvent) {
    if (readonly) { event.preventDefault(); return; }
    if (!allowPaste) { ondisallow(event); return; }
    event.preventDefault();
    if (!element || composing) return;
    const pasted = (event.clipboardData?.getData('text/plain') ?? '').replace(/\r\n?/g, '\n');
    if (onreferencepaste && await onreferencepaste(pasted)) return;
    if (!element || composing || readonly) return;
    const [start, end] = richCopySelection(element) ?? [value.length, value.length];
    const plain = pasted.slice(0, Math.max(0, maxlength - value.length + end - start));
    pendingSelection = [start + plain.length, start + plain.length];
    beforeEdit = snapshot(); commit(value.slice(0, start) + plain + value.slice(end), 'insertFromPaste');
  }
</script>

<div class="rich-copy-container" style:font-family={font} style:--copy-font-scale={scale} style:--copy-font-size={size + 'px'} style:--copy-scroll-top={paperScrollTop + 'px'}>
  {#if showGhost}
    <!-- Match WebKit's editable text metrics while inert keeps this visual layer unfocusable and uneditable. -->
    <div class="rich-copy-ghost notranslate" translate="no" lang="vi" aria-hidden="true" inert tabindex="-1" contenteditable={!readonly} spellcheck="false" autocapitalize="off" {...{ autocorrect: 'off' }} onbeforeinput={event => event.preventDefault()} onpaste={event => event.preventDefault()} bind:this={ghostElement} style:font-family={font} style:--copy-font-scale={scale} style:--copy-font-size={size + 'px'}></div>
  {/if}
  <div id="copy-text" class="rich-copy notranslate" class:rich-copy-mismatch={mismatch} translate="no" lang="vi" bind:this={element} contenteditable={!readonly} role="textbox" tabindex="0" aria-readonly={readonly} aria-multiline="true" aria-label={label} aria-invalid={invalid} aria-describedby="copy-input-help" data-placeholder={placeholder} data-empty={!value} data-has-ghost={showGhost} style:font-family={font} style:--copy-font-scale={scale} style:--copy-font-size={size + 'px'} spellcheck="false" autocapitalize="off" {...{ autocorrect: 'off' }} onbeforeinput={before} oninput={changed} onkeydown={keys} onkeyup={oncaret} onclick={oncaret} onfocus={focused} onscroll={handleScroll} onblur={() => { if (element) rememberedSelection = richCopySelection(element); }} onpaste={paste} ondrop={event => { event.preventDefault(); ondisallow(event); }} ondragover={e => e.preventDefault()} oncompositionstart={startComposition} oncompositionend={endComposition}></div>
</div>

<style>
  .rich-copy-container{position:relative;display:flex;flex-direction:column;flex:1;min-height:120px;width:100%;min-width:0;overflow:hidden}
  /* One rear paper surface keeps notebook rules below both glyph layers. */
  .rich-copy-container::before{content:'';position:absolute;inset:0;z-index:0;pointer-events:none;padding:14px 20px;box-sizing:border-box;font-size:calc(var(--copy-font-size,20px) * var(--copy-font-scale,1));background-image:repeating-linear-gradient(to bottom,transparent 0,transparent calc(1em * var(--copy-line-height,1.8) - 1px),var(--copy-paper-rule,var(--border)) calc(1em * var(--copy-line-height,1.8) - 1px),var(--copy-paper-rule,var(--border)) calc(1em * var(--copy-line-height,1.8)));background-origin:content-box;background-clip:content-box;background-position:0 calc(0px - var(--copy-scroll-top,0px))}
  .rich-copy-ghost{z-index:1}
  .rich-copy{z-index:2}
  .rich-copy-ghost{position:absolute;inset:0;display:block;width:100%;height:100%;padding:14px 20px;box-sizing:border-box;overflow-y:scroll;scrollbar-width:thin;scrollbar-color:transparent transparent;pointer-events:none;user-select:none;-webkit-user-select:none;white-space:pre-wrap;overflow-wrap:anywhere;font-size:calc(var(--copy-font-size,20px) * var(--copy-font-scale,1));line-height:var(--copy-line-height,1.8);color:var(--copy-paper-ink);opacity:var(--copy-ghost-opacity)}
  .rich-copy-ghost::-webkit-scrollbar,.rich-copy[data-has-ghost="true"]::-webkit-scrollbar{width:8px;background:transparent}
  .rich-copy-ghost::-webkit-scrollbar-thumb{background:transparent}
  .rich-copy :global([data-copy-future]){user-select:none;pointer-events:none}
  .rich-copy :global([data-copy-future])::after{content:attr(data-copy-future);visibility:hidden}
  .rich-copy[data-has-ghost="true"]{overflow-y:scroll}
  .rich-copy[data-has-ghost="true"] :global([data-copy-line]),.rich-copy-ghost :global([data-copy-line]){margin-bottom:0}
  .rich-copy-ghost :global([data-copy-line]){min-height:calc(1em * var(--copy-line-height,1.8));white-space:pre-line;text-align-last:auto}
  .rich-copy-ghost :global([data-copy-line][style*="justify"]){text-align-last:left}
  .rich-copy :global([data-copy-typed]){color:var(--copy-paper-ink);opacity:1}
  .rich-copy{position:relative;display:block;flex:1;min-height:120px;width:100%;padding:14px 20px;box-sizing:border-box;overflow:auto;overscroll-behavior:contain;white-space:pre-wrap;overflow-wrap:anywhere;font-size:calc(var(--copy-font-size,20px) * var(--copy-font-scale,1));line-height:var(--copy-line-height,1.8);outline:none;background-color:transparent}
  .rich-copy:focus{box-shadow:inset 0 0 0 2px var(--gold)}
  .rich-copy.rich-copy-mismatch:focus,.rich-copy.rich-copy-mismatch{box-shadow:inset 0 0 0 2px var(--danger-text)}
  .rich-copy{touch-action:pan-y;scrollbar-width:thin;scrollbar-color:var(--gold) transparent;scroll-padding-block:24px}
  .rich-copy[data-empty="true"]:not([data-has-ghost="true"])::before{content:attr(data-placeholder);position:absolute;color:var(--text2);opacity:.7;pointer-events:none}
  .rich-copy :global([data-copy-line]){min-height:calc(1em * var(--copy-line-height,1.8));white-space:pre-line;text-align-last:auto;margin-bottom:0}
  .rich-copy :global([data-copy-line][style*="justify"]){text-align-last:left}
  @media(max-width:700px){.rich-copy-container{min-height:90px}.rich-copy-container::before,.rich-copy-ghost{padding:10px 12px}.rich-copy{min-height:90px;padding:10px 12px}}
  @media(max-height:520px){.rich-copy-container{min-height:64px}.rich-copy{min-height:64px}}
  :global(.keyboard-open) .rich-copy-container{min-height:40px}
  :global(.keyboard-open) .rich-copy{min-height:40px}
</style>
