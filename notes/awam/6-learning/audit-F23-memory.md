# Audit F23 — Memory stores (mandatory deep) — 7 store persisten lintas-siklus + cooldown + counterfactual
> Read-only. Bukti `file:line`. UNKNOWN kalau tak pasti. Resume: buka file ini.
> Kedalaman: ⬛⬛ mandatory deep — alasan: 7 file persisten berbeda (`pool-memory.json` 116 pool/449 deploy/1.16MB, `candidate-memory.json` 11 candidate/64 snap, `decision-log.json` 100 cap/63KB, `smart-wallets.json` ENOENT factory, `token-blacklist.json` ENOENT factory, `strategy-library.json` 5 strategy/active=null, `dev-blocklist.json` ENOENT factory) dengan pattern load/save sync identik (`fs.existsSync` → `JSON.parse` → fallback `{}`/`{wallets:[]}`/`{decisions:[]}`/`{active:null,strategies:{}}`) + 3 isolation gate (`!isPaperMode()` recordPositionSnapshot index.js:517, `!paper && !suspect_pnl` recordPoolDeploy lessons.js:265, `!isPaperMode()` recallForPool reads stay); pool-memory = satu-satunya store drive cooldown mekanis (3 trigger: low-yield 4h `:174-178`, repeated-OOR `oorCooldownTriggerCount×oorCooldownHours` `:180-195` pool+mint, repeat-fee-generating `repeatDeployCooldownEnabled` `:197-221` pool/mint/both scope) + adjusted_win_rate (exclude OOR/pumped-above-range reason `:47-53`) + snapshot trend (last 48 `:335` ~4h@5min) + recallForPool 4-block (history/cooldown/trend/notes `:346-387`); candidate-memory = throwaway trend (8 snap/pool `:20`, 24h prune `:21`) split dari pool-memory (deployed vs looked-at), 3 experiment backing (`candidateMomentum` recordCandidateSnapshots+getCandidateMomentum+formatCandidateMomentum, `smartWalletMomentum` recordSmartWalletCounts+getSmartWalletMomentum+formatSmartWalletMomentum, `counterfactualReview` getSkipReview); decision-log = unshift+slice-100 audit trail (NEWEST first, cap MAX_DECISIONS=100 `:6`), 5 appendDecision call site (dlmm.js 1039/1192/2383/2687/2734 + index.js 682/709/733/864/885/1134/1141/2934), getDecisionSummary inject prompt agent.js:106/229; smart-wallets = KOL/alpha tracker (addSmartWallet/removeSmartWallet/listSmartWallets/checkSmartWalletsOnPool cache 5min `:55`), token-blacklist + dev-blocklist = hard-filter screening.js (548/552/586/622/627/676/681/708), strategy-library = active strategy guide (active=null factory, getActiveStrategy index.js:770).
> Cross-ref: F19 (recordPerformance → recordPoolDeploy cross-store dispatch lessons.js:265-289, paper/suspect gate), F22 (getModePerformance consumer-independent — pool-memory tak baca performance[]), F15 (candidate-memory momentum/sw_momentum injection candidate block, recordCandidateSnapshots screening cycle), F8 (appendDecision close path dlmm.js 2383/2687 + post-close CONFIG_MAP), F9 (deployPosition isPoolOnCooldown/isBaseMintOnCooldown pre-deploy gate dlmm.js:686/694), F14 (screening.js hard-filter blacklist/dev-blocklist/cooldown chain), F25 (briefing getSkipReview buildSkipReviewSection:276 + getDeployedPoolAddresses:280 counterfactual review), F26 (config.management cooldown 5 key + config.experiments 3 flag), F29 (paths.js dataDir resolve — 6 path via paths.* + dev-blocklist repoPath langsung), F33 (smart-wallets KOL + hive sync leaf).

## Ringkasan eksekutif (5 baris)
1. **7 store persisten, pattern load/save sync identik, 3 isolation gate**. `pool-memory.json` (paths.poolMemoryPath `:20`, 1.16MB, 116 pool/449 deploy) — pool-memory.js `:15`. `candidate-memory.json` (paths.candidateMemoryPath `:23`, 14KB, 11 candidate/64 snap) — candidate-memory.js `:19`. `decision-log.json` (paths.decisionLogPath `:21`, 63KB, 100 decision cap) — decision-log.js `:5`. `smart-wallets.json` (paths.smartWalletsPath `:25`, **ENOENT factory**) — smart-wallets.js `:6`. `token-blacklist.json` (paths.tokenBlacklistPath `:26`, **ENOENT factory**) — token-blacklist.js `:13`. `strategy-library.json` (paths.strategyLibraryPath `:27`, 5 strategy/active=null) — strategy-library.js `:14`. `dev-blocklist.json` (**repoPath langsung** `dev-blocklist.js:13`, **ENOENT factory**) — dev-blocklist.js `:13`. Pattern load: `fs.existsSync` → `JSON.parse` → fallback (`{}` pool/candidate/blacklist/dev, `{wallets:[]}` smart, `{decisions:[]}` decision, `{active:null,strategies:{}}` strategy). Pattern save: `fs.writeFileSync` sync JSON.stringify null-2. **3 isolation gate**: (a) `!isPaperMode()` recordPositionSnapshot `index.js:517` — paper positions NEVER snapshot ke pool-memory; (b) `!paper && !suspect_pnl` recordPoolDeploy `lessons.js:265` — paper/suspect closes NEVER touch pool-memory deploy history; (c) recallForPool reads stay (live history tetap kelihatan saat paper mode, tapi tak write).
2. **pool-memory = satu-satunya store drive cooldown mekanis (3 trigger) + adjusted_win_rate + snapshot trend + recallForPool 4-block**. `recordPoolDeploy` `:104-225` write path: init entry (109-123) → push deploy (148) → recalc `avg_pnl_pct`/`win_rate` (154-162) → recalc `adjusted_win_rate` exclude OOR/pumped-above-range (163-167, `isAdjustedWinRateExcludedReason :47-53`) → 3 cooldown trigger: (1) **low-yield** `close_reason==="low yield"` → 4h pool cooldown `:174-178`; (2) **repeated-OOR** `recentDeploys.length >= oorCooldownTriggerCount (default 3) && recentDeploys.every(isOorCloseReason)` `:180-185` → pool `oorCooldownHours (12)` + mint `setBaseMintCooldown :72-82` `:187-195`; (3) **repeat-fee-generating** `config.management.repeatDeployCooldownEnabled` + `recentRepeatDeploys.every(isFeeGeneratingDeploy :55-63)` `:197-221` → scope pool/token/both `:200-201`. `isPoolOnCooldown :227` + `isBaseMintOnCooldown :235` = read gate (dipanggil screening.js:676/681 + dlmm.js:686/694 pre-deploy). `recordPositionSnapshot :300-340` snapshot per management cycle, last 48 (`:335` ~4h@5min). `recallForPool :346-387` 4-block: deploy history summary + cooldown + recent trend (last 6 snap PnL drift/OOR count) + last note. `getDeployedPoolAddresses :256` = `Object.keys(load())` utk counterfactual skip-review.
3. **candidate-memory = throwaway trend split dari pool-memory, 3 experiment backing**. `MAX_SNAPSHOTS=8 :20` (per pool ~last few cycle), `STALE_MS=24h :21` prune. `recordCandidateSnapshots :51-80` push snap `{ts, tvl, volume, mcap}` per candidate per cycle + prune stale (74-77). `getCandidateMomentum :87-105` pct change oldest→newest `{samples, span_min, tvl_delta_pct, volume_delta_pct, mcap_delta_pct}` or `{samples, first_sighting:true}` bila <2. `formatCandidateMomentum :151-161` 1-line "tvl +X%, vol +Y%, mcap +Z% over N samples (~Mm)". `recordSmartWalletCounts :169-185` sw_snaps buffer (separate dari snaps, `MAX_SNAPSHOTS=8` cap juga). `getSmartWalletMomentum :191-199` `{first, last, delta, samples}`. `formatSmartWalletMomentum :205-208` 1-line "smart wallets entering(+N)/leaving(-N): X→Y over N cycles" — null bila delta=0 (silent flat). `getSkipReview :117-145` counterfactual: filter `!deployedPoolAddresses.includes(addr)` + `snaps.length >= 2` + mcap delta, return `{skipped, dropped, gainers[]}` sort desc mcap_delta slice limit. **3 experiment**: `candidateMomentum` (recordCandidateSnapshots + getCandidateMomentum + formatCandidateMomentum), `smartWalletMomentum` (recordSmartWalletCounts + getSmartWalletMomentum + formatSmartWalletMomentum), `counterfactualReview` (getSkipReview — briefing consumer `buildSkipReviewSection :276`). Shared guard: `recordCandidateSnapshots` jalan bila salah satu `candidateMomentum`/`smartWalletMomentum`/`counterfactualReview` ON.
4. **decision-log = unshift+slice-100 audit trail, getDecisionSummary inject prompt**. `MAX_DECISIONS=100 :6` cap. `appendDecision :28-48` build decision obj `{id, ts, type, actor, pool, pool_name, position, summary, reason, risks[6], metrics, rejected[8]}` → `unshift` (NEWEST first) → `slice(0, MAX_DECISIONS)` → save. `sanitize :23-26` trim+slice 280 (500 utk reason, 120 pool_name, 140 risk, 180 rejected). `getRecentDecisions :50-53` slice limit. `getDecisionSummary :55-68` format "N. [actor] TYPE pool | summary: X | reason: Y | risks: Z | rejected: W" join "\n". 5 appendDecision call site dlmm.js (1039 deploy fail / 1192 deploy success / 2383 relay close / 2687 public close / 2734 swap after close) + 8 call site index.js (682/709/733/864/885 screening cycle / 1134/1141 management cycle / 2934 manual chat). Consumer prompt: `agent.js:106` import getDecisionSummary + `:229` call agentLoop → `buildSystemPrompt` decisionSummary param → prompt.js:77-80 SCREENER/GENERAL "RECENT DECISIONS" block (MANAGER tak lihat — correct, MANAGER pre-loaded positions).
5. **smart-wallets + token-blacklist + dev-blocklist = hard-filter + KOL tracker; strategy-library = active strategy guide**. smart-wallets.js (102 baris): `addSmartWallet :23` (SOLANA_PUBKEY_RE `:21` validate) + `removeSmartWallet :38` + `listSmartWallets :48` + `checkSmartWalletsOnPool :57` (cache 5min `_cache Map :54`, filter `type==='lp' :60`, `getWalletPositions` dlmm.js dynamic import `:71`, return `{pool, tracked_wallets, in_pool[], confidence_boost, signal}`). Consumer: tools/token.js:127-190 (smart_wallets_holding list), tools/executor.js:219 tool handler, index.js:806/2922 screening recon, cli.js:204 manual. **Live: ENOENT factory (no KOL tracked)**. token-blacklist.js (104): `isBlacklisted :34` (screening.js:548/622 hard-filter pre-LLM) + `addToBlacklist :45` + `removeFromBlacklist :74` + `listBlacklist :93`. **Live: ENOENT factory**. dev-blocklist.js (66): `isDevBlocked :28` (screening.js:552/586/627/708 hard-filter pre-LLM) + `blockDev :37` + `unblockDev :51` + `listBlockedDevs :62`. **Live: ENOENT factory**. **dev-blocklist pakai `repoPath` langsung `:13`, BUKAN paths.* — inkonsisten sama 6 store lain** (E.1). strategy-library.js (140): `addStrategy :35` (auto-active bila first `:70`) + `listStrategies :80` + `getStrategy :97` + `setActiveStrategy :108` + `removeStrategy :121` + `getActiveStrategy :136` (index.js:770 screening cycle guide). **Live: 5 strategy, active=null** (factory — screening guna `config.strategy.strategyLock` default, bukan library).

## Progress
- [x] Spec F23 baca PLAN-audit-meridian.md Bagian 3 line 116
- [x] Cross-ref F19 (recordPoolDeploy cross-store dispatch), F22 (consumer-independent), F15 (candidate-memory momentum injection), F8 (appendDecision close path), F9 (isPoolOnCooldown pre-deploy), F14 (screening hard-filter chain), F25 (getSkipReview briefing), F26 (cooldown config + experiments), F29 (paths resolve), F33 (smart-wallets leaf)
- [x] Baca pool-memory.js full 1-422 (load/save + 3 cooldown trigger + adjusted_win_rate + snapshot + recallForPool + getDeployedPoolAddresses + addPoolNote)
- [x] Baca candidate-memory.js full 1-209 (3 experiment backing + MAX_SNAPSHOTS/STALE_MS + getSkipReview counterfactual + sw_momentum buffer)
- [x] Baca decision-log.js full 1-68 (unshift+slice-100 + sanitize + getDecisionSummary)
- [x] Baca smart-wallets.js full 1-102 (KOL tracker + cache 5min + checkSmartWalletsOnPool)
- [x] Baca token-blacklist.js full 1-104 (isBlacklisted hard-filter)
- [x] Baca strategy-library.js full 1-140 (active strategy + auto-active first)
- [x] Baca dev-blocklist.js full 1-66 (isDevBlocked + repoPath langsung inkonsisten)
- [x] Verifikasi consumer: index.js:39/45/47/48/53 imports + 515-518 recordPositionSnapshot gate + 770 getActiveStrategy + 793 recordCandidateSnapshots + 806/2922 checkSmartWalletsOnPool + 901 recordSmartWalletCounts + 931/957 formatMomentum; tools/screening.js:548/552/586/622/627/676/681/708 hard-filter; tools/dlmm.js:31/41/44 imports + 57-58 captureShadowSignals + 686/694 isPoolOnCooldown + 1039/1192/2383/2687/2734 appendDecision; tools/executor.js:21/25 imports + 219 check_smart_wallets_on_pool + 260 get_recent_decisions; tools/token.js:127 listSmartWallets; agent.js:106 getDecisionSummary; briefing.js:8/9 imports + 276-298 buildSkipReviewSection; lessons.js:266 recordPoolDeploy; cli.js:204-253 manual recon
- [x] Verifikasi paths.js:20-27 (6 path via paths.* — dev-blocklist NOT here, pakai repoPath langsung)
- [x] Verifikasi live data: pool-memory 116 pool/449 deploy/113 snapshot/1 cooldown, candidate-memory 11 candidate/64 snap/11 sw_snaps, decision-log 100 cap (NEWEST 2026-07-07T09:00 no_deploy SCREENER), smart-wallets/token-blacklist/dev-blocklist ENOENT factory, strategy-library 5 strategy/active=null
- [x] Tulis §0 + §A-§H

---

## §0. Cara Kerja (Bahasa Awam)

**Analogi** (dua sudut pandang sehari-hari)
- *Manajer toko dengan 7 buku catatan berbeda*: toko punya 7 buku catatan, tiap buku beda isi + beda aturan tulis. Buku 1 "Riwayat Lapak" (`pool-memory.json`) — tiap lapak yang pernah dibuka, untung/rugi, cooldown kalau rugi berulang. Buku 2 "Tren Calon" (`candidate-memory.json`) — lapak yang cuma dilihat belum dibuka, snapshot tiap jam utk lihat naik/turun. Buku 3 "Jurnal Keputusan" (`decision-log.json`) — 100 keputusan terakhir, baru di atas. Buku 4 "Daftar KOL" (`smart-wallets.json`) — wallet pintar yang dilacak. Buku 5 "Daftar Hitam Token" (`token-blacklist.json`) — token jangan pernah dibuka. Buku 6 "Daftar Hitam Developer" (`dev-blocklist.json`) — deployer jangan pernah. Buku 7 "Perpustakaan Strategi" (`strategy-library.json`) — strategi LP tersimpan. Tiap buku tulis sync, baca sync, fallback kosong kalau hilang. Manajer baca buku sebelum buka lapak baru — skip yang cooldown/blacklist, favor yang KOL masuk. Konsep sama: 7 store = 7 buku, load/save pattern identik, isolation gate pisah paper/live.
- *Hakim yang baca precedent + daftar hitam sebelum vonis*: sebelum vonis, hakim baca 3 hal: (a) precedent kasus serupa (`pool-memory` riwayat lapak), (b) daftar terduga hitam (`token-blacklist`/`dev-blocklist`), (c) jurnal vonis 100 kasus terakhir (`decision-log`). Bila terduga di daftar hitam → skip otomatis (hard-filter). Bila precedent kasus serupa rugi berulang → cooldown (jangan vonis serupa 12 jam). Jurnal vonis = audit trail, 100 terakhir saja (cap), buku penuh → vonis lama overwrite. Konsep sama: screening baca pool-memory (cooldown) + blacklist + dev-blocklist sebelum LLM lihat kandidat; decision-log = audit 100 cap.

**Di bot, ini = 7 store persisten lintas-siklus + cooldown mekanis + counterfactual reflection** (1-2 kalimat)
`pool-memory.js` = riwayat deploy per-pool + 3 cooldown trigger (low-yield/OOR-berulang/fee-berulang) + snapshot trend. `candidate-memory.js` = snapshot calon (dilihat belum dibuka) utk 3 experiment (momentum/sw-momentum/counterfactual). `decision-log.js` = 100 keputusan terakhir audit trail. `smart-wallets.js`/`token-blacklist.js`/`dev-blocklist.js`/`strategy-library.js` = KOL/blacklist/strategy store. Semua load/save sync, fallback kosong, 3 isolation gate (`!isPaperMode`/`!paper`/`!suspect_pnl`) jaga paper tak kontamin live pool-memory.

**Posisi fase ini di alur bot** (1 paragraf)
Datang SETELAH F19 (recordPerformance → recordPoolDeploy cross-store dispatch lessons.js:265), SETELAH F14 (screening hard-filter chain blacklist/dev-blocklist/cooldown), SETELAH F15 (candidate-memory momentum injection candidate block), PARALEL F22 (consumer-independent — pool-memory tak baca getModePerformance). Sebelum F25 (briefing getSkipReview + getDeployedPoolAddresses counterfactual), F9 (isPoolOnCooldown pre-deploy gate dlmm.js:686). F23 = Lapisan 5 (Data & setelan) persistence: tiap siklus baca/tulis 7 store, cooldown mekanis drive screening, counterfactual drive briefing. Tanpa F23, bot tak ingat riwayat lapak (re-deploy ke pool yang sama rugi berulang), tak tahu KOL/blacklist, tak ada audit trail keputusan.

**Langkah kerja** (urutan, pakai istilah teknis)
1. **Pool-memory write path (close)**: `recordPerformance` lessons.js:265 cek `perf.pool && !entry.paper && !entry.suspect_pnl` → dynamic import `recordPoolDeploy` `:266` → pool-memory.js:104 load → init entry bila baru (109-123) → push deploy (148) → recalc aggregates (154-167) → 3 cooldown trigger (174-221) → save (223).
2. **Pool-memory write path (snapshot, management cycle)**: `runManagementCycle` index.js:517 cek `!isPaperMode()` → `recordPositionSnapshot(p.pool, p)` → pool-memory.js:300 load → push snap (323-332) → slice last 48 (335-337) → save (339).
3. **Pool-memory read path (pre-deploy gate)**: SCREENER pilih pool → `deployPosition` dlmm.js:686 `isPoolOnCooldown(pool_address)` → pool-memory.js:227 load → cek `cooldown_until > now` → return bool. Lalu `:694` `isBaseMintOnCooldown(baseMint)` → `:235` load → cek `base_mint_cooldown_until > now` di entry mana saja. Bila true → deploy reject.
4. **Pool-memory read path (screening hard-filter)**: `getTopCandidates` screening.js:676 `isPoolOnCooldown(p.pool)` → skip. `:681` `isBaseMintOnCooldown(p.base?.mint)` → skip. Pool/mint cooldown tak masuk candidate list.
5. **Pool-memory read path (recall + counterfactual)**: `runScreeningCycle` index.js:815 `recallForPool(pool.pool)` → pool-memory.js:346 4-block (history/cooldown/trend/notes) → inject candidate block. `buildSkipReviewSection` briefing.js:279 `getSkipReview({deployedPoolAddresses: getDeployedPoolAddresses()})` → candidate-memory.js:117 filter `!deployed` + mcap delta → return gainers/dropped/skipped.
6. **Candidate-memory write path (screening cycle)**: `runScreeningCycle` index.js:793 `recordCandidateSnapshots(candidates)` → candidate-memory.js:51 push snap per candidate + prune stale 24h. `:901` `recordSmartWalletCounts(passing.map(...))` → `:169` push sw_snaps per pool.
7. **Candidate-memory read path (candidate block injection)**: index.js:931 `formatCandidateMomentum(getCandidateMomentum(pool.pool))` → candidate-memory.js:87+151 → 1-line momentum. `:957` `formatSmartWalletMomentum(getSmartWalletMomentum(pool.pool))` → `:191+205` → 1-line sw momentum. Both null bila <2 samples → skip line.
8. **Candidate-memory read path (shadow signals deploy)**: `deployPosition` dlmm.js:55 `captureShadowSignals(poolAddress)` → `:57` `getCandidateMomentum` + `:58` `getSmartWalletMomentum` → freeze momentum/sw ke signal_snapshot (ephemeral 24h data, F19 snapshot).
9. **Decision-log write path (5 close + 8 cycle)**: dlmm.js appendDecision di 5 titik (deploy fail 1039 / deploy success 1192 / relay close 2383 / public close 2687 / swap 2734). index.js appendDecision di 8 titik (screening 682/709/733/864/885, management 1134/1141, manual 2934). `:28` build obj → `unshift` (NEWEST first) → `slice(0, 100)` → save.
10. **Decision-log read path (prompt injection)**: `agentLoop` agent.js:229 `getDecisionSummary()` → decision-log.js:55 `getRecentDecisions(6)` → format 6 baris → prompt.js:77-80 "RECENT DECISIONS" block SCREENER/GENERAL (MANAGER skip).
11. **Smart-wallets/blacklist/dev-blocklist read path (screening hard-filter)**: `getTopCandidates` screening.js:548 `isBlacklisted(p.base?.mint)` → skip. `:552` `isDevBlocked(p.dev)` → skip. `:586/622/627/708` re-check di tahap berbeda. Smart-wallets `:806` `checkSmartWalletsOnPool` recon (cache 5min).
12. **Strategy-library read path (screening guide)**: `runScreeningCycle` index.js:770 `getActiveStrategy()` → strategy-library.js:136 load → return active strategy obj atau null (factory). Bila null → screening guna `config.strategy.strategyLock` default.
13. **Persist path**: semua save sync `fs.writeFileSync` JSON.stringify null-2. `pool-memory.json` 1.16MB (116 pool × ~10KB/pool dgn snapshot), `decision-log.json` 63KB (100 × ~630B), `candidate-memory.json` 14KB (11 × ~1.3KB). Profil-export `profil-export.js:21-23` include 8 store path utk backup.

**Output 7 store**: pool-memory.json (per-pool deploy history + cooldown + snapshot), candidate-memory.json (per-candidate trend snap + sw count), decision-log.json (100 decision audit trail), smart-wallets.json (KOL list), token-blacklist.json (mint blacklist), dev-blocklist.json (deployer blacklist), strategy-library.json (LP strategy). Side-effect: cooldown mekanis drive screening skip, counterfactual drive briefing section, decisionSummary inject prompt. Trigger ke fase berikut: screening cycle baca cooldown/blacklist → skip pool; briefing baca getSkipReview → counterfactual section; agent.js baca getDecisionSummary → prompt RECENT DECISIONS.

**Kalau rusak / diskip** (2-3 kalimat, istilah teknis)
`pool-memory.json` corrupt → `load()` fallback `{}` → semua pool "first time" (cooldown reset, riwayat hilang) → bot bisa re-deploy ke pool yang rugi berulang (no cooldown memory). `candidate-memory.json` corrupt → `{}` → momentum/sw_momentum line skip (fail-open, factory). `decision-log.json` corrupt → `{decisions:[]}` → getDecisionSummary return "No recent structured decisions yet." (prompt kosong, fail-open). `smart-wallets.json`/`token-blacklist.json`/`dev-blocklist.json` ENOENT → factory empty (no KOL/blacklist tracked, screening lewati). `strategy-library.json` corrupt → `{active:null,strategies:{}}` → getActiveStrategy null → screening guna config.strategy.strategyLock default. `recordPoolDeploy` throw → caught? lessons.js:266 TIDAK visible try-catch sekitar dynamic import + call — bila throw (pool-memory.json parse-fail saat load di dalam recordPoolDeploy) → propagate ke recordPerformance → close caller catch (dlmm.js:2336/2640/1691, F19 Open-Q #13). Pool-memory skip update cycle, lesson persist tetap aman. `recordCandidateSnapshots`/`recordSmartWalletCounts` throw → UNKNOWN try-catch (index.js:793/901 tak visible wrap) — bila throw → runScreeningCycle crash? Mitigation: candidate-memory `load()` fallback `{}` jadi `save({})` overwrite file — destructive bila parse-fail transient (E.2).

**Istilah yang muncul di fase ini** (bullet, cuma yang baru)
- **pool-memory.json** — per-pool deploy history + cooldown + snapshot. 116 pool/449 deploy/1.16MB live. paths.poolMemoryPath.
- **recordPoolDeploy** — write path `pool-memory.js:104`. Push deploy + recalc + 3 cooldown trigger. Dipanggil recordPerformance lessons.js:266 gated `!paper && !suspect_pnl`.
- **isPoolOnCooldown** — read gate `:227`. `cooldown_until > now`. Dipanggil screening.js:676 + dlmm.js:686.
- **isBaseMintOnCooldown** — read gate `:235`. `base_mint_cooldown_until > now` di entry mana saja. Dipanggil screening.js:681 + dlmm.js:694.
- **setPoolCooldown** — `:65` set `cooldown_until + cooldown_reason`. 4h low-yield / 12h OOR / N h repeat-fee.
- **setBaseMintCooldown** — `:72` set `base_mint_cooldown_until` ke SEMUA entry dgn base_mint sama (cross-pool mint cooldown).
- **isOorCloseReason** — `:42` cek "oor"/"out of range". Drives repeated-OOR trigger.
- **isAdjustedWinRateExcludedReason** — `:47` exclude OOR/pumped-above-range dari adjusted_win_rate (fair win-rate, OOR = rugi mekanis bukan keputusan buruk).
- **isFeeGeneratingDeploy** — `:55` cek `fee_earned_pct >= repeatDeployCooldownMinFeeEarnedPct`. Drives repeat-fee-generating trigger (jangan over-farm pool yang sudah fee-generating).
- **adjusted_win_rate** — win-rate exclude OOR/pumped-above-range. `pool-memory.js:163-167`. Fair metric (OOR = mekanis, bukan judgment error).
- **recordPositionSnapshot** — `:300` snapshot per management cycle. Last 48 (~4h@5min). Dipanggil index.js:517 gated `!isPaperMode()`.
- **recallForPool** — `:346` 4-block (history/cooldown/trend/notes) → inject candidate block. Dipanggil index.js:815/518 + cli.js:205.
- **getDeployedPoolAddresses** — `:256` `Object.keys(load())` utk counterfactual skip-review. Dipanggil briefing.js:280.
- **candidate-memory.json** — per-candidate trend snap + sw count. 11 candidate/64 snap. Throwaway 24h prune. Split dari pool-memory (looked-at vs deployed).
- **MAX_SNAPSHOTS** — `:20` konstanta 8. Per-pool cap (last few cycle).
- **STALE_MS** — `:21` konstanta 24h. Prune pool not seen.
- **recordCandidateSnapshots** — `:51` push snap per candidate per cycle + prune stale. Gated `candidateMomentum`/`smartWalletMomentum`/`counterfactualReview` ON.
- **getCandidateMomentum** — `:87` pct change oldest→newest TVL/vol/mcap. Return `{samples, span_min, *_delta_pct}` or `{first_sighting:true}`.
- **formatCandidateMomentum** — `:151` 1-line "tvl +X%, vol +Y%, mcap +Z% over N samples (~Mm)". Null bila <2.
- **recordSmartWalletCounts** — `:169` push sw_snaps per pool. Separate buffer dari snaps.
- **getSmartWalletMomentum** — `:191` `{first, last, delta, samples}`. Null bila <2.
- **formatSmartWalletMomentum** — `:205` 1-line "smart wallets entering/leaving: X→Y over N cycles". Null bila delta=0 (flat silent).
- **getSkipReview** — `:117` counterfactual: filter `!deployed` + mcap delta. Return `{skipped, dropped, gainers[]}`. Dipanggil briefing.js:279.
- **decision-log.json** — 100 decision audit trail. NEWEST first (unshift). 63KB. paths.decisionLogPath.
- **MAX_DECISIONS** — `:6` konstanta 100. Cap audit trail.
- **appendDecision** — `:28` build obj + unshift + slice-100 + save. 5 call site dlmm.js + 8 call site index.js.
- **getDecisionSummary** — `:55` format 6 baris "N. [actor] TYPE pool | summary | reason | risks | rejected". Inject prompt agent.js:229.
- **smart-wallets.json** — KOL/alpha wallet tracker. ENOENT factory (no KOL tracked live). paths.smartWalletsPath.
- **checkSmartWalletsOnPool** — `:57` cek wallet LP position di pool. Cache 5min `_cache Map :54`. Filter `type==='lp'`.
- **SOLANA_PUBKEY_RE** — `:21` regex validate addSmartWallet address.
- **token-blacklist.json** — mint blacklist. ENOENT factory. paths.tokenBlacklistPath.
- **isBlacklisted** — `:34` hard-filter screening.js:548/622.
- **dev-blocklist.json** — deployer blacklist. ENOENT factory. **repoPath langsung `:13`, BUKAN paths.* (E.1)**.
- **isDevBlocked** — `:28` hard-filter screening.js:552/586/627/708.
- **strategy-library.json** — LP strategy store. 5 strategy/active=null live. paths.strategyLibraryPath.
- **getActiveStrategy** — `:136` return active strategy atau null. Dipanggil index.js:770 screening guide.
- **3 isolation gate** — (a) `!isPaperMode()` recordPositionSnapshot index.js:517, (b) `!paper && !suspect_pnl` recordPoolDeploy lessons.js:265, (c) recallForPool reads stay (live history visible saat paper, tak write).
- **profil-export** — `profil-export.js:21-23` backup 8 store path (state/lessons/poolMemory/candidateMemory/decisionLog/signalWeights/llmCost/smartWallets/tokenBlacklist/strategyLibrary/solBalanceHistory).

*Lewati §0 kalau sudah paham. Isi teknis mulai §A.*

---

## §A — Peta file fase ini

| File | Peran | Baris kunci |
|------|-------|-------------|
| `pool-memory.js` (422) | **Riwayat deploy + cooldown + snapshot + recall**: 3 cooldown trigger + adjusted_win_rate + 48-snap trend + 4-block recall | 15 POOL_MEMORY_FILE; 18-27 sanitizeStoredNote; 29-40 load/save; 42-45 isOorCloseReason; 47-53 isAdjustedWinRateExcludedReason; 55-63 isFeeGeneratingDeploy; 65-70 setPoolCooldown; 72-82 setBaseMintCooldown; 104-225 recordPoolDeploy; 227-233 isPoolOnCooldown; 235-244 isBaseMintOnCooldown; 256-258 getDeployedPoolAddresses; 260-293 getPoolMemory tool; 300-340 recordPositionSnapshot; 346-387 recallForPool; 393-421 addPoolNote |
| `candidate-memory.js` (209) | **Throwaway trend + 3 experiment backing**: momentum/sw_momentum/counterfactual | 19 CANDIDATE_MEMORY_FILE; 20 MAX_SNAPSHOTS=8; 21 STALE_MS=24h; 33-44 load/save; 51-80 recordCandidateSnapshots; 87-105 getCandidateMomentum; 117-145 getSkipReview; 151-161 formatCandidateMomentum; 169-185 recordSmartWalletCounts; 191-199 getSmartWalletMomentum; 205-208 formatSmartWalletMomentum |
| `decision-log.js` (68) | **100-cap audit trail + prompt injection**: unshift NEWEST + getDecisionSummary | 5 DECISION_LOG_FILE; 6 MAX_DECISIONS=100; 8-22 load/save; 23-26 sanitize; 28-48 appendDecision; 50-53 getRecentDecisions; 55-68 getDecisionSummary |
| `smart-wallets.js` (102) | **KOL/alpha tracker + cache 5min**: add/remove/list/checkSmartWalletsOnPool | 6 WALLETS_PATH; 21 SOLANA_PUBKEY_RE; 23-36 addSmartWallet; 38-46 removeSmartWallet; 48-51 listSmartWallets; 54-55 _cache Map + CACHE_TTL 5min; 57-102 checkSmartWalletsOnPool |
| `token-blacklist.js` (104) | **Mint blacklist + hard-filter**: isBlacklisted screening.js | 13 BLACKLIST_FILE; 15-26 load/save; 34-38 isBlacklisted; 45-69 addToBlacklist; 74-88 removeFromBlacklist; 93-104 listBlacklist |
| `dev-blocklist.js` (66) | **Deployer blacklist + hard-filter**: isDevBlocked screening.js. **repoPath langsung `:13` (E.1)** | 13 BLOCKLIST_FILE repoPath; 15-26 load/save; 28-31 isDevBlocked; 33-35 getBlockedDevs; 37-49 blockDev; 51-60 unblockDev; 62-66 listBlockedDevs |
| `strategy-library.js` (140) | **LP strategy store + auto-active first**: active strategy guide screening | 14 STRATEGY_FILE; 16-27 load/save; 35-75 addStrategy (auto-active :70); 80-92 listStrategies; 97-103 getStrategy; 108-116 setActiveStrategy; 121-131 removeStrategy; 136-140 getActiveStrategy |
| `paths.js` | **6 path resolve** (poolMemory/candidateMemory/decisionLog/smartWallets/tokenBlacklist/strategyLibrary) via dataDir | 20-27 |
| `profil-export.js` | **Backup 8 store path** utk export profil | 21-23 |
| `index.js` | **Consumer**: recordPositionSnapshot :517, recallForPool :815/518, getActiveStrategy :770, recordCandidateSnapshots :793, checkSmartWalletsOnPool :806/2922, recordSmartWalletCounts :901, formatMomentum :931/957, appendDecision :682/709/733/864/885/1134/1141/2934 | 39/45/47/48/53 imports |
| `tools/screening.js` | **Hard-filter chain**: isBlacklisted :548/622, isDevBlocked :552/586/627/708, isPoolOnCooldown :676, isBaseMintOnCooldown :681 | 2-5 imports |
| `tools/dlmm.js` | **Pre-deploy gate + shadow signals + appendDecision**: isPoolOnCooldown :686, isBaseMintOnCooldown :694, captureShadowSignals :55-58, appendDecision :1039/1192/2383/2687/2734 | 31/41/44 imports |
| `tools/executor.js` | **Tool handler**: check_smart_wallets_on_pool :219, get_recent_decisions :260 | 21/25 imports |
| `tools/token.js` | **Smart wallets holding**: listSmartWallets :127 → smart_wallets_holding list | 127-190 |
| `agent.js` | **getDecisionSummary consumer**: agentLoop :229 → buildSystemPrompt decisionSummary | 106 import |
| `briefing.js` | **Counterfactual consumer**: buildSkipReviewSection :276-298 getSkipReview + getDeployedPoolAddresses | 8/9 imports |
| `lessons.js` | **recordPoolDeploy dispatch**: recordPerformance :265-289 gated `!paper && !suspect_pnl` | 266 dynamic import |
| `cli.js` | **Manual recon**: checkSmartWalletsOnPool :204, recallForPool :205/253 | 204-253 |

---

## §B — Alur data hulu→hilir

```
[close position] ──F19──> recordPerformance (lessons.js:156)
    │
    └─ :265 if perf.pool && !paper && !suspect_pnl
        └─ dynamic import recordPoolDeploy (pool-memory.js:104)
            ├─ load() pool-memory.json
            ├─ init entry bila baru (109-123)
            ├─ push deploy (148) + recalc avg/win/adjusted_win (154-167)
            ├─ 3 cooldown trigger:
            │   ├─ low-yield close_reason === "low yield" → setPoolCooldown 4h (174-178)
            │   ├─ repeated-OOR (oorCooldownTriggerCount× recent OOR) → setPoolCooldown oorCooldownHours + setBaseMintCooldown (180-195)
            │   └─ repeat-fee-generating (repeatDeployCooldownEnabled + isFeeGeneratingDeploy ×N) → setPoolCooldown/setBaseMintCooldown scope pool/token/both (197-221)
            └─ save(db) (223)

[management cycle] ──index.js:517──> recordPositionSnapshot (pool-memory.js:300)
    │
    ├─ :517 if !isPaperMode()
    └─ push snap {ts, position, pnl_pct, pnl_usd, in_range, unclaimed_fees_usd, minutes_out_of_range, age_minutes}
        └─ slice last 48 (~4h@5min) → save

[screening cycle] ──index.js:793──> recordCandidateSnapshots (candidate-memory.js:51)
    │
    ├─ :793 if candidateMomentum || smartWalletMomentum || counterfactualReview (shared guard)
    ├─ push snap {ts, tvl, volume, mcap} per candidate
    ├─ prune stale 24h (74-77)
    └─ save
        │
        ├─ :901 recordSmartWalletCounts (passing sw) → push sw_snaps per pool
        │
        ├─ :931 formatCandidateMomentum(getCandidateMomentum(pool.pool))
        │     └─ null bila <2 → skip line; else "tvl +X%, vol +Y%, mcap +Z% over N samples (~Mm)"
        │
        ├─ :957 formatSmartWalletMomentum(getSmartWalletMomentum(pool.pool))
        │     └─ null bila delta=0 → skip line; else "smart wallets entering/leaving: X→Y over N cycles"
        │
        └─ :815 recallForPool(pool.pool) → 4-block (history/cooldown/trend/notes) → inject candidate block

[deploy attempt] ──dlmm.js:686──> isPoolOnCooldown (pool-memory.js:227)
    │
    ├─ :686 if isPoolOnCooldown(pool_address) → reject deploy
    ├─ :694 if isBaseMintOnCooldown(baseMint) → reject deploy
    └─ :55 captureShadowSignals(poolAddress)
        ├─ :57 getCandidateMomentum → freeze momentum ke signal_snapshot
        └─ :58 getSmartWalletMomentum → freeze sw ke signal_snapshot

[screening hard-filter] ──screening.js──> chain
    │
    ├─ :548 isBlacklisted(p.base?.mint) → skip
    ├─ :552 isDevBlocked(p.dev) → skip
    ├─ :676 isPoolOnCooldown(p.pool) → skip
    ├─ :681 isBaseMintOnCooldown(p.base?.mint) → skip
    └─ :586/622/627/708 re-check di tahap berbeda

[decision append] ──5 dlmm.js + 8 index.js──> appendDecision (decision-log.js:28)
    │
    ├─ build obj {id, ts, type, actor, pool, pool_name, position, summary, reason, risks[6], metrics, rejected[8]}
    ├─ unshift (NEWEST first)
    ├─ slice(0, MAX_DECISIONS=100)
    └─ save

[agent prompt build] ──agent.js:229──> getDecisionSummary (decision-log.js:55)
    │
    ├─ getRecentDecisions(6)
    ├─ format "N. [actor] TYPE pool | summary | reason | risks | rejected"
    └─ prompt.js:77-80 "RECENT DECISIONS" block SCREENER/GENERAL (MANAGER skip)

[briefing counterfactual] ──briefing.js:276──> buildSkipReviewSection
    │
    ├─ if experiments.counterfactualReview
    ├─ getSkipReview({deployedPoolAddresses: getDeployedPoolAddresses(), minMcapGainPct})
    ├─ filter !deployed + mcap delta
    └─ return {skipped, dropped, gainers[]} → section "Passed on N pools — M fell (good skips) / gainers list"

[strategy guide] ──index.js:770──> getActiveStrategy (strategy-library.js:136)
    │
    └─ return active strategy obj atau null (factory) → screening guide

[KOL recon] ──index.js:806──> checkSmartWalletsOnPool (smart-wallets.js:57)
    │
    ├─ load wallets, filter type==='lp'
    ├─ cache 5min (_cache Map)
    ├─ getWalletPositions dlmm.js dynamic import
    └─ return {pool, tracked_wallets, in_pool[], confidence_boost, signal}
```

---

## §C — Sinkron: siapa-panggil-siapa

| Pemanggil (file:line) | Dipanggil (file:line) | Trigger | Data lewat | Fail-mode |
|---|---|---|---|---|
| lessons.js:266 | recordPoolDeploy (pool-memory.js:104) | recordPerformance close, `!paper && !suspect_pnl` | `{pool_name, base_mint, deployed_at, closed_at, pnl_pct, pnl_usd, range_efficiency, minutes_held, fees_*, fee_earned_pct, close_reason, strategy, volatility, entry_*, exit_*}` (17 fields) | dynamic import throw → propagate (no visible try-catch) → close caller catch |
| index.js:517 | recordPositionSnapshot (pool-memory.js:300) | management cycle, `!isPaperMode()` | `p` (position obj: pool, position, pnl_pct, pnl_usd, in_range, unclaimed_fees_usd, minutes_out_of_range, age_minutes) | throw → runManagementCycle crash? (no visible wrap) |
| index.js:815/518 | recallForPool (pool-memory.js:346) | screening candidate block + management recall | `poolAddress` → 4-block string or null | entry absent → null |
| index.js:770 | getActiveStrategy (strategy-library.js:136) | runScreeningCycle | — → strategy obj or null | active=null/absent → null |
| index.js:793 | recordCandidateSnapshots (candidate-memory.js:51) | runScreeningCycle, shared experiment guard | `candidates[]` | throw → runScreeningCycle crash? (no visible wrap — E.2) |
| index.js:901 | recordSmartWalletCounts (candidate-memory.js:169) | runScreeningCycle passing sw | `[{addr, name, sw_count}]` | throw → crash? |
| index.js:931 | formatCandidateMomentum + getCandidateMomentum (candidate-memory.js:151/87) | candidate block injection | `poolAddress` → 1-line or null | null → skip line |
| index.js:957 | formatSmartWalletMomentum + getSmartWalletMomentum (candidate-memory.js:205/191) | candidate block injection | `poolAddress` → 1-line or null | null/delta=0 → skip line |
| index.js:806/2922 | checkSmartWalletsOnPool (smart-wallets.js:57) | screening + manual recon | `{pool_address}` → `{pool, tracked_wallets, in_pool[], confidence_boost, signal}` | cache 5min, getWalletPositions catch → [] |
| index.js:682/709/733/864/885/1134/1141/2934 | appendDecision (decision-log.js:28) | screening/management/manual cycle | `{type, actor, pool, pool_name, summary, reason, risks, metrics, rejected}` | load/save fail → reset |
| tools/dlmm.js:1039/1192/2383/2687/2734 | appendDecision (decision-log.js:28) | deploy fail/success + close + swap | same shape | same |
| tools/dlmm.js:686 | isPoolOnCooldown (pool-memory.js:227) | deployPosition pre-deploy gate | `pool_address` → bool | entry absent → false |
| tools/dlmm.js:694 | isBaseMintOnCooldown (pool-memory.js:235) | deployPosition pre-deploy gate | `baseMint` → bool | entry absent → false |
| tools/dlmm.js:57-58 | getCandidateMomentum + getSmartWalletMomentum (candidate-memory.js:87/191) | captureShadowSignals deploy | `poolAddress` → momentum/sw obj | null bila <2 |
| tools/screening.js:548/622 | isBlacklisted (token-blacklist.js:34) | hard-filter pre-LLM | `mint` → bool | ENOENT → false (no blacklist) |
| tools/screening.js:552/586/627/708 | isDevBlocked (dev-blocklist.js:28) | hard-filter pre-LLM | `devWallet` → bool | ENOENT → false |
| tools/screening.js:676 | isPoolOnCooldown (pool-memory.js:227) | hard-filter pre-LLM | `pool` → bool | false bila no cooldown |
| tools/screening.js:681 | isBaseMintOnCooldown (pool-memory.js:235) | hard-filter pre-LLM | `baseMint` → bool | false bila no cooldown |
| tools/executor.js:219 | checkSmartWalletsOnPool (smart-wallets.js:57) | tool `check_smart_wallets_on_pool` | `{pool_address}` → result obj | cache 5min |
| tools/executor.js:260 | getRecentDecisions (decision-log.js:50) | tool `get_recent_decisions` | `{limit}` → decisions[] | load fail → [] |
| tools/token.js:127 | listSmartWallets (smart-wallets.js:48) | getTokenHolders smart_wallets_holding | — → `{total, wallets[]}` | ENOENT → {wallets:[]} |
| agent.js:229 | getDecisionSummary (decision-log.js:55) | agentLoop prompt build | — → 6-line string | empty → "No recent structured decisions yet." |
| briefing.js:279 | getSkipReview (candidate-memory.js:117) | buildSkipReviewSection daily, `counterfactualReview` ON | `{deployedPoolAddresses, minMcapGainPct}` → `{skipped, dropped, gainers[]}` | try-catch fail-open |
| briefing.js:280 | getDeployedPoolAddresses (pool-memory.js:256) | buildSkipReviewSection | — → `[]` pool addresses | load fail → [] |
| cli.js:204/205 | checkSmartWalletsOnPool + recallForPool | manual recon | — → result/recall | fail-open |

---

## §D — Logika kunci per fungsi

### `recordPoolDeploy(poolAddress, deployData)` (pool-memory.js:104-225)
- **Apa**: write closed deploy ke pool-memory.json + recalc aggregates + 3 cooldown trigger.
- **Kapan dipicu**: recordPerformance lessons.js:266 (`!paper && !suspect_pnl` gate).
- **Output**: side-effect mutate pool-memory.json (sync write). Return void.
- **Sinkron**: SCREENER baca `isPoolOnCooldown`/`isBaseMintOnCooldown` (screening.js:676/681 + dlmm.js:686/694) utk skip. `recallForPool` baca `deploys[]` + `cooldown_until` + `snapshots[]` utk inject candidate block. `getDeployedPoolAddresses` baca `Object.keys(load())` utk counterfactual.
- **Fail-mode**: `load()` parse-fail → `{}` → init entry baru (riwayat hilang). `save()` throw → propagate (no try-catch).
- **Bukti**: pool-memory.js:104-225; 3 trigger 174-221; aggregate 154-167.

### `isPoolOnCooldown(poolAddress)` (pool-memory.js:227-233) + `isBaseMintOnCooldown(baseMint)` (pool-memory.js:235-244)
- **Apa**: read gate — `cooldown_until > now` / `base_mint_cooldown_until > now`.
- **Kapan dipicu**: screening.js:676/681 hard-filter, dlmm.js:686/694 pre-deploy gate.
- **Output**: boolean.
- **Sinkron**: `cooldown_until` di-set `setPoolCooldown :65` (low-yield/OOR/repeat-fee). `base_mint_cooldown_until` di-set `setBaseMintCooldown :72` (OOR/repeat-fee, cross-pool).
- **Fail-mode**: entry absent → false. `cooldown_until` expired → false.
- **Bukti**: pool-memory.js:227-244.

### `recordPositionSnapshot(poolAddress, snapshot)` (pool-memory.js:300-340)
- **Apa**: push snapshot per management cycle, last 48 (~4h@5min).
- **Kapan dipicu**: index.js:517 `!isPaperMode()` gate.
- **Output**: side-effect mutate pool-memory.json. Return void.
- **Sinkron**: `recallForPool :368-377` baca `snapshots.slice(-6)` utk recent trend (PnL drift/OOR count).
- **Fail-mode**: `load()` fail → `{}` → init entry. `save()` throw → propagate.
- **Bukti**: pool-memory.js:300-340; index.js:517 gate.

### `recallForPool(poolAddress)` (pool-memory.js:346-387)
- **Apa**: 4-block string (history/cooldown/trend/notes) utk inject candidate block.
- **Kapan dipicu**: index.js:815 screening + :518 management + cli.js:205 manual.
- **Output**: string or null.
- **Sinkron**: baca `deploys[]` (history), `cooldown_until`/`base_mint_cooldown_until` (cooldown), `snapshots.slice(-6)` (trend), `notes[last]` (note).
- **Fail-mode**: entry absent → null. Empty all block → null.
- **Bukti**: pool-memory.js:346-387.

### `getDeployedPoolAddresses()` (pool-memory.js:256-258)
- **Apa**: `Object.keys(load())` — semua pool address pernah deploy.
- **Kapan dipicu**: briefing.js:280 counterfactual skip-review.
- **Output**: array string.
- **Sinkron**: `getSkipReview` candidate-memory.js:118 filter `!deployed.has(addr)` utk "looked-at but not entered" set.
- **Fail-mode**: load fail → {} → [].
- **Bukti**: pool-memory.js:256-258.

### `recordCandidateSnapshots(candidates)` (candidate-memory.js:51-80)
- **Apa**: push snap per candidate per cycle + prune stale 24h.
- **Kapan dipicu**: index.js:793 runScreeningCycle shared guard (`candidateMomentum || smartWalletMomentum || counterfactualReview`).
- **Output**: side-effect mutate candidate-memory.json. Return void.
- **Sinkron**: `getCandidateMomentum :87` baca `snaps[0]` vs `snaps[last]` utk pct delta. `getSkipReview :117` baca `snaps` utk mcap drift.
- **Fail-mode**: `load()` fail → {} → save({}) overwrite (destructive bila transient parse-fail — E.2). `save()` throw → runScreeningCycle crash? (no visible wrap).
- **Bukti**: candidate-memory.js:51-80; prune 74-77.

### `getCandidateMomentum(poolAddress)` (candidate-memory.js:87-105) + `formatCandidateMomentum(m)` (candidate-memory.js:151-161)
- **Apa**: pct change oldest→newest TVL/vol/mcap. Format 1-line.
- **Kapan dipicu**: index.js:931 candidate block injection, dlmm.js:57 captureShadowSignals.
- **Output**: `{samples, span_min, tvl_delta_pct, volume_delta_pct, mcap_delta_pct}` or `{samples, first_sighting:true}` bila <2. Format: 1-line or null.
- **Sinkron**: `formatCandidateMomentum` null bila first_sighting atau <2 → caller skip line.
- **Fail-mode**: entry absent → null. snaps<2 → first_sighting. pct non-finite → null field.
- **Bukti**: candidate-memory.js:87-105/151-161.

### `recordSmartWalletCounts(rows)` (candidate-memory.js:169-185) + `getSmartWalletMomentum(poolAddress)` (candidate-memory.js:191-199) + `formatSmartWalletMomentum(m)` (candidate-memory.js:205-208)
- **Apa**: sw_snaps buffer separate dari snaps. Count drift oldest→newest. Format 1-line.
- **Kapan dipicu**: recordSmartWalletCounts index.js:901 (passing sw). getSmartWalletMomentum dlmm.js:58 + index.js:957.
- **Output**: `{first, last, delta, samples}` or null. Format: "smart wallets entering(+N)/leaving(-N): X→Y over N cycles" or null bila delta=0.
- **Sinkron**: format null bila delta=0 (flat silent — tak speaker kalau tak gerak).
- **Fail-mode**: entry absent → null. snaps<2 → null. count non-finite → null.
- **Bukti**: candidate-memory.js:169-185/191-199/205-208.

### `getSkipReview({deployedPoolAddresses, minMcapGainPct, limit})` (candidate-memory.js:117-145)
- **Apa**: counterfactual — filter `!deployed` + `snaps.length >= 2` + mcap delta. Return `{skipped, dropped, gainers[]}`.
- **Kapan dipicu**: briefing.js:279 `buildSkipReviewSection` (gated `counterfactualReview`).
- **Output**: `{skipped, dropped, gainers[]}` sort desc mcap_delta slice limit.
- **Sinkron**: `deployedPoolAddresses` dari `getDeployedPoolAddresses` pool-memory.js:256. Bounded candidate-memory retention (8 snap/pool, 24h prune) → short horizon.
- **Fail-mode**: load fail → {} → {skipped:0, dropped:0, gainers:[]}. Caller return null bila skipped=0.
- **Bukti**: candidate-memory.js:117-145; briefing.js:276-298 try-catch fail-open.

### `appendDecision(entry)` (decision-log.js:28-48)
- **Apa**: build decision obj + unshift (NEWEST first) + slice-100 + save.
- **Kapan dipicu**: 5 dlmm.js call site + 8 index.js call site.
- **Output**: decision obj (return value). Side-effect mutate decision-log.json.
- **Sinkron**: `getRecentDecisions :50` slice limit. `getDecisionSummary :55` format 6 baris → inject prompt agent.js:229.
- **Fail-mode**: `load()` fail → `{decisions:[]}` → save (overwrite, destructive bila transient — E.2). `sanitize` trim+slice.
- **Bukti**: decision-log.js:28-48; MAX_DECISIONS :6; unshift :44; slice :45.

### `getDecisionSummary(limit=6)` (decision-log.js:55-68)
- **Apa**: format "N. [actor] TYPE pool | summary | reason | risks | rejected" join "\n".
- **Kapan dipicu**: agent.js:229 agentLoop prompt build.
- **Output**: 6-line string or "No recent structured decisions yet.".
- **Sinkron**: prompt.js:77-80 "RECENT DECISIONS" block SCREENER/GENERAL (MANAGER skip).
- **Fail-mode**: empty → fallback string.
- **Bukti**: decision-log.js:55-68; prompt.js:77-80.

### `checkSmartWalletsOnPool({pool_address})` (smart-wallets.js:57-102)
- **Apa**: cek wallet LP position di pool. Cache 5min. Filter `type==='lp'`.
- **Kapan dipicu**: index.js:806/2922 screening + manual recon, tools/executor.js:219 tool, cli.js:204.
- **Output**: `{pool, tracked_wallets, in_pool[], confidence_boost, signal}`.
- **Sinkron**: `getWalletPositions` dlmm.js dynamic import `:71`. `_cache Map :54` per address. `signal` string utk prompt context.
- **Fail-mode**: ENOENT → `{wallets:[]}` → "No smart wallets tracked yet — neutral signal". `getWalletPositions` catch → [].
- **Bukti**: smart-wallets.js:57-102; cache 54-55; filter :60.

### `isBlacklisted(mint)` (token-blacklist.js:34) + `isDevBlocked(devWallet)` (dev-blocklist.js:28)
- **Apa**: hard-filter screening pre-LLM.
- **Kapan dipicu**: screening.js:548/622 (blacklist), :552/586/627/708 (dev-blocklist).
- **Output**: boolean.
- **Sinkron**: addToBlacklist/blockDev tool → save → isBlacklisted/isDevBlocked read.
- **Fail-mode**: ENOENT → {} → false (no blacklist, factory).
- **Bukti**: token-blacklist.js:34; dev-blocklist.js:28.

### `getActiveStrategy()` (strategy-library.js:136-140)
- **Apa**: return active strategy obj atau null.
- **Kapan dipicu**: index.js:770 runScreeningCycle guide.
- **Output**: strategy obj or null.
- **Sinkron**: `setActiveStrategy :108` set `db.active`. `addStrategy :35` auto-active bila first `:70`. `removeStrategy :121` fallback ke `Object.keys(strategies)[0]` or null `:127`.
- **Fail-mode**: active=null/absent → null (factory — screening guna `config.strategy.strategyLock` default).
- **Bukti**: strategy-library.js:136-140; index.js:770.

---

## §E — Temuan: bug / gap / kontrak-kunci / fail-open tak-terpenuhi

### E.1 — dev-blocklist pakai repoPath langsung, BUKAN paths.* (P3, inkonsisten)
`dev-blocklist.js:13` `const BLOCKLIST_FILE = repoPath("dev-blocklist.json")` — langsung pakai `repoPath`, TIDAK lewat `paths.*`. 6 store lain (pool-memory/candidate-memory/decision-log/smart-wallets/token-blacklist/strategy-library) semua via `paths.*` (paths.js:20-27) yang resolve `dataDir` (per-profil). dev-blocklist TIDAK masuk `profil-export.js:21-23` backup list (cek: `profil-export.js` sebut poolMemory/candidateMemory/decisionLog/signalWeights/llmCost/smartWallets/tokenBlacklist/strategyLibrary/solBalanceHistory — TIDAK ada dev-blocklist). **Severity P3** — dev-blocklist tak ter-backup export profil, tak ter-isolasi per-profil (shared across profil di repo root). Bila operator switch profil via addprofil/preset, dev-blocklist tetap (cross-profil leak — mungkin intentional utk global blacklist). Fix candidate: pindah ke `paths.devBlocklistPath` + tambah ke profil-export list. Cross-ref F29 (paths resolve + addprofil isolation).

### E.2 — load() parse-fail → save({}) overwrite destructive (P3, transient data loss)
Pattern load di semua 7 store: `if (!existsSync) return fallback; try { JSON.parse } catch { return fallback }`. Fallback = `{}` (pool-memory/candidate/token-blacklist/dev-blocklist) atau `{wallets:[]}`/`{decisions:[]}`/`{active:null,strategies:{}}`. Setelah load return fallback, `save(fallback)` overwrite file → **destructive bila parse-fail transient** (e.g. file separuh tulis karena power loss, atau fs race). Riwayat 449 deploy pool-memory bisa hilang bila parse-fail 1x. **Severity P3** — probability rendah (fs.writeFileSync sync jarang corrupt), impact tinggi (data loss). Fix candidate: backup file sebelum overwrite (`.bak`), atau `load()` return null + caller skip save bila parse-fail (jangan overwrite dengan fallback). Cross-ref F19 load() chokepoint, F22 getModePerformance load() pattern identik.

### E.3 — recordCandidateSnapshots/recordSmartWalletCounts/recordPositionSnapshot tak visible try-catch (P3, crash potential)
index.js:793 `recordCandidateSnapshots(candidates)`, :901 `recordSmartWalletCounts(...)`, :517 `recordPositionSnapshot(p.pool, p)` — TIDAK visible try-catch sekitar call. Bila throw (pool-memory.json/candidate-memory.json save fail) → propagate ke `runScreeningCycle`/`runManagementCycle` → crash cycle. Mitigation: load/save sync jarang throw, `load()` catch parse-fail. TAPI `save()` `fs.writeFileSync` bisa throw (disk full, permission) → cycle crash. **Severity P3** — probability rendah, impact sedang (1 cycle skip, bukan data loss). Fix candidate: wrap 3 call di try-catch fail-open (cycle continue tanpa snapshot update). Cross-ref F19 recordPoolDeploy dispatch (lessons.js:266 juga no visible wrap — F19 Open-Q #13).

### E.4 — decision-log MAX_DECISIONS=100 cap, history overwrite (P4, audit horizon limit)
`:6` konstanta 100. `unshift` + `slice(0, 100)` → decision #101 overwrite decision terlama. Live: 100 decision (cap penuh), NEWEST 2026-07-07T09:00, terlama hilang. Operator tak bisa audit decision >100 cycle lalu. **Severity P4** — design decision (cap mencegah file grow unbounded). Cross-ref F21 signal-weights history slice-20 (cap 20, similar pattern). Fix candidate bila perlu: archive mechanism (dump-to-archive saat cap), atau configurable MAX_DECISIONS via config. Tidak terlihat archive path di paths.js (grep decision archive = 0).

### E.5 — strategy-library active=null factory, screening fallback config.strategy (P4, kontrak)
Live: 5 strategy di library, `active=null`. `getActiveStrategy :136` return null. `index.js:770` call → null. Screening guna `config.strategy.strategyLock` (default "default") + `config.strategy.strategy` (default "bid_ask") dari user-config.json. **Kontrak intentional** — strategy-library = optional manual store, config.strategy = canonical source. addStrategy auto-active bila first (`:70`), tapi factory 5 strategy tanpa active = operator pernah add lalu setActive null (atau removeStrategy fallback null). **Severity P4** — design, bukan bug. TAPI UNKNOWN: bila operator `setActiveStrategy(X)` lalu `removeStrategy(X)` → fallback `Object.keys(strategies)[0]` or null (`:127`). Bila null → screening fallback config. Worth documenting.

### E.6 — adjusted_win_rate exclude OOR/pumped-above-range (kontrak, fair metric)
`isAdjustedWinRateExcludedReason :47-53` exclude "out of range"/"pumped far above range"/"oor" dari `adjusted_win_rate` calc `:163-167`. Kontrak: OOR = rugi mekanis (harga kabur dari range, bukan keputusan buruk SCREENER). adjusted_win_rate = fair metric (win-rate exclude mekanis-loss). `win_rate` (raw) tetap hitung OOR sebagai loss. **Kontrak intentional** — operator lihat both: raw win_rate (semua) + adjusted_win_rate (fair judgment). recallForPool `:356` sebut `win_rate` (raw). getPoolMemory tool `:281` return both. **Kontrak terpenuhi**.

### E.7 — 3 cooldown trigger config-driven, 2 gated (kontrak)
(1) Low-yield: hardcoded 4h (`:175`), TIDAK config-driven. (2) Repeated-OOR: `config.management.oorCooldownTriggerCount` (default 3) + `config.management.oorCooldownHours` (default 12) — config-driven. (3) Repeat-fee-generating: `config.management.repeatDeployCooldownEnabled` (gate) + `repeatDeployCooldownTriggerCount` (default 3) + `repeatDeployCooldownHours` (default 12) + `repeatDeployCooldownScope` (pool/token/both) + `repeatDeployCooldownMinFeeEarnedPct` — config-driven. **Low-yield 4h hardcoded** — TIDAK di CONFIG_MAP? Cross-ref F8 full-sync. Bila operator mau tune low-yield cooldown → must edit kode. **Severity P4** — minor (low-yield cooldown jarang perlu tune). Fix candidate: expose `lowYieldCooldownHours` config.

### E.8 — recallForPool sanitizeStoredNote untuk note (kontrak, prompt injection safety)
`:18-27` `sanitizeStoredNote` strip `\r\n\t`, collapse whitespace, remove `[<>` `]`, slice 280. Dipakai `addPoolNote :395` (write) + `recallForPool :382` (read, re-sanitize last note). Kontrak: note = untrusted text (operator/LLM bisa inject adversarial), sanitize mencegah prompt injection via note. **Kontrak terpenuhi** — defense-in-depth (sanitize di write + re-sanitize di read). Cross-ref F5 UNTRUSTED DATA RULE prompt.js:93.

### E.9 — 3 isolation gate terpenuhi (kontrak kunci)
(a) `!isPaperMode()` recordPositionSnapshot `index.js:517` — paper positions NEVER snapshot ke pool-memory (would bias live screening if flipped live). (b) `!paper && !suspect_pnl` recordPoolDeploy `lessons.js:265` — paper/suspect closes NEVER touch pool-memory deploy history. (c) recallForPool reads stay (live history visible saat paper mode, tapi tak write). **Kontrak paper/live isolation terpenuhi di pool-memory**. Cross-ref F13/F19/F22 isolation contract chain. Live: 0 paper record (F19), 0 suspect (F22) → gate no-op sekarang, tapi kontrak jalan bila paper/suspect muncul.

### E.10 — counterfactual skip-review bounded 24h (kontrak, short horizon)
`getSkipReview :117` baca candidate-memory (24h retention, 8 snap/pool). Horizon review = 24h terakhir. CLAUDE.md sebut "Short horizon (candidate-memory's 24h retention)". Pool yang dilihat >24h lalu → snap pruned → tak masuk review. **Kontrak intentional** — counterfactual = recent reflection, bukan all-time. Bila operator mau long-horizon counterfactual → perlu store terpisah (archive candidate-memory sebelum prune). **Kontrak terpenuhi**. Cross-ref F25 briefing counterfactual section.

### E.11 — smart-wallets cache 5min per-process, tak persist (P4, restart reset)
`_cache Map :54` in-memory, `CACHE_TTL=5min :55`. Cache `getWalletPositions` per address. Tak persist ke disk → restart bot reset cache → re-fetch semua wallet. **Severity P4** — design (cache = perf optimization, tak critical). Bila 10 KOL tracked → 10 RPC call saat startup, 5min later re-fetch. Mitigation: `checkSmartWalletsOnPool` catch per-wallet → [].

### E.12 — profil-export backup 8 store (kontrak, backup surface)
`profil-export.js:21-23` include: state, lessons, poolMemory, candidateMemory, decisionLog, signalWeights, llmCost, smartWallets, tokenBlacklist, strategyLibrary, solBalanceHistory. **dev-blocklist TIDAK di list** (E.1 — pakai repoPath, tak paths.*). `signalWeights` + `llmCost` + `solBalanceHistory` di list tapi BUKAN di F23 scope (F21 signal-weights, F25 trackers). **Kontrak backup terpenuhi utk 8 store F23** (kecuali dev-blocklist). Cross-ref F29 profil-export.

---

## §F — Glosarium istilah fase

- **pool-memory.json** — per-pool deploy history + cooldown + snapshot. 116 pool/449 deploy/1.16MB. paths.poolMemoryPath.
- **recordPoolDeploy** — write path `pool-memory.js:104`. Push deploy + recalc + 3 cooldown trigger. Gated `!paper && !suspect_pnl`.
- **isPoolOnCooldown** — read gate `:227`. `cooldown_until > now`. screening.js:676 + dlmm.js:686.
- **isBaseMintOnCooldown** — read gate `:235`. `base_mint_cooldown_until > now` cross-pool. screening.js:681 + dlmm.js:694.
- **setPoolCooldown** — `:65` set `cooldown_until + cooldown_reason`. 4h low-yield / 12h OOR / N h repeat-fee.
- **setBaseMintCooldown** — `:72` set `base_mint_cooldown_until` ke SEMUA entry dgn base_mint sama.
- **isOorCloseReason** — `:42` cek "oor"/"out of range". Drives repeated-OOR trigger.
- **isAdjustedWinRateExcludedReason** — `:47` exclude OOR/pumped-above-range dari adjusted_win_rate.
- **isFeeGeneratingDeploy** — `:55` cek `fee_earned_pct >= repeatDeployCooldownMinFeeEarnedPct`. Drives repeat-fee trigger.
- **adjusted_win_rate** — win-rate exclude OOR/pumped-above-range `:163-167`. Fair metric (OOR = mekanis).
- **recordPositionSnapshot** — `:300` snapshot per management cycle. Last 48. Gated `!isPaperMode()`.
- **recallForPool** — `:346` 4-block (history/cooldown/trend/notes) → inject candidate block.
- **getDeployedPoolAddresses** — `:256` `Object.keys(load())` utk counterfactual skip-review.
- **candidate-memory.json** — per-candidate trend snap + sw count. 11 candidate/64 snap. Throwaway 24h.
- **MAX_SNAPSHOTS** — `:20` konstanta 8. Per-pool cap.
- **STALE_MS** — `:21` konstanta 24h. Prune pool not seen.
- **recordCandidateSnapshots** — `:51` push snap per candidate per cycle + prune stale. Shared experiment guard.
- **getCandidateMomentum** — `:87` pct change oldest→newest TVL/vol/mcap.
- **formatCandidateMomentum** — `:151` 1-line "tvl +X%, vol +Y%, mcap +Z% over N samples". Null bila <2.
- **recordSmartWalletCounts** — `:169` push sw_snaps per pool. Separate buffer.
- **getSmartWalletMomentum** — `:191` `{first, last, delta, samples}`.
- **formatSmartWalletMomentum** — `:205` 1-line "smart wallets entering/leaving: X→Y". Null bila delta=0.
- **getSkipReview** — `:117` counterfactual filter `!deployed` + mcap delta. `{skipped, dropped, gainers[]}`.
- **decision-log.json** — 100 decision audit trail. NEWEST first (unshift). 63KB.
- **MAX_DECISIONS** — `:6` konstanta 100. Cap audit trail.
- **appendDecision** — `:28` build obj + unshift + slice-100 + save. 5 dlmm + 8 index call site.
- **getDecisionSummary** — `:55` format 6 baris → inject prompt agent.js:229.
- **sanitize** — `:23` trim+slice 280 (500 reason, 120 pool_name, 140 risk, 180 rejected).
- **smart-wallets.json** — KOL/alpha tracker. ENOENT factory. paths.smartWalletsPath.
- **checkSmartWalletsOnPool** — `:57` cek wallet LP position di pool. Cache 5min. Filter `type==='lp'`.
- **SOLANA_PUBKEY_RE** — `:21` regex validate addSmartWallet.
- **token-blacklist.json** — mint blacklist. ENOENT factory. paths.tokenBlacklistPath.
- **isBlacklisted** — `:34` hard-filter screening.js.
- **dev-blocklist.json** — deployer blacklist. ENOENT factory. **repoPath langsung (E.1)**.
- **isDevBlocked** — `:28` hard-filter screening.js.
- **strategy-library.json** — LP strategy store. 5 strategy/active=null. paths.strategyLibraryPath.
- **getActiveStrategy** — `:136` return active strategy atau null. screening guide.
- **3 isolation gate** — `!isPaperMode()` recordPositionSnapshot, `!paper && !suspect_pnl` recordPoolDeploy, recallForPool reads stay.
- **profil-export** — `profil-export.js:21-23` backup 8 store path (minus dev-blocklist).
- **3 cooldown trigger** — low-yield 4h hardcoded, repeated-OOR config-driven, repeat-fee-generating config-driven + scope.
- **captureShadowSignals** — dlmm.js:55 freeze momentum/sw ke signal_snapshot (ephemeral 24h data).
- **shared experiment guard** — recordCandidateSnapshots jalan bila `candidateMomentum || smartWalletMomentum || counterfactualReview` ON.

---

## §G — Link fase lain (cross-ref)

- **F19**: recordPerformance → recordPoolDeploy cross-store dispatch lessons.js:265-289. F19 sediakan perf payload (17 fields), F23 honor `!paper && !suspect_pnl` gate. F19 Open-Q #13 (recordPoolDeploy throw → caught?) → F23 E.3 konfirmasi no visible try-catch (propagate ke close caller).
- **F22**: getModePerformance consumer-independent. F22 baca lessons.json.performance[], F23 baca pool-memory.json/candidate-memory.json/decision-log.json — store terpisah, tak overlap. RecallForPool inject candidate block paralel dgn getLessonsForPrompt inject prompt.
- **F15**: candidate-memory momentum/sw_momentum injection candidate block. F15 detail injection layer (index.js:931/957 formatMomentum line), F23 detail source (recordCandidateSnapshots/getCandidateMomentum/getSmartWalletMomentum). Shared experiment guard.
- **F8**: appendDecision close path dlmm.js 2383/2687 + post-close CONFIG_MAP. F8 detail close→recordPerformance→appendDecision chain, F23 detail appendDecision write path + getDecisionSummary prompt injection.
- **F9**: isPoolOnCooldown/isBaseMintOnCooldown pre-deploy gate dlmm.js:686/694. F9 detail deployPosition gate, F23 detail cooldown trigger source (3 trigger). captureShadowSignals dlmm.js:55 freeze momentum/sw ke signal_snapshot (F19 consumer).
- **F14**: screening hard-filter chain. F14 detail getTopCandidates, F23 detail isBlacklisted/isDevBlocked/isPoolOnCooldown/isBaseMintOnCooldown source + cooldown trigger logic.
- **F25**: briefing getSkipReview + getDeployedPoolAddresses counterfactual. F25 detail buildSkipReviewSection display, F23 detail getSkipReview source + bounded 24h horizon. briefing getDecisionSummary? UNKNOWN — F25 verifikasi.
- **F26**: config.management cooldown 5 key (oorCooldownTriggerCount/oorCooldownHours/repeatDeployCooldownEnabled/repeatDeployCooldownTriggerCount/repeatDeployCooldownHours/repeatDeployCooldownScope/repeatDeployCooldownMinFeeEarnedPct) + config.experiments 3 flag (candidateMomentum/smartWalletMomentum/counterfactualReview + counterfactualMinMcapGainPct). F26 detail config defaults, F23 detail consumer read.
- **F29**: paths.js dataDir resolve 6 path. F29 detail per-profil isolation, F23 detail 6 store path + dev-blocklist repoPath inkonsisten (E.1). profil-export backup 8 store (minus dev-blocklist).
- **F33**: smart-wallets KOL + hive sync leaf. F33 detail smart-wallets tracker + hive isolation, F23 detail checkSmartWalletsOnPool cache + filter.
- **F21**: signal-weights history slice-20 cap (similar pattern decision-log slice-100, E.4). F21 detail archive mechanism absence, F23 verifikasi decision-log juga no archive.
- **F17**: state.js trackPosition + recordClose. F17 detail state.json, F23 detail pool-memory.json (store terpisah, state=position registry, pool-memory=deploy history).

---

## §H — Open-Q (bawa ke fase lain)

1. **[F29]** dev-blocklist pakai repoPath langsung `:13`, BUKAN paths.* (E.1). Tidak masuk profil-export backup. Cross-profil leak intentional (global blacklist) atau bug? F29 paths resolve decision. Fix candidate: `paths.devBlocklistPath` + add profil-export list.
2. **[F19/F22]** load() parse-fail → save(fallback) overwrite destructive (E.2). Pattern identik di 7 store + lessons.js load. Bila transient parse-fail (power loss, fs race), riwayat 449 deploy bisa hilang. Fix candidate: backup `.bak` sebelum overwrite, atau load return null + caller skip save. F19/F22 load() chokepoint cross-cutting.
3. **[F8]** low-yield cooldown 4h hardcoded `pool-memory.js:175` (E.7). TIDAK di CONFIG_MAP executor.js. Operator must edit kode utk tune. Full-sync 6-surface gap? F8 full-sync checklist verifikasi.
4. **[F25]** briefing getDecisionSummary consumer? F23 sebut agent.js:229 consumer, briefing.js unknown. F25 verifikasi apakah briefing juga inject decision summary (e.g. "Recent decisions 24h" section).
5. **[F21/F23]** decision-log MAX_DECISIONS=100 cap, history overwrite (E.4). signal-weights history slice-20 similar. Archive mechanism absence (paths.js grep decision/signal archive = 0). F21/F23 cross-cutting — worth add archive path utk long-horizon audit? Design decision.
6. **[F26]** `repeatDeployCooldownScope` enum `pool/token/both` `pool-memory.js:201`. CONFIG_MAP terdaftar? F26 config-core verifikasi. Default "token" (config.management.repeatDeployCooldownScope).
7. **[F15]** `recordCandidateSnapshots` shared experiment guard — jalan bila salah satu 3 experiment ON. Verifikasi guard exact di index.js:793 (grep `if (config.experiments?.candidateMomentum || ...)`). F15 detail injection layer, F23 detail guard source.
8. **[F19]** `captureShadowSignals` dlmm.js:55 freeze momentum/sw ke signal_snapshot. F19 sebut signal_snapshot 15-field, momentum/sw = 2 field di situ. Verifikasi F19: momentum/sw field di PERFORMANCE_SIGNAL_FIELDS? Cek lessons.js:23-44 — TIDAK ada `momentum`/`sw` field di list. Shadow signals di-store di mana? F19/F23 cross-ref verifikasi.
9. **[F29]** profil-export backup 8 store (E.12). dev-blocklist TIDAK di list (E.1). signalWeights/llmCost/solBalanceHistory di list tapi di-scope F21/F25 (trackers). F29 detail profil-export surface.
10. **[F14]** screening.js:548/552/586/622/627/708 hard-filter chain — 6 call site isBlacklisted/isDevBlocked. Kenapa re-check di tahap berbeda? F14 detail funnel tahap. Bila sudah filter di tahap 1, kenapa re-check tahap 2/3? Defense-in-depth atau redundant? F14 verifikasi.
11. **[F26]** strategy-library active=null factory (E.5). Screening fallback `config.strategy.strategyLock`. Bila operator `setActiveStrategy(X)` lalu `removeStrategy(X)` → fallback `Object.keys(strategies)[0]` or null. Behavior documented? F26 config-core verifikasi fallback chain.
12. **[F25]** counterfactual skip-review bounded 24h (E.10). Bila operator mau long-horizon counterfactual (e.g. 7d review pool yang dilihat minggu lalu) → perlu archive candidate-memory sebelum prune. F25 briefing counterfactual scope decision.

---

*F23 selesai 2026-07-07. Read-only. Kode/config tak diubah saat menyusun.*
