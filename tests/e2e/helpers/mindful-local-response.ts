import { expect, type Page, type Request, type Response } from '@playwright/test';

/** Preserve real local D1 responses without relying on Chromium's discarded response-body handle. */
export async function useLocalMindfulPostResponses(page: Page, baseURL: string) {
  const origin = new URL(baseURL).origin;
  expect(['localhost', '127.0.0.1', '[::1]']).toContain(new URL(origin).hostname);
  const captures = new WeakMap<Request, { status: number; payload: unknown }>();
  await page.route(url => url.origin === origin && (
    (url.pathname === '/api/practice/mindful-posts' && !url.search)
    || (url.pathname === '/api/admin/notifications' && !url.search)
    || (url.pathname === '/api/admin/community/moderation' && url.searchParams.get('kind') === 'mindful')
  ), async route => {
    const request = route.request();
    const url = new URL(request.url());
    const post = request.method() === 'POST' && url.pathname === '/api/practice/mindful-posts';
    const adminRead = request.method() === 'GET' && (url.pathname === '/api/admin/notifications'
      || (url.pathname === '/api/admin/community/moderation' && url.searchParams.get('kind') === 'mindful'));
    if (!post && !adminRead) return route.fallback();
    expect(new URL(request.url()).origin).toBe(origin);
    expect(captures.has(request)).toBe(false);
    // This is the intercepted request's sole trip to the local server; cookies,
    // Origin and CSRF headers come from the actual browser request.
    const response = await route.fetch({ maxRedirects: 0, maxRetries: 0 });
    const payload: unknown = await response.json();
    captures.set(request, { status: response.status(), payload });
    await route.fulfill({ response });
  });
  return async (response: Response) => {
    const captured = captures.get(response.request());
    if (captured) {
      expect(response.status()).toBe(captured.status);
      return captured.payload;
    }
    // Explicit 403/429/503 fixtures remain visible to the refusal/retry UI.
    expect(response.status()).toBeGreaterThanOrEqual(400);
    return response.json();
  };
}
