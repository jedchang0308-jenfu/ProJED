# QC-DEV-091：工作台上下區域高度調整

- 結論：`Local QC PASS / 未 Release`
- Source：Git HEAD `40fc817` + DEV-091 working-tree boundary
- 環境：Windows、local-test backend、`http://localhost:4000/`
- Viewport：1440×900、390×844
- 角色：`local-test-user`

## 執行事實

| 項目 | 實際結果 |
|---|---|
| 預設 geometry | 未歸位／已歸位 50%／50%，高度差 ≤4px；12px hit area 內只有一條可見細線 |
| Pointer | 向下 120px 後比例約 65%，上區增加、下區降低；pointer up 後才保存 |
| Keyboard／A11y | ArrowUp、Home=18%、End=82%、ARIA min/max/now/value text與focus path通過 |
| Persistence | panel cache與account UI layout皆寫入 `0.651`；後續鍵盤值reload還原 |
| Narrow | 390×844 divider維持panel內、pointer可調、document scrollWidth不超過clientWidth |
| Error sweep | visible alerts=0、可見HTTP／API錯誤=0、console errors=0、page errors=0 |
| Regression | DEV-039 placement static 31/31與browser完整新增、歸位、唯讀、filter、390×844流程PASS |

## Evidence

- `output/playwright/dev-091/task-workbench-lane-resize-desktop.png`
- `output/playwright/dev-091/task-workbench-lane-resize-390x844.png`
- `npm run verify:dev-091-task-workbench-lane-resize`
- `npm run verify:dev-091-task-workbench-lane-resize-browser`
- `npm run verify:dev-039-task-workbench-placement-lanes`
- `npm run verify:dev-039-task-workbench-placement-lanes-browser`
- `npm exec tsc -- --noEmit`、targeted ESLint、`npm run build:test`、`git diff --check`

## QC trace 與限制

- 第一輪共用 navigation verifier 誤把 section row 當成 104px label；selector 修正後又命中其舊 mobile overlay 預期。兩次均為既有 verifier 與現行 shared-inline 契約漂移，未發現產品 visible error；保留為 failure-first trace，DEV-091 改用專用 verifier後完整流程PASS。
- 截圖人工檢視：分隔線對比可辨識、兩區無重疊或裁切，窄版 hover／active線保持panel範圍內。
- 未執行 Supabase authenticated two-device smoke、production deploy 或 release；本結論只適用本地來源與 local-test UI。
