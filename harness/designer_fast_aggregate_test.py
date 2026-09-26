import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import threading
import unittest
import designer_service

class AggregateUsage(unittest.TestCase):
    def test_unmetered_request_keeps_aggregate_unknown_after_fast_turn(self):
        class Service(designer_service.DesignerService):
            def _process(self,command,cancel,*,env=None,on_output=None):
                if '--worker' not in command:
                    # Service writes this conversion target before preparing the SDK runtime.
                    Path(command[3]).write_text(json.dumps({'rooms':[],'walls':[],'openings':[],'items':[],'fixed':[]}))
                    return
                count=getattr(self,'count',0);self.count=count+1
                event={'kind':'worker_summary','status':'completed','response':'Cannot change walls.'}
                if count: event.update(fast_path=True,total_usage={'totalTokens':10})
                on_output('stdout',json.dumps(event)+'\n')
        service=Service(bridge_command=['bridge'],worker_command=['worker','--worker'])
        body={'scene':{'format':'varpet.editor','version':1,'units':'m','upAxis':'Y','rooms':[],'walls':[],'objects':[]},'revision':0,'request':'test'}
        try:
            with contextlib.redirect_stderr(io.StringIO()):
                first=service.propose(body,threading.Event(),lambda _:None)
                conversation=service.conversations[first['conversationId']]
                self.assertFalse(conversation.usage_known)
                service.propose({**body,'conversationId':first['conversationId']},threading.Event(),lambda _:None)
                self.assertFalse(conversation.usage_known,'unknown tokens cannot disappear from the cumulative count')
        finally: service.close()

if __name__=='__main__':unittest.main()
