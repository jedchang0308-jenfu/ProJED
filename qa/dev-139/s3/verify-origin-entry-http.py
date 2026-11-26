"""Normal App/Quick entry regression. Real Vite pages, isolated HTTP fixtures,
headless Edge, synthetic accounts only; no cloud, real login or installation."""
import argparse
import asyncio
import json
import os
import re
from pathlib import Path
import socket
import subprocess
import time
from urllib.request import urlopen
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit
from playwright.async_api import async_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--report', type=Path, required=True)
parser.add_argument('--login-recovery-only', action='store_true', help='Run only the affected visible login recovery cases')
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
    failures = []
    def record(case, status='PASS', **details):
        checks.append({'case': case, 'status': status, **details})
        snapshot = {'checks': checks, 'status': 'FAIL' if failures else 'RUNNING',
                    'scope': 'normal frontend entries with isolated HTTP fixtures', 'cloud': 'NOT_RUN'}
        (report / 'result.json').write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding='utf-8')
        print(status + ' ' + case, flush=True)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(channel='msedge', headless=True)
        try:
            async def page_for(origin, entry, enabled=True, locator=False, fixed_intent=False, controls=None,
                               session_error=None, return_path=None):
                context = await browser.new_context(viewport={'width': 390, 'height': 844})
                calls = []
                context_ids = {old: '33333333-3333-4333-8333-333333333333',
                               new_main: '44444444-4444-4444-8444-444444444444',
                               new: '22222222-2222-4222-8222-222222222222'}
                intents = {}
                if fixed_intent:
                    await context.add_init_script("Object.defineProperty(crypto, 'randomUUID', {value: () => '" + intent_id + "'});")
                if locator:
                    intents[intent_id] = {'id': intent_id, 'campaign': campaign['campaign'], 'sourceOrigin': old,
                                          'targetOrigin': new_main if entry == 'main' else new, 'accountId': account,
                                          'entry': entry, 'expiresAt': int(time.time() * 1000) + 300000, 'destination': None}
                async def route_request(route):
                    url = urlsplit(route.request.url)
                    request_origin = f'{url.scheme}://{url.netloc}'
                    if request_origin not in context_ids:
                        await route.abort()
                        return
                    if url.path == '/api/sso/authorize':
                        await route.fulfill(content_type='text/html', body='<p data-synthetic-broker>合成登入頁</p>')
                        return
                    if url.path.startswith('/api/v1/'):
                        calls.append({'url': route.request.url, 'origin': request_origin, 'path': url.path, 'method': route.request.method,
                                      'headers': route.request.headers, 'body': route.request.post_data})
                        now = int(time.time() * 1000)
                        if url.path == '/api/v1/session':
                            if session_error:
                                status, code = session_error
                                await route.fulfill(status=status, headers={'Cache-Control': 'no-store'},
                                                    json={'error': {'code': code, 'retryable': False}})
                                return
                            payload = {'localUserId': account, 'email': 'synthetic@example.test', 'displayName': '測試帳號',
                                       'createdAt': 1, 'expiresAt': now + 600000, 'authContextId': context_ids[request_origin],
                                       'entry': 'quick' if request_origin == new else 'main'}
                        elif url.path == '/api/v1/session/login':
                            query = urlencode({'client_id': 'projed', 'redirect_uri': request_origin + '/api/auth/jenfu-sso/callback',
                                               'response_type': 'code', 'code_challenge': 'A' * 43,
                                               'code_challenge_method': 'S256', 'state': 'B' * 43})
                            payload = {'authorizationUrl': request_origin + '/api/sso/authorize?' + query}
                        elif url.path == '/api/v1/origin-switch/config':
                            payload = campaign if enabled else None
                        elif url.path.startswith('/api/v1/origin-switch/intents'):
                            headers = route.request.headers
                            if headers.get('x-projed-expected-account-id') != account or headers.get('x-projed-expected-context-id') != context_ids[request_origin]:
                                await route.fulfill(status=409, json={'error': {'code': 'ACTOR_CHANGED'}})
                                return
                            if url.path == '/api/v1/origin-switch/intents' and route.request.method == 'POST':
                                body = route.request.post_data_json
                                matching = next((value for value in campaign['routes'] if value['entry'] == body.get('entry')
                                                 and value['sourceOrigin'] == request_origin and value['targetOrigin'] == body.get('targetOrigin')), None)
                                if not matching or set(body) != {'id', 'campaign', 'entry', 'targetOrigin'} or body['campaign'] != campaign['campaign']:
                                    await route.fulfill(status=403, json={'error': {'code': 'ACCESS_DENIED'}})
                                    return
                                if controls is not None:
                                    controls['create_started'].set()
                                    await controls['release_create'].wait()
                                intents[body['id']] = {'id': body['id'], 'campaign': body['campaign'], 'sourceOrigin': request_origin,
                                                       'targetOrigin': matching['targetOrigin'], 'accountId': account, 'entry': body['entry'],
                                                       'expiresAt': now + 300000, 'destination': None}
                                payload = {key: value for key, value in intents[body['id']].items() if key != 'destination'}
                            else:
                                path_id = url.path.split('/')[5]
                                stored = intents.get(path_id)
                                if url.path.endswith('/confirm') and route.request.method == 'POST':
                                    if not stored or request_origin != stored['targetOrigin'] or route.request.post_data_json != {}:
                                        await route.fulfill(status=403, json={'error': {'code': 'ACCESS_DENIED'}})
                                        return
                                    stored['destination'] = {'sourceOrigin': stored['sourceOrigin'], 'targetOrigin': stored['targetOrigin'],
                                                             'accountId': account, 'entry': stored['entry'], 'workspaceMatched': True,
                                                             'permissionsMatched': True, 'expiresAt': stored['expiresAt']}
                                    payload = stored
                                elif request_origin == old:
                                    payload = stored
                                elif stored and request_origin == stored['targetOrigin'] and stored['destination']:
                                    payload = stored
                                else:
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
                await page.goto(origin + (return_path or ('/quick-task/' if entry == 'quick' else '/'))
                                + (f'#projed-origin-switch={intent_id}' if locator else ''), wait_until='domcontentloaded')
                return context, page, calls

            for entry in ([] if args.login_recovery_only else ['main', 'quick']):
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

            # A fenced Session must allow the normal visible login action, while
            # an account denial must stay denied. Neither may silently sign in.
            for origin_key, origin in [('old', old), ('new', new_main)]:
                for status, code in [(409, 'IDENTITY_MAPPING_CONFLICT'), (403, 'ACCESS_DENIED')]:
                    case = f'main-{origin_key}-{code.lower()}-visible-login'
                    return_path = '/?board=recovery-board'
                    context, page, calls = await page_for(origin, 'main', enabled=False,
                                                         session_error=(status, code), return_path=return_path)
                    try:
                        login = page.get_by_role('button', name=re.compile(r'檢查 Jenfu-Platform 登入$'))
                        await login.wait_for(timeout=15000)
                        assert not [call for call in calls if call['path'] == '/api/v1/session/login'], 'no automatic login'
                        assert not await page.locator('[data-origin-switch-entry]').count(), 'no guide without a valid Session'
                        await login.click()
                        if status == 409:
                            await page.locator('[data-synthetic-broker]').wait_for(timeout=10000)
                            posts = [call for call in calls if call['path'] == '/api/v1/session/login']
                            assert len(posts) == 1 and posts[0]['method'] == 'POST'
                            assert json.loads(posts[0]['body']) == {'entry': 'main', 'returnPath': return_path}
                            assert page.url.startswith(origin + '/api/sso/authorize?')
                            await page.go_back(wait_until='domcontentloaded')
                            await page.get_by_role('button', name=re.compile(r'檢查 Jenfu-Platform 登入$')).wait_for()
                            await page.wait_for_load_state('networkidle', timeout=5000)
                            assert len([call for call in calls if call['path'] == '/api/v1/session/login']) == 1, 'back must not loop into SSO'
                        else:
                            await page.get_by_text('ACCESS_DENIED', exact=True).wait_for()
                            assert page.url == origin + return_path
                            assert not [call for call in calls if call['path'] == '/api/v1/session/login'], 'denial must not become login'
                        assert not [call for call in calls if call['path'].split('/')[3] in ('workspaces', 'tasks', 'records')], 'no private data before authentication'
                        record(case)
                    except Exception as error:
                        failures.append({'entry': 'main', 'phase': case, 'error': type(error).__name__, 'url': page.url})
                        (report / f'{case}-failure.json').write_text(json.dumps({'url': page.url, 'error': str(error),
                            'calls': calls, 'body': await page.locator('body').inner_text()}, ensure_ascii=False, indent=2), encoding='utf-8')
                        record(case, 'FAIL', url=page.url)
                    finally:
                        await context.close()

            if args.login_recovery_only:
                return {'checks': checks, 'status': 'FAIL' if failures else 'PASS', 'failures': failures,
                        'scope': 'normal main login recovery with isolated HTTP fixtures', 'cloud': 'NOT_RUN'}

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

            # Full normal endpoints: no fixture panel, no direct guide/controller
            # calls. Every cross-origin hop is a real page navigation, including
            # the final completed-guide action that previously stayed on source.
            for entry, late_draft in [('main', False), ('quick', False), ('main', True)]:
                context, page, calls = await page_for(old, entry, fixed_intent=True)
                case_key = f'{entry}-late-draft' if late_draft else entry
                target_origin = new_main if entry == 'main' else new
                expected_path = '/' if entry == 'main' else '/quick-task/'
                phase = 'source-start'
                try:
                    await page.get_by_role('button', name='更換網址', exact=True).click(timeout=20000)
                    await page.get_by_role('button', name='開始更換', exact=True).click()
                    await page.locator('[data-origin-guide-stage="account"]').wait_for(timeout=15000)
                    phase = 'target-navigation'
                    await page.get_by_role('button', name='前往新網址登入', exact=False).click()
                    await page.wait_for_url(lambda url: str(url).startswith(target_origin + expected_path), timeout=15000)
                    await page.get_by_role('button', name='確認帳號與權限', exact=True).wait_for()
                    assert urlsplit(page.url).fragment == ''
                    creates = [call for call in calls if call['path'] == '/api/v1/origin-switch/intents' and call['method'] == 'POST']
                    assert len(creates) == 1 and json.loads(creates[0]['body'])['id'] == intent_id
                    phase = 'target-confirm'
                    await page.get_by_role('button', name='確認帳號與權限', exact=True).click()
                    await page.get_by_role('link', name='回原網址繼續', exact=True).wait_for()
                    assert not await page.locator('[data-origin-guide-stage="complete"]').count()
                    confirms = [call for call in calls if call['path'].endswith('/confirm')]
                    assert len(confirms) == 1 and confirms[0]['origin'] == target_origin
                    assert confirms[0]['headers']['x-projed-expected-context-id'] == (
                        '44444444-4444-4444-8444-444444444444' if entry == 'main' else '22222222-2222-4222-8222-222222222222')
                    phase = 'source-resume'
                    await page.get_by_role('link', name='回原網址繼續', exact=True).click()
                    await page.wait_for_url(old + expected_path)
                    await page.get_by_role('button', name='更換網址', exact=True).click()
                    await page.get_by_role('button', name='繼續上次的步驟', exact=True).click()
                    await page.locator('[data-origin-guide-stage="entry"]').wait_for()
                    await page.get_by_role('radio', name='先用瀏覽器', exact=True).check()
                    await page.get_by_role('checkbox').check()
                    await page.get_by_role('button', name='完成更換', exact=True).click()
                    await page.locator('[data-origin-guide-stage="complete"]').wait_for()
                    source_reads = [call for call in calls if call['origin'] == old and call['method'] == 'GET'
                                    and call['path'] == '/api/v1/origin-switch/intents/' + intent_id]
                    assert len(source_reads) >= 2
                    await page.screenshot(path=str(report / f'{case_key}-complete-before-final.png'), full_page=True)
                    if late_draft:
                        phase = 'controlled-late-record-draft'
                        # A controlled late production-store event while the
                        # guide modal is open, not claimed as user input outside
                        # the modal. The real RecordSidebar/owner remain active.
                        await page.evaluate("""async () => {
                            const {default: records} = await import('/src/store/useRecordStore.ts');
                            records.getState().openNewRecord('work_log');
                            records.getState().updateDraft({title: '完成後才抵達的未保存草稿', content: '仍需留在原網址保存'});
                        }""")
                        await page.wait_for_function("() => document.querySelector('[data-record-title-input]')?.value === '完成後才抵達的未保存草稿'")
                        await page.get_by_role('button', name='開始使用 ProJED', exact=True).click()
                        await page.locator('[data-origin-guide-stage="drafts"]').wait_for(timeout=10000)
                        assert page.url == old + expected_path
                        assert await page.locator('[data-record-title-input]').input_value() == '完成後才抵達的未保存草稿'
                        assert await page.evaluate("""async () => {
                            const {default: records} = await import('/src/store/useRecordStore.ts');
                            const {getPwaReloadSafetySnapshot} = await import('/src/services/pwaReloadSafety.ts');
                            return records.getState().draft?.title === '完成後才抵達的未保存草稿'
                              && getPwaReloadSafetySnapshot().owners.some(owner => owner.ownerId === 'record-draft' && owner.state === 'dirty');
                        }""")
                        assert len([call for call in calls if call['path'] == '/api/v1/origin-switch/intents' and call['method'] == 'POST']) == 1
                        await page.screenshot(path=str(report / 'main-controlled-late-draft-blocked.png'), full_page=True)
                        record('main-controlled-late-record-draft-blocks-completed-final-departure')
                        continue
                    phase = 'completed-final-navigation'
                    prior_target_configs = len([call for call in calls if call['origin'] == target_origin
                                                and call['path'] == '/api/v1/origin-switch/config'])
                    await page.get_by_role('button', name='開始使用 ProJED' if entry == 'main' else '開始使用 ProJED 建待辦', exact=True).click()
                    await page.wait_for_url(target_origin + expected_path, timeout=10000, wait_until='domcontentloaded')
                    assert page.url == target_origin + expected_path, 'final URL must be the fixed entry without a locator or query'
                    for _ in range(100):
                        if len([call for call in calls if call['origin'] == target_origin
                                and call['path'] == '/api/v1/origin-switch/config']) > prior_target_configs:
                            break
                        await page.wait_for_timeout(100)
                    assert len([call for call in calls if call['origin'] == target_origin
                                and call['path'] == '/api/v1/origin-switch/config']) > prior_target_configs
                    await page.wait_for_timeout(250)
                    assert await page.evaluate("sessionStorage.getItem('projed.origin-switch.locator.v1:" + entry + "')") is None
                    assert not await page.locator('.origin-switch-target').count(), 'completion must not restart locator confirmation'
                    assert len([call for call in calls if call['path'] == '/api/v1/origin-switch/intents' and call['method'] == 'POST']) == 1
                    record(f'{entry}-full-origin-switch-completion-navigates-to-fixed-entry')
                except Exception as error:
                    failures.append({'entry': case_key, 'phase': phase, 'error': type(error).__name__, 'url': page.url})
                    (report / f'{case_key}-full-flow-failure.json').write_text(json.dumps({'phase': phase, 'url': page.url,
                        'error': str(error), 'calls': calls, 'body': await page.locator('body').inner_text()}, ensure_ascii=False, indent=2), encoding='utf-8')
                    await page.screenshot(path=str(report / f'{case_key}-full-flow-failure.png'), full_page=True)
                    record(f'{case_key}-full-origin-switch-completion-navigates-to-fixed-entry', 'FAIL', phase=phase, url=page.url)
                finally:
                    await context.close()

            # Real clicks cancel a pending prepare. Releasing the HTTP response
            # must not navigate after Later/ESC has fenced the guide generation.
            for action in ['later', 'escape']:
                controls = {'create_started': asyncio.Event(), 'release_create': asyncio.Event()}
                context, page, calls = await page_for(old, 'quick', fixed_intent=True, controls=controls)
                try:
                    await page.get_by_role('button', name='更換網址', exact=True).click(timeout=20000)
                    await page.get_by_role('button', name='開始更換', exact=True).click()
                    await page.locator('[data-origin-guide-stage="account"]').wait_for()
                    await page.get_by_role('button', name='前往新網址登入', exact=False).click()
                    await asyncio.wait_for(controls['create_started'].wait(), timeout=10)
                    if action == 'later':
                        await page.get_by_role('button', name='稍後再做', exact=True).click()
                    else:
                        await page.keyboard.press('Escape')
                    await page.locator('dialog[open]').wait_for(state='hidden')
                    finished_wait = asyncio.create_task(page.wait_for_event('requestfinished', predicate=lambda request:
                        request.url == old + '/api/v1/origin-switch/intents' and request.method == 'POST'))
                    await asyncio.sleep(0)
                    controls['release_create'].set()
                    finished_request = await asyncio.wait_for(finished_wait, timeout=10)
                    response = await finished_request.response()
                    assert response and response.status == 200
                    await page.wait_for_timeout(400)
                    assert page.url == old + '/quick-task/'
                    assert not await page.locator('dialog[open]').count()
                    assert not [call for call in calls if call['path'].endswith('/confirm')]
                    record(f'quick-{action}-during-http-prepare-fences-late-navigation')
                except Exception as error:
                    failures.append({'entry': 'quick', 'phase': f'prepare-{action}', 'error': type(error).__name__, 'url': page.url})
                    (report / f'prepare-{action}-failure.json').write_text(json.dumps({'url': page.url, 'error': str(error),
                        'calls': calls, 'body': await page.locator('body').inner_text()}, ensure_ascii=False, indent=2), encoding='utf-8')
                    record(f'quick-{action}-during-http-prepare-fences-late-navigation', 'FAIL', url=page.url)
                finally:
                    controls['release_create'].set()
                    await context.close()
        finally:
            await browser.close()
    return {'checks': checks, 'status': 'FAIL' if failures else 'PASS', 'failures': failures,
            'scope': 'normal frontend entries with isolated HTTP fixtures', 'cloud': 'NOT_RUN'}


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
        if result['status'] != 'PASS':
            raise SystemExit(1)
    finally:
        process.terminate()
        process.wait(timeout=10)
