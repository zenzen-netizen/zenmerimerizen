# Dual-side E1 — Fase 4a+4b (pre-swap lokal + cleanup gagal-separuh)

Config-gated, default OFF. Jalur LOKAL (Cara B) saja — jalur relay (Cara A) tidak disentuh.

[x] 1. Verifikasi branch (experimental) + node --check baseline
[x] 2. Perubahan 1 — import `swapToken` dari `./wallet.js`
[x] 3. Perubahan 2 — `const`→`let` untuk `finalAmountX` dan `finalAmountY`
[x] 4. Perubahan 3 — suntik pre-swap SOL→token sebelum `totalYLamports` (gated `dualSide && dualSideTokenPct > 0`)
[x] 5. Perubahan 4 — cleanup di catch: swap token balik ke SOL kalau pre-swap sukses tapi deploy gagal
[x] 6. `node --check` lolos; grep: `swapToken`=3, `dualSideSwapped`=3, `let finalAmountX|finalAmountY`=2
[x] 7. git diff --stat + commit

Semua 4 OLD string cocok tepat 1 tempat (diverifikasi grep -c sebelum edit). Tidak ada
`deployPosition`/`swapToken`/apa pun yang menyentuh network/wallet dipanggil selama proses ini —
murni edit teks + `node --check` + grep.

Default tetap OFF (`config.strategy.dualSideEnabled` default `false`, tidak diubah). Restart pm2
adalah keputusan owner — kode ini tidak mengubah perilaku live sampai racikan mengaktifkan
`dualSideEnabled`.

Live-test sebelumnya (LIQENG-SOL, position `CjAVyRzbw8Baisybc6oLvQGHVSUas4wf4i4HxSMbfQqf`, 0.1 SOL,
paksa-config-di-memori) menunjukkan gap persis yang fase ini tutup: rentang atas kebentuk
(`upper_bin -514 > active_bin -527`) tapi `amount_x=0` karena jalur lokal belum pernah beneran
nge-swap SOL→token. Fase 4 ini menambahkan swap itu (Perubahan 3) + safety net kalau swap sukses
tapi deploy on-chain gagal separuh jalan (Perubahan 4).
