# QA-DEV-071：心智圖選取與明細入口差異

- 關聯 DEV：DEV-071
- 規格：`SPEC-070` DEV-071 Product Re-entry、`SPEC-028` DEV-071 Addendum
- QA 狀態：Execution Complete
- QC 狀態：Functional PASS / 未 Release
- Spec Impact：`Intentional replacement`
- Execution Boundary：只驗證本機 `127.0.0.1:4000` 與前端 task interaction；不執行 deploy、merge、production 或 remote data mutation。

## 1. UX Intent

- 使用者與情境：在心智圖掃描階層、選取節點、建立關聯或拖曳時，單擊不應被明細視窗打斷。
- 主要任務與成功結果：單擊選取；Enter／Tab 建立任務但保持畫布不中斷；雙擊或右鍵「開啟明細」查閱／編輯任務詳情。
- 熟悉 pattern：畫布節點單擊選取、雙擊開啟；context menu 承載低頻明細入口。
- 不能發生的誤操作：單擊誤開 modal、右鍵開錯 task、其他模式被套用 mindmap 行為、選單繞過既有 task target snapshot。
- viewport：1440x900 主要 desktop；看板 1440x900 做 cross-mode negative regression。

## 2. Acceptance Criteria

| ID | 驗收條件 | 結果 |
|---|---|---|
| QA-071-001 | 心智圖 `pointer.primary` resolve 為 `task.select`，source layer=`host-mode` | PASS |
| QA-071-002 | 心智圖單擊只留下 `aria-selected="true"`，不出現 `TaskDetailsModal` | PASS |
| QA-071-003 | 心智圖 `pointer.double` resolve 為 `task.open-details` | PASS |
| QA-071-004 | 心智圖雙擊開啟正確 `data-task-id` 的 `TaskDetailsModal` | PASS |
| QA-071-005 | 心智圖右鍵 menu 顯示唯一 `data-task-action-id="task.open-details"`，文案為「開啟明細」 | PASS |
| QA-071-006 | 右鍵「開啟明細」開啟右鍵事件快照指定 task，不依賴目前 view 推測 | PASS |
| QA-071-007 | 看板單擊仍開明細；看板 menu 不新增「開啟明細」 | PASS |
| QA-071-008 | 心智圖選取節點後按 `Enter` 建立同階任務，`TaskDetailsModal` 維持關閉 | PASS |
| QA-071-009 | 心智圖選取節點後按 `Tab` 建立子任務，`TaskDetailsModal` 維持關閉 | PASS |
| QA-071-010 | console/page error=0，沒有可見錯誤、裁切或遮擋 | PASS |

## 3. FMEA

| Failure mode | Cause | Effect | S | O | D | RPN | Control／evidence | Result |
|---|---|---|---:|---:|---:|---:|---|---|
| 單擊仍開明細 | node 未走 Host Profile 或仍直接呼叫 open | 掃描／選取被 modal 打斷 | 8 | 3 | 2 | 48 | resolver static + browser single click | Closed |
| 雙擊未開或開錯明細 | double trigger 未綁定或 task target 不一致 | 使用者無法查閱指定節點 | 8 | 2 | 3 | 48 | resolver + modal `data-task-id` browser assertion | Closed |
| 右鍵選單缺少明細入口 | navigation action 無法被 profile include 或 menu renderer 忽略 | 使用者只能依賴雙擊，低發現性 | 6 | 3 | 2 | 36 | menu action ID／label browser assertion | Closed |
| 其他模式被污染 | 修改 Base Profile 或 default menu | 看板／清單操作契約回歸 | 9 | 2 | 2 | 36 | board negative resolver/menu + browser click | Closed |
| 右鍵開錯 task | menu 使用 currentView／selected task 推測 | 編輯錯誤任務 | 9 | 2 | 2 | 36 | interactionLocation／nodeId snapshot + target assertion | Closed |
| Enter／Tab 新增後誤開明細 | post-create 仍無條件呼叫 `prepareNewTaskNaming()` | 鍵盤連續建立被 modal 打斷 | 7 | 4 | 2 | 56 | keyboard browser assertion + `openDetailsForNaming=false` static check | Closed |
| relationship／drag 被雙擊攔截 | node surface 未保留 transient precedence | 建立關聯或拖曳誤開 modal | 8 | 2 | 3 | 48 | existing DEV-027B/DEV-028 regression boundary | Residual regression watch |

## 4. Executed Evidence

| Evidence | Command / route | Result |
|---|---|---|
| Static resolver/menu | `npm.cmd exec tsx scripts/verify-dev-071-mindmap-selection-details.ts` | PASS；mindmap primary=`task.select`、double=`task.open-details`、menu include；board 維持原值 |
| Rendered browser | Playwright `scripts/verify-dev-071-mindmap-selection-details-browser.pw.js`，`http://127.0.0.1:4000/`，1440x900 | PASS；單擊 selection-only、Enter／Tab 新增後 modal 關閉、雙擊／右鍵開正確明細、board click 不回歸、console errors=0 |
| Required regression | `node scripts/verify-dev-028-cross-mode-task-interactions.mjs` | PASS 45/45 |
| TypeScript | `npm.cmd exec tsc -- --noEmit` | PASS |
| Test build | `npm.cmd run build:test` | PASS；Vite 2012 modules，PWA service worker generated |

### Regression note

`DEV-027B` static gate 32/32 仍通過；本輪完整 browser verifier 兩次嘗試未納入 PASS：第一次在新增測試節點命名流程遇到既有 timing race，第二次在 relationship tool fixture 等待逾時。這不改變 DEV-071 targeted browser PASS，但 DEV-027B relationship／drag full browser evidence 保持 `Residual regression watch`，不可宣稱全回歸已關閉。

## 5. Stop Conditions / Release Boundary

- 任一模式的單擊、雙擊、右鍵 target、permission、relationship／drag 或 modal identity 漂移，回 RD 修 Host Mode Profile／surface adapter。
- 本地 Functional PASS 不等於 Merge／Release Ready；未執行 deploy、production smoke、remote provider 或正式資料操作。
- DEV-069 與其他 dirty worktree 修改不屬 DEV-071 commit，須由 Git boundary 另行分類。

## 契約更新註記（DEV-073）

DEV-073 曾暫時取消心智圖單擊 inline title edit，使用者本輪又明確將其恢復，且限定於心智圖 fine pointer。現行 resolver 仍保留 DEV-071 的 `pointer.primary → task.select`，但 host side effect 改為「立即選取 + 雙擊判定後進入 XMind 式 quick-title」；直接打字後按一次 Enter 保存並離開、不建立新任務，按一次 Tab 保存並建立子任務。雙擊／右鍵明細與非心智圖詳情 title edit 不變；現行驗收以 `SPEC-073`／`QA-DEV-073` 為準。
