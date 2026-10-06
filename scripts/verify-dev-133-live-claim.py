"""Current-source N06: ordinary TEST password Auth and normal cancel/confirm UI.

No Auth/RPC injection. The ordinary SDK login intent is the same contract used
by the existing live Auth boundary verifier; no admin credential reaches Chrome.
"""
import asyncio
import hashlib
import importlib.util
import json
import sys
import uuid
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path(sys.argv[1]).resolve()
spec = importlib.util.spec_from_file_location('helpers', OUT / 'helpers.py')
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
RESULT = {'devId': 'DEV-133', 'projectRef': 'fhisnnufoeulxqrchldf',
          'status': 'FAIL', 'layer': 'ordinary TEST SDK Auth/getUser, normal UI cancel/confirm, real RPC/IDB; no injection',
          'cases': [], 'allCapturesSynced': False}

def check(name, condition):
    RESULT['cases'].append({'case': name, 'status': 'PASS' if condition else 'FAIL'})
    if not condition:
        raise AssertionError(name)

async def main():
    context = None
    page = None
    stage = 'anonymous-create'
    async with async_playwright() as p:
        try:
            context = await p.chromium.launch_persistent_context(str(OUT / 'owned-chrome-profile'),
                executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe', headless=True,
                viewport={'width': 390, 'height': 844})
            page = context.pages[0]
            errors = []
            page.on('pageerror', lambda error: errors.append(type(error).__name__))
            await page.goto(h.ORIGIN + '/quick-task/')
            await page.locator('#quick-task-auth-status button').filter(has_text='登入').wait_for()
            check('C01-empty-isolated-profile-has-no-pending', not await h.raw(page))
            title = 'DEV133-N06-' + uuid.uuid4().hex
            await page.locator('#quick-task-title').fill(title)
            await page.locator('#quick-task-submit').click()
            original = await h.wait_record(page, title, 'awaiting_auth')
            check('C02-anonymous-UI-create-is-unbound', original['accountId'] is None and not original.get('receipt'))
            stage = 'ordinary-TEST-signin'
            owner = await h.login(page)
            check('C03-ordinary-SDK-getUser-verifies-TEST-owner', bool(owner))
            await page.locator('[data-confirm-claim]').wait_for()
            before = await h.wait_record(page, title)
            check('C04-login-alone-does-not-bind-or-create-task', before['accountId'] is None
                and bool(before.get('claimIntent', {}).get('nonceHash')) and await h.row_count(page, original['captureId']) == 0)
            await page.locator('[data-cancel-claim]').click()
            cancelled = await h.wait_record(page, title)
            check('C05-cancel-preserves-same-ID-title-unbound', cancelled['captureId'] == original['captureId']
                and cancelled['title'] == title and cancelled['accountId'] is None and cancelled['state'] == 'awaiting_auth')
            check('C06-cancel-does-not-call-successful-create-RPC', await h.row_count(page, original['captureId']) == 0)
            stage = 'explicit-reconfirmation'
            await page.locator('#quick-task-recovery summary').click()
            await page.locator('[data-confirm-claim]').wait_for()
            reopened = await h.wait_record(page, title)
            check('C07-reopen-requires-new-nonce', reopened['claimIntent']['nonceHash'] != before['claimIntent']['nonceHash'])
            await page.locator('[data-confirm-claim]').click()
            completed = await h.wait_record(page, title, 'synced')
            receipt = completed.get('receipt', {})
            check('C08-same-ID-owner-title-and-valid-real-receipt', completed['captureId'] == original['captureId']
                and completed['accountId'] == owner and completed['title'] == title
                and receipt.get('captureId') == original['captureId'] and receipt.get('ownerId') == owner
                and receipt.get('titleHash') == hashlib.sha256(title.encode()).hexdigest()
                and isinstance(receipt.get('created'), bool))
            check('C09-exactly-one-real-task-row', await h.row_count(page, original['captureId']) == 1)
            await page.wait_for_function("()=>{const panel=document.querySelector('#quick-task-recovery');return panel.hidden||document.querySelector('#quick-task-recovery-content')?.textContent.includes('此任務已同步');}")
            visible = await page.evaluate("()=>Array.from(document.querySelectorAll('#quick-task-message,#quick-task-recovery-message')).filter(e=>!e.hidden&&e.getBoundingClientRect().height>0).map(e=>e.textContent)")
            check('C10-no-false-original-account-warning', not any('建立這些待辦的原帳號' in text for text in visible))
            check('C11-no-browser-page-errors', not errors)
            await page.screenshot(path=str(OUT / 'normal-claim-390.png'), full_page=True,
                                  mask=[page.locator('.quick-task-auth-copy')])
            RESULT['captureId'] = original['captureId']
            RESULT['ownerHash'] = hashlib.sha256(owner.encode()).hexdigest()
            RESULT['allCapturesSynced'] = all(r['state'] == 'synced' for r in await h.raw(page))
            RESULT['status'] = 'PASS'
        except Exception as error:
            RESULT.update({'stage': stage, 'errorKind': type(error).__name__})
        finally:
            if page:
                try:
                    RESULT['pendingPreserved'] = sum(r['state'] != 'synced' for r in await h.raw(page))
                except Exception:
                    RESULT['pendingPreserved'] = 'unknown-profile-retained'
            if context:
                await context.close()
            RESULT['ownedBrowserClosed'] = True
            RESULT['profileDisposition'] = 'retained; no capture deletion'
            (OUT / 'result.json').write_text(json.dumps(RESULT, ensure_ascii=False, indent=2), encoding='utf-8')
            print(json.dumps({'artifact': str(OUT), 'status': RESULT['status'], 'passCount': sum(c['status'] == 'PASS' for c in RESULT['cases']), 'stage': RESULT.get('stage')}))
    return 0 if RESULT['status'] == 'PASS' else 1

raise SystemExit(asyncio.run(main()))
