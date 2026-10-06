# SPEC-073：心智圖 XMind 式快速命名

- 狀態：Implemented / Local QA-QC PASS / 未 Release
- 開發點：DEV-073
- 原始需求：`USER-20260818-TASK-TITLE-EDIT-DEFAULTS`
- Spec Impact：`Intentional replacement / mindmap-only exception`
- 取代邊界：使用者將 XMind 式快速命名限定為心智圖模式，並明確將細滑鼠單擊既有任務也納入相同狀態：選取後可直接輸入，Enter 保存並離開命名且不建立新任務；Tab 不需先離開編輯，會保存目前名稱並建立子任務。清單、看板、甘特、Workbench、Shared Sidebar 等其他模式維持原本的 `TaskDetailsModal` title edit；唯讀、relationship、drag 與 coarse-pointer 邊界不變。

## 1. UX Intent

- 心智圖建立根任務、同階任務、子任務或細滑鼠單擊既有節點後，可直接打字取代「新任務」；編輯表面必須貼合節點文字、維持左圖的緊湊節點外框，不呈現右圖的滿版輸入框或藍色反白。
- 快速命名完成時，Enter 只保存目前名稱並離開，不建立新任務；Tab 保存目前名稱並建立子任務，新任務持續保持可直接輸入。
- 心智圖細滑鼠單擊既有節點會先選取，再進入與新增後相同的快速命名；雙擊或右鍵「開啟明細」仍進入 `TaskDetailsModal`。
- 其他模式的新增後命名流程不變，仍由既有詳情 title input 處理。
- 不能發生：Enter 誤建立同階任務、Tab 建立中斷或層級錯誤、IME 組字 Enter 誤建任務、心智圖新增／單擊後開啟明細、單擊未進入快速命名、單擊 DOM 切換吃掉雙擊、其他模式或觸控被套用快速命名。

## 2. 行為契約

### 2.1 心智圖 post-create

- 心智圖 toolbar 新增、鍵盤 `Enter`（既有選取狀態下建立同階）、`Tab`（子任務）建立成功後，將新節點設為 selected，並以視覺上接近節點文字的 quick-title input 接收直接輸入。
- quick-title input 自動取得焦點並選取現有標題，但選取反白需視覺隱藏；節點原有標題槽保留在版面流中，輸入框以 absolute overlay 覆蓋該槽，不得因進入命名而放大／縮窄節點或裁切中文／全形標題，也不得撐滿節點。節點外層仍保持 `draggable=true`，輸入層不得攔截指標拖曳。
- `Enter` 保存目前名稱並離開 quick-title；不得建立同階或其他新任務，也不得開啟任務明細。
- `Tab` 保存目前名稱、建立目前任務的子任務並讓新任務繼續快速命名；不先執行「離開編輯」步驟。
- blur 保存並離開快速命名；`Escape` 取消目前草稿並離開，不新增任務。
- IME composition 期間的 Enter 保留給輸入法，不得觸發保存或新增。
- 提交沿用 `getCommittedMindMapTitle` 的 trim／空值 fallback 與既有 `updateNode` 權限邊界。
- 建立後 `TaskDetailsModal` 數量必須為 0；雙擊／右鍵明細入口仍開啟正確任務。

### 2.2 其他模式 post-create

- 非心智圖模式維持 `TASK_DEFAULT_PROFILE['task.post-create'] → task.open-details-for-naming` 與 `prepareNewTaskNaming()`。
- 既有詳情 title edit 的保存、取消、權限與 modal 結果不變；不得在其他模式複製心智圖 inline editor。

### 2.3 心智圖既有節點 pointer

- `mindmap.node` 細滑鼠單擊仍 dispatch `task.select`，由心智圖 host adapter 立即選取節點，並在雙擊判定窗後進入同一個 quick-title input；不開 modal。
- quick-title 自動 focus 並全選既有名稱；直接打字可取代名稱，Enter（保存並離開、不新增）、Tab（建立子任務並延續）、blur、Escape、IME 契約與 post-create 相同。
- 雙擊判定期間不得先替換 click target；雙擊仍 dispatch `task.open-details`。若節點已在 quick-title，雙擊 input 先保存目前名稱再開同一任務明細。
- 右鍵選單「開啟明細」使用事件快照 task target。
- relationship mode、唯讀、coarse pointer、drag 與 mobile pan-first 維持既有邊界；上述狀態的單擊不得進入 quick-title。

## 3. 實作邊界

- 心智圖差異只放在 `MindMapView` 的 post-create／pointer-primary adapter 與 `MindMapNode` 的可控 quick-title editor；不修改共用 Base Profile 的非心智圖預設。
- 只共用 title commit／權限／資料 command；不得在清單、看板、甘特各自重寫一套心智圖互動邏輯。
- 不修改 TaskNode schema、workspace／board／permission API、後端 provider、URL 或 persisted interaction profile。
- 選取其他節點時清理舊的 quick-title input；快速命名節點收到 focus re-dispatch 時不得被錯誤 blur/commit。
- quick-title 的保存與下一個 create plan 由心智圖 host adapter 串接，必須避免 blur、keyup 或父層 keyboard handler 造成重複保存／重複建立。
- 細滑鼠單擊的 quick-title request 使用單一可取消 timer（目前 240ms）保留雙擊辨識；任何新 selection、雙擊、右鍵、畫布點擊、relationship selection 或 unmount 都必須取消舊 request，避免 stale node 進入改名。

## 4. Acceptance Criteria

- AC-073-001：心智圖 toolbar、Enter、Tab 建立或細滑鼠單擊後，新節點顯示唯一 quick-title input、可直接打字、輸入框取得焦點，且 details modal=0。
- AC-073-002：快速命名按一次 Enter 即保存目前名稱並離開 quick-title；可見節點數不增加、不得建立同階任務、不得開啟明細。
- AC-073-003：快速命名按一次 Tab 即保存目前名稱並建立子任務；新任務 parent 正確且保持 quick-title focus。
- AC-073-004：blur 保存並退出；Escape 取消並退出且不新增；空白標題套用既有 fallback；IME 組字 Enter 不建立任務。
- AC-073-005：心智圖既有節點細滑鼠單擊後立即選取，並顯示唯一 quick-title input、focus 且 details modal=0；直接輸入可取代名稱，Escape 能取消草稿。
- AC-073-006：心智圖雙擊與右鍵「開啟明細」開啟正確 task details。
- AC-073-007：清單、看板、甘特、Workbench、Shared Sidebar 等非心智圖新增後仍進入既有詳情 title edit；不得出現 mindmap quick-title marker。
- AC-073-008：relationship、唯讀、coarse pointer、drag 與跨模式既有 regression 不回歸。
- AC-073-009：quick-title 視覺貼合節點文字，不滿版、不顯示反白；節點在 quick-title 狀態仍 `draggable=true`，輸入層 `pointer-events=none`。
- AC-073-010：既有任務或新增的中文／全形標題進入 quick-title 後，節點 bounding box 必須與進入前相同，僅增加 selected outline；標題文字不得被輸入框裁切，1440x900、1024x768 與 390x844 均成立。

## 5. Failure recovery

若單擊未進入快速命名、stale timer 改到錯誤節點、雙擊被 input DOM 切換吃掉、Enter 誤建立任務、Tab 建立層級錯誤、重複建立、IME Enter 誤觸、quick-title 未延續 focus、中文標題裁切或心智圖新增／單擊後開 modal，回復 `MindMapView` pointer／continuation adapter、selected-node focus guard 與 `MindMapNode` action-handled／composition guard；不得修改其他模式 Base default 來掩蓋問題。若非心智圖或 coarse pointer 出現 quick-title input，立即撤回錯誤 wiring，恢復既有模式契約。
