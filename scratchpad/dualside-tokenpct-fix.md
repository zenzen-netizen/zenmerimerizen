# dualSideTokenPct unit fix (MAIN — kode shared, nanti sync ke v3)

Masalah: kode baca dualSideTokenPct sbg PECAHAN (clamp [0,0.5], default 0.10),
tapi docs/tool-desc/label `/settings` bilang PERSEN ("0.1–50, default 10").
Jebakan: set 10 sesuai docs → min(0.5,10)=0.5 → 50% SOL (5× niat).
Fix: samain kode ke PERSEN — clamp [0,50] lalu /100. Default 10% efektif tetap.
Config-gated (dualSideEnabled default OFF). NOL deploy/swap/network/restart.

## Progress
- [x] 1. branch (experimental) + tampilkan baris current tokenPct — MATCH brief OLD
- [x] 2. config.js default 0.10 → 10 (persen)
- [x] 3. dlmm.js clamp pecahan → persen (min 0.5→50, tambah /100)
- [x] 4. node --check + inspeksi
- [x] 5. commit

## Bukti nol-perubahan-perilaku
- Satu-satunya pembaca config mentah = dlmm.js:749 → assign ke var lokal.
- Konsumen lain (dlmm.js:920/921/969) pakai var LOKAL yg tetap PECAHAN (krn /100).
- Default 10 → min(50,10)/100 = 0.10 = sama persis kayak sebelum. ✅
- swapSol = finalAmountY * 0.10 (tak berubah); percentX = 0.10 (tak berubah).
