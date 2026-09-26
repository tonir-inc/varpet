"""An explicit visual decision cannot be consumed by FAST's text-only selector."""
import json,sys,tempfile,unittest
from pathlib import Path
from types import ModuleType
from unittest.mock import patch
import designer,designer_fast
class VisionRoutingTests(unittest.TestCase):
 def test_visual_jobs_reach_general_worker_even_when_fast_path_is_enabled(self):
  sdk=ModuleType('openai_codex')
  for name in ['Codex','CodexConfig','ApprovalMode','Sandbox','LocalImageInput','TextInput']:setattr(sdk,name,object)
  generated=ModuleType('openai_codex.generated.v2_all');generated.ReasoningEffort=object
  with tempfile.TemporaryDirectory() as tmp,patch.dict(sys.modules,{'openai_codex':sdk,'openai_codex.generated.v2_all':generated}),patch.object(designer_fast,'run',return_value=0) as fast,patch.object(designer,'first_turn_images',return_value=[]),patch.object(designer,'build_config',side_effect=RuntimeError('general worker reached')):
   path=Path(tmp)/'job.json';base={'request':'cozy','effort':'low','profile':{'fast_path':True},'runtime':{'state':str(Path(tmp)/'state'),'scene':str(Path(tmp)/'scene')}}
   path.write_text(json.dumps(base));self.assertEqual(designer.sdk_worker(path),0);self.assertEqual(fast.call_count,1)
   for option in [{'vision':{'products':True}},{'turn_images':['current.png']},{'review_only':True}]:
    fast.reset_mock();path.write_text(json.dumps({**base,**option}))
    with self.assertRaisesRegex(RuntimeError,'general worker reached'):designer.sdk_worker(path)
    fast.assert_not_called()
