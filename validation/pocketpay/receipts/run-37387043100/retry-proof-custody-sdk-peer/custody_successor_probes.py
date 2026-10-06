"""Pure installed Retry proof-custody probes; no guest or native claims.

The only boundary is memory-only raw ADB/dump output. Original observed XML and
observer rows are read as parser fixtures; fake PNGs explicitly say PURE MOCK.
Subprocess run/Popen/check_output are denied before all installed imports.
"""
import ast
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from unittest.mock import patch
import xml.etree.ElementTree as ET

BASE = Path(sys.argv[1]).resolve()
EXPECTED_PROVENANCE = sys.argv[2]
OUT = Path(__file__).resolve().parent / 'mock-proof-outputs'
OUT.mkdir(exist_ok=False)
OLD = Path('/workspace/scratch/ea8baa184658/pocketpay-remote-native-controller-host-settle-successor/validation/pocketpay')
FIX = OLD / 'receipts/run-37387043100/retry-deadline/fixtures'
provenance_bytes = (BASE / 'provenance.json').read_bytes()
if hashlib.sha256(provenance_bytes).hexdigest() != EXPECTED_PROVENANCE:
    raise AssertionError('External frozen provenance hash differs; no installed imports attempted')
provenance = json.loads(provenance_bytes)
for name, digest_expected in provenance['filesSha256'].items():
    if hashlib.sha256((BASE / name).read_bytes()).hexdigest() != digest_expected:
        raise AssertionError('Frozen candidate changed before any installed import: ' + name)
denied = []
def deny(*args, **kwargs):
    denied.append(repr(args))
    raise AssertionError('External process/ADB denied in pure peer probe')
subprocess.run = deny
subprocess.Popen = deny
subprocess.check_output = deny
sys.dont_write_bytecode = True
sys.path.insert(0, str(OLD))
sys.path.insert(0, str(OLD / 'retry'))
sys.path.insert(0, str(BASE))
os.environ['ARTIFACT_DIR'] = str(OUT)
os.environ['SOURCE_SHA'] = 'ddd56649099d1fc5763ef29af3bfba0363897bd6'
sys.argv = ['pure-installed-retry-custody-peer', 'retry']
import retry_host_adapter as adapter_module
import expo_ordinary_menu as ordinary
import expo_go_intro as intro
import observation_helpers as helpers
from observer_framing import decode_observer_line

RESULTS = []
def check(value, message='Assertion failed'):
    if not value:
        raise AssertionError(message)
def raises(kind, fn):
    try:
        fn()
    except kind:
        return
    raise AssertionError('Expected ' + kind.__name__)
def probe(name, fn):
    try:
        fn()
        RESULTS.append({'name': name, 'result': 'passed'})
    except Exception as error:
        RESULTS.append({'name': name, 'result': 'failed', 'error': str(error), 'errorType': type(error).__name__})
def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def files(root):
    return {str(p.relative_to(root)): digest(p) for p in root.rglob('*') if p.is_file()}

class MemoryBoundary:
    def __init__(self, kind, output, after_intro='review'):
        self.kind, self.output, self.after_intro = kind, output, after_intro
        self.state = 'review'
        self.calls = []
        self.dumps = 0
        prefix = adapter_module.PREFIXES[kind]
        source = FIX / ('primary-logcat-original.txt' if kind == 'primary' else 'final-logcat-original.txt')
        outcome = 'failed' if kind == 'primary' else 'mismatch'
        self.rows = [row for line in source.read_text().splitlines()
                     if (row := decode_observer_line(line, prefix)) is not None and row['outcome'] == outcome]
        check(bool(self.rows), 'Retained actual observer parser fixture missing')
        self.outcome = outcome
    def dump(self, *args, **kwargs):
        self.dumps += 1
        name = {'review': 'review-original.xml', 'intro': 'retry-intro-original.xml', 'ordinary': 'ordinary-menu-original.xml'}[self.state]
        return ET.parse(FIX / name).getroot()
    def adb(self, *args, **kwargs):
        self.calls.append({'args': list(args), 'timeout': kwargs.get('timeout')})
        if args == ('logcat', '-d', '-s', 'ReactNativeJS:I'):
            return '\n'.join(adapter_module.PREFIXES[self.kind] + ' ' + json.dumps(row) for row in self.rows)
        if args == ('shell', 'pidof', 'host.exp.exponent'):
            return '4217'
        if args == ('shell', 'dumpsys', 'activity', 'activities'):
            return 'mResumedActivity: ActivityRecord{abc123 u0 host.exp.exponent/.experience.ExperienceActivity t17}'
        if args == ('exec-out', 'screencap', '-p'):
            return b'\x89PNG\r\n\x1a\nPURE-MOCK-BOUNDARY-NOT-NATIVE-EVIDENCE'
        if args[:3] == ('shell', 'input', 'tap'):
            self.state = self.after_intro if self.state == 'intro' else 'review'
            return ''
        raise AssertionError('Unexpected memory boundary command: ' + repr(args))
    def adapter(self):
        namespace = {'dump': self.dump, 'adb': self.adb, 'ROOT': self.output}
        if self.kind == 'gap':
            namespace['UnsafeEnvironment'] = helpers.UnsafeEnvironment
        host = adapter_module.RetryHostAdapter(namespace, self.kind)
        host.begin_case(self.outcome)
        return host

def assert_no_overwrite(before, after):
    check(set(before).issubset(after), 'Previously retained custody file disappeared')
    check(all(after[name] == value for name, value in before.items()), 'Previously retained custody proof overwritten')

ordinary_root = OUT / 'ordinary-primary-and-gap'
ordinary_root.mkdir()
all_boundaries = []
def two_ordinary_primary_then_gap():
    for kind in ('primary', 'gap'):
        guest = MemoryBoundary(kind, ordinary_root)
        all_boundaries.append(guest)
        host = guest.adapter()
        original_output = host.output
        before = files(ordinary_root)
        for ordinal in (1, 2):
            guest.state = 'ordinary'
            tree = host.uncovered(('Sign & Send',), accept=True)
            check(not ordinary.has_host_sheet(tree))
            check(host.output == original_output, 'self.output not restored after successful closure')
            check(host.closures == ordinal and host.developer_sheet_dismissals == ordinal)
            after = files(ordinary_root)
            assert_no_overwrite(before, after)
            check(len(after) > len(before), 'Closure did not retain new custody files')
            before = after
        prior_calls = len(guest.calls)
        guest.state = 'ordinary'
        raises(RuntimeError, lambda: host.uncovered(('Sign & Send',)))
        check(not any(call['args'][:3] == ['shell', 'input', 'tap'] for call in guest.calls[prior_calls:]), 'Third shared2 closure tapped')
        check(host.output == original_output, 'self.output not restored after rejected third closure')
    proofs = list(ordinary_root.rglob('retry-host-preservation-*.json'))
    check(len(proofs) == 4)
    check(len({str(p.parent) for p in proofs}) == 4, 'Primary/gap or same-kind closure directory collision')
    required = {'observed-expo-ordinary-menu-close-before.xml', 'observed-expo-ordinary-menu-close-before-after.xml',
                'observed-expo-ordinary-menu-close-before.png', 'observed-expo-ordinary-menu-close-after.xml',
                'observed-expo-ordinary-menu-close-after-after.xml', 'observed-expo-ordinary-menu-close-after.png',
                'ordinary-menu-native-before-activities.txt', 'ordinary-menu-native-before-tap-activities.txt',
                'ordinary-menu-native-after-activities.txt', 'ordinary-menu-native-after-capture-activities.txt',
                'observed-expo-ordinary-menu-closure.json'}
    for proof in proofs:
        check(required.issubset({p.name for p in proof.parent.iterdir()}), 'Full ordinary custody set missing')
        data = json.loads(proof.read_text())
        check(data['beforeRecords'] == data['afterRecords'] and not data['originalUriRedelivered'] and not data['productStatePassed'])

probe('actual_installed_two_ordinary_same_kind_then_primary_gap_full_custody_no_overwrite', two_ordinary_primary_then_gap)

intro_root = OUT / 'intro-primary-and-gap'
intro_root.mkdir()
def repeated_intro_primary_gap():
    for kind in ('primary', 'gap'):
        guest = MemoryBoundary(kind, intro_root)
        all_boundaries.append(guest)
        host = guest.adapter()
        original = host.output
        prior = files(intro_root)
        for ordinal in (1, 2):
            guest.state = 'intro'
            host.uncovered(('Sign & Send',), accept=True)
            check(host.output == original)
            check(host.developer_sheet_dismissals == ordinal and host.closures == ordinal)
            current = files(intro_root)
            assert_no_overwrite(prior, current)
            check(len(current) > len(prior))
            prior = current
    proofs = list(intro_root.rglob('retry-host-preservation-*.json'))
    check(len(proofs) == 4 and len({str(p.parent) for p in proofs}) == 4)
    for proof in proofs:
        closure = json.loads((proof.parent / 'observed-expo-sdk54-intro-closures.json').read_text())
        check(len(closure) == 1)
        for phase in ('before', 'after'):
            name = closure[0][phase]
            for suffix in ('.xml', '-after.xml', '.png'):
                check((proof.parent / (name + suffix)).is_file(), 'Intro custody reference not retained locally')

probe('actual_installed_repeated_intro_same_kind_and_primary_gap_all_pairs_distinct', repeated_intro_primary_gap)

def mixed_intro_ordinary_shared2():
    root = OUT / 'mixed-intro-ordinary'
    root.mkdir()
    guest = MemoryBoundary('primary', root, after_intro='ordinary')
    all_boundaries.append(guest)
    host = guest.adapter()
    guest.state = 'intro'
    host.uncovered(('Sign & Send',), accept=True)
    check(host.developer_sheet_dismissals == 2 and host.closures == 1)
    proofs = list(root.rglob('retry-host-preservation-*.json'))
    check(len(proofs) == 1)
    check((proofs[0].parent / 'observed-expo-ordinary-menu-closure.json').is_file())
    check((proofs[0].parent / 'observed-expo-sdk54-intro-closures.json').is_file())
    before = len(guest.calls)
    guest.state = 'intro'
    raises(RuntimeError, lambda: host.uncovered(('Sign & Send',)))
    check(not any(row['args'][:3] == ['shell', 'input', 'tap'] for row in guest.calls[before:]))
    check(host.output == root)

probe('actual_installed_intro_plus_ordinary_shared2_both_proofs_preserved_no_third_tap', mixed_intro_ordinary_shared2)

def failure_restores_output():
    root = OUT / 'failed-closure'
    root.mkdir()
    guest = MemoryBoundary('gap', root)
    all_boundaries.append(guest)
    host = guest.adapter()
    guest.state = 'ordinary'
    original = host._preserved
    host._preserved = lambda *_: (_ for _ in ()).throw(RuntimeError('PURE-MOCK failure after closure'))
    raises(RuntimeError, lambda: host.uncovered(('Sign & Send',)))
    check(host.output == root, 'output context leaked after closure failure')
    check(host.closures == 0 and not host.stable)
    check(not list(root.rglob('retry-host-preservation-*.json')), 'Failed closure produced preservation/pass proof')
    host._preserved = original

probe('actual_installed_failed_closure_restores_product_ROOT_and_has_no_pass_proof', failure_restores_output)

def invariants_unchanged():
    old = ast.parse((OLD / 'retry_host_adapter.py').read_text())
    new = ast.parse((BASE / 'retry_host_adapter.py').read_text())
    def methods(module):
        cls = next(n for n in module.body if isinstance(n, ast.ClassDef) and n.name == 'RetryHostAdapter')
        return {n.name: ast.dump(n, include_attributes=False) for n in cls.body if isinstance(n, ast.FunctionDef)}
    a, b = methods(old), methods(new)
    for name in ('adb', 'require_live', 'dump', 'begin_case', '_records', '_preserved'):
        check(a[name] == b[name], 'Deadline/raw binding/state contract changed: ' + name)
    for name in ('expo_ordinary_menu.py', 'expo_go_intro.py', 'retry-primary-ui.py', 'retry-gap-runner.py',
                 'retry/observation_helpers.py', 'retry/retry_gap_ui.py', 'retry/fixtures/retry-gap-observer.js',
                 'retry/fixtures/native-fixture.tsx', 'retry/fixtures/retry-gap-launch-route.tsx'):
        if (BASE / name).exists():
            check((OLD / name).read_bytes() == (BASE / name).read_bytes(), 'Out-of-scope installed file changed: ' + name)

probe('global600_adb_caps_records_identity_original_validators_shared_f1_byte_equal', invariants_unchanged)

def namespace_actual_bindings():
    module = ast.parse((BASE / 'retry-primary-ui.py').read_text())
    ns = {'__name__': 'peer_primary_definitions'}
    exec(compile(ast.Module(body=[n for n in module.body if isinstance(n, (ast.Import, ast.ImportFrom, ast.Assign, ast.FunctionDef))], type_ignores=[]), str(BASE / 'retry-primary-ui.py'), 'exec'), ns)
    host = ns['HOST']
    check(host.raw_dump is ns['dump'] and host.raw_adb is not ns['adb'])
    host.deadline = 1
    before = len(denied)
    with patch.object(adapter_module.time, 'monotonic', return_value=1):
        raises(adapter_module.RetryBoundExpired, lambda: ns['adb']('logcat', '-d'))
    check(len(denied) == before)

probe('actual_installed_primary_namespace_binding_expiry_never_processes', namespace_actual_bindings)

def reuse_refuses_before_raw_dump():
    root = OUT / 'reuse-before-dump'
    root.mkdir()
    guest = MemoryBoundary('primary', root)
    all_boundaries.append(guest)
    host = guest.adapter()
    target = root / 'retry-host-proofs/primary/closure-1'
    target.mkdir(parents=True)
    (target / 'prior-proof.txt').write_text('PURE-PEER immutable prior proof')
    previous = files(root)
    raises(FileExistsError, lambda: host.uncovered(('Sign & Send',)))
    check(guest.dumps == 0 and guest.calls == [], 'Reuse refusal performed raw dump or guest read')
    check(files(root) == previous and host.output == root)

probe('existing_proof_namespace_refused_before_raw_dump_or_ADB_and_unchanged_bytes', reuse_refuses_before_raw_dump)

def expiry_before_any_proof():
    root = OUT / 'expiry-before-proof'
    root.mkdir()
    guest = MemoryBoundary('gap', root)
    all_boundaries.append(guest)
    host = guest.adapter()
    host.deadline = 1
    with patch.object(adapter_module.time, 'monotonic', return_value=1):
        raises(helpers.UnsafeEnvironment, lambda: host.uncovered(('Sign & Send',)))
    check(guest.dumps == 0 and not guest.calls and not files(root))
    check(host.output == root)

probe('original_gap_UnsafeEnvironment_expiry_no_dump_no_proof_directory_no_commands', expiry_before_any_proof)

def expiry_during_dump():
    root = OUT / 'expiry-during-dump'
    root.mkdir()
    guest = MemoryBoundary('primary', root)
    all_boundaries.append(guest)
    host = guest.adapter()
    host.deadline = 1
    clock = [0]
    raw = guest.dump
    def crossing():
        tree = raw()
        clock[0] = 2
        return tree
    host.raw_dump = crossing
    with patch.object(adapter_module.time, 'monotonic', side_effect=lambda: clock[0]):
        raises(adapter_module.RetryBoundExpired, lambda: host.uncovered(('Sign & Send',), accept=True))
    check(guest.dumps == 1 and not guest.calls and not files(root) and not host.stable)
    check(host.output == root)

probe('global600_post_raw_dump_expiry_excludes_target_and_proof_writes', expiry_during_dump)

def actual_cap_and_post_boundary_expiry():
    root = OUT / 'caps-and-post-read'
    root.mkdir()
    guest = MemoryBoundary('primary', root)
    all_boundaries.append(guest)
    host = guest.adapter()
    host.deadline = 600
    with patch.object(adapter_module.time, 'monotonic', return_value=599.75):
        host.adb('shell', 'pidof', 'host.exp.exponent', timeout=30)
    check(guest.calls[-1]['timeout'] == .25)
    prior_deadline = host.deadline
    with patch.object(adapter_module.time, 'monotonic', return_value=1):
        host.begin_case('failed')
    check(host.deadline == prior_deadline)
    clock = [0]
    host.deadline = 1
    def crossing(*args, **kwargs):
        clock[0] = 2
        return 'cannot-be-accepted'
    with patch.object(host, 'raw_adb', crossing), patch.object(adapter_module.time, 'monotonic', side_effect=lambda: clock[0]):
        raises(adapter_module.RetryBoundExpired, lambda: host.adb('logcat', '-d'))

probe('global600_clips_ADB_timeout_and_rejects_crossing_result_never_resets', actual_cap_and_post_boundary_expiry)

def product_ROOT_and_no_relaunch():
    check(helpers.ROOT == OUT, 'Original immutable helper ROOT changed')
    for guest in all_boundaries:
        for call in guest.calls:
            args = call['args']
            check(args[:3] not in (['shell', 'am', 'force-stop'], ['shell', 'am', 'start']))
            check(args[:2] != ['logcat', '-c'])

probe('original_product_ROOT_unchanged_and_no_URI_replay_reset_or_log_clear', product_ROOT_and_no_relaunch)
probe('external_subprocess_ADB_attempts_remain_zero', lambda: check(not denied))

reviewed = {name: digest(BASE / name) for name in ('retry_host_adapter.py', 'retry-primary-ui.py',
            'retry-gap-runner.py', 'expo_ordinary_menu.py', 'expo_go_intro.py',
            'retry/observation_helpers.py', 'retry/retry_gap_ui.py') if (BASE / name).exists()}
report = {'scope': 'Pure actual-installed helpers with explicit memory ADB/dump boundary; fake media are not native evidence',
          'installedBase': str(BASE), 'reviewedFileHashes': reviewed,
          'externallyAnchoredProvenanceSha256': EXPECTED_PROVENANCE,
          'frozenFileLocksVerifiedBeforeImports': len(provenance['filesSha256']),
          'probeCount': len(RESULTS), 'passed': sum(r['result'] == 'passed' for r in RESULTS),
          'externalSubprocessOrAdbAttemptCount': len(denied),
          'memoryBoundaryCommandCount': sum(len(g.calls) for g in all_boundaries),
          'retainedMockCustodyFiles': files(OUT), 'results': RESULTS}
(OUT / 'results.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
raise SystemExit(0 if report['probeCount'] == report['passed'] else 1)
