import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';

const source = readFileSync('src/routes/tu-tap/+page.svelte', 'utf8');
const ast = ts.createSourceFile('practice.ts', source.slice(source.indexOf('>') + 1, source.indexOf('</script>')), ts.ScriptTarget.Latest, true);
const functions = ast.statements.filter(ts.isFunctionDeclaration).filter(node =>
  ['findInitialArticle', 'applyWarmArticleUrl', 'toolFromUrl', 'sectionFromUrl'].includes(node.name?.text ?? ''));
const effects = ast.statements.filter(ts.isExpressionStatement).filter(node => node.getText(ast).startsWith('$effect(')
  && (node.getText(ast).includes('if (checkedInitialUrl || !presenceMounted)') || node.getText(ast).includes('pendingWarmArticleUrl')));
const code = ts.transpileModule([...functions, ...effects].map(node => node.getText(ast)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const article = (id: string) => ({ id, title: `Article ${id}` });

function harness() {
  const registered: (() => void)[] = [];
  const state: Record<string, any> = {
    URL, console, $effect: (run: () => void) => registered.push(run), untrack: (run: () => void) => run(),
    presenceMounted: true, checkedInitialUrl: false, catalogLoading: true, articles: [],
    screen: 'catalog', meditationSession: null, meditationChooserOpen: false, preceptsOpen: false,
    confirmation: null, initialToolRestoring: false, currentArticle: null, currentChapterIndex: null,
    articleRequestSequence: 0, chapterRequestSequence: 0, toolNavigationGeneration: 0,
    practiceSyncGeneration: 0, syncSession: { user: null }, sessionPrincipalId: (session: any) => session.user?.id ?? null,
    articleDetailCache: new Map(), pendingWarmArticleUrl: null, preferences: { trackerOpen: false },
    toolActions: ['rosary', 'meditation'],
    window: { location: { href: 'https://fixture.invalid/tu-tap' }, history: { state: {}, replaceState: vi.fn() } },
    loadChapter: vi.fn(async () => undefined), restoreInitialTool: vi.fn(async () => undefined), writeToolUrl: vi.fn(),
  };
  state.openArticle = vi.fn(async (target: { id: string }) => { ++state.articleRequestSequence; state.currentArticle = target; });
  runInNewContext(code, state);
  const flush = async () => {
    for (let pass = 0; pass < 2; pass++) for (const effect of registered) effect();
    await Promise.resolve(); await Promise.resolve();
  };
  const warm = (id: string, chapter = 3) => {
    state.window.location.href = `https://fixture.invalid/tu-tap?article=${id}&chap=${chapter}`;
    state.applyWarmArticleUrl(new URL(state.window.location.href));
  };
  return { state, flush, warm };
}

it('opens a warm chapter intent arriving before the native catalog publishes, exactly once after it resolves', async () => {
  const h = harness();
  await h.flush();
  h.warm('dia-tang');
  expect(h.state.openArticle).not.toHaveBeenCalled();
  h.state.articles = [article('dia-tang')]; h.state.catalogLoading = false;
  await h.flush();
  expect(h.state.openArticle).toHaveBeenCalledExactlyOnceWith(article('dia-tang'), false, false, true);
  expect(h.state.loadChapter).toHaveBeenCalledExactlyOnceWith(3, false);
  await h.flush();
  expect(h.state.openArticle).toHaveBeenCalledOnce();
});

it('keeps only the newest warm target while the same catalog request is pending', async () => {
  const h = harness(); await h.flush();
  h.warm('older', 1); h.warm('latest', 2);
  h.state.articles = [article('older'), article('latest')]; h.state.catalogLoading = false;
  await h.flush();
  expect(h.state.openArticle).toHaveBeenCalledExactlyOnceWith(article('latest'), false, false, true);
  expect(h.state.loadChapter).toHaveBeenCalledExactlyOnceWith(2, false);
});

it.each(['url-changed', 'unmounted', 'active-practice', 'unknown-article', 'principal-changed', 'generation-changed', 'newer-article'])(
  'does not revive a deferred intent after %s', async mode => {
    const h = harness(); await h.flush(); h.warm('dia-tang');
    h.state.articles = mode === 'unknown-article' ? [article('other')] : [article('dia-tang')];
    h.state.catalogLoading = false;
    if (mode === 'url-changed') h.state.window.location.href = 'https://fixture.invalid/tu-tap';
    if (mode === 'unmounted') h.state.presenceMounted = false;
    if (mode === 'active-practice') h.state.screen = 'practice';
    if (mode === 'principal-changed') h.state.syncSession = { user: { id: 'new-account' } };
    if (mode === 'generation-changed') h.state.practiceSyncGeneration++;
    if (mode === 'newer-article') h.state.articleRequestSequence++;
    await h.flush();
    expect(h.state.openArticle).not.toHaveBeenCalled();
    expect(h.state.loadChapter).not.toHaveBeenCalled();
  }
);

it('keeps the immediate warm path when catalog data is already available', async () => {
  const h = harness(); h.state.articles = [article('dia-tang')]; h.state.catalogLoading = false;
  await h.flush(); h.warm('dia-tang'); await h.flush();
  expect(h.state.openArticle).toHaveBeenCalledOnce();
  expect(h.state.loadChapter).toHaveBeenCalledExactlyOnceWith(3, false);
});
