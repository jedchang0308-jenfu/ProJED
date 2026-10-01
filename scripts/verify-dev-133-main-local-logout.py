"""Normal main UI logout against ordinary TEST A; two independent loopback origins."""
import asyncio
import json
import shutil
import re
import sys
from playwright.async_api import async_playwright
from helpers import OUT, PROFILE, RESULT, check, login, raw

async def main():
    RESULT['layer'] = 'live TEST A normal main UI local logout; distinct SDK sessions, two loopback origins'
    context = None
    quick = None
    other = None
    errors = []
    no_captures = False
    stage = 'browser-start'
    auth_statuses = []
    async with async_playwright() as p:
        try:
            context = await p.chromium.launch_persistent_context(str(PROFILE), executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe', headless=True, viewport={'width':1280,'height':900})
            quick = context.pages[0]
            quick.on('response', lambda response: auth_statuses.append(response.status) if '/auth/v1/token' in response.url else None)
            await quick.goto('http://127.0.0.1:4185/quick-task/')
            await quick.locator('#quick-task-auth-status button').filter(has_text='登入').wait_for()
            stage = 'quick-ordinary-login'
            a = await login(quick)
            other = await context.new_page()
            other.on('pageerror', lambda error: errors.append(re.sub(r'https?://\S+|\S+@\S+|eyJ[A-Za-z0-9_.-]+', '[redacted]', str(error).splitlines()[0][:180])))
            await other.goto('http://localhost:4185/quick-task/')
            await other.locator('#quick-task-auth-status button').filter(has_text='登入').wait_for()
            check('M01-other-origin-does-not-inherit-quick-Session',await other.evaluate("async()=>!(await (await import('/src/services/supabase/client.ts')).supabase.auth.getSession()).data.session"))
            stage = 'other-ordinary-login'
            b = await login(other)
            session_id = "async()=>{const c=(await import('/src/services/supabase/client.ts')).supabase;const s=(await c.auth.getSession()).data.session;return JSON.parse(atob(s.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).session_id;}"
            check('M02-same-owner-distinct-normal-SDK-Sessions',a==b and await quick.evaluate(session_id)!=await other.evaluate(session_id))
            stage = 'normal-main-entry'
            await other.goto('http://localhost:4185/')
            await other.locator('[data-main-sidebar-toggle="true"]').wait_for(timeout=45000)
            if not await other.locator('#workspace-board-sidebar').count():
                await other.locator('[data-main-sidebar-toggle="true"]').click()
            await other.locator('button[title="登出"]').wait_for(timeout=45000)
            await other.locator('button[title="登出"]').click()
            stage = 'normal-main-logout'
            await other.wait_for_function("async()=>!(await (await import('/src/services/supabase/client.ts')).supabase.auth.getSession()).data.session",timeout=20000)
            check('M03-normal-main-logout-keeps-other-origin-verified',await quick.evaluate("async()=>{const c=(await import('/src/services/supabase/client.ts')).supabase;const r=await c.auth.getUser();return !r.error&&Boolean(r.data.user);}"))
            check('M04-visible-main-browser-errors',not errors)
            RESULT['status']='PASS'
        except Exception as error:
            RESULT['failure']={'kind':type(error).__name__,'stage':stage,'reason':'main UI or ordinary Session assertion failed; no credentials in report','authTokenHttpStatuses':auth_statuses}
            RESULT['browserErrors']=errors
            if other:
                RESULT['diagnostic']=await other.evaluate("()=>({rootMounted:Boolean(document.querySelector('#root')?.firstElementChild),viteOverlay:Boolean(document.querySelector('vite-error-overlay')),logoutButtons:document.querySelectorAll('button[title=\"登出\"]').length,buttons:document.querySelectorAll('button').length})")
        finally:
            if quick:
                try:
                    no_captures = not await raw(quick)
                except Exception:
                    no_captures = False
            if context:
                await context.close()
            if no_captures and PROFILE.parent==OUT and PROFILE.name=='owned-chrome-profile':
                shutil.rmtree(PROFILE)
                RESULT['profileCleanup']='removed after no-capture raw proof and browser close'
            else:
                RESULT['profileCleanup']='preserved; DEV-133 owns corrective readback'
            (OUT/'result.json').write_text(json.dumps(RESULT,indent=2),encoding='utf-8')
    print(json.dumps({'status':RESULT['status'],'cases':len(RESULT['cases'])}))
    return 0 if RESULT['status']=='PASS' else 1

sys.exit(asyncio.run(main()))
