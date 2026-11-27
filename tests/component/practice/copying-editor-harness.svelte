<script lang="ts">
  import { untrack } from 'svelte';
  import RichCopyEditor from '$lib/components/RichCopyEditor.svelte';
  import type { TypedRun } from '$lib/domain/practice/copying-typed-format';
  import { canonicalizeGhostPrefix } from '$lib/domain/practice/copying-ghost-format';
  import { richCopySelection } from '$lib/browser/copying-rich-text';
  let { allowPaste = false, initial = '', readonly = false, ghostRuns = [], showGhost = false } = $props<{ allowPaste?: boolean; initial?: string; readonly?: boolean; ghostRuns?: TypedRun[]; showGhost?: boolean }>();
  let value = $state(untrack(() => initial));
  const traceCanonical = $derived(canonicalizeGhostPrefix(ghostRuns.map(run => run.text).join(''), value).matched);
  let formatRevision = $state(0);
  let editorVisible = $state(true);
  let composing = $state(false);
  let editingContext = $state('guest:dia-tang:1:0:0');
  const commits: { context: string; value: string }[] = [];
  let lastCaret: number | null = null;
  let caretNotifications = 0;
  const mismatches: string[] = [];
  function recordCaret() { const root = document.getElementById('copy-text'); lastCaret = root ? richCopySelection(root)?.[1] ?? null : null; caretNotifications++; }
  function acceptValue(next: string) { commits.push({ context: editingContext, value: next }); value = next; }
  const runs = $derived.by(() => { void formatRevision; return [{ text: value, bold: false, align: 'left' as const, line: 0 }]; });
  export function text() { return value; }
  export function refreshFormatting() { formatRevision++; }
  export function closeEditor() { editorVisible = false; }
  export function openEditor() { editorVisible = true; }
  export function isComposing() { return composing; }
  export function switchEditingContext(next: string, nextText = value) { editingContext = next; value = nextText; }
  export function committedValues() { return commits.slice(); }
  export function caret() { return { end: lastCaret, notifications: caretNotifications }; }
  export function mismatchWords() { return mismatches.slice(); }
</script>
{#if editorVisible}<RichCopyEditor {value} {runs} {editingContext} {readonly} {allowPaste} {ghostRuns} {showGhost} {traceCanonical} label="Bản chép thử" placeholder="Gõ kinh" invalid={false} maxlength={1000} font="serif" onvalue={acceptValue} onbeforeinput={() => {}} ondisallow={event => event.preventDefault()} oncaret={recordCaret} oncomposing={active => composing = active} onmismatch={word => mismatches.push(word)} />{/if}
