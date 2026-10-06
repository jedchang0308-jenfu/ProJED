# DEV-133 執行邊界補充（2026-09-30；舊方案歷史證據）

> **2026-10-01：本文件的 OAuth B0／B1 與正式 OAuth Client 前置已由 [ADR-053 Rev 3](../decisions/ADR-053-quick-task-cross-origin-account-link.md)、[SPEC-133 Rev 3](../specs/SPEC-133-quick-task-shared-identity-sync.md) 及 [QA 新版 N01～N10](QA-DEV-133-quick-task-shared-identity-sync.md) 取代。** 以下保留當時操作與結果，不代表目前仍須註冊 Client、補 Android Gate 或已完成新版驗收。 架構定案與 2026-10-01 hosted metadata 查證見 SPEC-133 §2；本頁不新增產品 PASS。

使用者已取消 Android 實機驗收，並要求改以正式環境驗證。使用者後續明確核准在已知風險下繼續；原先含全域 PostgREST hook 的 migration 被拒絕後，已改成只作用於 quick-task 資料表與既有 quick RPC 的窄化版本，並成功套用至 ProJED_TEST。正式環境仍未變更。

目前可確認的結果是：本機 Slice A 驗證、OAuth mock 10/10、TEST 桌面首次 consent／callback／same-user／refresh 部分通過；TEST 已補上 DEV-122 quick RPC 與窄化 B1 boundary。以既有 staging user 加 synthetic claims 執行的 hosted matrix：allowlisted client RPC 寫入交易回滾 PASS、unlisted client 被 trigger 拒絕 PASS、一般 first-party RPC PASS、OAuth client 直接讀 unplaced table 回傳 0 PASS。真實 OAuth client/token、live denial、正式設定、正式部署與正式功能驗收仍未完成。程式端 `VITE_QUICK_TASK_OAUTH_RPC_ENABLED` 已加入並保持關閉。

這份補充不能把桌面結果升格為 Android 或真實 OAuth token 證據。當時原方案仍缺正式 OAuth client 註冊與真實 token 驗收；此依賴已被 2026-10-01 的各自登入方案取消。TEST v2 與 synthetic matrix 有局部證據，但 v2 只限制 quick-task 相關表，不是整個 ProJED API 的權限隔離；空表 SELECT 回 0 也不足以證明隔離。既有 allowlist trigger 位於 INSERT 路徑，不證明 receipt replay 同樣檢查 client。這些結果不宣稱舊 B1 或整體 DEV-133 完成。已套用 migration 保留歷史；後續按新契約以 forward-only 修正收斂，不能以刪除 migration 或改寫資料復原。
