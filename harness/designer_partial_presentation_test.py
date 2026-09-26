import unittest
from designer_presentation import format_presentation

class PartialPresentationTests(unittest.TestCase):
    def test_missing_program_pieces_remain_visible_to_customer(self):
        saved = {'ops':[{'type':'add','item':{'id':'sofa','kind':'sofa','room_id':'living'}}],
                 'rationale':'Partial layout: table and lamp did not fit. This bounded search does not prove impossibility.'}
        result = format_presentation(saved, {'rooms':[{'id':'living','name':'Living'}]}, {}, 'Furnish the living room')
        self.assertIn('Partial', result['title'])
        self.assertIn(saved['rationale'], result['description'])

if __name__ == '__main__':
    unittest.main()
