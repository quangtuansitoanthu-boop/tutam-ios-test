import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { configureIosGoogle, resolveIosGoogleClientId } from '../../scripts/lib/ios-google-config.mjs';

it('ships neither the Facebook SDK nor its callback on Android and iOS', () => {
  const nativeFiles = [
    'package.json', 'package-lock.json', 'capacitor.config.ts',
    'ios/App/App/TuTapBridgeViewController.swift', 'ios/App/App/AppDelegate.swift',
    'ios/App/App/Info.plist', 'ios/App/Podfile',
    'android/app/src/main/AndroidManifest.xml', 'android/app/src/main/res/values/strings.xml',
    'android/app/src/main/java/vn/quangtu/tutam/MainActivity.java',
  ];
  for (const file of nativeFiles) {
    expect(fs.readFileSync(file, 'utf8'), file).not.toMatch(/facebook|fbsdk|fb\d{6,}/i);
  }
});

it('requires the real iOS client ID for CI and normalizes the same value for web and callback configuration', () => {
  expect(() => resolveIosGoogleClientId(undefined, true)).toThrow('VITE_GOOGLE_IOS_CLIENT_ID');
  expect(() => resolveIosGoogleClientId('  ', true)).toThrow('VITE_GOOGLE_IOS_CLIENT_ID');
  expect(() => resolveIosGoogleClientId('invalid', true)).toThrow('Invalid Google iOS client ID');
  expect(resolveIosGoogleClientId(undefined, false)).toBe('');
  expect(resolveIosGoogleClientId(' 123456-iosclient.apps.googleusercontent.com ', true))
    .toBe('123456-iosclient.apps.googleusercontent.com');
});

it('stops the iOS CI entry point before content downloads or native sync when the ID is missing', () => {
  const result = spawnSync(process.execPath, ['scripts/build-mobile.mjs', '--platform', 'ios'], {
    env: { ...process.env, CI: 'true', VITE_GOOGLE_IOS_CLIENT_ID: '' }, encoding: 'utf8',
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('VITE_GOOGLE_IOS_CLIENT_ID is required');
  expect(result.stdout).not.toContain('vite');
});

it('adds only the iOS Google callback, preserves existing native callbacks and is repeatable', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tutam-ios-google-'));
  const file = path.join(root, 'Info.plist');
  try {
    const source = fs.readFileSync('ios/App/App/Info.plist', 'utf8');
    fs.writeFileSync(file, source);
    configureIosGoogle(file, '');
    expect(fs.readFileSync(file, 'utf8')).toBe(source);
    configureIosGoogle(file, '123456-iosclient.apps.googleusercontent.com');
    const configured = fs.readFileSync(file, 'utf8');
    expect(configured).toContain('com.googleusercontent.apps.123456-iosclient');
    expect(configured).not.toMatch(/<string>fb\d+<\/string>/);
    expect(configured).toContain('vn.quangtu.tutam');
    expect(configured).toContain('<string>audio</string>');
    configureIosGoogle(file, '123456-iosclient.apps.googleusercontent.com');
    expect(fs.readFileSync(file, 'utf8')).toBe(configured);
    expect(() => configureIosGoogle(file, '<invalid>')).toThrow('Invalid Google iOS client ID');
    expect(fs.readFileSync(file, 'utf8')).toBe(configured);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
