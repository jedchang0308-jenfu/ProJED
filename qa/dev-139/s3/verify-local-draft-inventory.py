"""Local inventory regression: synthetic data, real IndexedDB, no cloud connections."""
import argparse
import asyncio
import json
import socket
import subprocess
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.async_api import async_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--report', type=Path, required=True)
options = parser.parse_args()
report = options.report.resolve()
report.mkdir(parents=True, exist_ok=True)
subprocess.run(['node', '--input-type=module', '-e',
                "import {build} from 'esbuild'; await build({entryPoints:['qa/dev-139/s3/localDraftInventory.browser.ts'],"
                "bundle:true,format:'iife',globalName:'Inventory',outfile:process.argv[1]});", str(report / 'inventory.js')], check=True)
(report / 'index.html').write_text('<!doctype html><meta charset="utf-8"><script src="/inventory.js"></script>', encoding='utf-8')


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


async def run(origin):
    external = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(channel='msedge', headless=True)
        try:
            context = await browser.new_context()
            await context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin + '/')
                                else (external.append(route.request.url), route.abort())[1])
            page = await context.new_page()
            page.on('console', lambda message: print(message.text, flush=True))
            await page.goto(origin, wait_until='load')
            result = await asyncio.wait_for(page.evaluate('Inventory.runInventoryChecks()'), timeout=45)
            if external:
                raise AssertionError('unexpected external request')
            result['externalRequests'] = len(external)
            result['cleanup'] = 'ISOLATED_CONTEXT_CLOSED'
            return result
        finally:
            await browser.close()


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(report)))
port = server.server_port
(report / 'runtime.json').write_text(json.dumps({'purpose': 'dev139-local-draft-inventory', 'port': port}), encoding='utf-8')
worker = threading.Thread(target=server.serve_forever, daemon=True)
worker.start()
try:
    result = asyncio.run(run(f'http://127.0.0.1:{server.server_port}'))
    (report / 'result.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result))
except Exception as error:
    (report / 'failure.json').write_text(json.dumps({'status': 'FAIL', 'error': str(error)}), encoding='utf-8')
    raise
finally:
    server.shutdown()
    server.server_close()
    worker.join(timeout=5)
with socket.socket() as probe:
    probe.settimeout(1)
    released = probe.connect_ex(('127.0.0.1', port)) != 0
if not released:
    raise AssertionError('task-owned server port was not released')
result['loopbackPortReleased'] = released
(report / 'result.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
