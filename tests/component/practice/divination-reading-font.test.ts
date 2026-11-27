import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { compile } from 'svelte/compiler';
import { chromium, webkit } from '@playwright/test';

it('uses the bundled Bookerly only for dream and divination result content in both CSS engines', async () => {
  const moduleMocks: Record<string, string> = {
    '$app/environment': 'export const browser = true;',
    '$app/state': 'export const page = {state:{}};',
    '$app/navigation': 'export const goto = () => {};',
    '$lib/stores/session.svelte': 'export const getSessionContext = () => ({value:{authenticated:false,user:null}});',
    '$lib/stores/locale.svelte': 'export const getLocaleContext = () => ({current:"vi"});',
    '$lib/browser/divination-storage': `
      const entries = [
        {id:'qa-font',kind:'quan-am',createdAt:'2026-11-27T00:00:00Z',resultNumber:26,title:'Quẻ kiểm tra font',topicId:'career',topicLabel:'Công danh',summary:'Tham khảo'},
        {id:'ml-font',kind:'moc-luan',createdAt:'2026-11-27T00:00:00Z',resultNumber:143,title:'Tướng kiểm tra font',topicLabel:'Việc đã tác bạch',summary:'Tham khảo',rounds:[55,45,43]},
      ];
      export const loadDivinationHistory = async (_principal, kind) => entries.filter(entry => entry.kind === kind);
      export const clearDivinationHistory = async () => ({ok:true,entries:[]});
      export const saveDivinationHistoryEntry = async () => ({ok:true,entries});`,
  };
  const bundled = await build({
    stdin: { contents: `
      import {mount,unmount,flushSync} from 'svelte';
      import Dream from './src/lib/components/practice/divination/DreamArticle.svelte';
      import QuanAm from './src/lib/components/practice/divination/QuanAmDivinationScreen.svelte';
      import MocLuan from './src/lib/components/practice/divination/MocLuanDivinationScreen.svelte';
      import {getDreamEntry} from './src/lib/domain/practice/dream-interpretation';
      import {getDreamCopy} from './src/lib/i18n/dream-ui';
      let component;
      window.showReadingFixture = async kind => {
        if(component) await unmount(component);
        const target = document.querySelector('main');
        target.className = kind === 'dream' ? 'dream-page div-page' : '';
        component = mount(kind === 'dream' ? Dream : kind === 'quan-am' ? QuanAm : MocLuan, {
          target, props: kind === 'dream' ? {entry:getDreamEntry('ran-bi-can'),copy:getDreamCopy(false),
            note:'Ghi chú giữ font app',pending:false,status:'',canSave:true,storageError:false,
            onNote(){},onSave(){},onRetry(){}} : {},
        });
        flushSync();
      };`, resolveDir: process.cwd(), loader: 'js' },
    bundle: true, write: false, format: 'iife', platform: 'browser', conditions: ['browser'],
    alias: { '$lib': path.resolve('src/lib') },
    plugins: [{name:'reading-font-fixture', setup(builder) {
      builder.onResolve({filter:/^\$app\/|^\$lib\//}, args => moduleMocks[args.path] ? {path:args.path,namespace:'font-mock'} : undefined);
      builder.onLoad({filter:/.*/,namespace:'font-mock'}, args => ({contents:moduleMocks[args.path],loader:'js'}));
      builder.onLoad({filter:/\.svelte$/}, args => ({
        contents:compile(readFileSync(args.path,'utf8'),{filename:args.path,generate:'client',css:'injected'}).js.code,
        loader:'js',resolveDir:path.dirname(args.path),
      }));
      builder.onLoad({filter:/\.css$/}, args => ({contents:`const style=document.createElement('style');style.textContent=${JSON.stringify(readFileSync(args.path,'utf8'))};document.head.append(style);`,loader:'js'}));
    }}],
  });
  const globalCss = ['tokens.css','master-shell.css','global.css','practice-theme.css','ui-refresh.css','dream-interpretation.css']
    .map(file => readFileSync(`src/lib/styles/${file}`,'utf8').replace(/^@import[^;]+;/gmu,'')).join('\n');
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({headless:true});
    try {
      const page = await browser.newPage();
      const requests: string[] = [];
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        requests.push(url.pathname);
        if (url.pathname.startsWith('/fonts/')) return route.fulfill({body:readFileSync(path.join('static',url.pathname)),contentType:'font/ttf',headers:{'access-control-allow-origin':'*'}});
        return route.abort();
      });
      await page.setContent(`<html><head><base href="https://reading.test/"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${globalCss}</style></head><body><main></main></body></html>`);
      await page.addScriptTag({content:bundled.outputFiles[0].text});
      for (const native of [false,true]) for (const viewport of [{width:375,height:844},{width:844,height:390}]) for (const theme of ['light','dark']) {
        await page.setViewportSize(viewport);
        await page.evaluate(({native,theme}) => {
          document.documentElement.dataset.nativeApp = String(native);
          document.documentElement.dataset.theme = theme;
        },{native,theme});
        for (const kind of ['dream','quan-am','moc-luan']) {
          await page.evaluate(kind => (window as any).showReadingFixture(kind),kind);
          if (kind !== 'dream') {
            await page.locator('.div-history-summary').click();
            await page.locator('.div-history-row--btn').click();
          }
          const readingSelectors = kind === 'dream'
            ? ['.dream-sheet-title','.dream-sheet-hero > p','.dream-detail-section:not(.dream-note-form) > h3','.dream-detail-section:not(.dream-note-form) > p']
            : kind === 'quan-am'
              ? ['.qa-res-title','.qa-poem-line','.qa-prose','.qa-aspect-val']
              : ['.ml-res-title','.ml-res-role','.ml-canon-quote','.ml-prose','.ml-topic-echo-quote','.ml-completion-note'];
          for (const selector of readingSelectors) {
            const families = await page.locator(selector).evaluateAll(nodes => nodes.map(node => getComputedStyle(node).fontFamily));
            expect(families.length).toBeGreaterThan(0);
            expect(families.every(family => family.startsWith('Bookerly') || family.startsWith('"Bookerly"')),`${engine.name()} ${kind} ${selector}: ${families.join(', ')}`).toBe(true);
          }
          const uiSelectors = kind === 'dream'
            ? '.dream-reading-controls button,.dream-reading-controls output,.dream-note-form label,.dream-note-form textarea'
            : '.div-subbar-title,.div-guide-btn,.div-section-accent-heading,.div-btn';
          const uiFamilies = await page.locator(uiSelectors).evaluateAll(nodes => nodes.map(node => getComputedStyle(node).fontFamily));
          expect(uiFamilies.every(family => !family.includes('Bookerly'))).toBe(true);
          await page.evaluate(async () => { await document.fonts.ready; await document.fonts.load('400 16px Bookerly','Tiếng Việt'); });
          const faces = await page.evaluate(() => [...document.fonts].map(face => ({family:face.family.replaceAll(/["']/gu,''),status:face.status})));
          expect(faces.some(face => face.family === 'Bookerly' && face.status === 'loaded'),`${engine.name()} ${kind}: ${JSON.stringify(faces)}`).toBe(true);
          if (kind === 'dream') {
            const paragraph = page.locator('.dream-detail-section:not(.dream-note-form) > p').first();
            const increase = page.getByRole('button',{name:'Tăng cỡ chữ bài giải mộng'});
            const before = await paragraph.evaluate(node => parseFloat(getComputedStyle(node).fontSize));
            const controlSize = await increase.evaluate(node => getComputedStyle(node).fontSize);
            for (let step=0;step<6;step++) await increase.click();
            expect(await paragraph.evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeCloseTo(before * 1.6,2);
            expect(await increase.evaluate(node => getComputedStyle(node).fontSize)).toBe(controlSize);
            await page.evaluate(() => document.documentElement.style.setProperty('--ui-font-scale','.9'));
            expect(await paragraph.evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeCloseTo(before * 1.6 * .9,2);
            await page.evaluate(() => document.documentElement.style.removeProperty('--ui-font-scale'));
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        }
      }
      expect(requests.some(request => request.startsWith('/api/'))).toBe(false);
    } finally { await browser.close(); }
  }
},60_000);
