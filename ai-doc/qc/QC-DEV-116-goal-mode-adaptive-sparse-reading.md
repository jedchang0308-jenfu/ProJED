# QC-DEV-116：全層級 OKR 模式與自適應留白閱讀

- 日期：2026-09-11
- 狀態：`Interaction parity candidate / Targeted QC PASS / NOT RELEASED`
- 對應：DEV-116、SPEC-116、QA-DEV-116
- 驗證環境：local-test `http://localhost:4000/`；Chromium；1440×900、814×698、390×900；owner actor `local-test-user`

## 結論

最新 interaction parity candidate 通過本地 targeted QC。桌機可從既有「視角」選擇「OKR模式」，所有 L1／L2／L3+
任務使用同一資料與能力邊界；任務目的與合格會議補記各自採 native sparse rowSpan，空白內容不產生 placeholder 或
固定占位。表格已移除額外卡片、介紹 header、可見層級文字及列內「＋說明／＋紀錄」，並保留完整低對比格線。

List 與 Goal 只共用 layout-neutral `TaskHierarchyIndentedRow`：兩者實測每層縮排6px、disclosure slot 20px、階層內容
高度20px。Goal自行組裝標籤、負責人、狀態、日期、工期與desktop DnD，List保留進度指示；沒有把recursive Grid與semantic Table
耦合成整列共用元件。OKR負責人 trigger 移除裝飾性 Users icon但保留文字、下拉與鍵盤／aria；List保留原 icon。
目的／會議紀錄 owner cell 各保留一層必要內容容器，固定跨列可視高度並以Y軸捲動承接長文字；空白／covered cell不建立容器。
Goal編輯後List讀回同一canonical task；拖曳提交正確，task mutation=6，record=0，task-link=0。
指派浮層由既有picker的可選portal呈現，未被Table後續列遮蔽。
V24量得1298px參考視窗的表頭與第一資料列第一／最後cell左右差異皆為0px；相對table外框的±0.5px為原生
`border-collapse`抗鋸齒誤差，未新增同步容器。

從Goal開始會議及live六模式切換維持同一meeting session。OKR任務名稱區right-click與`Shift+F10`已實測開啟
Board共用的`GlobalContextMenu`／`TaskActionMenu`、相同profile與既有guards；未新增第二套選單。mobile Goal、
tracking placement、inline add與完整task-linked record聚合仍維持排除。此結論只代表local candidate，不等同production release。

## Targeted QC review

| Check | 事實核對 | 結果 | 證據 |
|---|---|---|---|
| Q01 正常入口與資料權威 | topbar可進OKR；active board primary tree顯示4 rows；無新route或task副本 | PASS | Browser B01、V01 |
| Q02 稀疏欄位、列高與格線 | description `rowspan=3`；目的／會議紀錄 owner `td`各僅一層內容容器，以Y軸捲動承接長文字；同一任務跨兩筆 meeting records 的6筆補記全部保留，meeting獨立；無placeholder／inline add；所有cell、列與外框有格線，表頭與資料列左右邊界同軌 | PASS | B02～B03、V02～V03、V10、V12、V23～V25 |
| Q03 扁平、命名、欄寬與固定表頭 | table直掛goal root；無介紹header；欄名直接位於`th`且無內層UI容器；1298px參考視窗任務名稱欄252px；模式名為OKR模式；8個表頭皆為深底白字sticky，實際捲動時固定且兩側與資料列對齊；內容欄僅保留必要捲動容器 | PASS | P21～P25；V11、V13～V18、V23～V24 |
| Q04 共用架構邊界 | List／Goal只共用階層display primitive；兩者6px depth step與20px內容高度相同 | PASS | P26～P27；Browser V20 |
| Q05 任務能力 | Goal不顯示進度條／百分比且移除裝飾性負責人Users icon，但保留文字／下拉／鍵盤／aria、標籤與planning controls；List保留進度指示與負責人icon；指派浮層可操作；修改後List canonical readback一致 | PASS | Browser B12～B14；V19 |
| Q06 Desktop DnD | 非控制區拖曳顯示owned overlay；根層重排正確；task-drag PWA owner含goal | PASS | P28；Browser B15～B16、V21 |
| Q07 Mutation與權限邊界 | 明確editor／DnD產生6次task mutation；record與task-link皆0；右鍵／Shift+F10開Board共用menu，開關menu為0 write | PASS | B05、B17～B18、V22；artifact counters |
| Q08 Meeting continuity | Goal開始meeting維持goal；live option active；六模式快速切換不重建session | PASS | DEV-116 B07～B09；DEV-117 static/browser |
| Q09 Mobile／tracking負向 | 390px不暴露Goal；tracking不進Goal；無新增完整record聚合 | PASS | DEV-116 P02、B09；SPEC boundary |
| Q10 Engineering integrity | static、相鄰契約、TypeScript、targeted ESLint與test build通過 | PASS | 命令與artifact索引 |
| Q11 Runtime/error sweep | console/page/HTTP/visible error皆0；既有runtime被安全重用 | PASS | Browser B10～B11；PID 28532／port 4000 |

## Evidence index

- Static：`npm run verify:dev-116-goal-mode` → 28/28 PASS；
  `output/playwright/dev-116-goal-mode/static-result.json`。
- Browser：`npm run verify:dev-116-goal-mode-browser` → 40/40 PASS；
  `output/playwright/dev-116-goal-mode/result.json`。
- Visual：`V01-goal-table-1440x900.png`、`V15-goal-table-814x698.png`、
  `V19-goal-capabilities-1440x900.png`、`V21-goal-after-drag-1440x900.png`、
  `V22-goal-global-context-menu-1440x900.png`、`V23-goal-sticky-dark-header-1440x180.png`、
  `V24-goal-task-column-1298x698.png`、
  `B08-goal-live-meeting-1440x900.png`。
- Regression：DEV-039 66/66、DEV-046 32/32、DEV-053 31/31、DEV-070 58/58、DEV-097 23/23、
  DEV-108 14/14、DEV-114 29/29、DEV-115 21/21、DEV-117 static 21/21與browser 8/8 PASS。
- Engineering：`npx tsc --noEmit`、targeted ESLint、`npm run build:test` PASS。Build只有既有bundle-size warning，非阻斷。

## Boundary

本 QC 未授權或執行commit、push、deploy、migration、provider或production smoke。1024／200% zoom、viewer、500-row與
實機mobile完整矩陣仍屬後續release gate；本輪已驗證的390px mobile是Goal不存在的負向邊界。未修改schema、RLS、
Task Details、meeting capture格式或task-linked record資料。

## Runtime ownership

本輪重用既有matching runtime：Vite listener PID `28532`、wrapper PID `3264`、port `4000`。各Playwright wrapper只關閉
自己建立的browser process；既有runtime未誤停，artifact標記`reused; not stopped`。

使用思考習慣：#風險優先、#可驗證性、#反例
