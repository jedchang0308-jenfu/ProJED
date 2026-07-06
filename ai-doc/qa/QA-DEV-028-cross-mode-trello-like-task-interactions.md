# QA-DEV-028: 四模式一致的 Trello-like 任務操作驗證計畫

狀態: QA Plan Updated / Local Automated QA Passed / Manual Click QC Readiness Gate Added / Manual Click QC Pending / 2026-07-06 Detail-Only Title Edit Addendum Implemented
對應 DEV: DEV-028
對應 SPEC: `ai-doc/specs/SPEC-028-cross-mode-trello-like-task-interactions.md`
建立日期: 2026-06-26

## 驗證目標

確認清單、心智圖、看板、甘特四個模式共享同一套任務操作肌肉記憶:

- 單擊既有任務 = 選取 + 開啟同一個 `TaskDetailsModal`。
- 關閉詳情後保留該任務選取狀態與最小 selected highlight / ring。
- 單擊任務名稱不直接改名；改名只能在任務詳情頁的任務名稱區進行。
- 任務詳情頁的任務名稱區需有可編輯視覺，讓使用者知道可以點選編輯。
- 看板卡片、L3+ 待辦列、工作台任務列、清單列、甘特列與心智圖節點不得提供鉛筆、F2、`t`、右鍵重新命名、雙擊標題或直接打字 rename。
- 新增任務命名不得依賴外層 inline rename；若需要立即命名，應開任務詳情頁 title edit。
- 右鍵/長按在四模式都開任務操作選單；心智圖關聯線入口不再佔用一般右鍵。
- ESC 可關閉最上層暫時性 UI；任務詳情、確認對話框、說明 dialog、popover、dropdown、drawer 不得互相穿透關閉。
- 看板 Level 3+ 與卡片正面資訊密度不得被本 DEV 移除。
- 2026-07-04 DEV-029 compatibility: 手機 coarse pointer 的任務卡 / 任務列短滑安全由 DEV-029 優先；mobile pan 不得誤開詳情，長按任務操作選單仍需保留。

## Zero-Tolerance Failures

以下任一項發生即判定 DEV-028 不可驗收:

| ID | Fail condition | 驗證方式 |
|---|---|---|
| ZT-028-001 | 任一模式單擊既有任務沒有開啟 `TaskDetailsModal` | Browser flow + DOM selector |
| ZT-028-002 | 任一模式單擊任務名稱直接進入外層 rename input | Browser click trace |
| ZT-028-003 | 關閉詳情後剛點擊的任務沒有保留選取狀態 | DOM state + screenshot |
| ZT-028-004 | 清單、看板、甘特的 `Enter` 沒有開詳情，或心智圖 `Enter` 被改成開詳情 | Keyboard trace |
| ZT-028-005 | 外層任務 surface 仍可用鉛筆、F2、`t`、右鍵重新命名、雙擊或直接打字進入 rename | Browser keyboard + context menu trace |
| ZT-028-006 | 任務詳情頁任務名稱區沒有可編輯視覺，或無法在詳情頁編輯任務名稱 | Detail modal screenshot + edit trace |
| ZT-028-007 | 新增任務後仍在外層任務列 / 卡片開 rename input，而不是進入詳情頁 title edit | Browser create flow |
| ZT-028-008 | 右鍵/長按在任一模式不是任務操作選單，或仍提供「重新命名」外層入口，或心智圖關聯線仍佔用一般右鍵 | Browser context menu trace |
| ZT-028-009 | 點狀態、負責人、日期、依賴、展開箭頭、拖曳把手會誤開詳情 | Interactive-control guard test |
| ZT-028-010 | 甘特拖曳或 resize 後又觸發開詳情 | Drag/click collision test |
| ZT-028-011 | 看板 Level 3+ 被藏到 Card back，或卡片正面既有日期/依賴/標籤/進度被移除 | DOM + screenshot |
| ZT-028-012 | 桌機或手機 viewport 出現 modal、選取框、右鍵選單、長按選單、拖曳控制重疊或裁切 | Screenshot review |
| ZT-028-013 | ESC 無法關閉最上層 modal/dialog/popover，或 ESC 穿透關閉父層 UI | Keyboard trace + manual click |
| ZT-028-014 | DEV-029 實作後，手機任務卡 / 任務列短滑仍開詳情或只能靠縫隙 pan | DEV-029 browser gesture + mobile manual |

## RD Slice Phase Gates

每個 slice 可獨立交 QC，但不得把後續 slice 的未完成項偽裝為通過。若某一 slice 尚未交付，QC 報告需標記 `not executed / pending`，不能用最終驗收一次帶過。

| Slice | 驗證重點 | Local pass 條件 | 不可接受失敗 |
|---|---|---|---|
| Slice 1: 共用詳情入口與事件生命週期 | 共用 `openTaskDetails` 或等效入口、selected task state、常駐監聽、target guard | 靜態檢查可追到四模式共用詳情入口；沒有 context menu open 也可開 `TaskDetailsModal`；至少一個模式能證明 click 前先選取、關閉後 selection 保留；互動 controls 不誤開詳情。 | 詳情入口仍綁在右鍵選單生命週期；新增平行詳情容器；selected state 無法支援關閉詳情後保留。 |
| Slice 2: 詳情頁 title edit / 外層 rename 移除 | 清單 row/title、看板 card/checklist、工作台 row、detail title edit、新增任務命名、Level 3+ 保留 | 清單與看板 click 既有任務都選取 + 開詳情；單擊標題不進外層 rename；外層鉛筆/右鍵重新命名/`t`/F2/直接打字 rename 不可用；詳情頁 title 可明確點選編輯；新增任務命名入口落在詳情頁；看板 Level 3+ 與卡片正面資訊不消失。 | 任一 title click 仍直接 rename；外層仍有 rename pencil / context menu item / keyboard shortcut；詳情頁標題看不出可編輯或不可編輯；卡片資訊降噪或 Level 3+ 被移走。 |
| Slice 3: 心智圖契約對齊 | Mind map click-to-details、selection-first flow、right-click task menu、relationship entry relocation | 節點 click 選取 + 開詳情；關閉後方向鍵、`Enter`、`Tab` 可用；直接打字不進節點外層 rename；右鍵/長按開任務選單但不含重新命名；關聯線可由 toolbar、shortcut 或 selected-node action 進入，且關聯線模式不誤開詳情。 | 心智圖 `Enter` 被改成開詳情；直接打字仍進外層 rename；右鍵仍提供外層重新命名或直接進關聯線；relationship edit 期間被開詳情打斷。 |
| Slice 4: 甘特契約對齊 | Gantt task bar、resize/drag、SharedTaskSidebar | 任務條與左側任務列 click 選取 + 開詳情；drag/resize 後不開詳情；展開箭頭與 sidebar controls 不誤開詳情；不再以 click 任務切回清單作為主要行為。 | 拖曳排程後觸發 modal；任務 click 仍切清單但不開詳情；粗指標環境出現排程與詳情誤觸。 |
| Slice 5: 快捷鍵與 verifier | 1A keymap、static/browser verifier、regression gates | 清單/看板/甘特 `Enter` 開詳情；心智圖 `Enter` 新增同階；`t`/F2 不再觸發外層 rename；新增 / 更新 `verify:dev-028-cross-mode-task-interactions` 與 browser script；DEV-027B/027E browser regression 通過。 | keymap 沒有模式差異；verifier 只驗單一模式；input 聚焦時快捷鍵破壞文字輸入；外層 rename 快捷鍵殘留。 |

Phase gate 共通要求:

- 每個 slice 的 QC evidence 至少需包含操作步驟、實際結果、DOM selector 或 screenshot、viewport。
- UI slice 不能只用 TypeScript、lint、build 判定通過；這些只能作為輔助證據。
- 若 slice 涉及手機，至少使用 390x844 viewport；若無法確認實體鍵盤，需記錄 focus 與可輸入證據。
- 若發現 zero-tolerance failure，停止該 slice 驗收並回 RD 修正，不進入下一個 slice 的 pass 判定。

## QA 親自點擊驗證原則

使用者新增要求: DEV-028 的驗證必須包含 QA/QC 操作者親自點擊操作驗證。自動化 Playwright browser smoke 只能作為輔助證據，不能取代人工點擊。

人工點擊驗證定義:

- QC 操作者必須在真實瀏覽器或 Codex in-app browser 中，用滑鼠、觸控板或觸控模擬逐項操作。
- 每個主要案例都要記錄 `模式`、`viewport`、`操作步驟`、`預期結果`、`實際結果`、`證據` 與 `判定`。
- 若操作開啟 modal、context menu、rename input、selected ring、drag ghost、resize handle 或 mobile keyboard/focus，需附截圖或錄影片段。
- 若任一人工點擊案例未執行，DEV-028 只能判定為 `Automated Browser Smoke Passed / Manual Click QC Pending`，不得宣告人工驗收通過。
- 若自動化通過但人工點擊失敗，以人工點擊失敗為準，回 RD 修正。

人工點擊執行環境:

| 項目 | 要求 |
|---|---|
| 瀏覽器 | 優先使用 Codex in-app browser；若不可用，使用 Chrome / Edge 真實瀏覽器 |
| URL | 本機測試 URL，例如 `http://127.0.0.1:4173/` 或當輪實際 dev server URL |
| Desktop viewport | `1440x900` |
| Laptop viewport | `1024x768` |
| Mobile viewport | `390x844` |
| 測試資料 | 至少一個 board，含 Level 1 / Level 2 / Level 3+ 任務、看板卡片、甘特日期、至少一個可點擊下層任務 |
| Visible error sweep | 每個 viewport 進入主畫面後都必須檢查 `.inline-error`、`[role=alert]`、可見 HTTP 4xx/5xx、`Not Found`、`Internal Server Error`、可見 `/api/` 錯誤 |

## 人工親自點擊測試矩陣

| ID | 模式 | Viewport | 親自點擊操作 | 預期結果 | 必收證據 |
|---|---|---|---|---|---|
| MAN-028-001 | 清單 | 1440x900 | 單擊任務列空白區 | 任務被選取並開啟 `TaskDetailsModal` | modal 截圖、`data-task-id` 或任務標題、selected ring 截圖 |
| MAN-028-002 | 清單 | 1440x900 | 關閉詳情後觀察同一任務 | 詳情關閉，原任務仍保留 selected highlight / ring | 關閉後截圖 |
| MAN-028-003 | 清單 | 1440x900 | 單擊任務名稱文字 | 不進入 rename input，仍開啟詳情 | 點擊前後截圖或錄影 |
| MAN-028-004 | 清單 | 1440x900 | 點展開箭頭、狀態、負責人、日期、依賴控制 | 只執行該控制，不誤開詳情 | 每個控制的點擊結果截圖 |
| MAN-028-005 | 清單 | 1440x900 | 找鉛筆、右鍵重新命名、F2、`t`、雙擊標題、直接打字 | 清單外層不得出現或觸發 rename input；需要改名時只能開詳情 | 無 rename input 的操作證據、右鍵選單截圖 |
| MAN-028-006 | 清單 / 詳情 | 1440x900 | 開任務詳情後點任務名稱區 | 任務名稱區有可編輯視覺，點擊後可編輯並可儲存 / 取消 | 詳情標題 affordance 截圖、編輯前後截圖 |
| MAN-028-007 | 心智圖 | 1440x900 | 單擊節點 | 節點被選取並開啟同一 `TaskDetailsModal` | modal 截圖、節點 selected 截圖 |
| MAN-028-008 | 心智圖 | 1440x900 | 關閉詳情後按方向鍵、`Enter`、`Tab` | 方向鍵可導航，`Enter` 新增同階，`Tab` 新增子階，不被改成開詳情 | 錄影或逐步截圖 |
| MAN-028-009 | 心智圖 | 1440x900 | 選取節點後直接打字、F2、`t` | 不進入節點外層 rename；若要改名需開任務詳情 | 無 rename input 證據、詳情入口截圖 |
| MAN-028-010 | 心智圖 | 1440x900 | 右鍵節點 | 開任務操作選單，不包含重新命名；不直接進入關聯線建立模式 | context menu 截圖 |
| MAN-028-011 | 心智圖 | 1440x900 | 用 toolbar / shortcut / selected-node action 進入關聯線模式，再點節點與關聯線 | 關聯線操作可用，且關聯線模式中不誤開任務詳情 | 關聯線模式截圖或錄影 |
| MAN-028-012 | 看板 | 1440x900 | 單擊卡片空白區 | 卡片被選取並開啟 `TaskDetailsModal` | modal 截圖、卡片 selected 截圖 |
| MAN-028-013 | 看板 | 1440x900 | 單擊卡片標題文字 | 不進入 rename input，仍開啟詳情 | 點擊前後截圖 |
| MAN-028-014 | 看板 | 1440x900 | 單擊卡片內 Level 3+ 下層任務 | 下層任務被選取並開啟詳情 | Level 3+ 可見截圖、modal 截圖 |
| MAN-028-015 | 看板 | 1440x900 | 檢查看板卡片正面日期、依賴、標籤、進度、Level 3+ | 本 DEV 未降噪，既有資訊仍在卡片正面可見 | 卡片正面截圖 |
| MAN-028-016 | 看板 | 1440x900 | 拖曳卡片到同欄或跨欄 | 拖曳只移動卡片，不在 drop 後誤開詳情 | 拖曳前後截圖或錄影 |
| MAN-028-017 | 看板 | 1440x900 | 找卡片 / L3+ 待辦列 / 工作台列上的鉛筆、右鍵重新命名、F2、`t`、雙擊標題、直接打字 | 看板與工作台外層不得出現或觸發 rename input；需要改名時只能開詳情 | 無 rename input 證據、右鍵選單截圖、詳情 title edit 截圖 |
| MAN-028-018 | 甘特 | 1440x900 | 單擊任務條 | 任務被選取並開啟 `TaskDetailsModal`，不切回清單作為主要行為 | modal 截圖、甘特 selected 截圖 |
| MAN-028-019 | 甘特 | 1440x900 | 單擊左側任務列 | 任務被選取並開啟詳情 | modal 截圖 |
| MAN-028-020 | 甘特 | 1440x900 | 拖曳任務條與左右 resize handle | 只調整排程，不誤開詳情 | 拖曳/resize 前後截圖或錄影 |
| MAN-028-021 | 甘特 | 1440x900 | 點左側展開箭頭 | 只展開/收合，不開詳情 | 截圖 |
| MAN-028-022 | 四模式 | 1024x768 | 重複 MAN-028-001、007、012、018 | laptop 低高度下 modal、選取框、右鍵選單不裁切或重疊 | 四模式截圖 |
| MAN-028-023 | 四模式 | 390x844 | 重複清單/心智圖/看板/甘特單擊開詳情與關閉保留選取 | mobile 不出現水平 overflow、modal 不裁切、可回到原模式 | 四模式 mobile 截圖 |
| MAN-028-024 | Mobile | 390x844 | 新增任務後嘗試命名 | 手機新增後若需要命名，應進入詳情頁 title edit；外層任務列 / 卡片不得開 rename input | 詳情 title edit focus 截圖、外層無 rename input 證據 |
| MAN-028-025 | Mobile | 390x844 | 長按任務 | 開任務操作選單，不與上下捲動或拖曳互相誤觸 | 長按後截圖 |
| MAN-028-026 | 四模式 | 1440x900 / 1024x768 / 390x844 | Visible error sweep | 無 visible runtime error、無不可預期空白、無水平 overflow | 每個 viewport 截圖與 DOM/text 檢查紀錄 |
| MAN-028-027 | 四模式 / 浮層 | 1440x900 | 開啟任務詳情後按 ESC；任務詳情內開標籤 picker 後按 ESC；開啟分享看板、全域確認、紀錄說明、過濾器 panel、AI 快捷問題、心智圖關聯線樣式 drawer 後按 ESC | ESC 只關閉最上層暫時性 UI；有子浮層時先關子浮層，不穿透關父層 | 操作錄影或逐步截圖 |
| MAN-028-028 | 看板 / Mobile | 390x844 | 在任務卡主體與子任務列上短滑 | 依 DEV-029，不開詳情、不進 rename、不出現 context menu 或 drag preview；使用者不需找卡片縫隙才能移動畫面 | 短滑前後截圖或錄影、modal/menu/rename/drag negative evidence |

## FMEA 風險表

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 建議測試 |
|---|---|---|---|---|---|
| 單擊任務仍直接改名 | 舊 title input handler 未完全移除 | 使用者閱讀或移動畫面時誤改名稱 | MAN-028-003、013、title click 錄影 | P0 | 四模式 title click 均需人工點擊驗證 |
| 外層 rename 入口殘留 | 鉛筆、F2、`t`、右鍵重新命名、直接打字流程未移除 | 操作手勢仍不統一，手機長按與桌機快捷鍵造成誤改名 | MAN-028-005、009、017、024 | P0 | 外層 task surface 必須驗證無 rename input / 無重新命名 menu item |
| 詳情頁標題不可辨識為可編輯 | 標題仍像純文字、hover/focus 不明確 | 使用者找不到唯一改名入口 | MAN-028-006、017、024 | P0 | 詳情頁標題需截圖證明可編輯 affordance |
| 單擊任務未開詳情 | event listener 生命週期或 target guard 錯誤 | Trello-like 心智模型失效 | MAN-028-001、007、012、018 | P0 | 四模式逐一點擊任務本體 |
| 關閉詳情後 selected 狀態消失 | selected state 未共用或被 local selection 覆蓋 | 使用者失去操作位置 | MAN-028-002、008、023 | P0 | 關閉 modal 後截圖保留 selected ring |
| 互動控制誤開詳情 | guard 未辨識箭頭、狀態、日期、依賴、drag handle | 使用者點控制時被 modal 打斷 | MAN-028-004、021 | P0 | 每種互動控制都要親自點 |
| 心智圖鍵盤能力被 Trello 化覆蓋 | 共用 keymap 未保留模式差異 | 破壞 Xmind 使用者肌肉記憶 | MAN-028-008、009 | P0 | `Enter`、`Tab`、方向鍵、直接打字逐項驗證 |
| 右鍵仍進入關聯線模式 | 舊心智圖右鍵流程殘留 | 任務操作選單不可預期，關聯線誤觸 | MAN-028-010、011 | P0 | 右鍵節點與關聯線入口分開驗證 |
| 看板資訊被不小心降噪 | 實作誤套前一版優化建議 | 使用者明確排除需求被違反 | MAN-028-015 | P0 | 卡片正面資訊與 Level 3+ 必拍截圖 |
| 甘特 drag/resize 後誤開詳情 | click-after-drag 判斷不足 | 排程操作被 modal 打斷 | MAN-028-020 | P0 | 拖曳與 resize 操作需錄影或前後截圖 |
| mobile 長按/捲動/命名互相干擾 | coarse pointer flow 與 scroll owner 未分離 | 手機使用者難以操作 | MAN-028-023、024、025、028 | P1 | 390x844 親自長按、捲動、新增命名與任務卡主體短滑 |
| visible runtime error 被自動化忽略 | 只看測試命令未看實際畫面 | 使用者看到錯誤仍被判定通過 | MAN-028-026 | P0 | 每個 viewport 執行 visible error sweep |
| ESC 關閉行為穿透 | 多個 window/document keydown listener 沒有 topmost guard | 使用者想關子選單卻關掉整個任務詳情或工作流 | MAN-028-027 | P0 | 子浮層與父 modal 巢狀場景必測 |

## Acceptance Criteria Traceability

| ID | Acceptance Criteria | Auto Evidence | Manual Evidence | Result |
|---|---|---|---|---|
| AC-028-001 | 四模式單擊既有任務都選取並開 `TaskDetailsModal` | `verify:dev-028-cross-mode-task-interactions-browser` | MAN-028-001、007、012、018 | Manual Pending |
| AC-028-002 | 四模式關閉詳情後保留 selected highlight / ring | browser smoke selected retention | MAN-028-002、008、023 | Manual Pending |
| AC-028-003 | 單擊任務名稱不直接 rename | static/browser smoke | MAN-028-003、013 | Manual Pending |
| AC-028-004 | 改名只能在任務詳情頁 title edit 觸發；外層任務 surface 不提供 rename | static verifier + keyboard/context menu smoke | MAN-028-005、006、017、024 | Manual Pending |
| AC-028-005 | 心智圖保留 `Enter` 新增同階、`Tab` 新增子階與方向鍵導航，但直接打字不得進入外層 rename | DEV-027B/027E regression | MAN-028-008、009 | Manual Pending |
| AC-028-006 | 右鍵/長按為任務操作選單，心智圖關聯線入口改走明確 action | DEV-027E regression | MAN-028-010、011、025 | Manual Pending |
| AC-028-007 | 看板 Level 3+ 與卡片正面資訊密度保留 | static verifier | MAN-028-014、015 | Manual Pending |
| AC-028-008 | 甘特 click 與 drag/resize 互斥 | browser smoke | MAN-028-018、019、020 | Manual Pending |
| AC-028-009 | Desktop / laptop / mobile viewport 無 visible runtime error、重疊、裁切、非預期 overflow | lint/build/browser smoke | MAN-028-022、023、026 | Manual Pending |
| AC-028-010 | ESC 可關閉最上層暫時性 UI，且不穿透關閉父層 | `verify:dev-028-cross-mode-task-interactions-browser` | MAN-028-027 | Manual Pending |
| AC-028-011 | DEV-029 實作後，手機任務卡與子任務列短滑採 pan-first，不誤開詳情或任務功能 | `verify:dev-029-mobile-pan-first-interactions-browser` | MAN-028-028 | Not Authorized / Pending |

## 四模式手動驗證矩陣

### 清單

- 點任務列與點任務名稱都應選取任務並開啟 `TaskDetailsModal`。
- 點展開箭頭只展開/收合，不開詳情。
- 點狀態、負責人、日期、依賴控制時，只執行該控制，不開詳情。
- 清單外層不得提供鉛筆、右鍵重新命名、`t`、F2、雙擊標題或直接打字 rename。
- 需要改任務名稱時，必須先開啟 `TaskDetailsModal`，再在詳情頁任務名稱區編輯。
- 桌機與手機新增任務後若需要命名，應導向詳情頁 title edit；不得在清單列外層開 rename input。

### 心智圖

- 單擊節點選取該節點並開啟 `TaskDetailsModal`。
- 關閉詳情後，原節點仍選取，方向鍵可繼續導航。
- `Enter` 仍新增同階任務，`Tab` 仍新增子階任務。
- 詳情未開啟且節點已選取時，直接打字不得進入節點外層 rename。
- 右鍵或長按節點開任務操作選單，但選單不得提供「重新命名」外層入口。
- 需要改任務名稱時，必須先開啟 `TaskDetailsModal`，再在詳情頁任務名稱區編輯。
- 關聯線建立改從 toolbar、快捷鍵或 selected-node action 進入；關聯線模式中不得誤開詳情。

### 看板

- 單擊卡片與卡片內下層任務都選取任務並開啟 `TaskDetailsModal`。
- 單擊卡片標題不直接改名；看板卡片、L3+ 待辦列與工作台任務列不得提供鉛筆、右鍵重新命名、`t`、F2、雙擊標題或直接打字 rename。
- 需要改任務名稱時，必須先開啟 `TaskDetailsModal`，再在詳情頁任務名稱區編輯。
- Level 3+ 下層任務仍顯示在卡片正面。
- 卡片正面的日期、依賴、標籤、進度等既有資訊仍保留。
- 桌機卡片拖曳與點擊開詳情互斥；拖曳後不得打開詳情。
- 手機短滑依 DEV-029 優先 pan，不得開詳情、rename、context menu 或 drag；長按或拖曳把手不得和上下捲動互相誤觸。
- 會議紀錄任務選取模式下，點卡片仍以插入 task mention 為優先。

### 甘特

- 單擊任務條與左側任務列都選取任務並開啟 `TaskDetailsModal`。
- 任務條拖曳與左右 resize 仍只改排程，不開詳情。
- 左側展開箭頭只展開/收合，不開詳情。
- `Enter` 在非輸入聚焦且任務已選取時開詳情。
- 手機或粗指標環境不得出現排程拖曳與詳情開啟互相誤觸。

## 自動化 Gate

RD 必須新增或更新以下 verifier:

```powershell
npm.cmd run verify:dev-028-cross-mode-task-interactions
npm.cmd run verify:dev-028-cross-mode-task-interactions-browser
npm.cmd run verify:dev-028-manual-click-qc-readiness
```

DEV-028 完成前必須同時通過:

```powershell
npm.cmd run verify:dev-027b-xmind-interaction-polish-browser
npm.cmd run verify:dev-027e-xmind-note-relationship-line-ux-parity-browser
npm.cmd exec tsc -- --noEmit
npm.cmd run lint -- --quiet
npm.cmd run build:test
```

## RD 自動化驗證結果 - 2026-06-26

以下結果只能作為 QA/QC 輔助證據，不取代 `人工親自點擊測試矩陣`:

- `npm.cmd run verify:dev-028-cross-mode-task-interactions`: Pass, 29/29
- `npm.cmd run verify:dev-028-cross-mode-task-interactions-browser`: Pass

## RD 自動化驗證結果 - 2026-07-06 Detail-Only Title Edit Addendum

以下結果只能作為 QA/QC 輔助證據，不取代 `人工親自點擊測試矩陣`:

- `npm.cmd run verify:dev-028-cross-mode-task-interactions`: Pass, 35/35
- `npm.cmd run verify:dev-028-cross-mode-task-interactions-browser`: Pass
- `npm.cmd run verify:dev-028-manual-click-qc-readiness`: Pass, read-only readiness gate；確認 MAN-028-001 至 MAN-028-028、證據欄位、viewport、visible error sweep 與「自動化不得取代人工」邊界未被改壞。
- `npm.cmd run verify:dev-027b-xmind-interaction-polish`: Pass, 32/32
- `npm.cmd run verify:dev-027b-xmind-interaction-polish-browser`: Pass
- `npm.cmd run verify:dev-027e-xmind-note-relationship-line-ux-parity-browser`: Pass
- `npm.cmd run verify:dev-029-mobile-pan-first-interactions`: Pass, 32/32
- `npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser`: Pass
- `npm.cmd exec tsc -- --noEmit`: Pass
- `npm.cmd run build:test`: Pass
- `npm.cmd run lint -- --quiet`: Not passed due pre-existing unrelated lint failures in `scripts/verify-dev-040-production-auth-ui-smoke.mjs`, `scripts/verify-dev-043-system-page-exit-browser.pw.js`, and `src/components/BoardView.tsx`.
- `npm.cmd run verify:dev-027b-xmind-interaction-polish-browser`: Pass
- `npm.cmd run verify:dev-027e-xmind-note-relationship-line-ux-parity-browser`: Pass
- `npm.cmd exec tsc -- --noEmit`: Pass
- `npm.cmd run lint -- --quiet`: Pass
- `npm.cmd run build:test`: Pass

## QC Handoff Evidence

QC 報告至少需附:

- 人工操作者、日期時間、瀏覽器、URL、viewport 與測試資料說明。
- MAN-028-001 至 MAN-028-028 的逐項 pass/fail 表；未執行項必須標 `Not Executed`，不得空白帶過。
- 四模式單擊開同一 `TaskDetailsModal` 的 DOM selector evidence。
- 四模式關閉詳情後保留 selected task 的 DOM state 或 screenshot evidence。
- 清單、看板、甘特 `Enter` 開詳情，以及心智圖 `Enter` 新增同階的 keyboard trace。
- 詳情頁任務名稱區可編輯視覺、點擊進入 title edit、儲存 / 取消或失焦策略的截圖或錄影。
- 桌機與手機新增任務後導向詳情頁 title edit 的證據；外層任務列 / 卡片不得出現 rename input。
- 右鍵/長按四模式任務操作選單截圖，且選單不得包含「重新命名」外層入口。
- 心智圖關聯線新入口截圖或 DOM evidence。
- 看板 Level 3+ 與卡片正面資訊保留截圖。
- 甘特拖曳/resize 後不開詳情的 trace。
- Desktop 與 390x844 mobile viewport visible-error sweep。
- 若任一人工親自點擊案例未通過，QC 結論必須是 `未通過`，不可用自動化 pass 覆蓋。
- 若缺少人工點擊截圖、錄影或逐項紀錄，QC 結論必須是 `未充分驗證`。

## Manual Click QC Readiness Gate

```powershell
npm.cmd run verify:dev-028-manual-click-qc-readiness
```

此 gate 預設只讀、`mutates_database=false`、`manual_qc_completed=false`。它只檢查 manual matrix 與 QC handoff 是否完整，不代表 MAN-028-001 至 MAN-028-028 已由人類實際操作通過。若此 gate 通過但人工操作未執行，DEV-028 仍維持 `Manual Click QC Pending`。
