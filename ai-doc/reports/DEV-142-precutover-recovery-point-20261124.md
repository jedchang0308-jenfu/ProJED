# DEV-142 切流前恢復基線（2026-11-24）

- 恢復點：`DEV142-PRE-CUTOVER-20261124-214053`；建立時間：2026-11-24 21:40:53（Asia/Taipei）。
- 本機包：`output/dev142-precutover-recovery-20261124/`；機器清單：`manifest.json`，個別 bundle checksum 見 `code-recovery.json`。
- 人類原文：「我要執行正式資料及業務切流，請先在此建立一個可恢復點」。正式資料／業務切流已授權；本步先保存現況，沒有執行正式切流。

**程式／部署恢復基線已驗證；正式資料 snapshot 尚未建立，來源備份與檔案恢復尚未確認。這不是完整資料恢復點，也不是切流就緒證明。**

## 已保存與實際驗證

| 專案 | 遠端主線 SHA | 工作樹 HEAD |
|---|---|---|
| ProJED | `1437a25c74e10daf8530c3b099742297712175ce` | `7d311fba6bafc6db4c11c34d5f052c3ed86b6a5b` |
| Jenfu-Platform | `728e16919921985969273af406753675dc6ded3d` | `728e16919921985969273af406753675dc6ded3d` |
| OrgMaster | `3683cac1c2705d0c01a344f30ea81b6ec5308c21` | `3683cac1c2705d0c01a344f30ea81b6ec5308c21` |

三個專案各建立本機 `codex/recovery-dev142-20261124-214053-{main,worktree,validated}` 分支參考及自足 Git bundle；沒有推送恢復分支。每包已在獨立 bare repository 還原、核對三個 ref 並通過 `git fsck --full --no-dangling`，原工作樹未切換／覆寫。Platform 七份既有未追蹤執行輸入另按原路徑保存並核對 checksum。

ProJED 已驗程式為 `ea09b133e4576b042a09af31d91069cd36f12391`，與文件 HEAD／遠端 main 分別記錄；文件更新不冒充已驗映像。七個自有 registry 映像的精確 digest 經 provider 讀回存在；目前只保留遠端映像及本機 digest 記錄，沒有離線匯出映像或變更保留政策。

原前端 release `20261123035148-4604c0` 的 428 個檔案已逐檔核對並封存為 `original-hosting-assets.zip`；zip CRC／內容 checksum 通過，四個現役舊 origin metadata 與封存一致。Hosting release API 回報 403，因此未取得 provider version ID；不能宣稱 Hosting 一鍵 rollback 已驗證。

## 部署落點

- ProJED `projed-prod-00007-cpt` 仍 100%；`projed-prod-dev139-ea09b13` 私人 tag 保持 0%。00007 是切流前基線，未證明可作新資料／Session 啟用後的相容回退版本。
- Platform `jenfu-platform-prod-1178f25a6eff`、OrgMaster `orgmaster-prod-6a8b73ff1c2d` 仍為現役；原專案私人 relay `projed-legacy-entry-00001-hgp` 保留。
- 具名 services／revisions／映像／IAM、migration 與 analysis Job 狀態均記於 `runtime-recovery.json`；沒有匯出 credential 或環境變數 payload。Recovery Scheduler 維持 PAUSED，Gemini／RAG 維持停用及既有零留存要求。

## 資料恢復缺口

- Supabase `knodlkxqpcqyrtgwpdst` 為 ACTIVE_HEALTHY；只讀觀察 2026-11-24 13:38:05 UTC、WAL LSN `2B/7D000000`、public ordinary tables 37、來源 reader 仍 NOLOGIN。這些 catalog 值不是一致性 snapshot 或 PITR 可用證明；本次未匯出業務資料、未啟用停寫 fence。
- 來源備份頁要求另行登入，現有 connector 無備份清單能力；來源受管備份狀態未知，並非證明沒有備份。尚未建立／核對來源 Storage 檔案備份。
- 中央共用 Cloud SQL 已設定 backup／PITR，讀回五份既有成功備份；最新 ID `1795460400000`，2026-11-24 05:23（Taipei）完成。本次未新建備份或演練 restore；`earliestRecoveryTime` 未提供，不能保證特定恢復時點。這是共用 instance，不能整庫還原影響其他 app。

## 恢復方式與下一步

1. 程式恢復：在新目錄 clone 對應 `code/*.bundle`，選上述保存的 ref；不 reset 現有工作樹。bundle 與輸入的 SHA256 必須符合清單。
2. 正式停寫／搬遷前，先補可用的 ProJED 資料及私人檔案恢復依據，再固定一致性 snapshot；本機 Git／映像／舊前端封存不能替代資料備份。
3. 尚未啟用新 writer 的失敗，先核實目標是否提交／有無新增寫入，再沿 SPEC-142 恢復原路徑；未知結果先讀回。
4. 新 writer 已有新增資料後，優先讓相容程式沿用同一新庫；不能只解除 Supabase fence 或切回舊庫。反向資料 rewrite、down migration、破壞性清空及共用整庫 restore 不隱含於一般應用回退。
5. 下一步沿 SPEC-142／SPEC-139 既定範圍續行；保留原網址與 PWA，最後新網址另階段。有效證據沿原受測輸入重用，不新增 required gate。

本步實際結果：沒有正式業務資料搬入、來源停寫、新 writer 啟用、流量切換、模型啟用或雲端權限變更。
