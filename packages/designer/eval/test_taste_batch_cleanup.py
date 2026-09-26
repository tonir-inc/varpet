"""Process-exit races in shared-machine eval cleanup must not hide live failures."""
import importlib.util
from pathlib import Path
import unittest
import subprocess,sys,os,time,signal
from unittest.mock import Mock, patch
spec=importlib.util.spec_from_file_location('taste_batch',Path(__file__).with_name('komitas-batch.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Cleanup(unittest.TestCase):
 def test_exited_empty_group_is_harmless(self):
  process=Mock(pid=123);process.poll.return_value=0
  with patch.object(m.os,'killpg',side_effect=ProcessLookupError):m.stop_process_group(process)
  process.wait.assert_called_once()
 def test_live_process_group_is_stopped(self):
  process=Mock(pid=123);process.poll.return_value=None
  with patch.object(m.os,'killpg') as kill:m.stop_process_group(process)
  kill.assert_called_once_with(123,m.signal.SIGKILL);process.wait.assert_called_once()
 def test_exit_race_does_not_mask_a_live_permission_failure(self):
  process=Mock(pid=123);process.poll.side_effect=[None,0]
  with patch.object(m.os,'killpg',side_effect=[PermissionError,ProcessLookupError]):m.stop_process_group(process)
  process=Mock(pid=123);process.poll.return_value=None
  with patch.object(m.os,'killpg',side_effect=PermissionError):
   with self.assertRaises(PermissionError):m.stop_process_group(process)

 def test_descendant_is_stopped_after_its_leader_exits(self):
  leader=subprocess.Popen([sys.executable,'-c',"import subprocess,sys; p=subprocess.Popen([sys.executable,'-c','import time;time.sleep(30)'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);print(p.pid)"],stdout=subprocess.PIPE,text=True,start_new_session=True)
  child=int(leader.communicate(timeout=5)[0]);self.assertEqual(leader.poll(),0)
  try:
   m.stop_process_group(leader)
   for _ in range(40):
    state=subprocess.run(['ps','-p',str(child),'-o','stat='],capture_output=True,text=True).stdout.strip()
    if not state or state.startswith('Z'):break
    time.sleep(.05)
   self.assertTrue(not state or state.startswith('Z'),state)
  finally:
   try:os.kill(child,signal.SIGKILL)
   except ProcessLookupError:pass
