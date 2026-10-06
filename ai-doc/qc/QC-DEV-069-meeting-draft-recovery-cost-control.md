# QC-DEV-069：會議草稿 F5 復原與低成本雲端備份

- 關聯 DEV：DEV-069
- QC 日期：2026-08-17
- 執行環境：ProJED local-test，`127.0.0.1:4173`，Vite test runtime
- 結論：Local RD／QA／Browser QC PASS；Supabase／Firestore 真實 provider smoke 待補；未 Release

## 1. 已執行證據

| Gate | 結果 | 證據 |
|---|---|---|
| DEV-069 policy／cost static verifier | PASS | `npm.cmd run verify:dev-069-meeting-draft-recovery`；20s idle、180s interval、20/hour、512KiB、UTF-8 bytes、mobile boundary |
| 真實 F5 restore | PASS | Browser verifier 使用 `page.reload()`；會議內容 `DEV-069 F5 後仍保留的會議速記` reload 後仍可見 |
| 1440x900 rendered UI | PASS | `output/playwright/dev-069/browser-1440-after-reload.png`；桌面 editor 與單一 `aria-live=polite` recovery status 可見 |
| 1024x768 rendered UI | PASS | `output/playwright/dev-069/browser-1024.png`；editor、保存狀態與輸入內容可見 |
| 390x844 mobile negative boundary | PASS | `output/playwright/dev-069/browser-390-negative.png`；meeting entry、editor、workflow、recovery status 均不存在 |
| visible-error sweep | PASS | Browser verifier；console/page error=0、HTTP response failure=0、可見 alert=0 |
| Existing meeting regressions | PASS | DEV-007、DEV-008、DEV-009、DEV-010、DEV-020 scripts 全部通過 |
| TypeScript | PASS | `npx.cmd tsc --noEmit` |
| Production build | PASS | `npm.cmd run build` |

## 2. 本機流程事實

- 輸入 meeting content 後，先產生 sessionStorage emergency snapshot；local-test adapter 的低頻 checkpoint 以固定 UUID 寫入 draft，未呼叫正式 `saveDraft()`。
- reload 後以同一 user/workspace/board 讀取最新本機 snapshot，恢復 meeting mode、內容與 cursor；不自動發布。
- 螢幕寬度 390 時，入口、meeting editor、meeting workflow 與 recovery status 均不 render；work-log 資料不從 records store 移除，只過濾 meeting surface。
- 桌面 UI 僅使用一個 recovery status location；錯誤文案使用產品語言，不把 provider raw error 直接渲染給使用者。

## 3. 尚未執行／不可宣稱通過的 gate

- 尚未連接真實 Supabase project 驗證 mutation request count、RLS conflict、既有 draft update、RAG／task-link delta。
- 尚未連接真實 Firebase/Firestore emulator 或 project 驗證 transaction read/write count 與 published conflict。
- 尚未執行人工注入 IndexedDB quota/open failure、Supabase 5xx、offline 10 分鐘與雙 tab race 的完整矩陣；policy 純函式已有 deterministic branch coverage，但不等同 provider smoke。
- 因此本報告只核准 local-test／browser implementation readiness，不核准 production deploy、release 或 provider-wide cost sign-off。

## 4. Re-entry / 下一個 gate

以同一 `recordService.checkpointDraft()` contract 接入測試 Supabase／Firestore fixture，補 QA-069-014～020、QA-069-023 的 provider evidence；完成前維持「未 Release」與 provider smoke pending。

