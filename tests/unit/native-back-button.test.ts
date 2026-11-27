import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
const { navigateHome, platform } = vi.hoisted(() => ({
  navigateHome: vi.fn(async () => {}),
  platform: vi.fn((): 'android' | 'ios' => 'android'),
}));
vi.mock('$app/navigation', () => ({ goto: navigateHome }));
vi.mock('$app/environment', () => ({ browser:true }));
vi.mock('$lib/browser/native-platform', () => ({ isNativeApp:() => true, nativePlatform: platform }));
vi.mock('$lib/browser/modal-dialog', () => ({ dismissTopModal:() => false }));
vi.mock('@capacitor/app', () => ({
  get App() {
    // Fixture của từng ca vẫn kiểm tra đúng thứ tự đóng UI, qua API import thật của owner.
    return (window as unknown as { Capacitor: { Plugins: { App: object } } }).Capacitor.Plugins.App;
  },
}));
beforeEach(() => { vi.resetModules(); navigateHome.mockClear(); platform.mockReturnValue('android'); });
afterEach(() => vi.unstubAllGlobals());

it('returns home at the first managed iOS entry even when the forward history remains', async () => {
  platform.mockReturnValue('ios');
  const dom = new JSDOM('<main>Deep link</main>', { url: 'https://localhost/ca-nhan' });
  const host = dom.window;
  vi.stubGlobal('window', host); vi.stubGlobal('document', host.document);
  vi.stubGlobal('Element', host.Element); vi.stubGlobal('CustomEvent', host.CustomEvent);
  vi.stubGlobal('getComputedStyle', host.getComputedStyle.bind(host));
  host.history.replaceState({ routerState: { keep: true } }, '', '/ca-nhan');
  const swipe = () => {
    for (const type of ['touchstart', 'touchend']) {
      const point = { identifier: 1, clientX: type === 'touchstart' ? 4 : 110, clientY: 20 };
      const event = new host.Event(type, { bubbles: true });
      Object.defineProperties(event, { touches: { value: type === 'touchstart' ? [point] : [] }, changedTouches: { value: [point] } });
      host.document.querySelector('main')!.dispatchEvent(event);
    }
  };
  try {
    const { initializeNativeBackButton } = await import('$lib/browser/native-back-button');
    await initializeNativeBackButton();
    host.history.pushState({ routerState: { keep: 'child' } }, '', '/privacy-policy');
    expect(host.history.state.routerState).toEqual({ keep: 'child' });
    const popped = new Promise<void>(resolve => host.addEventListener('popstate', () => resolve(), { once: true }));
    host.history.back(); await popped;
    expect(host.location.pathname).toBe('/ca-nhan');
    expect(host.history.length).toBe(2);
    const back = vi.spyOn(host.history, 'back');
    swipe();
    expect(back).not.toHaveBeenCalled();
    expect(navigateHome).toHaveBeenCalledExactlyOnceWith('/');
    expect(host.history.state.routerState).toEqual({ keep: true });
  } finally { host.close(); }
});

it('dismisses the highest visible legacy overlay before a later lower layer', async () => {
  const dom = new JSDOM('<div class="modal-backdrop" style="z-index:900"><button class="btn-cancel">High</button></div><div class="modal-backdrop" style="z-index:100"><button class="btn-cancel">Low</button></div>', { url: 'https://localhost/tu-tap' });
  vi.stubGlobal('window', dom.window); vi.stubGlobal('document', dom.window.document);
  const buttons = [...dom.window.document.querySelectorAll<HTMLButtonElement>('button')];
  for (const button of buttons) Object.defineProperty(button, 'offsetParent', { value: {} });
  const high = vi.fn(), low = vi.fn(); buttons[0].addEventListener('click', high); buttons[1].addEventListener('click', low);
  let handler: (value: { canGoBack: boolean }) => void = () => {};
  Object.assign(dom.window, { Capacitor: { Plugins: { App: { addListener: async (_name: string, callback: typeof handler) => { handler = callback; } } } } });
  try {
    const { initializeNativeBackButton } = await import('$lib/browser/native-back-button');
    await initializeNativeBackButton(); handler({ canGoBack: true });
    expect(high).toHaveBeenCalledOnce(); expect(low).not.toHaveBeenCalled();
  } finally { dom.window.close(); }
});

it('commits one iOS Back from the edge and ignores canceled, vertical, and PDF gestures', async () => {
  platform.mockReturnValue('ios');
  const dom = new JSDOM('<main>Page<div class="pdf-shell">PDF</div></main>', { url: 'https://localhost/tu-tap' });
  const { window } = dom;
  const page = window.document.querySelector('main')!;
  const pdf = window.document.querySelector('.pdf-shell')!;
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('Element', window.Element);
  vi.stubGlobal('getComputedStyle', window.getComputedStyle.bind(window));
  vi.stubGlobal('CustomEvent', window.CustomEvent);
  function touch(target: Element, type: string, x: number, y: number) {
    const point = { identifier: 1, clientX: x, clientY: y };
    const event = new window.Event(type, { bubbles: true });
    Object.defineProperties(event, {
      touches: { value: type === 'touchstart' || type === 'touchmove' ? [point] : [] },
      changedTouches: { value: [point] },
    });
    target.dispatchEvent(event);
  }
  try {
    const { initializeNativeBackButton } = await import('$lib/browser/native-back-button');
    await initializeNativeBackButton();
    touch(page, 'touchstart', 5, 10);
    touch(page, 'touchcancel', 20, 10);
    touch(page, 'touchend', 100, 10);
    touch(page, 'touchstart', 5, 10);
    touch(page, 'touchmove', 10, 100);
    touch(page, 'touchend', 100, 10);
    touch(pdf, 'touchstart', 5, 10);
    touch(pdf, 'touchend', 100, 10);
    expect(navigateHome).not.toHaveBeenCalled();
    touch(page, 'touchstart', 5, 10);
    touch(page, 'touchend', 100, 10);
    touch(page, 'touchend', 100, 10);
    expect(navigateHome).toHaveBeenCalledExactlyOnceWith('/');
    navigateHome.mockClear();
    window.history.replaceState({ navigation: 1 }, '', '/?calendarDate=2026-11-18');
    touch(page, 'touchstart', 5, 10);
    touch(page, 'touchend', 100, 10);
    expect(navigateHome).toHaveBeenCalledExactlyOnceWith('/', { replaceState: true });
    expect(window.history.length).toBe(1);
  } finally { window.close(); }
});

it('clears the home query with one router replacement on Android Back', async () => {
  const dom = new JSDOM('<main></main>', { url: 'https://localhost/?calendarDate=2026-11-18' });
  let back: (event: { canGoBack: boolean }) => void = () => {};
  Object.assign(dom.window, { Capacitor: { Plugins: { App: {
    addListener: async (_event: string, handler: typeof back) => { back = handler; },
  } } } });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('CustomEvent', dom.window.CustomEvent);
  vi.stubGlobal('PopStateEvent', dom.window.PopStateEvent);
  try {
    const { initializeNativeBackButton } = await import('$lib/browser/native-back-button');
    await initializeNativeBackButton();
    back({ canGoBack: false });
    expect(navigateHome).toHaveBeenCalledExactlyOnceWith('/', { replaceState: true });
    expect(dom.window.history.length).toBe(1);
  } finally { dom.window.close(); }
});

it.each([false, true])('hardware Back closes only the visible notification popover before the practice underneath (hidden: %s)', async hidden => {
  const dom = new JSDOM('<header class="tt-topbar"><button class="tt-back-btn">Practice back</button></header><main data-practice-route-back></main><div class="notification-popover"><button class="close-popover-btn">Close notifications</button></div>');
  const close = dom.window.document.querySelector<HTMLButtonElement>('.close-popover-btn')!;
  const route = dom.window.document.querySelector<HTMLButtonElement>('.tt-back-btn')!;
  Object.defineProperty(close, 'offsetParent', { value: hidden ? null : {} });
  Object.defineProperty(route, 'offsetParent', { value: {} });
  const dismissed = vi.fn(), routeBack = vi.fn(), historyBack = vi.fn();
  close.addEventListener('click', dismissed); route.addEventListener('click', routeBack);
  let handler: (value: { canGoBack: boolean }) => void = () => {};
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('window', {
    Capacitor: { Plugins: { App: { addListener: async (_name: string, callback: typeof handler) => { handler = callback; } } } },
    location: { pathname: '/tu-tap', search: '' }, history: { back: historyBack }, dispatchEvent: () => true,
  });
  const { initializeNativeBackButton } = await import('$lib/browser/native-back-button');
  try {
    await initializeNativeBackButton(); handler({ canGoBack: true });
    expect(dismissed).toHaveBeenCalledTimes(hidden ? 0 : 1);
    expect(routeBack).toHaveBeenCalledTimes(hidden ? 1 : 0);
    expect(historyBack).not.toHaveBeenCalled();
  } finally { dom.window.close(); }
});

it.each(['/ca-nhan', '/privacy-policy'])('cold native Back returns from %s to home instead of exiting', async pathname => {
  const dom = new JSDOM('<main>Cold subroute</main>');
  let handler: (value: { canGoBack: boolean }) => void = () => {};
  const exitApp = vi.fn(), historyBack = vi.fn();
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('window', {
    Capacitor: { Plugins: { App: { addListener: async (_name: string, callback: typeof handler) => { handler = callback; }, exitApp } } },
    location: { pathname, search: '' }, history: { back: historyBack }, dispatchEvent: () => true,
  });
  const { initializeNativeBackButton } = await import('$lib/browser/native-back-button');
  try {
    await initializeNativeBackButton();
    handler({ canGoBack: false });
    expect(navigateHome).toHaveBeenCalledExactlyOnceWith('/');
    expect(historyBack).not.toHaveBeenCalled();
    expect(exitApp).not.toHaveBeenCalled();
    expect(dom.window.document.querySelector('#native-back-toast')).toBeNull();
  } finally { dom.window.close(); }
});

it.each([
  '.pdf-bookmark-panel [aria-label="Đóng danh sách đánh dấu"], .reader-tools-panel.open .sheet-close-btn',
  '.practice-confirm .practice-confirm__actions button:first-child',
  '.tt-rosary .tt-rosary__back-btn',
  '.lp .lp__header-left .lp__hbtn',
  '.tt-practice .ttp-back',
  '.tt-section-view .tt-back-btn',
  '#copy-options .panel-heading button',
  '.copy-writing .issues-heading button',
  '.copy-writing .writing-back',
  '.copy-writing .writing-bar > .icon-button',
  '.tt-topbar .tt-back-btn',
])('hardware Back activates the visible practice control %s before history', async (selector) => {
  let handler: (value: {canGoBack:boolean}) => void = () => {};
  const click = vi.fn(); const historyBack = vi.fn();
  vi.stubGlobal('document', { querySelector:(query:string) => query === selector ? { offsetParent:{}, click } : query === '[data-practice-route-back]' && selector === '.tt-topbar .tt-back-btn' ? {} : null, querySelectorAll:() => [] });
  vi.stubGlobal('window', {
    Capacitor:{ Plugins:{ App:{ addListener:async (_name:string, callback:typeof handler) => { handler = callback; } } } },
    location:{ pathname:'/tu-tap' }, history:{ back:historyBack }, dispatchEvent:() => true,
  });
  const { initializeNativeBackButton } = await import('$lib/browser/native-back-button');
  await initializeNativeBackButton();
  handler({ canGoBack:true });
  expect(click).toHaveBeenCalledOnce();
  expect(historyBack).not.toHaveBeenCalled();
});

it.each([false, true])('hardware Back uses the category shell control for direct links (history: %s)', async (canGoBack) => {
  const dom = new JSDOM('<header class="tt-topbar"><button class="tt-back-btn">Back</button></header><div class="tt-section-view" data-practice-route-back></div>');
  const back = dom.window.document.querySelector<HTMLButtonElement>('button')!;
  Object.defineProperty(back, 'offsetParent', { value:{} });
  const click = vi.fn(), historyBack = vi.fn();
  back.addEventListener('click', click);
  let handler: (value: {canGoBack:boolean}) => void = () => {};
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('window', {
    Capacitor:{ Plugins:{ App:{ addListener:async (_name:string, callback:typeof handler) => { handler = callback; } } } },
    location:{ pathname:'/tu-tap', search:'?muc=tri-chu' }, history:{ back:historyBack }, dispatchEvent:() => true,
  });
  const { initializeNativeBackButton } = await import('$lib/browser/native-back-button');
  try {
    await initializeNativeBackButton();
    handler({ canGoBack });
    expect(click).toHaveBeenCalledOnce();
    expect(historyBack).not.toHaveBeenCalled();
  } finally { dom.window.close(); }
});

it.each([
  ['continue practice', '<button data-parent>Background</button><div class="tt-modal-overlay"><button class="tt-modal-close" data-dismiss>Close</button><button type="submit" data-save>Save</button></div>'],
  ['Thanh Tịnh confirmation', '<div class="thanh-tinh-overlay"><button class="btn-back" data-parent>Back</button><div class="modal-backdrop"><button class="btn-cancel" data-dismiss>Hủy</button><button type="submit" data-save>Lưu</button></div></div>'],
  ['practice history', '<div class="tt-modal-overlay"><button class="tt-tracker__close" data-parent>Close tracker</button></div><div class="tt-overlay open"><button class="tt-dialog-ok" type="button" aria-label="Đóng" data-dismiss>Đóng</button></div>'],
  ['manual practice form', '<div class="tt-modal-overlay"><button class="tt-tracker__close" data-parent>Close tracker</button></div><div class="tt-overlay open"><form><button class="tt-dialog-ok" type="submit" data-save>Lưu</button><button class="tt-dialog-cancel" type="button" data-dismiss>Hủy</button></form></div>'],
])('hardware Back dismisses only the top %s without submitting it', async (_name, html) => {
  const dom = new JSDOM(html);
  const parentClose = vi.fn(), dismiss = vi.fn(), save = vi.fn(), historyBack = vi.fn();
  dom.window.document.querySelector('[data-parent]')!.addEventListener('click', parentClose);
  dom.window.document.querySelector('[data-dismiss]')!.addEventListener('click', dismiss);
  dom.window.document.querySelector('[data-save]')?.addEventListener('click', save);
  dom.window.document.querySelectorAll('button').forEach(button => Object.defineProperty(button, 'offsetParent', { value:{} }));
  let handler: (value: {canGoBack:boolean}) => void = () => {};
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('window', {
    Capacitor:{ Plugins:{ App:{ addListener:async (_name:string, callback:typeof handler) => { handler = callback; } } } },
    location:{ pathname:'/tu-tap' }, history:{ back:historyBack }, dispatchEvent:() => true,
  });
  const { initializeNativeBackButton } = await import('$lib/browser/native-back-button');
  try {
    await initializeNativeBackButton();
    handler({ canGoBack:true });
    expect(dismiss).toHaveBeenCalledOnce();
    expect(parentClose).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(historyBack).not.toHaveBeenCalled();
  } finally { dom.window.close(); }
});


it.each([
  ['narrow copying editor with its desktop toolbar hidden', '/tu-tap/chep-kinh', '<div class="copy-writing"><header class="writing-bar" hidden><button class="icon-button">Back</button></header><button class="writing-back" data-target>Đổi kinh hoặc phẩm</button></div>'],
  ['practice chapter reader', '/tu-tap', '<nav class="qts-nav qts-nav--subpage"><button class="nav-back-circle-btn" data-custom-back="1">Back</button></nav><div class="tt-preview"><div class="tt-chapter-reader"><button class="tt-reader-back-btn" data-target>Quay lại</button></div></div>'],
  ['practice preview unified header', '/tu-tap', '<nav class="qts-nav qts-nav--subpage"><button class="nav-back-circle-btn" data-custom-back="1" data-target>Back</button></nav><div class="tt-preview"></div>'],
  ['practice route back unified header', '/tu-tap', '<nav class="qts-nav qts-nav--subpage"><button class="nav-back-circle-btn" data-custom-back="1" data-target>Back</button></nav><section data-practice-route-back></section>'],
  ['personal subtab unified header', '/ca-nhan', '<nav class="qts-nav qts-nav--subpage"><button class="nav-back-circle-btn" data-custom-back="1" data-target>Back</button></nav><main></main>'],
])('hardware Back activates %s instead of exiting via history.back', async (_name, pathname, html) => {
  const dom = new JSDOM(html);
  const target = dom.window.document.querySelector<HTMLButtonElement>('[data-target]')!;
  dom.window.document.querySelectorAll('button').forEach(btn => Object.defineProperty(btn, 'offsetParent', { value: btn.closest('[hidden]') ? null : {} }));
  const click = vi.fn(), historyBack = vi.fn();
  target.addEventListener('click', click);
  let handler: (value: { canGoBack: boolean }) => void = () => {};
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('window', {
    Capacitor: { Plugins: { App: { addListener: async (_name: string, callback: typeof handler) => { handler = callback; } } } },
    location: { pathname, search: '' }, history: { back: historyBack }, dispatchEvent: () => true,
  });
  const { initializeNativeBackButton } = await import('$lib/browser/native-back-button');
  try {
    await initializeNativeBackButton();
    handler({ canGoBack: true });
    expect(click).toHaveBeenCalledOnce();
    expect(historyBack).not.toHaveBeenCalled();
  } finally { dom.window.close(); }
});
