import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.resolve('@capacitor/cli/package.json'));
const plist = require('plist');
const project = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '');
const objects = [...project.matchAll(/^\s*([A-F0-9]{24})\s*=\s*\{([^{}]+)\};/gmu)]
  .map(([, id, body]) => ({ id, body }));

it.each(['App', 'CalendarWidget'])('bundles the App Group defaults reason in the %s target', target => {
  const privacy = plist.parse(readFileSync('ios/App/' + target + '/PrivacyInfo.xcprivacy', 'utf8'));
  expect(privacy.NSPrivacyAccessedAPITypes).toContainEqual({
    NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
    NSPrivacyAccessedAPITypeReasons: expect.arrayContaining(['1C8F.1']),
  });

  const group = objects.find(o => o.body.includes('isa = PBXGroup;') && o.body.includes('path = ' + target + ';'));
  const file = objects.find(o => o.body.includes('path = PrivacyInfo.xcprivacy;') && group?.body.includes(o.id));
  expect(file, target + ' privacy file reference').toBeDefined();
  const buildFile = objects.find(o => o.body.includes('isa = PBXBuildFile;') && o.body.includes('fileRef = ' + file!.id));
  const nativeTarget = objects.find(o => o.body.includes('isa = PBXNativeTarget;') && o.body.includes('name = ' + target + ';'));
  const resources = objects.find(o => o.body.includes('isa = PBXResourcesBuildPhase;') && nativeTarget?.body.includes(o.id));
  expect(buildFile, target + ' privacy build file').toBeDefined();
  expect(resources?.body).toContain(buildFile!.id);
});
