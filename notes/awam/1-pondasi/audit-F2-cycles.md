# Audit F2 — 2 Siklus Inti (runManagementCycle + runScreeningCycle)
> Read-only. Bukti `file:line`. UNKNOWN kalau tak pasti. Resume: buka file ini.
> Kedalaman: ⬛ deep — alasan: 2 block padat fungsi, banyak jalur (Meteora/GMGN/event-driven/scheduled/free-slot), hard-guards lintas lapisan.
> Cross-ref: F1 (cron), F3 (exit rules), F14 (screening detail), F18 (updatePnlAndCheckExits).

## Ringkasan eksekutif
- `runManagementCycle` (index.js:471-663) jaga lapak: force-refresh posisi → exit-trailing check → deterministic close rules → indicator exit → claim → LLM hanya kalau ada aksi non-STAY → post-cycle picu screening bila slot bebas (`_screeningLastTriggered` cooldown 5m, index.js:632).
- `runScreeningCycle` (index.js:665-1165) cari lapak: 3 hard-guards berurut (max-pos, modal/SOL, market-regime) → fetch kandidat → recon (sw/narrative/tokenInfo paralel) → filter launchpad/bots → lone-skip → inject momentum/yield/sw-momentum → LLM SCREENER + anti-hallucination guard (deploy-fake override, index.js:1120-1130).
- Race guard: `_managementBusy`/`_screeningBusy`/`_screeningLastTriggered` (index.js:132-134) ditetapkan SINKRON (busy=true di awal, false di finally; `_screeningLastTriggered=Date.now()` di index.js:671 sebelum pre-check → mencegah TOCTOU).
- Jalur event-driven screening: (a) idle 0-posisi dari management (index.js:509, cooldown eksperimen `idleScreeningCooldown`), (b) freed-slot pasca-close (index.js:634). Keduanya bypass `shouldRunScheduledScreening` (gate ONLY jalan di cron screen, index.js:1260).
- Fail-mode dominan: fail-open — error di sub-step (snapshot/sw-record/experiment) di-log + dilewatkan, siklus tetap jalan; hanya pre-check fatal (cron_error) yang return `cycleFail` dan bolt.

## Progress
- [x] Baca index.js:471-555 (runManagementCycle separuh)
- [x] Baca index.js:556-663 (runManagementCycle sisa)
- [x] Baca index.js:665-1165 (runScreeningCycle penuh)
- [x] Baca index.js:1175-1196 (shouldRunScheduledScreening + effectiveScreeningIntervalMin)
- [x] Baca index.js:1250-1407 (caller cron + PnL poller)
- [x] Baca index.js:1466-1570 (getDeterministicCloseRule, getIndicatorExitSignal, buildGmgnFunnelReport, getLoneCandidateSkipReason, computeBinsBelow)
- [x] Cross-ref CLAUDE.md (Position Lifecycle, marketRegimeGate, candidateMomentum, adaptiveScreening)
- [x] Tulis §A-§H
- [x] §0 Cara Kerja (Bahasa Awam) — retro-fit 2026-07-07

---

## §0. Cara Kerja (Bahasa Awam)

**Analogi** (dua sudut pandang sehari-hari)
- *Toko 2 shift*: shift pagi = manajer jaga etalase — cek stok, cek harga pas, kalau ada barang mulai rusak/expire/kadaluwarsa → tandain buat dibuang atau diskon. Shift sore = pencari supplier keluar ke pasar — cari barang baru yang laku, periksa kualitas, periksa reputasi supplier, kalau ada yang oke → bawa masuk jadi stok baru. Shift sore bisa dipanggil paksa kalau etalase tiba-tiba kosong.
- *Kru panggung dengan "panggung 2 pintu"*: tiap aktor lewat pintu dengan gantung tanda busy. Shift jaga cuma ngomong ke LLM kalau ada aksi nyata (close/claim) — kalau semua bagus, "skipping LLM" (`all STAY`). Shift cari pintu masuknya 3 gerbang ketat (max-pos, modal, market-regime) sebelum boleh mulai cari kandidat.

**Di bot, ini = `runManagementCycle` + `runScreeningCycle`**: dua fungsi inti yang jalan tiap cron tick (manajemen 10m, screening 30m) atau event-driven (management cycle nemu slot bebas → picu screening; idle 0-posisi → picu screening).

**Posisi fase ini di alur bot**
F2 = isi siklus. F1 (cron) cuma bangunin alarm; F2 = apa yang dilakuin tiap alarm bunyi. Setelah F2 selesai, hasilnya (close, deploy, atau skip) dikirim ke F8 (post-close) atau F19 (record performance untuk belajar). Lapisan 3 (Mesin trading). Tanpa F2, alarm F1 bunyi ke kosong — tak ada kerjaan.

**Langkah kerja F2 — `runManagementCycle` (siklus jaga)**
1. Cron management tick → cek flag `_managementBusy`. Kalau sibuk → skip; kalau free → set busy=true.
2. `getMyPositions({force:true})` — baca posisi on-chain live (no cache).
3. Kalau 0 posisi → log "No open positions" → picu `runScreeningCycle` (event-driven idle) → return. Idle cooldown opt-in cegah spam.
4. Tiap posisi → `updatePnlAndCheckExits` (F18) — cek SL, trailing, OOR, low-yield; simpan peak/trough harga.
5. `getDeterministicCloseRule` (F3) — 5 rule mekanis hard close (stop-loss/TP/pump-OOR/OOR-time/low-yield). NO-AI.
6. `getIndicatorExitSignal` — opt-in exit chart indicator preset (default OFF).
7. Kalau unclaimed fees ≥ `minClaimAmount` → action CLAIM.
8. Kalau semua posisi STAY → skip LLM (hemat token). Kalau ada aksi (close/claim/instruction) → panggil `agentLoop(MANAGER)` — LLM pilih tool eksekusi.
9. Post-cycle: re-count posisi. Kalau slot bebas + cooldown 5 mnt terlewati → picu `runScreeningCycle` (event-driven freed-slot).
10. Finally: busy=false, kirim Telegram finalize, notifyOutOfRange kalau perlu, drain queue.

**Langkah kerja F2 — `runScreeningCycle` (siklus cari)**
1. Cron screening tick (atau event-driven) → cek `_screeningBusy`. Set busy=true + `_screeningLastTriggered=now` SEBELUM pre-check (TOCTOU guard).
2. Pre-check 3 hard-guards berurut: (a) max-pos → skip kalau penuh, (b) modal/SOL — hitung `computeDeployAmount` + `rentReserve` + `gasReserve` → skip kalau tak cukup, (c) market-regime (`marketRegimeGate` opt-in) — skip kalau SOL 24h drop > limit.
3. Kalau lolos → `getTopCandidates({limit:10})` fetch kandidat (Meteora atau GMGN, sesuai `screeningSource`).
4. Recon paralel tiap kandidat: smart-wallets (KOL), narrative, token info, momentum snapshot. (Promise.allSettled, delay 150ms anti-429.)
5. Hard-filter: cek `blockedLaunchpads`, `allowedLaunchpads`, `bot_holders_pct`. Kandidat GMGN bypass (upstream sudah filter).
6. Kalau 0 kandidat → buildNoCandidates + appendDecision → return.
7. Kalau 1 kandidat → cek `getLoneCandidateSkipReason` (veto single tanpa narasi+sw).
8. Inject soft signals ke prompt: momentum, yield-to-me, smart-wallet momentum (semua opt-in, fail-open).
9. `agentLoop(SCREENER)` — LLM pilih 1 kolam atau tolak semua. Anti-hallucination guard override deploy-fake.
10. Kalau deploy berhasil → `onToolFinish` set flag.
11. appendDecision — semua jalur (deploy / no-deploy) tercatat.

**Output F2**: posisi jaga → close/claim/stay, atau posisi baru → deploy, atau skip + alasan. Hasil close masuk F8 (post-close swap + record), hasil deploy masuk F9 (deploy detail). Jika screening skip karena hard-guard → log `appendDecision` tipe skip → bisa di-review briefing.

**Kalau F2 rusak / diskip**
Bot bunyi alarm F1 tapi tak kerja. Posisi terbuka tak ter-monitor → SL tak ke-trigger, fee tak ditarik, OOR diam-diam IL makin dalam. Atau screening tak jalan → tak ada kandidat baru → tak ada deploy → bot diam terus. Race guard mati → double-deploy (2 screening jalan bareng) → modal bocor. Market-regime gate mati → bot deploy saat pasar kiamat. F2 = jantung harian bot.

**Istilah yang muncul di fase ini**
- **`runManagementCycle`** — siklus jaga lapak. Cron 10m. Baca posisi → exit mekanis → LLM bila aksi.
- **`runScreeningCycle`** — siklus cari lapak baru. Cron 30m + event-driven (idle / freed-slot).
- **hard-guards** — 3 gerbang awal screening: max-pos, modal/SOL (sizing-aware), market-regime. Lolos semua baru boleh cari.
- **deterministic close rules** — 5 rule close mekanis (SL/TP/pump-OOR/OOR-time/low-yield). NO-AI, kode murni (F3).
- **TOCTOU guard** — flag busy + `_screeningLastTriggered` di-set SEBELUM pre-check, bukan setelah → cegah race "cek-lolos lalu diubah sebelum jalan".
- **event-driven screening** — jalur screening dari management cycle (idle 0-posisi atau freed-slot post-close), BUKAN cron. Bypass adaptive gate.
- **freed-slot trigger** — management cycle detect slot kosong (count < maxPos) → picu screening baru (cooldown 5m).
- **appendDecision** — catatan tiap keputusan (skip/deploy/no-deploy) ke decision-log untuk audit.
- **anti-hallucination guard** — override kalau LLM ngaku "DEPLOYED" padahal belum; paksa NO DEPLOY.
- **shadow-log** — `recordCandidateSnapshots` + `recordSmartWalletCounts` selalu jalan (recording ≠ influencing). Data dipakai experimental momentum / counterfactual.
- **stageSignals** — Darwinian weighting sinyal kandidat kalau `config.darwin.enabled`.

*Lewati §0 kalau sudah paham. Isi teknis mulai §A.*

---

## §A. Peta block fungsi di fase ini (tabel file:line → peran)

| file:line | fungsi | peran |
|---|---|---|
| index.js:471-663 | `runManagementCycle` | siklus manager: refresh posisi → exit TP/trailing → deterministic close → indicator exit → claim → LLM MANAGER bila perlu → picu screening bila slot bebas |
| index.js:485 | `getMyPositions({force:true})` | baca on-chain posisi live (force = no cache, dipakai semua path) |
| index.js:517 | `recordPositionSnapshot` | simpan snapshot pool ke pool-memory.json (skip paper mode) |
| index.js:531 | `updatePnlAndCheckExits` | cek trailing/exit alert (lihat F18) |
| index.js:526,529 | `queuePeakConfirmation`/`schedulePeakConfirmation` | trailing-TP peak recheck 15s (index.js:138,164) |
| index.js:534,535 | `queueTrailingDropConfirmation`/`scheduleTrailingDropConfirmation` | trailing-drop konfirmasi 15s (index.js:181) |
| index.js:559 | `getDeterministicCloseRule` | 5 rule mekanis close (stop-loss/TP/pump-OOR/OOR-time/low-yield) — lihat F3 |
| index.js:566 | `getIndicatorExitSignal` | exit opt-in via chart-indicators preset (default OFF) |
| index.js:572 | claim rule | `unclaimed_fees_usd >= minClaimAmount` → action CLAIM |
| index.js:580 | `buildMgmtReport` | JS report scaffolding (views/cycle.js) |
| index.js:605 | `agentLoop(...MANAGER...)` | LLM hanya bila ada aksi non-STAY |
| index.js:630-635 | post-mgmt screening trigger | freed-slot picu screening (cooldown 5m, max-pos gate) |
| index.js:661 | `maybeFireLearningReport` | milestone report tiap N closes (fail-open) |
| index.js:665-1165 | `runScreeningCycle` | siklus screener lengkap |
| index.js:678 | pre-check paralel | `Promise.all([getMyPositions(force), getWalletBalances()])` |
| index.js:679-690 | hard-guard #1 max-pos | skip + appendDecision tipe skip |
| index.js:700-717 | hard-guard #2 modal/SOL | sizing-aware (`computeDeployAmount` + rent) — bukan `deployAmountSol+gasReserve` lama |
| index.js:725-748 | hard-guard #3 market-regime | eksperimen `marketRegimeGate` (`getSolMarketRegime`) fail-open |
| index.js:770-776 | strategy block | `getActiveStrategy` + `strategyLock` (default vs locked) |
| index.js:779 | `getTopCandidates({limit:10})` | fetch kandidat (Meteora atau GMGN) |
| index.js:793 | `recordCandidateSnapshots` | shadow-log ALWAYS (recording ≠ influencing) |
| index.js:805-818 | recon paralel per pool | smart-wallets + narrative + tokenInfo (Promise.allSettled, delay 150ms anti-429) |
| index.js:823-844 | filter launchpad/bot | hard-filter post-recon (GMGN bypass — upstream sudah filter) |
| index.js:846-872 | no-candidate path | buildNoCandidates + funnel report + appendDecision |
| index.js:879-895 | lone-candidate skip | `getLoneCandidateSkipReason` → buildLoneNoDeploy |
| index.js:901-908 | `recordSmartWalletCounts` | shadow-log sw count (fail-open) |
| index.js:911-913 | `getActiveBin` paralel | pre-fetch bin aktif untuk prompt |
| index.js:928-960 | experiment lines | momentumLine/yieldLine/swMomentumLine — soft, gated flag, fail-open |
| index.js:1000-1023 | `stageSignals` | Darwinian weighting (config.darwin.enabled) |
| index.js:1032-1115 | `agentLoop(...SCREENER...)` | LLM dengan `allowNoToolFinal:true` (skip valid) + onToolFinish set `deploySucceeded` |
| index.js:1120-1130 | anti-hallucination guard | override DEPLOYED-fake + JSON-dump → NO DEPLOY |
| index.js:1131-1147 | appendDecision | no_deploy logged (skip atau gagal) |
| index.js:1175-1196 | `effectiveScreeningIntervalMin`/`shouldRunScheduledScreening` | adaptive throttle (weak WIB session stretch ke ceiling) |
| index.js:1253-1265 | cron registration | mgmt cron (no gate), screen cron (gated shouldRunScheduledScreening) |
| index.js:1309-1401 | PnL poller (3s) | exit alert → emergency close / fallback management; rule1 → emergency lever A |
| index.js:1466-1509 | `getDeterministicCloseRule` (def) | definisi 5 rule — lihat F3 |
| index.js:1515-1528 | `getIndicatorExitSignal` (def) | opt-in exit preset |
| index.js:1530-1546 | `buildGmgnFunnelReport` | GMGN funnel S1→S5 text |
| index.js:1548-1570 | `getLoneCandidateSkipReason` | veto single-candidate bila tak ada narasi+sw |
| index.js:1572-1580 | `computeBinsBelow` | rumus linear bins below (lihat CLAUDE.md) |

## §B. Alur runManagementCycle (ASCII diagram hulu→hilir)

```
ENTER runManagementCycle({silent})                            [index.js:471]
  │
  ├─ if _managementBusy → return null (overlap skip)            [:472]
  ├─ _managementBusy = true; timers.mgmtLastRun = now          [:473-474]
  │
  ├─ try:
  │   ├─ createLiveMessage (Telegram, !silent)                 [:482-484]
  │   ├─ livePositions = getMyPositions(force:true)           [:485]  ←catch→null
  │   ├─ positions = livePositions?.positions || []            [:486]
  │   │
  │   ├─ if positions.length === 0:                            [:488]
  │   │     ├─ 🧪 idle cooldown check (experiments.idleScreeningCooldown) [:494-500]
  │   │     │     └─ Date.now() - _screeningLastTriggered < cooldownMs → skip [:501-506]
  │   │     ├─ log "No open positions — triggering screening"  [:507]
  │   │     ├─ runScreeningCycle().catch(...) (fire-and-forget) [:509]  ← EVENT-DRIVEN (idle)
  │   │     └─ return mgmtReport                                [:510]
  │   │
  │   ├─ positionData = positions.map(recordPositionSnapshot+recall) [:516-519]
  │   │     └─ !isPaperMode() → snapshot WRITE skip            [:517]
  │   │
  │   ├─ for p in positionData:                                [:523-542]  ← EXIT-ALERT LAYER
  │   │     ├─ queuePeakConfirmation + schedulePeakConfirmation (15s) [:524-530]
  │   │     ├─ exit = updatePnlAndCheckExits(p.position,p,cfg) [:531]  ← F18
  │   │     ├─ if TRAILING_TP+needs_confirmation → queueTrailingDropConfirmation → continue [:533-538]
  │   │     └─ exitMap.set(position, exit.reason)               [:539]
  │   │
  │   ├─ for p in positionData:                                [:547-577]  ← DETERMINISTIC LAYER
  │   │     ├─ if exitMap.has → CLOSE rule=exit                [:549-552]
  │   │     ├─ if p.instruction → INSTRUCTION (pass to LLM)    [:554-557]
  │   │     ├─ closeRule = getDeterministicCloseRule(p,cfg)    [:559]  ← F3 (5 rules)
  │   │     ├─ indicatorExit = await getIndicatorExitSignal(p) [:566]  ← opt-in, OFF default
  │   │     ├─ if unclaimed_fees >= minClaimAmount → CLAIM     [:572-574]
  │   │     └─ else STAY                                       [:576]
  │   │
  │   ├─ mgmtReport = buildMgmtReport(...)                     [:580]
  │   ├─ actionPositions = filter(!=STAY)                       [:585-588]
  │   │
  │   ├─ if actionPositions.length > 0:                        [:590]
  │   │     ├─ build actionBlocks prompt                        [:593-603]
  │   │     ├─ content = agentLoop(MANAGER, maxSteps, 2048)     [:605-621]
  │   │     │     hooks: liveMessage.toolStart/toolFinish
  │   │     └─ mgmtReport += frameMgmtResult(content)           [:623]
  │   ├─ else: log "all STAY — skipping LLM"                   [:625-626]
  │   │
  │   ├─ afterPositions = getMyPositions(force:true)            [:630]  ← re-count
  │   ├─ if afterCount < maxPos AND now-_screeningLastTriggered>5m: [:632]
  │   │     └─ runScreeningCycle().catch(...)  ← EVENT-DRIVEN (freed-slot) [:634]
  │   │
  │   └─ (continue to finally)
  │
  ├─ catch → mgmtReport = cycleFail(...)                       [:636-638]
  ├─ finally:                                                   [:639]
  │     ├─ _managementBusy = false                              [:640]
  │     ├─ Telegram finalize / sendMessage(stripThink)         [:641-650]  ← leak guard
  │     ├─ for p: notifyOutOfRange bila OOR ≥ outOfRangeWaitMinutes [:651-655]
  │     └─ drainTelegramQueue()                                 [:657]
  │
  ├─ await maybeFireLearningReport()  (post-settle, fail-open) [:661]
  └─ return mgmtReport                                          [:662]
```

## §C. Alur runScreeningCycle (ASCII diagram + hard-guards + jalur)

```
ENTER runScreeningCycle({silent})                              [index.js:665]
  │
  ├─ if _screeningBusy → log skip, return null                 [:666-669]
  ├─ _screeningBusy = true (immediately — TOCTOU guard)        [:670]
  ├─ _screeningLastTriggered = Date.now()  ← SET PADA AWAL     [:671]  (dipakai cooldown mgmt:632)
  │
  ├─ try (pre-check):                                          [:677-754]
  │   ├─ Promise.all([getMyPositions(force), getWalletBalances]) [:678]
  │   │
  │   ├─ HARD-GUARD #1 — max positions:                        [:679-690]
  │   │     if prePositions.total_positions >= maxPositions
  │   │       → cycleSkip + appendDecision + return  (busy=false di sini)
  │   │
  │   ├─ HARD-GUARD #2 — modal/SOL (sizing-aware):             [:700-717]
  │   │     slotsRemaining = max(1, maxPos - total_positions)
  │   │     plannedDeploy = computeDeployAmount(sol, {slotsRemaining})
  │   │     rentReserve = max(0, rentPerPositionSol)
  │   │     needForOne = plannedDeploy + gasReserve + rentReserve
  │   │     if !isDryRun AND (plannedDeploy < minDeployAmount() OR sol < needForOne)
  │   │       → cycleSkip "modal kurang" + appendDecision + return
  │   │     (DRY_RUN bypass — sim tak butuh SOL)
  │   │
  │   └─ HARD-GUARD #3 — market regime (🧪 experiment):        [:725-748]
  │       if experiments.marketRegimeGate:
  │         maxDrop = marketRegimeMaxDrop24hPct (default 8)
  │         regime = await getSolMarketRegime()  ← wallet.js, Jupiter price v3
  │         if regime.change24hPct < -maxDrop
  │           → cycleSkip "risk-off" + appendDecision + return
  │         catch → fail-OPEN (allow screening)                 [:745-747]
  │
  ├─ catch pre-check → cycleFail + return                       [:749-754]
  │
  ├─ createLiveMessage (Telegram)                              [:755-757]
  ├─ timers.screeningLastRun = now                             [:758]
  │
  ├─ try (main):                                               [:760-1147]
  │   ├─ deployAmount = computeDeployAmount(sol, {slotsRemaining}) [:766]
  │   ├─ activeStrategy + stratLock + strategyBlock            [:770-776]
  │   │
  │   ├─ topCandidates = getTopCandidates({limit:10})          [:779]  ← Meteora atau GMGN (screeningSource)
  │   │     error → cycleFail + return                          [:780-783]
  │   ├─ candidates = .slice(0,10)                              [:784]
  │   │
  │   ├─ recordCandidateSnapshots(candidates)  ← ALWAYS (fail-open) [:792-796]
  │   │
  │   ├─ for pool in candidates (sequential, 150ms delay):     [:803-818]
  │   │     Promise.allSettled([
  │   │       checkSmartWalletsOnPool,                          [:806]
  │   │       getTokenNarrative(mint),                          [:807]
  │   │       getTokenInfo(mint),                                [:808]
  │   │     ]) → allCandidates.push({pool,sw,n,ti,mem:recallForPool})
  │   │
  │   ├─ HARD FILTER post-recon:                               [:822-844]
  │   │     if pool.gmgn → pass (GMGN upstream sudah filter)
  │   │     else cek:
  │   │       - allowedLaunchpads (whitelist bila non-empty)
  │   │       - blockedLaunchpads
  │   │       - bot_holders_pct > maxBotHoldersPct
  │   │     → filteredOut (for examples)
  │   │
  │   ├─ if passing.length === 0:                              [:846-872]
  │   │     buildNoCandidates(funnel+examples+thresholds)
  │   │     appendDecision type=no_deploy → return
  │   │
  │   ├─ if passing.length===1 && gmgnStageCounts → log funnel [:874-877]
  │   ├─ LONE-CANDIDATE SKIP:                                  [:879-895]
  │   │     skipReason = getLoneCandidateSkipReason(passing[0])
  │   │     if skipReason → buildLoneNoDeploy + appendDecision → return
  │   │
  │   ├─ recordSmartWalletCounts(passing)  ← ALWAYS (fail-open) [:900-908]
  │   │
  │   ├─ activeBinResults = Promise.allSettled(getActiveBin)   [:911-913]
  │   │
  │   ├─ for i,build candidateBlocks:                          [:916-1026]
  │   │     ├─ GMGN path → formatGmgnCandidateForPrompt(pool)   [:967-978]
  │   │     └─ Meteora path → metrics/audit/gmgn_price/1h block [:983-997]
  │   │     Ав transparent inject (gated experiments, fail-open):
  │   │       - momentumLine (experiments.candidateMomentum)   [:928-934]
  │   │       - yieldLine (experiments.expectedYieldSignal)    [:939-950]
  │   │       - swMomentumLine (experiments.smartWalletMomentum)[:954-960]
  │   │     + pvpLine (pool.is_pvp)                            [:962-964]
  │   │     + sanitizeUntrustedPromptText untuk narrative + mem [:976-977]
  │   │     + stageSignals bila darwin.enabled                 [:1000-1023]
  │   │
  │   ├─ weightsSummary = getWeightsSummary() bila darwin      [:1028]
  │   │
  │   ├─ agentLoop(SCREENER, allowNoToolFinal:true, maxSteps, 2048) [:1032-1115]
  │   │     hooks: onToolStart set deployAttempted
  │   │             onToolFinish set deploySucceeded (success && !error && !blocked)
  │   │
  │   ├─ ANTI-HALLUCINATION GUARD:                             [:1116-1130]
  │   │     if !deploySucceeded AND /🚀 DEPLOYED/ → override NO DEPLOY
  │   │     if !deploySucceeded AND !/⛔ NO DEPLOY/ AND JSON-dump → override NO DEPLOY
  │   │
  │   ├─ funnelAppend appended ke report                        [:1131-1132]
  │   └─ appendDecision (no_deploy bila skip/gagal)            [:1133-1147]
  │
  ├─ catch → cycleFail                                          [:1148-1150]
  ├─ finally:                                                   [:1151-1163]
  │     ├─ _screeningBusy = false
  │     ├─ Telegram finalize / leak guard
  │     └─ drainTelegramQueue()
  └─ return screenReport                                        [:1164]
```

### Jalur masuk screening (3 pintu)
| Pintu | Caller file:line | Gate | Bypass `shouldRunScheduledScreening`? |
|---|---|---|---|
| Scheduled cron | index.js:1259-1265 | `shouldRunScheduledScreening` (adaptive) | — (gate di sini) |
| Idle 0-posisi (management) | index.js:509 | cooldown `idleScreeningCooldown` eksperimen + `_screeningLastTriggered` (shared) | YA |
| Freed-slot (post-close) | index.js:634 | `afterCount < maxPos` AND `now - _screeningLastTriggered > 5m` | YA |
| Startup (non-TTY) | index.js:3901 | none | (UNKNOWN — F1) |
| Manual REPL/CLI | cli.js:311-312 | none | YA |

## §D. Sinkron: siapa-panggil-siapa

| Pemanggil (file:line) | Dipanggil (file:line) | Trigger | Data lewat | Fail-mode |
|---|---|---|---|---|
| cron mgmt (index.js:1253) | `runManagementCycle` (index.js:471) | tiap `managementIntervalMin` | none | `if _managementBusy return` (1254) |
| cron screen (index.js:1259) | `runScreeningCycle` (index.js:665) | tiap `screeningIntervalMin` (gated adaptive) | none | `shouldRunScheduledScreening` false → log skip |
| runManagementCycle (index.js:509) | `runScreeningCycle` | positions==0 (idle) | fire-and-forget `.catch` | idle cooldown skip (eksperimen) |
| runManagementCycle (index.js:634) | `runScreeningCycle` | post-close freed slot | fire-and-forget `.catch` | cooldown 5m via `_screeningLastTriggered` |
| scheduleTrailingDropConfirmation timer (index.js:197) | `runManagementCycle({silent})` | trailing-drop confirmed | none | `.catch` log |
| PnL poller emergency fallback (index.js:1341,1354,1364,1379,1391) | `runManagementCycle({silent})` | exit alert / rule1 fallback | poll state | `.catch` log |
| runManagementCycle (index.js:531) | `updatePnlAndCheckExits` (state.js, F18) | per posisi | position object + cfg.management | null return = no exit |
| runManagementCycle (index.js:559) | `getDeterministicCloseRule` (index.js:1466) | per posisi (after exit-alert) | position + cfg | null return |
| runManagementCycle (index.js:566) | `getIndicatorExitSignal` (index.js:1515) | per posisi (opt-in) | position | catch → null (fail-safe) |
| runManagementCycle (index.js:605) | `agentLoop` (agent.js) | actionPositions > 0 | actionBlocks + role=MANAGER + 2048 tokens | agent fallback model |
| runScreeningCycle (index.js:678) | `getMyPositions`/`getWalletBalances` paralel | pre-check | force:true | reject → null, pre-check catch → cycleFail |
| runScreeningCycle (index.js:728) | `getSolMarketRegime` (wallet.js) | hard-guard #3 (opt-in) | none | catch → fail-OPEN (allow) |
| runScreeningCycle (index.js:779) | `getTopCandidates` (screening.js, F14) | main | limit:10 | `_error` field → cycleFail |
| runScreeningCycle (index.js:806-808) | smart-wallets/narrative/tokenInfo paralel | per pool | `Promise.allSettled` (status pending/fulfilled) | per-call reject → null |
| runScreeningCycle (index.js:1032) | `agentLoop` role=SCREENER | after recon | candidateBlocks+strategyBlock | anti-hallucination guard |
| runScreeningCycle (index.js:661-end) | `maybeFireLearningReport` (index.js:234) | post mgmt cycle | none | catch → fail-open log |

Data lewat antar-lapisan: `positionData` ditambah `recall: recallForPool(pool)` (index.js:518) → dipakai `buildMgmtReport`. `actionMap` (Map<positionAddress, {action,rule,reason}>) → filter `actionPositions` → `actionBlocks` string masuk prompt MANAGER. Pada screening, objek `allCandidates` (`pool/sw/n/ti/mem`) → filter `passing` → `candidateBlocks` string → prompt SCREENER.

## §E. Logika kunci per fungsi

### runManagementCycle (index.js:471-663)
- **Apa**: siklus manager 10m. Refresh posisi → cek exit alert (trailing TP/drop) → tentukan aksi (CLOSE/CLAIM/INSTRUCTION/STAY) → LLM bila perlu → picu screening bila slot bebas.
- **Kapan**: cron `*/managementIntervalMin` (index.js:1253) ATAU event-driven dari PnL poller/trailing-confirm timer.
- **Output**: `mgmtReport` string (dipakai liveMessage + Telegram), side-effect: snapshots/pool-memory, close_position saat LLM, `maybeFireLearningReport`.
- **Sinkron**: `_managementBusy` lock di awal (index.js:473), dilepas di finally (index.js:640). Cron cek busy di 1254 (defense). `getMyPositions({force:true})` dipakai untuk hitung count segura (no cache).
- **Fail-mode**: catch (index.js:636) → `cycleFail`; sub-step error (snapshot, peak-confirm) → log warning; `liveMessage.finalize` selalu dipanggil bila report null (anti typing-leak, index.js:645-650).
- **Kontrak ditegakkan**: trailing-TP confirmation gate (recheck 15s), deterministic rule > indicator > claim (urutan prioritas, index.js:549-576), freed-slot screening cooldown 5m (index.js:632).

### runScreeningCycle (index.js:665-1165)
- **Apa**: siklus screener 30m. Hard-guards → fetch kandidat → recon → filter → LLM pilih deploy atau skip.
- **Kapan**: cron `*/screeningIntervalMin` gated adaptive (index.js:1259-1265) ATAU event-driven dari management (idle/freed-slot).
- **Output**: `screenReport` string + side-effect (candidate snapshots, sw counts, deploy_position saat LLM, appendDecision).
- **Sinkron**: `_screeningBusy` di-set **immediately** (index.js:670, "TOCTOU guard" — cek-then-set atomik di single-thread JS). `_screeningLastTriggered=now` juga di awal (index.js:671) → cooldown management 5m mulai hitung dari sini.
- **Fail-mode**: pre-check fatal → `cycleFail` (index.js:751); main catch → `cycleFail` (index.js:1150); sub-step (snapshot/sw-record/experiment) → fail-open log; LLM hallucinasi deploy → override NO DEPLOY (index.js:1120); JSON-dump LLM → override NO DEPLOY (index.js:1127).
- **Kontrak ditegakkan**: max-pos (679), SOL+rent affordability (700), market-regime (725), GMGN-funnel report, lone-candidate skip (879), `allowNoToolFinal:true` (skip valid), anti-fake-deploy guard.

### hard-guards (max-pos, SOL, market-regime)
1. **max-pos** (index.js:679): `prePositions.total_positions >= config.risk.maxPositions`. Skip + `appendDecision({type:"skip"})`. Busa-busy dilepas **manual** di path return (index.js:688) — finally TIDAK di jalur ini karena return di dalam try luar berikut? UNKNOWN — perlu cek: `_screeningBusy=false` di-set eksplisit di index.js:688 SEBELUM return, jadi finally (index.js:1152) tak double-reset (aman karena finally hanya jika masuk try main). Actually struktur: try-pre-check (677-754) → return di sini, akhirnya finally main (1151-1163) punya `_screeningBusy=false`. Path early-return di pre-check set manual di 688 untuk hindari skip finally. **Perlu re-verify** (lihat Open-Q #1).
2. **SOL/modal** (index.js:700): sizing-aware. `computeDeployAmount(sol,{slotsRemaining})` + `rentReserve + gasReserve`. Bandingkan ke `minDeployAmount()` (config floor) DAN `sol < needForOne`. DRY_RUN bypass (sim tak butuh SOL). Comment (index.js:691-699) jelaskan: cek lama `deployAmountSol+gasReserve` ignore rent + adaptive sizing → stuck-retry bug lama.
3. **market-regime** (index.js:725): eksperimen `marketRegimeGate` + `marketRegimeMaxDrop24hPct` (default 8). `getSolMarketRegime()` (wallet.js, Jupiter price v3 `priceChange24h`). `change24hPct < -maxDrop` → skip. Catch → fail-OPEN (index.js:745-747). Catch scheduled + freed-slot (keduanya lewat `runScreeningCycle`); manual chat deploy tak gated (CLAUDE.md:109). Run under DRY_RUN.

### free-slot screening trigger (index.js:629-635)
- Setelah LLM MANAGER selesai (close mungkin terjadi), re-count `getMyPositions({force:true})`.
- Bila `afterCount < maxPositions` AND `Date.now() - _screeningLastTriggered > 5m` → fire `runScreeningCycle`.
- Race: bila screening baru jalan 1 menit lalu (idle trigger), cooldown tolak. shared `_screeningLastTriggered`.
- Fail-mode: `.catch` log saja (tak blocking mgmt selesai).

### idle 0-posisi trigger (index.js:488-511)
- `positions.length === 0` di awal management.
- Eksperimen `idleScreeningCooldown` (default OFF): bila ON, cek `Date.now() - _screeningLastTriggered < idleScreeningCooldownMin*60_000` → skip (mgmtReport "💤 ... on cooldown", return). OFF = factory: always trigger.
- Fire-and-forget `runScreeningCycle().catch(...)` (index.js:509).
- **Note**: scheduled screen cron (index.js:1259) tetap jalan di bawah cooldown (karena gate `shouldRunScheduledScreening` toh skip bila belum lapse adaptive, TAPI bila non-adaptive mode, cron screen fixed interval akan juga jalan — double dengan idle? Tidak — `_screeningBusy` memblok overlap, jadi hanya 1 jalan).

### recordCandidateSnapshots / recordSmartWalletCounts injection
- `recordCandidateSnapshots(candidates)` di index.js:793 — ALWAYS record (tidak gated `candidateMomentum`). Comment (index.js:786-791): "recording ≠ influencing; deploys stay neutral". Fail-open catch (index.js:794-796).
- `recordSmartWalletCounts(passing)` di index.js:901-908 — ALWAYS record (sw sudah di-fetch sebelum filter). Fail-open catch (906-908).
- Injeksi prompt: `momentumLine`/`yieldLine`/`swMomentumLine` di-generate per-candidate di loop 916-1026, masing-masing gated flag-nya, fail-open per-catch.
- Shared guard: CLAUDE.md:114 — counterfactualReview ON → snapshot also recorded even if momentum off (shared `recordCandidateSnapshots` guard di sini, sudah selbst)");

## §F. Temuan: race condition, gate bypass, fail-open, kontrak kunci yang ditegakkan

### Race conditions
1. **Double-deploy race**: `_screeningBusy` (index.js:670) + `_managementBusy` (132/473) + `_screeningLastTriggered` cooldown. `runSafetyChecks` di executor juga `force:true` re-count (CLAUDE.md). Defense-in-depth.
2. **TOCTOU max-pos**: `runScreeningCycle` cek `total_positions` di 678 (force:true). Setelah LLM deploy, count bisa stale saat LLM jalan. Di-mitigasi: `deploy_position` safety check juga `force:true` (CLAUDE.md), jadi deploy kedua di-block oleh safety check executor.
3. **Trailing-confirm timer double-fire**: `_peakConfirmTimers`/`_trailingDropConfirmTimers` Map cek `has(positionAddress)` di awal (index.js:165,182) → idempotent.

### Gate bypass / defense
- `shouldRunScheduledScreening` (index.js:1188) → ONLY dipanggil di cron screen (index.js:1260). Event-driven (idle 509, freed 634) → bypass gate. **By design** — freed slot should look now.
- `idleScreeningCooldown` eksperimen (OFF default) → throttle idle trigger. Shared `_screeningLastTriggered` → scheduled cron tetap jalan di bawah.
- DRY_RUN bypass SOL gate (index.js:705) — sim tak butuh SOL. TAPI max-pos gate (679) tetap aktif di DRY_RUN (cek: `if (prePositions.total_positions >= maxPositions)` tidak cek DRY_RUN).

### Fail-open
- marketRegimeGate: catch → allow screening (index.js:745-747). Pragmatic — price hiccup tak boleh block.
- recordCandidateSnapshots / recordSmartWalletCounts: catch → log + continue (index.js:794,906).
- experiment lines (momentum/yield/sw): per-catch `{} ` silent (index.js:933,949,959).
- maybeFireLearningReport (index.js:246-248): catch → fail-open.
- indicatorExitSignal (index.js:1524-1526): catch → return null (no close, fail-SAFE).

### Kontrak kunci ditegakkan di sini
1. **Single-side SOL only**: prompt MANAGER/SCREENER instruksikan `bins_above=0`, `amount_x=0` (index.js:775,1049). Enforcement final di executor `runSafetyChecks` (CLAUDE.md).
2. **Trailing-TP confirmation**: 15s recheck (TRAILING_PEAK_CONFIRM_DELAY_MS) bila `shouldUsePnlRecheck()` (index.js:160, !lpAgentRelayEnabled). `TRAILING_PEAK_CONFIRM_TOLERANCE=0.85`.
3. **Deterministic priority**: exit > instruction > closeRule > indicatorExit > claim > STAY (index.js:547-576). Indicator exit HANYA upgrade STAY/CLAIM (CLAUDE.md:183).
4. **Anti-hallucination**: `allowNoToolFinal:true` + `deploySucceeded` guard (index.js:1103,1108-1115,1120-1130) → fake DEPLOYED override NO DEPLOY.
5. **Live/paper isolation**: `recordPositionSnapshot` skip paper (index.js:517). `getModePerformance` mode-scoped (CLAUDE.md:153).
6. **Cooldown screening 5m**: `_screeningLastTriggered` shared (index.js:134, 632, 671).
7. **Sizing-aware SOL gate**: `computeDeployAmount` + rent + gasReserve (index.js:700-717), bukan lama `deployAmountSol+gasReserve`.

## §G. Glosarium fase
- **busy flag** (`_managementBusy`/`_screeningBusy`): boolean lock anti-overlap, set true di awal, false di finally.
- **`_screeningLastTriggered`** (epoch ms): timestamp screening terakhir jalan → cooldown 5m bagi management trigger freed-slot.
- **`_pollTriggeredAt`** (epoch ms): cooldown poller-triggered management (non-emergency).
- **actionMap/exitMap**: Map<positionAddress, {action,rule,reason}> hasil deterministic layer.
- **deterministic close rule**: 5 rule mekanis (no LLM) — rule 1=stop-loss, 2=TP, 3=pump-OOR, 4=OOR-time, 5=low-yield (F3).
- **lone-candidate skip**: veto single kandidat tanpa narasi+sw (index.js:1548).
- **GMGN path**: `pool.gmgn=true` → recon upstream sudah filter, skip launchpad/bot filter (824).
- **Meteora path**: `pool.gmgn` falsy → launchpad/bot filter aktif (825-842).
- **freed-slot**: slot kosong setelah close → management picu screening (632-635).
- **idle trigger**: 0 posisi di awal management → picu screening (509), bisa throttle eksperimen.
- **fail-open**: error sub-step di-log + dilewatkan, siklus lanjut.
- **fail-SAFE (exit layer)**: error → tidak close (indonesia: aman — tak nuke posisi).
- **shadow-logging**: record ALWAYS (snapshot/sw-count) terlepas dari flag eksperimen; flags hanya gate display ke LLM.
- **TOCTOU guard**: `_screeningBusy=true` di-set immediately (single-thread JS = atomik praktis).
- **anti-hallucination guard**: override LLM report fake DEPLOYED → NO DEPLOY (index.js:1120).
- **adaptive screening**: `shouldRunScheduledScreening` stretch interval ke ceiling saat sesi WIB "weak" (1175-1196).

## §H. Open-Q (bawa ke F3/F14/F18)
1. **[F1/F18 verify]** Early-return hard-guard #1 (max-pos, index.js:688) set `_screeningBusy=false` manual SEBELUM return. Apakah finally main (index.js:1151-1163) di-jalankan untuk path ini? Struktur try-try: pre-check try (677-754) beda block dengan main try (760-1147) + finally (1151). Bila return di pre-check try, finally main TIDAK di-reach → manual reset wajib (benar). TAPI bila pre-check try punya finally sendiri? Tidak ada — try-catch-plain (749-754). Kesimpulan sementara: manual reset benar, finally main tak double-reset. **Perlu verify flow akurat** dengan inspector.
2. **[F18]** `updatePnlAndCheckExits` (state.js) return shape: `{action:"TRAILING_TP"/"STOP_LOSS"/..., needs_confirmation, peak_pnl_pct, current_pnl_pct, reason}`. Exact contract + kapan `needs_confirmation=true`? Cross-ref F18.
3. **[F18]** `queuePeakConfirmation` return true kondisi apa? Index.js:526 — `!pnl_pct_suspicious && queuePeakConfirmation(...) && shouldUsePnlRecheck()`. Arti queue (immediate mode vs recheck)?
4. **[F14]** `getTopCandidates({limit:10})` return shape: `{candidates/pools, _error, filtered_examples, stage_counts, all_filtered}`. Apakah beda Meteora vs GMGN — Meteora path return `{candidates}`, GMGN `{pools, stage_counts,...}`? Verifikasi di F14.
5. **[F3]** `getDeterministicCloseRule` rule 3 `outOfRangeBinsToClose` — beda dengan rule 4 `outOfRangeWaitMinutes`. Threshold config? Cross-ref F3.
6. **[F3]** PnL poller rule1 (stop-loss, index.js:1373) lewat `emergencyCloseDirect` lever A (LLM-free, no cooldown). Beda dengan management path (rule 1 → actionMap CLOSE → LLM MANAGER). Mengapa poller skip LLM tapi management pakai LLM? Koherensi?
7. **[F14]** `buildGmgnFunnelReport` dipanggil 3x (851,875,883,1131) — `fromStage:2`. Stage 1 (ranked) tak ditampilkan? Kenapa?
8. **[F1]** Startup `runScreeningCycle()` di index.js:3901 — silent=false? Telegram message di startup? Bisa double dengan cron screen pertama? Cross-ref F1.
9. **[F2死角]** `idleScreeningCooldownMin` default 20 (index.js:497). Bila cron screen `screeningIntervalMin=30`, dan idle trigger tiap 10m management tick — cooldown 20m menewaskan idle kedua tapi cron screen 30m tetap jalan. OK. Tapi bila `adaptiveScreening=true` + weak session stretch 90m, idle cooldown 20m lebih pendek dari cron — idle bypass gate (509) → screening jalan lebih sering dari cron rencana. Benang kusut di adaptive? **Perlu reasoning sinkron**.
10. **[F2死角]** `emergencyCloseDirect` (akar di index.js:1198-onward, tak dibaca di fase ini) — lever A LLM-free. Bila gagal → fallback management ASAP. Bagaimana `_managementBusy` di-hold oleh emergency? Komentar 1244-1246 shows `_managementBusy=false` di finally emergency → race dengan management cron yang baru? Bawa ke F3/F18.