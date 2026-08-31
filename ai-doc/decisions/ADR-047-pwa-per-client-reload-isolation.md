# ADR-047 PWA 每分頁重新載入隔離與 Workbox effect ownership

狀態：Accepted／RD Implemented／Local Automated QA PASS／Independent QC PASS／Physical Device Supplemental Not Verified／Not Released

日期：2026-08-31

關聯：DEV-097、DEV-096、DEV-041、SPEC-041、ADR-037

## Context

DEV-097 的產品決策已確認：normal update 只協調「何時重新載入才不會中斷工作」，不是讓使用者
決定是否永久使用舊版本。safe client 在自然邊界收斂；dirty client 不以時間強制 reload。

現行 `virtual:pwa-register` 的 `registerSW()` 會在 Workbox `controlling` event 內直接呼叫
`window.location.reload()`；同時 `vite.config.js` 設定 `clientsClaim: true`。因此，即使應用程式在
activation 前做 safety preflight，新 worker 仍可能在 preflight 後接管其他分頁，並由套件內部
listener 繞過 `pwaUpdateService` 的 local gate。使用 heartbeat／TTL 把沒有近期訊號的分頁視為
離線，也不能證明該分頁已關閉或沒有未保存資料。

另一個衝突是 DEV-096 activation transaction 五分鐘即 stale，但舊方案要求等待所有 live clients
都載入 target 才 completed；normal dirty 又可無期限延後。這三條不能同時成立。

使用思考習慣：#問對問題、#系統描繪、#可驗證性

## Decision

採用「application-owned Workbox registration + non-claiming activation + release-scoped precache +
per-client local convergence」：

1. `vite-plugin-pwa` 只負責產生 manifest／service worker；維持 `injectRegister: false`。
2. `pwaUpdateService.ts` 不再 import `virtual:pwa-register`，改以 package.json 的直接依賴
   `workbox-window` 建立 `Workbox` instance、監聽 waiting／activated／redundant，並送出
   `messageSkipWaiting()`。不得安裝任何套件內建或第二個 reload handler。
3. `vite.config.js` 固定 `clientsClaim: false`、`skipWaiting: false`、
   `cleanupOutdatedCaches: false`，並以不可變 release ID 建立 release-scoped `cacheId`。production
   release ID 缺失時沿用 DEV-083 build gate fail closed，不產生共享的 production cache namespace。
4. 一個 safe client 可取得 DEV-096 owner／fence並 activation waiting worker；activation 不得觸發
   其他既有 documents 的 application navigation／reload。瀏覽器對同一 registration 的 active
   worker transition 仍可能對既有 controlled document 發出 `controllerchange`；`clientsClaim:false`
   只保護未受控 client，不能宣稱既有 controlled client 的 controller identity 永不變。
5. 每個 document 只在自己的 local owners safe 且進入自己的 natural boundary 後 reload。另一分頁
   dirty 不會被 activation、controllerchange 或 fallback navigation 迫使 reload；舊 release cache
   必須保留，舊 bundle 的 lazy asset／API 相容性另由 real-SW served-byte evidence 證明。
6. DEV-096 transaction 只描述 target worker 的 detection／activation／owner reload／版本驗證，
   維持五分鐘 stale policy。有效 owner document `currentVersion === targetVersion` 即可 completed；
   不等待所有 clients。
7. 其他舊 documents 的 convergence 是 session-local obligation，不是 global transaction phase。
   `completedVersion === latestVersion` 只有在目前 document 也已載入 latest 時才可 suppress；否則
   目前 document 保留 pending target，於自己的 boundary 使用一次 session reservation reload，
   不重開 activation transaction、不再送 `SKIP_WAITING`。
8. reload safety 只使用目前 document 的 owner registry 與明確 readiness tokens。不得以 heartbeat、
   TTL、BroadcastChannel absence 或 localStorage record expiry推論遠端 client safe。
9. App root lifecycle bridge 可位於 AuthGate 外並送 boundary intent，但不能宣告 safety ready。
   `auth-shell` 與 `active-view` readiness 必須分別由 AuthGate／AppContent 內部明確回報；active owner
   manifest 未滿足時 fail closed。animation frame 只可 debounce，不可作為 owner 完整性的證據。
10. normal path 不自動清理歷史 release precache。人工 cache recovery 仍沿用 DEV-096 明確入口；
    自動舊 cache 回收須等可靠的 service-worker client census 與版本支援政策另立契約。

## Consequences

### Positive

- reload side effect 只有一個 application owner，可被 source assertion 與真實 SW trace證明。
- dirty tab 不需要參與分散式共識；worker activation 與 dirty protection在架構上解耦。
- DEV-096 五分鐘 transaction timeout只約束 activation，不會把合法的長時間 dirty延後判成失敗。
- fresh client 可直接取得新版本；舊 client 的 JavaScript execution 不會因 `controllerchange` 自動
  navigation，直到自己的自然邊界才由 application owner 重新載入。
- 不需要以不可靠 TTL 猜測分頁是否仍存在。

### Cost／risk

- `pwaUpdateService` 必須改寫 registration adapter，並把 `workbox-window` 升為直接依賴。
- release cache 不自動清理會增加 Cache Storage 使用量；本期以資料安全優先，後續需另建可驗證的
  reclamation contract。
- normal release 在舊 client convergence 期間必須維持 API／資料格式向後相容；無法相容的更新不
  得走 normal policy，必須進 future critical／mandatory update contract。
- `clientsClaim: false` 使 controller transition 不再是 reload trigger；驗證必須改用 waiting worker
  activation state、document release identity與實際 navigation readback。它不提供同一 registration
  下既有 controlled documents 的 controller identity isolation；若產品必須保證該 invariant，需另立
  origin-wide quiesce 或 per-scope architecture，不得由本 ADR 偷渡。

## Alternatives rejected

### A. 保留 `virtual:pwa-register`，在外層增加 local hard gate

拒絕。套件的 `controlling` listener仍可直接 reload，local gate不是所有 effect的共同入口。

### B. 保留 `clientsClaim: true`，以 heartbeat／TTL做 origin-wide all-safe barrier

拒絕。preflight後仍有 dirty race；TTL absence不能證明 client已關閉，且 frozen／unknown client正是
最不能被推定安全的對象。

### C. 所有 live clients 都 quiesce／ack 後才 activation

拒絕作為 normal第一版。它需要跨分頁凍結新 mutation、可靠 client census與同步 boundary，會把
每分頁 reload safety升格為分散式共識，並讓 hidden client長期阻塞所有人。

### D. activation transaction 等待所有 clients載入 target才 completed

拒絕。它與五分鐘 stale及 normal dirty無期限延後互斥；per-client convergence必須獨立。

### E. activation 時清除舊 precache，依賴舊 client自行恢復

拒絕。舊 document可能仍需 lazy chunk；在其自然邊界前刪除資產會把安全延後變成不可預期故障。

## Deferred decision：verified old-cache reclamation

狀態：`Future Phase Captured / Not Requested`。

- 目的：在不破壞仍由舊 controller服務的 document前提下，回收不再被任何 client使用的 release cache。
- 依賴：可靠的 Service Worker client census、client↔release identity、PWA-owned cache allowlist、
  API/version support policy與 quota failure evidence。
- 驗收方向：仍有舊 client時保留其完整 lazy assets；最後 client離開後只刪允許的舊 release cache；
  census未知或不支援時不自動刪除。
- Re-entry trigger：至少一個 DEV-097 release完成真實 production lifecycle驗證，且產品要求自動回收
  Cache Storage時另立 DEV／spec；不得在 DEV-097 implementation順手加入猜測式清理。

## Governance

- 本 ADR 是 PWA registration ownership、controller isolation、transaction／client convergence邊界與
  cache retention 的 Architecture Memory Source。
- SPEC-041 DEV-097 addendum 是行為、module、failure、QA與work package的可執行 authority。
- 若未來要恢復 `clientsClaim: true`、使用 origin-wide quiesce、加入自動 cache reclamation，或讓
  backend不再相容舊 normal client，必須重新進入架構與產品契約，不得局部改 config偷渡。

## Decision outcome

`Accepted / RD Implemented / Local Automated QA PASS / Independent QC PASS / Physical Device Supplemental Not Verified`。DEV-097已完成Workbox
effect ownership、application navigation/cache retention isolation、owner adapters與UI；local automated
QA與independent QC已驗證九-owner、dual-tab及A→B→C real-SW；physical device supplemental仍待執行。任何verifier若仍允許
`virtual:pwa-register` internal reload、`clientsClaim: true` 或 activation清除舊 release assets，均不得
宣稱 DEV-097安全契約成立。
