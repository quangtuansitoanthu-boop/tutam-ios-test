import fs from 'node:fs';
import path from 'node:path';

// Capacitor 7.6.9 source only. Fail closed when an SDK update changes these
// anchors, instead of silently shipping a partial native transport patch.
const sdkVersion = '7.6.9';
const androidOriginal = `                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    os.write(Base64.getDecoder().decode(body.toString()));
                }`;
const androidPatched = `                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    os.write(Base64.getDecoder().decode(body.toString()));
                } else {
                    os.write(android.util.Base64.decode(body.toString(), android.util.Base64.DEFAULT));
                }`;

const cookieMethod = String.raw`    public static func setCookiesFromResponse(_ response: HTTPURLResponse, _ config: InstanceConfiguration?, completion: @escaping () -> Void = {}) {
        // TuTap: Foundation parses Expires commas and scopes host-only cookies
        // to the response URL, without lowercasing case-sensitive cookie values.
        guard let url = response.url else { completion(); return }
        var headers = [String: String]()
        for (key, value) in response.allHeaderFields {
            headers[String(describing: key)] = String(describing: value)
        }
        let cookies = HTTPCookie.cookies(withResponseHeaderFields: headers, for: url)
        let jar = HTTPCookieStorage.shared
        jar.setCookies(cookies, for: url, mainDocumentURL: nil)
        // Preserve the SDK's existing jar sync, with response values taking
        // precedence (including expired cookies that must remove a WK cookie).
        var sync = [String: HTTPCookie]()
        for cookie in (jar.cookies ?? []) + cookies {
            sync["\(cookie.domain)\n\(cookie.path)\n\(cookie.name)"] = cookie
        }
        let cookiesToSync = Array(sync.values)
        guard !cookiesToSync.isEmpty else { completion(); return }
        DispatchQueue.main.async {
            let store = WKWebsiteDataStore.default().httpCookieStore
            let group = DispatchGroup()
            for cookie in cookiesToSync {
                group.enter()
                if let expiry = cookie.expiresDate, expiry <= Date() {
                    store.delete(cookie) { group.leave() }
                } else {
                    store.setCookie(cookie) { group.leave() }
                }
            }
            // TuTap: resolve only after every WebView cookie write completes.
            group.notify(queue: .main, execute: completion)
        }
    }

`;
const responseOriginal = `            setCookiesFromResponse(response as! HTTPURLResponse, config)

            let type = ResponseType(rawValue: responseType) ?? .default
            call.resolve(self.buildResponse(data, response as! HTTPURLResponse, responseType: type))`;
const responsePatched = `            guard let httpResponse = response as? HTTPURLResponse else {
                call.reject("Invalid native HTTP response")
                return
            }
            setCookiesFromResponse(httpResponse, config) {
                let type = ResponseType(rawValue: responseType) ?? .default
                call.resolve(self.buildResponse(data, httpResponse, responseType: type))
            }`;

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (source.split(before).length !== 2) throw new Error(`[native-http-patch] Unsupported ${label} source`);
  return source.replace(before, after);
}

export function patchAndroidHttpSource(value) {
  return replaceOnce(value.replaceAll('\r\n', '\n'), androidOriginal, androidPatched, 'Android file body');
}

export function patchIosHttpSource(value) {
  let source = value.replaceAll('\r\n', '\n');
  const start = source.indexOf('    public static func setCookiesFromResponse(');
  const end = source.indexOf('    public static func buildResponse(', start);
  const previous = source.slice(start, end);
  if (start < 0 || end < 0 || (!previous.includes('cookies.components(separatedBy: ",")') && previous !== cookieMethod)) {
    throw new Error('[native-http-patch] Unsupported iOS cookie handler source');
  }
  source = source.slice(0, start) + cookieMethod + source.slice(end);
  source = replaceOnce(source, responseOriginal, responsePatched, 'iOS HTTP completion');
  if (!source.includes('import WebKit')) source = replaceOnce(source, 'import Foundation\n', 'import Foundation\nimport WebKit\n', 'iOS WebKit import');
  return source;
}

export function patchNativeHttp(root = process.cwd()) {
  const targets = [
    ['android', 'capacitor/src/main/java/com/getcapacitor/plugin/util/CapacitorHttpUrlConnection.java', patchAndroidHttpSource],
    ['ios', 'Capacitor/Capacitor/Plugins/HttpRequestHandler.swift', patchIosHttpSource],
  ];
  // Validate every target before writing any, to avoid half applying the patch.
  const updates = targets.flatMap(([platform, relative, transform]) => {
    const directory = path.join(root, 'node_modules/@capacitor', platform);
    const file = path.join(directory, relative);
    if (!fs.existsSync(file)) return [];
    const version = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8')).version;
    if (version !== sdkVersion) throw new Error(`[native-http-patch] Review @capacitor/${platform} ${version}; expected ${sdkVersion}`);
    const before = fs.readFileSync(file, 'utf8');
    return [{ file, before, after: transform(before) }];
  });
  for (const { file, before, after } of updates) if (before !== after) fs.writeFileSync(file, after, 'utf8');
}
