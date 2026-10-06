# SPEC-113：任務說明單行預設、內容自動增高與底邊縱向尺寸

## 狀態

- `Target Authority / 2026-09-10 account-task-note scope amendment / Local implementation complete / QA-QC local PASS`
- 關聯 DEV：`DEV-113`
- 原始需求：任務說明欄位預設只占一行，內容變更時避免文字被截斷。
- 2026-09-09 使用者修訂：移除橫向調整，改為縱向調整；把手範圍改為編輯器底部整條框線。
- 2026-09-10 使用者修訂：高度偏好不得再由同帳號的所有任務共用，改為該帳號下的個別任務與備註欄各自保存。

## Spec Impact

分類：`Intentional replacement`。2026-09-10 修訂以「帳號 × 任務 × 備註欄」取代原本 `boardId` 共用高度偏好；
Lexical、內容自動增高、底邊縱向 resize、權限、資料模型與 local-only preference 邊界不變。既有 v1 看板範圍值不遷移，避免把無法判定歸屬的共用高度錯套到任一任務。

## 目標與使用者契約

1. 空白或短內容的任務說明編輯器預設只顯示一行高度，不再以固定的大型文字區塊佔據任務詳情畫面。
2. 尚未手動設定高度時，編輯器依目前內容自動增長並完整顯示段落與清單。
3. 編輯器固定使用容器完整寬度，不提供水平 resize 或右下角原生 resize 把手。
4. 編輯器底部整條框線都是縱向 resize 命中區；由中央、左端或右端拖曳都只改變高度，寬度不得漂移。
5. 底邊平時沿用既有外框；hover、focus 或 active 時才以低噪音藍色底線回饋可拖曳狀態，不新增常駐說明文字。
6. 使用者高度偏好以 `accountId + taskId + noteId` 為範圍保存；重開同一備註欄會讀回高度，其他任務或同任務的其他備註欄不得沿用。一旦手動設定，高度可以小於內容自然高度，超出範圍由編輯器內部縱向捲軸承接。
7. 底邊提供 `separator` 語意、可存取名稱與方向鍵／PageUp／PageDown／Home 鍵盤調整。
8. 儲存為瀏覽器端介面偏好，不新增資料表、migration、任務欄位或跨使用者共享設定。

## UI／互動規則

- 編輯器使用 `width: 100%`、`resize: none`；內建最小高度 `36px`，手動偏好上限 `960px`。
- 沒有手動偏好時，內容變更以 `scrollHeight` 更新 inline height；有手動偏好時固定使用偏好高度，並以 `overflow-y: auto` 與專案既有 6px 低干擾捲軸顯示超出內容。
- 自訂底邊命中區高 `8px`、寬度等於編輯器全寬，游標為 `row-resize`。
- 拖曳完成後才寫入 `localStorage`，避免拖曳中的每一幀造成不必要寫入。
- 高度偏好使用 `projed.taskDetailNote.heights.v2`；scope key 由編碼後的 `accountId`、`taskId`、`noteId` 組成，沒有登入帳號時不讀寫偏好。
- localStorage 讀寫失敗時回退至內容自動高度，不阻斷任務說明編輯。
- 編輯器仍沿用既有 Lexical、toolbar、儲存與權限流程；本功能不改任務說明資料內容。

## Out of scope

- 後端同步的個人／團隊版面設定。
- 新增 OKR、方向或目的欄位。
- 任務卡、閱讀模式懸浮說明與任務詳情外的欄位尺寸調整。

## 驗收證據

- `scripts/verify-dev-113-task-note-autosize-board-width.ts`：15/15。
- Playwright：15/15；空白 `36px`、三行 `84px`、六行自然高度 `156px` 可縮限並產生縱向捲軸、中央／左端／右端底邊拖曳、鍵盤調整；任務 A／任務目的調至 `204px` 後，重開維持 `204px`，同任務其他備註欄與同看板任務 B 均維持 `36px`。
- 808×698 實畫面：編輯器寬 `725.52px`、底邊命中區同寬、document width `808px`，無水平 overflow。
- TypeScript、targeted ESLint、test build PASS。

使用思考習慣：#使用者視角、#最小介面、#可驗證性
