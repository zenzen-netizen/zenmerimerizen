# Audit F6 — Tool Schema (Definitions)
> Read-only. Bukti `file:line`. UNKNOWN kalau tak pasti. Resume: buka file ini.
> Kedalaman: sedang — alasan: 47 deklarasi tool statis OpenAI-format. Density schema-definition + 1 master `update_config` 165-key. Mekanis-verifiable. Cross-cut role gating (F4) + executor dispatch (F7) + prompt injection (F5).
> Cross-ref: F4 (role filter + intent set), F7 (executor dispatch + safety checks), F8 (post-close update_config/CONFIG_MAP), F5 (POST-DEPLOY-INTERVAL wara-upd-config via SCREENER), F22 (narrative categories sync), F29 (preset snapshot via config).

## Ringkasan eksekutif (5 baris)
1. `tools` array (definitions.js:1-1173) ekspor 47 skema OpenAI-format, dikelompokkan 9 comment-section: SCREENING (8-124), DEPLOYMENT (126-212), MANAGEMENT (217-334), WALLET (339-387), LEARNING (392-474), SMART WALLET (479-559), TOKEN/STUDY (544-697), LESSON/POS-NOTE/STRATEGY (700-913), LESSON MGMT/PERF/TIME/NARRATIVE/POOL-MEM/BLACKLIST (916-1172). Alias `discover_pools` (8) tak masuk `getToolsForRole` MANAGER/SCREENER — hanya GENERAL intent `screen` (F4:56).
2. Master `update_config` (395-440) bawa deskripsi `VALID KEYS` 165-key list (400-412) masuk 7 sektor + GMGN config (persist ke `gmgn-config.json`) + strategy + hive/api + PnL fetcher + indicators + reports + learning + experiments. Param `key/value/changes/reason` — flat untuk 1 setting, `changes` objek utk multi. `required:[]` (semua optional; executor validasi key ada atau nol).
3. `deploy_position` (129-211) kompleks 18-param: HARD RULES (137-141) — never `curve`, bin_step 80-125, range floor 35 bins, single-side SOL `bins_above=0`. Optional `narrative_category` enum 8-bucket (200) sinkron dengan `NARRATIVE_CATEGORIES` lessons.js (comment 199 "KEEP IN SYNC"). Optional `conviction` enum (203-206) gate eksperimen `convictionSizing` (inert bila off). `strategy` enum hanya `bid_ask`/`spot` (`curve` di-omitted utk cegah di-pick, dipaksa reject di executor).
4. `close_position` (282-310) param: `position_address` (wajib), `skip_swap` bool utk user hold base token, `reason` string free-text (masuk pool memory + `classifyCloseRule` reports.js). `claim_fees` (260) `position_address` (wajib). `swap_token` (361) 3 param wajib. `get_my_positions` (238) + `get_wallet_balance` (342) + `discover_pools` + `get_active_bin` = no-required-param tools.
5. Subset verification (F4 vs F6 lintas-cek): `MANAGER_TOOLS` (F4:7 = 6 tool) `close/claim/swap/get_position_pnl/get_my_positions/get_wallet_balance` — semua ada (✓). `SCREENER_TOOLS` (F4:15 = 7 tool) `deploy_position/get_top_candidates/search_pools/get_time_profile/get_narrative_profile/get_wallet_balance/get_my_positions` — semua ada (✓). `INTENT_TOOLS` (F4:44-62) punya **dead tool name** `update_strategy` + `delete_strategy` di `strategy` set (F4:55) — tak ada di `tools` array maupun executor → `getToolsForRole` filter silent no-op (tak crash, tapi tool tak muncul utk GENERAL chat strategi intent). Bug F6 #1.

## Progress
- [x] Baca definitions.js full (1-1173) + grep semua `name` line
- [x] Cross-ref F4 (filter set list)
- [x] Cross-ref CLAUDE.md (experiments + racikan)
- [x] Verifikasi subset `MANAGER_TOOLS`/`SCREENER_TOOLS`/`INTENT_TOOLS` ada definisi
- [x] Deteksi dead names (`update_strategy`/`delete_strategy`) di INTENT_TOOLS.strategy
- [x] Tulis §A-§H
- [x] §0 Cara Kerja (Bahasa Awam) — retro-fit 2026-07-07

---

## §0. Cara Kerja (Bahasa Awam)

**Analogi** (dua sudut pandang sehari-hari)
- *Menu restoran yang ditempel di meja*: di tiap meja ada menu — pengunjung pilih "yang ini" lalu kasir eksekusi. Tiap item punya nama, deskripsi singkat, dan slot kosong isi. Menu ini bukan logika dapur; cuma daftar + format. Dapur = executor (F7); pemilih = LLM (F4); menu = F6 ini.
- *Formulir 47 jenis dokumen*: tiap dokumen punya field yang harus diisi (jumlah, alamat, alasan), tiap field punya format — `amount_y` harus angka positif, `conviction` harus salah satu dari `low/medium/high`, dst. Kalau LLM isi salah format, API akan reject sebelum eksekusi. Di bot, ini = schema validation — pertama barier anti-input-bad.

**Di bot, ini = `tools` array 47 schema OpenAI-format langsung dari `tools/definitions.js:1-1173`**: tiap schema = nama + deskripsi + parameter (type, required, enum). OpenRouter API lihat ini, LLM lihat ini pilih tool. Schema ini dikirim ke API tiap panggilan `agentLoop` (F4).

**Posisi fase ini di alur bot**
F6 = dokumentasi produk. Sebelum LLM (F4) boleh pilih tool, ia lihat menu yang diberikan. Menu datang dari F6 → difilter oleh role gating (SCREENER hanya lihat 7, MANAGER 6) → dikirim ke API. Tools disebut oleh LLM → eksekusi di `toolMap` executor (F7) → bukan definitions. F6 cuma deklarasi statis — tak ada logika eksekusi. Lapisan 3 (Mesin). Tanpa F6, LLM tak tahu tool apa tersedia → tak bisa pilih apa pun.

**Langkah kerja F6** (saat startup / saat F4 bangun permintaan)
1. Saat `agentLoop` (F4) siap minta, ambil `tools` array dari definitions.js.
2. Filter sesuai role: SCREENER → 7 tool, MANAGER → 6, GENERAL → intent-mapping subset atau fallback all-minus-mutators.
3. Sertakan `tools` ke body request `chat.completions.create` OpenRouter.
4. Saat LLM respon `tool_calls` → F4 / F7 baca `name` dan `args` → cocokkan dengan definisi schema (optional validation).
5. F7 (executor) ambil `toolMap[name]` dan eksekusi fungsi asli (deploy, close, claim, dll).

**Tool-tool kunci** (47 total, 9 group):
- **SCREENING** (8-124): `discover_pools`, `get_top_candidates`, `search_pools`, `get_active_bin`, dll — cari dan fetch kandidat kolam.
- **DEPLOYMENT** (126-212): `deploy_position` paling kompleks (18 param + HARD RULES + enum conviction/narrative_category/strategy). HARD RULES di schema = instruksi text ke LLM, bukan mekanis enforcement (mekanis di F7).
- **MANAGEMENT** (217-334): `close_position` (position_address wajib, skip_swap bool utk hold base), `claim_fees`, `get_position_pnl`, `set_position_note`, `get_my_positions`.
- **WALLET** (339-387): `swap_token` (3 param wajib), `get_wallet_balance`.
- **LEARNING/MEMORY** (392-913): `set_pool_memory` (per-pool history), `record_lesson`, `add_pool_note`, `save_strategy`, `set_position_note`, dll.
- **SMART WALLET** (479-559): `check_smart_wallets_on_pool`, `update_smart_wallets` (KOL/alpha wallet tracking).
- **TOKEN/STUDY** (544-697): `get_token_info`, `get_token_holders` (bundler detect), `get_token_narrative`, `study_top_lpers` (LPAgent API).
- **PROFILE** (916-1172): `get_time_profile`, `get_narrative_profile`, `get_pool_memory`, `get_decision_log`, `remove_blacklist`, `update_config` (master tool 165-key, 7 sektor + GMGN + strategy + hive + indicators + reports + learning + experiments).

**Master tool `update_config` (395-440)** — paling rawan. Bawa `VALID KEYS` deskripsi text 165-key. Param: `key` (string) + `value` (any) UNTUK 1 setting, atau `changes` (objek multi-key) UNTULK multi-setting. `required:[]` (semua optional; executor validasi key ada, nol → error). Full-sync 6-surface wajib (F8 kontrak) karena ini hanya 1 dari 6 perubahan config lengkap.

**Bug tercatat** — `INTENT_TOOLS` (F4) punya `update_strategy` + `delete_strategy` yang TIDAK ada definisi di F6 maupun executor. Saat GENERAL intent `strategy` → filter silent no-op (tak crash, tapi tool tak muncul ke LLM untuk operasi strategi). Bug siluman #1.

**Output F6**: array schema tools yang difilter per-role. Tiap tool: declaration + parameter format + HARD RULES text (instruksi ke LLM). Schema = dokumen statis — tak ada kode yang jalan di file ini.

**Kalau F6 rusak / diskip**
LLM tak punya menu → tak bisa pilih deploy/close/claim. Atau schema corrupt → API reject request → F4 tak dapat respon. Atau deskripsi `update_config` dengan 165-key list hilang → LLM coba set key yang tak valid → executor reject 1000x. Atau HARD RULES di schema `deploy_position` (cegah `curve`, bin_step 80-125, range floor 35 bins) hilang → LLM kira boleh pilih `curve` → reject di executor F7 (fail-safe backup), tapi ada waktu wasted. F6 = sambug pertama setelah LLM mikir, sebelum eksekusi.

**Istilah yang muncul di fase ini**
- **`tools` array** — ekspor 47 schema OpenAI-format dari definitions.js; tiap schema = `{name, description, parameters}`.
- **role-access** — tiap tool di-mapped lewat `MANAGER_TOOLS`/`SCREENER_TOOLS` (F4) atau intent-regex (GENERAL).
- **HARD RULES di schema** — instruksi text ke LLM di field `description` (bukan enforcement mekanis). Enforcement asli di F7 executor.
- **master tool `update_config`** — tool paling banyak valid-keys (165-key lintas 7 sektor). Param `key`+`value` atau `changes` objek multi-key.
- **`conviction` enum** — param `deploy_position` (low/medium/high). Inert bila `convictionSizing` OFF; latar belakang F27 eksperimen.
- **`narrative_category` enum** — 8-bucket tag (meme/DeFi/AI/dll) sinkron `NARRATIVE_CATEGORIES` lessons.js; pasif tag bila `narrativeProfileSignal` ON.
- **`strategy` enum** — `bid_ask` / `spot` saja. `curve` di-omitted dari enum supaya LLM tak bisa pilih; executor juga reject explicitly (defense in depth F7).
- **full-sync 6-surface** — bila tool param schema berubah (mis. tambah param), wajib sync ke definitions, executor toolMap, F4 role set, BOT_COMMANDS, settings guide, dll (kontrak CLAUDE.md).
- **dead tool name** — `update_strategy` / `delete_strategy` di INTENT_TOOLS tapi tak ada definisi; filter silent, tak crash → bug siluman.

*Lewati §0 kalau sudah paham. Isi teknis mulai §A.*

---

## §A. Daftar 47 tool (line → nama → required-arg → role-access)

| line | name | required | INTENT-access (F4) | MGR/SCR per F4 Set |
|---|---|---|---|---|
| 8 | discover_pools | — | screen | — |
| 50 | get_top_candidates | — | study/screen/deploy | SCREENER ✓ |
| 74 | get_pool_detail | pool_address | screen/study | — |
| 105 | get_active_bin | pool_address | deploy/study | — |
| 129 | deploy_position | pool_address | deploy | SCREENER ✓ |
| 220 | get_position_pnl | pool_address, position_address | positions/close/claim/performance | MANAGER ✓ |
| 238 | get_my_positions | — | positions/balance/deploy/close/claim/performance/study | MANAGER ✓ + SCREENER ✓ |
| 260 | claim_fees | position_address | claim | MANAGER ✓ |
| 282 | close_position | position_address | close | MANAGER ✓ |
| 316 | get_wallet_positions | wallet_address | positions/balance (per INTENT_TOOLS.positions 54) | — (KNOWN ISSUE CLAUDE.md) |
| 342 | get_wallet_balance | — | balance/swap/deploy/close/claim + banyak | MANAGER ✓ + SCREENER ✓ |
| 361 | swap_token | input_mint, output_mint, amount | swap/close | MANAGER ✓ |
| 395 | update_config | — (key/value/changes/reason semua optional) | config (GENERAL only via INTENT) + GENERAL_INTENT_ONLY_TOOLS (F4:23) | — (CHAT_CONFIRM, GENERAL intent-only) |
| 445 | self_update | — | selfupdate (GENERAL-only) | — |
| 456 | get_recent_decisions | — | decisions | — |
| 482 | add_smart_wallet | name, address | smartwallet (GENERAL-only) | — |
| 503 | remove_smart_wallet | address | smartwallet (GENERAL-only) | — |
| 518 | list_smart_wallets | — | smartwallet | — |
| 527 | check_smart_wallets_on_pool | pool_address (?) — verify executor | deploy | — (sengaja dibuang dari SCREENER_TOOLS F4 comment) |
| 544 | get_token_info | mint (?) — verify | screen/deploy | — |
| 563 | get_token_holders | mint (?) | screen/deploy | — |
| 588 | get_token_narrative | mint | screen/deploy | — |
| 617 | search_pools | query | screen/deploy | SCREENER ✓ (F4:15) |
| 645 | get_top_lpers | pool_address | study | — |
| 672 | study_top_lpers | pool_address | study | — |
| 703 | clear_lessons | mode | lessons (GENERAL-only) | — |
| 731 | set_position_note | position_address, instruction | (GENERAL-only mutator, F4:30) | — (KNOWN ISSUE: cosmetic /set command juga ada signal dari CLI) |
| 761 | add_lesson | rule | lessons (GENERAL-only) | — |
| 805 | add_strategy | id, name (+ nested) | strategy (GENERAL-only + INTENT dead-name issue) | — |
| 863 | list_strategies | — | strategy | — |
| 872 | get_strategy | id | strategy | — |
| 887 | set_active_strategy | id | strategy (GENERAL-only) | — |
| 904 | remove_strategy | id | strategy (GENERAL-only + INTENT dead-name issue) | — |
| 921 | list_lessons | — | lessons | — |
| 939 | pin_lesson | id | lessons (GENERAL-only) | — |
| 956 | unpin_lesson | id | lessons (GENERAL-only) | — |
| 973 | get_performance_history | — | performance | — |
| 998 | get_time_profile | — | (tak di INTENT — SCREENER Set langsung) | SCREENER ✓ |
| 1012 | get_narrative_profile | — | (SCREENER Set + GENERAL via intent?) | SCREENER ✓ |
| 1028 | get_pool_memory | pool_address | memory (GENERAL-only? — verify F7 WRITE_TOOLS) | — (dibuang SCREENER_F4 trim) |
| 1050 | add_pool_note | pool_address, note | memory (GENERAL-only mutator, F4:30) | — |
| 1078 | add_to_blacklist | mint, reason (+symbol optional) | blocklist (GENERAL-only, F4:26) | — |
| 1106 | remove_from_blacklist | mint | blocklist (GENERAL-only) | — |
| 1124 | list_blacklist | — | blocklist | — |
| 1135 | block_deployer | wallet (+label/reason optional) | blocklist (GENERAL-only, F4:28) | — |
| 1151 | unblock_deployer | wallet | blocklist (GENERAL-only) | — |
| 1165 | list_blocked_deployers | — | blocklist | — |

(Total: 47 tool. Verify: 8+124-2 + 211-126 خط Not math-exact sectioning; total via grep `^\s+name:` = 47.)

## §B. `update_config` deskripsi 165-key list (lines 399-412)

Key sectors dalam `description` tool `update_config` (definitions.js:399-412):

| Sektor | Line | Kunci sample | CONFIG_MAP (F8) sinkron? |
|---|---|---|---|
| Screening | 400 | screeningSource, minFeeActiveTvlRatio, minTvl, maxTvl, minVolume, minOrganic, minQuoteOrganic, minHolders, minMcap, maxMcap, minBinStep, maxBinStep, timeframe, category, screeningCategories, minTokenFeesSol, excludeHighSupplyConcentration, useDiscordSignals, discordSignalMode, avoidPvpSymbols, blockPvpSymbols, maxBotHoldersPct, maxTop10Pct, allowedLaunchpads, blockedLaunchpads, minTokenAgeHours, maxTokenAgeHours | verify F8 |
| GMGN (persist gmgn-config.json) | 401 | gmgnApiKey, gmgnInterval, gmgnOrderBy, gmgnFilters, gmgnPlatforms, gmgnMinMcap, gmgnMaxTop10HolderRate, gmgnMaxBundlerRate, gmgnRequireKol, gmgnMinKolCount, gmgnRequireBullishSupertrend, gmgnRejectAlreadyAtBottom, gmgn FeeSource (gmgn|jupiter) dst (~40 key) | verify F29 |
| Management | 402 | minClaimAmount, autoSwapAfterClaim, outOfRangeBinsToClose, outOfRangeWaitMinutes, oorCooldownTriggerCount, oorCooldownHours, repeatDeployCooldown* (5), minVolumeToRebalance, stopLossPct, takeProfitPct, takeProfitFeePct, trailingTakeProfit, trailingTriggerPct, trailingDropPct, pnlSanityMaxDiffPct, solMode, minSolToOpen, deployAmountSol, gasReserve, gasReserveAutoTune, gasReserveBufferDays, gasReserveFloorSol, positionSizePct, sizingMode (fixed|maximize), rentPerPositionSol, minAgeBeforeYieldCheck | verify F8 |
| Risk | 403 | maxPositions, maxDeployAmount | ✓ |
| Schedule | 404 | managementIntervalMin, screeningIntervalMin, healthCheckIntervalMin | ✓ (F2 cron restart) |
| Models | 405 | managementModel, screeningModel, generalModel (MUST "provider/slug"), temperature, maxTokens, generalMaxTokens, maxSteps | verify F8 |
| Strategy | 406 | strategy, strategyLock (default|spot|bid_ask|curve — "default"=flexible else locked), binsBelow, minBinsBelow, maxBinsBelow, defaultBinsBelow | verify F8 |
| Hive/API | 407 | hiveMindUrl, hiveMindApiKey, agentId, hiveMindPullMode, publicApiKey, agentMeridianApiUrl, lpAgentRelayEnabled | verify F33 |
| PnL fetcher/poller | 408 | pnlSource (rpc|meteora), pnlRpcUrl, pnlPollIntervalSec, pnlDepositCacheTtlSec | verify F11 |
| Indicators | 409 | chartIndicatorsEnabled, indicatorEntryPreset, indicatorExitPreset, indicatorExitEnabled, indicatorRejectAtBottom, rsiLength, indicatorIntervals, indicatorCandles, rsiOversold, rsiOverbought, requireAllIntervals, smiPdLookback, smiPaLookback, smiCrossWindow (3 smi hanya apply saat `indicatorEntryPreset=supertrend_plus_smi`) | verify F27 |
| Reports | 410 | learningReportEvery, learningReportTrendN | ✓ |
| Learning | 411 | evolveEnabled (true=auto-evolve 5-closes; false=FROZEN manual) | ✓ F20 |
| Experiments (default off) | 412 | exitLiquidityCheck, exitLiquidityMaxSlippagePct, marketRegimeGate, marketRegimeMaxDrop24hPct, candidateMomentum, narrativeProfileSignal, expectedYieldSignal, convictionSizing, convictionSizingMaxAdjustPct, counterfactualReview, counterfactualMinMcapGainPct, smartWalletMomentum, idleScreeningCooldown, idleScreeningCooldownMin, paperTrading (DRY-RUN-only virtual), usePaperHistoryWhenLive (LIVE-only opt-in) | ✓ F27 |

Kontrak: deskripsi eksplisit semua key valid. Reject bila user ketik key tak-listed (executor verify F8). Reason optional `logged as lesson when provided` (F19/F8).

## §C. Sinkron: siapa-panggil-siapa schema layer

| Pemanggil (file:line) | Dipanggil (F6 element) | Gate | Fail-mode |
|---|---|---|---|
| F4 agent.js:285 | `getToolsForRole(agentType, goal)` → `tools.filter(t => Set.has(t.function.name))` | role-set OR intent-set (F4:84-99) | subset-in-bigger → silent no-op untuk unknown name |
| F4 agent.js:148 | `VALID_TOOL_NAMES = new Set(tools.map(t => t.function.name))` | validate text-dump tools | unknown name → null whole dump (strict) |
| F4 agent.js:152 | `NO_SALVAGE_TOOLS = ONCHAIN_WRITE_TOOLS ∪ GENERAL_INTENT_ONLY_TOOLS` | block salvage writes/mutators | reject retry path |
| F7 executor.js (toolMap, dikonfirm nanti) | dispatch `executeTool(name, args)` | `name in toolMap` | unknown → error result |
| F8 executor CONFIG_MAP | `update_config` key → mutate `config.section.key` | section validator | unknown key → reject persist |
| F5 prompt SCREENER (prompt.js:89-92) | POST-DEPLOY-INTERVAL menyuruh LLM `update_config` | SCREENER_TOOLS tak punya `update_config` (F4:15) | perintah tak bisa dilaksanakan → Open-Q F5 #8 |
| lessons.js `NARRATIVE_CATEGORIES` (comment 199) | `deploy_position.narrative_category.enum` | "KEEP IN SYNC" | drift → enum reject stale value |

## §D. Logika kunci per tool

### `deploy_position` (definitions.js:129-211)
- **Apa**: buka posisi LP baru.
- **Param**: `pool_address` (wajib); 18 properti lain disconnect optional. Core size: `amount_y`/`amount_sol`/`amount_x`. Range: `bins_below` OR `downside_pct` utk human-friendly; `bins_above`/`upside_pct` utk upside (hanya dual-side). Metadata: `pool_name/base_mint/bin_step/base_fee/volatility/fee_tvl_ratio/organic_score/initial_value_usd` (simpan state.json + lessons perf). `strategy` enum `[bid_ask, spot]` — `curve` di-omitted (HARD RULE prompt line 137 "Never use curve"); executor juga reject (verify F7). `narrative_category`/`conviction` experiment gated.
- **HARD RULES di prompt description** (136-141): never curve; bin_step 80-125; range floor 35; single-side SOL bins_above=0 + upper pin to active bin.
- **Kontrak user-override** (132-134): user explicit always win.
- **Sinkron**: `narrative_category.enum` sync comment "KEEP IN SYNC with NARRATIVE_CATEGORIES in lessons.js" (199). Bila lessons.js NARRATIVE_CATEGORIES diubah, enum ini WAJIB update manual (tak ada lint). Drift risk.
- **Bukti**: 129-211.

### `update_config` (395-440)
- **Apa**: mutasi config (satu atau beberapa key sekaligus).
- **Param**: `key` (single), `value` (string tekstual — angka/bool diconvert executor), `changes` (obj multi), `reason` (opsional, jadi lesson).
- **Description schema**: 165-key list (399-412) sebagai petunjuk LLM key apa valid. Required `[]` (semua optional — executor validasi: bila `key` tanpa `value` reject; bila `changes` non-objek reject).
- **Sinkron CONFIG_MAP (F8)**: tiap key WAJIB punya entry di executor CONFIG_MAP sektor + validator; bila user kirim key tak-listed → reject; bila listed tapi tak di CONFIG_MAP → gaping (gap terdetect di F8).
- **Persistensi**: non-GMGN → `user-config.json`; GMGN → `gmgn-config.json` (397). Update live `config` + write-back + cron restart jika schedule/indicators/pnl polling berubah (verify F8/F28).
- **Kontrak racikan**: `promptNotes` TIDAK ada di list 400-412 → tak bisa `update_config` dari chat. File-only `presets/<name>.json` (CLAUDE.md:200). Konsisten.

### `close_position` (282-310)
- **Apa**: tutup posisi, tarik likuiditas, auto-swap default (default `skip_swap:false`).
- **Param**: `position_address` (wajib), `skip_swap` bool utk hold base, `reason` free-text (dipakai `classifyCloseRule` reports.js + pool memory + close notify).
- **Sinkron**: `reason` jadi sumber canonical close-rule label di trade stats (F24). LLM juga pakai utk audit `appendDecision` di F2.
- **Bukti**: 282-310.

### `get_top_candidates` (50-69)
- **Apa**: fetch kandidat pre-filtered — screeningSource `meteora` legacy OR `gmgn` GMGN-first (56-58).
- **Param**: `limit` (default 3 di desc, tapi F2:779 panggil `limit:10`). Eksekutor override default ini? Verify F7.
- **Sinkron F14**: `runScreeningCycle` (F2:779) panggil via tool LLM (SCREENER_TOOLS 50 included). Tool wrap `getTopCandidates()` screening.js (F14) → return `{candidates/pools, _error, filtered_examples, stage_counts, all_filtered}` shape (per Open-Q F2 #4). General can call via `screen`/`study` intent setelah user minta "carikan kandidat".

### `narrative_category` enum sync dengan lessons.js
- Lokasi: definitions.js:200 `["animal", "ai", "political", "celebrity", "meme", "culture", "tech_utility", "other"]`.
- Comment 199 "KEEP IN SYNC with NARRATIVE_CATEGORIES in lessons.js". Manual sync — bila lessons.js ubah (tambah "stablecoin"?), enum ini tak auto-update. Drift = deploy reject `narrative_category` unknown. Open-Q bawa cross-cek F22.

## §E. Temuan: subset drift, dead names, sync risk, gap

### E.1 — Bug: INTENT_TOOLS.strategy punya 2 dead names
- agent.js:55 `strategy` set reference `update_strategy` dan `delete_strategy`. Verify via grep — tak ada di `tools/definitions.js` maupun `tools/executor.js`.
- Akibat: GENERAL chat intent "strategy" → `getToolsForRole` filter `tools` ke yang match — names tak-ada tak crash, tapi silent no-op. User "ubah strategi X" via chat → tool `update_strategy` tak muncul; fallback alat yang ada (`set_active_strategy` only if `set`/`activate` dipakai — untuk DEL strategi `remove_strategy` ada utk delete).
- Mitigasi: hapus `update_strategy` dari set (update default dari set_active melalui identitas replacement), hapus `delete_strategy` (`remove_strategy` synonymous). Atau implement tool di definitions+executor bila memang perlu update-in-place.
- Bukti: agent.js:55, grep verify.

### E.2 — Removal `curve` dari `deploy_position.strategy` enum
- definitions.js:170 `enum: ["bid_ask","spot"]` — `curve` tak list. Prompt description (137) "Never use 'curve'". Strategi lock ENUM di line 406 masih list `default|spot|bid_ask|curve` utk `strategyLock` config key.
- Konsekuensi: `config.strategy.strategyLock="curve"` mekanis enforced (via config.js, verify F26); namun `update_config` general path tak allow `curve` untuk `strategy.strategy` (kalau user set `strategy="curve"` via config, akan diterima saat skip deploy_position enum filter)? `deploy_position` enum akan reject bila model pass `strategy:"curve"` — yang harusnya impossible sebab prompt melarang + strategyLock overrride. Defense-in-depth.
- Bukti: 170, 137, 406.

### E.3 — Narrative enum drift risk
- Enum di deploy_position (200) + `NARRATIVE_CATEGORIES` lessons.js (F22) duplikasi manual (comment 199 wajib).
- Cross-cek needed: lessons.js saat audit F22 — apakah enum ada yang drift sekarang?
- Bukti: 199-201.

### E.4 — `promptNotes` tak bisa di-update lewat LLM
- `update_config` list 165-key tak sebut `promptNotes` (399-412). CLAUDE.md:200 kontrak: free-text noise → file-only via `presets/<name>.json` → `/preset use` hot-load. Konsisten dengan kontrak racikan isolation.
- TAPI catatan: bila user minta "ubah racikan prompt agar SCREENER lebih greedy" via chat → LLM tak bisa `update_config`. User wajib edit file. UX gap tapi sadar-by-design.

### E.5 — `.learn_strategy.teacher discarded` dari SCREENER
- agent.js comment 8-14: 6 recon tools (get_active_bin/get_token_holders/get_token_narrative/get_token_info/check_smart_wallets_on_pool/get_pool_memory) sengaja tak di SCREENER_TOOLS Set utk cegah re-fetch (data sudah pre-loaded di candidate block F2:916-1026).
- Konsekuensi: bila LLM SCREENER rust kandidat block informative, tak bisa call tool tambahan. Trade-off: hemat ~8k token vs recovery.
- Verify F14: candidate block apakah memang cukup detail utk LLM decision tanpa re-fetch? Open-Q bawa F14.

### E.6 — `get_my_positions` dipakai dua-role (intersect)
- F4 MANAGER_TOOLS + SCREENER_TOOLS sama-sama punya `get_my_positions` + `get_wallet_balance`. Wajar — kedua role butuh hitung slot + cek SOL pre-deploy/pre-close (F2:485 force-refresh). Tak ada masalah.
- Bukti: F4:7,15; definitions 238, 342.

### E.7 — `get_wallet_positions` tak masuk role Set
- CLAUDE.md "Known Issues" beritahu: `get_wallet_positions` (316) hanya GENERAL sebab MANAGER_TOOLS+SCREENER_TOOLS tak sebut. Verified F4:7,15 → confirm tak termasuk. Bukan bug — fitur copy-wallet lain orang hanya konteks manual chat.
- Bukti: F4:7,15; 316.

### E.8 — `self_update` isolated (GENERAL INTENT-only)
- `self_update` (445) tak masuk INTENT_TOOLS.deployment/management; mapat di `INTENT_TOOLS.selfupdate` (F4:52) + `GENERAL_INTENT_ONLY_TOOLS` (F4:24). Arti: GENERAL chat "update yourself" → tool offer; SCREENER/MANAGER cron tak bisa self-update otomatis (anti self-pwn saat AI autonomously restart). Defensive.

### E.9 — `reason` param pelajaran berbeda lintas tool
- `close_position.reason` (303) → pool memory + reports `classifyCloseRule`.
- `update_config.reason` (432) → "logged as a lesson when provided" (414) (F19 capture).
- `add_to_blacklist.reason` (1094) → catatan reason blocklist.
- Konsisten pola: `reason` free-text utk audit. Mereport utk GLM reliability konservatif (jangan galak categorize free-text tanpa `classifyCloseRule`).

### E.10 — `get_top_candidates.limit` description default 3 vs caller panggil 10
- Desc line 64: "Default 3". F2:779 caller panggil `getTopCandidates({limit:10})` (override). Konsisten — executor menghormati caller. Bila user chat "find 5 candidates" → limit 5. Bila call kosong → 3 default. Aman.

### E.11 — deduplikasi operator `--` sectioning style
- Comment header `════` (8 section). `─` (3 sub-section "Strategy Library" 800, "Lesson Management" 916, "Performance History" 968, "Time-of-day Profile" 993, "Pool Memory" 1023, "Token Blacklist" 1073). Staf kosmetik; tak effect schema.

## §F. Glosarium fase

- **tools array**: 47 OpenAI-format function schema, eksport dari definitions.js.
- **VALID_TOOL_NAMES**: Set string nama tool (F4:148) utk validate text-dump.
- **NO_SALVAGE_TOOLS**: on-chain write + mutators (F4:152) tak bisa salvage dari text.
- **CONFIG_MAP**: tabel mapping `update_config` key → config.section + validator (executor.js, verify F8).
- **NARRATIVE_CATEGORIES**: 8-bucket enum di lessons.js + sync comment di `deploy_position.narrative_category` (line 199).
- **single-side SOL contract**: `amount_x=0 + bins_above=0`; upper pin ke active bin.
- **strategy enum**: `[bid_ask, spot]` di `deploy_position`; `curve` di-omitted utk cegah pick.
- **strategyLock**: config key enum `[default, spot, bid_ask, curve]` — "default"=flexible, selain itu lock mekanis menimpa `deploy_position.strategy`.
- **INTENT-only subset (GENERAL)**: 18 tool (F4:23 `GENERAL_INTENT_ONLY_TOOLS`) tak join fallback "all tools" — access hanya via intent match.
- **discover_pools**: screening utama utk general; tak masuk SCREENER cron (replaced oleh `get_top_candidates`).
- **promptNotes**: config key racikan — tak masuk `update_config` list; file-only.
- **reason-param**: free-text audit reason utk close/update_config/blacklist → audit log + pool memory + lesson.
- **limit default mismatch**: `get_top_candidates.limit` desc default 3 vs caller hardcode 10 — executor override.

## §G. Open-Q (bawa ke F7/F8/F14/F22/F26)

1. **[F7]** Tool dispatch `toolMap` — apakah 47 tool di-define semua di executor? Bila kurang/lebih → subset mismatch. Verify count + names sinkron dengan F6.
2. **[F8]** `update_config` CONFIG_MAP 165-key — apakah ada key di line 400-412 yang TAK terdaftar di CONFIG_MAP (orphan deskripsi)? Atau CONFIG_MAP punya key tak disebut deskripsi (undocumented in schema)? Lint cross-both-directions.
3. **[F8]** `update_config.key="maxBinStep"` persist — apakah `minBinStep<=maxBinStep` cross-validate di executor? Schema list-artifact tak validate.
4. **[F14]** `get_top_candidates.limit=10` di F2:779 vs desc default 3 — apakah screening.js `getTopCandidates({limit:10})` diterima param `limit` atau hardcode-override? Verify F14 signature.
5. **[F22]** `NARRATIVE_CATEGORIES` lessons.js — apakah 8 enum sama persis dengan definitions.js:200? Drift akan reject deploy `narrative_category="other1"`. Cross-ref F22.
6. **[F26]** `deploy_position.strategy.enum=["bid_ask","spot"]` vs `config.strategy.strategy` default user-config — bila user-config `strategy="curve"` (legacy/typo), executor akan reject preset config? Verify executor `resolveStrategy` path (F7/F9).
7. **[F7 死角]** `INTENT_TOOLS.strategy` dead names `update_strategy`/`delete_strategy` — apakah ada di executor `toolMap`? Bila ya → silent crash (tool tak di schema LLM takkan call, dead toolMap harmless). Bila tak → safe. Bukan urgent tapi cleanup.
8. **[F8 死角]** `update_config` schema deskripsi eksplisit `мииnAgeBeforeYieldCheck` (402) — cross-ref F3 #4 inkonsistensi age-floor rule 5 hardcode 60 vs state.js F18 `??60`. Bila user set 120 via update_config → config dimuat, F18 hormati, rule 5 (`getDeterministicCloseRule` index.js:1504) hardcoded 60 tak hormati. Sinkron-config bug. Cross-F3+F8.
9. **[F8 死角]** `indicatorEntryPreset` enum tak di-tegas di deskripsi (line 409 hanya list key). 8 preset `supertrend_break/rsi_reversal/bollinger_reversion/rsi_plus_supertrend/supertrend_or_rsi/bb_plus_rsi/fibo_reclaim/fibo_reject` cek F15 — apakah ada validator enum di executor CONFIG_MAP indicatorEntryPreset? Schema tak enforce. Cross-F8+F15.
10. **[F33]** `lpAgentRelayEnabled` (line 407) — flag tolak PnL-poll recheck (`shouldUsePnlRecheck` F2:528). Verify F33 hivemind/LP agent relay; sinkron dengan F18 peak-confirm.

## §H. Cross-ref fase lain

- **F4**: filter subset per-role/intersect intent; `VALID_TOOL_NAMES` validate text-dump; `NO_SALVAGE_TOOLS`Ah moon block tool name.
- **F5**: prompt `deploy_position.narrative_category` + `conviction` lintas eksperimen gate; strategyLock line 150-152 prompt sinkron dengan schema strategy + strategyLock config.
- **F7**: tool execution dispatch — schema di sini, fn di executor; safety checks deploy_position (single-side/bins-floor/bin-step) menambah HARD rule di prompt dengan mekanis kode.
- **F8**: `update_config` key list (165-key) ↔ CONFIG_MAP table; `update_config` di `CHAT_CONFIRM_TOOLS` (F4:21) interaktif wajib konfirmasi.
- **F11**: `get_my_positions` return shape; `get_position_pnl`.
- **F14**: `get_top_candidates` + `discover_pools` eksekusi `getTopCandidates()`/fetch Meteora API.
- **F15**: `get_token_holders` bundler detect + indicator preset recalc.
- **F17**: `set_position_note` mutasi state.json; `add_pool_note` → pool-memory.json.
- **F19/F22**: `add_lesson`/`pin_lesson`/`clear_lessons`/`get_time_profile`/`get_narrative_profile`/`get_performance_history` sambung lessons.js.
- **F23**: `get_pool_memory`/`add_pool_note` → pool-memory; `check_smart_wallets_on_pool` → smart-wallets.json.
- **F26**: `deploy_position.strategy.enum` vs `config.strategy.strategyLock` mekanis override (config.js clamp).
- **F27**: eksperimen flags UI list (line 412) ↔ CONFIG_MAP GRUP16 + F27 config.js experiments normalize.
- **F29**: preset snapshot (full `user-config.json`) bawa semua key — `presets/<name>.json` tak tulis schema, hanya data.
- **F30**: `/set <n>` command mengubah note kosong via CLI; chat path pakai `set_position_note` tool. Sinkron double.
- **F33**: `self_update` safe guard via `GENERAL_INTENT_ONLY_TOOLS`; hivemind flag di `update_config` line 407.

*F6 selesai 2026-07-06. Read-only. Kode/config tak diubah saat menyusun.*