"""Normal App/Quick entry regression. Real Vite pages, isolated HTTP fixtures,
headless Edge, synthetic accounts only; no cloud, real login or installation."""
import argparse
import asyncio
import json
import os
from pathlib import Path
import socket
import subprocess
import time
from urllib.request import urlopen
from urllib.error import HTTPError
from urllib.parse import urlsplit
from playwright.async_api import async_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--report', type=Path, required=True)
args = parser.parse_args()
report = args.report.resolve()
report.mkdir(parents=True, exist_ok=True)
root = Path(__file__).resolve().parents[3]
old = 'https://projed-cc78d.web.app'
new_main = 'https://projed-prod-9536592944.asia-east1.run.app'
new = 'https://projed-prod-56gnizku7q-de.a.run.app'
account = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
intent_id = '11111111-1111-4111-8111-111111111111'
campaign = {'campaign': 'entry-http-test', 'routes': [
    {'entry': entry, 'sourceOrigin': old, 'targetOrigin': new_main if entry == 'main' else new,
     'sourceSessionEntry': 'main', 'targetSessionEntry': 'main' if entry == 'main' else 'quick'}
    for entry in ['main', 'quick']]}


async def run(local):
    checks = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(channel='msedge', headless=True)
        try:
            async def page_for(origin, entry, enabled=True, locator=False):
                context = await browser.new_context(viewport={'width': 390, 'height': 844})
                calls = []
                context_id = '22222222-2222-4222-8222-222222222222' if origin == new else '33333333-3333-4333-8333-333333333333'
                async def route_request(route):
                    url = urlsplit(route.request.url)
                    if f'{url.scheme}://{url.netloc}' not in [old, new, new_main]:
                        await route.abort()
                        return
                    if url.path.startswith('/api/v1/'):
                        calls.append({'path': url.path, 'method': route.request.method,
                                      'headers': route.request.headers, 'body': route.request.post_data})
                        now = int(time.time() * 1000)
                        if url.path == '/api/v1/session':
                            payload = {'localUserId': account, 'email': 'synthetic@example.test', 'displayName': '測試帳號',
                                       'createdAt': 1, 'expiresAt': now + 600000, 'authContextId': context_id,
                                       'entry': 'quick' if origin == new and entry == 'quick' else 'main'}
                        elif url.path == '/api/v1/origin-switch/config':
                            payload = campaign if enabled else None
                        elif url.path.endswith('/confirm'):
                            payload = {'id': intent_id, 'campaign': campaign['campaign'], 'sourceOrigin': old,
                                       'targetOrigin': new, 'accountId': account, 'entry': entry, 'expiresAt': now + 60000,
                                       'destination': {'sourceOrigin': old, 'targetOrigin': new, 'accountId': account,
                                                       'entry': entry, 'workspaceMatched': True, 'permissionsMatched': True,
                                                       'expiresAt': now + 50000}}
                        elif url.path.startswith('/api/v1/origin-switch/intents/'):
                            await route.fulfill(status=403, json={'error': {'code': 'ACCESS_DENIED'}})
                            return
                        else:
                            payload = []
                        await route.fulfill(json={'data': payload})
                        return
                    target = local + url.path + ('?' + url.query if url.query else '')
                    def read():
                        try:
                            with urlopen(target, timeout=15) as response:
                                return response.status, response.read(), response.headers.get('content-type', 'application/octet-stream')
                        except HTTPError as error:
                            return error.code, error.read(), error.headers.get('content-type', 'text/plain')
                    status, body, mime = await asyncio.to_thread(read)
                    await route.fulfill(status=status, body=body, content_type=mime)
                await context.route('**/*', route_request)
                page = await context.new_page()
                page.on('pageerror', lambda error: print('PAGE_ERROR ' + str(error), flush=True))
                await page.goto(origin + ('/quick-task/' if entry == 'quick' else '/')
                                + (f'#projed-origin-switch={intent_id}' if locator else ''), wait_until='domcontentloaded')
                return context, page, calls

            for entry in ['main', 'quick']:
                context, page, calls = await page_for(old, entry, enabled=False)
                await page.wait_for_function("() => document.querySelector('#quick-task-title, #root')")
                for _ in range(200):
                    if any(call['path'] == '/api/v1/origin-switch/config' for call in calls):
                        break
                    await page.wait_for_timeout(100)
                assert any(call['path'] == '/api/v1/origin-switch/config' for call in calls), 'normal bound entry must inspect config'
                assert not await page.locator('[data-origin-switch-entry]').count(), 'disabled config must not show a guide'
                if entry == 'quick':
                    title = page.locator('#quick-task-title')
                    await title.fill('原入口仍可記事')
                    await page.locator('#quick-task-draft-status[data-state="local"]').wait_for()
                    await page.reload(wait_until='domcontentloaded')
                    await page.wait_for_function("() => document.querySelector('#quick-task-title')?.value === '原入口仍可記事'")
                checks.append({'case': f'{entry}-disabled-preserves-normal-entry', 'status': 'PASS'})
                print('PASS ' + checks[-1]['case'], flush=True)
                await context.close()

            context, page, calls = await page_for(old, 'main')
            try:
                await page.get_by_role('button', name='更換網址', exact=True).wait_for(timeout=15000)
            except Exception:
                (report / 'main-failed.json').write_text(json.dumps({'calls': calls, 'body': await page.locator('body').inner_text()}, ensure_ascii=False), encoding='utf-8')
                await page.screenshot(path=str(report / 'main-failed.png'), full_page=True)
                raise
            await page.get_by_role('button', name='更換網址', exact=True).click()
            await page.locator('dialog[open] [data-origin-guide-stage="intro"]').wait_for()
            checks.append({'case': 'main-normal-auth-mounts-real-guide', 'status': 'PASS'})
            print('PASS ' + checks[-1]['case'], flush=True)
            await page.get_by_role('button', name='稍後再做', exact=True).click()
            assert not await page.locator('dialog[open]').count()
            await context.close()

            context, page, calls = await page_for(old, 'quick')
            await page.get_by_role('button', name='更換網址', exact=True).wait_for()
            await page.locator('#quick-task-title').fill('這筆尚未建立')
            await page.locator('#quick-task-draft-status[data-state="local"]').wait_for()
            await page.get_by_role('button', name='更換網址', exact=True).click()
            await page.get_by_role('button', name='開始更換', exact=True).click()
            await page.get_by_role('alert').wait_for()
            assert await page.locator('[data-origin-guide-stage="drafts"]').count()
            assert not [call for call in calls if call['method'] == 'POST' and '/origin-switch/' in call['path']]
            checks.append({'case': 'quick-source-local-draft-blocks-real-http-intent', 'status': 'PASS'})
            print('PASS ' + checks[-1]['case'], flush=True)
            await page.screenshot(path=str(report / 'source-pending.png'), full_page=True)
            await context.close()

            context, page, calls = await page_for(new, 'quick', locator=True)
            await page.get_by_role('button', name='確認帳號與權限', exact=True).wait_for()
            assert urlsplit(page.url).fragment == ''
            assert await page.evaluate("sessionStorage.getItem('projed.origin-switch.locator.v1:quick')") == intent_id
            await page.get_by_role('button', name='確認帳號與權限', exact=True).click()
            await page.get_by_role('link', name='回原網址繼續', exact=True).wait_for()
            posts = [call for call in calls if call['path'].endswith('/confirm')]
            assert len(posts) == 1 and json.loads(posts[0]['body']) == {}
            assert posts[0]['headers']['x-projed-expected-account-id'] == account
            assert posts[0]['headers']['x-projed-expected-context-id'] == '22222222-2222-4222-8222-222222222222'
            assert not [call for call in calls if '/intents/' in call['path'] and call['method'] == 'GET']
            assert not await page.locator('[data-origin-guide-stage="complete"]').count()
            assert '回原網址完成記事檢查' in await page.locator('body').inner_text()
            checks.append({'case': 'target-own-session-confirms-without-source-draft-completion', 'status': 'PASS'})
            await page.screenshot(path=str(report / 'target-confirmed.png'), full_page=True)
            await context.close()
        finally:
            await browser.close()
    return {'checks': checks, 'status': 'PASS', 'scope': 'normal frontend entries with isolated HTTP fixtures', 'cloud': 'NOT_RUN'}


with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
env = dict(os.environ, VITE_DATA_BACKEND='http')
with (report / 'vite.log').open('w', encoding='utf-8') as log:
    config_file = report / 'vite.entry.config.mjs'
    config_file.write_text('import base from ' + json.dumps((root / 'vite.config.js').as_uri())
                           + '; export default async env => ({...await base(env),cacheDir:'
                           + json.dumps(str(report / 'vite-cache')) + '});', encoding='utf-8')
    process = subprocess.Popen(['node', 'node_modules/vite/bin/vite.js', '--mode', 'test', '--host', '127.0.0.1',
                                '--port', str(port), '--strictPort', '--config', str(config_file), '--configLoader', 'native'],
                               cwd=root, env=env, stdout=log, stderr=log)
    (report / 'runtime.json').write_text(json.dumps({'pid': process.pid, 'port': port, 'purpose': 'normal-origin-entry-http'}))
    try:
        local = f'http://127.0.0.1:{port}'
        for _ in range(100):
            try:
                with urlopen(local, timeout=1):
                    break
            except OSError:
                if process.poll() is not None:
                    raise RuntimeError('task-owned Vite exited')
                time.sleep(.1)
        result = asyncio.run(run(local))
        (report / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(result, ensure_ascii=False))
    finally:
        process.terminate()
        process.wait(timeout=10)
