import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { patchAndroidHttpSource, patchIosHttpSource, patchNativeHttp } from '../../scripts/lib/native-http-patch.mjs';

const android = `                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    os.write(Base64.getDecoder().decode(body.toString()));
                }`;
const ios = `import Foundation
    public static func setCookiesFromResponse(_ response: HTTPURLResponse, _ config: InstanceConfiguration?) {
        if let cookies = response.allHeaderFields["Set-Cookie"] as? String {
            for cookie in cookies.components(separatedBy: ",") {}
        }
        CapacitorCookieManager(config).syncCookiesToWebView()
    }

    public static func buildResponse() {}
            setCookiesFromResponse(response as! HTTPURLResponse, config)

            let type = ResponseType(rawValue: responseType) ?? .default
            call.resolve(self.buildResponse(data, response as! HTTPURLResponse, responseType: type))`;

it('adds the same pre-O binary decode fallback already used by Capacitor multipart, once', () => {
  const patched = patchAndroidHttpSource(android);
  expect(patched).toContain('} else {\n                    os.write(android.util.Base64.decode(body.toString(), android.util.Base64.DEFAULT));');
  expect(patchAndroidHttpSource(patched)).toBe(patched);
  expect(() => patchAndroidHttpSource('changed SDK')).toThrow('Unsupported');
});

it('uses Foundation response-scoped cookie parsing and resolves only after WK writes complete, once', () => {
  const patched = patchIosHttpSource(ios);
  expect(patched).toContain('import WebKit');
  expect(patched).toContain('HTTPCookie.cookies(withResponseHeaderFields: headers, for: url)');
  expect(patched).not.toContain('components(separatedBy: ",")');
  expect(patched).toContain('store.delete(cookie) { group.leave() }');
  expect(patched).toContain('store.setCookie(cookie) { group.leave() }');
  expect(patched).toContain('group.notify(queue: .main, execute: completion)');
  expect(patched).toContain('setCookiesFromResponse(httpResponse, config) {');
  expect(patchIosHttpSource(patched)).toBe(patched);
  expect(() => patchIosHttpSource(ios.replace('cookies.components', 'cookies.changed'))).toThrow('Unsupported');
});

it('rejects an unreviewed SDK version before modifying either platform', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tutam-http-patch-'));
  try {
    for (const [platform, relative, source] of [
      ['android', 'capacitor/src/main/java/com/getcapacitor/plugin/util/CapacitorHttpUrlConnection.java', android],
      ['ios', 'Capacitor/Capacitor/Plugins/HttpRequestHandler.swift', ios],
    ]) {
      const directory = path.join(root, 'node_modules/@capacitor', platform);
      const file = path.join(directory, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ version: platform === 'android' ? '7.6.9' : '8.0.0' }));
      fs.writeFileSync(file, source);
    }
    expect(() => patchNativeHttp(root)).toThrow('expected 7.6.9');
    expect(fs.readFileSync(path.join(root, 'node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/plugin/util/CapacitorHttpUrlConnection.java'), 'utf8')).toBe(android);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
