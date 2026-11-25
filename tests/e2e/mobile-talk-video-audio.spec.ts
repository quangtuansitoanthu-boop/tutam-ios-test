import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { deferStartupNotification } from './runtime-helpers';

const media = readFileSync(new URL('./fixtures/talk-video.mp4', import.meta.url));

async function expectDecodedFrame(viewer: Locator, timeout = 5000): Promise<void> {
  // Mirror synchronization writes currentTime, so clock movement alone cannot prove a decoded image.
  await expect.poll(() => viewer.locator('video').evaluate(element => {
    const video = element as HTMLVideoElement;
    const quality = typeof video.getVideoPlaybackQuality === 'function' ? video.getVideoPlaybackQuality() : null;
    return video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0
      && (!quality || quality.totalVideoFrames > 0);
  }), { timeout }).toBe(true);
}

async function revealHud(viewer: Locator): Promise<void> {
  await viewer.getByRole('button', { name: 'Hiện điều khiển video', exact: true }).click({ position: { x: 4, y: 4 } });
  await expect(viewer.locator('.video-topbar')).toHaveAttribute('aria-hidden', 'false');
}

test('mobile talk video follows one player and keeps the original audio album controls', async ({ page }, testInfo) => {
  let catalogs = 0;
  await page.route('**/api/talks?**', route => {
    catalogs++;
    return route.fulfill({ json: [
      { id: 'mobile-video', tieu_de: 'SỨ MỆNH THẦY PHÁP', visibility: 'public', tracks: [
        { title: 'Video một', url: '/__mobile-video.mp4?track=1', media_type: 'video', audio_url: '/must-not-use.m4a' },
        { title: 'Video hai', url: '/__mobile-video.mp4?track=2', media_type: 'video' },
      ] },
      { id: 'mobile-audio', tieu_de: 'SỨ MỆNH ĐỘ VONG FULL TIKTOK', visibility: 'public', tracks: [
        { title: 'Bài âm thanh', url: '/__mobile-video.mp4' },
      ] },
    ] });
  });
  await page.route('**/api/album-plays', route => route.fulfill({ json: [] }));
  await page.route('**/__mobile-video.mp4*', route => {
    const range = route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/);
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), media.length - 1) : media.length - 1;
    return route.fulfill({ status: range ? 206 : 200, contentType: 'video/mp4', body: media.subarray(start, end + 1),
      headers: { 'accept-ranges': 'bytes', ...(range ? { 'content-range': `bytes ${start}-${end}/${media.length}` } : {}) },
    });
  });
  await page.goto('/phap-thoai');
  await expect(page.locator('article').filter({ hasText: 'SỨ MỆNH THẦY PHÁP' }).getByText('Video', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mở album SỨ MỆNH THẦY PHÁP', exact: true }).click();
  const album = page.getByRole('dialog', { name: 'SỨ MỆNH THẦY PHÁP', exact: true });
  await expect(album.locator('.pt-as-btn-offline')).toBeVisible();
  await expect(album.getByRole('button', { name: /MP3|ZIP/i })).toHaveCount(0);
  await album.getByRole('button', { name: 'Phát Video một', exact: true }).click();
  const viewer = album.locator('figure.talk-video');
  await expect(viewer).toHaveClass(/expanded/);
  await expect.poll(() => viewer.locator('video').evaluate(v => (v as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
  await expectDecodedFrame(viewer);
  await revealHud(viewer);
  await expect(viewer.getByRole('button')).toHaveCount(8);
  await expect(viewer.getByRole('button', { name: 'Quay lại', exact: true })).toBeVisible();
  await expect(viewer.getByRole('status').filter({ hasText: 'Bạn có thể khóa màn hình' })).toBeVisible();
  await expect(viewer.getByRole('status').filter({ hasText: 'Bạn có thể khóa màn hình' })).toHaveCount(0, { timeout: 6_000 });
  await expect(viewer.locator('.video-topbar')).toHaveAttribute('aria-hidden', 'true');
  await expect(viewer.locator('.video-topbar')).toHaveJSProperty('inert', true);
  await expect(viewer.getByRole('button', { name: 'Tạm dừng', exact: true })).toHaveCount(0);
  await revealHud(viewer);
  await viewer.getByRole('button', { name: 'Bài tiếp theo', exact: true }).click();
  await expect(viewer.locator('.video-transport strong')).toHaveText('Video hai');
  await expectDecodedFrame(viewer);
  await revealHud(viewer);
  await viewer.getByRole('button', { name: 'Bài trước', exact: true }).click();
  await expect(viewer.locator('.video-transport strong')).toHaveText('Video một');
  await revealHud(viewer);
  await viewer.getByRole('button', { name: 'Danh sách bài', exact: true }).click();
  await expect(viewer).not.toHaveClass(/expanded/);
  await page.screenshot({ path: testInfo.outputPath('mobile-video-list.png') });
  await viewer.getByRole('button', { name: 'Mở rộng', exact: true }).click();
  await expect(viewer.getByRole('status').filter({ hasText: 'Bạn có thể khóa màn hình' })).toBeVisible();
  await viewer.getByRole('slider').fill('8');
  await page.screenshot({ path: testInfo.outputPath('mobile-video-back-hint.png') });
  await viewer.getByRole('button', { name: 'Quay lại', exact: true }).click();
  await expect(viewer).toHaveCount(0);
  const mini = page.locator('.pt-mp-info-touch');
  await expect(page.getByRole('region', { name: 'Trình phát Pháp Thoại' }).getByRole('button', { name: 'Tạm dừng', exact: true })).toBeVisible();
  await mini.click();
  await expect(viewer).toHaveClass(/expanded/);
  await expect(viewer.locator('.video-transport strong')).toHaveText('Video một');
  await expect.poll(() => viewer.locator('video').evaluate(v => (v as HTMLVideoElement).currentTime)).toBeGreaterThanOrEqual(7);
  await expectDecodedFrame(viewer);
  await expect(page.locator('.pt-fp-sheet')).toHaveCount(0);
  await revealHud(viewer);
  await viewer.getByRole('button', { name: 'Quay lại', exact: true }).click();
  await page.getByRole('button', { name: 'Mở album SỨ MỆNH ĐỘ VONG FULL TIKTOK', exact: true }).click();
  const audio = page.getByRole('dialog', { name: 'SỨ MỆNH ĐỘ VONG FULL TIKTOK', exact: true });
  await expect(audio.locator('video')).toHaveCount(0);
  await expect(audio.locator('.pt-video-badge')).toHaveCount(0);
  await expect(audio.locator('.pt-as-btn-offline')).toBeVisible();
  expect(catalogs).toBe(1);
});

test('landscape talk video keeps 16:9 inline, exits fullscreen to its list and preserves one player', async ({ page }, testInfo) => {
  let catalogs = 0;
  await page.addInitScript(() => {
    let count = 0;
    const audios: HTMLAudioElement[] = [];
    window.Audio = new Proxy(window.Audio, {
      construct(target, args, newTarget) {
        count += 1;
        const audio = Reflect.construct(target, args, newTarget) as HTMLAudioElement;
        audios.push(audio);
        return audio;
      },
    });
    Object.defineProperty(window, '__talkAudioInstances', { get: () => count });
    Object.defineProperty(window, '__talkResumeAudios', { value: audios });
  });
  const albumTitle = 'KINH ĐỊA TẠNG BỒ TÁT BỔN NGUYỆN';
  await page.route('**/api/talks?**', route => {
    catalogs += 1;
    return route.fulfill({ json: [
      { id: 'landscape-video', tieu_de: albumTitle, dien_gia: 'Vũ Tiến Dũng', anh_dai_dien: 'covers/kinh-dia-tang-vu-tien-dung.webp', visibility: 'public', tracks: [
        { title: 'PHẨM 1 (PHẦN 1)', url: '/__landscape-video.mp4?track=1', media_type: 'video', aspect_ratio: '16:9' },
        { title: 'PHẨM 1 (PHẦN 2)', url: '/__landscape-video.mp4?track=2', media_type: 'video', aspect_ratio: '16:9' },
      ] },
      { id: 'landscape-legacy-audio', tieu_de: 'ALBUM AUDIO CŨ', visibility: 'public', tracks: [
        { title: 'Bài audio cũ', url: '/__landscape-video.mp4?audio=1' },
      ] },
    ] });
  });
  await page.route('**/api/album-plays', route => route.fulfill({ json: [] }));
  await page.route('**/__landscape-video.mp4*', route => {
    const range = route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/);
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), media.length - 1) : media.length - 1;
    return route.fulfill({ status: range ? 206 : 200, contentType: 'video/mp4', body: media.subarray(start, end + 1),
      headers: { 'accept-ranges': 'bytes', ...(range ? { 'content-range': `bytes ${start}-${end}/${media.length}` } : {}) },
    });
  });
  await page.goto('/phap-thoai');
  await page.getByRole('button', { name: `Mở album ${albumTitle}`, exact: true }).click();
  const album = page.getByRole('dialog', { name: albumTitle, exact: true });
  await expect(album.locator('.pt-as-album-desc')).toContainText('Vũ Tiến Dũng');
  await expect(album).not.toContainText(/Tiến Dũng AI|youtube\.com|Kênh nguồn/);
  await expect(album.locator('.pt-as-video-poster')).toBeVisible();
  const artwork = album.locator('.pt-as-video-poster img');
  await expect.poll(() => artwork.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const poster = await artwork.evaluate(image => (image as HTMLImageElement).currentSrc);
  await album.locator('.pt-as-track-list').getByRole('button', { name: 'Phát PHẨM 1 (PHẦN 1)', exact: true }).click();
  const viewer = album.locator('figure.talk-video');
  await expect(viewer.locator('video')).toHaveAttribute('poster', poster);
  await expect(viewer).toHaveClass(/landscape/);
  await expect(viewer).not.toHaveClass(/expanded/);
  await expect.poll(() => viewer.locator('video').evaluate(video => (video as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
  await expectDecodedFrame(viewer);
  await expect(viewer.locator('video')).toBeInViewport({ ratio: .9 });
  const frame = await viewer.locator('video').boundingBox();
  expect(frame).not.toBeNull();
  expect(frame!.width / frame!.height).toBeCloseTo(16 / 9, 1);
  await expect(viewer.getByRole('status').filter({ hasText: 'Bạn có thể khóa màn hình' })).toHaveCount(0);
  const layout = album.locator('.pt-as-video-layout');
  expect(await layout.evaluate(element => getComputedStyle(element).display)).toBe(page.viewportSize()!.width <= 799 ? 'block' : 'grid');
  const originalVideo = await viewer.locator('video').elementHandle();
  const originalSource = await viewer.locator('video').evaluate(element => (element as HTMLVideoElement).currentSrc);
  // Sample actual browser frames while the same stream is sought in both directions.
  const samples = viewer.evaluate(async element => {
    const video = element.querySelector('video')!;
    const caption = element.querySelector<HTMLElement>('.video-caption')!;
    const source = video.currentSrc;
    const frames: { sameVideo: boolean; sameSource: boolean; poster: boolean; loading: boolean; videoHeight: number; captionHeight: number }[] = [];
    const until = performance.now() + 1500;
    await new Promise<void>(resolve => {
      const sample = () => {
        frames.push({ sameVideo: element.querySelector('video') === video, sameSource: video.currentSrc === source,
          poster: Boolean(element.parentElement?.querySelector('.pt-as-video-poster')),
          loading: Boolean(caption.querySelector(':scope > p')),
          videoHeight: video.getBoundingClientRect().height, captionHeight: caption.getBoundingClientRect().height });
        if (performance.now() < until) requestAnimationFrame(sample); else resolve();
      };
      requestAnimationFrame(sample);
    });
    return frames;
  });
  for (const target of [8, 2, 9, 1, 7, 3]) {
    await viewer.getByRole('slider').fill(String(target));
    await expect.poll(() => viewer.locator('video').evaluate((element, seconds) => {
      const video = element as HTMLVideoElement;
      return !video.seeking && video.readyState >= 2 && Math.abs(video.currentTime - seconds) < 1;
    }, target)).toBe(true);
  }
  const frames = await samples;
  expect(frames.length).toBeGreaterThan(5);
  expect(frames.every(frame => frame.sameVideo && frame.sameSource && !frame.poster && !frame.loading)).toBe(true);
  expect(Math.max(...frames.map(frame => frame.videoHeight)) - Math.min(...frames.map(frame => frame.videoHeight))).toBeLessThan(1);
  expect(Math.max(...frames.map(frame => frame.captionHeight)) - Math.min(...frames.map(frame => frame.captionHeight))).toBeLessThan(1);
  expect(await viewer.locator('video').evaluate((element, original) => element === original, originalVideo)).toBe(true);
  expect(await viewer.locator('video').evaluate(element => (element as HTMLVideoElement).currentSrc)).toBe(originalSource);
  await expectDecodedFrame(viewer);
  await viewer.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
  await viewer.getByRole('slider').fill('5');
  await viewer.getByRole('slider').press('ArrowRight');
  await expect.poll(() => viewer.locator('video').evaluate(video => Math.abs((video as HTMLVideoElement).currentTime - 5.1))).toBeLessThan(.15);
  await viewer.getByRole('slider').press('ArrowLeft');
  await expect.poll(() => viewer.locator('video').evaluate(video => Math.abs((video as HTMLVideoElement).currentTime - 5))).toBeLessThan(.15);
  await expect.poll(() => viewer.locator('video').evaluate(video => (video as HTMLVideoElement).currentTime)).toBeGreaterThanOrEqual(4.5);
  await page.screenshot({ path: testInfo.outputPath('landscape-video-inline.png') });
  await viewer.getByRole('button', { name: 'Toàn màn hình', exact: true }).click();
  await expect(viewer).toHaveClass(/expanded/);
  if (page.viewportSize()!.width < page.viewportSize()!.height) {
    await expect(viewer.locator('.video-stage')).toHaveCSS('transform', /^matrix\(0, 1, -1, 0,/);
  }
  await expect(viewer.getByRole('button', { name: 'Thu nhỏ', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('landscape-video-fullscreen.png') });
  type ResumeState = {
    at: number; event: string; loading: boolean; hidden: boolean; fullscreen: boolean;
    audio: { time: number; paused: boolean; seeking: boolean; readyState: number; ended: boolean; error: number | null } | null;
    video: { time: number; paused: boolean; seeking: boolean; readyState: number; ended: boolean; frames: number | null; error: number | null };
  };
  type ResumeProbe = { capture: (event: string) => ResumeState; stop: () => unknown };
  const beforeResume = await viewer.evaluate(element => {
    const video = element.querySelector('video')!;
    const audio = (window as unknown as { __talkResumeAudios: HTMLAudioElement[] }).__talkResumeAudios[0];
    const samples: ResumeState[] = [];
    let timer = 0;
    const read = (event: string): ResumeState => ({
      at: performance.now(), event, loading: Boolean(element.querySelector('.video-loading')),
      hidden: document.hidden, fullscreen: document.fullscreenElement !== null,
      audio: audio ? { time: audio.currentTime, paused: audio.paused, seeking: audio.seeking,
        readyState: audio.readyState, ended: audio.ended, error: audio.error?.code ?? null } : null,
      video: { time: video.currentTime, paused: video.paused, seeking: video.seeking,
        readyState: video.readyState, ended: video.ended,
        frames: typeof video.getVideoPlaybackQuality === 'function' ? video.getVideoPlaybackQuality().totalVideoFrames : null,
        error: video.error?.code ?? null },
    });
    const capture = (event: string): ResumeState => {
      const state = read(event);
      if (samples.length < 200) samples.push(state);
      else window.clearInterval(timer);
      return state;
    };
    const events = ['play', 'playing', 'pause', 'waiting', 'seeking', 'seeked', 'timeupdate', 'ended', 'error'];
    const fromAudio = (event: Event) => { capture('audio:' + event.type); };
    const fromVideo = (event: Event) => { capture('video:' + event.type); };
    for (const event of events) { audio?.addEventListener(event, fromAudio); video.addEventListener(event, fromVideo); }
    timer = window.setInterval(() => capture('sample'), 100);
    (window as unknown as { __talkResumeProbe: ResumeProbe }).__talkResumeProbe = {
      capture,
      stop: () => {
        window.clearInterval(timer);
        for (const event of events) { audio?.removeEventListener(event, fromAudio); video.removeEventListener(event, fromVideo); }
        return { samples, final: read('finished'), capped: samples.length === 200 };
      },
    };
    return capture('before-resume');
  });
  try {
    await viewer.getByRole('button', { name: 'Phát', exact: true }).click();
    await expectDecodedFrame(viewer);
    // Frame cũ hoặc currentTime vừa được gán không chứng minh âm thanh và hình đã phát lại sau seek.
    await expect.poll(() => page.evaluate(baseline => {
      const state = (window as unknown as { __talkResumeProbe: ResumeProbe }).__talkResumeProbe.capture('resume-fence');
      return !state.hidden && !state.loading && !state.video.paused && !state.video.seeking && state.video.readyState >= 2
        && state.video.time > baseline.video.time + .1
        && (state.video.frames === null || baseline.video.frames === null || state.video.frames > baseline.video.frames)
        && state.audio !== null && baseline.audio !== null && !state.audio.paused && !state.audio.seeking
        && state.audio.readyState >= 2 && state.audio.time > baseline.audio.time + .1;
    }, beforeResume)).toBe(true);
    await expect(viewer.locator('.video-topbar')).toHaveAttribute('aria-hidden', 'true', { timeout: 6_000 });
    await expect(viewer.locator('.video-caption')).toHaveJSProperty('inert', true);
  } finally {
    const diagnostic = await page.evaluate(() =>
      (window as unknown as { __talkResumeProbe?: ResumeProbe }).__talkResumeProbe?.stop()
    ).catch(error => ({ captureError: String(error) }));
    const diagnosticPath = testInfo.outputPath('landscape-video-resume-state.json');
    writeFileSync(diagnosticPath, JSON.stringify(diagnostic, null, 2));
    await testInfo.attach('landscape-video-resume-state', { path: diagnosticPath, contentType: 'application/json' });
  }
  await revealHud(viewer);
  await viewer.getByRole('button', { name: 'Quay lại', exact: true }).click();
  await expect(viewer).not.toHaveClass(/expanded/);
  await expect(album.locator('.pt-as-track-list')).toBeVisible();
  await expect(viewer.locator('video')).toHaveCount(1);
  await expect.poll(() => viewer.locator('video').evaluate(video => (video as HTMLVideoElement).currentTime)).toBeGreaterThanOrEqual(4.5);
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await album.locator('.pt-as-track-list').getByRole('button', { name: 'Phát PHẨM 1 (PHẦN 2)', exact: true }).click();
  await expect(viewer.locator('video')).toHaveAttribute('aria-label', 'PHẨM 1 (PHẦN 2)');
  await expect(viewer).not.toHaveClass(/expanded/);
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__talkAudioInstances'))).toBe(1);
  await album.getByRole('button', { name: 'Quay lại', exact: true }).click();
  await page.getByRole('button', { name: 'Mở album ALBUM AUDIO CŨ', exact: true }).click();
  const legacyAudio = page.getByRole('dialog', { name: 'ALBUM AUDIO CŨ', exact: true });
  await expect(legacyAudio.locator('video')).toHaveCount(0);
  await expect(legacyAudio.locator('.pt-as-btn-offline')).toBeVisible();
  expect(catalogs).toBe(1);
});

type GateAudioSnapshot = { time: number; paused: boolean; ended: boolean; source: string; count: number };
async function actualGateAudio(page: Page): Promise<GateAudioSnapshot> {
  return page.evaluate(() => {
    const audios = (window as unknown as { __gateAudios: HTMLAudioElement[] }).__gateAudios;
    const audio = audios[0];
    return { time: audio?.currentTime ?? 0, paused: audio?.paused ?? true, ended: audio?.ended ?? false, source: audio?.currentSrc ?? '', count: audios.length };
  });
}

async function delayedVideoAlbum(page: Page, testInfo: TestInfo, preloadNone = false) {
  await deferStartupNotification(page);
  let releaseInitial!: () => void;
  let releaseTail!: () => void;
  const initial = new Promise<void>(resolve => { releaseInitial = resolve; });
  const tail = new Promise<void>(resolve => { releaseTail = resolve; });
  // ffprobe: first video packet starts at byte 44176; the 28-second reference packet begins at byte 51494.
  const videoCut = 51494;
  const requests: { destination: string; resourceType: string; range: string | undefined; start: number; bytes: number }[] = [];
  const snapshots: { phase: string; audio: GateAudioSnapshot; video: unknown }[] = [];
  const title = 'VIDEO CHỜ KHUNG HÌNH';
  if (preloadNone) await page.addInitScript(() => {
    const applied: { sourceBefore: string | null }[] = [];
    Object.assign(window, { __fixturePreloadNone: applied });
    new MutationObserver(() => document.querySelectorAll<HTMLVideoElement>('figure.talk-video video').forEach(video => {
      if (video.getAttribute('preload') === 'none') return;
      applied.push({ sourceBefore: video.getAttribute('src') });
      video.preload = 'none';
    })).observe(document, { childList: true, subtree: true });
  });
  await page.addInitScript(() => {
    const audios: HTMLAudioElement[] = [];
    Object.defineProperty(window, '__gateAudios', { value: audios });
    window.Audio = new Proxy(window.Audio, { construct(target, args, newTarget) {
      const audio = Reflect.construct(target, args, newTarget) as HTMLAudioElement;
      // Tag only the detached HTMLAudio owner's fixture URL; the video element and its URL remain untouched.
      const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src')!;
      Object.defineProperty(audio, 'src', { configurable: true,
        get: () => descriptor.get!.call(audio),
        set: (source: string) => {
          const url = new URL(source, location.href);
          if (url.pathname === '/__gated-real-album.mp4') url.searchParams.set('__fixture_owner', 'audio');
          descriptor.set!.call(audio, url.href);
        },
      });
      audios.push(audio); return audio;
    } });
  });
  await page.route('**/api/talks?**', route => route.fulfill({ json: [{ id: 'wait-for-frame', tieu_de: title, visibility: 'public', tracks: [
    { title: 'BÀI VIDEO CHẬM', url: '/__gated-real-album.mp4', media_type: 'video', aspect_ratio: '16:9' },
  ] }] }));
  await page.route('**/api/album-plays', route => route.fulfill({ json: [] }));
  await page.route('**/__gated-real-album.mp4*', async route => {
    const request = route.request();
    const destination = new URL(request.url()).searchParams.get('__fixture_owner') === 'audio' ? 'audio' : 'video';
    const range = request.headers().range;
    const match = range?.match(/^bytes=(\d+)-(\d*)$/);
    const start = match ? Number(match[1]) : 0;
    const requestedEnd = match?.[2] ? Math.min(Number(match[2]), media.length - 1) : media.length - 1;
    // Both requests are media; the constructor-scoped fixture tag identifies the actual audio owner.
    const end = destination === 'video' && start < videoCut ? Math.min(requestedEnd, videoCut - 1) : requestedEnd;
    requests.push({ destination, resourceType: request.resourceType(), range, start, bytes: end - start + 1 });
    if (destination === 'video') { await initial; if (start >= videoCut) await tail; }
    await route.fulfill({ status: 206, contentType: 'video/mp4', body: media.subarray(start, end + 1), headers: {
      'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${media.length}`, 'cache-control': 'no-store',
    } }).catch(() => {});
  });
  await page.goto('/phap-thoai');
  await page.getByRole('button', { name: 'Mở album ' + title, exact: true }).click();
  const album = page.getByRole('dialog', { name: title, exact: true });
  await album.locator('.pt-as-track-list').getByRole('button', { name: 'Phát BÀI VIDEO CHẬM', exact: true }).click();
  const viewer = album.locator('figure.talk-video');
  await expect(viewer).toBeVisible();
  await expect.poll(() => requests.some(request => request.destination === 'audio') && (preloadNone || requests.some(request => request.destination === 'video'))).toBe(true);
  const sample = async (phase: string) => {
    const audio = await actualGateAudio(page);
    const video = await viewer.locator('video').count() ? await viewer.locator('video').evaluate(element => {
      const video = element as HTMLVideoElement;
      return { time: video.currentTime, paused: video.paused, seeking: video.seeking, readyState: video.readyState,
        width: video.videoWidth, height: video.videoHeight, source: video.currentSrc, preload: video.preload,
        decodedFrames: typeof video.getVideoPlaybackQuality === 'function' ? video.getVideoPlaybackQuality().totalVideoFrames : null };
    }) : null;
    snapshots.push({ phase, audio, video }); return audio;
  };
  const finish = async () => {
    try {
      if (!page.isClosed()) await sample('final-before-release');
    } catch (error) {
      if (!page.isClosed()) throw error;
    } finally {
      releaseInitial(); releaseTail();
      const evidencePath = testInfo.outputPath('real-album-frame-gate.json');
      writeFileSync(evidencePath, JSON.stringify({ preloadNone, requests, snapshots }, null, 2));
      await testInfo.attach('real-album-frame-gate.json', { contentType: 'application/json', path: evidencePath });
    }
  };
  return { album, viewer, requests, videoCut, sample, releaseInitial, releaseTail, finish };
}

test('real video album waits for its first decoded frame before audio and video run together', async ({ page }, testInfo) => {
  const gate = await delayedVideoAlbum(page, testInfo);
  try {
    const before = await gate.sample('initial-video-request-blocked');
    await expect.poll(() => gate.viewer.locator('video').evaluate(video => (video as HTMLVideoElement).readyState)).toBeLessThan(2);
    await page.waitForTimeout(1000);
    const waiting = await gate.sample('initial-still-no-decoded-frame');
    expect(waiting.count).toBe(1);
    expect(before.time).toBeLessThanOrEqual(.15);
    expect(waiting.time).toBeLessThanOrEqual(.15);
    expect(waiting.time - before.time).toBeLessThanOrEqual(.15);
    gate.releaseInitial(); gate.releaseTail();
    await expectDecodedFrame(gate.viewer);
    await expect.poll(async () => (await actualGateAudio(page)).time).toBeGreaterThan(before.time + .15);
    await expect.poll(() => gate.viewer.locator('video').evaluate(video => !(video as HTMLVideoElement).paused)).toBe(true);
    await expect.poll(async () => {
      const audio = await actualGateAudio(page);
      const videoTime = await gate.viewer.locator('video').evaluate(element => (element as HTMLVideoElement).currentTime);
      return Math.abs(audio.time - videoTime);
    }).toBeLessThan(.5);
    await gate.sample('first-frame-audio-and-video-playing');
  } finally { await gate.finish(); }
});

for (const leave of ['close-viewer', 'visibility-event'] as const) test(`real video album releases a pending frame wait for background audio on ${leave}`, async ({ page }, testInfo) => {
  const gate = await delayedVideoAlbum(page, testInfo);
  try {
    const before = await gate.sample('video-pending-before-background');
    await page.waitForTimeout(500);
    const foreground = await gate.sample('foreground-wait');
    expect(before.time).toBeLessThanOrEqual(.15);
    expect(foreground.time).toBeLessThanOrEqual(.15);
    expect(foreground.time - before.time).toBeLessThanOrEqual(.15);
    if (leave === 'close-viewer') {
      await gate.album.locator('.pt-as-back').click();
      await expect(gate.viewer).toHaveCount(0);
    } else {
      // Deterministic lifecycle contract simulation; this does not claim native lock-screen validation.
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
    }
    await expect.poll(async () => (await actualGateAudio(page)).time).toBeGreaterThan(before.time + .2);
    const background = await gate.sample('background-audio-runs-while-video-response-still-blocked');
    expect(background.paused).toBe(false);
    expect(background.count).toBe(1);
  } finally { await gate.finish(); }
});

test('real video album primes a browser-deferred preload before its first frame and after mini-player reopening', async ({ page }, testInfo) => {
  const gate = await delayedVideoAlbum(page, testInfo, true);
  try {
    await expect(gate.viewer.locator('video')).toHaveAttribute('preload', 'none');
    const applied = await page.evaluate(() => (window as unknown as { __fixturePreloadNone: { sourceBefore: string | null }[] }).__fixturePreloadNone);
    expect(applied.length).toBeGreaterThan(0);
    expect(applied.every(entry => entry.sourceBefore === null)).toBe(true);
    await page.waitForTimeout(500);
    expect((await gate.sample('preload-none-before-first-frame')).time).toBeLessThanOrEqual(.15);
    gate.releaseInitial(); gate.releaseTail();
    await expectDecodedFrame(gate.viewer);
    await expect.poll(async () => (await actualGateAudio(page)).time).toBeGreaterThan(.15);
    await gate.viewer.getByRole('slider').fill('8');
    await expect.poll(async () => (await actualGateAudio(page)).time).toBeGreaterThanOrEqual(7.9);
    await gate.album.locator('.pt-as-back').click();
    await expect(gate.viewer).toHaveCount(0);
    await page.locator('.pt-mp-info-touch').click();
    await expect(gate.viewer.locator('video')).toHaveAttribute('preload', 'none');
    await expectDecodedFrame(gate.viewer, 15_000);
    await expect.poll(() => gate.viewer.locator('video').evaluate(video => (video as HTMLVideoElement).currentTime)).toBeGreaterThanOrEqual(7);
    await expect.poll(async () => {
      const audioTime = (await actualGateAudio(page)).time;
      const videoTime = await gate.viewer.locator('video').evaluate(video => (video as HTMLVideoElement).currentTime);
      return Math.abs(audioTime - videoTime);
    }).toBeLessThan(.5);
    await gate.sample('preload-none-mini-reopened-at-owner-position');
  } finally { await gate.finish(); }
});
