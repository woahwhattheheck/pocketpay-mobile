"""Actual host helper/adapter custody differentials; fake boundary only."""
import subprocess
UNMOCKED = []
def deny(*args, **kwargs):
    UNMOCKED.append((args, kwargs))
    raise AssertionError('External subprocess forbidden in pure custody checks')
subprocess.run = deny
subprocess.Popen = deny

import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from test_retry_host_adapter import GuestBoundary, host, strict_action, selectors
from retry_host_adapter import RetryHostAdapter, RetryBoundExpired

HERE = Path(__file__).resolve().parent
PARENT = HERE.parent / 'pocketpay-retry-deadline-local-candidate'
spec = importlib.util.spec_from_file_location('old_retry_custody', PARENT/'retry_host_adapter.py')
old = importlib.util.module_from_spec(spec)
spec.loader.exec_module(old)

class DistinctGuest(GuestBoundary):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.png_count = 0
    def adb(self, *args, **kwargs):
        if args == ('exec-out', 'screencap', '-p'):
            self.calls.append(args)
            self.png_count += 1
            return b'\x89PNG\r\n\x1a\nPURE-FAKE-' + self.kind.encode() + str(self.png_count).encode()
        return super().adb(*args, **kwargs)

def adapter(guest, cls=RetryHostAdapter):
    value = cls({'dump':guest.dump, 'adb':guest.adb, 'ROOT':guest.output}, guest.kind,
                host=host, intro_action=strict_action, intro_bounds=selectors.bounds)
    value.begin_case(guest.outcome)
    return value

def bytes_at(root):
    return {str(p.relative_to(root)):p.read_bytes() for p in root.rglob('*') if p.is_file()}

class CustodyChecks(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def test_old_actual_helpers_cross_runner_overwrite_primary_proof(self):
        primary = DistinctGuest(self.root, state='ordinary', kind='primary', outcome='failed')
        adapter(primary, old.RetryHostAdapter).uncovered()
        original = (self.root/'retry-host-preservation-1.json').read_bytes()
        self.assertEqual(json.loads(original)['kind'], 'primary')
        gap = DistinctGuest(self.root, state='ordinary', kind='gap', outcome='mismatch')
        adapter(gap, old.RetryHostAdapter).uncovered()
        self.assertNotEqual((self.root/'retry-host-preservation-1.json').read_bytes(), original)
        self.assertEqual(json.loads((self.root/'retry-host-preservation-1.json').read_text())['kind'], 'gap')

    def test_old_actual_helper_second_close_overwrites_first_media(self):
        guest = DistinctGuest(self.root, state='ordinary'); value = adapter(guest, old.RetryHostAdapter)
        value.uncovered(); original = (self.root/'observed-expo-ordinary-menu-close-before.png').read_bytes()
        guest.state = 'ordinary'; value.uncovered()
        self.assertNotEqual((self.root/'observed-expo-ordinary-menu-close-before.png').read_bytes(), original)
        self.assertEqual(value.developer_sheet_dismissals, 2)

    def test_primary_and_gap_all_host_proofs_retained_in_independent_directories(self):
        sentinel = self.root/'original-product-output.txt'; sentinel.write_text('UNCHANGED PRODUCT ROOT')
        for kind, outcome in [('primary','failed'),('gap','mismatch')]:
            guest = DistinctGuest(self.root, state='ordinary', kind=kind, outcome=outcome)
            value = adapter(guest); value.uncovered()
            directory = self.root/'retry-host-proofs'/kind/'closure-1'
            record = json.loads((directory/'retry-host-preservation-1.json').read_text())
            self.assertEqual(record['kind'], kind)
            self.assertEqual(record['proofDirectory'], str(directory.relative_to(self.root)))
            self.assertEqual(value.output, self.root)
            self.assertFalse(record['productStatePassed']); self.assertFalse(record['originalUriRedelivered'])
            self.assertEqual(record['beforeRecords'], record['afterRecords'])
            for name in ['observed-expo-ordinary-menu-close-before','observed-expo-ordinary-menu-close-after']:
                for extension in ['.xml','-after.xml','.png']:
                    self.assertTrue((directory/(name+extension)).is_file())
            for name in ['before','before-tap','after','after-capture']:
                self.assertTrue((directory/('ordinary-menu-native-'+name+'-activities.txt')).is_file())
            self.assertEqual(sum(call[:3]==('shell','input','tap') for call in guest.calls), 1)
        self.assertEqual(sentinel.read_text(),'UNCHANGED PRODUCT ROOT')
        self.assertFalse((self.root/'retry-host-preservation-1.json').exists())

    def test_second_same_kind_close_preserves_every_first_proof_byte(self):
        guest = DistinctGuest(self.root, state='ordinary'); value = adapter(guest)
        value.uncovered(); first = self.root/'retry-host-proofs'/'primary'/'closure-1'; saved = bytes_at(first)
        guest.state = 'ordinary'; value.uncovered()
        second = self.root/'retry-host-proofs'/'primary'/'closure-2'
        self.assertEqual(bytes_at(first),saved)
        self.assertEqual(set(bytes_at(second)), set(saved)-{'retry-host-preservation-1.json'}|{'retry-host-preservation-2.json'})
        self.assertEqual(value.output,self.root); self.assertEqual(value.developer_sheet_dismissals,2)
        self.assertEqual(sum(call[:3]==('shell','input','tap') for call in guest.calls),2)
        guest.state='ordinary'
        with self.assertRaises(RuntimeError):value.uncovered()
        self.assertEqual(bytes_at(first),saved)
        self.assertEqual(sum(call[:3]==('shell','input','tap') for call in guest.calls),2)

    def test_intro_primary_and_gap_do_not_overwrite_each_other(self):
        snapshots = {}
        for kind,outcome in [('primary','failed'),('gap','mismatch')]:
            guest=DistinctGuest(self.root,state='intro',kind=kind,outcome=outcome);value=adapter(guest)
            value.uncovered(); directory=self.root/'retry-host-proofs'/kind/'closure-1'
            for phase in ['before','after']:
                for extension in ['.xml','-after.xml','.png']:
                    self.assertTrue((directory/('observed-expo-sdk54-intro-1-'+phase+extension)).is_file())
            self.assertEqual(value.output,self.root);self.assertEqual(value.developer_sheet_dismissals,2)
            self.assertEqual(sum(call[:3]==('shell','input','tap') for call in guest.calls),2)
            snapshots[kind]=bytes_at(directory)
        self.assertEqual(bytes_at(self.root/'retry-host-proofs'/'primary'/'closure-1'),snapshots['primary'])

    def test_failed_closure_restores_product_output_and_refuses_directory_reuse(self):
        guest=DistinctGuest(self.root,state='ordinary');value=adapter(guest)
        guest.closing_error=RuntimeError('PURE mocked closure failure')
        with self.assertRaisesRegex(RuntimeError,'mocked closure failure'):value.uncovered()
        self.assertEqual(value.output,self.root);self.assertFalse(value._settling)
        directory=self.root/'retry-host-proofs'/'primary'/'closure-1';saved=bytes_at(directory)
        guest.state='ordinary';guest.calls=[];guest.closing_error=None
        value.raw_dump=lambda: self.fail('Reused proof directory reached raw guest dump')
        with self.assertRaises(FileExistsError):value.uncovered()
        self.assertEqual(guest.calls,[]);self.assertEqual(bytes_at(directory),saved)
        self.assertEqual(value.output,self.root);self.assertFalse(value._settling)

    def test_fresh_same_kind_adapter_cannot_reuse_an_existing_proof_before_dump(self):
        guest=DistinctGuest(self.root,state='ordinary');adapter(guest).uncovered()
        directory=self.root/'retry-host-proofs'/'primary'/'closure-1';saved=bytes_at(directory)
        fresh=DistinctGuest(self.root,state='ordinary');value=adapter(fresh)
        value.raw_dump=lambda: self.fail('Fresh collector attempted raw dump before reuse refusal')
        with self.assertRaises(FileExistsError):value.uncovered()
        self.assertEqual(fresh.calls,[]);self.assertEqual(bytes_at(directory),saved)
        self.assertEqual(value.output,self.root)

    def test_expired_global_bound_creates_no_proof_directory_or_guest_command(self):
        guest=DistinctGuest(self.root,state='ordinary');value=adapter(guest);value.deadline=1
        with patch('retry_host_adapter.time.monotonic',return_value=2):
            with self.assertRaises(RetryBoundExpired):value.uncovered()
        self.assertEqual(guest.calls,[]);self.assertFalse((self.root/'retry-host-proofs').exists())
        self.assertEqual(value.output,self.root)

    def test_external_subprocess_boundary_remained_denied(self):
        self.assertEqual(UNMOCKED,[])

if __name__=='__main__':unittest.main()
