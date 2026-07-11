# Audit F24 — Stats engine (reports.js) — shared analytics utk semua report/briefing
> Read-only. Bukti `file:line`. UNKNOWN kalau tak pasti. Resume: buka file ini.
> Kedalaman: ⬛ deep — alasan: 642-baris pure-function engine menyuplai 11 consumer (briefing/milestone/`/report`/telegram/pnl-tracker/backtest/dlmm), 3 kontrak penting (profitability-lens bukan win-rate-only, shrunk-expectancy N-fair ranking, anti-naive stop-tuning guard via MAE) + `classifyCloseRule` 7-bucket free-text mapper yang jadi kunci breakdown. Tak config-auto-write, tak cross-file mutation, fail-open bersih (empty `→ {count:0}`, null return). Bukan ⬛⬛ karena tak sentuh on-chain/config/state, cuma render.
> Cross-ref: F19 (recordPerformance → performance[] source data, paper:true stamp isolation di filter pemanggil bukan disini), F20 (evolveThresholds — pass data lewat perf, tak ada coupling), F22 (getModePerformance → performance[], briefing consumer pass records pre-filtered), F25 (briefing.js consumer utama — buildScopeBlock + countOnChainActions + buildTradeReport periodic), F26 (config.screening/management baca di buildRecommendations, solMode tak ada — reports USD-only), F28 (config mutation tak di reports), F14 (screening tak baca reports), F30 (`/report` handler index.js:319 telegram), F33 (backtest-exits.js caller scripts).

## Ringkasan eksekutif (5 baris)
1. **Pure-function engine, 13 export, 0 I/O, 0 mutation, fail-open identik**. `reports.js` (642 baris) import cuma `config` (read-only screen `config.screening`/`management`, tak sentuh `config.llm`/`solMode`/`darwin`, tak mutasi), `lessons.js` (getHourlyProfile/getNarrativeProfile/classifySession/classifyNarrative/sessionLabel — read-only read path, F22), `views/format.js` (`SEP` konstanta `:143` + `tree` presenter `:178` murni string-primitif). 13 export: `computeTradeStats` (engine utama `:31-181`), `classifyCloseRule` (`animals:189-200`), `formatMovement`/`formatStatsBlock`/`formatQuantBlock`/`formatBreakdown`/`formatTrend` (renderer blok), `buildVerdict`/`buildRecommendations`/`buildTradeReport` (composer), `computeCostDragPct`/`estimateGasSol`/`buildRoleCostLines` (cost helpers), `GAS_EST_SOL` (konstanta). Tak ada `fs`, tak ada `require`/`import` SDK, tak ada `state.json`/`pool-memory`/`lessons.json` read langsung — semua data lewat parameter `records` dari pemanggil. Empty input `computeTradeStats([]) → {count:0}` (`:34`); `buildVerdict(st.count<4) → null` (`:552`); `buildRecommendations(perf.length<4) → null` (`:425`); `buildTradeReport([]) → "No closed positions in this window yet."` (`:576`); `formatTrend(chron.length<n*2) → null` (`:403`); `formatQuantBlock(st.count===0) → null` (`:303`).
2. **computeTradeStats 12 metric block + 4 breakdown + 2 movement block**. Input `records[]` filter `Number.isFinite(p.pnl_usd)` (`:32`) → win/loss split `pnl_usd >/<0` (`:36-37`) → 12 headline: net_pnl_usd, invested_usd, roi_pct, gross_profit/loss, **profit_factor** `grossProfit/grossLoss` (`:132`, `Infinity` bila 0 loss, `null` bila 0 win), **payoff_ratio** `avgWinUsd/|avgLossUsd|` (`:133-134`), **expectancy_usd/pct** `mean(perf.pnl_usd)`/`mean(fin(perf.pnl_pct))` (`:152-153`), `avg_win/loss_pct/usd`, `biggest_win/loss` sort by `pnl_pct` (`:60-64`), `worst_trade_usd/name` + **tail-dominance** `net_excl_worst_usd` = `netUsd - worstUsdRow.pnl_usd` (`:159`), `fees_usd`/`fee_pct_capital`/`fee_apr_pct` (`:51-52`, `feeApr = fee_pct × 525600/inRangeMin`), `max_drawdown_usd/pct` (cumulative equity curve chronological `:69-73`, `maxDDPct` relatif ke `peakAtMaxDD` cuma meaningful saat `peak>0`), `max_consecutive_losses` (`:80-84`). 4 breakdown: `by_strategy`/`by_session`(WIB)/`by_narrative`/`by_setup` via `groupStats` (`:232-254`, shrunk-expectancy ranking K=5) + `by_close_rule` sort by `|net_usd|` (`:178-179`, safety-mechanism lens bukan "do more of"). 2 movement block: `movement` (PnL give-back peak→exit, `peak_pnl_pct`+`pnl_pct`, needs ≥4 samples `:90`) + `price_movement` (raw price excursion `price_peak_pct`/`price_trough_pct` vs entry, MAE winners-vs-losers `:111-126`, SL tuning input, needs ≥4 samples `:113`).
3. **classifyCloseRule = free-text → 7-bucket canonical mapper, precedence-sensitive**. `:189-200`: lowercase → check `"stop loss"` → `"out of range"` → `"low yield"` → `"take profit"` → `"pumped far above range"`/`"above range"` → `"indicator"` → `"trailing tp"`|`"dropped"+"peak"` → fallback `"manual/lainnya"`. **Live distribution (366 perf)**: `pumpedAboveRange (R3)` 148 / `trailingTP` 114 / `lowYield (R5)` 59 / `outOfRange (OOR)` 20 / `stopLoss` 12 / `takeProfit (R2)` 8 / `manual/lainnya` 5. **Kontrak**: free-text prefix `⚡ Trailing TP:` (`dlmm.js` exit pipeline wrapping) tak mengacaukan — `"out of range"` (`:193`) + `"low yield"` (`:194`) match SEBELUM `"trailing tp"` (`:198`) jadi wrapped-reason map ke specific cause, fallback wrapper tak dominan. **Penting**: breakdown sort `by_close_rule` pakai `|net_usd|` (`:179`) — close rules = safety mechanism (bukan strategi pilih "do more") jadi di-rank by dampak $ ke buku, bukan win-rate. Live: stopLoss rank #1 dampak (`-32.26 net`, 12 trade, win 8%, avg -11.52%) — leak terbesar buku; trailingTP #2 (`+18.43`, 114 trade, win 91%); pumpedAboveRange #3 (`+6.91`, 148 trade, win 59%).
4. **groupStats shrunk-expectancy N-fair ranking (SHRINK_K=5)**. `:231-254`: per-bucket `score = (net + SHRINK_K × globalAvg) / (count + SHRINK_K)` (`:250`) — Bayesian-shrink toward global mean dengan 5-trade prior. Buck 1-trade fluke tak bisa top 15-trade bucket, total-net-volume tak "menang" krn lebih banyak trade aja. Sort best-first by `score` desc (`:253`). `by_close_rule` override sort `|net_usd|` desc (`:179`) — khusus close rule. Live `by_setup` (racikan split): `mainzen_v2_1` 273 trade win 67% +$7.51 score 0.03; `mainzen_v2` 93 trade win 65% -$11.20 score -0.11 — racikan v1 lemah (KRITIS F20 cross-ref: evolveThresholds tak filter `active_setup` → 84 record lama mainzen_v2 campur, defiance-flag ini same-source).
5. **buildRecommendations = profitability-aware advisor + anti-naive stop-Tuning guard (winnersDipDeep)**. `:423-545`: gate `perf.length < 4 → null` (`:425`). Risk-posture first: `netNeg` (PnL<0) + `weakPF` (<1.2) + `lopsided` (payoff<1, avg loss > avg win). **Anti-naive guard `winnersDipDeep`** (`:441-442`): `pm.win_worst_trough_pct < pm.loss_avg_trough_pct` (winners' deepest dip > deep dari losers' avg dip) → **JANGAN perketat stopLoss/OOR** (bakal motong pemenang), bocornya di **entry quality** (rug/dump screening). Live verdict dari `price_movement`: `win_avg_trough_pct -10.26`, `win_worst_trough_pct -34.16`, `loss_avg_trough_pct -8.56` → **winnersDipDeep = TRUE** (-34.16 < -8.56) — SL perketat bakal motong winners yang sebenernya survive dip dalam, leak = rug/dump entry, bukan stop. `biggest_loss.pnl_pct <= -50` tips screening rug (stop telat). `fee_tvl_ratio` winner-floor → sugesti raise `minFeeActiveTvlRatio` (`:472-477`). `bin_step` winner-vs-loser mean diff ≥10 → sugesti lower `maxBinStep` (`:478-481`). `avg_range_efficiency < 50` → widen ranges/raise OOR wait (`:482-484`). Best/worst strategy favor/avoid (`:487-492`). Weak session/narrative dari classifier F22 (`:495-504` fail-open try/catch). Give-back ≥3pp → trailing trigger vs peak issue (`:508-521`). Trough ≤-10 + winnersDipDeep → jangan ketat SL (`:522-529`). Gas `gasPerTradeUsd ≥ 30% × avg_win` → size up (`:532-535`). Scale-up guard: `!netNeg && !weakPF && win>60 && PF≥1.5` (`:538-541`). Max 7 recs (`:544`). **buildVerdict 4-tier** (`:551-565`): Sehat (`net≥0 && PF≥1.5`) / Tipis (`net≥0` tapi PF<1.5) / **Jebakan win-rate** (`net<0 && win≥60%`, leak = rugi besar) / Belum profit. Live: net -$3.69, PF 0.91, payoff 0.41, win 65% → trigger "Jebakan win-rate" path (`:559-562`) kalau n≥4.

## Progress
- [x] Spec F24 baca PLAN-audit-meridian.md Bagian 3 line 119 (⬛ deep, alasan density sinkron lintas consumer + 3 kontrak penting + fail-open bersih)
- [x] Cross-ref F19 (performance[] source + paper filter di pemanggil), F22 (getModePerformance consumer-side), F25 (briefing utama), F26 (config read-only), F30 (`/report` Telegram), F33 (backtest caller), F20 (evolveThresholds defiance same-source — 84 record campur)
- [x] Baca reports.js full 1-642 (13 export + pure function + groupStats + buildRecommendations + buildVerdict + classifyCloseRule + GAS_EST_SOL + buildRoleCostLines)
- [x] Baca views/format.js SEP `:143` + tree `:178` (murni string primitif, tak ada money-logic coupling)
- [x] Baca briefing.js:40-61 buildScopeBlock (consumer utama — 2-mode deep/non-deep compose) + :63-94 countOnChainActions (gas estimate source) + :71 `./logs/actions-*.jsonl` (dry-run/paper skip `:88`)
- [x] Baca index.js:305-360 `/report` handler (3-tier: lifetime/racikan-spesifik/active-default, semua via `buildTradeReport` + `getModePerformance`/`getLifetimePerformance`/`getPerformanceForRacikan` F22 scope)
- [x] Verifikasi consumer cross-codebase (rg): telegram.js:5/601 estimateGasSol (close-path notify), index.js:16/270/319/339/353 (buildTradeReport+computeCostDragPct+`/report`), tools/dlmm.js:30/1604 estimateGasSol (paper cost line), scripts/backtest-exits.js:20/201 (sanity-check), briefing.js:15-17/51-58/199/348/359/388/462/478/481/524/541 (utama), pnl-tracker.js:20/32 (GAS_EST_SOL sum)
- [x] Verifikasi live data: 366 perf / 149 lesson, classifyCloseRule distribution run (pumpedAboveRange 148, trailingTP 114, lowYield 59, outOfRange 20, stopLoss 12, takeProfit 8, manual/lainnya 5), stats keys 38-field, net_pnl_usd -$3.69, PF 0.91, payoff 0.41, worst_trade -$16.14 (1B-SOL), net_excl_worst +$12.45 (tail-dominance berat — satu rugi hampir penuh-itam book), price_movement samples 348 (winnersDipDeep threshold hit), movement samples 366 give-back 0.82pp left_on_table 12, by_setup mainzen_v2_1 vs mainzen_v2 (v1 lemah — crosses F20 contamination hypothesis)
- [x] Verifikasi config.llm buildRoleCostLines role-mapping (screening/management/general) — live: 3 model terpisah (mimo-v2.5-free×2 + minimax-m2.5general) → roleOf map hit 2 of 3 (screening+management shared → anyEstimate flag `:633`)
- [x] Tulis §0 + §A-§H

---

## §0. Cara Kerja (Bahasa Awam)

**Analogi** (dua sudut pandang sehari-hari)
- *Akuntan toko 1-buku statistik utk 3 laporan berbeda*: toko punya 3 jenis laporan — harian (briefing), ringkatan milestone tiap 10 penjualan (`/report`), rekap minggu/bulan (periodic digest). Tiap laporan butuh angka sama: total untung, untung per-jenis, persen menang, rugi terbesar, berapa lama stok dipajang. Kalau bikin rumus di tiap laporan = kacau (angka beda-beda). Akuntan bikin 1 buku hitam statistik murni — semua laporan tinggal panggil. 1 rumus, 3 output, angka konsisten. Konsep sama: `reports.js` = buku hitam pure-function; briefing/milestone/`/report`/backtest tinggal panggil `computeTradeStats(records)` → angka identik lintas-output. Tak ada I/O, tak ada mutasi, cuma hitung.
- *Pelatih tinju yang baca "win-rate tinggi TAPI kalah $"*: petinju menang 73% pertandingan, TAPI total untung minus — krn 2 KO berat lebih besar dari 30 menang kecil. Kalau pelatih cuma lihat "menang 73%" → bakal suruh sparring lebih agresif (naikin volume). Ini Jebakan Win-Rate. Pelatih pinter baca 3 angka: **profit factor** (brapa dolar menang per dolar kalah), **payoff ratio** (rata-rata menang vs rata-rata kalah), **tail dominance** (berapa $ dirugu 1 lawan terberat). Bila PF <1.2 dan payoff <1 → jangan naikin volume, potong rugi. Konsep sama: `buildVerdict` + `buildRecommendations` kerja berbasis profitabilitas (bukan win-rate aja), deteksi "tipis" / "jebakan" / "belum profit", block saran naikin size bila net-negatif.

**Di bot, ini = shared trade-analytics engine pure-function, profitability-lens, 13 export, 0 I/O** (1-2 kalimat)
`reports.js` = 1 tempat hitung semua statistik; briefing harian/milestone/`/report`/weekly-monthly/backtest/telegram notify semua konsumsi. Profitability-lens: ganti logika lama win-rate-only (menang 73% tapi net-negatif lolos) → PF/payoff/expectancy/drawdown/tail-dominance. Shrunk-expectancy ranking (SHRINK_K=5) antar bucket (strategi/session/narrative/close-rule) supaya N-fair. Anti-naive stop-tuning guard runtime: winners' deepest dip vs losers' avg dip → JANGAN perketat SL bila winners survive lebih dalam (bocor di entry, bukan stop).

**Posisi fase ini di alur bot** (1 paragraf)
Datang SETELAH F19 (recordPerformance isi `performance[]` di `lessons.json` — source data reports), SETELAH F22 (`getModePerformance()` paper/live isolation filter dari sisi pemanggil, pass filtered records ke reports), PARALEL-bawah F25 (briefing consumer utama pass perf lewat `buildScopeBlock`/`buildTradeReport`). Sebelum F30 (`/report` Telegram — 3-tier handler panggil `buildTradeReport`), sebelum F33 (backtest script caller — sanity-check raw vs `computeTradeStats(getModePerformance())`). F24 = **Lapisan 7 (Analytics) engine**: tak sentuh on-chain, tak sentuh config mutation, tak sentuh state write. Source data = `performance[]` (lessons.json), output = HTML string blok (briefing) / data objek (stat). Pure-function — fail-open bersih, tak side-effect. Tanpa F24, briefing tak punya verdict konsisten, milestone report tak recompose, `/report` Telegram kosong.

**Langkah kerja** (urutan, pakai istilah teknis)
1. **Source data path (read-only)**: pemanggil (`briefing.js:51`, `index.js:319`, `backtest-exits.js:201`) pass `records` (array closed-position perf dari lessons.json, sudah mode-filter lewat `getModePerformance` F22 bila live, atau `getLifetimePerformance` bila `/report all`) → `computeTradeStats(records)`.
2. **Filter finite-pnl**: `:32` `records.filter(p => p && Number.isFinite(p.pnl_usd))` → drop record tanpa pnl_usd (suspect/partial). Empty `→ {count:0}` (`:34`).
3. **Win/loss split**: `:36-37` `pnl_usd > 0` → wins, `pnl_usd < 0` → losses. Ambang 0 eksak (`pnl_usd === 0` JADI-TROPIS masuk loss-count via filter `<0` false, jadi tak masuk wins AND tak masuk losses, count tetap n — 4 cara hitung konsisten).
4. **12 headline metric compute**: netPnL, grossProfit/Loss, profitFactor, payoffRatio, expectancy usd/pct, biggest win/loss by pct, worst-trade tail-dominance, fee density (pct capital + APR), max drawdown cumulative, max consecutive loss streak.
5. **2 movement gate**: `movement` (`peak_pnl_pct` vs `pnl_pct` give-back, `≥4` samples), `price_movement` (`price_peak_pct`+`price_trough_pct` MAE, `≥4` samples) — input SL tuning, dianulir bila sample tipis.
6. **4 breakdown groupStats**: `by_strategy`/`by_session`(WIB key `sessionLabel`)/`by_narrative`/`by_setup` sort by shrunk-expectancy score desc; `by_close_rule` (map `classifyCloseRule` dulu `:130`) sort by `|net_usd|` desc.
7. **Render block**: `formatStatsBlock` (headline tree), `formatMovement` (PnL+Price tree), `formatQuantBlock` (RR/break-even WR/cost-drag/fee-density/recovery), `formatBreakdown` (4 bucket tree), `formatTrend` (last-N vs prior-N delta).
8. **Verdict + recommendations**: `buildVerdict(st)` 4-tier (≤4 count → null), `buildRecommendations(perf, st, opts)` 14-rule advisor (risk-posture → anti-naive stop guard → dimension tweaks → bucket favor/avoid → weak classifier → movement tune → gas efficiency → scale-up guard).
9. **Composer**: `buildTradeReport(perf, opts)` (`:573-587`) → urut title/subtitle/identity/SEP/`formatStatsBlock`+`buildVerdict`+`formatQuantBlock`+`formatTrend`+`formatMovement`+`formatBreakdown`+`buildRecommendations`+SEP, fail-open per-blok (null return di-skip).
10. **Cost helpers (4 export)**: `computeCostDragPct({costUsd, windowDays, modalUsd})` pure `(cost/window × 365 / modal) × 100` (`:368-373`); `estimateGasSol(counts)` sum per-tool gas (GAS_EST_SOL konstanta `:596-601`); `buildRoleCostLines(costData)` map model→role dari `config.llm.*/Model` (`:616-620`, shared-model detection `:621-626` → "(est, shared model)" tag) — hanya export yang baca config.llm di reports (sengaja — role-cost harus tau model-to-role mapping); formatMovement/QuantBlock/Breakdown/Trend purely dari `st`.
11. **Cost-drag flow**: pemanggil (`briefing.js:359` daily, `:478` periodic) send `costDragPct` (hitung dari `gasTrader`+`llmCostTracker`+`solTracker` di caller — reports tak sentuh tracker) → `formatQuantBlock(st, {costDragPct})` render verdict (`:353-357`, ambang default `<20% sehat`).
12. **Output**: HTML string blok (`formatStatsBlock` dll.) / full HTML report (`buildTradeReport`) / null (skip) / `{count:0}` literal. Semua HTML escape lewat `esc()` (`:19`) — data-derived aman `<,>,&`. Caller tampilkan sesuai surface (Telegram `parse_mode:HTML` / REPL print / backtest log).

**Output pure-function engine**: 38-field stats objek (`computeTradeStats`), HTML block string (`format*`/`buildVerdict`/`buildRecommendations`), full HTML report (`buildTradeReport`), null (skip), cost-drag % (`computeCostDragPct`), gas estimate SOL (`estimateGasSol`), role-cost lines (`buildRoleCostLines`). Side-effect: NOL. Trigger ke fase berikut: briefing.js konsumsi utama (F25), `/report` handler render (F30), milestone learning report guna `buildTradeReport` (F25), backtest sanity-check (F33).

**Kalau rusak / diskip** (2-3 kalimat, istilah teknis)
Pure-function — tak bisa "corrupt state" (tak ada write). `computeTradeStats` bug pada math (mis `profitFactor` salah saat `grossLoss=0` `:132` return `Infinity`) → semua briefing/milestone/`/report` tampil salah tapi tetap HTML valid, fail-silent. Skip F24 = pemilik lihat "win 67%" di briefing tanpa tau bahwa PF 0.91 + payoff 0.41 = **net -$3.69 jebakan-win-rate** — lalu naikin `positionSizePct` (krn recommendations tak ada) → amplifikasi rugi. `classifyCloseRule` miss-kategori (mis "Trailing TP: Stop loss: PnL -12% <= -12%" → stop loss, BUKAN trailingTP, krn "stop loss" match pertama `:192`) — kondisi itu BENAR design (specific-before-generic, `:188` comment), tapi kalau urutan dipecahkan → breakdown误导 pemberhentian rule salah → tuning exit salah dasar.

**Istilah yang muncul di fase ini** (bullet, cuma yang baru)
- **profitability-lens** — kontrak: book diukur PF/payoff/expectancy/tail-dominance, BUKAN win-rate. `reports.js:8-13` comment root. Lawan: win-rate-only (lama).
- **profit_factor** — `grossProfit/grossLoss` `:132`. `Infinity` bila 0 loss, `null` bila 0 win. Rasio dolar menang per dolar kalah.
- **payoff_ratio** — `avgWinUsd/|avgLossUsd|` `:133-134`. Skew leak detector (<1 = avg loss > avg win).
- **expectancy_usd** — `mean(perf.pnl_usd)` `:152`. Rata-rata $/trade (positif = edge, negatif = leak).
- **tail-dominance** — `net_excl_worst_usd = netUsd - worstUsdRow.pnl_usd` `:159`. Bila tanpa rugi terburuk jauh lebih positif → 1 loss dominan buku.
- **break-even WR** — `1/(RR+1) × 100` `:314` (formatQuantBlock). WR minimum buat impas.
- **rr (reward-to-risk)** — `avg_win_pct / |avg_loss_pct|` `:313`. Trade-level RR, beda dari payoff (USD).
- **MAE (maximum adverse excursion)** — `win_worst_trough_pct` `:123`. Winners' deepest price dip. Input SL tuning.
- **winnersDipDeep** — `:441-442` anti-naive guard. `pm.win_worst_trough_pct < pm.loss_avg_trough_pct` = winners' deepest dip lebih deep dari losers' avg → jangan ketat SL (motong winners).
- **give-back** — `avg_peak_pct - avg_exit_pct` `:100`. Run-up tak di-kunci di exit. Input trailing TP tuning.
- **shrunk-expectancy ranking** — `groupStats` `:231-254`. Bayesian-shrink per-bucket `score = (net + K×globalAvg)/(count + K)`, K=5 prior. N-fair: 1-trade fluke tak top 15-trade bucket.
- **SHRINK_K** — `:231` konstanta 5. Trades of "prior belief" pulling small-sample mean ke global mean.
- **classifyCloseRule** — `:189-200` free-text → 7-bucket canonical mapper. Precedence: stop loss > OOR > low yield > take profit > pumped above > indicator > trailing TP|dropped+peak > manual/lainnya.
- **7-bucket** — stopLoss / outOfRange (OOR) / lowYield (R5) / takeProfit (R2) / pumpedAboveRange (R3) / indicatorExit / trailingTP / manual/lainnya.
- **specific-before-generic** — `:187-199` kontrak: specific cause match sebelum generic trailing-TP wrapper (prefix `⚡ Trailing TP:` tak mengacaukan kategori).
- **adjusted_close_rule_sort** — `by_close_rule` sort by `|net_usd|` (`:179`), bukan score. Close rule = safety mechanism, bukan strategi pilih "do more of" → rank by dampak $ (gain/leak).
- **cost-drag** — `(costUsd/windowDays × 365 / modalUsd) × 100` `:371`. Biaya jalan annualized ÷ modal wallet. Ambang sehat <20% (default `costDragHealthyMax:20`).
- **fee density** — `fee_pct_capital = feesUsd/invested × 100` `:51`. Berapa % modal jadi fee. APR = `fee_pct × 525600/inRangeMin` `:52` (fee hanya accrue in-range).
- **max_drawdown** — cumulative equity curve `peak - cum` `:70-73`. `maxDDPct` relatif ke `peakAtMaxDD`, cuma meaningful saat `peak > 0` (DD melebihi prior peak → ratio explode, render USD aja).
- **recovery_needed** — `1/(1-DD%) - 1` `:338` (formatQuantBlock). Gain % dibutuhkan buat pulih ke prior peak.
- **GAS_EST_SOL** — `:596-601` konstanta 4-action (deploy 0.00004 / close 0.00003 / claim 0.000015 / swap 0.000015 SOL). Calibrated ke measured on-chain (Solana base fee ~0.000005 SOL/tx, prior defaults 100× kebanyakan tinggi). Real `gas-tracker.js` override.
- **buildRoleCostLines** — `:614-642` map model→role (screening/management/general) lewat `config.llm.*Model`. Shared-model detection `:621-626` → "(est, shared model)" tag bila 1 model dipakai >1 role.
- **noisy** — `n < noisyBelow (default 100)` `:359`. Sample tipis → "noisy ±10%, baca arah saja, jangan overfit".
- **buildScopeBlock** — `briefing.js:50` consumer utama compose. 2-mode: deep (verbose / milestone) vs non-deep (daily harian).

*Lewati §0 kalau sudah paham. Isi teknis mulai §A.*

---

## §A — Peta file fase ini

| File | Peran | Baris kunci |
|------|-------|-------------|
| `reports.js` (642) | **13-export pure-function engine — stats + renderer + cost helper**: tak I/O, tak mutation, profitability-lens | 15-17 imports (config/lessons/format); 19-26 helpers (esc/fin/sum/mean/r2/money/pct); 31-181 computeTradeStats; 189-200 classifyCloseRule; 203-225 formatMovement; 232-254 groupStats (SHRINK_K=5); 262-283 formatStatsBlock; 285-288 fmtHold; 302-361 formatQuantBlock; 368-373 computeCostDragPct; 376-394 formatBreakdown; 400-415 formatTrend; 423-545 buildRecommendations; 551-565 buildVerdict; 573-587 buildTradeReport; 596-606 GAS_EST_SOL+estimateGasSol; 614-642 buildRoleCostLines |
| `views/format.js` (194) | **String primitif presenter**: tree-style + SEP + curSym (solMode). Murni, no money-logic | 143 SEP; 178 tree |
| `briefing.js` (557) | **Consumer utama**: buildScopeBlock + countOnChainActions + buildTradeReport periodic + cost section | 15-17 imports (7 fn); 50-61 buildScopeBlock; 63-94 countOnChainActions (`./logs/actions-*.jsonl`, dry-run/paper skip :88); 199 buildRoleCostLines; 348/359/462/478 cost-drag flow; 481/524/541 buildTradeReport periodic |
| `tools/dlmm.js` | **Paper cost parity import**: `estimateGasSol` paper cost line | 30 import; 1603-1604 paper gas drag (`deploy+close+claim+swap` sum, sama live) |
| `telegram.js` | **Close-path gas notify**: `estimateGasSol` close/claim/swap sum | 5 import; 601 `estimateGasSol({close_position:1, claim_fees:1, swap_token:1})` |
| `pnl-tracker.js` | **GAS_EST_SOL sum import**: gate threshold | 20 import; 32 `deploy + close + swap` SOL sum |
| `scripts/backtest-exits.js` | **Sanity check caller**: compare raw aggregation vs computeTradeStats(getModePerformance()) | 19-20 imports; 199-201 SANITY comment + run |
| `agent.js` | **Tak direct import reports** — getDecisionSummary F23 + getLessonsForPrompt F22 — tak baca stats engine | — |
| `config.js` | **Source-of-read**: `config.screening`/`management` (buildRecommendations `:427-428`) + `config.llm.*/Model` (buildRoleCostLines `:616-620`). Read-only — tak mutasi di reports | 297-305 llm section; screening/management section |
| `lessons.js` | **Source-of-import (read path)**: getHourlyProfile/getNarrativeProfile/classifySession/classifyNarrative/sessionLabel — F22 mode-scoped, F24 baca utk recommendation weak-bucket | 16 import |

---

## §B — Alur data hulu→hilir (ASCII diagram)

```
            [Source data]
   lessons.json  performance[]  ──(recordPerformance F19 write)──> [366 record live]
              │
              │  mode-filter (paper/live isolation)
              │  getModePerformance()  F22  (consumer-side, di luar reports)
              │  getLifetimePerformance() / getPerformanceForRacikan(name)  F22
              ▼
   [records array passed in]  (pure param — reports tak baca file)
              │
              ├──────────────────┬─────────────────┬───────────────┬───────────────┐
              ▼                  ▼                 ▼               ▼               ▼
   computeTradeStats   classifyCloseRule   buildVerdict   buildRecommendations  formatTrend
   (38-field stats)    (per-record rule)   (4-tier)       (14-rule)            (last-N vs prior-N)
              │                  │                 │               │               │
              │   perfWithRule = perf.map(p => ({...p, close_rule: classifyCloseRule(p.close_reason)}))  :130
              │                  │                 │               │               │
              └──┬───────────────┴──┬──────────────┴───────────────┴───────────────┘
                 │                  │
                 │   groupStats 4× breakdown (strategy/session/narrative/setup) + 1× close_rule |net|-sort
                 │
                 ▼
       [stats obj]  ──>  formatStatsBlock / formatMovement / formatQuantBlock / formatBreakdown
              │
              ▼
        [HTML block string]
              │
   buildTradeReport(perf, opts) ──> SEQUENCE: title | subtitle | identity | SEP | statsBlock | verdict | quantBlock | trend | movement | breakdown | recommendations | SEP
              │
              │  caller-attached cost-drag (computeCostDragPct) + role-cost (buildRoleCostLines) + gas (estimateGasSol/GAS_EST_SOL)
              │
              ▼
   [Full HTML report string]
              │
   ┌──────────┴───────────┬─────────────────┬─────────────────┬──────────────────┐
   ▼                      ▼                 ▼                 ▼                  ▼
briefing generateBriefing  milestone       /report (3-tier)   weekly/monthly     backtest
(F25 buildScopeBlock)      report (F25)    (F30 index.js)     periodic (F25)     sanity (F33)
```

---

## §C — Sinkron: siapa-panggil-siapa

| Pemanggil (file:line) | Dipanggil (file:line) | Trigger | Data lewat | Fail-mode |
|---|---|---|---|---|
| briefing.js:51 | reports.js:31 computeTradeStats | buildScopeBlock(perf,label,deep) | `perf[]` array mode-filtered F22 | Empty → `{count:0}` (formatStatsBlock "no closed positions yet" `:263`) |
| briefing.js:54 | reports.js:551 buildVerdict | deep=true compose | `st` stats obj | `st.count<4 → null` (skip blok) |
| briefing.js:55 | reports.js:302 formatQuantBlock | deep=true + quantOpts | `st, {costDragPct}` | `st.count===0 → null` (`:303`) |
| briefing.js:56 | reports.js:203 formatMovement | deep=true | `st` (st.movement + st.price_movement) | `!m && !pm → null` (`:206`) |
| briefing.js:57 | reports.js:376 formatBreakdown | deep=true | `st, {sessions:false}` | `st.count===0 → null`; `out.length===0 → null` (`:393`) |
| briefing.js:58 | reports.js:423 buildRecommendations | deep=true + recOpts | `perf[], st, recOpts` | `perf.length<4 → null` (`:425`) |
| briefing.js:199 | reports.js:614 buildRoleCostLines | cost section daily | `costData` (from `llm-cost-tracker`) | `!costData \|\| calls===0 → null` (`:615`) |
| briefing.js:348/462 | reports.js:604 estimateGasSol | gas estimate fallback (bila `gas-tracker` no data) | `countOnChainActions(sinceMs)` map | Empty `{}` → 0; `GAS_EST_SOL` calibrated constant |
| briefing.js:359/478 | reports.js:368 computeCostDragPct | cost-drag % utk quantBlock | `{costUsd, windowDays, modalUsd}` | Bad input → `null` (`:369-370`) |
| briefing.js:481/524/541 | reports.js:573 buildTradeReport | periodic (weekly/monthly) + `/report` | `perf[], {title, subtitle, statsLabel, trendN, identity, quant}` | Empty records → "No closed positions" (`:576`) |
| index.js:270 | reports.js:368 computeCostDragPct | computeReportCostDrag() | `{costUsd, windowDays:30, modalUsd}` | Null return → quant skip |
| index.js:319/339/353 | reports.js:573 buildTradeReport | `/report` 3-tier (lifetime/racikan/active) | `lifePerf` / `recsPerf` / `modePerf` + opts | Empty → "No closed..." |
| telegram.js:601 | reports.js:604 estimateGasSol | notifyClose gas line | `{close:1, claim:1, swap:1}` | Konstanta, tak fail |
| tools/dlmm.js:1604 | reports.js:604 estimateGasSol | paper cost parity (DRY_RUN) | `{deploy:1, close:1, claim:1, swap:1}` | Konstanta; comment `:1603` "paper and live cost lines agree" |
| pnl-tracker.js:32 | reports.js:596 GAS_EST_SOL (direct) | threshold gate | import konstanta | Konstanta |
| scripts/backtest-exits.js:201 | reports.js:31 computeTradeStats | SANITY raw vs `getModePerformance()` | `getModePerformance()` | — |

---

## §D — Logika kunci per fungsi

### computeTradeStats(records) — reports.js:31-181
- **Apa**: Pure-function engine utama. Filter finite-pnl → split win/loss → 12 headline metric + 4 breakdown + 2 movement block.
- **Kapan dipicu**: Dipanggil briefing/milestone/`/report`/backtest (semua consumer pass `records`).
- **Output**: 38-field stats objek (lihat §B schema). Empty → `{count:0}`.
- **Sinkron**: 4 breakdown baca `groupStats(perf, key)` (`:232`) — `strategy`/`open_session`/`narrative_category`/`active_setup`. `by_close_rule` map `classifyCloseRule` dulu via `perfWithRule` (`:130`) lalu groupStats + sort `|net_usd|`.
- **Fail-mode**: Non-finite `pnl_usd` di-drown lewat `:32` filter. `pnl_pct` null → `fin()` (`:20`) drop. `Infinity` `profitFactor` (`:132`) → render `pf(Infinity)="∞"` (`:256`). MaxDD `peakAtMaxDD=0` → `maxDDPct=null` (DD melebihi peak, ratio explode, render USD aja `:73`).
- **Bukti**: reports.js:31-181.

### classifyCloseRule(reason) — reports.js:189-200
- **Apa**: Free-text `close_reason` → 7-bucket canonical. Precedence: stop loss > OOR > low yield > TP > pumped > indicator > trailing TP/dropped+peak > manual/lainnya.
- **Kapan dipicu**: `computeTradeStats` `:130` (breakdown), pemanggil lain utk display.
- **Output**: String bucket key.
- **Sinkron**: `computeTradeStats` `:130` map per record sebelum groupStats.
- **Fail-mode**: Empty/close_reason null → `"lainnya"` (`:191`).
- **Kontrak**: Specific-before-generic (`:187-199`). Prefix `⚡ Trailing TP:` (dlmm.js wrapper) tak mengacaukan karena specific-cause match (`"out of range"` `:193`, `"low yield"` `:194`) sebelum wrapper-generic (`"trailing tp"` `:198`). **PENTING**: kalau urutan dipecahkan → breakdown misleading (mis `"⚡ Trailing TP: Out of range for 30m"` bakal jadi trailingTP bukan OOR bila `:198` ditarik ke atas).
- **Bukti**: reports.js:189-200. Live run: pumpedAboveRange 148 / trailingTP 114 / lowYield 59 / outOfRange 20 / stopLoss 12 / takeProfit 8 / manual/lainnya 5.

### groupStats(perf, key) — reports.js:232-254
- **Apa**: Per-bucket breakdown (count/win_rate/avg_pnl_pct/net_usd/avg_net_usd/score). Shrunk-expectancy `score = (net + K×globalAvg)/(count + K)`, K=5 prior.
- **Kapan dipicu**: `computeTradeStats` 4× call (strategy/session/narrative/setup, `:171-174`) + 1× (close_rule with pre-mapped `perfWithRule`, `:178`).
- **Output**: Array bucket sorted by `score` desc (best-first).
- **Sinkron**: `by_close_rule` override sort `|net_usd|` desc (`:178-179`).
- **Fail-mode**: Empty bucket key (`!k`) skip (`:236`). Empty perf → `globalAvg=0` (`:239`) — score jadi `net/(count+K)`, masih finite.
- **Kontrak**: N-fair — 1-trade fluke tak top 15-trade bucket (5-trade prior pull ke global mean). Live `by_setup`: `mainzen_v2_1` 273 trade +$7.51 score 0.03 vs `mainzen_v2` 93 trade -$11.20 score -0.11 — racikan v1 lemah (cross-ref F20 defiance — 84 record lama mainzen_v2 campur).
- **Bukti**: reports.js:232-254.

### buildRecommendations(allPerf, st, opts) — reports.js:423-545
- **Apa**: 14-rule profitability-aware advisor. Risk-posture → anti-naive stop guard → dimension tweaks → bucket favor/avoid → weak classifier → movement tune → gas efficiency → scale-up guard. Max 7 recs.
- **Kapan dipicu**: briefing `recOpts` set (milestone / `/report` deep), `buildTradeReport` default panggil (`:584`).
- **Output**: HTML block `["💡 <b>Recommendations:</b>", tree(recs.slice(0,7))].join("\n")` atau null.
- **Sinkron**: Baca `config.screening.minFeeActiveTvlRatio`/`config.management.positionSizePct`/`stopLossPct`/`outOfRangeWaitMinutes`/`trailingTriggerPct`/`trailingTakeProfit`/`trailingDropPct` (`:427-428`). Baca `getHourlyProfile`/`getNarrativeProfile` F22 (`:496-504` try-catch fail-open).
- **Fail-mode**: `perf.length<4 → null`. Try-catch di session/narrative (`:499`/`504`) → skip rec bila learning tak siap.
- **Kontrak KUNCI — Anti-naive stop guard (winnersDipDeep)**: `:441-442` `pm.win_worst_trough_pct < pm.loss_avg_trough_pct` → **JANGAN perketat stopLoss/OOR** (bakal motong pemenang), leak = entry quality (rug/dump screening). Live: `win_worst_trough_pct -34.16` < `loss_avg_trough_pct -8.56` → **winnersDipDeep = TRUE** → SL perketat bakal motong winners yang sebenernya pulih dari dip dalam. Bocor di kualitas entry, bukan stop. Rec bakal suggest "perketat screening rug" bukan "perketat stopLoss". Ini lawan naive logic lama yang saran ketat SL tiap lihat avg trough dalam.
- **Bukti**: reports.js:423-545.

### buildVerdict(st) — reports.js:551-565
- **Apa**: 4-tier plain-language health read. Sehat / Tipis / **Jebakan win-rate** / Belum profit.
- **Kapan dipicu**: briefing deep=true + `/report` deep + milestone + periodic.
- **Output**: HTML 1-line atau null.
- **Sinkron**: Baca `st.net_pnl_usd`, `st.profit_factor`, `st.win_rate_pct`, `st.avg_win/loss_pct`.
- **Fail-mode**: `st.count<4 → null`.
- **Kontrak**: Tangkap "high win-rate but net-negative" (jebakan win-rate) — `net<0 && win≥60%` (`:559`) → vonis jelaskan leak rugi-besar. Live: net -$3.69, PF 0.91, win 65% → trigger Jebakan-win-rate path (`:559-562`).
- **Bukti**: reports.js:551-565.

### formatQuantBlock(st, opts) — reports.js:302-361
- **Apa**: Quant-edge block — RR + break-even WR + EV/trade (R) + recovery_needed + fee-density + cost-drag verdict + noisy flag.
- **Kapan dipicu**: briefing deep=true + `/report` + milestone + periodic.
- **Output**: HTML tree atau null.
- **Sinkron**: Baca `st.avg_win_pct/avg_loss_pct/win_rate_pct/max_drawdown_pct/fee_pct_capital/fee_apr_pct/fees_usd`. `costDragPct` dari caller (`opts.costDragPct`, default null → skip).
- **Fail-mode**: `st.count===0 → null`. RR `∞` bila `avg_loss_pct=0/null` (`:319-322`). `recovery_needed` cek `max_drawdown_pct < 100` (`:336`).
- **Kontrak**: "noisy" flag — `n < noisyBelow (100)` → "noisy ±10%, baca arah saja, jangan overfit" (`:359`). Sengaja label kerangka peringatan kecil-sample.
- **Bukti**: reports.js:302-361.

### buildTradeReport(perf, opts) — reports.js:573-587
- **Apa**: Compose full HTML report. SEQUENCE: title | subtitle | identity | SEP | statsBlock | verdict | quantBlock | trend | movement | breakdown | recommendations | SEP. Fail-open per blok (null skip).
- **Kapan dipicu**: `/report` 3-tier (`index.js:319/339/353`), periodic (`briefing.js:481/524/541`).
- **Output**: Full HTML string.
- **Sinkron**: `identity` param dari caller (🧬 Profil + 🗂️ Racikan line) — reports tetap config-free (`:575`). `quant` param dari caller bawa costDragPct.
- **Fail-mode**: Empty records → "No closed positions in this window yet." (`:576`).
- **Bukti**: reports.js:573-587.

### computeCostDragPct({costUsd, windowDays, modalUsd}) — reports.js:368-373
- **Apa**: Annualized cost-drag % = `(costUsd/windowDays × 365 / modalUsd) × 100`. Pure helper supaya pemanggil takpunya ulang rumus.
- **Kapan dipicu**: briefing daily (`:359`), periodic (`:478`), `/report` (`index.js:270`).
- **Output**: % float atau null.
- **Sinkron**: Caller hitung `costUsd` (gas + LLM USD dari tracker) + `modalUsd` (wallet USD dari `sol-tracker`) — reports tak sentuh tracker.
- **Fail-mode**: Bad input → null (`:369-370`).
- **Bukti**: reports.js:368-373.

### estimateGasSol(counts) + GAS_EST_SOL — reports.js:596-606
- **Apa**: Rough per-action Solana gas estimate (SOL). `GAS_EST_SOL` 4-action konstanta. `estimateGasSol` sum per-tool.
- **Kapan dipicu**: telegram.js:601 (notifyClose), dlmm.js:1604 (paper cost parity), briefing.js:348/462 (fallback bila `gas-tracker` no data), pnl-tracker.js:32 (gate threshold).
- **Output**: SOL float.
- **Sinkron**: Real on-chain gas dari `gas-tracker.js` override konstanta bila `_hasData` true. Konstanta calibrated ke base fee measured (~0.000005 SOL/tx, prior defaults 100× kebanyakan tinggi).
- **Fail-mode**: Empty `counts` → 0.
- **Kontrak**: paper/live parity — dlmm.js:1603 comment EXPLICIT "paper and live cost lines agree". Sengaja supaya sim tak under-estimasi cost (paper harus tampil se-real live utk meaningful baseline).
- **Bukti**: reports.js:596-606.

### buildRoleCostLines(costData) — reports.js:614-642
- **Apa**: LLM cost per-role. Map model → role via `config.llm.{screening,management,general}Model`. Shared-model detection bila 1 model dipakai >1 role → "(est, shared model)" tag.
- **Kapan dipicu**: briefing daily cost section (`:199`), periodic (`:478`).
- **Output**: Array lines atau null.
- **Sinkron**: Baca `config.llm.*Model` (`:616-620`) — satu-satunya export yang baca config.llm di reports. Sort by `stats.cost` desc.
- **Fail-mode**: `!costData \|\| calls===0 → null` (`:615`). Model tak match role → "Other [short]: $X (Y calls)" (`:637`).
- **Kontrak**: Precise when roles distinct, labelled estimate when shared. Live: 3 model (mimo-v2.5-free ×2 → screening+management shared → tag "(est, shared model)" + minimax-m2.5general non-shared).
- **Bukti**: reports.js:614-642.

---

## §E — Temuan: bug / gap / kontrak-kunci / fail-open tak-terpenuhi

### E.1 — `pnl_usd === 0` tak masuk wins AND tak masuk losses (count n invariant)
**Lokasi**: reports.js:36-37.
**Temuan**: Win/loss split `pnl_usd > 0` (wins) / `pnl_usd < 0` (losses). Record dengan `pnl_usd === 0` (breakeven) JADI-DROPIS masuk NEITHER. `n = perf.length` (`:33`) masuk invariant (count tetap n). `win_rate_pct = wins.length/n × 100` (`:140`) → 0-pnl trade tak hitung menang AND tak hitung kalah, tapi masuk denominator. Net = sum(perf.pnl_usd) (`:39`) — 0-pnl menambah nol (?). **Ekses**: win_rate% turun krn 0-pnl trade menambah denominator tanpa menambah numerator; `profit_factor` = grossProfit/`Math.abs(sum(losses.pnl_usd))` — 0-pnl tak masuk numerator AND tak masuk denominator grossLoss → PF tak terpengaruh. 4-metric-konsistensi math-OK dan memang `pnl_usd > 0` filosofikal (positive expectancy), tapi `win_rate_pct` bisa menyesatkan bila banyak breakeven (0-pnl trade inflates denominator, deflate WR untung-xs). **Sangat-low** impact live (366 perf, hampir semua nonzero) tapi kalau swap/exact-same-cost luput → 0-pnl bisa muncul. Bukan bug — design choice. Laporkan sebagaimana adanya.

### E.2 — `by_close_rule` sort override `|net_usd|` tapi `groupStats` masih tag `score` (dead-field di close_rule)
**Lokasi**: reports.js:178-179 + 232-254.
**Temuan**: `by_close_rule` sort by `|net_usd|` desc (`:179`) SEKALIGUS menahan prop `score` dari `groupStats` (`:250`). Field `score` tetap di-output tapi tak digunakan utk sort (di-silang sama override). Render `formatBreakdown` blok "🛑 By close rule (urut dampak $)" (`:392`) tak baca `score` — tampilkan `net_usd` + `avg_net_usd` (`:384`). **Ekses**: Field `score` mati di `by_close_rule` rows. Tak menyesatkan (tak ditampilkan) tapi field surplus = bila konsumen parse `score` utk sort ulang di-shot → bakal salah urut krn `score` aslinya utk shrunk-expectancy. **Trivial** — cosmetic_field surplus. Fix: unbungkus `by_close_rule` lewat `groupStats(perfWithRule, "close_rule").map(r => ({...r, score: undefined}))` kalau klein.

### E.3 — `buildRoleCostLines` shared-model collapse: roles tak split bila model identik (DONE-by-design TAPI label "(est, shared model)" too-mild)
**Lokasi**: reports.js:614-642.
**Temuan**: Live config: 3 model — `screeningModel:"mimo-v2.5-free"` + `managementModel:"mimo-v2.5-free"` + `generalModel:"minimax/minimax-m2.5"`. `buildRoleCostLines` mapping `roleOf[model]` (`:616`) → overwrites: untuk `mimo-v2.5-free`, mapping `roleOf["mimo-v2.5-free"]` berubah 2× — `roleOf[management] = "Management"` (`:619`) menulis ulang `roleOf[screening] = "Screening"` (`:618`) krn key sama. **AKIBAT**: `roleOf["mimo-v2.5-free"]` hanya `"Management"` (last-write-menang). Saat loop iterate `Object.entries(costData.byModel)` (`:629`) utk `mimo-v2.5-free`, `role = "Management"` saja → garis cost `• Management (est, shared model)` tampil — Screening HILANG dari output. Label "(est, shared model)" cuma warning — tapi `• Screening` LINE tak ada. **Bug**: shared-model collapse: 2 role "menumpuk" jadi 1 line (Management), Screening tak separate-tag. `modelRoleCount["mimo-v2.5-free"] = 2 → shared=true → anyEstimate=true → tag "(est, shared model)" dipasang PLUS footnote "roles sharing a model can't be split"` (`:640`). User baca "Management (est, shared model)" tapi "Screening" KATA tak muncul. Kontrak "precise when distinct, labelled estimate when shared" (`:610-611`) lulus — line dikombinasi-shown + footnote kakus. TAPI labelnya "Management", bukan "Screening+Management" — konsumen baca mungkin bingung "Screening mana?". **Low impact** (cost total masuk, cuma label). Fix ideal: line `[Screening+Management]` atau `Screening + Management (shared model)` utk `roleOf[model]` array-value. Saat ini sink obj `roleOf = {}` tak bisa hold 2 — perlu `rolesOf[model] = []`. **Cosmetic-bug + label-clarity**.

### E.4 — Trend comparison `profitFactor` `Infinity` short-circuit `999` (`:412`) hack
**Lokasi**: reports.js:412 `formatTrend`.
**Temuan**: `arrow(recent.profit_factor === Infinity ? 99 : recent.profit_factor, prior.profit_factor === Infinity ? 99 : prior.profit_factor)`. `Infinity` di-coerce ke `99` utk bandingkan. **Bila kedua window 0 rugi** → `prior.PF=∞ → 99`, `recent.PF=∞ → 99` → sama → arrow `""` (flat) — OK. **Bila prior ∞ tapi recent finite-tinggi** (mis prior 5 trade smua menang, recent 5 trade 1 rugi PF 4.0) → bandingkan `99` vs `4.0` → 4.0 < 99 → arrow "📉" → kelihatan "PF turun dari ∞ ke 4.0" padahal 4.0 = hebat. **Cosmetic**: arrow keliruan. `pf(prior.profit_factor)` render `:412` masi pipeline `"∞"` (`:256`) jadi tampil "Profit factor: ∞ → 4.0 📉" — confused (4.0 technically profit-factor-high). **Low** impact (cuma arrow icon), tapi math-nya `99` magic-number bau. Fix: check `Infinity` eksplisit, `arrow` prior `null` bila prior `∞` (tak bisa compare). **Sangat-cosmetic**.

### E.5 — `formatBreakdown` session block DEFAULTS to false di briefing buildScopeBlock (`:57`) TAPI default true di standalone
**Lokasi**: briefing.js:57 vs reports.js:389.
**Temuan**: `formatBreakdown(st, { sessions: false })` di `buildScopeBlock` (`briefing.js:57`) → session block DI-SKIP di briefing. TAPI `formatBreakdown` standalone default `block("🕒 By session (WIB):", st.by_session, { keyFmt: sessionLabel })` (`:389`) cek `opts.sessions !== false` (`:389`) → default ON bila dipanggil tanpa opts. **Asimetri**: briefing tak menampilkan session-block (krn F22 profile punya section terpisah?), tapi `buildTradeReport` default `formatBreakdown(st)` (`:583`) → session ON di `/report`/milestone. **Design choice** (bukan bug) — briefing punya F22 time-profile section tersendiri, `/report` layout-flat menampilkan semuanya. Konsisten-benar: tiap surface customize. Tapi konsumen baru bingung "kok session ada di /report tapi tak di briefing?". **Kontrak-dokumentasi-baik** — F22 cross-ref. Laporkan sebagaimana adanya.

### E.6 — `movement` block gatemin `≥4` samples tak return-count, consumer tak bisa tau kenapa skip
**Lokasi**: reports.js:90 (`movement`) + :113 (`price_movement`).
**Temuan**: `if (withMove.length >= 4) { movement = {...} }` — bila <4, `movement` tetap `null`. `formatMovement` cek `if (!m && !pm) return null` (`:206`) → skip blok total. **Ekses**: konsumen tak bisa distinguish " belum ada peak_pnl_pct di record" vs " ada tapi cuma 3 sample, di-gate". `setup_briefing` skip dengan senyap. **Low** — fail-open benar (skip null), tapi debugging "kok PnL movement block tak muncul padahal saya sudah trade?" susah. Improvement: return `{samples: N, gated: true}` dengan low count. **Bug-cosmetic-info**.

### E.7 — `buildRecommendations` weakPF `<1.2` threshold hardcoded (tak config-driven)
**Lokasi**: reports.js:432.
**Temuan**: `weakPF = stats.profit_factor !== Infinity && stats.profit_factor != null && stats.profit_factor < 1.2`. `1.2` magic-number hardcoded, tak bisa di-config. `lopsided` `<1` (`:433`) juga. `biggest_loss.pnl_pct <= -30` (`:458`) juga. Tidak satupun DRIVEN oleh config — berlaku universal. **Kontrak**: laporan konsisten lintas user (tak bisa user-tune saran). Tapi deny-mutability → tak bisa experiment (mis "PF threshold 1.5 utk konservatif"). **Design-choice** — rule fatal recommendation harus universal-statistically-meaningful. Laporkan sebagaimana adanya (mungkin future-config kalau ada cient demand).

### E.8 — `computeTradeStats` tak baca `paper:true` tag (filter di pemanggil, bukan di sini)
**Lokasi**: reports.js:31 (filter cuma finite-pnl).
**Temuan**: `computeTradeStats` filter `p && Number.isFinite(p.pnl_usd)` (`:32`) — tak filter `paper:true`. Paper record (`paper:true` tag dari `recordPerformance` F19) masuk compute BILA pemanggil pass. **Kontrak paper/live isolation** (CLAUDE.md): isolation dilakukan PEMANGGIL (`briefing.js:108 keepMode`, `lessons.js getModePerformance` F22) sebelum pass ke reports. **Konsekuensi**: `computeTradeStats([live+paper mix])` akan menjumlahkan keduanya — paper tidak auto-dropped. Backtest-exits.js `:201` `computeTradeStats(getModePerformance())` — `getModePerformance` di F22 sudah filter, aman. Tapi konsumen baru (CLI experimen, manual debug) bila lupa filter → paper kontamin. **Fail-open-caveat**: reports. pure-function isolation = "harus tahu naruh filter di pemanggil". **Documented-by-design**: F22 + CLAUDE.md eksplisit — reports tak punya context live/paper. **Kontrak-penting** — pelanggaran isolation kalau pemanggil lupa filter. **Sangat-by-design**, tapi patut di-flag utk kontrak audit.

### E.9 — `buildRecommendations` `biggest_loss.pnl_pct <= -50` tips "screening rug" tapi `biggest_loss.pnl_pct > -50 && !winnersDipDeep` tips"hard stopLossPct"
**Lokasi**: reports.js:458-466.
**Temuan**: 3-tier: `≤ -50` atau `winnersDipDeep` → screening rug (`:461-463`); `> -50 && !winnersDipDeep` → "hard stopLossPct would have capped" (`:464`). **TAPI** `-30 ≤ biggest_loss.pnl_pct < -50 && !winnersDipDeep` → tips stopLoss (padahal `-30%` rug=dump-biasa, tak sedalam -50, stopPrice bakal cap di -12% configuur jika ada). Logical collapse: -30% bakal melewati stopLoss -12% (yang aktif `config.management.stopLossPct`) SEBELUM jadi -30%. Rekomendasi "hard stopLossPct would cap" redundant — stopLoss bakal aktif duluan. **Cosmetic**: rec redundant bila stopLoss aktif. Tapi kalau stopLoss OFF (live config — `stopLossPct: undefined`) → rec valid (perlu nyalakan). **Low-impact** — recommendations layer, tak mutasi.

---

## §F — Glosarium istilah fase

- **profitability-lens** — kontrak: book diukur PF/payoff/expectancy/tail-dominance, bukan win-rate. Root comment `:8-13`. Lawan: win-rate-only (lama).
- **pure-function engine** — `reports.js` tak baca file, tak mutasi state, tak sentuh SDK/I/O. Semua data lewat parameter.
- **13 export** — computeTradeStats/classifyCloseRule/formatMovement/formatStatsBlock/formatQuantBlock/formatBreakdown/formatTrend/buildVerdict/buildRecommendations/buildTradeReport/computeCostDragPct/estimateGasSol/buildRoleCostLines + konstanta GAS_EST_SOL.
- **profit_factor** — grossProfit/grossLoss. Infinity bila 0 loss, null bila 0 win.
- **payoff_ratio** — avgWinUsd/|avgLossUsd|. <1 = avg loss > avg win (skew leak).
- **expectancy_usd** — mean(perf.pnl_usd). +$ = edge, -$ = leak.
- **break-even WR** — `1/(RR+1)×100`. WR minimum buat impas.
- **rr** — avg_win_pct/|avg_loss_pct|. Trade-level RR.
- **MAE** — maximum adverse excursion. `win_worst_trough_pct`. Winners' deepest price dip.
- **winnersDipDeep** — anti-naive guard. `pm.win_worst_trough_pct < pm.loss_avg_trough_pct` → jangan ketat SL (motong winners).
- **give-back** — `avg_peak_pct - avg_exit_pct`. Run-up tak di-kunci di exit.
- **shrunk-expectancy ranking** — `groupStats`. Bayesian-shrink `score = (net + K×globalAvg)/(count + K)`, K=5 prior. N-fair.
- **SHRINK_K=5** — konstanta 5 trade prior belief.
- **classifyCloseRule** — free-text → 7-bucket mapper. Specific-before-generic.
- **7-bucket** — stopLoss / outOfRange (OOR) / lowYield (R5) / takeProfit (R2) / pumpedAboveRange (R3) / indicatorExit / trailingTP / manual/lainnya.
- **specific-before-generic** — kontrak: specific cause match sebelum generic trailing-TP wrapper.
- **adjusted_close_rule_sort** — `by_close_rule` sort `|net_usd|`, bukan score. Safety-mechanism lens.
- **cost-drag** — `(costUsd/windowDays × 365 / modalUsd) × 100`. Ambang sehat <20%.
- **fee density** — `fee_pct_capital = feesUsd/invested × 100`. APR = `fee_pct × 525600/inRangeMin`.
- **max_drawdown** — cumulative equity curve `peak - cum`. `maxDDPct` relatif `peakAtMaxDD`, meaningful saat `peak > 0`.
- **recovery_needed** — `1/(1-DD%) - 1`. Gain % buat pulih.
- **GAS_EST_SOL** — 4-action konstanta. Calibrated measured base fee. Real `gas-tracker` override.
- **buildRoleCostLines** — map model → role. Shared-model `(est, shared model)` tag.
- **noisy** — `n < noisyBelow (100)`. Flag sample-tipis ("baca arah, jangan overfit").
- **buildScopeBlock** — `briefing.js:50` consumer compose. 2-mode: deep (verbose) vs non-deep (daily).
- **tail-dominance** — `net_excl_worst_usd = netUsd - worstUsdRow.pnl_usd`. 1-loss dominan buku.

---

## §G — Link fase lain (cross-ref)

- **F19** (recordPerformance — source data): `performance[]` di `lessons.json` = input `computeTradeStats`. `paper:true` tag di record, TAPI filter di pemanggil (F22), bukan reports. cross-E.8.
- **F20** (evolveThresholds — defiance same-source): 84 record lama mainzen_v2 campur ke 366 live. `by_setup` live menunjukkan `mainzen_v2` 93 trade net -$11.20 score -0.11 — krn record lama pra-`active_setup` filter. F20 Open-Q resonance: metrics dari reports bantu diagnose contamination.
- **F22** (getModePerformance — paper/live filter): reports TAK baca tag paper, isolation di sisi pemanggil. `getModePerformance()` F22 pref-filter sebelum pass ke reports. Tanpa F22 = paper kontamin bila pemanggil lupa.
- **F25** (briefing — consumer utama): `buildScopeBlock` `:50` + `countOnChainActions` `:71` + `buildRoleCostLines` `:199` + `buildTradeReport` periodic `:481/524/541`. Reports pure-function, briefing orchestrate + cost fetch.
- **F26** (config — read-only source): `config.screening`/`management` baca di `buildRecommendations` `:427-428`. `config.llm.*Model` baca di `buildRoleCostLines` `:616-620`. Read-only — tak mutasi.
- **F30** (`/report` Telegram — F30 handler): `index.js:319/339/353` 3-tier (lifetime/racikan/active) panggil `buildTradeReport`. Identity param dari caller (🧬 Profil + 🗂️ Racikan line), quant bawa costDragPct.
- **F33** (backtest — caller sanity-check): `backtest-exits.js:201` bandingkan raw-aggregation vs `computeTradeStats(getModePerformance())` — kontrak "angka reports = angka benchmark".
- **F8** (CONFIG_MAP): `update_config` tak bisa tweak reports thresholds (E.7) — `weakPF `<1.2` hardcoded. Real-config mutation lewat executor.js, bukan reports.

---

## §H — Open-Q (bawa ke fase F25, F33)

1. **E.3 buildRoleCostLines shared-model collapse**: live config screening+management kembar (`mimo-v2.5-free`) → output tampil "Management (est, shared model)" only, Screening nama tak separate. Cost total benar (digabung), tapi label misleading (konsumen baca "Screening mana?"). Fix: `rolesOf[model] = []`-array utk list multiple roles per model. Bawa ke F25 briefing cos-section review — verifikasi tampilan sesungguhnya di Telegram output.
2. **E.4 trend `Infinity→99` magic-number**: prior ∞ vs recent finite-tinggi → arrow "📉" keliruan. Bila prior window smua menang (baru mulai live, sedikit trade, 0 rugi) → arrow selalu `📉` ke recent. Seberapa sering muncul? Check live: trendN default 10, prior=-20..-10, recent=-10..0. Bila prior window 10 trade smua menang (∞ PF) → pasti muncul. **Impact-frequent** pada fase awal-live. Fix bila ke F25 `formatTrend`.
3. **E.8 paper/live isolation enforcement**: reports tak filter `paper:true`. Kontrak "filter di pemanggil" — bila konsumen baru lupa (mis CLI debug script, manual analyze) → paper kontamin. Worth pertimbangkan defense-in-depth: bila `paper:true` diilter default di `computeTradeStats` + opt-in `includePaper:true` utk backtest/`/report all`? Trade-off: reports jadi context-aware (bukan pure-function lagi). Bawa ke F13/F32 paper audit konsisten.
4. **Movement block `≥4` sample gate**: bila live sampai 20+ trade tapi movement block tak tampil di briefing, debugging tanpa-count susah. Worth export `{samples, gated:true}` partial-count utk diagnostic? Bawa ke F25 review konsumen briefing.
5. **Backtest-exits.js sanity-check konsumen**: `computeTradeStats(getModePerformance())` `backtest-exits.js:201` — F33 wajib audit path ini. Kontrak "raw aggregation dari backtest = computeTradeStats output". Bila dev computes raw PnL sum manually dan berbeda → flag bug.
6. **`buildRecommendations` config-read coupling**: baca `config.screening`/`management` `:427-428` → mutate-config (`update_config` F28) tak trigger event-report. Rec bakal suggest config-lawan tampil di `/report` sama ya bila config updated via `/setcfg`. Worth inline-style verify F28.