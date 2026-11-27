import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('reader comments parity', () => {
  const source = readFileSync('src/lib/components/comments/CommentsPanel.svelte', 'utf8');

  it('renders legacy initials and relative timestamps', () => {
    expect(source).toContain('function initials');
    expect(source).toContain('function relativeTime');
    expect(source).toContain('comment-avatar');
    expect(source).toContain('relativeTime(comment.tao_luc)');
  });

  it('clears the complete form and reports successful submission', () => {
    expect(source).toContain("name = ''; phone = ''; email = ''; content = ''");
    expect(source).toContain('showNotice(t.sent)');
    expect(source).toContain('role="status"');
  });

  it('keeps the floating comment affordance draggable without treating a drag as activation', () => {
    expect(source).toContain('setPointerCapture');
    expect(source).toContain('Math.hypot(deltaX, deltaY) < 5');
    expect(source).toContain('if (fabDragged)');
    expect(source).toContain('touch-action:none');
  });

  it('clears comments on article changes and rejects stale network responses', () => {
    expect(source).toContain('commentsRequest?.abort()');
    expect(source).toContain('const generation = ++commentsGeneration');
    expect(source).toContain('comments = []');
    const predicate = source.match(/const current = \(\) => ([\s\S]*?);/)?.[1];
    expect(predicate).toBeTruthy();
    type State = { controller: AbortController; generation: number; commentsGeneration: number;
      requestedArticleId: string; articleId: string; requestedPrincipal: string; principalId: string };
    // Thực thi guard thật để thứ tự các điều kiện không làm test phụ thuộc format source.
    const accepts = new Function('state', `const { controller, generation, commentsGeneration,
      requestedArticleId, articleId, requestedPrincipal, principalId } = state; return (${predicate});`) as (state: State) => boolean;
    const state: State = { controller: new AbortController(), generation: 1, commentsGeneration: 1,
      requestedArticleId: 'a', articleId: 'a', requestedPrincipal: 'first', principalId: 'first' };
    expect(accepts(state)).toBe(true);
    expect(accepts({ ...state, commentsGeneration: 2 })).toBe(false);
    expect(accepts({ ...state, articleId: 'b' })).toBe(false);
    expect(accepts({ ...state, principalId: 'second' })).toBe(false);
    state.controller.abort();
    expect(accepts(state)).toBe(false);
    expect(source).toContain('submittedArticleId !== articleId');
    expect(source).toContain('signal: controller.signal');
  });
});
