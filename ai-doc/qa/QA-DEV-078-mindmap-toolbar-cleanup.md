# QA-DEV-078：心智圖工具列新增入口與快捷提示清理

## 判定

`Executed / QA PASS / QC PASS / 未 Release`（以本輪 verifier 與本機瀏覽器 artifact 為準）。

## 驗證矩陣

| Case | 方法 | 預期 |
|---|---|---|
| 078-S01 | `verify:dev-078-mindmap-toolbar-cleanup` | toolbar create button／hint 移除；zoom／relationship、empty-state、keyboard source 保留 |
| 078-B01 | 1440×900 browser | create button 與 hint 不存在；zoom／relationship 控制存在；無錯誤 |
| 078-B02 | 1440×900 keyboard + static source gate | 無選取時 Enter 建立 root；Tab／Delete source contract 保留（既有 mindmap keyboard regression 維持） |
| 078-B03 | 1024×768 browser | 同一 toolbar cleanup contract，無錯誤 |
| 078-B04 | 390×844 boundary | mindmap mobile boundary 不變、無 overflow、無被刪除元素 |

## 風險與回歸

- 若只刪除按鈕卻連同 `handleCreateRoot`／keyboard dispatch 移除，無選取時 Enter／Tab 會失效；static 與 browser keyboard case 共同攔截。
- 若只隱藏文字而仍保留 toolbar DOM，會造成誤觸或檢索到舊 selector；browser 以 DOM absence 驗證。
- 若桌機清理改變手機 boundary 或 toolbar overflow，390px evidence 與 visible-error gate 會失敗。

## Evidence

- `output/playwright/dev-078-mindmap-toolbar-cleanup/result.json`
- `output/playwright/dev-078-mindmap-toolbar-cleanup/desktop.png`
- `output/playwright/dev-078-mindmap-toolbar-cleanup/laptop.png`
- `output/playwright/dev-078-mindmap-toolbar-cleanup/mobile.png`
- `verify:dev-078-mindmap-toolbar-cleanup`、`verify:dev-078-mindmap-toolbar-cleanup-browser`
