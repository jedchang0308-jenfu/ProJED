# DEV-133 執行邊界補充（2026-09-30）

使用者已取消 Android 實機驗收，並要求改以正式環境驗證。使用者後續明確核准在已知風險下繼續；原先含全域 PostgREST hook 的 migration 被拒絕後，已改成只作用於 quick-task 資料表與既有 quick RPC 的窄化版本，並成功套用至 ProJED_TEST。正式環境仍未變更。

目前可確認的結果是：本機 Slice A 驗證、OAuth mock 10/10、TEST 桌面首次 consent／callback／same-user／refresh 部分通過；TEST 已補上 DEV-122 quick RPC 與窄化 B1 boundary。以既有 staging user 加 synthetic claims 執行的 hosted matrix：allowlisted client RPC 寫入交易回滾 PASS、unlisted client 被 trigger 拒絕 PASS、一般 first-party RPC PASS、OAuth client 直接讀 unplaced table 回傳 0 PASS。真實 OAuth client/token、live denial、正式設定、正式部署與正式功能驗收仍未完成。程式端 `VITE_QUICK_TASK_OAUTH_RPC_ENABLED` 已加入並保持關閉。

這份補充不能把桌面結果升格為 Android 或真實 OAuth token 證據；正式部署前仍須完成正式 OAuth client 註冊、正式環境設定與 release gate。B1 的 hosted schema／synthetic matrix 已有證據，但不宣稱整體 DEV-133 完成。
