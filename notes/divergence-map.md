# PETA DIVERGENSI — Fork zen vs Upstream (yunus-0x/meridian)

> Disusun: 2026-06-13 · Mode: BACA-SAJA (repo tidak diubah; upstream di-clone ke `/tmp/meridian-upstream`)
> Tujuan: dasar fitur pelabelan config "Origin Dev Version" vs "Add by zen" di `/config` Telegram.
> Label: **[DEV]** = asli upstream · **[ZEN]** = tambahan/ubahan zen · **[DEV+ZEN-TUNED]** = key dari dev, nilai default diubah zen · **[UNKNOWN]** = tak bisa dipastikan.

## Ringkasan (10 baris)

1. Titik banding: fork zen di commit `fc63a43` (2026-06-12) vs upstream `600aac6` (2026-06-12). Histori git nyambung, TAPI upstream pernah me-rewrite historinya → merge-base resmi jatuh jauh ke Maret; perbandingan ini **berbasis isi file hari ini**, bukan silsilah commit.
2. Dari ~165 key config yang bisa di-set lewat `/setcfg` di versi zen, **89 key asli [DEV]** dan **76 key tambahan [ZEN]** — zen tidak menghapus satu pun key dev.
3. Tambahan zen terbesar: **seluruh blok 🧪 experiments (GRUP 16)**, **pipeline GMGN screening lengkap** (~40 key `gmgn*`), **sistem Racikan/preset** (`promptNotes`, `activeSetup`, `/preset`), **strategyLock**, **adaptive screening**, **SMI indicator**, **paper trading**, dan seluruh mesin **reports/cost-tracking** (reports.js, pnl-tracker, gas-tracker, llm-cost-tracker).
4. Yang sering dikira custom tapi ternyata **asli [DEV]**: `repeatDeployCooldown*` (masuk upstream 2026-04-20), `darwin*` (signal-weights, 2026-04-02), `chartIndicators` dasar (2026-04-17), `trailingTakeProfit`, blok `pnl*` + `gmgnFeeSource` (upstream 2026-06-12, di-cherry-pick zen).
5. HiveMind & agentmeridian.xyz **confirmed [DEV]**: URL default `api.agentmeridian.xyz` ada di config.js KEDUA sisi; `tools/agent-meridian.js` malah hanya ada di upstream.
6. GMGN itu dua hal beda: **sumber data fee** (`gmgnFeeSource`, gate minTokenFeesSol) = [DEV]; **screening source penuh GMGN** (`screeningSource: "gmgn"`, discoverGmgnPools, aturan KOL/sniper/rug) = [ZEN] (gmgn.js upstream cuma 113 baris vs zen 754 baris).
7. Hanya **1 key [DEV+ZEN-TUNED]** di level default kode: `gmgnRequestDelayMs` (upstream 2500 ms → zen 350 ms). Default lain yang dipakai bersama identik.
8. File yang ada di upstream tapi TIDAK di zen: `discord-listener/` (aplikasi pendengar sinyal Discord), `tools/agent-meridian.js`, `deployer-blacklist.json`, `utils/number.js`, folder `.claude/` upstream — semuanya dari lineage upstream yang sudah di-rewrite, tidak pernah ada di lineage zen (bukan "dihapus zen").
9. Perintah Telegram `/report`, `/guide`, `/preset` = [ZEN]; `/config /settings /status /wallet /positions /close /set /help` = [DEV] (diperluas zen).
10. Catatan penting untuk pelabelan: label "origin" ini soal **asal KEY**, bukan nilai runtime — nilai di user-config.json live (mis. mcap 150k, organic 70) adalah tuning racikan zen di atas key apa pun, dan itu urusan Racikan, bukan label origin.

---

## Bab 1 — Titik Banding

| Hal | Nilai | Bukti |
|---|---|---|
| Fork zen (HEAD) | `fc63a43` — 2026-06-12, branch `experimental` | `git log` repo ini |
| Upstream (HEAD clone) | `600aac6` — 2026-06-12 02:01 WIB, "fix: replace flood pnl_tick log…" | clone `/tmp/meridian-upstream`, depth 200 (229 commit terjangkau) |
| Remote | origin = `zenzen-netizen/zenmerimerizen`; remote `upstream` = `yunus-0x/meridian` sudah terpasang sejak lama (tidak saya ubah) | `git remote -v` |
| Merge-base | `291e30c` (2026-03-20) — jauh lebih tua dari merge 9 Juni | `git merge-base` |
| Kenapa merge-base tua? | Commit upstream yang dulu di-merge zen 9 Juni (`1e053a2`, 2026-06-07) **bukan ancestor** HEAD upstream sekarang → upstream me-rewrite/force-push historinya | `git merge-base --is-ancestor` gagal |
| Konsekuensi | Silsilah commit tidak bisa dipakai untuk atribusi → **banding berbasis isi file** (HEAD zen vs HEAD upstream hari ini). Untuk fitur kunci, tanggal masuknya ke upstream dicek via `git log -S` di clone (sahih dalam jangkauan depth-200, sampai ± akhir Maret 2026). | — |

Istilah: *merge-base* = titik nenek-moyang bersama dua cabang git; *rewrite history* = dev upstream menyusun ulang daftar commit-nya sehingga "silsilah" lama tak berlaku lagi.

---

## Bab 2 — Divergensi File

### 2a. File HANYA di zen → [ZEN] (18 file)

| File | Fungsi (bahasa sederhana) |
|---|---|
| `reports.js` | Mesin analitik trade: profit factor, drawdown, expectancy "shrunk" (ranking adil), breakdown per-strategi/sesi/narasi/close-rule |
| `pnl-tracker.js` | Buku kas PnL terealisasi + net (dikurangi gas & biaya LLM nyata) |
| `gas-tracker.js`, `llm-cost-tracker.js`, `openrouter-usage.js`, `sol-tracker.js` | Pencatat biaya nyata: gas on-chain, biaya LLM per model, saldo OpenRouter, harga SOL |
| `preset-manager.js`, `preset.js` | Sistem Racikan: simpan/muat snapshot config (`presets/*.json`), CLI + `/preset` |
| `paper-trading.js` | Simulasi posisi virtual saat DRY_RUN (latihan tanpa uang nyata) |
| `candidate-memory.js` | Memori kandidat screening antar-siklus (momentum, smart-wallet momentum, skip-review) |
| `tools/smi.js` | Indikator SMI dihitung sendiri dari candle (preset `supertrend_plus_smi`) |
| `guide.js` + `SETTINGS-GUIDE.md` | `/guide` — buku panduan setting yang dibaca live oleh bot |
| `MAINZEN-V2-JOURNAL.md`, `MAINZEN-V3-WORKFLOW.md` | Jurnal/workflow racikan zen |
| `docs/hivemind-reference.md`, `docs/hivemind-summary.md` | Catatan riset zen tentang HiveMind (dokumentasi, bukan kode) |
| `test-screening.js` | Skrip uji screening tambahan |

### 2b. File HANYA di upstream → [DEV] (tidak ada di zen)

`discord-listener/` (aplikasi terpisah pendengar sinyal Discord), `tools/agent-meridian.js` (modul helper HTTP ke api.agentmeridian.xyz), `deployer-blacklist.json`, `utils/number.js`, `.claude/agents/*` + `.claude/commands/*` + `.claude/settings.json` (integrasi Claude Code milik dev).

**Catatan arah:** file-file ini ada di lineage upstream PASCA-rewrite (discord-listener tercatat 2026-03-25, agent-meridian 2026-04-17 di histori baru), tapi TIDAK ada di snapshot upstream yang zen merge 9 Juni (`git ls-tree 1e053a2` kosong untuk path ini) dan tidak pernah ada di lineage HEAD zen. Jadi statusnya: **fitur dev yang belum/tidak pernah diambil zen**, bukan "dihapus zen". Kait config-nya (`useDiscordSignals`, `discordSignalMode`) tetap ada di kedua sisi.

### 2c. File di KEDUANYA yang berubah signifikan

Diurut dari selisih terbesar (± baris berubah):

| File | ± baris | Apa yang beda (ringkas) |
|---|---|---|
| `index.js` | ~1541 | Zen menambah: handler `/report` `/guide` `/preset`, menu `/settings` halaman experiments/indicators/presets, `/config` 16 grup, adaptive screening gate, market-regime gate, milestone report, idle-screening cooldown, integrasi candidate-memory |
| `setup.js` | ~1028 | Wizard setup berbeda banyak (upstream merombak setup-nya sendiri; zen punya profil wizard sendiri) |
| `tools/dlmm.js` | ~944 | Zen: cabang paper-trading di deploy/positions/PnL/close, price-excursion tracker, stamping `active_setup`/`narrative_category` |
| `tools/gmgn.js` | 113 → 754 baris | Upstream: cuma fee-source (`getGmgnTokenFees`). Zen: + `discoverGmgnPools` (pipeline screening GMGN penuh: filter KOL/sniper/rug/bundler + indicator rules) |
| `tools/executor.js` | ~411 | Zen: CONFIG_MAP 89→165 key, conviction sizing, exit-liquidity gate, strategyLock enforcement |
| `briefing.js` | ~406 | Basis briefing harian = [DEV]; zen menambah briefing mingguan/bulanan (`generatePeriodicBriefing`), seksi biaya, skip-review, auto-pin |
| `lessons.js` | ~340 | Zen: profil jam (WIB session), profil narasi, `getModePerformance` (isolasi paper vs live), `getAllPerformance` |
| `config.js` | ~309 | Zen: blok experiments, reports, gmgn diperluas, racikan (promptNotes/activeSetup/profile), strategyLock, adaptive screening, gasReserve auto-tune, `applyConvictionSizing`, `persistConfigChange` |
| `cli.js`, `agent.js` | ~296/~220 | Zen: salvage tool-call minimax (anti JSON-dump), penyesuaian role |
| `telegram.js` | ~177 | Zen: `pinMessage`/`unpinMessage`/`escapeHtml` (untuk briefing pin) |
| `state.js` | ~168 | Zen: dedup briefing periodik, milestone, `ensureDeployedAt`, `recordRebalance` |
| `tools/screening.js` | ~142 | Zen: `formatYieldToMe`, multi-kategori merge, entry-gate indikator paralel |
| `tools/chart-indicators.js` | ~81 | Basis [DEV]; zen + `fetchChartIndicatorsForMint` export, `rejectAlreadyAtBottom`, preset SMI |
| `strategy-library.js` | ~86 | Basis [DEV]; perubahan zen kecil (tanpa export baru — penanganan lock/active) |
| `prompt.js`, `tools/definitions.js` | ~36/~94 | Zen: blok RACIKAN RULES, prompt-line eksperimen; 2 tool LLM baru (`get_time_profile`, `get_narrative_profile`) |
| `hivemind.js`, `decision-log.js`, `signal-weights.js`, `signal-tracker.js` | 2–10 | Nyaris identik (beda export/logging sepele) → subsistem ini [DEV] |
| `user-config.example.json` | 8 | Hampir sama; zen + `screeningSource`, − `gmgnApiKey` (pindah ke `gmgn-config.json`); upstream example-nya sendiri belum mencantumkan `repeatDeployCooldown*` padahal config.js-nya punya |

*Keberadaan key rahasia: kedua sisi sama-sama menampung `gmgnApiKey`/`walletKey`/`llmApiKey` dsb. sebagai KEY (nilai tidak diperiksa/dicetak).*

---

## Bab 3 — Divergensi Config Key (dasar pelabelan)

Sumber bukti: `config.js` (default) + `CONFIG_MAP` di `tools/executor.js` (daftar key `/setcfg`) kedua sisi, dibandingkan otomatis. **Zen: 165 key di CONFIG_MAP; upstream: 89. Irisan 89 = [DEV]; 76 tambahan = [ZEN]; tidak ada key upstream yang dihilangkan zen.** Bukti baku per baris: "kedua sisi" = key ada di config.js/CONFIG_MAP zen DAN upstream; "zen saja" = tidak ada di upstream.

### 3a. Key [DEV] — ada di kedua sisi, default identik

| Key | Grup | Asal | Bukti |
|---|---|---|---|
| `minFeeActiveTvlRatio`, `minTvl`, `maxTvl`, `minVolume`, `minOrganic`, `minQuoteOrganic`, `minHolders`, `minMcap`, `maxMcap`, `minBinStep`, `maxBinStep`, `timeframe`, `category`, `minTokenFeesSol`, `maxTop10Pct`, `maxBotHoldersPct`, `excludeHighSupplyConcentration`, `allowedLaunchpads`, `blockedLaunchpads`, `minTokenAgeHours`, `maxTokenAgeHours`, `avoidPvpSymbols`, `blockPvpSymbols` | screening | [DEV] | kedua config.js, default sama |
| `useDiscordSignals`, `discordSignalMode` | screening (sinyal Discord) | [DEV] | kedua sisi; aplikasi listener-nya malah cuma di upstream |
| `maxPositions`, `maxDeployAmount` | risk | [DEV] | kedua sisi |
| `deployAmountSol`, `gasReserve`, `positionSizePct`, `minSolToOpen`, `minClaimAmount`, `autoSwapAfterClaim`, `outOfRangeWaitMinutes`, `outOfRangeBinsToClose`, `minVolumeToRebalance`, `minFeePerTvl24h`, `minAgeBeforeYieldCheck`, `solMode` | management | [DEV] | kedua sisi |
| `oorCooldownTriggerCount`, `oorCooldownHours` | management (cooldown OOR) | [DEV] | kedua sisi |
| `repeatDeployCooldownEnabled/-TriggerCount/-Hours/-Scope/-MinFeeEarnedPct` | management (cooldown re-deploy) | [DEV] | kedua sisi; masuk upstream commit `8c0aa17` 2026-04-20 |
| `stopLossPct` (alias lama `emergencyPriceDropPct`), `takeProfitPct`, `takeProfitFeePct` | management (SL/TP) | [DEV] | kedua sisi, baris identik |
| `trailingTakeProfit`, `trailingTriggerPct`, `trailingDropPct` | management (trailing TP) | [DEV] | kedua sisi; upstream sejak `bdf0289` 2026-04-02 |
| `strategy`, `minBinsBelow`, `maxBinsBelow`, `defaultBinsBelow`, `binsBelow` | strategy | [DEV] | kedua sisi |
| `managementIntervalMin`, `screeningIntervalMin`, `healthCheckIntervalMin` | schedule | [DEV] | kedua sisi |
| `temperature`, `maxTokens`, `maxSteps`, `managementModel`, `screeningModel`, `generalModel`, `llmModel`, `llmBaseUrl`, `llmApiKey` | llm | [DEV] | kedua sisi |
| `darwinEnabled`, `darwinMinSamples`, `darwinRecalcEvery`, `darwinWindowDays`, `darwinBoost`, `darwinDecay`, `darwinFloor`, `darwinCeiling` | darwin (bobot sinyal adaptif) | [DEV] | kedua sisi; upstream sejak 2026-04-02 |
| `hiveMindUrl`, `hiveMindApiKey`, `hiveMindPullMode`, `agentId`, `agentMeridianApiUrl`, `publicApiKey`, `lpAgentRelayEnabled` | lainnya (HiveMind/infra Meridian) | [DEV] | kedua sisi; default URL `api.agentmeridian.xyz` di kedua config.js |
| `pnlRpcUrl`, `pnlSource`, `pnlPollIntervalSec`, `pnlDepositCacheTtlSec`, `pnlSanityMaxDiffPct` | lainnya (poller PnL) | [DEV] | kedua sisi; upstream commit `7c83972` 2026-06-12, di-cherry-pick zen (memo merge 2026-06-12) |
| `gmgnApiKey`, `gmgnBaseUrl`, `gmgnFeeSource`, `gmgnMaxRetries` | lainnya (GMGN fee source) | [DEV] | kedua sisi (upstream 2026-06-12) |
| `rpcUrl`, `walletKey`, `dryRun`, `telegramChatId` | lainnya (infra dasar) | [DEV] | kedua config.js (level file user-config, bukan /setcfg) |
| chartIndicators: `enabled`, `entryPreset`, `exitPreset`, `intervals`, `candles`, `rsiLength`, `rsiOversold`, `rsiOverbought`, `requireAllIntervals` (di /setcfg: `chartIndicatorsEnabled`, `indicatorEntryPreset`, `indicatorExitPreset`, `indicatorIntervals`, `indicatorCandles`, dst.) | indicators | [DEV] | blok `indicators` upstream config.js memuat persis 9 key ini; upstream sejak `1a63b29` 2026-04-17 |

### 3b. Key [DEV+ZEN-TUNED] — key dev, default diubah zen

| Key | Grup | Nilai upstream → zen | Bukti |
|---|---|---|---|
| `gmgnRequestDelayMs` | lainnya (GMGN) | default **2500 ms → 350 ms** | upstream config.js:206 vs zen config.js (blok gmgn) |

Satu-satunya perbedaan default di level kode. (Nilai-nilai runtime di `user-config.json` live yang zen ubah lewat racikan — mis. mcap/organic/binStep — adalah dimensi terpisah, lihat Bab 5.)

### 3c. Key [ZEN] — tidak ada di upstream (76 key /setcfg + key level file)

| Key | Grup | Asal | Bukti |
|---|---|---|---|
| `screeningSource` (meteora/gmgn), `screeningCategories` (multi-kategori) | screening | [ZEN] | zen saja |
| `gasReserveAutoTune`, `gasReserveBufferDays`, `gasReserveFloorSol` | management | [ZEN] | zen saja |
| `strategyLock` | strategy | [ZEN] | zen saja |
| `adaptiveScreening`, `maxScreeningIntervalMin` | schedule | [ZEN] | zen saja |
| `generalMaxTokens` | llm | [ZEN] | zen saja |
| `learningReportEvery`, `learningReportTrendN` | lainnya (reports) | [ZEN] | blok `reports` tidak ada di upstream |
| `preset` (profil wizard), `activeSetup` (racikan aktif), `promptNotes` (aturan prompt bawaan racikan) | lainnya (identitas/racikan; level file, sengaja bukan /setcfg) | [ZEN] | zen saja |
| `exitLiquidityCheck`, `exitLiquidityMaxSlippagePct` | experiments | [ZEN] | blok `experiments` tidak ada di upstream |
| `marketRegimeGate`, `marketRegimeMaxDrop24hPct` | experiments | [ZEN] | idem |
| `candidateMomentum`, `smartWalletMomentum`, `expectedYieldSignal`, `narrativeProfileSignal` | experiments | [ZEN] | idem |
| `convictionSizing`, `convictionSizingMaxAdjustPct` | experiments | [ZEN] | idem |
| `counterfactualReview`, `counterfactualMinMcapGainPct` | experiments | [ZEN] | idem |
| `idleScreeningCooldown`, `idleScreeningCooldownMin` | experiments | [ZEN] | idem |
| `paperTrading`, `usePaperHistoryWhenLive` | experiments | [ZEN] | idem |
| indicators tambahan: `indicatorExitEnabled` (`exitEnabled`), `indicatorRejectAtBottom` (`rejectAlreadyAtBottom`), `smiPdLookback`, `smiPaLookback`, `smiCrossWindow` | indicators | [ZEN] | tidak ada di blok indicators upstream |
| GMGN screening (~35 key): `gmgnInterval`, `gmgnOrderBy`, `gmgnDirection`, `gmgnLimit`, `gmgnEnrichLimit`, `gmgnHoldersLimit`, `gmgnKlineResolution`, `gmgnKlineLookbackMinutes`, `gmgnFilters`, `gmgnPlatforms`, `gmgnMinMcap`, `gmgnMaxMcap`, `gmgnMinTvl`, `gmgnMinVolume`, `gmgnMinHolders`, `gmgnMinTokenAgeHours`, `gmgnMaxTokenAgeHours`, `gmgnMinSmartDegenCount`, `gmgnRequireKol`, `gmgnMinKolCount`, `gmgnMaxRugRatio`, `gmgnMaxTop10HolderRate`, `gmgnMaxBundlerRate`, `gmgnMaxRatTraderRate`, `gmgnMaxFreshWalletRate`, `gmgnMaxDevTeamHoldRate`, `gmgnPreferredKolMinHoldPct`, `gmgnPreferredKolNames`, `gmgnDumpKolMinHoldPct`, `gmgnDumpKolNames`, `gmgnMaxBotDegenRate`, `gmgnMaxSniperCount`, `gmgnMaxSniperHoldRate`, `gmgnMinTotalFeeSol`, `gmgnAthFilterPct`, `gmgnIndicatorFilter`, `gmgnIndicatorInterval`, `gmgnRequireBullishSt`, `gmgnRejectAtBottom`, `gmgnRequireAboveSt`, `gmgnMinRsi`, `gmgnMaxRsi`, `gmgnRequireBbPosition` | screening-gmgn | [ZEN] | blok gmgn upstream hanya 5 key (apiKey/baseUrl/feeSource/requestDelayMs/maxRetries); semua key ini tak ada di upstream |

Catatan kecil 3c: nilai preset indikator `supertrend_plus_smi` adalah **NILAI** buatan zen di atas key `entryPreset` yang [DEV] — lihat "ambigu" di Bab 5.

---

## Bab 4 — Divergensi Fitur / Subsistem

| Subsistem | Asal | Bukti |
|---|---|---|
| **Racikan / preset** (preset-manager.js, preset.js, `/preset`, `promptNotes`, `activeSetup`, Profil-vs-Racikan) | **[ZEN]** | kedua file TIDAK ada di upstream; key-nya tak dikenal upstream |
| **strategyLock** (kunci paksa spot/bid_ask/curve) | **[ZEN]** | key + enforcement di executor.js zen saja |
| **Darwin / signal-weights** (bobot sinyal adaptif) | **[DEV]** | `signal-weights.js` + `signal-tracker.js` ada di upstream, isi nyaris identik (beda export sepele); key `darwin*` di kedua config.js sejak 2026-04-02 |
| **decision-log** (jurnal keputusan agent) | **[DEV]** | `decision-log.js` ada di upstream, beda hanya logging kecil |
| **Blok experiments 🧪 GRUP 16** (exit-liquidity, market-regime, momentum, conviction, counterfactual, idle-cooldown, paper, dst.) | **[ZEN]** | blok `experiments` + candidate-memory.js + paper-trading.js TIDAK ada di upstream |
| **chartIndicators dasar** (preset entry/exit server-side: supertrend, RSI, Bollinger, fibo; API `/chart-indicators/`) | **[DEV]** | blok `indicators` + `tools/chart-indicators.js` ada di upstream (masuk 2026-04-17) |
| **Ekstensi indikator zen**: wiring `exitEnabled` (gate EXIT), port `rejectAlreadyAtBottom` ke jalur meteora, **SMI client-side** (`tools/smi.js`, preset `supertrend_plus_smi`) | **[ZEN]** | key & file tidak ada di upstream |
| **reports.js** (profit factor, shrunk expectancy, ranking adil, breakdown by-setup/close-rule) | **[ZEN]** | file tidak ada di upstream |
| **Briefing harian** | **[DEV]** dasar, diperluas zen | `briefing.js` ada di upstream; zen + `generatePeriodicBriefing` (mingguan/bulanan), seksi biaya, skip-review, auto-pin |
| **paper-trading** (posisi virtual dry-run) | **[ZEN]** | `paper-trading.js` tidak ada di upstream |
| **pnl-tracker** (PnL terealisasi & net setelah gas+LLM) | **[ZEN]** | file tidak ada di upstream |
| **Poller PnL berbasis RPC** (config `pnl*`, tick 3 dtk) | **[DEV]** | upstream commit `7c83972` 2026-06-12; zen cherry-pick (memo 2026-06-12) |
| **gas / LLM cost tracker** (gas-tracker.js, llm-cost-tracker.js, openrouter-usage.js, sol-tracker.js) | **[ZEN]** | keempat file tidak ada di upstream |
| **Discord listener** (aplikasi pendengar sinyal) | **[DEV]** | folder `discord-listener/` HANYA di upstream; zen cuma punya kait confignya (`useDiscordSignals`) |
| **HiveMind / agentmeridian.xyz** (kecerdasan kolektif + API Meridian) | **[DEV]** — confirmed bagian proyek asli | `hivemind.js` di kedua sisi (beda 2 baris); default URL `api.agentmeridian.xyz` hardcoded di KEDUA config.js; `tools/agent-meridian.js` malah hanya di upstream |
| **GMGN screening penuh** (`screeningSource: "gmgn"`, discoverGmgnPools, aturan KOL/sniper/rug/bundler, gmgn-config.json sebagai file config terpisah) | **[ZEN]** | gmgn.js upstream 113 baris (fee saja, export `getGmgnTokenFees`); zen 754 baris (+`discoverGmgnPools`) |
| **GMGN fee source** (`gmgnFeeSource` untuk gate minTokenFeesSol) | **[DEV]** | ada di upstream sejak 2026-06-12 |
| **Profil jam (WIB) + adaptive screening + profil narasi** (lessons.js: getHourlyProfile/getNarrativeProfile; tool LLM `get_time_profile`, `get_narrative_profile`) | **[ZEN]** | export & tool tidak ada di upstream |
| **Telegram**: `/report`, `/guide`, `/preset` | **[ZEN]** | string handler tidak ada di index.js upstream (hit 0) |
| **Telegram**: `/config /settings /status /wallet /positions /close /set /help` | **[DEV]** dasar, diperluas zen | handler ada di kedua index.js; zen menambah grup/halaman/isi |
| **Salvage tool-call** (anti JSON-dump model minimax di agent.js) | **[ZEN]** | perilaku ditambahkan zen (commit 51dd020 di fork; agent.js upstream tak punya) |

---

## Bab 5 — Catatan Pelabelan (usulan untuk fitur `/config`)

Usulan 2 lapis, mengikuti grup `/config` yang sudah ada (16 grup): setiap key diberi **badge asal**, lalu di tampilan bisa difilter/dikelompokkan.

**Lapis 1 — "⚙️ Origin Dev Version"** (89 key /setcfg + infra), sub-grup per relevansi:
- Screening dasar (mcap/tvl/volume/organic/holders/binStep/timeframe/category/launchpad/usia token/PvP)
- Management & risk (sizing, gasReserve, OOR, cooldown OOR + repeat-deploy, SL/TP/trailing, rebalance)
- Strategy & bins (strategy, min/max/defaultBinsBelow)
- Schedule (3 interval dasar)
- LLM (model per-role, temperature, maxTokens, maxSteps)
- Darwin (8 key `darwin*`)
- Indicators dasar (9 key chartIndicators)
- Infra/Meridian (hiveMind*, agentMeridian*, lpAgentRelay, pnl*, gmgn fee-source, rpc/wallet/dryRun/telegram)

**Lapis 2 — "🧩 Add by zen"** (76 key /setcfg + key level file), sub-grup:
- Screening+ : `screeningSource`, `screeningCategories`
- Screening-GMGN (≈40 key `gmgn*` selain 5 key fee-source dev)
- Management+ : `gasReserveAutoTune/-BufferDays/-FloorSol`
- Strategy+ : `strategyLock`
- Schedule+ : `adaptiveScreening`, `maxScreeningIntervalMin`
- LLM+ : `generalMaxTokens`
- Indicators+ : `indicatorExitEnabled`, `indicatorRejectAtBottom`, `smi*`
- Reports : `learningReportEvery`, `learningReportTrendN`
- 🧪 Experiments (15 key GRUP 16) — sudah punya rumah sendiri, badge saja
- Racikan/identitas (level file): `preset`, `activeSetup`, `promptNotes`

**Key/kasus ambigu — putuskan saat implementasi:**
1. `exitPreset` — key-nya [DEV], tapi di zen baru BERFUNGSI bila `indicatorExitEnabled` ([ZEN]) dinyalakan. Usul: badge [DEV] dengan catatan "diaktifkan fitur zen". (Apakah upstream sendiri memakai exitPreset-nya = UNKNOWN.)
2. Nilai `entryPreset = supertrend_plus_smi` — key [DEV], nilai preset [ZEN]. Label origin menempel ke KEY; mungkin perlu catatan kecil khusus nilai SMI.
3. `gmgnRequestDelayMs` — satu-satunya [DEV+ZEN-TUNED] (2500→350). Perlu badge ketiga atau cukup catatan.
4. `stopLossPct` vs alias lama `emergencyPriceDropPct` — keduanya [DEV]; tampilkan satu saja (stopLossPct) agar tidak membingungkan.
5. `useDiscordSignals`/`discordSignalMode` — key [DEV] tapi aplikasi listener-nya tidak ada di instalasi zen → fitur efektif mati. Usul: badge [DEV] + catatan "butuh discord-listener (tidak terpasang)".
6. Blok `pnl*` + `gmgnFeeSource` — [DEV] tapi baru masuk via cherry-pick zen 2026-06-12; secara pengalaman pengguna terasa "baru dari zen". Tetap [DEV] (asal kode dari upstream).
7. **Penting**: label origin ≠ nilai. Nilai live yang zen tuning lewat racikan (mainzen_v2 dsb.) tetap tampil sebagai nilai berjalan pada key apa pun; jangan campur konsep "asal key" dengan "siapa yang menyetel nilainya" (yang kedua sudah ditangani sistem Racikan/`activeSetup`).

---

## Bab UNKNOWN / Keterbatasan

1. **Histori upstream di-rewrite** → atribusi berbasis silsilah commit tidak mungkin; semua label di peta ini berbasis ISI file per 2026-06-12/13. Tanggal "masuk upstream" diambil dari histori upstream PASCA-rewrite (clone depth 200, menjangkau ± akhir Maret 2026) — tanggal asli pra-rewrite bisa berbeda.
2. **Arah pengaruh tidak selalu terbukti**: untuk fitur yang ada di kedua sisi (mis. `repeatDeployCooldown`, chartIndicators) bukti menunjukkan upstream memilikinya sejak April (sebelum merge zen Juni), jadi [DEV] kuat. Tapi secara teori dev upstream bisa saja terinspirasi fork publik zen — tidak bisa dibuktikan dari git; tidak memengaruhi label presence-based ini.
3. **Catatan memori lama yang terkoreksi**: memo sesi 2026-06-09 menyebut "cooldown" sebagai custom zen — data hari ini menunjukkan `repeatDeployCooldown*` ada di upstream (commit 2026-04-20) → label benar = [DEV].
4. `setup.js` berbeda ~1000 baris; mana bagian wizard yang [DEV] vs [ZEN] di dalamnya tidak dipecah rinci (tidak relevan untuk label /config) → sebagian UNKNOWN.
5. Apakah upstream benar-benar MEMAKAI `exitPreset`-nya (atau dead config seperti dulu di zen) = UNKNOWN (perlu baca alur index.js upstream lebih dalam).
6. Perbandingan memakai upstream HEAD `600aac6` (2026-06-12). Upstream terus berkembang — peta ini snapshot, perlu diperbarui bila ada merge upstream berikutnya.
7. Nilai key rahasia (API key, wallet) TIDAK dibandingkan — hanya keberadaan key, sesuai aturan tugas.
