"""Built TEST bundle, real Service Worker/offline reopen; synthetic unbound task."""
import asyncio
import json
import sys
from pathlib import Path
from playwright.async_api import async_playwright
OUT = Path(sys.argv[1]).resolve()

async def main():
    result = {'devId':'DEV-133','status':'FAIL','layer':'built TEST bundle / real browser offline / synthetic local fixture','cases':[]}
    def check(name, passed):
        result['cases'].append({'case':name,'status':'PASS' if passed else 'FAIL'})
        if not passed:
            raise AssertionError(name)
    async with async_playwright() as p:
        profile = OUT / 'owned-offline-profile'
        context = await p.chromium.launch_persistent_context(str(profile),executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True,viewport={'width':390,'height':844})
        page = context.pages[0]
        errors = []
        business_requests = []
        page.on('request',lambda request: business_requests.append(True) if '/rest/v1/' in request.url or '/realtime/v1/' in request.url or 'firestore.googleapis.com' in request.url else None)
        page.on('pageerror',lambda error: errors.append(str(error).splitlines()[0][:120]))
        try:
            await page.goto('http://127.0.0.1:4193/quick-task/')
            await page.wait_for_function('!document.querySelector("#quick-task-submit").disabled')
            await page.evaluate('navigator.serviceWorker.ready')
            await page.reload()
            await page.wait_for_function('navigator.serviceWorker.controller !== null')
            check('N10-built-bundle-shared-root-SW-controls-quick',True)
            check('DEV122-built-cold-entry-zero-business-requests',not business_requests)
            await page.locator('#quick-task-title').fill('DEV133 built offline fixture')
            await context.set_offline(True)
            await page.locator('#quick-task-submit').click()
            await page.locator('#quick-task-success').wait_for(state='visible')
            check('N03-built-offline-commit-before-auth',True)
            check('DEV122-unbound-offline-capture-does-not-send-business-request',not business_requests)
            await page.reload(wait_until='domcontentloaded')
            await page.wait_for_function('!document.querySelector("#quick-task-submit").disabled')
            await page.locator('[data-recover]').wait_for()
            check('N03-N10-offline-reopen-preserves-unbound-IDB', '待確認 1 筆' in await page.locator('[data-recover]').inner_text())
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
        finally:
            await context.set_offline(False)
            await context.close()
            result['profileCleanup']='preserved with synthetic unbound capture; DEV-133 owns follow-up; no pending captures deleted'
    (OUT/'result.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps({'status':result['status'],'cases':len(result['cases'])}),flush=True)
    return 0 if result['status']=='PASS' else 1
sys.exit(asyncio.run(main()))
