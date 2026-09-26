"""Real-process regressions for SDK children that create their own sessions."""

import importlib.util
import os
from pathlib import Path
import select
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch


MODULE = Path(__file__).with_name("designer_process.py")


class ProcessTreeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.helper = None
        if MODULE.exists():
            spec = importlib.util.spec_from_file_location("designer_process", MODULE)
            cls.helper = importlib.util.module_from_spec(spec)
            sys.modules[spec.name] = cls.helper
            spec.loader.exec_module(cls.helper)

    def subject(self):
        self.assertIsNotNone(self.helper, "process-tree termination helper is required")
        return self.helper

    def cleanup(self, process, child_pid=None):
        if child_pid is not None:
            try:
                os.kill(child_pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        if process.poll() is None:
            process.kill()
        process.wait(timeout=2)
        if process.stdout:
            process.stdout.close()

    def test_kills_separate_session_child_and_releases_inherited_stdout(self):
        helper = self.subject()
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / "escaped-child-finished"
            child = "import pathlib,time;time.sleep(.7);pathlib.Path(" + repr(str(marker)) + ").touch()"
            parent = "import subprocess,sys,time;p=subprocess.Popen([sys.executable,'-c'," + repr(child) + "],start_new_session=True);print(p.pid,flush=True);time.sleep(20)"
            process = subprocess.Popen([sys.executable, "-c", parent], start_new_session=True,
                                       stdin=subprocess.DEVNULL, stdout=subprocess.PIPE)
            child_pid = None
            try:
                self.assertTrue(select.select([process.stdout], [], [], 2)[0])
                child_pid = int(process.stdout.readline())
                started = time.monotonic()
                helper.terminate_tree(process)
                elapsed = time.monotonic() - started
                self.assertIsNotNone(process.returncode, "worker was not reaped")
                self.assertLess(elapsed, .3, "cleanup consumed the options deadline")
                self.assertTrue(select.select([process.stdout], [], [], .2)[0], "escaped child still holds output pipe")
                self.assertEqual(process.stdout.read(1), b"")
                time.sleep(.75)
                self.assertFalse(marker.exists(), "separate-session child survived")
            finally:
                self.cleanup(process, child_pid)

    def test_foreign_process_group_does_not_kill_unrelated_sibling(self):
        helper = self.subject()
        sibling = subprocess.Popen([sys.executable, "-c", "import time;time.sleep(20)"], stdin=subprocess.DEVNULL)
        worker = subprocess.Popen([sys.executable, "-c", "import time;time.sleep(20)"], stdin=subprocess.DEVNULL)
        try:
            self.assertEqual(os.getpgid(worker.pid), os.getpgrp())
            helper.terminate_tree(worker)
            self.assertIsNotNone(worker.returncode)
            self.assertIsNone(sibling.poll())
        finally:
            self.cleanup(worker)
            self.cleanup(sibling)

    def test_already_reaped_worker_is_safe_to_clean_again(self):
        helper = self.subject()
        process = subprocess.Popen([sys.executable, "-c", "pass"], start_new_session=True)
        process.wait(timeout=2)
        with patch.object(helper.os, "killpg", side_effect=AssertionError("must not signal a reaped process")):
            helper.terminate_tree(process)
        self.assertEqual(process.returncode, 0)

    def test_permission_denied_for_live_group_is_not_suppressed(self):
        helper = self.subject()
        process = subprocess.Popen([sys.executable, "-c", "import time;time.sleep(20)"], start_new_session=True)
        try:
            with patch.object(helper.os, "killpg", side_effect=PermissionError("live group")):
                with self.assertRaises(PermissionError):
                    helper.terminate_tree(process)
            self.assertIsNone(process.poll())
        finally:
            self.cleanup(process)


if __name__ == "__main__":
    unittest.main()
