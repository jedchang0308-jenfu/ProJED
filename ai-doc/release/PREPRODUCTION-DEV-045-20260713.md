# DEV-045 Pre-production Evidence - 2026-07-13

狀態：Level 3 Fresh Preview Passed / Compatibility Gates Pending / Production Mutation Not Authorized

## Source boundary

- Branch：`持續優化2`
- Starting commit：`437c4cc`
- Upstream：`origin/持續優化2`
- Starting worktree：clean
- Firebase preview target：`projed-cc78d / level3-smoke`
- Supabase TEST：`fhisnnufoeulxqrchldf`
- Supabase production：`knodlkxqpcqyrtgwpdst`

## Completed evidence

- Release commit：`d69899c`，已推送至`origin/持續優化2`；worktree於QC開始前為clean。
- `npm run verify:source`通過；lint為0 error / 63既有warning，production build、production auth 5/5、migration provenance 65/65、ICS與核心gate全數通過。
- Staging artifact由`d69899c`產生，入口為`assets/index-Bp02B5N8.js`與`assets/index-CLsSmPB5.css`；28個artifact檔案未命中test email/password。
- Staging env resolves to ProJED-TEST，OAuth mode，無test email/password，auto-login disabled。
- Production migration forensic：12個remote-only statements已下載；source補回後production remote-only為0。
- Production dry-run：16個local-only已分類為11個history-only repair與5個真實pending migration；未執行production repair/push。
- TEST backup：schema 136935 bytes / SHA-256 `354BA21865ED82C25D2E85A3A2B4275478CA9B4C9AE579AC6F0C591FF59A5B08`；data 83593 bytes / SHA-256 `1361429E5465D9D5323B5020FCA75233F2EDFF2DECB7ACE15B2B0C32CC2E6A2D`。
- TEST migration：12份缺漏migration已套用；目前38/38 local/remote timestamps一致。
- Edge source：TEST `calendar-feed`逐檔等於repo；production仍是較舊source，保留作rollback baseline。
- Migration provenance verifier：65 passed / 0 failed。

## Level 3 execution evidence

- Firebase CLI reauth已恢復；由clean `dae201d` workspace重新部署`level3-smoke`，release `1783935574738000` / version `bde21a1295b2389c`，有效至`2026-07-14T09:39:31Z`。
- Fresh preview URL：`https://projed-cc78d--level3-smoke-o1na5wft.web.app/`。公開HTTPS / root / JS / CSS / service worker smoke通過，0 critical console、0 pageerror、0 critical failed request。
- Deployed JS `index-Bp02B5N8.js` SHA-256 `266BE719E442FA7F972D7ED2149FAEC20D42C3E10AEA8B8752A1942AA77CAD0C`；CSS `index-CLsSmPB5.css` SHA-256 `07093090E13992B26AF125089BE46E173ABFE82C27FFFE72CFDA2174A38F904E`，兩者逐檔等於本機staging artifact。
- Fresh preview使用既有OAuth session完成authenticated hard reload；重新載入後仍登入TEST，行事曆訂閱v3 builder、預覽與建立CTA可用。
- Fresh preview於1440x900、1024x768、390x844、320x700驗證無水平overflow；mobile filter drawer在390與320均完整位於viewport內，訂閱名稱與建立CTA同列且文字未裁切。
- 以已登入TEST帳號完成真實UI smoke：逐看板條件得到60項任務、113個事件，包含開始53與到期60；展開後113列皆具有task ID、board ID、date與date type，且事件identity不重複。
- 依日期 / 依看板切換後事件集合維持113；81個缺少所選日期的未產生原因可展開檢視。
- 建立`LEVEL3-DEV045-20260713-1530`後，live ICS為HTTP 200、`text/calendar`、113個VEVENT，開始53、到期60，與UI摘要一致。
- Token lifecycle：停用為410；重新啟用後同token恢復200 / 113；重生後舊token為404，新token為200 / 113。
- Google Calendar外部client成功建立訂閱並完成首次抓取；同一dual-date任務可見獨立開始與到期全天事件。驗證後已取消訂閱並移除外部日曆。
- TEST fixture已由Supabase dashboard以精確名稱刪除；刪除前matching rows為1，刪除後residual count為0。完整feed token未寫入文件或Git。
- Fresh deployment另建立`LEVEL3-DEV045-FRESH-20260713-1855`，UI為60項任務 / 113事件，live ICS為HTTP 200、113 VEVENT、開始53、到期60；驗證後刪除1筆，residual count為0。

## Remaining Level 3 gates

- G3-05目前完成事件總數、date-type分布與113筆DOM identity完整性；仍需產出DOM / ICS machine-readable identity diff為0的正式artifact。
- G3-08 task title / date / status更新後重抓feed、G3-09保留同token修改filters、G3-12 live v1 / defensive v2 feed仍未執行。
- Outlook無可用登入工作階段，停在Microsoft登入頁；Google已滿足G3-13至少一個外部client，但Google / Outlook雙client parity仍為pending。
- Fresh preview service worker已ready且script指向本次origin的`sw.js`，但首次載入controller為false；仍需補controller接管後的可稽核證據。四viewport已完成layout metrics，若release evidence要求像素證據則仍需保留實機截圖。

## Production stop gate

在上述Level 3缺口未完成，以及release owner未明確核准production mutation前，不執行migration repair、DB push、production Edge deploy或Firebase live deploy。
