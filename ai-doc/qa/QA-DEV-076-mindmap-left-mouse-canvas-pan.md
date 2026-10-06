# QA-DEV-076：心智圖左鍵抓取畫布平移

狀態：Reverted / 歷史驗證紀錄 / 不再執行
對應規格：`ai-doc/specs/SPEC-076-mindmap-left-mouse-canvas-pan.md`
證據層級：local test runtime / desktop Chromium / 未 Release

DEV-076 已依使用者 2026-09-03 指示撤回；以下內容僅保留原始驗證證據，不代表現行產品驗收。

## 1. 驗證範圍與環境

- Route：`http://127.0.0.1:4000/`，local-test account，切換至心智圖。
- Viewport：1440x900、1024x768；390x844 只驗證既有 mobile boundary 不被側向開放。
- 必要證據：pure/static summary、真實 mouse trace、scroll 前後值、state/cursor、selection、world path/recompute、console/page/visible-error arrays 與 screenshot。
- Build、TypeScript、lint 只能作輔助證據，不能取代 rendered interaction QC。

## 2. FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 建議測試 |
|---|---|---|---|---|---|
| 節點起手也啟動 canvas pan | blocked selector 不完整 | 無法拖節點、選取或快速命名 | node pointerdown + state/scroll trace | P0 | 明確 blocked-target negative case |
| 有效 pan 後仍派送 click | click suppression lifecycle 錯誤 | selection 被意外清除 | 預選 task 後 blank pan | P0 | active-only click capture |
| 小移動也被當 pan | threshold 錯誤 | 普通空白點擊失效 | 2px drag / click trace | P1 | 6px pure boundary test |
| pan dirty world geometry | 錯把 pan 寫入 scene transform | 線與節點漂移、效能退化 | path/recompute 前後比對 | P0 | 只寫 viewport scroll |
| cursor ownership 殘留 | cancel/blur/unmount cleanup 缺漏 | 全頁持續 grabbing | pointercancel/blur cleanup | P1 | body attribute hard gate |
| touch/middle pan 回歸 | 共用錯誤 state 或 CSS | 手機與既有手勢失效 | negative boundary + regression | P0 | pointerType 與 state 分離 |
| 捲軸或 control 被攔截 | scrollbar/control guard 不足 | 無法操作原生控制項 | blocked target matrix | P1 | native scrollbar zone + semantic controls |
| 畫面可見錯誤或雙 scroll owner | shell wiring 錯誤 | 畫布不可用 | DOM count、screenshot、error sweep | P0 | visible-error hard gate |

## 3. Test Cases

| ID | 前置條件 / 操作 | 預期結果 | 證據 |
|---|---|---|---|
| QA-076-001 | pure state：0、5.99、6、正負兩軸位移 | 6px 前 armed；達 6px active；公式精確 | static/pure output |
| QA-076-002 | 1440x900，選取 task 後從空白向左上拖 120x80 | scroll 各增加約 120/80；active/grabbing；selection 保留 | metrics + screenshot |
| QA-076-003 | 1024x768 重做雙軸 pan | 方向、門檻、selection 與 layout 皆通過 | metrics + screenshot |
| QA-076-004 | 選取 task 後空白只移動 2px 並放開 | 不進 active；既有 blank click 清除 selection | state + selected count |
| QA-076-005 | task node、center、toggle、relationship/control 起手 | left-pan state 不進 armed/active；原 owner 仍可用 | blocked matrix |
| QA-076-006 | pan 前後比對 connector `d`、relationship storage、task snapshot、recompute count | 全部不變 | before/after JSON |
| QA-076-007 | active 時 pointercancel／window blur | state idle；body 無 active attr；下一次點擊正常 | lifecycle trace |
| QA-076-008 | 既有中鍵 velocity pan | telemetry/mode 與位移仍通過 | DEV-027B regression |
| QA-076-009 | 390x844 | 心智圖 mobile boundary 不被改變，無 visible error | viewport evidence |
| QA-076-010 | 全流程 console/page/DOM error sweep | arrays 為 0；`.inline-error`、`[role=alert]` 等無非預期可見錯誤 | artifact |

## 4. Pass / Fail Gate

全部 `AC-076-001`～`007` 與 QA-076-001～010 必須通過；任何 P0 FMEA、資料寫入、geometry dirty、owner 漂移、visible error、body cursor 殘留或缺少真實 rendered evidence，均不得判定通過。

QC 只執行事實驗證與收集證據；若失敗，記錄第一個有效錯誤、viewport、起手 target、pointer delta、scroll/state/selection/path 前後值與 screenshot，回送 RD 修正後再重跑相關 case。

## 5. 執行命令

```powershell
npm.cmd run verify:dev-076-mindmap-left-mouse-pan
npm.cmd run verify:dev-076-mindmap-left-mouse-pan-browser
npm.cmd run verify:dev-074-mindmap-single-scene
npm.cmd run verify:dev-075-mindmap-keyboard-performance
npm.cmd run verify:dev-073-task-title-edit-defaults
npm.cmd run verify:dev-027b-xmind-interaction-polish
npm.cmd exec tsc -- -b --pretty false
npm.cmd exec eslint -- src/components/MindMap/MindMapView.tsx src/components/MindMap/MindMapCanvasShell.tsx src/components/MindMap/mindMapPan.ts
npm.cmd run build:test
```

若 browser gate 啟動 local runtime，必須先記錄 project、purpose、port、owner process tree 與 cleanup condition；完成後只停止本任務啟動的 runtime，並確認 port 已釋放。若 4000 已由同專案 primary runtime 持有，重用且不得停止。

## 6. 執行結果（2026-08-20）

歷史 QC 結論（撤回前）：`PASS`。適用邊界為 local-test runtime、desktop Chromium 1440x900／1024x768 與 390x844 mobile negative boundary；未執行 deploy／production smoke；不代表現行產品驗收。

- DEV-076 pure/static：12/12 PASS；6px threshold、兩軸 direct formula、blocked selectors、click suppression、cursor cleanup、SPEC-074 與 package wiring 均通過。
- DEV-076 rendered browser：兩個桌機 viewport 均以 pointer `-120/-80` 得到 scroll `+120/+80`，誤差 0；`armed -> active -> idle`、grab/grabbing、selection preservation、2px blank click、pointercancel cleanup 均通過。
- Interaction owner：task node、center topic、collapse toggle 與 relationship-tool-active 空白背景均不啟動 left pan；DEV-027B browser 另驗證 relationship 操作、node drag 與 middle velocity pan 未回歸。
- Geometry/data：兩個 viewport 的 connector／relationship world path、`data-mindmap-recompute-count`、task storage 與 relationship storage 前後一致；scroll owner 固定為 1。
- Viewport/error：1440／1024 截圖目視無重疊、裁切、斷裂與 document overflow；390x844 維持 mindmap 不渲染邊界且 overflow=0；console/page/network/visible errors 全為 0。
- Regression：DEV-074、075、073、027B static 全綠；DEV-027B browser PASS；TypeScript、targeted ESLint、`build:test` PASS。
- Artifact：`output/playwright/dev-076-mindmap-left-mouse-pan/result.json`，以及同目錄 desktop/laptop active/final 與 mobile boundary screenshots。
- Runtime：重用同專案既有 primary port 4000（listener PID 42856）；本輪未啟動或停止 server，沒有新增 cleanup obligation。
