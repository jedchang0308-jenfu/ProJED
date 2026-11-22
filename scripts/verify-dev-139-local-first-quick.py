"""Local built HTTP bundle, real SW, synthetic identities only; no cloud access."""
import argparse
import asyncio
import hashlib
import json
import statistics
import subprocess
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from playwright.async_api import async_playwright

ARGS = argparse.ArgumentParser()
ARGS.add_argument("bundle", type=Path)
ARGS.add_argument("--report", type=Path, required=True)
MODE = ARGS.add_mutually_exclusive_group()
MODE.add_argument("--measure-only", action="store_true")
MODE.add_argument("--behavior-only", action="store_true")
MODE.add_argument("--modal-only", action="store_true")
OPTIONS = ARGS.parse_args()


class Fixture(SimpleHTTPRequestHandler):
    navigation_delay = 0
    session_status = 401
    session_delay = 0
    account = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    session = "11111111-1111-4111-8111-111111111111"
    requests = []
    receipts = {}
    posts = []
    outcome = "committed"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(OPTIONS.bundle.resolve()), **kwargs)

    def log_message(self, *_):
        pass

    def respond(self, status, value):
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass

    def do_GET(self):
        path = urlsplit(self.path).path
        Fixture.requests.append(path)
        if path == '/__local-fixtures/task-drafts.js':
            body = (OPTIONS.report.parent / 'task-drafts.fixture.js').read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', 'application/javascript')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == '/__local-fixtures/task-modal.html':
            css = max(OPTIONS.bundle.glob('assets/*.css'), key=lambda item: item.stat().st_size)
            href = '/' + css.relative_to(OPTIONS.bundle).as_posix()
            body = ('<!doctype html><html lang="zh-Hant"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
                '<link rel="stylesheet" href="'+href+'"><div id="task-draft-fixture"></div><script src="/task-modal.fixture.js"></script></html>').encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == '/task-modal.fixture.js':
            self.path = '/__local-fixtures/task-modal.fixture.js'
            body = (OPTIONS.report.parent / 'task-modal.fixture.js').read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', 'application/javascript')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/api/v1/session":
            time.sleep(Fixture.session_delay)
            self.respond(Fixture.session_status, {"data": {
                "localUserId": Fixture.account, "authContextId": Fixture.session,
                "entry": "main", "createdAt": int(time.time() * 1000),
                "expiresAt": int(time.time() * 1000) + 3600000,
                "email": Fixture.account + '@example.invalid', "displayName": None,
            }} if Fixture.session_status == 200 else {"error": {"code": "AUTH_REQUIRED"}})
            return
        if path.startswith("/api/"):
            self.respond(404, {"error": {"code": "NOT_FOUND"}})
            return
        if path == "/quick-task/" and self.headers.get("Sec-Fetch-Mode") == "navigate":
            time.sleep(Fixture.navigation_delay)
        try:
            super().do_GET()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass  # Navigation was satisfied by the worker while this fetch waited.

    def do_POST(self):
        path = urlsplit(self.path).path
        if path != "/api/v1/quick-tasks":
            self.respond(404, {"error": {"code": "NOT_FOUND"}})
            return
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
        Fixture.posts.append(body)
        if Fixture.session_status != 200 or self.headers.get("x-projed-expected-account-id") != Fixture.account:
            self.respond(401, {"error": {"code": "AUTH_REQUIRED"}})
            return
        capture = body["captureId"]
        if Fixture.outcome == "conflict":
            self.respond(409, {"error": {"code": "IDEMPOTENCY_CONFLICT", "retryable": False}})
            return
        existing = Fixture.receipts.get(capture)
        if existing and (existing["ownerId"] != Fixture.account or existing["titleHash"] != hashlib.sha256(body["title"].encode()).hexdigest()):
            self.respond(409, {"error": {"code": "IDEMPOTENCY_CONFLICT", "retryable": False}})
            return
        receipt = existing or {"status": "committed", "captureId": capture,
            "ownerId": Fixture.account, "titleHash": hashlib.sha256(body["title"].encode()).hexdigest(),
            "created": True, "committedAt": int(time.time() * 1000)}
        Fixture.receipts[capture] = receipt
        if Fixture.outcome == "lost-response":
            self.respond(503, {"error": {"code": "DEPENDENCY_UNAVAILABLE", "retryable": True}})
        else:
            self.respond(200, {"data": {**receipt, "created": existing is None}})


async def input_ready(page, url):
    started = time.perf_counter()
    await page.goto(url, wait_until="domcontentloaded")
    await page.locator("#quick-task-title").fill("readiness probe")
    elapsed = (time.perf_counter() - started) * 1000
    await page.wait_for_function("!document.querySelector('#quick-task-submit').disabled")
    await page.locator("#quick-task-title").fill("")
    return round(elapsed, 1)


async def measure(browser, origin):
    samples = {"first_normal_ms": [], "first_slow_ms": [], "cached_slow_ms": [], "cached_slow_query_ms": [], "cached_offline_ms": []}
    for _ in range(3):
        print("Measuring sample " + str(_ + 1), flush=True)
        context = await browser.new_context(viewport={"width": 390, "height": 844})
        page = await context.new_page()
        Fixture.navigation_delay = 0
        samples["first_normal_ms"].append(await input_ready(page, origin + "/quick-task/"))
        try:
            await asyncio.wait_for(page.evaluate("navigator.serviceWorker.ready.then(() => true)"), 20)
        except TimeoutError:
            print(await page.evaluate("({html:document.body.innerText, registrations: navigator.serviceWorker.getRegistrations().then(r=>r.map(x=>x.scope))})"), flush=True)
            raise AssertionError("Service Worker did not become ready within 20 seconds")
        await page.reload()
        await page.wait_for_function("navigator.serviceWorker.controller !== null")
        Fixture.navigation_delay = 6
        # New tab loses tab version but reuses the installed worker and device cache.
        await page.close()
        page = await context.new_page()
        samples["cached_slow_ms"].append(await input_ready(page, origin + "/quick-task/"))
        samples["cached_slow_query_ms"].append(await input_ready(page, origin + "/quick-task/?entry=note"))
        await context.set_offline(True)
        samples["cached_offline_ms"].append(await input_ready(page, origin + "/quick-task/"))
        await context.close()
        fresh = await browser.new_context()
        page = await fresh.new_page()
        samples["first_slow_ms"].append(await input_ready(page, origin + "/quick-task/"))
        await fresh.close()
    Fixture.navigation_delay = 0
    return {"samples": samples, "median": {key: statistics.median(values) for key, values in samples.items()},
        "conditions": "Headless Edge; 6s HTML navigation delay only, cached assets; 3 runs; input accepted by fill; no real overnight elapsed"}


async def captures(page):
    return await page.evaluate("""() => new Promise((resolve, reject) => {
      const open = indexedDB.open('projed-quick-task-v1');
      open.onsuccess = () => {
        const db = open.result, tx = db.transaction('captures');
        const request = tx.objectStore('captures').getAll();
        tx.oncomplete = () => { db.close(); resolve(request.result); };
        tx.onabort = () => { db.close(); reject(tx.error); };
      }; open.onerror = () => reject(open.error);
    })""")


async def wait_capture(page, title, state=None):
    for _ in range(100):
        for row in await captures(page):
            if state == 'failed_permanent' and row.get('lastErrorCode') == 'LOCAL_EDITING_DRAFT':
                continue
            if row["title"] == title and (state is None or row["state"] == state):
                return row
        await page.wait_for_timeout(100)
    raise AssertionError("Capture did not reach expected state: " + str(state))


async def behavior(browser, origin, checks):
    print('Starting local-first behavior checks', flush=True)
    def check(name, value):
        checks.append({"case": name, "status": "PASS" if value else "FAIL"})
        if not value:
            raise AssertionError(name)
        print("PASS " + name, flush=True)

    Fixture.session_status = 200
    Fixture.receipts = {}
    Fixture.posts = []
    Fixture.requests = []
    context = await browser.new_context(viewport={"width": 390, "height": 844})
    context.set_default_timeout(12000)
    errors = []
    external = []
    await context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(origin + "/")
        else (external.append(route.request.url) or route.abort()))
    context.on("page", lambda page: page.on("pageerror", lambda error: errors.append(str(error))))
    try:
        page = await context.new_page()
        await page.goto(origin + "/quick-task/", wait_until='domcontentloaded')
        await page.locator("#quick-task-auth-status").filter(has_text="此快速 App 已登入").wait_for()
        print('Testing task note checkpoint storage', flush=True)
        await page.add_script_tag(url=origin + '/__local-fixtures/task-drafts.js')
        note_cases = await asyncio.wait_for(page.evaluate("""async () => {
          const api = Dev139TaskDrafts;
          const scope = {accountId:'owner-a',workspaceId:'workspace-a',boardId:'board-a',taskId:'task-a'};
          const baseline = {title:'original',startDate:'',endDate:'',status:'todo',isDurationLocked:false,assigneeIds:[],collaboratorIds:[],tagIds:[]};
          const notes = {detailNotes:[{id:'purpose',title:'目的',content:'original'}],description:'original'};
          const submittedNotes = [{id:'purpose',title:'目的',content:'offline edit'}];
          const draft = {...scope,key:'editor-a',schemaVersion:1,savedAt:1,
            fields:{baseline,draft:{title:'offline title'}},notes:{baseline:notes,draft:submittedNotes},
            unknown:true,submitted:{title:'offline title',detailNotes:submittedNotes,description:'offline edit'}};
          await api.saveTaskDetailsLocalDraft(draft);
          const restored = await api.loadTaskDetailsLocalDraft(scope,baseline,notes);
          const otherAccount = await api.loadTaskDetailsLocalDraft({...scope,accountId:'owner-b'},baseline,notes);
          const otherWorkspace = await api.loadTaskDetailsLocalDraft({...scope,workspaceId:'workspace-b'},baseline,notes);
          const otherBoard = await api.loadTaskDetailsLocalDraft({...scope,boardId:'board-b'},baseline,notes);
          const otherTask = await api.loadTaskDetailsLocalDraft({...scope,taskId:'task-b'},baseline,notes);
          const concurrent = {...draft,key:'editor-b',savedAt:2,fields:{baseline,draft:{title:'other tab'}}};
          await api.saveTaskDetailsLocalDraft(concurrent);
          await api.clearConfirmedTaskDetailsLocalDrafts(scope,{...baseline,title:'offline title'},
            {detailNotes:submittedNotes,description:'offline edit'});
          const survivor = await api.loadTaskDetailsLocalDraft(scope,baseline,notes);
          // A local optimistic match is insufficient to settle an interrupted request.
          await api.saveTaskDetailsLocalDraft({...draft,key:'unknown-optimistic',savedAt:3});
          const uncertain = await api.loadTaskDetailsLocalDraft(scope,{...baseline,title:'offline title'},
            {detailNotes:submittedNotes,description:'offline edit'});
          await api.discardTaskDetailsLocalDraft('unknown-optimistic',99);
          const protectedDraft = await api.loadTaskDetailsLocalDraft(scope,baseline,notes);
          await api.discardTaskDetailsLocalDraft('unknown-optimistic',3);
          return {
            'task-note-local-checkpoint-retains-baseline-and-unknown-outcome': restored.unknown
              && restored.submitted.title==='offline title' && restored.notes.baseline.description==='original',
            'task-note-account-workspace-board-task-isolation': !otherAccount&&!otherWorkspace&&!otherBoard&&!otherTask,
            'confirmed-cleanup-keeps-other-tabs-distinct-edits': survivor.key==='editor-b',
            'optimistic-cache-cannot-resolve-unknown-request': uncertain.key==='unknown-optimistic'&&uncertain.unknown,
            'discard-does-not-remove-a-newer-draft-version': protectedDraft.key==='unknown-optimistic'
          };
        }"""), 20)
        for name, passed in note_cases.items():
            check(name, passed)
        await page.locator("#quick-task-auth-status").filter(has_text="此快速 App 已登入").wait_for()
        await asyncio.wait_for(page.evaluate("navigator.serviceWorker.ready.then(() => true)"), 20)
        await page.reload()
        await page.locator("#quick-task-auth-status").filter(has_text="此快速 App 已登入").wait_for()
        await page.locator("#quick-task-title").fill("A 的未送出記事")
        await page.locator('#quick-task-draft-status[data-state="local"]').wait_for()
        check("typing-is-local-only", not Fixture.posts)
        old = await wait_capture(page, "A 的未送出記事")
        check("editing-draft-reuses-DB-and-retains-owner", old["lastErrorCode"] == "LOCAL_EDITING_DRAFT"
            and old["accountId"] == Fixture.account and old["workspaceHint"] is None)

        await context.set_offline(True)
        await page.close()
        page = await context.new_page()
        await page.add_init_script("{const now=Date.now;Date.now=()=>now()+13*60*60*1000;}")
        await page.goto(origin + "/quick-task/")
        await page.locator('#quick-task-draft-status[data-state="restored"]').wait_for()
        check("simulated-overnight-offline-reopen-restores-editing-text", await page.locator("#quick-task-title").input_value() == old["title"])
        await page.locator("#quick-task-title").fill("A 的離線修改")
        await page.locator('#quick-task-draft-status[data-state="local"]').wait_for()
        await page.locator("#quick-task-submit").click()
        row = await wait_capture(page, "A 的離線修改", "pending")
        check("offline-submit-freezes-original-capture-ID", row["captureId"] == old["captureId"])
        check("local-success-is-not-cloud-success", not Fixture.posts and row.get("receipt") is None
            and "已建立" not in await page.locator("#quick-task-success").inner_text())
        # Reopen without the simulated clock before exercising real Session expiry.
        await page.close()
        page = await context.new_page()
        Fixture.session_status = 401
        await context.set_offline(False)
        await page.goto(origin + "/quick-task/")
        await page.locator("#quick-task-auth-status").filter(has_text="尚未登入").wait_for()
        check("expired-session-preserves-pending-owner-without-sending", not Fixture.posts
            and (await wait_capture(page, row["title"]))["accountId"] == old["accountId"])
        Fixture.session_status = 200
        Fixture.session = "22222222-2222-4222-8222-222222222222"
        await page.evaluate("window.dispatchEvent(new Event('online'))")
        synced = await wait_capture(page, row["title"], "synced")
        check("renewed-original-login-resumes-sync-with-verified-receipt", synced["receipt"]["ownerId"] == old["accountId"]
            and len(Fixture.receipts) == 1)

        await page.locator("#quick-task-title").fill("A 的私人編輯")
        await page.locator('#quick-task-draft-status[data-state="local"]').wait_for()
        Fixture.account = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
        Fixture.session = "33333333-3333-4333-8333-333333333333"
        await page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
        await page.wait_for_function("document.querySelector('#quick-task-title').value === ''")
        await page.locator("#quick-task-auth-status").filter(has_text=Fixture.account + '@example.invalid').wait_for()
        check("cross-tab-account-switch-hides-old-private-editor", "A 的私人編輯" not in await page.locator("body").inner_text()
            and (await wait_capture(page, "A 的私人編輯"))["accountId"] == old["accountId"])
        await page.locator("#quick-task-title").fill("B 的獨立草稿")
        await page.locator('#quick-task-draft-status[data-state="local"]').wait_for()
        check("new-account-draft-is-separately-owned", (await wait_capture(page, "B 的獨立草稿"))["accountId"] == Fixture.account)
        # Old local binding + a new cookie after another tab signs in. Public
        # input is immediately usable, but A's private text must await identity.
        await page.evaluate("""() => new Promise(resolve => {
          const open=indexedDB.open('projed-quick-task-v1');
          open.onsuccess=()=>{const db=open.result,tx=db.transaction('auth_context','readwrite'),store=tx.objectStore('auth_context');
            const get=store.get('current');get.onsuccess=()=>store.put({...get.result,
              accountId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',sessionId:'http:old-a',revision:get.result.revision+1});
            tx.oncomplete=()=>{db.close();resolve();};};
        })""")
        Fixture.session_delay = 1
        await page.close()
        page = await context.new_page()
        await page.goto(origin + "/quick-task/", wait_until='domcontentloaded')
        await page.wait_for_function("!document.querySelector('#quick-task-submit')?.disabled")
        check('online-reopen-does-not-expose-last-account-before-verification', await page.locator('#quick-task-title').input_value() != 'A 的私人編輯')
        await page.locator('#quick-task-draft-status[data-state="restored"]').wait_for()
        Fixture.session_delay = 0
        check("reopen-restores-only-current-account", await page.locator("#quick-task-title").input_value() == "B 的獨立草稿")

        second = await context.new_page()
        await second.goto(origin + "/quick-task/")
        await second.locator('#quick-task-draft-status[data-state="restored"]').wait_for()
        await page.locator("#quick-task-title").fill("B 第一頁的新版本")
        await page.locator('#quick-task-draft-status[data-state="local"]').wait_for()
        await second.locator("#quick-task-title").fill("B 第二頁的衝突版本")
        await second.locator('#quick-task-draft-status[data-state="conflict"]').wait_for()
        check("local-CAS-conflict-does-not-overwrite-other-tab", any(r["title"] == "B 第一頁的新版本" for r in await captures(page)))
        await second.locator("#quick-task-draft-retry").click()
        await second.locator('#quick-task-draft-status[data-state="local"]').wait_for()
        check("explicit-local-copy-keeps-both-versions", any(r["title"] == "B 第一頁的新版本" for r in await captures(page))
            and any(r["title"] == "B 第二頁的衝突版本" for r in await captures(page)))
        await second.close()

        Fixture.outcome = "lost-response"
        await page.locator("#quick-task-title").fill("未知回應仍使用同一識別")
        await page.locator('#quick-task-draft-status[data-state="local"]').wait_for()
        await page.locator("#quick-task-submit").click()
        unknown = await wait_capture(page, "未知回應仍使用同一識別", "failed_retryable")
        check("lost-response-remains-unsynced", unknown.get("receipt") is None)
        Fixture.outcome = "committed"
        resolved = await wait_capture(page, unknown["title"], "synced")
        calls = [post for post in Fixture.posts if post["captureId"] == unknown["captureId"]]
        check("unknown-result-reconciles-original-receipt-without-duplicate", len(calls) >= 2
            and resolved["captureId"] == unknown["captureId"] and len(Fixture.receipts) == 2)
        # A separate explicit create is a new intent, even with the same title.
        # It must not mutate/reuse the success record from the preceding form.
        await page.locator('#quick-task-title').fill(unknown['title'])
        await page.locator('#quick-task-draft-status[data-state="local"]').wait_for()
        await page.locator('#quick-task-submit').click()
        for _ in range(80):
            identical = [r for r in await captures(page) if r['title'] == unknown['title'] and r['state']=='synced']
            if len(identical) == 2:
                break
            await page.wait_for_timeout(100)
        check('new-explicit-intent-with-identical-title-uses-new-ID', len(identical)==2
            and len({r['captureId'] for r in identical})==2 and len(Fixture.receipts)==3)
        Fixture.outcome = "conflict"
        await page.locator("#quick-task-title").fill("雲端衝突不可覆寫")
        await page.locator('#quick-task-draft-status[data-state="local"]').wait_for()
        await page.locator("#quick-task-submit").click()
        conflict = await wait_capture(page, "雲端衝突不可覆寫", "failed_permanent")
        check("remote-conflict-keeps-local-content-and-stops-retry", conflict["lastErrorCode"] == "IDEMPOTENCY_CONFLICT"
            and len(Fixture.receipts) == 3)
        Fixture.outcome = 'committed'
        await page.evaluate("""() => {
          window.__draftOriginalPut = IDBObjectStore.prototype.put;
          IDBObjectStore.prototype.put = function(value,...args) {
            if(value?.lastErrorCode==='LOCAL_EDITING_DRAFT') throw new DOMException('synthetic quota','QuotaExceededError');
            return window.__draftOriginalPut.call(this,value,...args);
          };
        }""")
        await page.locator('#quick-task-title').fill('本機空間失敗仍保留輸入')
        await page.locator('#quick-task-draft-status[data-state="failed"]').wait_for()
        check('local-storage-failure-does-not-claim-saved', await page.locator('#quick-task-title').input_value() == '本機空間失敗仍保留輸入')
        await page.evaluate('() => { IDBObjectStore.prototype.put=window.__draftOriginalPut; }')
        await page.locator('#quick-task-draft-retry').click()
        await page.locator('#quick-task-draft-status[data-state="local"]').wait_for()
        check('local-storage-retry-confirms-the-same-attempt', (await wait_capture(page,'本機空間失敗仍保留輸入'))['lastErrorCode']=='LOCAL_EDITING_DRAFT')
        Fixture.session_status = 401
        await page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
        await page.locator('#quick-task-auth-status').filter(has_text='尚未登入').wait_for()
        await page.locator('#quick-task-title').fill('未綁帳號不可自動認領')
        await page.locator('#quick-task-draft-status[data-state="local"]').wait_for()
        unbound = await wait_capture(page, '未綁帳號不可自動認領')
        Fixture.session_status = 200
        Fixture.session = '44444444-4444-4444-8444-444444444444'
        await page.evaluate("window.dispatchEvent(new Event('online'))")
        await page.locator('#quick-task-auth-status').filter(has_text='此快速 App 已登入').wait_for()
        await page.locator('#quick-task-submit').click()
        unbound = await wait_capture(page, unbound['title'], 'awaiting_auth')
        check('fresh-login-does-not-silently-claim-unbound-input', unbound['accountId'] is None
            and not any(post['captureId']==unbound['captureId'] for post in Fixture.posts))
        check("quick-start-does-not-download-boards-or-call-models", not external
            and all(not path.startswith("/api/") or path in ("/api/v1/session", "/api/v1/quick-tasks") for path in Fixture.requests))
        if errors:
            print('Quick browser errors: ' + json.dumps(errors, ensure_ascii=False), flush=True)
        check("no-uncaught-browser-errors", not errors)
        await page.screenshot(path=str(OPTIONS.report.parent / "quick-local-first.png"), full_page=True)
        Fixture.session_status = 503
        Fixture.session_delay = 3
        main = await context.new_page()
        await main.goto(origin + '/', wait_until='domcontentloaded')
        await main.get_by_role('link', name='先記事', exact=True).click()
        await main.locator('#quick-task-title').fill('不用等主程式登入也能記事')
        check('main-auth-wait-offers-direct-local-quick-entry', await main.locator('#quick-task-title').input_value() == '不用等主程式登入也能記事')

    finally:
        Fixture.outcome = "committed"
        Fixture.session_delay = 0
        await context.close()


async def modal_behavior(browser, origin, checks):
    Fixture.session_status = 200
    Fixture.account = 'local-notes-owner'
    def check(name, value):
        checks.append({'case': name, 'status': 'PASS' if value else 'FAIL'})
        if not value:
            raise AssertionError(name)
        print('PASS ' + name, flush=True)
    errors = []
    context = await browser.new_context(viewport={'width': 1366, 'height': 900})
    context.set_default_timeout(12000)
    context.on('page', lambda page: page.on('pageerror', lambda error: errors.append(str(error))))
    await context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin + '/') else route.abort())
    try:
        modal = await context.new_page()
        await modal.goto(origin + '/__local-fixtures/task-modal.html', wait_until='domcontentloaded')
        await modal.locator('[data-task-details-modal]').wait_for()
        note = modal.locator('[contenteditable="true"]').first
        await note.fill('離線備註草稿')
        await modal.locator('[data-task-details-local-status="local"]').wait_for()
        check('actual-task-modal-saves-editing-note-locally', (await modal.evaluate('window.__DEV139_TASK_DRAFT.counters()'))['writes'] == 0)
        await modal.close()
        modal = await context.new_page()
        await modal.goto(origin + '/__local-fixtures/task-modal.html', wait_until='domcontentloaded')
        await modal.locator('[data-task-details-save-retry]').wait_for()
        note = modal.locator('[contenteditable="true"]').first
        check('actual-task-modal-reopen-restores-note-without-auto-write', '離線備註草稿' in await note.inner_text()
            and (await modal.evaluate('window.__DEV139_TASK_DRAFT.counters()'))['writes'] == 0)
        await modal.evaluate("window.__DEV139_TASK_DRAFT.changeRemoteNotes('他人已修改')")
        await modal.locator('[data-task-details-save-retry]').click()
        await modal.locator('[data-task-details-notes-conflict]').wait_for()
        counters = await modal.evaluate('window.__DEV139_TASK_DRAFT.counters()')
        check('actual-task-modal-reads-before-sync-and-keeps-remote-conflict', counters['reads'] > 0 and counters['writes'] == 0
            and '離線備註草稿' in await note.inner_text())
        await modal.evaluate("window.__DEV139_TASK_DRAFT.mount('different-account')")
        await modal.locator('[data-task-details-modal]').wait_for()
        check('actual-task-modal-account-switch-does-not-restore-private-draft', '離線備註草稿' not in await modal.locator('[contenteditable="true"]').first.inner_text())
        await modal.evaluate("window.__DEV139_TASK_DRAFT.mount('clean-save-owner')")
        note = modal.locator('[contenteditable="true"]').first
        await note.fill('已確認成功的新備註')
        await modal.locator('[data-task-details-local-status="local"]').wait_for()
        await modal.get_by_role('button', name='關閉任務詳情', exact=True).click()
        await modal.locator('[data-task-details-modal]').wait_for(state='hidden')
        await modal.evaluate("window.__DEV139_TASK_DRAFT.mount('clean-save-owner')")
        await modal.locator('[data-task-details-modal]').wait_for()
        await modal.wait_for_timeout(100)
        check('confirmed-save-and-close-does-not-restore-a-ghost-draft',
            '已確認成功的新備註' in await modal.locator('[contenteditable="true"]').first.inner_text()
            and await modal.locator('[data-task-details-save-retry]').count()==0)
        await modal.evaluate('window.__DEV139_TASK_DRAFT.unmount()')
        await modal.locator('[data-task-details-modal]').wait_for(state='hidden')
        await modal.evaluate("window.__DEV139_TASK_DRAFT.seedUnknownSaved('clean-save-owner')")
        await modal.evaluate("window.__DEV139_TASK_DRAFT.mount('clean-save-owner')")
        await modal.locator('[data-task-details-save-retry]').click()
        await modal.locator('[data-task-details-save-status="saved"]').wait_for()
        check('restored-unknown-note-settles-through-readback-without-resending',
            (await modal.evaluate('window.__DEV139_TASK_DRAFT.counters()'))['writes']==1
            and await modal.locator('[data-task-details-save-retry]').count()==0)
        await modal.screenshot(path=str(OPTIONS.report.parent / 'task-note-local-first.png'), full_page=True)
        check('no-uncaught-modal-errors', not errors)
    except Exception:
        print('Modal diagnostic: ' + json.dumps({'errors': errors,
            'body': await modal.locator('body').inner_text()}, ensure_ascii=False), flush=True)
        await modal.screenshot(path=str(OPTIONS.report.parent / 'task-note-failure.png'), full_page=True)
        raise
    finally:
        await context.close()


async def main():
    OPTIONS.report.parent.mkdir(parents=True, exist_ok=True)
    if not OPTIONS.measure_only:
        subprocess.run(['node', '--input-type=module', '-e',
            "import {buildSync} from 'esbuild';buildSync({entryPoints:['src/services/taskDetailsLocalDraft.ts'],bundle:true,format:'iife',globalName:'Dev139TaskDrafts',outfile:process.argv[1]});",
            str(OPTIONS.report.parent / 'task-drafts.fixture.js')], check=True)
        subprocess.run(['node', '--input-type=module', '-e',
            "import {buildSync} from 'esbuild';buildSync({entryPoints:['qa/dev-139/s3/local-task-draft.fixture.tsx'],bundle:true,format:'iife',jsx:'automatic',define:{'import.meta.hot':'false','import.meta.env':JSON.stringify({MODE:'test',DEV:true,PROD:false,VITE_DATA_BACKEND:'http'})},outfile:process.argv[1]});",
            str(OPTIONS.report.parent / 'task-modal.fixture.js')], check=True)
    server = ThreadingHTTPServer(("127.0.0.1", 0), Fixture)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = "http://127.0.0.1:" + str(server.server_port)
    result = {"status": "FAIL", "scope": "LOCAL_TASK_MODAL_SYNTHETIC_DATA" if OPTIONS.modal_only
        else "LOCAL_SYNTHETIC_HTTP_REAL_SW", "checks": []}
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(channel="msedge", headless=True)
            try:
                if not OPTIONS.behavior_only and not OPTIONS.modal_only:
                    result["performance"] = await asyncio.wait_for(measure(browser, origin), 180)
                failures = []
                if not OPTIONS.measure_only:
                    if not OPTIONS.modal_only:
                        try:
                            await asyncio.wait_for(behavior(browser, origin, result['checks']), 150)
                        except Exception as error:
                            failures.append('quick: ' + type(error).__name__ + ': ' + str(error))
                    try:
                        await asyncio.wait_for(modal_behavior(browser, origin, result['checks']), 90)
                    except Exception as error:
                        failures.append('modal: ' + type(error).__name__ + ': ' + str(error))
                if failures:
                    raise AssertionError('; '.join(failures))
                result["status"] = "PASS"
            finally:
                await browser.close()
    except Exception as error:
        result["error"] = type(error).__name__ + ': ' + str(error)
    finally:
        server.shutdown()
        server.server_close()
        OPTIONS.report.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
