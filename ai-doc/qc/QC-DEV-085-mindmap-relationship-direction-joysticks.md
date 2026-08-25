# QC-DEV-085：心智圖關聯線方向搖桿

- 日期：2026-08-25
- 角色：QC（依 QA-DEV-085 既定案例做事實驗證；未在 QC 階段修改產品程式）
- 結論：`QC PASS / 未 Release`
- 關聯：DEV-085、DEV-077 更正、DEV-027E

## 使用者意圖校正

使用者澄清：先前紅線只要求刪除控制 UI 多畫的一條中央線，不是移除控制臂、導引關係與方形控制點。現行驗收因此固定為：選取關聯線時保留兩個圓形端點、兩條「端點 → 方向搖桿」控制臂與兩個方形方向搖桿；不得出現「搖桿 1 → 搖桿 2」中央導引線或舊重複控制點。

## 事實證據

| Gate | 結果 | 證據 |
|---|---:|---|
| DEV-085 failure-first | 2 PASS / 5 FAIL | 修正前可重現缺少方向控制 UI 與首拖 fallback 契約。 |
| DEV-085 static | 9 / 9 PASS | `npm run verify:dev-085-mindmap-relationship-direction-joysticks`；涵蓋 44px line hit-window 與兩端各自外側框線 contract。 |
| DEV-077 corrected regression | 6 / 6 PASS | 僅移除中央 guide；端點、控制臂與方向搖桿保留。 |
| DEV-027E relationship regression | 24 / 24 PASS | 關聯線 path、label、endpoint 與 storage 契約相容。 |
| DEV-027G system health | 97 / 97 PASS | 心智圖 owner、座標與 bundle 契約通過。 |
| TypeScript / targeted ESLint | PASS | `tsc --noEmit` 與 DEV-085 目標檔 ESLint 無錯誤。 |
| `build:test` | PASS | Vite test build 完成；僅有既有 Browserslist 資料過期提示。 |
| Rendered browser | PASS | `output/playwright/dev-085-mindmap-relationship-direction-joysticks/result.json` |
| 人工截圖檢查 | PASS | `desktop-selected.png`、`desktop-drag-preview.png`、`laptop-selected.png`、`mobile-boundary.png`。 |

## Browser QC 判定

- 選取前方向搖桿數量為 0；選取後 endpoint=2、direction arm=2、direction joystick=2、center guide=0、legacy duplicate control=0。
- 起點搖桿拖曳時 `c1` 在 pointerup 前即時更新；`c2` 維持原計算位置，沒有首拖曲線塌縮。
- pointerup 後兩個有限控制點已保存；reload 後 `c1/c2` 與拖曳完成值一致，from/to node identity 不變。
- 中鍵與右鍵不得改寫 geometry；拖曳途中按 Escape 可還原 snapshot。
- 100% 與 110% zoom 下命中區皆約 28 CSS px；map-local 搖桿座標沒有因 zoom 被重寫。
- 1440×900、1024×768 均無 visible error；1024 document overflow=0。
- 390×844 維持既有 mobile mindmap 不顯示邊界，document overflow=0；本輪沒有宣稱實機手機操作通過。
- console error=0、page error=0、request failure=0。
- 關聯線本體 hit window：曲線／直線 fallback 皆為 44 CSS px；已移除重複 translate，並改為完整 click 後才提交 selection。拖成曲線後實測 window centerline 至可見 path 距離 `0.24px`；中心線點擊及由中心沿法線偏移 18px 的內側邊緣點擊皆成功選取。人工截圖確認透明 window 沒有改變可見線寬或增加視覺雜訊。
- 端點外側定位：右分支→左分支 fixture 故意保存相反 anchor xRatio 後，來源起點仍貼右框線、目標終點仍貼左框線；兩端 screen-space 誤差各 `0.0044px`，Y 坐標均在節點高度內。
- 外側搖桿可用性：預設 control offset 上限 72px，來源右側 28px 搖桿未被樣式面板遮住，真實滑鼠拖曳可在 pointerup 前更新 c1 並保留 c2。

## Runtime 與交付邊界

QC 重用同專案既有 `http://localhost:4000/`；驗證時 Vite listener 為 `node.exe` PID 22732。該 runtime 不是本 DEV 啟動，故未停止或接管；本次自有 Playwright sessions 已關閉。未執行 commit、push、PR、merge、deploy、production data 或 release。
