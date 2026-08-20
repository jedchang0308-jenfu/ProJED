# SPEC-076：心智圖左鍵抓取畫布平移

日期：2026-08-20
狀態：Implemented / QA-QC PASS / 未 Release
父層 DEV：DEV-027
原始需求：`USER-20260820-MINDMAP-LEFT-MOUSE-CANVAS-PAN`
風險：Medium
Spec Impact：`Intentional replacement / mindmap-only extension`

## 1. 目的與成功結果

桌機 fine-pointer 使用者可在心智圖的空白畫布按住滑鼠左鍵並拖曳，直接把畫面往拖曳方向移動。互動必須保留 DEV-074 的單一 viewport scroll owner 與 world geometry，不得把 pan 實作成 scene transform、節點位移或資料寫入。

可觀察成功結果：

- 空白畫布顯示 `grab`，開始有效拖曳後顯示 `grabbing`。
- 左鍵拖曳超過 6px 門檻後，viewport 的 `scrollLeft`／`scrollTop` 依指標位移直接更新；內容跟著手勢移動。
- 有效 pan 結束後不派送空白 click，因此不清除目前任務或關係線選取。
- 未超過門檻的普通空白 click 維持既有清除選取語意。

使用思考習慣：#設計思考、#溝通設計、#可驗證性

## 2. Interaction Owner 與排除區

只有心智圖 viewport 的空白背景可啟動左鍵 pan。下列目標仍由原本 owner 接管，不得啟動 canvas pan：

- 任務節點、中心主題、快速命名 input。
- 展開／收合按鈕與其互動區。
- 關係線 click target、endpoint、control point、label editor 與 style panel。
- `button`、`a`、`input`、`textarea`、`select`、`[contenteditable]`、`[role=button]`。
- viewport 原生水平／垂直捲軸區。
- relationship tool、relationship pointer drag 或 task drag 正在持有互動主權的狀態。

只接受 `button === 0` 且 `pointerType === mouse`；touch／pen 不套用本契約。SPEC-029 手機 pan-first 與 mobile mode boundary 完全不變。既有中鍵 velocity pan 保留，與左鍵 direct pan 使用獨立 transient state。

## 3. 手勢狀態與方向

狀態固定為 `idle -> armed -> active -> idle`：

1. 合法空白背景 `pointerdown` 只進入 `armed`，不立即阻止 default 或 click。
2. 任一軸位移達 6px 後進入 `active`；此後阻止 default、文字選取與事件外溢。
3. direct pan 公式：

```text
scrollLeft = startScrollLeft - (clientX - startX)
scrollTop  = startScrollTop  - (clientY - startY)
```

4. `pointerup`、`pointercancel`、window blur、component unmount 都必須回到 `idle` 並清除 body cursor ownership。
5. 只有 `active` session 要吞掉緊接著產生的 click；`armed` 未成立時不得吞 click。

## 4. 架構與資料邊界

- `MindMapCanvasShell` 只轉接 viewport `onPointerDown`，並提供穩定 DOM telemetry。
- `mindMapPan.ts` 持有 pure threshold／scroll calculation、blocked-target 與 scrollbar guard。
- `MindMapView` 持有 ephemeral gesture refs、window lifecycle、click suppression 與 telemetry；不得用高頻 React state 驅動 pan。
- pan 只修改唯一 viewport 的 scroll；不得修改 scene matrix、zoom level、node/relationship storage、WBS task、selection store 或 undo stack。
- 純 left pan 前後 connector／relationship world path 與 `data-mindmap-recompute-count` 必須不變。
- 不新增 dependency、API、schema、migration、permission、localStorage 或 backend 行為。

## 5. Scope / Out of Scope

本輪包含：desktop fine-pointer 左鍵空白畫布 direct pan、grab/grabbing 回饋、click suppression、互動排除、static/pure/browser 驗證與 targeted regression。

本輪不包含：手機心智圖、慣性滑動、邊緣自動捲動、space+drag、minimap、scene 位置持久化、改造中鍵 velocity 模式、修改節點拖放或 relationship 編輯語意。

## 6. Acceptance Criteria

- `AC-076-001`：1440x900 與 1024x768，空白畫布左鍵拖曳可同時改變兩軸 scroll，方向符合 direct pan 公式，兩軸誤差各 `<= 2px`。
- `AC-076-002`：有效拖曳期間 telemetry 為 `active` 且 computed cursor 為 `grabbing`；結束、cancel、blur 後恢復 `idle`，body ownership 無殘留。
- `AC-076-003`：有效 pan 不清除既有 task selection；門檻內空白 click 仍清除選取。
- `AC-076-004`：從 task node、center、relationship control 或一般 control 起手時，left-pan state 維持 `idle`，原 owner 行為不漂移。
- `AC-076-005`：純 left pan 的 connector/relationship path、geometry recompute count、任務資料與 relationship storage 不變。
- `AC-076-006`：touch／pen、SPEC-029 mobile boundary、既有中鍵 pan、zoom、quick-title、node drag、relationship 與鍵盤操作不回歸。
- `AC-076-007`：真實 rendered surface 無 visible runtime error、重疊、裁切、雙 scroll owner或非預期 document overflow。

## 7. Stop Conditions / Failure Recovery

以下任一情況停止並回 RD：節點或 control 起手也會 pan、拖曳後誤清 selection、門檻內 click 被吞、純 pan dirty world geometry、task/relationship 資料被寫入、touch 行為改變、body cursor 殘留或出現第二 scroll owner。

回復只撤除 DEV-076 的 left-pan wiring、telemetry 與 CSS；既有中鍵 pan、DEV-074 scene/viewport、DEV-075 selection/navigation 與使用者其他 working-tree 變更不得還原。

## 8. Evidence 與 Release Boundary

- Pure/static：`npm.cmd run verify:dev-076-mindmap-left-mouse-pan`
- Rendered browser：`npm.cmd run verify:dev-076-mindmap-left-mouse-pan-browser`
- Targeted regression：DEV-074 single scene、DEV-075 keyboard、DEV-073 quick-title、DEV-027B mindmap polish 的受影響 gates。
- 輔助 gate：TypeScript、targeted ESLint、`build:test`。
- Browser artifact 固定放在 `output/playwright/dev-076-mindmap-left-mouse-pan/`；runtime、route、viewport、interaction、console/page/visible error 與 screenshot 都必須記錄。
- 本地實作不含 commit、push、PR、merge、deploy、production data 或 release；收到 release 指令後另走 release gate。

ADR 不新增：這是 mindmap-only、可逆且由既有 viewport scroll authority 完整承接的手勢擴充，替代方案與 owner 邊界已由本規格固定。
