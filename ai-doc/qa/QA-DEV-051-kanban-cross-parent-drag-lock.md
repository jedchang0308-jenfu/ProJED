# QA-DEV-051: 看板跨父層拖拉停留鎖定與落點定位驗證計畫

關聯 DEV: DEV-051
關聯 SPEC: `ai-doc/specs/SPEC-051-kanban-cross-parent-drag-lock.md`
狀態: Historical Evidence / Implementation Withdrawn / Runtime Restored to main
風險等級: Medium
建立日期: 2026-07-16
最近更新: 2026-07-16

使用思考習慣: #可驗證性、#批判思考、#極限情境

> 2026-07-16 回復註記：本計畫與既有結果只描述已撤回的 DEV-051 實作。DEV-051 專屬
> verifier 已移除；目前版本應以 DEV-029、DEV-046 與 `main` 行為回歸作為驗證依據。

## 1. 驗證目標

證明看板拖曳符合三個核心不變量：同父層排序即時、跨父層只有完成 750ms lock 才可提交、畫面顯示的父層與精確位置等於最終資料結果。同時驗證空／收合父層、篩選、deep hierarchy、手機手勢、permission、cycle、undo 與所有取消路徑。

本文件保留原驗證矩陣並附加實際執行證據；第 8 節新增人工真實操作腳本，目前尚未執行，不得將自動化或既有 screenshot QC 當成人工操作通過。未由自動化直接操作的 physical phone 項目明確標為 supplemental not executed。

## 2. 測試資料與環境

### 2.1 Fixture

- 同一 board 至少有 Root-A、Root-B。
- Root-A 下有 A1、A2、A3；A2 下有 A2-1、A2-2；至少延伸到 L5。
- Root-B 下有 B1、B2；另有 Empty-B（沒有 child）與 Collapsed-B（有 child 但收合）。
- 篩選資料：同一 parent 下依序有 V1、H1、V2、H2、V3，其中 V 可見、H 被 filter 隱藏。
- 至少一個 completed parent、無移動權限 viewer、長標題、可觸發 edge auto-scroll 的超長 column。
- 至少一個 cycle 情境：將 A 拖到 A 自己或 A descendant。

### 2.2 Viewport／Input

| 類型 | 要求 |
|---|---|
| Desktop | 1440x900、1024x768，mouse/pointer |
| Mobile emulation | 390x844、320x844、430x932，coarse pointer |
| Physical phone | Supplemental；release gate 若要求再執行 |
| Time | pure fake clock 為主，browser timestamp trace 為輔 |
| Evidence | command output、DOM state、timestamp、before/after node snapshot、undo snapshot、screenshot/video |

每個 browser matrix 都需做 visible error sweep：`.inline-error`、`[role=alert]`、Not Found、Internal Server Error、可見 4xx/5xx 或 `/api/` 錯誤。

## 3. Stable Evidence Contract

自動化至少讀取：

- `[data-kanban-parent-lock-state]`
- `[data-kanban-parent-lock-progress]`
- `[data-kanban-drop-parent-id]`
- `[data-kanban-drop-indicator]`
- `[data-kanban-drop-position]`
- `[data-kanban-child-empty-lane]`
- `[data-kanban-drop-invalid-reason]`
- 既有 `[data-task-id]`、`[data-mobile-drop-target]`

不得只以顏色、像素顏色或 timeout 後截圖推論狀態；需同時有 DOM state 與資料 snapshot。

## 4. Pure／Static Verification

| ID | 情境 | 操作 | 預期 |
|---|---|---|---|
| QA-051-S01 | 同父層 before | source/target `parentId` 相同 | 立即 `same-parent/before`，不建立 arming timer |
| QA-051-S02 | 同父層 after | target 下半部 | 立即 `same-parent/after` |
| QA-051-S03 | 跨父層 699ms | fake clock 推進至 699ms | 仍是 `arming`，不可 commit |
| QA-051-S04 | 跨父層 750ms | 同 candidate 推進至 750ms | `locked` 且 locked id 正確 |
| QA-051-S05 | 800ms 上限 | 模擬 scheduler 邊界 | 不得晚於 800ms 才 locked |
| QA-051-S06 | 切換 candidate | A arming 中改到 B | A timer 清除，B 從 0 開始 |
| QA-051-S07 | 同深度不同 parent | Level 相同、`parentId` 不同 | 必須 arming，不得視為同父層 |
| QA-051-S08 | 200ms grace | locked 後離框 199ms 再返回 | lock 保留 |
| QA-051-S09 | grace 超時 | 離框 201ms | lock 解除，新 parent 需重計時 |
| QA-051-S10 | invalid targets | self、descendant、無權限 | `invalid`、無 timer、無 commit；不渲染文字提示 |
| QA-051-S11 | visible anchor ordering | V1/H1/V2/H2/V3，以 V2 前後為 anchor | H1/H2 相對順序不變，完整 siblings 無遺失 |
| QA-051-S12 | filtered empty append | child 全被隱藏，drop empty lane | 新 task 加在 canonical child list 末尾 |
| QA-051-S13 | empty/collapsed lane | target metadata 為 empty/collapsed lane | parent id 正確、position=`append`、仍需 lock |
| QA-051-S14 | cancel cleanup | Escape/cancel/blur/hidden/unmount | timer、candidate、lock、indicator 全清除 |
| QA-051-S15 | commit/undo | 有效跨父層 move 後 undo | parent/type/order/sibling normalize/ancestor state 完整還原 |

Static verifier 亦需確認：

- 桌機與手機引用同一 resolver／state transition，沒有兩套 750ms 常數。
- 舊 `wbs-card-drop`／`wbs-checklist-drop` 不再將 card center 當隱性 child commit。
- hover／arming path 沒有 `batchUpdateNodes`、persistent write 或 undo push。
- stable frame／insertion-line selectors 存在；鎖定文字、floating status 與 `aria-live` 提示不存在。

## 5. Desktop Browser Matrix

| ID | 情境 | 操作 | 預期結果 | 證據 |
|---|---|---|---|---|
| QA-051-D01 | 同父層立即排序 | A3 拖到 A1 上／下半部 | 無倒數；before／after 線立即出現；release 結果一致 | video、DOM、order snapshot |
| QA-051-D02 | 跨父層未滿門檻 | A1 移到 B1 group，<700ms 放開 | 任務回原位；parent/order 不變；無 undo | timestamp、snapshot |
| QA-051-D03 | 跨父層完成鎖定 | A1 在 B group 停留 750ms | 750ms 後 locked；框住完整 B group，插入線可見，無鎖定文字或 floating status | timestamp、screenshot、DOM |
| QA-051-D04 | locked 後選 before | D03 後移到 B1 上半部放開 | A1 成為 B sibling 且位於 B1 前 | indicator、snapshot |
| QA-051-D05 | locked 後選 after | D03 後移到 B1 下半部放開 | A1 位於 B1 後 | indicator、snapshot |
| QA-051-D06 | locked group append | D03 後移到 B group blank | A1 加到 canonical B siblings 末尾 | DOM、snapshot |
| QA-051-D07 | empty parent 1A | 拖到 Empty-B 的 empty lane 插入線停留 750ms | 細插入線可見且沒有文字；鎖定後 A1 成為 Empty-B 直接 child | screenshot、snapshot |
| QA-051-D08 | collapsed parent 1A | 拖到 Collapsed-B child lane | 不必展開既有 child 即可鎖定；結果 append 到完整 children 末尾 | screenshot、snapshot |
| QA-051-D09 | 無卡片中央分類 | 在 B card center 短暫通過／放開 | 不因 center 自動成為 B child；只依 group/anchor contract | video、snapshot |
| QA-051-D10 | lock grace | locked 後離框 150ms 再回來 | lock 不閃爍、不重計時 | timestamp、DOM |
| QA-051-D11 | unlock | locked 後離框 >200ms | frame 消失；移到新 parent 重新 arming | timestamp、DOM |
| QA-051-D12 | deep hierarchy | L5 在不同 L3 parent 間移動 | 同一規則；完整 parent group frame；無 depth shortcut | screenshot、snapshot |
| QA-051-D13 | cycle/self | parent 拖到自身／descendant lane | 不得 locked／commit；無文字提示；release no-op | DOM、snapshot |
| QA-051-D14 | permission | viewer 拖曳 | 不進 arming/locked，不產生 write | DOM、network/store trace |
| QA-051-D15 | interactive controls | 從 checkbox/menu/input 起手 | 控制功能正常，不誤觸 drag | event trace |
| QA-051-D16 | Escape/blur/visibility | arming/locked 中依序觸發 | 全部清理且無資料異動 | DOM、snapshot |

## 6. Filter Matrix（3A）

| ID | 操作 | 預期 |
|---|---|---|
| QA-051-F01 | filter 下把 source 放到 V2 前 | visible indicator 在 V2 前；清除 filter 後 H1/H2 相對順序維持 |
| QA-051-F02 | filter 下把 source 放到 V2 後 | source 位於 canonical V2 後的合法位置；不得把 hidden siblings 任意推到頭尾 |
| QA-051-F03 | 目的 parent 所有 child 被 filter 隱藏，使用 empty lane | append 到完整 canonical children 末尾 |
| QA-051-F04 | arming 中 filter 變化導致 anchor 消失 | release 重新驗證；不得對消失 anchor 提交，UI 安全清理 |
| QA-051-F05 | move 後清除 filter、refresh | 順序穩定，無 duplicate/missing node |

## 7. Mobile Browser Matrix

| ID | 情境 | 操作 | 預期結果 |
|---|---|---|---|
| QA-051-M01 | quick tap | 無位移 tap 任務 | 開 details；不進 drag/lock |
| QA-051-M02 | short pan | 在 task surface 短滑 >既有門檻 | viewport/column pan；不進 drag/lock、無 click-through |
| QA-051-M03 | long-press lift | 依 DEV-029 450–550ms 長按 | 先進 drag-action；750ms cross-parent timer 尚未開始，直到 hover 不同 parent |
| QA-051-M04 | 同父層排序 | lift 後 hover 同 parent target | 即時 before／after，不等 750ms |
| QA-051-M05 | 跨父層 lock | lift 後 hover 不同 parent 750ms | arming/locked 與桌機同 contract |
| QA-051-M06 | 20px tolerance | arming 中手指在 20px 內移動 | 同 candidate timer 不重設 |
| QA-051-M07 | 超過 tolerance/換 parent | 移到不同 group | 舊 candidate 清除，新 group 重計時 |
| QA-051-M08 | edge auto-scroll | locked group 內靠近 board/column 邊緣 | 正常 auto-scroll；同一 parent lock 不跳動，indicator 重新解析 |
| QA-051-M09 | action rail priority | task-position arming 後移到完成／新增／刪除 | action target 優先；執行 action 不同時 move；刪除只開確認 |
| QA-051-M10 | empty/collapsed lane | hover child empty lane 750ms | 明確 lane 鎖定並 append child |
| QA-051-M11 | touch/pointer cancel | arming/locked 中 cancel | action mode、timer、frame、indicator 全清；無 write |
| QA-051-M12 | viewport safety | 320/390/430 width 檢查 frame、插入線、rail | 無裁切主 CTA、重疊、非預期 body overflow |

## 8. 真實操作驗證計畫（Manual Real Operation Plan）

執行狀態：Not Executed。此節是提供給 QA／使用者照做的人工驗證腳本，不是既有 automated/browser evidence 的重述。

### 8.1 驗證目的與判定邊界

- 驗證操作者能否在 5 秒內只靠群組框與插入線辨識「目前鎖定哪個父層、會插在哪裡」。
- 驗證使用者實際用滑鼠與手指操作時，不會因中央區域、群組框、插入線或 action rail 的競合而誤改階層、誤刪除或重複提交。
- 精確 699／750／800ms 與 199／201ms 邊界仍以 deterministic/browser evidence 判定；人工操作只判定可感知的「未鎖定／已鎖定／離開後保留或解除」行為，不以人工秒錶取代毫秒級證據。
- 本計畫只能在 local disposable fixture 執行，不得使用 production board、正式資料或遠端資料寫入。

### 8.2 執行前置條件

| 項目 | 要求 |
|---|---|
| 測試角色 | 1 名 QA 操作者；1 名觀察者可選，負責記錄口述理解與時間點 |
| 測試資料 | 使用第 2 節 Root-A／Root-B、Empty-B、Collapsed-B、V/H filter fixture；每個 session 開始前保留 before snapshot |
| Desktop | 實際滑鼠；1440x900，另以 1024x768 重跑 R08／R12 |
| Mobile | 優先實體 coarse-pointer 裝置；至少覆蓋一個 iOS Safari 與一個 Android Chrome，若產品只支援一種平台則執行該平台 |
| 替代環境 | 沒有實體裝置時可先用 390x844／320x844 mobile emulation，但結果只能標示 emulation，不得標示 physical phone passed |
| 記錄方式 | 螢幕錄影或連續截圖；每案例記錄 tester、日期、branch／build、route、viewport／device、pointer type、fixture、結果 |
| 資料安全 | 每個 destructive／write case 只在 disposable local board 執行；失敗後先保存證據再 reset fixture，不直接重試覆蓋現場 |

QA 建議：release 前至少各執行一台 iOS Safari 與 Android Chrome 的實體觸控；若 release gate 未要求 physical phone，仍應完成 desktop 人工操作與 mobile emulation，並保留 physical phone 未執行邊界。

使用思考習慣：#證據基礎、#可驗證性、#使用者視角

### 8.3 人工操作案例

| ID | 操作者實際操作 | 通過標準 | 必留證據 |
|---|---|---|---|
| QA-051-R01 基線與資料 sanity | 開啟 Board 看板；確認 Root-A／Root-B、Empty-B、Collapsed-B、L5、filter fixture 都可找到；hard reload 一次 | 頁面可用；預期資料數量非 0；無 `.inline-error`、`[role=alert]` 失敗、Not Found、4xx/5xx、`/api/` 錯誤文字；操作者能指出目前看板與下一步 | before screenshot、route、viewport、visible-error sweep、資料節點清單 |
| QA-051-R02 同父層 before／after | 將 A3 拖到 A1 上半部放開，再復原；將 A3 拖到 A1 下半部放開 | 不需等待 750ms；插入線方向清楚；每次只改同父層順序；無階層變更、無多一筆 task、一次可 undo | 操作錄影、before/after order、插入線 screenshot、undo count |
| QA-051-R03 跨父層提前放開 | 將 A3 拖入 Root-B group，看到尚未鎖定時立即放開；再重做一次並刻意停留約半秒後放開 | A3 回到原位置；不新增 child、不改 parent/order、不產生 undo；畫面說明不能讓操作者誤以為已提交 | 操作錄影、release 前 lock state、before/after snapshot、undo snapshot |
| QA-051-R04 跨父層鎖定與理解 | 將 A3 拖入 Root-B group，等待畫面由 arming 變 locked，再口述「框住哪個 group、插入線在哪裡」後放開 | 操作者在 5 秒內能指出 Root-B group 與 before/after/append 線；畫面沒有鎖定文字或 floating status；放開後資料與線的位置一致 | locked screenshot、口述紀錄、DOM state、after snapshot |
| QA-051-R05 locked before／after／append | 分別把 A3 鎖定到 B1 前、B1 後、Root-B group 末端空白處；每次放開後 reset fixture | 三種位置都可預覽且結果精確；append 不被誤解成新的分類；不出現 duplicate/missing node | 每種 placement screenshot、before/after canonical order、錄影 |
| QA-051-R06 空父層／收合父層與中央區域 | 將 A3 拖到 Empty-B 的細插入線；再拖到 Collapsed-B 的 child lane；短暫穿過 task card center 後放開 | 只要移到該父層即插入其下，不出現額外分類或文字提示；細線可命中，不必展開既有 child；card center 不會偷偷提交 child | lane screenshot、操作者理解回覆、after hierarchy、錄影 |
| QA-051-R07 切換父層與離開恢復 | 在 Root-B arming 尚未 locked 時移到 Root-C／Root-A；locked 後短暫離開再返回，再離開超過可感知 grace 後放到新 parent | 換 parent 會重新 arming；短暫離開不造成閃爍或誤提交；離開後確實解除時，舊 frame／indicator 清除；全程無資料異動直到合法放開 | timestamp trace、每次 state screenshot、before/after snapshot |
| QA-051-R08 深層階層與 cycle 防呆 | 將 L5 任務在兩個不同 L3 parent 間移動；再嘗試拖到自身與 descendant | 群組框不以 Level 代替 parent identity；cycle target 不能 lock／commit；沒有文字提示且可返回正常拖曳 | deep hierarchy screenshot、invalid frame screenshot、無寫入證據 |
| QA-051-R09 篩選下人工排序 | 啟用 filter 讓 V1／V2／V3 可見、H1／H2 隱藏；將 source 放到 V2 前、後與 child empty lane；清除 filter | visible anchor 與操作者看到的落點一致；清除 filter 後 H1／H2 相對順序不變；無 duplicate/missing；empty lane append 到完整 canonical 末端 | filter on/off screenshots、完整 sibling order、錄影 |
| QA-051-R10 Mobile tap／pan／long press | 實體或 emulation 上：quick tap task、短滑 task surface、長按後移動到不同 parent；再操作 edge auto-scroll | tap 開 details；短滑只 pan 不開 details／drag；長按才 lift；跨父層 lock 與 desktop 同語意；無橫向 overflow、裁切、重疊 | device／viewport、連續錄影、details screenshot、scroll position、locked screenshot |
| QA-051-R11 Mobile action rail priority | mobile drag-action mode 中分別點完成、新增下層、刪除；另測 position drag target | action rail 優先於位置拖曳；完成／新增只執行一次；刪除只開確認；不與 move double-submit；取消後可安全回到原狀態 | 每個 action screenshot、資料 snapshot、undo history、確認框截圖 |
| QA-051-R12 commit／ancestor／undo／redo | 執行一次跨父層 move；檢查 source／destination ancestor；按 undo，再按 redo | 一次 move 對應一次 batch／undo；兩側 ancestor status 正確；undo 完整還原 parent、nodeType、order、siblings；redo 重現同一落點且無 duplicate | before/move/undo/redo snapshots、undo history、錄影 |
| QA-051-R13 取消與中斷恢復 | 在 arming、locked、mobile action mode 各自觸發 Escape、blur、visibility change、touchcancel；再重新開始一次合法拖曳 | timer、frame、indicator、action mode 全清；無 write／undo；下一次拖曳不沿用舊 candidate 或 locked parent | 每個取消狀態 screenshot、console／store trace、重新操作錄影 |
| QA-051-R14 permission／控制項／錯誤與版面 | 用 viewer 嘗試拖曳；從 checkbox、menu、input 起手；於 320／390／430／1024／1440 viewport 檢查 | 無權限不可 arming/locked/write；控制項功能不被 drag 攔截；無 visible error、overflow、截斷、重疊、CTA 被擠壓；blocked／invalid 狀態說明下一步 | role、viewport、screenshots、visible-error sweep、操作錄影 |

### 8.4 真實操作 FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策／建議測試 |
|---|---|---|---|---|---|
| 未鎖定就跨父層提交 | 使用者誤判 arming 為可放開 | 任務被放錯階層 | R03、檢查 parent/order/undo | P0 | 放開前必須 no-op；錯誤即 Stop Ship |
| 鎖定父層或落點看不懂 | group frame 或插入線不完整、太淡或被遮擋 | 使用者無法預測結果 | R04／R05，5 秒口述測試 | P1 | 不靠文字也能同時辨識 parent 與 position |
| 中央區域被誤解為分類 | 舊隱性 child drop 心智模型殘留 | 意外升階或插入錯誤 | R06 | P0 | 移到父任務即插入其下；不得新增中央分類 |
| filter 破壞隱藏 sibling 順序 | 只按 visible list normalize | 清除 filter 後順序改變 | R09、完整 order snapshot | P1 | hidden sibling 相對順序保持 |
| mobile pan／tap／drag 競合 | 長按、短滑、action rail 仲裁不清 | 開錯詳情、誤拖或誤操作 | R10／R11 | P0 | 任一主要手勢回歸失敗即 Stop Ship |
| cancel 後殘留 lock 或重複提交 | timer／state／undo cleanup 不完整 | 下一次操作帶入舊狀態 | R12／R13 | P0 | cancel 後 state、資料與 undo 均為 no-op |
| 權限或控制項被拖曳覆蓋 | permission／interactive descendant guard 缺漏 | 非授權寫入或控制項失效 | R14 | P0 | viewer 不得 write；checkbox/menu/input 功能保持 |
| 錯誤與版面問題被忽略 | 只看結果、不做 visible-error／viewport sweep | 使用者卡住或誤判成功 | R01／R14 | P1 | 有可見錯誤、overflow、重疊、截斷即不通過 |

### 8.5 人工操作通過門檻

- QA-051-R01～R14 全部完成且無 P0／P1 失敗；每案例均有可回放的 screenshot 或 video、before/after snapshot 與操作環境紀錄。
- 至少一輪 desktop 實際滑鼠操作通過；mobile emulation 與 physical phone 分開記錄，不得混稱。
- 操作者能在 5 秒內理解 locked parent、exact placement 與下一步；任一主要狀態只顯示技術原因而未提供可執行下一步，判定失敗。
- 所有 write case 均只能在 disposable local fixture；production、remote data mutation、deploy 不在本 QA 計畫授權內。
- 任一 Stop Ship 失敗，結論為 `未通過`；缺少必要截圖、viewport、操作錄影或資料 snapshot，結論為 `未充分驗證`，不得補寫成通過。

## 9. Commit、Rollup 與 Undo Matrix

| ID | 情境 | 預期 |
|---|---|---|
| QA-051-U01 | 同父層 reorder | 一次 batch／一次 undo；undo 回原順序 |
| QA-051-U02 | 跨父層 move | source/destination ancestor status 都正確重算 |
| QA-051-U03 | 跨父層後 undo | parent、nodeType、order、兩側 sibling order、兩側 ancestor state 全還原 |
| QA-051-U04 | redo | 重現同一 destination 與順序，不產生 duplicate |
| QA-051-U05 | release before lock | 0 batch、0 persistence、0 undo |
| QA-051-U06 | target release 時消失／權限被撤 | no-op、可理解錯誤、transient state 清除 |

## 10. Required Commands

RD 必須新增並通過：

```powershell
npm.cmd run verify:dev-051-kanban-cross-parent-drag-lock
npm.cmd run verify:dev-051-kanban-cross-parent-drag-lock-browser
```

必跑回歸：

```powershell
npm.cmd run verify:dev-046-universal-task-surface-drag
npm.cmd run verify:dev-046-universal-task-surface-drag-browser
npm.cmd run verify:dev-029-mobile-pan-first-interactions
npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser
npm.cmd run verify:dev-039-filter-result-parity
npm.cmd run verify:dev-039-filter-result-parity-browser
npm.cmd run verify:dev-044-undo-coverage
npm.cmd run verify:dev-044-undo-coverage-browser
npm.cmd exec tsc -- --noEmit
npm.cmd run build:test
```

若 repository 中某個既有 command 更名，RD 需在 QA 證據中列出實際替代 command 與原因，不得靜默略過。

## 11. Evidence Record Template

每個失敗或通過案例至少記錄：

- commit SHA／dirty state。
- command、exit code、開始與完成時間。
- fixture node ids、source/destination parent ids、before/after canonical order。
- lock state timestamp trace（arming start、locked、unlock）。
- DOM selector values、viewport、pointer type。
- screenshot/video 路徑與 visible error sweep。
- undo/redo 前後 snapshot。

Browser 自動化輸出放在既有 `output/playwright`；輸出屬本機證據，不應未經治理直接提交大型 artifact。

## 12. Pass／Fail Gate

Pass 需同時滿足：

- SPEC-051 15 項 acceptance criteria 全部有對應證據。
- DEV-051 pure/static 與 browser commands 通過。
- DEV-029／039／044／046 回歸通過。
- 沒有 parent/order loss、duplicate node、cycle、double action、timer residue、visible error 或 unintended overflow。
- 文件中的 status 與實際證據一致。

以下任一項為 Stop Ship：

- `<700ms` 即跨父層提交，或 `>800ms` 仍無法 lock。
- arming release 改動資料或產生 undo。
- card center 仍存在隱性 child commit。
- filter 導致 hidden sibling 相對順序破壞。
- source ancestor 未重算、undo 不完整或 action rail 與 move 雙重提交。
- mobile short pan／quick tap／cancel safety regression。

## 13. QC Boundary

- QC artifact `QC-DEV-051-kanban-cross-parent-drag-lock` 已建立，並只記錄本輪實際執行與觀察到的事實。
- Physical phone 是 supplemental，除非 release gate 依風險要求，否則不能把未執行寫成已通過。
- 本 QA 不授權 production deploy、remote data mutation 或 release。

## 14. Executed Evidence（2026-07-16）

### 14.1 DEV-051 專屬 gate

- deterministic/static：33/33 passed，涵蓋 750ms、200ms、20px、same-parent、parent identity、cycle、filter hidden sibling、filtered-empty append、雙 ancestor rollup、stable selectors、preview geometry、source removal 與 structural-update guard。
- browser：7-case matrix passed。
  - `QA-051-D00`：無有效 insertion target 時，desktop pointer preview 精準跟隨游標。
  - `QA-051-D01`：同父層 before 立即提交，無 arming。
  - `QA-051-D02`：跨父層未完成 lock 即放開，parent/order 不變。
  - `QA-051-D03`：750ms 後完整 parent group locked，插入線可見；鎖定文字與 floating status 均不存在。
  - `QA-051-D07`：text-free child empty lane 插入線鎖定後追加為直接 child。
  - `QA-051-M05`：mobile long-press 後才開始 cross-parent lock，locked release 正確提交。
  - `QA-051-M09`：action rail 優先且不產生 double move。

### 14.2 Regression gate

- DEV-046：static 27/27、browser passed。
- DEV-029：static 32/32、browser operation matrix passed。
- DEV-039 filter parity：static 26/26、browser passed。
- DEV-044 undo coverage：static 25/25、browser passed。
- DEV-048 multi-person assignment：static passed。
- TypeScript `--noEmit`、`build:test` passed。

### 14.3 UI QC evidence

- Desktop locked：`output/playwright/dev-051-kanban-parent-lock-1784166975189-desktop-locked.png`。
- Desktop empty lane：`output/playwright/dev-051-kanban-parent-lock-1784166975189-desktop-empty-lane.png`。
- Mobile locked：`output/playwright/dev-051-kanban-parent-lock-1784166975189-mobile-locked.png`。
- 目視確認：完整群組框、before／child placement 插入線與 action rail 可辨識；鎖定文字、empty-lane 文案與 floating status 不存在；browser visible-error sweep 與 body overflow assertion passed。

### 14.4 Boundary

- 執行基準：branch `持續優化1`、dirty worktree based on `9efc596`；本輪未建立 commit。
- 未執行：physical phone supplemental、production smoke、deploy、remote data mutation。
- 詳細事實報告：`ai-doc/qc/QC-DEV-051-kanban-cross-parent-drag-lock.md`。
