# Workstream 🅶 — Trigger-Frequency + Backtest SL-tighten ANALISA Progress

Bot: MAIN (meridianzen)
Branch: experimental
Mode: READ-ONLY (no code edits, no restart, ran existing backtest script)
Scope: mainzen_v2_1 SAJA (147 records)

## Fase Checklist

- [x] **Fase 0** — Setup + konfirmasi nilai live (stopLossPct = -10)
- [x] **Fase 1** — Klasifikasi PRESISI (mainzen_v2_1)
- [x] **Fase 2** — Frekuensi SL-cluster NYATA (1a & 1b) + "apakah bahaya berlanjut"
- [x] **Fase 3** — Avg-win & MAE (mainzen_v2_1) buat threshold
- [x] **Fase 4** — BACKTEST tighten + cek GAP-THROUGH
- [x] **Fase 5** — Recommendation engine existing bilang apa?
- [x] **Fase 6** — Vonis berbasis angka

## Hasil ringkas

Temuan lengkap: notes/G-trigger-analysis-findings.md

### Key numbers:
- 147 records v2_1. 5 SL-events (3.4%). 0 paper/suspect.
- SL live = -10% (user-config.json confirmed).
- Max same-day SL streak (WIB) = 1. Max chrono streak = 2 (only 1 pair).
- Back-to-back SL days = 3 (24→25, 25→26, 26→27 Jun WIB).
- 1 hari dengan >=2 SL-events (27 Jun WIB).
- Setelah SL: 1 kasus SL beruntun (#4→#5), 3 kasus diikuti menang.
- avg-win = +0.81%, avg-loss = -1.38%. 50% avg-win = +0.40%.
- Winners' worst PnL trough = -7.22%. 0 winner dengan trough <= -8%.
- Backtest: SEMUA level tighten (-5 s/d -9) NET POSITIF vs -10.
  Best: -6 (+$2.29, 1 win-cut). Safe: -8 (+$1.98, 0 win-cut).
- Gap-through: minimal. Cumax 2/5 SL events gap >2pp. Tidak ada PnL trough < -14%.
- Engine existing: menyarankan JANGAN tighten (winnersDipDeep=true)
  TAPI berbasis price MAE (-33.5%), bukan PnL MAE (-7.22%).

### Vonis:
- -8% = level tighten optimal (0 winner-cut, +$1.98)
- -6% = best net (+$2.29, 1 winner-cut: glippy)
- Fitur = asuransi langka (5 SL events / 147 records)
- Tidak ada gap-through ekstrim di PnL dimension
- Backtest net TIDAK negatif di level manapun