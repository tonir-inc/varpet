"""Record the production Designer for the architect-chain experiment (no stubs)."""
import argparse
import importlib.util
from pathlib import Path
import signal
import threading

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("recorded_service", HERE / "demo-e2e-service.py")
recording = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recording)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8792)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    recording.REQUEST_IDS.update({"furnish the bedroom": "bedroom",
                                  "make the living room a place to read": "reading"})
    service = recording.RecordedService(args.output)
    defaults = recording.designer.default_service_settings()
    service.effort, service.profile = defaults["effort"], defaults["profile"]
    server = recording.make_server(service, args.port)
    def stop(*_):
        threading.Thread(target=server.shutdown, daemon=True).start()
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    print({"port": server.server_port, **defaults}, flush=True)
    try:
        server.serve_forever()
    finally:
        service.close()
        server.server_close()


if __name__ == "__main__":
    main()
