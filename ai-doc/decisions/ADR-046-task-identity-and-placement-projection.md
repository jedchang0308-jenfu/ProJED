# ADR-046 任務身分與多重 placement 投影

狀態：Accepted／RD Implementation Ready／Human Confirmed／Interaction Parity Amendment Accepted／Implementation Rework Required／未 Release

日期：2026-08-28

關聯：DEV-095、SPEC-095、ADR-036、SPEC-089

## Context

ProJED 現行 `TaskNode`／`wbs_items` 把 task identity、Board ownership、parent、order 與 render／drag identity放在同一 row。這適合一個任務只出現在一個 Board tree 的情境，但無法同時滿足：

- 同一任務在研發、主管或相關任務脈絡中被追蹤；
- 內容／狀態只維護一次；
- 只有一個父任務彙總工時、成本與進度；
- 目標 Board 成員可讀、但不因此取得 edit；
- reference 可獨立拖曳與移除，不改 canonical ownership。

若直接複製 task row，會產生多個狀態與生命週期；若把 `parentId` 改成 `parentIds[]`，仍無法表達每個 Board 的 order、Kanban stage、拖曳、權限與獨立移除。

使用思考習慣：#系統思考 #成本效益 #長期影響。長期成本最低的邊界是把「工作是什麼」和「工作在哪裡出現」分開。

## Decision

採用「單一 canonical task + 一個 primary placement + 零至多個 tracking-reference placements」：

1. `taskId` 是內容、狀態、人員、日期、備註、archive與所有 business relation 的唯一身分。
2. `placementId` 是 Board tree、parent、order、Kanban stage、visual kind與DnD的唯一身分。
3. 每個 active task恰有一個 active primary placement；primary edge是唯一 roll-up graph。
4. tracking reference是 non-owning projection；不儲存 task內容或 workflow state。
5. dependency、record link、task collection、calendar identity繼續指向 taskId；React key、tree path與drag/drop改用 placementId。
6. 目標 Board 的 read access由「active placement × current Board membership」動態推導，不建立永久 ACL row；edit仍取 canonical source Board capability。
7. 第一版限同 Workspace；跨 Workspace不得用放寬 RLS或直接 FK 偷渡。
8. Supabase＋local-test支援；Firebase明確 feature-off。
9. task surface 的呈現與互動以 placement context 驅動：primary／tracking 必須共用 pure surface views、interaction controller、action catalog、drag sensors與recursive placement tree；placement kind只決定outer frame與command route。
10. tracking reference不建立另一份簡化task component。derived-only actor仍進入相同details/action元件，但canonical mutation由source capability guard阻擋；有source capability者可從reference執行相同合法操作。
11. 建立一筆tracking reference不自動物化canonical descendants；tracking subtree由明確的tracking placements組成，child edge只影響投影樹與reference subtree move，不參與primary roll-up。

## Data transition decision

第一版採 expand-and-compatibility，不立即 rename/drop `wbs_items` 欄位：

- 新增 `wbs_item_placements` 並 backfill primary rows。
- `wbs_items.project_id/parent_id/sort_order/kanban_stage_id`暫作 primary compatibility mirror。
- 新 client的 Board tree以 placement table為準；舊 client只看 primary且不會看見 tracking references。
- migration後若需 application rollback，tracking rows保留；不得以 drop table回退。
- account-unplaced仍由SPEC-089現行 ownership處理；有active references的task本期不得進unplaced。

這是受控過渡，不是永久接受雙真相。未來 contraction只有在所有 consumer、RAG、records、backup與舊 client停止依賴 mirror後另立 DEV/ADR 才可執行。

## Permission decision

新增一個 `manage_task_reference` capability，將「管理投影位置」與 `move_task` canonical ownership明確分開。預設 owner/admin/project_manager/member有、viewer無；existing custom role僅在已有`move_task`時 backfill。reference-derived read不參與 content mutation policy。

## Consequences

### Positive

- 任務內容與生命週期維持唯一真相來源。
- 多 Board／多父脈絡只增加輕量 placement；不重複維護 task。
- primary roll-up、distinct count與dependency語意可被機器驗證。
- 目標 Board未來成員自動可讀，移除最後 reference後可自然撤銷。
- UI可用虛線與placement-aware DnD直接表達，不需要增加追蹤狀態。
- primary/reference共用元件與interaction kernel後，新增欄位、手勢、A11y、子任務或錯誤回復只維護一次，避免「外觀相似但行為漂移」。

### Cost／risk

- `useWbsStore.nodes[id]`與多個 view把 task ID當render node ID，必須做normalized-store與consumer migration。
- RLS read path變成 source Board或active placement，需防recursive policy與索引退化。
- Realtime、backup、undo、archive effective visibility與account-unplaced都需明確相容層。
- feature release需要forward migration、two-user security/realtime evidence與old-client rollback驗證。
- 既有primary元件目前混合資料、呈現、gesture與tree責任；收斂為controller／pure surface／recursive tree需要跨Board/List/Kanban integration refactor，且不得以mega-component或大量`variant` prop取代重複碼。

## Alternatives rejected

### A. 複製完整任務 row

拒絕。會產生狀態、備註、負責人、archive、delete與dependency分歧；違反唯一真相來源。

### B. `parentIds[]`／`boardIds[]` 加在 TaskNode

拒絕。無法正規化每個位置的parent、order、stage、remove、revision與權限；並使query／index／drag交易不可判定。

### C. tracking status／manager status

拒絕。追蹤者可能是主管、協作者、依賴任務或其他情境，狀態會無限膨脹且把view concern寫進workflow。

### D. 每次建立 reference 同時寫永久 ACL grant

拒絕。現有與未來 Board member、last-reference revoke與多重direct access會造成grant/revoke漂移。動態 RLS derived access是較小的真相集合。

### E. 只做 client-side alias

拒絕。reload、兩人協作、RLS、cross-device、backup與permanent delete都無法成立，並會產生ghost projection。

### F. 第一版同時支援 Firebase

拒絕。Firebase現行provider沒有等價Board membership/RLS與transaction command boundary；半套支援會破壞自動read grant與atomic move。以explicit unsupported避免誤導。

### G. Reference另做一套近似primary的renderer

拒絕。複製title／tag／date／assignment／action／gesture／child JSX只能短期取得視覺相似；後續任何primary功能都會產生雙邊維護、測試marker假陽性與互動漂移。`data-*` marker相同不能證明component reuse。

### H. 所有surface塞入單一巨型variant component

拒絕。List、Kanban card與checklist具有真實版面差異；最小長期邊界是共用placement controller／frame／tree，並保留三個pure surface views，而不是以大量條件分支形成prop soup。

## Governance

- 本 ADR 是 identity／placement／derived-read 的 Architecture Memory Source。
- SPEC-095 是可執行 schema、RPC、UI、migration與驗證的 authoritative contract。
- 若未來要讓 tracked task進account-unplaced、跨 Workspace投影、條件式自動投影或取消compatibility mirror，必須重新進入架構決策，不得在本 DEV順手擴張。

## Decision outcome

`Accepted / RD Implementation Ready / Interaction Parity Amendment Accepted`。identity／placement／derived-read、DB與既有projection artifacts仍有效；但現行UI審查確認tracking reference仍以獨立content／details handler／subtree renderer實作，B13只證明外觀marker，B16驗證的固定唯讀context更已被最新capability-aware parity契約取代。既有B01～B16與QC01～QC07保留為historical baseline，不得宣稱新互動parity完成。RD下一步須完成shared surface/controller/tree rework與新interaction browser/QC evidence；Supabase TEST、deploy與release仍未完成。
