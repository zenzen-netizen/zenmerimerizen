# Audit F14 — Meteora screening funnel (discoverPools → getTopCandidates → runScreeningCycle)
> Read-only. Bukti `file:line`. UNKNOWN kalau tak pasti. Resume: buka file ini.
> Kedalaman: ⬛ deep — alasan: 3-stage funnel (discoverPools API+threshold, getTopCandidates occupied/cooldown/score/indicator, runScreeningCycle post-recon launchpad/botPct); 18 API filters + 16 reject-reason checks (getRawPoolScreeningRejectReason) + getTopCandidates re-filter (DUA tempat, drift risk); hard-guards 3 (max-pos, broke-skip sizing-aware, marketRegimeGate opt-in); shadow logging always-on (recordCandidateSnapshots + recordSmartWalletCounts, recording ≠ influencing); soft signals 3 (momentum/yield/sw_momentum, opt-in, fail-open, never gate); trusted vs untrusted text split (sanitizeUntrustedPromptText 500); Darwin signal staging at block assembly; sequenced recon 150ms delay (429 avoidance) — throughput cap; scoreCandidate ad-hoc formula (no calibration); page_size=150 fixed (no pagination); occupied filter stale cache (mitigated by F7 force-count).
> Cross-ref: F2 (runScreeningCycle hard-guards + cycle flow), F5 (SCREENER prompt + candidate block injection), F7 (deploy_position safety re-check occupied force=true), F15 (indicator entry gate + bundler + momentum/yield/sw injection), F16 (GMGN alt path + chart indicators), F21 (Darwin stageSignals + resolvePerformanceSignalSnapshot), F23 (pool-memory cooldown + candidate-memory shadow), F26 (config.screening 18-key + computeDeployAmount), F33 (Discord listener OFF, dead path).

## Ringkasan eksekutif (5 baris)
1. **3-stage funnel**: (a) `discoverPools` (screening.js:420) fetch pool-discovery API per category (multi-category merge + dedupe by pool_address), 18 API filters (warnings/pool_type/mcap/holders/volume/tvl/bin_step/fee_active_tvl_ratio/organic/age/launchpad), `getRawPoolScreeningRejectReason` (122) 16 reject conditions threshold re-check, `condensePool` (787) shape, blacklist/dev-blocklist filter, Jupiter dev enrichment bila dev null; (b) `getTopCandidates` (606) source dispatch (meteora vs gmgn), occupied pool/mint filter (getMyPositions cache 5min NO force), cooldown filter (isPoolOnCooldown/isBaseMintOnCooldown), scoreCandidate sort + slice(limit=10), PVP hard filter (opt-in), dev blocklist re-check, indicator entry gate (confirmIndicatorPreset parallel, fail-open skipped=true); (c) `runScreeningCycle` (index.js:665) hard-guards 3 (max-pos, broke-skip sizing-aware computeDeployAmount+rent, marketRegimeGate opt-in), getTopCandidates, recordCandidateSnapshots (ALWAYS shadow), sequenced recon (checkSmartWalletsOnPool+getTokenNarrative+getTokenInfo, 150ms delay), post-recon filter (launchpad allow/block + maxBotHoldersPct), lone candidate skip, recordSmartWalletCounts (ALWAYS shadow), pre-fetch active_bin parallel, build candidate blocks (gmgn vs meteora format), stage Darwin signals, agentLoop SCREENER.
2. **Hard-guards 3 di runScreeningCycle** (index.js:665-754): (a) `prePositions.total_positions >= maxPositions` → skip + appendDecision (679-690); (b) broke-skip sizing-aware — `computeDeployAmount(sol, {slotsRemaining})` + `rentPerPositionSol` + `gasReserve`, bila `plannedDeploy < minDeployAmount() OR sol < needForOne` → skip (705-717), DRY_RUN exempt; (c) `marketRegimeGate` opt-in (725-748) — `getSolMarketRegime()` 24h change, bila `< -marketRegimeMaxDrop24hPct` → skip, fail-open (error → allow). Semua skip = appendDecision + cycleSkip return, NO LLM call.
3. **Hard filters 3-layer defense**: (a) `discoverPools` API filters (18 conditions di URL `filter_by=…&&…`) + `getRawPoolScreeningRejectReason` (122-181) threshold re-check 16 conditions; (b) `getTopCandidates` re-filter tvl/fee/volatility/occupied/cooldown (648-687) — DUPLIKAT threshold logic dgn discoverPools, drift risk; (c) `runScreeningCycle` post-recon filter launchpad allow/block + maxBotHoldersPct (823-844). NO silent drop — `filteredOut` tracked + `filtered_examples.slice(0,3)` returned + `all_filtered` full list. `pushFilteredReason` (866) helper.
4. **Soft signals 3 (opt-in experiments, fail-open, never gate)**: (a) `candidateMomentum` — `formatCandidateMomentum(getCandidateMomentum(pool.pool))` → `momentum:` line (928-934); (b) `expectedYieldSignal` — `formatYieldToMe({deployAmountSol, solPriceUsd, tvlUsd, feeActiveTvlRatio})` (screening.js:46) → `yield_to_me:` line (940-950), proxy `(deposit×SOLprice/tvl)% of pool TVL + (deposit×fee_active_tvl_ratio) SOL fees/window`, ignores bin concentration; (c) `smartWalletMomentum` — `formatSmartWalletMomentum(getSmartWalletMomentum(pool.pool))` → `sw_momentum:` line (955-960). All OFF by default → line null → drops from block. Trusted lines (our own metrics, not external text). Shadow logging ALWAYS: `recordCandidateSnapshots` (793) + `recordSmartWalletCounts` (901) run even when experiments OFF — "recording ≠ influencing".
5. **Candidate block injection ke SCREENER** (index.js:916-1026 + 1032-1038): `passing.map` build block — gmgn format (966-978) vs meteora format (983-998). Block = `POOL: name (address)` + `metrics:` + `audit:` + `gmgn_price:` (gmgn only) + `pvp:` + `smart_wallets:` + `active_bin:` + `1h:` + `momentum:` + `yield_to_me:` + `sw_momentum:` + `narrative_untrusted:` (sanitized 500) + `memory_untrusted:` (sanitized 500). Darwin `stageSignals` (1001-1022) — 13 signals (organic/fee_tvl/volume/mcap/holders/sw_present/narrative_quality/volatility + entry_top10/bot/age/mint_disabled/freeze_disabled/dev_migrations). `agentLoop` prompt: `PRE-LOADED CANDIDATES (N pools):` + blocks + SOP instruction "data is final — judge straight from it, do NOT re-fetch".

## Progress
- [x] Baca screening.js 28-120 (normalizeSymbol + formatYieldToMe + scoreCandidate + numeric + isUsableVolatility + includesCaseInsensitive + getPoolLaunchpad + getPoolBaseMint + getVolatilityTimeframe)
- [x] Baca screening.js 122-181 (getRawPoolScreeningRejectReason 16 conditions)
- [x] Baca screening.js 420-600 (discoverPools 18 filters + multi-category + Discord + applyVolatilityTimeframe + condensePool + blacklist/dev-blocklist + Jupiter dev enrichment)
- [x] Baca screening.js 606-766 (getTopCandidates source dispatch + occupied/cooldown/score/PVP/dev-blocklist/indicator gate)
- [x] Baca screening.js 787-872 (condensePool shape + round/fix + pushFilteredReason)
- [x] Baca index.js 665-754 (runScreeningCycle hard-guards 3)
- [x] Baca index.js 778-844 (getTopCandidates + recordCandidateSnapshots + sequenced recon + post-recon filter)
- [x] Baca index.js 846-895 (no-candidates + lone candidate skip)
- [x] Baca index.js 897-1026 (recordSmartWalletCounts + active_bin pre-fetch + candidate block build + Darwin stageSignals)
- [x] Baca index.js 1032-1040 (agentLoop SCREENER prompt injection)
- [x] Baca pool-memory.js 60-82/227-242 (setPoolCooldown/setBaseMintCooldown + isPoolOnCooldown/isBaseMintOnCooldown)
- [x] Tulis §0 + §A-§H

---

## §0. Cara Kerja (Bahasa Awam)

**Analogi** (dua sudut pandang sehari-hari)
- *Talent scout sepak bola*: scout pergi ke liga amatir (pool-discovery API) dgn 18 syarat filter (usia, tinggi, gol, dll). Yg lmasuk direkap + diberi nilai (scoreCandidate). Top 10 difilm + diwawancara (recon: smart-wallets, narrative, token-info). Yg lulus wawancara masuk ke meja pelatih (SCREENER LLM) dgn rapor lengkap. Pelatih putuskan mainkan atau buang. Kalau ada 1 kandidat tapi rapor merah (skip reason), dilepas. Kalau liga sedang kacau (SOL drop >8%), scout tak jalan.
- *Filter rekrutmen 3-tahap*: HRD filter CV (discoverPools), psikotes (getTopCandidates), wawancara + background check (runScreeningCycle recon). Tiap tahap catat siapa ditolak + kenapa (filteredOut). Tak ada drop diam-diam. Tapi 3 tahap = 3 tempat threshold — bila syarat berubah, 3 tempat harus update (drift risk).

**Di bot, ini = Meteora screening funnel** (1-2 kalimat)
3-stage pipeline: `discoverPools` fetch pool-discovery API dgn 18 filters → `getTopCandidates` re-filter occupied/cooldown/score/indicator → `runScreeningCycle` post-recon filter launchpad/botPct → candidate blocks inject ke SCREENER LLM. Hard filters di 3 layer, soft signals (momentum/yield/sw) opt-in, shadow logging always-on.

**Posisi fase ini di alur bot** (1 paragraf)
Datang setelah F2 (cycle orchestration trigger screening) + F1 (cron tick). Sebelum F4 (SCREENER LLM agentLoop) + F7 (deploy safety). F14 = hulu screening: cron tick → runScreeningCycle → getTopCandidates → discoverPools → API. Tanpa F14, SCREENER LLM tak punya kandidat → cycle no-op. Fail-open F14 = getTopCandidates error → cycleFail return, NO deploy.

**Langkah kerja** (5-10 nomor, istilah teknis)
1. Trigger: `runScreeningCycle` (index.js:665) dari cron scheduled OR freed-slot (post-management) OR manual chat. `_screeningBusy` guard (666) cegah concurrent.
2. Hard-guard 1: `getMyPositions({force:true})` → `prePositions.total_positions >= maxPositions` → skip + appendDecision (679-690).
3. Hard-guard 2: broke-skip sizing-aware — `computeDeployAmount(sol, {slotsRemaining})` + `rentPerPositionSol` + `gasReserve`, bila `plannedDeploy < minDeployAmount() OR sol < plannedDeploy+gasReserve+rent` → skip (705-717), DRY_RUN exempt.
4. Hard-guard 3: `marketRegimeGate` opt-in — `getSolMarketRegime()` 24h change `< -marketRegimeMaxDrop24hPct` → skip (725-748), fail-open.
5. `getTopCandidates({limit:10})` (779) → source dispatch (meteora/gmgn) → `discoverPools` (meteora) fetch pool-discovery API per category, 18 filters, multi-category merge + dedupe → `getRawPoolScreeningRejectReason` threshold re-check → `condensePool` → blacklist/dev-blocklist filter → Jupiter dev enrichment.
6. getTopCandidates re-filter (648-687): tvl/fee/volatility re-check (DUA tempat), occupied pool/mint (getMyPositions cache 5min NO force), cooldown (isPoolOnCooldown/isBaseMintOnCooldown). scoreCandidate sort + slice(10). PVP hard filter (opt-in). Dev blocklist re-check. Indicator entry gate (confirmIndicatorPreset parallel, fail-open skipped=true).
7. `recordCandidateSnapshots(candidates)` (793) — ALWAYS shadow, fail-open. Candidate-memory.json prune 24h.
8. Sequenced recon (803-818): per candidate, `Promise.allSettled([checkSmartWalletsOnPool, getTokenNarrative, getTokenInfo])` + 150ms delay antar candidate (429 avoidance). NO parallel across candidates.
9. Post-recon filter (823-844): launchpad allow/block (maxBotHoldersPct). Lone candidate skip (879-895, `getLoneCandidateSkipReason` UNKNOWN logic). `recordSmartWalletCounts` (901) — ALWAYS shadow.
10. Pre-fetch `active_bin` parallel (911-913). Build candidate blocks (916-1026): gmgn vs meteora format, soft signals 3 opt-in, `sanitizeUntrustedPromptText(500)` utk narrative/memory, Darwin `stageSignals` (1001-1022).
11. `agentLoop` SCREENER (1032) dgn `PRE-LOADED CANDIDATES (N pools):` + blocks. LLM decide deploy_position OR no_deploy.

**Output screening funnel**: candidate blocks string injected ke SCREENER LLM prompt; `screenReport` (cycleSkip/cycleFail/buildNoCandidates/buildLoneNoDeploy) return; `appendDecision` audit-trail (skip/no_deploy/no_candidates); `stageSignals` utk Darwin; `recordCandidateSnapshots`/`recordSmartWalletCounts` shadow utk momentum/sw-momentum/counterfactual.

**Kalau rusak / diskip** (2-3 kalimat, istilah teknis)
discoverPools API down → getTopCandidates return `_error` → cycleFail, NO LLM call, NO deploy (safe). getTopCandidates occupied filter cache stale (getMyPositions NO force) → suggest pool yg baru di-deploy → F7 deploy_position safety re-check force=true reject → wasted LLM cycle (not double-deploy, F7 prevents). scoreCandidate formula ad-hoc → wrong ranking → LLM liat pool suboptimal pertama → deploy pool lemah. Indicator gate fail-open (API down) → ALL pass → over-deploy bila indicator sumber false-positive.

**Istilah yang muncul di fase ini** (bullet, cuma yang baru)
- **pool-discovery API** — Meteora endpoint `pool-discovery-api.datapi.meteora.ag/pools`, filter_by URL params.
- **discoverPools** — stage 1, fetch + threshold filter + condensePool shape.
- **getTopCandidates** — stage 2, source dispatch + occupied/cooldown/score/indicator.
- **runScreeningCycle** — stage 3, hard-guards + recon + post-filter + agentLoop.
- **getRawPoolScreeningRejectReason** — 16 reject conditions, used di discoverPools threshold filter (122-181).
- **scoreCandidate** — `fee_tvl×1000 + organic×10 + volume/100 + holders/100` (ad-hoc, no calibration).
- **condensePool** — shape raw API row → candidate block row (787-855).
- **pushFilteredReason** — helper track rejected + reason (866-872).
- **broke-skip** — sizing-aware hard-guard, `computeDeployAmount + rent + gasReserve` (705-717).
- **marketRegimeGate** — opt-in hard-guard, SOL 24h drop > limit → skip (725-748).
- **shadow logging** — recordCandidateSnapshots + recordSmartWalletCounts ALWAYS, "recording ≠ influencing".
- **soft signal** — opt-in experiment line (momentum/yield/sw_momentum), trusted, fail-open, never gate.
- **trusted vs untrusted text** — our metrics (trusted) vs external narrative/memory (sanitizeUntrustedPromptText 500).
- **stageSignals** — Darwin 13-signal staging at block assembly, cleared at close (F12 resolvePerformanceSignalSnapshot).

*Lewati §0 kalau sudah paham. Isi teknis mulai §A.*

---

## §A. Peta block fase ini (file:line → peran)

| file:line | simbol | peran |
|---|---|---|
| screening.js:420-600 | discoverPools | stage 1: API fetch + 18 filters + threshold re-check + condense + blacklist |
| screening.js:424-446 | API filters (18) | URL `filter_by=…&&…` build |
| screening.js:452-479 | multi-category merge | categories[] dedupe by pool_address |
| screening.js:481-530 | Discord signals merge | useDiscordSignals opt-in, only/merge mode |
| screening.js:532-533 | applyVolatilityTimeframe + enrichDiscordLaunchpads | ensure ≥ min volatility timeframe |
| screening.js:536-542 | threshold re-check | getRawPoolScreeningRejectReason filter |
| screening.js:547-560 | blacklist/dev-blocklist filter | isBlacklisted/isDevBlocked |
| screening.js:564-593 | Jupiter dev enrichment | batch-fetch dev bila null + dev-blocklist non-empty |
| screening.js:606-766 | getTopCandidates | stage 2: source dispatch + occupied/cooldown/score/indicator |
| screening.js:619-635 | GMGN blacklist filter | meteora path runs in discoverPools, GMGN here |
| screening.js:648-687 | getTopCandidates re-filter | tvl/fee/volatility/occupied/cooldown (DUA tempat) |
| screening.js:691-702 | PVP filter | avoidPvpSymbols (warn) + blockPvpSymbols (hard) |
| screening.js:704-717 | dev blocklist re-check | filter blocked deployer |
| screening.js:719-756 | indicator entry gate | confirmIndicatorPreset parallel, fail-open skipped=true |
| screening.js:758-765 | return shape | {candidates, total_screened, source, filtered_examples, stage_counts, all_filtered} |
| screening.js:122-181 | getRawPoolScreeningRejectReason | 16 reject conditions w/ reasons |
| screening.js:69-78 | scoreCandidate | ad-hoc formula fee×1000+organic×10+vol/100+holders/100 |
| screening.js:787-855 | condensePool | shape raw API → candidate row |
| screening.js:866-872 | pushFilteredReason | helper track rejected |
| screening.js:46-67 | formatYieldToMe | soft signal yield_to_me proxy |
| index.js:665-670 | runScreeningCycle entry | _screeningBusy guard |
| index.js:671 | _screeningLastTriggered | race guard (F1) |
| index.js:679-690 | hard-guard 1 max-pos | skip + appendDecision |
| index.js:691-717 | hard-guard 2 broke-skip | sizing-aware computeDeployAmount+rent+gas |
| index.js:725-748 | hard-guard 3 marketRegimeGate | opt-in SOL 24h drop, fail-open |
| index.js:779-784 | getTopCandidates call | limit=10, catch _error |
| index.js:793-796 | recordCandidateSnapshots | ALWAYS shadow, fail-open |
| index.js:803-818 | sequenced recon | checkSmartWalletsOnPool+getTokenNarrative+getTokenInfo, 150ms delay |
| index.js:823-844 | post-recon filter | launchpad allow/block + maxBotHoldersPct |
| index.js:846-872 | no-candidates report | buildNoCandidates + funnel + thresholds |
| index.js:879-895 | lone candidate skip | getLoneCandidateSkipReason (UNKNOWN logic) |
| index.js:901-908 | recordSmartWalletCounts | ALWAYS shadow, fail-open |
| index.js:911-913 | active_bin pre-fetch | Promise.allSettled parallel |
| index.js:916-1026 | candidate block build | gmgn vs meteora format + soft signals + Darwin stage |
| index.js:928-934 | momentumLine | candidateMomentum opt-in, fail-open |
| index.js:940-950 | yieldLine | expectedYieldSignal opt-in, fail-open |
| index.js:955-960 | swMomentumLine | smartWalletMomentum opt-in, fail-open |
| index.js:962-964 | pvpLine | pool.is_pvp flag (warn only unless blockPvpSymbols) |
| index.js:976-977 | sanitizeUntrustedPromptText | narrative/memory 500-char sanitization |
| index.js:1001-1022 | stageSignals (Darwin) | 13 signals staged at block assembly |
| index.js:1032-1038 | agentLoop SCREENER | PRE-LOADED CANDIDATES prompt injection |
| pool-memory.js:65-82 | setPoolCooldown/setBaseMintCooldown | cooldown writers |
| pool-memory.js:173-177 | low-yield auto-cooldown | 4h cooldown on low yield close |
| pool-memory.js:227-242 | isPoolOnCooldown/isBaseMintOnCooldown | cooldown readers (used di getTopCandidates) |

---

## §B. Alur data hulu→hilir (ASCII diagram)

```
runScreeningCycle({silent})  index.js:665
  │
  ├─ _screeningBusy guard (cegeh concurrent)
  ├─ _screeningLastTriggered = now (race guard F1)
  │
  ├─ Hard-guard 1: getMyPositions({force:true}).total >= maxPositions?
  │   YES → cycleSkip + appendDecision("skip", "Max positions") → return
  │
  ├─ Hard-guard 2: broke-skip sizing-aware
  │   computeDeployAmount(sol, {slotsRemaining}) + rentPerPositionSol + gasReserve
  │   bila (plannedDeploy < minDeployAmount() OR sol < planned+gas+rent) AND !DRY_RUN
  │   → cycleSkip + appendDecision("skip", "modal kurang") → return
  │
  ├─ Hard-guard 3: marketRegimeGate (opt-in)
  │   getSolMarketRegime().change24hPct < -marketRegimeMaxDrop24hPct?
  │   YES → cycleSkip + appendDecision("skip", "market risk-off") → return
  │   fail-open: error → allow screening
  │
  ├─ getTopCandidates({limit:10})  screening.js:606
  │   │
  │   ├─ source dispatch: meteora → discoverPools / gmgn → discoverGmgnPools (F16)
  │   │
  │   ├─ discoverPools (meteora)  screening.js:420
  │   │   ├─ build 18 API filters (warnings/pool_type/mcap/holders/volume/tvl/bin_step/fee/organic/age/launchpad)
  │   │   ├─ multi-category: Promise.all fetchPoolDiscoveryPage per category, dedupe by pool_address
  │   │   ├─ Discord signals merge (useDiscordSignals opt-in, only/merge)
  │   │   ├─ applyVolatilityTimeframe (ensure ≥ min timeframe)
  │   │   ├─ enrichDiscordSignalLaunchpads
  │   │   ├─ getRawPoolScreeningRejectReason threshold re-check (16 conditions)
  │   │   ├─ condensePool shape (raw API → candidate row)
  │   │   ├─ blacklist/dev-blocklist filter (isBlacklisted/isDevBlocked)
  │   │   └─ Jupiter dev enrichment (batch fetch bila dev null + dev-blocklist non-empty)
  │   │
  │   ├─ getTopCandidates re-filter (648-687)
  │   │   ├─ tvl/fee/volatility re-check (DUA tempat, drift risk)
  │   │   ├─ occupied pool/mint (getMyPositions cache 5min NO force)
  │   │   ├─ cooldown (isPoolOnCooldown/isBaseMintOnCooldown)
  │   │   └─ scoreCandidate sort + slice(limit=10)
  │   │
  │   ├─ PVP filter (opt-in: avoidPvpSymbols warn, blockPvpSymbols hard)
  │   ├─ Dev blocklist re-check
  │   └─ Indicator entry gate (confirmIndicatorPreset parallel, fail-open skipped=true)
  │       → return {candidates, total_screened, source, filtered_examples, all_filtered}
  │
  ├─ recordCandidateSnapshots(candidates)  ALWAYS shadow, fail-open
  │
  ├─ Sequenced recon (803-818)
  │   for each candidate:
  │     Promise.allSettled([checkSmartWalletsOnPool, getTokenNarrative, getTokenInfo])
  │     + 150ms delay (429 avoidance)
  │   → allCandidates = [{pool, sw, n, ti, mem}]
  │
  ├─ Post-recon filter (823-844)
  │   ├─ launchpad allow/block (maxBotHoldersPct)
  │   └─ filteredOut tracking
  │
  ├─ Lone candidate skip (879-895, getLoneCandidateSkipReason UNKNOWN)
  │
  ├─ recordSmartWalletCounts(passing)  ALWAYS shadow, fail-open
  │
  ├─ Pre-fetch active_bin parallel (911-913)
  │
  ├─ Build candidate blocks (916-1026)
  │   per candidate:
  │     block = POOL + metrics + audit + gmgn_price? + pvp? + smart_wallets + active_bin + 1h?
  │            + momentum? + yield_to_me? + sw_momentum? + narrative_untrusted + memory_untrusted?
  │     stageSignals (Darwin, 13 signals)
  │
  └─ agentLoop SCREENER  index.js:1032
      prompt: SCREENING CYCLE + strategyBlock + Positions/SOL/Deploy + PRE-LOADED CANDIDATES + blocks + SOP
      → LLM decide deploy_position OR no_deploy
```

---

## §C. Sinkron: siapa-panggil-siapa

| Pemanggil (file:line) | Dipanggil (file:line) | Trigger | Data lewat | Fail-mode |
|---|---|---|---|---|
| index.js:509/634 cron | index.js:665 runScreeningCycle | scheduled/freed-slot | {silent} | .catch log |
| index.js:678 runScreeningCycle | dlmm.js getMyPositions({force:true}) | hard-guard 1 | — | throw → cycleFail |
| index.js:678 | wallet.js getWalletBalances | hard-guard 2 | — | throw → cycleFail |
| index.js:702 | config.js computeDeployAmount | broke-skip | sol, {slotsRemaining} | — |
| index.js:728 | wallet.js getSolMarketRegime | marketRegimeGate | — | catch → allow (fail-open) |
| index.js:779 | screening.js:606 getTopCandidates | cycle body | {limit:10} | _error → cycleFail |
| screening.js:613/614 | gmgn.js discoverGmgnPools / screening.js:420 discoverPools | source dispatch | — | throw → propagates |
| screening.js:458 | screening.js:195 fetchPoolDiscoveryPage | per category | {page_size, filters, timeframe, category} | catch → [] (fail-open per category) |
| screening.js:537 | screening.js:122 getRawPoolScreeningRejectReason | threshold re-check | pool, s | reason string or null |
| screening.js:639 | dlmm.js getMyPositions() | occupied filter | — (cache 5min NO force) | stale → double-suggest (F7 mitigates) |
| screening.js:676/681 | pool-memory.js isPoolOnCooldown/isBaseMintOnCooldown | cooldown filter | pool/base_mint | false bila no entry |
| screening.js:723 | chart-indicators.js confirmIndicatorPreset | indicator gate | {mint, side:"entry"} | catch → skipped:true (fail-open) |
| index.js:793 | candidate-memory.js recordCandidateSnapshots | shadow | candidates | catch → log (fail-open) |
| index.js:806-808 | smart-wallets/checkSmartWalletsOnPool, token.getTokenNarrative, token.getTokenInfo | sequenced recon | pool_address/mint | Promise.allSettled per-candidate |
| index.js:815 | pool-memory.js recallForPool | memory fetch | pool | null bila no memory |
| index.js:901 | candidate-memory.js recordSmartWalletCounts | shadow | passing.map | catch → log |
| index.js:912 | dlmm.js getActiveBin | pre-fetch | pool_address | allSettled |
| index.js:931 | candidate-memory.js getCandidateMomentum + formatCandidateMomentum | soft signal | pool | catch → omit line |
| index.js:942 | screening.js:46 formatYieldToMe | soft signal | deployAmount, solPrice, tvl, fee | null bila bad input |
| index.js:957 | candidate-memory.js getSmartWalletMomentum + formatSmartWalletMomentum | soft signal | pool | catch → omit line |
| index.js:976 | (sanitize) sanitizeUntrustedPromptText | untrusted text | narrative/memory, 500 | — |
| index.js:1003 | signal-weights.js stageSignals | Darwin staging | pool, 13 signals | — |
| index.js:1032 | agent.js agentLoop | SCREENER LLM | prompt + blocks | LLM error → propagates |

---

## §D. Logika kunci per fungsi

### discoverPools (screening.js:420-600)
- Apa: stage 1 — fetch pool-discovery API per category, 18 filters, threshold re-check, condense, blacklist, dev enrichment.
- Kapan dipicu: getTopCandidates source=meteora (614).
- Output: {total, pools (condensed), filtered_examples}.
- Sinkron: config.screening (18 keys); getRawPoolScreeningRejectReason (threshold); condensePool (shape); isBlacklisted/isDevBlocked (token-blacklist/dev-blocklist); pool-discovery API.
- Fail-mode: category fetch fail → [] (fail-open per category); Discord fetch fail → [] ; Jupiter dev enrichment fail → dev null (skip dev-blocklist check); threshold reject → filteredExamples track.
- Bukti: screening.js:420-600.

### getTopCandidates (screening.js:606-766)
- Apa: stage 2 — source dispatch, occupied/cooldown/score/indicator filter, return top N.
- Kapan dipicu: runScreeningCycle (index.js:779).
- Output: {candidates, total_screened, source, filtered_examples, stage_counts, all_filtered}.
- Sinkron: discoverPools (meteora) / discoverGmgnPools (F16); getMyPositions (occupied, cache 5min NO force); pool-memory cooldown; scoreCandidate; confirmIndicatorPreset (F15).
- Fail-mode: source invalid → throw; getMyPositions cache stale → double-suggest (F7 mitigates force=true); indicator API down → skipped:true pass all (fail-open); PVP enrichPvpRisk fail → UNKNOWN.
- Bukti: screening.js:606-766.

### runScreeningCycle (index.js:665-1040)
- Apa: stage 3 — hard-guards, recon, post-filter, candidate block build, agentLoop SCREENER.
- Kapan dipicu: cron scheduled/freed-slot (F1/F2), manual chat.
- Output: screenReport (cycleSkip/cycleFail/buildNoCandidates/buildLoneNoDeploy) + agentLoop content; side-effects: appendDecision, recordCandidateSnapshots, recordSmartWalletCounts, stageSignals.
- Sinkron: getMyPositions force=true (hard-guard 1); computeDeployAmount (hard-guard 2); getSolMarketRegime (hard-guard 3); getTopCandidates; checkSmartWalletsOnPool/getTokenNarrative/getTokenInfo (recon); recallForPool (memory); getActiveBin; stageSignals (Darwin); agentLoop (F4).
- Fail-mode: pre-check throw → cycleFail; getTopCandidates _error → cycleFail; recon Promise.allSettled per-candidate (no throw); no candidates → buildNoCandidates; lone candidate skip → buildLoneNoDeploy.
- Bukti: index.js:665-1040.

### getRawPoolScreeningRejectReason (screening.js:122-181)
- Apa: 16 reject conditions w/ reason string (warnings/pool_type/mcap/holders/volume/tvl/bin_step/volatility/fee/organic/launchpad/age).
- Kapan dipicu: discoverPools threshold re-check (537).
- Output: reason string or null (null = pass).
- Sinkron: config.screening (s param); getPoolLaunchpad (launchpad field normalize).
- Fail-mode: field missing → reject dgn "unknown" reason (strict — missing = reject).
- Bukti: screening.js:122-181.

### scoreCandidate (screening.js:69-78)
- Apa: ad-hoc ranking `fee_tvl×1000 + organic×10 + volume/100 + holders/100`. GMGN path: `gmgn_score + fee_tvl×500`.
- Kapan dipicu: getTopCandidates sort (688).
- Output: number (higher = better).
- Sinkron: pool.fee_active_tvl_ratio, organic_score, volume_window, holders.
- Fail-mode: NaN fields → Number(x||0) → 0 contribution. NO normalization (volume $100k dominates holders 1000).
- Bukti: screening.js:69-78.

### condensePool (screening.js:787-855)
- Apa: shape raw API row → candidate block row (metrics + audit + position health + price action + activity).
- Kapan dipicu: discoverPools (544).
- Output: condensed pool object.
- Sinkron: getVolatilityTimeframe (ensure ≥ min); round/fix helpers.
- Fail-mode: missing fields → null. NO throw.
- Bukti: screening.js:787-855.

### isPoolOnCooldown/isBaseMintOnCooldown (pool-memory.js:227-242)
- Apa: cooldown reader — `cooldown_until > now`.
- Kapan dipicu: getTopCandidates (676/681).
- Output: boolean.
- Sinkron: setPoolCooldown/setBaseMintCooldown (writers, 65-82); recordPoolDeploy low-yield auto-cooldown 4h (173-177).
- Fail-mode: no entry → false. Stale cooldown_until → false (past).
- Bukti: pool-memory.js:227-242.

---

## §E. Temuan: bug / gap / kontrak-kunci / fail-open tak-terpenuhi

### G1. page_size=150 fixed — NO pagination (sedang)
- discoverPools (screening.js:420-421) `page_size=150` hardcoded. Bila category pool count >150, sisa ilang. Multi-category (452-479) mitigates breadth tapi per-category cap 150.
- Realistic risk: trending category jarang >150, tapi new-pairs bisa overflow. Silent gap bila triggers.
- Fix arah: config.screening.pageSize (default 150), OR pagination loop bila total > page_size.
- Bukti: screening.js:420-421, 458.

### G2. getTopCandidates occupied filter cache 5min NO force (sedang)
- screening.js:639 `const { positions } = await getMyPositions()` — NO `force:true`. Cache TTL 5min (F11). Bila new deploy barusan, cache stale → occupiedPools/occupiedMints miss → suggest pool yg baru di-deploy → LLM attempt deploy_position → F7 safety re-check force=true reject → wasted LLM cycle.
- Mitigation: F7 deploy_position safety (executor.js) uses force=true fresh count. NO double-deploy, tapi wasted cycle.
- Fix arah: getMyPositions({force:true}) di getTopCandidates (cost: extra RPC each screening cycle). Atau invalidate cache post-deploy.
- Bukti: screening.js:639, F11 cache TTL.

### G3. scoreCandidate ad-hoc formula — no calibration (sedang)
- `fee_tvl×1000 + organic×10 + volume/100 + holders/100` (screening.js:69-78). No normalization: volume $100k contributes 1000, holders 1000 contributes 10, fee_tvl 0.1 contributes 100, organic 60 contributes 600. Volume dominates bila besar. No documented rationale.
- Impact: ranking suboptimal → LLM liat pool "high volume low fee" lebih dulu. Tapi LLM baca metrics raw juga (block ada tvl/fee/organic), jadi LLM bisa override ranking.
- Fix arah: normalize per-field (z-score) OR weighted formula dgn config-driven weights (Darwin could evolve these — cross-ref F21).
- Bukti: screening.js:69-78.

### G4. threshold logic DUPLICATE 2 tempat — drift risk (sedang)
- discoverPools: `getRawPoolScreeningRejectReason` (122-181) 16 conditions. getTopCandidates: re-filter tvl/fee/volatility (648-687). Sama tvl/fee/volatility check di DUA tempat.
- Defense-in-depth (in case API returns stale/wrong data after filter), tapi bila threshold logic berubah (e.g. add maxVolatility, OR change fee comparison), 2 places update. getRawPoolScreeningRejectReason lebih lengkap (16 conditions), getTopCandidates cuma 3 (tvl/fee/volatility) — sudah drift (occupied/cooldown hanya di getTopCandidates, OK; tapi mcap/holders/volume/bin_step/organic/launchpad/age hanya di discoverPools, tidak re-check di getTopCandidates).
- Kontrak: discoverPools = strict API+threshold, getTopCandidates = post-cache re-check 3 kunci (tvl/fee/volatility) + occupied/cooldown. Tapi tidak documented mana "kunci" vs "lengkap".
- Bukti: screening.js:122-181 vs 648-687.

### G5. indicator gate fail-open — over-deploy risk bila API down (sedang)
- screening.js:728-738: `catch → {confirmed:true, skipped:true}`. API down → ALL candidates pass indicator gate. Bila indicator sumber false-positive (e.g. bullish supertrend di bear market), fail-open = over-deploy.
- Kontrak fail-open documented (CLAUDE.md F15: "API down → {confirmed:true, skipped:true}"). Tapi consequence: bila indicator adalah last-line defense (after threshold/cooldown), fail-open = gate无效 saat paling dibutuhkan (API flaky).
- Mitigation: skipped flag logged, operator bisa monitor. Tapi NO alert.
- Bukti: screening.js:728-738.

### G6. Discord signals dead path (rendah)
- screening.js:481-530 `useDiscordSignals` default OFF. CLAUDE.md F33: "Discord listener kerangka OFF (`useDiscordSignals=false`)". Bila listener off, `fetchDiscordSignalCandidates` returns [] → merge/only no-op. Dead code path.
- Tapi code path lengkap (only/merge mode, refresh stale snapshots, enrich launchpads). Bila Discord listener di-onkan suatu hari, path siap.
- Bukti: screening.js:481-530, CLAUDE.md F33.

### G7. lone candidate skip — UNKNOWN logic (open-Q)
- index.js:879-895: `getLoneCandidateSkipReason(passing[0])`. Bila single candidate + skip reason → no_deploy. Function not read in this audit.
- Risk: skip reason too aggressive → bot never deploys when only 1 candidate. Tapi `buildLoneNoDeploy` return + appendDecision audit-trail.
- → bawa F15/F16 (indicator/bundler — mungkin skip reason related to indicator reject atau bundler).
- Bukti: index.js:879-895.

### G8. shadow logging always-on — candidate-memory.json bloat (rendah)
- `recordCandidateSnapshots` (793) + `recordSmartWalletCounts` (901) ALWAYS run, even experiments OFF. Comment: "recording ≠ influencing". Candidate-memory.json prune 24h (CLAUDE.md F23).
- Bila experiments never on, data ter-record utk 24h lalu prune. NO long-term bloat. Tapi write I/O tiap screening cycle utk data yg tak dipakai bila experiments off.
- Mitigation: 24h prune bounded. Tapi NO toggle utk shadow logging (always-on by design).
- Bukti: index.js:793, 901; CLAUDE.md F23.

### G9. sequenced recon 150ms delay — throughput cap (rendah)
- index.js:803-818: per candidate `Promise.allSettled([3 recon calls])` + 150ms delay antar candidate. 10 candidates → ~1.5s + API latency per candidate (sequential). NO parallel across candidates.
- Throughput cap: 10 candidates × (~API latency + 150ms) = 5-15s screening recon. Acceptable for 30min interval. Tapi bila interval di-turunin (adaptiveScreening floor), cap could bind.
- Mitigation: 150ms avoids 429s. Parallel across candidates would risk rate-limit. Trade-off documented.
- Bukti: index.js:803-818.

### G10. sanitizeUntrustedPromptText 500-char — prompt injection sanitization (KONTRAK)
- index.js:976-977: `sanitizeUntrustedPromptText(n.narrative, 500)` + `sanitizeUntrustedPromptText(mem, 500)`. External text (narrative from getTokenNarrative, memory from recallForPool) sanitized sebelum prompt injection. Trusted lines (momentum/yield/sw_momentum, our metrics) NOT sanitized.
- Kontrak: trusted (our metrics, numeric) vs untrusted (external text, string). Defense vs prompt injection dari narrative/memory content.
- Bukti: index.js:976-977. (sanitizeUntrustedPromptText impl — bawa F5 prompt audit utk deep.)

---

## §F. Glosarium istilah fase

- **pool-discovery API**: Meteora endpoint `pool-discovery-api.datapi.meteora.ag/pools`, filter_by URL params.
- **discoverPools**: stage 1, fetch + threshold filter + condensePool shape (screening.js:420).
- **getTopCandidates**: stage 2, source dispatch + occupied/cooldown/score/indicator (606).
- **runScreeningCycle**: stage 3, hard-guards + recon + post-filter + agentLoop (index.js:665).
- **getRawPoolScreeningRejectReason**: 16 reject conditions, discoverPools threshold filter (122-181).
- **scoreCandidate**: ad-hoc `fee×1000+organic×10+vol/100+holders/100` (69-78).
- **condensePool**: shape raw API → candidate block row (787-855).
- **pushFilteredReason**: helper track rejected + reason (866-872).
- **broke-skip**: sizing-aware hard-guard, `computeDeployAmount + rent + gasReserve` (705-717).
- **marketRegimeGate**: opt-in hard-guard, SOL 24h drop > limit → skip (725-748).
- **shadow logging**: recordCandidateSnapshots + recordSmartWalletCounts ALWAYS, "recording ≠ influencing".
- **soft signal**: opt-in experiment line (momentum/yield/sw_momentum), trusted, fail-open, never gate.
- **trusted vs untrusted text**: our metrics (trusted) vs external narrative/memory (sanitizeUntrustedPromptText 500).
- **stageSignals**: Darwin 13-signal staging at block assembly, cleared at close (F12).
- **cooldown**: pool/token temporary block setelah close (low-yield 4h, or manual), isPoolOnCooldown/isBaseMintOnCooldown readers.
- **occupied filter**: skip pool/mint yg sudah ada position (getMyPositions cache 5min NO force, F7 force=true re-check).
- **filteredOut**: rejected candidates tracking, `filtered_examples.slice(0,3)` + `all_filtered` returned.

---

## §G. Link fase lain (cross-ref)

- **F2**: runScreeningCycle hard-guards + cycle flow. F14 = detail funnel di dalam F2's runScreeningCycle.
- **F5**: SCREENER prompt + candidate block injection. F14 builds blocks, F5 = SOP + racikan injection.
- **F7**: deploy_position safety re-check occupied force=true (mitigates G2 stale cache). F14 = hulu, F7 = hilir gate.
- **F15**: indicator entry gate (confirmIndicatorPreset) + bundler detect + momentum/yield/sw injection detail. F14 = funnel overview, F15 = indicator/bundler/soft-signal depth.
- **F16**: GMGN alt path (discoverGmgnPools, source=gmgn). F14 = meteora path, F16 = gmgn path.
- **F21**: Darwin stageSignals (13 signals, staged at block assembly) + resolvePerformanceSignalSnapshot (cleared at close F12). F14 = staging point, F21 = Darwin depth.
- **F23**: pool-memory cooldown (isPoolOnCooldown/isBaseMintOnCooldown) + candidate-memory shadow (recordCandidateSnapshots/recordSmartWalletCounts). F14 = consumer, F23 = store depth.
- **F26**: config.screening (18 keys) + computeDeployAmount (broke-skip sizing). F14 = consumer, F26 = config depth.
- **F33**: Discord listener OFF (useDiscordSignals=false dead path, G6). F14 = consumer, F33 = edge.

---

## §H. Open-Q (bawa ke fase lain)

1. **page_size=150 (G1)** — config.pageSize OR pagination loop? Realistic overflow risk per category? → bawa F23 memory stores audit (candidate-memory related).
2. **getTopCandidates occupied force (G2)** — cost/benefit force:true each screening vs invalidate cache post-deploy? → bawa F11 positions audit (cache strategy).
3. **scoreCandidate calibration (G3)** — normalize z-score OR Darwin-evolved weights? Volume dominates currently. → bawa F21 Darwin audit.
4. **threshold DUPLICATE 2 tempat (G4)** — document mana "kunci re-check" vs "lengkap"? Atau extract shared helper? → bawa F26 config audit.
5. **indicator fail-open (G5)** — alert operator bila skipped:true batch > N? Atau last-line defense gagal saat API flaky? → bawa F15 indicator gate.
6. **lone candidate skip (G7)** — `getLoneCandidateSkipReason` logic? → bawa F15/F16.
7. **shadow logging toggle (G8)** — always-on by design, atau add toggle utk zero-experiment bots? → bawa F23.
8. **sanitizeUntrustedPromptText impl (G10)** — 500-char cap + what sanitization? Prompt injection defense contract. → bawa F5 prompt audit.
9. **Darwin stageSignals 13 fields (index.js:1001-1022)** — consumed by resolvePerformanceSignalSnapshot (F12) → cleared at close. Verify staging-cleared contract (no leak bila Darwin disabled mid-flight). → bawa F21 Darwin audit.

*F14 selesai 2026-07-07. Read-only. Kode/config tak diubah saat menyusun.*
