import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageSessionDTO } from '../../src/lib/server/auth/types';

const { mockPage } = vi.hoisted(() => ({
  mockPage: {
    url: new URL('https://quangtu.vn/'),
    state: {} as { articleId?: string | null },
  },
}));
vi.mock('$app/state', () => ({ page: mockPage }));

import Layout from '../../src/routes/+layout.svelte';

beforeEach(() => {
  mockPage.url = new URL('https://quangtu.vn/');
  mockPage.state = {};
});

describe('master layout scaffold', () => {
  it('imports and renders during SSR without browser globals', () => {
    const source = readFileSync('src/routes/+layout.svelte', 'utf8');
    const { body, head } = render(Layout, {
      props: {},
    });

    expect(head).toContain('Tu Tập Phật Pháp');
    expect(source).not.toContain('@fontsource/be-vietnam-pro');
    expect(source).not.toContain('@fontsource/lora');
    expect(head).not.toContain('fonts.googleapis.com');
    expect(head).not.toContain('fonts.gstatic.com');
    expect(body).toContain('data-layout-id="quangtu-master-layout"');
    expect(body).toContain('data-mounted="0"');
  });
});

describe('native root route presentation', () => {
  const renderRoot = (session?: PageSessionDTO) => render(Layout, {
    props: session ? { data: { session, sessionVerified: true } } : {},
  }).body;
  const currentNav = (body: string, name: string) =>
    new RegExp(`<a\\b[^>]*data-nav="${name}"[^>]*aria-current="page"`).test(body);

  it('treats the empty custom-scheme root path as Home without changing router URL', () => {
    mockPage.url = new URL('capacitor://localhost');
    const originalUrl = mockPage.url.href;
    expect(mockPage.url.pathname).toBe('');
    const body = renderRoot();
    expect(body).toMatch(/class="qt-home-login-notice(?:\s|")/);
    expect(currentNav(body, 'home')).toBe(true);
    expect(mockPage.url.href).toBe(originalUrl);
    expect(mockPage.state).toEqual({});
  });

  it('suppresses the Home notice while the custom-scheme article query is active', () => {
    mockPage.url = new URL('capacitor://localhost?article=qa-article');
    expect(renderRoot()).not.toMatch(/class="qt-home-login-notice(?:\s|")/);
  });

  it('restores the Home notice after a shallow reader close with a stale article query', () => {
    mockPage.url = new URL('capacitor://localhost?article=qa-article');
    mockPage.state = { articleId: null };
    const body = renderRoot();
    expect(body).toMatch(/class="qt-home-login-notice(?:\s|")/);
    expect(currentNav(body, 'home')).toBe(true);
    expect(mockPage.url.searchParams.get('article')).toBe('qa-article');
    expect(mockPage.state).toEqual({ articleId: null });
  });

  it('keeps the practice route separate from Home', () => {
    mockPage.url = new URL('capacitor://localhost/tu-tap');
    const body = renderRoot();
    expect(body).not.toMatch(/class="qt-home-login-notice(?:\s|")/);
    expect(currentNav(body, 'home')).toBe(false);
    expect(currentNav(body, 'practice')).toBe(true);
  });

  it('does not show a Home login notice for an authenticated member', () => {
    mockPage.url = new URL('capacitor://localhost');
    const body = renderRoot({
      authenticated: true,
      user: { id: 'qa-member', email: 'qa@example.test', displayName: 'QA Member', avatarUrl: '', role: 'user' },
      csrfToken: 'qa-csrf',
      expiresAt: '2099-01-01T00:00:00.000Z',
    });
    expect(body).not.toMatch(/class="qt-home-login-notice(?:\s|")/);
    expect(currentNav(body, 'home')).toBe(true);
  });
});
