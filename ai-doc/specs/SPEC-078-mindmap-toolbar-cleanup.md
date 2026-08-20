# SPEC-078：心智圖工具列新增入口與快捷提示清理

## 1. 目的與範圍

依使用者瀏覽器標註，移除心智圖模式工具列右側的「新增任務」按鈕，以及標題下方的「Enter 新增同階，Tab 新增子任務，Delete 刪除」提示。這是 mindmap-only 的 UI 降噪，不改任務資料模型、權限、API 或空畫布建立流程。

## 2. 現行契約

- 工具列不渲染 `data-mindmap-create-root` 或「新增任務」按鈕。
- 工具列不渲染上述快捷鍵提示文字。
- 關聯線工具、縮放控制、唯讀 badge 與既有 layout 保留。
- 空畫布的「新增第一個任務」fallback 保留，避免沒有節點時失去建立入口。
- `Enter` 無選取時仍可建立 root；有選取時仍建立同階；`Tab` 仍建立子任務；`Delete` 仍刪除選取任務或關係線。
- 不移除 `handleCreateRoot`、keyboard command 或既有 permission guard。

## 3. Acceptance Criteria

- AC-001：1440px 與 1024px 心智圖工具列的 create-root selector 數量為 0。
- AC-002：1440px、1024px 與 390px 邊界均不出現快捷鍵提示文字。
- AC-003：關聯線與縮放控制仍可見，且空畫布首個任務 fallback 保留。
- AC-004：以鍵盤 `Enter` 建立 root 的流程仍可完成；`Tab` 建立子任務與 `Delete` command source contract 保留，並由既有 mindmap keyboard regression 持續覆蓋。
- AC-005：browser console、page error、request failure 與可見 runtime error 均為 0，390px 不新增 document overflow。

## 4. Spec Impact / Release Boundary

分類：`Intentional replacement / mindmap-only visual cleanup`。不新增 ADR，不改 schema、storage shape、API、permission 或 release；本輪僅完成 local implementation 與 QA/QC，正式交付需另走 release gate。
