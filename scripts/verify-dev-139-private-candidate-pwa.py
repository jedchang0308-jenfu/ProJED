"""Real private candidate via read-only loopback auth; no cloud/data writes.

Profiles contain synthetic local drafts only and are removed after checking
actual browser-process restarts. Overnight is a 13-hour clock simulation.
"""
import argparse
import asyncio
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid

from playwright.async_api import async_playwright

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
from dev139_private_candidate_proxy import CANDIDATE_ORIGIN, PrivateCandidateProxy, provider_json


async def verify_browser(proxy, report, profile):
    def check(name, value):
        report['checks'].append({'name': name, 'pass': bool(value)})
        assert value, name
        print('PASS ' + name, flush=True)

    async with async_playwright() as playwright:
        context = None

        async def launch(offline=False):
            context = await playwright.chromium.launch_persistent_context(str(profile),
                channel='msedge', headless=True, viewport={'width': 390, 'height': 844},
                args=['--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'])
            context.set_default_timeout(15000)
            await context.set_offline(offline)
            async def guard(route):
                if route.request.url.startswith(proxy.origin + '/') and route.request.method in ('GET', 'HEAD'):
                    await route.continue_()
                else:
                    report['browserBlockedRequests'].append({'method': route.request.method,
                        'origin': route.request.url.split('?', 1)[0]})
                    await route.abort()
            await context.route('**/*', guard)
            context.on('page', lambda page: page.on('pageerror', lambda error:
                report['browserErrors'].append(str(error)[:500])))
            if offline:
                await context.add_init_script('Date.now = ((now) => () => now() + 13*60*60*1000)(Date.now);')
            return context

        async def open_quick(context, name, query=''):
            page = await context.new_page()
            started = time.monotonic()
            await page.goto(proxy.origin + '/quick-task/' + query, wait_until='domcontentloaded', timeout=45000)
            field = page.locator('#quick-task-title')
            await field.wait_for(state='visible')
            check(name + '-input-enabled', await field.is_enabled())
            report['timingsMs'][name] = round((time.monotonic() - started) * 1000, 1)
            return page, field

        try:
            context = await launch()
            page, field = await open_quick(context, 'first-visit')
            text = 'DEV139 private candidate synthetic ' + uuid.uuid4().hex
            await field.fill(text)
            await page.locator('#quick-task-draft-status[data-state="local"]').wait_for()
            check('input-saved-as-local-only', await field.input_value() == text)
            ready = await page.evaluate('''() => Promise.race([
                navigator.serviceWorker.ready.then(() => true),
                new Promise(resolve => setTimeout(() => resolve(false), 45000))])''')
            check('real-candidate-service-worker-activated', ready)
            await page.reload(wait_until='domcontentloaded')
            await page.wait_for_function('navigator.serviceWorker.controller !== null')
            await page.locator('#quick-task-draft-status[data-state="restored"]').wait_for()
            check('online-reload-restores-draft', await field.input_value() == text)
            check('service-worker-fetched-authenticated-upstream', any(
                row['path'] == '/sw.js' and row.get('status') == 200 for row in proxy.entries))
            report['worker'] = await page.evaluate('''async () => ({
                controller: navigator.serviceWorker.controller.scriptURL,
                caches: await caches.keys(), secureContext: isSecureContext})''')
            check('loopback-is-secure-context', report['worker']['secureContext'])
            await page.close()
            proxy.navigation_delay = 6
            page, field = await open_quick(context, 'cached-weak-network', '?entry=note')
            await page.locator('#quick-task-draft-status[data-state="restored"]').wait_for()
            check('weak-network-reopen-restores-draft', await field.input_value() == text)
            await context.close()
            context = None
            report['browserProcessRestarts'] += 1

            proxy.navigation_delay = 0
            proxy.network_enabled.clear()
            offline_start = len(proxy.entries)
            context = await launch(offline=True)
            page, field = await open_quick(context, 'overnight-cached-offline', '?entry=note')
            await page.locator('#quick-task-draft-status[data-state="restored"]').wait_for()
            check('simulated-overnight-process-restart-restores-draft', await field.input_value() == text)
            check('cached-offline-page-is-worker-controlled', await page.evaluate('navigator.serviceWorker.controller !== null'))
            offline_text = text + ' offline edit'
            await field.fill(offline_text)
            await page.locator('#quick-task-draft-status[data-state="local"]').wait_for()
            check('offline-input-confirmed-local-only', await field.input_value() == offline_text)
            await context.close()
            context = None
            report['browserProcessRestarts'] += 1

            context = await launch(offline=True)
            page, field = await open_quick(context, 'offline-second-restart')
            await page.locator('#quick-task-draft-status[data-state="restored"]').wait_for()
            check('offline-edit-survives-second-browser-process-restart', await field.input_value() == offline_text)
            check('offline-had-no-successful-upstream-response', not any(
                row.get('status') == 200 for row in proxy.entries[offline_start:]))
            proxy.network_enabled.set()
            await context.set_offline(False)
            await page.reload(wait_until='domcontentloaded')
            await page.locator('#quick-task-draft-status[data-state="restored"]').wait_for()
            check('reconnection-keeps-unsynced-draft', await field.input_value() == offline_text)
            check('no-business-write-or-model-request', not any(row['method'] not in ('GET', 'HEAD') for row in proxy.entries)
                  and not report['browserBlockedRequests'])
            check('no-browser-runtime-errors', not report['browserErrors'])
            report['status'] = 'PASS'
        except Exception:
            if context:
                pages = context.pages
                if pages:
                    report['failureDiagnostic'] = await pages[-1].evaluate('''() => ({
                        path: location.pathname,
                        title: document.querySelector('#quick-task-title')?.value,
                        draftState: document.querySelector('#quick-task-draft-status')?.dataset.state,
                        draftText: document.querySelector('#quick-task-draft-status')?.textContent,
                        workerControlled: Boolean(navigator.serviceWorker.controller)})''')
            raise
        finally:
            if context:
                await context.close()
            report['ownedBrowserClosed'] = True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--deployment-proof', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args()
    proof = json.loads(args.deployment_proof.read_text(encoding='utf-8'))
    assert proof['status'] == 'IAM_PROTECTED_CANDIDATE_DEPLOYED'
    assert CANDIDATE_ORIGIN in [proof['uri'], *proof.get('urls', [])]
    assert proof['revision'].startswith('projects/jenfu-platform-prod/locations/asia-east1/services/projed-prod/revisions/')
    args.report.parent.mkdir(parents=True, exist_ok=True)
    assert not args.report.exists(), 'Keep previous evidence: choose a fresh report path'
    report = {'status': 'RUNNING', 'sourceRevision': proof['sourceRevision'],
        'verificationSourceRevision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
        'harnessSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'proxySha256': hashlib.sha256((Path(__file__).parent / 'lib' / 'dev139_private_candidate_proxy.py').read_bytes()).hexdigest(),
        'revision': proof['revision'], 'upstreamOrigin': CANDIDATE_ORIGIN,
        'scope': 'REAL_PRIVATE_CANDIDATE_VIA_LOOPBACK_READ_ONLY_AUTH_PROXY',
        'directRunAppBrowserAcceptance': 'NOT_CLAIMED_PRIVATE_IAM_UNCHANGED',
        'realAppSession': 'NOT_ENABLED_NOT_ACCEPTED', 'overnight': 'SIMULATED_13_HOURS_NOT_REAL_ELAPSED',
        'checks': [], 'timingsMs': {}, 'browserProcessRestarts': 0,
        'browserBlockedRequests': [], 'browserErrors': []}
    proxy = None
    profile = None
    tokens = []
    try:
        def token(kind):
            result = subprocess.run([shutil.which('gcloud.cmd'), 'auth', kind,
                '--account=jedchang0308@jenfu.com.tw'], capture_output=True, text=True, timeout=90)
            assert result.returncode == 0, 'EXISTING_OPERATOR_AUTH_UNAVAILABLE'
            value = result.stdout.strip()
            assert value
            tokens.append(value)
            return value
        access = token('print-access-token')
        base = 'https://run.googleapis.com/v2/projects/jenfu-platform-prod/locations/asia-east1/services/projed-prod'
        service = provider_json(base, access)
        assert not service.get('invokerIamDisabled', False)
        assert service['latestReadyRevision'] == proof['revision']
        assert not service.get('reconciling') and service['terminalCondition']['state'] == 'CONDITION_SUCCEEDED'
        revision = provider_json('https://run.googleapis.com/v2/' + proof['revision'], access)
        assert {row['name']: row['image'] for row in revision['containers']} == proof['images']
        policy_before = provider_json(base + ':getIamPolicy?options.requestedPolicyVersion=3', access)
        assert not any(member in ('allUsers', 'allAuthenticatedUsers')
            for binding in policy_before.get('bindings', []) for member in binding.get('members', []))
        try:
            urllib.request.urlopen(CANDIDATE_ORIGIN + '/sw.js', timeout=40)
        except urllib.error.HTTPError as error:
            report['anonymousWorkerStatus'] = error.code
        assert report.get('anonymousWorkerStatus') in (401, 403)
        proxy = PrivateCandidateProxy(token('print-identity-token'))
        proxy.start()
        report['testOrigin'] = proxy.origin
        report['ownedProcessId'] = os.getpid()
        profile = Path(tempfile.mkdtemp(prefix='dev139-private-pwa-', dir=args.report.parent))
        asyncio.run(verify_browser(proxy, report, profile))
        policy_after = provider_json(base + ':getIamPolicy?options.requestedPolicyVersion=3', access)
        assert policy_before == policy_after, 'CANDIDATE_IAM_POLICY_CHANGED'
        report['iamPolicyUnchanged'] = True
        report['providerRevisionUnchanged'] = provider_json(base, access)['latestReadyRevision'] == proof['revision']
        assert report['providerRevisionUnchanged']
    except Exception as error:
        report['status'] = 'FAILED'
        failure = type(error).__name__ + ': ' + str(error)
        for value in tokens:
            failure = failure.replace(value, '[REDACTED]')
        report['failure'] = failure[:2500]
    finally:
        if proxy:
            report['proxyRequests'] = proxy.entries
            proxy.close()
            with socket.socket() as check:
                report['ownedProxyPortReleased'] = check.connect_ex(('127.0.0.1', proxy.server.server_port)) != 0
        if profile:
            assert profile.resolve().parent == args.report.parent.resolve() and profile.name.startswith('dev139-private-pwa-')
            shutil.rmtree(profile)
            report['ownedSyntheticProfileRemoved'] = not profile.exists()
        report['businessWrites'] = False
        report['modelInvocations'] = False
        report['trafficCutover'] = False
        # Scan the serialized evidence before any disk write or output.
        serialized = json.dumps(report, ensure_ascii=True, indent=2)
        assert not any(value in serialized for value in tokens), 'TOKEN_IN_REPORT_REFUSED'
        args.report.write_text(serialized + '\n', encoding='utf-8')
    print(json.dumps({key: report.get(key) for key in ('status', 'revision', 'testOrigin', 'timingsMs',
        'failure', 'iamPolicyUnchanged', 'ownedBrowserClosed', 'ownedProxyPortReleased', 'ownedSyntheticProfileRemoved')}))
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
