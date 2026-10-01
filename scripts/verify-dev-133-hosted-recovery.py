"""N08 ordinary hosted TEST SDK/JWT/RLS. New C fixture; no admin session injection."""
import asyncio
import json
import os
import sys
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path(sys.argv[1]).resolve()
PROFILE = Path(sys.argv[2]).resolve()
CONFIG = json.loads((OUT/'config.json').read_text(encoding='utf-8'))
RESUME = '--resume' in sys.argv
ORIGIN = 'http://127.0.0.1:4196'
RESULT = {'devId':'DEV-133','projectRef':CONFIG['projectRef'],'status':'FAIL',
          'layer':'real hosted TEST ordinary password SDK Auth/RPC/RLS, frozen built UI on loopback; injected foreign workspaceHint fixture only',
          'cases':[], 'allCapturesSynced':False}

def check(name, condition):
    RESULT['cases'].append({'case':name,'status':'PASS' if condition else 'FAIL'})
    if not condition:
        raise AssertionError(name)

async def sdk(page, body, argument=None):
    return await page.evaluate(f'async arg=>{{const c=(await import({json.dumps(CONFIG["clientModule"])})).s;{body}}}', argument)

async def raw(page):
    return await page.evaluate('''()=>new Promise((resolve,reject)=>{
      const q=indexedDB.open('projed-quick-task-v1',2);q.onerror=()=>reject(Error('RAW_OPEN_FAILED'));
      q.onsuccess=()=>{const db=q.result,tx=db.transaction('captures','readonly'),r=tx.objectStore('captures').getAll();
        tx.oncomplete=()=>{db.close();resolve(r.result);};tx.onerror=tx.onabort=()=>{db.close();reject(Error('RAW_READ_FAILED'));};};})''')

async def wait_record(page, capture_id=None, state=None):
    for _ in range(160):
        records = await raw(page)
        record = next((r for r in records if not capture_id or r['captureId']==capture_id), None)
        if record and (state is None or record['state']==state):
            return record
        await asyncio.sleep(0.25)
    raise TimeoutError('CAPTURE_STATE_TIMEOUT')

async def dependencies(page):
    return await sdk(page, '''const u=await c.auth.getUser();if(u.error)throw Error('ORDINARY_USER_REQUIRED');
      const [p,m]=await Promise.all([c.from('profiles').select('id').eq('id',u.data.user.id),c.from('tenant_members').select('tenant_id').eq('user_id',u.data.user.id).eq('status','active')]);
      if(p.error||m.error)throw Error('ORDINARY_DEPENDENCY_READ_FAILED');return {ownerId:u.data.user.id,profileCount:p.data.length,memberships:m.data.map(v=>v.tenant_id)};''')

async def rows(page, owner_id, capture_id):
    return await sdk(page, '''const r=await c.from('task_workbench_unplaced_items').select('id,owner_id,workspace_id,task').eq('owner_id',arg.ownerId).eq('id',arg.captureId);
      if(r.error)throw Error('ORDINARY_ROW_READ_FAILED');return r.data;''', {'ownerId':owner_id,'captureId':capture_id})

async def reveal_recovery(page, target):
    await page.locator('#quick-task-recovery').wait_for(state='visible')
    if await page.locator(target).is_visible():
        return
    if await page.locator('#quick-task-recovery').evaluate('(e)=>e.open'):
        await page.locator('#quick-task-recovery summary').click()
        await page.wait_for_function("!document.querySelector('#quick-task-recovery').open")
    await page.locator('#quick-task-recovery summary').click()
    await page.locator(target).wait_for(state='visible')

async def pin_built_page(context, page, errors):
    async def entry():
        return await page.evaluate('''()=>({shellVersion:document.querySelector('meta[name="projed-shell-version"]')?.content,
          scripts:Array.from(document.scripts).filter(s=>s.src).map(s=>new URL(s.src).pathname)})''')
    first=await entry()
    RESULT['initialBuiltEntry']=first
    if first['shellVersion']!=CONFIG['shellVersion'] or CONFIG['quickScript'] not in first['scripts']:
        before=await raw(page)
        await page.evaluate('''async()=>{const r=await navigator.serviceWorker.getRegistration();
          if(!r)throw Error('OWNED_SW_REGISTRATION_REQUIRED');await r.update();}''')
        await page.wait_for_function('''async()=>{const r=await navigator.serviceWorker.getRegistration();
          return !!r&&!r.installing&&(!!r.waiting||r.active?.state==='activated');}''',timeout=45000)
        await page.close()
        await asyncio.sleep(1)
        page=await context.new_page()
        page.on('pageerror',lambda error:errors.append(type(error).__name__))
        await page.goto(ORIGIN+'/quick-task/')
        check('N08-normal-worker-reopen-preserves-original-captures',await raw(page)==before)
    actual=await entry()
    RESULT['verifiedBuiltEntry']=actual
    check('N08-rendered-entry-is-pinned-fixed-build',actual['shellVersion']==CONFIG['shellVersion'] and CONFIG['quickScript'] in actual['scripts'])
    return page

async def main():
    context=None
    page=None
    stage='ordinary-C-login'
    async with async_playwright() as p:
        try:
            context=await p.chromium.launch_persistent_context(str(PROFILE),executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True,viewport={'width':726,'height':668})
            page=context.pages[0]
            errors=[]
            page.on('pageerror',lambda error:errors.append(type(error).__name__))
            await page.goto(ORIGIN+'/quick-task/')
            page=await pin_built_page(context,page,errors)
            if not RESUME:
                await page.locator('#quick-task-auth-status button').filter(has_text='登入').wait_for()
                await sdk(page, '''sessionStorage.setItem('projed-quick-sdk-login-intent',String(Date.now()));
              sessionStorage.setItem('projed-quick-sdk-login-prior-session','none');
              const r=await c.auth.signInWithPassword(arg);if(r.error)throw Error('ORDINARY_C_SIGNIN_FAILED');''',
                          {'email':os.environ['DEV133_RECOVERY_ACTOR_C_EMAIL'],'password':os.environ['DEV133_RECOVERY_ACTOR_C_PASSWORD']})
            await page.wait_for_function("document.querySelector('#quick-task-auth-status')?.textContent.includes('已登入')")
            initial=await dependencies(page)
            actor_email=await sdk(page,'return (await c.auth.getUser()).data.user.email;')
            check('N08-new-C-ordinary-network-verified-different-owner',initial['ownerId']==CONFIG['expectedOwnerC'] and initial['ownerId']!=CONFIG['ownerA'])
            check('N08-new-C-missing-profile-and-membership',initial['profileCount']==0 and not initial['memberships'])
            check('N08-C-cannot-read-nonempty-A-fixture',not await rows(page,CONFIG['ownerA'],CONFIG['captureA']))

            stage='missing-dependencies-capture'
            title='DEV133-N08-C-'+CONFIG['attempt']
            if RESUME:
                records=await raw(page)
                capture=next((r for r in records if r['title']==title),None)
                if not capture:
                    raise RuntimeError('ORIGINAL_CAPTURE_MISSING')
            else:
                await context.set_offline(True)
                await page.locator('#quick-task-title').fill(title)
                await page.locator('#quick-task-submit').click()
                capture=await wait_record(page,state='pending')
            check('N08-offline-UI-commits-owner-C-original-ID',capture['accountId']==initial['ownerId'] and capture['title']==title)
            # Simulate a legacy/stale foreign workspaceHint, leaving owner/title/ID unchanged.
            if not RESUME:
                await page.evaluate('''arg=>new Promise((resolve,reject)=>{const q=indexedDB.open('projed-quick-task-v1',2);
              q.onsuccess=()=>{const db=q.result,tx=db.transaction('captures','readwrite'),store=tx.objectStore('captures'),r=store.get(arg.captureId);
                r.onsuccess=()=>store.put({...r.result,workspaceHint:arg.hint});
                tx.oncomplete=()=>{db.close();resolve();};tx.onerror=tx.onabort=()=>{db.close();reject(Error('HINT_FIXTURE_FAILED'));};};q.onerror=()=>reject(Error('OPEN_FAILED'));})''',{'captureId':capture['captureId'],'hint':CONFIG['hintA']})
                await context.set_offline(False)
            elif capture['lastErrorCode']=='P0001':
                stage='legacy-P0001-manual-reconfirmation'
                await reveal_recovery(page,'[data-retry]')
                check('N08-legacy-P0001-is-manual-reconfirmation-only',await page.locator('[data-retry]').text_content()=='重新確認' and not await rows(page,initial['ownerId'],capture['captureId']))
                await page.locator('[data-retry]').click()
                for _ in range(120):
                    updated=await wait_record(page,capture['captureId'])
                    if updated['lastErrorCode']!='P0001':
                        break
                    await asyncio.sleep(0.25)
                check('N08-legacy-reconfirmation-preserves-original-ID-owner-title',updated['captureId']==capture['captureId'] and updated['accountId']==capture['accountId'] and updated['title']==title)
            RESULT['captureId']=capture['captureId']
            RESULT['ownerHashOnlyInUIArtifacts']=True
            failed=await wait_record(page,capture['captureId'],'failed_permanent')
            check('N08-no-membership-foreign-hint-exact-error-keeps-local-record',failed['lastErrorCode']=='QT_NO_AVAILABLE_WORKSPACE' and failed['accountId']==capture['accountId'] and failed['title']==title and failed['workspaceHint']==CONFIG['hintA'] and not failed.get('receipt'))
            check('N08-rejected-RPC-created-no-task',not await rows(page,initial['ownerId'],capture['captureId']))
            await reveal_recovery(page,'[data-workbench]')
            check('N08-normal-recovery-setup-and-retry-CTAs-visible',await page.locator('[data-retry]').is_visible())
            await page.screenshot(path=str(OUT/'missing-dependencies.png'),full_page=True,mask=[page.locator('#quick-task-auth-status')])

            stage='normal-main-workbench-setup'
            await page.locator('[data-workbench]').click()
            await page.wait_for_url(ORIGIN+'/?quick_workbench=1')
            ready=None
            for _ in range(160):
                ready=await dependencies(page)
                if ready['profileCount']==1 and len(ready['memberships'])==1:
                    break
                await asyncio.sleep(0.25)
            check('N08-main-normal-UI-creates-profile-and-own-membership',ready['ownerId']==initial['ownerId'] and ready['profileCount']==1 and len(ready['memberships'])==1 and ready['memberships'][0]!=CONFIG['hintA'])
            await page.screenshot(path=str(OUT/'normal-main-setup.png'),full_page=True,mask=[page.get_by_text(actor_email,exact=False)])

            stage='same-ID-manual-recovery'
            await page.goto(ORIGIN+'/quick-task/')
            retained=await wait_record(page,capture['captureId'],'failed_permanent')
            check('N08-main-setup-did-not-change-or-autosend-capture',retained['accountId']==capture['accountId'] and retained['title']==title and retained['workspaceHint']==CONFIG['hintA'] and not await rows(page,initial['ownerId'],capture['captureId']))
            await reveal_recovery(page,'[data-retry]')
            await page.locator('[data-retry]').click()
            synced=await wait_record(page,capture['captureId'],'synced')
            own=await rows(page,initial['ownerId'],capture['captureId'])
            check('N08-same-ID-owner-title-valid-receipt-after-manual-retry',synced['accountId']==capture['accountId'] and synced['title']==title and synced['receipt']['ownerId']==capture['accountId'] and synced['receipt']['captureId']==capture['captureId'])
            check('N08-foreign-hint-falls-back-to-C-own-workspace-one-task',len(own)==1 and own[0]['workspace_id']==ready['memberships'][0] and own[0]['workspace_id']!=CONFIG['hintA'] and own[0]['task']['title']==title)
            replay=await sdk(page, '''const r=await c.rpc('create_quick_unplaced_task_v1',{p_capture_id:arg.captureId,p_title:arg.title,p_workspace_hint:arg.workspaceHint});
              if(r.error)throw Error('ORDINARY_REPLAY_FAILED');return r.data;''',synced)
            check('N08-real-replay-same-ID-receipt-no-second-task',replay['created'] is False and replay['captureId']==capture['captureId'] and replay['ownerId']==capture['accountId'] and len(await rows(page,initial['ownerId'],capture['captureId']))==1)
            check('N08-C-still-cannot-read-A-task-after-setup',not await rows(page,CONFIG['ownerA'],CONFIG['captureA']))
            RESULT['allCapturesSynced']=all(r['state']=='synced' for r in await raw(page))
            check('N08-all-owned-local-captures-synced-retained',RESULT['allCapturesSynced'])
            check('N08-no-uncaught-pageerror',not errors)
            RESULT['status']='PASS'
        except Exception as error:
            RESULT['failure']={'kind':type(error).__name__,'stage':stage,'assertion':str(error) if isinstance(error,AssertionError) else 'HOSTED_RECOVERY_STEP_FAILED'}
            if page:
                try:
                    RESULT['failureDiagnostics']=await page.evaluate('''()=>({shellVersion:document.querySelector('meta[name="projed-shell-version"]')?.content,
                      recoveryVisible:!document.querySelector('#quick-task-recovery')?.hidden,
                      recoveryOpen:document.querySelector('#quick-task-recovery')?.open,
                      retryButton:document.querySelector('[data-retry]')?.textContent,
                      workbenchButton:!!document.querySelector('[data-workbench]'),
                      scripts:Array.from(document.scripts).filter(s=>s.src).map(s=>new URL(s.src).pathname)})''')
                    await page.screenshot(path=str(OUT/'failure.png'),full_page=True,mask=[page.locator('#quick-task-auth-status')])
                except Exception:
                    pass
        finally:
            if context:
                try:
                    await context.set_offline(False)
                except Exception:
                    pass
                await context.close()
            RESULT['cleanup']='owned Chrome closed; new TEST actor/profile/workspace/server fixtures and any local pending captures retained; no existing business data deleted'
            (OUT/'result.json').write_text(json.dumps(RESULT,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'status':RESULT['status'],'cases':len(RESULT['cases']),'stage':stage}),flush=True)
    return 0 if RESULT['status']=='PASS' else 1

sys.exit(asyncio.run(main()))
