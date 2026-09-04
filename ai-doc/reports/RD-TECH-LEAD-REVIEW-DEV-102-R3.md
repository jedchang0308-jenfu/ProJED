# RD 技術主管第三輪審查：DEV-102 實作與驗證收斂

- 日期：2026-09-04
- 審查對象：DEV-102 產品實作、static／pure verifier、browser artifact、受影響回歸、SPEC／QA／dev_task／documentation map
- 結論：`通過；Local Implementation Verified + UI Follow-up Verified，可結束開發交付，未授權 Release`
- 執行邊界：已執行本機 local-test runtime、產品實作、verifier、rendered evidence、型別與 build；未執行 commit、push、PR、deploy、production mutation或正式 provider／跨裝置驗證

## 1. 技術主管結論

DEV-102 已從 R2 的「文件可實作」進入「本機實作與證據收斂完成」。核心設計沒有建立第二套任務業務規則：selection 仍由心智圖 private placement store 管理；context menu 只負責心智圖呈現；複製沿用 shared clone plan；assignment／archive／paste 都由 awaitable store command 執行；失敗以 compensation、canonical readback與 same-tab recovery descriptor 收斂。

最短因果鏈：

`placement selection authority + client-space marquee + local menu presenter + shared domain commands`
→ 圈選、心智圖專屬action visibility與 copy／cut／paste 不會污染其他模式
→ `commitNodeBatch／commitNodeForestCreate` 統一 provider completion、補償、side readback與 recovery
→ UI 能在成功、已補償與結果不明三種狀態下維持可解釋且可恢復的行為。

使用思考習慣：#根本原因、#系統描繪、#可驗證性、#風險優先

## 2. 實作審查中發現並修正的整合缺陷

### F1 — React Strict Mode replay 會清空初始 selection

- 原因：effect cleanup 呼叫 component-owned selection store 的 `dispose()`，但初始化 guard 在 Strict Mode replay 後仍保留。
- 修正：不再於 replay cleanup 銷毀 store；實際 unmount 後由物件生命週期回收。
- 證據：DEV-075 browser selection／keyboard matrix與 DEV-102 首次圈選均 PASS。

### F2 — 圈選 pointer guard 未共用關聯線互動 selector

- 原因：marquee 在 pointerdown 提前 `preventDefault`，但 guard 沒涵蓋 relationship joystick／label input。
- 修正：`MindMapView` 共用 `isMindMapRelationshipInteractionElement`；selector 補齊方向控制與 label editor。
- 證據：DEV-075 relationship isolation、DEV-079 relationship workflow與 DEV-084 pointer ownership均 PASS。

### F3 — 關聯線 hit target 的 stacking context 蓋住任務節點

- 原因：左右 root wrapper 的 stacking context 使 z-index 44 的 relationship target 高於 task node，造成路徑附近節點無法正常點擊。
- 修正：移除非必要 root wrapper stacking context，任務／中心節點提高至互動層；不以測試 force-click 掩蓋問題。
- 證據：DEV-079 browser 以真實 pointer 完成 node 選取與建立關聯，無 force option。

### F4 — 詳情關閉後 focus bookmark 指向已 remount 的元素

- 原因：只保存舊 HTMLElement；Task Details lifecycle 可能 remount 同一 placement。
- 修正：bookmark 同時保存 `placementId`，舊元素失效時重新解析現行 placement element。
- 證據：DEV-095 browser 的 primary／tracking click、double-click、Enter、Space 共 8/8 PASS。

### F5 — Failure evidence 若只測 store helper，無法證明 UI delivery path

- 原因：純 command fault injection 不足以證明 context menu、picker、lock與 reload recovery 有接上。
- 修正：local-test provider 增加 one-shot create／batch／timeout seams；DEV-102 browser verifier透過真實右鍵與指派 UI 觸發。
- 證據：partial forest create與partial assignment皆 compensated；timeout 為 indeterminate，hard reload readback 收斂至 before-state並清除 descriptor。

## 3. 架構與技術債判定

### 3.1 通過項目

- `selectedPlacementIds + primaryPlacementId` 是唯一心智圖 selection authority，mutation 前才解析 canonical task IDs。
- marquee 使用 client-space snapshot與 transient overlay，不修改 Scene geometry；50／100／200% zoom皆選取一致。
- 心智圖擁有自己的 menu presenter，但 action metadata、permission與 domain command仍共用；其他模式的 immediate duplicate沒有改語意。
- copy 保存 snapshot，cut 保存 live structure fingerprint；父子重疊由 top-most forest roots 正規化，不以鎖住 copy 規避問題。
- node／reindex／side presentation 被納入同一 command plan；confirmed success才產生 local effects與單筆 undo。
- MindMapContextMenu 對不可用action不 mount、不顯示lock row；只保留可執行button並維持native Tab／Escape／outside-click focus contract。沒有為本需求虛構 Arrow／Home／End roving menu或 Shift+F10 能力。

### 3.2 保留技術債

provider 仍沒有同看板 forest／multi-node ACID transaction。現行 application saga 能保證：已知失敗時補償、結果不明時 fail closed、same-tab hard reload 後 canonical readback；不能宣稱跨 tab、tab close、fresh browser session或跨 device exactly-once。此債不阻擋本機功能完成，但若要 release，需依部署 lane 另做正式 provider、權限與 production-bound smoke gate。

ADR 維持不需要：本次沒有 schema／migration／RLS／RPC、全域 selection authority或跨模式產品語意變更。若後續改用 provider atomic batch或 durable cross-tab journal，重新開 ADR 判定。

## 4. 驗證證據

| Gate | 結果 | 主要證據 |
|---|---|---|
| DEV-102 static／pure | PASS | selection、marquee、forest normalization、copy snapshot／clone plan、cut paste plan、menu isolation、static authority |
| DEV-102 browser | PASS | `output/playwright/dev-102-mindmap-marquee-multiselect-clipboard/result.json`，`passed=true`且 console／page／request errors皆空 |
| 功能 happy path | PASS | 2-node圈選；copy 18→20；cut visual 8；assignment 2；archive 2；不可用action DOM=0、可執行action=4 |
| Zoom／geometry | PASS | 0.5／1／2 zoom皆選取2；200／500 nodes的rect drift=0、path data stable |
| Performance | PASS | 200 nodes preview p95 10.7ms／commit p95 11.2ms；500 nodes 6.8ms／9.2ms；long task皆0 |
| Transaction／recovery | PASS | forest create compensated、batch assignment compensated、timeout indeterminate、reload readback rejected-before-state、descriptor cleared |
| Viewport／visual | PASS | 1440、laptop、390×844、320×568；窄視窗隱藏mindmap/marquee且document width等於viewport |
| 受影響回歸 | PASS | DEV-013、027B、028、048、070、074、075、079、084、088、095；包含相應browser gates |
| Engineering | PARTIAL（外部阻斷） | targeted ESLint 0 errors、`build:test`、`git diff --check`；current full `tsc --noEmit`被既有MainLayout／TaskDetailsModal／localTestService錯誤阻斷，不在DEV-102 UI touched scope |
| Runtime cleanup | PASS | task-owned 4000 process tree已停止，port listener=0；臨時4001亦已停止 |

Screenshots：`01-marquee-active-1440.png`、`02-multi-locked-menu.png`（目前內容為compact menu）、`03-copy-paste-result.png`、`04-cut-paste-result.png`、`05-laptop-marquee.png`、`06-hard-reload-recovery-lock.png`、`07-mobile-boundary-390.png`、`08-mobile-boundary-320.png`。

## 5. 最終 Gate

DEV-102 本機開發交付通過，可把 dev_task 標為已實作、Local Automated QA／QC Passed。R1／R2保留為決策歷史，R3是現行 implementation verdict。

本結論不等於 release approval。沒有執行 commit、push、PR、deploy、production mutation、正式 provider transaction驗證或production smoke；需要上線時必須另進 release gate。

## 6. 2026-09-04 UI Follow-up Amendment

使用者針對實際右鍵清單提出低對比、資訊過密與不可用項目干擾的修正要求。本 addendum 取代 R3 原先「locked row 可見且可 focus」的 MindMapContextMenu 呈現契約，但只適用心智圖專屬 presenter；GlobalContextMenu、Board／List／Gantt／Calendar 既有 disabled／`aria-disabled` 行為不變。

修正後的 UI contract 為：`enabled=false` action 不進入心智圖 DOM、Tab 順序或 lock icon；選單只呈現可執行 action。選單寬度上限為 260px、action 字級不超過 13.5px、列高不超過 34px、可見內容不以 opacity 淡化，並由 browser verifier 量測文字對比與密度。最新 browser artifact 已驗證不可用action DOM=0、disabled rows=0、compact menu及4個可執行action，console／page／request errors為空。
