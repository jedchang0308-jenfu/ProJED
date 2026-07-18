# LEVEL4 Production Deploy Evidence - 2026-07-18 Task Save and Hover Preview

## 結論

Firebase Hosting production deploy 已完成，Level 4 正式站 smoke、線上產物 provenance 與登入後功能抽查均通過。

## Release Scope

- Branch: `codex/task-save-hover-release-20260718-151753`
- Artifact commit: `1c7c060cc6d90eb85a2653f514097ab4e95e4be6`
- Base / rollback reference: `e2f6956` on `codex/mobile-action-menu-hotfix-20260718`
- Worktree: clean release worktree isolated from the dirty main workspace
- Firebase project: `projed-cc78d`
- Production URL: `https://projed-cc78d.web.app`
- Risk lane: Lane 1, UI and isolated application logic

Release 只包含 task details save / close 與 desktop ordinary hover preview 的 6 個檔案，不包含主工作區的其他未提交修改。

## Verification

- DEV-033 task details browser: passed
  - Save 位於 X 左側且同列
  - Save 後顯示「已儲存」
  - X 關閉前 flush pending note，重開後資料保留
- Desktop ordinary hover browser: passed
  - Parent card、child checklist row、column header 皆由 exact innermost surface 獨佔藍框
  - Child hover 會壓制 parent ring
  - Blank canvas 無 hover ring，drag active 時停用 ordinary hover ring
- DEV-055 desktop drag browser: B01-B16, 16/16 passed
- Production build: passed
- Level 2 local production artifact smoke: passed; service worker ready and controlling
- Level 3 Firebase preview: passed
  - URL: `https://projed-cc78d--level3-smoke-o1na5wft.web.app`
  - Critical console errors, page errors, and critical failed requests: none
- Level 4 production smoke: passed
  - App shell non-empty
  - Critical console errors, page errors, and critical failed requests: none

## Artifact Provenance

Production HTML loads:

- JS: `assets/index-GlbrwSUo.js`
  - SHA-256: `9DBB322147D065C28ABF8ECF8B5DE1D7E37D2F836A627AAE055C87027E763959`
  - Bytes: `392489`
- CSS: `assets/index-B9uwxfhq.css`
  - SHA-256: `93CC7376004F2BBF38DE9F5E3DA199E184A09FAD527578674BC78D62A6182C0C`
  - Bytes: `140028`

線上 JS / CSS 下載後 SHA-256 與本機 production `dist` 一致。

## Authenticated Production Check

沿用 Chrome 既有登入狀態，完成 read-only 抽查：

- 正式站已載入 `index-GlbrwSUo.js` 與 `index-B9uwxfhq.css`，新版更新提示消失。
- 開啟實際任務「任務卡要有儲存紐」，確認「儲存」位於 X 左側且垂直對齊。
- 關閉 modal 後只移動游標到該 child checklist row，當下僅該 task ID 出現既有 `2px inset` 淺藍框。
- 此抽查未編輯、儲存或拖曳正式資料。

## Known Non-Blocking Risks

- `npm ci` reports 44 inherited package vulnerabilities: 2 low, 19 moderate, 21 high, 2 critical. No dependency mutation was included in this release.
- `npm run verify:source` is blocked by 5 inherited production migration hash-stability failures already present in base `e2f6956`; this release has no Supabase or migration diff.
- Lint completed with warnings only; TypeScript, production auth mode, Supabase static, calendar feed, core regression, P9 edge function, staging env, production build and relevant feature suites passed.
- Browserslist data is 6 months old.

## Rollback

If a production regression is confirmed, roll Firebase Hosting back to the release built from `e2f6956` (`codex/mobile-action-menu-hotfix-20260718`) and rerun Level 4 smoke plus artifact hash comparison.
