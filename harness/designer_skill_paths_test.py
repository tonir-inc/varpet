import unittest
import designer
class SkillPaths(unittest.TestCase):
    def test_only_the_workspace_copy_of_the_product_skill_is_allowed(self):
        self.assertTrue(hasattr(designer,'skill_allowed'))
        workspace='/tmp/example-designer-workspace'
        local=workspace+'/.agents/skills/interior-design-rules/SKILL.md'
        self.assertTrue(designer.skill_allowed('interior-design-rules',local,workspace))
        self.assertFalse(designer.skill_allowed('interior-design-rules','/Users/example/.agents/skills/interior-design-rules/SKILL.md',workspace))
        self.assertFalse(designer.skill_allowed('another-skill',local,workspace))
