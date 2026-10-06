"""Original XML differential and synthetic scrolling protocol checks; zero ADB."""
import ast
import copy
from pathlib import Path
import re
import unittest
import xml.etree.ElementTree as ET

from baseline_vault_form import observe_vault_form

HERE = Path(__file__).resolve().parent
MEDIA = HERE / 'observed'


def original_action():
    source = ast.parse((HERE / 'original-ui_baseline.py').read_text())
    node = next(n for n in source.body if isinstance(n, ast.FunctionDef) and n.name == 'find_action')
    space = {'re': re, 'expo_sheet': lambda _: False, 'fixture_startup_error': lambda _: False,
             'native_error': lambda _: False}
    exec(compile(ast.Module(body=[node], type_ignores=[]), '<original-selector>', 'exec'), space)
    return space['find_action']


def observed_vault():
    return ET.parse(MEDIA/'failure-vault-native-confirmation-receipt.xml').getroot()


def synthetic_form():
    tree = observed_vault()
    scroll = next(n for n in tree.iter('node') if n.get('class') == 'android.widget.ScrollView')
    ET.SubElement(scroll, 'node', {'package':'host.exp.exponent', 'class':'android.widget.EditText',
        'enabled':'true', 'bounds':'[32,500][688,580]'})
    ET.SubElement(scroll, 'node', {'package':'host.exp.exponent', 'class':'android.widget.Button',
        'enabled':'true', 'clickable':'true', 'text':'Set Aside for 30 Days', 'bounds':'[32,900][688,980]'})
    return tree


class Targets(unittest.TestCase):
    def test_original_cleared_search_is_ambiguous_filtered_saved_contact_is_unique(self):
        find = original_action()
        cleared = ET.parse(MEDIA/'failure-picker-search-optional-edit.xml').getroot()
        filtered = ET.parse(MEDIA/'baseline-picker-name-search.xml').getroot()
        with self.assertRaisesRegex(RuntimeError, 'Ambiguous'): find(cleared, 'DUMMY Alice')
        self.assertIsNotNone(find(filtered, 'DUMMY Alice'))

    def test_original_vault_has_no_visible_lock_or_input(self):
        tree = observed_vault()
        self.assertIsNone(original_action()(tree, 'Set Aside for 30 Days'))
        self.assertFalse(any(n.get('class')=='android.widget.EditText' for n in tree.iter('node')))

    def run_protocol(self, trees):
        calls = []
        iterator = iter(trees)
        last = trees[-1]
        def dump(_):
            nonlocal last
            last = next(iterator, last)
            return last
        def adb(*args):
            self.assertEqual(args[:3], ('shell','input','swipe'))
            calls.append(args)
        return {'dump':dump,'adb':adb,'find_action':original_action()}, calls

    def test_bounded_scroll_requires_fresh_form_and_does_not_tap_or_input(self):
        form = synthetic_form()
        space, calls = self.run_protocol([observed_vault(), form])
        self.assertIs(observe_vault_form(space), form)
        self.assertEqual(len(calls), 1)

    def test_missing_form_fails_after_four_observed_swipes(self):
        space, calls = self.run_protocol([observed_vault()])
        with self.assertRaisesRegex(RuntimeError, 'four swipes'): observe_vault_form(space)
        self.assertEqual(len(calls), 4)

    def test_ambiguous_scroll_refuses_before_swipe(self):
        tree=observed_vault()
        scroll=next(n for n in tree.iter('node') if n.get('class')=='android.widget.ScrollView')
        tree.append(copy.deepcopy(scroll))
        space,calls=self.run_protocol([tree])
        with self.assertRaisesRegex(RuntimeError,'Unique'): observe_vault_form(space)
        self.assertEqual(calls,[])

    def test_ambiguous_fields_refuse_before_input_or_action(self):
        tree=synthetic_form()
        field=next(n for n in tree.iter('node') if n.get('class')=='android.widget.EditText')
        tree.append(copy.deepcopy(field))
        space,calls=self.run_protocol([tree])
        with self.assertRaisesRegex(RuntimeError,'Ambiguous'): observe_vault_form(space)
        self.assertEqual(calls,[])

    def test_runtime_or_host_guard_failure_propagates_without_scroll(self):
        space,calls=self.run_protocol([observed_vault()])
        def fail(_): raise RuntimeError('actual host/secret/startup guard')
        space['dump']=fail
        with self.assertRaisesRegex(RuntimeError,'guard'): observe_vault_form(space)
        self.assertEqual(calls,[])

    def test_only_two_case_functions_change(self):
        original=ast.parse((HERE/'original-ui_baseline.py').read_text())
        patched=ast.parse((HERE/'ui_baseline.py').read_text())
        def functions(tree):
            return {n.name:ast.dump(n,include_attributes=False) for n in tree.body if isinstance(n,ast.FunctionDef)}
        old,new=functions(original),functions(patched)
        self.assertEqual(set(old),set(new))
        self.assertEqual([n for n in old if old[n]!=new[n]], ['picker_search_optional_edit','vault_real_confirmation'])


if __name__ == '__main__': unittest.main()
