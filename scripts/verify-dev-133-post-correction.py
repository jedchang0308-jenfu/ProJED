"""Reuse the live task-owned TEST sessions after the B0 gate; no human re-login."""
import asyncio
import json
import os
import sys
import uuid
from pathlib import Path
from playwright.async_api import async_playwright
OUT = Path(sys.argv[1]).resolve()

async def main():
    result={'devId':'DEV-133','status':'FAIL','layer':'ordinary live TEST sessions after correction','cases':[]}
    def check(name,passed):
        result['cases'].append({'case':name,'status':'PASS' if passed else 'FAIL'})
        if not passed: raise AssertionError(name)
    async with async_playwright() as p:
        browser=await p.chromium.connect_over_cdp('http://127.0.0.1:4175')
        context=browser.contexts[0]
        quick=next(page for page in context.pages if page.url.startswith('http://127.0.0.1:4173/quick-task/'))
        other=next(page for page in context.pages if page.url.startswith('http://127.0.0.1:4174/quick-task/'))
        try:
            # Read-only to ordinary identities except explicit A password login in this origin.
            await quick.evaluate('''async credentials=>{
              sessionStorage.setItem('projed-quick-sdk-login-intent',String(Date.now()));
              const c=(await import('/src/services/supabase/client.ts')).supabase;
              const r=await c.auth.signInWithPassword(credentials);if(r.error)throw Error('A_LOGIN_FAILED');
            }''',{'email':os.environ['DEV133_TEST_ACTOR_A_EMAIL'],'password':os.environ['DEV133_TEST_ACTOR_A_PASSWORD']})
            await quick.wait_for_function("document.querySelector('#quick-task-auth-status')?.textContent.includes('已登入')",timeout=30000)
            async def identity(page):
                return await page.evaluate("async()=>{const c=(await import('/src/services/supabase/client.ts')).supabase;const r=await c.auth.getUser();if(r.error)throw Error('AUTH_CHECK_FAILED');return r.data.user.id;}")
            a,b=await identity(quick),await identity(other)
            check('B1-ordinary-A-B-distinct',a!=b)
            async def records(page,owner):
                return await page.evaluate("async owner=>await (await import('/src/features/quickTaskCapture/outbox.ts')).listQuickCaptures(owner)",owner)
            ra=next(r for r in await records(quick,a) if r['state']=='synced')
            # B's nonempty capture fixture lives in the quick origin. The other
            # origin has an independent B Session but need not duplicate its IDB.
            rb=next(r for r in await records(quick,b) if r['state']=='synced')
            async def read(page,r):
                return await page.evaluate('''async r=>{
                  const c=(await import('/src/services/supabase/client.ts')).supabase;
                  const q=await c.from('task_workbench_unplaced_items').select('id,sort_order').eq('owner_id',r.accountId).eq('id',r.captureId);
                  return {failed:Boolean(q.error),rows:q.data??[]};
                }''',r)
            qa,qb=await read(quick,ra),await read(other,rb)
            check('B1-both-own-nonempty-tasks-readable',not qa['failed'] and not qb['failed'] and len(qa['rows'])==len(qb['rows'])==1)
            ca,cb=await read(quick,rb),await read(other,ra)
            check('B1-live-reciprocal-task-SELECT-denied',not ca['failed'] and not cb['failed'] and len(ca['rows'])==len(cb['rows'])==0)
            for page,r,sort in [(quick,rb,qb['rows'][0]['sort_order']),(other,ra,qa['rows'][0]['sort_order'])]:
                denied=await page.evaluate('''async({r,sort})=>{const c=(await import('/src/services/supabase/client.ts')).supabase;const q=await c.from('task_workbench_unplaced_items').update({sort_order:sort}).eq('owner_id',r.accountId).eq('id',r.captureId).select('id');return {code:q.error?.code,count:q.data?.length??0};}''',{'r':r,'sort':sort})
                check('B1-live-foreign-UPDATE-denied-'+('A' if page==quick else 'B'),denied['count']==0 and denied.get('code') in [None,'42501'])
            status=await other.evaluate('''async({r,key})=>{const c=await import('/src/services/supabase/client.ts');const token=(await c.supabase.auth.getSession()).data.session.access_token;const response=await fetch(c.configuredSupabaseUrl+'/rest/v1/quick_task_capture_receipts?select=capture_id&capture_id=eq.'+r.captureId,{headers:{apikey:key,Authorization:'Bearer '+token,'Accept-Profile':'private'},credentials:'omit'});return response.status;}''',{'r':ra,'key':os.environ['DEV133_TEST_PUBLIC_KEY']})
            check('B1-private-receipt-schema-remains-unexposed',status in [403,404,406])
            check('N10-canonical-origins-never-transfer-credentials',await quick.evaluate('''async()=>{const m=await import('/src/features/quickTaskCapture/origins.ts');return m.getWorkbenchUrl('https://projed-cc78d.firebaseapp.com')==='https://projed-cc78d.web.app/?quick_workbench=1'&&m.getQuickInstallUrl('https://projed-cc78d.web.app')==='https://projed-cc78d.firebaseapp.com/quick-task/?install=1';}'''))
            result['status']='PASS'
        except Exception as error:
            result['failure']={'kind':type(error).__name__,'reason':(str(error).splitlines() or [''])[0][:140]}
    (OUT/'post-correction-result.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps({'status':result['status'],'cases':len(result['cases'])}))
    return 0 if result['status']=='PASS' else 1
sys.exit(asyncio.run(main()))
