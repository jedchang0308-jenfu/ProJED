# QC-DEV-027B: Xmind-like keyboard, zoom, tidy connector, and drag insertion preview polish

日期: 2026-06-19
狀態: Browser QC Passed
對應 DEV: DEV-027B
規格: `ai-doc/specs/SPEC-027B-xmind-interaction-polish.md`
QA: `ai-doc/qa/QA-DEV-027B-xmind-interaction-polish.md`

## QC 範圍

本輪 QC 已依使用者最新要求重新驗證：

- 新增任務後只選取，不立即進入編輯。
- 新增後可連續按 `Enter` / `Tab` 新增任務。
- 方向鍵可移動選取任務。
- 選取任務後直接打字才進入 rename mode。
- rename input 內的 `Enter` 只 commit，不建立下一個任務。
- zoom、tidy connector、drag insertion preview、mobile viewport regression 維持通過。

## 驗證命令與結果

```powershell
npm.cmd run verify:dev-027b-xmind-interaction-polish
npm.cmd exec tsc -- --noEmit
npm.cmd run lint -- --quiet
npm.cmd run build:test
npm.cmd run verify:dev-027b-xmind-interaction-polish-browser
npm.cmd run verify:dev-027-xmind-connector-lines-browser
npm.cmd run verify:dev-027-xmind-drag-preview-browser
npm.cmd run verify:dev-027-xmind-like-mind-map-mode
npm.cmd run verify:dev-027-xmind-like-mind-map-browser
npm.cmd run verify:core-regression-static
```

結果：

- `verify:dev-027b-xmind-interaction-polish`: Pass, 18/18 checks。
- `tsc --noEmit`: Pass。
- `lint --quiet`: Pass。
- `build:test`: Pass；保留既有 Vite dynamic import / chunk size warning。
- `verify:dev-027b-xmind-interaction-polish-browser`: Pass。
- `verify:dev-027-xmind-connector-lines-browser`: Pass。
- `verify:dev-027-xmind-drag-preview-browser`: Pass。
- `verify:dev-027-xmind-like-mind-map-mode`: Pass, 31/31 checks。
- `verify:dev-027-xmind-like-mind-map-browser`: Pass。
- `verify:core-regression-static`: Pass, 10/10 checks。

## Gate Result

| Gate | Result | Evidence |
|---|---|---|
| 新增後不得自動開啟 rename input | Pass | browser verifier checks `data-mindmap-title-input` count |
| 新增後新任務保持 selected | Pass | `aria-selected` metadata |
| 連續 `Enter` 新增同階任務 | Pass | parent / level / side / y-position metadata |
| 連續 `Tab` 新增子階任務 | Pass | child / grandchild level + parent metadata |
| 方向鍵移動選取 | Pass | selected title after arrow operations |
| 直接打字改名 | Pass | rename input + final title evidence |
| Zoom controls and endpoint alignment | Pass | zoom state + endpoint distance |
| Tidy bracket connector | Pass | `H/V/H` path and shared trunk x |
| Drag insertion preview fidelity | Pass | preview DOM metadata + post-drop state |
| Mobile zoom and visible error sweep | Pass | 390x844 screenshot + body text sweep |
| DEV-027 / DEV-027A regression | Pass | baseline and connector/drag verifiers |

## Browser Evidence

Browser target: `http://127.0.0.1:4173/`

Screenshots:

- `output/playwright/dev-027B-enter-sibling-order.png`
- `output/playwright/dev-027B-zoom-150.png`
- `output/playwright/dev-027B-zoom-100.png`
- `output/playwright/dev-027B-tidy-bracket-parent-five-children.png`
- `output/playwright/dev-027B-drag-insertion-preview-hover.png`
- `output/playwright/dev-027B-drag-insertion-preview-post-drop.png`
- `output/playwright/dev-027B-mobile-zoom.png`

## QC 結論

Pass。DEV-027B 可回到 Browser QC Passed。此輪同時更新 DEV-027A drag verifier，讓回歸驗證符合新的 selection-first keyboard UX，不再依賴「新增後自動開 rename input」的舊行為。
