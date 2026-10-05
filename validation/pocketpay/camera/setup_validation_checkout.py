"""Stage only the reviewed launch wrapper in a supplied disposable clean clone.

Do not run during local preparation. This creates no commits, refs or dispatches.
"""
import hashlib
import json
from pathlib import Path
import sys

from verify_checkout import FIXTURE_PATH, FIXTURE_SHA256, LEGACY_PATH, verify


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: setup_validation_checkout.py DISPOSABLE_CANONICAL_CAMERA_CLONE")
    checkout = Path(sys.argv[1]).resolve()
    verify(checkout)
    if (checkout / LEGACY_PATH).exists():
        raise RuntimeError("Use a clean disposable clone without the old auth launch wrapper")
    source = Path(__file__).resolve().parent / "fixtures/camera-native-fixture.tsx"
    data = source.read_bytes()
    if hashlib.sha256(data).hexdigest() != FIXTURE_SHA256:
        raise RuntimeError("Reviewed local wrapper hash mismatch")
    target = checkout / FIXTURE_PATH
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    print(json.dumps(verify(checkout, require_installed=True), indent=2))


if __name__ == "__main__":
    main()
