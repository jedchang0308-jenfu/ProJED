# QC-DEV-034: App 快速啟動、加入主畫面與 local-first 快記

日期：2026-06-29
狀態：Browser QC Passed / Local-first scope
關聯 DEV：DEV-034
關聯規格：`ai-doc/specs/SPEC-034-fast-start-pwa-install-guidance.md`

## 驗證範圍

- PWA 更新基礎：build 需產出 `manifest.webmanifest`、`dist/sw.js` 與 workbox runtime。
- 加入主畫面 UX：設定頁需提供 `快速開啟` 入口，並顯示平台分流指引，不暴露技術詞。
- QuickCaptureShell：未登入或完整 App 載入前，使用者可先輸入快記並保存到本機。
- local-first pending queue：快記需保存為 `captureStatus=untriaged`、`syncStatus=pending` 的私人 `InboxItem`。
- UI QC：手機與桌機不得水平溢位；快記面板不得遮擋後續設定入口。

## 驗證結果

| Gate | Result | Evidence |
|---|---|---|
| Static contract | Pass | `npm.cmd run verify:dev-034-pwa-install-guidance`，24/24 |
| Browser smoke | Pass | `npm.cmd run verify:dev-034-pwa-install-guidance-browser` |
| TypeScript | Pass | `npm.cmd exec tsc -- --noEmit` |
| Lint | Pass | `npm.cmd run lint -- --quiet` |
| Production build | Pass | `npm.cmd run build` |

## Browser Evidence

- `output/playwright/dev-034-quick-capture-before-login-mobile.png`
- `output/playwright/dev-034-pwa-install-guidance-desktop.png`
- `output/playwright/dev-034-pwa-install-guidance-mobile.png`

## QC 判定

Pass.

DEV-034 的本輪 local-first 範圍已可驗證：

- 使用者不需手動設定 PWA 快取與更新。
- 加入主畫面指引可在設定頁永久回查。
- 未登入或完整資料載入前可先存快記。
- 快記會保留在本機 pending queue，不會因 workspace / board / records / members 尚未載入而阻塞輸入。

## 殘留風險與範圍外

- 本輪不宣告正式雲端 Inbox 完成。
- 本輪不宣告跨裝置同步完成。
- 本輪不宣告 `InboxItem` 轉正式 `TaskNode` 完成。
- 以上項目接續 `SPEC-002` 的私人 Inbox / 我的今日 / 轉任務後續交付。
