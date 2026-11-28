import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

const controller = fs.readFileSync('ios/App/App/TuTapBridgeViewController.swift', 'utf8');
const speech = fs.readFileSync('ios/App/App/ReaderSpeechPlugin.swift', 'utf8');

it('exposes idempotent per-key divination removal without replacing read or write', () => {
  const start = controller.indexOf('@objc(DivinationHistoryPlugin)');
  const end = controller.indexOf('@objc(ScreenWakeLockPlugin)', start);
  const history = controller.slice(start, end);
  for (const method of ['read', 'write', 'remove']) {
    expect(history).toContain(`CAPPluginMethod(name: "${method}", returnType: CAPPluginReturnPromise)`);
    expect(history).toContain(`@objc public func ${method}(_ call: CAPPluginCall)`);
  }
});

it('keeps the Objective-C runtime name aligned with every bridged plugin identifier', () => {
  const files = ['ios/App/App/TuTapBridgeViewController.swift', 'ios/App/App/ReaderSpeechPlugin.swift'];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/public class (\w+): CAPPlugin, CAPBridgedPlugin[^\{]*\{\s*public let identifier = "([^"]+)"/g)) {
      const [, name, identifier] = match;
      expect(name).toBe(identifier);
      expect(source.slice(0, match.index).trimEnd()).toMatch(new RegExp(`@objc\\(${name}\\)$`));
    }
  }
});

it('declares the add-only photo purpose used by Save Image in the share sheet', () => {
  const plist = fs.readFileSync('ios/App/App/Info.plist', 'utf8');
  expect(plist).toMatch(/<key>NSPhotoLibraryAddUsageDescription<\/key>\s*<string>[^<]+<\/string>/);
});

it('adds the photo purpose even when the plist already has audio and preserves URL schemes on rerun', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tutam-photo-purpose-'));
  try {
    const plistFile = path.join(temporary, 'ios/App/App/Info.plist');
    fs.mkdirSync(path.dirname(plistFile), { recursive: true });
    fs.writeFileSync(plistFile, '<plist version="1.0"><dict>\n<key>UIBackgroundModes</key><array><string>audio</string></array>\n<key>CFBundleURLTypes</key><array><dict><key>CFBundleURLSchemes</key><array><string>vn.quangtu.tutam</string><string>com.googleusercontent.apps.sample</string></array></dict></array>\n</dict>\n</plist>');
    const script = path.resolve('scripts/patch-ios-info-plist.mjs');
    execFileSync(process.execPath, [script], { cwd: temporary });
    const first = fs.readFileSync(plistFile, 'utf8');
    expect(first.match(/<key>NSPhotoLibraryAddUsageDescription<\/key>/g)).toHaveLength(1);
    expect(first).toContain('<string>vn.quangtu.tutam</string>');
    expect(first).toContain('<string>com.googleusercontent.apps.sample</string>');
    execFileSync(process.execPath, [script], { cwd: temporary });
    expect(fs.readFileSync(plistFile, 'utf8')).toBe(first);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

it('settles share ownership and temporary files through one cleanup path', () => {
  expect(controller).toContain('guard self.pendingCall == nil, self.shareCall == nil else');
  expect(controller).toContain('self.shareCall = call');
  expect(controller).toContain('self.shareCall === call');
  expect(controller).toContain('self.finishShare(shared: completed, error: error)');
  expect(controller).toContain('shareCall = nil');
  expect(controller).toContain('shareController?.completionWithItemsHandler = nil');
  expect(controller).toContain('shareDirectory = nil');
});

it('serializes speech callbacks and avoids deactivating audio between replacements', () => {
  for (const name of ['didStart', 'didFinish', 'didCancel']) {
    expect(speech).toMatch(new RegExp(`${name} utterance: AVSpeechUtterance\\) \\{\\s*DispatchQueue.main.async`));
  }
  expect(speech).toContain('self.cancelCurrent(deactivateAudioSession: false)');
  expect(speech).toContain('if deactivateAudioSession { NativeAudioSession.deactivate(self) }');
});

it('defers completed speech release with cancellation and ownership checks for the next chunk', () => {
  const finish = speech.slice(speech.indexOf('public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish'),
    speech.indexOf('public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel'));
  expect(finish.includes('self.scheduleAudioRelease()')).toBe(true);
  expect(finish.includes('NativeAudioSession.deactivate(self)')).toBe(false);
  // Giữ ID đến hết grace period để stop(id) vẫn nhả ngay đoạn vừa hoàn tất.
  expect(finish.includes('self.activeID = ""')).toBe(false);
  const release = speech.slice(speech.indexOf('private func scheduleAudioRelease()'), speech.indexOf('private func cancelCurrent('));
  expect(release.includes('DispatchWorkItem { [self] in')).toBe(true);
  expect(release.includes('self.audioReleaseGeneration == generation, self.active == nil')).toBe(true);
  expect(release.includes('DispatchQueue.main.asyncAfter(deadline: .now() + 0.25, execute: release)')).toBe(true);
  expect(release.includes('NativeAudioSession.deactivate(self)')).toBe(true);
  const cancel = speech.slice(speech.indexOf('private func cancelCurrent('), speech.indexOf('@objc public func stop'));
  expect(cancel.includes('cancelAudioRelease()')).toBe(true);
  expect(speech.includes('pendingAudioRelease?.cancel()')).toBe(true);
  expect(speech.includes('audioReleaseGeneration += 1')).toBe(true);
});

it('falls back to the approved HTTPS App Store URL after the native URL fails', () => {
  expect(controller).toContain('let fallback = URL(string: "https://apps.apple.com/app/id6829182305")');
  expect(controller).toContain('UIApplication.shared.open(fallback, options: [:])');
});

it('keeps widget artwork in the extension resources and Apple sign-in metadata aligned with existing entitlements', () => {
  const project = fs.readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8');
  const resources = project.split('/* Begin PBXResourcesBuildPhase section */')[1]?.split('/* End PBXResourcesBuildPhase section */')[0] ?? '';
  const appResources = resources.split('504EC3021FED79650016851F /* Resources */ =')[1]?.split('runOnlyForDeploymentPostprocessing')[0] ?? '';
  expect(appResources.includes('BC0000000000000000000080')).toBe(false);
  expect(resources.includes('files = (BC0000000000000000000081, BC0000000000000000000083, )')).toBe(true);
  expect(project.includes('path = WidgetAssets.xcassets')).toBe(true);
  expect(project.includes('com.apple.SignInWithApple = {enabled = 1; }')).toBe(true);
  expect(project).toMatch(/\/\* App.entitlements \*\/ = \{isa = PBXFileReference; lastKnownFileType = text.plist.entitlements; path = App.entitlements;/);
  const appGroup = project.split('504EC3061FED79650016851F /* App */ =')[1]?.split('path = App;')[0] ?? '';
  expect(appGroup.includes('/* App.entitlements */')).toBe(true);
  expect(project.match(/CODE_SIGN_ENTITLEMENTS = App\/App.entitlements;/g)).toHaveLength(2);
  expect(fs.readFileSync('ios/App/App/App.entitlements', 'utf8')).toContain('<key>com.apple.developer.applesignin</key>');
  expect(fs.readFileSync('ios/App/App/Info.plist', 'utf8')).toMatch(/<key>UIRequiredDeviceCapabilities<\/key>\s*<array>\s*<string>arm64<\/string>/);
});
