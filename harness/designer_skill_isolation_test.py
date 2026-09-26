import contextlib,io,sys,unittest
from pathlib import Path
from types import ModuleType,SimpleNamespace
from unittest.mock import Mock,patch
import designer
class SkillIsolationTest(unittest.TestCase):
 def test_only_the_runtime_copy_is_enabled_when_personal_skills_duplicate_the_name(self):
  generated=ModuleType('openai_codex.generated.v2_all');generated.SkillsListResponse=object;generated.SkillsConfigWriteResponse=object
  local='/tmp/vision-workspace/.agents/skills/interior-design-rules/SKILL.md';personal='/Users/user/.agents/skills/interior-design-rules/SKILL.md'
  def skill(path):return SimpleNamespace(name='interior-design-rules',enabled=True,model_dump=lambda **_: {'path':path})
  client=Mock();client.request.side_effect=[SimpleNamespace(data=[SimpleNamespace(skills=[skill(local),skill(personal)])]),None,SimpleNamespace(data=[SimpleNamespace(skills=[skill(local)])])]
  with patch.dict(sys.modules,{'openai_codex.generated.v2_all':generated}),contextlib.redirect_stdout(io.StringIO()):designer._isolate_skills(SimpleNamespace(_client=client),'/tmp/vision-workspace')
  self.assertEqual(client.request.call_args_list[1].args[:2],('skills/config/write',{'path':personal,'enabled':False}))
