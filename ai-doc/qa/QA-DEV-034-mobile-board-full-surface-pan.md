# QA-DEV-034: 手機看板全區拖移改善驗證計畫

狀態：Browser QC Passed
關聯規格：`ai-doc/specs/SPEC-034-mobile-board-full-surface-pan.md`
建立日期：2026-06-26

## 驗證範圍

本 QA 計畫只驗證手機 / coarse pointer 下的看板模式。驗證目標是確認看板主要內容區可以自然點住拖移，且不破壞既有任務點擊、拖曳把手、長按選單、輸入與依賴控制。

不驗證清單、心智圖、甘特、日曆或紀錄庫手機模式，因為產品現行契約是手機只顯示看板模式。

## 使用者關鍵流程

1. 使用者用手機開啟 ProJED，系統停留或切回看板模式。
2. 使用者按住任務卡片、下層任務或欄位空白處拖移，以瀏覽更多欄位或欄位內更多任務。
3. 使用者短點任務，仍能開啟任務詳情。
4. 使用者短點新增任務輸入框，仍能 focus 並輸入文字；按住輸入框或新增任務按鈕拖移時，欄位仍能捲動。
5. 使用者點拖曳把手、日期 / 依賴控制或展開收合按鈕，不會被全區 pan 攔截。

## Zero-Tolerance Failures

| ID | 失敗條件 | 判定 |
|---|---|---|
| ZT-034-001 | 手機 / coarse pointer 下出現清單、心智圖、甘特、日曆或紀錄庫 mode entry | Fail |
| ZT-034-002 | 從卡片或下層任務拖移後開啟 `TaskDetailsModal` | Fail |
| ZT-034-003 | 從卡片、下層任務、欄位空白或看板空白拖移時，對應 scrollLeft / scrollTop 沒有變化 | Fail |
| ZT-034-004 | 新增任務 input 無法 focus 或輸入 | Fail |
| ZT-034-005 | 任務拖曳把手被 pan hook 接管，無法保留任務移動語意 | Fail |
| ZT-034-006 | 390x844 viewport 有 visible runtime error、重疊、裁切、不可操作或非預期 overflow | Fail |

## FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 建議測試 |
|---|---|---|---|---|---|
| 拖移卡片後誤開詳情 | compatibility click 沒被 suppress | 使用者只想移動畫面卻被 modal 打斷 | touch sequence 後檢查 modal count | P0 | pan 結束後 suppress 下一次 click |
| 卡片區無法水平移動 | 事件被卡片 / checklist stopPropagation 擋住 | 可拖區仍很小 | native capture listener + scrollLeft delta | P0 | hook 掛在 board surface capture phase |
| 欄位內無法垂直移動 | hook 只處理外層 board scroll | 長欄位仍難瀏覽 | column scrollTop delta | P0 | touch target closest column，垂直位移捲 column |
| input 被拖移攔截 | 排除 selector 或 allow selector 不完整 | 無法新增任務或無法從底部控制區捲動 | focus / fill input browser test；input/button pan browser test | P0 | 預設排除 input/button，但欄位底部新增任務控制以 `data-mobile-board-pan-allow="true"` 放行拖移 |
| 拖曳把手失效 | 全區 pan 攔截 handle touch | 任務移動功能退化 | 點 handle / DnD smoke 或 selector guard | P1 | 排除 `[data-task-drag-handle="true"]` |
| 長按選單失效或誤觸 | pan threshold 與 longPress tolerance 不一致 | 手機操作不可預期 | 長按不移動、拖移超過 threshold 兩種測試 | P1 | 門檻沿用 10px，move 超過門檻才 pan |
| mobile density 退化 | pan CSS 或 listener 影響 layout | 卡片數降低、畫面裁切 | DEV-031 browser verifier | P1 | 重跑 DEV-031 |
| 子任務短點擊失效 | click suppression 清除時機錯誤 | 無法開下層任務詳情 | pan 後等待，再短點 checklist item | P0 | suppress timeout 後 tap 應恢復 |

## 測試資料需求

- 使用 local test fixture；browser verifier 使用 `window.__PROJED_QC__?.reset(100)` 產生足夠欄位與任務，確保 390x844 下有水平與垂直 scroll displacement 可量測。
- 看板需至少包含：
  - 3 個以上欄位，外層 board 可水平捲動。
  - 其中一欄有足夠卡片或下層任務，使欄位可垂直捲動。
  - 至少一張有 Level 3+ 下層任務的卡片。
  - 欄位底部存在新增任務 input。

## 自動化測試案例

| ID | Viewport | 前置條件 | 操作步驟 | 預期結果 | 證據 |
|---|---|---|---|---|---|
| AUTO-034-001 | 390x844 | coarse pointer enabled | 開啟 app | 只顯示 board mode entry | DOM count |
| AUTO-034-002 | 390x844 | board `scrollLeft=0` | 從第一張卡片往左拖 | board `scrollLeft` 增加，modal count = 0 | scroll delta + modal count |
| AUTO-034-003 | 390x844 | board 可水平捲動 | 從下層任務往左拖 | board `scrollLeft` 增加或維持合理 delta，modal count = 0 | scroll delta + modal count |
| AUTO-034-004 | 390x844 | column 可垂直捲動 | 從欄位空白處往上拖 | column `scrollTop` 增加 | scrollTop delta |
| AUTO-034-005 | 390x844 | board 有欄間空白或尾端空白 | 從看板空白處往左拖 | board `scrollLeft` 增加 | scrollLeft delta |
| AUTO-034-006 | 390x844 | pan 後 suppress timeout 已過 | 短點卡片 | 開啟對應 `TaskDetailsModal` | modal `data-task-id` |
| AUTO-034-007 | 390x844 | pan 後 suppress timeout 已過 | 短點下層任務 | 開啟對應 `TaskDetailsModal` | modal `data-task-id` |
| AUTO-034-008 | 390x844 | 欄位新增 input 可見 | click input, fill text | input focused 且值更新 | activeElement + input value |
| AUTO-034-009 | 390x844 | 欄位新增 input 位於可捲動欄位底部 | 從 input 往下拖 | column `scrollTop` 下降，modal count = 0 | scrollTop delta + modal count |
| AUTO-034-010 | 390x844 | 欄位新增 button 位於可捲動欄位底部 | 從「新增任務」button 往下拖 | column `scrollTop` 下降，modal count = 0 | scrollTop delta + modal count |
| AUTO-034-011 | 390x844 | 畫面已載入 | visible error sweep | 無 `.inline-error`、`[role=alert]`、HTTP/Not Found/Internal Server/API error text | DOM/text sweep |

## 手動 UX Review

| Question | Result | Note | Evidence |
|---|---|---|---|
| 5 秒內是否知道目前仍是看板模式？ | Pending |  | mobile screenshot |
| 手指按住卡片拖移時，是否符合「畫布跟著手移動」心智模型？ | Pending |  | mobile recording / screenshot sequence |
| 拖移後是否沒有被任務詳情 modal 打斷？ | Pending |  | modal count / screenshot |
| 短點任務是否仍清楚代表開詳情？ | Pending |  | modal screenshot |
| 新增任務 input 是否仍能正常輸入？ | Pending |  | focus screenshot |
| 是否沒有重疊、裁切、不可操作或非預期 overflow？ | Pending |  | 390x844 screenshot |

## QC 執行指令

RD 實作後，QC 依序執行：

```powershell
npm.cmd run verify:dev-029-mobile-pan-first-interactions
npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser
npm.cmd run verify:dev-031-mobile-density
npm.cmd run verify:dev-031-mobile-density-browser
```

若 RD 修改觸及卡片點擊、下層任務、modal title 或拖曳把手，追加：

```powershell
npm.cmd run verify:dev-032-kanban-all-level-task-details-browser
npm.cmd run verify:dev-033-task-details-title-edit-browser
npm.cmd exec tsc -- --noEmit
npm.cmd run lint -- --quiet
npm.cmd run build:test
```

## 通過標準

- 所有 Zero-Tolerance failures 均未發生。
- DEV-029 static/browser verifier 通過，且 browser verifier 已量測實際 scroll displacement。
- DEV-031 mobile density verifier 通過。
- 390x844 visible error sweep clean。
- 短點擊、拖移、輸入與拖曳把手四類互動語意彼此不衝突。

## QC Result - 2026-06-26

狀態：Pass。事實報告：`ai-doc/qc/QC-DEV-034-mobile-board-full-surface-pan.md`。

已通過：

```powershell
npm.cmd run verify:dev-029-mobile-pan-first-interactions
npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser
npm.cmd run verify:dev-031-mobile-density-browser
npm.cmd run build
```

## 失敗時需收集證據

- 失敗操作的起點 selector、touch start/end 座標、dx/dy。
- board `scrollLeft` 前後值。
- column `scrollTop` 前後值。
- 是否存在 `TaskDetailsModal`，以及 modal `data-task-id`。
- activeElement / input value。
- 390x844 screenshot 或錄影路徑。
- visible error sweep 結果與 console/network 失敗摘要。
