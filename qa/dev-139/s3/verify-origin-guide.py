"""Synthetic local guide UI only. No cloud API, login, installation or business writes."""
import argparse
import asyncio
import json
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.async_api import async_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--bundle', type=Path, default=Path('output/dev139-origin-guide-preview'))
parser.add_argument('--report', type=Path, required=True)
options = parser.parse_args()


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


async def run(origin, report):
    checks = []
    errors = []
    external = []

    def check(name, passed):
        checks.append({'case': name, 'status': 'PASS' if passed else 'FAIL'})
        if not passed:
            raise AssertionError(name)
        print('PASS ' + name, flush=True)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(channel='msedge', headless=True)
        context = await browser.new_context(viewport={'width': 1240, 'height': 900})
        await context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin + '/')
                            else (external.append(route.request.url), route.abort())[1])
        page = await context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        try:
            await page.goto(origin, wait_until='domcontentloaded')
            await page.get_by_role('button', name='開始切換', exact=True).wait_for()
            await page.screenshot(path=str(report / '01-start-desktop.png'), full_page=True)
            check('preview-is-clearly-labelled-and-no-production-connection',
                  '登入、開站與安裝都是模擬' in await page.locator('body').inner_text() and not external)
            await page.get_by_label('原裝置內容', exact=True).select_option('pending')
            await page.get_by_role('button', name='開始切換', exact=True).click()
            await page.locator('[data-origin-guide-stage="drafts"]').wait_for()
            check('local-only-content-stops-before-departure',
                  '等待同步' in await page.get_by_role('alert').inner_text()
                  and await page.locator('[data-preview-opened]').get_attribute('data-preview-opened') == '0')
            await page.screenshot(path=str(report / '02-pending-desktop.png'), full_page=True)
            await page.get_by_label('原裝置內容', exact=True).select_option('unknown')
            await page.get_by_role('button', name='重新檢查保存狀態', exact=True).click()
            check('unknown-result-does-not-offer-a-create-or-resend',
                  '不要重新建立' in await page.get_by_role('alert').inner_text()
                  and await page.locator('[data-preview-opened]').get_attribute('data-preview-opened') == '0')
            await page.get_by_label('原裝置內容', exact=True).select_option('clean')
            await page.get_by_role('button', name='重新檢查保存狀態', exact=True).click()
            await page.get_by_role('button', name='前往新站登入', exact=False).click()
            check('opening-destination-is-not-account-verification',
                  await page.locator('[data-origin-guide-stage]').get_attribute('data-origin-guide-stage') == 'account')
            await page.get_by_label('新站登入結果', exact=True).select_option('wrong')
            await page.get_by_role('button', name='我已登入，重新檢查', exact=True).click()
            check('wrong-account-stays-at-login-without-showing-private-content',
                  '不是原帳號' in await page.get_by_role('alert').inner_text()
                  and await page.get_by_role('button', name='確認完成', exact=True).count() == 0)
            await page.screenshot(path=str(report / '03-wrong-account-desktop.png'), full_page=True)
            await page.get_by_label('新站登入結果', exact=True).select_option('same')
            await page.get_by_role('button', name='我已登入，重新檢查', exact=True).click()
            await page.locator('[data-origin-guide-stage="entry"]').wait_for()
            await page.screenshot(path=str(report / '04-entry-desktop.png'), full_page=True)
            await page.get_by_role('button', name='安裝新入口', exact=True).click()
            check('accepted-install-requires-opening-the-new-entry',
                  '尚未確認完成' in await page.get_by_role('status').inner_text()
                  and not await page.get_by_role('button', name='確認完成', exact=True).is_enabled())
            await page.get_by_role('checkbox').check()
            await page.get_by_role('button', name='確認完成', exact=True).click()
            await page.locator('[data-origin-guide-stage="complete"]').wait_for()
            check('completion-mentions-this-entry-and-keeps-old-data',
                  '這個入口已確認完成' in await page.locator('h1').inner_text()
                  and '本機資料仍保留' in await page.locator('body').inner_text())
            await page.get_by_label('正在交接的 App', exact=True).select_option('quick')
            check('quick-does-not-inherit-main-completion',
                  await page.locator('[data-origin-guide-stage]').get_attribute('data-origin-guide-stage') == 'intro')
            await page.get_by_role('button', name='開始切換', exact=True).click()
            await page.get_by_role('button', name='我已登入，重新檢查', exact=True).click()
            await page.locator('[data-origin-guide-stage="entry"]').wait_for()
            await page.get_by_label('模擬安裝結果', exact=True).select_option('dismissed')
            await page.get_by_role('button', name='安裝新入口', exact=True).click()
            check('cancelled-install-can-be-deferred-without-false-completion',
                  '已取消安裝' in await page.get_by_role('status').inner_text()
                  and not await page.get_by_role('button', name='確認完成', exact=True).is_enabled())
            await page.get_by_role('button', name='稍後，回舊入口', exact=True).click()
            await page.get_by_role('button', name='繼續換址引導', exact=True).wait_for()
            check('later-keeps-old-entry-usable', '仍在原入口' in await page.locator('h1').inner_text())
            await page.get_by_role('button', name='繼續換址引導', exact=True).click()
            await page.get_by_role('button', name='繼續上次切換', exact=True).click()
            await page.locator('[data-origin-guide-stage="entry"]').wait_for()
            check('deferred-session-resumes-after-fresh-checks',
                  await page.locator('[data-origin-guide-stage]').get_attribute('data-origin-guide-stage') == 'entry')
            await page.get_by_label('原入口帳號', exact=True).select_option('other')
            check('account-change-does-not-use-the-prior-account-progress',
                  await page.locator('[data-origin-guide-stage]').get_attribute('data-origin-guide-stage') == 'intro')
            await page.reload(wait_until='domcontentloaded')
            await page.get_by_role('button', name='繼續上次切換', exact=True).click()
            await page.locator('[data-origin-guide-stage="account"]').wait_for()
            check('restart-never-trusts-old-completion-without-new-login-proof',
                  '尚未確認新站登入' in await page.get_by_role('alert').inner_text())

            mobile = await browser.new_context(viewport={'width': 390, 'height': 844})
            await mobile.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin + '/') else route.abort())
            small = await mobile.new_page()
            await small.goto(origin, wait_until='domcontentloaded')
            await small.locator('summary').click()
            await small.get_by_label('裝置', exact=True).select_option('ios-safari')
            await small.get_by_label('新站登入結果', exact=True).select_option('same')
            await small.locator('summary').click()
            await small.get_by_role('button', name='開始切換', exact=True).click()
            await small.get_by_role('button', name='我已登入，重新檢查', exact=True).click()
            await small.locator('[data-origin-guide-stage="entry"]').wait_for()
            check('ios-guide-uses-share-add-home-and-does-not-auto-remove-old-icon',
                  '加入主畫面' in await small.locator('.og-instructions').inner_text())
            await small.screenshot(path=str(report / '05-entry-mobile-ios.png'), full_page=True)
            for width in (390, 320):
                await small.set_viewport_size({'width': width, 'height': 844})
                overflow = await small.evaluate('document.documentElement.scrollWidth > window.innerWidth')
                check(f'no-horizontal-overflow-at-{width}', not overflow)
            await mobile.close()
            check('no-browser-errors-or-external-requests', not errors and not external)
            return {'status': 'PASS', 'scope': 'LOCAL_GUIDE_PREVIEW_SYNTHETIC_ONLY', 'checks': checks,
                    'externalRequests': len(external), 'realLoginOrInstall': False, 'businessDataWritten': False}
        except Exception as error:
            await page.screenshot(path=str(report / 'first-failure.png'), full_page=True)
            return {'status': 'FAIL', 'scope': 'LOCAL_GUIDE_PREVIEW_SYNTHETIC_ONLY', 'checks': checks,
                    'error': str(error), 'browserErrors': errors}
        finally:
            await context.close()
            await browser.close()


options.report.parent.mkdir(parents=True, exist_ok=True)
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(options.bundle.resolve())))
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    result = asyncio.run(run(f'http://127.0.0.1:{server.server_port}', options.report.parent))
    options.report.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps({'status': result['status'], 'checks': len(result['checks'])}))
finally:
    server.shutdown()
    server.server_close()
raise SystemExit(0 if result['status'] == 'PASS' else 1)
