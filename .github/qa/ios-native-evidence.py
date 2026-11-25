"""Inspect only the opt-in diagnostics from the isolated Simulator."""
import json
import math
import os
import subprocess
import sys
import time
from pathlib import Path

output = Path("build/release-evidence")
simulator = os.environ["TUTAM_QA_SIMULATOR"]
suite = os.environ["IOS_TEST_SUITE"]
bundle = "vn.quangtu.tutam"


def simctl(*args, **options):
    return subprocess.run(["xcrun", "simctl", *args], text=True, **options)


def require_scheduled_links():
    # The XCTest itself accepts the real, app-specific SpringBoard Open prompt.
    # The system does not pass opt-in CLI arguments on a cold URL launch.
    # The cold Settings destination is independently asserted through native AX.
    predicate = 'eventMessage CONTAINS "[TutamQALink]" OR (eventMessage CONTAINS "[TutamQA]" AND eventMessage CONTAINS "native-link")'
    events = simctl("spawn", simulator, "log", "show", "--last", "60m", "--style", "compact",
                    "--predicate", predicate, capture_output=True, check=True).stdout
    expected = {"guest": ["rosary"], "extended": ["copy", "chapter"]}[suite]
    received = []
    native = []
    for line in events.splitlines():
        if "[TutamQALink] phase=" in line:
            phase = line.split("[TutamQALink] phase=")[-1].strip()
            if phase in {"scene-cold", "scene-warm", "app-open"}:
                native.append(phase)
        if "[TutamQA] {" not in line:
            continue
        try:
            data = json.loads(line.split("[TutamQA] ", 1)[1])
        except ValueError:
            continue
        if data.get("type") == "native-link":
            received.append({"phase": data.get("phase"), "target": data.get("target")})
    # A device may compact noisy unified logs; the App's bounded trace has
    # independent typed copies of the same scrubbed JS events.
    trace = output / "native-ui-events.jsonl"
    if trace.exists():
        for line in trace.read_text().splitlines():
            row = json.loads(line)
            if row.get("type") == "native-link":
                received.append({"phase": row.get("phase"), "target": row.get("target")})
    receipt = {"native": native, "expected": expected, "events": received}
    (output / "native-link-receipts.json").write_text(json.dumps(receipt))
    assert "scene-warm" in native, "No genuine warm scene URL callback"
    for target in expected:
        phases = {record["phase"] for record in received if record["target"] == target}
        assert {"warm-received", "navigated"}.issubset(phases), (target, sorted(phases))
    print("Confirmed native scene and WKWebView navigation", expected)


def read_launch(trace, index):
    # Preserve earlier evidence and avoid starving diagnostic writes at the cap.
    simctl("terminate", simulator, bundle, capture_output=True)
    if trace.exists():
        trace.rename(trace.with_name(f"tutam-qa-before-paint-{index}.jsonl"))
    simctl("launch", simulator, bundle, "-tutam-qa-events", "1", check=True)
    until = time.monotonic() + 50
    while time.monotonic() < until:
        if trace.exists():
            for line in trace.read_text().splitlines():
                try:
                    data = json.loads(line)
                except ValueError:
                    continue
                if data.get("type") == "startup-paint":
                    return data
        time.sleep(0.4)
    raise AssertionError("Packaged native WKWebView produced no complete startup artwork trace")


def measure_startup():
    directory = simctl("get_app_container", simulator, bundle, "data", capture_output=True, check=True).stdout.strip()
    trace = Path(directory) / "Library/Caches/tutam-qa-events.jsonl"
    results = []
    for index in range(2):
        item = read_launch(trace, index)
        results.append(item)
        (output / "native-startup-paint.json").write_text(json.dumps(results))
        for key in ("shownAt", "assetAt", "mountedAt", "fadeAt", "removedAt", "imageNumber", "viewport"):
            assert isinstance(item.get(key), (int, float)) and math.isfinite(item[key]), (key, item)
        assert 1 <= item["imageNumber"] <= 10 and item["viewport"] > 300, item
        shown, mounted, fade, removed = [item[key] for key in ("shownAt", "mountedAt", "fadeAt", "removedAt")]
        # The shell publishes data-mounted before its two real paint frames.
        # Busy simulator rendering can add a few frames to event observation.
        assert fade >= max(shown + 1550, mounted - 35), item
        assert fade <= max(shown + 1600, mounted) + 500, item
        assert fade - max(item["assetAt"], shown) >= 1200, item
        assert fade + 185 <= removed <= fade + 520, item
        print(f"Launch {index+1}: illustration {item['imageNumber']:02.0f}, "
              f"art at {item['assetAt'] - shown:.0f} ms, shell at {mounted - shown:.0f} ms, "
              f"fade at {fade - shown:.0f} ms, removed at {removed - shown:.0f} ms")
    assert results[1]["imageNumber"] == results[0]["imageNumber"] % 10 + 1, results


if sys.argv[1] == "links":
    require_scheduled_links()
elif sys.argv[1] == "startup":
    measure_startup()
else:
    raise ValueError("Unknown QA mode")
