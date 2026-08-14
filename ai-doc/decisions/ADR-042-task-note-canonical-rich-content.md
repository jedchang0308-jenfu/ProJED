# ADR-042：任務備註採版本化 Lexical JSON，plain text 與 AI Markdown 為單向投影

- 狀態：Accepted for DEV-066
- 日期：2026-08-12
- 關聯：DEV-066、SPEC-066、DEV-006、DEV-008、DEV-057

## Context

任務備註需要無損保存基本語意格式、支援既有純文字資料、允許手機只追加純文字，且讓 AI 讀取安全結構。若同時把 HTML、plain text 與 AI 文字都當成可編輯來源，三份正文會漂移；若只保存 plain text，桌機格式會消失；若保存 raw HTML，安全 renderer、版本演進與 AI 清理成本較高。

## Decision

1. `TaskDetailNote.richContent` 的版本化 Lexical JSON 是富文字存在後的 canonical source。
2. `TaskDetailNote.content` 是由 canonical state 產生的 plain-text compatibility alias；`TaskNode.description` 只鏡像第一則備註的 plain text。
3. AI Markdown 於索引時即時計算，不回存、不反向編輯 canonical state。
4. 手機 append 是對 canonical root 的 append-only paragraph merge，不以 plain text 覆蓋全文。
5. legacy note 沒有 rich state 時維持可讀，首度寫入才 lazy upgrade；現有 JSONB 不做 migration。
6. renderer 與 AI projection 採 node allowlist、未知節點文字 fallback 與安全 URL protocol，不直接執行 raw HTML。

## Consequences

- 優點：格式 round-trip、legacy 相容、手機不破壞格式、AI 輸入可控且去重。
- 成本：每次更新要同步 plain projection；內容比較要納入 rich state；schema/version 未來需新增 upgrader。
- 約束：任何新 node 都必須同時定義 editor registration、readonly renderer、plain projection、AI projection 與 QA，否則不得寫入 canonical state。

## Rejected Alternatives

- raw HTML canonical：安全面與 deterministic projection 成本較高。
- Markdown canonical：不能無損承載 Lexical selection/history 與底線等 editor semantics。
- plain text canonical：無法滿足桌機格式 round-trip。
- 手機整份 plain-text save：會覆寫桌機格式，違反 1A。
