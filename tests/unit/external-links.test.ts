import {afterEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
const state=vi.hoisted(()=>({native:true,platform:'android',open:vi.fn()}));
vi.mock('@capacitor/core',()=>({registerPlugin:()=>({openBrowser:state.open})}));
vi.mock('$lib/browser/native-platform',()=>({isNativeApp:()=>state.native,nativePlatform:()=>state.platform}));
import {copyExternalLink,openExternalBrowser} from '$lib/browser/external-links';
afterEach(()=>{vi.unstubAllGlobals();state.native=true;state.platform='android';state.open.mockReset();});
describe('external guide links',()=>{
 it('routes feedback to mailto and social links to the external-browser owner without Android intent strings',()=>{const account=readFileSync('src/routes/ca-nhan/+page.svelte','utf8');const feedback=readFileSync('src/lib/components/feedback/FeedbackEmailModal.svelte','utf8');for(const source of [account,feedback]){expect(source).not.toContain('intent://');expect(source).toContain('window.location.href = mailtoUrl');}expect(account).toContain('void openExternalBrowser(url)');});
 it('uses the Android browser bridge without navigating the WebView',async()=>{const open=vi.fn();vi.stubGlobal('window',{open});await openExternalBrowser('https://drive.google.com/file/d/example/view');expect(state.open).toHaveBeenCalledWith({url:'https://drive.google.com/file/d/example/view'});expect(open).not.toHaveBeenCalled();});
 it('propagates native failure for actionable UI feedback',async()=>{state.open.mockRejectedValue(new Error('no browser'));await expect(openExternalBrowser('https://example.org/')).rejects.toThrow('external_browser_unavailable');});
 it('uses the native browser bridge on iOS and a separate window on web',async()=>{const open=vi.fn();vi.stubGlobal('window',{open});state.platform='ios';await openExternalBrowser('https://example.org/');expect(state.open).toHaveBeenCalledOnce();expect(open).not.toHaveBeenCalled();state.native=false;await openExternalBrowser('https://example.org/');expect(open).toHaveBeenCalledOnce();expect(open).toHaveBeenCalledWith('https://example.org/','_blank','noopener,noreferrer');});
 it('copies the exact HTTPS address and reports permission failures',async()=>{const writeText=vi.fn().mockResolvedValue(undefined);vi.stubGlobal('navigator',{clipboard:{writeText}});await copyExternalLink('https://drive.google.com/file/d/example/view?usp=sharing');expect(writeText).toHaveBeenCalledWith('https://drive.google.com/file/d/example/view?usp=sharing');writeText.mockRejectedValue(new Error('denied'));await expect(copyExternalLink('https://example.org')).rejects.toThrow('denied');});
 it('rejects unsafe URLs before opening or copying',async()=>{for(const value of ['javascript:alert(1)','http://example.org','https://user:password@example.org']){await expect(openExternalBrowser(value)).rejects.toThrow();await expect(copyExternalLink(value)).rejects.toThrow();}expect(state.open).not.toHaveBeenCalled();});
});
