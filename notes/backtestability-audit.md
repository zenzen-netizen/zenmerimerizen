# AUDIT BACKTESTABILITY — peta "menu analisis gratis"

**Tanggal:** 2026-06-19 · **Sifat:** ANALISIS read-only, offline, nol LLM, nol sentuh live.
**Status:** ✅ FASE 1 selesai. **Bukan apply** — ini peta param mana yg bisa dibedah dari data yg ADA.
**Acuan data:** `lessons.json` (99 rec live) + `lessons-archive-pre-mainzen_v2.json` (84 rec) + `state.json`
(183 posisi) + `candidate-memory.json` (21 pool rejected-set).

> **Untuk pemula:** "backtest" = uji-coba aturan pakai data lama, tanpa pasang uang beneran —
> kayak nonton ulang rekaman pertandingan buat tanya "kalau dulu aku ganti taktik ini, skornya beda?".
> Masalahnya: rekaman kita cuma punya **ringkasan skor** (puncak/dasar harga), BUKAN **rekaman menit-per-menit**.
> Jadi sebagian aturan bisa diuji ulang sekarang, sebagian harus "direkam dulu" ke depan.

---

## LEGENDA STATUS

| Kode | Arti | Syarat |
|------|------|--------|
| ✅ **BACKTEST-SEKARANG** | Data per-trade ada & cukup faithful | Bisa di-replay hari ini |
| 🔵 **RECOMPUTE-ABLE** | Bisa dihitung ulang dari data yg ada (mungkin proxy) | Hitung dari peak/trough/bin_range |
| 🟡 **BUTUH-LOG-DULU** | Rule bisa di-replay TAPI input belum dicatat | On-kan logging → backtest ke depan |
| ❌ **FORWARD-ONLY** | Butuh counterfactual / path penuh / rejected-outcome | Cuma forward-test |

---

## A. EXIT RULES (logika `getDeterministicCloseRule`, `index.js:1362-1405` + trailing `index.js:480-493`)

| # | Param / Rule | Lokasi | Status | Data dibutuhkan | Rekomendasi |
|---|---|---|---|---|---|
| 1 | `stopLossPct` (Rule 1) | index.js:1376 | ✅ **SEKARANG** | `trough_pnl_pct` (99/99 ✓) | **Sudah dibuat:** `scripts/backtest-exits.js`. Optimistik (exit tepat di L, abaikan gap). |
| 2 | `takeProfitPct` (Rule 2) | index.js:1379 | ✅ **SEKARANG** | `peak_pnl_pct` (99/99 ✓) | Replay `peak_pnl_pct ≥ TP`. |
| 3 | `trailingTriggerPct` / `trailingDropPct` / `trailingTakeProfit` | index.js:480-493, 1969 | ✅ **APPROX** | `peak_pnl_pct` ✓ | Sudah di backtest-exits.js. ⚠️ urutan peak↔trough TAK diketahui → alat RANKING, bukan vonis. |
| 4 | `outOfRangeBinsToClose` (Rule 3 "pumped far above") | index.js:1382-1388 | 🔵/🟡 **PARTIAL** | per-tick `active_bin` vs `upper_bin` → **TAK disimpan**. `price_peak_pct` (81/99) = proxy %, bukan bin | Proxy kasar via excursion %; faithful = log jejak active_bin. |
| 5 | `outOfRangeWaitMinutes` (Rule 4 OOR) | index.js:1389-1395 | 🟡 **BUTUH-LOG** | `minutes_out_of_range` **0/99 di perf** (cuma `minutes_in_range`); waktu/durasi tiap spell OOR tak dicatat | Log durasi+arah tiap spell OOR (lihat routput-v2-progress.md). |
| 6 | `minFeePerTvl24h` + `minAgeBeforeYieldCheck` (Rule 5 low yield) | index.js:1397-1403 | 🟡 **BUTUH-LOG** | `fee_per_tvl_24h` SAAT poll → tak disimpan (`initial_fee_tvl_24h` 0/99 di perf) | Log fee/tvl tiap poll. |
| 7 | `oorCooldownTriggerCount` / `oorCooldownHours` (re-entry cooldown) | config (executor) | ❌ **FORWARD** | butuh urutan event OOR + percobaan re-entry yg ditolak | Forward-only. |
| 8 | Indicator EXIT (`exitPreset`, `exitEnabled`) | index.js:1411 + chart-indicators.js | 🟡 **BUTUH-LOG** | nilai RSI/ST/BB per-tick → **TAK PERNAH disimpan**; path-dependent | Lihat §C. |

> **Inti exit:** SL/TP/trailing = ✅ siap (sudah ada 2 script). OOR + low-yield + indicator-exit =
> 🟡 perlu logging dulu karena rule-nya **path-dependent** (tergantung jejak per-tick) sedangkan kita
> cuma simpan **ringkasan** puncak/dasar. ⚠️ SL optimistik utk rug (realita harga *gap* lewat ambang —
> lihat 1B-SOL di analisis rug).

---

## B. SCREENING GATES (`tools/screening.js:127-155` `passesScreen` + hard-guard `index.js` + `executor.js` safety)

**Aturan umum:** *memperketat* threshold bisa diuji **IN-SAMPLE SURVIVAL TEST** = "kalau dulu floor lebih ketat,
trade mana (W/L) yg ikut kebuang?" — TAPI ini cuma lihat trade yg **sudah lolos**, tak bisa lihat pool yg
kita tolak (counterfactual). *Melonggarkan* threshold = ❌ forward-only (parsial: `candidate-memory.json`
simpan drift mcap/tvl pool yg dilihat-tapi-tak-masuk, horizon 24h, **tanpa outcome LP** = tanpa fee/IL).

| Param | Sinyal direkam/trade? | Coverage | Status (perketat) | Catatan |
|---|---|---|---|---|
| `minTvl` / `maxTvl` | `entry_tvl` | 80/183 | ✅ **survival** (parsial) | arsip banyak null. |
| `minVolume` | `entry_volume` | 120/183 ✓ | ✅ **survival** | |
| `minOrganic` | `organic_score` | ✓ hampir semua | ✅ **survival** | gate edge asli (lihat audit lama). |
| `minHolders` | `entry_holders` | 80/183 | ✅ **survival** (parsial) | arsip null. |
| `minMcap` / `maxMcap` | `entry_mcap` | 120/183 ✓ | ✅ **survival** | |
| `minBinStep` / `maxBinStep` | `bin_step` | ✓ semua | ✅ **survival** | |
| `minFeeActiveTvlRatio` (floor) | `fee_tvl_ratio` | ✓ semua | ✅ **survival** | |
| **maxVolatility** (BELUM ADA filter) | `volatility` | ✓ semua | ✅ **survival** | tak ada ceiling skrg (cuma `isUsableVolatility` finite&>0, screening.js:86). Lever utama rug — lihat analisis rug. |
| **maxFeeActiveTvlRatio** (BELUM ADA) | `fee_tvl_ratio` | ✓ semua | ✅ **survival** | tak ada ceiling skrg. |
| `maxBundlePct` | — | **TAK direkam** | 🟡 **BUTUH-LOG** | stamp bundler% di signal_snapshot. |
| `maxTop10Pct` | — | **TAK direkam** | 🟡 **BUTUH-LOG** | |
| `maxBotHoldersPct` | — | **TAK direkam** | 🟡 **BUTUH-LOG** | |
| `minTokenAgeHours` / `maxTokenAgeHours` | umur token | **TAK direkam** | 🟡 **BUTUH-LOG** | |
| smart-wallet (`avoidPvpSymbols` dst) | `smart_wallets_present` (bool) + `shadow_signals.sw.count` | parsial | 🔵 **PARTIAL** | cuma boolean/count, bukan identitas. |
| `narrativeProfileSignal` | `narrative_quality` / `narrative_category` | parsial | ✅ **survival** (kasar) | butuh ≥8 sampel/kategori. |
| `screeningCategories` / `category` / `screeningSource` | sumber tak di-perf | — | ❌ **FORWARD** | atribusi sumber tak distamp ke trade. |

---

## C. ⭐ EXIT-INDIKATOR (pertanyaan owner)

**Indikator yg ADA** (`tools/chart-indicators.js` + `tools/smi.js`):

| Indikator | Sumber komputasi | Disimpan/trade? | Backtest kalau di-ON? |
|---|---|---|---|
| **RSI** (`rsiLength`,`rsiOversold/Overbought`) | server-side API (`buildSignalSummary` chart-indicators.js:34) | ❌ tak pernah | 🟡 BUTUH-LOG per-tick |
| **Supertrend** (break up/down, direction) | server-side (chart-indicators.js:45-48) | ❌ | 🟡 BUTUH-LOG per-tick |
| **Bollinger** (lower/mid/upper) | server-side (chart-indicators.js:42-44) | ❌ | 🟡 BUTUH-LOG per-tick |
| **Fibonacci** (fib50/618/786) | server-side (chart-indicators.js:49-51) | ❌ | 🟡 BUTUH-LOG per-tick |
| **SMI** (Stochastic Momentum Index) | client-side dari `candles[]` (smi.js) | ❌ | 🟡 BUTUH-LOG (candles ada tapi tak diarsip) |
| **ATR** | **TIDAK ADA di mana pun** (grep nol hit) | — | ❌ harus DIBANGUN dulu (feasible client-side dari `candles[]`, lalu log) |

**Jawaban langsung:** kalau exit-indikator di-ON **sekarang**, **datanya TIDAK cukup** untuk backtest faithful.
Dua sebab:
1. **Nilai indikator tak pernah disimpan** — dihitung server-side saat poll, dibuang. Tak ada satu pun
   record yg punya nilai RSI/ST/BB.
2. **Rule indikator PATH-DEPENDENT** — cth `rsi_reversal` exit memicu saat RSI menyentuh oversold/overbought
   **di suatu tick selama hold**. Kita cuma punya **ringkasan** `peak_pnl_pct`/`trough_pnl_pct`/`price_peak_pct`,
   **BUKAN deret per-tick**. Tanpa deret RSI vs waktu, mustahil tahu kapan (atau apakah) sinyal terpicu.

**Yang perlu di-log dulu (per poll, per posisi terbuka):** `{ts, rsi, supertrend.direction+break, bollinger.lower/mid/upper,
close, fib levels}` — deret waktu, bukan snapshot tunggal. Setelah ≥beberapa minggu terkumpul, exit-indikator
baru bisa di-backtest. ATR: tambah komputasi client-side dari `candles[]` **lalu** ikut di-log.

> **Catatan owner:** persis seperti dugaan — kita "cuma punya RINGKASAN peak/trough, BUKAN path per-tick",
> jadi **semua** rule path-dependent (indikator, OOR-timing, low-yield) = **BUTUH-LOG-DULU**, bukan
> backtest-sekarang.

---

## D. SIZING / RISK / RANGE

| Param | Status | Alasan |
|---|---|---|
| `deployAmountSol`, `positionSizePct`, `sizingMode`, `maxDeployAmount`, `maxPositions`, `gasReserve`, `rentPerPositionSol`, `minSolToOpen` | ❌ **FORWARD** | path-dependent ke saldo wallet + kontensi slot + urutan deploy; tak bisa replay portofolio dari book per-trade. |
| `minBinsBelow` / `maxBinsBelow` / `defaultBinsBelow` (lebar range) | 🔵 **RECOMPUTE (coverage)** | **Sudah dibuat:** `scripts/backtest-binwidth.js` — TAPI cuma sisi COVERAGE/OOR-risk. ⚠️ sisi FEE (range sempit = fee/$ lebih padat) **TAK bisa di-replay** → informasional, konfirmasi live/paper. |
| `repeatDeployCooldownHours` | ❌ **FORWARD** | butuh urutan percobaan re-entry. |

---

## RINGKASAN EKSEKUTIF FASE 1

- ✅ **Siap sekarang (sudah ada script):** stopLoss, takeProfit, trailing → `backtest-exits.js`;
  range-coverage → `backtest-binwidth.js`. Plus survival-test floor screening (organic/tvl/vol/mcap/volume/fee_tvl).
- 🔵 **Recompute:** lebar range (coverage saja), proxy "pumped far above" via excursion %.
- 🟡 **Butuh-log-dulu (semua path-dependent):** indikator exit/entry (RSI/ST/BB/Fib/SMI/ATR), OOR-timing
  (Rule 4), low-yield (Rule 5), bundler%/top10%/botHolders%/umur-token utk screening.
- ❌ **Forward-only:** sizing/risk/slot, melonggarkan screening (counterfactual; parsial via candidate-memory),
  cooldown re-entry.

> **Satu kalimat:** exit *level-based* (SL/TP/trailing) sudah bisa dibedah hari ini; semua yg *path-based*
> (indikator, OOR-durasi, yield-saat-jalan) butuh **on-kan logging deret-waktu dulu**; semua *screening
> counterfactual* (apa yg kita tolak) butuh **forward-test** karena rejected-set kita cuma harga, bukan outcome LP.
