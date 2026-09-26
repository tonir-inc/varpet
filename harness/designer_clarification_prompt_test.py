"""Every deployed profile must carry the same action/clarification boundary."""
from pathlib import Path
import unittest

import designer
from designer_conversation import CONVERSATION_RULES
from designer_profiles import prompt


class ClarificationPromptTests(unittest.TestCase):
    def test_shared_policy_reaches_every_profile_once_before_scene_data(self):
        policy = (Path(__file__).parent / 'prompts/designer-triage.md').read_text()
        for context in ('full', 'trimmed', 'compact', 'compact-base'):
            for placement in ('relations', 'without-place', 'one-batch'):
                with self.subTest(context=context, placement=placement):
                    actual = prompt(placement, context, designer.static_prefix())
                    self.assertEqual(actual.count(policy), 1)
                    self.assertIn(CONVERSATION_RULES, actual)
                    self.assertNotIn('Default budget: zero, no purchases.', actual)
                    self.assertNotIn('Decline paint', actual)

    def test_production_policy_distinguishes_clear_actions_and_essential_ambiguity(self):
        actual = prompt('without-place', 'compact-base', designer.static_prefix())
        for example in ('Furnish the living room', 'Add a desk by the window for working from home',
                        'Paint the bedroom walls warm white', 'Make it nicer'):
            self.assertIn(example, actual)
        for boundary in ('one focused question', 'room identity', 'optional design choices',
                         'search failure', 'use the answer'):
            self.assertIn(boundary, actual)


if __name__ == '__main__':
    unittest.main()
