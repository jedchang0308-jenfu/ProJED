# QA-DEV-119：OKR 內容儲存格操作與保存恢復驗證計畫

- 版本：R10，2026-09-14；同步 [SPEC-119](../specs/SPEC-119-goal-cell-direct-edit-and-content-fit.md)。
- 狀態：`Executed / Targeted QA-QC PASS / NOT RELEASED`。本輪為固定 working-tree candidate 的本機驗證，非正式 release gate。
- 風險 Medium；P0：canonical 正文、錯誤覆寫與假保存；P1：生命週期、權限、事件、rowSpan、reload 與 UI 回歸。
- Source baseline 只引用 SPEC-119 第 7 節；此處不複製 hashes／互動規則，避免雙重 authority。

## 1. 驗證責任與風險優先序

RD 建立可重現 candidate、fixtures 與 failing tests，完成自測；QA 維護本計畫的 input/oracle；
QC 對固定 candidate 獨立執行，不以 RD 自測或舊 DEV PASS 代替。

| 失效風險 | 必要 oracle | Gate |
|---|---|---|
| plain 覆寫 rich／其他 notes 遺失 | semantic rich diff＋三表示 readback＋最新其他 notes identity | P0 |
| optimistic／no_changes 被算已保存，retry 覆蓋新正文 | controlled persistence outcomes＋dispatch payload＋session transition | P0 |
| 清空、篩選或換 view 丟失 editor／error，reload 清掉 draft | 真實卸載／掛回＋provider session＋失焦 reload owner snapshot | P0 |
| IME／底邊／全域選單事件互撞，權限在 entry 後撤銷 | 實際輸入與 dispatch count，不能只查 handler 字串 | P1 |
| rowSpan／捲動／框中框退化，非法 ARIA | rendered geometry、computed style、AX、鍵盤及截圖 | P1 |
| 全域捲軸基底覆蓋語意例外或新增 wrapper | representative native scroll owners 的 computed style、DOM child count、Gantt 直接拖曳例外 | P1 |
| meeting 人工紀錄誤寫／capture 重複 alias | 分開計數 task persist、human quick-note write、store-owned capture | P0 |

## 2. 可重現 fixtures 與量測

在隔離測試資料／既有 verifier fixture 機制下進行，不修改使用者 localhost:4000 的真實任務或會議紀錄。

- `G119-LEGACY`：只有多行 description，無 detailNotes；覆蓋首次有效編輯及 no-op。
- `G119-RICH`：第一則 note 含 heading、bold、list、safe link、換行；至少另兩則 note，ID 固定。
- `G119-SPAN`：父 owner 跨 3 個可見子列；另有獨立 owner、covered cell、short content。
- `G119-LAST`：整個 board 唯一非空目的，內容含「484／1658／18556／51616」四行；可重現清空後欄位消失。
- `G119-MEETING`：合格 DEV-108 quick notes、另一 board 的不合格資料及 live meeting enabled/disabled 分支。
- 身分：editor、viewer；另可在 session 期間撤銷權限、切 account、移動／封存／刪除 task、修改第一則或其他 notes。
- 保存控制：可延遲、成功、已知失敗、無 callback rejection；task persistence 成功但 capture rejection 必須可分開注入。
  時間控制用 deterministic fake clock／deferred promise；不能靠長時間 sleep 或偽造 PASS。
- 初始 UI snapshot、store／persisted fixture readback、call traces、Undo/activity/capture counters 每 case 重置。
  所有比對記錄 actual 值；monkeypatch／test stub 必須在 finally 恢復，不能讓測試結果污染下一 case。

本地 adapter readback 只能證明本地整合，不得宣稱正式 provider／遠端 DB 已驗證。
若聲稱 provider durability，另附 exact environment 與經正常 provider 讀回的 evidence。

## 3. Pure／contract cases

每個 case 必須有實際 assertions；source search 只能作 forbidden-surface check，不能替代行為測試。

| ID | Fixture／輸入 | 必須觀察的結果 |
|---|---|---|
| P01 | LEGACY：mount、focus、Esc、改後還原、有效修改 | 前四者無 mutation／lazy upgrade；有效修改產生合法 rich 第一則，content=description=rich plain projection。 |
| P02 | RICH：改中段、清空、修改格式 | 未碰觸格式及所有其他 notes 保留；clear 三表示為空，不從舊 content fallback；note id/title 保留。 |
| P03 | latest notes 另有更新、第一則 title 更新、完全等價 payload | 只合併正文並保留最新 metadata/其他 notes；無差異重用 reference，不產生空 Undo。 |
| P04 | owner key、內容 scroll 區 bottom±12px、covered／short／meeting | identity 不依 index/text；精確命中 B；covered 不 render，short B no-op、meeting 沒有 edit/write command。 |
| P05 | clean／dirty、重複 commit、accepted false、callback／completion 各分支 | 按 SPEC 第 5.2 節一次 attempt；no_changes 不消除 error；timeout 不成功；過期 callback 不覆蓋別的 session。 |
| P06 | entry 後撤權、task 刪除／封存／換 scope、正文被更新、只改其他 note | 不合法 scope／權限／正文衝突不 dispatch，保留 draft；其他 note 更新可安全合併。 |
| P07 | force retry，最新正文等於 submitted／不等於 submitted | 相等才從最新 node 重建 payload；forcePersistence/skipActivity 正確；無差異 retry 不加 Undo；不同則 conflict。 |
| P08 | editor／provider／PWA／write surface 結構 | 同一 Lexical engine，cell 不讀寫 details 高度偏好；唯一 session host、既有 PWA owner、無新 API/schema/task catalog/record write path；共用捲軸是 CSS foundation，不是 React wrapper。 |

## 4. Browser 情境（實際正常入口）

所有 B cases 從 topbar 選 Goal；不要用直接 set internal view 代替正常入口。cases 可拆分 subcase，但不得省略分支。

| ID | 操作／前置條件 | Expected evidence |
|---|---|---|
| B01 | 1298×698，單擊 owner；雙擊 description 內容與 F2 各進入一次 | 單擊僅 current outline；兩 A 入口都在原 td 編輯，focus 正確、modal/DnD=0；無 header/toolbar/resize/card。 |
| B02 | long description／meeting：雙擊底邊兩次；Shift+F10 做同樣操作；short content 做 B | 首次全文可見且 inner Y-scroll 取消，第二次恢復 bounded scroll；收合時繼承系統 3px 簡約樣式；外層捲動保留，short 無跳動；所有分支 write=0。 |
| B03 | SPAN：多 owner 各展開，再 filter/collapse/reproject | native span／headers 正確、covered td=0；無遮蔽／欄線漂移，其他 owner 展開互不取消；不存在 presentation key 清除。 |
| B04 | 內容格 right-click／Shift+F10、Esc／外部點擊；task-name 右鍵；editor 原生右鍵 | 每次只有一個對應選單；Esc 回來源，外部點擊不搶焦；task global actions 不變、editor 文字選單不被 cell menu 接管。 |
| B05 | LEGACY：進入不改、Esc、修改後還原；有效編輯 Enter | 前三者 persistence/Undo/activity=0；有效修改一次保存，三表示 readback 一致，Enter 按 owner ID 移至下一可見目的。 |
| B06 | RICH：保留格式改正文後 Ctrl/Cmd+S、blur、Tab/Shift+Tab 分別完成；重開 Task Details | 每種完成入口只提交一次，details 顯示同 rich 正文，其他 notes 保留；Tab 為 native 順序，save 留來源；details toolbar／autosave／高度偏好不變。 |
| B07 | Alt+Enter／Ctrl+Enter／Cmd+Enter、中文 composition Enter 與離焦；editing 狀態點底邊 | 換行不提交；IME 不截斷／誤存，compositionend 後真正離焦才一次保存；編輯期間不執行 B 或 row DnD。 |
| B08 | viewer 的 A/B；meeting A；entry 後撤權／permission loading／task archived | 禁止 A／commit 的分支 task write=0；viewer B 正常；draft 不遺失、沒有繞過 placement permission。 |
| B09 | task persistence failed→改其他 note→手動 retry 成功 | 錯誤可見、非成功；retry 保留最新其他 notes，引用重用、不重複 activity／空 Undo，persisted readback 才支持成功；放棄重試不假裝 rollback。 |
| B10 | pending 超過 10 秒；accepted no_changes；missing node；無 callback rejection；舊 attempt callback | 顯示等待／error／unknown，沒有假成功、自動重送或第二個 editor；no_changes 不能解除既有 failed 狀態，過期結果不覆蓋新 session。 |
| B11 | 編輯中第一則被外部改；retry 前第一則改變；僅其他 notes 或 title 更新 | 前兩者 conflict、不 dispatch，能複製／捨棄後重開；後者安全保存且最新值不被舊 snapshot 覆蓋。 |
| B12 | LAST：清空唯一目的→延遲→失敗→retry 成功 | session/anchor 保留來源格與錯誤入口，pending 不立刻隱欄；成功後才移除 anchor 並恢復 sparse 空欄規則，焦點有有效 fallback。 |
| B13 | dirty／pending／failed 各自 filter、collapse、換 board/view 後返回；來源 task 刪除；換帳號 | 不靠 unmount cleanup 保存；合法 blur 最多一次；跨 view 保留唯一 draft/result 與恢復列，回可見來源接回同一 session；不自動清 filter；換帳號無資料洩漏。 |
| B14 | 鍵盤走 current cell、F2、menu、Enter/Tab、錯誤；檢查 AX tree | native table/td/headers 完整；td 無 aria-selected／aria-expanded，editor 名稱/multiline 正確，提示／錯誤可讀；全域 task Enter 不被誤觸，不遲到搶焦。 |
| B15 | live meeting off/on 各執行一次 A；對 meeting 做 B；注入 task success 後 capture rejection | A 只走 task store；on 時合法 capture 不當成失敗或人工補記，alias 不重複；B 全部零寫；capture rejection 不重送已保存 task、不誤報 task failure。 |
| B16 | dirty/pending/error/unknown editor 失焦並離開 Goal，請求 PWA reload；之後 settle／取消乾淨草稿 | 既有 inline-editor owner 持續 unsafe，不能只查 activeElement；解決後恢復 safe；beforeunload listener 適時掛載/移除，不新增 storage 或 owner。 |

各 case 都收集 console/page/HTTP/visible errors；注入錯誤要標記 exact case／expected trace。
「本 case 預期會失敗」不允許無範圍忽略所有 errors。

### Viewport 與視覺證據

| ID | Viewport | 必須觀察 |
|---|---|---|
| V01 | 1440×900 | flat table、sticky header、selection/editor/menu、rowSpan 全文展開，沒有多餘框中框。 |
| V02 | 1298×698 | 對照使用者標註：收合保留 Y-scroll、完整展開、再收合；欄寬／格線不漂移。 |
| V03 | 814×698 | desktop 外層水平捲動可達所有欄；必要 scroll 不形成操作陷阱。 |
| V04 | 390×844 | 正常 Goal 入口不存在；persisted goal 按 SPEC-116 正規化，未新增 mobile editor。 |

至少留存 V02 collapsed／selected／editing／purpose expanded／meeting expanded／repeat-B／menu／failure／detached recovery，
以及 V01／V03 全表截圖。scrollHeight/clientHeight、maxHeight/overflowY、cell rect、rowSpan／headers、focus/AX 都須另附 actual 值；
截圖不能替代資料與互動 oracle。

R10 共用捲軸 targeted evidence 另量測：Goal bounded scroll 與 Workbench 兩個獨立 scroll owner 的 WebKit 寬度均為 3px／Firefox contract 為 thin；
切換真實 Gantt surface 後，`.scrollbar-gantt` 必須為 WebKit 12px、`scrollbar-width:auto` 且 X/Y 仍為 scroll。`.no-scrollbar` 以 static contract 保留，不把隱藏捲軸誤套成全域可見樣式。

## 5. 命令與直接回歸

RD 驗證入口：

- `verify:dev-119-goal-cell-actions` → `tsx scripts/verify-dev-119-goal-cell-actions.ts`。
- `verify:dev-119-goal-cell-actions-browser` → 沿用 `scripts/run-playwright-code.ps1`，
  SessionPrefix=dev119-goal-cell-actions，Filename=scripts/verify-dev-119-goal-cell-actions-browser.pw.js，
  OutputDirectory=output/playwright/dev-119-goal-cell-actions，BaseUrl=http://localhost:4000/，
  ArtifactWindowKey=__DEV119_ARTIFACT，ArtifactPath=output/playwright/dev-119-goal-cell-actions/result.json。

以下腳本已於文件審查時對照 package.json；實作完成才執行，不以歷史 PASS 替代本 candidate：

| 範圍 | 必跑命令／情境 |
|---|---|
| 新功能 | `npm run verify:dev-119-goal-cell-actions`、`npm run verify:dev-119-goal-cell-actions-browser` |
| 共用 editor | `npm run verify:dev-066-task-note-rich-text`、`npm run verify:dev-066-task-note-rich-text-browser` |
| 父 Goal 表格 | `npm run verify:dev-116-goal-mode`、`npm run verify:dev-116-goal-mode-browser` |
| reload owner | `npm run verify:dev-097-pwa-safe-reload`、`npm run verify:dev-097-pwa-safe-reload-browser`，另以 B16 補未聚焦 session 分支 |
| meeting | `npm run verify:dev-108-task-meeting-note-persistent-list`、`npm run verify:dev-109-meeting-live-task-change-capture`，另以 B15 驗證 Goal 正常入口 |
| hover／task menu | `npm run verify:dev-114-task-description-global-surfaces`、`npm run verify:dev-070-interaction-kernel`，另以 B04/B06 檢查呈現與操作 |
| 編譯／靜態 | `npx tsc --noEmit`；對本 DEV changed TS/TSX 執行 `npx eslint <exact-files>`；`npm run build:test`；`git diff --check -- <owned-files>` |

允許的最小 store／App／PWA surface 以 SPEC 第 6 節為準；不能沿用 R1「所有 provider／store 改動都禁止」的過時 gate。
SPEC-116 的 scoped supersession 可更新 candidate 斷言，不可刪掉仍有效的 sticky/rowSpan/menu/scroll 回歸來製造 PASS。
若腳本先因環境失敗，記錄 exact error 與未覆蓋情境，不將未執行寫成 PASS。

## 6. Evidence 與 runtime 邊界

- Pure artifact：`output/playwright/dev-119-goal-cell-actions/static-result.json`。
- Browser artifact：`output/playwright/dev-119-goal-cell-actions/result.json`；截圖同目錄。
- Artifact 必含：DEV/version、source revision＋dirty hashes、case/subcase ID、actor/fixture/viewport/入口、input trace、
  actual/expected、task/quick-note/capture 分開計數、persist outcome、rich semantic diff、focus/AX/geometry、errors、screenshots。
  無 fixture／空 cases／預造空 error list 不構成證據。
- 記錄 runtime project、purpose、port、owning process tree、cleanup condition。優先安全重用相符環境；
  若重用其他 task 的 localhost:4000，註明 owner，不能擅停。
- 本 QA 自行啟動的 temporary runtime 結束時只清理驗證過的 task-owned process tree，確認 port 釋放。
  不得 stop all node.exe／清未知 port；正常入口測試也不能改使用者真實資料。

## 7. Exit gate 與目前結果

PASS 必須同時滿足 P01–P08、B01–B16（含全部分支）、V01–V04、required regressions、
編譯／lint／build／diff gate、完整 artifacts 與 task-owned runtime cleanup。
任一 P0/P1 assertion 未達為 FAIL；環境／權限真的不可用且沒有安全 local 替代才記 Blocked，產品錯誤不是 Blocked。

修正後重跑失敗 case、同 authority 鄰接 case、完整 DEV-119 與直接受影響 regressions；
candidate／dirty baseline 改變後舊 QC artifact 失效。RD 與 QC 結果分開記錄，不能用同一輪自改自測冒充獨立驗證。

本輪結果：`Targeted QA-QC PASS / NOT RELEASED`；將 3px 簡約捲軸提升為共用 CSS foundation，新增 Goal／Workbench／Gantt 例外 computed-style 量測，並重驗 R8 單一 editing frame、R5 行距與 R4 收合命中修正。

- DEV-119 static：`npm run verify:dev-119-goal-cell-actions`，18/18 PASS；P18 確認單一系統基底、移除舊 per-surface class 並保留兩個例外。
- DEV-119 browser：`npm run verify:dev-119-goal-cell-actions-browser`，17/17 PASS；除涵蓋 V02／V01 的收合 Y-scroll、單格選取、F2、Ctrl+Enter 換行、Escape、Enter 保存、B 反覆切換、meeting readonly、native rowSpan、clean session 與桌面表格幾何外，B01／S01 實測 Goal 與 Workbench 為 `scrollbar-width=thin`、WebKit `width=3px`；S02 實測 Gantt 為 `scrollbar-width=auto`、WebKit `width=12px` 且 X/Y scroll 保留；B04A 實測 cell editor paragraph 的 `lineHeight=20px`、`minHeight=20px`、上下 `margin=0`、實際高度 20px；B04B 實測 editing data state、淡底色、單一 inset 外框、無 editor 內層 border、淡白 editor surface、caret color 與 contenteditable focus 均存在；browser errors／HTTP failures 均為 0。
- 共用／父表面回歸：DEV-066 static + browser PASS、DEV-108 static 16/16 + browser B01–B09 PASS、DEV-109 static PASS、DEV-114 static 29/29 + browser B01–B26 PASS、DEV-116 static 30/30 + browser PASS、DEV-097 static 23/23 + Service Worker integration PASS。
- 編譯品質：`npx tsc --noEmit`、`npm run build:test`、changed-file ESLint 均通過；ESLint 0 errors，僅 5 warnings（2 個新 session context fast-refresh lint 提示與 3 個既有 store unused-variable warnings）。
- Evidence：`output/playwright/dev-119-goal-cell-actions/static-result.json`、`output/playwright/dev-119-goal-cell-actions/result.json` 及同目錄截圖（含 `B01-goal-content-scrollbar-1298x698.png`、`B04B-goal-cell-editing-state-1298x698.png`、`S02-gantt-scrollbar-exception-1440x900.png`）；本輪沿用其他 task 擁有的 `localhost:4000`，未停止該 runtime。

本次是 targeted PASS，不宣稱 QA exit gate 所列完整 P01–P08、B01–B16、V01–V04 的所有 failure injection／權限撤銷／跨 view 分支；這些仍是後續 release gate。未 commit／push／deploy／release。
