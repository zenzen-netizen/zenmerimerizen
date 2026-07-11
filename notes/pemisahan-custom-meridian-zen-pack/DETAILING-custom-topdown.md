# DETAILING CUSTOM — meridian-zen-pack (top-down, urut eksekusi)

> Peta lengkap custom-meridian: apa, di mana, fungsi apa, fase ekstrak.
> Format per-kategori: 2 lapis **[AWAM]** (bahasa awam, fungsi + cara kerja) + **[TEKNIS]** (file, ekspor, integration, config, fase).
> Urutan = urutan eksekusi Fase 2 (risiko kecil → besar).
> Pasangan: `RENCANA-teknis-pemisahan-custom.md` (arsitektur), `PANDUAN-awam-pemisahan-custom.md` (glosarium).

Dibuat: 2026-07-07
Total custom: 172 file berubah, +33,392 / -1,547 baris, 516 commit.

---

## Kategori 1 — Logging & audit trail

**[AWAM] Fungsi untuk apa:**
Sistem pencatatan kejadian bot. Yunus punya logger dasar ( tulis ke file log harian). Custom-mu nambah **audit trail** = jejak keputusan bot yang bisa dibaca balik. Bayangkan log biasa = diary bot ("jam 10 screening jalan"), audit trail = dossier keputusan ("jam 10 bot lewati pool X karena RSI terlalu tinggi, score 0.3").

**[AWAM] Kenapa custom-mu beda:**
Yunus log teknis buat debugging. Custom-mu log keputusan strategis buat review belajar. Beda level — log yunus buat "kenapa crash?", audit-mu buat "kenapa skip pool yang ternyata naik 5x?".

**[TEKNIS] File semayam:**
- `logger.js` (MOD, +4) — minor, audit hook
- `decision-log.js` (NEW, +68) — appendDecision, getRecentDecisions, getDecisionSummary

**[TEKNIS] Fungsi baru diekspor:**
- `appendDecision(entry)` — catat 1 keputusan (skip/deploy/close) + alasan
- `getRecentDecisions(limit)` — ambil N keputusan terakhir
- `getDecisionSummary(limit)` — ringkasan untuk prompt SCREENER

**[TEKNIS] Integration point di core:**
- `index.js`: `runScreeningCycle` skip path → `appendDecision({action:"skip", reason})`
- `index.js`: market regime gate skip → `appendDecision`
- `prompt.js`: SCREENER → inject `getDecisionSummary()` jadi baris "recent decisions"

**[TEKNIS] Fase ekstrak:** 1 (paling kecil, ~72 baris total)
**[TEKNIS] Manifest entry:** 2 modul, 1 patch anchor (logger audit hook)

---

## Kategori 2 — Safety & enkripsi

**[AWAM] Fungsi untuk apa:**
Lapis keamanan. 3 sub-sistem: (1) **envcrypt** = enkripsi private key wallet biar tidak plain-text di file `.env`, (2) **dev-blocklist** = daftar hitam developer token scam, bot tolak pool dari developer ini, (3) **market regime gate** = kalau SOL jatuh >X% dalam 24 jam, bot stop screening (pasar badai, jangan masuk).

**[AWAM] Kenapa custom-mu beda:**
Yunus simpan private key plain-text di `.env` = riskan kalau server bocor. Custom-mu enkripsi pakai file kunci terpisah (`envcrypt.js`). Dev-blocklist = filter sosial (developer token nakal), yunus tidak punya. Regime gate = filter makro (kondisi pasar), yunus tidak punya.

**[TEKNIS] File semayam:**
- `envcrypt.js` (NEW, +128) — envryptEncrypt, envryptDecrypt, loadEnv
- `scripts/envrypt.js` (NEW, +34) — CLI helper enkripsi
- `dev-blocklist.js` (NEW, +66) — isDevBlocked, getBlockedDevs, blockDev
- `tools/wallet.js` (MOD, +238) — getSolMarketRegime, quoteSellPriceImpact, swapBaseToSolWithRetry
- `tools/executor.js` (MOD, +807) — safety checks custom, exitLiquidityCheck gate

**[TEKNIS] Fungsi baru diekspor:**
- `envryptEncrypt/Decrypt(value, key)`, `loadEnv({envPath, keyPath, override})` (envcrypt)
- `isDevBlocked(wallet)`, `getBlockedDevs()`, `blockDev({wallet, reason, label})` (dev-blocklist)
- `getSolMarketRegime()` — baca SOL 24h change via Jupiter price v3
- `quoteSellPriceImpact({baseMint, solNotional})` — estimasi slippage keluar pool
- `swapBaseToSolWithRetry({base_mint, attempts, backoffMs})` — swap retry dengan backoff

**[TEKNIS] Integration point di core:**
- `index.js:1` — `import "./envcrypt.js"` (side-effect, load env sebelum config)
- `index.js`: `runScreeningCycle` hard-guard → `getSolMarketRegime()`, skip kalau drop > limit
- `tools/executor.js`: `runSafetyChecks` deploy_position → exitLiquidityCheck (probe slippage), `isDevBlocked`
- `tools/definitions.js`: tools baru `block_deployer`, `unblock_deployer`, `list_blocked_deployers`

**[TEKNIS] Config keys:**
- `experiments.exitLiquidityCheck`, `experiments.exitLiquidityMaxSlippagePct`
- `experiments.marketRegimeGate`, `experiments.marketRegimeMaxDrop24hPct`

**[TEKNIS] Fase ekstrak:** 1 (envcrypt) + 2 (sisanya, butuh call site)
**[TEKNIS] Manifest entry:** 4 modul, 3 patch anchor

---

## Kategori 3 — Sistem Screening

**[AWAM] Fungsi untuk apa:**
Cari pool liquidity yang layak dipasang modal. Custom-mu nambah 3 sumber sinyal baru:
1. **GMGN** = data token dari gmgn.ai (alternatif Meteora API). Datanya lebih kaya: holders, sniper, bundler, kline, ATH. Filter anti-scam (maxBundlerRate, maxSniperCount, dll).
2. **Chart indicators** = indikator teknikal (RSI, Supertrend, Bollinger Bands, Fibonacci). Bot baca momen masuk via API server-side.
3. **Candidate memory** = bot ingat kandidat yang pernah dilihat cycle sebelumnya, bandingin TVL/volume/mcap. Kalau naik = momentum bullish, kalau turun = bearish.

**[AWAM] Kenapa custom-mu beda:**
Yunus cuma pakai Meteora API + filter dasar (TVL, volume, holders). Custom-mu tambah sumber data + sinyal teknikal + memory antar-cycle. Bot lebih selektif + lebih ingat.

**[AWAM] Cara kerja di bot:**
Tiap cycle screening (default 30 menit):
1. Bot fetch kandidat (dari GMGN atau Meteora, tergantung `screeningSource`)
2. Bot cek indikator teknikal — kalau RSI/Supertrend tidak konfirm → pool dibuang sebelum LLM lihat
3. Bot simpan snapshot kandidat → cycle depan bisa bandingin ("pool X 2 cycle lalu TVL 50k, sekarang 80k = naik")
4. Kandidat lolos dikirim ke SCREENER LLM dengan baris tambahan: `momentum: naik 60% TVL`, `yield_to_me: ~0.05 SOL/hari estimasi`, `sw_momentum: smart wallet masuk 3`

**[TEKNIS] File semayam:**
- `tools/gmgn.js` (NEW, +754) — fetcher GMGN + bounce setup (`formatGmgnCandidateForPrompt`, `checkBounceSetup`)
- `tools/chart-indicators.js` (NEW, +366) — `fetchChartIndicatorsForMint`, `confirmIndicatorPreset`, `evaluatePreset`
- `candidate-memory.js` (NEW, +209) — `recordCandidateSnapshots`, `getCandidateMomentum`, `formatCandidateMomentum`, `recordSmartWalletCounts`, `getSmartWalletMomentum`, `formatSmartWalletMomentum`, `getSkipReview`
- `tools/screening.js` (MOD, +768) — `formatYieldToMe` + indicator gate di line 780
- `screening-scales.js` (NEW, +34) — `TIMEFRAME_SCREENING_SCALES`, `normalizeTimeframe`, `getScreeningDefaultsForTimeframe`
- `gmgn-config.example.json` (NEW) — template config GMGN

**[TEKNIS] Integration point di core:**
- `index.js`: `runScreeningCycle` → emit `screeningCycle:afterFetch` (call recordCandidateSnapshots, inject momentum/yield/sw_momentum ke prompt)
- `tools/screening.js:780` — hard-drop pool gagal indicator gate
- `prompt.js`: SCREENER candidate block → inject `momentum:`, `yield_to_me:`, `sw_momentum:`
- `config.js`: timeframe scaling (`scaleScreeningToTimeframe`)

**[TEKNIS] Config keys:**
- `gmgn.*` (~30 keys: apiKey, baseUrl, interval, orderBy, filters, holders, kline, athFilterPct, maxBundlerRate, maxSniperCount, dll)
- `indicators.enabled`, `indicators.exitEnabled`, `indicators.indicatorRejectAtBottom`, `indicators.entryPreset`, `indicators.exitPreset`, `indicators.requireAllIntervals`
- `experiments.candidateMomentum`, `experiments.expectedYieldSignal`, `experiments.smartWalletMomentum`, `experiments.counterfactualReview`

**[TEKNIS] Fase ekstrak:** 2 (library + tool, butuh call site di index.js + screening.js + prompt.js)
**[TEKNIS] Manifest entry:** 5 modul, 3 patch anchor

---

## Kategori 4 — Manajemen posisi

**[AWAM] Fungsi untuk apa:**
Kelola posisi yang sudah dibuka: monitor PnL, deteksi keluar range, close otomatis, simulasikan tanpa modal. 3 sub-sistem:
1. **Paper trading** = mode simulasi DRY-RUN. Bot buka "posisi virtual" (tidak on-chain), track performa seolah-olah, record lessons. Test strategi tanpa risiko modal.
2. **Dualside** = deploy dua sisi (SOL + token) bukan single-side SOL. Custom-mu (config-gated, default OFF).
3. **Signal tracker + weights** = catat sinyal yang muncul saat deploy, hitun bobot mana sinyal yang paling prediktif.

**[AWAM] Kenapa custom-mu beda:**
Yunus paper-trading = DRY-RUN saja (skip tx). Custom-mu = simulasi penuh (track virtual position, hitung fees proxy, IL, record lessons). Dualside = yunus single-side only. Signal weights = yunus tidak punya learning sinyal.

**[AWAM] Cara kerja paper trading:**
1. `deploy_position` di DRY_RUN → buat virtual position (`paper_...` id, simpan entry bin/price)
2. `getMyPositions` → sinkronisasi dengan `getTrackedPositions(true)`, mark in-range/OOR
3. `getPositionPnl` → `computePaperMetrics()` (fees proxy = deposit × fee_active_tvl_ratio × in-range-menit / 1440, IL rough)
4. `closePosition` → `closePaperPosition()` → recordPerformance → lessons.json (tag `paper:true`)

**[TEKNIS] File semayam:**
- `paper-trading.js` (NEW, +216) — `isPaperMode`, `makePaperPositionId`, `trackPosition`, `getTrackedPositions`, `computePaperMetrics`, `closePaperPosition`, `simulatePaperMetrics`
- `tools/dlmm.js` (MOD, +2475) — 3 cabang paper di DRY_RUN block, `getPositionsRentSol`, `POSITION_RENT_ESTIMATE_SOL`
- `signal-tracker.js` (NEW, +91) — `stageSignals`, `getAndClearStagedSignals`, `getStagedPools`
- `signal-weights.js` (NEW, +336) — `loadWeights`, `saveWeights`, `recalculateWeights`, `getWeightsSummary`
- `state.js` (MOD, +422) — `trackPosition`, `ensureDeployedAt`, `queuePeakConfirmation`, `resolvePendingPeak`, `queueTrailingDropConfirmation`, `resolvePendingTrailingDrop`, `updatePnlAndCheckExits`
- `pool-memory.js` (MOD, +183) — snapshot per-pool

**[TEKNIS] Integration point di core:**
- `tools/dlmm.js`: 3 cabang DRY_RUN (deploy, getMyPositions, close) → emit `beforeDeploy`, `getMyPositions`, `beforeClose`
- `index.js`: `runManagementCycle` → emit `managementCycle:afterPnl` (call signal-tracker, state-ext)
- `tools/executor.js`: `runSafetyChecks` deploy_position → `applyConvictionSizing` mutasi `args.amount_y`

**[TEKNIS] Config keys:**
- `experiments.paperTrading`, `experiments.usePaperHistoryWhenLive`
- `experiments.convictionSizing`, `experiments.convictionSizingMaxAdjustPct`
- `experiments.narrativeProfileSignal`, `experiments.narrative_category` enum
- `management.outOfRangeWaitMinutes`, `management.positionSizePct`, `management.minSolToOpen`
- `risk.maxPositions`, `risk.maxDeployAmount`
- `management.dualSideTokenPct`, `management.dualSideStrategy` (config-gated OFF)

**[TEKNIS] Fase ekstrak:** 2 (besar — dlmm +2475, state +422)
**[TEKNIS] Manifest entry:** 6 modul, 4 patch anchor

---

## Kategori 5 — Learning & analytics

**[AWAM] Fungsi untuk apa:**
Bot belajar dari pengalaman. 4 sub-sistem:
1. **Lessons** = catat performa posisi tertutup, turunin threshold (misal "win-rate sesi pagi rendah → stretch screening interval pagi"). Custom-mu tambah time-of-day profile, narrative profile, mode-scoped (paper vs live).
2. **Reports** = analitik trade (profit factor, drawdown, payoff ratio, expectancy, per-strategy/session/narrative breakdown).
3. **Trackers** = catat biaya: gas, LLM cost, PnL, SOL balance, OpenRouter balance. Buat hitung ROI bersih.
4. **Backtest** = script uji parameter (bin width, exit rules) pakai data historis.

**[AWAM] Kenapa custom-mu beda:**
Yunus lessons dasar (win/lose count). Custom-mu bucket per sesi WIB (dini/pagi/siang/sore/malam), per naratif token (animal/ai/political/celebrity/meme/culture/tech_utility/other), per racikan, paper-vs-live isolation. Reports yunus = ringkas, custom-mu = full trade analytics engine.

**[TEKNIS] File semayam:**
- `lessons.js` (MOD, +753) — `getModePerformance`, `getHourlyProfile`, `classifySession`, `getTimeProfileForPrompt`, `getNarrativeProfile`, `classifyNarrative`, `getNarrativeProfileForPrompt`, `currentWibSession`, `sessionLabel`, `listLessons`, `getAllPerformance`, `getArchivedPerformance`, `getLifetimePerformance`, `getPerformanceForRacikan`, `listRacikanInPerformance`, `getSuspectCount`, `getExcludedRacikanStats`, `NARRATIVE_CATEGORIES`
- `reports.js` (NEW, +642) — `computeTradeStats`, `classifyCloseRule`, `formatMovement`, `buildRecommendations`, `buildVerdict`, `buildTradeReport`, `buildRoleCostLines`, `estimateGasSol`, `computeCostDragPct`
- `pnl-tracker.js` (NEW, +78) — `getPnlTracker`, `formatPnlTracker`
- `sol-tracker.js` (NEW, +187) — `recordSolBalance`, `getTrackStart`, `setTrackStart`, `formatSolTracker`
- `gas-tracker.js` (NEW, +79) — `recordGasFee`, `trackTxGas`, `getGasStats`
- `llm-cost-tracker.js` (NEW, +68) — `recordLlmCost`, `getLlmCostStats`
- `openrouter-usage.js` (NEW, +97) — `getOpenRouterBalance`, `getOpenRouter24hCost`, `getOpenRouterCredits`
- `scripts/backtest-binwidth.js` (NEW, +289), `scripts/backtest-exits.js` (NEW, +211)

**[TEKNIS] Integration point di core:**
- `tools/executor.js`: post-close → `recordPerformance` (lessons), `recordLlmCost`, `trackTxGas`
- `index.js`: `runManagementCycle` → record PnL poll, SOL balance
- `index.js`: milestone report (`maybeFireLearningReport`) tiap N closes
- `briefing.js`: stats block dari `computeTradeStats`, cost section dari trackers
- `prompt.js`: SCREENER → `getTimeProfileForPrompt`, `getNarrativeProfileForPrompt`, `getDecisionSummary`, `getWeightsSummary`

**[TEKNIS] Config keys:**
- `reports.learningReportEvery`, `reports.learningReportTrendN`
- `schedule.adaptiveScreening`, `schedule.maxScreeningIntervalMin`
- `llm.managementModel`, `llm.screeningModel`, `llm.generalModel`

**[TEKNIS] Fase ekstrak:** 2 (lessons besar +753, reports +642)
**[TEKNIS] Manifest entry:** 8 modul, 3 patch anchor

---

## Kategori 6 — Views / UI (tampilan)

**[AWAM] Fungsi untuk apa:**
Lapis tampilan terpisah dari logika. Yunus campur aduk (logika + format pesan di file sama). Custom-mu pisahin ke `views/*.js` = MVC pattern (model-view-controller). Telegram messages, /positions, /status, /config, /settings, /help — semua di-render via views.

**[AWAM] Kenapa custom-mu beda:**
Yunus render inline di index.js (40 baris format string per command). Custom-mu = 13 file view terpisah, reusable, konsisten. Tambah progress bar `[████████░░░░] 40%`, format mata uang (SOL/USD toggle via `solMode`), live message edit.

**[AWAM] 13 view apa aja:**
- `positions` = tampilan /positions (progress bar, PnL, range)
- `status` = /status (mode, PnL all-time, balance)
- `wallet` = /wallet (SOL balance, track start, sistem lines)
- `config` = /config (full config dump)
- `settings` = /settings menu button (GRUP 13/16, toggle pages)
- `pool` = /pool info
- `notifs` = deploy/OOR/swap/close notifications
- `cycle` = management/screening cycle report
- `system` = /help, hive, paused, resumed
- `trackers` = SOL/PnL tracker render
- `format` = helpers (fmtMoney, fmtMoneySigned, curSym, round)
- `render` = dispatcher (view → target telegram/REPL)

**[TEKNIS] File semayam:**
- `views/positions.js` (NEW, +104) — `buildView(positions, cfg, rentMap, solPrice)`, `telegram(vm)`
- `views/status.js` (NEW, +82), `views/wallet.js` (NEW, +94), `views/config.js` (NEW, +175)
- `views/settings.js` (NEW, +639) — `initSettingsViews`, `settingValue`, `fmtSettingValue`, `settingButton`, `toggleButton`
- `views/pool.js` (NEW, +69), `views/notifs.js` (NEW, +118), `views/cycle.js` (NEW, +239)
- `views/system.js` (NEW, +114) — `renderHelp`, `renderHive`, `renderPaused`, `renderResumed`, `renderAlreadyRunning`
- `views/trackers.js` (NEW, +91), `views/format.js` (NEW, +194), `views/render.js` (NEW, +50)

**[TEKNIS] Integration point di core:**
- `index.js`: tiap command (`/positions`, `/status`, `/wallet`, `/config`, `/settings`, `/help`, dll) → call view builder
- `telegram.js`: notifications → `views/notifs.js` (renderDeploy, renderOOR, renderSwap, renderClose)
- `index.js`: `render(view, target)` dispatcher

**[TEKNIS] Fase ekstrak:** 2 (13 file, butuh wiring render call sites di index.js + telegram.js)
**[TEKNIS] Manifest entry:** 13 modul, 2 patch anchor (render dispatcher + notifs wiring)

---

## Kategori 7 — Telegram commands (~20 perintah)

**[AWAM] Fungsi untuk apa:**
Perintah yang kamu kirim via Telegram ke bot. Yunus punya ~5 (positions, close, screen, pause, resume). Custom-mu nambah ~15: preset, export, addprofil, settings, guide, briefing, report, config, wallet, status, dll.

**[AWAM] Perintah baru apa:**
- `/preset list/save/use/show/rm` = snapshot config, load balik, banding
- `/export racikan/profil` = ekspor config + data (strip secret)
- `/addprofil <nama>` = scaffold profil baru (isolasi data-dir)
- `/settings` atau `/menu` = menu button interaktif (toggle, halaman)
- `/guide` = baca panduan setting
- `/briefing [alltime]` = briefing harian on-demand
- `/report [week|month|day]` = laporan trade on-demand
- `/config [core|origin]` = lihat config (full / inti / asal-usul)
- `/closeall` = close semua posisi
- `/candidates` = lihat kandidat screening terakhir
- `/wallet` = lihat saldo + tracker
- `/status` = status bot lengkap

**[TEKNIS] File semayam:**
- `index.js` (MOD, +3947) — command dispatcher, settings menu, render call sites
- `telegram.js` (MOD, +593) — `sendMessage`, `sendMessageWithButtons`, `sendHTML`, `editMessage`, `editMessageWithButtons`, `answerCallbackQuery`, `pinMessage`, `unpinMessage`, `escapeHtml`, `hasActiveLiveMessage`, `createLiveMessage`, `notifyDeploy`, `notifyClose`, `notifySwap`, `notifyOutOfRange`
- `tools/definitions.js` (MOD, +212) — tool schemas baru

**[TEKNIS] Tool baru di definitions.js:**
- `get_recent_decisions`, `get_time_profile`, `get_narrative_profile`
- `block_deployer`, `unblock_deployer`, `list_blocked_deployers`

**[TEKNIS] Integration point di core:**
- `index.js`: polling loop → command dispatcher (if-chain `/x`)
- `index.js`: `BOT_COMMANDS` array + `/help` render
- `index.js`: `renderSettingsMenu` + callback query handler (`cfg:preset:ask/go/diff/rmask/rmgo`, `cfg:preset:save`, dll)
- `telegram.js`: polling + callback query API + inline keyboard

**[TEKNIS] Fase ekstrak:** 2 (PALING BESAR — index.js +3947, telegram.js +593)
**[TEKNIS] Manifest entry:** 2 modul split jadi ~5 (index-cron, index-commands, index-settings, index-render, index-boot), 6 patch anchor

---

## Kategori 8 — Briefings & laporan periodik

**[AWAM] Fungsi untuk apa:**
Notifikasi terjadwal ke Telegram: harian, mingguan, bulanan, milestone. Custom-mu nambah:
- **Daily briefing** (01:00 UTC): aktivitas 24 jam + all-time stats + verdict + cost + learning + rekomendasi
- **Weekly** (Senin 01:30), **Monthly** (1st 02:00): windowed trade report + activity + cost
- **Milestone report**: tiap N closes (default 10), fire learning report
- **`/report [week|month|day]`**: on-demand

**[AWAM] Kenapa custom-mu beda:**
Yunus = notifikasi deploy/close/OOR saja (event-driven). Custom-mu tambah briefings terjadwal = ringkasan periodik untuk monitoring performa jangka panjang. Pin pesan (latest pinned, prev unpinned).

**[TEKNIS] File semayam:**
- `briefing.js` (MOD, +550) — `generateBriefing`, `generatePeriodicBriefing`, `buildMilestoneReport`, `buildSkipReviewSection`, `sendAndPinBriefing`

**[TEKNIS] Integration point di core:**
- `index.js`: cron jobs (01:00 UTC daily, Senin 01:30 weekly, 1st 02:00 monthly)
- `index.js`: `maybeFireLearningReport` hook di `runManagementCycle`
- `index.js`: missed-watchdog (kalau briefing terlewat, fire saat boot)
- `state.js`: `getLastBriefingDate/setLastBriefingDate`, `getLastBriefingPinId/setLastBriefingPinId`, `getLastReportedMilestone/setLastReportedMilestone`, `getLastPeriodicBriefing/setLastPeriodicBriefing`
- `reports.js`: `buildTradeReport` shared engine
- `lessons.js`: `getModePerformance`, `getSkipReview` (counterfactual)

**[TEKNIS] Config keys:**
- `reports.learningReportEvery`, `reports.learningReportTrendN`
- `experiments.counterfactualReview`, `experiments.counterfactualMinMcapGainPct`

**[TEKNIS] Fase ekstrak:** 2 (briefing +550, butuh cron + state hooks)
**[TEKNIS] Manifest entry:** 1 modul, 3 patch anchor (cron + milestone + state)

---

## Kategori 9 — Profil & racikan (preset)

**[AWAM] Fungsi untuk apa:**
Kelola config bot sebagai "resep" yang bisa simpan-muat-ekspor:
1. **Preset** = snapshot user-config.json. Simpan config sekarang jadi preset, muat balik kapan. Auto-backup + auto-restart.
2. **Racikan** = preset + riwayat performa. Ekspor racikan = share "resep bot" ke orang lain (secret di-strip).
3. **Profil** = isolasi data-dir per bot. Multiple bot jalan di 1 repo, masing-masing punya folder data sendiri (state, lessons, presets, secrets).
4. **Addprofil** = scaffold profil baru (folder + config + template .env).

**[AWAM] Kenapa custom-mu beda:**
Yunus = 1 bot 1 repo, config manual edit. Custom-mu = multi-profil (jalankan beberapa bot di 1 repo, masing-masing isolasi), preset system (simpan-muat resep), export (share resep). Bayangkan restoran: yunus = 1 menu tetap, custom-mu = menu bisa disimpen, diekspor, diimpor, multi-cabang.

**[TEKNIS] File semayam:**
- `preset-manager.js` (NEW, +190) — `diffConfigs`, `validName`, `presetExists`, `listPresets`, `savePreset`, `applyPreset`, `getPresetDiff`, `deletePreset`, `getActiveSetupStatus`, `formatIdentity`
- `preset.js` (NEW, +79) — CLI wrapper
- `racikan-export.js` (NEW, +113) — `stripSecrets`, `listExportableRacikan`, `exportRacikan`
- `profil-export.js` (NEW, +118) — `exportProfil` (full backup config+data)
- `addprofil.js` (NEW, +169) — `validProfilName`, `profilExists`, `listProfil`, `scaffoldProfil`
- `prompt.js` (MOD, +132) — `racikanRules(role)` render promptNotes

**[TEKNIS] Integration point di core:**
- `index.js`: `/preset`, `/export`, `/addprofil` command handlers
- `preset-manager.js`: `PRESETS_DIR` + `USER_CONFIG` rute via `paths.js`
- `config.js`: `normalizePromptNotes()`, `reloadScreeningThresholds()` re-read `promptNotes`
- `prompt.js`: `racikanRules(role)` inject RACIKAN RULES block

**[TEKNIS] Fase ekstrak:** 2 (butuh wiring command di index.js + paths.js routing)
**[TEKNIS] Manifest entry:** 5 modul, 2 patch anchor

---

## Kategori 10 — Hive mind (collective intelligence)

**[AWAM] Fungsi untuk apa:**
Sinkronisasi bot-mu ke server kolektif. Bot share lessons + deploy event, query consensus pattern dari bot lain. Bayangkan "koloni lebah" — tiap bot lebah share pengalaman, koloni belajar bersama.

**[AWAM] Kenapa custom-mu beda:**
Yunus = bot tunggal, belajar sendiri. Custom-mu = opsional sync ke hive server (HIVE_MIND_URL + HIVE_MIND_API_KEY). Off by default.

**[TEKNIS] File semayam:**
- `hivemind.js` (NEW, +367) — `bootstrapHiveMind`, `ensureAgentId`, `getHiveMindPullMode`, `isHiveMindEnabled`, `pullHiveMindLessons`, `pullHiveMindPresets`, `registerHiveMindAgent`, `startHiveMindBackgroundSync`, `pushHiveLesson`, `pushHivePerformanceEvent`
- `docs/hivemind-reference.md` (NEW, +128), `docs/hivemind-summary.md` (NEW, +82)

**[TEKNIS] Integration point di core:**
- `index.js`: boot → `bootstrapHiveMind`, `registerHiveMindAgent`, `startHiveMindBackgroundSync`
- `tools/executor.js`: post-close → `pushHiveLesson`, `pushHivePerformanceEvent` (skip paper)
- `lessons.js`: `pushHiveLesson` on evolve
- `pool-memory.js`: `recordPoolDeploy` (skip paper)

**[TEKNIS] Fase ekstrak:** 2 (opsional, butuh boot hook + post-close hook)
**[TEKNIS] Manifest entry:** 1 modul, 2 patch anchor

---

## Kategori 11 — Config experiments (16 flag)

**[AWAM] Fungsi untuk apa:**
Laboratorium eksperimen fitur. 16 flag ON/OFF di config. Tiap flag = fitur baru yang bisa diuji tanpa hapus yang lama. Off = bot kembali perilaku pabrik. On = fitur aktif.

**[AWAM] 16 eksperimen apa:**
1. `exitLiquidityCheck` — cek slippage keluar pool sebelum deploy
2. `marketRegimeGate` — stop screening kalau SOL jatuh >X%
3. `candidateMomentum` — momentum tracking antar-cycle
4. `convictionSizing` — deploy amount naik/turun sesuai keyakinan
5. `expectedYieldSignal` — estimasi yield ke kita per kandidat
6. `smartWalletMomentum` — smart wallet count tracking
7. `counterfactualReview` — review pool yang diskip tapi ternyata naik
8. `narrativeProfileSignal` — performa per naratif token
9. `paperTrading` — simulasi DRY-RUN penuh
10. `usePaperHistoryWhenLive` — bawa lessons paper ke live (advisory)
11-16. Parameter eksperimen (max slippage, max drop, conviction adjust pct, counterfactual min mcap gain, dll)

**[TEKNIS] File semayam:**
- `config.js` (MOD, +591) — eksperimen defaults, `applyConvictionSizing`, `computeDeployAmount`, `minDeployAmount`, `persistConfigChange`
- `tools/executor.js` (MOD, +807) — `CONFIG_MAP` (all keys), `runSafetyChecks` eksperimen gates
- `user-config.example.json` (MOD, +121) — eksperimen section template
- `config-schema.js` (NEW, +285) — `CONFIG_SCHEMA`, `validateConfigValue`, `SCHEMA_KEYS`
- `config-origin.js` (NEW, +578) — `ORIGIN_SECTIONS`, `ORIGIN_NOTES`, `SUB_CLUSTER_META`, `KEY_SUBCLUSTER`, `L4_CHILDREN`, `CORE_GROUPS`, `FUNCTION_GROUPS`

**[TEKNIS] Integration point di core:**
- `config.js`: load defaults, `config.experiments` object
- `tools/executor.js`: `CONFIG_MAP` (setcfg/update_config), `runSafetyChecks` gate per eksperimen
- `index.js`: `runScreeningCycle` gate (marketRegime, candidateMomentum, expectedYield, swMomentum, counterfactual)
- `prompt.js`: SCREENER prompt line gated per eksperimen
- `views/settings.js`: GRUP 16 page render

**[TEKNIS] Fase ekstrak:** 2 (config besar +591, executor +807)
**[TEKNIS] Manifest entry:** 3 modul (config-ext, config-schema, config-origin), 2 patch anchor

---

## Kategori 12 — Core engine (config + agent + paths)

**[AWAM] Fungsi untuk apa:**
Tulang punggung bot: config (baca setting), agent (ReAct loop LLM), paths (resolver path file per-profil).

**[AWAM] Kenapa custom-mu beda:**
Yunus = 1 set config hardcoded path. Custom-mu:
- `paths.js` = resolver path per-profil (multi-bot di 1 repo, masing-masing data-dir sendiri)
- `config.js` = config sadar-profil, reload threshold tanpa restart, persistConfigChange
- `agent.js` = per-role tool access (SCREENER/MANAGER/GENERAL), fallback LLM client (OpenCode Zen), failover 502/503/529

**[TEKNIS] File semayam:**
- `paths.js` (NEW, +32) — `paths` object (dataDir, presetsDir, dll per-profil)
- `repo-root.js` (NEW, +11) — `REPO_ROOT`, `repoPath(...segments)`
- `config.js` (MOD, +591) — `paths` routing, `reloadScreeningThresholds`, `computeDeployAmount`, `applyConvictionSizing`, `minDeployAmount`, `persistConfigChange`, `normalizePromptNotes`, `getScreeningDefaultsForTimeframe`, `scaleScreeningToTimeframe`, `MIN_SAFE_BINS_BELOW`
- `agent.js` (MOD, +448) — `agentLoop` signature extend (agentType, model, maxOutputTokens, options), MANAGER_TOOLS/SCREENER_TOOLS custom, fallback client, failover

**[TEKNIS] Integration point di core:**
- `index.js`: import config, agent, paths (top-level)
- All files: `paths.js` routing (state, lessons, presets, candidate-memory, gas, llm-cost, dll)
- `agent.js`: role-based tool filter

**[TEKNIS] Fase ekstrak:** 2 (besar — config +591, agent +448)
**[TEKNIS] Manifest entry:** 4 modul (paths, repo-root, config-ext, agent-ext), 3 patch anchor

---

## Kategori 13 — CLI & scripts

**[AWAM] Fungsi untuk apa:**
Entry point REPL (CLI interaktif di terminal) + script utility standalone:
- `cli.js` = REPL interface (mirror perintah Telegram di terminal)
- `backup.sh` = script backup data
- `test-screening.js` = test screening offline
- `scripts/backtest-*.js` = backtest parameter
- `scripts/envrypt.js` = CLI enkripsi secret
- `scripts/smoke-sizing-v2.1.js` = smoke test sizing
- `scripts/patch-anchor.js` = utility patcher (sudah ada, dimodifikasi)
- `setup.js` = onboarding setup wizard (+664 modifikasi)
- `ecosystem.config.cjs` = konfigurasi PM2

**[AWAM] Kenapa custom-mu beda:**
Yunus = `index.js` saja (REPL minimal). Custom-mu = CLI mirror (`cli.js`), backup script, test harness, setup wizard interaktif.

**[TEKNIS] File semayam:**
- `cli.js` (NEW, +354) — REPL mirror
- `backup.sh` (NEW, +89), `ecosystem.config.cjs` (NEW, +27)
- `test-screening.js` (NEW, +56)
- `scripts/backtest-binwidth.js` (NEW, +289), `scripts/backtest-exits.js` (NEW, +211), `scripts/envrypt.js` (NEW, +34), `scripts/smoke-sizing-v2.1.js` (NEW, +95)
- `scripts/patch-anchor.js` (MOD, +9)
- `setup.js` (MOD, +664) — onboarding wizard

**[TEKNIS] Integration point di core:**
- `index.js`: REPL integration (readline)
- `setup.js`: first-run wizard
- `package.json` (MOD, +12) — scripts bin

**[TEKNIS] Fase ekstrak:** 1 (standalone, tidak runtime import) + 2 (cli, setup)
**[TEKNIS] Manifest entry:** 9 modul, 1 patch anchor (REPL integration)

---

## Kategori 14 — Dokumentasi

**[AWAM] Fungsi untuk apa:**
Dokumen proyek: panduan setting, journal pengembangan, audit catatan, roadmap, hivemind reference.

**[AWAM] Kenapa custom-mu beda:**
Yunus = README singkat. Custom-mu:
- `CLAUDE.md` = context file untuk AI assistant (arsitektur, konvensi, eksperimen)
- `SETTINGS-GUIDE.md` = panduan lengkap semua setting (/guide)
- `MAINZEN-V2-JOURNAL.md`, `MAINZEN-V3-WORKFLOW.md` = journal pengembangan
- `NEXT-SESSION.md` = handoff antar sesi
- `notes/*.md` = ~80 progress note per fitur (audit, recon, build)
- `docs/hivemind-*.md` = referensi hive
- `scratchpad/*.md` = catatan kerja

**[TEKNIS] File semayam:**
- `CLAUDE.md` (NEW, +332), `SETTINGS-GUIDE.md` (NEW, +1693), `MAINZEN-V2-JOURNAL.md` (NEW, +111), `MAINZEN-V3-WORKFLOW.md` (NEW, +93), `NEXT-SESSION.md` (NEW, +52)
- `README.md` (MOD, +107), `.env.example` (NEW, +30), `.gitignore` (MOD, +27)
- `docs/hivemind-reference.md` (NEW, +128), `docs/hivemind-summary.md` (NEW, +82)
- `notes/*.md` (~80 file, diprun di Step 0)
- `scratchpad/dualside-tokenpct-fix.md` (NEW, +20)
- `gmgn-config.example.json` (NEW, +51)

**[TEKNIS] Fase ekstrak:** 1 (data, bukan kode — drop-in)
**[TEKNIS] Manifest entry:** data files, 0 patch anchor

---

## Lampiran A — Tabel modul index (46 file JS baru + 4 tools + 13 views)

| File | Kategori | Fase | Jenis integration | Baris |
|---|---|---|---|---|
| `addprofil.js` | 9 | 2 | command | 169 |
| `backup.sh` | 13 | 1 | script | 89 |
| `candidate-memory.js` | 3 | 2 | library | 209 |
| `cli.js` | 13 | 2 | command (REPL) | 354 |
| `config-origin.js` | 11 | 2 | library | 578 |
| `config-schema.js` | 11 | 2 | library | 285 |
| `decision-log.js` | 1 | 1 | library | 68 |
| `dev-blocklist.js` | 2 | 2 | library | 66 |
| `ecosystem.config.cjs` | 13 | 1 | config | 27 |
| `envcrypt.js` | 2 | 1 | side-effect import | 128 |
| `gas-tracker.js` | 5 | 2 | library | 79 |
| `guide.js` | 13 | 2 | command | 172 |
| `hivemind.js` | 10 | 2 | library | 367 |
| `llm-cost-tracker.js` | 5 | 2 | library | 68 |
| `openrouter-usage.js` | 5 | 2 | library | 97 |
| `paper-trading.js` | 4 | 2 | library (3 call sites) | 216 |
| `paths.js` | 12 | 1 | side-effect import | 32 |
| `pnl-tracker.js` | 5 | 2 | library | 78 |
| `preset.js` | 9 | 2 | command (CLI) | 79 |
| `preset-manager.js` | 9 | 2 | library | 190 |
| `profil-export.js` | 9 | 2 | command | 118 |
| `racikan-export.js` | 9 | 2 | command | 113 |
| `repo-root.js` | 12 | 1 | library | 11 |
| `reports.js` | 5 | 2 | library | 642 |
| `screening-scales.js` | 3 | 2 | library | 34 |
| `signal-tracker.js` | 4 | 2 | library | 91 |
| `signal-weights.js` | 4 | 2 | library | 336 |
| `sol-tracker.js` | 5 | 2 | library | 187 |
| `test-screening.js` | 13 | 1 | script | 56 |
| `tools/chart-indicators.js` | 3 | 2 | tool (executor+definitions) | 366 |
| `tools/gmgn.js` | 3 | 2 | tool (executor+definitions) | 754 |
| `tools/pnl.js` | 5 | 2 | tool | 350 |
| `tools/smi.js` | 5 | 2 | tool | 166 |
| `views/config.js` | 6 | 2 | view (render call) | 175 |
| `views/cycle.js` | 6 | 2 | view | 239 |
| `views/format.js` | 6 | 2 | view (helpers) | 194 |
| `views/notifs.js` | 6 | 2 | view (telegram wiring) | 118 |
| `views/pool.js` | 6 | 2 | view | 69 |
| `views/positions.js` | 6 | 2 | view | 104 |
| `views/render.js` | 6 | 2 | view (dispatcher) | 50 |
| `views/settings.js` | 6 | 2 | view (settings menu) | 639 |
| `views/status.js` | 6 | 2 | view | 82 |
| `views/system.js` | 6 | 2 | view | 114 |
| `views/trackers.js` | 6 | 2 | view | 91 |
| `views/wallet.js` | 6 | 2 | view | 94 |
| `scripts/backtest-binwidth.js` | 13 | 1 | script | 289 |
| `scripts/backtest-exits.js` | 13 | 1 | script | 211 |
| `scripts/envrypt.js` | 13 | 1 | script | 34 |
| `scripts/smoke-sizing-v2.1.js` | 13 | 1 | script | 95 |

## Lampiran B — 27 file core dimodifikasi

| File | Baris | Kategori dampak |
|---|---|---|
| `index.js` | +3947 | 7, 8, 11, 12 |
| `tools/dlmm.js` | +2475 | 4 |
| `tools/executor.js` | +807 | 2, 11 |
| `setup.js` | +664 | 13 |
| `lessons.js` | +753 | 5 |
| `briefing.js` | +550 | 8 |
| `config.js` | +591 | 11, 12 |
| `agent.js` | +448 | 12 |
| `state.js` | +422 | 4 |
| `tools/screening.js` | +768 | 3 |
| `tools/gmgn.js` | +754 | 3 |
| `tools/definitions.js` | +212 | 7 |
| `tools/token.js` | +150 | 2 |
| `tools/wallet.js` | +238 | 2 |
| `tools/study.js` | +236 | 3 |
| `pool-memory.js` | +183 | 4 |
| `prompt.js` | +132 | 9, 11 |
| `telegram.js` | +593 | 7 |
| `strategy-library.js` | +4 | 4 |
| `token-blacklist.js` | +4 | 4 |
| `smart-wallets.js` | +7 | 4 |
| `logger.js` | +4 | 1 |
| `package.json` | +12 | 13 |
| `user-config.example.json` | +121 | 11 |
| `README.md` | +107 | 14 |
| `.gitignore` | +27 | 14 |
| `scripts/patch-anchor.js` | +9 | 13 |

---

## Ringkasan per fase ekstrak

**Fase 1 (drop-in, side-effect, scripts — ~1,200 baris):**
- Kategori 1 (sebagian): decision-log
- Kategori 2 (sebagian): envcrypt
- Kategori 12 (sebagian): paths, repo-root
- Kategori 13 (sebagian): backup, ecosystem, test-screening, scripts/*
- Kategori 14 (all): dokumentasi

**Fase 2 (butuh hook + call site extraction — ~22,000 baris):**
- Kategori 1 (sebagian): logger audit hook
- Kategori 2 (sebagian): dev-blocklist, wallet regime, executor safety
- Kategori 3 (all): screening GMGN + indicators + memory
- Kategori 4 (all): paper-trading, dlmm, signal tracker/weights, state
- Kategori 5 (all): lessons, reports, trackers, backtest
- Kategori 6 (all): 13 views
- Kategori 7 (all): index + telegram + definitions
- Kategori 8 (all): briefings
- Kategori 9 (all): preset + racikan + profil + addprofil + prompt
- Kategori 10 (all): hive mind
- Kategori 11 (all): experiments + config-schema + config-origin
- Kategori 12 (sebagian): config-ext, agent-ext
- Kategori 13 (sebagian): cli, setup

---

## Pasangan dokumen

- `RENCANA-teknis-pemisahan-custom.md` — arsitektur, hook bus, patcher, eksekusi sequence
- `PANDUAN-awam-pemisahan-custom.md` — glosarium, analogi, FAQ
- `DETAILING-custom-topdown.md` — file ini, peta 14 kategori + tabel modul
