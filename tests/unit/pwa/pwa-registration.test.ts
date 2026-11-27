import { afterEach, describe, expect, it, vi } from "vitest";

const environment = vi.hoisted(() => ({
  dev: false,
  version: "pwa-test-version",
}));
vi.mock("$app/environment", () => environment);

import { registerPwa } from "../../../src/lib/browser/pwa-registration";

class FakeWorker extends EventTarget {
  state: ServiceWorkerState = "installed";
  scriptURL: string;
  postMessage = vi.fn();

  constructor(buildVersion = "previous-version") {
    super();
    this.scriptURL = `https://quangtu.vn/service-worker.js?v=${encodeURIComponent(buildVersion)}`;
  }
}

class FakeRegistration extends EventTarget {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = new FakeWorker();
  update = vi.fn(async () => undefined);
}

afterEach(() => {
  environment.dev = false;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("PWA registration update lifecycle", () => {
  it("allows another user-triggered reload when the first activated update reload was cancelled", async () => {
    vi.useFakeTimers();
    const registration = new FakeRegistration();
    const serviceWorker = Object.assign(new EventTarget(), {
      controller: {}, register: vi.fn(async () => registration),
    });
    const reload = vi.fn();
    const onReloadAttempt = vi.fn();
    vi.stubGlobal('navigator', { serviceWorker });
    vi.stubGlobal('location', { hostname: 'quangtu.vn', protocol: 'https:', reload });
    vi.stubGlobal('window', globalThis);
    const handle = await registerPwa({ onReloadAttempt });
    expect(handle?.applyUpdate()).toBe(true);
    registration.waiting = null;
    serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledOnce();
    expect(onReloadAttempt).toHaveBeenCalledOnce();
    expect(handle?.applyUpdate()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
    expect(onReloadAttempt).toHaveBeenCalledTimes(2);
    handle?.dispose();
    expect(handle?.applyUpdate()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("keeps downloaded book illustrations when native startup removes service worker caches", async () => {
    const unregister = vi.fn(async () => true);
    const remove = vi.fn(async () => true);
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true });
    vi.stubGlobal('navigator', { serviceWorker: { getRegistrations: async () => [{ unregister }] } });
    vi.stubGlobal('caches', { keys: async () => ['quangtu-sveltekit-old', 'tutam-mission-images-v1'], delete: remove });
    expect(await registerPwa()).toBeNull();
    expect(unregister).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith('quangtu-sveltekit-old');
    expect(remove).not.toHaveBeenCalledWith('tutam-mission-images-v1');
  });

  it.each(['native', 'development', 'native-development', 'native-no-service-worker'] as const)("purges only shell caches during %s startup without deleting offline or unrelated data", async kind => {
    environment.dev = kind.includes('development');
    const native = kind.startsWith('native');
    const unregister = vi.fn(async () => true);
    const remove = vi.fn(async () => true);
    const register = vi.fn();
    const reload = vi.fn();
    vi.stubGlobal('Capacitor', { isNativePlatform: () => native });
    vi.stubGlobal('location', { reload });
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
    vi.stubGlobal('navigator', kind === 'native-no-service-worker' ? {} : {
      serviceWorker: { getRegistrations: async () => [{ unregister }], register, controller: native ? {} : null },
    });
    const cacheNames = ['quangtu-sveltekit-old', 'quangtu-sveltekit-new',
      'tutam-api-v2-public', 'tutam-practice-audio-v1', 'tutam_quangtu_videos_cache_v1', 'tutam-public-comments-v2',
      'tutam-content-packages-v1', 'tutam-public-covers-v1', 'tutam-english-chapters-v2', 'tutam-mission-images-v1',
      'unrelated-cache', 'stale-shell', 'quangtu-sveltekit'];
    vi.stubGlobal('caches', { keys: async () => cacheNames, delete: remove });
    expect(await registerPwa()).toBeNull();
    expect(remove.mock.calls.map(([name]) => name)).toEqual(['quangtu-sveltekit-old', 'quangtu-sveltekit-new']);
    expect(unregister).toHaveBeenCalledTimes(kind === 'native-no-service-worker' ? 0 : 1);
    expect(register).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
  it("silently activates a waiting worker that already matches the loaded client build", async () => {
    vi.useFakeTimers();
    const registration = new FakeRegistration();
    registration.waiting = new FakeWorker("pwa-test-version");
    const serviceWorker = new EventTarget() as EventTarget & {
      controller: object;
      register: ReturnType<typeof vi.fn>;
    };
    serviceWorker.controller = {};
    serviceWorker.register = vi.fn(async () => registration);
    const onUpdateReady = vi.fn();

    vi.stubGlobal("navigator", { serviceWorker });
    vi.stubGlobal("location", {
      hostname: "quangtu.vn",
      protocol: "https:",
      reload: vi.fn(),
    });
    vi.stubGlobal("window", globalThis);

    const handle = await registerPwa({ onUpdateReady });
    expect(onUpdateReady).not.toHaveBeenCalled();
    expect(registration.waiting.postMessage).toHaveBeenCalledWith({
      type: "SKIP_WAITING",
    });

    handle?.dispose();
  });

  it("announces a waiting worker, polls and reloads only after explicit user approval", async () => {
    vi.useFakeTimers();
    const registration = new FakeRegistration();
    const serviceWorker = new EventTarget() as EventTarget & {
      controller: object;
      register: ReturnType<typeof vi.fn>;
    };
    serviceWorker.controller = {};
    serviceWorker.register = vi.fn(async () => registration);
    const reload = vi.fn();
    const onUpdateReady = vi.fn();

    vi.stubGlobal("navigator", { serviceWorker });
    vi.stubGlobal("location", {
      hostname: "quangtu.vn",
      protocol: "https:",
      reload,
    });
    vi.stubGlobal("window", globalThis);

    const handle = await registerPwa({
      onUpdateReady,
      updateIntervalMs: 1_000,
    });
    expect(handle).not.toBeNull();
    expect(onUpdateReady).toHaveBeenCalledOnce();
    expect(registration.update).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(registration.update).toHaveBeenCalledTimes(2);

    expect(handle?.applyUpdate()).toBe(true);
    expect(registration.waiting?.postMessage).toHaveBeenCalledWith({
      type: "SKIP_WAITING",
    });
    expect(reload).not.toHaveBeenCalled();

    serviceWorker.dispatchEvent(new Event("controllerchange"));
    expect(reload).toHaveBeenCalledOnce();

    handle?.dispose();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(registration.update).toHaveBeenCalledTimes(2);
  });

  it("announces an update discovered after initial registration", async () => {
    vi.useFakeTimers();
    const registration = new FakeRegistration();
    registration.waiting = null;
    const installing = new FakeWorker();
    installing.state = "installing";
    registration.installing = installing;
    const serviceWorker = new EventTarget() as EventTarget & {
      controller: object;
      register: ReturnType<typeof vi.fn>;
    };
    serviceWorker.controller = {};
    serviceWorker.register = vi.fn(async () => registration);
    const onUpdateReady = vi.fn();

    vi.stubGlobal("navigator", { serviceWorker });
    vi.stubGlobal("location", {
      hostname: "quangtu.vn",
      protocol: "https:",
      reload: vi.fn(),
    });
    vi.stubGlobal("window", globalThis);

    const handle = await registerPwa({ onUpdateReady });
    expect(onUpdateReady).not.toHaveBeenCalled();
    registration.dispatchEvent(new Event("updatefound"));
    registration.waiting = installing;
    installing.state = "installed";
    installing.dispatchEvent(new Event("statechange"));
    expect(onUpdateReady).toHaveBeenCalledOnce();

    handle?.dispose();
  });

  it("does not announce a queued update after registration disposal", async () => {
    vi.useFakeTimers();
    const registration = new FakeRegistration();
    registration.waiting = null;
    const installing = new FakeWorker();
    installing.state = "installing";
    registration.installing = installing;
    const serviceWorker = new EventTarget() as EventTarget & {
      controller: object;
      register: ReturnType<typeof vi.fn>;
    };
    serviceWorker.controller = {};
    serviceWorker.register = vi.fn(async () => registration);
    const onUpdateReady = vi.fn();

    vi.stubGlobal("navigator", { serviceWorker });
    vi.stubGlobal("location", {
      hostname: "quangtu.vn",
      protocol: "https:",
      reload: vi.fn(),
    });
    vi.stubGlobal("window", globalThis);

    const handle = await registerPwa({ onUpdateReady });
    registration.dispatchEvent(new Event("updatefound"));
    installing.state = "installed";
    installing.dispatchEvent(new Event("statechange"));
    registration.waiting = installing;
    handle?.dispose();
    await Promise.resolve();

    expect(onUpdateReady).not.toHaveBeenCalled();
    expect(installing.postMessage).not.toHaveBeenCalled();
  });
});
