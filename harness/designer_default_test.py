"""Runtime and CLI defaults agree with effective worker settings and telemetry."""
import contextlib
import io
import json
from pathlib import Path
import sys
import threading
import unittest
from unittest.mock import Mock, patch

import designer
import designer_service


class DefaultSettingsTests(unittest.TestCase):
    def settings(self, job):
        self.assertTrue(hasattr(designer, 'runtime_settings'), 'Missing measured runtime defaults')
        return designer.runtime_settings(job)

    def test_explicit_benchmark_reference_settings_override_production_defaults(self):
        effort, profile = self.settings({'effort':'medium','profile':{'placement':'relations','context':'full'}})
        self.assertEqual(effort, 'medium')
        self.assertEqual(profile, {'placement':'relations','context':'full'})

    def test_default_settings_are_fresh_and_shared_by_cli_and_worker(self):
        effort, profile = self.settings({})
        self.assertEqual(effort, 'low')
        self.assertEqual(profile, {'placement':'without-place','context':'compact-base'})
        self.assertEqual(designer.default_service_settings(), {'effort':effort,'profile':profile})
        profile['placement'] = 'mutated'
        self.assertNotEqual(self.settings({})[1]['placement'], 'mutated')

    def test_normal_service_command_launches_with_selected_settings(self):
        self.settings({})
        service, server = Mock(), Mock(server_port=8787)
        with patch.object(sys, 'argv', ['designer_service.py']), patch.object(designer_service, 'DesignerService', return_value=service) as create, patch.object(designer_service, 'make_server', return_value=server):
            with contextlib.redirect_stdout(io.StringIO()):
                designer_service.main()
        create.assert_called_once_with(**designer.default_service_settings())
        server.serve_forever.assert_called_once()
        service.close.assert_called_once()

    def test_explicit_low_effort_reaches_job_and_summary_without_changing_request(self):
        self.assertIn('effort', __import__('inspect').signature(designer_service.DesignerService).parameters,
                      'Service must expose explicit effective effort')
        profile = {'placement':'without-place','context':'trimmed'}
        service = designer_service.DesignerService(bridge_command=['bridge'], worker_command=['worker'], effort='low', profile=profile)
        self.addCleanup(service.close)
        jobs = []
        def process(command, cancel, **kwargs):
            if command[0] == 'bridge':
                Path(command[3]).write_text('{"rooms":[]}')
            else:
                jobs.append(json.loads(Path(command[-1]).read_text()))
                kwargs['on_output']('stdout', json.dumps({'kind':'worker_summary','status':'completed',
                    'response':'DECLINE: I cannot choose paint colours.','total_usage':{'totalTokens':10}})+'\n')
        logs = io.StringIO()
        with patch.object(service, '_process', side_effect=process), contextlib.redirect_stderr(logs):
            result = service.propose({'scene':{'format':'varpet.editor'},'revision':0,'request':'Choose paint'}, threading.Event(), lambda message: None)
        self.assertEqual(result['type'], 'decline')
        self.assertEqual(jobs[0]['effort'], 'low')
        self.assertEqual(jobs[0]['profile'], profile)
        self.assertEqual(jobs[0]['request'], 'Choose paint')
        self.assertEqual(json.loads(logs.getvalue())['effort'], 'low')


if __name__ == '__main__':
    unittest.main()
