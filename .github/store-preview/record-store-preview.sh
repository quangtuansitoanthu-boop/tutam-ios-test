#!/bin/bash
set -euo pipefail
[[ "$GITHUB_ACTIONS" = true && "$RUNNER_OS" = macOS ]]
[[ "$TUTAM_QA_HOSTS_ISOLATED" = 1 ]]
mkdir -p build/store-preview
xcrun simctl list devices available --json > build/store-preview/devices.json
simulator_id="$(python3 - <<'PY'
import json
with open('build/store-preview/devices.json') as f: data=json.load(f)
for runtime, devices in data['devices'].items():
    if not runtime.endswith('iOS-26-2'): continue
    phones=[d for d in devices if d.get('isAvailable') and d['name'].startswith('iPhone')]
    phones.sort(key=lambda d:(d['name']!='iPhone 17 Pro Max',d['name']))
    if phones:
        print(phones[0]['udid']); break
else: raise SystemExit('No pre-existing iOS 26.2 iPhone; never create a replacement device')
PY
)"
xcrun simctl boot "$simulator_id"
xcrun simctl bootstatus "$simulator_id" -b
xcrun simctl ui "$simulator_id" appearance light
xcrun simctl status_bar "$simulator_id" override --time '9:41'
xcodebuild -quiet -workspace ios/App/App.xcworkspace -scheme App -configuration Debug \
  -sdk iphonesimulator -destination "platform=iOS Simulator,id=$simulator_id" \
  -derivedDataPath build/ios-store-capture \
  -only-testing:AppUITests/NativeStorePreviewTests CODE_SIGNING_ALLOWED=NO build-for-testing \
  > build/store-preview/build.log 2>&1
recorder_pid=''
cleanup() {
  if [[ -n "$recorder_pid" ]]; then kill -INT "$recorder_pid" 2>/dev/null || true; wait "$recorder_pid" || true; fi
  xcrun simctl shutdown "$simulator_id" 2>/dev/null || true
}
trap cleanup EXIT
python3 - <<'PY'
import json,time
json.dump({'recorderRequestedEpoch':time.time(),'method':'xcrun simctl io recordVideo h264','simulator':'pre-existing iPhone on isolated GitHub macOS runner'},open('build/store-preview/clock.json','w'))
PY
xcrun simctl io "$simulator_id" recordVideo --codec h264 build/store-preview/raw-simulator.mp4 \
  > build/store-preview/recording.log 2>&1 &
recorder_pid=$!
xcodebuild -quiet -workspace ios/App/App.xcworkspace -scheme App -configuration Debug \
  -sdk iphonesimulator -destination "platform=iOS Simulator,id=$simulator_id" \
  -derivedDataPath build/ios-store-capture -resultBundlePath build/store-preview/capture.xcresult \
  -only-testing:AppUITests/NativeStorePreviewTests -maximum-test-execution-time-allowance 1200 \
  CODE_SIGNING_ALLOWED=NO test-without-building > build/store-preview/capture.log 2>&1
kill -INT "$recorder_pid"; wait "$recorder_pid"; recorder_pid=''
python3 - <<'PY'
import json,re
text=open('build/store-preview/capture.log').read()
markers=[{'id':k,'epoch':float(t)} for k,t in re.findall(r'TUTAM_STORE_SCENE\|([a-z0-9-]+)\|([0-9.]+)',text)]
# Xcode -quiet retains test stdout inside xcresult; the local compositor recovers markers from that bundle.
assert not markers or len({m['id'] for m in markers})==1
json.dump(markers,open('build/store-preview/scenes.json','w'),indent=2)
PY
