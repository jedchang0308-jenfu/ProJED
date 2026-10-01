"""Isolated synthetic browser fixtures; never contacts Auth or business APIs."""
import asyncio
import json
import sys
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path(sys.argv[1]).resolve()
ORIGIN = 'http://127.0.0.1:4183'

async def main():
    result = {'devId': 'DEV-133', 'layer': 'SIMULATION: real browser/IDB, injected Auth/RPC', 'status': 'FAIL', 'cases': [], 'unexpectedRequests': []}
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe', headless=True)
        try:
            source = (OUT / 'cases.js').read_text(encoding='utf-8')
            for name in ['model', 'storage', 'cleanup', 'claim', 'auth', 'sync', 'upgrade', 'upgrade-abort', 'legacy', 'context']:
                context = await browser.new_context()
                async def guard(route):
                    result['unexpectedRequests'].append('blocked external request')
                    await route.abort()
                await context.route('https://**/*', guard)
                page = await context.new_page()
                await page.route('**/__boundary', lambda route: route.fulfill(content_type='text/html', body='<html><body>DEV-133 isolated fixture</body></html>'))
                await page.goto(ORIGIN + '/__boundary')
                try:
                    rows = await page.evaluate(source, name)
                    result['cases'].extend(rows)
                except Exception as error:
                    result['cases'].append({'case': name + '-harness', 'status': 'FAIL', 'error': str(error).splitlines()[0][:180]})
                finally:
                    await context.close()
            context = await browser.new_context(viewport={'width': 390, 'height': 844})
            await context.route('https://**/*', guard)
            page = await context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)[:160]))
            html = (OUT / 'candidate/quick-task/index.html').read_text(encoding='utf-8')
            setup = '''<script type="module">
              const c=(await import('/src/services/supabase/client.ts')).supabase;
              window.__fixture={subscriptions:0,users:0,session:null};
              const interval=window.setInterval.bind(window),clear=window.clearInterval.bind(window);
              window.__fixture.dailyTimers=new Set();
              window.setInterval=(fn,ms,...args)=>{const id=interval(fn,ms,...args);if(ms===86400000)window.__fixture.dailyTimers.add(id);return id;};
              window.clearInterval=id=>{window.__fixture.dailyTimers.delete(id);clear(id);};
              c.auth.getSession=async()=>({data:{session:window.__fixture.session},error:null});
              c.auth.getUser=async()=>{window.__fixture.users++;return {data:{user:window.__fixture.userError?null:window.__fixture.session?.user},error:window.__fixture.userError??null};};
              c.auth.onAuthStateChange=handler=>{window.__fixture.handler=handler;window.__fixture.subscriptions++;return {data:{subscription:{unsubscribe:()=>window.__fixture.subscriptions--}}};};
              await import('/src/quickTask/main.ts');
            </script>'''
            html = html.replace('<script type="module" src="/src/quickTask/main.ts"></script>', setup)
            await page.route('**/quick-task/', lambda route: route.fulfill(content_type='text/html', body=html))
            await page.goto(ORIGIN + '/quick-task/')
            await page.wait_for_function('window.__fixture?.subscriptions===1 && !document.querySelector("#quick-task-submit").disabled')
            async def check(name, passed):
                result['cases'].append({'case': name, 'status': 'PASS' if passed else 'FAIL'})
            title = page.locator('#quick-task-title')
            await title.fill('IME fixture')
            await title.dispatch_event('compositionstart')
            await page.locator('#quick-task-submit').click()
            await check('N03-UI-IME-does-not-commit', await title.input_value() == 'IME fixture' and await page.locator('#quick-task-success').is_hidden())
            await title.dispatch_event('compositionend')
            await page.evaluate('''() => {
              const original=IDBObjectStore.prototype.get;
              window.__failReadback=true;
              IDBObjectStore.prototype.get=function(key){ const request=original.call(this,key);
                if(window.__failReadback && this.name==='captures' && this.transaction.mode==='readonly' && String(key).startsWith('task_workbench_unplaced_')) {
                  window.__failReadback=false; const tx=this.transaction; queueMicrotask(()=>tx.abort());
                } return request;
              };
            }''')
            await page.locator('#quick-task-submit').click()
            await page.locator('#quick-task-message').filter(has_text='無法確認是否已記下').wait_for()
            await page.locator('#quick-task-submit').click()
            await page.locator('#quick-task-success').wait_for(state='visible')
            captures = await page.evaluate("async()=>{const o=await import('/src/features/quickTaskCapture/outbox.ts');return await o.listQuickCaptures(null);}")
            await check('N03-UI-readback-retry-original-ID', len(captures) == 1 and captures[0]['title'] == 'IME fixture')
            await page.locator('[data-next]').click()
            await page.evaluate('''()=>{
              window.__speech={started:0};
              class FixtureSpeech {
                start(){window.__speech.started++;window.__speech.lang=this.lang;setTimeout(()=>{this.onresult?.({resultIndex:0,results:[Object.assign([{transcript:'巡檢'}],{isFinal:true})]});this.onend?.();},20);}
                stop(){this.onend?.();} abort(){this.onend?.();}
              }
              window.SpeechRecognition=FixtureSpeech;
            }''')
            await title.fill('明天確認閥門')
            await title.evaluate('(e)=>e.setSelectionRange(2,4)')
            await page.locator('#quick-task-voice').click()
            await page.wait_for_function("document.querySelector('#quick-task-title').value==='明天巡檢閥門'")
            await check('N03-voice-replaces-selection-simulation',await page.evaluate("window.__speech.started===1 && window.__speech.lang===document.documentElement.lang"))
            await title.fill('😀' * 500)
            await page.locator('#quick-task-submit').click()
            await page.locator('#quick-task-success').wait_for(state='visible')
            captures = await page.evaluate("async()=>await (await import('/src/features/quickTaskCapture/outbox.ts')).listQuickCaptures(null)")
            await check('N03-UI-500-emoji-not-truncated', len(captures) == 2 and any(len(r['title']) == 500 for r in captures))
            await page.evaluate('''()=>{
              window.__originalTimeout=window.setTimeout;
              window.setTimeout=(fn,ms,...args)=>window.__originalTimeout(fn,ms>=5000&&ms<=900000?1:ms,...args);
              window.__fixture.userError={status:503};
              window.__fixture.session={user:{id:'fixture-a'},access_token:'e30.'+btoa(JSON.stringify({session_id:'fixture-session'}))+'.fixture'};
              window.__fixture.handler('SIGNED_IN',window.__fixture.session);
            }''')
            await page.wait_for_function('window.__fixture.users>=8')
            await asyncio.sleep(0.1)
            await check('N04-Auth-outage-cycle-stops-at-eight-checks',await page.evaluate('window.__fixture.users') == 8)
            await page.evaluate("window.setTimeout=window.__originalTimeout;window.__fixture.session=null;window.__fixture.handler('SIGNED_OUT',null)")
            await page.evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}))")
            await check('N10-pagehide-unsubscribes', await page.evaluate('window.__fixture.subscriptions') == 0)
            await check('N10-pagehide-clears-daily-timer', await page.evaluate('window.__fixture.dailyTimers.size') == 0)
            await page.evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))")
            await page.wait_for_function('window.__fixture.subscriptions===1')
            await page.evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))")
            await check('N10-bfcache-resumes-single-subscription', await page.evaluate('window.__fixture.subscriptions') == 1)
            await check('N10-bfcache-resumes-single-daily-timer', await page.evaluate('window.__fixture.dailyTimers.size') == 1)
            for width, height in [(320, 844), (390, 844), (726, 668)]:
                await page.set_viewport_size({'width':width,'height':height})
                if await page.locator('[data-next]').is_visible():
                    await page.locator('[data-next]').click()
                await title.focus()
                geometry = await page.evaluate('''()=>{
                  const input=document.querySelector('#quick-task-title').getBoundingClientRect(),voice=document.querySelector('#quick-task-voice').getBoundingClientRect(),container=document.querySelector('.quick-task-input-row').getBoundingClientRect();
                  return document.documentElement.scrollWidth<=innerWidth+1 && input.width>0 && voice.left>=input.right-1 && voice.right<=container.right && input.left>=container.left;
                }''')
                await check(f'N10-layout-keyboard-{width}x{height}', geometry)
                await page.screenshot(path=str(OUT / f'quick-{width}x{height}.png'), full_page=True)
            await page.evaluate("Object.defineProperty(window,'crypto',{configurable:true,value:{}})")
            await title.fill('unavailable crypto fixture')
            await page.locator('#quick-task-submit').click()
            await asyncio.sleep(0.05)
            await check('N03-unavailable-crypto-preserves-editable-input', not await page.locator('#quick-task-submit').is_disabled() and await title.input_value() == 'unavailable crypto fixture' and await page.locator('#quick-task-success').is_hidden())
            await check('N10-visible-browser-errors', not errors)
            await context.close()
        finally:
            await browser.close()
    result['status'] = 'PASS' if result['cases'] and all(r['status'] == 'PASS' for r in result['cases']) and not result['unexpectedRequests'] else 'FAIL'
    (OUT / 'result.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps({'status': result['status'], 'cases': len(result['cases']), 'failures': [r['case'] for r in result['cases'] if r['status'] != 'PASS']}), flush=True)
    return 0 if result['status'] == 'PASS' else 1

sys.exit(asyncio.run(main()))
