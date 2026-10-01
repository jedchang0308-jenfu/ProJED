"""Real installed SW A->B->A lifecycle; synthetic local owners, no Auth evidence."""
import asyncio
import json
import sys
import uuid
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path(sys.argv[1]).resolve()
PROFILE = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else OUT / 'owned-update-profile'
ORIGIN = 'http://127.0.0.1:4194'
BUILDS = json.loads((OUT/'builds.json').read_text(encoding='utf-8'))
RESULT = {'devId':'DEV-133','status':'FAIL','layer':'real built SW update / v2 fallback; synthetic local owner fixtures, no Auth or RPC','cases':[], 'buildSourceDigests':{key:BUILDS[key].get('sourceDigest') for key in ['A','B']}, 'buildArtifactDigests':{key:BUILDS[key].get('artifactDigest') for key in ['A','B']}}

def check(name, condition):
    RESULT['cases'].append({'case':name,'status':'PASS' if condition else 'FAIL'})
    if not condition:
        raise AssertionError(name)

async def raw(page):
    return await page.evaluate('''async()=>new Promise((resolve,reject)=>{
      const q=indexedDB.open('projed-quick-task-v1');q.onerror=()=>reject(Error('RAW_OPEN_FAILED'));
      q.onsuccess=()=>{const db=q.result,tx=db.transaction('captures','readonly'),r=tx.objectStore('captures').getAll();
        tx.oncomplete=()=>{db.close();resolve({version:db.version,records:r.result});};tx.onerror=tx.onabort=()=>{db.close();reject(Error('RAW_READ_FAILED'));};};})''')

async def wait_switch(name):
    (OUT/('switch-requested.json' if name=='B' else 'rollback-requested.json')).write_text('{}',encoding='utf-8')
    for _ in range(200):
        f=OUT/f'{name}-ready.json'
        if f.exists():
            if json.loads(f.read_text(encoding='utf-8'))['status']!='PASS':
                raise RuntimeError('PREVIEW_SWITCH_FAILED')
            return
        await asyncio.sleep(0.2)
    raise TimeoutError('PREVIEW_SWITCH_TIMEOUT')

async def open_context(p, errors, requests, existing=None):
    c=existing or await p.chromium.launch_persistent_context(str(PROFILE),executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True,viewport={'width':390,'height':844})
    page=await c.new_page() if existing else c.pages[0]
    page.on('pageerror',lambda e:errors.append(type(e).__name__))
    page.on('request',lambda r:requests.append(True) if '/rest/v1/' in r.url or '/realtime/v1/' in r.url or 'firestore.googleapis.com' in r.url else None)
    await page.goto(ORIGIN+'/quick-task/')
    await page.wait_for_function('!document.querySelector("#quick-task-submit").disabled')
    await page.evaluate('Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error("SW_READY_TIMEOUT")),45000))])')
    if not await page.evaluate('Boolean(navigator.serviceWorker.controller)'):
        await page.reload()
    await page.wait_for_function('navigator.serviceWorker.controller!==null')
    return c,page

async def cached_version(c,page):
    await c.set_offline(True)
    try:
        return await page.evaluate("async()=> (await (await fetch('/app-shell-meta.json',{cache:'no-store'})).json()).version")
    finally:
        await c.set_offline(False)

async def main():
    context=None
    errors=[]
    requests=[]
    stage='initial'
    async with async_playwright() as p:
        try:
            context,page=await open_context(p,errors,requests)
            check('N10-build-A-active-offline-shell',await cached_version(context,page)==BUILDS['A']['shellVersion'])
            await context.set_offline(True)
            await page.locator('#quick-task-title').fill('DEV133 synthetic update fixture')
            await page.locator('#quick-task-submit').click()
            await page.locator('#quick-task-success').wait_for(state='visible')
            await context.set_offline(False)
            for owner in ['synthetic-owner-A','synthetic-owner-B']:
                await page.evaluate('''async r=>new Promise((resolve,reject)=>{const q=indexedDB.open('projed-quick-task-v1',2);
                  q.onsuccess=()=>{const db=q.result,tx=db.transaction('captures','readwrite');tx.objectStore('captures').add(r);
                    tx.oncomplete=()=>{db.close();resolve();};tx.onerror=tx.onabort=()=>{db.close();reject(Error('SEED_FAILED'));};};q.onerror=()=>reject(Error('OPEN_FAILED'));})''',{'schemaVersion':1,'captureId':'task_workbench_unplaced_'+str(uuid.uuid4()),'accountId':owner,'title':'synthetic owner preservation','workspaceHint':None,'clientCreatedAt':1,'updatedAt':1,'state':'pending','attemptCount':0,'nextAttemptAt':None,'lastErrorCode':None,'leaseId':None,'leaseExpiresAt':None,'claimIntent':None})
            before=await raw(page)
            check('N10-update-fixtures-v2-A-B-unbound',before['version']==2 and len(before['records'])==3)
            stage='update-B'
            await wait_switch('B')
            RESULT['networkBuildB']=(await (await page.request.get(ORIGIN+'/app-shell-meta.json')).json())['version']
            await page.evaluate('async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();}')
            await page.wait_for_function('async()=>Boolean((await navigator.serviceWorker.getRegistration()).waiting)',timeout=30000)
            check('N10-waiting-worker-does-not-rewrite-captures',await raw(page)==before)
            await page.close()
            await asyncio.sleep(1)
            context,page=await open_context(p,errors,requests,context)
            await page.wait_for_function('async()=>{const r=await navigator.serviceWorker.getRegistration();return r.active?.state==="activated"&&!r.waiting&&!r.installing;}',timeout=30000)
            await page.reload()
            RESULT['offlineBuildB']=await cached_version(context,page)
            check('N10-build-B-activated-on-reopen',RESULT['offlineBuildB']==BUILDS['B']['shellVersion'])
            check('N10-build-B-preserves-raw-owner-ID-title',await raw(page)==before)
            stage='fallback-A'
            await wait_switch('A')
            await page.evaluate('async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();}')
            await page.wait_for_function('async()=>Boolean((await navigator.serviceWorker.getRegistration()).waiting)',timeout=30000)
            await page.close()
            await asyncio.sleep(1)
            context,page=await open_context(p,errors,requests,context)
            await page.wait_for_function('async()=>{const r=await navigator.serviceWorker.getRegistration();return r.active?.state==="activated"&&!r.waiting&&!r.installing;}',timeout=30000)
            await page.reload()
            check('N10-v2-compatible-build-A-fallback-activated',await cached_version(context,page)==BUILDS['A']['shellVersion'])
            check('N10-fallback-preserves-all-pending-captures',await raw(page)==before)
            check('N10-root-quick-manifest-identity-stable',all(BUILDS['A'][kind][key]==BUILDS['B'][kind][key] for kind in ['rootIdentity','quickIdentity'] for key in ['id','start_url','scope']))
            check('N10-update-origin-stable-no-business-dispatch',page.url.startswith(ORIGIN+'/quick-task/') and not requests)
            check('N10-update-no-visible-browser-error',not errors)
            RESULT['status']='PASS'
        except Exception as error:
            RESULT['failure']={'kind':type(error).__name__,'stage':stage,'reason':'built update assertion failed; no Auth credentials or titles in report'}
        finally:
            if context:
                await context.close()
            RESULT['profileCleanup']='closed browser; retained profile and all synthetic pending captures; DEV-133 owns follow-up'
            (OUT/'result.json').write_text(json.dumps(RESULT,indent=2),encoding='utf-8')
    print(json.dumps({'status':RESULT['status'],'cases':len(RESULT['cases'])}))
    return 0 if RESULT['status']=='PASS' else 1

sys.exit(asyncio.run(main()))
