"""Built TEST bundle, real Service Worker/offline reopen; synthetic unbound task."""
import asyncio
import json
import sys
import tempfile
from pathlib import Path
from playwright.async_api import async_playwright
OUT = Path(sys.argv[1]).resolve()

async def captures(page):
    return await page.evaluate('''async()=>new Promise((resolve,reject)=>{
      const request=indexedDB.open('projed-quick-task-v1');
      request.onerror=()=>reject(Error('CAPTURE_READ_FAILED'));
      request.onsuccess=()=>{const db=request.result,tx=db.transaction('captures','readonly'),rows=tx.objectStore('captures').getAll();
        tx.oncomplete=()=>{db.close();resolve(rows.result.map(r=>({captureId:r.captureId,title:r.title,accountId:r.accountId,state:r.state})));};
        tx.onerror=tx.onabort=()=>{db.close();reject(Error('CAPTURE_READ_FAILED'));};};
    })''')

async def main():
    result = {'devId':'DEV-133','status':'FAIL','layer':'built TEST bundle / real browser offline / synthetic local fixture','cases':[]}
    def check(name, passed):
        result['cases'].append({'case':name,'status':'PASS' if passed else 'FAIL'})
        if not passed:
            raise AssertionError(name)
    async with async_playwright() as p:
        # Keep Chromium's nested Service Worker storage below Windows path limits.
        # This owned profile is retained because it contains an unsynced fixture.
        profile = Path(tempfile.mkdtemp(prefix='d133-offline-'))
        result['profilePath'] = str(profile)
        (OUT/'profile-ownership.json').write_text(json.dumps({
            'project':'ProJED','devId':'DEV-133','purpose':'built offline persistence',
            'profilePath':str(profile),'cleanupCondition':'close browser at test end; preserve unsynced fixture profile',
        },indent=2),encoding='utf-8')
        context = await p.chromium.launch_persistent_context(str(profile),executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True,viewport={'width':390,'height':844})
        await context.add_init_script("""(() => {
          window.__swRegistrationFailures=[];
          window.__swRegistrationCalls=0;
          if(!('serviceWorker' in navigator))return;
          const register=navigator.serviceWorker.register.bind(navigator.serviceWorker);
          navigator.serviceWorker.register=(...args)=>{window.__swRegistrationCalls++;return register(...args).catch(error=>{window.__swRegistrationFailures.push(String(error.message).slice(0,300));throw error;});};
        })();""")
        page = context.pages[0]
        errors = []
        business_requests = []
        sw_failures = []
        page.on('request',lambda request: business_requests.append(True) if '/rest/v1/' in request.url or '/realtime/v1/' in request.url or 'firestore.googleapis.com' in request.url else None)
        page.on('pageerror',lambda error: errors.append(str(error).splitlines()[0][:120]))
        page.on('requestfailed',lambda request: sw_failures.append({'path':request.url.split('?')[0], 'reason':request.failure}) if request.url.startswith('http://127.0.0.1:4193/') else None)
        try:
            await page.goto('http://127.0.0.1:4193/quick-task/')
            await page.wait_for_function('!document.querySelector("#quick-task-submit").disabled')
            await page.evaluate("Promise.race([navigator.serviceWorker.ready, new Promise((_, reject)=>setTimeout(()=>reject(Error('SW_READY_TIMEOUT')),45000))])")
            await page.reload()
            await page.wait_for_function('navigator.serviceWorker.controller !== null')
            check('N10-built-bundle-shared-root-SW-controls-quick',True)
            check('DEV122-built-cold-entry-zero-business-requests',not business_requests)
            await page.locator('#quick-task-title').fill('DEV133 built offline fixture')
            await context.set_offline(True)
            await page.locator('#quick-task-submit').click()
            await page.locator('#quick-task-success').wait_for(state='visible')
            saved = await captures(page)
            check('N03-built-offline-commit-before-auth',len(saved)==1 and saved[0]['accountId'] is None and saved[0]['title']=='DEV133 built offline fixture' and saved[0]['state']=='awaiting_auth')
            check('DEV122-unbound-offline-capture-does-not-send-business-request',not business_requests)
            await page.reload(wait_until='domcontentloaded')
            await page.wait_for_function('!document.querySelector("#quick-task-submit").disabled')
            await page.locator('[data-recover]').wait_for()
            check('N03-N10-offline-reopen-preserves-unbound-IDB',await captures(page)==saved and await page.locator('[data-recover-summary]').get_attribute('data-count')=='1')
            await context.close()
            context = await p.chromium.launch_persistent_context(str(profile),executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True,viewport={'width':390,'height':844})
            await context.set_offline(True)
            page = context.pages[0]
            page.on('pageerror',lambda error: errors.append(str(error).splitlines()[0][:120]))
            await page.goto('http://127.0.0.1:4193/quick-task/',wait_until='domcontentloaded')
            await page.wait_for_function('!document.querySelector("#quick-task-submit").disabled')
            await page.locator('[data-recover]').wait_for()
            check('N03-N10-offline-browser-restart-preserves-unbound-IDB',await captures(page)==saved and await page.locator('[data-recover-summary]').get_attribute('data-count')=='1')
            await page.locator('#quick-task-title').fill('keyboard draft')
            await page.locator('#quick-task-title').press('Tab')
            check('N10-keyboard-focus-voice',await page.locator('#quick-task-voice').evaluate('(e)=>e===document.activeElement'))
            await page.locator('#quick-task-voice').press('Tab')
            check('N10-keyboard-focus-submit',await page.locator('#quick-task-submit').evaluate('(e)=>e===document.activeElement'))
            await page.set_viewport_size({'width':390,'height':480})
            await page.locator('#quick-task-title').focus()
            check('N10-keyboard-reduced-viewport-no-overflow',await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
            await page.screenshot(path=str(OUT/'offline-reopen-keyboard.png'),full_page=True)
            check('N10-no-uncaught-visible-errors',not errors)
            result['status']='PASS'
        except Exception as error:
            result['failure']={'kind':type(error).__name__,'reason':str(error).splitlines()[0][:160]}
            result['swDiagnostics']={'errors':errors,'failedLocalRequests':sw_failures}
            try:
                result['swDiagnostics']['registrations']=await page.evaluate("async()=>({url:location.pathname, secureContext:isSecureContext, calls:window.__swRegistrationCalls, failures:window.__swRegistrationFailures, scripts:[...document.scripts].map(s=>new URL(s.src||location.href).pathname),authStatus:document.querySelector('#quick-task-auth-status').textContent, registrations:await navigator.serviceWorker.getRegistrations().then(rows=>rows.map(r=>({scope:r.scope,active:r.active?.state,waiting:r.waiting?.state,installing:r.installing?.state})))})")
            except Exception:
                pass
        finally:
            await context.set_offline(False)
            await context.close()
            result['profileCleanup']='preserved with synthetic unbound capture; DEV-133 owns follow-up; no pending captures deleted'
    (OUT/'result.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps({'status':result['status'],'cases':len(result['cases'])}),flush=True)
    return 0 if result['status']=='PASS' else 1
sys.exit(asyncio.run(main()))
