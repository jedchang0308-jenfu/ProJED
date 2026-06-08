# QA-DEV-012 AI 會議紀錄自然語言品質提升驗證計畫

狀態：Ready for RD  
關聯 DEV：DEV-012  
關聯規格：`ai-doc/specs/SPEC-012-ai-meeting-record-natural-language-quality.md`  
建立日期：2026-06-07

## 驗證重點

以 UX 與內容品質為主要需求：AI 草稿需像人類整理的任務紀要，而不是固定欄位填空。驗證必須同時確認可讀性與系統契約：task tag 保留、任務片段可查、AI 不改任務、失敗不覆蓋原稿。AI 不能用專案既有狀態補內容，也不能自行推論下一步。

## 自動驗證

```powershell
npm.cmd run lint -- --quiet
npm.cmd run verify:dev-008-task-knowledge
npm.cmd run verify:dev-011-ai-meeting-synthesis
npm.cmd run verify:dev-012-meeting-record-quality
npm.cmd run build
```

## Golden Samples

### GS-001 雙任務交錯討論

輸入：
- 任務 A 討論設計方向與資料流。
- 任務 B 討論 QA 實際輸入測試。
- raw content 中 A/B 交錯出現。

通過：
- A/B 各自有 `### @[title](task:id)`。
- 每個任務為自然語言段落。
- A 片段不含 B 的 QA 結論，B 片段不含 A 的設計結論。
- 不出現 `目前任務狀態為`、`任務背景是`、`既有備註指出` 等專案靜態資料。

### GS-002 多次任務狀態變更

輸入：
- 同一任務有重複狀態變更與排程變更 activity。

通過：
- 不出現逐筆 timestamp。
- 重複 activity 被合併。
- 狀態脈絡以自然語言描述，例如「會中已將任務推進到進行中，並同步調整排程」。
- 不寫「本次沒有狀態變更」這類專案已知或無資訊填充句。

### GS-003 資訊不足

輸入：
- 任務只有 tag 或 activity，沒有明確決議。

通過：
- 任務段落不硬寫假決議。
- 不自動寫「下一步」。
- `## 待校稿項目` 只提醒需要人工補會議內容，不推測負責人、期限或決策。

### GS-004 下一步只整理人類明確內容

輸入：
- 任務 A 速記：`QA 要補實際輸入測試，明天回報結果。`
- 任務 B 速記：`設計方向確認。`

通過：
- 任務 A 可出現 `下一步`，內容來自原始句子。
- 任務 B 不出現 `下一步`，因為沒有明確後續行動。

## 手動 QA 情境

1. 開啟 meeting mode。
2. 在速記欄輸入口語內容：未完成句、簡短詞、任務 A/B 交錯討論。
3. 在任務詳情補記任務討論。
4. 會中移動任務或改狀態。
5. 點 `AI整理`。

通過：
- 草稿讀起來像人類會後紀要。
- 不出現五欄固定模板。
- `下一步` 只整理人類明確講過的行動。
- 不出現 AI 工作說明、專案目前狀態或由 AI 推論出的行動。
- 發布後任務詳情的「任務知識」可查到自然語言片段。

## Edge / Failure QA

- 模擬模型 unavailable / not found：原草稿不被覆蓋，UI 顯示 AI 統整失敗。
- 確認錯誤訊息指向 `GEMINI_MEETING_SYNTHESIS_MODEL`。
- 確認正式環境 smoke test 呼叫 `synthesize_meeting_record` 時使用預設 `gemini-3.5-flash`，除非 env override。

## UI QC

桌機與筆電 viewport：

| Viewport | 驗證重點 |
|---|---|
| 1440x950 | 自然語言草稿、AI 狀態、發布按鈕不遮住看板 |
| 1024x768 | 長段落不造成右側欄水平 overflow 或主要按鈕裁切 |

手機版會議紀錄工作流不列入 release gate。
