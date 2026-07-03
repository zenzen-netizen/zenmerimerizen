# Dual-side E1 — Fase 4 fix (bug satuan amount_out RAW vs HUMAN)

Config-gated, default OFF.

[x] 1. branch (experimental) + node --check baseline
[x] 2. Fix Perubahan 3 (swap block: raw→human + cek success)
[x] 3. Fix Perubahan 4 (cleanup: cek success)
[x] 4. node --check + grep
[x] 5. commit

## Konteks

Bug ditemukan lewat live-test 0.1 SOL dual-side ke LIQENG-SOL (owner-driven): `swapToken()`
mengembalikan `amount_out` dalam RAW base units (Jupiter `outputAmountResult`), tapi kode
pre-swap fase4 langsung menugaskannya ke `finalAmountX` yang dipakai downstream (baris
`totalXLamports = new BN(Math.floor(finalAmountX * Math.pow(10, decimals)))`) sebagai
HUMAN-readable amount. Double-scaling ini bikin request jauh lebih besar dari saldo asli →
`insufficient funds` pas simulasi deploy. Cleanup (Perubahan 4) mewarisi bug yang sama karena
memakai `finalAmountX` (masih raw) buat swap-balik → cleanup ikut gagal, nyisain ~0.01 SOL
worth token nyangkut di wallet (sudah di-swap manual balik ke SOL secara terpisah).

## Perubahan sesi ini

Konversi raw→human (fetch `decimals` mint via `getConnection().getParsedAccountInfo` lalu
bagi `10^decimals`) **sudah dipasang duluan** di sesi yang sama (respons ke instruksi
"ops2 dulu baru 1") — belum sempat di-commit. Nama variabel beda dari draf runbook awal
(`dsTokenOutRaw`/`dsDecimals` vs `dsRawOut`/`dsDecimals`) tapi secara fungsi ekuivalen.

Ditambahkan sesi ini (delta murni, bukan re-do):
- Guard pre-swap: `if (!dsSwap?.success || !Number.isFinite(dsTokenOutRaw) || dsTokenOutRaw <= 0)`
  — sebelumnya cuma cek `Number.isFinite`, sekarang juga menolak kalau `dsSwap.success` falsy.
- Cleanup: `swapToken()` hasil ditangkap (`dsBack`), dicek `dsBack?.success` — sukses → log
  biasa, gagal → `log("deploy_error", ...)` dengan pesan lebih tegas (token nyangkut, perlu
  swap manual) alih-alih diam-diam menganggap selesai.

## Verifikasi

- `node --check tools/dlmm.js` → lolos (baseline & setelah edit).
- `grep -c "dsTokenOutRaw\|dsDecimals"` → 4 (deklarasi + pemakaian).
- `grep -c "dsBack?.success"` → 1.
- `git diff --stat` → cuma `tools/dlmm.js`.
- Nol eksekusi/deploy/swap/network selama proses fix ini.

Default tetap OFF (`config.strategy.dualSideEnabled` default `false`). Live-test ulang
(dengan fix ini) belum dijalankan — direncanakan sebagai langkah verifikasi terpisah.
