import fs from 'node:fs';
import path from 'node:path';

const legacyDependency = "s.dependency 'GoogleSignIn', '~> 6.2.4'";
const currentDependency = "s.dependency 'GoogleSignIn', '7.1.0'";
const addUrlObserver = 'NotificationCenter.default.addObserver(self, selector: #selector(handleOpenUrl(_ :)), name: Notification.Name(Notification.Name.capacitorOpenURL.rawValue), object: nil);';
const removeUrlObserver = 'NotificationCenter.default.removeObserver(self, name: Notification.Name(Notification.Name.capacitorOpenURL.rawValue), object: nil);';
const replaceUrlObserver = `${removeUrlObserver}\n        ${addUrlObserver}`;
const migrations = [
  [
    'googleSignInConfiguration = GIDConfiguration.init(clientID: customClientId, serverClientID: serverClientId)',
    'googleSignInConfiguration = GIDConfiguration.init(clientID: customClientId, serverClientID: serverClientId)\n        googleSignIn.configuration = googleSignInConfiguration',
  ],
  [
    'self.googleSignIn.signIn(with: self.googleSignInConfiguration, presenting: presentingVc, hint: nil, additionalScopes: self.additionalScopes) { user, error in',
    'self.googleSignIn.signIn(withPresenting: presentingVc, hint: nil, additionalScopes: self.additionalScopes) { result, error in',
  ],
  [
    '                    self.resolveSignInCallWith(user: user!);',
    '                    guard let result = result else {\n                        self.signInCall?.reject("Google sign-in returned no user");\n                        return;\n                    }\n                    self.resolveSignInCallWith(user: result.user, serverAuthCode: result.serverAuthCode);',
  ],
  [
    'self.googleSignIn.currentUser!.authentication.do { (authentication, error) in',
    'self.googleSignIn.currentUser!.refreshTokensIfNeeded { (user, error) in',
  ],
  ['guard let authentication = authentication else {', 'guard let user = user else {'],
  ['"accessToken": authentication.accessToken,', '"accessToken": user.accessToken.tokenString,'],
  ['"idToken": authentication.idToken ?? NSNull(),', '"idToken": (user.idToken?.tokenString as Any?) ?? NSNull(),'],
  ['"refreshToken": authentication.refreshToken', '"refreshToken": user.refreshToken.tokenString'],
  [
    'func resolveSignInCallWith(user: GIDGoogleUser) {',
    'func resolveSignInCallWith(user: GIDGoogleUser, serverAuthCode: String? = nil) {',
  ],
  ['"accessToken": user.authentication.accessToken,', '"accessToken": user.accessToken.tokenString,'],
  ['"idToken": user.authentication.idToken,', '"idToken": (user.idToken?.tokenString as Any?) ?? NSNull(),'],
  ['"refreshToken": user.authentication.refreshToken', '"refreshToken": user.refreshToken.tokenString'],
  ['"serverAuthCode": user.serverAuthCode ?? NSNull(),', '"serverAuthCode": (serverAuthCode as Any?) ?? NSNull(),'],
];

const safetyMigrations = [
  ['var googleSignIn: GIDSignIn!;', 'var googleSignIn: GIDSignIn?;'],
  ['googleSignIn.configuration = googleSignInConfiguration', 'googleSignIn?.configuration = googleSignInConfiguration'],
  [
    'if self.googleSignIn.hasPreviousSignIn() && !self.forceAuthCode {',
    'guard let googleSignIn = self.googleSignIn else {\n                call.reject("Google sign-in is not initialized", "GOOGLE_AUTH_NOT_INITIALIZED");\n                return;\n            }\n            if googleSignIn.hasPreviousSignIn() && !self.forceAuthCode {',
  ],
  ['self.googleSignIn.restorePreviousSignIn()', 'googleSignIn.restorePreviousSignIn()'],
  [
    '                self.resolveSignInCallWith(user: user!)',
    '                guard let user = user else {\n                    self.signInCall?.reject("Google sign-in returned no user");\n                    return;\n                }\n                self.resolveSignInCallWith(user: user)',
  ],
  [
    'let presentingVc = self.bridge!.viewController!;',
    'guard let presentingVc = self.bridge?.viewController else {\n                    self.signInCall?.reject("Google sign-in presenter is unavailable");\n                    return;\n                }',
  ],
  ['self.googleSignIn.signIn(withPresenting:', 'googleSignIn.signIn(withPresenting:'],
  [
    'if self.googleSignIn.currentUser == nil {',
    'guard let googleSignIn = self.googleSignIn else {\n                call.reject("Google sign-in is not initialized", "GOOGLE_AUTH_NOT_INITIALIZED");\n                return;\n            }\n            guard let currentUser = googleSignIn.currentUser else {',
  ],
  ['self.googleSignIn.currentUser!.refreshTokensIfNeeded', 'currentUser.refreshTokensIfNeeded'],
  ['self.googleSignIn.signOut()', 'self.googleSignIn?.signOut()'],
  ['googleSignIn.handle(url)', 'googleSignIn?.handle(url)'],
];

export function patchIosGoogleSdk(packageDirectory = path.resolve('node_modules/@codetrix-studio/capacitor-google-auth')) {
  const metadata = JSON.parse(fs.readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'));
  if (metadata.name !== '@codetrix-studio/capacitor-google-auth' || metadata.version !== '3.4.0-rc.4') {
    throw new Error('Unsupported GoogleAuth iOS plugin version; expected 3.4.0-rc.4');
  }
  const swiftFile = path.join(packageDirectory, 'ios/Plugin/Plugin.swift');
  const podFile = path.join(packageDirectory, 'CodetrixStudioCapacitorGoogleAuth.podspec');
  const source = fs.readFileSync(swiftFile, 'utf8');
  const swift = source.replaceAll('\r\n', '\n');
  const pod = fs.readFileSync(podFile, 'utf8');
  const occurrences = (text, fragment) => text.split(fragment).length - 1;
  // Chuẩn hóa bản đã vá để xác minh được cả SDK6, SDK7 cũ và bản vá an toàn mới.
  let sdkSwift = swift;
  for (const [before, after] of safetyMigrations) {
    if (!sdkSwift.includes(before)) sdkSwift = sdkSwift.replace(after, before);
    else if (sdkSwift.replace(before, '').includes(after)) throw new Error('Unsupported GoogleAuth iOS safety guard source');
  }

  // SDK 7.1 đóng gói privacy manifest; bridge 6.x phải đổi API cùng lần nâng SDK.
  // Xác minh cả hai file trước khi ghi để không để lại nửa bản vá khi source lạ.
  const migrated = migrations.every(([, after]) => sdkSwift.includes(after));
  const legacyCalls = migrations.slice(1).some(([before]) => sdkSwift.includes(before));
  const currentSdk = occurrences(pod, currentDependency) === 1 && !pod.includes(legacyDependency) && migrated && !legacyCalls;
  if (!currentSdk && (occurrences(pod, legacyDependency) !== 1 || pod.includes(currentDependency) ||
      migrations.some(([before]) => occurrences(sdkSwift, before) !== 1) ||
      sdkSwift.includes('googleSignIn.configuration = googleSignInConfiguration'))) {
    throw new Error('Unsupported GoogleAuth iOS native source; expected the SDK 6 bridge or its complete SDK 7.1 patch');
  }
  // initialize được gọi lại khi đăng nhập/đăng xuất; chỉ thay observer URL của chính plugin.
  if (occurrences(swift, addUrlObserver) !== 1 ||
      (swift.includes(removeUrlObserver) && (occurrences(swift, removeUrlObserver) !== 1 || !swift.includes(replaceUrlObserver)))) {
    throw new Error('Unsupported GoogleAuth iOS URL observer source');
  }
  let updatedSwift = sdkSwift;
  if (!currentSdk) for (const [before, after] of migrations) updatedSwift = updatedSwift.replace(before, after);
  if (safetyMigrations.some(([before]) => occurrences(updatedSwift, before) !== 1)) {
    throw new Error('Unsupported GoogleAuth iOS safety guard source');
  }
  for (const [before, after] of safetyMigrations) updatedSwift = updatedSwift.replace(before, after);
  if (!updatedSwift.includes(replaceUrlObserver)) updatedSwift = updatedSwift.replace(addUrlObserver, replaceUrlObserver);
  if (currentSdk && updatedSwift === swift) return false;
  if (source.includes('\r\n')) updatedSwift = updatedSwift.replaceAll('\n', '\r\n');
  const temporarySwift = `${swiftFile}.tutam-sdk7.tmp`;
  const temporaryPod = `${podFile}.tutam-sdk7.tmp`;
  try {
    fs.writeFileSync(temporarySwift, updatedSwift);
    fs.writeFileSync(temporaryPod, pod.replace(legacyDependency, currentDependency));
    fs.renameSync(temporarySwift, swiftFile);
    fs.renameSync(temporaryPod, podFile);
  } finally {
    fs.rmSync(temporarySwift, { force: true });
    fs.rmSync(temporaryPod, { force: true });
  }
  return true;
}
