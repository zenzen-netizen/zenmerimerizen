# Audit F25 — Briefing + milestone + 4 tracker + cost net (analytics orchestration)
> Read-only. Bukti `file:line`. UNKNOWN kalau tak pasti. Resume: buka file ini.
> Kedalaman: ⬛⬛ mandatory deep — alasan: briefing.js 557-baris orchestrator bawa 10 import lintas-module (reports/lessons/trackers/openrouter-usage/candidate-memory/pool-memory/preset/paper-mode/wallet/format), 4 cron schedule (01:00 UTC morning + 6h-watchdog + Mon-01:30 weekly + 1st-02:00 monthly) di `index.js:1286-1307`, `sendAndPinBriefing` pin/unpin state.json (`index.js:213`), `maybeFireLearningReport` milestone dedup counter (`:_lastReportedMilestone=270` live), 4 tracker persist (gas-log.json 1507 entry/30d, llm-cost-log.json 4502 entry, sol-balance-history.json 28 day/WIB-calendar, pnl-tracker window 1D/7D/30D compute), paper/live isolation mode-scoped `keepMode` (`briefing.js:106/309/322/327/336/441/442/444/447/525` — 9-point filter), racikan-scope disclosure `getExcludedRacikanStats`, 4 cost source precedence (local llm > gas-tracker > gas estimate > openrouter account) + paper-mode LLM-only-local isolation, oltre `maybeAutoTuneGasReserve` (`index.js:405` daily with `persistConfigChange`) — config-writing flow. `buildMilestoneReport` render diekstrak ke briefing.js (file aman, `:540`), index tinggal orkestrasi counter/dedup/send. cross-file sinkron tinggi — banyak titik divergen.
> Cross-ref: F23 (buildSkipReviewSection consumer `getDeployedPoolAddresses` F23 + `keepModePos` paper-prefix), F22 (`getModePerformance`/`getExcludedRacikanStats` paper/live filter + `getHourlyProfile` time-profile), F19 (`performance[]` source + `paper:true` tag), F24 (reports.js pure-function engine consumer utama), F26 (`config.management.gasReserve` + `gasReserveAutoTune` + `gasReserveBufferDays` + `gasReserveFloorSol` + `autoSwapAfterClaim` + `config.reports.learningReportEvery` + `learningReportTrendN` + `config.experiments.counterfactualReview` + `counterfactualMinMcapGainPct`), F28 (`persistConfigChange("management","gasReserve","gasReserve",target)` auto-tune writeback — F28 CONFIG path), F30 (Telegram greeting bot + REPL `/briefing` + `/report week|month|day` + `/wallet` solTracker, sendAndPinBriefing Telegram-side), F15 (candidate-memory `getSkipReview` counterfactual), F20 (evolveThresholds — `getModePerformance` milestone counter mode-scoped), F33 (`openrouter-usage.js` account API fallback utk balance/credits + paper isolation).

## Ringkasan eksekutif (5 baris)
1. **briefing.js = 2-export composer (`generateBriefing`:301 + `generatePeriodicBriefing`:430) + `buildMilestoneReport`:540 + 6 helper**. Export: `generateBriefing({allTimeDeep})`, `generatePeriodicBriefing(period)`, `buildMilestoneReport(perf,milestone)` — semua panggil `buildScopeBlock` (`:50-61`) atau `buildTradeReport` F24. 6 helper: `buildScopeBlock` (deep vs non-deep compose), `countOnChainActions` (`:71-94` `./logs/actions-*.jsonl` dry-run/paper skip `:88`), `buildLearningSection` (older lessons + last threshold + avg in-range all-time), `buildFeatureStatus` (mode + experiments ON), `buildCostSection` (`:172-243` cost net-of-all 4 source-precedence + paper isolation LLM-only-local), `buildTimeProfileSection` (`:245-271` WIB session fair-rank K=5 mirror reports.js groupStats), `buildSkipReviewSection` (counterfactual experiment gated). Import 10 module: `fs`/`log`/`repoPath`/`paths`, lessons (`getHourlyProfile`/`getModePerformance`/`getExcludedRacikanStats`), config, openrouter-usage (`getOpenRouter24hCost`/`Balance`/`Credits`), candidate-memory (`getSkipReview`), pool-memory (`getDeployedPoolAddresses`), tools/wallet (`getWalletBalances`), gas-tracker (`getGasStats`), llm-cost-tracker (`getLlmCostStats`), paper-trading (`isPaperMode`), reports (F24 11 fn import), preset-manager (`formatIdentity`), pnl-tracker (`formatPnlTracker`), format (`SEP`/`tree`).
2. **4 cron schedule + 1 watchdog + 1 PnL-poll-interval di `index.js:1250-1320`**, daily 01:00 UTC (`briefingTask` `:1286`), watchdog tiap 6 jam (`maybeRunMissedBriefing` `:1291` `:450` — last-sent-date dedup via `getLastBriefingDate`/`setLastBriefingDate` state.json, fire on-restart bila `lastSent !== todayUtc && UTC-hour ≥ 1`), weekly Mon-01:30 UTC (`weeklyTask` `:1296` — Monday-key dedup `isoWeekKey` via `(getUTCDay()+6)%7`), monthly 1st-02:00 UTC (`monthlyTask` `:1301` — `YYYY-MM` key dedup `getLastPeriodicBriefing`/`setLastPeriodicBriefing`). `mgmtTask`/`screenTask`/`healthTask` + `pnlPollInterval` (3s default别墅 via `config.pnl.pollIntervalSec`) — F25 fokus briefing cron 4 task + watchdog. State.json live: `_lastBriefingDate=2026-07-07` (today), `_lastBriefingPinId=10596`, `_lastReportedMilestone=270` (27 milestone fire), `_lastBriefing_week`/`_lastBriefing_month` dedup keys present (no format-key). `sendAndPinBriefing` (`index.js:213-226`): `sendHTML` + `pinMessage(new)` + `unpinMessage(prev)` + `setLastBriefingPinId` — best-effort (Telegram off/pin-rights missing → log, tak break send).
3. **maybeFireLearningReport** (`index.js:234-249`) hook di end of `runManagementCycle` (`:661`): gate `config.reports.learningReportEvery` default 10 (0=off), `Math.floor(getModePerformance().length / every) × every` milestone, dedup via `getLastReportedMilestone`/`setLastReportedMilestone` state.json (live `_lastReportedMilestone=270` — 27 fire, mode-scoped via F22 `getModePerformance`). `buildMilestoneReport(perf, milestone)` (`briefing.js:540-547`) panggil `buildTradeReport` F24 dgn `trendN=config.reports.learningReportTrendN` (default 10), identity-full. `maybeAutoTuneGasReserve` (`index.js:405-428`) jalan DULU `runBriefing` (`:434`) BACA 7d `getGasStats`, gate ≥8 record (`index.js:412`), hitung `dailyBurn = stats.sol/spanDays`, `target=max(floor,dailyBurn×buffer)` dgn `gasReserveBufferDays=14 default` + `gasReserveFloorSol=0.03`, persist lewat `persistConfigChange("management","gasReserve","gasReserve",target)` (F28 path). 20% and 0.005 SOL churn-guard (`:422`). **Kontrak**: 1-baris write back config otomatis — daily, sebelum komposisi briefing utk `gasReserve` up to date di cost section. Fail-open absolute.
4. **4 tracker persist + 1 transient-compute (pnl)**. (a) **gas-tracker.js** (`gas-log.json` 1507 entry, 30-Jun-to-7-Jul live, MAX_ENTRIES=5000, PRUNE_MS=40d `:19-20`): `recordGasFee` dari `tools/dlmm.js` trades-path post-confirm (`trackTxGas` retry-5-1500ms `:45-60`), `getGasStats(sinceMs)` return `{sol,byAction,count,firstTs,hasData}` `:67`. (b) **llm-cost-tracker.js** (`llm-cost-log.json` 4502 entry, MAX_ENTRIES=20000, PRUNE_MS=40d `:17-18`): `recordLlmCost` dari `agent.js` post-call utk tiap role (SCREENER/MANAGER/GENERAL) with model+cost+tokens; `getLlmCostStats(sinceMs)` return `{totalCost,totalTokens,calls,byRole,hasData}` `:54` — byRole labels `Screening`/`Management`/`General` (`:20` ROLE_LABEL) avoid String-key cross roles. (c) **sol-tracker.js** (`sol-balance-history.json` 28 day, KEEP_DAYS=35 `:30`, WIB_OFFSET_MS=7h `:28`): `recordSolBalance` piggyback tiap `getWalletBalances`, FIRST-valid-of-day baseline (`:62` — first observation baru-day wins, same-day skip); calendar 1D/7D/30D windows (NOT rolling) `:PERIODS`; `baselineFor(days,startKey)` exact/after/earliest partial `:91-100`; `setTrackStart`/`getTrackStart` user anchor date `trackStart` (`:118-141`) — live `trackStart=2026-06-24`. (d) **pnl-tracker.js** (`:78` pure NO-persist — window compute only): `getPnlTracker(perf,{solPriceUsd})` filter finite-pnl+closeTime>0, 3 windows 1D/7D/30D, `realized=sum(pnl_usd)`, gas real-capture-first else `trades × PER_TRADE_GAS_SOL` (GAS_EST_SOL deploy+close+swap `:31-32`), `llmUsd=getLlmCostStats`, `net=realized-costUsd`. **Isolation**: trackers tak filter `paper:true` sendiri — filter dilakukan pemanggil (briefing.js `keepMode` 9-point, F22 mode-scoped).
5. **buildCostSection 4-source-precedence + paper-isolation LLM-only-local** (`briefing.js:172-243`). Precedence harian: (1) LOCAL per-call `llmStats.byRole` (`getLlmCostStats`, true per-role) utk LLM + (2) gas real (`getGasStats.hasData`) else `estimateGasSol` (F24 fallback konstanta) utk gas. Paper-mode override (`:177-182`): `LLM = biaya nyata (tracking lokal)` ONLY — suppress `costData` OpenRouter feed (`:194` `else if (paper)` tak show 0 give-away). `gasIsEst` flag (`:212`) bila tak real. Cost-drag → `computeCostDragPct` F24 dari pemanggil (`:359`). `gasReserve runway` (`:216-225`): `dailyBurn=gasSol/windowDays`, `runwayDays=reserve/dailyBurn`, ⚠️ tipis bila `<7`, label `(auto-tune)` bila `gasReserveAutoTune`. Bottom line `Net − semua biaya` (`:230-233`): `netPnlUsd - totalCost = real` + verdict ✅profitbersih/🔴rugi. `OpenRouter credits` balance (`:236-238`) `<5 tipis`. Kontrak: 1 buku cost, 4 source, paper isolation strict (LLM local track isolated dari shared-account live feed), fail-open total (`:173` `if (!costData && !balance && !credits && !gasSol && !llmStats?.hasData) return null`).

## Progress
- [x] Spec F25 baca PLAN line 120 (⬛⬛ — analytics orchestrator + 4 cron + 4 tracker persist + cost-net + auto-tune gas persist)
- [x] Cross-ref F23 (skipReview consumer + getDeployedPoolAddresses), F22 (getModePerformance mode-scope, getHourlyProfile, getExcludedRacikanStats), F19 (paper:true source), F24 (reports pure-engine consumer), F26 (config management 5 key + reports 2 key + experiments), F28 (persistConfigChange auto-tune writer), F30 (Telegram greeting + REPL `/briefing` + `/report week|month|day`), F15 (counterfactual), F33 (openrouter-usage API + backtest)
- [x] Baca briefing.js full 1-557 (2 export + buildMilestoneReport + 6 helper + 10 import)
- [x] Baca index.js cron register 1250-1320 (5 task + PnL-poll + watchdog) + sendAndPinBriefing 213-226 + maybeFireLearningReport 234-249 + runBriefing 432-442 + maybeRunMissedBriefing 450-465 + runPeriodicBriefing 376-401 + maybeAutoTuneGasReserve 405-428
- [x] Baca gas-tracker.js full 1-79 (recordGasFee + trackTxGas retry + getGasStats hasData flag)
- [x] Baca llm-cost-tracker.js full 1-68 (recordLlmCost role-tagged + getLlmCostStats byRole labels)
- [x] Baca pnl-tracker.js full 1-78 (3-window getPnlTracker + PER_TRADE_GAS_SOL lifecycle fallback)
- [x] Baca sol-tracker.js 1-140 + 380-470 (WIB-calendar baseline + baselineFor partial + setTrackStart/getTrackStart anchor)
- [x] Verifikasi live data: gas-log.json 1507 entry (range 30-Jun→07-Jul, sample fee 0.00001 SOL), llm-cost-log.json 4502 entry (sample GENERAL google/gemini-2.5-flash $0.003438 11394 tokens), sol-balance-history.json 28 day / trackStart 2026-06-24, state.json `_lastBriefingDate=2026-07-07` / `_lastBriefingPinId=10596` / `_lastReportedMilestone=270` / `_lastBriefing_week`+`_lastBriefing_month` keys present, no `_lastPeriodicBriefing` flat key
- [x] Verifikasi consumers rg: `index.js:36` import 3, `:213` sendAndPinBriefing + `:234` maybeFire + `:301-303` /report week|month|day + `:390` sendAndPinBriefing periodic + `:438` sendAndPinBriefing morning + `:661` maybeFire hook + `:3091` /briefing telegram + `:3705` /briefing REPL; `openrouter-usage.js` balance/credits-paper-isolation via briefing:194/472 fallback; `preset-manager.js:174` formatIdentity; `views/trackers.js` renderPnlTracker/renderSolTracker (string-primitif)
- [x] Tulis §0 + §A-§H

---

## §0. Cara Kerja (Bahasa Awam)

**Analogi** (dua sudut pandang sehari-hari)
- *Manajer hotel 2 laporan harian + ringkatan minggu/bulan, dibantu 4 staf kasir*: tiap pagi 08:00 manajer hotel terima 2 buku: (1) **laporan harian** (tamu check-in/check-out semalam, pendapatan kamar, masalah, lesson), (2) **laporan minggu/bulan** (rekap performa periode panjang). 4 staf kasir bantu: staf 1 catat fee transaksi kartu asli tiap tamu (`gas-tracker`), staf 2 catat biaya chatting-with-AI tiap sesi konsierge (`llm-cost-tracker`), staf 3 catat saldo awal kamar WIB-calendar tiap pagi (`sol-tracker`), staf 4 cuma hitung ulang (realized-untung-bersih-after-biaya) tiap window 1D/7D/30D (`pnl-tracker` no-save). Manajer baca semua + dikombinasi jadi "laporan net — profit cukupi semua biaya?". Bila hari sibuk → laporkan di papan utama, pin di papan managers. Bila restart tiba-tiba → crony watchdog 6h cek "sudah kirim hari ini?", bila belum → kirim segera. Konsep sama: briefing = composer harian, periodic = digest window, trackers = 4 feed, sendAndPin = pin Telegram.
- *Tukang bangunan yang tanda milestone tiap 10 rumah + tukang gaji yang auto-atur budget borongan tiap pagi*: tukang A selesai 10 rumah → lapor "milestone! berikut evaluasi kualitas 10 rumah terakhir". Tukang B setiap pagi cek "berapa galon cat terpakai minggu ini? bila borongan > buffer 14 hari → naikkan budget cat supaya tak habis". Tukang B auto-tulis更新 di buku budget — tak perlu bos sentuh. Bila bos transisi `gasReserveAutoTune=ON` → tukang B aktif; OFF → budget cat statis. `bot`: `maybeFireLearningReport` = milestone tiap N close, `maybeAutoTuneGasReserve` = auto-write `gasReserve` cron pagi sebelum briefing. Kontrak: auto-tune persistConfigChange otomatis — satu-satunya config-write di cabang briefing.

**Di bot, ini = analytics orchestrator: briefing harian + periodic + milestone + 4 tracker persist + cost-net + paper-live isolation + auto-tune reserve** (1-2 kalimat)
`briefing.js` 2-export (`generateBriefing` harian + `generatePeriodicBriefing` window) panggil `reports.js` F24 + filter 9-point `keepMode` (mode-scoped paper/live). `buildMilestoneReport` utk tiap N closes. 4 tracker persist (`gas-log`/`llm-cost-log`/`sol-balance-history`) + 1 compute-only (`pnl-tracker` window net). `maybeAutoTuneGasReserve` cron-pagi-before-briefing auto-write `gasReserve` via `persistConfigChange` F28. 4 cron (`:1286-1307`) + watchdog missed-briefing + sendAndPin Telegram.

**Posisi fase ini di alur bot** (1 paragraf)
Datang SETELAH F24 (reports.js pure-engine — briefing consumer utama), SETELAH F22 (`getModePerformance` paper/live filter + `getHourlyProfile` time-profile, consumer-side), SETELAH F23 (`getSkipReview` counterfactual), SEBELUM F28 (auto-tune panggil `persistConfigChange` write ke user-config), PARALEL F30 (`sendAndPinBriefing` Telegram-side + `/briefing`/`/report week|month|day` REPL), PARALEL F33 (`openrouter-usage.js` account API). F25 = **Lapisan 7 (Analytics) orchestrator**: cron-driven → fetch state/lessons/tracker → start `buildTradeReport`/`buildScopeBlock` → compose cost/activity/learning/profile/skip-review sections → HTML → send + pin. Tanpa F25, bot jalan tapi pemilik tunjung — tak ada verdict konsisten tiap pagi, tak ada recall milestone N-close, tak ada cost-aware "apakah profit cukup biaya?", tak ada gas-reserve auto-tune.

**Langkah kerja** (urutan, pakai istilah teknis)
1. **Cron fire 01:00 UTC** (`briefingTask` `index.js:1286` wala `timezone:'UTC'`) → `runBriefing()` (`:432`).
2. **Pre-briefing auto-tune** (`:434`): `maybeAutoTuneGasReserve()` — gate `config.management.gasReserveAutoTune`, baca 7d `getGasStats`, ≥8 records, `dailyBurn`, `target=max(floor,dailyBurn×buffer)`, churn-guard (20% or 0.005 SOL), persist lewat `persistConfigChange` F28.
3. **Compose briefing** (`generateBriefing` `briefing.js:301`): load `state.json`+`lessons.json`, mode-filter `keepMode` (`:309` perf, `:311` position `paper_`-prefix), `last24h` window.
4. **Open wallet + openrouter fetch** (`:341-346`): `Promise.all` `getOpenRouter24hCost`+`getOpenRouterBalance`+`getOpenRouterCredits`+`getWalletBalances` (catch → null).
5. **Cost data assemble** (`:347-365`): `getGasStats(last24h)` real-first, fallback `estimateGasSol(countOnChainActions)` (F24) if no-real; `getLlmCostStats(last24h)` lokal-tracker first; `solPrice` from wallet; `computeCostDragPct` F24 hitung cost-drag → `quantOpts`.
6. **Sections build** (`:368-417`): activity counts (open/closed 24h), PnL+fees 24h (`pnl-tracker` `formatPnlTracker`), `buildScopeBlock(modePerf,"All-time (semua racikan)",{deep:allTimeDeep,quantOpts,recOpts})` BLOCK 1, `buildScopeBlock(racikanPerf,racikanLabel,{deep:true,quantOpts,recOpts})` BLOCK 2 (analisis-dalam difokus racikan aktif Opsi B), `racikanScopeDisclosure()` trade-outside-racikan warning, lessons 24h + config-change-count, open positions count, `buildFeatureStatus` (mode + experiments ON), `buildCostSection` (4-source + paper isolation + net-bottom-line), `buildLearningSection` (older lessons + last threshold + avg in-range all-time), `buildTimeProfileSection` (WIB fair-rank K=5), `buildSkipReviewSection` (counterfactual gated). Filter blank-line dari skipped-null sections.
7. **sendAndPinBriefing** (`index.js:213`): `sendHTML` → `pinMessage(msgId)` → `unpinMessage(prev)` → `setLastBriefingPinId`. Best-effort: failure logged, tak break send. `setLastBriefingDate()` persist date-key ke state.json.
8. **Periodic cron** Mon-01:30 UTC (`weeklyTask` `:1296`) / 1st-02:00 UTC (`monthlyTask` `:1301`) → `runPeriodicBriefing(period)` (`:376`) hitung key (isoWeek Monday / YYYY-MM), dedup `getLastPeriodicBriefing(period)===key` → skip bila already-sent, else `generatePeriodicBriefing(period)` compose, `sendAndPinBriefing`, `setLastPeriodicBriefing(period,key)`.
9. **Milestone report** di end-of-`runManagementCycle` (`:661`): `maybeFireLearningReport` cek `config.reports.learningReportEvery` (default 10, 0=off), `Math.floor(getModePerformance().length / every) × every` milestone, dedup `getLastReportedMilestone` (`state.json _lastReportedMilestone=270` live → 27 fires 10/20/.../270), `buildMilestoneReport(perf, milestone)` (`briefing.js:540` panggil `buildTradeReport` F24 dgn `trendN=config.reports.learningReportTrendN`default 10, identity full), `sendHTML`, `setLastReportedMilestone(milestone)`.
10. **Watchdog 6h** (`briefingWatchdog` `:1291`) → `maybeRunMissedBriefing` (`:450`): `lastSent=getLastBriefingDate()`, bila `lastSent!==todayUtc && UTC-hour≥1` → `runBriefing()` (catch restar-after-1AM-UTC bila cron missed).
11. **Tracker write path (real-time)**: gas `recordGasFee` dari `trackTxGas` post-deploy/close/claim/swap (`tools/dlmm.js` trades-path, retry-5-1500ms utk `connection.getTransaction(sig).meta.fee` lamports). LLM `recordLlmCost` dari `agent.js` post-call (`role`+`model`+`cost`+`tokens`). SOL `recordSolBalance` dari `getWalletBalances` tiap call (first-of-day-baseline). PnL-tracker no-write, pure compute.
12. **Tracker read path (briefing)**: `getGasStats(sinceMs)` (live 1507 records, sol/sum) + `getLlmCostStats(sinceMs)` (live 4502 record, totalCost/byRole/count/hasData) + `formatPnlTracker(modePerf,{solPriceUsd})` (compute realized-net-cost 1D/7D/30D) + `formatSolTracker` (F30 `/wallet`).
13. **Output**: HTML briefing Telegram pinned / HTML periodic weekly-monthly pinned / HTML milestone report send (no-pin) / tracker JSON persist (gas/llm/sol — pnl no-persist).

**Output analytics orchestrator**: HTML briefing harian + HTML periodic digest + HTML milestone report + 4 tracker JSON persist (gas/llm/sol-balance write real-time, pnl compute-only). Side-effect: `_lastBriefingDate`/`_lastBriefingPinId`/`_lastReportedMilestone`/`_lastBriefing_week`/`_lastBriefing_month` state.json write + `gasReserve` auto-persist (via F28 path). Trigger ke fase berikut: pemilik lihat verdict + recs di Telegram tiap pagi → manual tune `/setcfg` F30 / `persistConfigChange` write F28 / `applyPreset` F29.

**Kalau rusak / diskip** (2-3 kalimat, istilah teknis)
`briefing.js` throw umum → caught di `runBriefing`/`runPeriodicBriefing`/`maybeFireLearningReport` try-catch → log + skip send (fail-open). `sendHTML` reject (Telegram off/HTML parse) → tak persist `_lastBriefingDate` → watchdog next 6h coba ulang. `gas-log.json` corrupt → `getGasStats.load()` fallback `[]` (`gas-tracker.js:23`) → `hasData=false` → cost section pakai `estimateGasSol` konstanta (F24 fallback). `llm-cost-log.json` corrupt → `[]` → `hasData=false` → LLM `else if (paper)` show `$0.0000 (belum ada call)` else fallback ke OpenRouter account feed. `sol-balance-history.json` corrupt → `{days:{}}` → `formatSolTracker` return baseline-null (F30 /wallet kasih "no history"). `maybeFireLearningReport` throw → caught `index.js:247` log "Learning report failed (fail-open)" → tak break management cycle. `maybeAutoTuneGasReserve` throw → log `:428` → `gasReserve` tak di-update (manual tetap). Skip F25 = pemilik terjebak lihat portfolio mentah (`/positions`) tanpa verdict periodic utk tuning sadar.

**Istilah yang muncul di fase ini** (bullet, cuma yang baru)
- **generateBriefing** — `briefing.js:301`. Composer harian. 2 user-arg `allTimeDeep` — bila `/briefing alltime` deep ON blok All-time. Default shallow All-time + deep Racikan (Opsi B).
- **generatePeriodicBriefing(period)** — `:430`. Week/month/day composer. Periodic window + trend + cost + activity.
- **buildMilestoneReport(perf,milestone)** — `briefing.js:540`. Render milestone every-N closes via F24 `buildTradeReport`. Render di briefing.js (file aman), index.js tinggal orchestrate.
- **sendAndPinBriefing** — `index.js:213`. `sendHTML`+`pinMessage`+`unpinMessage(prev)`+`setLastBriefingPinId`. Best-effort.
- **maybeFireLearningReport** — `index.js:234`. Hook end-of-management-cycle. Dedup `getLastReportedMilestone`.
- **maybeRunMissedBriefing** — `index.js:450`. 6h cron. Restart-after-01-UTC catch-up.
- **maybeAutoTuneGasReserve** — `index.js:405`. Daily pre-briefing. ≥8 real records, buffer 14d, floor 0.03 SOL, churn-guard. Auto-write via F28.
- **startCronJobs** — `index.js:1250`. 7 task register (mgmt/screen/health/briefing/watchdog/weekly/monthly) + PnL-poll interval 3s.
- **countOnChainActions** — `briefing.js:71`. `./logs/actions-*.jsonl` parse, skip dry-run/paper. Gas estimate basis bila no real `gas-tracker`.
- **buildCostSection** — `:172`. 4-source (local_llm > gas-tracker > estimate > openrouter-account) + paper-only-local-LLM isolation + gasReserve runway + net-bottom-line.
- **buildScopeBlock** — `:50`. Deep vs non-deep compose. 2-mode: Opsi A deep-all / Opsi B deep-racikan-only.
- **buildSkipReviewSection** — `:276`. Experiment gated (counterfactualReview default OFF). `getSkipReview` + `getDeployedPoolAddresses` F23.
- **buildTimeProfileSection** — `:245`. WIB fair-rank K=5 mirror reports.js groupStats.
- **buildLearningSection** — `:103`. Older lessons + last threshold + avg in-range all-time. Mode-scope `keepMode`.
- **buildFeatureStatus** — `:154`. ON/OFF mode + experiments-alert.
- **racikanScopeDisclosure** — `:32`. Trade outside racikan warning. `getExcludedRacikanStats` F22.
- **keepMode** — 9-point filter (`:106`/`:309`/`:322`/`:327`/`:336`/`:441`/`:442`/`:444`/`:447`/`:525`): dry-run → sim-only, live → real-only. `keepModePos` check `paper_`-prefix untuk tracked positions (state.json rows tak tanggung `paper` flag).
- **gas-log.json** — `paths.gasLogPath`. 5000 cap, 40d prune. Live 1507 records.
- **llm-cost-log.json** — `paths.llmCostLogPath`. 20000 cap, 40d prune. Live 4502 records. Role-tagged.
- **sol-balance-history.json** — `paths.solBalanceHistoryPath`. 35d KEEP. WIB-calendar baseline. Live 28 days, trackStart anchor.
- **trackTxGas** — `gas-tracker.js:45`. Retry-5-1500ms fetch `meta.fee` lamports real on-chain. Fire-and-forget dari trades path.
- **getGasStats** — `gas-tracker.js:67`. `{sol, byAction, count, firstTs, hasData}`. hasData=false triggers estimate fallback.
- **getLlmCostStats** — `llm-cost-tracker.js:54`. `{totalCost, totalTokens, calls, byRole, hasData}`. Role labels friendly.
- **recordSolBalance** — `sol-tracker.js:62`. First-of-day-baseline. WIB calendar.
- **baselineFor** — `:91`. exact-day > after > earliest. partial-flag.
- **setTrackStart/getTrackStart** — `:118-141`. User anchor date `/wallet since YYYY-MM-DD`.
- **getPnlTracker** — `pnl-tracker.js:41`. 3-window realized-cost-net compute (NO-persist). PER_TRADE_GAS_SOL lifecycle fallback.
- **formatPnlTracker** — `:74`. Render `views/trackers.js`.
- **GAS_EST_SOL** — `reports.js:596` F24. konstanta imported di pnl-tracker untuk lifecycle fallback.
- **PER_TRADE_GAS_SOL** — `pnl-tracker.js:31`. deploy+close+swap sum.
- **_lastBriefingDate/_lastBriefingPinId/_lastReportedMilestone/_lastBriefing_week/_lastBriefing_month** — state.json dedup keys. kalau missed cron watchdog pulih via date-compare.
- **persistConfigChange("management","gasReserve","gasReserve",target)** — F28 write path. Auto-tune hanya write path di cabang briefing.
- **Opsi B** — analisis-dalam (verdict/quant/movement/breakdown/recs) difokus ke racikan aktif; All-time turun jadi stats saja (rekonsiliasi scope). Default `generateBriefing`. Opsi A (`allTimeDeep=true`) `verbal mode-all-deep`, `/briefing alltime`.

*Lewati §0 kalau sudah paham. Isi teknis mulai §A.*

---

## §A — Peta file fase ini

| File | Peran | Baris kunci |
|------|-------|-------------|
| `briefing.js` (557) | **2-export composer + 6 helper + milestone render**: orchestrator utama analytics | 1-21 imports (10 module); 24 section helper; 26 money; 32-38 racikanScopeDisclosure; 50-61 buildScopeBlock; 71-94 countOnChainActions (dry-run skip :88); 103-143 buildLearningSection; 154-168 buildFeatureStatus; 172-243 buildCostSection (4-source + paper isolation); 245-271 buildTimeProfileSection (WIB K=5); 276-299 buildSkipReviewSection (counterfactual gated); 301-421 generateBriefing; 430-532 generatePeriodicBriefing; 540-547 buildMilestoneReport; 549-556 loadJson |
| `index.js` (3906, hot file) | **7 cron register + sendAndPin + milestone + auto-tune + watchdog**: orchestration-side | 213-226 sendAndPinBriefing; 234-249 maybeFireLearningReport; 256-272 computeReportCostDrag; 301-303 /report week|month|day handler; 376-401 runPeriodicBriefing; 405-428 maybeAutoTuneGasReserve; 432-442 runBriefing; 450-465 maybeRunMissedBriefing; 466-490 stopCronJobs; 1250-1320 startCronJobs (mgmt + screen + health + briefing 01:00 UTC + watchdog 6h + weekly Mon-01:30 + monthly 1st-02:00 + PnL-poll interval); 661 maybeFireLearningReport hook end-management |
| `gas-tracker.js` (79) | **Real on-chain fee persist**: trade-path write + briefing read | 14-16 import fs/log/paths; 18 GAS_LOG; 19-20 MAX_ENTRIES=5000 + PRUNE_MS=40d; 22-27 load/save; 30-38 recordGasFee; 45-60 trackTxGas retry-5-1500ms fire-forget; 67-79 getGasStats {sol,byAction,count,firstTs,hasData} |
| `llm-cost-tracker.js` (68) | **Per-role LLM cost persist**: agent-loop write + briefing read | 12-14 imports; 16 LOG_FILE; 17-18 MAX 20000 + PRUNE 40d; 20 ROLE_LABEL; 22-27 load/save; 30-47 recordLlmCost (role+model+cost+tokens); 54-67 getLlmCostStats {totalCost,totalTokens,calls,byRole,hasData} |
| `pnl-tracker.js` (78) | **3-window realized-net compute** (NO-persist): lifecycle gas fallback | 18-21 imports; 23-27 PERIODS 1D/7D/30D; 31-32 PER_TRADE_GAS_SOL = deploy+close+swap; 41-66 getPnlTracker (realized + cost + net per window, real-gas-first else lifecycle); 74-78 formatPnlTracker |
| `sol-tracker.js` (394) | **WIB-calendar baseline persist + user anchor**: wallet piggyback + /wallet consume | 28 WIB_OFFSET_MS=7h; 30 KEEP_DAYS=35; 40-52 load/save; 56 wibDateKey; 62-78 recordSolBalance first-of-day; 91-100 baselineFor partial; 117-141 setTrackStart/getTrackStart; 142-end window growth compute |
| `openrouter-usage.js` (3453) | **OpenRouter account API**: balance/credits + usageDaily/Weekly/Monthly (account-shared, contaminated in paper) | getOpenRouterBalance + getOpenRouterCredits + getOpenRouter24hCost (provisioning key); fallback utk non-local LLM cost |
| `views/trackers.js` | **Render string-primitif**: renderPnlTracker/renderSolTracker tree-style | — |
| `views/format.js` | **tree/SEP primitif**: presenter murni | 143 SEP; 178 tree |
| `reports.js` | **F24 pure-engine consumer**: buildScopeBlock/panggil utama | F24 (13 export) |
| `lessons.js` | **F22 mode-scope source**: getModePerformance / getHourlyProfile / getExcludedRacikanStats | F22 |

---

## §B — Alur data hulu→hilir (ASCII diagram)

```
                    [4 Cron + 1 Watchdog + 1 Auto-tune + 1 Interval]
   01:00 UTC briefing  Mon-01:30 weekly  1st-02:00 monthly  */6h watchdog  pre-brief auto-tune  3s PnL poll
        │                  │                   │                   │              │                  │
        ▼                  ▼                   ▼                   ▼              ▼                  ▼
  runBriefing         runPeriodicBriefing("week")  runPeriodicBriefing("month") maybeRunMissed    maybeAutoTune     poll→updatePnlAndCheckExits
        │                  │                               ("week"|"month")                    │                  │
        │                  │                                   │                              │                  ▼
        ├─➜ maybeAutoTuneGasReserve()  ⚘  F28 persistConfigChange("management","gasReserve","gasReserve",target)
        │
        ▼
   generateBriefing() / generatePeriodicBriefing(period) / buildMilestoneReport(perf, milestone)
        │
        ├─ load state.json + lessons.json  (mode-filter 9-point keepMode F22 paper/live)
        ├─ Promise.all: getOpenRouter24hCost + getBalance + getCredits + getWalletBalances
        ├─ getGasStats(sinceMs) → hasData ? gasSol real : estimateGasSol(countOnChainActions)  (F24 fallback)
        ├─ getLlmCostStats(sinceMs) → hasData ? totalCost : (paper ? 0 : openrouter fallback)
        ├─ computeCostDragPct({costUsd, windowDays, modalUsd})  (F24)
        ├─ buildScopeBlock(modePerf, "All-time", {deep}) + buildScopeBlock(racikanPerf, racikanLabel, {deep:true})
        ├─ buildCostSection + buildFeatureStatus + buildLearningSection + buildTimeProfileSection + buildSkipReviewSection
        ├─ formatPnlTracker(modePerf,{solPriceUsd})  (3-window realized-net compute)
        └─ filter blank-line → HTML briefing
        │
        ▼
   sendAndPinBriefing(html)  →  sendHTML  →  pinMessage(new)  →  unpinMessage(prev)  →  setLastBriefingPinId
   + setLastBriefingDate()  (state.json persist, dedup watchdog/missed-briefing)

                  ──────────────────────────────────────────────

   [Tracker write paths — real-time]
   trades-path post-confirm → trackTxGas(connection, sig, action) → retry-5-1500ms → meta.fee → recordGasFee → gas-log.json
   agentLoop post-call      → recordLlmCost({role, model, cost, tokens})             → llm-cost-log.json
   getWalletBalances        → recordSolBalance(sol)   (first-of-day wins)            → sol-balance-history.json

   [Tracker read paths — briefing / periodic / report]
   getGasStats(sinceMs)        → {sol, byAction, count, firstTs, hasData}          (real-first fallback F24 estimate)
   getLlmCostStats(sinceMs)    → {totalCost, byRole, hasData}                       (local-first fallback paper-0 OR openrouter-account)
   getPnlTracker(perf,opts)    → [{label, realized, trades, gasUsd, llmUsd, costUsd, net, hasCost, gasIsEst}] × 3 windows  (NO-persist compute)
   formatSolTracker(sol)      → calendar baseline growth 1D/7D/30D + trackStart    (/wallet consume, F30)

   [Milestone path daily-cycle-end]
   runManagementCycle end (index.js:661) → maybeFireLearningReport → milestone counter via getModePerformance length → dedup getLastReportedMilestone → buildMilestoneReport(perf, milestone) → sendHTML (no-pin)
```

---

## §C — Sinkron: siapa-panggil-siapa

| Pemanggil (file:line) | Dipanggil (file:line) | Trigger | Data lewat | Fail-mode |
|---|---|---|---|---|
| index.js:1286 cron `briefingTask` | index.js:432 runBriefing | cron 01:00 UTC | — | try-catch log (`:442`) |
| index.js:434 runBriefing | index.js:405 maybeAutoTuneGasReserve | daily pre-brief | gate `gasReserveAutoTune` + ≥8 records | fail-open (`:428` log) |
| index.js:436 runBriefing | briefing.js:301 generateBriefing | compose | — | try-catch log |
| index.js:438 runBriefing | index.js:213 sendAndPinBriefing | Telegram send | HTML string | pin fail log (`:223`) |
| index.js:1291 cron `briefingWatchdog` | index.js:450 maybeRunMissedBriefing | cron 6h | date-compare via `getLastBriefingDate` | try silent |
| index.js:450-465 maybeRunMissedBriefing | index.js:432 runBriefing | missed-fire gate | `lastSent!==todayUtc && hour≥1` | caught downstream |
| index.js:1296 cron `weeklyTask` | index.js:376 runPeriodicBriefing("week") | cron Mon-01:30 UTC | isoWeekMonday-key dedup | try-catch (`:400`) |
| index.js:1301 cron `monthlyTask` | index.js:376 runPeriodicBriefing("month") | cron 1st-02:00 UTC | YYYY-MM dedup | try-catch |
| index.js:376-401 runPeriodicBriefing | briefing.js:430 generatePeriodicBriefing | period-key dedup | period="week"\|"month"\|"day" | try-catch |
| index.js:390 runPeriodicBriefing | index.js:213 sendAndPinBriefing | pin HTML | HTML string | pin fail log |
| index.js:661 runManagementCycle end | index.js:234 maybeFireLearningReport | every N closes (dedup `_lastReportedMilestone`) | `getModePerformance().length` | fail-open (`:247`) |
| index.js:242 maybeFireLearningReport | briefing.js:540 buildMilestoneReport | render | `perf, milestone` | sendHTML no-pin (`:243`) |
| index.js:244 maybeFireLearningReport | state.js setLastReportedMilestone | persist dedup | milestone int | — |
| briefing.js:51 buildScopeBlock | reports.js F24 (multiple) | compose render | `perf`, label, deep flag, quantOpts, recOpts | Empty → fallback |
| briefing.js:199 buildCostSection | reports.js F24 buildRoleCostLines | LLM per-role | `costData` (from `getOpenRouter24hCost`) | Null → skip role-lines |
| briefing.js:279 buildSkipReviewSection | candidate-memory.js F23 getSkipReview | experiment gated | `{deployedPoolAddresses, minMcapGainPct}` | try-catch (`:295`) |
| briefing.js:280 buildSkipReviewSection | pool-memory.js F23 getDeployedPoolAddresses | counterfactual | — | — |
| briefing.js:246 buildTimeProfileSection | lessons.js F22 getHourlyProfile | time-profile (mirror-groupStats K=5) | — | `!prof \|\| total<min_samples → null` (`:247`) |
| briefing.js:302 generateBriefing | state.js/ lessons.json (loadJson) | read | paths.statePath / lessonsPath | File-missing → `{}`/`{lessons:[],performance:[]}` (`:549` loadJson) |
| gas-tracker.js:30 recordGasFee | tools/dlmm.js trades-path post-confirm | fire-and-forget | `{action, sig, lamports}` | !Number.isFinite lamports → return |
| gas-tracker.js:45 trackTxGas | gas-tracker.js:30 recordGasFee | retry-5 loop | `connection.getTransaction(sig).meta.fee` | not-indexed → log skip |
| gas-tracker.js:67 getGasStats | briefing.js:347 / 461, index.js:263, pnl-tracker.js:52 | read | sinceMs | File-missing → `[]` (`:23`) |
| llm-cost-tracker.js:30 recordLlmCost | agent.js post-call | per-call | `{role, model, cost, tokens}` | try-catch fail-open (`:45`) |
| llm-cost-tracker.js:54 getLlmCostStats | briefing.js:354/468, pnl-tracker.js:60 | read | sinceMs | File-missing → `[]` (`:23`) |
| sol-tracker.js:62 recordSolBalance | tools/wallet.js getWalletBalances | piggyback tiap read | `sol` (Number finite >0) | try-catch (`:75`) |
| sol-tracker.js:91 baselineFor | views/trackers.js /wallet render | query | `days, startKey` | null bila empty (`:100`) |
| pnl-tracker.js:41 getPnlTracker | briefing.js:385/525 via formatPnlTracker | window compute | `perf, {solPriceUsd}` | try → "" (`:76`) |
| openrouter-usage.js F33 | briefing.js:341/456 | Promise.all fetch | balance + credits + 24h cost | catch → null |

---

## §D — Logika kunci per fungsi

### generateBriefing({allTimeDeep}) — briefing.js:301-421
- **Apa**: Composer harian. Load state+lessons, mode-filter, fetch cost data, compose 12 sections.
- **Kapan dipicu**: cron 01:00 UTC via `runBriefing` (`index.js:432`) + `/briefing` Telegram (`:3091`) + `/briefing` REPL (`:3705`) + missed-watchdog (`:450`).
- **Output**: HTML string 12-section.
- **Sinkron**: 2 buildScopeBlock (modePerf all-time + racikanPerf racikan-aktif Opsi B). `formatPnlTracker(modePerf,{solPriceUsd})` 3-window. `keepModePos` filter `paper_`-prefix kick (`:311`).
- **Fail-mode**: tracker missing → fallback konstanta estimate (F24 GAS_EST_SOL), `getLlmCostStats` hasData=false → fallback openrouter-account (non-paper). Section null → → skip blank-line (`:420` filter).
- **Kontrak Opsi B**: All-time non-deep (default), Racikan-aktif deep (analisis-dalam). `/briefing alltime` toggle `allTimeDeep=true` → All-time-deep-Opsi-A.
- **Bukti**: briefing.js:301-421.

### generatePeriodicBriefing(period) — briefing.js:430-532
- **Apa**: Composer day/week/month. Window perf + trend + cost + activity + featureStatus.
- **Kapan dipicu**: cron Mon-01:30 / 1st-02:00 / `/report week|month|day` F30 (`index.js:301-303`).
- **Output**: HTML string komposer-periodic.
- **Sinkron**: `getModePerformance().filter(window)` utk racikan-deep (Opsi B). `windowPerf` utk "Semua racikan" stats-only. `buildTradeReport` F24 utk full report.
- **Fail-mode**: try-catch di caller (`index.js:400` log).
- **Kontrak dedup**: weekly Monday-key `(getUTCDay()+6)%7` (`:381`), monthly `YYYY-MM` (`:379`).
- **Bukti**: briefing.js:430-532.

### maybeFireLearningReport — index.js:234-249
- **Apa**: Milestone render tiap N closes. Dedup counter `getLastReportedMilestone`.
- **Kapan dipicu**: hook end-of-`runManagementCycle` (`index.js:661`).
- **Output**: HTML send (no-pin), persist `_lastReportedMilestone` ke state.json.
- **Sinkron**: `getModePerformance()` F22 mode-scope (paper/live). `buildMilestoneReport` briefing.js:540 → `buildTradeReport` F24.
- **Fail-mode**: try-catch log "Learning report failed (fail-open)" (`:247`).
- **Kontrak**: `learningReportEvery=0` disable (`:237`). Live `_lastReportedMilestone=270` → 27 milestone-fired.
- **Bukti**: index.js:234-249.

### maybeAutoTuneGasReserve — index.js:405-428
- **Apa**: Daily pre-briefing auto-write `gasReserve` dari real 7d burn.
- **Kapan dipicu**: `runBriefing` (`:434`) sebelum `generateBriefing`.
- **Output**: `persistConfigChange("management","gasReserve","gasReserve",target)` (F28 path) + `sendMessage` Telegram notify.
- **Sinkron**: `getGasStats(7d)` (`:411`), ≥8 records (`:412`), `dailyBurn=stats.sol/spanDays`, `target=max(floor,dailyBurn×buffer)`, `gasReserveBufferDays=14`, `gasReserveFloorSol=0.03`, churn-guard 20% or 0.005 SOL (`:422`).
- **Fail-mode**: try-catch (`:428`) log + `gasReserve` untouched.
- **Kontrak**: 1-baris config write otomatis di cabang briefing — daily, tak sentuh中也其它 config. State-write-after daily, F28 paths.
- **Live**: `_lastBriefingDate=2026-07-07` terkini, IF `gasReserveAutoTune=true` aktif →larar daftar `gasReserve` history.
- **Bukti**: index.js:405-428.

### buildCostSection — briefing.js:172-243
- **Apa**: 4-source-precedence + paper-isolation LLM-only-local + gasReserve runway + net-bottom-line.
- **Kapan dipicu**: briefing + periodic-compose.
- **Output**: HTML section `💵 Costs` tree.
- **Sinkron**: Precedence: (1) `llmStats.hasData` (local) → per-role lines (`:191-193`); (2) `paper` fallback → `$0.0000 (belum ada call)` (`:194-195`); (3) `costData.calls>0` (openrouter) → `buildRoleCostLines` F24 (`:199-202`); (4) `costData.totalCost`/`balance.usageDaily` fallback (`:197`). Gas: real `getGasStats.hasData` first, else `estimateGasSol` (F24). `computeCostDragPct` (F24) from caller `costDragPct`. `gasReserve runway` (`:216-225`). Net-bottom-line (`:230-233`).
- **Fail-mode**: All-null `costData`+`balance`+`credits`+`gasSol`+`llmStats` → return null (`:173`).
- **Kontrak paper isolation**: `paper` mode → LLM = `🧪 simulasi` (`:178-182`), suppress openrouter-feed (`:194 else-if`), gas = simulation-flag (`:212-214`). Target Out: konsumen tak misread "LLM Gratis" saat dry-running.
- **Bukti**: briefing.js:172-243.

### countOnChainActions — briefing.js:71-94
- **Apa**: Parse `./logs/actions-*.jsonl` hitung on-chain-tool calls sukses sejak `sinceMs`, skip dry-run/paper.
- **Kapan dipicu**: bila `gas-tracker` no-real → `estimateGasSol(counts)` basis utk gas F24 fallback.
- **Output**: `{tool:count}` map (`deploy_position`/`close_position`/`claim_fees`/`swap_token`).
- **Sinkron**: ONCHAIN_TOOLS konstanta `:64`. Filename filter `actions-YYYY-MM-DD`.unkompliant → `slice(8,18)` extract date, compare. `r.dry_run || r.paper` skip (`:88`).
- **Fail-mode**: try-catch whole → `{}` empty (`:73` log `briefing_error`).
- **Bukti**: briefing.js:71-94.

### recordGasFee + trackTxGas — gas-tracker.js:30/45
- **Apa**: Real on-chain fee persist. `trackTxGas` fire-and-forget dari trades-path post-confirm.
- **Kapan dipicu**: tools/dlmm.js deploy/close/claim/swap success → call `trackTxGas`.
- **Output**: Push `{ts, action, sig, sol:lamports/1e9}` to gas-log.json. Prune 40d, cap 5000.
- **Sinkron**: `connection.getTransaction(sig, {commitment:'confirmed'})` → `meta.fee` lamports. Retry-5 ×1500ms (not-indexed lag).
- **Fail-mode**: !Number.isFinite lamports return; retry exhaust → log "fee not found" (`:56`); trackTxGas never throws.
- **Kontrak**: best-effort + never-block-trade. Gas capture bisa delayed realtime (retry-7.5s max).
- **Bukti**: gas-tracker.js:30/45.

### getGasStats — gas-tracker.js:67-79
- **Apa**: Real gas spent since `sinceMs`. `{sol, byAction, count, firstTs, hasData}`.
- **Kapan dipicu**: briefing.js `:347`/`461`, index.js `:263` computeReportCostDrag, pnl-tracker.js `:52`.
- **Output**: Stats objek.
- **Sinkron**: `hasData` flag triggers PEMANAIL fallback ke estimate F24 (`briefing.js:349 gasIsEst = !gasStatsW.hasData`).
- **Fail-mode**: Empty window → `{sol:0, ..., hasData:false}`.
- **Bukti**: gas-tracker.js:67-79; live 1507 records.

### recordLlmCost + getLlmCostStats — llm-cost-tracker.js:30/54
- **Apa**: Per-call LLM cost persist role-tagged. Read byRole.
- **Kapan dipicu**: `agent.js` post-call write. Briefing read via `getLlmCostStats`.
- **Output**: Push `{ts, role, model, cost, tokens}`, 20000 cap, 40d prune. Read `{totalCost, totalTokens, calls, byRole:{Screening/Management/General:{cost,tokens,calls}}, hasData}`.
- **Sinkron**: ROLE_LABEL map string-key → friendly label (`:20`).
- **Fail-mode**: recordLlmCost try-catch (`:45`). getLlmCostStats load-miss → `[]` → hasData=false.
- **Kontrak paper isolation**: LLM tracker LOCAL-only → tak shared dengan live bot (unlike openrouter account feed). Account feed shared-contaminated → paper mode suppress account `:194 else-if(paper) LLM=$0.0000`.
- **Live**: 4502 records, sample GENERAL google/gemini-2.5-flash $0.0034 11394 tokens.
- **Bukti**: llm-cost-tracker.js:30/54.

### recordSolBalance + baselineFor — sol-tracker.js:62/91
- **Apa**: WIB-calendar baseline first-of-day-wins. window growth 1D/7D/30D. user `trackStart` anchor.
- **Kapan dipicu**: `getWalletBalances` post-read piggyback (`recordSolBalance` sol finite >0 ke file).
- **Output**: state-snapshot `days[YYYY-MM-DD] = sol` baseline; prune 35d.
- **Sinkron**: `wibDateKey` `WIB_OFFSET_MS=7h` convert. `recordSolBalance` first-of-day wins (`:65` if-exists-return). `baselineFor` exact-day > after > earliest partial-flag (`:91-100`). `setTrackStart`/`getTrackStart` user anchor YYYY-MM-DD (`:118-141`) stored in-file alongside `days`.
- **Fail-mode**: recordSolBalance `.isFinite≤0` return; try-catch (`:75`). baselineFor null bila empty.
- **Kontrak calendar**: NOT-rolling — 1D = today-only, 7D = last 7 cal days, 30D = last 30 cal days. First-observation-of-day = baseline-of-day.
- **Live**: 28 days, trackStart=2026-06-24, sample day 2026-06-11=0.428501.
- **Bukti**: sol-tracker.js:62/91.

### getPnlTracker (compute-only) — pnl-tracker.js:41-66
- **Apa**: 3-window realized+cost+net compute. NO persist.
- **Kapan dipicu**: `formatPnlTracker` (`:74`) called briefing.js `:385`/`:525`.
- **Output**: `[{label, realized, trades, gasUsd, llmUsd, costUsd, net, hasCost, gasIsEst}]` × 3.
- **Sinkron**: `realized=sum(pnl_usd)` finite+closeTime>0. Gas: `getGasStats.hasData` first → real gasSol; else `trades × PER_TRADE_GAS_SOL` (GAS_EST_SOL F24 deploy+close+swap `:31-32`). LLM: `getLlmCostStats` (`:60`). `net=realized-costUsd`.
- **Fail-mode**: try → "" (`:76` formatPnlTracker).
- **Kontrak**: Display-only sibling of sol-tracker — realized-PnL as flow (cumulative), NOT balance-diff.
- **Bukti**: pnl-tracker.js:41-66.

---

## §E — Temuan: bug / gap / kontrak-kunci / fail-open tak-terpenuhi

### E.1 — `_lastPeriodicBriefing` state.json flat-key hilang; keys individual `_lastBriefing_week`/`_lastBriefing_month` digunakan (inkonsisten dengan `getLastPeriodicBriefing` signature)
**Lokasi**: state.json + `setLastPeriodicBriefing`/`getLastPeriodicBriefing` (state.js).
**Temuan**: Live state.json keys: `_lastBriefing_week`, `_lastBriefing_month` (individual keyed dengan suffix `_period`). Tetapi `briefing.js` + `runPeriodicBriefing` (`index.js:376-401`) panggil `getLastPeriodicBriefing(period)` / `setLastPeriodicBriefing(period, key)` — interface idea "1-key holder". Test: `_lastPeriodicBriefing: undefined` (top-level key tak ada), tapi `_lastBriefing_week`/`_month` hadir. **Berarti** implementation state.js guna `${prefix}_${period}` template — bukan 1-key holder obj. Inkonsisten dengan komentar `briefing.js` "Deduped by period key in state.json." (CLAUDE.md). **TAPI** — functional OK (key terpisah), cuma dokumentasi interface mengomong "1-key". Bila user inspect state.json → bingung cari `_lastPeriodicBriefing`. **Low-cosmetic-dokumentasi**. Bisa clarify via state.js comment "Use `_lastBriefing_<period>` keys (per-period dedup, not single object). Sisa current-spec memiliki internal inconsistency.

### E.2 — `maybeAutoTuneGasReserve` flush `persistConfigChange` TAPI live `config` singleton tak re-loaded — next-briefing cycle render `gasReserve` old value
**Lokasi**: index.js:405-428 + config.js `persistConfigChange` F28.
**Temuan**: `maybeAutoTuneGasReserve` call `persistConfigChange("management","gasReserve","gasReserve",target)` — F28 write-back ke user-config.json. **TAPI** live `config.management.gasReserve` singleton di memory tetap OLD value sampai next `reloadScreeningThresholds` (F28) atau restart. Cron next-day recompute baca `config.management.gasReserve` OLD → `dailyBurn × buffer` bisa over/under adjust dari baseline-OLD bukan target-baru. **Ekses**: kalau auto-tune naik `0.5 → 0.7`, next-day compute bandingkan `Math.abs(target-new - 0.5) / max(0.5,0.001)` (target-old fallback) bukan `0.7`. Churn-guard threshold 20% menumpuk dari baseline OLD bila `persistConfigChange` tak mutasi singleton. **Bergantung pada F28 kontrak** — bila `persistConfigChange` mutate `config.management.gasReserve` ON-SITE (live), OK. Klarifikasi di F28: `persistConfigChange` mutasi live OR write-only? CLAUDE.md F28 spec "Updates the live config object immediately + persists to user-config.json" → SHOULD update — bila benar, Ekses tumpu saudara. **WORTH AUDIT F28 priority.** Kontrak cross-F28 invariant.

### E.3 — `countOnChainActions` hardcode `./logs` path (RELATIF CWD) — inkonsisten dgn `paths.js` abstracted tracking
**Lokasi**: briefing.js:74.
**Temuan**: `const dir = "./logs"` hardcoded. Path resolve mengikuti `process.cwd()`. Bila pm2 start dari direktori lain atau `paths.dataDir` diset per-profil (F29 addprofil paths.js), `./logs` tetap relatif CWD → tak tersegrusi per-profil. Tracker lain (`gas-log`/`llm-cost-log`/`sol-balance`) sudah lewat `paths.*` (F29). **Inconsistency**: `actions-*.jsonl` (file logged oleh `logger.js`) jarang dilihat user, tapi gas estimate bila no-real rely this. Bila `process.cwd()` ≠ repo root → briefing gas estimate baca file salah (kemungkinan file missing → `{}` kosong → `estimateGasSol(0)` → 0 SOL → "no gas spent today" misleading). **Low-medium impact** kalau multi-profil deploy. Fix: `paths.logsDir` resolve per-profil, mirror pola tracker. **Cross-F29** (paths adoption)的认知点.

### E.4 — period "day" route `runPeriodicBriefing("day")` via `/report day` JALAN tapi `cron` tak scheduled utk day (no cron `"day"`)
**Lokasi**: index.js:301-303 redirect + `index.js:1301` schedule only weekly/monthly.
**Temuan**: `/report day` panggil `runPeriodicBriefing("day")` — check `generatePeriodicBriefing("day")` (`briefing.js:430`) period handler (`days=1` `:431`), compose daily. **TAPI** `_lastBriefing_day` dedup key persist lewat `setLastPeriodicBriefing("day", key)` — bila seterus hari via REPL `/report day`, next-day `/report day` hari terbaru dedup-checker pulih (`getLastPeriodicBriefing("day") === todayIsoKey`) → bila sama, SKIP send. **Bug**: `/report day` hari sama 2x → kali ke-2 skip "sudah dikirim hari ini". Bila user expect on-demand report "paksya tampilkan" → skip tak terduga. Sementara `/report` tanpa arg (active racikan, no dedup) tak skip. **Asimetri dedup**: `day` period tetap di-dedup padahal tak cron-driven. **Low-impact**: user bingung "kok /report day tak muncul lagi padahal saya /kirim". Fix: period-key for "day" hari berubah tiap day, bila user klik dlm hari sama 2x → skip-by-dedup. Kontrak on-demand vs cron-driven dedup tumpang-tindih. **Behavior-cosmetic-bug**.

### E.5 — `formatSolTracker` tak dipanggil briefing — cuma `/wallet` F30; briefing bawa pnl-tracker + sol-tracker cuma untuk `solPrice` (impact tracker ekspos terbatas)
**Lokasi**: briefing.js:385 `formatPnlTracker`, no `formatSolTracker` call. index.js:3211 `formatSolTracker(wallet.sol)` `/wallet`.
**Temuan**: Briefing render realized-net (pnl-tracker), NOT raw-sol-growth (sol-tracker). Sol-tracker书院 only `/wallet`. Emosi good — realized-PnL is what matters in briefing, sol-tracker is wallet-EOD-check. TAPI `config.solMode`-aware presentasi (◎ vs $) di `/wallet`, briefing hardcode `$` (`:money` `:26`). **Asimetri display-currency**: briefing bypass `solMode`, tetap USD `($)` even when `solMode=true`. Bila user `solMode=true` (CLAUDE.md format.js `curSym`) → briefing tak konsisten. **Low-cosmetic** tapi inkonsisten dengan format.js `curSym` governing rule.

### E.6 — `racikanScopeDisclosure` panggil `getExcludedRacikanStats` tiap briefing (re-compute perf filter) — bobot briefing cycle
**Lokasi**: briefing.js:32-38.
**Temuan**: `getExcludedRacikanStats()` iterate filter-all-perf again per briefing — duplicate work dari `getModePerformance()` yang sudah dilakukan (`:337`). Sebenarnya grouping: `modePerf` filter sekali (`:336`), `racikanPerf = getModePerformance()` lagi (`:337`), `racikanScopeDisclosure → getExcludedRacikanStats()` iterate lagi (`:34` filter kebal-additive). **3-pass filter** atas lessons.performance utk briefing-pagi. Kalau 366 record → OK. Kalau 5000+ record → late-cycle. **Low-perf** tapi design-asymmetry — aggregable `getModePerformance` + `getExcludedRacikanStats` bisa return both dalam 1 pass. Optimization future, not bug.

### E.7 — `maybeRunMissedBriefing` fail-open绝对 TAPI tak log "watchdog skip di-OK" bila `lastSent===today`
**Lokasi**: index.js:450-465.
**Temuan**: Watchdog `0 */6 * * *` fire tiap 6 jam. Body check `lastSent === todayUtc` → `return` silent; `nowUtc.getUTCHours() < 1` → `return` silent. Hanya log "Missed briefing detected" bila tidak-skip. **Ekses**: log tak ada "watchdog ran, today OK" → user tak tahu jika watchdog alive. **Cosmetic-transparent**: watchdog silent = healthy. Tapi debugging "cron 6h jalan?" — bila tak log → user bingung. **Low-impact-observability**. Fix: `log("cron", "Briefing watchdog: already sent today")` bila skip. Optional.

### E.8 — `trackStart` validation gap: user bisa anchor ke tanggal MASA LALU pre-tracker-start; baseline fall-back "earliest snapshot" tapi partial=true flag
**Lokasi**: sol-tracker.js:91-100 `baselineFor` + `setTrackStart` `:118-141`.
**Temuan**: `setTrackStart(dateKey)` validate `format YYYY-MM-DD` + parse + `dateKey <= wibDateKey()` (tak boleh future) — tahun berapa pun lalu valid. `baselineFor(dateKey)` bila tak ada exact-day → fallback after/earliest partial-flag. Bila user `/wallet since 2024-01-01` tetapi tracker baru mulai 2026-06-10 → baseline = 2026-06-10 (earliest) dengan `partial=true`. Render label "SINCE <2024-01-01>" + baseline-2026-01-10. User bingung "tanggal yang saya pilih 2024 tapi baseline 2026?" — kondisi partial-flag terlihat di render mungkin `(partial)` note. Bila render tak tampak partial → user salah-baca growth. Worth verify di render /wallet F30. **User-facing-caveat**, fallback-mode tak destruktif tapi misleading bila partial-label lemah. **Cosmetic-clarity**.

### E.9 — `keepModePos` (`paper_`-prefix) fragile assumption — state.js rows tak tanggung `paper:true` tag, rely String-prefix synthetic id
**Lokasi**: briefing.js:311-314 + state.js `trackPosition`.
**Temuan**: `keepModePos` cek `String(p.position).startsWith("paper_")` utk filter tracked positions di paper-mode (live → exclude paper; paper → include paper). **Asumsi**: paper position synthetic id selalu prefix `paper_` (F13 paper-trading contract). Bila F13/F32 ganti konvensi naming → filter pecah. Tapi kontrak F13 CLAUDE.md eksplisit "synthetic `paper_…` id" → kontrak-documentary. **Bukan-bug-as-of-now**, tapi design-asymmetry dgn performance records yang properly tagged `paper:true` boolean field. Konsolidasi: bila state.js record pakai `paper:true` flag juga (sama dgn perf) → filter konsisten `keepMode(p)` sama-sama. **Tech-debt-future-alignment** — F13/F32 cross-sync.

### E.10 — 4 cron tasks register BILA `telegramEnabled()` false → briefing compose + send PIN gagal tapi cron tetap fire — wasted cycle
**Lokasi**: index.js:1286-1307 + runBriefing/`runPeriodicBriefing`.
**Temuan**: cron schedule fire tiap 01:00 / Mon-01:30 / 1st-02:00 / 6h-watchdog unconditional. Bila Telegram OFF (`telegramEnabled()` false), `runBriefing` tetap `maybeAutoTuneGasReserve` + `generateBriefing` (compose HTML) → `sendAndPinBriefing` skip send (guarded `:438 if (telegramEnabled())`) → wasted compose + state.json `_lastBriefingDate=??`. Actually `setLastBriefingDate()` di `:440` di-luar guard → persist date-key WALAUPUN tak send. Watchdog next 6h check `lastSent===today` === true → skip re-send (but no message sent ever). **Ekses**: update `_lastBriefingDate` without actual send → watchdog deceived "sudah terkirim". Bila Telegram nyalakan kemudian → watchdog tak re-send (date marked). **Medium-bug-bila-Telegram-toggling**: user start bot Telegram-off, then enable Telegram → morning briefing tak terkirim hari itu (watchdog deceived). Fix: `_lastBriefingDate` persist hanya after sendHTML success OR guard compose behind `telegramEnabled`. **Worth-fix**.

### E.11 — `buildTimeProfileSection` K=5 hardcode mirror reports.js SHRINK_K, tak import shared konstanta
**Lokasi**: briefing.js:258 `const K = 5;` vs reports.js:231 `const SHRINK_K = 5;`.
**Temuan**: Kedua konstanta value 5 (mirror equity-N-fair). Bila F24 SHRINK_K evolves (mis F20 autotune ke K=7) → briefing time-profile-fair-rank tak sinkron. **Hardcode-duplication** classicoooooooo. **Low** — K=5 empirically-stable, tapi future-drift potential. Fix: export `SHRINK_K` from reports.js, import di briefing.js. **Tech-debt-trivial**.

---

## §F — Glosarium istilah fase

- **generateBriefing** — `briefing.js:301`. Composer harian 2-scope (Opsi B).
- **generatePeriodicBriefing(period)** — `briefing.js:430`. Window week/month/day composer.
- **buildMilestoneReport** — `briefing.js:540`. Render-day-after-N-closes (render diekstrak dari index ke briefing).
- **sendAndPinBriefing** — `index.js:213`. Pin-new + unpin-prev Telegram cycle.
- **maybeFireLearningReport** — `index.js:234`. End-of-management milestone trigger.
- **maybeRunMissedBriefing** — `index.js:450`. Watchdog 6h catch-up.
- **maybeAutoTuneGasReserve** — `index.js:405`. Auto-write reserve daily pre-brief.
- **startCronJobs** — `index.js:1250`. 7 cron + 1 interval register.
- **countOnChainActions** — `briefing.js:71`. `actions-*.jsonl` parser, skip dry/paper.
- **buildCostSection** — `briefing.js:172`. 4-source + paper isolation + net-bottom-line.
- **buildScopeBlock** — `briefing.js:50`. Deep vs non-deep block composer.
- **buildSkipReviewSection** — `briefing.js:276`. counterfactual experiment gated.
- **buildTimeProfileSection** — `briefing.js:245`. WIB session fair-rank.
- **buildLearningSection** — `briefing.js:103`. Older lessons + threshold + avg in-range.
- **buildFeatureStatus** — `briefing.js:154`. ON/OFF mode + experiments-alert.
- **racikanScopeDisclosure** — `briefing.js:32`. Trade outside racikan warning.
- **keepMode** — 9-point filter paper/live isolation.
- **keepModePos** — paper-position filter via `paper_`-prefix synthetic id.
- **gas-log.json** — `paths.gasLogPath`. Real on-chain fee log. 5000 cap, 40d prune.
- **llm-cost-log.json** — `paths.llmCostLogPath`. Per-role LLM cost log. 20000 cap, 40d prune.
- **sol-balance-history.json** — `paths.solBalanceHistoryPath`. WIB calendar baseline. 35d KEEP.
- **trackTxGas** — `gas-tracker.js:45`. Retry-5-1500ms fetch meta.fee, fire-and-forget.
- **getGasStats** — `gas-tracker.js:67`. `{sol, byAction, count, firstTs, hasData}`.
- **getLlmCostStats** — `llm-cost-tracker.js:54`. `{totalCost, byRole, hasData}`.
- **recordSolBalance** — `sol-tracker.js:62`. First-of-day WIB-calendar baseline.
- **baselineFor** — `sol-tracker.js:91`. exact/after/earliest partial-fall-back.
- **setTrackStart** — `sol-tracker.js:118`. User anchor YYYY-MM-DD utk /wallet SINCE row.
- **getPnlTracker** — `pnl-tracker.js:41`. 3-window realized-cost-net compute (NO-persist).
- **PER_TRADE_GAS_SOL** — `pnl-tracker.js:31`. GAS_EST_SOL deploy+close+swap lifecycle fallback.
- **_lastBriefingDate/_lastBriefingPinId/_lastReportedMilestone/_lastBriefing_week/_lastBriefing_month** — state.json dedup keys.
- **persistConfigChange** — F28. Live-mutation + persist user-config.json.
- **Opsi B** — analisis-dalam ke racikan aktif (default briefing). All-time stats-only.
- **Opsi A** — `allTimeDeep=true`, `/briefing alltime`. All-time deep verbose.
- **cost-drag** — annualized cost/modal ratio. Ambang sehat <20%.

---

## §G — Link fase lain (cross-ref)

- **F23** (memory stores): `buildSkipReviewSection` panggil `getSkipReview` candidate-memory + `getDeployedPoolAddresses` pool-memory (F23 cross-store). `recordPositionSnapshot` snapshot manager-cycle → tracker cumulative. `racikanScopeDisclosure` via `getExcludedRacikanStats` F22 baca perf—no direct F23.
- **F22** (lessons.js mode-scope): `getModePerformance` / `getExcludedRacikanStats` / `getHourlyProfile` — 3 read path dari briefing. Tracker isolation (paper/live) di sisi pemanggil (briefer `keepMode` 9-point), tracker sendiri tak filter.
- **F19** (recordPerformance source): `performance[]` lessons.json = input all compose. `paper:true` tag → `keepMode` filter pemanggil. `recordPoolDeploy` dipicu post-close briefs tak check.
- **F24** (reports.js pure-engine): `buildScopeBlock` + `buildTradeReport` consumer utama. `computeTradeStats` + 11 fn. Cost helpers `computeCostDragPct`/`estimateGasSol`/`buildRoleCostLines`. Pure-function kontrak preserved — briefing pass already-filtered perf.
- **F26** (config): `config.management.{gasReserve, gasReserveAutoTune, gasReserveBufferDays, gasReserveFloorSol, autoSwapAfterClaim}` + `config.reports.{learningReportEvery, learningReportTrendN}` + `config.experiments.{counterfactualReview, counterfactualMinMcapGainPct}` + `config.pnl.pollIntervalSec` — 4 section cross-cut briefing reads.
- **F28** (update_config path): `persistConfigChange("management","gasReserve","gasReserve",target)` hanya write path di cabang briefing (`maybeAutoTuneGasReserve`). Kontrak: live-mutation + persist. E.2 cross-verify.
- **F30** (Telegram): `sendAndPinBriefing` via `sendHTML` + `pinMessage`/`unpinMessage`. `/briefing` + `/briefing alltime` Telegram+REPL. `/report week|month|day` -> `runPeriodicBriefing`. `/wallet` render `formatSolTracker`.
- **F15** (candidate-memory): `getSkipReview` counterfactual read. `buildSkipReviewSection` gated `config.experiments.counterfactualReview`.
- **F20** (evolveThresholds): milestone counter `getModePerformance().length` — same-scope paper/live mode. F20 defiance (84 record lama campur) affect milestone count too.
- **F33** (openrouter-usage): account API fallback. Paper-isolation suppress account feed (LLM local-only).
- **F29** (paths): tracker paths via `paths.*` 4-store. `actions-*.jsonl` hardcoded `./logs` (E.3) inconsistency.

---

## §H — Open-Q (bawa ke fase F26, F28, F30, F33)

1. **E.2 persistConfigChange singleton mutation**: `maybeAutoTuneGasReserve` rely F28 hubung live-mutation. Bila `persistConfigChange` write-only tanpa mutasi `config.management.gasReserve` → churn-guard baseline stale. **Verify F28 audit** priority.
2. **E.3 hardcoded `./logs`**: bila multi-profil F29 → `countOnChainActions` baca file salah. Fix `paths.logsDir` resolve. **Cross-F29 paths consistency** audit.
3. **E.4 `/report day` dedup**: user klik 2x hari sama → skip. Bisa mis-classify `day` period as cron-driven or on-demand hanya. **Cross-F30** `/report` command contract.
4. **E.10 Telegram-toggle gap**: persist `_lastBriefingDate` tanpa actual send → watchdog deceived. Fix: guard persist after `sendHTML` success OR guard compose behind `telegramEnabled`. **Worth-fix**. Kontrak on-demand briefing integrity.
5. **E.5 solMode bypass**: briefing hardcode `$`. Bila `solMode=true` → presentasi inkonsisten dgn format.js `curSym`. **Cross-F26** (config solMode) + format.js governing-rule audit.
6. **E.11 SHRINK_K hardcode duplicate**: bila F24 evolves K → briefing drift. Export shared-from-reports, import briefing. **Tech-debt-trivial**.
7. **E.8 trackStart partial-flag render**: `/wallet since 2024` baseline fall-back earliest → verify F30 render tampilkan "partial" label supaya user tak salah-baca. **Cross-F30** render audit.
8. **E.9 `keepModePos` `paper_`-prefix**: fragile assumption. Worth align state.js records pakai `paper:true` flag seperti performance records. **Cross-F13/F32** paper audit.
9. **E.1 `_lastBriefing_week/_month` vs `_lastPeriodicBriefing` interface-name**: state.js implementation pakai per-period keys tapi briefing.js interface idea "1-key holder". Clarify doc-comment in state.js. **Cross-F17** state registry audit.
10. **OpenRouter paper-contamination fallback**: bila `llm-cost-tracker` belum punya data (fris bot fresh) → fallback openrouter-account (account-shared dalam paper). Ekses display bila paper mode + belum ada local → `$0.0000` label krn paper suppress feed — TAPI if user toggle paper→live, first-day live bila local empty → fallback ke account-feed contaminated paper calls. **Edge-case scenario**. Worth audit F33 boundary.