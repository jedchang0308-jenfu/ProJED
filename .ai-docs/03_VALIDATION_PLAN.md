# 03 Validation Plan

## Git 協作規範

所有 commit 使用 Conventional Commits：

```text
<type>(<scope>): <subject>
```

常用 type：`feat`、`fix`、`refactor`、`docs`、`test`、`chore`。

收斂期重構格式：

```text
refactor(convergence): consolidate <area>
fix(convergence): guard <risk>
docs(convergence): update <document>
```

## 核心驗證清單

### 拖曳防護

- [ ] 手機拖曳需長按 250ms 與移動容忍值。
- [ ] 手機版不得開放甘特圖拖曳。
- [ ] 電腦端輸入、文字編輯、inline editing 時，空白鍵不得觸發 dnd-kit。
- [ ] IME 組字期間，`Enter`、`Esc`、`Space` 不得誤觸拖曳或提交。
- [ ] 拖曳結束後才提交正式排序或日期變更。

### 資料連動與防呆

- [ ] Zustand store 與 DOM 呈現同步；DOM 順序不得成為資料真相。
- [ ] 任務移動後，`parentId`、`order`、`kanbanStageId` 必須一致。
- [ ] 切換清單、看板、甘特圖、日曆後，狀態與日期不得遺失。
- [ ] 日期連動需處理依賴，避免後置任務早於前置任務。
- [ ] 同日起訖、零天、缺少日期的任務都需明確處理。
- [ ] Firestore 同步失敗時，需回滾、重試或提示。

### UI/UX 穩定性

- [ ] 全域右鍵選單需偵測 viewport 邊界。
- [ ] Dialog、Context Menu、Toast 的 z-index 不得互相遮擋。
- [ ] Toast 為非阻塞提示，不取代需要決策的 Dialog。
- [ ] sticky header 或側欄滾動時不得內容穿透。
- [ ] 編輯輸入框不得因 store 更新或拖曳預覽失焦。
- [ ] 手機 Bottom Sheet、Bottom Tab Bar 與主要內容不得互蓋。

## 驗證方式

涉及任務模型、拖曳、排程、同步或跨視圖呈現時，至少執行：

```bash
npm run lint
npm run build
```

UI 或拖曳變更需手動驗證電腦版與手機尺寸下的視圖切換、拖曳、輸入、右鍵選單、Dialog、Toast。
