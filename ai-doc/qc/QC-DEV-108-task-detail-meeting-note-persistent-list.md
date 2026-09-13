# QC-DEV-108 任務明細會議補記持續列表

- DEV：`DEV-108`
- 結論：`PASS`
- 驗證層級：local implementation / targeted QA-QC
- 日期：2026-09-11
- Scope：任務明細人工會議補記的 provenance、跨模式持續列表、封存／來源移除、active draft append、latest-3、窄版邊界與回歸。
- Release boundary：未 commit、未 push、未 deploy；正式 release 仍需另走 release gate。

## 實際執行命令與結果

| 命令 | 結果 | 證據 |
|---|---|---|
| `npm run verify:dev-108-task-meeting-note-persistent-list` | PASS，16 assertions | `output/playwright/dev-108-task-meeting-note-persistent-list/static-result.json` |
| `npm run verify:dev-108-task-meeting-note-persistent-list-browser` | PASS，B01–B09 | `output/playwright/dev-108-task-meeting-note/result.json` |
| `npm run verify:dev-008-task-knowledge` | PASS | task-scoped knowledge regression |
| `npm run verify:dev-009-task-detail-quick-note` | PASS | append／task mention／UI store regression |
| `npm run verify:dev-024-ai-synthesis-preserve-human-draft` | PASS | human draft merge regression |
| `npm run verify:dev-066-task-note-rich-text` | PASS | task note editor regression |
| `npm run verify:dev-105-meeting-task-reservation-number` | PASS，10 cases | reservation metadata regression |
| `npm run verify:dev-106-meeting-local-safety` | PASS | recovery／transaction regression |
| `npm run verify:dev-107-record-sidebar-layout` | PASS，20 assertions | sidebar workflow regression |
| `npx tsc --noEmit` | PASS | working tree |
| targeted `npx eslint ...` | PASS，0 errors；13 existing unused-variable warnings | working tree |
| `npm run build:test` | PASS | Vite test build／PWA artifacts generated |
| `git diff --check` | PASS；僅有既有 CRLF warning | working tree |

## Browser evidence

- Environment：`http://localhost:4000/` existing local test runtime；1440×900 desktop、390×844 mobile。
- B01：任務明細掛載單一 `TaskMeetingQuickNoteSection`，無 runtime error；歷程容器重用 `TaskNoteContentSurface`，並具 region 名稱與鍵盤焦點。
- B02：初始顯示最新三筆，顯示「其餘 10 筆」，且歷程容器回報 overflowY=auto、maxHeight=200px。
- B02：每筆只顯示 `MM/DD` 日標籤，不顯示幾點幾分。
- B03：原地展開 13 筆；歷程容器 clientHeight≈198px、scrollHeight=260px 可捲動，且展開後不顯示「收合」控制；移除 archived source 後 reload 只剩三筆，沒有 stale text。
- B04：舊「本次會議」藍色 composer 不再存在，非 meeting mode 不顯示新增輸入。
- B05：meeting mode 在同一區顯示單一 composer。
- B06：加入後輸入清空、補記列留在 current in-memory draft；預設 latest-3 維持緊湊，composer 不在歷程卷軸容器內。
- B07：1440 desktop `scrollWidth === clientWidth`。
- B08：390 mobile 保留列表、`composer=false`、`scrollWidth === clientWidth`。
- B09：visible alerts、console errors、page errors、HTTP 4xx/5xx 均為 0。
- 截圖：`desktop-immediate-1440x900.png`、`desktop-expanded-1440x900.png`、`meeting-mode-composer-1440x900.png`、`mobile-390x844.png`，位於 `output/playwright/dev-108-task-meeting-note/`。

## 判定

- `meetingTaskQuickNotes.v1` 僅由任務明細 append 產生，legacy 正文不回填；entry identity、anchor 與 text invariant 有 deterministic gate。
- Store append 以單次 Zustand transaction 同步正文、metadata、taskLinks、cursor 與 synthesis state；denied 不清空輸入。
- `listByNode(..., { includeArchived: true })` 只在 task detail loader 使用，global `listByProject` 仍排除 archived。
- active draft 與 remote record 以同一 record id overlay；未知／無效 metadata 隔離並提供就地錯誤，不能假裝空白。
- UI 維持任務說明 → 會議紀錄 → 其他備註 → 子任務順序，無卡片包卡片、裝飾 icon、badge、搜尋列或常駐成功面板。

## 殘留風險

- 瀏覽器 verifier 使用 local-test fixture；Firebase／Supabase 真實帳號與正式 RLS 尚未納入本地 release gate。
- targeted ESLint 顯示 13 個既有 unused-variable warnings，沒有本次新增 error。
- 未執行 commit、push、deploy 或正式環境 migration；DEV-108 維持 Local-only / NOT RELEASED。
