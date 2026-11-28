/** Visual line wrappers add no characters to the saved draft. Native Enter does. */
export function richCopyText(root: Node): string {
  if (root.nodeType === 3) return root.textContent ?? '';
  if (root instanceof HTMLBRElement) return root.hasAttribute('data-copy-placeholder') || root.parentNode?.childNodes.length === 1 ? '' : '\n';
  let text = '';
  let previousNativeParagraph = false, previousEmptyParagraph = false;
  for (const child of root.childNodes) {
    const nativeParagraph = child instanceof HTMLElement && /^(DIV|P)$/.test(child.tagName) && !child.hasAttribute('data-copy-line');
    // An empty native paragraph still occupies a line. Its separator must not
    // absorb the next paragraph, including a leading or trailing blank line.
    if (nativeParagraph && (text || previousNativeParagraph) && (!text.endsWith('\n') || previousEmptyParagraph)) text += '\n';
    const childText = richCopyText(child);
    text += childText;
    previousNativeParagraph = nativeParagraph;
    previousEmptyParagraph = nativeParagraph && childText === '';
  }
  return text;
}

export function richCopySelection(root: HTMLElement): [number, number] | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return null;
  const range = selection.getRangeAt(0);
  const offset = (node: Node, end: number) => {
    const prefix = document.createRange(); prefix.selectNodeContents(root); prefix.setEnd(node, end);
    return richCopyText(prefix.cloneContents()).length;
  };
  return [offset(range.startContainer, range.startOffset), offset(range.endContainer, range.endOffset)];
}

export function setRichCopySelection(root: HTMLElement, start: number, end: number): void {
  const length = richCopyText(root).length;
  const bound = (offset: number) => Math.max(0, Math.min(length, Number.isFinite(offset) ? Math.trunc(offset) : 0));
  start = bound(start); end = Math.max(start, bound(end));
  const point = (offset: number): [Node, number] => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    const prefix = document.createRange(); prefix.selectNodeContents(root);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node.nodeType === 3) {
        // Use the same serialized prefix as richCopySelection, including native
        // DIV/P separators that have no text node of their own.
        prefix.setEnd(node, 0);
        const start = richCopyText(prefix.cloneContents()).length;
        const size = node.textContent?.length ?? 0;
        if (offset === start + size && node.textContent?.endsWith('\n')) {
          const nextParagraph = node.parentElement?.closest('[data-copy-line]')?.nextElementSibling;
          const nextText = nextParagraph?.querySelector('[data-copy-paragraph-start]')?.firstChild;
          if (nextText) return [nextText, 0];
        }
        if (offset >= start && offset <= start + size) return [node, offset - start];
      } else if (node instanceof HTMLBRElement && !node.hasAttribute('data-copy-placeholder')) {
        prefix.setEndBefore(node);
        if (offset === richCopyText(prefix.cloneContents()).length) return [node.parentNode!, Array.prototype.indexOf.call(node.parentNode!.childNodes, node)];
      }
    }
    return [root, root.childNodes.length];
  };
  const range = document.createRange();
  range.setStart(...point(start)); range.setEnd(...point(end));
  const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
}
