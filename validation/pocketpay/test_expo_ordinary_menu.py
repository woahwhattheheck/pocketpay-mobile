"""Original XML parser + explicitly synthetic protocol checks; no ADB/subprocess."""
import copy
from pathlib import Path
import tempfile
import time
import unittest
import xml.etree.ElementTree as ET

import expo_ordinary_menu as guard

HERE = Path(__file__).resolve().parent
ACTIVITY = 'mResumedActivity: ActivityRecord{abcdef u0 host.exp.exponent/.experience.ExperienceActivity t11}'


def observed():
    return ET.parse(HERE/'observed/ordinary-menu.xml').getroot()


def synthetic_welcome():
    return ET.fromstring('<hierarchy><node package="host.exp.exponent" class="android.widget.TextView" '
                         'text="Welcome to PocketPay" enabled="true" bounds="[32,300][688,352]"/></hierarchy>')


def synthetic_camera_prompt():
    return ET.fromstring('<hierarchy><node package="com.android.permissioncontroller" '
        'resource-id="com.android.permissioncontroller:id/permission_message" '
        'text="Allow Expo Go to take pictures and record video?"/>'
        '<node package="com.android.permissioncontroller" class="android.widget.Button" '
        'resource-id="com.android.permissioncontroller:id/permission_deny_button" '
        'text="Don’t allow" enabled="true" clickable="true" bounds="[120,700][600,780]"/></hierarchy>')


PERMISSION_ACTIVITY = ('mResumedActivity: ActivityRecord{123456 u0 com.android.permissioncontroller/'
    'com.android.permissioncontroller.permission.ui.GrantPermissionsActivity t11}\n'
    'Hist #1: ActivityRecord{abcdef u0 host.exp.exponent/.experience.ExperienceActivity t11}')


class SyntheticController:
    def __init__(self, output):
        self.output = output
        self.tree = observed()
        self.next_tree = synthetic_welcome()
        self.deadline = time.monotonic()+600
        self.developer_sheet_dismissals = 1
        self.foreground = ACTIVITY
        self.after_foreground = ACTIVITY
        self.after_launch_foreground = ACTIVITY
        self.after_launch_tree = None
        self.calls = []
        self.original_camera_uri = 'exp://127.0.0.1:8081/--/send/__camera-native-fixture?screen=scan'
        self.launch_result = 'Status: ok\nLaunchState: HOT\n'
        self.capture_ok = True

    def dump(self):
        return self.tree, ET.tostring(self.tree, encoding='unicode')

    def capture(self, name, *args, **kwargs):
        if not self.capture_ok:
            return False
        xml = ET.tostring(self.tree, encoding='unicode')
        for suffix in ('.xml', '-after.xml'):
            (self.output/(name+suffix)).write_text(xml)
        # This temporary protocol fixture is explicitly not native media.
        (self.output/(name+'.png')).write_bytes(b'SYNTHETIC_NOT_NATIVE_PNG')
        return True

    def adb(self, *args):
        if time.monotonic() >= self.deadline:
            raise RuntimeError('Synthetic deadline exhausted; no guest commands')
        self.calls.append(args)
        if args == ('shell','dumpsys','activity','activities'):
            return self.foreground
        if args[:3] == ('shell','input','tap'):
            self.tree = self.next_tree
            self.foreground = self.after_foreground
            return ''
        if args[:3] == ('shell','am','start'):
            self.foreground = self.after_launch_foreground
            if self.after_launch_tree is not None:
                self.tree = self.after_launch_tree
            return self.launch_result
        raise AssertionError('Unknown synthetic command; real device is prohibited')


class GuardChecks(unittest.TestCase):
    def test_original_unique_source_bound_header(self):
        node = guard.ordinary_close(observed())
        self.assertEqual(guard.visible_bounds(node),(648,416,688,456))
        self.assertEqual(node.get('class'),'android.view.ViewGroup')

    def test_each_exact_marker_required(self):
        for marker in guard.MARKERS:
            tree = observed()
            for node in tree.iter('node'):
                if node.get('text') == marker:
                    node.set('text','SYNTHETIC_UNKNOWN')
            with self.subTest(marker=marker), self.assertRaises(RuntimeError):
                guard.ordinary_close(tree)

    def test_disabled_button_or_ancestor_blocks(self):
        for parent in (False,True):
            tree = observed()
            node = guard.ordinary_close(tree)
            if parent:
                node = tree[0]
            node.set('enabled','false')
            with self.subTest(parent=parent),self.assertRaises(RuntimeError):
                guard.ordinary_close(tree)

    def test_duplicate_clickable_header_blocks(self):
        tree = observed()
        tree.append(copy.deepcopy(guard.ordinary_close(tree)))
        with self.assertRaises(RuntimeError): guard.ordinary_close(tree)

    def test_extra_host_sheet_blocks(self):
        tree = observed()
        ET.SubElement(tree,'node',{'package':guard.PACKAGE,'content-desc':'Bottom Sheet',
                                 'class':'android.widget.SeekBar','bounds':'[0,384][720,1280]'})
        with self.assertRaises(RuntimeError): guard.ordinary_close(tree)

    def test_other_package_or_outside_header_or_offscreen_blocks(self):
        for key,value in [('package','SYNTHETIC_OTHER_APP'),('bounds','[0,0][40,40]'),
                          ('bounds','[648,1248][688,1288]')]:
            tree = observed()
            guard.ordinary_close(tree).set(key,value)
            with self.subTest(key=key,value=value),self.assertRaises(RuntimeError):
                guard.ordinary_close(tree)

    def test_permission_error_and_secret_overlays_block(self):
        for attrs in [{'package':'com.android.permissioncontroller','text':'Allow'},
                      {'package':guard.PACKAGE,'text':'Render Error'},
                      {'package':guard.PACKAGE,'text':'S'+'A'*55}]:
            tree = observed()
            ET.SubElement(tree,'node',attrs)
            with self.subTest(attrs=attrs),self.assertRaises(RuntimeError): guard.ordinary_close(tree)

    def test_welcome_behind_sheet_never_qualifies(self):
        with self.assertRaises(RuntimeError): guard.unobscured_welcome(observed())

    def test_unique_native_foreground_identity(self):
        self.assertEqual(guard.foreground_identity(ACTIVITY),('abcdef',11))
        for value in ['',ACTIVITY.replace('ExperienceActivity','LauncherActivity'),
                      ACTIVITY+'\n'+ACTIVITY.replace('abcdef','999999')]:
            with self.subTest(value=value),self.assertRaises(RuntimeError): guard.foreground_identity(value)

    def test_synthetic_closure_and_once_only_hot_delivery_never_assert_product_pass(self):
        with tempfile.TemporaryDirectory(prefix='pp-synthetic-close-') as tmp:
            controller=SyntheticController(Path(tmp))
            proof=guard.close_ordinary_menu(controller)
            self.assertTrue(proof['welcomeObserved'])
            self.assertFalse(proof['productStatePassed'])
            result=guard.redeliver_original_uri_once(controller,controller.original_camera_uri)
            self.assertFalse(result['productStatePassed'])
            with self.assertRaises(RuntimeError):
                guard.redeliver_original_uri_once(controller,controller.original_camera_uri)
            self.assertEqual(sum(call[:3]==('shell','am','start') for call in controller.calls),1)
            self.assertEqual(sum(call[:3]==('shell','input','tap') for call in controller.calls),1)

    def test_back_like_background_blocks_navigation(self):
        with tempfile.TemporaryDirectory(prefix='pp-synthetic-background-') as tmp:
            controller=SyntheticController(Path(tmp))
            controller.after_foreground=ACTIVITY.replace('host.exp.exponent/.experience.ExperienceActivity',
                                                       'com.google.android.apps.nexuslauncher/.NexusLauncherActivity')
            with self.assertRaises(RuntimeError): guard.close_ordinary_menu(controller)
            self.assertFalse(any(call[:3]==('shell','am','start') for call in controller.calls))

    def test_maximum_two_dismissals_and_missing_media_block_before_tap(self):
        for maximum in (True,False):
            with tempfile.TemporaryDirectory(prefix='pp-synthetic-before-') as tmp:
                controller=SyntheticController(Path(tmp))
                if maximum: controller.developer_sheet_dismissals=2
                else: controller.capture_ok=False
                with self.assertRaises(RuntimeError): guard.close_ordinary_menu(controller)
                self.assertFalse(any(call[:3]==('shell','input','tap') for call in controller.calls))

    def test_cold_failed_and_ambiguous_launch_results_fail_once_only(self):
        for result in ['Status: ok\nLaunchState: COLD\n','Status: error\nLaunchState: HOT\n',
                       'Status: ok\nLaunchState: HOT\nLaunchState: HOT\n']:
            with tempfile.TemporaryDirectory(prefix='pp-synthetic-launch-') as tmp:
                controller=SyntheticController(Path(tmp))
                guard.close_ordinary_menu(controller)
                controller.launch_result=result
                with self.assertRaises(RuntimeError):
                    guard.redeliver_original_uri_once(controller,controller.original_camera_uri)
                self.assertTrue(controller.original_uri_redelivery_attempted)
                self.assertFalse((Path(tmp)/'observed-exact-original-uri-redelivery.json').exists())

    def test_changed_task_before_replay_blocks(self):
        with tempfile.TemporaryDirectory(prefix='pp-synthetic-task-') as tmp:
            controller=SyntheticController(Path(tmp))
            guard.close_ordinary_menu(controller)
            controller.foreground=ACTIVITY.replace('t11','t12')
            with self.assertRaises(RuntimeError): guard.redeliver_original_uri_once(controller,controller.original_camera_uri)
            self.assertFalse(any(call[:3]==('shell','am','start') for call in controller.calls))

    def test_hot_result_with_replaced_activity_record_still_fails(self):
        with tempfile.TemporaryDirectory(prefix='pp-synthetic-hot-replace-') as tmp:
            controller=SyntheticController(Path(tmp))
            guard.close_ordinary_menu(controller)
            controller.after_launch_foreground=ACTIVITY.replace('abcdef','111111')
            with self.assertRaises(RuntimeError): guard.redeliver_original_uri_once(controller,controller.original_camera_uri)
            self.assertTrue(controller.original_uri_redelivery_attempted)
            self.assertFalse((Path(tmp)/'observed-exact-original-uri-redelivery.json').exists())

    def test_non_welcome_host_closure_does_not_authorize_uri(self):
        with tempfile.TemporaryDirectory(prefix='pp-synthetic-nonwelcome-') as tmp:
            controller=SyntheticController(Path(tmp))
            controller.next_tree=synthetic_welcome()
            controller.next_tree[0].set('text','SYNTHETIC_PRODUCT_STATE')
            proof=guard.close_ordinary_menu(controller)
            self.assertFalse(proof['welcomeObserved'])
            self.assertFalse(proof['productStatePassed'])
            with self.assertRaises(RuntimeError): guard.redeliver_original_uri_once(controller,controller.original_camera_uri)
            self.assertFalse(any(call[:3]==('shell','am','start') for call in controller.calls))

    def test_expired_global_deadline_blocks_before_host_action(self):
        with tempfile.TemporaryDirectory(prefix='pp-synthetic-expired-') as tmp:
            controller=SyntheticController(Path(tmp))
            controller.deadline=time.monotonic()-1
            with self.assertRaises(RuntimeError): guard.close_ordinary_menu(controller)
            self.assertFalse(controller.calls)

    def test_actual_scoped_camera_dialog_contract_allows_go_pause_without_permission_action(self):
        with tempfile.TemporaryDirectory(prefix='pp-synthetic-camera-dialog-') as tmp:
            controller=SyntheticController(Path(tmp))
            guard.close_ordinary_menu(controller)
            controller.after_launch_foreground=PERMISSION_ACTIVITY
            controller.after_launch_tree=synthetic_camera_prompt()
            result=guard.redeliver_original_uri_once(controller,controller.original_camera_uri)
            self.assertEqual(result['postDeliveryNativeState'],'recognized_camera_dialog_same_task_go_retained')
            self.assertFalse(result['productStatePassed'])
            self.assertEqual(sum(call[:3]==('shell','input','tap') for call in controller.calls),1)
            self.assertEqual((Path(tmp)/'original-camera-uri.txt').read_text(),controller.original_camera_uri+'\n')
            self.assertEqual((Path(tmp)/'original-uri-am-result.txt').read_text(),controller.launch_result)
            self.assertEqual((Path(tmp)/'original-uri-native-before-activities.txt').read_text(),ACTIVITY)
            self.assertEqual((Path(tmp)/'original-uri-native-after-activities.txt').read_text(),PERMISSION_ACTIVITY)

    def test_unrecognized_permission_wrong_task_or_new_go_record_blocks(self):
        for mode in ('microphone','wrong-task','new-go-record','missing-go','wrong-component'):
            with tempfile.TemporaryDirectory(prefix='pp-synthetic-permission-invalid-') as tmp:
                controller=SyntheticController(Path(tmp))
                guard.close_ordinary_menu(controller)
                controller.after_launch_foreground=PERMISSION_ACTIVITY
                controller.after_launch_tree=synthetic_camera_prompt()
                if mode=='microphone': controller.after_launch_tree[0].set('text','Allow Expo Go to record audio?')
                if mode=='wrong-task': controller.after_launch_foreground=PERMISSION_ACTIVITY.replace('GrantPermissionsActivity t11','GrantPermissionsActivity t12')
                if mode=='new-go-record': controller.after_launch_foreground=PERMISSION_ACTIVITY+'\nHist #2: ActivityRecord{999999 u0 host.exp.exponent/.experience.ExperienceActivity t11}'
                if mode=='missing-go': controller.after_launch_foreground=PERMISSION_ACTIVITY.split('\n')[0]
                if mode=='wrong-component': controller.after_launch_foreground=PERMISSION_ACTIVITY.replace('GrantPermissionsActivity','SYNTHETIC_UNRECOGNIZED_ACTIVITY')
                with self.subTest(mode=mode),self.assertRaises(RuntimeError):
                    guard.redeliver_original_uri_once(controller,controller.original_camera_uri)
                self.assertFalse((Path(tmp)/'observed-exact-original-uri-redelivery.json').exists())

    def test_changed_uri_or_no_closure_blocks(self):
        with tempfile.TemporaryDirectory(prefix='pp-synthetic-uri-') as tmp:
            controller=SyntheticController(Path(tmp))
            with self.assertRaises(RuntimeError): guard.redeliver_original_uri_once(controller,controller.original_camera_uri)
            guard.close_ordinary_menu(controller)
            with self.assertRaises(RuntimeError): guard.redeliver_original_uri_once(controller,controller.original_camera_uri+'&extra=true')
            self.assertFalse(any(call[:3]==('shell','am','start') for call in controller.calls))


if __name__=='__main__':
    unittest.main()
