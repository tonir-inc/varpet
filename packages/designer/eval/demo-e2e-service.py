"""Observation-only wrapper around the production HTTP service and real SDK worker."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import signal
import sys
import threading

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'harness'))
from designer_service import DesignerService, make_server
import designer

REQUEST_IDS = {
    'Make the living room feel bigger': 'rearrange',
    'Paint the bedroom walls a soft sage green': 'colour',
    'Add an armchair for reading by the window': 'catalog',
    'Make it cozier': 'question',
    'Knock down the wall between the kitchen and living room': 'decline',
}


class RecordedService(DesignerService):
    def __init__(self, output):
        super().__init__(idle_timeout=180)
        self.output = output
        self.local = threading.local()
        self.usage_limited = threading.Event()

    def record(self, kind, **data):
        with (self.output / (self.local.run_id + '.events.jsonl')).open('a') as stream:
            stream.write(json.dumps({'timestamp': datetime.now(timezone.utc).isoformat(), 'kind': kind, **data}, ensure_ascii=False) + '\n')

    def propose(self, body, cancel, progress):
        self.local.run_id = REQUEST_IDS[body['request']]
        self.record('request', body=body)
        try:
            reply = super().propose(body, cancel, progress)
            self.record('service_reply', reply=reply)
            return reply
        except Exception as error:
            self.record('service_error', error=str(error))
            raise

    def _process(self, command, cancel, *, env=None, on_output=None):
        stage = 'worker' if '--worker' in command else 'to-designer' if 'to-designer' in command else 'to-command'
        self.record('process_start', stage=stage, command=command)
        if env and stage == 'worker':
            self.record('designer_scene', scene=json.loads(Path(env['VARPET_SCENE']).read_text()))
        stderr_tail = ''

        def capture(channel, chunk):
            nonlocal stderr_tail
            self.record('process_output', stage=stage, channel=channel, chunk=chunk)
            if channel == 'stderr':
                stderr_tail = (stderr_tail + chunk)[-4096:]
                if 'usage limit' in stderr_tail.lower():
                    self.usage_limited.set()
                    print('EVAL_USAGE_LIMIT', file=sys.stderr, flush=True)
                    with self.condition:
                        for active in self.active:
                            active.set()
            if on_output:
                on_output(channel, chunk)
        try:
            result = super()._process(command, cancel, env=env, on_output=capture)
            self.record('process_end', stage=stage, seconds=result.seconds, returncode=result.returncode)
            return result
        finally:
            # Copy only proposal evidence, never the runtime home or auth symlink.
            if env and stage == 'worker':
                for path in sorted(Path(env['VARPET_PROPOSALS_DIR']).glob('*.json')):
                    self.record('saved_proposal', proposal=json.loads(path.read_text()))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    service = RecordedService(args.output)
    server = make_server(service, 0)
    def shutdown(*_):
        threading.Thread(target=server.shutdown, daemon=True).start()
    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    configured = designer.designer_mcp_env().get('VARPET_CATALOG_URL')
    print(json.dumps({'port': server.server_port, 'model': designer.MODEL, 'effort': 'medium',
                      'catalog_endpoint_is_local_tunnel': configured == 'http://localhost:8765/mcp'}), flush=True)
    try:
        server.serve_forever()
    finally:
        service.close()
        server.server_close()


if __name__ == '__main__':
    main()
