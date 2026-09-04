# QC-DEV-102：心智圖矩形圈選、多選右鍵與剪貼操作事實驗證

- 日期：2026-09-04
- 狀態：`Local QC PASS / Evidence Verified / Tech Lead Reviewed R3 + UI Follow-up / 未 Release`
- 對應規格：`ai-doc/specs/SPEC-102-mindmap-marquee-multiselect-clipboard.md`
- 對應QA：`ai-doc/qa/QA-DEV-102-mindmap-marquee-multiselect-clipboard.md`
- Evidence root：`output/playwright/dev-102-mindmap-marquee-multiselect-clipboard/`

## 1. QC 結論

以 current working tree 的 source、verifier JSON、rendered screenshots與執行輸出交叉核對，DEV-102 的本機功能與失敗收斂證據一致，判定 Local QC PASS。沒有把 build成功當成功能證據，也沒有以 force-click、刪除既有 assertion或舊 artifact 取代真實 UI path。

## 2. 事實核對

| 核對項目 | 事實 | 判定 |
|---|---|---|
| 圈選 | primary-left blank drag顯示矩形；2個節點以client中心點命中 | PASS |
| 多選右鍵 | 顯示「已選取 2 個任務」；不可用動作不進DOM與Tab順序，保留4個可執行action | PASS |
| Copy／paste | 初始18 nodes，貼上後20；2個forest roots建立成功 | PASS |
| Cut／paste | 8個cut subtree nodes顯示cut視覺；成功貼上後clipboard清除 | PASS |
| 批次動作 | assignment套用2 tasks；archive套用2 roots | PASS |
| 父子正規化 | copy／cut／archive使用top-most forest roots；assignment保留明確選取tasks | PASS |
| Failure compensation | partial create與partial assignment均回復before-state | PASS |
| Indeterminate recovery | timeout先鎖定，hard reload canonical readback後descriptor清除 | PASS |
| Geometry／performance | 200／500 nodes四方向各20正式樣本；drift 0、path stable、p95低於gate | PASS |
| Menu UI follow-up | 不可用action DOM=0、disabled rows=0、可見action=4；252px寬、13px字、32px列、opacity 1、computed `oklch(0.372 0.044 257.287)`且`contrastPass=true` | PASS |
| Error channels | consoleErrors、pageErrors、failedRequests皆為空陣列 | PASS |
| Narrow viewport | 390與320不顯示mindmap/marquee；document width等於viewport | PASS |
| Visual review | 圈選框、compact高對比menu、recovery banner、390／320 screenshots已目視複核 | PASS |

## 3. 工程與回歸核對

- `npm.cmd run verify:dev-102-mindmap-marquee-multiselect-clipboard`：PASS。
- `npm.cmd run verify:dev-102-mindmap-marquee-multiselect-clipboard-browser`：PASS。
- DEV-013／027B／028／048／070／074／075／079／084／088／095 受影響 static/browser gates：PASS。
- targeted ESLint：0 errors。
- `npm.cmd run build:test`、`git diff --check`：PASS；current full `npx.cmd tsc --noEmit`受工作樹既有非DEV-102錯誤阻斷（MainLayout／TaskDetailsModal／localTestService），不在本輪UI touched scope。
- runtime cleanup：task-owned port 4000／4001 listeners皆為0。

## 4. 未驗證與禁止外推

- 未執行正式 Supabase／Firestore provider、production RLS、跨裝置或跨tab exactly-once驗證。
- 未執行 deploy、production smoke、production mutation或release。
- 因此本文件只證明 current local-test implementation；不得當成正式上線核准。
