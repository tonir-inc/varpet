"""Customer history is authoritative and reaches both MCP and the final bridge gate."""
import json
from pathlib import Path
import unittest
import designer_service_test as fixtures

class RemovalHistoryTests(unittest.TestCase):
    def test_resumed_turns_preserve_customer_requests_for_both_gates(self):
        h = fixtures.ServiceTests('runTest')
        h.setUpClass()
        h.setUp()
        self.addCleanup(h.doCleanups)
        h.start()
        first, _ = h.post(h.payload('remove the couch'))
        cid = first['conversationId']
        h.post(h.payload('make it cozy', conversationId=cid))
        runtime = h.service.conversations[cid].runtime
        history = Path(runtime['scene'] + '.requests.json')
        self.assertTrue(history.exists(), 'MCP must receive authoritative customer history')
        self.assertEqual(json.loads(history.read_text()), ['remove the couch', 'make it cozy'])
        h.post(h.payload('proposal', conversationId=cid))
        command = next(r for r in h.records('bridge.jsonl') if r[0] == 'to-command')
        self.assertIn('--customer-requests', command)
        self.assertEqual(command[command.index('--customer-requests') + 1], str(history))
