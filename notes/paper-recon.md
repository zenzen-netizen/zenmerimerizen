# PAPER-TRADING & RECORDING INTEGRITY — RECON (read-only)

**Tanggal:** 2026-06-16 · **Branch:** experimental · **Sifat:** BACA-SAJA total (nol edit/restart/commit).
**Tujuan:** konfirmasi 3 bug + tentukan blast-radius bug "skip rugi ≤−90% non-stopLoss" (live/paper/keduanya).
Bukti = file:line. Ragu = UNKNOWN.

> Status: Q1 ✅ · Q2 ✅ · Q3 ✅ · Q4 ✅ · Q5 ✅ · Q6 ✅

---

## Q1 — MEKANIK PAPER ✅ TERKONFIRMASI (simulasi nyata, bukan dummy)

**Pemicu/penanda:** `isPaperMode()` = `DRY_RUN==="true" AND config.experiments.paperTrading===true` — `paper-trading.js:20-22`. Kalau salah satu off → factory (would-deploy lenyap).

**Jalur lifecycle (tools/dlmm.js):**
- **OPEN:** `deployPosition` dalam guard `if (DRY_RUN)` → `if (isPaperMode())` `dlmm.js:776` → `trackPosition({position: paper_<addr>_<ts>, bin_range{min,max,active}, amount_sol, fee_tvl_ratio, entry_mcap/tvl/vol/holders…})` `dlmm.js:790-809`. Id sintetik via `makePaperPositionId` (`paper-trading.js:25-28`). Posisi = baris NYATA di state.json.
- **LIST/PnL:** `getMyPositions` → `if (isPaperMode() && !wallet_address) return getPaperPositions()` `dlmm.js:1604-1605`. `getPaperPositions` `dlmm.js:1510` ambil tracked `paper_*`, panggil `computePaperMetrics` `dlmm.js:1440` yang **baca active-bin on-chain live** (`pool.getActiveBin()`, `getPriceOfBinByBinId`) `dlmm.js:1442-1453` lalu `simulatePaperMetrics`. Juga jalankan `markInRange/markOutOfRange` (OOR akrual nyata) `dlmm.js:1518-1519`. `getPositionPnl` paper route `dlmm.js:1209-1212`.
- **CLOSE:** `closePosition` → `if (isPaperMode() && id startsWith "paper_") return closePaperPosition()` `dlmm.js:2009-2010`. `closePaperPosition` `dlmm.js:1528` → `computePaperMetrics` → `recordPerformance({... paper:true})` `dlmm.js:1546-1577` → `recordClose`.

**Verdict:** Disimulasi BENERAN (harga bin on-chain + waktu in-range/OOR real; fee & IL = proxy matematis di `paper-trading.js`). BUKAN dummy. EXACT = entry timing + in/OOR; APPROX = fee + IL (lihat Q2/Q3).

**Catatan penanda:** baris state.json paper TIDAK bawa flag `paper:true` — ditandai prefix id `paper_` (`briefing.js:281,283`). Flag `paper:true` baru ditempel saat CLOSE → `recordPerformance` (lihat Q5).

---

## Q2 — BUG FEE (skala salah, overstate besar) ✅ TERKONFIRMASI

**Rumus fee paper:** `paper-trading.js:114`
`feesSol = clamp(deposit * ftr * (minutesInRange / windowMinutes), 0, deposit*0.5)` — `windowMinutes=1440` (`dlmm.js:1468`), `ftr = tracked.fee_tvl_ratio` (`dlmm.js:1465`).

**Asal `fee_tvl_ratio`:** dibaca **MENTAH** dari Meteora API (`fee_active_tvl_ratio`), TANPA diskala kode — filter `fee_active_tvl_ratio>=…` `screening.js:438`, copy `numeric(fresh[field])` `screening.js:413-414`, simpan ke state via `trackPosition` (`state.js:96-97`).

**Bukti skala (probe API live, read-only GET 2026-06-16, timeframe=5m):**
| pool | fee | active_tvl | fee/active_tvl | fee_active_tvl_ratio (dilaporkan) | rasio |
|---|---|---|---|---|---|
| $HACHI-USDC | 0.312 | 27.53 | 0.0113 | 0.7938 | ~70× |
| $HACHI-USDC | 0.481 | 267.8 | 0.00179 | 0.1272 | ~71× |
| Digital Prison-SOL | 6.99 | 2406.7 | 0.00290 | 0.2845 | ~98× |

→ `fee_active_tvl_ratio` ≈ **70–100×** lebih besar dari fraksi `fee/active_tvl` per-window. Lalu sim memperlakukannya **lagi** sebagai *fraksi-yield-harian-atas-deposit*.

**Dampak:** dengan `ftr` tipikal 0.11–0.79 (data tersimpan: n=63, min 0.1128, **median 0.5626**, max **6.7965**), sebuah posisi in-range ~sehari menghasilkan `feesSol ≈ deposit × ftr` = **11%–680% deposit/hari** → kepukul **cap 50%** terus-menerus (`deposit*0.5`, `paper-trading.js:114`). Cap routinely-hit = tanda kuat input salah-skala. Yield fee LP nyata realistis = ~0.x–beberapa %/hari. **Overstatement ~order 100×** (selaras temuan sesi sebelumnya: "fee unit paper salah ~100×, uji API live"). Karena `pnl_sol = ilSol + feesSol` (`paper-trading.js:116`), **PnL paper bias positif kuat** → tiap posisi in-range terlihat jauh lebih cuan dari realita. Edge paper TIDAK bisa dipercaya untuk forecast profit.

**Verdict:** TERKONFIRMASI ada error skala fee (overstate ~100×, sebagian tertutup cap 50%). Catatan: faktor presisi dari 3 sampel tidak bulat ("×100" itu order-of-magnitude, bukan konstanta eksak).

---

## Q3 — SLIPPAGE & IL ✅ (campuran — IL ADA, slippage TIDAK)

- **Impermanent Loss:** **DImodelkan** (kontra premis "tidak"). Model fill single-side SOL-below orde-pertama: `paper-trading.js:85-101` (`fillFrac` dari bin tersilang → `solSpent/baseAcquired` di `avgFillPrice` → `ilSol = positionValueSol − deposit`). Kasar (mid-point avg fill, mark di currentPrice), tapi ADA. → premis "IL tidak dimodelkan" **SALAH**; lapor jujur.
- **Slippage / price-impact / swap-cost:** **TIDAK dimodelkan**. Tak ada suku slippage di `simulatePaperMetrics`. Fill diasumsikan di harga bin "adil" (`avgFillPrice`, `paper-trading.js:97`), close tak kena biaya exit-swap. Di paper, deploy & close juga lewati Jupiter swap (would-deploy) → round-trip SOL→base→SOL tak berbiaya.

**Lokasi seharusnya masuk (lapor saja, JANGAN tambah):**
- Slippage entry/exit: di model fill `paper-trading.js:97` (`avgFillPrice` mestinya kena haircut price-impact) + biaya exit saat `closePaperPosition` (`dlmm.js:1533` area, tak ada potongan swap).
- IL: sudah ada di `paper-trading.js:85-101` (bisa diperhalus, bukan ditambah dari nol).

**Verdict:** Slippage TIDAK dimodelkan = TERKONFIRMASI. IL = TERKONFIRMASI ADA (rough), jadi premis gabungan "keduanya tidak dimodelkan" hanya benar separuh.

---

## Q4 — ⚠️ SKIP RUGI ≤−90% NON-STOPLOSS ✅ TERKONFIRMASI (jalur BERSAMA live+paper)

**Lokasi skip pencatatan:** `lessons.js:175-184` di dalam `recordPerformance()` (fungsi BERSAMA):
```
suspiciousAbsurdClosedPnl =
  Number.isFinite(pnl_pct) && perf.initial_value_usd >= 20 &&
  pnl_pct <= -90 && !close_reason.toLowerCase().includes("stop loss")
if (suspiciousAbsurdClosedPnl) { log("lessons_warn", "Skipped absurd…"); return; }  // ← record DIBUANG total
```
Syarat skip: posisi ≥ **$20** DAN rugi **≤ −90%** DAN close_reason **tidak** mengandung "stop loss". `recordPerformance` dipanggil dari **LIVE** (relay `dlmm.js:2181`, lokal `dlmm.js:2476`) DAN **PAPER** (`dlmm.js:1546`). Karena gate ada di HULU bersama (sebelum cabang live/paper), **berlaku KEDUANYA**.

**Situs −90 lain (BUKAN skip-record — diklarifikasi):**
- `dlmm.js:2383-2390` `shouldRejectClosedPnl` (`!stopLoss && pct<=-90`) → cuma **tolak bacaan API belum-settle** di loop retry 6× (`dlmm.js:2414`), lalu fallback cache; `recordPerformance` TETAP dipanggil sesudahnya. Anti-flicker, bukan skip.
- `index.js:1344-1352` `getDeterministicCloseRule` `pnlSuspect`: `pnl_pct<=-90` + posisi masih bernilai → tandai suspect → **lewati aturan PnL (termasuk auto-stopLoss)**. Keputusan close, bukan recording. (Penting: ini bikin jalur skip Q4 BISA tercapai — lihat blast radius.)

### BLAST RADIUS Q4: live / paper / KEDUANYA
**KEDUANYA** (gate di `recordPerformance` bersama). Tapi bukti dampak NYATA ke data:

- **Log [LESSONS_WARN]: 0 kemunculan** di seluruh `logs/` (06-03 → 06-15). Channel terbukti hidup (mis. `[CLOSE_WARN]` muncul). → skip `lessons.js` **TAK PERNAH nyala** di jendela ber-log, baik "absurd PnL" maupun "suspicious unit-mix".
- **Near-miss tunggal:** HNLULUY7 (06-03 18:37) dapat bacaan transient **−100%** → **ditolak** anti-flicker `dlmm.js:2414` (attempt 1/6), retry 18:38:03 dapat settled **+1.67%** → **DIREKAM** (lesson + pool-memory). Jadi −90% palsu kena cegat di HULU sebelum sampai gate skip.
- **Distribusi data (read-only):** lessons.json aktif n=70 rugi terdalam **−45.0%** (reason "Trailing TP: Stop loss…", $35.8, mainzen_v2); archive n=84 terdalam **−53.0%** (reason "Stop loss…", **$7.29** = di bawah floor $20 → tak mungkin ke-skip). **NOL** record ≤−90 di 154 close; semua rugi besar = stopLoss (dikecualikan gate) atau sub-$20.
- **Pre-06-03 (live):** **UNKNOWN** — tak ada log. Tapi nol bukti positif skip; distribusi archive konsisten dengan "tak pernah ke-skip".
- **Paper:** gate berlaku, tapi instance dry-run paper tidak aktif belakangan (v3/meridianzen2 = LIVE per dossier).

**Kesimpulan validitas 70-record (& 84 archive):** **TINGGI** — dataset tampak UTUH; gate skip tak pernah membuang record di jendela ber-log, dan tak ada close mendekati −90%. **Bug laten NYATA & layak fix:** rug genuine ≥90% pada posisi ≥$20 yang ditutup non-stopLoss (OOR/manual/"pumped"/agent/yield) akan **dibuang diam-diam** — dan jalur itu *reachable* karena `index.js:1346` justru menahan auto-stopLoss saat bacaan −90% sementara posisi masih bernilai (jadi exit-nya bisa berlabel non-stopLoss). Belum menggigit data saat ini.

---

## Q5 — SEGREGASI DATA ✅ TERKONFIRMASI (isolasi berlapis jalan)

**Penandaan:** close paper kirim `paper:true` (`dlmm.js:1576`); `recordPerformance` simpan via spread `entry = {...perf}` (`lessons.js:190-191`) → `entry.paper=true` persist; lesson turunan ditandai `lesson.paper=true` (`lessons.js:210`).

**Dikeluarkan dari (semua honor tag):**
- **Evolve threshold + Darwin:** `livePerf = !p.paper && keepActiveRacikan` (`lessons.js:255`); Darwin `recalculateWeights(livePerf,…)` (`lessons.js:267`) di-feed yang sudah ter-filter (signal-weights.js tak filter sendiri, tapi inputnya bersih).
- **Hive:** `pushHivePerformanceEvent` hanya `if (!entry.paper)` (`lessons.js:284`); hive push lesson `if (lesson && !entry.paper)` (`lessons.js:216`); `recordPoolDeploy` `if (perf.pool && !entry.paper)` (`lessons.js:223`).
- **Stats/report/briefing/milestone:** `getModePerformance()` mode-scoped — live → `!p.paper` (`lessons.js:916-924`); briefing `keepMode` (`briefing.js:66,280,402`).
- **Prompt lessons:** paper di-drop saat live kecuali `usePaperHistoryWhenLive` (`lessons.js:721-723`).

**Verdict:** Isolasi BENERAN jalan, multi-lapis. Catatan: baris state.json paper tak ber-flag (pakai prefix id `paper_`, `briefing.js:283`) — segregasi count-aktivitas via prefix, bukan flag (konsisten, by-design).

---

## Q6 — ONGKOS DI PAPER ✅ (gas=0 nyata; LLM=biaya nyata)

- **Gas:** paper = DRY_RUN → tak ada tx on-chain. `countOnChainActions` lewati `r?.dry_run || r?.paper` (`briefing.js:44,48`) → **gas nyata = 0**. Briefing tampilkan sbg "estimasi bila live" / "(simulasi)" (`briefing.js:179-181`).
- **LLM:** di dry-run agent TETAP panggil LLM (siklus screening/management jalan) → **biaya LLM nyata** (OpenRouter). Briefing tegaskan "LLM = biaya nyata (tracking lokal)" (`briefing.js:149`), net-line = LLM nyata + gas simulasi (`briefing.js:200`).

**Relevansi desain fix:** paper bisa nunjukin edge fee+IL **tanpa gas-drag per-trade** (gas=0) — persis cost-drag yang menggerus posisi kecil nyata. Jadi PnL paper = optimistik ganda: (a) fee overstate ~100× (Q2), (b) nol gas-drag (Q6). Kalau mau "edge murni", paper sekarang TIDAK netral — ia menyembunyikan gas dan melebih-lebihkan fee. **Lapor saja.**

---

## RINGKAS TEMUAN
| Q | Verdict | Inti |
|---|---|---|
| Q1 | TERKONFIRMASI | Simulasi nyata (bin on-chain), bukan dummy. `dlmm.js:776/1440/1528` |
| Q2 | TERKONFIRMASI | Fee overstate ~100× (skala API mentah dipakai sbg fraksi-harian-deposit) + cap 50% kepukul. `paper-trading.js:114` |
| Q3 | Campuran | Slippage TIDAK dimodelkan (TERKONFIRMASI); IL ADA (rough, premis salah separuh). `paper-trading.js:85-101` |
| Q4 | TERKONFIRMASI (laten) | Skip ≤−90% non-stopLoss ≥$20 di `recordPerformance` bersama (live+paper). Belum pernah nyala (0 LESSONS_WARN); data utuh. `lessons.js:175-184` |
| Q5 | TERKONFIRMASI | Isolasi paper berlapis & jalan. `lessons.js:255/284/916`, `briefing.js:66` |
| Q6 | — (lapor) | Gas=0 nyata di paper; LLM=biaya nyata. `briefing.js:48,149` |

**Pesan kunci:** Bug paling kritis untuk kepercayaan analisis (Q4) ternyata **tak pernah menggigit** dataset live (0 skip ber-log, rugi terdalam −53%) → 70-record bisa dipercaya. Bug paper (Q2 fee + Q6 gas + Q3 slippage) bikin paper-mode **terlalu optimistik** — perlu diperbaiki sebelum dipakai ukur edge. Semua fix = sesi lain (recon ini read-only).
