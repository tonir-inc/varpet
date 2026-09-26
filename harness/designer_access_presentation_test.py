import unittest
from designer_presentation import format_presentation


class AccessPresentationTests(unittest.TestCase):
    def present(self, width, reachable=True, target='item:new'):
        saved = {
            'ops': [{'type': 'add', 'item': {'id': 'new', 'kind': 'sofa', 'room_id': 'living'}}],
            'rationale': 'Placed a complete checked living arrangement.',
            'score': {'after': {'space': {'rooms': [{
                'room_id': 'living', 'walkways': [
                    {'from': 'door:entry', 'to': target, 'width_m': width, 'reachable': reachable}
                ]
            }]}}}
        }
        return format_presentation(saved, {'rooms': [{'id': 'living', 'name': 'Living'}]}, {}, 'Furnish the living room')['description']

    def test_complete_room_discloses_acceptable_secondary_path(self):
        description = self.present(.75)
        self.assertIn('0.75 m', description)
        self.assertIn('0.90 m', description)
        self.assertIn('secondary access', description.lower())

    def test_comfortable_or_unrelated_paths_do_not_claim_a_compromise(self):
        self.assertNotIn('secondary access', self.present(.95).lower())
        self.assertNotIn('secondary access', self.present(.8, target='item:existing').lower())

    def test_unsafe_or_unreachable_path_is_not_presented_as_acceptable(self):
        self.assertNotIn('acceptable', self.present(.7).lower())
        self.assertNotIn('acceptable', self.present(.8, reachable=False).lower())


if __name__ == '__main__':
    unittest.main()
