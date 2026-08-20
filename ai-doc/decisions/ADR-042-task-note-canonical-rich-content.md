# ADR-042：任務備註採版本化 Lexical JSON，plain text 與 AI Markdown 為單向投影

- 狀態：Accepted / Amended for DEV-066 Rework 4
- 日期：2026-08-12
- 修訂：2026-08-20（mobile append-only 改為單一 responsive editor）
- 關聯：DEV-066、SPEC-066、DEV-006、DEV-008、DEV-057

## Context

任務備註需要無損保存基本語意格式、支援既有純文字資料，並讓 AI 讀取安全結構。原決策另以手機 append-only merge 保護桌機格式；2026-08-20 使用者明確改為所有 viewport 共用同一 Lexical editor，因為裝置分流造成重複 UI 與不同操作模型，而 canonical rich state 本身已能在手機安全編輯。若同時把 HTML、plain text 與 AI 文字當成可編輯來源，三份正文仍會漂移；若只保存 plain text，格式仍會消失。

## Decision

1. `TaskDetailNote.richContent` 的版本化 Lexical JSON 是富文字存在後的 canonical source。
2. `TaskDetailNote.content` 是由 canonical state 產生的 plain-text compatibility alias；`TaskNode.description` 只鏡像第一則備註的 plain text。
3. AI Markdown 於索引時即時計算，不回存、不反向編輯 canonical state。
4. 所有可編輯 viewport 使用同一個 Lexical editor 與 canonical write path；手機不再使用 append-only merge，也不得建立手機專用 editor 或以 plain text 覆蓋全文。
5. legacy note 沒有 rich state 時維持可讀，首度寫入才 lazy upgrade；現有 JSONB 不做 migration。
6. renderer 與 AI projection 採 node allowlist、未知節點文字 fallback 與安全 URL protocol，不直接執行 raw HTML。
7. desktop/mobile 差異只限 responsive layout、觸控 selection、軟鍵盤與 viewport 適配；格式 allowlist、權限、儲存、projection 與失敗邊界保持一致。

## Consequences

- 優點：格式 round-trip、legacy 相容、跨裝置同一操作心智模型、移除重複手機 UI、AI 輸入可控且去重。
- 成本：手機會載入既有 lazy editor chunk，且需要觸控 selection、軟鍵盤與小 viewport 的 targeted QA；每次更新仍需同步 plain projection，schema/version 未來仍需 upgrader。
- 約束：任何新 node 都必須同時定義 editor registration、readonly renderer、plain projection、AI projection 與 QA，否則不得寫入 canonical state。
- 模組邊界：現有任務備註 editor 泛化為裝置中立元件，不新增 mobile editor module；responsive style 不形成第二套資料或操作流程。

## Rejected Alternatives

- raw HTML canonical：安全面與 deterministic projection 成本較高。
- Markdown canonical：不能無損承載 Lexical selection/history 與底線等 editor semantics。
- plain text canonical：無法滿足桌機格式 round-trip。
- 手機整份 plain-text save：會覆寫 canonical 格式，仍然拒絕。
- 手機唯讀＋append-only 分流：已由 2026-08-20 `4A` 明確取代；雖降低手機 editor 載入成本，但版位、能力與維護效用較低。
- 另建手機 editor：產生第二套模組與回歸矩陣，違反單一 editor responsibility boundary。
