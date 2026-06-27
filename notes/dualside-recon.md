# Dual-side feasibility — RECON (BACA-SAJA)

> Branch `experimental`. 2026-06-19. NOL edit/restart/commit (cuma file ini). Bukti = file:line. Ragu = UNKNOWN.
> Pertanyaan inti: bisakah bot nangkep MISSED-UPSIDE (plafon ~$68–83, `notes/backtest-binwidth-results.md`)
> lewat range dual-side / extend-atas? Acuan data: backtest-binwidth (n=74, single-side-bawah murni).

## ⭐ VERDICT UTAMA: **BUILD-BARU (sedang)** — BUKAN switch-strategi
- "spot/curve/bid_ask" itu **BENTUK distribusi likuiditas** (SDK shape), **bukan arah/dua-sisi**. Ganti ke
  "spot" TIDAK bikin dual-side. Bukti empiris: 178 record (spot n=27 + bid_ask n=151) **SEMUA `bins_above=0`
  & `amount_x=0`** → tiap strategi selama ini di-deploy **single-side-SOL-bawah**.
- Dual-side perlu **HOLD base-token saat entry** (`amount_x>0`) yang **di-blokir keras** di 2 lapis
  (executor pre-check + dlmm deep). Jadi bukan flip config — perlu kode.
- **TAPI sedang, bukan mahal**: lapisan deposit/SDK **sudah mendukung** dual-side (lihat Q3) — yang kurang =
  buka gate + beli-token + sizing + model-uji. Plumbing inti sudah ada, tinggal di-gate-on + dilengkapi.

---

## Q1 — STRATEGI yang didukung + geometri
- Mapping: `spot→StrategyType.Spot · curve→Curve · bid_ask→BidAsk` (`tools/dlmm.js:766-770`), validasi
  "Use spot, curve, or bid_ask" (`:774`).
- ⭐ **"spot" ≠ dual-side.** Spot/Curve/BidAsk = pola SEBARAN likuiditas antar-bin (Spot=rata, Curve=memusat
  di tengah, BidAsk=menumpuk di tepi/U-shape buat DCA-volatil). **Ortogonal** terhadap single vs dual-side.
  Arah ditentukan `amount_x/amount_y` + `bins_above/below`, BUKAN nama strategi.
- Range diset 2 cara (`tools/dlmm.js:701-719`): (a) `downside_pct/upside_pct` → dihitung jadi
  `activeBinsBelow/Above`; atau (b) `bins_below/bins_above` langsung. `minBinId=active−below`,
  `maxBinId = single? active : active+above` (`:877-878`).
- **Bukti 27 "spot" = single-side juga:** scan `lessons.json`+arsip → strategy=spot n=27 `bins_above=[0]`
  `amount_x>0=0` (sama persis bid_ask n=151). → spot pernah jalan TAPI tetap single-side-bawah.

## Q2 — `bins_above>0` dilarang di mana & kenapa
- **Lapis 1 (executor pre-check):** `amount_x>0` → tolak "only single-side SOL deploys"
  (`tools/executor.js:909-914`); single-side + `bins_above≠0` → tolak "must use bins_above=0" (`:955-964`).
- **Lapis 2 (dlmm deep):** `finalAmountX>0` → throw (`tools/dlmm.js:732-734`); single-side +
  `bins_above/upside>0` → throw (`:739-743`); single-side **paksa** `activeBinsAbove=0` (`:744-746`) &
  `maxBinId` wajib = active bin (`:883-885`).
- **Kenapa:** bot diarsiteki **single-side-SOL only** (deposit SOL, "beli pas turun"). Prompt pun
  hardcode `bins_above = 0` (`prompt.js:153`).
- **Biar boleh:** lepas blok `amount_x>0` + izinkan `bins_above>0` (idealnya di belakang flag eksperimen),
  KARENA bin di ATAS harga aktif butuh inventory token-X (Y/SOL cuma ngisi bin BAWAH).

## Q3 — Mekanik entry dual-side (butuh hold token?)
- **Ya.** Mekanik DLMM: bin **di bawah** active = quote (SOL/Y), bin **di atas** active = base token (X).
  Dual-side / extend-atas (`maxBinId>active`) **mensyaratkan deposit X (token)**.
- Sekarang: deposit **SOL-only** (`totalYAmount=totalYLamports`, `totalXAmount=BN(0)`), `amount_x=0` dipaksa.
- ⭐ **Plumbing X SUDAH ADA (tergate mati):** `finalAmountX` di-plumb (`dlmm.js:727-728,822,868`); kalau
  `amount_x>0` → fetch decimals mint + `totalXLamports` dihitung (`:905-908`); **panggilan SDK sudah kirim
  `totalXAmount: totalXLamports`** di kedua jalur (`:1089` chunkable, `:1105` standar). Jadi SDK-nya
  native dual-side — yang menahan cuma guard Q2 (mati di `:732`, jadikan `:905-908` dead-code sekarang).
- **Implikasi sizing/modal:** harus **beli token dulu** (Jupiter `swapToken` ada, dipakai auto-swap close)
  → modal terbelah SOL (bin bawah) + token (bin atas). Perlu logika split + slippage beli. Exposure token
  ada **sejak entry** (bukan cuma pas harga turun).

## Q4 — Trade-off IL / FEE / RISIKO
- **FEE:** dual-side panen di **dua arah** — pump (89% kasus) lewat bin-atas tetap menghasilkan fee &
  nahan in-range lebih lama; single-side-bawah: pump = langsung OOR-atas, **nol fee dari up-move**
  (backtest: OOR-atas 89%, missed median +11.6%). Dual-side = fee lebih padat saat tren naik.
- **IL / direksional:** dual-side **nahan token sejak entry** → kena drift harga token (IL dua-sisi).
  Single-side-bawah: mulai 100% SOL, baru "beli" token kalau harga TURUN ke range (DCA) → IL satu-arah.
- ⚠️ **RUG/downside LEBIH BURUK di dual-side:** token-X di entry → rug (token→0) langsung menghantam
  inventory token. Single-side-bawah mulai 0 token (lebih terlindung saat masuk). Ini trade-off inti:
  capture-upside ditukar dengan **exposure-token-di-muka**.
- Catatan: $68–83 itu **PLAFON** — backtest tegas bilang butuh HOLD token + kena IL, **TAK achievable**
  single-side (`backtest-binwidth-results.md` FASE 2 + FASE 3-B).

## Q5 — Varian yang didukung data (bentuk range nangkep pump)
- Dari backtest FASE 3-B (n=56), **extend-atas asimetris** cukup (tak perlu simetris penuh):
  | bins_above | OOR-atas freq | captured med | missed med |
  |---|---|---|---|
  | 0 (base) | 89% | +0.0% | +11.2% |
  | 10 | 55% | +10.5% | +1.1% |
  | 20 | 2% | +11.2% | +0.0% |
- → **bins_above ~10–20** nutup mayoritas pump (cocok overshoot median 11 bin / +11.6%). Tetap **dual-side
  mechanics** (bin atas = token) — "extend-atas" = dual-side asimetris, BUKAN tuning single-side.

## Q6 — Testability
- **Paper sim TIDAK dukung dual-side** apa adanya: `simulatePaperMetrics` = "first-order **single-side
  SOL-below** fill model" (`paper-trading.js:14,51,96-105`); `fillFrac` cuma model harga **TURUN**
  (SOL→token saat jeblok). Tak ada inventory bin-atas, tak ada fill naik, tak ada IL dua-sisi.
- **Backtest-binwidth = coverage-only** (geometri single-side, fee TAK ter-replay — file itu eksplisit).
- **Prasyarat uji:** (a) extend model paper ke **two-sided fill + IL token-inventory** (deposit X di bin
  atas, fee/​konversi saat harga NAIK), ATAU (b) backtest baru yang model sisi-token. Tanpa itu, dual-side
  cuma bisa diuji **live kecil** (berisiko). UNKNOWN: akurasi fee dua-sisi sebelum model dibangun.

---

## Ringkas trade-off + rekomendasi uji
- **Untung:** capture pump (89% kasus), fee dua-arah lebih padat saat naik, missed-upside ~$68–83 plafon turun.
- **Rugi/risiko:** hold token sejak entry → IL dua-sisi + **rug lebih sakit**; modal terbelah + ongkos beli
  token (slippage/gas); butuh model-uji baru.
- **Effort build (sedang):** SDK/deposit sudah siap (`totalXAmount` wired) → kerjaan = (1) gate eksperimen
  `allowDualSide`/`bins_above>0`, (2) langkah beli-token + sizing split, (3) extend paper-sim two-sided,
  (4) tangani close/risk token-inventory (auto-swap close sudah ada). BUKAN rewrite.
- **Rekomendasi cara uji (urut aman):** (i) bangun model paper two-sided dulu → validasi fee/IL di
  DRY_RUN; (ii) extend-atas **asimetris kecil** (`bins_above 10`, bukan simetris) sbg langkah pertama —
  capture +10.5% dgn token-inventory minimal; (iii) live mikro 1 posisi setelah paper sehat;
  (iv) batasi ke pool low-rug (exposure token di muka = rug lebih mahal).
- **Catatan:** screening-rug masih ranah paper; keputusan ini = **strategi**, di luar v2.1 width-tuning.
