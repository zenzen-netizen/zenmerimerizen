# dualSideTokenPct unit fix — v3 (sync dari main cb51574)

Terapin patch identik dari main: kode baca dualSideTokenPct sbg PERSEN (clamp [0,50] /100),
biar cocok docs/tool-desc/label + konsisten upsidePct. Default 10% efektif tetap.
v3 lagi ON (dualSideEnabled=true) tapi 2 edit ini config-gated & nol-perubahan-perilaku.
NOL deploy/swap/network/restart (owner restart di akhir).

## Progress
- [x] 1. branch (experimental) + baris current — MATCH main pre-fix
- [x] 2. config.js default 0.10 → 10 (persen)
- [x] 3. dlmm.js clamp 0.5 → 50 + /100
- [x] 4. node --check + inspeksi + parity vs main
- [x] 5. commit → STOP (owner restart)

## Nol-perubahan-perilaku
Default 10 → min(50,10)/100 = 0.10 fraction = 10% = sama persis kayak sebelum.
Var lokal tetap pecahan → swapSol & percentX tak berubah. Parity sama main cb51574.
