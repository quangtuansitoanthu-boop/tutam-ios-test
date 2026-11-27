import { readFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { compile, compileModule } from 'svelte/compiler';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

const photo = (id: string, avatarUrl = `https://lh3.googleusercontent.com/${id}`) => ({
  authenticated: true, user: { id, avatarUrl, displayName: id, role: 'user' },
});

describe('home provider avatar', () => {
  let script: string;
  let dom: JSDOM;
  beforeAll(async () => {
    const mocks: Record<string, string> = {
      '$app/environment': 'export const browser = true;',
      '@tanstack/svelte-query': 'export const createQuery = () => ({});',
      '$lib/stores/locale.svelte': 'export const getLocaleContext = () => ({current:"vi"});',
      '$lib/stores/session.svelte': 'export const getSessionContext = () => window.avatarFixture.session;',
      '$lib/browser/app-stats': 'export const formatInstallNumber = String;',
      '$lib/browser/practice-community': 'export const fetchPracticeProgress = () => {}; export const PRACTICE_PROGRESS_QUERY_POLICY = {};',
      '$lib/browser/server-state': 'export const serverStateKeys = {practiceCommunity:{progress: id => [id]}};',
      '$lib/browser/session-csrf': 'export const fetchWithSessionRefresh = () => {};',
      '$lib/domain/practice/progress-achievements': 'export const getPracticeIdentity = () => ({}); export const getBadgeDefinition = () => null;',
    };
    const result = await build({
      stdin: {
        contents: compileModule(`
          import { mount, flushSync, unmount } from 'svelte';
          import Header from './src/lib/components/home/HomeGreetingHeader.svelte';
          let value = $state({authenticated:false,user:null});
          window.avatarFixture = {
            session: {get value() {return value;}},
            set: next => flushSync(() => {value = next;}),
          };
          const component = mount(Header, {target:document.body});
          flushSync();
          window.avatarFixture.destroy = () => unmount(component);
        `, { filename: 'home-avatar-fixture.svelte.js', generate: 'client' }).js.code,
        resolveDir: process.cwd(), loader: 'js',
      },
      bundle: true, write: false, format: 'iife', platform: 'browser', conditions: ['browser'],
      alias: { '$lib': path.resolve('src/lib') },
      plugins: [{ name: 'home-avatar-fixture', setup(builder) {
        builder.onResolve({ filter: /^\$app\/|^\$lib\/|^@tanstack\/svelte-query$/ }, args =>
          mocks[args.path] ? {path: args.path, namespace: 'avatar-mock'} : undefined);
        builder.onLoad({ filter: /.*/, namespace: 'avatar-mock' }, args => ({contents: mocks[args.path], loader: 'js'}));
        builder.onLoad({ filter: /\.svelte$/ }, args => ({
          contents: compile(readFileSync(args.path, 'utf8'), { filename: args.path, generate: 'client' }).js.code,
          loader: 'js', resolveDir: path.dirname(args.path),
        }));
        builder.onLoad({ filter: /\.css$/ }, () => ({contents: '', loader: 'js'}));
      } }],
    });
    script = result.outputFiles[0].text;
  });
  afterEach(async () => {
    await (dom?.window as any)?.avatarFixture?.destroy();
    dom?.window.close();
  });
  function setup() {
    dom = new JSDOM('<body></body>', {url:'https://app.example.test', runScripts:'outside-only'});
    dom.window.eval(script);
    return (dom.window as any).avatarFixture as {set: (session: unknown) => void};
  }
  const image = () => dom.window.document.querySelector<HTMLImageElement>('.avatar-photo');
  const initial = () => dom.window.document.querySelector('.avatar-initial')?.textContent;
  const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

  it('renders the real supplied Google picture and keeps the initial for missing metadata', () => {
    const fixture = setup();
    fixture.set(photo('Tu Quang'));
    expect(image()?.getAttribute('src')).toBe('https://lh3.googleusercontent.com/Tu Quang');
    expect(image()?.getAttribute('referrerpolicy')).toBe('no-referrer');
    fixture.set(photo('Tu Quang', ''));
    expect(image()).toBeNull();
    expect(initial()).toBe('T');
  });

  it('retries an unavailable image on reconnect without changing identity', async () => {
    const fixture = setup();
    fixture.set(photo('Tu Quang'));
    image()!.dispatchEvent(new dom.window.Event('error'));
    await settle();
    expect(image()).toBeNull();
    expect(initial()).toBe('T');
    dom.window.dispatchEvent(new dom.window.Event('online'));
    await settle();
    expect(image()?.getAttribute('src')).toBe('https://lh3.googleusercontent.com/Tu Quang');
  });

  it.each([
    ['another principal', photo('B')],
    ['another principal using the same picture URL', photo('B', 'https://lh3.googleusercontent.com/A')],
    ['a replacement photo', photo('A', 'https://lh3.googleusercontent.com/new-A')],
  ])('ignores a late error from an image replaced by %s', async (_label, next) => {
    const fixture = setup();
    fixture.set(photo('A'));
    const previousImage = image()!;
    fixture.set(next);
    previousImage.dispatchEvent(new dom.window.Event('error'));
    await settle();
    expect(image()?.getAttribute('src')).toBe(next.user.avatarUrl);
  });

  it('ignores an abandoned request even after returning to the same principal and picture URL', async () => {
    const fixture = setup();
    fixture.set(photo('A'));
    const previousImage = image()!;
    fixture.set(photo('B'));
    fixture.set(photo('A'));
    previousImage.dispatchEvent(new dom.window.Event('error'));
    await settle();
    expect(image()?.getAttribute('src')).toBe('https://lh3.googleusercontent.com/A');
  });

  it('never retries a previous account picture after switching to missing metadata or logout', async () => {
    const fixture = setup();
    fixture.set(photo('A'));
    image()!.dispatchEvent(new dom.window.Event('error'));
    await settle();
    fixture.set(photo('B', ''));
    dom.window.dispatchEvent(new dom.window.Event('online'));
    await settle();
    expect(image()).toBeNull();
    expect(initial()).toBe('B');
    fixture.set({authenticated:false,user:null});
    dom.window.dispatchEvent(new dom.window.Event('online'));
    await settle();
    expect(image()).toBeNull();
    expect(dom.window.document.querySelector('.avatar-lotus')).not.toBeNull();
  });
});
