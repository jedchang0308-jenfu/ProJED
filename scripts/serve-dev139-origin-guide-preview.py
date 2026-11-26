"""Serve exactly the synthetic standalone preview on loopback for human review."""
import argparse
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--bundle', type=Path, default=Path('output/dev139-origin-guide-preview'))
parser.add_argument('--runtime', type=Path, required=True)
parser.add_argument('--port', type=int, default=0)
args = parser.parse_args()
html = (args.bundle.resolve() / 'index.html').read_bytes()
assert b'connect-src' in html and b"'none'" in html


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        if self.path not in ('/', '/index.html'):
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(html)))
        self.end_headers()
        self.wfile.write(html)


server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
args.runtime.parent.mkdir(parents=True, exist_ok=True)
record = {'status': 'LOCAL_REVIEW_RUNNING', 'pid': os.getpid(), 'port': server.server_port,
          'url': f'http://127.0.0.1:{server.server_port}/', 'script': str(Path(__file__).resolve()),
          'bundle': str(args.bundle.resolve()), 'externalConnections': False,
          'owner': 'DEV-139 origin guide preparation',
          'releaseCondition': 'Stop this exact process after the human has reviewed the guide or asks to close it.'}
with args.runtime.open('x', encoding='utf-8') as output:
    json.dump(record, output, indent=2)
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
    record['status'] = 'STOPPED'
    args.runtime.write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
