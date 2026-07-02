# Build #1 — Referral toggle + Swap-retry
- SHA awal: a16a13b6e564fdf4ddec2717e0e896e00b66c5aa
- ✅ Fase 1 referral toggle — config.js + tools/wallet.js (SHA: d7530ce)
- ✅ Fase 2 swap-retry helper + 2 call site — tools/wallet.js (helper) + index.js + tools/executor.js (SHA: 126c8f6)

## Status: KEDUA FASE COMMIT + RESTART DONE — boot clean (2026-06-28T05:09Z, restart #47, unstable:0, cron+TG up, nol error). Verifikasi FUNGSIONAL nunggu event swap/close berikutnya (saat ini 2/2 posisi open, screening skip).
- node --check: semua lolos (config.js, tools/wallet.js, index.js, tools/executor.js) + `npm run test:syntax` repo-wide exit 0
- Verifikasi owner FASE 1: swap berikutnya `referral_account` masih terisi (ON). Tes OFF: set `jupiterReferralEnabled:false` di user-config → restart → swap → `referral_account` null.
- Verifikasi owner FASE 2: close berikutnya log `Auto-swap base→SOL attempt 1/3` muncul & sukses normal (jalur retry hanya aktif saat gagal).
- Import `swapBaseToSolWithRetry` ditambah di: index.js ✅ (baris 9) + tools/executor.js ✅ (baris 12).
- Blok OLD tak-cocok: hanya executor.js post-hook ada 1 baris komentar ekstra di live (non-material, ikut terbuang); dicocokkan ke teks live. Sisanya cocok persis.
