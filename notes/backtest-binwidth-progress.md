# BACKTEST BIN-WIDTH / RANGE COVERAGE — PROGRESS

**Script:** `scripts/backtest-binwidth.js` · **Branch:** experimental · **Acuan:** `notes/v2.1-testmethod-recon.md` (baris 91 + Q4).
**Sifat:** offline, BACA-SAJA `lessons.json` (nol tulis data/state/config). SIMULASI coverage, BUKAN apply ke live.

> Catatan nama file: task minta `notes/backtest-progress.md`, tapi nama itu sudah dipakai backtest **exit-params**
> (sudah selesai). Dipakai nama paralel `backtest-binwidth-progress.md` agar tak menimpa progress lama.

## ⚠️ CAVEAT WAJIB (lingkup)
Backtest ini **HANYA sisi COVERAGE / OOR-risk**. Sisi **FEE** (range lebih sempit = fee/$ lebih padat,
yang justru inti racikan bid_ask) **TAK bisa di-replay** dari data ini → output **INFORMASIONAL**.
**Keputusan final lebar bin = konfirmasi live/paper**, bukan dari backtest ini.

## Dataset
Filter: `!paper && !suspect_pnl && active_setup==="mainzen_v2" && Number.isFinite(pnl_pct)` → n=**75** (per 2026-06-16).
- `bin_range` (min/max/bins_below/bins_above): **75/75**. **`bins_above=0` untuk SEMUA** → single-side-BAWAH murni.
- `bin_step`: 74/75 (1 null). Distribusi: 80×6, 100×48, 125×20.
- `price_peak_pct` & `price_trough_pct` (excursion bin-quantized): **57/75** (18 record lama kosong).
- `bins_below` rentang 35–103 (mode 69).

## Model geometri (EKSAK — excursion bin-quantized di `state.js:505-516`)
Per gerak `k` bin dari entry: `price% = (1+step/1e4)^k − 1`. In-range `Δbin ∈ [−bins_below, +bins_above]`.
- **OOR-atas** ⇔ peak `Δbin > bins_above` (=0 → peak naik ≥1 bin). Kedalaman = peak−edge_atas (edge_atas=0%).
- **OOR-bawah** ⇔ trough `Δbin > bins_below`. Kedalaman = edge_bawah−trough (edge_bawah = `(1+s)^−bins_below−1`).
- Racikan = **bid_ask single-side-bawah**: tepi atas DI entry (deposit SOL), pas pump → idle SOL → exit "pumped above".

## Fase
- ✅ FASE 1 — OOR arah + kedalaman (peta excursion ke tepi range AKTUAL pakai bin_range)
      → cakupan excursion 56/74. **OOR-ATAS 50/56 = 89%** (median kedalaman **11 bin / +11.6%**, terdalam
        Merlin-SOL +29.5% = 26 bin). **OOR-BAWAH 0/56 = 0%** (sanity ✓: trade terdekat tepi bawah = BRIM-SOL
        trough −43.29% vs edge −49.7%, sisa margin 6.4pp — tak ada yg tembus). **Asimetri ekstrem:** tepi atas
        di entry (naik ≥1 bin langsung OOR), tepi bawah median −46% tak pernah disentuh → bins_below
        over-provisioned (coverage-side), tepi atas nol headroom.
- ✅ FASE 2 — Coverage % + ⭐ MISSED-UPSIDE (berapa upside kelewat karena single-side)
      → Coverage (n=56 peak&trough): **DALAM penuh 11%**, **tembus ATAS saja 89%**, tembus BAWAH 0%, dua-arah 0%.
        **MISSED-UPSIDE** — exit "pumped above" (n=32): median **+13.8%**/trade, avg +14.6%, max +29.5%, plafon-$
        total **~$67.83**; SEMUA breacher-atas (n=50): median +11.6%, plafon ~$82.54. Bandingkan net buku −$8.43
        → biaya STRUKTURAL single-side-bawah (forfeit up-move) >> realisasi. ⚠️ plafon = butuh HOLD token + IL,
        TAK achievable single-side; capture upside = GANTI strategi (dual-side), fee TAK ter-replay.
- ⬜ FASE 3 — Kandidat lebar/bentuk (bins_below ±, skenario tepi-atas/dual-side) → `notes/backtest-binwidth-results.md`
- ⬜ VERIFIKASI — script jalan, lessons.json SHA tak berubah, npm test hijau
