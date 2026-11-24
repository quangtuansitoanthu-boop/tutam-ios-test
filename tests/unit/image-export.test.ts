import { afterEach, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ android:true, ios:false, save:vi.fn(), share:vi.fn() }));
vi.mock('@capacitor/core', () => ({ registerPlugin:() => ({ saveImage:native.save, shareImage:native.share }) }));
vi.mock('$lib/browser/native-platform', () => ({ isNativeApp:() => native.android || native.ios, nativePlatform:() => native.ios ? 'ios' : native.android ? 'android' : 'web' }));
import { savePngImage, sharePngImage } from '$lib/browser/image-export';
const png = () => new Blob([new Uint8Array([137,80,78,71,13,10,26,10,1])], {type:'image/png'});
afterEach(() => { native.android=true; native.ios=false; native.save.mockReset(); native.share.mockReset(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('uses the native destination picker on iOS and preserves cancellation', async () => {
  native.android=false; native.ios=true;
  native.save.mockResolvedValue({saved:false});
  const anchor=vi.fn(() => { throw new Error('blob downloads are unavailable in WKWebView'); });
  vi.stubGlobal('document',{createElement:anchor});
  vi.stubGlobal('URL',{createObjectURL:() => 'blob:capacitor://localhost/image'});
  await expect(savePngImage(png(),'test.png')).resolves.toBe(false);
  expect(native.save).toHaveBeenCalledWith({fileName:'test.png',base64:'iVBORw0KGgoB'});
  expect(anchor).not.toHaveBeenCalled();
});

it('waits for native completion and never starts a WebView download', async () => {
  let complete!: (value:{saved:boolean}) => void;
  native.save.mockImplementation(() => new Promise(resolve => { complete=resolve; }));
  const anchor = vi.fn(); vi.stubGlobal('document', { createElement:anchor });
  let settled = false;
  const pending = savePngImage(png(), 'test.png').then(value => { settled=true; return value; });
  await vi.waitFor(() => expect(native.save).toHaveBeenCalledOnce());
  expect(settled).toBe(false); expect(anchor).not.toHaveBeenCalled();
  expect(native.save.mock.calls[0][0]).toEqual({fileName:'test.png',base64:'iVBORw0KGgoB'});
  complete({saved:true}); await expect(pending).resolves.toBe(true);
});
it('propagates a failed native write without a false success', async () => {
  native.save.mockRejectedValue(new Error('SAVE_FAILED'));
  await expect(savePngImage(png(), 'test.png')).rejects.toThrow('SAVE_FAILED');
});
it('treats canceling the destination picker as unsaved', async () => {
  native.save.mockResolvedValue({saved:false});
  await expect(savePngImage(png(), 'test.png')).resolves.toBe(false);
});
it.each([new Blob(['bad'], {type:'image/png'}), new Blob(['bad'], {type:'image/jpeg'}), new Blob([new Uint8Array(8*1024*1024+1)], {type:'image/png'})])('rejects invalid or oversized image bytes before crossing the bridge', async blob => {
  await expect(savePngImage(blob, 'test.png')).rejects.toThrow('invalid_png');
  expect(native.save).not.toHaveBeenCalled();
});
it('keeps web downloads local and revokes the temporary URL', async () => {
  native.android=false; vi.useFakeTimers();
  const click=vi.fn(), remove=vi.fn(), revoke=vi.fn(), append=vi.fn();
  const link={href:'',download:'',style:{display:''},click,remove};
  vi.stubGlobal('document',{createElement:() => link,body:{append}});
  vi.stubGlobal('URL',{createObjectURL:() => 'blob:local',revokeObjectURL:revoke});
  await expect(savePngImage(png(),'test.png')).resolves.toBe(true);
  expect(click).toHaveBeenCalledOnce(); expect(remove).toHaveBeenCalledOnce(); expect(native.save).not.toHaveBeenCalled();
  await vi.runAllTimersAsync(); expect(revoke).toHaveBeenCalledWith('blob:local');
});

it('preserves a valid .png filename when input is overly long or dot-prefixed', async () => {
  native.save.mockResolvedValue({ saved: true });
  await savePngImage(png(), `${'a'.repeat(120)}.png`);
  const longName = native.save.mock.calls[0][0].fileName as string;
  expect(longName.length).toBeLessThanOrEqual(100);
  expect(longName).toMatch(/^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.png$/);

  await savePngImage(png(), '...png');
  const dotName = native.save.mock.calls[1][0].fileName as string;
  expect(dotName).toMatch(/^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.png$/);
});

it('shares PNG images via the native ImageExport plugin on Android/iOS', async () => {
  native.share.mockResolvedValue({ shared: true });
  await expect(sharePngImage(png(), 'trich-dan.png', { title: 'Trích dẫn', text: 'Lời kinh' })).resolves.toBe(true);
  expect(native.share).toHaveBeenCalledWith({
    fileName: 'trich-dan.png',
    base64: 'iVBORw0KGgoB',
    title: 'Trích dẫn',
    text: 'Lời kinh',
  });
});
