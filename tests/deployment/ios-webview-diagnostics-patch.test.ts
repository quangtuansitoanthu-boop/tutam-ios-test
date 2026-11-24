/* Callback excerpts: Capacitor iOS 7.6.9, Drifty Co., MIT.
 * Full upstream MIT notice is retained in scripts/lib/ios-webview-diagnostics-patch.mjs. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, expect, it, vi } from 'vitest';

const legacySource = String.raw`import Foundation
import WebKit

open class WebViewDelegationHandler: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, UIScrollViewDelegate {
    // MARK: - WKNavigationDelegate
    open func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        // Reset the bridge on each navigation
        bridge?.reset()
    }

    open func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if case .initialLoad(let isOpaque) = webViewLoadingState {
            webView.isOpaque = isOpaque
            webViewLoadingState = .subsequentLoad
        }
        CAPLog.print("⚡️  WebView loaded")
    }

    open func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        if case .initialLoad(let isOpaque) = webViewLoadingState {
            webView.isOpaque = isOpaque
            webViewLoadingState = .subsequentLoad
        }

        if let errorURL = bridge?.config.errorPathURL {
            webView.load(URLRequest(url: errorURL))
        }

        CAPLog.print("⚡️  WebView failed to load")
        CAPLog.print("⚡️  Error: " + error.localizedDescription)
    }

    open func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if let errorURL = bridge?.config.errorPathURL {
            webView.load(URLRequest(url: errorURL))
        }

        CAPLog.print("⚡️  WebView failed provisional navigation")
        CAPLog.print("⚡️  Error: " + error.localizedDescription)
    }

    open func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        CAPLog.print("⚡️  WebView process terminated")
        bridge?.reset()
        webView.reload()
    }

    func untouchedPolicy() { decisionHandler(.allow) }
}
`;

const relativeSwift = 'Capacitor/Capacitor/WebViewDelegationHandler.swift';
const roots: string[] = [];
const fixtureLinks: string[] = [];
function fixture(options: { outside?: boolean; crlf?: boolean; source?: string } = {}) {
  const root = fs.mkdtempSync(options.outside ? path.join(os.tmpdir(), 'tutam-wk-outside-') : path.resolve('node_modules/.tutam-wk-patch-test-'));
  roots.push(root);
  const directory = path.join(root, 'node_modules/@capacitor/ios');
  const swift = path.join(directory, relativeSwift);
  fs.mkdirSync(path.dirname(swift), { recursive: true });
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: '@capacitor/ios', version: '7.6.9' }));
  const source = options.source ?? legacySource;
  fs.writeFileSync(swift, options.crlf ? source.replaceAll('\n', '\r\n') : source);
  return { root, directory, swift };
}
async function patch() {
  return (await import(pathToFileURL(path.resolve('scripts/lib/ios-webview-diagnostics-patch.mjs')).href))
    .patchIosWebViewDiagnostics as (directory?: string) => boolean;
}
function release(source: string) {
  return source.replace(/^[ \t]*#if DEBUG\n[\s\S]*?^[ \t]*#endif\n/gmu, '');
}
afterEach(() => {
  vi.restoreAllMocks();
  // Remove only the link entry before recursive fixture cleanup; never traverse its target.
  for (const link of fixtureLinks.splice(0)) {
    const absolute = path.resolve(link);
    if (!roots.some((root) => absolute.startsWith(path.resolve(root) + path.sep)) ||
        !fs.lstatSync(absolute).isSymbolicLink()) throw new Error('Unsafe fixture link cleanup');
    fs.unlinkSync(absolute);
  }
  for (const root of roots.splice(0)) {
    const absolute = path.resolve(root);
    const owned = path.resolve('node_modules');
    const temporary = path.resolve(os.tmpdir());
    const parent = path.dirname(absolute);
    if ((parent !== owned || !path.basename(absolute).startsWith('.tutam-wk-patch-test-')) &&
        (parent !== temporary || !path.basename(absolute).startsWith('tutam-wk-outside-'))) throw new Error('Unsafe fixture cleanup');
    fs.rmSync(absolute, { recursive: true, force: true });
  }
});

it('preserves every release byte and existing callback actions while observing six fixed phases', async () => {
  const value = fixture();
  expect((await patch())(value.directory)).toBe(true);
  const source = fs.readFileSync(value.swift, 'utf8');
  expect(release(source)).toBe(legacySource);
  expect(source).toContain('func untouchedPolicy() { decisionHandler(.allow) }');
  for (const phase of ['didStart', 'didCommit', 'didFinish', 'didFail', 'didFailProvisional', 'processTerminate']) {
    expect(source.match(new RegExp(`tuTapWebViewQA\\("${phase}"`, 'gu'))).toHaveLength(1);
  }
  for (const action of ['bridge?.reset()', 'webView.reload()', 'webView.load(URLRequest(url: errorURL))']) {
    expect(source.split(action).length).toBe(legacySource.split(action).length);
  }
  const helper = source.slice(source.indexOf('    #if DEBUG'), source.indexOf('    #endif'));
  expect(helper).toContain('arguments.contains("-tutam-qa-events")');
  expect(helper).toContain('Notification.Name("TuTapQANativeDiagnostic")');
  expect(helper).not.toMatch(/absoluteString|localizedDescription|userInfo\[|\.reload\(|\.load\(|Timer|DispatchQueue|navigationDelegate\s*=/u);
  const payload = helper.split('let payload: [String: Any] = [')[1].split('\n        ]')[0];
  expect([...payload.matchAll(/"(\w+)":/gu)].map((match) => match[1]).sort()).toEqual(
    ['type', 'phase', 'pid', 'uptime', 'schemeClass', 'pathClass', 'domain', 'errorCode'].sort());
});

it('patches the installed locked SDK on an owned copy without changing its existing policy', async () => {
  const original = fs.readFileSync(path.resolve('node_modules/@capacitor/ios', relativeSwift), 'utf8').replaceAll('\r\n', '\n');
  const value = fixture({ source: original });
  (await patch())(value.directory);
  expect(release(fs.readFileSync(value.swift, 'utf8'))).toBe(release(original));
});

it.each([false, true])('is byte-idempotent and retains line endings (CRLF=%s)', async (crlf) => {
  const value = fixture({ crlf });
  const apply = await patch();
  expect(apply(value.directory)).toBe(true);
  const once = fs.readFileSync(value.swift);
  expect(apply(value.directory)).toBe(false);
  expect(fs.readFileSync(value.swift)).toEqual(once);
  if (crlf) expect(once.toString()).not.toMatch(/(?<!\r)\n/u);
});

it.each(['version', 'callback', 'partial', 'duplicate', 'commit', 'mixed'])('fails closed without changing unexpected %s source', async (kind) => {
  const value = fixture();
  if (kind === 'version') fs.writeFileSync(path.join(value.directory, 'package.json'), JSON.stringify({ name: '@capacitor/ios', version: '8.0.0' }));
  const text = kind === 'callback' ? legacySource.replace('        bridge?.reset()', '        bridge?.reset(); unexpected()')
    : kind === 'partial' ? legacySource + '\n// tuTapWebViewQA\n'
    : kind === 'duplicate' ? legacySource + '\n    // MARK: - WKNavigationDelegate\n'
    : kind === 'commit' ? legacySource + '\n    open func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {}\n'
    : kind === 'mixed' ? legacySource.replace('import Foundation\n', 'import Foundation\r\n') : legacySource;
  fs.writeFileSync(value.swift, text);
  const before = fs.readFileSync(value.swift);
  const apply = await patch();
  expect(() => apply(value.directory)).toThrow();
  expect(fs.readFileSync(value.swift)).toEqual(before);
});

it('refuses outside-repository SDKs and linked source targets without modifying either', async () => {
  const outside = fixture({ outside: true });
  const owned = fixture();
  const baseline = fs.readFileSync(outside.swift);
  const apply = await patch();
  expect(() => apply(outside.directory)).toThrow(/outside repository/u);
  const ownedParent = path.dirname(owned.swift);
  const outsideParent = path.dirname(outside.swift);
  if (!path.resolve(ownedParent).startsWith(path.resolve(owned.root) + path.sep) ||
      !path.resolve(outsideParent).startsWith(path.resolve(outside.root) + path.sep)) throw new Error('Unsafe fixture link setup');
  fs.unlinkSync(owned.swift);
  if (process.platform === 'win32') {
    // Directory junctions exercise the same linked-component guard without symlink privileges.
    fs.rmdirSync(ownedParent);
    fs.symlinkSync(outsideParent, ownedParent, 'junction');
    fixtureLinks.push(ownedParent);
    expect(fs.realpathSync(ownedParent)).toBe(fs.realpathSync(outsideParent));
  } else {
    fs.symlinkSync(outside.swift, owned.swift, 'file');
    fixtureLinks.push(owned.swift);
    expect(fs.realpathSync(owned.swift)).toBe(fs.realpathSync(outside.swift));
  }
  expect(() => apply(owned.directory)).toThrow(/linked target/u);
  expect(fs.readFileSync(outside.swift)).toEqual(baseline);
});

it('preserves the original source if atomic replacement fails and never overwrites a preexisting temporary', async () => {
  const value = fixture();
  const apply = await patch();
  const before = fs.readFileSync(value.swift);
  const temporary = value.swift + '.tutam-webview-qa.tmp';
  fs.writeFileSync(temporary, 'owned sentinel');
  expect(() => apply(value.directory)).toThrow(/temporary source already exists/u);
  expect(fs.readFileSync(temporary, 'utf8')).toBe('owned sentinel');
  expect(fs.readFileSync(value.swift)).toEqual(before);
  fs.unlinkSync(temporary);
  vi.spyOn(fs, 'renameSync').mockImplementation(() => { throw new Error('simulated atomic rename failure'); });
  expect(() => apply(value.directory)).toThrow('simulated atomic rename failure');
  expect(fs.readFileSync(value.swift)).toEqual(before);
  expect(fs.existsSync(temporary)).toBe(false);
});

it('keeps the App receiver gated, exact-schema, finite/ranged and on the existing capped writer', () => {
  const bridge = fs.readFileSync('ios/App/App/TuTapBridgeViewController.swift', 'utf8');
  const receiver = bridge.slice(bridge.indexOf('    private func diagnosticInteger('), bridge.indexOf('    func recordNativeStartup('));
  expect(receiver).toContain('arguments.contains("-tutam-qa-events")');
  expect(receiver).toContain('keys.count == payload.count');
  expect(receiver.match(/CFGetTypeID\(number\) != CFBooleanGetTypeID\(\)/gu)).toHaveLength(2);
  expect(receiver).toContain('["c", "s", "i", "l", "q", "C", "S", "I", "L", "Q"].contains(String(cString: number.objCType))');
  expect(receiver).toContain('return Int(number.stringValue)');
  expect(receiver).toContain('["f", "d"].contains(String(cString: number.objCType))');
  expect(receiver).toContain('number.doubleValue.isFinite, number.doubleValue >= 0');
  for (const field of ['pid', 'status', 'errorCode']) expect(receiver).toContain(`diagnosticInteger(payload["${field}"])`);
  expect(receiver).toContain('diagnosticUptime(payload["uptime"])');
  expect(receiver).toContain('(-999999...999999).contains(code)');
  expect(receiver).toContain('(-1...4).contains(status)');
  expect(receiver).not.toMatch(/localizedDescription|absoluteString|NSLog|URLSession|Timer/u);
  expect(receiver).toContain('self.appendEvent(serialized)');
  expect(bridge).toContain('let limit: UInt64 = 256 * 1024');
  expect(bridge).toContain(') { [weak self] notification in');
  expect(bridge).toContain('NotificationCenter.default.removeObserver(observer)');
  expect(bridge.match(/addObserver\(/gu)).toHaveLength(1);
});
