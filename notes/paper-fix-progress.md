# PAPER REALISM FIX — progress tracker

**Tujuan:** paper-PnL bisa MEMPREDIKSI live-PnL → bench tepercaya uji racikan v2.1.
Acuan: `notes/paper-recon.md`. Branch: `experimental`.
**KESELAMATAN:** SEMUA paper-only (gate `isPaperMode()` / id `paper_`). Bot LIVE (dry_run=false)
TIDAK ke-sentuh. JANGAN sentuh `recordPerformance` bersama (bug Q4 = brief lain). Jangan sentuh
logika trade/exit/screening live. Verifikasi = smoke-test level kode.

> Status: F1 ✅ · F2 ✅ · F3 ✅ · F4 ✅ · F5 (opsional, SKIP) ⬜

---

## FASE 1(a) — KONFIRMASI ARTI `fee_active_tvl_ratio` ✅ TERKONFIRMASI (probe API live)

Probe read-only pool `EDeuGoVF…` (active_tvl KONSTAN $268,657 di semua timeframe):
| tf | fee | fee/active_tvl | ×100 | ratio API |
|----|-----|----------------|------|-----------|
| 5m | 13.82 | 0.00005144 | 0.005144 | 0.005102 |
| 1h | 334.92 | 0.0012466 | 0.12466 | 0.124622 |
| 24h | 10298 | 0.038331 | 3.8331 | **3.8331 (eksak)** |

**Kesimpulan (definitif):**
1. `fee_active_tvl_ratio` = **(fee / active_tvl) × 100** — yakni fee/active-TVL dlm **PERSEN**, atas window timeframe.
2. `fee` **window-dependent** (5m/1h/24h beda); `active_tvl` **konstan** (snapshot TVL aktif saat ini).
3. ⇒ fraksi yield-fee per-window yang BENAR = `fee/active_tvl` = `fee_active_tvl_ratio / 100`.

**Bug lama (paper-trading.js:114 + dlmm.js:1465-1468):** dua error bertumpuk —
(i) pakai `ratio` mentah tanpa ÷100 (×100 overstate); (ii) window salah: ratio diukur atas
timeframe screening (bot=30m) tapi diperlakukan window=1440 (24h).

**Model BENAR (yang dipakai fix):**
`feeYieldPerWindow = fee/active_tvl` (fraksi), `windowMinutes` = window tempat fee diukur →
`feesSol ≈ deposit × feeYieldPerWindow × (minutes_in_range / windowMinutes)`.
Demi STABILITAS (snapshot 5m/30m spiky), tangkap fee+active_tvl di **window 24h** (active_tvl konstan,
yield harian jauh lebih stabil & prediktif). `entry_fee_window="24h"` → windowMinutes=1440.

## FASE 1(b) — TANGKAP FIELD MENTAH SAAT ENTRY ✅
- `tools/dlmm.js` paper branch (`deployPosition`, gate `isPaperMode()`): fetch detail Meteora
  `timeframe=24h` (paper-only, fail-open) → `entry_fee` (raw `fee`), `entry_active_tvl` (raw
  `active_tvl`), `entry_fee_window="24h"` → persist via `trackPosition`. NOL sentuh executor/live.

## FASE 1(c) — TULIS ULANG AKRUAL FEE ✅
- `paper-trading.js` `simulatePaperMetrics`: param `feeTvlRatio`/`windowMinutes` → `feeYieldPerWindow`/`windowMinutes`.
  `feesSol = clamp(deposit × feeYieldPerWindow × (mir/win), 0, cap)` (cap defensif, tak mengikat normal).
- `tools/dlmm.js` `computePaperMetrics`: hitung `feeYieldPerWindow = entry_fee/entry_active_tvl`
  (window 24h); fallback posisi lama/fetch gagal = `fee_tvl_ratio/100` atas `config.screening.timeframe`.

## FASE 1(d) — SANITY (sebelum/sesudah) ✅
Smoke-test pure `simulatePaperMetrics` (deposit 0.5 SOL, in-range, harga flat → isolasi fee; cap=0.25 SOL):
- **NEW primary** (raw fee/active_tvl @24h): hot 3.83%/d in-range 24h → **3.83%** deposit (tak cap); 1h → 0.16%; modest 0.8%/d 24h → 0.80%; 2h → 0.067%. **Tak pernah cap.**
- **NEW fallback** (fee_tvl_ratio/100 @30m): ratio 0.11/0.56/6.80 (30m in-range) → 0.11% / 0.56% / 6.80%. Realistis, tak cap.
- **OLD** (ratio mentah sbg fraksi 24h): ratio median 0.56 full-day → **50% CAPPED ⚠️**; max 6.8 full-day → 50% capped; min 0.11 full-day → 11.3%. ⇒ OLD rutin kepukul cap & overstate gede (persis recon).
- `node -c` paper-trading.js + tools/dlmm.js → PASS; `npm test` (syntax semua) → PASS.

**Verdict FASE 1: ✅** fee paper sekarang realistis & prediktif; cap defensif tak mengikat normal. Jalur live `recordPerformance` TIDAK disentuh.

---

## FASE 2 — GAS-DRAG (Q6) ✅
- `paper-trading.js` `simulatePaperMetrics`: param baru `gasDragSol` (default 0). PnL dipecah
  `pnl_before_costs_sol = ilSol + feesSol` → `pnl_sol = before − costsSol` (costsSol=gas; slippage nyusul F3).
  Output tambah: `gas_drag_sol/usd`, `costs_sol/usd`, `pnl_before_costs_sol/usd`, `il_usd` (untuk dekomposisi F4).
- `tools/dlmm.js` `computePaperMetrics`: `gasDragSol = estimateGasSol({deploy:1,close:1,claim:1,swap:1})`
  (estimator SAMA dgn briefing, reports.js GAS_EST_SOL) = **0.0001 SOL/round-trip** (~$0.015 @ $150).
  Import `estimateGasSol` dari reports.js (no circular: lessons.js tak impor dlmm.js).
- Smoke: before 0.01915 − gas 0.0001 = net 0.01905 SOL ✓. Live TIDAK disentuh.

## FASE 3 — SLIPPAGE/SWAP (Q3) ✅
- `paper-trading.js`: konstanta `PAPER_EXIT_SLIPPAGE_PCT=0.01` (1%) + param `slippagePct`.
  Model: posisi single-side-SOL yg drift ke bawah range akumulasi base → close auto-swap base→SOL
  (Jupiter) bayar price-impact+fee. `slippageSol = baseValueSol × slippagePct` (di blok fill, ~line 102).
  Entry tanpa swap (SOL didepo langsung) → tak ada slippage entry. `costsSol = gas + slippage`.
  Output tambah `slippage_sol/usd`. Proxy flat (impact nyata butuh quote Jupiter — di luar lingkup).
- Smoke: in-range → slippage 0 (tak ada base); drift-bawah fill_frac 0.5 → slippage 0.002333 (1% base 0.2333);
  costs==gas+slip ✓, net==before−costs ✓. Paper TIDAK lagi frictionless.

## FASE 4 — DEKOMPOSISI PnL ✅
- `paper-trading.js`: `classifyPaperEdge(m)` (panen-fee / hoki-harga / rugi) + `formatPaperDecomposition(m)`
  (fee / IL-harga / slippage / gas + "edge sblm vs stlh ongkos" + sumber). Pure.
- `tools/dlmm.js` `closePaperPosition`: return tambah `decomposition{}` + `breakdown` (string), di-log saat close.
- **BONUS FIX (paper-only, double-count fee):** `recordPerformance` hitung `pnl=(final+fees)-initial`, tapi
  paper kirim `final_value_usd=position_value_usd` yg SUDAH termasuk fees → fee dihitung 2×. Diperbaiki di
  ARGUMEN closePaperPosition: `final_value_usd = position_value_usd − fees_usd − costs_usd` → recorded pnl =
  net after-cost = `m.pnl_usd`. Fungsi `recordPerformance` TIDAK disentuh (sesuai batasan brief).
- Smoke: in-range → "panen-fee" net +$0.46 (recorded==net ✓); drift-bawah → "rugi — fee tak nutup drag IL/harga"
  net −$2.39 (recorded==net ✓). `npm test` PASS.

## FASE 5 (opsional) — perhalus IL ⬜ SKIP (sesuai brief: "Boleh skip"). IL tetap orde-pertama
  (`paper-trading.js` blok fill). Bisa diperhalus belakangan (mis. quote Jupiter buat impact nyata).

## VERIFIKASI ✅
- **Fee realistis (tak cap):** smoke F1(d) — NEW 0.16–3.83% vs OLD pinned 50%.
- **Gas kepotong:** round-trip 0.0001 SOL via estimateGasSol (estimator briefing) → net = before − costs.
- **Slippage kena:** in-range 0; drift-bawah 1% × base value; di costs.
- **Dekomposisi muncul:** fee/IL/slippage/gas + edge sblm/stlh ongkos + sumber (panen-fee vs hoki-harga).
- **Recorded == net after-cost** (double-count fee fixed).
- `git branch`=experimental · log 4 commit (F1–F4) · `npm test` (syntax) EXIT 0.
- **Live UTUH:** `recordPerformance` TIDAK disentuh; semua perubahan di gate `isPaperMode()`/`paper_`
  (paper deploy branch, computePaperMetrics, closePaperPosition) + fungsi pure paper-trading.js.
  Tak ada sentuhan logika trade/exit/screening live. Bot live (id 0) tak di-restart oleh tugas ini.
