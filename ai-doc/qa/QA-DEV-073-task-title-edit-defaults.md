# QA-DEV-073：心智圖 XMind 式快速命名驗證計畫

- 開發點：DEV-073
- 需求來源：`USER-20260818-TASK-TITLE-EDIT-DEFAULTS`
- 規格：`SPEC-073-task-title-edit-defaults.md`
- 測試類型：心智圖 post-create／fine-pointer quick naming、Enter／Tab 提交邊界、Delete／Backspace 編輯保護、草稿寬度與連線重排、雙擊仲裁、非心智圖負向回歸
- QA 執行範圍：local runtime 的功能案例；正式發布與 production data 操作分列於 §5，不以發布結果代替本地功能驗證

## 1. FMEA

| 失效模式 | 影響 | S | O | D | RPN | 預防／檢出 |
|---|---|---:|---:|---:|---:|---|
| 心智圖新增後開啟 TaskDetailsModal | 新增流程被明細打斷，與產品決策不符 | 8 | 3 | 2 | 48 | browser assert modal=0；MindMapView 不呼叫 `openDetailsForNaming` |
| 心智圖新增後沒有 quick-title input 或未聚焦 | 使用者仍需額外點擊才能命名 | 7 | 3 | 3 | 63 | root／Enter／Tab browser marker、focus assertion |
| Enter 誤建立同階任務 | 使用者完成命名時產生非預期重複任務 | 9 | 3 | 2 | 54 | browser 單次 Enter 後 node count 不變、quick-title 離開 assertion |
| Tab 建立層級錯誤 | 子階建立到錯誤 parent，破壞心智圖結構 | 9 | 2 | 2 | 36 | `data-mindmap-parent-id` browser assertion |
| blur 與 key handler 雙重執行 | 一次按鍵建立兩個任務或重複保存 | 9 | 2 | 3 | 54 | action-handled guard + node count exactly +1 |
| IME 組字 Enter 誤建立任務 | 中文尚未完成即增加任務 | 8 | 3 | 3 | 72 | composition guard static assertion |
| blur／Escape 結果錯誤 | 標題遺失、無法取消或意外新增 | 8 | 2 | 3 | 48 | persist/cancel assertions |
| 心智圖細滑鼠單擊未進入 quick-title | 使用者仍需額外動作才能改名 | 7 | 4 | 2 | 56 | single-click browser assert selected + modal=0 + quick input=1 + focus |
| 單擊立即替換 DOM 導致雙擊失效 | 無法用既有雙擊入口開明細 | 8 | 3 | 3 | 72 | cancellable 240ms arbitration + browser dblclick target assertion |
| pending click timer 改到 stale node | 快速切換節點後編輯錯誤任務 | 9 | 2 | 3 | 54 | selection/context/surface/unmount cancel boundary |
| quick-title 滿版或攔截 pointer | 節點無法同時快速拖曳與快速命名 | 8 | 3 | 3 | 72 | rendered DOM width／selection／pointer-events／draggable assertion |
| 長標題草稿未擴張節點或連線端點未跟隨 | 編輯文字遭裁切或連線脫離節點 | 7 | 3 | 2 | 42 | browser 量測草稿文字寬度、節點寬度、連線端點、縮短與 Escape 還原 |
| quick-title 內 Delete／Backspace 誤封存任務 | 編輯名稱時可能連同任務一起刪除 | 9 | 3 | 2 | 54 | focused input 與 armed-node browser cases；驗證文字刪除、空字串及節點數不變 |
| 雙擊／右鍵明細 target 錯誤 | 使用者編輯錯任務 | 9 | 2 | 2 | 36 | modal `data-task-id` 與 context snapshot assertion |
| 非心智圖被套用 inline editor | 看板／清單／甘特既有命名契約回歸 | 9 | 2 | 2 | 36 | base profile／`prepareNewTaskNaming` static negative boundary、DEV-028 regression |
| relationship／唯讀／觸控／拖曳 focus 邊界回歸 | 專用模式、權限或 mobile pan-first 被繞過 | 8 | 2 | 4 | 64 | fine/coarse split + existing DEV-071/028 regression |

## 2. 驗證案例

| Case | 驗證 | 通過條件 | 證據 |
|---|---|---|---|
| QA-073-001 | mindmap root post-create | toolbar 新增後新節點 quick-title input 唯一、可直接打字、focus、modal=0 | DEV-073 browser verifier／MindMapNode marker |
| QA-073-002 | quick naming Enter | 按一次即保存目前名稱、node count 不變、quick-title 離開、不得建立同階或開啟明細 | DEV-073 browser verifier |
| QA-073-003 | quick naming Tab | 按一次即保存目前名稱、node count +1、建立子任務、parent 正確並維持 quick-title focus | DEV-073 browser verifier |
| QA-073-004 | lifecycle guards | Escape 不新增；blur 只保存一次；IME composition Enter 不建立 | static verifier + targeted browser |
| QA-073-005 | mindmap existing fine pointer | 單擊選取並進入 quick-title、focus、modal=0；直接輸入可替換，Escape 取消草稿 | DEV-073 browser verifier |
| QA-073-006 | pointer arbitration | 快速雙擊不被單擊 quick-title DOM 切換攔截，仍開啟同一 task details | DEV-073 browser verifier |
| QA-073-007 | non-mindmap／coarse negative boundary | Base `task.post-create` 仍為 `task.open-details-for-naming`，既有入口保留 `prepareNewTaskNaming`；其他模式與 coarse pointer 無 quick-title wiring | DEV-073 static verifier、DEV-028 regression |
| QA-073-008 | build／type／runtime | TypeScript、build、既有跨模式靜態驗證通過；protected 4173 不受影響 | regression commands |
| QA-073-009 | XMind visual／drag parity | quick-title 不滿版、反白透明、輸入層不攔 pointer，節點仍可拖曳 | DEV-073 browser verifier／rendered DOM evidence |
| QA-073-010 | live draft sizing | 中文／全形長草稿超過閱讀寬度上限時節點跟著擴張，輸入完整可讀且連線端點貼齊；縮短可收窄，Escape 還原已保存寬度 | DEV-073 browser verifier／text range、node bbox、connector endpoint |
| QA-073-011 | title-edit Delete／Backspace | 編輯中的 Delete／Backspace 只改文字；刪至空白及 armed node 時任務仍存在；離開編輯後原封存快捷鍵仍可用 | DEV-073 browser verifier／input value、node count |

## 3. 執行命令

```text
npm.cmd run verify:dev-073-task-title-edit-defaults
npm.cmd run verify:dev-073-task-title-edit-defaults-browser
npm.cmd exec tsx scripts/verify-dev-071-mindmap-selection-details.ts
node scripts/verify-dev-028-cross-mode-task-interactions.mjs
npm.cmd exec tsc -- --noEmit
npm.cmd run build:test
```

## 4. QC 結果

- DEV-073 static verifier：PASS；確認非心智圖仍使用 shared details naming；心智圖 quick-title 具 Enter commit-only、Tab child、IME composition、fine/coarse split、click arbitration 與 host continuation wiring。
- DEV-073 browser verifier：PASS；1440x900、0 console error；toolbar 建立後可直接輸入，Enter 一次保存並離開且 node count 不變，Tab 一次保存並建立子任務，層級與 focus 正確且 modal=0；細滑鼠單擊進入 quick-title、Escape 取消草稿，快速雙擊仍開 details，快速切換節點只由最新 selection 進入命名；DOM 證據確認輸入不滿版、中文標題可容納、選取前後節點不縮小、反白透明、`pointer-events=none` 且節點仍 draggable。
- 2026-11-10 follow-up browser cases：PASS；長草稿超出閱讀寬度時節點與連線跟隨、縮短後收窄、Escape 還原；Delete／Backspace 在輸入框或尚未聚焦的 armed node 不封存任務，離開編輯後仍可使用原封存快捷鍵。
- DEV-071 static／browser：PASS；`pointer.primary` 仍解析為 shared `task.select`，由 DEV-073 mindmap host adapter 增加 quick-title side effect；雙擊／右鍵開正確明細，看板單擊仍開明細。
- DEV-028 static regression：45/45 PASS。
- TypeScript：PASS。
- `build:test`：PASS。
- `127.0.0.1:4173` protected runtime 與既有 `127.0.0.1:4000` temporary runtime 維持 listening。

## 5. Release boundary

本地驗證 PASS 不等於正式功能驗收。程式 commit `a87733f` 已合併並推送至 local／remote `main`；sealed artifact `20261110091307-66cb3f` verifier PASS，已部署至 Firebase Hosting live，`release-meta.json` 讀回同一 release id 與 source commit。direct receipt `published:true`、`complete:false`／`feature-pending`；尚未執行 production feature-specific smoke，亦未修改正式任務資料。通用瀏覽器煙霧檢查不能替代本功能驗收；若要完成 DEV-073 正式驗收，需另以不改正式業務資料的方式覆蓋階層移動、Delete／Backspace 編輯保護、長草稿寬度與連線重排，再依 DEV-083 用 `--verify-only` 更新收據。若單擊未進入 quick-title、雙擊失效、stale timer 改錯節點、Enter 誤建立任務、Tab parent 錯誤、一次建立多個任務、IME Enter 誤觸、任一非心智圖／coarse pointer 出現 quick-title，或心智圖新增／單擊開啟 modal，立即停止並回 RD 修正 surface adapter，不以測試例外掩蓋行為漂移。
