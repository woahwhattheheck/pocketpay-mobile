#!/usr/bin/env bash
# Diagnostic-only successor for the existing isolated guest KVM preflight.
# No emulator/app boot, source/ref write, new provisioning or permission waiver.
set -euo pipefail
[[ "$MODE" == camera || "$MODE" == retry || "$MODE" == baseline ]]
evidence="$GITHUB_WORKSPACE/evidence/$MODE"
mkdir -p "$evidence"
failed_step=none
snapshot() {
  snapshot_phase="$1"
  {
    printf 'phase=%s\n' "$snapshot_phase"
    date -u +%FT%TZ
    uname -a
    id
    id -nG
    printf 'udevadm_locator=%s\n' "$(command -v udevadm || true)"
    udevadm --version
    ls -ld /dev/kvm /sys/devices/virtual/misc/kvm
    stat -c 'file=%n type=%F mode=%a owner=%U group=%G rdev=%t:%T' /dev/kvm
    if test -r /dev/kvm; then printf 'runner_readable=true\n'; else printf 'runner_readable=false\n'; fi
    if test -w /dev/kvm; then printf 'runner_writable=true\n'; else printf 'runner_writable=false\n'; fi
    if test -r /sys/devices/virtual/misc/kvm/dev; then cat /sys/devices/virtual/misc/kvm/dev; fi
    python3 - <<'PY'
from pathlib import Path
import json
modules = Path('/proc/modules').read_text().splitlines() if Path('/proc/modules').exists() else []
print(json.dumps({'loadedKvmModules':[line for line in modules if line.split()[0] in ('kvm','kvm_intel','kvm_amd')]}))
text = Path('/proc/cpuinfo').read_text() if Path('/proc/cpuinfo').exists() else ''
print(json.dumps({'cpuHasVmxFlag':'vmx' in text.split(),'cpuHasSvmFlag':'svm' in text.split()}))
PY
  } > "$evidence/kvm-$snapshot_phase.txt" 2>&1 || true
}
finish() {
  preflight_exit=$?
  set +e
  snapshot exit
  printf '{"preflightExit":%s,"failedStep":"%s","thisScriptBootsAndroid":false}\n' \
    "$preflight_exit" "$failed_step" > "$evidence/kvm-preflight-result.json"
}
trap finish EXIT
run_step() {
  step="$1"
  shift
  if "$@" > "$evidence/kvm-$step.stdout.txt" 2> "$evidence/kvm-$step.stderr.txt"; then
    printf 'step=%s exit=0\n' "$step" | tee -a "$evidence/kvm-step-exits.txt"
  else
    step_exit=$?
    failed_step="$step"
    printf 'step=%s exit=%s\n' "$step" "$step_exit" | tee -a "$evidence/kvm-step-exits.txt"
    return "$step_exit"
  fi
}
write_rule() {
  # Byte-identical existing rule and security settings.
  printf '%s\n' 'KERNEL=="kvm", GROUP="kvm", MODE="0666", OPTIONS+="static_node=kvm"' \
    | timeout --kill-after=5s 15s sudo tee /etc/udev/rules.d/99-kvm4all.rules
}
require_access() {
  # Preserve the existing mandatory gate; never fall back to software emulation.
  test -r /dev/kvm && test -w /dev/kvm
}
snapshot before
run_step write-rule write_rule
run_step reload-rules timeout --kill-after=5s 15s sudo udevadm control --reload-rules
# systemd documents --settle as waiting for this trigger's events to complete.
# Keep the wait bounded and expose its exact timeout/failure instead of guessing.
run_step trigger-and-settle timeout --kill-after=5s 15s sudo udevadm trigger --name-match=kvm --settle
snapshot after-settlement
run_step mandatory-read-write require_access
