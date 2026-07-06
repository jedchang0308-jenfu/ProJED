# QA-DEV-027B: Xmind-like keyboard, zoom, tidy connector, and drag insertion preview validation

日期: 2026-06-19
狀態: Browser QC Passed / DEV-028 Detail-Only Title Edit Aligned
對應 DEV: DEV-027B
規格: `ai-doc/specs/SPEC-027B-xmind-interaction-polish.md`

## QA 目標

驗證 ProJED 心智圖新增任務、選取、命名、縮放、線條與拖曳 preview 是否符合 Xmind-like 操作。此版 QA 以使用者最新要求為準：新增任務後不得自動開啟 rename input；新任務只被選取，使用者可以方向鍵移動選取。2026-07-06 DEV-028 已覆寫外層 rename：直接打字、`F2` 或雙擊不得在心智圖節點外層改名，命名需走任務詳情 title input。

## Zero-Tolerance UI Fail Gates

| Gate | Fail 條件 | 必要證據 |
|---|---|---|
| ZT-027B-001 | 新增 root / sibling / child 後自動開啟 rename input | DOM: `data-mindmap-title-input` count |
| ZT-027B-002 | 新增後未選取新任務 | DOM: `aria-selected="true"` 與 node title |
| ZT-027B-003 | 連續 `Enter` 只能新增一次，或新增後選取遺失 | keyboard trace + node metadata |
| ZT-027B-004 | 連續 `Tab` 只能新增一次，或 child / grandchild parent 錯誤 | node level / parent metadata |
| ZT-027B-005 | 方向鍵移動選取失效，或移動時開啟 rename input | selected node metadata + input count |
| ZT-027B-006 | 直接打字、`F2` 或雙擊仍進入節點外層 rename | input count + detail title evidence |
| ZT-027B-007 | 詳情頁 title input 命名後破壞心智圖 `Enter` / `Tab` selection-first flow | detail title evidence + post-close keyboard trace |
| ZT-027B-008 | zoom 後 connector endpoint 與 node edge 錯位 | endpoint distance evidence |
| ZT-027B-009 | parent + 5 children 線條不是整齊 shared trunk / bracket | screenshot + SVG path metadata |
| ZT-027B-010 | 拖曳時沒有 insertion placeholder / intended connector / ghost node | drag hover screenshot + DOM metadata |
| ZT-027B-011 | preview 顯示位置與 mouseup 後實際 parent/order/side 不一致 | pre-drop metadata + post-drop metadata |
| ZT-027B-012 | 任一 viewport 顯示 runtime error、線條殘破、文字重疊、控制項裁切 | screenshot + visible error sweep |

## Manual UI Matrix

| Case | Viewport | 操作 | Pass 標準 |
|---|---|---|---|
| UI-027B-001 | 1440x900 | 點新增 root | 新 root 被選取，沒有 rename input |
| UI-027B-002 | 1440x900 | 選 root 後按 `Tab` | 新 child 被選取，沒有 rename input |
| UI-027B-003 | 1440x900 | 選 child 後連按 `Enter` 建立 5 個同階 | 每次都只選取新 sibling，parent / level / side 正確 |
| UI-027B-004 | 1440x900 | 選 child 後按 `Tab`，再按 `Tab` | 形成 child -> grandchild，新增後都不自動編輯 |
| UI-027B-005 | 1440x900 | 選第 3 個 child，按 `ArrowUp` / `ArrowDown` | 選取移動到上一個 / 下一個 visible node |
| UI-027B-006 | 1440x900 | 選 child，按 `ArrowLeft` / `ArrowRight` | Left 選 parent；Right 選第一個 child |
| UI-027B-007 | 1440x900 | 選任務後直接輸入文字、按 `F2`、雙擊標題 | 不進入節點外層 rename；需要改名時只能開任務詳情 title input |
| UI-027B-008 | 1440x900 | 在任務詳情 title input 改名後關閉詳情，再按 `Enter` | 改名同步；回到心智圖後 `Enter` 仍新增 sibling |
| UI-027B-009 | 1440x900 | zoom 50% / 100% / 150% / 200% | 文字、節點、線條、hit target 清晰且對齊 |
| UI-027B-010 | 1440x900 | parent + 5 children | 線條為整齊 trunk / bracket，沒有孤立短線 |
| UI-027B-011 | 1440x900 | 拖曳 child 到另一 root hover 300ms | insertion placeholder、connector preview、ghost node 明確顯示 |
| UI-027B-012 | 390x844 | mobile viewport zoom out | toolbar 可用，無水平錯亂、無 visible error |

## Automated Verification Requirement

```powershell
npm.cmd run verify:dev-027b-xmind-interaction-polish
npm.cmd run verify:dev-027b-xmind-interaction-polish-browser
```

自動化必須覆蓋：

- 新增後不得自動開啟 rename input。
- 新增後新任務維持 selected。
- 連續 `Enter` 建立同階任務。
- 連續 `Tab` 建立巢狀子任務。
- `ArrowUp` / `ArrowDown` / `ArrowLeft` / `ArrowRight` selection navigation。
- 直接打字、`F2` 或雙擊不進入節點外層 rename；命名 / 改名需走任務詳情 title input。
- zoom connector endpoint alignment。
- tidy connector trunk。
- drag insertion preview fidelity。

## QC Handoff Gate

QC 不得只用 lint/build/typecheck 代替 UI 驗證。必須提供：

- desktop screenshot。
- mobile screenshot。
- DOM selected/input evidence。
- SVG connector metadata。
- drag preview metadata。
- visible runtime error sweep。
- DEV-027 / DEV-027A regression verifier output。
