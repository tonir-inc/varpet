import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import designer


class CatalogEnvironmentTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.home = Path(self.directory.name)
        self.settings = self.home / '.config' / 'varpet' / 'env'
        self.settings.parent.mkdir(parents=True)
        self.environment = patch.dict(os.environ, {}, clear=True)
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.home_patch = patch.object(Path, 'home', return_value=self.home)
        self.home_patch.start()
        self.addCleanup(self.home_patch.stop)

    def test_explicit_catalog_url_wins_and_keeps_request_paths(self):
        self.settings.write_text('VARPET_CATALOG_URL=$(invalid shell code)\n')
        os.environ.update(VARPET_CATALOG_URL='https://catalog.example/mcp',
                          VARPET_SCENE='/job/scene.json', VARPET_PROPOSALS_DIR='/job/proposals',
                          UNRELATED_SECRET='must-not-forward')
        self.assertEqual(designer.designer_mcp_env(), {
            'VARPET_CATALOG_URL': 'https://catalog.example/mcp',
            'VARPET_SCENE': '/job/scene.json', 'VARPET_PROPOSALS_DIR': '/job/proposals',
        })

    def test_optional_export_quotes_and_comments_are_literal_settings(self):
        for assignment in (
            'VARPET_CATALOG_URL=http://localhost:8765/mcp',
            'export VARPET_CATALOG_URL="http://localhost:8765/mcp"',
            "  export VARPET_CATALOG_URL = 'http://localhost:8765/mcp' # laptop tunnel",
        ):
            with self.subTest(assignment=assignment):
                self.settings.write_text('# Local settings\nUNRELATED_SECRET=hidden\n' + assignment + '\n')
                self.assertEqual(designer.designer_mcp_env(), {'VARPET_CATALOG_URL': 'http://localhost:8765/mcp'})

    def test_missing_settings_and_unrelated_assignments_preserve_current_behavior(self):
        os.environ['VARPET_SCENE'] = '/job/scene.json'
        self.assertEqual(designer.designer_mcp_env(), {'VARPET_SCENE': '/job/scene.json'})
        self.settings.write_text('OTHER_URL=https://example.test\nexport SOMETHING=$(do-not-run)\n')
        self.assertEqual(designer.designer_mcp_env(), {'VARPET_SCENE': '/job/scene.json'})

    def test_explicit_empty_url_is_not_replaced_by_laptop_settings(self):
        os.environ['VARPET_CATALOG_URL'] = ''
        self.settings.write_text('VARPET_CATALOG_URL=http://localhost:8765/mcp\n')
        self.assertEqual(designer.designer_mcp_env(), {'VARPET_CATALOG_URL': ''})

    def test_shell_expressions_and_invalid_assignments_fail_without_execution_or_value_disclosure(self):
        marker = self.home / 'executed'
        for value in (f'$(touch {marker})', f'`touch {marker}`', '$OTHER_URL',
                      '"http://localhost:8765/$OTHER_URL"', 'http://localhost:8765/mcp; echo hidden',
                      '"http://localhost:8765/mcp', 'not-a-url'):
            with self.subTest(value=value):
                self.settings.write_text(f'VARPET_CATALOG_URL={value}\n')
                with self.assertRaisesRegex(ValueError, 'VARPET_CATALOG_URL.*literal.*http') as caught:
                    designer.designer_mcp_env()
                self.assertNotIn(value, str(caught.exception))
                self.assertFalse(marker.exists())

    def test_build_config_forwards_the_resolved_laptop_url_to_only_designer_mcp(self):
        self.settings.write_text('VARPET_CATALOG_URL=http://localhost:8765/mcp\n')
        config = designer.build_config(Path('/job/scene.json'))
        self.assertEqual(list(config['mcp_servers']), ['varpet-designer'])
        self.assertEqual(config['mcp_servers']['varpet-designer']['env'], {
            'VARPET_CATALOG_URL': 'http://localhost:8765/mcp',
        })


if __name__ == '__main__':
    unittest.main()
