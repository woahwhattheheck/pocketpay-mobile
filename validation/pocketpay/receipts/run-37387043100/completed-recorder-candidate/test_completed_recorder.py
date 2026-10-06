"""Source-derived owned-process tests; no ADB, guest or native media is produced."""
import ast
import importlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

HERE=Path(__file__).resolve().parent
SOURCE=HERE.parent/'pocketpay-remote-native-controller-intro-composed-proposal/validation/pocketpay/camera-recording-runner.py'
sys.path.insert(0,str(SOURCE.parent))


def load(path):
    ns={'__name__':'recorder_pure_test','__file__':str(SOURCE)}
    exec(compile(path.read_text(),str(path),'exec'),ns)
    return ns


class Process:
    def __init__(self, completed, code=0):
        self.completed=completed;self.returncode=code if completed else None;self.calls=[]
    def poll(self):self.calls.append(('poll',));return self.returncode
    def communicate(self,timeout):
        self.calls.append(('communicate',timeout));self.returncode=0 if self.returncode is None else self.returncode
        return b'',b'synthetic metadata'
    def terminate(self):self.calls.append(('terminate',));self.returncode=-15
    def kill(self):self.calls.append(('kill',));self.returncode=-9


class CompletedRecorderChecks(unittest.TestCase):
    def make(self,path,folder,process,global_expired=False,optional_expired=True,unsafe=False,transfer_failure=False):
        ns=load(path);c=ns['RecordingController'].__new__(ns['RecordingController'])
        c.output=Path(folder);c.serial='SYNTHETIC_NO_DEVICE';c.recording=('synthetic','/sdcard/synthetic.mp4',process)
        c.unsafe_stop=unsafe;c.video_records=[]
        c.deadline=time.monotonic()+(-10 if global_expired else 600)
        c.recording_deadline=time.monotonic()+(-10 if optional_expired else 10)
        c.events=[]
        def boundary(*args,**kwargs):
            c.events.append(args)
            if transfer_failure:
                c.stop_unsafe();raise subprocess.SubprocessError('synthetic transfer failure')
        c.adb=boundary
        return ns,c
    def run_boundary(self,process,**kwargs):
        with tempfile.TemporaryDirectory() as folder:
            ns,c=self.make(HERE/'camera-recording-runner.py',folder,process,**kwargs)
            with patch.object(ns['subprocess'],'run',side_effect=lambda *args,**kw:c.events.append(('synthetic-cleanup',))):c.finish_recording()
            return c.events,c.video_records,process.calls,c.unsafe_stop
    def test_original_discards_finished_process_after_optional_deadline(self):
        with tempfile.TemporaryDirectory() as folder:
            p=Process(True);ns,c=self.make(SOURCE,folder,p)
            with patch.object(ns['subprocess'],'run',return_value=None):c.finish_recording()
            self.assertEqual(c.events,[]);self.assertIn('error',c.video_records[0]);self.assertNotIn(('poll',),p.calls)
    def test_finished_zero_retained_after_optional_deadline_inside_global(self):
        events,records,calls,unsafe=self.run_boundary(Process(True))
        self.assertEqual(events[0][0],'pull');self.assertEqual(records[0]['exit'],0)
        self.assertEqual(calls,[('poll',),('communicate',5)]);self.assertFalse(unsafe)
    def test_active_expired_optional_terminates_no_pull_no_extended_wait(self):
        events,records,calls,_=self.run_boundary(Process(False))
        self.assertEqual(events,[('synthetic-cleanup',)])
        self.assertEqual(calls,[('poll',),('terminate',),('communicate',5)])
        self.assertIn('error',records[0])
    def test_active_within_bounds_keeps_existing_bounded_wait(self):
        events,records,calls,_=self.run_boundary(Process(False),optional_expired=False)
        self.assertEqual(events[0][0],'pull');self.assertGreater(calls[1][1],0);self.assertLessEqual(calls[1][1],10)
        self.assertNotIn(('terminate',),calls)
    def test_completed_nonzero_not_retained(self):
        events,records,_,_=self.run_boundary(Process(True,code=1))
        self.assertEqual(events,[('synthetic-cleanup',)]);self.assertEqual(records[0]['exit'],1)
    def test_expired_global_blocks_transfer_and_guest_cleanup(self):
        events,records,_,_=self.run_boundary(Process(True),global_expired=True)
        self.assertEqual(events,[]);self.assertTrue(records[0]['excluded'])
    def test_unsafe_stops_owned_process_no_poll_transfer_or_guest_cleanup(self):
        events,records,calls,unsafe=self.run_boundary(Process(False),unsafe=True)
        self.assertEqual(events,[]);self.assertNotIn(('poll',),calls);self.assertTrue(records[0]['excluded']);self.assertTrue(unsafe)
    def test_unsafe_transfer_preserves_no_guest_cleanup_guard(self):
        events,records,_,unsafe=self.run_boundary(Process(True),transfer_failure=True)
        self.assertEqual(len(events),1);self.assertEqual(events[0][0],'pull');self.assertTrue(unsafe);self.assertTrue(records[0]['excluded'])
    def test_every_other_original_method_and60sec600sec_scope_unchanged(self):
        old=ast.parse(SOURCE.read_text());new=ast.parse((HERE/'camera-recording-runner.py').read_text())
        def methods(tree):
            cls=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='RecordingController')
            return {n.name:ast.dump(n,include_attributes=False) for n in cls.body if isinstance(n,ast.FunctionDef) and n.name!='finish_recording'}
        self.assertEqual(methods(old),methods(new))
        self.assertIn("self.begin_recording('scan-launch', 60)",(HERE/'camera-recording-runner.py').read_text())


if __name__=='__main__':unittest.main()
