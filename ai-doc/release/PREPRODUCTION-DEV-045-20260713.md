# DEV-045 Pre-production Evidence - 2026-07-13

狀態：Level 3 Execution In Progress / Production Mutation Not Authorized

## Source boundary

- Branch：`持續優化2`
- Starting commit：`437c4cc`
- Upstream：`origin/持續優化2`
- Starting worktree：clean
- Firebase preview target：`projed-cc78d / level3-smoke`
- Supabase TEST：`fhisnnufoeulxqrchldf`
- Supabase production：`knodlkxqpcqyrtgwpdst`

## Completed evidence

- Staging env resolves toProJED-TEST，OAuth mode，無test email/password，auto-login disabled。
- Production migration forensic：12個remote-only statements已下載；source補回後production remote-only為0。
- Production dry-run：16個local-only已分類為11個history-only repair與5個真實pending migration；未執行production repair/push。
- TEST backup：schema 136935 bytes / SHA-256 `354BA21865ED82C25D2E85A3A2B4275478CA9B4C9AE579AC6F0C591FF59A5B08`；data 83593 bytes / SHA-256 `1361429E5465D9D5323B5020FCA75233F2EDFF2DECB7ACE15B2B0C32CC2E6A2D`。
- TEST migration：12份缺漏migration已套用；目前38/38 local/remote timestamps一致。
- Edge source：TEST `calendar-feed`逐檔等於repo；production仍是較舊source，保留作rollback baseline。
- Migration provenance verifier：65 passed / 0 failed。

## Remaining Level 3 gates

- 從最終release commit重跑`verify:source`與staging artifact secret scan。
- 部署新的Firebase `level3-smoke` preview並驗證bundle provenance、HTTPS、console/pageerror/network與service worker。
- 以staging Google OAuth完成authenticated UI、DEV-045 v3 preview/live ICS identity、token lifecycle、v1/v2 compatibility與cleanup。
- 至少一個Google Calendar或Outlook外部訂閱client完成首次ingestion；另一client若受同步延遲限制，需保留pending evidence與觀察時間。

## Production stop gate

在Level 3 authenticated/ICS/client evidence未完成，以及release owner未明確核准production mutation前，不執行migration repair、DB push、production Edge deploy或Firebase live deploy。
