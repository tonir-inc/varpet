"""Speed profile contracts; no model calls and no changed grading fixtures."""
import importlib.util
import json
from pathlib import Path
import sys
import unittest

import designer


class SpeedProfilesTests(unittest.TestCase):
    def profiles(self):
        path = Path(__file__).with_name('designer_profiles.py')
        self.assertTrue(path.exists(), 'Missing measured-speed profile support')
        spec = importlib.util.spec_from_file_location('designer_profiles', path)
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
        return module

    def test_no_place_profile_hides_only_place_and_sets_effort(self):
        profiles = self.profiles()
        config = profiles.configure(designer.build_config(Path('/scene.json')), 'without-place', 'low', 'full')
        self.assertEqual(config['model_reasoning_effort'], 'low')
        tools = config['mcp_servers']['varpet-designer']['enabled_tools']
        self.assertNotIn('place', tools)
        self.assertIn('propose', tools)
        self.assertIn('ask', tools)
        self.assertEqual(list(config['mcp_servers']), ['varpet-designer'])

    def test_trimmed_prompt_keeps_gates_and_is_smaller(self):
        profiles = self.profiles()
        prompt = profiles.prompt('without-place', 'trimmed', designer.static_prefix())
        self.assertLess(len(prompt), len(designer.static_prefix()) / 2)
        for required in ('propose', 'set_intent', 'keep', 'data', 'accept', 'check_layout'):
            self.assertIn(required, prompt)

    def test_batch_profile_instructs_one_call_and_keeps_place(self):
        profiles = self.profiles()
        config = profiles.configure(designer.build_config(Path('/scene.json')), 'one-batch', 'medium', 'full')
        self.assertIn('place', config['mcp_servers']['varpet-designer']['enabled_tools'])
        self.assertIn('ONE', profiles.prompt('one-batch', 'full', 'base'))

    def test_round_guard_counts_unique_model_rounds_and_stops_at_boundary(self):
        guard = self.profiles().TurnGuard(max_rounds=2, one_batch=True)
        def usage(total):
            return {'method':'thread/tokenUsage/updated','payload':{'threadId':'t','turnId':'u',
                'tokenUsage':{'total':{'totalTokens':total},'last':{'totalTokens':5}}}}
        self.assertIsNone(guard.observe(usage(5)))
        self.assertIsNone(guard.observe(usage(5)))
        self.assertEqual(guard.observe(usage(10)), 'round_limit')
        self.assertEqual(guard.rounds, 2)

    def test_round_limit_allows_already_finished_final_answer(self):
        guard = self.profiles().TurnGuard(max_rounds=1)
        guard.observe({'method':'item/completed','payload':{'item':{'type':'agentMessage','phase':'final_answer','text':'Done'}}})
        result = guard.observe({'method':'thread/tokenUsage/updated','payload':{'tokenUsage':{
            'total':{'totalTokens':5},'last':{'totalTokens':5}}}})
        self.assertIsNone(result)

    def test_batch_guard_rejects_single_item_and_repeated_calls(self):
        profiles = self.profiles()
        def call(id, args):
            return {'method':'item/started','payload':{'item':{'id':id,'type':'mcpToolCall',
                'server':'varpet-designer','tool':'place','arguments':args}}}
        guard = profiles.TurnGuard(one_batch=True)
        self.assertEqual(guard.observe(call('a', {'item_id':'desk'})), 'place_policy')
        guard = profiles.TurnGuard(one_batch=True)
        first = call('a', {'placements':[{'item_id':'desk'}]})
        self.assertIsNone(guard.observe(first))
        self.assertIsNone(guard.observe(first))
        self.assertEqual(guard.observe(call('b', {'placements':[{'item_id':'chair'}]})), 'place_policy')

    def test_benchmark_speed_cli_exposes_independent_experiment_controls(self):
        import subprocess
        result = subprocess.run([sys.executable, str(Path(__file__).resolve().parents[1] / 'packages/designer/eval/run.py'), '--help'],
                                capture_output=True, text=True, check=True)
        for option in ('--speed-profile', '--effort', '--context', '--round-cap'):
            self.assertIn(option, result.stdout)

    def test_resume_restores_effort_even_for_a_regular_benchmark(self):
        from types import SimpleNamespace
        path = Path(__file__).resolve().parents[1] / 'packages/designer/eval/run.py'
        spec = importlib.util.spec_from_file_location('speed_runner', path)
        runner = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(runner)
        args = SimpleNamespace(effort='medium')
        runner.restore_settings(args, {'concurrency':4,'deadline_seconds':240,'idle_timeout_seconds':180,'effort':'low'})
        self.assertEqual(args.effort, 'low')

    def test_compact_context_inlines_skill_and_uses_the_same_proposal_gate(self):
        profiles = self.profiles()
        config = profiles.configure(designer.build_config(Path('/scene.json')), 'without-place', 'low', 'compact')
        tools = config['mcp_servers']['varpet-designer']['enabled_tools']
        self.assertEqual(set(tools), {'set_intent','search_catalog','sun','propose','ask'})
        prompt = profiles.prompt('without-place', 'compact', designer.static_prefix())
        self.assertIn(designer.SKILL.read_text(), prompt)
        self.assertIn('propose', prompt)
        self.assertIn('numeric', prompt)
        self.assertLess(len(prompt), len(designer.static_prefix()))


if __name__ == '__main__':
    unittest.main()
