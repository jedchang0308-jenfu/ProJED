# DEV-045 Release Evidence - 2026-07-13

狀態：Production Released / Level 4 Post-deploy Smoke Passed / Cleanup Complete

## Source boundary

- Branch：`持續優化2`
- Starting commit：`437c4cc`
- Release-candidate source commit：`2635de9`
- Production deployment source commit：`43313b3`
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
- Identity修正commit `2635de9`已推送：preview DOM改用canonical Supabase task / board UUID；ICS保留既有UID並增加`X-PROJED-TASK-ID`、`X-PROJED-BOARD-ID`、`X-PROJED-DATE-TYPE`。
- 修正後`verify:calendar-feed-ics`、v3 feed 20/20、Builder static 18/18、browser verifier、Deno check與production build皆通過。

## Level 3 execution evidence

- Firebase CLI reauth已恢復；`2635de9` staging artifact已部署至`level3-smoke`，release `1783941010178000` / version `1cdf11639cecc886`，有效至`2026-07-14T11:10:02Z`。
- Fresh preview URL：`https://projed-cc78d--level3-smoke-o1na5wft.web.app/`。公開HTTPS / root / JS / CSS / service worker smoke通過，0 critical console、0 pageerror、0 critical failed request。
- Deployed JS `index-BPeJzbQT.js` SHA-256 `2C6B373CB4E948E280E0C401D4B42C88CEA61124FAF5AAC563E97EFD6FF83A74`；CSS `index-CLsSmPB5.css` SHA-256 `07093090E13992B26AF125089BE46E173ABFE82C27FFFE72CFDA2174A38F904E`，preview HTML引用與本機staging artifact一致。
- TEST `calendar-feed`已部署repo current source為version 4，`verify_jwt=false`，source hash `c77449a8e416653ea404c813667fce1a5f05b60e2af4f38fa957c650f1cb15a7`；production Edge未變更。
- Fresh preview使用既有OAuth session完成authenticated hard reload；重新載入後仍登入TEST，行事曆訂閱v3 builder、預覽與建立CTA可用。
- Fresh preview於1440x900、1024x768、390x844、320x700驗證無水平overflow；mobile filter drawer在390與320均完整位於viewport內，訂閱名稱與建立CTA同列且文字未裁切。
- 以已登入TEST帳號完成真實UI smoke：逐看板條件得到60項任務、113個事件，包含開始53與到期60；展開後113列皆具有task ID、board ID、date與date type，且事件identity不重複。
- 依日期 / 依看板切換後事件集合維持113；81個缺少所選日期的未產生原因可展開檢視。
- 建立`LEVEL3-DEV045-20260713-1530`後，live ICS為HTTP 200、`text/calendar`、113個VEVENT，開始53、到期60，與UI摘要一致。
- Token lifecycle：停用為410；重新啟用後同token恢復200 / 113；重生後舊token為404，新token為200 / 113。
- Google Calendar外部client成功建立訂閱並完成首次抓取；同一dual-date任務可見獨立開始與到期全天事件。驗證後已取消訂閱並移除外部日曆。
- TEST fixture已由Supabase dashboard以精確名稱刪除；刪除前matching rows為1，刪除後residual count為0。完整feed token未寫入文件或Git。
- Fresh deployment另建立`LEVEL3-DEV045-FRESH-20260713-1855`，UI為60項任務 / 113事件，live ICS為HTTP 200、113 VEVENT、開始53、到期60；驗證後刪除1筆，residual count為0。
- G3-05 machine diff通過：preview DOM 113事件、live ICS 113 VEVENT；canonical `(task ID, board ID, date type)` missing 0、extra 0、exact match true。
- G3-08同token task mutation通過：fixture由`todo`、2026-07-21 / 2026-07-23改為`in_progress`、2026-07-22 / 2026-07-24後，兩個事件UID依date type保持不變，title / status / dates皆更新。
- G3-09同token filter update通過：原113事件改為due-only後，同一URL仍HTTP 200，輸出60事件、start 0、due 60。
- G3-12 live compatibility通過：v1與defensive v2皆HTTP 200、113事件、start 53、due 60，且113筆皆含task ID、board ID與date type extension fields。
- G3-15 cache gate通過：既有受service worker控制分頁曾保留舊`index-Bp02B5N8.js`；關閉舊分頁並以cache-busted fresh navigation重開後載入`index-BPeJzbQT.js`，後續authenticated parity以新bundle完成。正式發布後仍需依G4再驗證active-client更新流程。
- 最終cleanup刪除4筆`LEVEL3-DEV045-*`訂閱與1筆任務fixture；精確residual query為0。完整feed token未寫入文件或Git。

## Production execution evidence

- Release owner於本task明確要求繼續執行production release；執行順序固定為DB history repair / migrations、Edge、Firebase Hosting、Level 4 smoke。
- Fresh production rollback evidence位於ignored目錄`output/preproduction/20260713-193800`。部署前schema SHA-256為`B04062CDA34BC406A00F63F67594E7FD2E6FEBDBA26CC8BD949C3A251414E082`，data SHA-256為`B5483351A100F21972F31D3185D3F1849006071C114BDF0EB7F9E3CE6BBFEE91`。
- 11筆ADR-040 history-only repair全部成功；repair後schema hash仍為`B04062CDA34BC406A00F63F67594E7FD2E6FEBDBA26CC8BD949C3A251414E082`，證明沒有執行DDL。
- `db push --dry-run --include-all`只列出ADR-040允許的5筆migration；實際套用後production migration history為38/38，後續dry-run回報remote database up to date。
- 套用後schema SHA-256為`CD576C14D48A16496E87BB9BE05318E1B2A7085D90C19BFE7EEE72634D818890`；`db lint --schema public,private --level error`無錯誤，read-only contract query確認v1/v2/v3 validator、wrapper、RLS與grants正確。
- Production `calendar-feed`部署為version 4、`verify_jwt=false`。部署後`index.ts` SHA-256為`4161BBBFD6EDABE9085CA6596B7D80199BED8C18AD39CACDDB1D3104D18CA0B5`，`ics.mjs`為`17F1EACC8469DE611AF3775146C5E40502AAD10207C998F10A25EFF9CBC00057`，逐檔等於repo；random token為404且無內部欄位洩漏。
- Firebase live release `1783943465159000` / version `57c214e8d9503c8c`已發布至`https://projed-cc78d.web.app`。入口`index-DGur8aYq.js` SHA-256為`D8D7DB48C386A12B9970A9EB14BD0C5CBA452C2E5787AB4456C60F9691BF01B9`，CSS `index-CLsSmPB5.css`為`07093090E13992B26AF125089BE46E173ABFE82C27FFFE72CFDA2174A38F904E`；線上與本機artifact完全一致。

## Level 4 post-deploy evidence

- Public production root、JS、CSS與service worker ready smoke通過；authenticated cache-busted navigation仍保持登入並載入`index-DGur8aYq.js`。無可見錯誤、app console error、pageerror或critical failed request；Chrome extension message-channel訊息列為外部extension noise。
- 以production-safe fixture `LEVEL4-DEV045-20260713-G4`建立canonical v3訂閱：UI為1個workspace、1張看板、4項任務、4個到期事件；live ICS為HTTP 200、`text/calendar`、4個VEVENT。移除ICS顯示前綴後，4個事件名稱與UI完全一致，identity SHA-256為`c95ca153be5a5f3ee388663e7c457f883be03951f7c17287ea500c923d1af32c`。
- Token lifecycle通過：停用後410；重新啟用後200 / 4事件；重生後舊token 404、新token 200 / 4事件；各錯誤response均未洩漏內部欄位。
- Fixture以exact-name、exact-one-row transaction刪除；production residual count為0，刪除後新token亦為404。UI重新整理後fixture消失，原有兩筆訂閱仍存在。
- 既有v1相容性採read-only觀察：production維持2筆active v1 row；Google Calendar重新載入後`JED個人工作區`仍啟用且可見對應全天到期事件。Google外部client不保證瀏覽器reload立即重新輪詢，因此DB `last_accessed_at`仍為部署前時間，此限制不誤記為新fetch。

## Rollback baseline and residual risk

- Firebase部署前release `1783605313274000` / version `284e7bcc17fe553c`可作frontend rollback。
- Edge部署前source已保存在`output/preproduction/20260713-193800/production-edge-before`；DB schema/data dump保存在同一ignored evidence目錄。
- DB migration採向前相容validator/function演進；若需rollback，先查v3 row count，再依QA decision tree優先回退frontend或Edge，禁止猜測history repair。
- Outlook未執行；QA G3-13只要求至少一個外部client，Google Calendar已通過，因此Outlook維持non-blocking supplemental。
