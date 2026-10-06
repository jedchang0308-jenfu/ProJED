# QA-DEV-085 心智圖關聯線方向搖桿

日期：2026-08-25  
狀態：Executed／QA PASS／QC PASS／未 Release  
關聯規格：`ai-doc/specs/SPEC-085-mindmap-relationship-direction-joysticks.md`

## 驗證範圍與環境

- 目標：localhost:4000 心智圖、local-test fixture、可編輯帳號。
- Viewport：1440×900、1024×768；390×844 只驗既有 mobile boundary 與 document overflow。
- 證據：static JSON、browser artifact、selected／dragged／reloaded screenshots、console／page／request error arrays。
- 邊界：本機 UI 與 localStorage；不代表 production、真機或多人同步通過。

## FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策／建議測試 |
|---|---|---|---|---|---|
| 第一次拖一端時另一端一起塌陷 | 尚無 stored controls，fallback 用同一 pointer point | 曲線折回或變成異常尖角 | 比對 drag 前後 c1／c2 | P0 | 無 geometry fixture，拖 c1 後斷言 c2 不變 |
| 控制器與曲線錯位 | screen／world 座標混用 | 抓不到或拖錯位置 | zoom 前後 local style 與 path metadata | P0 | 50%～200% zoom geometry／hit target gate |
| knob 太小或隨 zoom 縮放 | 未使用 inverse scale | 低 zoom 無法操作，高 zoom 遮擋 | bounding box 尺寸 | P1 | 28×28 CSS px tolerance |
| 舊版視覺雜訊復活 | 恢復中央 guide 或重複 SVG／HTML knob | 畫布焦點被輔助線搶走 | DOM count＋selected screenshot | P1 | 只允許 2 arms／2 knobs，guide=0 |
| 非主按鍵開始拖曳 | pointer eligibility guard 漏接 | 中鍵 pan／右鍵 menu 被破壞或 geometry 誤寫 | middle／right drag negative case | P0 | 重用 DEV-084 guard regression |
| 拖曳取消仍保存 | snapshot／cancel owner 漂移 | 誤操作不可恢復 | pointercancel／Escape 前後 storage | P1 | cancel recovery case |
| reload 後形狀遺失 | localStorage 未寫或 sanitize 丟資料 | 使用者整理結果消失 | reload 後 c1／c2 equality | P0 | persistence case |
| control 與 endpoint 責任混淆 | handle dispatch 錯誤 | 任務被改連或 anchor 漂移 | fromId／toId、anchor 前後比對 | P0 | control drag 不得改 endpoint identity |
| visible error／viewport 遮擋 | drawer、scene、控制器 z-index 衝突 | 無法操作或看不到內容 | visible-error sweep、截圖、overflow | P1 | 1440／1024／390 matrix |
| 關聯線本體不易點擊 | window 重複套用 translate 而偏離曲線，或 pointerdown 先渲染搖桿使 pointerup／click 落到畫布 | 使用者在線上反而點不到，偏線位置才可選取 | 曲線中心線距離、中心 click、法線 18px 邊緣 click 與事件完成後 selection | P1 | window 統一 44px 並置中；完整 click 後才提交 selection，畫面線寬不變 |
| 關聯線端點落在節點內側 | 以兩端相對位置共同決定接線邊，或沿用 anchor `xRatio` | 跨畫布關聯線穿過樹狀內容，起點／終點不符合外側操作預期 | 比對 path endpoint 與兩端節點各自外側框線 | P0 | 依每端 branch direction 獨立固定 X；只保留 anchor Y |

## 測試案例

| ID | 操作 | 通過標準 | 證據 |
|---|---|---|---|
| QA-085-S01 | 執行 static verifier | selected-only、2 handles、2 arms、fallback pair、primary guard 契約全通過 | CLI JSON |
| QA-085-B01 | 建立無 controlPoints 的關聯線並選取 | endpoint=2、joystick=2、arm=2、guide=0 | selected screenshot／DOM count |
| QA-085-B02 | 拖曳 control-1 | c1 即時改變；c2、fromId、toId 不變 | before／after metadata |
| QA-085-B03 | 放開並 reload | localStorage 有兩點；reload path 相同 | artifact／reloaded screenshot |
| QA-085-B04 | zoom 前後檢查 | knob bounding size 26～30px；map-local coordinates 不被重寫 | geometry artifact |
| QA-085-B05 | middle／right 起手 | geometry、selection、storage 不變；既有 middle pan／right menu 可繼續 | negative artifact |
| QA-085-B06 | Escape／pointer cancel | relationship 恢復 drag start snapshot，無殘留 dragging owner | before／after storage |
| QA-085-B07 | 1024×768 | joystick 不被 style drawer／viewport 裁切，無 visible error | screenshot |
| QA-085-B08 | 390×844 | 維持 mindmap hidden boundary，document overflow ≤2px | screenshot／measurement |
| QA-085-R01 | DEV-084 static | non-primary pointer isolation 不回歸 | CLI |
| QA-085-R02 | TypeScript／lint／build:test | 無新增 error | CLI |
| QA-085-B09 | 點擊曲線中心線，並由中心沿法線向 window 內側邊緣偏移約 18px 再點擊 | 兩次都能選取並顯示 2 個搖桿；window centerline 與曲線距離 ≤4px、宣告 44px，visible stroke width 不變 | browser coordinate click／screen-space geometry／DOM metadata／screenshot |
| QA-085-B10 | 建立右分支→左分支關聯線，fixture 故意保存 `fromAnchor.xRatio=0`、`toAnchor.xRatio=1` | 起點仍在來源右框線、終點仍在目標左框線，誤差各 ≤2px；兩端 Y 仍在節點高度內 | browser screen-space endpoint／node rect measurement |

## Visible Error Hard Gate

`.inline-error`、可見 `[role=alert]` failure、HTTP 4xx／5xx、Not Found、Internal Server Error、console error、page error、failed request 任一出現即 Fail。fixture 預期有兩個節點與一條關聯線，任一關鍵 count 為 0 即 Fail。

## QC 執行與判定

- 第一個必要案例失敗即停止，記錄 viewport、URL、操作、before／after geometry、storage、screenshot 與 error arrays，回 RD 修正。
- UI 沒有 screenshot／viewport／互動證據時只能判定 `未充分驗證`。
- 必要案例全過才可將 DEV-085 更新為 QA-QC PASS；physical phone 維持 Not Run，不冒稱通過。

## 實際執行結果

- Failure-first：修正前 static 2/7 PASS、5/7 FAIL，缺口可重現。
- Hit-window failure-first：新增 REL-085-008 後，舊 28／24px 實作為 7/8 PASS、1/8 FAIL；改為 44px 後該輪 DEV-085 8/8 PASS。
- Endpoint failure-first：右分支→左分支且保存相反 anchor xRatio 的案例可重現兩端落在內側；改為每端各自讀 branch direction 後 DEV-085 9/9 PASS。
- Static／regression：DEV-085 9/9、corrected DEV-077 6/6、DEV-027E 24/24、DEV-027G 97/97、DEV-084 7/7 PASS。
- Engineering：TypeScript、targeted ESLint、`build:test`、`git diff --check` PASS。
- Rendered browser：endpoint=2、joystick=2、arm=2、center guide=0、legacy control=0；拖曳即時更新、另一端不塌縮、pointerup 保存、reload 相同、from/to identity 不變。
- Input／recovery：middle／right geometry 零寫入；Escape 恢復；100%／110% hit target 約 28px。
- Viewport／error：1440×900、1024×768、390×844 完成；1024／390 overflow=0，console/page/request/visible error=0。
- Endpoint outer edge：右→左 fixture 即使保存 `fromAnchor.xRatio=0`、`toAnchor.xRatio=1`，起點與來源右框線、終點與目標左框線的 screen-space 誤差都只有 `0.0044px`，兩端 Y 仍在各自節點高度內；預設 control offset 上限收斂為 72px 後，外側搖桿不被右側樣式面板遮住且可拖曳。
- Line hit window：曲線與直線 fallback 宣告 44px，window 置中在線上；拖成曲線後量得 window centerline 至可見 path 距離 `0.24px`。真實滑鼠在中心線及由中心沿法線偏移 18px 的 window 內側邊緣點擊皆成功選取並顯示兩個方向搖桿；可見線寬與截圖外觀不變。
- 證據：`output/playwright/dev-085-mindmap-relationship-direction-joysticks/result.json`、四張 viewport／drag 截圖、`QC-DEV-085`。
