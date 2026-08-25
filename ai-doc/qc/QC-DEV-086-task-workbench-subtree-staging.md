# QC-DEV-086 全域工作台子樹暫存與跨看板搬移

- 日期：2026-08-25
- 角色：QC（依 SPEC-086／QA-DEV-086 做事實驗證）
- 結論：`QC PASS／未 Release`
- 關聯：DEV-086、DEV-039、DEV-044、DEV-053、DEV-065

## 使用者契約確認

- 看板任務可拖入全域工作台的未歸位區；未歸位任務可在切換目的看板後拖回。
- 父任務搬移時整棵子樹一起搬；全域暫存與目的看板都保留 parent links。
- 已歸位區維持唯讀不可拖；只有未歸位區的列可作為工作台拖曳來源。
- UI 使用精簡 L3+ 段落層級與 hover 子樹預覽，不顯示 descendant-count 文字。
- 拖入未歸位時使用看板同一個 `KanbanInsertionMarker` 預覽 append 落點，不另造樣式或元件。
- 手機以既有長按拖曳 session 補上「看板→未歸位」；完整子樹與共用定位線要導入，subtree hover 等價效果不導入。
- 本 addendum 不開放手機清單／甘特／日曆模式，也不把這三種模式的 5px 縮排列入手機交付。

## 事實證據

| Gate | 結果 | 證據 |
|---|---:|---|
| DEV-086 static | PASS | moved subtree=3、restored subtree=3、parent links preserved |
| DEV-086 rendered browser | PASS | 真實 pointer drag 完成 workspace A／board A→unplaced→workspace B／board B；390px／320px 原生 touch 完成 board→unplaced，390px 再完成跨工作區 restore |
| DEV-039 placement regression | 31/31＋browser PASS | placement lane、選板與 placed read-only contract 相容 |
| DEV-044 undo regression | 26/26 PASS | batch history owner 未回歸 |
| DEV-053 drag regression | 30/30 PASS | task drag payload／target contract 相容 |
| DEV-065 hover regression | 40 checks PASS | source＋subtree hover scope 相容 |
| TypeScript | PASS | `npx tsc --noEmit` |
| `build:test` | PASS | Vite test build 完成 |
| 人工截圖檢查 | PASS | desktop／narrow 五張與 mobile 390／320 五張，共十張畫面 |

## Browser QC 判定

- 修正前的實際阻塞點是 BoardView outside-board collision guard：看板來源即使位於未歸位 lane 上方仍回傳 outside-board；現在只對明確的 Workbench staging lane 開例外，其餘外部目標仍拒絕。
- board A 的 parent、child、grandchild 經真實滑鼠拖曳後同時出現在未歸位區，DOM depth 為 0／1／2。
- desktop 實測列高約 20px，每層縮排 6px；760px viewport 使用 5px token。
- hover parent 時來源列與 descendant subtree 都有框選效果，頁面沒有「含 N 個子任務」文字。
- 工作台跨工作區切換目的看板 B 後，將未歸位 root 拖入 placed lane；local persistence 的三個 task ID 都屬於 workspace B／board B，parents 為 `null`、root、child。
- 歸位後列標記 readonly，沒有 drag surface；沒有把「已歸位」清單變成第二個拖曳來源。
- L1 `wbs-column` 獨立 collision 路徑亦以真實滑鼠通過：group＋L2 child 投入未歸位後都可見，跨工作區歸位後 group nodeType 與 child parent link 保留；placed L1 仍無 drag surface。
- Empty preview：共用 marker axis=`horizontal`，compact dot=8×8px、bar=6px；wrapper height=0，清單高度與 empty-state top 位移均為 0px。滑鼠離開 lane marker detached，重新進入恢復，drop 後移除。
- Populated preview：第二棵 L1 子樹拖入已有三列的未歸位區時，marker 中心與最後一列 bottom 誤差 ≤1px；畫面沒有把任務列推開。
- Mobile 390×844／320×844：原生 CDP touch 長按看板 parent 後，mobile adapter 命中 target／surface=`workbench-unplaced-lane`，`TaskDragPresenter` 直接呈現共用 horizontal marker；兩種 viewport 均整批搬入 root／child／grandchild，DOM depth=0／1／2，storage parent links 保留。
- Mobile 390×844 cross-workspace：切到工作區 B／看板 B 後，以既有 mobile placement path 把完整子樹歸位；三個 ID 的 workspace／board／parent links 正確，未歸位資料清空。
- Mobile cleanup／RWD：drop 後 marker、drag preview、action rail 全數清除；document overflow=0、list height 無 marker layout shift、visible error=0。沒有導入 mobile subtree hover，也沒有改動 mobile board-only mode gate。
- page error=0。既有 Calendar fallback warning 不影響本 flow，且未被誤報為零 warning。

## 架構與資料 QC

- 子樹計算集中於 pure helper；commit owner 不複製 traversal 規則。
- `batchUpdateNodes` 以單一 history batch 更新本地狀態；跨儲存面先保存目的，再刪來源。
- 進未歸位採 leaves-first；回看板採 root-first，避免 remote parent／child 順序造成暫時孤兒。
- 未歸位 normalizer 與 Supabase adapter 保存 `parentId`；不需要 schema migration。
- UI 只抽共用展示契約，沒有直接把 `KanbanChecklist` 的看板 DnD／context／store owner 掛進全域工作台。

## Artifact 與目視結果

- `output/playwright/dev-086/unplaced-subtree-desktop.png`：20px 級段落、6px 階層與完整子樹 hover。
- `output/playwright/dev-086/unplaced-insertion-preview-desktop.png`：空白未歸位第一落點的共用定位線。
- `output/playwright/dev-086/unplaced-insertion-preview-populated.png`：已有任務時精準貼齊 append 邊界的共用定位線。
- `output/playwright/dev-086/unplaced-subtree-narrow.png`：窄版 5px 階層。
- `output/playwright/dev-086/restored-subtree-board-b.png`：未歸位為空、目的看板已歸位清單顯示三個節點。
- `output/playwright/dev-086/unplaced-insertion-preview-mobile-390.png`、`unplaced-insertion-preview-mobile-320.png`：手機長按拖入未歸位時的共用定位線。
- `output/playwright/dev-086/unplaced-subtree-mobile-390.png`、`unplaced-subtree-mobile-320.png`：手機完整三層子樹暫存結果。
- `output/playwright/dev-086/restored-subtree-mobile-390.png`：手機跨工作區／看板整棵歸位結果。

## Runtime 與交付邊界

QC 重用同專案既有 `http://localhost:4000/` primary runtime（驗證時 listener PID 24272、wrapper/root tree PID 7776）；本 DEV 未建立或接管該 process tree，因此未停止。自有 Playwright browser session 已結束。手機結論限 CDP touch emulation，實機 iOS／Android與輔助科技未驗證。未執行 commit、push、PR、merge、deploy、production data 或 release。
