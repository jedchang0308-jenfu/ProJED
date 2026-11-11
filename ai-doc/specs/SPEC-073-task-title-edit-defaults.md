# SPEC-073：心智圖 XMind 式快速命名

- 狀態：Implemented / Local QA-QC PASS / 未 Release
- 開發點：DEV-073
- 原始需求：`USER-20260818-TASK-TITLE-EDIT-DEFAULTS`
- Spec Impact：`Intentional replacement / mindmap-only exception`
- 取代邊界：心智圖新增後開啟快速命名。單擊既有任務只選取，選取後打字才開啟快速命名。清單、看板、甘特、Workbench、Shared Sidebar 等其他模式沿用 `TaskDetailsModal` title edit。

## 1. UX Intent

- 心智圖建立根任務、同階任務、子任務或細滑鼠單擊既有節點後，可直接打字取代「新任務」；編輯表面必須貼合節點文字、維持左圖的緊湊節點外框，不呈現右圖的滿版輸入框或藍色反白。
- 快速命名完成時，Enter 只保存目前名稱並離開，不建立新任務；Tab 保存目前名稱並建立子任務，新任務持續保持可直接輸入。
- 心智圖單擊既有節點會選取並保留任務快捷鍵。開始打字後進入快速命名。雙擊或右鍵「開啟明細」會開啟 `TaskDetailsModal`。
- 其他模式的新增後命名流程不變，仍由既有詳情 title input 處理。
- 快速命名須保留第一個字元。選取後的封存快捷鍵須可立即使用，名稱編輯中則由輸入框處理刪字。

## 2. 行為契約

### 2.1 心智圖 post-create

- 心智圖 toolbar 新增、鍵盤 `Enter`（既有選取狀態下建立同階）、`Tab`（子任務）建立成功後，將新節點設為 selected，並以視覺上接近節點文字的 quick-title input 接收直接輸入。
- quick-title input 自動取得焦點並選取現有標題，但選取反白需視覺隱藏。標題槽以目前草稿的單行文字寬度排版，輸入框覆蓋該槽，節點與連線隨草稿寬度調整。編輯時顯示完整標題，節點外層保持 `draggable=true`，輸入層不攔截指標拖曳。
- `Enter` 保存目前名稱並離開 quick-title；不得建立同階或其他新任務，也不得開啟任務明細。
- `Tab` 保存目前名稱、建立目前任務的子任務並讓新任務繼續快速命名；不先執行「離開編輯」步驟。
- blur 保存並離開快速命名；`Escape` 取消目前草稿並離開，不新增任務。
- 快速命名期間，`Delete` 與 `Backspace` 由文字輸入框處理，刪至空白仍保持編輯。選取任務且尚未開始編輯，或已離開編輯時，兩個鍵都執行封存並沿用權限與分支確認。
- IME composition 期間的 Enter 保留給輸入法，不得觸發保存或新增。
- 提交沿用 `getCommittedMindMapTitle` 的 trim／空值 fallback 與既有 `updateNode` 權限邊界。
- 建立後 `TaskDetailsModal` 數量必須為 0；雙擊／右鍵明細入口仍開啟正確任務。

### 2.2 其他模式 post-create

- 非心智圖模式維持 `TASK_DEFAULT_PROFILE['task.post-create'] → task.open-details-for-naming` 與 `prepareNewTaskNaming()`。
- 既有詳情 title edit 的保存、取消、權限與 modal 結果不變；不得在其他模式複製心智圖 inline editor。

### 2.3 心智圖既有節點 pointer

- `mindmap.node` 單擊 dispatch `task.select` 並讓節點保有焦點。第一個字元開啟 quick-title input、取代原名稱並將游標置於字元後。Enter、Tab、blur、Escape 與 IME 契約沿用 post-create。
- 雙擊 dispatch `task.open-details`。若節點已在 quick-title，雙擊節點先保存目前名稱再開同一任務明細。
- 右鍵選單「開啟明細」使用事件快照 task target。
- relationship mode、唯讀、coarse pointer、drag 與 mobile pan-first 維持既有邊界；上述狀態的單擊不得進入 quick-title。

## 3. 實作邊界

- 心智圖差異只放在 `MindMapView` 的 post-create／pointer-primary adapter 與 `MindMapNode` 的可控 quick-title editor；不修改共用 Base Profile 的非心智圖預設。
- 只共用 title commit／權限／資料 command；不得在清單、看板、甘特各自重寫一套心智圖互動邏輯。
- 不修改 TaskNode schema、workspace／board／permission API、後端 provider、URL 或 persisted interaction profile。
- 選取其他節點時清理舊的 quick-title input；快速命名節點收到 focus re-dispatch 時不得被錯誤 blur/commit。
- quick-title 的保存與下一個 create plan 由心智圖 host adapter 串接，必須避免 blur、keyup 或父層 keyboard handler 造成重複保存／重複建立。
- 選取與文字編輯使用各自的狀態。切換選取後，下一次輸入由目前選取的節點接收。

## 4. Acceptance Criteria

- AC-073-001：心智圖 toolbar、Enter、Tab 建立後，新節點顯示唯一 quick-title input、可直接打字、輸入框取得焦點，且 details modal=0。
- AC-073-002：快速命名按一次 Enter 即保存目前名稱並離開 quick-title；可見節點數不增加、不得建立同階任務、不得開啟明細。
- AC-073-003：快速命名按一次 Tab 即保存目前名稱並建立子任務；新任務 parent 正確且保持 quick-title focus。
- AC-073-004：blur 保存並退出；Escape 取消並退出且不新增；空白標題套用既有 fallback；IME 組字 Enter 不建立任務。
- AC-073-005：單擊既有節點後，Delete 或 Backspace 可封存。打字開啟唯一的 quick-title input，保留第一個字元。編輯期間兩鍵只刪字，清空後仍可繼續輸入，Escape 可取消草稿。
- AC-073-006：心智圖雙擊與右鍵「開啟明細」開啟正確 task details。
- AC-073-007：清單、看板、甘特、Workbench、Shared Sidebar 等非心智圖新增後仍進入既有詳情 title edit；不得出現 mindmap quick-title marker。
- AC-073-008：relationship、唯讀、coarse pointer、drag 與跨模式既有 regression 不回歸。
- AC-073-009：quick-title 視覺貼合節點文字，不滿版、不顯示反白；節點在 quick-title 狀態仍 `draggable=true`，輸入層 `pointer-events=none`。
- AC-073-010：心智圖可使用的桌面與窄視窗中，輸入中文／全形等較長標題時，節點須超過閱讀狀態的寬度上限以容納完整草稿，連線端點須跟隨節點邊緣。縮短文字或取消編輯時，節點依當前顯示文字重新排版。

## 5. Failure recovery

若封存鍵被選取狀態攔截、編輯時誤封存、第一個字元遺失、雙擊誤開編輯器、Enter 誤建立任務、Tab 建立層級錯誤或 IME Enter 誤觸，先檢查 `MindMapView` 的選取與編輯焦點，以及 `MindMapNode` 的輸入事件處理。
