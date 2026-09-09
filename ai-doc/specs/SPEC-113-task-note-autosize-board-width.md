# SPEC-113：任務說明單行預設、內容自動增高與看板寬度偏好

## 狀態

- `Target Authority / Local implementation complete / QA-QC local PASS`
- 關聯 DEV：`DEV-113`
- 原始需求：任務說明欄位預設只占一行；使用者可調整寬度並保留於看板；內容變更時避免文字被截斷。

## 目標與使用者契約

1. 空白或短內容的任務說明編輯器預設只顯示一行高度，不再以固定的大型文字區塊佔據任務詳情畫面。
2. 編輯器高度依目前內容自動增長，完整顯示段落與清單，不以內部垂直捲軸截斷內容。
3. 使用者可用原生水平 resize 把手調整寬度；調整結果以 `boardId` 為範圍保存，重開同一看板時沿用。
4. 使用者寬度偏好與內容高度計算分離：內容變更只重新計算高度，不覆蓋已選寬度；這是「使用者調整優先」的具體化。
5. 儲存為瀏覽器端介面偏好，不新增資料表、migration、任務欄位或跨使用者共享設定。

## UI／互動規則

- 內建最小寬度 `240px`、最大寬度 `1600px`，並受目前容器 `max-width` 約束。
- 內建最小高度 `36px`；內容變更以 `scrollHeight` 更新 inline height。
- 水平調整完成後才寫入 `localStorage`，避免拖曳中的每一幀造成不必要寫入。
- localStorage 讀寫失敗時回退至目前容器寬度，不阻斷任務說明編輯。
- 編輯器仍沿用既有 Lexical、toolbar、儲存與權限流程；本功能不改任務說明資料內容。

## Out of scope

- 後端同步的個人／團隊版面設定。
- 新增 OKR、方向或目的欄位。
- 任務卡、閱讀模式懸浮說明與任務詳情外的欄位尺寸調整。

## 驗收證據

- `scripts/verify-dev-113-task-note-autosize-board-width.ts`
- in-app browser：空白編輯器 `36px` 高；三行內容後 `84px` 高；還原後回到 `36px`。
- TypeScript、targeted ESLint、test build 與既有 DEV-028 browser regression。

使用思考習慣：#使用者視角、#最小介面、#可驗證性
