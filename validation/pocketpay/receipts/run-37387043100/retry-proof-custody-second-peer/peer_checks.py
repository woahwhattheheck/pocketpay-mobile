"""Independent pure checks of exact Retry proof custody; no native evidence."""
import ast
import copy
import hashlib
import json
from pathlib import Path
import re
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
SUBJECT = ROOT / 'pocketpay-retry-proof-custody-local-candidate-v2'
PARENT = ROOT / 'pocketpay-retry-deadline-local-candidate'
BASE = ROOT / 'pocketpay-remote-native-controller-intro-composed-proposal/validation/pocketpay'
import retry_host_adapter as module
from test_retry_host_adapter import GuestBoundary, host, strict_action, selectors
from expo_go_intro import intro_sheet


def functions(path, names):
    return ast.Module(body=[n for n in ast.parse(path.read_text()).body
        if isinstance(n, ast.FunctionDef) and n.name in names], type_ignores=[])


def files(root):
    return {str(p.relative_to(root)):p.read_bytes() for p in root.rglob('*') if p.is_file()}


class PeerChecks(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.clock = {'now': 0.0}
        timer = patch.object(module.time, 'monotonic', side_effect=lambda: self.clock['now'])
        timer.start(); self.addCleanup(timer.stop)

    def adapter(self, kind='primary', state='ordinary'):
        guest = GuestBoundary(self.root, state=state, kind=kind,
            outcome='failed' if kind=='primary' else 'mismatch')
        value = module.RetryHostAdapter({'ROOT':self.root,'dump':guest.dump,'adb':guest.adb},
            kind, host=host, intro_action=strict_action, intro_bounds=selectors.bounds)
        value.begin_case(guest.outcome)
        return guest, value

    def test_parent_packet_all_original_bytes_and_other_adapter_methods_unchanged(self):
        parent_bytes = (PARENT/'provenance.json').read_bytes()
        self.assertEqual(hashlib.sha256(parent_bytes).hexdigest(),
            '3dc14dca00d1d5f7575072a9b0f16ed426ac721a024c10a232e98eb607f2fb62')
        self.assertEqual((SUBJECT/'parent-3dc/provenance.json').read_bytes(), parent_bytes)
        manifest = json.loads(parent_bytes)
        for name, sha in manifest['filesSha256'].items():
            old = (PARENT/name).read_bytes()
            self.assertEqual(hashlib.sha256(old).hexdigest(),sha)
            self.assertEqual((SUBJECT/'parent-3dc'/name).read_bytes(),old)
        for name in ['retry-primary-ui.py','retry-gap-runner.py','expo_ordinary_menu.py',
                'expo_go_intro.py','native_overlay.py','observer_framing.py','test_retry_deadline.py']:
            self.assertEqual((SUBJECT/name).read_bytes(),(PARENT/name).read_bytes())
        for fixture in (PARENT/'fixtures').iterdir():
            self.assertEqual((SUBJECT/'fixtures'/fixture.name).read_bytes(),fixture.read_bytes())
        old = ast.parse((PARENT/'retry_host_adapter.py').read_text())
        new = ast.parse((SUBJECT/'retry_host_adapter.py').read_text())
        for tree in (old,new):
            cls = next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='RetryHostAdapter')
            cls.body = [n for n in cls.body if not isinstance(n,ast.FunctionDef) or n.name!='uncovered']
        self.assertEqual(ast.dump(old,include_attributes=False),ast.dump(new,include_attributes=False))

    def primary_capture(self,guest,value):
        def raw_dump(name=None):
            tree=guest.tree()
            if name:(self.root/(name+'.xml')).write_text(ET.tostring(tree,encoding='unicode'))
            return tree
        namespace={'ROOT':self.root,'dump':raw_dump,'adb':value.adb,'HOST':value,
            'intro_sheet':intro_sheet,'re':re}
        code=functions(SUBJECT/'retry-primary-ui.py',
            {'labels','contains','expo_sheet','native_error_overlay','screenshot','capture'})
        exec(compile(code,'actual-primary-capture','exec'),namespace)
        return namespace['capture']

    def test_actual_primary_product_capture_keeps_original_root_and_existing_bytes(self):
        original_names=['retry-primary-observations.json','current.xml',
            'observed-expo-ordinary-menu-close-before.png','retry-host-preservation-1.json']
        for name in original_names:(self.root/name).write_bytes(('ORIGINAL-'+name).encode())
        original={n:(self.root/n).read_bytes() for n in original_names}
        guest,value=self.adapter();deadline=value.deadline
        value.uncovered(('Sign & Send',),accept=True)
        proof=self.root/'retry-host-proofs/primary/closure-1';before=files(proof)
        self.primary_capture(guest,value)('peer-product-original-name')
        self.assertTrue((self.root/'peer-product-original-name.png').is_file())
        self.assertTrue((self.root/'peer-product-original-name.xml').is_file())
        self.assertFalse((proof/'peer-product-original-name.png').exists())
        self.assertEqual(files(proof),before)
        self.assertEqual({n:(self.root/n).read_bytes() for n in original_names},original)
        self.assertEqual(value.output,self.root);self.assertEqual(value.deadline,deadline)

    def test_actual_gap_product_capture_keeps_original_root_after_helper_settling(self):
        guest,value=self.adapter('gap');value.uncovered(('Sign & Send',),accept=True)
        proof=self.root/'retry-host-proofs/gap/closure-1';saved=files(proof)
        def raw_dump(name=None):
            tree=guest.tree()
            if name:(self.root/(name+'.xml')).write_text(ET.tostring(tree,encoding='unicode'))
            return tree
        ns={'ROOT':self.root,'dump':raw_dump,'adb':value.adb}
        exec(compile(functions(BASE/'retry/observation_helpers.py',
            {'labels','contains','developer_sheet','require_uncovered','capture'}),'actual-gap-capture','exec'),ns)
        runner={'host':value,'original_capture':ns['capture']}
        exec(compile(functions(SUBJECT/'retry-gap-runner.py',{'capture_after_host'}),
            'actual-gap-capture-wrapper','exec'),runner)
        self.assertIsNotNone(runner['capture_after_host']('peer-gap-original-name','Sign & Send'))
        self.assertTrue((self.root/'peer-gap-original-name.png').is_file())
        self.assertTrue((self.root/'peer-gap-original-name.xml').is_file())
        self.assertEqual(files(proof),saved);self.assertEqual(value.output,self.root)

    def test_cross_kind_intro_and_repeated_closures_retain_all_previous_bytes(self):
        primary,value=self.adapter();deadline=value.deadline
        value.uncovered();first=self.root/'retry-host-proofs/primary/closure-1';saved=files(first)
        primary.state='ordinary';value.uncovered()
        second=self.root/'retry-host-proofs/primary/closure-2';second_saved=files(second)
        gap,gap_value=self.adapter('gap','intro');gap_value.uncovered()
        intro=self.root/'retry-host-proofs/gap/closure-1'
        self.assertTrue((intro/'observed-expo-sdk54-intro-1-before.png').is_file())
        self.assertTrue((intro/'observed-expo-sdk54-intro-1-after.png').is_file())
        self.assertTrue((intro/'observed-expo-sdk54-intro-closures.json').is_file())
        self.assertEqual(files(first),saved);self.assertEqual(files(second),second_saved)
        self.assertEqual(value.developer_sheet_dismissals,2)
        self.assertEqual(gap_value.developer_sheet_dismissals,2)
        self.assertEqual(value.deadline,deadline)
        self.assertEqual(value.output,self.root);self.assertEqual(gap_value.output,self.root)

    def test_atomic_creation_race_restores_output_preserves_rival_and_sends_no_adb(self):
        guest,value=self.adapter();target=self.root/'retry-host-proofs/primary/closure-1'
        dump_calls=[];raw_dump=value.raw_dump
        value.raw_dump=lambda: dump_calls.append(1) or raw_dump()
        original_mkdir=Path.mkdir
        def race(path,*args,**kwargs):
            if path==target:
                original_mkdir(path,parents=True,exist_ok=False)
                (path/'rival-proof.txt').write_bytes(b'EXCLUSIVE RIVAL PROOF')
            return original_mkdir(path,*args,**kwargs)
        with patch.object(Path,'mkdir',race):
            with self.assertRaises(FileExistsError):value.uncovered()
        self.assertEqual(dump_calls,[1]);self.assertEqual(guest.calls,[])
        self.assertEqual(files(target),{'rival-proof.txt':b'EXCLUSIVE RIVAL PROOF'})
        self.assertEqual(value.output,self.root);self.assertFalse(value._settling)
        value.raw_dump=lambda:self.fail('Reuse reached raw dump')
        with self.assertRaises(FileExistsError):value.uncovered()
        self.assertEqual(guest.calls,[])

    def test_partial_actual_capture_write_failure_restores_and_refuses_before_next_dump(self):
        guest,value=self.adapter();original=Path.write_bytes
        def fail_png(path,*args,**kwargs):
            if path.name=='observed-expo-ordinary-menu-close-before.png':
                raise PermissionError('PURE failed proof write')
            return original(path,*args,**kwargs)
        with patch.object(Path,'write_bytes',fail_png):
            with self.assertRaisesRegex(PermissionError,'failed proof write'):value.uncovered()
        proof=self.root/'retry-host-proofs/primary/closure-1';saved=files(proof)
        self.assertTrue(saved);self.assertEqual(value.output,self.root);self.assertFalse(value._settling)
        self.assertEqual(value.closures,0);self.assertEqual(value.developer_sheet_dismissals,0)
        self.assertFalse(any(call[:3]==('shell','input','tap') for call in guest.calls))
        guest.calls=[];value.raw_dump=lambda:self.fail('Partial directory reached raw dump')
        with self.assertRaises(FileExistsError):value.uncovered()
        self.assertEqual(guest.calls,[]);self.assertEqual(files(proof),saved)

    def test_failed_original_counter_guard_restores_without_reset_or_success_record(self):
        guest,value=self.adapter();original_rows=copy.deepcopy(guest.rows);deadline=value.deadline
        guest.after_close=lambda boundary: boundary.rows[-1]['counters'].__setitem__('broadcastAttempts',1)
        with self.assertRaisesRegex(RuntimeError,'safety counter'):value.uncovered(accept=True)
        proof=self.root/'retry-host-proofs/primary/closure-1';saved=files(proof)
        self.assertTrue(saved);self.assertNotIn('retry-host-preservation-1.json',saved)
        self.assertNotEqual(guest.rows,original_rows);self.assertFalse(value.stable)
        self.assertEqual(value.closures,0);self.assertEqual(value.developer_sheet_dismissals,1)
        self.assertEqual(value.deadline,deadline);self.assertEqual(value.output,self.root)
        self.assertFalse(value._settling)
        guest.calls=[];value.raw_dump=lambda:self.fail('Failed counter proof reached raw dump')
        with self.assertRaises(FileExistsError):value.uncovered()
        self.assertEqual(guest.calls,[]);self.assertEqual(files(proof),saved)

    def test_mid_capture_deadline_restores_product_root_without_late_png_or_target(self):
        guest,value=self.adapter();raw=value.raw_adb
        def expire_png(*args,**kwargs):
            result=raw(*args,**kwargs)
            if args==('exec-out','screencap','-p'):self.clock['now']=600
            return result
        value.raw_adb=expire_png
        with self.assertRaises(module.RetryBoundExpired):value.uncovered(accept=True)
        proof=self.root/'retry-host-proofs/primary/closure-1'
        self.assertFalse(any(p.suffix=='.png' for p in proof.iterdir()))
        self.assertFalse(any(call[:3]==('shell','input','tap') for call in guest.calls))
        self.assertEqual(value.output,self.root);self.assertFalse(value._settling)
        self.assertFalse(value.stable);self.assertEqual(value.deadline,600)

