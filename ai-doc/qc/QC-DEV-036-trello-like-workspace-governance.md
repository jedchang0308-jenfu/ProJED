# QC-DEV-036: Trello-like Workspace Governance

關聯 DEV：DEV-036
關聯 SPEC：`ai-doc/specs/SPEC-036-trello-like-workspace-governance.md`
關聯 QA：`ai-doc/qa/QA-DEV-036-trello-like-workspace-governance.md`
狀態：Local Automated QC Passed / DB unchanged
執行日期：2026-06-29

## QC 結論

DEV-036 Phase 1 已通過本機自動化 QC。此次交付完成 Trello-like Workspace create / navigation MVP：使用者可從 Sidebar 建立多個 Workspace，建立流程採 backend-success-first，Home 以 Workspace 分組呈現 Boards，空 Workspace 可直接建立 Board。

本輪未新增 Supabase migration，未修改 RLS、Workspace membership、Board guest-like access、billing 或 production deployment。

## 驗證結果

| Gate | 結果 | 證據 |
|---|---|---|
| DEV-036 static | Pass | `npm.cmd run verify:dev-036-trello-like-workspace-governance`，24/24 |
| DEV-036 browser | Pass | `npm.cmd run verify:dev-036-trello-like-workspace-governance-browser` |
| DEV-035 workspace delete static | Pass | `npm.cmd run verify:dev-035-workspace-delete-persistence-fix`，22/22 |
| DEV-035 workspace delete browser | Pass | `npm.cmd run verify:dev-035-workspace-delete-browser` |
| DEV-030 sidebar rename static | Pass | `npm.cmd run verify:dev-030-sidebar-rename-contract`，9/9 |
| DEV-030 sidebar rename browser | Pass | `npm.cmd run verify:dev-030-sidebar-rename-contract-browser` |
| DEV-025 board move | Pass | `npm.cmd run verify:dev-025-project-workspace-transfer` |
| DEV-026 board share UI | Pass | `npm.cmd run verify:dev-026-trello-like-board-share-ui`，15/15 |
| TypeScript | Pass | `npm.cmd exec tsc -- --noEmit` |
| Build | Pass | `$env:NODE_OPTIONS='--max-old-space-size=4096'; npm.cmd run build` |

## Browser 覆蓋

- Sidebar `新增工作區` 入口可開啟 dialog。
- 空白名稱無法送出。
- 建立 `研發部` 後 active workspace 指向新 Workspace，active board 清空，view 保持 `home`。
- 重新整理後新 Workspace 仍存在。
- 在空 Workspace 的 `建立看板` CTA 建立 Board，Board 留在該 Workspace 下。
- 可建立第二個 Workspace `生產部`，不限制為兩個固定 Workspace。
- 既有 Board 仍可見，Board share / move 相鄰功能未被本輪變更破壞。
- Mobile 390px viewport smoke passed，截圖：`output/playwright/dev-036-workspace-governance-mobile.png`。

## 已修正的驗證中發現問題

- 初版 browser verifier 發現 local-test seed 在 reload 後會把 `home + no activeBoard` 狀態帶回基準 board view。
- 已修正 `seedLocalTestEnvironment`：`home` view 可恢復，且在沒有 active board 時移除 `projed-last-board`，不自動塞回基準 board。
- 已將此行為加入 DEV-036 static verifier，避免後續回歸。

## DB / Production 邊界

- 不需要 Supabase DB QC：Phase 1 沒有新增 migration，也沒有改 RLS / membership。
- 不需要 billing QC：本輪明確不新增 Workspace billing、seat、quota 或付費邏輯。
- 未部署 production；若要部署，需另走 `deployment-release-gate`。

## 殘餘風險

- 遠端 Supabase 的 `create_tenant_with_owner` 實際 create 權限仍應在部署前 smoke test，但本輪未改其 RPC / RLS。
- Phase 2 若新增 Workspace settings / member governance，需要補 Workspace owner/admin/member/viewer DB role QC。
- Board guest-like access 的長期模型仍屬 Deferred Decision，不在 Phase 1 宣告完成。
