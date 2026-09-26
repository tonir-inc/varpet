"""Typed receipts remain consumable by the existing options orchestrator."""
import unittest
from designer_options import accepted_proposals
from designer_options_test import accepted

class TypedOptionsTests(unittest.TestCase):
    def test_server_evidence_is_checked_and_copied(self):
        proposal = accepted()['proposal']
        result = accepted_proposals([{'kind':'proposal_evidence','proposal':proposal}])
        self.assertEqual(result, [proposal])
        self.assertIsNot(result[0], proposal)
        proposal['checks']['ok'] = False
        self.assertEqual(accepted_proposals([{'kind':'proposal_evidence','proposal':proposal}]), [])

if __name__ == '__main__':
    unittest.main()
