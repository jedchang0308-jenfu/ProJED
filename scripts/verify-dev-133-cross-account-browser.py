"""Live TEST ordinary sessions; credentials/tokens/titles never enter reports."""
import asyncio
import json
import os
import re
import sys
import uuid
from pathlib import Path
from playwright.async_api import async_playwright

QUICK = 'http://127.0.0.1:4173'
MAIN = 'http://127.0.0.1:4174'
OUT = Path(sys.argv[1]).resolve()
RESULT = {'devId': 'DEV-133', 'status': 'FAIL', 'projectRef': 'fhisnnufoeulxqrchldf',
          'tests': [], 'allCapturesSynced': False, 'evidenceBoundary': 'live TEST supplement; N01-N10 coverage recorded per case'}
stage = 'connect'
suffix = uuid.uuid4().hex[:10]
client_import = "window.__dev133Client ??= (await import('/src/services/supabase/client.ts')).supabase"
outbox_import = "window.__dev133Outbox ??= await import('/src/features/quickTaskCapture/outbox.ts')"

def progress(value):
    global stage
    stage = value
    print(json.dumps({'stage': value}), flush=True)

def check(name, condition, layer='live Auth/API/UI'):
    RESULT['tests'].append({'case': name, 'status': 'PASS' if condition else 'FAIL', 'layer': layer})
    if not condition:
        raise AssertionError(name)

async def identity(page):
    return await page.evaluate("""async () => {
      const c = (await import('/src/services/supabase/client.ts')).supabase;
      const {data,error} = await c.auth.getUser(); if(error) throw Error('AUTH_CHECK_FAILED');
      const s = (await c.auth.getSession()).data.session;
      const claims = JSON.parse(atob(s.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
      const fingerprint = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(claims.session_id));
      return {id:data.user.id, sessionHash:Array.from(new Uint8Array(fingerprint),b=>b.toString(16).padStart(2,'0')).join('')};
    }""")

async def raw_records(page):
    return await page.evaluate("""async()=>{
      const m=await import('/src/features/quickTaskCapture/model.ts');
      return await new Promise((resolve,reject)=>{
        const opening=indexedDB.open(m.QUICK_CAPTURE_DB,m.QUICK_CAPTURE_SCHEMA_VERSION);
        opening.onerror=()=>reject(Error('RAW_IDB_OPEN_FAILED'));
        opening.onsuccess=()=>{
          const db=opening.result;
          const tx=db.transaction(m.QUICK_CAPTURE_STORE,'readonly');
          const request=tx.objectStore(m.QUICK_CAPTURE_STORE).getAll();
          tx.oncomplete=()=>{db.close();resolve(request.result??[]);};
          tx.onerror=tx.onabort=()=>{db.close();reject(Error('RAW_IDB_READ_FAILED'));};
        };
      });
    }""")

async def record_for(page, title):
    return next((r for r in await raw_records(page) if r['title'] == title), None)

async def wait_record(page, title, state=None):
    for _ in range(100):
        value = await record_for(page, title)
        if value and (state is None or value['state'] == state):
            return value
        await asyncio.sleep(0.3)
    raise TimeoutError('CAPTURE_STATE_TIMEOUT')

async def create_ui(page, title, state='synced'):
    if await page.locator('#quick-task-success [data-next]').is_visible():
        await page.locator('#quick-task-success [data-next]').click()
    await page.locator('#quick-task-title').fill(title)
    await page.locator('#quick-task-submit').click()
    return await wait_record(page, title, state)

async def own_row(page, record):
    return await page.evaluate("""async r => {
      const c=(await import('/src/services/supabase/client.ts')).supabase;
      const q=await c.from('task_workbench_unplaced_items').select('id,owner_id,sort_order')
        .eq('owner_id',r.accountId).eq('id',r.captureId);
      return {error:Boolean(q.error),rows:q.data??[]};
    }""", record)

async def sign_password(page):
    creds = {'email': os.environ['DEV133_TEST_ACTOR_A_EMAIL'], 'password': os.environ['DEV133_TEST_ACTOR_A_PASSWORD']}
    await page.evaluate("""async credentials => {
      const c=(await import('/src/services/supabase/client.ts')).supabase;
      const r=await c.auth.signInWithPassword(credentials); if(r.error)throw Error('ACTOR_A_SIGNIN_FAILED');
    }""", creds)
    await page.wait_for_function("document.querySelector('#quick-task-auth-status')?.textContent.includes('已登入')", timeout=30000)
    return await identity(page)

async def google_existing(page):
    # Normal Google flow in the task-owned profile; only choose the specified account.
    await page.locator('#quick-task-auth-status button').filter(has_text='登入').click()
    await page.wait_for_url(re.compile(r'^https://accounts\.google\.com/'), timeout=20000)
    account = page.get_by_text(os.environ['DEV133_TEST_ACTOR_B_EMAIL'], exact=True)
    try:
        await account.first.wait_for(state='visible', timeout=10000)
        # Google places a pointer overlay over its email child; click the real account row.
        row = account.first.locator('xpath=ancestor::*[@data-identifier or @role="link" or @role="button"][1]')
        if await row.count() != 1:
            raise RuntimeError('GOOGLE_ACCOUNT_ROW_UNAVAILABLE')
        await row.click()
    except Exception:
        progress('google-interaction-needed')
    await page.wait_for_url(re.compile(r'^http://127\.0\.0\.1:417[34]/quick-task/'), timeout=120000)
    await page.wait_for_function("document.querySelector('#quick-task-auth-status')?.textContent.includes('已登入')", timeout=30000)
    return await identity(page)

async def quick_logout(page):
    await page.locator('#quick-task-auth-status button').filter(has_text='登出此 App').click()
    await page.wait_for_function("document.querySelector('#quick-task-auth-status')?.textContent.includes('尚未登入')", timeout=20000)

async def shot(page, name):
    masks = [page.locator('#quick-task-auth-status'), page.locator('#quick-task-success span'),
             page.locator('#quick-task-recovery span'), page.locator('#quick-task-title')]
    await page.screenshot(path=str(OUT / name), full_page=True, mask=masks)

async def cross_read(page, record):
    return await page.evaluate("""async r=>{
      const c=(await import('/src/services/supabase/client.ts')).supabase;
      const q=await c.from('task_workbench_unplaced_items').select('id')
        .eq('owner_id',r.accountId).eq('id',r.captureId);
      return {error:Boolean(q.error),count:q.data?.length??0};
    }""", record)

async def all_origin_captures_synced(context):
    # Both origins must be read back; a missing origin is not proof of safe deletion.
    results = []
    for origin in [QUICK, MAIN]:
        pages = [p for p in context.pages if p.url.startswith(origin + '/')]
        if not pages:
            return False
        results.append(all(r['state']=='synced' for r in await raw_records(pages[0])))
    return all(results)

async def main():
    quick = None
    actor_a = None
    browser = None
    context = None
    pw = await async_playwright().start()
    try:
        browser = await pw.chromium.connect_over_cdp('http://127.0.0.1:4175')
        context = browser.contexts[0]
        quick = next(p for p in context.pages if p.url.startswith(QUICK + '/quick-task/'))
        quick.set_default_timeout(20000)
        errors = []
        quick.on('pageerror', lambda _: errors.append('quick-page-error'))
        await quick.evaluate('async()=>{' + client_import + ';' + outbox_import + ';}')
        b = await identity(quick)
        RESULT['browser'] = browser.version
        retained = [r for r in await raw_records(quick) if r['state'] != 'synced']
        if retained:
            progress('recover-retained-task-owned-TEST-captures')
            # Preserve and complete earlier attempt fixtures through the same normal UI.
            # Unbound claim cases explicitly target A; never infer an owner from a login event.
            for r in retained:
                if r['accountId'] == b['id'] and r['title'].startswith('DEV133-retained-B-'):
                    await wait_record(quick, r['title'], 'synced')
                elif r['accountId'] is not None or not r['title'].startswith('DEV133-unbound-'):
                    raise RuntimeError('UNEXPECTED_RETAINED_CAPTURE_REQUIRES_REVIEW')
            unbound = sorted([r for r in retained if r['accountId'] is None], key=lambda r: (r['clientCreatedAt'], r['captureId']))
            if unbound:
                await quick_logout(quick)
                await sign_password(quick)
                for r in unbound:
                    await quick.locator('#quick-task-recovery [data-recover]').click()
                    await quick.locator('#quick-task-recovery [data-confirm-claim]').wait_for()
                    check('R00-retained-unbound-confirmation-matches-fixture',
                          await quick.locator('#quick-task-recovery span').filter(has_text=r['title']).count() == 1)
                    await quick.locator('#quick-task-recovery [data-confirm-claim]').click()
                    await wait_record(quick, r['title'], 'synced')
                await quick_logout(quick)
                await google_existing(quick)
            check('R00-prior-attempt-captures-synced-without-new-id',
                  all(r['state'] == 'synced' for r in await raw_records(quick)))
        progress('prepare-actor-A-on-separate-origin')
        actor_a = await context.new_page()
        await actor_a.goto(MAIN + '/quick-task/', wait_until='domcontentloaded')
        await actor_a.locator('#quick-task-title').wait_for()
        a = await sign_password(actor_a)
        check('E01-distinct-ordinary-A-B-sessions', a['id'] != b['id'])

        progress('normal-quick-ui-create-A')
        title_a, title_b = f'DEV133-A-{suffix}', f'DEV133-B-{suffix}'
        ra = await create_ui(actor_a, title_a)
        progress('normal-quick-ui-create-B')
        rb = await create_ui(quick, title_b)
        rows_a, rows_b = await own_row(actor_a, ra), await own_row(quick, rb)
        check('E02-A-B-UI-create-receipt-unique-owner',
              ra['accountId'] == a['id'] and rb['accountId'] == b['id']
              and ra['receipt']['ownerId'] == a['id'] and rb['receipt']['ownerId'] == b['id']
              and len(rows_a['rows']) == len(rows_b['rows']) == 1)

        progress('live-cross-account-read-write-denial')
        aq, bq = await cross_read(actor_a, rb), await cross_read(quick, ra)
        check('E03-A-cannot-read-B-B-cannot-read-A', not aq['error'] and not bq['error'] and aq['count'] == bq['count'] == 0)
        for p, r, sort in [(quick, ra, rows_a['rows'][0]['sort_order']), (actor_a, rb, rows_b['rows'][0]['sort_order'])]:
            blocked = await p.evaluate("""async ({r,sort})=>{
              const c=(await import('/src/services/supabase/client.ts')).supabase;
              const q=await c.from('task_workbench_unplaced_items').update({sort_order:sort})
                .eq('owner_id',r.accountId).eq('id',r.captureId).select('id');
                  return {error:Boolean(q.error),code:q.error?.code,count:q.data?.length??0};
            }""", {'r': r, 'sort': sort})
            check('E04-foreign-update-denied-' + ('B-to-A' if p == quick else 'A-to-B'),
                  blocked['count'] == 0 and (not blocked['error'] or blocked.get('code') == '42501'))
        anon = await quick.evaluate("""async ({r,publicKey})=>{
          if (!publicKey) throw Error('ANONYMOUS_PUBLIC_KEY_MISSING');
          const config=await import('/src/services/supabase/client.ts');
          const response=await fetch(config.configuredSupabaseUrl+'/rest/v1/task_workbench_unplaced_items?select=id&owner_id=eq.'+r.accountId+'&id=eq.'+r.captureId,
            {headers:{apikey:publicKey,...(publicKey.startsWith('eyJ')?{Authorization:'Bearer '+publicKey}:{})},credentials:'omit'});
          const body=await response.json(); return {status:response.status,count:Array.isArray(body)?body.length:0};
        }""", {'r': rb, 'publicKey': os.environ['DEV133_TEST_PUBLIC_KEY']})
        check('E05-anonymous-cannot-read-owned-task', anon['status'] in [401,403] or (anon['status'] == 200 and anon['count'] == 0))

        progress('real-RPC-replay-parallel-conflict')
        replay = await quick.evaluate("""async r=>{
          const c=(await import('/src/services/supabase/client.ts')).supabase;
          const args={p_capture_id:r.captureId,p_title:r.title,p_workspace_hint:null};
          const results=await Promise.all([c.rpc('create_quick_unplaced_task_v1',args),c.rpc('create_quick_unplaced_task_v1',args)]);
          const conflict=await c.rpc('create_quick_unplaced_task_v1',{...args,p_title:r.title+'-conflict'});
          return {same:results.every(x=>!x.error&&x.data.status==='committed'&&x.data.ownerId===r.accountId&&x.data.captureId===r.captureId&&x.data.created===false),
            conflict:Boolean(conflict.error?.message?.includes('QT_IDEMPOTENCY_CONFLICT'))};
        }""", rb)
        check('E06-parallel-replay-and-title-conflict', replay['same'] and replay['conflict'] and len((await own_row(quick, rb))['rows']) == 1)

        progress('normal-workbench-CTA-and-account-visibility')
        await actor_a.locator('#quick-task-success [data-workbench]').click()
        await actor_a.get_by_text(title_a, exact=True).first.wait_for(timeout=45000)
        await quick.locator('#quick-task-success [data-workbench]').click()
        await quick.get_by_text(title_b, exact=True).first.wait_for(timeout=45000)
        check('E07-workbench-own-task-visible-foreign-task-absent',
              await actor_a.get_by_text(title_b, exact=True).count() == 0
              and await quick.get_by_text(title_a, exact=True).count() == 0)
        await quick.goto(QUICK + '/quick-task/', wait_until='domcontentloaded')
        await quick.wait_for_function("document.querySelector('#quick-task-auth-status')?.textContent.includes('已登入')", timeout=30000)
        await quick.evaluate('async()=>{' + outbox_import + ';}')

        progress('real-offline-capture-and-network-resume')
        rpc_requests = []
        def remember_rpc(req):
            if '/rpc/create_quick_unplaced_task_v1' in req.url:
                try:
                    rpc_requests.append(json.loads(req.post_data or '{}').get('p_capture_id'))
                except Exception:
                    rpc_requests.append('unknown')
        quick.on('request', remember_rpc)
        title_offline = f'DEV133-offline-{suffix}'
        await context.set_offline(True)
        before = len(rpc_requests)
        ro = await create_ui(quick, title_offline, None)
        await asyncio.sleep(1)
        check('E08-offline-B-owner-local-commit-no-RPC', ro['accountId'] == b['id'] and ro['state'] != 'synced' and len(rpc_requests) == before)
        await context.set_offline(False)
        ro = await wait_record(quick, title_offline, 'synced')
        check('E09-online-resume-same-id-unique-row', ro['receipt']['ownerId'] == b['id'] and len((await own_row(quick, ro))['rows']) == 1)

        progress('B-pending-logout-unbound-A-switch-protection')
        async def fail_rpc(route):
            await route.abort('internetdisconnected')
        await quick.route('**/rest/v1/rpc/create_quick_unplaced_task_v1', fail_rpc)
        pending_title = f'DEV133-retained-B-{suffix}'
        rp = await create_ui(quick, pending_title, 'failed_retryable')
        await quick_logout(quick)
        await quick.unroute('**/rest/v1/rpc/create_quick_unplaced_task_v1', fail_rpc)
        unbound_title = f'DEV133-unbound-{suffix}'
        ru = await create_ui(quick, unbound_title, 'awaiting_auth')
        await sign_password(quick)
        before = len(rpc_requests)
        await asyncio.sleep(2)
        rp_after, ru_after = await record_for(quick, pending_title), await record_for(quick, unbound_title)
        check('E10-switch-A-keeps-B-owner-and-unbound-unclaimed',
              rp_after['accountId'] == b['id'] and rp_after['state'] != 'synced'
              and ru_after['accountId'] is None and len(rpc_requests) == before
              and pending_title not in await quick.locator('body').inner_text(), 'live Auth/UI with RPC-outage simulation')
        await quick.locator('#quick-task-success [data-next]').click()
        await quick.locator('#quick-task-recovery [data-recover]').click()
        await quick.locator('#quick-task-recovery [data-confirm-claim]').wait_for()
        await quick.locator('#quick-task-recovery [data-cancel-claim]').click()
        check('E11-claim-cancel-preserves-unbound', (await record_for(quick, unbound_title))['accountId'] is None)
        await quick.reload(wait_until='domcontentloaded')
        await quick.wait_for_function("document.querySelector('#quick-task-auth-status')?.textContent.includes('已登入')", timeout=30000)
        await quick.locator('#quick-task-recovery [data-recover]').click()
        await quick.locator('#quick-task-recovery [data-confirm-claim]').click()
        ru = await wait_record(quick, unbound_title, 'synced')
        check('E12-explicit-A-claim-same-id-correct-owner', ru['captureId'] == ru_after['captureId'] and ru['receipt']['ownerId'] == a['id'])

        progress('restore-B-and-test-separate-session-local-logout')
        await quick_logout(quick)
        await google_existing(quick)
        rp = await wait_record(quick, pending_title, 'synced')
        check('E13-original-B-restores-retained-same-id', rp['captureId'] == rp_after['captureId'] and rp['receipt']['ownerId'] == b['id'])
        await actor_a.goto(MAIN + '/quick-task/', wait_until='domcontentloaded')
        await actor_a.wait_for_function("document.querySelector('#quick-task-auth-status')?.textContent.includes('已登入')", timeout=30000)
        await quick_logout(actor_a)
        second_b = await google_existing(actor_a)
        first_b = await identity(quick)
        check('E14-B-on-two-origins-independent-Sessions', second_b['id'] == first_b['id'] == b['id'] and second_b['sessionHash'] != first_b['sessionHash'])
        await quick_logout(quick)
        second_after = await identity(actor_a)
        await quick.reload(wait_until='domcontentloaded')
        await quick.wait_for_function("document.querySelector('#quick-task-auth-status')?.textContent.includes('尚未登入')", timeout=20000)
        barrier = await quick.evaluate("async()=>{const o=await import('/src/features/quickTaskCapture/outbox.ts');return o.getQuickAuthContext();}")
        check('E15-quick-local-logout-preserves-other-origin-and-barrier', second_after['id'] == b['id'] and barrier['bindingAllowed'] is False)
        for width in [390, 320, 726]:
            await quick.set_viewport_size({'width': width, 'height': 844})
            await quick.locator('#quick-task-title').focus()
            size = await quick.evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})')
            check(f'E16-quick-viewport-{width}', size['scroll'] <= size['width'] + 1, 'browser layout measurement')
            await shot(quick, f'quick-{width}.png')
        check('E17-no-unexpected-quick-page-error', len(errors) == 0)
        all_records = await raw_records(quick)
        RESULT['allCapturesSynced'] = await all_origin_captures_synced(context)
        check('E18-test-captures-all-synced-before-profile-cleanup', RESULT['allCapturesSynced'])
        RESULT['status'] = 'PASS'
        RESULT['retainedSyncedTestFixtures'] = len(all_records)
        await context.set_offline(False)
    except Exception as error:
        RESULT['failure'] = {'stage': stage, 'kind': type(error).__name__}
        if actor_a and not actor_a.is_closed():
            try:
                await shot(actor_a, 'failure-other-origin.png')
            except Exception:
                pass
        # Preserve original failure; do not weaken assertions or erase pending captures.
        if quick and not quick.is_closed():
            try:
                await shot(quick, 'failure.png')
                records = await raw_records(quick)
                RESULT['allCapturesSynced'] = all(x['state'] == 'synced' for x in records)
            except Exception:
                pass
        if context:
            try:
                await context.set_offline(False)
            except Exception:
                pass
    finally:
        if context:
            try:
                RESULT['allCapturesSynced'] = await all_origin_captures_synced(context)
            except Exception:
                RESULT['allCapturesSynced'] = False
        await pw.stop()
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / 'browser-result.json').write_text(json.dumps(RESULT, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
        print(json.dumps({'status': RESULT['status'], 'tests': len(RESULT['tests'])}), flush=True)
    return 0 if RESULT['status'] == 'PASS' else 1

async def restore_actor_b():
    pw=await async_playwright().start()
    try:
        browser=None
        for _ in range(60):
            try:
                browser=await pw.chromium.connect_over_cdp('http://127.0.0.1:4175')
                break
            except Exception:
                await asyncio.sleep(0.5)
        if not browser:
            return 1
        context=browser.contexts[0]
        page=next(p for p in context.pages if p.url.startswith(QUICK+'/quick-task/'))
        await page.locator('#quick-task-title').wait_for(timeout=30000)
        expected=os.environ['DEV133_TEST_ACTOR_B_EMAIL'].lower()
        actual=await page.evaluate("""async()=>{const c=(await import('/src/services/supabase/client.ts')).supabase;
          const r=await c.auth.getSession();return r.data.session?.user?.email?.toLowerCase()??null;}""")
        if actual==expected:
            return 0
        if actual:
            await page.wait_for_function("document.querySelector('#quick-task-auth-status')?.textContent.includes('已登入')",timeout=30000)
            await quick_logout(page)
        else:
            await page.wait_for_function("document.querySelector('#quick-task-auth-status')?.textContent.includes('尚未登入')",timeout=30000)
        await google_existing(page)
        return 0
    except Exception as error:
        print(json.dumps({'restore':'FAIL','kind':type(error).__name__}),flush=True)
        return 1
    finally:
        await pw.stop()

if __name__ == '__main__':
    sys.exit(asyncio.run(restore_actor_b() if '--restore-actor-b' in sys.argv else main()))
