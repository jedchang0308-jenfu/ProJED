"""Verify normal Google OAuth cancellation preserves an unbound quick capture."""
import asyncio
import json
import os
import re
import sys
import uuid
from pathlib import Path
from urllib.parse import urlsplit

from playwright.async_api import async_playwright


QUICK_ORIGIN = 'http://127.0.0.1:4173'
GOOGLE_ORIGIN = 'https://accounts.google.com'
SUPABASE_AUTH_ORIGIN = 'https://fhisnnufoeulxqrchldf.supabase.co'
OUT = Path(sys.argv[1]).resolve()
RESULT = {'cases': [], 'counts': {}, 'errorKind': None, 'stage': 'connect'}
stage = 'connect'


def progress(value):
    global stage
    stage = value
    RESULT['stage'] = value
    print(json.dumps({'stage': value}), flush=True)


def check(name, passed):
    RESULT['cases'].append({'case': name, 'pass': bool(passed)})
    if not passed:
        raise AssertionError(name)


def origin(url):
    parsed = urlsplit(url)
    return f'{parsed.scheme}://{parsed.netloc}'


async def raw_snapshot(page):
    return await page.evaluate("""async () => {
      const m = await import('/src/features/quickTaskCapture/model.ts');
      const rows = await new Promise((resolve, reject) => {
        const opening = indexedDB.open(m.QUICK_CAPTURE_DB, m.QUICK_CAPTURE_SCHEMA_VERSION);
        opening.onerror = () => reject(new Error('RAW_IDB_OPEN_FAILED'));
        opening.onsuccess = () => {
          const db = opening.result;
          const tx = db.transaction(m.QUICK_CAPTURE_STORE, 'readonly');
          const request = tx.objectStore(m.QUICK_CAPTURE_STORE).getAll();
          tx.oncomplete = () => {
            db.close();
            resolve(request.result ?? []);
          };
          tx.onerror = tx.onabort = () => {
            db.close();
            reject(new Error('RAW_IDB_READ_FAILED'));
          };
        };
      });
      return rows.map(row => ({
        captureId: row.captureId,
        accountId: row.accountId ?? null,
        state: row.state
      }));
    }""")


async def record_for_title(page, title):
    return await page.evaluate("""async wanted => {
      const m = await import('/src/features/quickTaskCapture/model.ts');
      const rows = await new Promise((resolve, reject) => {
        const opening = indexedDB.open(m.QUICK_CAPTURE_DB, m.QUICK_CAPTURE_SCHEMA_VERSION);
        opening.onerror = () => reject(new Error('RAW_IDB_OPEN_FAILED'));
        opening.onsuccess = () => {
          const db = opening.result;
          const tx = db.transaction(m.QUICK_CAPTURE_STORE, 'readonly');
          const request = tx.objectStore(m.QUICK_CAPTURE_STORE).getAll();
          tx.oncomplete = () => {
            db.close();
            resolve(request.result ?? []);
          };
          tx.onerror = tx.onabort = () => {
            db.close();
            reject(new Error('RAW_IDB_READ_FAILED'));
          };
        };
      });
      const row = rows.find(item => item.title === wanted);
      return row ? {
        captureId: row.captureId,
        accountId: row.accountId ?? null,
        state: row.state,
        receiptOwnerId: row.receipt?.ownerId ?? null
      } : null;
    }""", title)


async def wait_record(page, title, predicate, timeout_seconds=30):
    deadline = asyncio.get_running_loop().time() + timeout_seconds
    while asyncio.get_running_loop().time() < deadline:
        row = await record_for_title(page, title)
        if row and predicate(row):
            return row
        await asyncio.sleep(0.25)
    raise TimeoutError('CAPTURE_STATE_TIMEOUT')


def snapshot_map(rows):
    return {row['captureId']: (row.get('accountId'), row.get('state')) for row in rows}


def pending_count(rows):
    return sum(row.get('state') != 'synced' for row in rows)


async def sdk_session_is_null(page):
    return await page.evaluate("""async () => {
      const c = (await import('/src/services/supabase/client.ts')).supabase;
      const result = await c.auth.getSession();
      return !result.error && result.data.session === null;
    }""")


async def screenshot(page, name):
    masks = [
        page.locator('#quick-task-auth-status'),
        page.locator('#quick-task-title'),
        page.locator('#quick-task-success span'),
        page.locator('#quick-task-recovery span'),
    ]
    await page.screenshot(path=str(OUT / name), full_page=True, mask=masks)


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    pw = await async_playwright().start()
    quick = None
    before_rows = []
    title = 'DEV133-unbound-google-cancel-' + uuid.uuid4().hex
    create_rpc_count = 0

    def observe_request(request):
        nonlocal create_rpc_count
        if urlsplit(request.url).path.endswith('/rest/v1/rpc/create_quick_unplaced_task_v1'):
            create_rpc_count += 1

    try:
        progress('connect-existing-browser')
        browser = await pw.chromium.connect_over_cdp('http://127.0.0.1:4175')
        contexts = browser.contexts
        check('existing_cdp_context_available', len(contexts) >= 1)
        context = contexts[0]
        quick_pages = [page for page in context.pages if page.url.startswith(QUICK_ORIGIN + '/quick-task/')]
        check('one_existing_quick_page', len(quick_pages) == 1)
        quick = quick_pages[0]
        check('quick_page_is_loopback', origin(quick.url) == QUICK_ORIGIN)
        await quick.locator('#quick-task-title').wait_for(timeout=20000)
        quick.on('request', observe_request)

        progress('verify_initial_logout')
        await quick.wait_for_function(
            "document.querySelector('#quick-task-auth-status')?.textContent.includes('尚未登入')",
            timeout=20000,
        )
        check('quick_ui_logged_out', True)
        check('quick_sdk_session_null_before_capture', await sdk_session_is_null(quick))
        before_rows = await raw_snapshot(quick)
        before_map = snapshot_map(before_rows)
        RESULT['counts']['rawBefore'] = len(before_rows)
        RESULT['counts']['pendingBefore'] = pending_count(before_rows)
        check('no_preexisting_pending_capture', pending_count(before_rows) == 0)

        progress('create_local_unbound_capture')
        rpc_before_create = create_rpc_count
        if await quick.locator('#quick-task-success [data-next]').is_visible():
            await quick.locator('#quick-task-success [data-next]').click()
        await quick.locator('#quick-task-title').fill(title)
        await quick.locator('#quick-task-submit').click()
        created = await wait_record(
            quick, title,
            lambda row: row.get('state') == 'awaiting_auth' and row.get('accountId') is None,
        )
        capture_id = created['captureId']
        created_rows = await raw_snapshot(quick)
        RESULT['counts']['rawAfterCreate'] = len(created_rows)
        check(
            'new_capture_is_unbound_awaiting_auth',
            capture_id not in before_map
            and created.get('accountId') is None
            and created.get('state') == 'awaiting_auth'
            and len(created_rows) == len(before_rows) + 1,
        )
        check('no_create_rpc_while_unbound', create_rpc_count == rpc_before_create)
        await screenshot(quick, 'google-cancel-before-login.png')

        progress('start_normal_google_login')
        login = quick.locator('#quick-task-auth-status button[aria-label="登入快速建任務"]')
        await login.click()
        progress('wait_google_account_selection')
        await quick.wait_for_url(re.compile(r'^https://accounts\.google\.com/'), timeout=30000)
        await quick.locator('[data-identifier]').first.wait_for(state='visible', timeout=20000)
        check('normal_google_account_picker_reached', True)

        progress('cancel_with_browser_history')
        returned = False
        for _ in range(2):
            current_origin = origin(quick.url)
            check(
                'back_navigation_stays_on_oauth_origins',
                current_origin in {GOOGLE_ORIGIN, SUPABASE_AUTH_ORIGIN},
            )
            try:
                await quick.go_back(wait_until='domcontentloaded', timeout=30000)
            except Exception:
                # Inspect only the resulting origin; exception text may contain URLs.
                pass
            current_origin = origin(quick.url)
            parsed = urlsplit(quick.url)
            if current_origin == QUICK_ORIGIN and parsed.path.startswith('/quick-task/'):
                returned = True
                break
            check(
                'back_navigation_did_not_leave_oauth_origins',
                current_origin in {GOOGLE_ORIGIN, SUPABASE_AUTH_ORIGIN},
            )
        check('real_back_returns_to_quick_loopback', returned)
        progress('verify_cancel_preserves_local_capture')
        await quick.wait_for_function(
            "document.querySelector('#quick-task-auth-status')?.textContent.includes('尚未登入')",
            timeout=30000,
        )
        check('quick_ui_still_logged_out_after_cancel', True)
        check('sdk_session_null_after_cancel', await sdk_session_is_null(quick))
        cancelled = await record_for_title(quick, title)
        cancelled_rows = await raw_snapshot(quick)
        RESULT['counts']['rawAfterCancel'] = len(cancelled_rows)
        RESULT['counts']['pendingAfterCancel'] = pending_count(cancelled_rows)
        RESULT['counts']['createRpcBeforeCancel'] = rpc_before_create
        RESULT['counts']['createRpcAfterCancel'] = create_rpc_count
        check(
            'cancel_keeps_same_unbound_capture',
            cancelled is not None
            and cancelled.get('captureId') == capture_id
            and cancelled.get('accountId') is None
            and cancelled.get('state') == 'awaiting_auth'
            and snapshot_map(cancelled_rows).get(capture_id) == (None, 'awaiting_auth'),
        )
        check('cancel_did_not_create_backend_task', create_rpc_count == rpc_before_create)
        check(
            'cancel_preserves_all_preexisting_raw_captures',
            all(snapshot_map(cancelled_rows).get(key) == value for key, value in before_map.items()),
        )
        await screenshot(quick, 'google-cancel-after-cancel.png')

        progress('ordinary_actor_a_login')
        credentials = {
            'email': os.environ['DEV133_TEST_ACTOR_A_EMAIL'],
            'password': os.environ['DEV133_TEST_ACTOR_A_PASSWORD'],
        }
        await quick.evaluate("""async credentials => {
          sessionStorage.setItem('projed-quick-sdk-login-intent', String(Date.now()));
          const c = (await import('/src/services/supabase/client.ts')).supabase;
          const result = await c.auth.signInWithPassword(credentials);
          if (result.error) throw new Error('ACTOR_A_SIGNIN_FAILED');
        }""", credentials)
        await quick.wait_for_function(
            "document.querySelector('#quick-task-auth-status')?.textContent.includes('已登入')",
            timeout=30000,
        )
        if await quick.locator('#quick-task-success [data-next]').is_visible():
            await quick.locator('#quick-task-success [data-next]').click()
        await quick.locator('#quick-task-recovery [data-recover]').wait_for(timeout=30000)
        check('no_create_rpc_before_explicit_claim', create_rpc_count == rpc_before_create)

        progress('explicit_recovery_claim')
        await quick.locator('#quick-task-recovery [data-recover]').click()
        confirm = quick.locator('#quick-task-recovery [data-confirm-claim]')
        await confirm.wait_for(state='visible', timeout=20000)
        await confirm.click()
        claimed = await wait_record(
            quick,
            title,
            lambda row: row.get('captureId') == capture_id
            and row.get('state') == 'synced'
            and row.get('accountId') is not None
            and row.get('receiptOwnerId') == row.get('accountId'),
            timeout_seconds=60,
        )
        is_actor_a_owner = await quick.evaluate("""async expected => {
          const c = (await import('/src/services/supabase/client.ts')).supabase;
          const result = await c.auth.getUser();
          return !result.error && result.data.user?.id === expected;
        }""", claimed['accountId'])
        RESULT['counts']['createRpcAtCancel'] = RESULT['counts']['createRpcAfterCancel']
        RESULT['counts']['createRpcAfterClaim'] = create_rpc_count
        check(
            'same_capture_synced_with_actor_a_receipt',
            claimed.get('captureId') == capture_id
            and claimed.get('state') == 'synced'
            and claimed.get('accountId') is not None
            and claimed.get('receiptOwnerId') == claimed.get('accountId')
            and is_actor_a_owner,
        )
        check('create_rpc_occurs_only_after_explicit_claim', create_rpc_count > rpc_before_create)

        progress('final_raw_capture_readback')
        final_rows = await raw_snapshot(quick)
        final_map = snapshot_map(final_rows)
        RESULT['counts']['rawAfterClaim'] = len(final_rows)
        RESULT['counts']['pendingAfterClaim'] = pending_count(final_rows)
        check(
            'no_pending_capture_or_fixture_remains',
            pending_count(final_rows) == 0
            and capture_id in final_map
            and final_map[capture_id][1] == 'synced'
            and len(final_rows) == len(before_rows) + 1,
        )
        check(
            'all_preexisting_raw_captures_preserved',
            all(final_map.get(key) == value for key, value in before_map.items()),
        )
        await screenshot(quick, 'google-cancel-after-claim.png')
        progress('complete')
    except Exception as error:
        RESULT['errorKind'] = type(error).__name__
        RESULT['stage'] = stage
        if quick and not quick.is_closed() and origin(quick.url) == QUICK_ORIGIN:
            try:
                await screenshot(quick, 'google-cancel-failure.png')
            except Exception:
                pass
    finally:
        await pw.stop()
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / 'google-cancel-result.json').write_text(
            json.dumps(RESULT, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
        )
    passed = RESULT['errorKind'] is None and bool(RESULT['cases']) and all(case['pass'] for case in RESULT['cases'])
    print(json.dumps({'status': 'PASS' if passed else 'FAIL', 'cases': len(RESULT['cases'])}), flush=True)
    return 0 if passed else 1


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
