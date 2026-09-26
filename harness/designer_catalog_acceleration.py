"""Own one catalog broker for every conversation in a DesignerService."""
import json
import os
from pathlib import Path
import selectors
import signal
import subprocess
import urllib.request
import designer

class CatalogAcceleration:
    def __init__(self):
        endpoint=designer.designer_mcp_env().get('VARPET_CATALOG_URL','http://100.107.246.46:8765/mcp')
        self.process=subprocess.Popen([str(designer.ROOT/'packages/designer/node_modules/.bin/tsx'),str(designer.ROOT/'packages/designer/src/catalog-service.ts'),endpoint],
            stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,start_new_session=True)
        selector=selectors.DefaultSelector();selector.register(self.process.stdout,selectors.EVENT_READ)
        try:
            if not selector.select(20):raise TimeoutError('Catalog broker startup exceeded 20 seconds')
            self.url=json.loads(self.process.stdout.readline())['url']
            # The broker warms asynchronously; catalog availability must not gate service startup.
        except Exception:
            self.close();raise
        finally:selector.close()

    def call(self,action,data=None,timeout=20):
        body=json.dumps(data).encode() if data is not None else None
        request=urllib.request.Request(self.url+action,data=body,headers={'Content-Type':'application/json'})
        with urllib.request.urlopen(request,timeout=timeout) as response:return json.load(response)

    def context(self,scene,catalog,editor_scene=None,bridge_options=None):
        try:
            result=self.call('context',{'scene':scene,'catalog':catalog,'editor_scene':editor_scene,'bridge_options':bridge_options or {}},timeout=6)
        except Exception:
            return {}  # General tools retain their original unavailable-catalog behavior.
        return {'catalog_proxy':self.url,'catalog_context':result['id'],'catalog_prefix':result['prefix']}

    def close(self):
        if self.process.poll() is None:
            os.killpg(self.process.pid,signal.SIGTERM)
            try:self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:os.killpg(self.process.pid,signal.SIGKILL);self.process.wait()
        if self.process.stdout:self.process.stdout.close()
