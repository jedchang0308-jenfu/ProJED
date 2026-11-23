"""Loopback-only, read-only browser transport for the private DEV-139 candidate.

The existing operator's ID token stays in this process. In particular, neither
page code, Service Workers, disk profiles nor reports receive the token.
This is test transport, not an application gateway or a production auth fix.
"""
import hashlib
import json
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit


CANDIDATE_ORIGIN = 'https://projed-prod-9536592944.asia-east1.run.app'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


def allowed_request(method, target, host, expected_host, origin=None, site=None):
    parsed = urlsplit(target)
    path = unquote(parsed.path)
    return (
        method in ('GET', 'HEAD')
        and host == expected_host
        and origin in (None, 'http://' + expected_host)
        and site in (None, 'none', 'same-origin')
        and not parsed.scheme and not parsed.netloc
        and path.startswith('/') and not path.startswith('//')
        and '\\' not in path and '..' not in path.split('/')
        and not any(ord(char) < 32 for char in target)
        and not path.startswith('/__')
        and (not path.startswith('/api/') or path == '/api/v1/session')
    )


class PrivateCandidateProxy:
    def __init__(self, token):
        self._token = token
        self.entries = []
        self.network_enabled = threading.Event()
        self.network_enabled.set()
        self.navigation_delay = 0
        self.opener = urllib.request.build_opener(NoRedirect())
        owner = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = 'HTTP/1.1'

            def log_message(self, *_args):
                pass

            def respond(self, status, body, headers=None):
                self.send_response(status)
                for key, value in (headers or {}).items():
                    self.send_header(key, value)
                self.send_header('Content-Length', str(len(body)))
                self.send_header('Connection', 'close')
                self.end_headers()
                if self.command != 'HEAD':
                    try:
                        self.wfile.write(body)
                    except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                        pass
                self.close_connection = True

            def handle_request(self):
                path = urlsplit(self.path).path
                item = {'method': self.command, 'path': path}
                owner.entries.append(item)
                if not allowed_request(self.command, self.path, self.headers.get('Host'),
                                       owner.host, self.headers.get('Origin'),
                                       self.headers.get('Sec-Fetch-Site')):
                    item['blocked'] = 'REQUEST_OUTSIDE_READ_ONLY_LOOPBACK_SCOPE'
                    self.respond(403, b'Private candidate test transport denied')
                    return
                if not owner.network_enabled.is_set():
                    item['blocked'] = 'TEST_NETWORK_DISABLED'
                    self.respond(503, b'Test network disabled')
                    return
                if path in ('/', '/quick-task/', '/quick-task/index.html'):
                    time.sleep(owner.navigation_delay)
                request = urllib.request.Request(CANDIDATE_ORIGIN + self.path,
                    method=self.command, headers={'Authorization': 'Bearer ' + owner._token,
                                                 'Accept-Encoding': 'identity'})
                try:
                    response = owner.opener.open(request, timeout=45)
                except urllib.error.HTTPError as error:
                    response = error
                except Exception:
                    item['blocked'] = 'UPSTREAM_TRANSPORT_FAILED'
                    self.respond(502, b'Private candidate upstream unavailable')
                    return
                with response:
                    status = response.code
                    if 300 <= status < 400:
                        item['blocked'] = 'UPSTREAM_REDIRECT_DENIED'
                        self.respond(502, b'Private candidate redirect denied')
                        return
                    body = response.read()
                    headers = {key: value for key, value in response.headers.items()
                               if key.lower() in ('content-type', 'cache-control', 'etag',
                               'last-modified', 'content-encoding', 'service-worker-allowed',
                               'content-security-policy', 'x-content-type-options')}
                item.update(status=status, bytes=len(body), sha256=hashlib.sha256(body).hexdigest())
                self.respond(status, body, headers)

            do_GET = do_HEAD = do_POST = do_PUT = do_PATCH = do_DELETE = do_OPTIONS = handle_request

        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.server.daemon_threads = True
        self.host = '127.0.0.1:' + str(self.server.server_port)
        self.origin = 'http://' + self.host
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def start(self):
        self.thread.start()

    def close(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        self._token = None


def provider_json(url, access_token):
    request = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + access_token})
    with urllib.request.urlopen(request, timeout=40) as response:
        return json.load(response)
