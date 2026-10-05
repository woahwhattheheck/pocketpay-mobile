"""Read-only provenance check. This module never installs fixtures or runs ADB."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

SOURCE_SHA = "e92351b71869f6be89229511c9898e20d50369c9"
SOURCE_TREE = "a9bf24a0884e3fc200f4be66c1e4b1919d53dada"
FIXTURE_PATH = "app/send/__camera-native-fixture.tsx"
FIXTURE_SHA256 = "2a2e23c5a8c0e36c1b58b80e2931c183c7998d609bf7d134a44baf351189beb0"
LEGACY_PATH = "app/(auth)/__camera-native-fixture.tsx"
LEGACY_SHA256 = "fcbd08490cb4705425cc9a54cc8c2f8b77e0266f796e05459fbcab69fac6c4e7"


def git(checkout, *arguments):
    return subprocess.check_output(
        ["git", "-C", str(checkout), *arguments], text=True, timeout=15
    ).strip()


def verify(checkout, require_installed=False):
    checkout = Path(checkout).resolve()
    if git(checkout, "rev-parse", "HEAD") != SOURCE_SHA:
        raise RuntimeError("Camera checkout is not the canonical source SHA")
    if git(checkout, "rev-parse", "HEAD^{tree}") != SOURCE_TREE:
        raise RuntimeError("Camera checkout tree differs from the canonical tree")
    if git(checkout, "diff", "--name-only", "HEAD"):
        raise RuntimeError("Tracked camera checkout files differ from canonical HEAD")
    untracked = git(checkout, "ls-files", "--others", "--exclude-standard").splitlines()
    allowed = {FIXTURE_PATH} if require_installed else {FIXTURE_PATH, LEGACY_PATH}
    if any(name not in allowed for name in untracked):
        raise RuntimeError("Unexpected untracked file in the camera checkout")
    legacy = checkout / LEGACY_PATH
    if legacy.exists() and hashlib.sha256(legacy.read_bytes()).hexdigest() != LEGACY_SHA256:
        raise RuntimeError("Legacy camera launch fixture differs from its reviewed input")
    fixture = checkout / FIXTURE_PATH
    if require_installed and not fixture.is_file():
        raise RuntimeError("The reviewed camera launch fixture is not installed")
    if fixture.exists() and hashlib.sha256(fixture.read_bytes()).hexdigest() != FIXTURE_SHA256:
        raise RuntimeError("The camera launch fixture differs from the reviewed wrapper")
    return {
        "sourceSha": SOURCE_SHA, "sourceTree": SOURCE_TREE,
        "trackedFilesUnchanged": True,
        "fixturePath": FIXTURE_PATH, "fixtureSha256": FIXTURE_SHA256,
        "fixtureInstalled": fixture.exists(),
        "legacyAuthFixturePresentAtReadOnlyPreparation": legacy.exists(),
    }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: verify_checkout.py READ_ONLY_CHECKOUT")
    print(json.dumps(verify(sys.argv[1]), indent=2))
