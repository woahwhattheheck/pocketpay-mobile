"""Read-only source custody check; this module never edits a checkout or runs ADB."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

SOURCE_SHA = "314b69b9a4ac4c4328540792fcc516e6ce5c6e16"
SOURCE_TREE = "d024fbbd8393b855508da14a0b2fba9441c7a5f4"
HERE = Path(__file__).resolve().parent
KNOWN_UNTRACKED = {
    "app/send/__camera-native-fixture.tsx": "2a2e23c5a8c0e36c1b58b80e2931c183c7998d609bf7d134a44baf351189beb0",
    "app/(auth)/__camera-native-fixture.tsx": "fcbd08490cb4705425cc9a54cc8c2f8b77e0266f796e05459fbcab69fac6c4e7",
}


def git(checkout, *args):
    return subprocess.check_output(["git", "-C", str(checkout), *args], text=True, timeout=15).strip()


def verify(checkout, runtime=False):
    checkout = Path(checkout).resolve()
    if runtime:
        packet = json.loads((HERE / "provenance.json").read_text())
        if packet.get("sourceSha") != SOURCE_SHA or packet.get("sourceTree") != SOURCE_TREE:
            raise RuntimeError("Frozen Send packet source metadata differs")
        for name, digest in packet["files"].items():
            if Path(name).name != name or hashlib.sha256((HERE / name).read_bytes()).hexdigest() != digest:
                raise RuntimeError("Frozen Send candidate file differs: " + name)
    if git(checkout, "rev-parse", "HEAD") != SOURCE_SHA or git(checkout, "rev-parse", "HEAD^{tree}") != SOURCE_TREE:
        raise RuntimeError("Send candidate requires its exact source SHA/tree; any successor must be re-pinned")
    if git(checkout, "diff", "--name-only", "HEAD"):
        raise RuntimeError("Tracked production source differs from the pinned tree")
    untracked = git(checkout, "ls-files", "--others", "--exclude-standard").splitlines()
    allowed = {"app/send/__camera-native-fixture.tsx"} if runtime else set(KNOWN_UNTRACKED)
    for name in untracked:
        if name not in allowed or hashlib.sha256((checkout / name).read_bytes()).hexdigest() != KNOWN_UNTRACKED[name]:
            raise RuntimeError("Unexpected or changed validation-only file in production checkout")
    manifest = json.loads((HERE / "source-manifest.json").read_text())
    for name, digest in manifest["files"].items():
        if hashlib.sha256((checkout / name).read_bytes()).hexdigest() != digest:
            raise RuntimeError("Pinned production file differs: " + name)
    return {"sourceSha": SOURCE_SHA, "sourceTree": SOURCE_TREE, "trackedFilesUnchanged": True,
            "sourceFiles": manifest["files"], "knownUntrackedValidationFiles": untracked,
            "runtimeCheck": runtime, "actualSendRoute": "/send", "sendFixtureInstalled": False}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: verify_checkout.py READ_ONLY_SOURCE_CHECKOUT")
    print(json.dumps(verify(sys.argv[1]), indent=2))
