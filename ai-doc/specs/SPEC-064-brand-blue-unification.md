# SPEC-064：全系統品牌藍統一

狀態：RD Implemented / Local Static + Browser QC Passed / Production Not Deployed

關聯 DEV：DEV-064、DEV-027E、DEV-039、DEV-057、DEV-058、DEV-062

## 目標

2026-08-04 使用者指出系統同時存在多種藍色色相，要求統一為品牌藍。目標不是把所有元件塗成同一個深度，而是建立一套品牌藍色階，讓主要操作、選取、focus、資訊提示、進行中狀態與拖曳回饋維持可辨識明暗，同時不再跨 `blue`、`sky`、`indigo`、`cyan` 漂移色相。

## 品牌藍色階

- 品牌藍 500：`#6366F1`，主要品牌基準。
- 品牌藍 600：`#4F46E5`，hover、實色 CTA 與進行中狀態。
- 品牌藍 50–400：淡底、border、ring 與次要提示。
- 品牌藍 700–950：高對比文字與強調狀態。
- `src/index.css` 是 CSS theme 入口；`src/components/ui/brandColors.ts` 是 SVG、color input 與持久化樣式所需的 hex 入口，兩者色值必須由 verifier 鎖定一致。

## UX 與相容契約

- Tailwind legacy `blue-*`、`sky-*`、`indigo-*`、`cyan-*` utility 在 theme 層對應相同品牌藍色階，既有元件不需要同時大規模改名即可在 runtime 收斂。
- 新程式優先使用 `primary`／`primary-*`；既有 class 名只作向後相容，不再代表不同色相。
- 心智圖 SVG、關係線與拖曳 preview 不得保留獨立 sky blue hex；舊關係線預設色 `#0284C7` 在讀取時正規化為品牌藍，不回寫遠端資料。
- 全域任務平台、topbar 與一般容器原本的藍灰 pseudo-brand 改為中性 slate；只有 active、drop target、選取與主要操作使用品牌藍。
- 成功綠、警告橘、危險紅與中性灰不納入品牌藍替換；標籤中非藍色的使用者自選色與心智圖關係線的綠、紅、紫、橘選項維持。
- 本輪不改互動、資料模型、權限、schema、拖曳 commit、狀態值或逾期判斷。

## Out of Scope

- 不重新設計品牌 logo、字體、spacing、圓角或元件結構。
- 不把成功、警告、危險、逾期或使用者自訂非藍色標籤改成品牌藍。
- 不批次回寫既有心智圖關係線資料，不執行 production deploy。

## 驗收標準

- [x] 品牌藍 50–950 在 CSS 與非 CSS 常數完全一致。
- [x] `blue`、`sky`、`indigo`、`cyan` 每一階 runtime computed color 均等於同階 `primary`。
- [x] 進行中狀態、工作台 active／drop、topbar、心智圖與拖曳回饋使用品牌藍。
- [x] 產品 source 除 compatibility normalizer 外，不再出現已知 legacy sky／blue hex 或藍灰 pseudo-brand hex。
- [x] 成功、警告、危險、逾期與中性灰語意不變。
- [x] 看板、任務詳情、心智圖與 390px 手機畫面無可見錯誤、重疊、裁切或水平 overflow。

## 治理結論

Spec Impact：對 DEV-058 的 `bg-blue-500` 為 `Compatible exception`，class 名保留但 runtime 已由 theme alias 對應品牌藍；對 DEV-062「進行中使用一般藍色」與工作台既有 Morandi 藍灰視覺為使用者核准的 `Intentional replacement`；對成功、警告、危險與自訂非藍色為 `No conflict`。ADR not needed：品牌色由既有 `primary` token 延伸，沒有改變外部資料或 API 契約。
