"""Actual camera adapter + retained host XML, synthetic transport; no real ADB.

All media bytes below are explicitly non-rendered temporary protocol fixtures.
These tests cannot establish native camera, permission, loading or Send passes.
"""
import importlib.util
import hashlib
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('camera_host_settle_runner', HERE/'camera-recording-runner.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
ACTIVITY = 'mResumedActivity: ActivityRecord{abcdef u0 host.exp.exponent/.experience.ExperienceActivity t11}'
PERMISSION_ACTIVITY = ('mResumedActivity: ActivityRecord{123456 u0 com.android.permissioncontroller/'
    'com.android.permissioncontroller.permission.ui.GrantPermissionsActivity t11}\n'
    'Hist #1: ActivityRecord{abcdef u0 host.exp.exponent/.experience.ExperienceActivity t11}')


def state_xml(state, disabled=False):
    if state == 'menu':
        return (HERE/'observed/ordinary-menu.xml').read_text()
    if state == 'intro':
        return (HERE/'receipts/run-37379451997/camera/observed-sdk54-intro.xml').read_text()
    if state == 'launcher':
        return '<hierarchy><node package="com.google.android.apps.nexuslauncher" text="Home"/></hierarchy>'
    if state == 'welcome':
        return '<hierarchy><node package="host.exp.exponent" class="android.widget.TextView" text="Welcome to PocketPay" enabled="true" bounds="[32,300][688,352]"/></hierarchy>'
    if state == 'permission':
        return ('<hierarchy><node package="com.android.permissioncontroller" '
            'resource-id="com.android.permissioncontroller:id/permission_message" '
            'text="Allow Expo Go to take pictures and record video?"/>'
            '<node package="com.android.permissioncontroller" class="android.widget.Button" '
            'resource-id="com.android.permissioncontroller:id/permission_deny_button" '
            'text="Don’t allow" enabled="true" clickable="true" bounds="[120,700][600,780]"/></hierarchy>')
    title = 'Checking camera permission…' if state == 'loading' else 'Camera Permission Required'
    enabled = 'false' if disabled else 'true'
    return ('<hierarchy><node package="host.exp.exponent" class="android.widget.TextView" '
        'text="'+title+'" enabled="true" bounds="[32,300][688,352]"/>'
        '<node package="host.exp.exponent" class="android.widget.Button" '
        'text="Request camera permission" enabled="'+enabled+'" clickable="true" bounds="[120,700][600,780]"/>'
        '<node package="host.exp.exponent" class="android.widget.Button" '
        'text="Enter recipient address manually" enabled="true" clickable="true" bounds="[120,800][600,880]"/></hierarchy>')


class SyntheticDeviceController(runner.RecordingController):
    def __init__(self, output, state='target'):
        # Deliberately bypass all real checkout/guest/source initialization.
        self.serial='SYNTHETIC_NO_DEVICE'
        self.output=output
        self.deadline=time.monotonic()+600
        self.suite='primary-and-user-fixed'
        self.state=state
        self.after_host='target'
        self.after_hot='target'
        self.foreground=ACTIVITY
        self.developer_sheet_dismissals=0
        self.reject_post_denial_prompt=False
        self.loading={'scan':[],'contacts':[]}
        self.report={'cases':[],'passed':False}
        self.unsafe_stop=False
        self.recording=None
        self.video_records=[]
        self.video_sequence=0
        self.original_contacts_callback_completed=False
        self.source_checkout=output/'SYNTHETIC_NO_CHECKOUT'
        self._host_settle_active=False
        self._settle_next_product_dump=False
        self._camera_launch_count=1
        self._camera_actions_started=False
        self._camera_target_seen=False
        self._camera_product_media_retained=False
        self.original_camera_uri='exp://127.0.0.1:8081/--/send/__camera-native-fixture?screen=scan'
        self.calls=[]
        self.events=[]
        self.dumps=0
        self.menu_at_dump=None
        self.change_on_screenshot=None
        self.disabled=False
        self.hot_result='Status: ok\nLaunchState: HOT\n'

    def adb(self,*args,binary=False):
        if self.unsafe_stop:
            raise runner.collector.UnsafeMedia('Synthetic unsafe stop; no more virtual commands')
        if time.monotonic() >= self.deadline:
            raise RuntimeError('Synthetic deadline exhausted')
        self.calls.append(args)
        if args[:3] == ('shell','uiautomator','dump') or args[:3] == ('shell','rm','-f'):
            return ''
        if args == ('exec-out','cat','/sdcard/pocketpay-followup-camera-ui.xml'):
            self.dumps+=1
            if self.menu_at_dump == self.dumps:
                self.state='menu'
            return state_xml(self.state,self.disabled)
        if args == ('shell','dumpsys','activity','activities'):
            return self.foreground
        if args == ('exec-out','screencap','-p'):
            if self.change_on_screenshot is not None:
                self.state=self.change_on_screenshot
                self.change_on_screenshot=None
            return b'\x89PNG\r\n\x1a\nSYNTHETIC_NON_RENDERED_PROTOCOL_BYTES'
        if args[:3] == ('shell','input','tap'):
            if self.state=='intro' and args[3:] == ('360','1150'):
                self.events.append('actual-intro-selector-protocol')
                self.state='menu'
            elif self.state=='menu' and args[3:] == ('668','436'):
                self.events.append('actual-header-selector-protocol')
                self.state=self.after_host
                if self.state=='launcher':
                    self.foreground=ACTIVITY.replace('host.exp.exponent/.experience.ExperienceActivity',
                        'com.google.android.apps.nexuslauncher/.NexusLauncherActivity')
            elif self.state=='target' and args[3:] == ('360','740'):
                self.events.append('original-product-request-protocol')
                self.state='permission'
                self.foreground=PERMISSION_ACTIVITY
            else:
                raise AssertionError('Unexpected virtual tap; no fallback action allowed')
            return ''
        if args[:3] == ('shell','am','start'):
            self.events.append('exact-original-uri-protocol')
            self.state=self.after_hot
            if self.state=='permission': self.foreground=PERMISSION_ACTIVITY
            return self.hot_result
        raise AssertionError('Unknown virtual boundary; actual ADB is prohibited')


class CameraHostAdapter(unittest.TestCase):
    def setUp(self):
        self.folder=tempfile.TemporaryDirectory(prefix='pp-camera-synthetic-adapter-')
        self.output=Path(self.folder.name)
        self.patches=[patch.object(runner.collector,'contains',runner.guarded_contains),
                      patch.object(runner.collector,'exact_action',runner.guarded_action),
                      patch.object(runner.collector,'developer_sheet',runner.known_developer_sheet),
                      patch.object(runner.subprocess,'run',side_effect=AssertionError('No real process')),
                      patch.object(runner.subprocess,'Popen',side_effect=AssertionError('No real process'))]
        for item in self.patches: item.start()

    def tearDown(self):
        for item in reversed(self.patches): item.stop()
        self.folder.cleanup()

    def assert_no_native_claim(self, c):
        self.assertFalse(c.report['passed'])
        self.assertEqual(c.report['cases'],[])
        self.assertTrue(all(item['productStatePassed'] is False for item in c.report.get('hostSettling',[])))
        self.assertFalse(any('KEYCODE_BACK' in call for call in c.calls))

    def test_initial_intro_ordinary_close_hot_once_then_original_target(self):
        c=SyntheticDeviceController(self.output,'intro')
        c.after_host='welcome'
        c.wait('Camera Permission Required',seconds=1)
        self.assertEqual(c.developer_sheet_dismissals,2)
        self.assertEqual(c.events,['actual-intro-selector-protocol','actual-header-selector-protocol','exact-original-uri-protocol'])
        self.assertFalse(c._camera_product_media_retained)
        self.assertTrue(c._camera_target_seen)
        c.wait('Camera Permission Required',seconds=1)
        self.assertEqual(c.events.count('exact-original-uri-protocol'),1)
        self.assert_no_native_claim(c)

    def test_late_sheet_between_wait_and_capture_reaches_fresh_uncovered_capture_without_uri(self):
        c=SyntheticDeviceController(self.output)
        c.wait('Camera Permission Required',seconds=1)
        c.state='menu'
        self.assertTrue(c.capture('SYNTHETIC-target',( 'Camera Permission Required',)))
        self.assertEqual(c.events,['actual-header-selector-protocol'])
        self.assertTrue(c._camera_product_media_retained)
        self.assert_no_native_claim(c)

    def test_late_sheet_between_wait_and_tap_closes_before_original_native_action(self):
        c=SyntheticDeviceController(self.output)
        tree=c.wait('Camera Permission Required',seconds=1)
        c.state='menu'
        c.tap(tree,runner.collector.REQUEST,{runner.collector.PACKAGE})
        self.assertEqual(c.events,['actual-header-selector-protocol','original-product-request-protocol'])
        self.assertTrue(c._camera_actions_started)
        self.assert_no_native_claim(c)

    def test_late_sheet_at_original_tap_fresh_dump_is_also_settled(self):
        c=SyntheticDeviceController(self.output)
        tree=c.wait('Camera Permission Required',seconds=1)
        c.menu_at_dump=c.dumps+2
        c.tap(tree,runner.collector.REQUEST,{runner.collector.PACKAGE})
        self.assertEqual(c.events,['actual-header-selector-protocol','original-product-request-protocol'])
        self.assert_no_native_claim(c)

    def test_sheet_arriving_during_png_bracket_fails_without_settling_or_retaining_that_media(self):
        c=SyntheticDeviceController(self.output)
        c.wait('Camera Permission Required',seconds=1)
        c.change_on_screenshot='menu'
        with self.assertRaises(RuntimeError): c.capture('SYNTHETIC-covered',( 'Camera Permission Required',))
        self.assertFalse((self.output/'SYNTHETIC-covered.png').exists())
        self.assertEqual(c.events,[])
        self.assertFalse(c._camera_product_media_retained)
        self.assert_no_native_claim(c)

    def test_header_action_backgrounding_stops_without_uri_or_product_action(self):
        c=SyntheticDeviceController(self.output,'menu')
        c.after_host='launcher'
        with self.assertRaises(RuntimeError): c.ensure_host_clear()
        self.assertTrue(c.unsafe_stop)
        self.assertEqual(c.events,['actual-header-selector-protocol'])
        self.assert_no_native_claim(c)

    def test_missing_before_closure_media_stops_before_header_uri_or_product_action(self):
        c=SyntheticDeviceController(self.output,'menu')
        c.change_on_screenshot='welcome'
        with self.assertRaises(RuntimeError): c.ensure_host_clear()
        self.assertTrue(c.unsafe_stop)
        self.assertEqual(c.events,[])
        self.assert_no_native_claim(c)

    def test_same_task_camera_permission_overlay_after_hot_setup_is_not_automatically_dismissed(self):
        c=SyntheticDeviceController(self.output,'menu')
        c.after_host='welcome'
        c.after_hot='permission'
        tree=c.ensure_host_clear()
        self.assertTrue(runner.collector.permission_prompt(tree))
        self.assertFalse(c.unsafe_stop)
        self.assertEqual(c.events,['actual-header-selector-protocol','exact-original-uri-protocol'])
        with self.assertRaises(RuntimeError): c.wait('Camera Permission Required',seconds=1)
        self.assertEqual(c.events,['actual-header-selector-protocol','exact-original-uri-protocol'])
        self.assert_no_native_claim(c)

    def test_host_closure_alone_does_not_satisfy_missing_product_target(self):
        c=SyntheticDeviceController(self.output,'menu')
        with self.assertRaises(RuntimeError): c.wait('SYNTHETIC_UNOBSERVED_TARGET',seconds=0.01)
        self.assertEqual(c.events,['actual-header-selector-protocol'])
        self.assert_no_native_claim(c)

    def test_retained_loading_media_blocks_later_welcome_uri_retry(self):
        c=SyntheticDeviceController(self.output,'loading')
        self.assertTrue(c.capture('SYNTHETIC-loading',(runner.collector.LOADING,runner.collector.MANUAL)))
        c.state='menu'
        c.after_host='welcome'
        c.ensure_host_clear()
        self.assertEqual(c.events,['actual-header-selector-protocol'])
        self.assertFalse(c.host_uri_allowed())
        self.assert_no_native_claim(c)

    def test_disabled_product_button_remains_unactionable_after_host_closure(self):
        c=SyntheticDeviceController(self.output,'menu')
        c.disabled=True
        tree=c.wait('Camera Permission Required',seconds=1)
        with self.assertRaises(RuntimeError): c.tap(tree,runner.collector.REQUEST,{runner.collector.PACKAGE})
        self.assertEqual(c.events,['actual-header-selector-protocol'])
        self.assertFalse(c._camera_actions_started)
        self.assert_no_native_claim(c)

    def test_shared_maximum_two_rejects_reappearing_host_without_extra_action(self):
        c=SyntheticDeviceController(self.output,'intro')
        c.wait('Camera Permission Required',seconds=1)
        c.state='menu'
        before=list(c.events)
        with self.assertRaises(RuntimeError): c.ensure_host_clear()
        self.assertTrue(c.unsafe_stop)
        self.assertEqual(c.events,before)
        self.assertEqual(c.developer_sheet_dismissals,2)
        self.assert_no_native_claim(c)

    def test_exact_e69_original_rejects_same_late_capture_and_tap_before_adapter(self):
        source=HERE/'receipts/run-37387043100/camera/original-camera-recording-runner.py'
        self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(),
            '1acc22497a5aac37422f9ff0da48f5d05479cc407b11aac77a586512e69fa1a1')
        old_spec=importlib.util.spec_from_file_location('exact_e69_camera_differential',source)
        old=importlib.util.module_from_spec(old_spec)
        old_spec.loader.exec_module(old)
        OldDevice=type('SyntheticExactE69',(old.RecordingController,),{
            '__init__':SyntheticDeviceController.__init__,'adb':SyntheticDeviceController.adb})
        for operation in ('capture','tap'):
            with tempfile.TemporaryDirectory(prefix='pp-exact-e69-synthetic-') as tmp:
                c=OldDevice(Path(tmp))
                tree=c.wait('Camera Permission Required',seconds=1)
                c.state='menu'
                with self.subTest(operation=operation),self.assertRaisesRegex(RuntimeError,'Expo developer sheet'):
                    if operation=='capture': c.capture('SYNTHETIC-old',('Camera Permission Required',))
                    else: c.tap(tree,runner.collector.REQUEST,{runner.collector.PACKAGE})
                self.assertEqual(c.events,[])
                self.assertFalse((Path(tmp)/'SYNTHETIC-old.png').exists())
                self.assertFalse(c.report['passed'])


if __name__=='__main__': unittest.main()
