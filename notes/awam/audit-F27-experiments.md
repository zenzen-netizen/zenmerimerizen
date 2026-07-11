# Audit F27 — Experiments (GRUP 16) + indicators config surface — 🧪 fail-open contract + path verification
> Read-only. Bukti `file:line`. UNKNOWN kalau tak pasti. Resume: buka file ini.
> Kedalaman: ⬛⬛ mandatory — alasan: 11 experiment flag + 1 opt-in indicator-exit + 1 opt-in rejectAtBottom + 1 LIVE-only usePaperHistoryWhenLive + use-only-when-DRY_RUN paperTrading `isPaperMode()` AND gate. CLAUDE.md eksplisit "Every flag defaults to false → OFF = factory: code path skipped entirely. Toggle OFF always returns to pre-feature." 6-surface full-sync (CONFIG_MAP/definitions/formatFullConfig/renderSettingsMenu/BOT_COMMANDS/SETTINGS-GUIDE). Fail-open contract: "an error in an experiment NEVER blocks the normal flow." Live: hanya 2 flag ON (`counterfactualReview` + `idleScreeningCooldown`), 9 lain OFF (factory). Verifikasi 11-path code-side konsisten dengan dokumentasi CLAUDE.md. Live ekstrak: `indicators.enabled=true`, `entryPreset=supertrend_break`, `exitEnabled=false` (opt-in OFF), `rejectAlreadyAtBottom=true` (opt-in ON live).
> Cross-ref: F26 (config.js experiments + indicators section surface), F24 (buildRecommendations config-read), F15 (candidate-memory backing utk momentum/sw_momentum/counterfactual), F22 (getModePerformance paper/live, getNarrativeProfile — narrativeProfileSignal consumer), F28 (CONFIG_MAP executor.js:476-496 utk 2 indicator + 2 idleScreening), F30 (/config GRUP 16 + /settings page + /setcfg toggle), F29 (paths.js experiments default OFF), F32 (paper-trading.js full lifecycle), F13 (DRY_RUN paper cabang dlmm.js integration).

## Ringkasan eksekutif (5 baris)
1. **11 experiment flag, semua default `false`, tabel CLAUDE.md sinkron — verifikasi live 2/11 ON**. config.js:404-479 `experiments` section: `exitLiquidityCheck` (`:408` + `exitLiquidityMaxSlippagePct:10` `:409`), `marketRegimeGate` (`:414` + `marketRegimeMaxDrop24hPct:8` `:415`), `candidateMomentum` (`:420`), `narrativeProfileSignal` (`:425`), `expectedYieldSignal` (`:431`), `convictionSizing` (`:436` + `convictionSizingMaxAdjustPct:30` `:437`), `counterfactualReview` (`:443` + `counterfactualMinMcapGainPct:25` `:444`), `smartWalletMomentum` (`:450`), `idleScreeningCooldown` (`:458` + `idleScreeningCooldownMin:20` `:459`), `paperTrading` (`:469`, DRY-RUN-ONLY via `isPaperMode` AND-gate), `usePaperHistoryWhenLive` (`:478`, LIVE-only opt-in). Live: `candidateMomentum=false`, `narrativeProfileSignal=false`, `expectedYieldSignal=false`, `counterfactualReview=true`, `smartWalletMomentum=false`, `idleScreeningCooldown=true`, 5 lain unset=false. **Factory invariant preserved**: OFF = code path skipped entirely (byte-identical pre-feature). Path verification 11-path code-side konsisten dgn CLAUDE.md docs (lihat §D).
2. **Indicators config (entry enabled default ON via user-config true; exit opt-in OFF; rejectAtBottom opt-in OFF)**. config.js:368-397 `indicators` section dari `u.chartIndicators ?? {}` pre-extract (`:68`). Field: `enabled` (default false, TAPI live=true), `entryPreset` "supertrend_break", `exitPreset` "supertrend_break", `exitEnabled` (default false — opt-in, inert saat OFF; live=false), `intervals` `["5_MINUTE"]` (live `["5_MINUTE","15_MINUTE"]`), `candles` 298, `rsiLength` 2, `rsiOversold` 30, `rsiOverbought` 80, `requireAllIntervals` false, `rejectAlreadyAtBottom` (default false — opt-in; **live=true**), 3 SMI param `smiPdLookback`/`smiPaLookback`/`smiCrossWindow` (3/3/3 default). **ENTRY gate always-on when `enabled`**: `screening.js:780` runs `confirmIndicatorPreset({side:"entry"})` over all eligible pools parallel, hard-drops rejects before LLM sees (`F14/F16`). **EXIT gate opt-in** via `exitEnabled`: `getIndicatorExitSignal` (`index.js:1515-1532`) return null bila `!enabled || !exitEnabled`. Post `getDeterministicCloseRule` (F3/F18) supaya SL/TP/OOR/yield win. `rejectAtBottom` reject entry veto at `chart-indicators.js:304-313` single-side-below need-room-to-dump-into-range. 8 entry preset + 8 exit preset (F16 detail). Live: `entryPreset=supertrend_break`, `exitPreset=rsi_reversal` (inert krn `exitEnabled=false`), `rsiOversold=30`, `rsiOverbought=90` (live override), `requireAllIntervals=true`, `rejectAlreadyAtBottom=true`.
3. **Path verification 6 experiment code-side (fail-open invariant)**. (a) **exitLiquidityCheck** `executor.js:1043-1062` gate `experiments.exitLiquidityCheck && args.base_mint && DRY_RUN!="true"` (skipped DRY_RUN). Pre-deploy probe `quoteSellPriceImpact` (wallet.js:185) round-trip cost. Fail-open try-catch + log "fail-open allowing deploy". Hard-reject bila `probe.roundTripLossPct > exitLiquidityMaxSlippagePct`. (b) **marketRegimeGate** `index.js:725-747` pre-`runScreeningCycle` hard-guard. Gate + try-catch. SOL 24h price via `getSolMarketRegime()` (Jupiter read-only `priceChange24h`). Skip whole screening bila `< -maxDrop` (no LLM call, appendDecision "skip"). Fail-open catch + log "allowing". (c) **candidateMomentum** `index.js:929-934` inject 1-line `formatCandidateMomentum(getCandidateMomentum(pool.pool))` ke candidate block. Fail-open try-catch omit line. (d) **expectedYieldSignal** `index.js:940-953` inject `formatYieldToMe({deployAmountSol,solPriceUsd,tvlUsd,feeActiveTvlRatio})` (screening.js:46). Trusted own-metric. Fail-open omit. (e) **smartWalletMomentum** `index.js:955-968` inject `formatSmartWalletMomentum(getSmartWalletMomentum(pool.pool))`. Trusted own count. Fail-open omit. (f) **idleScreeningCooldown** `index.js:496-510` gate homeless 0-position screening management trigger. `_screeningLastTriggered` cooldown `idleScreeningCooldownMin` default 20m. Shares dgn scheduled + freed-slot cron. Fail-open → trigger screening (factory). **Kontrak fail-open universal** verified: every experiment path wrap-try-catch + logger + factory-side default behavior restore.
4. **Conviction sizing 🧪 — mutasi `args.amount_y` PRE-safety-check (semua downstream check validate adjusted)**. `tools/executor.js:877-895`: gate `experiments.convictionSizing`. `originalAmt = Number(args.amount_y ?? args.amount_sol ?? 0)` `:884`. `adjustedAmt = applyConvictionSizing(originalAmt, args.conviction)` (config.js:572-582 F26) — re-clamp `[deployAmountSol, maxDeployAmount]`. Mutasi `args.amount_y = adjustedAmt` (+ `args.amount_sol` bila null) `:889-890`. Log "convictionSizing: low/medium/high → X → Y SOL (clamped to [floor, ceil])". **Kontrak F27 kunci**: mutasi args sebelum single-side/exit-liquidity/SOL-balance check (`:890 comment` "Mutating args here means every downstream check validates the adjusted amount"). Fail-safe: `Number.isFinite(adjustedAmt) && adjustedAmt !== originalAmt` guard — bila equal (medium or unchanged), tak mutasi (no-op). Live: flag `false` — applyConvictionSizing return amt unchanged (factory byte-identical).
5. **paperTrading 🧪 DRY-RUN-ONLY AND gate + usePaperHistoryWhenLive LIVE-only opt-in**. `paper-trading.js:21` `isPaperMode()` = `process.env.DRY_RUN === "true" && config.experiments?.paperTrading === true` — AND gate, NEVER on when live. Live flag `paperTrading=false` → isPaperMode=false (factory). `usePaperHistoryWhenLive` (`:478` default false) consulted ONLY when NOT in paper mode. `lessons.js:762-766`: `if (!isPaperMode() && !config.experiments?.usePaperHistoryWhenLive) data.lessons = data.lessons.filter((l) => !l.paper)` — OFF (factory) = paper lessons excluded from live prompt. ON = paper lessons kept but flagged 🧪 in fmt() low-credibility soft reference (never live mechanical truth — excluded from evolve/weights/reports/hive by `paper:true` tag invariant). Live: `usePaperHistoryWhenLive=false` — paper excluded (factory). Cross-F32 paper lifecycle + F13 dlmm.js integration.

## Progress
- [x] Spec F27 baca PLAN line 124 (⬛⬛ mandatory — 11 experiment flag + indicators 7 field + paper AND gate)
- [x] Cross-ref F26 (config.js experiments+indicators section surface), F24 (buildRecommendations config-read), F15 (candidate-memory backing experiment 3), F22 (getModePerformance paper/live, getNarrativeProfile), F28 (CONFIG_MAP 4 keys utk indicators + idleScreening), F30 (formatFullConfig GRUP 16 + /settings page + /setcfg), F29 (paths + default OFF), F32 (paper full lifecycle), F13 (dlmm.js paper integration)
- [x] Baca config.js full experiments+indicators section 368-479 (11 flag + 9 indicators field + chartIndicators user-key)
- [x] Baca paper-trading.js 15-30 (`isPaperMode` AND-gate) + lessons.js 754-790 (`getLessonsForPrompt` paper filter via `usePaperHistoryWhenLive`)
- [x] Baca chart-indicators.js 295-325 (rejectAlreadyAtBottom veto at entry)
- [x] Baca index.js experiments gate 496-510 (idleScreeningCooldown), 725-747 (marketRegimeGate), 935-968 (yield + sw_momentum injection), 1515-1532 (getIndicatorExitSignal), 1935-1947 (GRUP 16 formatFullConfig entries)
- [x] Baca tools/executor.js 877-895 (conviction mutation pre-safety), 1043-1062 (exitLiquidityCheck probe)
- [x] Verifikasi COMMAND map: `tools/executor.js:483-496` CONFIG_MAP entries utk `exitLiquidityCheck`+`marketRegimeGate`+`candidateMomentum`+`narrativeProfileSignal`+`expectedYieldSignal`+`convictionSizing`+`counterfactualReview`+`smartWalletMomentum`+`idleScreeningCooldown`+`idleScreeningCooldownMin`+`indicatorExitEnabled`+`indicatorRejectAtBottom` (live ON check)
- [x] Verifikasi live user-config experiments: counterfactualReview=true (Racikan-aktif cycle), idleScreeningCooldown=true (cron gate); 9 lain OFF; indicators.enabled=true, exitEnabled=false, rejectAlreadyAtBottom=true
- [x] Tulis §0 + §A-§H

---

## §0. Cara Kerja (Bahasa Awam)

**Analogi** (dua sudut pandang sehari-hari)
- *Mesin produksi pabrik dengan 11 saklar eksperimen panel*: pabrik jalan standar dgn 1 konfigurasi tetap. Bos pasang 11 saklar eksperimen di panel — tiap saklar nyala = fitur eksperimen dicoba. **Aturan tegas**: (a) semua saklar default MATI — pabrik jalankan resep lama, tidak ada perubahan, (b) saklar nyala = jalankan fitur BARU, tapi bila fitur itu error → saklar mati otomatis (jangan stop produksi krn 1 fitur butut), (c) bos bisa mati-saklar kapan saja — balik ke resep lama dalam-detik. **Contoh**: saklar "Market-regime Gate" nyala = bila SOL hancur -10/24 jam, stop scouting hari itu. Saklar "Idle-cooldown" nyala = bila tak ada posisi, jangan scout tiap menit (hemat LLM). Saklar "Paper trading" = AND dgn dummy-mode — hanya nyala di drill-mode, tak bisa live, supaya bos bisa simulasi tanpa risiko uang asli. Konsep sama: 11 saklar = 11 flag, semua default OFF, fail-open individual, paper saklar AND-gate.
- *Dapur restoran dengan 11 bumbu eksperimen + 1 bumbu penanda (chart indicator)*: koki senior pakai resep tetap. Bos coba 11 eksperimen bumbu — (a) tiap bumbu default skip (resep lama); (b) bila bumbu nyala lalu koki-utama tetap PRIM, hanya bumbu eksperimen ditambah di tahap tertentu; (c) bila bumbu basi/ebad → koki tetap masak tanpa bumbu itu (jangan buang seluruh masakan). Bumbu "Chart indicator" sedikit berbeda — ia 2 mode: mode "ENTRI" (selalu aktif bila `indicators.enabled=true` utk filter calon) + mode "EXIT" (opt-in, bila `exitEnabled=true`, posisi tutup via sinyal chart). Konsep sama: 11 bumbu eksperimen + 2 sub-mode indicators. Live: chef pakai 2 bumbu ON (`counterfactualReview`, `idleScreening`) + indicator ENTRI aktif (filter calon), EXIT OFF (resep lama).

**Di bot, ini = 11 experiment flag (default OFF + fail-open + factory byte-identical) + 1 indicators config (entry-on-exit-opt-in) + paper-trading AND-gate DRY-RUN** (1-2 kalimat)
`config.experiments.*` 11 default-OFF flag. Path code-side tiap flag gate-then-try-catch-then-factory-fallback. `indicators.enabled` always-on entry gate screening hard-filter + `exitEnabled` opt-in exit-preset upgrade STAY→CLOSE. `rejectAlreadyAtBottom` opt-in veto entry bila token already dumped. `paperTrading` AND `DRY_RUN=true` via `isPaperMode()`. `usePaperHistoryWhenLive` LIVE-only opt-in inject paper lessons as 🧪 low-credibility.

**Posisi fase ini di alur bot** (1 paragraf)
Datang SETELAH F26 (config.js experiments+indicators surface source), SEBELUM F28 (CONFIG_MAP `update_config` mutator surface + full-sync 6-surface doc), PARALEL-F15 (candidate-memory 3-experiment backing), PARALEL-F22 (`getNarrativeProfile` utk narrativeProfileSignal + `getModePerformance` paper tag). Sebelum F30 (formatFullConfig GRUP 16 display), sebelum F32 (paper-trading.js full lifecycle), sebelum F13 (dlmm.js integration). F27 = **Lapisan 8 (Config) experiments extension surface**: verifikasi 11-path + indicators + paper gate sinkron dgn CLAUDE.md docs + live user-config state.

**Langkah kerja** (urutan, pakai istilah teknis)
1. **Startup**: config.js `experiments.*` load 11 flag dari `u.* ?? false` — default OFF. indicators `u.chartIndicators ?? {}` pre-extract → `config.indicators.*` 9 field.
2. **Screening cycle**: `runScreeningCycle` pre-check `marketRegimeGate` (`index.js:725`) hard-skip-screening bila SOL 24h crash. Indicator entry gate at `screening.js:780` hard-drop pools before LLM. `candidateMomentum`/`expectedYieldSignal`/`smartWalletMomentum` inject 1-line ke candidate block (`index.js:929-968`).
3. **Idle management**: 0-position trigger fire screening via management cycle. Bila `idleScreeningCooldown` ON (`:496`), cek `_screeningLastTriggered` + `idleScreeningCooldownMin`, skip bila dalam cooldown.
4. **Deploy**: pre-deploy `runSafetyChecks` (executor.js) gate `exitLiquidityCheck` (`:1043`) bila ON + non-DRY-RUN, probe `quoteSellPriceImpact` round-trip cost. Bila `convictionSizing` ON (`:877`) mutasi `args.amount_y` via `applyConvictionSizing` — re-clamp `[deployAmountSol, maxDeployAmount]`. All downstream check validate adjusted.
5. **Management cycle**: `runManagementCycle` pre-check `getIndicatorExitSignal` (`index.js:1515`) bila `indicators.exitEnabled` ON — upgrade STAY→CLOSE via exit-preset. Post `getDeterministicCloseRule` (F3/F18).
6. **Close**: post-close `recordPerformance` (`lessons.js:147`) tag `paper:true` bila `isPaperMode()`. Briefing filter `keepMode` 9-point.
7. **Prompt**: `getLessonsForPrompt` (`lessons.js:754`) filter paper lessons bila `!usePaperHistoryWhenLive`. `prompt.js:117` inject `getNarrativeProfileForPrompt` bila `narrativeProfileSignal` ON.
8. **Briefing**: `buildSkipReviewSection` gated `counterfactualReview` (`briefing.js:277`). `getSkipReview` dari candidate-memory F23.
9. **Toggle path**: `/setcfg` F30 atau `/settings` page toggle → mutasi live `config.experiments.X` + persist user-config via F28 `update_config` tool path. `reloadScreeningThresholds` tak cover experiments keys (F26 E.3) — bila user hand-edit experiments key bila tak restart, no-hot-reload applies? **Verify**: eksperimen flags tak reload-surface (`:608-647` tak list `experiments.*`). Hand-edit experiment key tanpa restart → bot baca OLD singleton (tak sync). Restart required utk experiment toggle (or restart cron `registerCronRestarter` via `update_config` path yang direct-mutate). **Lint point**: live mutation lewat `/setcfg` MUST direct-mutate `config.experiments.X = value` (F28 path) supaya singleton sync, persist ke file, no need restart.
10. **Output**: behavior nyala/berubah sesuai flag, factory-default bila OFF, fail-open bila path error.

**Output experiments**: per-flag behavior (deploy probe close / hard-screening-skip / candidate-line-inject / cooldown-gate / mutasi amount / close-via-preset / paper lifecycle / prompt-line-inject). Side-effect: recordCandidateSnapshots (counterfactual backing) jalan bila 1-of-3 ON dari momentum/sw_momentum/counterfactual. Trigger ke fase berikut: prompt line injection → SCREENER sees momentum/yield/sw-momentum → tahu signal; deploy probe reject → screening skip-to-next pool; indicator close upgrade → management cycle CLOSE; paper record → briefing/lesson loop sim.

**Kalau rusak / diskip** (2-3 kalimat, istilah teknis)
Factory invariant: every experiment flag default OFF — toggle OFF always byte-identical pre-feature. Fail-open: every path wrap try-catch + log + factory restore. **Risk krn `experiments.*` tak seluruh covered oleh `reloadScreeningThresholds`**: kalau user hand-edit `user-config.json` experiment key tanpa restart → singleton tetap OLD. Hanya `/setcfg` F30 via F28 `update_config` direct-mutate singleton works. Skip F27 = tak paham fail-open invariant utk setiap flag → debugging eksperimen-nyala-tapi-tak-jalan mistake.

**Istilah yang muncul di fase ini** (bullet, cuma yang baru)
- **11 experiments** — exitLiquidityCheck / marketRegimeGate / candidateMomentum / narrativeProfileSignal / expectedYieldSignal / convictionSizing / counterfactualReview / smartWalletMomentum / idleScreeningCooldown / paperTrading / usePaperHistoryWhenLive.
- **DEFAULT OFF** — `false` factory. Toggle OFF = byte-identical pre-feature.
- **fail-open contract** — experiment error NEVER blocks normal flow. try-catch + log + factory restore.
- **indicators.enabled** — entry gate always-on when true (screening.js:780 hard-filter).
- **exitEnabled** — opt-in OFF default. exitPreset inert when false.
- **rejectAlreadyAtBottom** — opt-in OFF default. entry veto bila token already dumped.
- **isPaperMode()** — AND gate `DRY_RUN === "true" && experiments.paperTrading === true`. paper-trading.js:21.
- **usePaperHistoryWhenLive** — LIVE-only opt-in. Inject paper lessons as 🧪 flag, excluded from mechanical paths.
- **applyConvictionSizing** — `config.js:572` 🧪 experiment #6. Multiplier re-clamp. Mutasi `args.amount_y` pre-safety-check.
- **quoteSellPriceImpact** — `wallet.js:185` Jupiter quote utk exitLiquidityCheck probe round-trip cost loss%.
- **getSolMarketRegime** — `wallet.js` Jupiter price v3 `priceChange24h` utk marketRegimeGate.
- **formatYieldToMe** — `screening.js:46` expectedYieldSignal — proxy fee/footprint estimate per candidate block.
- **formatCandidateMomentum/formatSmartWalletMomentum** — `candidate-memory.js` inject 1-line momentum/sw momentum.
- **getSkipReview** — `candidate-memory.js:117` counterfactual skip-review utk briefing.
- **getNarrativeProfileForPrompt** — `lessons.js:1215` narrativeProfileSignal prompt line.
- **getIndicatorExitSignal** — `index.js:1515` exit gate call `confirmIndicatorPreset({side:"exit"})`. Opt-in.
- **idleScreeningCooldownMin** — `experiments.idleScreeningCooldownMin` default 20m. `_screeningLastTriggered` shared.
- **convictionSizingMaxAdjustPct** — `experiments.convictionSizingMaxAdjustPct` default 30 → ±30%.
- **exitLiquidityMaxSlippagePct** — `experiments.exitLiquidityMaxSlippagePct` default 10%.
- **counterfactualMinMcapGainPct** — `experiments.counterfactualMinMcapGainPct` default 25%.
- **entryPreset / exitPreset** — 8 preset entry (`supertrend_break`/`rsi_reversal`/`bollinger_reversion`/`rsi_plus_supertrend`/`supertrend_or_rsi`/`bb_plus_rsi`/`fibo_reclaim`/`fibo_reject`).
- **smi* param** — supertrend_plus_smi subset (smiPdLookback/smiPaLookback/smiCrossWindow).
- **`paper:`** tag — closed-position performance record tag (`recordPerformance` F19). Filter di downstream `keepMode` pemanggil (F22 + briefing F25).

*Lewati §0 kalau sudah paham. Isi teknis mulai §A.*

---

## §A — Peta file fase ini

| File | Peran | Baris kunci |
|------|-------|-------------|
| `config.js` | **Source surface**: origin singleton + 5 fn mutation | 35 MIN_SAFE; 68 chartIndicators pre-extract; 368-397 indicators section (9 field); 404-479 experiments section (11 flag + 5 adj-key); 572-582 applyConvictionSizing; 589-599 persistConfigChange; 606-666 reloadScreeningThresholds |
| `index.js` | **Experiments runtime gates + injection + formatFullConfig**: cron-side | 9: imports getSolMarketRegime; 10: formatYieldToMe; 11: confirmIndicatorPreset; 47: candidate-memory imports; 496-510 idleScreeningCooldown gate; 725-747 marketRegimeGate hard-skip; 929-968 momentum/yield/sw_momentum block-inject; 1515-1532 getIndicatorExitSignal; 1935-1947 GRUP 16 formatFullConfig entries; 2431-2447 /settings toggle map |
| `tools/executor.js` | **CONFIG_MAP + deploy gating**: 11 experiment mapping + conviction mutation + exitLiquidity probe | 23: imports applyConvictionSizing/minDeployAmount; 483-496 CONFIG_MAP 12 experiment+indicator entries (session→experiments/indicators nested paths); 877-895 conviction mutation PRE-safety-check; 1043-1062 exitLiquidity probe + fail-open |
| `tools/chart-indicators.js` (366) | **Indicator preset evaluator**: confirmIndicatorPreset + evaluatePreset | entry gate 780 (F14/F16); 304-313 rejectAlreadyAtBottom veto; `confirmIndicatorPreset` 350 (exit call) |
| `paper-trading.js` (216) | **isPaperMode AND gate + makePaperPositionId** | 21 isPaperMode; 26 makePaperPositionId (`paper_<slice>_<ts>` prefix) |
| `lessons.js` | **getLessonsForPrompt usePaperHistoryWhenLive filter + getNarrativeProfileForPrompt + getModePerformance** | 266 recordPoolDeploy paper gate; 754-790 getLessonsForPrompt; 762-766 usePaperHistoryWhenLive filter; 834 getModePerformance paper tag scope; 1215 getNarrativeProfileForPrompt |
| `tools/wallet.js` | **quoteSellPriceImpact + getSolMarketRegime**: read-only Jupiter quotes utk probes | 185 quoteSellPriceImpact; F2/F15 getSolMarketRegime |
| `tools/screening.js` | **formatYieldToMe + indicator entry gate 780** | 46 formatYieldToMe; 780 entry hard-filter; F15 backing |
| `candidate-memory.js` F23 | **3-experiment backing**: candidateMomentum + sw_momentum + counterfactual | F23 detail |
| `prompt.js` | **narrativeProfileSignal prompt injection** | 13 import getNarrativeProfileForPrompt; 117 conditional call racikanRules |
| `briefing.js` | **counterfactualReview briefing section**: buildSkipReviewSection gated | 277 gate |
| `pnl-tracker.js` F25 | **getPnlTracker paper filter happens consumer-side**: experiments.paperTrading → records carry `paper:true`, filter at conversation counter F22/F25 |

---

## §B — Alur data hulu→hilir (ASCII diagram)

```
        [Startup surface]
   config.js:404-479 experiments singleton 11 flag default false
   config.js:368-397 indicators 9 field dari chartIndicators
                    │
                    ▼
   170 consumer baca `config.experiments.*` / `config.indicators.*` runtime
                    │
   ┌──────────┬────┴───────┬───────────┬──────────┬────────────┬─────────────┐
   ▼          ▼            ▼           ▼          ▼            ▼             ▼

 [Screening   [Screening   [Screening   [Screening [Idle mgmt   [Deploy       [Management
 pre-check]    block        block        block      0-pos]       gating        cycle
 market-      inject       inject       inject     idleScreen    conviction   exit
 regime       candidate    yield        sw_        ing Cooldown  + exit-      signal]
 gate]        Momentum     toMe         Momentum   skip trig     Liquidity    indicator
              1-line       1-line       1-line     ing           Probe        getIndicator
                │            │            │          │            │             │
                ▼            ▼            ▼          ▼            ▼             ▼
        ┌──────────────────────────┐   skip fire   reject       STAY→CLOSE
        │ formatCandidateMomentum  │   screening   deploy       upgrade
        │ formatYieldToMe          │
        │ formatSmartWalletMomentum│
        │ (candidate-memory F23    │
        │ business)                │
        └──────────────────────────┘

 [Indicators hard-filter entry]
   screening.js:780 (always when enabled) → confirmIndicatorPreset({side:"entry"}) over all pools parallel → hard-drops rejects before LLM
        │
        └─ rejectAlreadyAtBottom `:304` (opt-in): veto entry bila token already at bottom (RSI<oversold AND close<lowerBand) — no room to dump into range

 [Indicator exit (opt-in)]
   exitEnabled true → getIndicatorExitSignal `index.js:1515` → confirmIndicatorPreset({side:"exit"}) post getDeterministicCloseRule — STAY/CLAIM upgrade to CLOSE `:1520`

 [Counterfactual reflection]
   counterfactualReview ON → buildSkipReviewSection `briefing.js:276` (gated) → getSkipReview F23 → briefing daily section

 [Paper mode DRY-RUN-ONLY]
   isPaperMode() = DRY_RUN=true AND paperTrading=true → dlmm.js integration: deploy/close/pnl branches simulate virtual `paper_<slice>_<ts>` → recordPerformance paper:true tag → lessons.json + stats isolated

 [Paper→Live bridge (usePaperHistoryWhenLive)]
   !isPaperMode() AND usePaperHistoryWhenLive=true → getLessonsForPrompt `lessons.js:762-766` keep paper lessons + 🧪 flag → prompt soft reference (still excluded from evolve/weights/reports/hive)

 [Narrative prompt]
   narrativeProfileSignal ON → prompt.js:117 getNarrativeProfileForPrompt → SCREENER line best/weakest narratives
```

---

## §C — Sinkron: siapa-panggil-siapa

| Pemanggil (file:line) | Dipanggil (file:line) | Trigger | Data lewat | Fail-mode |
|---|---|---|---|---|
| `index.js:725` marketRegimeGate | `wallet.js` getSolMarketRegime | pre-screening cycle hard-guard | — | try-catch + log "allowing" |
| `index.js:929` candidateMomentum gate | `candidate-memory.js` getCandidateMomentum + formatCandidateMomentum | screening candidate block inject | `pool.pool` | try-catch omit line |
| `index.js:940` expectedYieldSignal gate | `screening.js:46` formatYieldToMe | block inject | `{deployAmountSol, solPriceUsd, tvlUsd, feeActiveTvlRatio}` | try-catch omit line |
| `index.js:955` smartWalletMomentum gate | `candidate-memory.js` formatSmartWalletMomentum + getSmartWalletMomentum | block inject | `pool.pool` | try-catch omit line |
| `index.js:496` idleScreeningCooldown gate | internal `_screeningLastTriggered` | 0-position management tik | `idleScreeningCooldownMin` | fail-open → trigger factory |
| `index.js:1515` getIndicatorExitSignal | `chart-indicators.js` confirmIndicatorPreset(`exit`) | post `getDeterministicCloseRule` | `position.base_mint` | try-catch null = no close |
| `screening.js:780` entry gate | `chart-indicators.js` confirmIndicatorPreset(`entry`) | `indicators.enabled` true screening hard-filter | per-mint parallel | API down → `{confirmed:true, skipped:true}` |
| `chart-indicators.js:304` rejectAlreadyAtBottom veto | entry block, opt-in | `evaluation.signal.rsi + close + lowerBand` | gate bool + reason rewrite | — |
| `tools/executor.js:877` conviction mutation | `config.js:572` applyConvictionSizing | pre-safety `experiments.convictionSizing` ON | `originalAmt, args.conviction` | Number guard pass-through if !finite |
| `tools/executor.js:1043` exitLiquidityCheck probe | `wallet.js:185` quoteSellPriceImpact | pre-safety gate `experiments.exitLiquidityCheck` ON non-DRY-RUN | `{baseMint, solNotional: amountY}` | try-catch log "allowing" |
| `briefing.js:276` buildSkipReviewSection gate | `candidate-memory.js` getSkipReview + `pool-memory.js` getDeployedPoolAddresses | `counterfactualReview` ON | `{deployedPoolAddresses, minMcapGainPct}` | try-catch null |
| `prompt.js:117` narrativeProfileSignal gate | `lessons.js:1215` getNarrativeProfileForPrompt | SCREENER prompt build | — | try-catch fail-open |
| `lessons.js:762` getLessonsForPrompt filter paper | cross-F22 | `!isPaperMode() && !usePaperHistoryWhenLive` → filter out `l.paper` | — | null if empty list |
| `paper-trading.js:21` isPaperMode | dlmm.js paper branches (F13) + briefing.js keepMode | check gate everywhere | — | returns false bila any missing |
| `tools/executor.js:483-496` CONFIG_MAP 12 entries | F28 `update_config` tool | surface utk `/setcfg` + Telegram mutation | nested-section paths | unknown keys doc'd |

---

## §D — Logika kunci per fungsi

### Experiment path gate (universal pattern) — `config.experiments?.FLAG`
- **Apa**: tiap flag runtime gated `if (config.experiments?.FLAG) {...}`. Default `false` → path skipped entirely.
- **Kontrak**: (a) DEFAULT OFF — byte-identical pre-feature, (b) fail-open — error restore factory-side default behavior, (c) toggle revert OFF always pre-feature.
- **Pemanggil**: 11 path verified across `index.js` (4) + `executor.js` (2) + `briefing.js` (1) + `prompt.js` (1) + `lessons.js` (1) + `paper-trading.js` (1) + `screening.js` (1).
- **Bukti**: config.js:404-479 + 11 path consumer.

### applyConvictionSizing 🧪 (experiment #6) — config.js:572 (F26) + tools/executor.js:877-895 mutation path
- **Apa**: Conviction nudge multiplier utk `args.amount_y`. Re-clamp `[deployAmountSol, maxDeployAmount]`.
- **Kapan dipicu**: pre-deploy `runSafetyChecks` (executor.js:877) saat `experiments.convictionSizing` true.
- **Output**: adjusted amount (≤ ceil, ≥ floor) atau unchanged (gate OFF / medium / finite-fail).
- **Sinkron**: gate `config.experiments.convictionSizing` (`:879`) surface singleton live. `convictionSizingMaxAdjustPct` default 30. Multiplier high/low/medium/unknown (`:577`).
- **Fail-mode**: `!Number.isFinite(amt) || amt ≤ 0 → return amountSol` unchanged (`:574`). `!finite(adjustedAmt) || adjustedAmt === originalAmt` → skip mutation (`:887`) — no-op (no log misleading).
- **Kontrak KUNCI**: mutasi args **SEBELUM** semua downstream check (single-side, exit-liquidity, SOL balance) validasi adjusted amount. CLAUDE.md "Applied at the top of the deploy_position case in runSafetyChecks (executor.js) by mutating args.amount_y — so every downstream check validates the adjusted amount."
- **Live**: `convictionSizing=false` → factory byte-identical. Bila user future ON, log "convictionSizing: high conviction → 0.5 → 0.65 SOL (clamped to [0.1, 10])".
- **Bukti**: config.js:572-582 + tools/executor.js:877-895.

### exitLiquidityCheck probe — tools/executor.js:1043-1062
- **Apa**: Pre-deploy probe round-trip cost utk reject pool too illiquid to exit cleanly. Jupiter quote `quoteSellPriceImpact` (wallet.js:185).
- **Kapan dipicu**: `experiments.exitLiquidityCheck && args.base_mint && DRY_RUN!="true"`. Memory: skipped DRY-RUN.
- **Output**: `{pass:false, reason: "...too illiquid to exit..."}` reject bila `probe.roundTripLossPct > exitLiquidityMaxSlippagePct` (default 10%). Else pass.
- **Sinkron**: `quoteSellPriceImpact({baseMint, solNotional: amountY})` read-only Jupiter quote. maxPct via `exitLiquidityMaxSlippagePct`.
- **Fail-mode**: try-catch + log "fail-open allowing deploy" — probe error never block trade.
- **Kontrak**: skipped under DRY_RUN (real cost probe needs wallet buying). Fail-open absolute.
- **Live**: `false` → skipped entirely.
- **Bukti**: tools/executor.js:1043-1062.

### marketRegimeGate hard-skip — index.js:725-747
- **Apa**: Pre-screening hard-guard — read SOL 24h price change via `getSolMarketRegime` (Jupiter read-only). Skip whole screening bila SOL down more than `marketRegimeMaxDrop24hPct` (default 8%).
- **Kapan dipicu**: pre-`runScreeningCycle` in ">hard-guards (max-pos/SOL/market-regime)" block (F2). Catches scheduled + freed-slot screening (both route through `runScreeningCycle`). Manual chat deploys not gated.
- **Output**: `screenReport = "🧪 Screening skipped — market risk-off..."` + `appendDecision({type:"skip",actor:"SCREENER",summary:"Screening skipped",reason:"🧪 market risk-off..."})`. `_screeningBusy=false` + return — NO LLM CALL (saves tokens).
- **Sinkron**: `getSolMarketRegime()` returns `{change24hPct, usdPrice, ...}` from Jupiter price v3. Skip gate `regime.change24hPct < -maxDrop`. Also reused for `solPrice` (`:3260/3277`) utk /status.
- **Fail-mode**: try-catch + log "allowing screening (fail-open)" — price API hiccup never blocks.
- **Kontrak**: "No price history stored — 24h delta comes straight from API." Runs under DRY_RUN too (read-only). Manual chat deploys bypass gate.
- **Live**: `false` → never gate.
- **Bukti**: index.js:725-747.

### idleScreeningCooldown 0-position gate — index.js:496-510
- **Apa**: Throttle management tick 0-position screening trigger. Caps idle screening at most once per `idleScreeningCooldownMin` (default 20m). Shares `_screeningLastTriggered` with scheduled + freed-slot cron.
- **Kapan dipicu**: management cycle 0-position branch (`:486` no open positions).
- **Output**: skip screening bila `waited < cooldown` — log `No open positions — idle screening on cooldown (${waitedMin}m < ${cooldownMin}m), skipping`.
- **Sinkron**: gate `experiments.idleScreeningCooldown` + read `experiments.idleScreeningCooldownMin`.
- **Fail-mode**: fail-open — kalau error → fall-through to trigger (factory).
- **Kontrak**: never blocks management. Scheduled cron still runs underneath (shared trigger).
- **Live**: `true` + 20 min — actual working gate.
- **Bukti**: index.js:496-510.

### getIndicatorExitSignal (opt-in) — index.js:1515-1532
- **Apa**: Exit preset upgrade STAY/CLAIM → CLOSE via confirmed exit indicator signal. Opt-in via `indicators.exitEnabled` default OFF.
- **Kapan dipicu**: `runManagementCycle` post `getDeterministicCloseRule` (F3/F18 — supaya SL/TP/OOR/yield always win).
- **Output**: `{action:"CLOSE", rule:"indicator", reason: "exit preset confirmed"}` atau null.
- **Sinkron**: gate `config.indicators.enabled && exitEnabled && position.base_mint`. `confirmIndicatorPreset({mint, side:"exit"})` return `{enabled, confirmed, skipped, reason}`.
- **Fail-mode**: try-catch + log. Skipped/error → return null = no close. Fail-safe.
- **Kontrak**: confirmed signal upgrades STAY/CLAIM to CLOSE. Default OFF — exitPreset inert (`confirmIndicatorPreset` never called on exit side until flag on). Previously dead config (CLAUDE.md) — now wired.
- **Live**: `exitEnabled=false` → inert.
- **Bukti**: index.js:1515-1532.

### rejectAlreadyAtBottom veto (opt-in) — tools/chart-indicators.js:304-313
- **Apa**: Entry gate veto bila token already dumped to bottom (RSI<oversold AND close<lowerBand). Single-side-below need room to dump into range — no room left → veto entry.
- **Kapan dipicu**: `confirmIndicatorPreset({side:"entry"})` confirmed + `config.indicators.rejectAlreadyAtBottom` true.
- **Output**: overwrite `confirmed = false`, reason "already at bottom (RSI < oversold & price below lower BB) — no room to dump into range".
- **Sinkron**: `signal.rsi`, `signal.close`, `signal.lowerBand` dari payload evaluation. `rsiOversold` default 30.
- **Fail-mode**: bila signal missing → atBottom false → no veto.
- **Kontrak**: ported from GMGN checkBounceSetup. Fits single-side-below.
- **Live**: `rejectAlreadyAtBottom=true` — veto aktiv.
- **Bukti**: tools/chart-indicators.js:304-313.

### isPaperMode AND-gate — paper-trading.js:21
- **Apa**: Paper mode = AND `DRY_RUN === "true"` AND `experiments.paperTrading === true`. Never on when live.
- **Kapan dipicu**: gated all dlmm.js paper branches (F13) + briefing.js keepMode (F25) + lessons.js filter (F22).
- **Output**: boolean. EMPTY when either false.
- **Sinkron**: `process.env.DRY_RUN === "true"` checked first, then `config.experiments?.paperTrading === true`.
- **Kontrak**: "Never on when live." Footgun elimination — bila user set `PAPER_TRADING=true` AND `DRY_RUN=false`, paper mode OFF (bot runs live).
- **Live**: `paperTrading=false` → isPaperMode=false factory.
- **Bukti**: paper-trading.js:21.

### usePaperHistoryWhenLive (LIVE-only opt-in) — lessons.js:762-766
- **Apa**: Inject paper-derived lessons as 🧪 low-credibility soft reference ONLY when live + opt-in. Excluded from evolve/weights/reports/hive.
- **Kapan dipicu**: `!isPaperMode() && config.experiments?.usePaperHistoryWhenLive` (LIVE-only).
- **Output**: keep `l.paper`-tagged lessons in `data.lessons` (vs filter out at factory).
- **Sinkron**: filter at `getLessonsForPrompt` — bila OFF (factory) → `data.lessons.filter((l) => !l.paper)`. ON → keep but fmt() tags 🧪.
- **Kontrak**: only consulted when NOT in paper mode. Lets live bot carry-over dry-run advisories — never as mechanical truth (still excluded by `paper:true` isolation invariant di evolveThresholds/recalculateWeights/hive/briefing).
- **Live**: `false` → paper excluded (factory).
- **Bukti**: lessons.js:762-766.

### counterfactualReview briefing gate — briefing.js:276-299
- **Apa**: Daily briefing skip-review section "pools we passed on whose mcap later popped". Gated `experiments.counterfactualReview` default OFF.
- **Kapan dipicu**: `generateBriefing` section compose.
- **Output**: section HTML atau null (skip).
- **Sinkron**: `getSkipReview` F23 dari `candidate-memory` + `getDeployedPoolAddresses` F23 dari `pool-memory` + `counterfactualMinMcapGainPct` default 25.
- **Fail-mode**: try-catch null.
- **Kontrak**: reflection only, never gates. Short horizon candidate-memory 24h. Bila on, candidate snapshots recorded even if `candidateMomentum` off (shared guard F15).
- **Live**: `true` — section aktiv (tergantung data).
- **Bukti**: briefing.js:276-299.

### expectedYieldSignal — index.js:940-953 + formatYieldToMe (screening.js:46)
- **Apa**: Soft SCREENER candidate-block line — proxy expected-yield-to-me. Share-of-pool TVL + fee-window. Trusted own metric.
- **Kapan dipicu**: candidate block compose saat `experiments.expectedYieldSignal` true.
- **Output**: `yield_to_me: <txt>` line atau null.
- **Sinkron**: `formatYieldToMe({deployAmountSol, solPriceUsd, tvlUsd, feeActiveTvlRatio})` — pure-math proxy, ignores per-bin liquidity concentration.
- **Fail-mode**: try-catch omit line.
- **Kontrak**: explicitly labeled proxy. Trusted reference (our own count). Soft — never gates.
- **Live**: `false` → line never emit.
- **Bukti**: index.js:940-953 + screening.js:46.

---

## §E — Temuan: bug / gap / kontrak-kunci / fail-open tak-terpenuhi

### E.1 — `experiments.*` keys tak covered `reloadScreeningThresholds` whitelist — hand-edit tanpa restart non-pickup
**Lokasi**: config.js:606-666 reloadScreeningThresholds.
**Temuan**: 56-key whitelist tak mention `experiments.*` sama sekali. Bila user hand-edit `user-config.json` utk toggle `candidateMomentum: true` tanpa restart → `reloadScreeningThresholds` (triggered by `/setcfg` or evolveThresholds) tak re-apply `experiments.*` → singleton tetap OLD `false`. Bot tidak jalan fitur sampai restart.
**Mitigation existing**: F28 `update_config` tool direct-mutate `config.experiments.X = value` + persist (`section.path` via CONFIG_MAP `experiments.*`). Jadi via `/setcfg` works (direct mutate). Hand-edit user-config tanpa restart — non-pickup.
**Kontrak**: documented in F26 E.3 — 56-key whitelist non-encompassive utk experiment. **Worth-F28 audit** — extend whitelist atau document explicitly "experiments.* requires restart bila hand-edit".
**Low impact**: most user pakai `/setcfg` Telegram (`update_config` path) bukan hand-edit.

### E.2 — `indicators.enabled` live = `true` TAPI `exitEnabled` opt-in OFF — entry gate aktiv, exit inert, document split contract
**Lokasi**: user-config live `chartIndicators.enabled=true`.
**Temuan**: `enabled` gate both entry (`screening.js:780`) AND exit (`getIndicatorExitSignal` `index.js:1515`). `exitEnabled` additional AND-gate utk exit-path only. Live: `enabled=true` (entry aktiv) + `exitEnabled=false` (exit inert). **Kontrak**: exit opt-in OFF default — "When false the exitPreset is inert (factory behavior — exits governed only by stopLoss/TP/trailing/yield-floor/OOR)" (config.js:372-374 comment). Bila user reconcilelg "kok exit tak ngunci padahal indicator aktif" — jawab: `exitEnabled` separate flag.
**Documented**: CLAUDE.md eksplisit. **Lint**: live `exitPreset=rsi_reversal` set tapi inert krn `exitEnabled=false`. User mungkin expect rsi_reversal exit running padahal tidak — dokumentasi explicit di SETTINGS-GUIDE perlu tag "(opt-in — nyalakan `exitEnabled`)" bukan sekadar "(opt-in)".
**Cosmetic-doc-clarification**.

### E.3 — `rejectAlreadyAtBottom=true` live walaupun default false — user explicit enable, BUT danger bila combined dgn `entryPreset` yang sudah conditionally oversold
**Lokasi**: chart-indicators.js:304-313.
**Temuan**: `rejectAlreadyAtBottom` veto entry bila RSI<oversold AND close<lowerBand. Default false (opt-in OFF). Live: `true`. **Edge case**: bila `entryPreset=bollinger_reversion` (designed utk buy-oversold dip) `rejectAlreadyAtBottom` semantik kont-radiktif — bollinger reversion WANTS oversold, tapi `rejectAtBottom` veto oversold. User mungkin inadvertently enable both — pool yang bollinger-reversion confirmed (oversold) → veto (already-at-bottom). Logic war.
**Kontrak**: dari CLAUDE.md "Fits single-side-below: no room left to dump into range." Bila user pakai `entryPreset=supertrend_break` (live) — OK, supertrend tak peduli oversold, jadi veto tak kontradiksi. Tapi kombinasi preset lain + veto perlu doc warning.
**Documented partially** — worth SETTINGS-GUIDE add "Note: `rejectAlreadyAtBottom` veto entry bila RSI oversold — tak compatible dgn `*reversion*` preset yang beli oversold."
**Cosmetic-doc-but-edge-knowledge**.

### E.4 — `paperTrading` user-config flat-key `paperTrading`, TAPI di `experiments` section — `.env` style user-config tak ada `experiments.*` nested
**Lokasi**: config.js:469.
**Temuan**: `paperTrading: u.paperTrading ?? false` — user-config flat-key `paperTrading`. Kontrak CLAUDE.md "Opt-in experiments live in `config.experiments`" → users expect user-config nested `experiments: {paperTrading: true}` style. TAPI semua experiment flat keys (`exitLiquidityCheck`, `paperTrading`, dst) — tak nested. Document-style consistent pada darwin flat/key, TAPI CLAUDE.md spotlights `config.experiments` nested idea as code-section而不 key-shape. User konfused bila bikin user-config baru: write di flat top or nested?
**Documented in** user-config.example.json — style paritas. **Worth SETTINGS-GUIDE clarification**: "All experiment flags are flat top-level user-config keys, never nested."
**Doc-clarification**.

### E.5 — `convictionSizingMaxAdjustPct` 30% multiplier high → breaching max-ceil bila amount × 1.3 > maxDeployAmount
**Lokasi**: config.js:572-582.
**Temuan**: `Math.min(ceil, Math.max(floor, amt × mult))` (`:581`) — re-clamp `[floor, ceil]`. Bila `amt=8` SOL × 1.3 high = 10.4, ceil=10 → return 10. Bila `amt=maxDeployAmount` (10) × 1.3 = 13, reclamp to 10 — capped. **Kontrak**: tak pernah breach `[deployAmountSol, maxDeployAmount]` invariant (CLAUDE.md F27 contract). **Kontrak-test** passes. **No issue**. Document-reaffirm re-clamp guarantee.

### E.6 — `exitLiquidityCheck` skipped under DRY_RUN — paper mode tak ada live prod utk probe
**Lokasi**: tools/executor.js:1043.
**Temuan**: `args.base_mint && process.env.DRY_RUN !== "true"` — DRY_RUN skip probe — bila paper mode (DRY_RUN + paperTrading), pool tak go exitLiquidity probe. Konsekuensi: paper simulation deploy ke pool yang sebenarnya tak liquid-exit-able (paper tak reject) → simulated stats inflated vs live. Bila user baca paper-sizing tuning → tak consider exitLiquidityCheck behavior yang akan aktif di live.
**Kontrak-documentasi**: CLAUDE.md "Skipped under `DRY_RUN`." — documented. TAPI user expect paper-stats approximate live-stats → exitLiquidityCheck gap. **Edge-scenario** transition paper→live. **Worth-doc** — "exitLiquidityCheck di-skip pd paper, jadi paper stats tak reflect filter live." **Doc-clarification**.

### E.7 — `idleScreeningCooldown` shares `_screeningLastTriggered` dgn scheduled + freed-slot — bila idle cooldown just-blocked, freed-slot still fire screening
**Lokasi**: index.js:496 + race w/ `_screeningLastTriggered` shared.
**Temuan**: comment CLAUDE.md "Shares `_screeningLastTriggered` with the scheduled + freed-slot screening, so the scheduled cron still runs underneath." Ie bila idle-cooldown just-blocked manusia0-position trigger, tapi sebuah position baru close (freed-slot) → fire screening gates with the SAME `_screeningLastTriggered` flag → bila still within 20m cooldown, freed-slot might skip also! Cross-verify behavior.
**Behavior**: bila position close at time T → `_screeningLastTriggered = T` → freed-slot-scheduled-screening tiap `management cycle` setelah → `now() - T < 20m` → idleCooldown gate skip. **Konflik**: freed-slot supposed to fire regardless (position freed up a slot), tapi shared `_screeningLastTriggered` misleadingly block.
**Mitigation**: bentak code-side — free-slot biasanya set `_screeningLastTriggered = Date.now()` eksekusi-nya sendiri setelah trigger. Kalau freed-slot fire first-time at T+19m → idle cooldown still in effect (≥20m needs), tapi freedSlot can fire (management-cycle freed-slot branch berbeda dari 0-position branch). Worth verify index.js:633 freed-slot branch.
**Potential-bug** — worth index.js cross-check. Live `idleScreeningCooldown=true` — actual behavior matter.
**Cross-F2 audit** — cycle external-trigger mapping.

### E.8 — `narrativeProfileSignal` prompt line — `getNarrativeProfileForPrompt` needs ≥8 samples/category. Inert until tagged data accrues
**Lokasi**: prompt.js:117 + CLAUDE.md "Needs ≥8 samples/category; inert until tagged data accrues."
**Temuan**: echo CLAUDE.md. **Inert** state documented. Live `narrativeProfileSignal=false` — full factory. Bila user enables, prompt line tak muncul sampai ≥8 samples kategori. Worth brief doc — "first 8 trade, no prompt line (data kapur)."
**Documented** — OK.

### E.9 — `formatYieldToMe` pure-math proxy mengabaikan per-bin liquidity concentration — explicitly labeled proxy
**Lokasi**: screening.js:46 + CLAUDE.md "ignores per-bin liquidity concentration (the accurate version needs SDK bin reserves)."
**Temuan**: `formatYieldToMe({deployAmountSol, solPriceUsd, tvlUsd, feeActiveTvlRatio})` — simple `deposit × solPrice / tvl + deposit × feeActiveTvlRatio` proxy. Kontrak-documented. **Soft signal, never gates**. Worth showing in PT — SCREENER tahu line is proxy (LOW precision).
**Documented** — sedang. OK.

### E.10 — `paper-trading` simulator AND `usePaperHistoryWhenLive` carry-over — jika user turn-on paper sim briefly then turn-off, paper records persist ke `lessons.json`
**Lokasi**: paper-trading.js track + lessons.js recordPerformance paper:true tag.
**Temuan**: Bila user enable paperTrading + DRY_RUN, run paper sim utk 50 trade → disable paper → turn DRY_RUN off. `lessons.json` berisi 50 record `paper:true` tag. `usePaperHistoryWhenLive=false` factory → `getLessonsForPrompt` filter out `l.paper` → clean. Live stats/briefing/evolve via F22 `getModePerformance` filter `!l.paper` → clean. **Isolation invariant holds** — paper records stay archived but excluded. **Bila user turn ON `usePaperHistoryWhenLive` later** → 50 records kept as 🧪 soft ref. **Retroactive carry-over** — user tak bisa selectively "forget" paper history (no /clear paper command). Future-cleanup tool?
**Documented** — paper/live isolation invariant CLAUDE.md. **Worth-F32 audit** — "paperClear" tool utk forget paper history saat transition. **Tech-debt-future**.

---

## §F — Glosarium istilah fase

- **11 experiments** — exitLiquidityCheck/marketRegimeGate/candidateMomentum/narrativeProfileSignal/expectedYieldSignal/convictionSizing/counterfactualReview/smartWalletMomentum/idleScreeningCooldown/paperTrading/usePaperHistoryWhenLive.
- **DEFAULT OFF** — `false` factory, byte-identical pre-feature.
- **fail-open contract** — experiment error never blocks normal flow. try-catch + log + factory restore.
- **indicators.enabled** — entry gate always-on when true (screening.js:780 hard-filter).
- **exitEnabled** — opt-in OFF default. exitPreset inert when false.
- **rejectAlreadyAtBottom** — opt-in OFF default. Entry veto bila token already at bottom.
- **isPaperMode()** — AND gate `DRY_RUN=true && paperTrading=true`. paper-trading.js:21.
- **usePaperHistoryWhenLive** — LIVE-only opt-in. Inject paper lessons as 🧪, excluded mechanical.
- **applyConvictionSizing** — 🧪 experiment #6. Multiplier re-clamp. Mutasi args pre-safety.
- **quoteSellPriceImpact** — `wallet.js:185` Jupiter quote utk exitLiquidityCheck.
- **getSolMarketRegime** — `wallet.js` Jupiter price v3 utk marketRegimeGate.
- **formatYieldToMe** — `screening.js:46` expectedYieldSignal proxy inject.
- **formatCandidateMomentum/formatSmartWalletMomentum** — candidate-memory.js block inject.
- **getSkipReview** — `candidate-memory.js:117` counterfactual skip-review.
- **getNarrativeProfileForPrompt** — `lessons.js:1215` narrativeProfileSignal prompt line.
- **getIndicatorExitSignal** — `index.js:1515` exit gate `confirmIndicatorPreset({side:"exit"})` opt-in.
- **idleScreeningCooldownMin** — experiments default 20m. `_screeningLastTriggered` shared.
- **convictionSizingMaxAdjustPct** — experiments default 30 → ±30%.
- **exitLiquidityMaxSlippagePct** — experiments default 10%.
- **counterfactualMinMcapGainPct** — experiments default 25%.
- **entryPreset/exitPreset** — 8 preset entry/exit.
- **smi* param** — supertrend_plus_smi subset.
- **`paper:` tag** — closed-position performance record tag.

*Lewati §0 kalau sudah paham. Isi teknis mulai §A.*

---

## §G — Link fase lain (cross-ref)

- **F26** (config core surface): source singleton + 5 fn mutation + reloadScreeningThresholds whitelist (E.1 — experiments tak covered).
- **F15** (candidate-memory): 3 experiment backing — momentum/sw_momentum/counterfactual. Shared snapshot guard.
- **F22** (getModePerformance, getNarrativeProfile): mode-scope paper/live. narrativeProfileSignal consumer.
- **F13** (dlmm.js paper integration): isPaperMode gate everywhere in dlmm.js.
- **F32** (paper-trading full lifecycle + usePaperHistoryWhenLive): full fidelity. E.10 paperClear future tool.
- **F19** (recordPerformance paper:true tag): paper records persist ke lessons.json.
- **F24** (buildRecommendations config-read): experiments read path indirect via stats injection.
- **F25** (briefing counterfactual section + keepMode paper filter): consumer downstream.
- **F28** (CONFIG_MAP `update_config`): 12 experiment+indicator entries surface mutator. Cross-verify E.1 whitelist.
- **F30** (formatFullConfig GRUP 16 + /settings toggle page): display + toggle UI.
- **F29** (default OFF paritas user-config.example.json): consistency surface.
- **F2** (runScreeningCycle market-regime gate + idle cooldown race F27-E.7): management cycle freed-slot race potential.
- **F3** (getDeterministicCloseRule): indicator exit post deterministic — exit upgrade priority chain.

---

## §H — Open-Q (bawa ke fase F28, F32, F2)

1. **E.1 experiments tak reload-whitelisted**: hand-edit experiment key → singleton OLD. Cross-F28 verify `update_config` direct-mutate experiments singleton (CONFIG_MAP entries). Document restart-required for hand-edit.
2. **E.2 `indicators.enabled` + `exitEnabled` split contract**: live entry aktiv, exit inert. Worth SETTINGS-GUIDE tag "(opt-in — nyalakan `exitEnabled`)" explicit di `exitPreset` row.
3. **E.3 `rejectAtBottom` × reversion preset konflik semantik**: bila user enable `entryPreset=bollinger_reversion` + `rejectAlreadyAtBottom=true` → veto-versus-buy-oversold war. Worth SETTINGS-GUIDE warn.
4. **E.7 idleScreeningCooldown shared `_screeningLastTriggered` race**: freed-slot might be misleadingly blocked bila last-trigger within 20m. Cross-F2 verify behavior of master cycle freed-slot branch.
5. **E.6 exitLiquidityCheck DRY-skip paper stats inflated**: paper transition to live, paper stats tak reflect exit-filter. Worth doc — paper baseline stats need caution.
6. **E.10 paperClear tool**: paper records persist saat user disable paper. Future `/clear paper` tool worth. Cross-F32.
7. **Config schema `experiments.*` flat-key doc**: user-confused bila expect nested `experiments: {...}` per CLAUDE.md. Worth SETTINGS-GUIDE clarification.
8. **`convictionSizingMaxAdjustPct=30` default safety**: re-clamp verifik-reciprocal test (amt=maxDeployAmount × 1.3) — design invariant hold. No-issue.
9. **Counterfactual horizon 24h candidate-memory retention**: too short horizon — bila market cycle >24h, "ones that got away" tak ketangkap. Worth future extension configurable horizon?
10. **Market-regime manual chat bypass**: gate hanya catch scheduled + freed-slot. Manual `/deploy` chat tak gated. Worth doc explicit — manual user override beat regime gate. Doc-clarification.