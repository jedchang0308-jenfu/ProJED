# SPEC-104：完整移除收藏任務功能

- 狀態：Implemented / Local QA-QC Passed / 未 Release
- 日期：2026-09-04
- Spec Impact：`Intentional replacement / feature retirement`
- 取代：DEV-093、DEV-103 的全部現行契約

## 1. 決策

使用者決定停止收藏任務功能，且明確要求連同原始 DEV-093 收藏／典藏能力全部移除。產品不再提供收藏任務資產、收藏看板或從任務發起收藏的入口。

## 2. 完成狀態

- UI：移除工作區收藏看板、側欄／頂列 context、任務明細與右鍵選單動作、收藏確認與唯讀詳情。
- Domain：移除 collection record type、store、snapshot、projection、journal、pending guard、action id與 permission capability。
- Provider：移除 Local Test、Firebase、Supabase 的 collection service與 workspace／board delete-impact coupling。
- Database source：刪除 DEV-093／DEV-103 migration與 generated DB function／column types。
- Verification：刪除兩個 DEV 的專屬 scripts與 package commands，改由本 DEV 驗證「功能不存在」及既有流程不回歸。
- Documentation：舊 SPEC／QA／QC／predeploy退場；`dev_task.md`與`documentation_map.md`保留撤銷決策與追溯。

## 3. 保留能力

- 一般任務建立、編輯、完成、封存、還原與永久刪除。
- 一般看板、清單、心智圖、甘特與日曆模式。
- 任務追蹤副本與工作台搬移。
- 紀錄庫中的會議紀錄與個人工作紀錄。

## 4. 資料處理

- Shared local與linked remote migration history均未套用 DEV-093／103，因此不得執行遠端 rollback、migration repair或reset。
- Local Test以 `meeting`／`work_log` allowlist讀取紀錄；若舊瀏覽器測試資料仍含已移除的record family，讀取時從Local Test storage清除。
- Firebase／Supabase讀取同樣只接受 `meeting`／`work_log`；本變更不主動刪除遠端資料。

## 5. 驗收條件

1. `src`、`scripts`、`package.json`與`supabase`不含收藏功能專屬識別、檔案或命令。
2. 工作區側欄、頂列、紀錄庫、任務明細與任務選單無收藏入口。
3. 一般任務、看板與meeting／work_log流程可正常使用。
4. TypeScript、test build、受影響回歸與實際browser驗證通過。
5. 不執行共享／遠端schema或資料mutation，不新增替代收藏功能。

## 6. 重新啟動條件

未來若重新提出收藏需求，必須建立新的DEV與產品契約，不得直接恢復 DEV-093／103；先重新確認資料所有權、保留政策、入口與實際使用價值。
