import { describe, expect, it } from 'vitest';
import { shouldInterceptPracticeNavigation } from '../../../src/lib/domain/practice/state';

describe('practice navigation guard', () => {
  it('intercepts navigation when user is actively practicing an article', () => {
    expect(shouldInterceptPracticeNavigation('practice', true, false)).toBe(true);
  });

  it('does not intercept if navigation was already confirmed and pending', () => {
    expect(shouldInterceptPracticeNavigation('practice', true, true)).toBe(false);
  });

  it('does not intercept when on catalog, preview or other screens without active practice', () => {
    expect(shouldInterceptPracticeNavigation('catalog', true, false)).toBe(false);
    expect(shouldInterceptPracticeNavigation('preview', true, false)).toBe(false);
    expect(shouldInterceptPracticeNavigation('practice', false, false)).toBe(false);
  });
});
