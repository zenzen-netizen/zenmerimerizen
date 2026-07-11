# KLASIFIKASI IMPACT CUSTOM — meridian-zen-pack

> Peta custom-meridian diurut by impact BESAR → KECIL.
> Tiap item: apa, untuk apa, terlihat Telegram atau tidak, vanilla yunus punya atau tidak, dependensi, command, env, default, fase ekstrak, file, config, catatan.
> Ini klasifikasi impact SAJA — bukan rencana eksekusi (rencana di `RENCANA-teknis-pemisahan-custom.md`) bukan peta kategori (`DETAILING-custom-topdown.md`).

Dibuat: 2026-07-07
Total: 39 item dalam 4 tier.

---

## Penjelasan 4 tier (bahasa awam)

| Tier | Arti | Ciri |
|---|---|---|
| **TIER 1 — BESAR** | ubah cara bot kerja secara fundamental, user langsung merasakan | fitur baru yang yunus tidak punya sama sekali, kelihatan jelas di Telegram |
| **TIER 2 — SEDANG** | ubah perilaku bot di area tertentu, sebagian kelihatan di Telegram | tweak logika + filter, sebagian internal sebagian visual |
| **TIER 3 — KECIL** | internal, minim terlihat Telegram | tooling/audit helper, LLM pakai tapi user tidak langsung lihat |
| **TIER 4 — MINIM** | infra/docs, hampir tidak sentuh Telegram | script ops, dokumentasi, meta config |

Badge per item:
- **[WAJIB]** = fitur inti paket, harus aktif biar paket jalan (foundation)
- **[OPSIONAL]** = nice-to-have, bisa ON/OFF tanpa break paket

---

# TIER 1 — IMPACT BESAR (7 item)

## 1.1 Paper Trading Simulation  [OPSIONAL]
─────────────────────────────────────────────
Apa:          mode simulasi posisi DRY-RUN penuh — virtual
              position, fees proxy, IL rough, lessons record
Untuk apa:    test strategi tanpa risiko modal, bot belajar dari
              sim seolah-olah real
Vanilla:      tidak punya — yunus DRY_RUN skip tx saja, tidak sim
Telegram:     YA — /positions tampil posisi virtual paper_...,
              notif deploy berlabel 🧪, briefing pakai paper data
Command:      (tidak ada — via env DRY_RUN=true + experiments.paperTrading)
Dependensi:   state.js (trackPosition), lessons.js (recordPerformance),
              tools/dlmm.js (3 cabang DRY_RUN)
Env:          DRY_RUN=true wajib; tidak butuh env lain
Default:      OFF (experiments.paperTrading=false)
Fase:         2 — lihat RENCANA-teknis Fase 2, DETAILING kategori 4
File:         paper-trading.js (216), tools/dlmm.js (+2475 total)
Config:       experiments.paperTrading, experiments.usePaperHistoryWhenLive
Catatan:      paper data tag paper:true, terisolasi dari live
              (reports/briefing/evolveThreshold/hive pakai filter mode)

## 1.2 GMGN Alternative Screening Source  [OPSIONAL]
─────────────────────────────────────────────
Apa:          sumber data screening alternatif Meteora API — dari
              gmgn.ai, data lebih kaya (holders, sniper, bundler,
              kline, ATH)
Untuk apa:    cari kandidat pool dari sumber berbeda + filter
              anti-scam lebih ketat (bundler, sniper, dev team,
              rat trader, fresh wallet)
Vanilla:      tidak punya — yunus Meteora API saja
Telegram:     YA — /candidates tampil kandidat format GMGN beda,
              /screen cycle report, baris momentum/yield/sw di
              prompt SCREENER (internal, tidak tampil user)
Command:      (tidak ada — via config screeningSource=gmgn)
Dependensi:   tools/chart-indicators.js (combined gate), prompt.js
Env:          GMGN_API_KEY (opsional, fallback ke config)
Default:      OFF sampai screeningSource=gmgn + apiKey set
Fase:         2 — lihat RENCANA-teknis Fase 2, DETAILING kategori 3
File:         tools/gmgn.js (754), gmgn-config.example.json (51)
Config:       screeningSource, gmgn.* (~30 keys: apiKey, baseUrl,
              interval, orderBy, filters, holders, kline, athFilterPct,
              maxBundlerRate, maxSniperCount, dll)
Catatan:      screeningSource=meteora = behavior vanilla yunus

## 1.3 Multi-Profil Isolasi  [WAJIB]
─────────────────────────────────────────────
Apa:          jalankan multiple bot di 1 repo, masing-masing
              data-dir sendiri (state/lessons/presets/secrets
              terpisah)
Untuk apa:    isolasi per bot, clone bot lain tanpa konflik data,
              paritas root (cwd-independent)
Vanilla:      tidak punya — yunus 1 bot 1 repo hardcoded path
Telegram:     YA — /addprofil <nama> scaffold profil baru,
              /export profil backup penuh
Command:      /addprofil, /addprofil <nama>, /export profil,
              /export profil tar
Dependensi:   envcrypt.js (isolasi secret per profil), paths.js
              (resolver data-dir)
Env:          (tidak ada — path resolver)
Default:      ON (selalu aktif, foundation paket)
Fase:         1 — lihat RENCANA-teknis Fase 1, DETAILING kategori 12
File:         paths.js (32), repo-root.js (11), addprofil.js (169),
              profil-export.js (118)
Config:       profil name (env), data-dir (paths.js)
Catatan:      paths.js = always-on core (tidak toggleable, paket
              butuh). Profil name via env atau arg.

## 1.4 Preset & Racikan System  [OPSIONAL]
─────────────────────────────────────────────
Apa:          snapshot config bot sebagai "resep" simpan-muat-ekspor,
              promptNotes = karakter prompt per racikan (data-only,
              travels with preset file)
Untuk apa:    simpan config, share resep bot, load balik cepat,
              custom prompt character per preset (RACIKAN RULES
              block hard instruction, beat soft guidelines)
Vanilla:      tidak punya — yunus edit manual user-config.json
Telegram:     YA — /preset list/save/use/show/rm, /export racikan
              <nama> [tar], prompt behavior beda per racikan
Command:      /preset, /preset list, /preset save <nama>,
              /preset use <nama>, /preset show <nama>,
              /preset rm <nama>, /export racikan,
              /export racikan <nama> [tar]
Dependensi:   paths.js (presetsDir per-profil), prompt.js
              (racikanRules), config.js (normalizePromptNotes)
Env:          (tidak ada)
Default:      ON (selalu aktif)
Fase:         2 — lihat RENCANA-teknis Fase 2, DETAILING kategori 9
File:         preset-manager.js (190), preset.js (79),
              racikan-export.js (113), prompt.js (+132 racikanRules)
Config:       preset, promptNotes, activeSetup
Catatan:      promptNotes = file-level only (tidak di CONFIG_MAP/
              /setcfg/ /settings — free text poor fit). Edit via
              presets/<name>.json → /preset use. Reload threshold
              re-read promptNotes tanpa restart.

## 1.5 Briefings Terjadwal  [OPSIONAL]
─────────────────────────────────────────────
Apa:          notifikasi Telegram terjadwal — daily (01:00 UTC),
              weekly (Senin 01:30), monthly (1st 02:00), milestone
              (tiap N closes), missed-watchdog
Untuk apa:    ringkasan periodik performa, monitoring jangka
              panjang tanpa cek manual, auto-pin (latest pinned,
              prev unpinned)
Vanilla:      tidak punya — yunus notif event-driven saja
              (deploy/close/swap/OOR)
Telegram:     YA BANGET — pesan panjang auto-pin, all-time stats
              + verdict + cost + learning + rekomendasi +
              skip-review (counterfactual) + time/narrative profile
Command:      /briefing, /briefing alltime, /report, /report week,
              /report month, /report day
Dependensi:   reports.js (buildTradeReport), lessons.js
              (getModePerformance, getSkipReview), state.js
              (briefing dedup keys), trackers (cost section)
Env:          (tidak ada)
Default:      ON (selalu aktif kalau Telegram enabled)
Fase:         2 — lihat RENCANA-teknis Fase 2, DETAILING kategori 8
File:         briefing.js (+550)
Config:       reports.learningReportEvery (default 10, 0=off),
              reports.learningReportTrendN,
              experiments.counterfactualReview,
              experiments.counterfactualMinMcapGainPct
Catatan:      daily/weekly/monthly dedup via state.json
              (getLastBriefingDate/setLast, getLastPeriodicBriefing).
              Milestone dedup via _lastReportedMilestone.

## 1.6 Views UI Overhaul (13 file tampilan)  [WAJIB]
─────────────────────────────────────────────
Apa:          lapis tampilan terpisah dari logika (MVC pattern),
              13 view renderer — positions/status/wallet/config/
              settings/pool/notifs/cycle/system/trackers/format/render
Untuk apa:    format pesan konsisten, reusable, progress bar
              [████████░░░░] 40%, format mata uang SOL/USD toggle
              (solMode), live message edit, format helper
Vanilla:      tidak punya — yunus render inline di index.js (40
              baris format string per command)
Telegram:     YA BANGET — hampir semua pesan bot pakai views:
              /positions /status /wallet /config /settings /pool
              /help, notif deploy/close/swap/OOR, cycle report
Command:      (tidak ada — views dipanggil command lain)
Dependensi:   telegram.js (notify wiring), index.js (render call
              sites)
Env:          (tidak ada)
Default:      ON (selalu aktif, foundation paket)
Fase:         2 — lihat RENCANA-teknis Fase 2, DETAILING kategori 6
File:         views/positions.js (104), views/status.js (82),
              views/wallet.js (94), views/config.js (175),
              views/settings.js (639), views/pool.js (69),
              views/notifs.js (118), views/cycle.js (239),
              views/system.js (114), views/trackers.js (91),
              views/format.js (194), views/render.js (50)
Config:       solMode (SOL/USD toggle display)
Catatan:      views/format.js = helpers (fmtMoney, fmtMoneySigned,
              curSym, round) dipakai semua view. views/render.js =
              dispatcher (view → target telegram/REPL).

## 1.7 Settings Menu Button Interaktif  [OPSIONAL]
─────────────────────────────────────────────
Apa:          menu button Telegram interaktif (inline keyboard),
              toggle via tap, halaman GRUP 13/16, callback query
              handler (cfg:preset:ask/go/diff/rmask/rmgo,
              cfg:preset:save)
Untuk apa:    ubah config tanpa ketik command, visual UI, mudah
              untuk non-technical user
Vanilla:      tidak punya — yunus /config text saja
Telegram:     YA — /settings /menu /configmenu buka menu button,
              tap toggle, halaman paging
Command:      /settings, /menu, /configmenu
Dependensi:   views/settings.js (639), telegram.js (callback query
              API), index.js (renderSettingsMenu + callback
              handler ~800 baris)
Env:          (tidak ada)
Default:      ON (selalu aktif kalau Telegram enabled)
Fase:         2 — lihat RENCANA-teknis Fase 2, DETAILING kategori 7
File:         views/settings.js (639), index.js (renderSettingsMenu
              + callback handler ~800 baris)
Config:       semua config keys (via toggle button + settingValue
              + pageForKey)
Catatan:      GRUP 13 = chartIndicators, GRUP 16 = experiments
              (16 flag). Full-sync rule: config baru yang reach
              Telegram harus wire ke settings menu + settingValue
              + pageForKey + CONFIG_MAP + /setcfg + /help +
              SETTINGS-GUIDE.

---

# TIER 2 — IMPACT SEDANG (16 item)

## 2.1 Chart Indicators Gate  [OPSIONAL]
─────────────────────────────────────────────
Apa:          filter teknikal (RSI/Supertrend/Bollinger/Fibonacci)
              sebelum LLM lihat kandidat — 8 entry/exit presets,
              multi-interval combine
Untuk apa:    baca momen masuk, buang pool tidak bullish, exit
              opt-in (exitEnabled) upgrade STAY/CLAIM jadi CLOSE
Vanilla:      tidak punya — yunus tidak filter teknikal
Telegram:     TIDAK langsung — kandidat berkurang (terlihat di
              /candidates count), tidak ada baris "RSI X" di
              pesan user. Exit signal upgrade close → terlihat di
              notif close reason "indicator"
Command:      (tidak ada — via config indicators.enabled)
Dependensi:   tools/screening.js:780 (hard-drop), index.js
              (getIndicatorExitSignal di runManagementCycle)
Env:          (tidak ada — API server-side)
Default:      OFF (indicators.enabled=false, exitEnabled=false)
Fase:         2 — DETAILING kategori 3
File:         tools/chart-indicators.js (366)
Config:       indicators.enabled, indicators.exitEnabled,
              indicators.indicatorRejectAtBottom,
              indicators.entryPreset, indicators.exitPreset,
              indicators.requireAllIntervals, indicators.rsiOversold,
              indicators.rsiOverbought, indicators.intervals,
              indicators.candles
Catatan:      rejectAlreadyAtBottom (default OFF) = veto entry
              kalau token sudah dump ke bawah (RSI oversold +
              close < lower Bollinger). Fit single-side-below.

## 2.2 Candidate Memory + Momentum  [OPSIONAL]
─────────────────────────────────────────────
Apa:          snapshot kandidat TVL/volume/mcap per cycle, simpan
              di candidate-memory.json (bounded 8 snap/pool, 24h
              prune), bandingin delta antar-cycle, momentum +
              yield_to_me + sw_momentum line di prompt SCREENER
Untuk apa:    bot ingat pool, deteksi naik/turun antar screening,
              soft signal (trusted, our metric, never gates deploy)
Vanilla:      tidak punya — yunus tidak track kandidat antar-cycle
Telegram:     TIDAK langsung — momentum/yield/sw lines di prompt
              SCREENER internal, tidak tampil di pesan user.
              counterfactualReview briefing section = terlihat.
Command:      (tidak ada)
Dependensi:   index.js (recordCandidateSnapshots di
              runScreeningCycle), prompt.js (inject line),
              smart-wallets.js (sw count record)
Env:          (tidak ada)
Default:      OFF (experiments.candidateMomentum=false,
              expectedYieldSignal=false, smartWalletMomentum=false,
              counterfactualReview=false)
Fase:         2 — DETAILING kategori 3
File:         candidate-memory.js (209)
Config:       experiments.candidateMomentum,
              experiments.expectedYieldSignal,
              experiments.smartWalletMomentum,
              experiments.counterfactualReview,
              experiments.counterfactualMinMcapGainPct
Catatan:      shared guard — candidate snapshot recorded kalau
              salah satu ON (candidateMomentum OR swMomentum OR
              counterfactual). Pruning shared. Sw snaps buffer
              separate di sw_snaps field. Fail-open (omit line
              on bad inputs).

## 2.3 Deterministic Close Rules  [OPSIONAL]
─────────────────────────────────────────────
Apa:          close otomatis berdasar rule — stop loss, take
              profit, trailing TP, out-of-range wait, yield check,
              peak confirmation queue, trailing drop confirmation
              queue
Untuk apa:    exit terdisiplin, tidak manual, lock profit via
              trailing
Vanilla:      punya dasar — yunus ada SL/TP/OOR, custom tambah
              trailing TP, peak/trailing confirmation queue,
              yield check, indicator exit, deterministic rule
              priority
Telegram:     YA — notif close pakai reason (SL/TP/OOR/indicator/
              yield), terlihat "closed: stop-loss hit"
Command:      (tidak ada — otomatis di management cycle)
Dependensi:   tools/executor.js (safety+conviction), state.js
              (peak/trailing queue), tools/dlmm.js (close branch)
Env:          (tidak ada)
Default:      ON (selalu aktif, core exit logic)
Fase:         2 — DETAILING kategori 4
File:         state.js (+422 peak/trailing/deterministic),
              tools/executor.js (+807 safety+conviction)
Config:       management.stopLossPct, management.takeProfitPct,
              management.trailingTakeProfit,
              management.trailingTriggerPct, management.trailingDropPct,
              management.outOfRangeWaitMinutes, management.minAgeBeforeYieldCheck,
              management.minFeePerTvl24h, management.outOfRangeBinsToClose,
              management.oorCooldownTriggerCount, management.oorCooldownHours,
              experiments.indicatorExitEnabled
Catatan:      getDeterministicCloseRule priority: SL > TP > OOR >
              yield > indicator exit. Peak/trailing queue = 2-step
              confirmation (queue → resolve next poll).

## 2.4 Conviction Sizing  [OPSIONAL]
─────────────────────────────────────────────
Apa:          deploy amount naik/turun sesuai conviction
              (low/medium/high) dari SCREENER, re-clamp ke
              [deployAmountSol, maxDeployAmount]
Untuk apa:    modal lebih besar di pool yakin tinggi, lebih
              kecil di pool ragu
Vanilla:      tidak punya — yunus fixed deploy amount
Telegram:     YA — notif deploy tampil amount beda (0.3 SOL low
              vs 0.65 SOL high)
Command:      (tidak ada — SCREENER supply conviction via tool param)
Dependensi:   config.js (applyConvictionSizing), tools/executor.js
              (mutasi args.amount_y di runSafetyChecks),
              prompt.js (gated prompt line), tools/definitions.js
              (conviction enum di deploy_position)
Env:          (tidak ada)
Default:      OFF (experiments.convictionSizing=false)
Fase:         2 — DETAILING kategori 4
File:         config.js (applyConvictionSizing, +591 total)
Config:       experiments.convictionSizing,
              experiments.convictionSizingMaxAdjustPct (default 30)
Catatan:      applied di top runSafetyChecks, mutation args.amount_y
              → semua downstream check (single-side, exit-liquidity,
              SOL balance) validate adjusted amount. Off/medium/
              missing = unchanged (factory).

## 2.5 Market Regime Gate  [OPSIONAL]
─────────────────────────────────────────────
Apa:          skip screening cycle kalau SOL jatuh >X% dalam 24h,
              read via Jupiter price v3 priceChange24h
Untuk apa:    stop masuk pasar saat badai, hemat LLM token
Vanilla:      tidak punya — yunus tidak gate makro
Telegram:     TIDAK langsung — cycle skip (terlihat di cycle
              report "skipped: market regime"), tidak ada notif
              khusus
Command:      (tidak ada)
Dependensi:   tools/wallet.js (getSolMarketRegime), index.js
              (hard-guard di runScreeningCycle), decision-log.js
              (appendDecision skip)
Env:          (tidak ada — read-only Jupiter)
Default:      OFF (experiments.marketRegimeGate=false)
Fase:         2 — DETAILING kategori 2
File:         tools/wallet.js (getSolMarketRegime, +238 total),
              index.js (gate)
Config:       experiments.marketRegimeGate,
              experiments.marketRegimeMaxDrop24hPct (default 8)
Catatan:      catches scheduled + freed-slot screening (both route
              through runScreeningCycle). Manual chat deploys NOT
              gated. Runs under DRY_RUN too (read-only). No price
              history stored — 24h delta from API direct.

## 2.6 Exit Liquidity Check  [OPSIONAL]
─────────────────────────────────────────────
Apa:          probe slippage keluar pool sebelum deploy
              (quoteSellPriceImpact via Jupiter quote, no real tx),
              reject kalau cost > exitLiquidityMaxSlippagePct
Untuk apa:    tolak pool terlalu illiquid untuk exit (rug risk)
Vanilla:      tidak punya — yunus tidak probe exit cost
Telegram:     TIDAK langsung — deploy reject (terlihat di safety
              check fail reason "exit liquidity cost too high")
Command:      (tidak ada)
Dependensi:   tools/wallet.js (quoteSellPriceImpact),
              tools/executor.js (pre-deploy gate di runSafetyChecks)
Env:          (tidak ada — Jupiter quote read-only)
Default:      OFF (experiments.exitLiquidityCheck=false)
Fase:         2 — DETAILING kategori 2
File:         tools/wallet.js (quoteSellPriceImpact),
              tools/executor.js (gate)
Config:       experiments.exitLiquidityCheck,
              experiments.exitLiquidityMaxSlippagePct (default 10)
Catatan:      skipped under DRY_RUN? No — runs under DRY_RUN too
              (read-only Jupiter quote). Pre-deploy gate.

## 2.7 Signal Tracker + Weights  [OPSIONAL]
─────────────────────────────────────────────
Apa:          catat sinyal saat deploy (stageSignals), hitun bobot
              sinyal prediktif (recalculateWeights dari performa
              closed positions, darwin evolution)
Untuk apa:    belajar sinyal mana yang bikin profit, weights
              evolve over time
Vanilla:      tidak punya — yunus tidak track signal
Telegram:     YA — /report tampil weights summary, briefing
              "signal weights" section
Command:      (tidak ada — otomatis di deploy + post-close)
Dependensi:   tools/executor.js (stageSignals di deploy),
              lessons.js (recalculateWeights post-close),
              prompt.js (getWeightsSummary inject SCREENER)
Env:          (tidak ada)
Default:      ON (darwinEnabled=true)
Fase:         2 — DETAILING kategori 4 + 5
File:         signal-tracker.js (91), signal-weights.js (336)
Config:       darwinEnabled, darwinWindowDays,
              darwinRecalcEvery, darwinBoost, darwinDecay,
              darwinFloor, darwinCeiling, darwinMinSamples
Catatan:      darwin = weight evolution engine. recalculateWeights
              run on livePerf only (paper filtered). Weights
              influence SCREENER prompt soft signal.

## 2.8 Time-of-Day Profile  [OPSIONAL]
─────────────────────────────────────────────
Apa:          bucket performa per sesi WIB (dini/pagi/siang/sore/
              malam, 5 coarse buckets), adaptive screening
              interval — stretch ke ceiling kalau sesi historis
              lemah
Untuk apa:    hemat LLM token di sesi lemah, screening lebih
              sering di sesi bagus
Vanilla:      tidak punya — yunus fixed interval
Telegram:     YA — /report tampil time profile section (per-session
              win-rate/avg PnL/sample), /get_time_profile tool
Command:      /get_time_profile (LLM tool, SCREENER + GENERAL)
Dependensi:   lessons.js (getHourlyProfile/classifySession/
              currentWibSession/getTimeProfileForPrompt),
              index.js (shouldRunScheduledScreening gate),
              prompt.js (inject SCREENER line)
Env:          (tidak ada)
Default:      OFF (schedule.adaptiveScreening=false)
Fase:         2 — DETAILING kategori 5
File:         lessons.js (getHourlyProfile/classifySession, +753
              total)
Config:       schedule.adaptiveScreening,
              schedule.maxScreeningIntervalMin (default 90),
              schedule.screeningIntervalMin (default 30)
Catatan:      MIN_SESSION_SAMPLES=8 sebelum steer. "weak" =
              win-rate ≥15pp under overall AND negative avg PnL.
              Management & PnL-poll cadence NEVER throttled.
              Event-driven screening bypass gate.

## 2.9 Narrative Profile  [OPSIONAL]
─────────────────────────────────────────────
Apa:          bucket performa per naratif token (8 kategori:
              animal/ai/political/celebrity/meme/culture/
              tech_utility/other), SCREENER tag narrative_category
              at deploy, passive collection
Untuk apa:    tahu naratif apa yang untung, soft prompt hint
              best/weakest narratives
Vanilla:      tidak punya — yunus tidak kategorisasi naratif
Telegram:     YA — /report tampil narrative section, briefing
              narrative breakdown, /get_narrative_profile tool
Command:      /get_narrative_profile (LLM tool, SCREENER + GENERAL)
Dependensi:   lessons.js (getNarrativeProfile/classifyNarrative/
              getNarrativeProfileForPrompt/NARRATIVE_CATEGORIES),
              tools/executor.js (tag via deploy_position →
              trackPosition → makePositionRecord → close path),
              prompt.js (gated prompt line)
Env:          (tidak ada)
Default:      OFF (experiments.narrativeProfileSignal=false).
              Tagging collected passively even when off.
Fase:         2 — DETAILING kategori 5
File:         lessons.js (getNarrativeProfile/classifyNarrative,
              +753 total), tools/definitions.js
              (narrative_category enum di deploy_position)
Config:       experiments.narrativeProfileSignal,
              narrative_category enum (tag, not config)
Catatan:      needs ≥8 samples/category before steer. Flag gates
              ONLY prompt line (prompt.js SCREENER). Tagging
              collected passively even when off so data accrues.
              Soft, never overrides hard rules.

## 2.10 Trade Analytics Reports  [OPSIONAL]
─────────────────────────────────────────────
Apa:          engine analitik trade — profit factor, max
              drawdown, payoff ratio, expectancy, win rate, avg
              win vs avg loss, worst loss streak, biggest win/
              loss, per-strategy/session/narrative/close-rule
              breakdown, price_movement block (MAE from active-bin
              movement)
Untuk apa:    ukur performa kuantitatif, tuning parameter dari
              data, rekomendasi profitability-aware
Vanilla:      punya dasar — yunus punya ringkas win/lose count,
              custom = full analytics engine
Telegram:     YA — /report [week|month|day] tampil full report,
              briefing stats block + verdict + rekomendasi,
              milestone report
Command:      /report, /report week, /report month, /report day
Dependensi:   lessons.js (getAllPerformance/getModePerformance),
              briefing.js (buildTradeReport shared), index.js
              (maybeFireLearningReport milestone)
Env:          (tidak ada)
Default:      ON (selalu aktif kalau briefing enabled)
Fase:         2 — DETAILING kategori 5
File:         reports.js (642)
Config:       reports.learningReportEvery (default 10, 0=off),
              reports.learningReportTrendN
Catatan:      buildRecommendations profitability-aware — refuses
              suggest bigger size while net-negative or profit
              factor weak. classifyCloseRule maps free-text
              close_reason to canonical rules. buildRoleCostLines
              LLM cost per agent role.

## 2.11 Cost Trackers (gas/llm/sol/pnl/openrouter)  [OPSIONAL]
─────────────────────────────────────────────
Apa:          catat biaya operasional — gas per tx (recordGasFee
              via trackTxGas), LLM cost per role (recordLlmCost),
              SOL balance track (recordSolBalance, setTrackStart),
              PnL tracker (getPnlTracker), OpenRouter balance/
              credits/24h cost
Untuk apa:    hitung ROI bersih (profit kotor - cost), monitoring
              burn rate LLM
Vanilla:      tidak punya — yunus tidak track cost
Telegram:     YA — /status /wallet tampil tracker (SOL track PnL,
              gas total, LLM cost), briefing cost section (LLM
              per-role + gas est + net-vs-all-cost)
Command:      /wallet trackstart YYYY-MM-DD, /wallet trackstart off,
              /wallet trackstart clear
Dependensi:   index.js (record poll di runManagementCycle),
              tools/executor.js (recordLlmCost per agent call,
              trackTxGas per tx), briefing.js (cost section)
Env:          (tidak ada)
Default:      ON (selalu aktif)
Fase:         2 — DETAILING kategori 5
File:         gas-tracker.js (79), llm-cost-tracker.js (68),
              sol-tracker.js (187), pnl-tracker.js (78),
              openrouter-usage.js (97)
Config:       llm.managementModel, llm.screeningModel,
              llm.generalModel (per-role cost mapping)
Catatan:      buildRoleCostLines precise kalau models differ,
              labelled estimate kalau shared. estimateGasSol =
              rough per-action (deploy/close/claim/swap × per-
              action SOL). Precise gas butuh per-tx meta.fee
              capture (not yet done).

## 2.12 PnL Polling (tools/pnl.js, tools/smi.js)  [OPSIONAL]
─────────────────────────────────────────────
Apa:          poll PnL posisi aktif via API eksternal (bukan
              hitung sendiri), cache deposit TTL, SMI indicator
Untuk apa:    PnL real-time lebih akurat, trigger SL/TP/trailing
              berdasar PnL live
Vanilla:      punya dasar — yunus hitung PnL sendiri dari bin
              reserves, custom = poll API eksternal lebih akurat
Telegram:     YA — /positions tampil PnL live, trigger SL/TP
              terlihat di notif close reason
Command:      (tidak ada — otomatis di management cycle)
Dependensi:   index.js (poll di runManagementCycle), state.js
              (updatePnlAndCheckExits), tools/dlmm.js (fallback)
Env:          (tidak ada — API URL via config)
Default:      OFF sampai pnlSource set
Fase:         2 — DETAILING kategori 4 + 5
File:         tools/pnl.js (350), tools/smi.js (166)
Config:       pnlSource, pnlRpcUrl, pnlPollIntervalSec,
              pnlDepositCacheTtlSec
Catatan:      fallback ke hitung sendiri kalau API down. SMI =
              Stochastic Momentum Index (auxiliary indicator).

## 2.13 Pool Memory + Deploy History  [OPSIONAL]
─────────────────────────────────────────────
Apa:          snapshot per-pool (TVL/volume/fee/bin range) +
              history deploy + cooldown (repeatDeployCooldown*)
Untuk apa:    bot ingat pool, hindari re-deploy cepat, cooldown
              per pool/token
Vanilla:      punya dasar — yunus ada pool-memory dasar, custom
              tambah cooldown + snapshot detail + addPoolNote
Telegram:     TIDAK langsung — cooldown terlihat saat deploy
              reject "pool in cooldown"
Command:      (tidak ada)
Dependensi:   index.js (recordPositionSnapshot di management
              cycle), tools/executor.js (cooldown check pre-deploy)
Env:          (tidak ada)
Default:      ON (selalu aktif)
Fase:         2 — DETAILING kategori 4
File:         pool-memory.js (+183)
Config:       repeatDeployCooldownEnabled,
              repeatDeployCooldownTriggerCount,
              repeatDeployCooldownHours, repeatDeployCooldownScope,
              repeatDeployCooldownMinFeeEarnedPct
Catatan:      cooldown scope = pool atau token. minFeeEarnedPct =
              skip cooldown kalau fee earned cukup.

## 2.14 Smart Wallets Ext  [OPSIONAL]
─────────────────────────────────────────────
Apa:          KOL/alpha wallet tracker per pool, sw_momentum
              (count change antar-cycle), sw.in_pool line di
              prompt SCREENER
Untuk apa:    tahu smart wallet masuk/keluar pool, sinyal sosial
Vanilla:      punya dasar — yunus ada smart-wallets.js dasar,
              custom tambah sw_momentum + sw.in_pool format
Telegram:     TIDAK langsung — sw_momentum: line di prompt
              SCREENER internal, tidak tampil di pesan user
Command:      (tidak ada)
Dependensi:   smart-wallets.js (checkSmartWalletsOnPool),
              candidate-memory.js (recordSmartWalletCounts +
              getSmartWalletMomentum + formatSmartWalletMomentum),
              index.js (record dari passing after sw fetch)
Env:          (tidak ada)
Default:      OFF (experiments.smartWalletMomentum=false)
Fase:         2 — DETAILING kategori 2 + 3
File:         smart-wallets.js (+7), candidate-memory.js
              (sw_snaps buffer)
Config:       experiments.smartWalletMomentum
Catatan:      sw_snaps shared candidate-snapshot guard. Snapshot
              accrue only when on. Pruning shared dengan
              recordCandidateSnapshots. Entering = bullish,
              leaving = bearish. Flat/unknown → no line.

## 2.15 Envcrypt  [WAJIB]
─────────────────────────────────────────────
Apa:          enkripsi private key wallet, file kunci terpisah
              dari .env (envryptEncrypt/envryptDecrypt), loadEnv
              auto-decrypt sebelum config load
Untuk apa:    secret tidak plain-text, aman kalau server bocor,
              isolasi secret per-profil (paritas root)
Vanilla:      tidak punya — yunus plain .env
Telegram:     TIDAK — internal, hanya terlihat kalau gagal
              decrypt bot error di log
Command:      (tidak ada — via env + scripts/envrypt.js CLI)
Dependensi:   index.js (import "./envcrypt.js" line 1, side-effect
              load env sebelum config), paths.js (env path per-
              profil)
Env:          WALLET_PRIVATE_KEY (encrypted), ENVCRYPT_KEY_PATH
              (file kunci)
Default:      ON (selalu aktif, foundation paket)
Fase:         1 — DETAILING kategori 2 + 12
File:         envcrypt.js (128), scripts/envrypt.js (34)
Config:       envcrypt key path (via paths.js)
Catatan:      loadEnv override=true → override process.env kalau
              ada encrypted value. Kalau tidak ada encrypted →
              fallback plain .env (backward-compatible). Isolasi
              per-profil: .env/.envrypt ikut paths.dataDir.

## 2.16 Dev Blocklist  [OPSIONAL]
─────────────────────────────────────────────
Apa:          daftar hitam developer token scam, tolak pool dari
              dev ini (isDevBlocked), block/unblock via command
Untuk apa:    filter sosial (dev nakal), cegah deploy ke pool
              buatan dev berburuk
Vanilla:      tidak punya — yunus tidak filter dev
Telegram:     sebagian — /block_deployer /unblock_deployer
              /list_blocked_deployers command, reject deploy
              tampil alasan "dev blocked"
Command:      /block_deployer, /unblock_deployer,
              /list_blocked_deployers (LLM tool, GENERAL)
Dependensi:   tools/executor.js (isDevBlocked check pre-deploy),
              tools/definitions.js (3 tool schemas)
Env:          (tidak ada)
Default:      ON (selalu aktif, list bisa kosong)
Fase:         2 — DETAILING kategori 2
File:         dev-blocklist.js (66)
Config:       (blocked devs list di file json, tidak di config)
Catatan:      blockDev({wallet, reason, label}) → persist. getBlockedDevs
              list. Bisa kosong = no-op (factory behavior).

---

# TIER 3 — IMPACT KECIL (10 item)

## 3.1 Decision Log  [OPSIONAL]
─────────────────────────────────────────────
Apa:          audit trail keputusan bot — appendDecision catat
              skip/deploy/close + alasan, getRecentDecisions,
              getDecisionSummary untuk prompt SCREENER
Untuk apa:    review belajar ("kenapa skip pool X yang ternyata
              naik 5x?"), konteks keputusan di prompt
Vanilla:      tidak punya — yunus log teknis saja
Telegram:     sebagian — get_recent_decisions tool (LLM pakai),
              prompt SCREENER baris "recent decisions". User
              tidak langsung lihat command.
Command:      get_recent_decisions (LLM tool, SCREENER + GENERAL)
Dependensi:   index.js (appendDecision di skip path: regime gate,
              screening skip), prompt.js (inject summary)
Env:          (tidak ada)
Default:      ON (selalu aktif)
Fase:         1 — DETAILING kategori 1
File:         decision-log.js (68)
Config:       (tidak ada)
Catatan:      appendDecision entry = {action, reason, ts, meta}.
              Bounded log (recent N). getDecisionSummary limit=6
              default.

## 3.2 Config Schema Validator  [OPSIONAL]
─────────────────────────────────────────────
Apa:          skema validasi config value — CONFIG_SCHEMA map
              tipe/jangkauan, validateConfigValue, SCHEMA_KEYS
Untuk apa:    cegah config salah format, reject value invalid
              sebelum apply
Vanilla:      tidak punya — yunus tidak validate config
Telegram:     sebagian — /setcfg reject value invalid tampil error
              "invalid: <reason>"
Command:      (tidak ada — internal /setcfg + update_config)
Dependensi:   tools/executor.js (CONFIG_MAP + validateConfigValue),
              config.js
Env:          (tidak ada)
Default:      ON (selalu aktif)
Fase:         2 — DETAILING kategori 11
File:         config-schema.js (285)
Config:       SCHEMA_KEYS (derived dari CONFIG_SCHEMA)
Catatan:      validateConfigValue return {ok, error}. CONFIG_MAP
              = flat key → [section, field] mapping. Schema cek
              tipe + range + enum.

## 3.3 Config Origin Map  [OPSIONAL]
─────────────────────────────────────────────
Apa:          peta asal-usul config — ORIGIN_SECTIONS,
              ORIGIN_NOTES, SUB_CLUSTER_META, KEY_SUBCLUSTER,
              L4_CHILDREN, CORE_GROUPS, FUNCTION_GROUPS
Untuk apa:    /config origin tampil hierarki config, dokumentasi
              struktur config
Vanilla:      tidak punya — yunus /config basic
Telegram:     YA — /config origin command tampil hierarki
Command:      /config origin, /config core
Dependensi:   index.js (command handler), views/config.js
Env:          (tidak ada)
Default:      ON (selalu aktif)
Fase:         2 — DETAILING kategori 11
File:         config-origin.js (578)
Config:       (tidak ada — static map)
Catatan:      CORE_GROUPS vs FUNCTION_GROUPS = 2 axis klasifikasi.
              L4_CHILDREN = leaf config keys per sub-cluster.

## 3.4 Screening Scales  [OPSIONAL]
─────────────────────────────────────────────
Apa:          scaling threshold screening per timeframe
              (5m/1h/4h/1d) — TIMEFRAME_SCREENING_SCALES,
              normalizeTimeframe, getScreeningDefaultsForTimeframe
Untuk apa:    threshold adaptif sesuai timeframe, default berbeda
              per interval
Vanilla:      tidak punya — yunus fixed threshold
Telegram:     TIDAK — internal config scaling
Command:      (tidak ada)
Dependensi:   config.js (scaleScreeningToTimeframe, reloadScreeningThresholds)
Env:          (tidak ada)
Default:      ON (selalu aktif)
Fase:         2 — DETAILING kategori 3
File:         screening-scales.js (34), config.js
              (scaleScreeningToTimeframe, +591 total)
Config:       timeframe, TIMEFRAME_SCREENING_SCALES
Catatan:      normalizeTimeframe accept "5m"/"5min"/"5MIN" →
              "5m". getScreeningDefaultsForTimeframe return
              default minTvl/volume/holders per tf.

## 3.5 Logger Audit Hook  [OPSIONAL]
─────────────────────────────────────────────
Apa:          tambah audit trail hook di logger, action audit
              trail (terpisah dari log teknis)
Untuk apa:    log keputusan strategis (bukan hanya teknis debug)
Vanilla:      punya dasar — yunus logger dasar, custom tambah
              audit hook
Telegram:     TIDAK — file log saja
Command:      (tidak ada)
Dependensi:   logger.js (audit hook), decision-log.js
Env:          (tidak ada)
Default:      ON (selalu aktif)
Fase:         1 — DETAILING kategori 1
File:         logger.js (+4)
Config:       (tidak ada)
Catatan:      minor modifikasi (4 baris). Audit trail utama di
              decision-log.js, logger hanya hook.

## 3.6 Token Blacklist Ext  [OPSIONAL]
─────────────────────────────────────────────
Apa:          modifikasi minor token-blacklist.js
Untuk apa:    blacklist token (permanent, persist)
Vanilla:      punya dasar — yunus ada token-blacklist.js, custom
              tweak minor
Telegram:     TIDAK — internal
Command:      (tidak ada)
Dependensi:   tools/executor.js (check pre-deploy)
Env:          (tidak ada)
Default:      ON (selalu aktif)
Fase:         2 — DETAILING kategori 4
File:         token-blacklist.js (+4)
Config:       (token blacklist di file json)
Catatan:      minor (+4 baris). Permanent blacklist vs pool-
              memory cooldown.

## 3.7 Strategy Library Ext  [OPSIONAL]
─────────────────────────────────────────────
Apa:          modifikasi minor strategy-library.js
Untuk apa:    strategy save/load (saved LP strategies)
Vanilla:      punya dasar — yunus ada strategy-library.js, custom
              tweak minor
Telegram:     TIDAK — internal
Command:      (tidak ada)
Dependensi:   tools/executor.js (getActiveStrategy di deploy)
Env:          (tidak ada)
Default:      ON (selalu aktif)
Fase:         2 — DETAILING kategori 4
File:         strategy-library.js (+4)
Config:       strategy (config key)
Catatan:      minor (+4 baris). strategy-library.json store.

## 3.8 Setup Wizard  [OPSIONAL]
─────────────────────────────────────────────
Apa:          onboarding interaktif first-run — prompt env,
              config, profil, generate .env + user-config.json
Untuk apa:    ganti manual edit config, mudah untuk user baru
Vanilla:      punya dasar — yunus ada setup.js basic, custom
              tambah profil + envcrypt + racikan prompt
Telegram:     TIDAK — terminal first-run
Command:      (tidak ada — terminal `node setup.js`)
Dependensi:   envcrypt.js (generate encrypted env), addprofil.js
              (scaffold profil), paths.js
Env:          (generate semua env)
Default:      (hanya first-run, tidak persistent state)
Fase:         2 — DETAILING kategori 13
File:         setup.js (+664)
Config:       generate semua config
Catatan:      restoreSteps = langkah restore dari backup. Anti-
              warisan = env template tanpa field legacy.

## 3.9 CLI/REPL Mirror  [OPSIONAL]
─────────────────────────────────────────────
Apa:          perintah Telegram mirror di terminal (cli.js) —
              semua command Telegram jalan di REPL
Untuk apa:    kontrol bot dari terminal tanpa Telegram, debug
Vanilla:      punya dasar — yunus ada REPL minimal di index.js,
              custom = full mirror cli.js
Telegram:     TIDAK — terminal only
Command:      (mirror semua command Telegram di terminal)
Dependensi:   index.js (REPL integration readline), semua
              command handler
Env:          (tidak ada)
Default:      ON (selalu aktif kalau jalankan cli.js)
Fase:         2 — DETAILING kategori 13
File:         cli.js (354)
Config:       (tidak ada)
Catatan:      cli.js = entry point alternatif. Bisa `node cli.js`
              bukan `node index.js`.

## 3.10 Guide Command  [OPSIONAL]
─────────────────────────────────────────────
Apa:          /guide tampil panduan setting dari SETTINGS-GUIDE.md
              — render section, argumen
Untuk apa:    baca doc di Telegram, mudah reference
Vanilla:      tidak punya — yunus tidak ada /guide
Telegram:     YA — /guide, /guide <section>
Command:      /guide, /guide <section>
Dependensi:   guide.js (renderGuide), SETTINGS-GUIDE.md (source)
Env:          (tidak ada)
Default:      ON (selalu aktif)
Fase:         2 — DETAILING kategori 5 + 13
File:         guide.js (172), SETTINGS-GUIDE.md (1693)
Config:       (tidak ada)
Catatan:      SETTINGS-GUIDE = 1693 baris, GRUP 1-16. renderGuide
              parse section by header.

---

# TIER 4 — IMPACT MINIM (6 item)

## 4.1 Backup Script  [OPSIONAL]
─────────────────────────────────────────────
Apa:          script backup data bot — backup.sh
Untuk apa:    backup state/lessons/presets/secrets ke tar.gz
Vanilla:      tidak punya — yunus tidak ada backup script
Telegram:     TIDAK — ops
Command:      (tidak ada — shell `./backup.sh`)
Dependensi:   paths.js (data-dir)
Env:          (tidak ada)
Default:      (manual run, tidak persistent)
Fase:         1 — DETAILING kategori 13
File:         backup.sh (89)
Config:       (tidak ada)
Catatan:      ops tool, tidak terintegrasi cron. Manual run.

## 4.2 PM2 Ecosystem Config  [OPSIONAL]
─────────────────────────────────────────────
Apa:          konfigurasi PM2 process manager — ecosystem.config.cjs
Untuk apa:    jalankan bot via PM2 (auto-restart, logs, monitoring)
Vanilla:      tidak punya — yunus tidak pakai PM2
Telegram:     TIDAK — ops
Command:      (tidak ada — shell `pm2 start ecosystem.config.cjs`)
Dependensi:   pm2 (npm global)
Env:          (tidak ada)
Default:      (ops, tidak persistent state)
Fase:         1 — DETAILING kategori 13
File:         ecosystem.config.cjs (27)
Config:       (PM2 config, bukan bot config)
Catatan:      auto-restart under pm2 kalau /preset use swap file
              (env-level keys butuh fresh process).

## 4.3 Test Scripts  [OPSIONAL]
─────────────────────────────────────────────
Apa:          test screening offline (test-screening.js), smoke
              test sizing (smoke-sizing-v2.1.js), backtest
              parameter (backtest-binwidth.js, backtest-exits.js),
              patch-anchor utility (patch-anchor.js)
Untuk apa:    dev tool, verifikasi parameter, uji strategi
              historis
Vanilla:      tidak punya — yunus tidak punya test harness
Telegram:     TIDAK — dev tool
Command:      (tidak ada — shell `node scripts/<name>.js`)
Dependensi:   (standalone, tidak runtime import)
Env:          (tergantung script)
Default:      (manual run)
Fase:         1 — DETAILING kategori 5 + 13
File:         test-screening.js (56), scripts/smoke-sizing-v2.1.js
              (95), scripts/backtest-binwidth.js (289),
              scripts/backtest-exits.js (211), scripts/patch-anchor.js
              (+9)
Config:       (tergantung script)
Catatan:      backtest = tuning parameter learning (bin width,
              exit rules) pakai data historis. smoke = verify
              sizing formula. patch-anchor = utility patcher
              (sudah ada, dimodifikasi).

## 4.4 Hive Mind  [OPSIONAL]
─────────────────────────────────────────────
Apa:          sync ke server kolektif intelligence — share
              lessons + deploy event, query consensus pattern,
              pull lessons/presets, background sync, agent
              registration
Untuk apa:    bot belajar dari koloni (collective intelligence),
              share pengalaman antar bot
Vanilla:      tidak punya — yunus bot tunggal
Telegram:     sebagian — /hive command tampil status sync,
              briefing hive section
Command:      /hive (LLM tool / Telegram command)
Dependensi:   index.js (bootstrapHiveMind + registerHiveMindAgent
              + startHiveMindBackgroundSync di boot),
              tools/executor.js (pushHiveLesson + pushHivePerformanceEvent
              post-close, skip paper), lessons.js (pushHiveLesson
              on evolve), pool-memory.js (recordPoolDeploy, skip
              paper)
Env:          HIVE_MIND_URL wajib, HIVE_MIND_API_KEY wajib
Default:      OFF sampai HIVE_MIND_URL + HIVE_MIND_API_KEY set
Fase:         2 — DETAILING kategori 10
File:         hivemind.js (367), docs/hivemind-reference.md (128),
              docs/hivemind-summary.md (82)
Config:       hiveMindUrl, hiveMindApiKey, hiveMindPullMode,
              agentId, publicApiKey, agentMeridianApiUrl,
              lpAgentRelayEnabled
Catatan:      opsional, butuh env. Paper close skip push (isolasi).
      ensureAgentId generate + persist agent ID. getHiveMindPullMode
      = manual/auto sync mode.

## 4.5 Dokumentasi  [OPSIONAL]
─────────────────────────────────────────────
Apa:          dokumentasi proyek — CLAUDE.md (AI context),
              SETTINGS-GUIDE.md (/guide source), journals
              pengembangan, audit notes, roadmap, README,
              hivemind reference
Untuk apa:    dokumentasi arsitektur + cara pakai + context AI
              assistant + audit trail pengembangan
Vanilla:      punya dasar — yunus README singkat, custom = full
              doc set
Telegram:     TIDAK langsung (SETTINGS-GUIDE via /guide)
Command:      (tidak ada — /guide baca SETTINGS-GUIDE)
Dependensi:   guide.js (baca SETTINGS-GUIDE)
Env:          (tidak ada)
Default:      ON (selalu ada di repo)
Fase:         1 — DETAILING kategori 14
File:         CLAUDE.md (332), SETTINGS-GUIDE.md (1693),
              MAINZEN-V2-JOURNAL.md (111), MAINZEN-V3-WORKFLOW.md
              (93), NEXT-SESSION.md (52), README.md (+107),
              notes/* (~80 file, diprun di Step 0), docs/hivemind-*,
              scratchpad/*
Config:       (tidak ada)
Catatan:      CLAUDE.md = context file AI assistant (arsitektur,
              konvensi, eksperimen, full-sync rule). SETTINGS-
              GUIDE = 1693 baris, GRUP 1-16, /guide source.

## 4.6 Meta Config (.env.example, .gitignore, package.json, gmgn-config.example.json)  [OPSIONAL]
─────────────────────────────────────────────
Apa:          template + meta config — .env.example (template env
              anti-warisan), .gitignore (ignore profiles/exports/
              backups), package.json (scripts bin), gmgn-config.
              example.json (template GMGN config)
Untuk apa:    template untuk user baru, ignore file generated,
              scripts entry point
Vanilla:      punya dasar — yunus punya .env.example + .gitignore
              + package.json, custom tambah field anti-warisan +
              ignore profiles/exports + scripts bin
Telegram:     TIDAK
Command:      (tidak ada)
Dependensi:   setup.js (baca .env.example), git (baca .gitignore),
              npm (baca package.json)
Env:          .env.example = template (anti-warisan = tanpa field
              legacy)
Default:      ON (selalu ada di repo)
Fase:         1 — DETAILING kategori 14
File:         .env.example (+30), .gitignore (+27),
              package.json (+12), gmgn-config.example.json (51)
Config:       (template, bukan config aktif)
Catatan:      .env.example = 14 field anti-warisan + 2 slot LLM
              (template envcrypt). .gitignore = profiles/ exports/
              backups/ .env .envrypt.

---

# RINGKAS: TERLIHAT TELEGRAM vs INTERNAL

| Tier | Total | Terlihat Telegram dominan | Internal / sebagian |
|---|---|---|---|
| 1 BESAR | 7 | 7 (paper, GMGN, profil, preset, briefing, views, settings) | 0 |
| 2 SEDANG | 16 | 8 (close rules, conviction, signal weights, time profile, narrative, reports, cost trackers, PnL polling, dev blocklist sebagian) | 8 (chart indicators, candidate memory, regime gate, exit liquidity, pool memory, smart wallets, envcrypt, screening scales) |
| 3 KECIL | 10 | 3 (decision log via tool, config origin, guide) | 7 (schema, scales, logger, blacklist, strategy, setup, CLI) |
| 4 MINIM | 6 | 1 (hive sebagian) | 5 (backup, PM2, test, docs, meta) |
| **TOTAL** | **39** | **19 dominan terlihat** | **20 internal/sebagian** |

## Distribusi badge

| Badge | Jumlah | Item |
|---|---|---|
| [WAJIB] | 5 | multi-profil (1.3), views UI (1.6), envcrypt (2.15), paths.js + repo-root.js (always-on core, tidak di list) |
| [OPSIONAL] | 34 | sisanya |

## Distribusi Fase ekstrak

| Fase | Jumlah | Karakteristik |
|---|---|---|
| 1 (drop-in) | 9 | side-effect import, standalone script, docs |
| 2 (butuh hook + call site) | 30 | library/tool/command/view, butuh wiring di core |

## Distribusi Default state

| Default | Jumlah | Catatan |
|---|---|---|
| ON selalu | 18 | foundation + fitur aktif default |
| OFF eksperimen | 8 | experiments.* flag (paper, GMGN, indicators, momentum, conviction, regime, exit liq, narrative, sw momentum, counterfactual) |
| OFF sampai env/config set | 4 | hive (env), PnL polling (pnlSource), GMGN (apiKey), addprofil manual |
| Manual run | 4 | backup, PM2, test scripts, setup wizard |
| Tidak persistent | 1 | docs (selalu ada di repo) |

---

## CATATAN PENUTUP

- Klasifikasi ini = impact SAJA. Bukan rencana eksekusi (lihat
  `RENCANA-teknis-pemisahan-custom.md`), bukan peta kategori
  file (lihat `DETAILING-custom-topdown.md`).
- Tier = urutan prioritas kalau mau paham custom-mu dari paling
  berdampak. Bukan urutan eksekusi.
- Badge [WAJIB] = foundation paket. [OPSIONAL] = nice-to-have.
- Terlihat Telegram = user langsung lihat fitur aktif. Internal
  = LLM/bot pakai tapi user tidak langsung lihat.
- Vanilla yunus = "tidak punya" (fitur baru), "punya dasar"
  (upgrade fitur yunus), "punya sama" (tidak ada di list —
  custom-mu hanya yang berbeda).
- Default state = kondisi saat ini di custom-mu (existing user).
  Saat install paket di fresh clone yunus, default bisa beda
  (lihat RENCANA-teknis Fase 1 manifest).

## PASANGAN DOKUMEN

- `RENCANA-teknis-pemisahan-custom.md` — arsitektur hook bus +
  patcher + eksekusi 3 fase
- `PANDUAN-awam-pemisahan-custom.md` — glosarium + analogi + FAQ
- `DETAILING-custom-topdown.md` — peta 14 kategori urut eksekusi +
  tabel modul index
- `KLASIFIKASI-impact-custom.md` — file ini, 39 item urut impact
  BESAR → KECIL
