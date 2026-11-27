import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolvePublicUrl } from '$lib/browser/native-api';
import { NATIVE_BACKEND_ORIGINS } from '$lib/browser/native-backend-origin';

const boundaryPath = 'src/lib/components/library/ReaderBoundary.svelte';
const previewPath = 'src/lib/components/practice/reader/PracticePreview.svelte';
const videoPath = 'src/lib/components/reader/ReaderVideoDownload.svelte';
const script = (path: string) => readFileSync(path, 'utf8').split('<script lang="ts">')[1].split('</script>')[0];
function findNode(path: string, matches: (node: ts.Node) => boolean): ts.Node {
  const source = ts.createSourceFile(path, script(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let found: ts.Node | undefined;
  const visit = (node: ts.Node) => { if (!found && matches(node)) found = node; if (!found) ts.forEachChild(node, visit); };
  visit(source);
  if (!found) throw new Error(`Missing source node in ${path}`);
  return found;
}
const compile = (source: string) => ts.transpile(source, { target: ts.ScriptTarget.ES2022 });
function declaration(path: string, name: string): string {
  return findNode(path, node => ts.isFunctionDeclaration(node) && node.name?.text === name).getText();
}
function lifecycle(path: string, callee: string, contains: string): ts.ArrowFunction {
  const call = findNode(path, node => ts.isCallExpression(node) && node.expression.getText() === callee
    && node.arguments[0]?.getText().includes(contains)) as ts.CallExpression;
  return call.arguments[0] as ts.ArrowFunction;
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('ReaderBoundary Back ownership', () => {
  it('leaves native Back unconsumed in the catalog and consumes it only while an article is open', () => {
    const node = findNode(boundaryPath, node => ts.isVariableDeclaration(node) && node.name.getText() === 'onReaderBack');
    const back = vi.fn();
    const state = new Function('back', compile(`let article = null; const ${node.getText()};
      return { send: onReaderBack, open() { article = { id: 'book-existing' }; }, close() { article = null; } };`))(back);
    const catalogBack = new Event('quangtu:reader-back', { cancelable: true });
    state.send(catalogBack);
    expect(catalogBack.defaultPrevented).toBe(false);
    expect(back).not.toHaveBeenCalled();
    state.open();
    const readerBack = new Event('quangtu:reader-back', { cancelable: true });
    state.send(readerBack);
    expect(readerBack.defaultPrevented).toBe(true);
    expect(back).toHaveBeenCalledTimes(1);
    state.close();
    const afterClose = new Event('quangtu:reader-back', { cancelable: true });
    state.send(afterClose);
    expect(afterClose.defaultPrevented).toBe(false);
    expect(back).toHaveBeenCalledTimes(1);
  });
});

describe('reader auto-scroll lifecycle', () => {
  for (const path of [boundaryPath, previewPath]) {
    it(`${path} limits long/negative frame gaps without changing the saved speed`, () => {
      const request = vi.fn(() => 8), cancel = vi.fn();
      const state = new Function('requestAnimationFrame', 'cancelAnimationFrame', compile(`
        let autoFrame = null, autoFrameTime = 0, autoScrollActive = false, autoScrollSpeed = 0.5;
        let scrollArea = { scrollTop: 0, clientHeight: 100, scrollHeight: 10000 };
        const isSingleTextScripture = false;
        ${declaration(path, 'stopAutoScroll')}
        ${declaration(path, 'autoScrollFrame')}
        ${declaration(path, 'autoScroll')}
        return { start: autoScroll, frame: autoScrollFrame, top: () => scrollArea.scrollTop, speed: () => autoScrollSpeed };
      `))(request, cancel);
      state.start(); state.frame(1000); state.frame(61_000);
      expect(state.top()).toBeCloseTo(0.5 * 100 / 16.667);
      const top = state.top(); state.frame(60_000);
      expect(state.top()).toBe(top);
      expect(state.speed()).toBe(0.5);
    });

    it(`${path} cancels auto-scroll in background and does not restart it on foreground`, () => {
      const stop = vi.fn();
      const document = { visibilityState: 'hidden' };
      const handler = new Function('document', 'stopAutoScroll', compile(`${declaration(path, 'handleReaderVisibilityChange')}
        return handleReaderVisibilityChange;`))(document, stop);
      handler(); expect(stop).toHaveBeenCalledTimes(1);
      document.visibilityState = 'visible'; handler();
      expect(stop).toHaveBeenCalledTimes(1);
    });
  }

  it('caps PracticePreview document scrolling as well as its chapter scroll element', () => {
    const scrollBy = vi.fn();
    vi.stubGlobal('window', { scrollY: 0, innerHeight: 100, scrollBy });
    vi.stubGlobal('document', { documentElement: { scrollHeight: 10000 } });
    const frame = new Function('requestAnimationFrame', 'cancelAnimationFrame', compile(`
      let autoFrame = null, autoFrameTime = 1000, autoScrollActive = true, autoScrollSpeed = 0.5, scrollArea = null;
      const isSingleTextScripture = true;
      ${declaration(previewPath, 'stopAutoScroll')}
      ${declaration(previewPath, 'autoScrollFrame')}
      return autoScrollFrame;`))(vi.fn(), vi.fn());
    frame(61_000);
    expect(scrollBy).toHaveBeenCalledWith(0, 0.5 * 100 / 16.667);
  });

  it('stops a queued frame when the article closes while the catalog keeps ReaderBoundary mounted', () => {
    const effect = lifecycle(boundaryPath, '$effect', 'const activeArticle=article');
    const returned = effect.body.getChildren().flatMap(node => ts.isSyntaxList(node) ? node.getChildren() : [node])
      .find(ts.isReturnStatement) as ts.ReturnStatement;
    expect(returned?.expression).toBeDefined();
    const stop = vi.fn(), flush = vi.fn();
    const cleanup = new Function('stopAutoScroll', 'progressWriter', compile(`let generation = 2, articleGeneration = 2;
      let releaseBodyScroll = () => {}; return ${returned.expression!.getText()};`))(stop, { flush });
    cleanup();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('releases the pending frame and image resources on ReaderBoundary destruction', () => {
    const destroy = lifecycle(boundaryPath, 'onDestroy', 'progressWriter.flush');
    const stop = vi.fn(), clear = vi.fn();
    const cleanup = new Function('stopAutoScroll', 'clearBookImageUrls', compile(`
      const progressWriter = { flush() {} }, progressSync = { flush() {} }, principalGuard = { invalidate() {} };
      const readingClient = null, ttsController = { destroy() {} }, toastTimer = null, toastFrame = null;
      return ${destroy.getText()};`))(stop, clear);
    cleanup();
    expect(stop).toHaveBeenCalledTimes(1); expect(clear).toHaveBeenCalledTimes(1);
  });
});

describe('ReaderBoundary offline image URL ownership', () => {
  function imageEffect(read: () => Promise<Map<string, string>>, revoke: (urls: ReadonlyMap<string, string>) => void) {
    const effect = lifecycle(boundaryPath, '$effect', 'readMissionImageUrls');
    const clear = script(boundaryPath).includes('function clearBookImageUrls') ? declaration(boundaryPath, 'clearBookImageUrls') : '';
    return new Function('readMissionImageUrls', 'revokeMissionImageUrls', compile(`
      let bookImageUrls = new Map([['old', 'blob:old']]);
      const article = { id: 'mission' }, optionalBookImages = true, cachedMissionCount = 1, renderedContent = '<img>';
      const missionImageSources = () => ['next']; ${clear}
      const install = ${effect.getText()};
      return { install, urls: () => [...bookImageUrls.values()] };
    `))(read, revoke);
  }

  it('releases replaced and closed image maps while keeping the new source available until cleanup', async () => {
    const revoked: string[] = [];
    const state = imageEffect(async () => new Map([['next', 'blob:new']]), urls => revoked.push(...urls.values()));
    const cleanup = state.install(); await Promise.resolve();
    expect(revoked).toEqual(['blob:old']);
    expect(state.urls()).toEqual(['blob:new']);
    cleanup();
    expect(revoked).toEqual(['blob:old', 'blob:new']);
    expect(state.urls()).toEqual([]);
  });

  it('releases a late image read after close without publishing it into the next article', async () => {
    let finish!: (urls: Map<string, string>) => void;
    const revoked: string[] = [];
    const state = imageEffect(() => new Promise(resolve => { finish = resolve; }), urls => revoked.push(...urls.values()));
    const cleanup = state.install(); cleanup();
    finish(new Map([['late', 'blob:late']])); await Promise.resolve();
    expect(revoked).toEqual(['blob:old', 'blob:late']);
    expect(state.urls()).toEqual([]);
  });
});

describe('reader video Blob URL ownership remains in ReaderVideoDownload', () => {
  it('keeps the active source alive until replacement/unmount and releases late reads', async () => {
    const revoke = vi.fn(), publish = vi.fn();
    let next = 0;
    const mount = lifecycle(videoPath, 'onMount', 'mounted = true');
    const returned = (mount.body as ts.Block).statements.find(ts.isReturnStatement)!;
    const state = new Function('revokeVideoBlobUrl', 'onUrlReady', 'readVideoBlobUrl', compile(`
      let mounted = true, currentBlobUrl = null, isCached = false, abortController = null;
      const filename = 'existing.mp4', isSingleVideoCached = async () => true;
      ${declaration(videoPath, 'checkStatus')}
      return { check: checkStatus, cleanup: ${returned.expression!.getText()} };
    `))(revoke, publish, async () => `blob:video-${++next}`);
    await state.check();
    expect(publish).toHaveBeenLastCalledWith('existing.mp4', 'blob:video-1');
    expect(revoke).not.toHaveBeenCalledWith('blob:video-1');
    await state.check();
    expect(revoke).toHaveBeenCalledWith('blob:video-1');
    expect(revoke).not.toHaveBeenCalledWith('blob:video-2');
    state.cleanup();
    expect(revoke).toHaveBeenCalledWith('blob:video-2');
    await state.check();
    expect(revoke).toHaveBeenCalledWith('blob:video-3');
    expect(publish).toHaveBeenCalledTimes(2);
  });
});

describe('PracticePreview public sharing', () => {
  it.each(['https://localhost', 'capacitor://localhost', 'https://quangtu.vn'])('shares a public route and chapter from %s', async origin => {
    const location = new URL('/tu-tap?article=tt_kinh&chap=2', origin);
    vi.stubGlobal('window', { location }); vi.stubGlobal('location', location);
    vi.stubGlobal('Capacitor', { isNativePlatform: () => origin !== 'https://quangtu.vn' });
    const share = vi.fn(async (_data: { url: string }) => {});
    vi.stubGlobal('navigator', { share });
    const run = new Function('resolvePublicUrl', compile(`const article = { title: 'KINH' }, currentChapterTitle = 'CHƯƠNG 2';
      ${declaration(previewPath, 'share')} return share;`))(resolvePublicUrl);
    await run();
    const result = new URL(share.mock.calls[0][0].url);
    expect(result.origin).toBe(origin === 'https://quangtu.vn' ? origin : NATIVE_BACKEND_ORIGINS[0]);
    expect(result.pathname + result.search).toBe('/tu-tap?article=tt_kinh&chap=2');
  });

  it('copies the same public native link when Web Share is unavailable', async () => {
    const location = new URL('https://localhost/tu-tap?article=existing');
    vi.stubGlobal('window', { location }); vi.stubGlobal('location', location);
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true });
    const writeText = vi.fn(async (_value: string) => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const run = new Function('resolvePublicUrl', compile(`const article = { title: 'KINH' }, currentChapterTitle = '', isEn = false;
      const notify = () => {}, fallbackCopy = () => {};
      ${declaration(previewPath, 'share')} return share;`))(resolvePublicUrl);
    await run();
    expect(writeText).toHaveBeenCalledWith(`${NATIVE_BACKEND_ORIGINS[0]}/tu-tap?article=existing`);
  });
});

describe('English single-content caller guards', () => {
  it('keeps ReaderBoundary request, generation, article and locale guards around the shared loader', async () => {
    const pending: ((value: string | null) => void)[] = [];
    const loader = vi.fn(() => new Promise<string | null>(resolve => { pending.push(resolve); }));
    const state = new Function('loadEnglishSingleArticleContent', compile(`
      let singleArticleEnglishRequest = 0, singleArticleEnContent = null, articleGeneration = 1;
      let article = { id: 'A', hasTableOfContents: false, volumeCount: 0 };
      const localeStore = { current: 'en' };
      ${declaration(boundaryPath, 'loadSingleArticleEnglish')}
      return { load: () => loadSingleArticleEnglish(article, articleGeneration), value: () => singleArticleEnContent,
        select(id) { article = { ...article, id }; }, locale(value) { localeStore.current = value; },
        nextGeneration() { articleGeneration += 1; } };
    `))(loader);
    const old = state.load(); state.select('B'); const current = state.load();
    pending[1]('English B'); await current;
    pending[0]('English A'); await old;
    expect(state.value()).toBe('English B');
    const staleGeneration = state.load(); state.nextGeneration(); pending[2]('old generation'); await staleGeneration;
    expect(state.value()).toBeNull();
    const staleLocale = state.load(); state.locale('vi'); pending[3]('old locale'); await staleLocale;
    expect(state.value()).toBeNull();
  });

  it('aborts the old PracticePreview read and never notifies content readiness after its effect closes', async () => {
    const pending: ((value: string | null) => void)[] = [];
    const loader = vi.fn((_id: string, _signal: AbortSignal) => new Promise<string | null>(resolve => { pending.push(resolve); }));
    const notify = vi.fn();
    const effect = lifecycle(previewPath, '$effect', 'const curLocale = localeStore.current');
    const state = new Function('loadEnglishSingleArticleContent', 'onEnglishContentReady', compile(`
      let singleArticleEnContent = null, article = { id: 'A', hasTableOfContents: false };
      const localeStore = { current: 'en' }, untrack = callback => callback();
      const install = ${effect.getText()};
      return { install, value: () => singleArticleEnContent, select(id) { article = { ...article, id }; } };
    `))(loader, notify);
    const closeA = state.install(); closeA();
    expect(loader.mock.calls[0][1].aborted).toBe(true);
    state.select('B'); const closeB = state.install();
    pending[1]('English B'); await Promise.resolve();
    pending[0]('English A'); await Promise.resolve();
    expect(state.value()).toBe('English B');
    expect(notify).toHaveBeenCalledWith('B', 'English B');
    expect(notify).not.toHaveBeenCalledWith('A', 'English A');
    closeB(); expect(loader.mock.calls[1][1].aborted).toBe(true);
  });
});
