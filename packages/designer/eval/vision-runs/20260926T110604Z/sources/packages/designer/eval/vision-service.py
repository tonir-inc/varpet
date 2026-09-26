"""Two real HTTP services differing only in first-turn image input; observation only."""
import argparse
import importlib.util
import json
from pathlib import Path
import signal
import threading

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('demo_recorder', HERE / 'demo-e2e-service.py')
recorder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recorder)


class VisionService(recorder.RecordedService):
    def __init__(self, output, images):
        recorder.DesignerService.__init__(self, idle_timeout=180, image_paths=images,
                                          **recorder.designer.default_service_settings())
        self.output = output
        self.local = threading.local()
        self.usage_limited = threading.Event()

    def propose(self, body, cancel, progress):
        body = dict(body)
        self.local.run_id = body.pop('_evalRunId')
        if not self.local.run_id.replace('-', '').isalnum():
            raise ValueError('Invalid eval ID')
        self.record('request', body=body)
        try:
            reply = recorder.DesignerService.propose(self, body, cancel, progress)
            self.record('service_reply', reply=reply)
            return reply
        except Exception as error:
            self.record('service_error', error=str(error))
            raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    images = [str(HERE / 'vision-fixtures' / name) for name in ('avani-plan.png', 'avani-3d.png')]
    services = {name: VisionService(args.output, paths) for name, paths in [('text', []), ('images', images)]}
    servers = {name: recorder.make_server(service, 0) for name, service in services.items()}
    stopped = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stopped.set())
    signal.signal(signal.SIGINT, lambda *_: stopped.set())
    for server in servers.values():
        threading.Thread(target=server.serve_forever, daemon=True).start()
    print(json.dumps({'ports': {name: server.server_port for name, server in servers.items()},
                      'model': recorder.designer.MODEL, **recorder.designer.default_service_settings()}), flush=True)
    stopped.wait()
    for service in services.values():
        service.close()
    for server in servers.values():
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
