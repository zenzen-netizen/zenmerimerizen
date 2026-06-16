# BACKTEST EXIT PARAMS — PROGRESS

**Script:** `scripts/backtest-exits.js` · **Branch:** experimental · **Acuan:** `notes/v2.1-testmethod-recon.md`.
**Sifat:** offline, BACA-SAJA `lessons.json` (nol tulis data/state/config). SIMULASI, bukan apply ke live.

## Dataset
Filter: `!paper && !suspect_pnl && active_setup==="mainzen_v2" && Number.isFinite(pnl_pct)` → n=**74** (per 2026-06-16).
Field cakupan penuh 74/74: `trough_pnl_pct`, `peak_pnl_pct`, `pnl_pct`, `initial_value_usd`, `pnl_usd`.
Rug headline: **1B-SOL** pnl_pct −45.05% / pnl_usd −16.14 / init $35.8 / trough −12.16 / reason
"Trailing TP: Stop loss: PnL −12.16% <= −12%" → **gap stopLoss(−12)→realita(−45)** = caveat optimistik krusial.

## Model
- **stopLoss L:** trigger ⇔ `trough_pnl_pct ≤ L` → simExit% = L (ABAIKAN overshoot/slippage — optimistik).
  Tak trigger → `pnl_pct` asli. simUsd = simExit%/100 × initial.
- **trailing (T,D):** armed ⇔ `peak_pnl_pct ≥ T` → simExit% = `peak − D` (mekanikal). Tak armed → `pnl_pct` asli.
  APPROX: urutan peak/trough TAK diketahui → RANKING, bukan vonis.
- **Agregat (cara /report):** net_usd=Σpnl_usd, roi%=net/Σinitial, win_rate, profit_factor=ΣwinUsd/|ΣlossUsd|.
- **Trade-off stopLoss (inti):** WINNER-cut (actual>0 & triggered) vs LOSER-capped (actual≤L & triggered)
  + LOSER-deepened (L<actual≤0 & triggered).

## Fase
- ✅ FASE 1 — STOPLOSS backtest (faithful trigger; winner-cut vs loser-capped; vs baseline −12; rug caveat)
      → SANITY ✓ (script raw = /report: net −$8.43, win 69%, PF 0.53). Temuan: −8…−12 cuma rug ke-trigger
        (perbaikan PALSU: model cap −12 tapi realita gap −45); −6 motong 2 winner (PF↓1.30, net↓).
- ✅ FASE 2 — TRAILING backtest (approx ranking; (T×D) grid vs baseline 1.5/1)
      → baseline (1.5/1) net −$8.03 ≈ raw aktual. D=0.5 > D=1.0 konsisten; T rendah lebih baik;
        top (0.8/0.5) +$10.39 PF 20.66 = PLAFON OPTIMIS (model asumsi jual dekat puncak) → arah valid,
        magnitudo TAK dipercaya → konfirmasi paper.
- ⬜ FASE 3 — OUTPUT tabel + rekomendasi + SANITY (raw-actual ≈ /report) → `notes/backtest-results.md`
- ⬜ VERIFIKASI — jalankan, sanity, SHA lessons.json tak berubah, npm test
