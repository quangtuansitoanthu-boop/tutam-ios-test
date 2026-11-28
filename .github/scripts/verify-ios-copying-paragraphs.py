#!/usr/bin/env python3
"""Read only the owned guest fixture's two native draft slots; never seed or alter app data."""
import hashlib
import json
import os
from pathlib import Path
import sys
import time

KEY = 'tt_copy_v1:guest:duoc-su:nfc-v1-7626225a5614e1f72158:1'
VERSION = 'nfc-v1-7626225a5614e1f72158'
EXPECTED = 'Nam\n\nmo Phat\n\n'
KEY_HASH = hashlib.sha256(KEY.encode('utf-8')).hexdigest()
EXPECTED_HASH = hashlib.sha256(EXPECTED.encode('utf-8')).hexdigest()

def inspect(container):
    base = container / 'Documents' / 'scripture-copying'
    slots = []
    for slot in (0, 1):
        file = base / (KEY_HASH + '.' + str(slot) + '.json')
        if not file.is_file():
            return None, 'missing_slot'
        raw = file.read_bytes()
        if len(raw) > 2_000_000:
            return None, 'fixture_size'
        envelope = json.loads(raw.decode('utf-8'))
        sequence, payload = envelope.get('sequence'), envelope.get('payload')
        if type(sequence) is not int or not 0 <= sequence <= 9007199254740991 or sequence % 2 != slot or not isinstance(payload, str):
            return None, 'envelope_schema'
        checksum = hashlib.sha256(payload.encode('utf-8')).hexdigest()
        if envelope.get('checksum') != checksum:
            return None, 'checksum'
        draft = json.loads(payload)
        texts = draft.get('texts')
        if (draft.get('sutraId') != 'duoc-su' or draft.get('chapter') != 1 or draft.get('sourceVersion') != VERSION
                or not isinstance(draft.get('runId'), str) or not isinstance(texts, list) or len(texts) != 28
                or not all(isinstance(text, str) for text in texts)):
            return None, 'draft_schema'
        slots.append((sequence, slot, draft, checksum, hashlib.sha256(raw).hexdigest()))
    slots.sort(key=lambda value: value[0], reverse=True)
    if slots[0][0] == slots[1][0]:
        return None, 'sequence_tie'
    sequence, slot, draft, checksum, file_hash = slots[0]
    texts = draft['texts']
    result = {
        'fixture': 'copying-paragraphs-guest-duoc-su', 'keySha256': KEY_HASH,
        'expectedTextSha256': EXPECTED_HASH, 'textSha256': hashlib.sha256(texts[0].encode('utf-8')).hexdigest(),
        'textCount': len(texts), 'firstTextCharacters': len(texts[0]), 'firstTextNewlines': texts[0].count('\n'),
        'otherNonemptyTexts': sum(text != '' for text in texts[1:]),
        'highestSequence': sequence, 'highestSlot': slot, 'sourceVersionMatches': draft['sourceVersion'] == VERSION,
        'slotProofs': [{'slot': value[1], 'sequence': value[0], 'checksumVerified': True, 'fileSha256': value[4]} for value in slots],
        'pass': texts[0] == EXPECTED and all(text == '' for text in texts[1:]) and draft.get('block') == 0,
    }
    return result, None if result['pass'] else 'raw_fixture_mismatch'

def main():
    assert os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('RUNNER_OS') == 'macOS', 'owned CI only'
    assert os.environ.get('IOS_TEST_SUITE') == 'copying-paragraphs', 'exact profile only'
    assert len(sys.argv) == 3, 'container and evidence path required'
    container, output = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
    assert container.is_dir() and output.parent.name == 'release-evidence' and output.name == 'copying-paragraphs-persistence.json', 'owned paths required'
    deadline, attempts = time.monotonic() + 10.0, 0
    result, reason = None, 'not_ready'
    while True:
        attempts += 1
        try:
            result, reason = inspect(container)
        except (OSError, ValueError, TypeError, AttributeError):
            result, reason = None, 'incomplete_or_invalid_slot'
        if result and result['pass']:
            break
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        time.sleep(min(0.1, remaining))
    proof = result or {'fixture': 'copying-paragraphs-guest-duoc-su', 'keySha256': KEY_HASH,
                       'expectedTextSha256': EXPECTED_HASH, 'pass': False}
    proof.update(attempts=attempts, durableWaitLimitSeconds=10, reason=reason)
    output.write_text(json.dumps(proof, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'fixture': proof['fixture'], 'pass': proof['pass'], 'textCount': proof.get('textCount'),
                      'firstTextNewlines': proof.get('firstTextNewlines'), 'reason': reason}))
    return 0 if proof['pass'] else 1

if __name__ == '__main__':
    raise SystemExit(main())
