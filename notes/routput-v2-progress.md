# R-output v2 — Progress (lapisan TAMPILAN, RENDER-ONLY)

> Branch `experimental`. RENDER-ONLY: NOL perubahan logika trade/exit/sizing/screening/recordPerformance.
> Lanjutan dari `notes/routput-progress.md` (v1). Mulai 2026-06-19. Tujuan: pertajam instrumen baca v2.1.

## Temuan kunci (uji empiris lessons.json, 93 record full-field)
- **`pnl_usd` = TOTAL sudah termasuk fee.** Terbukti: `pnl_usd ≈ (final−initial) + fee` di SEMUA baris
  (mis. pnl_usd=+0.32 padahal leg final−init=−0.16, fee=+0.48 → fee yang nyelametin).
- **`final_value_usd − initial_value_usd` = leg-harga (efek-harga), fee TIDAK termasuk di `final`.**
- Maka **EFEK-HARGA = pnl_usd − fee** (= final−initial). Rumus tugas "final−initial−fee" itu asumsi keliru
  (anggap final memuat fee) → akan double-subtract. Dipakai rumus yang benar sesuai intent.
- Headline `$`(pnl_usd) & `%`(pnl_pct) SUDAH satu basis (total). pnl_pct = pnl_usd/initial×100 (cek: 0.52/14.48=3.6%✓).
- solMode=false di deploy ini → notif `$` benar (USD).

## Status fase
- ✅ FASE 1 — notifClose decompose (Fee/Efek-harga/Gas) + $/% konsisten (headline=total)
- ⬜ FASE 2 — metrik fee-density (/positions + /report): fee/$ + fee-APR
- ⬜ FASE 3 — /wallet Bebas(cair) vs Real-deploy/slot; fix double-count tertahan
- ⬜ FASE 4 — glitch cost-drag Quant Edge (kurung) + cek basis modal

## Catatan implementasi
- FASE 1 (telegram.js notifyClose): headline `📊 Net PnL: $X (Y%)` (keduanya total incl fee).
  Sub-baris `💎 Fee panen ±$ · 📈 Efek-harga ±$` (Fee+Efek=Net persis) + `⛽ Gas ~SOL (est, di luar PnL)`.
  Gas = estimateGasSol(close+claim+swap) ~0.00006 SOL (import dari reports.js, no circular).
  Formatter `usd()` tunggal → sign/presisi seragam. Hapus baris lama "Fees earned (sudah termasuk)" (redundan).
  Verifikasi 3 kasus (fee-nyelametin / rugi / give-back) reconcile sempurna. Commit FASE 1.
