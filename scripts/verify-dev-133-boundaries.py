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
            for name in ['model', 'storage', 'cleanup', 'claim', 'auth', 'sync', 'upgrade', 'upgrade-abort', 'legacy', 'context', 'offline-auth-null', 'offline-auth-401']:
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
              window.__fixture={subscriptions:0,users:0,session:null,outageChecks:[],retrySchedules:[],outageEvents:[]};
              const interval=window.setInterval.bind(window),clear=window.clearInterval.bind(window);
              window.__fixture.dailyTimers=new Set();
              window.setInterval=(fn,ms,...args)=>{const id=interval(fn,ms,...args);if(ms===86400000)window.__fixture.dailyTimers.add(id);return id;};
              window.clearInterval=id=>{window.__fixture.dailyTimers.delete(id);clear(id);};
              c.auth.getSession=async()=>({data:{session:window.__fixture.session},error:null});
              c.auth.getUser=async()=>{window.__fixture.users++;if(window.__fixture.recordOutage)window.__fixture.outageChecks.push(performance.now());return {data:{user:window.__fixture.userError?null:window.__fixture.session?.user},error:window.__fixture.userError??null};};
              c.auth.onAuthStateChange=handler=>{window.__fixture.handler=handler;window.__fixture.subscriptions++;return {data:{subscription:{unsubscribe:()=>window.__fixture.subscriptions--}}};};
              await import('/src/quickTask/main.ts');
            </script>'''
            html = html.replace('<script type="module" src="/src/quickTask/main.ts"></script>', setup)
            await page.route('**/quick-task/', lambda route: route.fulfill(content_type='text/html', body=html))
            await page.goto(ORIGIN + '/quick-task/')
            await page.wait_for_function('window.__fixture?.subscriptions===1 && window.__fixture.dailyTimers.size===1 && document.querySelector("#quick-task-auth-status").textContent.includes("尚未登入")')
            async def check(name, passed):
                result['cases'].append({'case': name, 'status': 'PASS' if passed else 'FAIL'})
            title = page.locator('#quick-task-title')
            await page.evaluate('''()=>{
              window.__originalTimeout=window.setTimeout;
              window.__fixture.recordOutage=true;
              window.addEventListener('online',()=>window.__fixture.outageEvents.push('online'));
              window.addEventListener('pageshow',()=>window.__fixture.outageEvents.push('pageshow'));
              document.addEventListener('visibilitychange',()=>window.__fixture.outageEvents.push('visibilitychange:'+document.visibilityState));
              window.setTimeout=(fn,ms,...args)=>{if(ms>=5000&&ms<=900000)window.__fixture.retrySchedules.push(ms);return window.__originalTimeout(fn,ms>=5000&&ms<=900000?1:ms,...args);};
              window.__fixture.outageBaseline=window.__fixture.users;
              window.__fixture.userError={status:503};
              window.__fixture.session={user:{id:'fixture-a'},access_token:'e30.'+btoa(JSON.stringify({session_id:'fixture-session'}))+'.fixture'};
              window.__fixture.handler('SIGNED_IN',window.__fixture.session);
            }''')
            await page.wait_for_function('window.__fixture.users>=8')
            await asyncio.sleep(0.1)
            auth_outage_counts = await page.evaluate('''()=>({before:window.__fixture.outageBaseline,after:window.__fixture.users})''')
            await check('N04-Auth-outage-cycle-stops-at-eight-checks', auth_outage_counts['after'] - auth_outage_counts['before'] == 8)
            if auth_outage_counts['after'] - auth_outage_counts['before'] != 8:
                result['cases'][-1]['diagnostics'] = {**auth_outage_counts,
                    'checkTimes': await page.evaluate('window.__fixture.outageChecks'),
                    'retrySchedules': await page.evaluate('window.__fixture.retrySchedules'),
                    'events': await page.evaluate('window.__fixture.outageEvents')}
            await page.evaluate("window.setTimeout=window.__originalTimeout;window.__fixture.session=null;window.__fixture.handler('SIGNED_OUT',null)")
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
            await check('N03-UI-input-remains-available-after-success', not await title.is_disabled())
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
            await page.wait_for_function('!document.querySelector("#quick-task-submit").disabled')
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

            startup_context = await browser.new_context(viewport={'width': 390, 'height': 844})
            await startup_context.route('https://**/*', guard)
            startup_page = await startup_context.new_page()
            startup_errors = []
            startup_page.on('pageerror', lambda error: startup_errors.append(str(error)[:160]))
            startup_html = (OUT / 'candidate/quick-task/index.html').read_text(encoding='utf-8')
            startup_setup = '''<script type="module">
              const c=(await import('/src/services/supabase/client.ts')).supabase;
              const m=await import('/src/features/quickTaskCapture/model.ts');
              const o=await import('/src/features/quickTaskCapture/outbox.ts');
              const projectRef='fhisnnufoeulxqrchldf';
              const context={key:'current',projectRef,accountId:'actor-a',displayLabel:'fixture A',verifiedAt:Date.now(),bindingAllowed:true,revision:1,barrierAt:null,sessionId:'session-a'};
              await o.saveQuickAuthContext(context,null);
              const privateRecord={schemaVersion:1,captureId:m.createQuickCaptureId(),accountId:'actor-a',title:'actor-a-private-recovery-fixture',workspaceHint:null,clientCreatedAt:Date.now(),updatedAt:Date.now(),state:'failed_auth',attemptCount:1,nextAttemptAt:null,lastErrorCode:'AUTH_REQUIRED',leaseId:null,leaseExpiresAt:null,claimIntent:null};
              await o.commitQuickCapture(privateRecord);
              window.__fixture={sessionReads:0,session:{user:{id:'actor-b'},access_token:'e30.'+btoa(JSON.stringify({session_id:'session-b'}))+'.fixture'},rpcCalls:0};
              c.auth.getSession=()=>{window.__fixture.sessionReads++;if(window.__fixture.sessionReads===1)return new Promise(resolve=>window.__fixture.resolveInitial=resolve);return Promise.resolve({data:{session:window.__fixture.session},error:null});};
              c.auth.getUser=async()=>({data:{user:{...window.__fixture.session.user,email:'fixture'}},error:null});
              c.auth.onAuthStateChange=handler=>{window.__fixture.handler=handler;return {data:{subscription:{unsubscribe:()=>undefined}}};};
              const nativeFetch=window.fetch.bind(window);window.fetch=(...args)=>{if(String(args[0]).includes('/rest/v1/rpc/'))window.__fixture.rpcCalls++;return nativeFetch(...args);};
              await import('/src/quickTask/main.ts');
            </script>'''
            startup_html = startup_html.replace('<script type="module" src="/src/quickTask/main.ts"></script>', startup_setup)
            await startup_page.route('**/quick-task/', lambda route: route.fulfill(content_type='text/html', body=startup_html))
            await startup_page.goto(ORIGIN + '/quick-task/')
            await startup_page.wait_for_function('window.__fixture?.sessionReads===1 && !document.querySelector("#quick-task-submit").disabled')
            await startup_page.locator('#quick-task-title').fill('capture before auth initialization')
            await startup_page.locator('#quick-task-submit').click()
            await startup_page.locator('#quick-task-success').wait_for(state='visible')
            startup_capture = await startup_page.evaluate("async()=>{const o=await import('/src/features/quickTaskCapture/outbox.ts');return (await o.listQuickCaptures(null,true)).find(record=>record.title==='capture before auth initialization')}")
            await check('N05-startup-submit-stays-unbound-before-auth-reconciliation', startup_capture is not None and startup_capture['accountId'] is None and startup_capture['state'] == 'awaiting_auth')
            await startup_page.evaluate("()=>window.__fixture.resolveInitial({data:{session:window.__fixture.session},error:null})")
            await startup_page.wait_for_function("document.querySelector('#quick-task-auth-status').textContent.includes('已登入')")
            startup_privacy = await startup_page.evaluate("()=>({visible:document.body.innerText.includes('actor-a-private-recovery-fixture'),rpcCalls:window.__fixture.rpcCalls})")
            capture_id = json.dumps(startup_capture['captureId'] if startup_capture else '')
            startup_capture_after_auth = await startup_page.evaluate(f"async()=>{{const o=await import('/src/features/quickTaskCapture/outbox.ts');return await o.getQuickCapture({capture_id})}}")
            await check('N05-startup-b-session-does-not-rebind-or-expose-a', startup_capture_after_auth is not None and startup_capture_after_auth['accountId'] is None and not startup_privacy['visible'] and startup_privacy['rpcCalls'] == 0)
            await check('N05-startup-session-switch-no-browser-errors', not startup_errors)
            await startup_context.close()

            outage_context = await browser.new_context(viewport={'width': 390, 'height': 844})
            await outage_context.route('https://**/*', guard)
            outage_page = await outage_context.new_page()
            outage_errors = []
            outage_page.on('pageerror', lambda error: outage_errors.append(str(error)[:160]))
            outage_setup = '''<script type="module">
              const c=(await import('/src/services/supabase/client.ts')).supabase;
              const o=await import('/src/features/quickTaskCapture/outbox.ts');
              const projectRef='fhisnnufoeulxqrchldf';
              await o.saveQuickAuthContext({key:'current',projectRef,accountId:'actor-a',displayLabel:'fixture A',verifiedAt:Date.now(),bindingAllowed:true,revision:1,barrierAt:null,sessionId:'session-a'},null);
              window.__fixture={rpcCalls:0};
              c.auth.getSession=async()=>{throw new TypeError('Failed to fetch');};
              c.auth.getUser=async()=>({data:{user:null},error:{status:503}});
              c.auth.onAuthStateChange=()=>({data:{subscription:{unsubscribe:()=>undefined}}});
              const nativeFetch=window.fetch.bind(window);window.fetch=(...args)=>{if(String(args[0]).includes('/rest/v1/rpc/'))window.__fixture.rpcCalls++;return nativeFetch(...args);};
              await import('/src/quickTask/main.ts');
            </script>'''
            outage_html = startup_html.replace(startup_setup, outage_setup)
            await outage_page.route('**/quick-task/', lambda route: route.fulfill(content_type='text/html', body=outage_html))
            await outage_page.goto(ORIGIN + '/quick-task/')
            await outage_page.wait_for_function("document.querySelector('#quick-task-auth-status').textContent.includes('待確認')")
            outage_status = await outage_page.evaluate("()=>({text:document.querySelector('#quick-task-auth-status').textContent,login:!!document.querySelector('#quick-task-auth-status button'),unauthenticated:document.querySelector('#quick-task-auth-status').dataset.state==='unauthenticated'})")
            await outage_page.locator('#quick-task-title').fill('capture during auth outage')
            await outage_page.locator('#quick-task-submit').click()
            await outage_page.locator('#quick-task-success').wait_for(state='visible')
            outage_capture = await outage_page.evaluate("async()=>{const o=await import('/src/features/quickTaskCapture/outbox.ts');return (await o.listQuickCaptures('actor-a')).find(record=>record.title==='capture during auth outage')}")
            await check('N05-initial-auth-outage-is-not-shown-as-logout', '待確認' in outage_status['text'] and not outage_status['login'] and not outage_status['unauthenticated'])
            await check('N05-offline-reload-retains-verified-owner-without-rpc', outage_capture is not None and outage_capture['accountId'] == 'actor-a' and outage_capture['state'] == 'pending' and await outage_page.evaluate('window.__fixture.rpcCalls===0'))
            await check('N05-startup-outage-no-browser-errors', not outage_errors)
            await outage_context.close()
        except Exception as error:
            result['cases'].append({'case': 'browser-harness', 'status': 'FAIL', 'error': str(error).splitlines()[0][:180]})
            (OUT / 'result.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
            raise
        finally:
            await browser.close()
    result['status'] = 'PASS' if result['cases'] and all(r['status'] == 'PASS' for r in result['cases']) and not result['unexpectedRequests'] else 'FAIL'
    (OUT / 'result.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps({'status': result['status'], 'cases': len(result['cases']), 'failures': [r['case'] for r in result['cases'] if r['status'] != 'PASS']}), flush=True)
    return 0 if result['status'] == 'PASS' else 1

sys.exit(asyncio.run(main()))
