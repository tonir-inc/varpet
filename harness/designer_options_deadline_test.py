import threading
import unittest
from designer_options import explore_options, STRATEGIES
from designer_options_test import event, accepted


class DeadlineHandoffTests(unittest.TestCase):
    def test_accepted_result_delivered_during_bounded_cleanup_is_retained(self):
        def runner(**job):
            if job['strategy'] != STRATEGIES[0]:
                job['cancel_event'].wait(1)
            index = STRATEGIES.index(job['strategy']) + 1
            return {'status': 'completed', 'events': [event(accepted(index, rectangle=4+index))]}
        result = explore_options({'items': []}, 'options', runner, timeout=.3)
        self.assertEqual(len(result['options']), 2)
        self.assertEqual(len(result['explorers']), 3)
        self.assertLess(result['seconds'], .4)


if __name__ == '__main__': unittest.main()
