"""Guard the token-bearing transport, independently of browser behavior."""
from pathlib import Path
import sys
import unittest

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'scripts' / 'lib'))
from dev139_private_candidate_proxy import NoRedirect, allowed_request


class TransportScopeTest(unittest.TestCase):
    def allowed(self, method='GET', target='/sw.js', host='127.0.0.1:43210', origin=None, site=None):
        return allowed_request(method, target, host, '127.0.0.1:43210', origin, site)

    def test_worker_and_version_assets_use_only_loopback(self):
        for target in ['/sw.js', '/workbox-123.js', '/quick-task/?entry=note', '/api/v1/session',
                       '/app-releases/release-a/assets/quick.js']:
            with self.subTest(target=target):
                self.assertTrue(self.allowed(target=target))

    def test_non_get_writes_and_business_reads_never_forward(self):
        for method in ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'CONNECT']:
            with self.subTest(method=method):
                self.assertFalse(self.allowed(method=method))
        for target in ['/api/v1/workspaces', '/api/v1/meeting', '/__local-fixtures/mock.js']:
            self.assertFalse(self.allowed(target=target))

    def test_external_or_encoded_destinations_cannot_receive_operator_token(self):
        for target in ['https://evil.invalid/sw.js', '//evil.invalid/sw.js', '/%2e%2e/api/v1/workspaces',
                       '/%2f%2fevil.invalid/sw.js', '/foo%5cbar', '/sw.js\r\nX-Injected: value']:
            with self.subTest(target=target):
                self.assertFalse(self.allowed(target=target))
        self.assertFalse(self.allowed(host='evil.invalid'))
        self.assertFalse(self.allowed(origin='https://evil.invalid'))
        self.assertFalse(self.allowed(site='cross-site'))

    def test_upstream_redirects_are_never_followed(self):
        self.assertIsNone(NoRedirect().redirect_request(None, None, None, None, None, 'https://evil.invalid'))


if __name__ == '__main__':
    unittest.main()
