# SPEC-085 心智圖關聯線方向搖桿

日期：2026-08-25  
狀態：Implemented／QA-QC PASS／未 Release  
關聯 DEV：DEV-085／DEV-027  
來源：`USER-20260825-MINDMAP-RELATIONSHIP-DIRECTION-JOYSTICKS`

## 目標與使用者價值

使用者在心智圖選取既有關聯線後，可像 XMind Relationship 一樣拖曳兩端控制把手，直接調整曲線離開起點與進入終點的方向。調整需即時回饋並保存，不必進入樣式抽屜或重建關聯線。

XMind 官方參考：`https://xmind.com/user-guide/relationship-new`。其行為契約區分 circular endpoint 與 square control point：endpoint 控制連接位置，control point 控制線形。

## Spec Impact

`Compatible correction / restore original relationship control intent`。

- 使用者於 2026-08-25 澄清：DEV-077 的紅線原意只是刪除控制 UI 多畫的一條線，沒有要求移除 control arms 或 square control points。
- `SPEC-027E` 的 `geometry.controlPoints`、Bezier path、即時 preview 與持久化本來就是正確產品契約，本 DEV 修復 DEV-077 的規格誤讀與實作回歸。
- DEV-077 的正確降噪邊界是：移除 `control-1 → control-2` 的多餘中央導引線；保留 endpoint control arms 與 square direction joysticks。
- 不改 endpoint、relationship label、style drawer、資料 schema、API、權限或後端。

## UX Intent

- 任務／結果：熟悉心智圖操作的使用者可在畫布上直接整理關聯線方向，放開後維持形狀。
- 主物件／主焦點：目前選取的唯一關聯線。
- 預設刪除：常駐說明、教學、額外 toolbar、中央 guide、未選取關聯線的控制器。
- 保留舉證：沒有方向把手時無法調整曲線，交叉線只能刪除重建；兩端分開控制才能改變出線與入線方向。
- 非語言修復：使用 endpoint 到 control point 的淡色短臂、方形 knob、grab cursor、hover／focus／drag 狀態表達功能。
- 風險與驗證：第一次拖曳不可讓另一端塌陷；50%～200% zoom 命中尺寸固定；非主按鍵不得寫入；Escape／pointer cancel 可恢復。

## 行為契約

1. 只有關聯線為 selected 時顯示兩組方向搖桿；沿用既有 `canEditTask` guard，無編輯權限者不得開始拖曳或寫入。
2. 每組搖桿由一條低對比 control arm 與一個小型 square knob 組成：
   - 起點：`from endpoint → control-1`。
   - 終點：`to endpoint → control-2`。
3. 不顯示 `control-1 → control-2` 的中央 guide；未選取、hover-only、label edit 或建立 preview 不新增其他說明層。
4. knob 視覺尺寸約 10px，實際命中範圍至少 28×28 CSS px；畫布 50%～200% zoom 時維持近似固定螢幕尺寸。
5. 只有 primary pointer 可開始拖曳。拖曳時使用同一 map-local/world coordinate mapper 即時更新對應 control point。
6. 關聯線尚無已保存 control points 時，第一次拖任一 knob 必須以目前 render path 的兩個 control points 作為完整初始值，只替換被拖的一端。
7. pointerup 後沿用現有 local relationship storage 保存兩個 control points；reload 後曲線一致。
8. pointercancel、window blur 或拖曳中的 Escape 恢復 drag start 前的 relationship snapshot。
9. circular endpoint 維持 anchor／reconnect 責任；方向 knob 不改 fromId／toId 或 endpoint anchor。
10. knob 具可存取名稱與可見 focus 狀態；本輪不新增方向鍵微調。
11. 關聯線本體的透明點擊 window 沿實際貝茲曲線分段覆蓋，固定為 44 CSS px；直線 fallback 同步為 44 CSS px。window 的中心線必須與可見關聯線重合，命中範圍由線條向兩側對稱延伸約 22px；選取在完整 click 後才提交，避免 pointerdown 中途出現的搖桿接走 pointerup；只放大互動命中範圍，不改可見線寬、顏色或 hover／selected 樣式。
12. 起點與終點須各自固定在所屬節點分支的外側垂直框線：右分支使用節點右框線，左分支使用節點左框線。不得再以另一端節點的相對位置共同決定兩端接線邊；既有 anchor 只保留垂直 `yRatio`，方向搖桿仍控制曲率，建立中的 preview 起點亦遵循同一外側規則。

## 實作邊界

- `src/components/MindMap/MindMapRelationshipOverlay.tsx`：selected-only control arms。
- `src/components/MindMap/MindMapRelationshipInteractionLayer.tsx`：兩個 fixed-screen hit target 與 square knob。
- `src/components/MindMap/MindMapRelationshipInteractionLayer.tsx`：關聯線曲線與直線 fallback 的 44px fixed-screen hit window。
- `src/components/MindMap/MindMapView.tsx`：drag snapshot 與 computed control-point fallback。
- `src/components/MindMap/mindMapRelationshipCommands.ts`：以完整 fallback pair 更新單一 control point。
- `scripts/verify-dev-085-*`：static 與真實瀏覽器證據。

## Out of Scope

- 不新增 floating topic、任務依賴、排程連動或多人同步。
- 不新增第三個中央控制點、中央 guide、常駐教學或新面板。
- 不改線型選項、箭頭樣式、endpoint reconnect、label edit 或 mobile mindmap product boundary。
- 不執行 commit、push、deploy、production data 或 release。

## 驗收標準

- AC-085-001：選取關聯線後恰有兩個 direction joystick 與兩條 control arm；未選取時為 0。
- AC-085-002：沒有中央 guide 或重複 control-point decoration。
- AC-085-003：拖曳 control-1 只改變 c1，c2 維持起手值；control-2 反向案例亦成立。
- AC-085-004：拖曳中 path 即時更新，pointerup 後 local storage 保存兩個 finite world points。
- AC-085-005：reload 後 c1／c2 與放開時一致。
- AC-085-006：圓形 endpoint 數量與 reconnect 行為不變。
- AC-085-007：50%～200% zoom 下 knob 命中尺寸約 28px，位置與 path control coordinate 對齊。
- AC-085-008：middle／right／non-primary pointer 不選取、不拖曳、不寫入 geometry。
- AC-085-009：1440×900、1024×768 無遮擋、重疊或 visible error；390×844 保留既有 mobile boundary 且無 document overflow。
- AC-085-010：TypeScript、targeted ESLint、build:test 與關聯線／primary-pointer targeted regression 通過。
- AC-085-011：window centerline 與曲線的 screen-space 距離 ≤4px；真實滑鼠點在線上及由中心向 window 內側邊緣偏移約 18px 都能選取，不因 pointerdown 後 controls 出現而被畫布清除；可見 stroke width 不因 hit window 增加而改變。
- AC-085-012：跨畫布右分支→左分支關聯線即使保存了相反的 `xRatio`，起點仍與來源節點右框線、終點仍與目標節點左框線對齊，screen-space 誤差各 ≤2px；兩端 Y 坐標仍位於各自節點高度範圍內。

## 驗證命令

- `npm.cmd run verify:dev-085-mindmap-relationship-direction-joysticks`
- `npm.cmd run verify:dev-085-mindmap-relationship-direction-joysticks-browser`
- `npm.cmd run verify:dev-084-primary-pointer-isolation`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run lint -- --quiet`
- `npm.cmd run build:test`
