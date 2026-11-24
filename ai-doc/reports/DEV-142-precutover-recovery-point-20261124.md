# DEV-142 切流前恢復基線（2026-11-24）

- 恢復點：`DEV142-PRE-CUTOVER-20261124-214053`；建立時間：2026-11-24 21:40:53（Asia/Taipei）。
- 本機包：`output/dev142-precutover-recovery-20261124/`；機器清單：`manifest.json`，個別 bundle checksum 見 `code-recovery.json`。
- 人類原文：「我要執行正式資料及業務切流，請先在此建立一個可恢復點」。正式資料／業務切流已授權；本步先保存現況，沒有執行正式切流。

**程式／部署基線及正式業務資料加密備份已建立，43 張業務表的逐欄封存還原核對通過；修正投影與父子匯入順序後，新目標同契約的45表隔離匯入亦通過。** 原始失敗收據保留；尚非正式 Cloud SQL 匯入或切流驗證，不包含整套 Supabase Auth／平台環境的還原，也不是停寫後的最終切流快照。

## 2026-11-24 目標投影與隔離還原修正

原加密備份與DPAPI key均未改寫。本輪輸出另存 `output/dev139-dev104-projection-20261124/`，不覆蓋原恢復包的機器清單或失敗收據。

- 根因一：DEV-104／commit `e2fee56` 已移除收藏功能與 `collect_task`。移轉投影僅排除此退場值；owner 固定能力及缺省角色沿現行產品契約，自訂角色／明確空權限保留，未知權限不過濾。沒有重啟收藏或修改來源資料／目標約束。
- 根因二：真實來源的 `depth/path` 與 `parent_id` 順序不一致，分批匯入時父項落在後批。已改依同看板 parent 圖排序，原欄位不變、立即FK保留；缺父、跨 scope、重複 ID 與循環均拒絕。
- 真實備份重放：23:10:33（Taipei），既有 importer 與完整45表契約匯入隔離PG18，101個FK及提交後重連digest一致。刻意注入未知權限仍被原精確CHECK拒絕，rollback後所有受管表仍空，再做正常完整匯入成功；原始／衍生／目標digest分開記錄。證據：`data-restore-receipt.json`。
- 原先 retired capability、舊owner能力與父子批次的三個有效失敗分別保留在舊恢復包及新輸出，不以本輪PASS改寫。全部正式資料、舊 writer／網址／PWA不變；正式窗口仍須停寫後取最終snapshot。
- 必要本機驗證：migration unit24、S2 unit541、S3 unit175、strict同版本PG宣告overlay的S2／S3與affected ESLint通過。原 sandbox 因loopback EACCES失敗保留；一個shutdown fixture在請求未到owned server時無限等候，已補有界請求與錯誤收尾，正常／stalled shutdown四案例通過。這是RD自查。來源 `7d239c91b5233fcd427d23aea47c06cdcb44389b` 的[CI45423509034](https://github.com/jedchang0308-jenfu/ProJED/actions/runs/45423509034)兩jobs SUCCESS，實際PG／HTTP75、snapshot67及OCI23收據已取回。候選來源包／checksum／428份前版資產已核對，但Cloud Build在任何上傳／提交前遇SDK `Reauthentication failed`，等待更新既有Google登入；不重跑有效CI或備份。

## 2026-11-25 私人候選與正式來源唯讀盤點

- 來源 `7d239c91b5233fcd427d23aea47c06cdcb44389b` 的CI45423509034與Cloud Build `b9b70c73-0432-40d7-b40a-0a741e58352d`成功；私人revision `projed-prod-dev139-7d239c9`維持0%、原`projed-prod-00007-cpt`維持100%。私人HTTP36與analysis generation6空佇列execution通過，內容／模型請求0。
- 正式來源與中央目標只執行一次READ ONLY `plan`：來源snapshot `0adad950…86b2`與本報告的隔離投影／還原相同，中央目標為空。沒有apply、正式資料搬入、來源停寫或新writer。
- 本次最長20分鐘的來源reader LOGIN完成後立即恢復NOLOGIN；最終讀回活躍連線0、可寫relation 0。具名一次性Cloud Run Job依UID刪除並讀回404。
- 最終收據 `output/dev139-dev104-projection-20261124/final-precutover-verification.json` 核對兩個舊origin的四份metadata與本恢復點逐位元組一致；Recovery Scheduler仍PAUSED，原migration Job仍只有1次歷史execution。PWA十組來源輸入未變，沿用既有PWA18證據；13小時案例為時鐘模擬，未冒稱真實隔夜或真使用者Session／會議驗收。

## 2026-11-24 資料備份與恢復補驗

- 原生 app schema 備份：22:08:13–22:08:30（Taipei），`source-app.pgdump.aes`，保存 `public`／`private` 的資料、schema、functions、constraints 與 RLS policies；不匯出 Supabase Auth 密碼、登入 token 或平台全域角色。原生匯出使用其自身的一致性 snapshot。
- 移轉投影備份：22:08:31（Taipei），`migration-snapshot.json.gz.aes`；沿既有 `readSource`、型別解析與最小 Google 身分投影，在另一個 REPEATABLE READ READ ONLY 交易保存。兩者依序取得，不聲稱是同一 MVCC 時點；來源仍可正常寫入，正式停寫後須另取最終一致快照。
- 檔案保護：AES-256-GCM，nonce／驗證 tag 與逐檔 SHA256 已核對；解密 key 由 Windows CurrentUser DPAPI 保護，目錄限本帳號與 SYSTEM。`data-key.dpapi` 必須連同備份保留，解密依賴目前 Windows 帳號／DPAPI 環境；目前只保存在此電腦，不能宣稱已有可攜的異地災難備份。來源 credential 僅經程序記憶體使用，沒有 payload 檔案。
- 實際逐欄還原：22:18:46（Taipei），在自建 PostgreSQL 18 中從原生 archive 抽取全部 43 張表的 COPY 資料，還原至隔離文字欄位封存層，再逐表讀回；每欄原值、SQL NULL、筆數與排序無關的 digest 全部一致。這證明封存資料可取回，不冒充原生應用／權限約束或新 Cloud SQL 目標已還原。原始結果與營運數量留 `native-data-restore-receipt.json`。
- 新目標相容性：另沿正式同一 `TABLES`／`insertSnapshot` 與既有 migrations，以最小 importer 在隔離 schema 真實匯入。第一個產品失敗為 `IMPORT_BOARD_ROLE_PERMISSIONS_FAILED_BOARD_ROLE_PERMISSIONS_CAPABILITIES_CHECK1`：原資料含 `collect_task`，新約束未收錄。交易未提交；未刪除原權限、改資料、放寬約束或標成 PASS。原始結果留 `data-restore-first-failure.json`，正式匯入須先修正並重驗此契約。
- 私人檔案盤點：來源所有 Storage metadata 物件數為零，`meeting_capture_segments` 亦零；唯一 `meeting-audio` 桶為私人。沒有可搬／還原的受管音訊內容，因此未製造假檔案驗收。未直接列舉 provider 實體 object store，不宣稱不存在 metadata 之外的孤兒物件；正式窗口再核對是否有新上傳。證據為 `source-post-backup-readback.json`。
- 來源 reader 曾以最長 20 分鐘到期限制開放本次唯讀匯出，完成即恢復 NOLOGIN；原連線上限 1、讀取範圍與禁止寫入保留。第一輪並行 snapshot／pg_dump 因此上限失敗，已改成依序匯出，沒有增加連線數。所有本機自建 DB 已正常停止、精確目錄清除且五個埠釋放；加密備份與有效／失敗收據保留。

最新資料恢復範圍與 checksum 見同目錄 `data-recovery-manifest.json`。原 `manifest.json` 保留 21:40 程式／部署基線的當時結果；後續資料補驗不改寫該原始收據。零留存、模型停用、原資料／網址／PWA不變；沒有正式停寫、搬入或切流。

## 已保存與實際驗證

| 專案 | 遠端主線 SHA | 工作樹 HEAD |
|---|---|---|
| ProJED | `1437a25c74e10daf8530c3b099742297712175ce` | `7d311fba6bafc6db4c11c34d5f052c3ed86b6a5b` |
| Jenfu-Platform | `728e16919921985969273af406753675dc6ded3d` | `728e16919921985969273af406753675dc6ded3d` |
| OrgMaster | `3683cac1c2705d0c01a344f30ea81b6ec5308c21` | `3683cac1c2705d0c01a344f30ea81b6ec5308c21` |

三個專案各建立本機 `codex/recovery-dev142-20261124-214053-{main,worktree,validated}` 分支參考及自足 Git bundle；沒有推送恢復分支。每包已在獨立 bare repository 還原、核對三個 ref 並通過 `git fsck --full --no-dangling`，原工作樹未切換／覆寫。Platform 七份既有未追蹤執行輸入另按原路徑保存並核對 checksum。

恢復點建立時的ProJED已驗程式為 `ea09b133e4576b042a09af31d91069cd36f12391`；後續修正來源 `7d239c91b5233fcd427d23aea47c06cdcb44389b` 已另經CI、Cloud Build及私人候選驗證，不改寫恢復點原始清單。文件HEAD／遠端main分別記錄，文件更新不冒充已驗映像。七個自有registry映像的精確digest經provider讀回存在；目前只保留遠端映像及本機digest記錄，沒有離線匯出映像或變更保留政策。

原前端 release `20261123035148-4604c0` 的 428 個檔案已逐檔核對並封存為 `original-hosting-assets.zip`；zip CRC／內容 checksum 通過，四個現役舊 origin metadata 與封存一致。Hosting release API 回報 403，因此未取得 provider version ID；不能宣稱 Hosting 一鍵 rollback 已驗證。

## 部署落點

- ProJED `projed-prod-00007-cpt` 仍100%；最新 `projed-prod-dev139-7d239c9` 私人tag保持0%，舊私人候選映像亦保留。00007是切流前基線，未證明可作新資料／Session啟用後的相容回退版本。
- Platform `jenfu-platform-prod-1178f25a6eff`、OrgMaster `orgmaster-prod-6a8b73ff1c2d` 仍為現役；原專案私人 relay `projed-legacy-entry-00001-hgp` 保留。
- 具名 services／revisions／映像／IAM、migration 與 analysis Job 狀態均記於 `runtime-recovery.json`；沒有匯出 credential 或環境變數 payload。Recovery Scheduler 維持 PAUSED，Gemini／RAG 維持停用及既有零留存要求。

## 初次基線的資料觀察與持續限制

- Supabase `knodlkxqpcqyrtgwpdst` 為 ACTIVE_HEALTHY；初次只讀觀察 2026-11-24 13:38:05 UTC、WAL LSN `2B/7D000000`、public ordinary tables 37、來源 reader 為 NOLOGIN。這些 catalog 值不是 snapshot 或 PITR 可用證明；後續 app 資料匯出與補驗見上節，來源停寫 fence 尚未啟用。
- 來源受管備份頁要求另行登入，現有 connector 無備份清單能力；受管備份／PITR 狀態仍未知，並非證明沒有備份。已另外取得上節的自有 app 邏輯備份，不把它聲稱為整套 Supabase 平台備份。
- 中央共用 Cloud SQL 已設定 backup／PITR，讀回五份既有成功備份；最新 ID `1795460400000`，2026-11-24 05:23（Taipei）完成。本次未新建備份或演練 restore；`earliestRecoveryTime` 未提供，不能保證特定恢復時點。這是共用 instance，不能整庫還原影響其他 app。

## 恢復方式與下一步

1. 程式恢復：在新目錄 clone 對應 `code/*.bundle`，選上述保存的 ref；不 reset 現有工作樹。bundle 與輸入的 SHA256 必須符合清單。
2. 使用資料恢復包時，先驗 checksum 與 DPAPI 解密，再沿原生 archive 取回 app 資料；逐欄封存還原可依 `verify-data-restore.py --native-archive` 重現。目標匯入需使用本輪已驗投影與父子排序的來源／產物；舊映像仍會重現原失敗，不能以本機PASS推定已部署。正式窗口停寫後另固定最終 snapshot 與檔案清單，現在的快照不涵蓋後續新增內容。
3. 尚未啟用新 writer 的失敗，先核實目標是否提交／有無新增寫入，再沿 SPEC-142 恢復原路徑；未知結果先讀回。
4. 新 writer 已有新增資料後，優先讓相容程式沿用同一新庫；不能只解除 Supabase fence 或切回舊庫。反向資料 rewrite、down migration、破壞性清空及共用整庫 restore 不隱含於一般應用回退。
5. 下一步沿 SPEC-142／SPEC-139 既定範圍續行；保留原網址與 PWA，最後新網址另階段。有效證據沿原受測輸入重用，不新增 required gate。

本步實際結果：沒有正式業務資料搬入、來源停寫、新 writer 啟用、流量切換、模型啟用或新增雲端 IAM。固定來源包的Cloud Build、私人候選、HTTP／空佇列背景及正式來源唯讀plan均已完成；下一步依SPEC-142排定低使用量正式窗口，停寫後另取最終快照再執行正式匯入與核對。PR #33 ready通知曾被自動核准審查拒絕（理由為未認定該PR具名通知授權），保持draft；此通知不是候選或資料安全前置，不追加required gate。
