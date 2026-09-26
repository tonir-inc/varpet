"""Observation-only production HTTP service, with per-turn evidence and error conversation IDs."""
import argparse
import importlib.util
import json
from pathlib import Path
import signal
import threading

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('vision_recorder', HERE / 'vision-service.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
recorder = module.recorder

class Service(module.VisionService):
    def _process(self, command, cancel, *, env=None, on_output=None):
        for cid, conversation in self.conversations.items():
            if any(str(conversation.root) in str(part) for part in command):
                self.local.cid = cid
        if env and '--worker' in command:
            for cid, conversation in self.conversations.items():
                if conversation.runtime and conversation.runtime['scene'] == env['VARPET_SCENE']:
                    self.local.cid = cid
        return super()._process(command, cancel, env=env, on_output=on_output)

    def propose(self, body, cancel, progress):
        cid = body.get('conversationId')
        self.local.cid = cid
        before = self.conversations[cid].usage if cid in self.conversations else None
        known = self.conversations[cid].usage_known if cid in self.conversations else True
        try:
            reply = super().propose(body, cancel, progress)
            self.local.cid = reply.get('conversationId', self.local.cid)
            return reply
        except Exception as error:
            # Eval transport preserves the actual production thread after a failed proposal.
            return {'type':'error', 'message':str(error), 'conversationId':self.local.cid}
        finally:
            conv = self.conversations.get(self.local.cid)
            usage = recorder.designer.usage_delta(before, conv.usage) if conv and known and conv.usage_known else None
            self.record('turn_telemetry', conversation_id=self.local.cid, usage=usage,
                        model=recorder.designer.MODEL, effort=self.effort, profile=self.profile,
                        usage_limited=self.usage_limited.is_set())

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--port', type=int, default=8794)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    service = Service(args.output, [])
    server = recorder.make_server(service, args.port)
    def stop(*_):
        threading.Thread(target=server.shutdown, daemon=True).start()
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    print(json.dumps({'port':server.server_port, **recorder.designer.default_service_settings()}), flush=True)
    try:
        server.serve_forever()
    finally:
        service.close()
        server.server_close()
