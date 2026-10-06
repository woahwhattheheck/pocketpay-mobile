"""Source-derived controller composition checks; zero ADB/device execution."""
import ast
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
import xml.etree.ElementTree as ET
import sys
import tempfile
import subprocess

from expo_go_intro import intro_sheet

HERE = Path(__file__).resolve().parent


def definitions(file, names, namespace):
    nodes = ast.parse((HERE / file).read_text()).body
    selected = [n for n in nodes if isinstance(n, ast.FunctionDef) and n.name in names]
    assert {n.name for n in selected} == set(names)
    exec(compile(ast.Module(body=selected, type_ignores=[]), file, 'exec'), namespace)


class Composition(unittest.TestCase):
    def setUp(self):
        self.observed = ET.parse(HERE / 'receipts/run-37379451997/camera/observed-sdk54-intro.xml').getroot()

    def test_primary_actual_tutorial_blocks_covered_product_action(self):
        ns = {'intro_sheet':intro_sheet, 're':__import__('re')}
        definitions('retry-primary-ui.py', ['labels','contains','expo_sheet','native_error_overlay','exact_action'], ns)
        self.assertTrue(ns['expo_sheet'](self.observed))
        with self.assertRaises(RuntimeError):
            ns['exact_action'](self.observed, 'Continue')

    def test_primary_intro_precedes_underlying_target(self):
        state = {'dismissed':False, 'calls':0}
        target = ET.fromstring('<hierarchy><node text="SYNTHETIC_TARGET"/></hierarchy>')
        def dismiss(tree):
            self.assertTrue(intro_sheet(tree));state['dismissed']=True;state['calls']+=1
        ns = {'intro_sheet':intro_sheet, 'time':SimpleNamespace(monotonic=lambda:0),
              'EXPO_DISMISSALS':0,'INTRO':SimpleNamespace(dismiss=dismiss),
              'dump':lambda:target if state['dismissed'] else self.observed,
              'native_error_overlay':lambda tree:False,'subprocess':__import__('subprocess'),'ET':ET}
        definitions('retry-primary-ui.py', ['labels','contains','wait'], ns)
        # An underlying Welcome label is present in the real obstructed XML.
        # It must never return before the specific host tutorial is handled.
        original_contains = ns['contains']
        ns['contains'] = lambda tree,label: original_contains(tree,label) or (tree is target and label == 'Welcome to PocketPay')
        result = ns['wait']('Welcome to PocketPay')
        self.assertIs(result,target);self.assertEqual(state['calls'],1)

    def test_gap_intro_precedes_underlying_target(self):
        state={'dismissed':False,'calls':0}
        target=ET.fromstring('<hierarchy><node text="SYNTHETIC_TARGET"/></hierarchy>')
        def dismiss(tree):
            self.assertTrue(intro_sheet(tree));state['dismissed']=True;state['calls']+=1
        helpers=SimpleNamespace(dump=lambda:target if state['dismissed'] else self.observed)
        ns={'helpers':helpers,'time':SimpleNamespace(monotonic=lambda:0),
            'intro_sheet':intro_sheet,'intro':SimpleNamespace(dismiss=dismiss),
            'assert_no_native_error_overlay':lambda tree:None,'original_sheet':lambda tree:False,
            'guarded_contains':lambda tree,label:True}
        definitions('retry-gap-runner.py',['wait_with_observed_intro'],ns)
        result=ns['wait_with_observed_intro']('SYNTHETIC_UNDERLYING_TARGET')
        self.assertIs(result,target);self.assertEqual(state['calls'],1)

    def test_gap_expanded_sheet_predicate_recognizes_actual_intro(self):
        ns={'intro_sheet':intro_sheet,'original_sheet':lambda tree:False}
        definitions('retry-gap-runner.py',['known_sheet'],ns)
        self.assertTrue(ns['known_sheet'](self.observed))

    def test_primary_only_exact_reviewed_decoder_block_changed(self):
        sys.path.insert(0,str(HERE/'observer-decoder'))
        from test_caller_validations import FramingOnly
        frozen=json.loads((HERE/'observer-decoder/immutable-callers.json').read_text())
        original=ast.parse(frozen['functions']['primary_snapshot']['source']).body[0]
        expected=FramingOnly().visit(original)
        actual=next(n for n in ast.parse((HERE/'retry-primary-ui.py').read_text()).body
                    if isinstance(n,ast.FunctionDef) and n.name=='primary_snapshot')
        self.assertEqual(ast.dump(actual,include_attributes=False),ast.dump(expected,include_attributes=False))

    def test_gap_only_exact_reviewed_decoder_block_changed(self):
        sys.path.insert(0,str(HERE/'observer-decoder'))
        from test_caller_validations import FramingOnly
        frozen=json.loads((HERE/'observer-decoder/immutable-callers.json').read_text())
        original=ast.parse(frozen['functions']['native_records']['source']).body[0]
        expected=FramingOnly().visit(original)
        expected.name='decoded_native_records'
        class BoundTransport(ast.NodeTransformer):
            def visit_Call(self,node):
                if isinstance(node.func,ast.Name) and node.func.id=='adb':
                    node.func=ast.Attribute(value=ast.Name(id='helpers',ctx=ast.Load()),attr='adb',ctx=ast.Load())
                return self.generic_visit(node)
        expected=BoundTransport().visit(expected)
        actual=next(n for n in ast.parse((HERE/'retry-gap-runner.py').read_text()).body
                    if isinstance(n,ast.FunctionDef) and n.name=='decoded_native_records')
        self.assertEqual(ast.dump(actual,include_attributes=False),ast.dump(expected,include_attributes=False))

    def test_primary_cannot_swallow_recognized_intro_transport_or_xml_failure(self):
        from expo_go_module_intro import ModuleIntro
        for error in (subprocess.CalledProcessError(1,['SYNTHETIC_NO_DEVICE']),ET.ParseError('SYNTHETIC_PARSE_FAILURE')):
            with self.subTest(error=type(error).__name__), tempfile.TemporaryDirectory(prefix='pp-pure-intro-') as name:
                def failing_boundary(*args,**kwargs):
                    raise error
                adapter=ModuleIntro({'ROOT':Path(name),'dump':lambda:self.observed,'adb':failing_boundary})
                if isinstance(error,ET.ParseError):
                    adapter.namespace['dump']=failing_boundary
                ns={'intro_sheet':intro_sheet,'time':SimpleNamespace(monotonic=lambda:0),
                    'EXPO_DISMISSALS':0,'INTRO':adapter,'dump':lambda:self.observed,
                    'native_error_overlay':lambda tree:False,'subprocess':subprocess,'ET':ET}
                definitions('retry-primary-ui.py',['labels','contains','wait'],ns)
                with self.assertRaisesRegex(RuntimeError,'Recognized Expo tutorial') as caught:
                    ns['wait']('Welcome to PocketPay')
                self.assertIs(caught.exception.__cause__,error)


if __name__ == '__main__':
    unittest.main()
