# RD 技術主管審查：DEV-106 會議安全草稿、結束與待整理生命週期

- 日期：2026-09-04
- 審查對象：`ai-doc/dev_task.md`、SPEC-106、QA-DEV-106、SPEC／QA-DEV-069、SPEC-020與現行相關程式邊界
- 原方案結論：`不通過 Phase 0；核心修正與雲端架構混在同一施工批次`
- 修正後結論：`有條件通過；可進入 Phase 0 Local Safety Slice 實作`
- Phase 1：`RD Contract Ready / NOT IMPLEMENTATION READY`
- Phase 0 實作／驗證：`IMPLEMENTED / QA-QC PASS`；Release：`NOT AUTHORIZED`

## 1. 核心判斷

使用者問題不是缺少更多「儲存」按鈕，而是系統把資料安全責任交給使用者，且一般離開會主動清除尚可復原的內容。

```text
編輯中最新內容未真正落盤
  + request success被當成transaction committed
  + X／切換／開另一筆時清除recovery並reset
  = 關閉後缺少可重建最新內容的durable source
```

最小充分解法是：本機 transaction truth、同scope latest-write queue、app內離開前自動force-flush、一般離開不清資料、明確discard才清目前scope。只要這五件事成立，日常關頁遺失的主要因果鏈即被切斷。

原 Phase 0 同時要求 Supabase CAS、owner-private metadata overlay、Firestore capability降級、remote tombstone與remote-only restore。這些能力沒有直接縮短上述因果鏈，卻引入可見性、併發、資料遷移與多provider一致性風險，因此不應作為第一個修復批次。

## 2. 關鍵發現與必要修正

| ID | 優先級 | 發現 | 風險 | 最小修正 | 狀態 |
|---|---:|---|---|---|---|
| F1 | P0 | Phase 0把本機防遺失與雲端／跨裝置架構綁在一起 | 實作面過大，核心修復被provider風險阻塞 | Phase 0只保留Local Safety Slice；全provider meeting recovery 0 remote request | 已修正 |
| F2 | P0 | 原safe-close在`session_only／saving`時仍先要求使用者選「存草稿並離開」 | 安全責任仍落在使用者，且一般離開不是自動保護 | app內離開直接force-flush目前signature；只有fail／timeout才顯示恢復型dialog | 已修正 |
| F3 | P0 | 把未保存payload疊加在canonical metadata，無法同時證明Supabase project/tenant與Firestore owner-only | 未確認內容可能擴大可見範圍；client CAS也易被誤當security boundary | Phase 0移除cloud path；未來改採獨立owner-private recovery authority並立ADR | 已修正／Future blocker |
| F4 | P1 | `結束會議`的record、metadata、task links、undo／RAG與readback沒有原子性／補償及same-ID冪等契約 | partial success可能建立duplicate或假needs_review | Phase 1維持Contract Ready；解除五項readiness gap後才可施工 | 未阻擋Phase 0 |
| F5 | P1 | Firestore workspace subcollection規則只有member邊界 | 現有或未來private recovery不能宣稱owner-only | Phase 0以0 recovery write隔離；正式多人使用／既有payload於release前另做inventory與rules治理 | 接受並隔離技術債 |

修正後沒有阻擋 Local Safety Slice 開工的P0文件缺口；Phase 1與future cloud仍不得順帶施工。

## 3. 最小架構

```text
meeting editor change
  -> 500ms local autosave queue
  -> IndexedDB transaction oncomplete
  -> localCommittedSignature

app-internal leave
  -> latest signature already committed? ─ yes -> leave, keep recovery
  -> no -> forceFlush(max 2s)
       -> committed -> leave, keep recovery
       -> fail/timeout -> stay + recovery actions

explicit discard
  -> confirm
  -> queued terminal clear barrier
  -> IDB delete oncomplete
  -> remove session copy
  -> reset/leave
```

架構邊界：

- IndexedDB是Phase 0唯一recovery authority；sessionStorage只是emergency fallback。
- `request.onsuccess`不構成durability；UI只信任目前signature的transaction `oncomplete`。
- close、navigation與discard共用單一 safety action orchestrator，避免各guard複製規則。
- canonical save沿用正式流程；只有正式ack後才更新baseline並嘗試cleanup。
- Supabase、Firestore、local-test均不得收到meeting recovery read/write。

## 4. 事實、決策與推論界線

### 現行程式事實

- `meetingDraftRecoveryService.withStore()`目前可在request success時resolve，早於transaction durable completion。
- `useMeetingDraftRecovery`已有500ms local debounce與session emergency copy。
- `useMeetingModeExitGuard`、`useRecordDraftGuard`與record store的部分close／open路徑會清除recovery。
- Supabase checkpoint目前更新canonical record欄位且沒有原子compare-and-set；DEV-069真實provider smoke尚未完成。
- `firestore.rules`對workspace子集合只檢查workspace membership，沒有record owner／visibility條件。

### 已確認產品決策

- 草稿由系統自動建立與保存；關閉只離開畫面，不改變資料。
- `發布`只改變正式狀態／可見性。
- `捨棄本次會議`可加入，但必須獨立、明確且可理解，不放在一般關閉選項。
- 心跳、待整理收件匣、智慧收尾、多版本與跨裝置續編納入整體設計，但可分期。

### 技術主管推論

- 日常關頁遺失可由local-only slice先被實質降低，不需等待remote architecture。
- 先停用未完整驗證的cloud path，比在canonical metadata上繼續堆CAS／tombstone更容易證明安全與回退。
- 未來跨裝置若是正式需求，獨立owner-private recovery entity比共用canonical row更符合資料可見性與生命週期邊界。

## 5. 技術債與限制

- 接受本機RPO限制：瀏覽器／OS在transaction commit前突然終止，最後未提交尾段仍可能遺失。以500ms autosave、app內force-flush、beforeunload提示與誠實狀態降低風險，不宣稱zero-loss。
- Firestore owner-only規則缺口保持隔離；Phase 0不新增recovery write。若正式環境已有DEV-069 unsaved payload，release前需inventory與治理。
- 多tab同scope不在Phase 0正確性保證內，也不做merge或revision history；一旦成為實際使用情境，須進future concurrency設計。
- canonical cleanup失敗可延後重試；只要canonical ack已成功，不得把已保存內容誤報為遺失。

## 6. Gate 結論

- Phase 0 P0 implementation blocker：0（F1～F3已在SPEC／QA修正）。
- Phase 0 gate：已依WP-106-L0-A -> E完成；static、runtime、browser 14/14、回歸與完整 side-effect service provenance 均 PASS，雲端 recovery 仍刻意不在本 phase。
- Phase 1 blocker：F4，維持`RD Contract Ready`。
- Future cloud blocker：F3／F5，須ADR、獨立資料authority、migration／rules與雙actor privacy evidence。
- ADR：Phase 0不需要；Future cloud recovery必須建立。
- Migration：Phase 0不需要；IndexedDB database version保持1，v1只讀normalize、v2 writer。
- Release：未授權；本輪已完成 Phase 0 local implementation 與 QA/QC gate，不得將此結果外推為正式部署或發布。

結論：修正後方案已完成 Phase 0 Local Safety Slice 的實作與 QA/QC gate；這只切斷本機關頁遺失的主要因果鏈，不包含 Phase 1 結束會議／待整理或正式 release。若後續施工需要remote recovery、provider CAS、待整理UI、結束會議、remote policy或跨裝置能力，立即停止並退回技術主管／PM，不得以「順便完成」擴張本批次。

## 7. 審查後實作與證據稽核（2026-09-04）

- 已落地：IndexedDB transaction `oncomplete` commit truth、v1 read／v2 write、per-scope latest queue、terminal clear barrier、IDB abort 後保留 session fallback、app 內 force-flush、一般離開保留 recovery、獨立 `捨棄本次會議`、canonical success cleanup，以及 Supabase／Firestore／local-test meeting recovery kill switch。
- 離開入口補強：MainLayout、Sidebar（紀錄庫／設定／看板切換）、RecordsView、SettingsView 均經 `useRecordDraftGuard`；meeting X／mode exit 由 `useMeetingModeExitGuard` 統一處理。一般離開不加入「不儲存離開」，破壞性放棄只留在獨立 danger action。
- 實證：`npm run verify:dev-106-meeting-local-safety` PASS；`npm run verify:dev-106-meeting-local-safety-browser` 14/14 PASS，包含 runtime failure／abort harness、2,000ms force-flush timeout、1024px view transitions、紀錄庫開舊／正常入口開新、canonical cleanup與cleanup abort／retry readback、四個 provider adapter checkpoint spy、provider／正式紀錄／event／record store action／Undo push failure injection isolation、discard 取消／abort focus、390px negative；diagnostics、HTTP failures、remote recovery requests 均為 0，side-effect storage delta 為空。
- 回歸：DEV-069 static／browser、DEV-010、DEV-020 static／browser、DEV-094 static／pure／browser、DEV-105 static／browser、TypeScript、lint、`build:test`均 PASS。
- 殘餘 gate：Phase 0 已無 P0/P1 blocker；ROT-106-011 已補足紀錄庫開舊／正常入口開新，ROT-106-010 已補足 discard failure focus／keyboard，ROT-106-008 已補足 cleanup retry readback，ROT-106-012 已補足 provider／正式紀錄／event／record store action／Undo push failure isolation。Phase 1 atomicity／idempotency／projection readiness仍未解除，正式 release 另需 release gate。

使用思考習慣：#問對問題、#多層次分析、#可驗證性
