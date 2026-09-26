import os
from pathlib import Path
import unittest
from unittest.mock import patch
import designer
import designer_profiles

class PicturePromptTests(unittest.TestCase):
    def test_product_rules_cover_catalog_generic_slots_and_parallel_builder_handoff(self):
        text=designer.SKILL.read_text().lower()
        for rule in ['reserve_slot','build_piece','search the catalog first','never copy','boxy','scene json','three custom','four builder']:
            self.assertIn(rule,text)
        for context in ['full','compact-base']:
            prompt=designer_profiles.prompt('without-place',context,designer.static_prefix()).lower()
            self.assertIn('reserve_slot',prompt);self.assertIn('build_piece',prompt)

    def test_config_enables_build_tools_only_with_complete_service_context(self):
        env={'VARPET_BUILDS_DIR':'/tmp/private-builds','VARPET_CONVERSATION_ID':'c1','VARPET_TURN_ID':'t1'}
        with patch.dict(os.environ,env):
            server=designer.build_config(Path('/tmp/scene.json'))['mcp_servers']['varpet-designer']
            self.assertIn('reserve_slot',server['enabled_tools']);self.assertIn('build_piece',server['enabled_tools'])
            for key,value in env.items():self.assertEqual(server['env'][key],value)

    def test_builder_runtime_is_private_and_disposable(self):
        import tempfile
        import designer_piece_worker
        self.assertTrue(hasattr(designer_piece_worker,'builder_runtime'),'Builders need private SDK logs for image lifetime')
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);source=root/'source';source.mkdir();(source/'auth.json').write_text('{}')
            runtime=designer_piece_worker.builder_runtime(root/'build',source_home=source)
            self.assertTrue(Path(runtime['home']).is_relative_to(root/'build'))
            self.assertTrue(Path(runtime['home'],'auth.json').is_symlink())
            self.assertFalse(Path(runtime['home'],'config.toml').exists())
