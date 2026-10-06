"""Pure mocked-boundary checks. No guest or native evidence is generated."""
import ast
import copy
import json
from pathlib import Path
import re
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET

HERE = Path(__file__).resolve().parent
BASE = HERE.parent / 'pocketpay-remote-native-controller-intro-composed-proposal' / 'validation/pocketpay'
sys.path.insert(0, str(BASE))
sys.path.insert(0, str(BASE/'camera'))
sys.path.insert(0, str(HERE))
import expo_ordinary_menu as host
from expo_go_module_intro import strict_action, selectors
from observer_framing import decode_observer_line
from retry_host_adapter import RetryHostAdapter, PREFIXES


def actual_records(kind, outcome):
    name = 'primary-logcat-original.txt' if kind == 'primary' else 'final-logcat-original.txt'
    return [row for line in (HERE/'fixtures'/name).read_text().splitlines()
            if (row := decode_observer_line(line, PREFIXES[kind])) is not None and row['outcome'] == outcome]


class GuestBoundary:
    """Only the ADB boundary is simulated; real host/parser code runs."""
    def __init__(self, output, state='review', kind='primary', outcome='failed'):
        self.output, self.state = Path(output), state
        self.kind, self.outcome = kind, outcome
        self.rows = actual_records(kind, outcome)
        assert self.rows
        self.calls = []
        self.pid = '4217'
        self.after_close = None
        self.closing_error = None

    def tree(self):
        name = {'intro':'retry-intro-original.xml', 'ordinary':'ordinary-menu-original.xml',
                'review':'review-original.xml'}[self.state]
        tree = ET.parse(HERE/'fixtures'/name).getroot()
        return tree

    def dump(self, name=None):
        return self.tree()

    def adb(self, *args, **kwargs):
        self.calls.append(args)
        if args == ('logcat', '-d', '-s', 'ReactNativeJS:I'):
            return '\n'.join(PREFIXES[self.kind]+' '+json.dumps(row) for row in self.rows)
        if args == ('shell', 'pidof', 'host.exp.exponent'):
            return self.pid
        if args == ('shell','dumpsys','activity','activities'):
            return 'mResumedActivity: ActivityRecord{abc123 u0 host.exp.exponent/.experience.ExperienceActivity t17}'
        if args == ('exec-out','screencap','-p'):
            # Pure transport fixture, retained only in TemporaryDirectory.
            return b'\x89PNG\r\n\x1a\nPURE-MOCK-BOUNDARY-NOT-NATIVE-EVIDENCE'
        if args[:3] == ('shell','input','tap'):
            self.state = 'ordinary' if self.state == 'intro' else 'review'
            if self.state == 'review' and self.after_close:
                self.after_close(self)
            if self.closing_error:
                raise self.closing_error
            return ''
        raise AssertionError('Unexpected guest command: '+repr(args))

    def adapter(self):
        value = RetryHostAdapter({'dump':self.dump, 'adb':self.adb, 'ROOT':self.output},
                                 self.kind, host=host, intro_action=strict_action,
                                 intro_bounds=selectors.bounds)
        value.begin_case(self.outcome)
        return value


class AdapterChecks(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.guest = GuestBoundary(self.tmp.name)
        self.adapter = self.guest.adapter()

    def test_late_intro_after_target_requires_new_uncovered_target_and_same_records(self):
        self.adapter.uncovered(('Sign & Send',), accept=True)
        self.guest.state = 'intro'
        after = self.adapter.before_capture()
        self.assertFalse(host.has_host_sheet(after))
        self.assertEqual(self.adapter.closures, 1)
        taps = [args for args in self.guest.calls if args[:3] == ('shell','input','tap')]
        self.assertEqual(len(taps), 2)  # Continue + exact host header, no product tap.
        proof = json.loads((Path(self.tmp.name)/'retry-host-preservation-1.json').read_text())
        self.assertEqual(proof['beforeRecords'], proof['afterRecords'])
        self.assertFalse(proof['originalUriRedelivered'])
        self.assertFalse(proof['productStatePassed'])

    def test_close_before_action_never_duplicates_product_action_or_resets(self):
        self.adapter.uncovered(('Sign & Send',), accept=True)
        self.guest.state = 'ordinary'
        names={'labels','contains','expo_sheet','native_error_overlay','exact_action','tap_node','tap'}
        module=ast.parse((HERE/'retry-primary-ui.py').read_text())
        code=ast.Module(body=[node for node in module.body
            if isinstance(node,ast.FunctionDef) and node.name in names],type_ignores=[])
        from expo_go_intro import intro_sheet
        namespace={'HOST':self.adapter,'dump':self.guest.dump,'adb':self.guest.adb,
                   'intro_sheet':intro_sheet,'re':re}
        exec(compile(code,'actual-primary-action-functions','exec'),namespace)
        namespace['tap']('Sign & Send',scroll=True)
        taps=[args for args in self.guest.calls if args[:3]==('shell','input','tap')]
        self.assertEqual(len(taps),2)  # Exactly one header Close, one target tap.
        self.assertNotEqual(taps[0],taps[1])
        self.assertEqual(self.adapter.expected, ())
        self.assertFalse(any('am' in args or '-c' in args for args in self.guest.calls))

    def test_ambiguous_ordinary_header_refuses_action(self):
        self.guest.state = 'ordinary'
        raw = self.guest.tree()
        close = host.ordinary_close(raw)
        parent = next(node for node in raw.iter() if close in list(node))
        parent.append(copy.deepcopy(close))
        self.guest.dump = lambda name=None: raw
        adapter = self.guest.adapter()
        with self.assertRaises(RuntimeError):
            adapter.uncovered()
        self.assertFalse(any(args[:3] == ('shell','input','tap') for args in self.guest.calls))

    def test_target_missing_after_closure_is_not_product_pass(self):
        self.guest.state = 'ordinary'
        self.adapter.expected = ('This target never appeared',)
        with self.assertRaisesRegex(RuntimeError, 'Fresh uncovered Retry target'):
            self.adapter.before_capture()

    def test_history_clear_even_identical_latest_state_is_rejected(self):
        self.guest.state = 'ordinary'
        self.guest.after_close = lambda g: setattr(g, 'rows', g.rows[-1:])
        with self.assertRaisesRegex(RuntimeError, 'history changed'):
            self.adapter.uncovered()

    def test_reseed_ready_event_even_identical_latest_state_is_rejected(self):
        self.guest.state = 'ordinary'
        def reset(g):
            ready = copy.deepcopy(g.rows[-1]); ready['event'] = 'primary-observer-ready'
            ready['unknownPresent'] = False; ready['transactionHash'] = None
            ready['submitCalls'] = ready['readCalls'] = 0
            ready['counters'] = {key:0 for key in ready['counters']}
            g.rows += [ready,copy.deepcopy(g.rows[-1])]
        self.guest.after_close = reset
        with self.assertRaisesRegex(RuntimeError, 'reinitialized'):
            self.adapter.uncovered()

    def test_counter_change_during_closure_fails_without_synthesizing_progress(self):
        self.guest.state = 'ordinary'
        def changed(g):
            row = copy.deepcopy(g.rows[-1]); row['readCalls'] += 1
            g.rows.append(row)
        self.guest.after_close = changed
        with self.assertRaisesRegex(RuntimeError, 'identity/counters changed'):
            self.adapter.uncovered()

    def test_intermediate_identity_change_restored_before_final_is_rejected(self):
        self.guest.state='ordinary'
        def changed(g):
            old=copy.deepcopy(g.rows[-1]); transient=copy.deepcopy(old)
            transient['unknownIdentity']=99
            g.rows.extend([transient,old])
        self.guest.after_close=changed
        with self.assertRaisesRegex(RuntimeError,'identity/counters changed'):
            self.adapter.uncovered()

    def test_identical_public_review_fields_do_not_prove_no_signer_reset(self):
        self.guest.state='ordinary'
        def reset(g):
            row=copy.deepcopy(g.rows[-1]); row['event']='real-signer-store-change'
            g.rows.extend([copy.deepcopy(row),row])
        self.guest.after_close=reset
        with self.assertRaisesRegex(RuntimeError,'reset cannot be excluded'):
            self.adapter.uncovered()

    def test_pid_replacement_refuses_target(self):
        self.guest.state = 'ordinary'
        self.guest.after_close = lambda g: setattr(g,'pid','4218')
        with self.assertRaisesRegex(RuntimeError, 'process changed'):
            self.adapter.uncovered()

    def test_stable_case_missing_records_is_not_initial_absence(self):
        self.adapter.uncovered(('Sign & Send',), accept=True)
        self.guest.rows=[]; self.guest.state='ordinary'
        with self.assertRaisesRegex(RuntimeError,'lost its actual observer'):
            self.adapter.uncovered()

    def test_gap_seed_identity_and_zero_operations_preserved(self):
        guest = GuestBoundary(self.tmp.name, state='ordinary', kind='gap', outcome='mismatch')
        adapter = guest.adapter()
        adapter.uncovered()
        proof=json.loads((Path(self.tmp.name)/'retry-host-preservation-1.json').read_text())
        self.assertEqual(proof['beforeRecords'],proof['afterRecords'])
        self.assertEqual(proof['afterRecords'][-1]['transactionHash'],'a'*64)
        self.assertEqual(proof['afterRecords'][-1]['counters']['readCalls'],0)

    def test_gap_identity_change_fails(self):
        guest = GuestBoundary(self.tmp.name, state='ordinary', kind='gap', outcome='mismatch')
        def changed(g):
            row=copy.deepcopy(g.rows[-1]); row['unknownIdentity'] += 1; g.rows.append(row)
        guest.after_close=changed
        with self.assertRaisesRegex(RuntimeError,'identity/counters changed'):
            guest.adapter().uncovered()

    def test_adapter_raw_dump_cannot_recurse_through_namespace_replacement(self):
        namespace={'dump':self.guest.dump,'adb':self.guest.adb,'ROOT':self.guest.output}
        adapter=RetryHostAdapter(namespace,'primary',host=host,intro_action=strict_action,intro_bounds=selectors.bounds)
        namespace['dump']=lambda: (_ for _ in ()).throw(AssertionError('recursive wrapped dump'))
        self.assertIsNotNone(adapter.dump()[0])

    def test_malformed_current_observer_is_not_absence(self):
        self.guest.state='ordinary'
        original=self.adapter.raw_adb
        self.adapter.raw_adb=lambda *args,**kwargs: PREFIXES['primary']+' {broken' if args[0]=='logcat' else original(*args,**kwargs)
        with self.assertRaisesRegex(RuntimeError,'Malformed'):
            self.adapter.uncovered()

    def _primary_capture_namespace(self, source):
        names={'labels','contains','expo_sheet','native_error_overlay','screenshot','capture'}
        module=ast.parse(source)
        code=ast.Module(body=[node for node in module.body
            if isinstance(node,ast.FunctionDef) and node.name in names],type_ignores=[])
        from expo_go_intro import intro_sheet
        namespace={'ROOT':Path(self.tmp.name),'dump':self.guest.dump,'adb':self.guest.adb,
                   'HOST':self.adapter,'intro_sheet':intro_sheet,'re':re}
        exec(compile(code,'actual-primary-capture-functions','exec'),namespace)
        return namespace

    def test_actual_primary_late_intro_old_capture_fails_new_settles(self):
        self.adapter.uncovered(('Sign & Send',),accept=True)
        self.guest.state='intro'
        old=self._primary_capture_namespace((BASE/'retry-primary-ui.py').read_text())
        with self.assertRaisesRegex(RuntimeError,'Observed Expo sheet'):
            old['capture']('old-covered-review')
        self.assertFalse((Path(self.tmp.name)/'old-covered-review.png').exists())
        new=self._primary_capture_namespace((HERE/'retry-primary-ui.py').read_text())
        tree=new['capture']('new-uncovered-review')
        self.assertTrue(new['contains'](tree,'Sign & Send'))
        self.assertFalse(host.has_host_sheet(tree))
        self.assertTrue((Path(self.tmp.name)/'new-uncovered-review.png').exists())
        self.assertEqual(self.adapter.closures,1)

    def test_actual_primary_overlay_during_png_still_excludes_target(self):
        self.adapter.uncovered(('Sign & Send',),accept=True)
        original=self.guest.adb
        def appears(*args,**kwargs):
            result=original(*args,**kwargs)
            if args==('exec-out','screencap','-p'):
                self.guest.state='intro'
            return result
        self.guest.adb=appears
        new=self._primary_capture_namespace((HERE/'retry-primary-ui.py').read_text())
        with self.assertRaisesRegex(RuntimeError,'appeared during capture'):
            new['capture']('excluded-late-png')
        self.assertFalse((Path(self.tmp.name)/'excluded-late-png.png').exists())
        self.assertEqual(self.adapter.closures,0)

    def test_actual_primary_partial_host_during_png_is_rejected(self):
        self.adapter.expected=()
        original=self.guest.adb
        partial=ET.parse(HERE/'fixtures/ordinary-menu-original.xml').getroot()
        for node in partial.iter('node'):
            if node.get('text')=='Connected to expo-cli': node.set('text','')
        after=[False]
        def appears(*args,**kwargs):
            result=original(*args,**kwargs)
            if args==('exec-out','screencap','-p'): after[0]=True
            return result
        self.guest.adb=appears
        raw=self.guest.dump
        self.guest.dump=lambda name=None: partial if after[0] else raw(name)
        new=self._primary_capture_namespace((HERE/'retry-primary-ui.py').read_text())
        with self.assertRaisesRegex(RuntimeError,'appeared during capture'):
            new['capture']('excluded-partial-host')
        self.assertFalse((Path(self.tmp.name)/'excluded-partial-host.png').exists())

    def test_gap_post_png_guard_includes_partial_actual_host_sheet(self):
        partial=ET.parse(HERE/'fixtures/ordinary-menu-original.xml').getroot()
        for node in partial.iter('node'):
            if node.get('text')=='Connected to expo-cli': node.set('text','')
        module=ast.parse((HERE/'retry-gap-runner.py').read_text())
        code=ast.Module(body=[node for node in module.body
                             if isinstance(node,ast.FunctionDef) and node.name=='known_sheet'],type_ignores=[])
        from expo_go_intro import intro_sheet
        namespace={'host':self.adapter,'intro_sheet':intro_sheet,'original_sheet':lambda tree:False}
        exec(compile(code,'actual-gap-sheet-guard','exec'),namespace)
        self.assertTrue(namespace['known_sheet'](partial))

    def test_gap_required_capture_cannot_silently_return_missing_target(self):
        module=ast.parse((HERE/'retry-gap-runner.py').read_text())
        code=ast.Module(body=[node for node in module.body
                             if isinstance(node,ast.FunctionDef) and node.name=='capture_after_host'],type_ignores=[])
        self.adapter.expected=('Sign & Send',)
        namespace={'host':self.adapter,'original_capture':lambda *args,**kwargs:None}
        exec(compile(code,'actual-gap-capture-wrapper','exec'),namespace)
        with self.assertRaisesRegex(RuntimeError,'lost the expected'):
            namespace['capture_after_host']('no-silent-native-pass')

    def test_existing_outcome_and_counter_validators_remain_exact(self):
        for filename,names in [('retry-primary-ui.py',('primary_snapshot','retry_outcome')),
                               ('retry-gap-runner.py',('decoded_native_records',))]:
            old=ast.parse((BASE/filename).read_text()); new=ast.parse((HERE/filename).read_text())
            for name in names:
                before=next(n for n in old.body if isinstance(n,ast.FunctionDef) and n.name==name)
                after=next(n for n in new.body if isinstance(n,ast.FunctionDef) and n.name==name)
                if name=='retry_outcome':
                    after=copy.deepcopy(after); self.assertEqual(ast.unparse(after.body.pop(0)),'HOST.begin_case(outcome)')
                self.assertEqual(ast.dump(before,include_attributes=False),ast.dump(after,include_attributes=False))


if __name__=='__main__': unittest.main()
