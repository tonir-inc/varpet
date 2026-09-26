import os, signal, subprocess, sys, threading, time, unittest
from unittest.mock import patch
import designer
class CleanupRetryTest(unittest.TestCase):
    def test_failed_process_inspection_does_not_turn_timeout_into_unbounded_wait(self):
        original=designer.terminate_tree; processes=[]; errors=[]
        def cleanup(process):
            processes.append(process)
            if len(processes)==1:raise subprocess.TimeoutExpired('ps',.2)
            original(process)
        def run():
            try:designer.watch_process([sys.executable,'-c','import time; time.sleep(20)'],idle_timeout=.05)
            except subprocess.TimeoutExpired:errors.append('inspection timeout')
        with patch.object(designer,'terminate_tree',side_effect=cleanup):
            thread=threading.Thread(target=run,daemon=True);thread.start();thread.join(2)
            try:
                self.assertFalse(thread.is_alive(),'cleanup failure must not enter process.wait forever')
                self.assertEqual(errors,['inspection timeout'])
                self.assertEqual(len(processes),2)
                self.assertIsNotNone(processes[0].poll())
            finally:
                if processes and processes[0].poll() is None:os.killpg(processes[0].pid,signal.SIGKILL)
                thread.join(2)
