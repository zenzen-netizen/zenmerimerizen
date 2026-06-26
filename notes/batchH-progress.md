# BATCH H — PROGRESS

> Workstream 🅴 — JG-3/JG-4/JG-5 + ack T16-T18 dari `notes/message-coverage-audit.md`.
> Display-only (eksekusi deploy/close + notif post-hook + Lever-A NOL ubah). Branch `experimental`. Restart owner-only.

- [x] 1  /deploy: JG-3 lone-no-deploy → buildLoneNoDeploy · JG-5 double-msg (N1 KEBIT → ramping ack) ✅ commit 1
- [x] 2  /close: JG-4 (N2 TIDAK kebit manual → reply WAJIB detail tree-style) ✅ commit 2
- [ ] 3  /closeall /set /setcfg → ack/tree via format.js (konten utuh)

---

## 🔎 HASIL VERIFY (governing #2 — anti detail-hilang)

**N1 `notifyDeploy`** — caller TUNGGAL: `executor.js:797` (post-hook `deploy_position` TOOL).
- `/deploy <n>` → `deployLatestCandidate` → `executeTool("deploy_position")` (index.js:2828) → **post-hook KEBIT**.
- Guard `hasActiveLiveMessage()` (telegram.js:586) = **false** untuk `/deploy` manual (handler tak bikin live-message; cycle di-queue saat busy) → **N1 KEBIT**.
- ⇒ **JG-5 dobel-pesan TERKONFIRMASI** (reply inline T21 + N1). Keputusan: reply `/deploy` → **ack pendek** (detail penuh di N1). ✅ ramping aman.

**N2 `notifyClose`** — caller: `executor.js:802` (post-hook `close_position` TOOL) + `index.js:1223` (Lever-A emergency).
- `/close <n>` (index.js:3152) & `/closeall` (index.js:3172) panggil `closePosition` **LANGSUNG dari dlmm.js** (import index.js:8) — **BUKAN** via `executeTool` → **post-hook TIDAK jalan**.
- dlmm.js `closePosition` **tak** panggil `notifyClose` sendiri (cek: cuma data-field `peak_pnl_pct` "for notifyClose", bukan call).
- ⇒ **N2 TIDAK KEBIT untuk `/close` & `/closeall` manual.** Keputusan: reply **WAJIB tetap bawa PnL/detail** → tree-style, **JANGAN diramping** (kalau diramping → satu-satunya sumber PnL hilang). ✅ detail dipertahankan.

## Catatan
- closePosition success return: `pnl_usd`, `pnl_pct`, `close_txs`, `claim_txs`, `recorded_pnl_*`, `fees_earned_usd` (dlmm.js:2660-2676). Cabang lain (2692) tanpa pnl → PnL-line di-guard (skip bila null).
- Unit PnL ikut solMode (`fmtMoneySigned`); deploy amount selalu literal SOL.

## Bukti per fase
