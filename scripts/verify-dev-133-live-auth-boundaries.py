"""Actual TEST actor A only; transport faults are explicitly labelled. No B substitute."""
import asyncio
import json
import os
import shutil
import sys
import uuid
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path(sys.argv[1]).resolve()
PROFILE = (OUT / 'owned-chrome-profile').resolve()
ORIGIN = 'http://127.0.0.1:4185'
RESULT = {'devId': 'DEV-133', 'status': 'FAIL', 'projectRef': 'fhisnnufoeulxqrchldf', 'layer': 'live ordinary TEST actor A; no cross-account claim', 'cases': [], 'allCapturesSynced': False}
stage = 'start'
suffix = uuid.uuid4().hex[:10]

def check(name, condition, layer='live TEST Auth/RPC/UI'):
    RESULT['cases'].append({'case': name, 'status': 'PASS' if condition else 'FAIL', 'layer': layer})
    if not condition:
        raise AssertionError(name)

async def raw(page):
    return await page.evaluate("""async()=>{
      const m=await import('/src/features/quickTaskCapture/model.ts');
      return await new Promise((resolve,reject)=>{const q=indexedDB.open(m.QUICK_CAPTURE_DB,m.QUICK_CAPTURE_SCHEMA_VERSION);
        q.onsuccess=()=>{const db=q.result,tx=db.transaction(m.QUICK_CAPTURE_STORE,'readonly'),r=tx.objectStore(m.QUICK_CAPTURE_STORE).getAll();tx.oncomplete=()=>{db.close();resolve(r.result);};tx.onabort=tx.onerror=()=>{db.close();reject(Error('IDB_READ_FAILED'));};};q.onerror=()=>reject(Error('IDB_OPEN_FAILED'));});
    }""")

async def wait_record(page, title, state=None):
    for _ in range(100):
        record = next((r for r in await raw(page) if r['title'] == title), None)
        if record and (state is None or record['state'] == state):
            return record
        await asyncio.sleep(0.3)
    raise TimeoutError('CAPTURE_STATE_TIMEOUT')

async def login(page):
    credentials = {'email': os.environ['DEV133_TEST_ACTOR_A_EMAIL'], 'password': os.environ['DEV133_TEST_ACTOR_A_PASSWORD']}
    await page.evaluate("""async credentials=>{
      // Only a non-secret explicit login intent; ordinary SDK/getUser establish identity.
      sessionStorage.setItem('projed-quick-sdk-login-intent',String(Date.now()));
      const c=(await import('/src/services/supabase/client.ts')).supabase;
      if((await c.auth.signInWithPassword(credentials)).error)throw Error('ORDINARY_TEST_SIGNIN_FAILED');
    }""", credentials)
    await page.wait_for_function("document.querySelector('#quick-task-auth-status').textContent.includes('已登入')", timeout=30000)
    return await page.evaluate("async()=>{const c=(await import('/src/services/supabase/client.ts')).supabase;const r=await c.auth.getUser();if(r.error)throw Error('USER_VERIFY_FAILED');return r.data.user.id;}")

async def create(page, label, state='synced'):
    if await page.locator('[data-next]').is_visible():
        await page.locator('[data-next]').click()
    title = 'DEV133-LIVEBOUNDARY-' + suffix + '-' + label
    await page.locator('#quick-task-title').fill(title)
    await page.locator('#quick-task-submit').click()
    return await wait_record(page, title, state)

async def row_count(page, capture_id):
    return await page.evaluate("""async id=>{const c=(await import('/src/services/supabase/client.ts')).supabase;const q=await c.from('task_workbench_unplaced_items').select('id').eq('id',id);if(q.error)throw Error('ROW_READ_FAILED');return q.data.length;}""", capture_id)

async def main():
    global stage
    context = None
    release = asyncio.Event()
    async with async_playwright() as p:
        try:
            context = await p.chromium.launch_persistent_context(str(PROFILE), executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe', headless=True, viewport={'width':390,'height':844})
            page = context.pages[0]
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error).splitlines()[0][:100]))
            await page.goto(ORIGIN + '/quick-task/')
            await page.locator('#quick-task-auth-status button').filter(has_text='登入').wait_for()
            stage = 'ordinary-signin'
            owner = await login(page)
            check('L01-ordinary-SDK-network-verified-owner', bool(owner))

            stage = 'offline-resume'
            await context.set_offline(True)
            offline = await create(page, 'offline', 'pending')
            check('L02-real-offline-preserves-verified-owner', offline['accountId'] == owner and offline['receipt'] is None if 'receipt' in offline else offline['accountId'] == owner)
            await context.set_offline(False)
            offline = await wait_record(page, offline['title'], 'synced')
            check('L03-real-online-auto-sync-original-ID', offline['receipt']['captureId'] == offline['captureId'] and offline['receipt']['ownerId'] == owner and await row_count(page, offline['captureId']) == 1)

            stage = 'commit-then-lost-response'
            receipts = []
            first = True
            async def lose_first(route):
                nonlocal first
                response = await route.fetch()
                if response.ok:
                    receipts.append(await response.json())
                if first:
                    first = False
                    await route.abort('connectionreset')
                else:
                    await route.fulfill(response=response)
            await page.route('**/rest/v1/rpc/create_quick_unplaced_task_v1', lose_first)
            replay = await create(page, 'lost-response')
            await page.unroute('**/rest/v1/rpc/create_quick_unplaced_task_v1', lose_first)
            check('L04-real-server-commit-lost-response-idempotent-replay', len(receipts) >= 2 and receipts[0]['created'] is True and receipts[-1]['created'] is False and all(r['captureId'] == replay['captureId'] for r in receipts) and await row_count(page, replay['captureId']) == 1, 'real RPC commit; injected transport loss; actual automatic replay')

            stage = 'logout-late-response'
            committed = asyncio.Event()
            async def delay_response(route):
                response = await route.fetch()
                if not response.ok:
                    raise AssertionError('LIVE_COMMIT_REQUIRED')
                committed.set()
                await release.wait()
                await route.fulfill(response=response)
            await page.route('**/rest/v1/rpc/create_quick_unplaced_task_v1', delay_response)
            late = await create(page, 'late-response', 'syncing')
            await asyncio.wait_for(committed.wait(), timeout=25)
            await page.locator('#quick-task-auth-status button').filter(has_text='登出此 App').click()
            await page.wait_for_function("document.querySelector('#quick-task-auth-status').textContent.includes('尚未登入')")
            check('L05-local-logout-stops-new-dispatch-before-late-response', await page.evaluate("async()=>!await (await import('/src/features/quickTaskCapture/auth.ts')).getQuickBindingContext()"))
            release.set()
            late = await wait_record(page, late['title'], 'synced')
            await page.unroute('**/rest/v1/rpc/create_quick_unplaced_task_v1', delay_response)
            check('L06-late-committed-receipt-only-completes-original-owner', late['accountId'] == owner and late['receipt']['ownerId'] == owner and await page.locator('#quick-task-success').is_hidden(), 'live ordinary logout and RPC; delayed response injection')
            check('L07-fresh-ordinary-login-restores-same-owner', await login(page) == owner and await row_count(page, late['captureId']) == 1)

            stage = 'real-invalid-refresh'
            async def outage(route):
                await route.fulfill(status=503, content_type='application/json', body='{"code":"BOUNDARY_TEMPORARY_OUTAGE"}')
            await page.route('**/rest/v1/rpc/create_quick_unplaced_task_v1', outage)
            waiting = await create(page, 'refresh-failure', 'failed_retryable')
            refresh = await page.evaluate("""async()=>{
              const c=(await import('/src/services/supabase/client.ts')).supabase;
              const r=await c.auth.refreshSession({refresh_token:'dev133-intentionally-invalid-refresh-token'});
              const a=await import('/src/features/quickTaskCapture/auth.ts');await a.loadQuickSession();
              return {rejected:Boolean(r.error),binding:Boolean(await a.getQuickBindingContext())};
            }""")
            check('L08-real-Auth-refresh-rejection-clears-binding-preserves-owner', refresh['rejected'] and not refresh['binding'] and (await wait_record(page, waiting['title']))['accountId'] == owner, 'real ordinary SDK token endpoint rejection; injected RPC outage')
            await page.unroute('**/rest/v1/rpc/create_quick_unplaced_task_v1', outage)
            await login(page)
            await page.evaluate("async id=>{const o=await import('/src/features/quickTaskCapture/outbox.ts');const a=await import('/src/features/quickTaskCapture/auth.ts');await o.retryQuickCapture(id,(await a.getQuickBindingContext()).accountId);window.dispatchEvent(new Event('online'));}", waiting['captureId'])
            waiting = await wait_record(page, waiting['title'], 'synced')
            check('L09-after-refresh-failure-same-ID-real-sync', waiting['receipt']['captureId'] == waiting['captureId'] and await row_count(page, waiting['captureId']) == 1)

            stage = 'local-retention-server-survival'
            removed = await page.evaluate("""async id=>{
              const m=await import('/src/features/quickTaskCapture/model.ts');
              await new Promise((resolve,reject)=>{const q=indexedDB.open(m.QUICK_CAPTURE_DB,m.QUICK_CAPTURE_SCHEMA_VERSION);q.onsuccess=()=>{const db=q.result,tx=db.transaction(m.QUICK_CAPTURE_STORE,'readwrite'),store=tx.objectStore(m.QUICK_CAPTURE_STORE),r=store.get(id);r.onsuccess=()=>store.put({...r.result,updatedAt:Date.now()-8*24*60*60*1000});tx.oncomplete=()=>{db.close();resolve();};tx.onabort=tx.onerror=()=>{db.close();reject(Error('RETENTION_FIXTURE_FAILED'));};};});
              const o=await import('/src/features/quickTaskCapture/outbox.ts');return {removed:await o.removeExpiredQuickCaptures(),missing:!await o.getQuickCapture(id)};
            }""", offline['captureId'])
            replay_receipt = await page.evaluate("""async record=>{const c=(await import('/src/services/supabase/client.ts')).supabase;const r=await c.rpc('create_quick_unplaced_task_v1',{p_capture_id:record.captureId,p_title:record.title,p_workspace_hint:null});if(r.error)throw Error('SERVER_RECEIPT_READBACK_FAILED');return r.data;}""", offline)
            check('L10-local-cleanup-preserves-server-task-and-immutable-receipt', removed['removed'] == 1 and removed['missing'] and await row_count(page, offline['captureId']) == 1 and replay_receipt['created'] is False and replay_receipt['titleHash'] == offline['receipt']['titleHash'])
            check('L11-visible-browser-errors', not errors)
            remaining = await raw(page)
            RESULT['allCapturesSynced'] = bool(remaining) and all(r['state'] == 'synced' and r.get('receipt') for r in remaining)
            check('L12-fixture-cleanup-requires-raw-all-synced', RESULT['allCapturesSynced'])
            RESULT['status'] = 'PASS'
        except Exception as error:
            RESULT['failure'] = {'stage': stage, 'type': type(error).__name__, 'reason': 'case assertion or fixture prerequisite failed; no credentials in report'}
        finally:
            release.set()
            if context:
                await context.close()
            if RESULT['status'] == 'PASS' and RESULT['allCapturesSynced'] and PROFILE.parent == OUT and PROFILE.name == 'owned-chrome-profile':
                shutil.rmtree(PROFILE)
                RESULT['profileCleanup'] = 'removed after browser close and raw synced proof'
            else:
                RESULT['profileCleanup'] = 'preserved; DEV-133 owns corrective same-ID recovery before removal'
            (OUT / 'result.json').write_text(json.dumps(RESULT, indent=2), encoding='utf-8')
    print(json.dumps({'status': RESULT['status'], 'cases':len(RESULT['cases']), 'stage':stage}), flush=True)
    return 0 if RESULT['status'] == 'PASS' else 1

if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
