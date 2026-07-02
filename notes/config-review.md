# AUDIT CONFIG (R-review) + REVIEW AUTO-TUNE (R-auto)

> Disusun: 2026-06-13 · Mode: **BACA-SAJA** (tidak ada kode/config diubah; cuma file laporan ini ditulis).
> Pembaca: pemilik non-programmer + penasihat AI tanpa akses kode.
> Membangun di atas `notes/onboarding-dossier.md` (disebut "dossier") & `notes/divergence-map.md` — tidak menduplikasi, mengonfirmasi & melengkapi.
> Label bukti: **[CONFIRMED]** = dibuktikan dari kode · **[INFERRED]** = kesimpulan kuat dari pola kode/wiring, tak di-grep satu-satu · **[UNKNOWN]** = belum bisa dipastikan (+ cara cek).
> Istilah singkat: *key* = satu setelan · *wired* = nyambung ke logika · *consumer* = kode yang membaca setelan itu · */setcfg* = perintah ubah setelan via Telegram/chat · *CONFIG_MAP* = daftar resmi key yang boleh di-`/setcfg` (`tools/executor.js:319-498`).

---

## RINGKASAN EKSEKUTIF

**Cakupan.** Permukaan `/setcfg` = **165 key** persis (CONFIG_MAP, `tools/executor.js:319-498` — dihitung otomatis). Catatan penting: "165 key /setcfg" ini **bukan himpunan yang sama** dengan "165 baris /config" dari R1 — beda anggota (lihat catatan di bawah). Mayoritas (~150) **sehat & wired**. Yang patut dibenahi/diputuskan: **belasan**, terangkum di bawah & di Bagian 3.

**Kesehatan (angka).**
- **MATI (key ada, tak terhubung ke logika):** 5 →
  `healthCheckIntervalMin`, `minSolToOpen`, `darwinRecalcEvery` (3 ini settable/tampil tapi pemicunya konstanta/hardcode), `maxBundlePct`, `athFilterPct` (sisi screening — orphan, tak dibaca config.js).
- **DOBEL (alias tumpang-tindih):** 2 alias di CONFIG_MAP (`takeProfitFeePct`→`takeProfitPct`, `binsBelow`→`maxBinsBelow`) + 3 fallback legacy di config.js (jinak).
- **MENCURIGAKAN:** `screeningModel = "minimax_m2_5"` (format model id rusak — live di `user-config.json:73`); 8 key `darwin*` **tampil di /config tapi TAK ada di CONFIG_MAP** (tak bisa di-`/setcfg`, cuma via edit file/wizard); `useDiscordSignals`/`discordSignalMode` (listener Discord tak terpasang → jalur mati).
- Sisanya **sehat**.

**Headline AUTO-TUNE (yang penting buat v2.1).** Ada **3 mekanisme yang MENULIS BALIK ke `user-config.json`** (bisa menimpa tuning manual):
1. **`gasReserveAutoTune`** → menimpa `gasReserve`. **AKTIF SEKARANG** (live=`true`). Jalan **harian** (saat briefing). `[CONFIRMED index.js:293,303]`
2. **`update_config` (agent/LLM + manual)** → bisa menimpa **key apa pun** di CONFIG_MAP; menstempel `_lastAgentTune`. Live file terakhir ditulis **hari ini 09:29** (`user-config.json:107`). Prompt SCREENER menyuruh LLM meng-`update_config` `managementIntervalMin` per volatilitas. `[CONFIRMED executor.js:685, prompt.js:90-92]`
3. **`evolveThresholds`** → menimpa `minFeeActiveTvlRatio` & `minOrganic` tiap **5 close live**. `[CONFIRMED lessons.js:253-255,491]`

**Yang AMAN (tidak menulis config-file):** Darwin/`recalculateWeights` (cuma ke `signal-weights.json`), `adaptiveScreening` (cuma gerbang cron), `counterfactualReview` (cuma laporan), `repeatDeployCooldown` (cuma gerbang runtime baca `state.json`). Detail di Bagian 2.

**Catatan "165 vs 165".** R1 menghitung 165 *baris tampilan* `/config`; audit ini menghitung 165 *key /setcfg* (CONFIG_MAP). Keduanya kebetulan 165 tapi isinya beda: `/config` menampilkan `darwin*` (8), `maxBundlePct`, `athFilterPct`(screening), `status` (display) yang **tak ada** di CONFIG_MAP; sebaliknya CONFIG_MAP punya banyak key GMGN legacy (`gmgnLimit`, `gmgnEnrichLimit`, `gmgnRequestDelayMs`, `gmgnHoldersLimit`, `gmgnKlineResolution`, `gmgnKlineLookbackMinutes`, `gmgnApiKey`, `gmgnBaseUrl`, `gmgnMaxRetries`, `gmgnMaxTop10HolderRate`) + alias (`takeProfitFeePct`, `binsBelow`) yang **tak ditampilkan** di `/config`. `[CONFIRMED]`

---

## BAGIAN 1 — AUDIT TIAP KEY (R-review)

Kolom: **key** | **sub-cluster** | **beranak** (induk/anak/–) | **core?** | **fungsi (awam)** | **default** (config.js) | **live** (user-config.json; "=def" = pakai default; "(racikan)" = di-set racikan) | **status** | **saran** | **bukti**.
Default semua dari `config.js` (baris di kolom bukti). Status sehat = wired & wajar.

### 1A — Screening: filter pool dasar  (sub-cluster: screening-core)

| key | sub-cluster | beranak | core? | fungsi | default | live | status | saran | bukti |
|---|---|---|---|---|---|---|---|---|---|
| screeningSource | source | – | ✅ | meteora vs gmgn (sumber kandidat) | meteora | =def | sehat | keep | config.js:115 |
| timeframe | window | – | ✅ | jendela waktu metrik pool | 5m | 30m (racikan) | sehat | keep | config.js:128 |
| category | window | induk | ✅ | kategori daftar Meteora | trending | =def | sehat | keep | config.js:129 |
| screeningCategories | window | anak | ✅ | multi-kategori (merge) | null | [trending,top,new] (racikan) | sehat | keep | config.js:132 |
| minTvl | size | – | ✅ | TVL minimum pool | 10000 | =def | sehat | keep | config.js:118 |
| maxTvl | size | – | ✅ | TVL maksimum pool | 150000 | 1500000 (racikan) | sehat | keep | config.js:119 |
| minVolume | size | – | ✅ | volume minimum | 500 | 1000 (racikan) | sehat | keep | config.js:120 |
| minMcap | size | – | ✅ | market-cap minimum | 150000 | =def | sehat | keep | config.js:124 |
| maxMcap | size | – | ✅ | market-cap maksimum | 10000000 | =def | sehat | keep | config.js:125 |
| minHolders | size | – | ✅ | jumlah holder minimum | 500 | =def | sehat | keep | config.js:123 |
| minOrganic | quality | – | ✅ | skor "organik" minimum (anti-bot) | 60 | 70 (racikan/auto-evolve) | sehat | keep — **bisa ditimpa evolveThresholds** | config.js:121; lessons.js:472 |
| minQuoteOrganic | quality | – | – | organik sisi quote | 60 | =def | sehat | keep | config.js:122 |
| minFeeActiveTvlRatio | quality | – | ✅ | fee/active-TVL minimum (yield) | 0.05 | 0.1 (racikan/auto-evolve) | sehat | keep — **bisa ditimpa evolveThresholds** | config.js:117; lessons.js:430 |
| minTokenFeesSol | quality | – | – | total fee SOL token (anti-bundle) | 30 | =def | sehat | keep | config.js:133 |
| minBinStep | bin | anak | ✅ | bin-step minimum pool | 80 | =def | sehat | keep | config.js:126 |
| maxBinStep | bin | anak | ✅ | bin-step maksimum pool | 125 | =def | sehat | keep | config.js:127 |
| minTokenAgeHours | age | – | – | umur token minimum (jam) | null | 3 (racikan) | sehat | keep | config.js:142 |
| maxTokenAgeHours | age | – | – | umur token maksimum (jam) | null | 720 (racikan) | sehat | keep | config.js:143 |
| excludeHighSupplyConcentration | safety | – | – | buang token konsentrasi suplai tinggi | true | =def | sehat | keep | config.js:116 |
| maxBotHoldersPct | safety | – | – | % holder bot maks (audit Jupiter) | 30 | 33 (racikan) | sehat | keep | config.js:138 |
| maxTop10Pct | safety | – | – | konsentrasi top-10 maks | 60 | =def | sehat | keep | config.js:139 |
| avoidPvpSymbols | safety | – | – | hindari simbol kembar (PVP) | true | =def | sehat | keep | config.js:136 |
| blockPvpSymbols | safety | – | – | hard-block PVP sebelum LLM | false | =def | sehat | keep | config.js:137 |
| allowedLaunchpads | safety | – | – | allow-list launchpad ([]=semua) | [] | =def | sehat | keep | config.js:140 |
| blockedLaunchpads | safety | – | – | block-list launchpad | [] | =def | sehat | keep | config.js:141 |
| useDiscordSignals | discord | induk | – | pakai sumber sinyal Discord | false | =def | **mencurigakan** (listener Discord TAK terpasang → jalur mati/OFF) | tanya-owner / keep OFF | config.js:134; peta §2b |
| discordSignalMode | discord | anak | – | merge\|only sinyal Discord | merge | =def | **mencurigakan** (idem; inert selama useDiscordSignals OFF) | tanya-owner | config.js:135 |

### 1B — Management & Risk: modal, exit, OOR, claim, cooldown  (sub-cluster: mgmt)

| key | sub-cluster | beranak | core? | fungsi | default | live | status | saran | bukti |
|---|---|---|---|---|---|---|---|---|---|
| maxPositions | risk | – | ✅ | maks posisi terbuka serentak | 3 | =def | sehat | keep | config.js:109 |
| maxDeployAmount | risk | – | ✅ | plafon SOL per deploy | 50 | 10 (racikan) | sehat | keep | config.js:110 |
| deployAmountSol | sizing | induk | ✅ | lantai SOL per deploy | 0.5 | 0.2 (racikan) | sehat | keep | config.js:222 |
| positionSizePct | sizing | anak | ✅ | % saldo dipakai (compounding) | 0.35 | 0.33 (racikan) | sehat | keep | config.js:230 |
| minSolToOpen | sizing | – | ✅ | (niat) saldo min buka posisi | 0.55 | 0.15 (racikan) | **MATI** — tak ada consumer; gerbang buka pakai `deployAmountSol+gasReserve` | perbaiki/hapus, tanya-owner | config.js:221; index.js:582 (no ref) |
| gasReserve | gas | induk | ✅ | cadangan SOL untuk gas | 0.2 | 0.03 (racikan/**auto-tune**) | sehat | keep — **ditimpa gasReserveAutoTune** | config.js:223; index.js:293 |
| gasReserveAutoTune | gas | anak | – | auto right-size gasReserve dari gas nyata | false | true (racikan) | sehat (AKTIF, menulis config) | keep/awasi (Bagian 2) | config.js:227; index.js:280 |
| gasReserveBufferDays | gas | anak | – | hari runway gas yang dijaga | 14 | =def | sehat | keep | config.js:228 |
| gasReserveFloorSol | gas | anak | – | lantai gasReserve auto-tune | 0.03 | =def | sehat | keep | config.js:229 |
| stopLossPct | exit | – | ✅ | tutup paksa saat rugi % | -50 | -12 (racikan) | sehat | keep | config.js:217 |
| takeProfitPct | exit | – | ✅ | tutup saat profit % | 5 | 4 (racikan) | sehat | keep | config.js:218 |
| trailingTakeProfit | exit-trail | induk | ✅ | aktifkan trailing TP | true | =def | sehat | keep | config.js:232 |
| trailingTriggerPct | exit-trail | anak | ✅ | aktif trailing di profit X% | 3 | 1.5 (racikan) | sehat | keep | config.js:233 |
| trailingDropPct | exit-trail | anak | ✅ | tutup bila turun X% dari puncak | 1.5 | 1 (racikan) | sehat | keep | config.js:234 |
| pnlSanityMaxDiffPct | exit | – | – | abaikan tick PnL bila selisih > X% | 5 | =def | sehat | keep | config.js:235 |
| outOfRangeBinsToClose | oor | – | – | jarak bin OOR untuk tutup | 10 | =def | sehat | keep | config.js:207 |
| outOfRangeWaitMinutes | oor | – | ✅ | tunggu X menit OOR sebelum tutup | 30 | =def | sehat | keep | config.js:208 |
| oorCooldownTriggerCount | oor-cooldown | induk | – | OOR Nx → cooldown | 3 | =def | sehat | keep | config.js:209 |
| oorCooldownHours | oor-cooldown | anak | – | lama cooldown OOR (jam) | 12 | =def | sehat | keep | config.js:210 |
| minFeePerTvl24h | yield | induk | ✅ | lantai yield 24h sebelum tutup | 7 | 6 (racikan) | sehat | keep | config.js:219 |
| minAgeBeforeYieldCheck | yield | anak | – | menit sebelum yield-check aktif | 60 | 90 (racikan) | sehat | keep | config.js:220 |
| minVolumeToRebalance | yield | – | – | volume min untuk rebalance | 1000 | =def | sehat | keep | config.js:216 |
| minClaimAmount | claim | induk | – | klaim fee minimum ($) | 5 | =def | sehat | keep | config.js:205 |
| autoSwapAfterClaim | claim | anak | – | auto-swap token sisa ke SOL | false | =def | sehat | keep | config.js:206 |
| repeatDeployCooldownEnabled | redeploy-cd | induk | – | aktif cooldown re-deploy | true | =def | sehat | keep | config.js:211 |
| repeatDeployCooldownTriggerCount | redeploy-cd | anak | – | re-deploy Nx → cooldown | 3 | =def | sehat | keep | config.js:212 |
| repeatDeployCooldownHours | redeploy-cd | anak | – | lama cooldown re-deploy (jam) | 12 | 6 (racikan) | sehat | keep | config.js:213 |
| repeatDeployCooldownScope | redeploy-cd | anak | – | pool\|token\|both | token | =def | sehat | keep | config.js:214 |
| repeatDeployCooldownMinFeeEarnedPct | redeploy-cd | anak | – | fee% minimal agar tak kena cooldown | 0 | =def | sehat | keep | config.js:215 |
| solMode | display | – | – | laporkan PnL/saldo dalam SOL | false | =def | sehat | keep | config.js:237 |

### 1C — Strategy & Bins  (sub-cluster: strategy)

| key | sub-cluster | beranak | core? | fungsi | default | live | status | saran | bukti |
|---|---|---|---|---|---|---|---|---|---|
| strategy | strategy | induk | ✅ | bentuk sebaran modal | bid_ask | =def | sehat | keep | config.js:242 |
| strategyLock | strategy | anak | ✅ | kunci paksa bentuk strategi | default | bid_ask (racikan) | sehat | keep | config.js:246 |
| minBinsBelow | bins | induk | ✅ | lantai lebar range (bin) | 35 | =def | sehat | keep | config.js:247 |
| maxBinsBelow | bins | anak | ✅ | atap lebar range (bin) | 69 | =def | sehat | keep | config.js:248 |
| defaultBinsBelow | bins | anak | – | lebar range default | =max | 69 (racikan) | sehat | keep | config.js:249 |
| binsBelow | bins | (alias) | – | alias legacy → maxBinsBelow | — | (absen) | **DOBEL** (alias `maxBinsBelow`) | hapus/tanya-owner | executor.js:398 |

### 1D — Schedule  (sub-cluster: schedule)

| key | sub-cluster | beranak | core? | fungsi | default | live | status | saran | bukti |
|---|---|---|---|---|---|---|---|---|---|
| managementIntervalMin | schedule | – | ✅ | interval siklus manajemen (mnt) | 10 | =def | sehat (**LLM bisa ubah via update_config**) | keep | config.js:254; prompt.js:90 |
| screeningIntervalMin | schedule | induk | ✅ | interval/lantai siklus screening | 30 | =def | sehat | keep | config.js:255 |
| adaptiveScreening | schedule | anak | – | regangkan interval di sesi lemah | false | =def | sehat (tak menulis config) | keep | config.js:261; index.js:1060 |
| maxScreeningIntervalMin | schedule | anak | – | atap interval adaptif | 90 | =def | sehat | keep | config.js:262 |
| healthCheckIntervalMin | schedule | – | – | (niat) interval health-check | 60 | =def | **MATI** — cron health di-hardcode `"0 * * * *"` (per jam) | perbaiki/hapus, tanya-owner | config.js:256; index.js:1087 |

### 1E — LLM  (sub-cluster: llm)

| key | sub-cluster | beranak | core? | fungsi | default | live | status | saran | bukti |
|---|---|---|---|---|---|---|---|---|---|
| managementModel | model | – | ✅ | model AI siklus manajemen | openrouter/healer-alpha | minimax/minimax-m2.5 (racikan) | sehat | keep | config.js:271 |
| screeningModel | model | – | ✅ | model AI siklus screening | openrouter/hunter-alpha | **`minimax_m2_5`** (racikan) | **MENCURIGAKAN** — format id rusak (underscore, tanpa provider/slug) | **tanya-owner/perbaiki** | config.js:272; user-config.json:73 |
| generalModel | model | – | – | model AI chat umum | openrouter/healer-alpha | google/gemini-2.5-flash (racikan) | sehat | keep | config.js:273 |
| temperature | gen | – | – | kreativitas model | 0.373 | 0.69 (racikan) | sehat | keep | config.js:267 |
| maxTokens | gen | – | – | batas token keluaran (screen/manage) | 4096 | =def | sehat | keep | config.js:268 |
| generalMaxTokens | gen | – | – | batas token chat umum | 8192 | =def | sehat | keep | config.js:269 |
| maxSteps | gen | – | – | maks langkah ReAct per siklus | 20 | =def | sehat | keep | config.js:270 |

### 1F — Darwin (bobot sinyal)  (sub-cluster: darwin) — ⚠️ semua TAK ada di CONFIG_MAP

| key | sub-cluster | beranak | core? | fungsi | default | live | status | saran | bukti |
|---|---|---|---|---|---|---|---|---|---|
| darwinEnabled | darwin | induk | – | aktifkan bobot sinyal adaptif | true | =def | sehat — **tapi tak bisa /setcfg** (display+file only) | tanya-owner (daftarkan ke CONFIG_MAP?) | config.js:278; lessons.js:262 |
| darwinWindowDays | darwin | anak | – | jendela hari rolling | 60 | =def | sehat (idem tak /setcfg) | tanya-owner | config.js:279; signal-weights.js:101 |
| darwinRecalcEvery | darwin | anak | – | (niat) recalc tiap N close | 5 | =def | **MATI** — pemicu nyata konstanta `MIN_EVOLVE_POSITIONS=5` | hapus/perbaiki | config.js:280; lessons.js:19,253 |
| darwinBoost | darwin | anak | – | faktor naik bobot sinyal menang | 1.05 | =def | sehat (idem tak /setcfg) | tanya-owner | config.js:281; signal-weights.js:103 |
| darwinDecay | darwin | anak | – | faktor turun bobot sinyal kalah | 0.95 | =def | sehat (idem) | tanya-owner | config.js:282; signal-weights.js:104 |
| darwinFloor | darwin | anak | – | lantai bobot | 0.3 | =def | sehat (idem) | tanya-owner | config.js:283; signal-weights.js:105 |
| darwinCeiling | darwin | anak | – | atap bobot | 2.5 | =def | sehat (idem) | tanya-owner | config.js:284; signal-weights.js:106 |
| darwinMinSamples | darwin | anak | – | sampel min sebelum recalc | 10 | =def | sehat (idem) | tanya-owner | config.js:285; signal-weights.js:102 |

> Catatan 1F: 7 dari 8 key Darwin **dibaca** `recalculateWeights` (sehat), tapi **tak satu pun** terdaftar di CONFIG_MAP → tak bisa diubah lewat `/setcfg`/chat/`update_config`, hanya via edit `user-config.json` langsung atau wizard `setup.js:377`. `darwinRecalcEvery` mati total. `[CONFIRMED]`

### 1G — Chart Indicators  (sub-cluster: indicators)

| key | sub-cluster | beranak | core? | fungsi | default | live | status | saran | bukti |
|---|---|---|---|---|---|---|---|---|---|
| chartIndicatorsEnabled | ind-core | induk | ✅ | aktifkan gerbang indikator | false | true (racikan) | sehat | keep | config.js:328 |
| indicatorEntryPreset | ind-core | anak | ✅ | preset sinyal ENTRY | supertrend_break | =def | sehat | keep | config.js:329 |
| indicatorExitPreset | ind-core | anak | – | preset sinyal EXIT | supertrend_break | rsi_reversal (racikan) | sehat (inert kecuali exitEnabled) | keep | config.js:330 |
| indicatorExitEnabled | ind-exit | induk | – | nyalakan gerbang EXIT | false | false | sehat | keep | config.js:334 |
| indicatorRejectAtBottom | ind-entry | – | – | veto entry "sudah di dasar" | false | true (racikan) | sehat | keep | config.js:347 |
| rsiLength | ind-rsi | anak | – | panjang RSI | 2 | =def | sehat | keep | config.js:335 |
| rsiOversold | ind-rsi | anak | – | ambang RSI oversold | 30 | =def | sehat | keep | config.js:340 |
| rsiOverbought | ind-rsi | anak | – | ambang RSI overbought | 80 | 90 (racikan) | sehat | keep | config.js:341 |
| indicatorIntervals | ind-core | anak | – | interval candle dipakai | [5_MINUTE] | [5m,15m] (racikan) | sehat | keep | config.js:336 |
| indicatorCandles | ind-core | anak | – | jumlah candle ditarik | 298 | =def | sehat | keep | config.js:339 |
| requireAllIntervals | ind-core | anak | – | semua interval harus konfirmasi | false | true (racikan) | sehat | keep | config.js:342 |
| smiPdLookback | ind-smi | anak | – | lookback PD (preset SMI) | 5 | =def | sehat | keep | config.js:353 |
| smiPaLookback | ind-smi | anak | – | lookback PA (preset SMI) | 3 | =def | sehat | keep | config.js:354 |
| smiCrossWindow | ind-smi | anak | – | jendela cross (preset SMI) | 3 | =def | sehat | keep | config.js:355 |

### 1H — Infra/Meridian + PnL poller  (sub-cluster: infra)

| key | sub-cluster | beranak | core? | fungsi | default | live | status | saran | bukti |
|---|---|---|---|---|---|---|---|---|---|
| hiveMindUrl | hive | – | – | URL server HiveMind | api.agentmeridian.xyz | =def | sehat | keep | config.js:297 |
| hiveMindApiKey | hive | – | – | kunci HiveMind | (set) | (set) | sehat | keep | config.js:298 |
| hiveMindPullMode | hive | – | – | mode tarik lesson/preset | auto | =def | sehat | keep | config.js:300 |
| agentId | hive | – | – | id agen | null | (set, racikan) | sehat | keep | config.js:299 |
| publicApiKey | meridian | – | – | kunci publik API Meridian | (set default) | (set) | sehat | keep | config.js:305 |
| agentMeridianApiUrl | meridian | – | – | URL API Meridian | api.agentmeridian.xyz/api | =def | sehat | keep | config.js:304 |
| lpAgentRelayEnabled | meridian | – | – | relay ke LPAgent | false | true (racikan) | sehat (wired; 6 consumer) | keep | config.js:306 |
| pnlSource | pnl | induk | – | sumber PnL (rpc\|meteora) | rpc | =def | sehat | keep | config.js:312 |
| pnlRpcUrl | pnl | anak | – | RPC khusus poller PnL | pump.helius-rpc.com | =def | sehat | keep | config.js:311 |
| pnlPollIntervalSec | pnl | anak | – | detik antar-poll PnL | 3 | =def | sehat | keep | config.js:313 |
| pnlDepositCacheTtlSec | pnl | anak | – | TTL cache deposit (dtk) | 300 | =def | sehat | keep | config.js:314 |

### 1I — GMGN screening pipeline  (sub-cluster: gmgn) — aktif hanya bila `screeningSource=gmgn` (live=meteora → inert)

> Semua key di bawah dibaca `tools/gmgn.js` saat source=gmgn (`[INFERRED]` dari pola consumer; sampel dikonfirmasi: `maxBundlerRate` gmgn.js:173/194/223). Live source = meteora → blok ini **inert** sekarang (bukan mati — aktif bila source diganti). Default dari config.js:146-200.

| key | sub-cluster | core? | fungsi (ringkas) | default | status | bukti |
|---|---|---|---|---|---|---|
| gmgnFeeSource | gmgn-fee | – | sumber fee (gate minTokenFeesSol) | gmgn | sehat (dipakai walau source=meteora) | config.js:150 |
| gmgnApiKey | gmgn-conn | – | kunci GMGN | (set) | sehat | config.js:147 |
| gmgnBaseUrl | gmgn-conn | – | base URL GMGN | openapi.gmgn.ai | sehat | config.js:148 |
| gmgnInterval | gmgn-disc | – | interval daftar | 5m | sehat (inert) | config.js:151 |
| gmgnOrderBy | gmgn-disc | – | urutan | default | sehat (inert) | config.js:152 |
| gmgnDirection | gmgn-disc | – | arah urut | desc | sehat (inert) | config.js:153 |
| gmgnLimit | gmgn-disc | – | jumlah ditarik | 100 | sehat (inert) | config.js:154 |
| gmgnEnrichLimit | gmgn-disc | – | jumlah di-enrich | 20 | sehat (inert) | config.js:155 |
| gmgnRequestDelayMs | gmgn-conn | – | jeda antar-request (ms) | 350 | sehat (inert) — **[DEV+ZEN-TUNED] 2500→350** (peta §3b) | config.js:156 |
| gmgnMaxRetries | gmgn-conn | – | retry maks | 2 | sehat (inert) | config.js:157 |
| gmgnHoldersLimit | gmgn-disc | – | limit holder ditarik | 100 | sehat (inert) | config.js:158 |
| gmgnKlineResolution | gmgn-ind | – | resolusi candle | 5m | sehat (inert) | config.js:159 |
| gmgnKlineLookbackMinutes | gmgn-ind | – | lookback candle (mnt) | 60 | sehat (inert) | config.js:160 |
| gmgnFilters | gmgn-disc | – | filter dasar (renounced…) | [renounced,frozen,not_wash_trading] | sehat (inert) | config.js:161 |
| gmgnPlatforms | gmgn-disc | – | platform sumber | [Pump.fun,…] | sehat (inert) | config.js:162 |
| gmgnMinMcap / gmgnMaxMcap | gmgn-size | – | mcap min/maks | 150000 / 10000000 | sehat (inert) | config.js:163-164 |
| gmgnMinTvl / gmgnMinVolume / gmgnMinHolders | gmgn-size | – | tvl/vol/holder min | 10000 / 1000 / 500 | sehat (inert) | config.js:165-167 |
| gmgnMinTokenAgeHours / gmgnMaxTokenAgeHours | gmgn-age | – | umur token min/maks | 2 / 168 | sehat (inert) | config.js:168-169 |
| gmgnAthFilterPct | gmgn-size | – | filter jarak dari ATH | null | sehat (inert) | config.js:185 |
| gmgnRequireKol / gmgnMinKolCount | gmgn-kol | induk/anak | wajib KOL + jumlah min | true / 1 | sehat (inert) | config.js:171-172 |
| gmgnMinSmartDegenCount | gmgn-kol | – | smart-degen min | 1 | sehat (inert) | config.js:170 |
| gmgnMaxRugRatio | gmgn-safety | – | rasio rug maks | 0.3 | sehat (inert) | config.js:173 |
| gmgnMaxTop10HolderRate | gmgn-safety | – | top-10 holder maks | 0.5 | sehat (inert) | config.js:174 |
| gmgnMaxBundlerRate | gmgn-safety | – | rate bundler maks | 0.5 | **sehat [CONFIRMED]** | config.js:175; gmgn.js:173 |
| gmgnMaxRatTraderRate | gmgn-safety | – | rate rat-trader maks | 0.2 | sehat (inert) | config.js:176 |
| gmgnMaxFreshWalletRate | gmgn-safety | – | rate wallet baru maks | 0.2 | sehat (inert) | config.js:177 |
| gmgnMaxDevTeamHoldRate | gmgn-safety | – | hold tim dev maks | 0.02 | sehat (inert) | config.js:178 |
| gmgnMaxBotDegenRate | gmgn-safety | – | rate bot-degen maks | 0.4 | sehat (inert) | config.js:181 |
| gmgnMaxSniperCount / gmgnMaxSniperHoldRate | gmgn-safety | induk/anak | sniper count/hold maks | 20 / 0.3 | sehat (inert) | config.js:182-183 |
| gmgnPreferredKolNames / gmgnPreferredKolMinHoldPct | gmgn-kol | induk/anak | KOL favorit + hold min | [] / 1 | sehat (inert) | config.js:186,179 |
| gmgnDumpKolNames / gmgnDumpKolMinHoldPct | gmgn-kol | induk/anak | KOL "dumper" + ambang | [] / 0.5 | sehat (inert) | config.js:187,180 |
| gmgnMinTotalFeeSol | gmgn-fee | – | total fee SOL min | 30 | sehat (inert) | config.js:184 |
| gmgnIndicatorFilter / gmgnIndicatorInterval | gmgn-ind | induk/anak | gerbang indikator + interval | true / 15_MINUTE | sehat (inert) | config.js:188-189 |
| gmgnRequireBullishSt | gmgn-ind-rules | anak | wajib supertrend bullish | true | sehat (inert) | config.js:193 |
| gmgnRejectAtBottom | gmgn-ind-rules | anak | veto "sudah di dasar" | true | sehat (inert) | config.js:194 |
| gmgnRequireAboveSt | gmgn-ind-rules | anak | wajib di atas supertrend | false | sehat (inert) | config.js:195 |
| gmgnMinRsi / gmgnMaxRsi | gmgn-ind-rules | anak | batas RSI | null / null | sehat (inert) | config.js:196-197 |
| gmgnRequireBbPosition | gmgn-ind-rules | anak | posisi Bollinger | null | sehat (inert) | config.js:198 |

### 1J — Experiments (🧪 GRUP 16)  (sub-cluster: experiments) — semua default OFF

| key | beranak | core? | fungsi (ringkas) | default | live | status | bukti |
|---|---|---|---|---|---|---|---|
| exitLiquidityCheck / exitLiquidityMaxSlippagePct | induk/anak | – | gate likuiditas keluar pra-deploy | false / 10 | =def | sehat | config.js:367-368 |
| marketRegimeGate / marketRegimeMaxDrop24hPct | induk/anak | – | skip screening saat SOL anjlok | false / 8 | =def | sehat | config.js:373-374 |
| candidateMomentum | – | – | momentum kandidat (soft) | false | =def | sehat | config.js:379 |
| narrativeProfileSignal | – | – | hint narasi (soft) | false | =def | sehat | config.js:384 |
| expectedYieldSignal | – | – | proxy yield-to-me (soft) | false | =def | sehat | config.js:390 |
| convictionSizing / convictionSizingMaxAdjustPct | induk/anak | – | ukuran ikut keyakinan (±%) | false / 30 | =def | sehat | config.js:395-396 |
| counterfactualReview / counterfactualMinMcapGainPct | induk/anak | – | review skip (laporan) | false / 25 | **true** / 25 (racikan) | sehat (laporan, tak menulis config) | config.js:402-403 |
| smartWalletMomentum | – | – | momentum smart-wallet (soft) | false | =def | sehat | config.js:409 |
| idleScreeningCooldown / idleScreeningCooldownMin | induk/anak | – | rem screening saat idle | false / 20 | =def | sehat | config.js:417-418 |
| paperTrading | – | – | simulasi posisi (DRY-RUN) | false | =def | sehat | config.js:428 |
| usePaperHistoryWhenLive | – | – | pakai histori paper saat live | false | =def | sehat | config.js:437 |

### 1K — Reports  (sub-cluster: reports)

| key | beranak | core? | fungsi | default | live | status | bukti |
|---|---|---|---|---|---|---|---|
| learningReportEvery | induk | – | laporan belajar tiap N close (0=off) | 10 | =def | sehat | config.js:445 |
| learningReportTrendN | anak | – | N close untuk tren | 10 | =def | sehat | config.js:446 |

### 1L — Alias & orphan (di luar himpunan grup di atas)

| key | di mana | status | saran | bukti |
|---|---|---|---|---|
| takeProfitFeePct | CONFIG_MAP (alias) | **DOBEL** → menulis `management.takeProfitPct` | hapus/tanya-owner | executor.js:364 |
| maxBundlePct | user-config.json:41 (=30); definitions.js:400 (diiklankan ke LLM); /config display | **MATI/ORPHAN** — tak di CONFIG_MAP, tak dibaca config.js; gerbang bundler nyata = `maxBundlerRate`/`maxBotHoldersPct` | hapus dari user-config + definitions, tanya-owner | config.js (no ref); index.js:1609 |
| athFilterPct (screening) | user-config.json:48 (=null); /config display; definitions.js:400 | **MATI/ORPHAN** — config.js screening tak punya field ini; yang hidup `gmgn.athFilterPct` (baca key `gmgnAthFilterPct`) | hapus dari user-config, tanya-owner | config.js:185 (gmgn only) |

---

## BAGIAN 2 — REVIEW AUTO-TUNE (R-auto)

Tiap mekanisme yang bisa mengubah perilaku/config **sendiri**. Kolom kunci: **nulis balik ke user-config.json?** (= risiko menimpa tuning manual saat v2.1).

### 2.1 `gasReserveAutoTune` → menimpa `gasReserve`  🔴 NULIS CONFIG + AKTIF SEKARANG
- **Apa yang diubah:** `config.management.gasReserve` (live) **dan** flat key `gasReserve` di `user-config.json` (via `persistConfigChange`). `[CONFIRMED index.js:293; config.js:502-512]`
- **Pemicu kapan:** **harian** — dipanggil `maybeAutoTuneGasReserve()` di awal `runBriefing` (cron briefing 01:00 UTC + watchdog). `[CONFIRMED index.js:303]`
- **Syarat gerak:** butuh ≥8 record gas nyata; hanya berubah bila selisih >20% DAN >0.005 SOL (anti-churn). Target = burn harian × `gasReserveBufferDays`, lantai `gasReserveFloorSol`. `[CONFIRMED index.js:280-294]`
- **Nulis balik ke file?** **YA.** `[CONFIRMED index.js:293]`
- **Aktif sekarang?** **YA** — `gasReserveAutoTune=true` (`user-config.json:113`); live `gasReserve=0.03` (sudah hasil auto-tune, = floor). `[CONFIRMED]`
- **Risiko bentrok manual:** **TINGGI-sedang** — kalau owner set `gasReserve` manual, run harian berikutnya bisa menimpanya (bila selisih >20% & >0.005). Saat ini sudah mentok di floor 0.03 jadi gerak minim.
- **Saran:** untuk v2.1, sadari ini ON; bila mau kunci gasReserve manual → matikan `gasReserveAutoTune` dulu.

### 2.2 `update_config` (agent/LLM + manual) → bisa menimpa **key apa pun**  🔴 NULIS CONFIG + dipakai LLM
- **Apa yang diubah:** key mana pun di CONFIG_MAP (165 key). Menulis live config + `user-config.json` (atau `gmgn-config.json` untuk key gmgn), lalu menstempel `_lastAgentTune`. `[CONFIRMED executor.js:653-689]`
- **Siapa nulis `_lastAgentTune`:** **tool `update_config` itu sendiri** (executor.js:684) — jadi field ini = "kapan terakhir update_config menulis file", baik dari **LLM** (tool-call) maupun **manual** (`/setcfg`, chat config, CLI, tombol `/settings`). Bukan auto-tuner terpisah; tapi LLM MEMANG bisa memicunya. `[CONFIRMED]`
- **Pemicu kapan (jalur LLM):** prompt SCREENER menyuruh model meng-`update_config management.managementIntervalMin` berdasar volatilitas (3→5→10). `[CONFIRMED prompt.js:90-92]` Selain itu LLM bisa memanggilnya kapan saja dalam loop (di-konfirmasi dulu untuk chat: `CHAT_CONFIRM_TOOLS`, agent.js:9 — tapi siklus otonom tidak minta konfirmasi Telegram).
- **Nulis balik ke file?** **YA.** `[CONFIRMED executor.js:685]`
- **Aktif sekarang?** **YA** — `_lastAgentTune` live = **2026-06-13T09:29:09Z** (`user-config.json:107`), artinya file ditulis ulang oleh update_config hari ini.
- **Risiko bentrok manual:** **TINGGI** — ini jalur paling luas. Dugaan kuat: `screeningModel="minimax_m2_5"` yang rusak masuk lewat sini (entah LLM garbling nama model, entah typo manual). `[INFERRED — origin pasti UNKNOWN; cara cek: `grep '"reason"' logs/*` atau audit log update_config sekitar 09:29]`
- **Saran:** untuk v2.1, ini sumber overwrite terbesar. Pertimbangkan: (a) batasi key yang boleh diubah LLM (whitelist sempit, mis. cuma `managementIntervalMin`), (b) perbaiki `screeningModel` sekarang.

### 2.3 `evolveThresholds` → menimpa `minFeeActiveTvlRatio` & `minOrganic`  🔴 NULIS CONFIG
- **Apa yang diubah:** dua ambang screening: `minFeeActiveTvlRatio`, `minOrganic` (live + `user-config.json`), plus stempel `_lastEvolved`, `_positionsAtEvolution`. `[CONFIRMED lessons.js:487-496]`
- **Pemicu kapan:** tiap **5 close LIVE** (`livePerf.length % MIN_EVOLVE_POSITIONS(5) == 0`) di dalam `recordPerformance`; perlu sinyal (≥2 winner atau ≥2 loser) & gap jelas, gerak dibatasi `MAX_CHANGE_PER_STEP`. Paper close tak menghitung. `[CONFIRMED lessons.js:249-255,403-409]`
- **Nulis balik ke file?** **YA.** `[CONFIRMED lessons.js:491]`
- **Aktif sekarang?** Mekanismenya aktif (jalan otomatis). Live `minFeeActiveTvlRatio=0.1` & `minOrganic=70` **lebih tinggi dari default** — bisa hasil racikan ATAU hasil evolve (tak bisa dibedakan dari nilai saja). `[UNKNOWN sumber pastinya; cara cek: ada `_lastEvolved`/`_positionsAtEvolution` di user-config? → TIDAK ADA saat ini, jadi kemungkinan besar nilai itu dari racikan, bukan evolve]`
- **Bug "salah nama key" (dossier):** **SUDAH TIDAK BERLAKU.** Kode kini meng-evolve `minFeeActiveTvlRatio` & `minOrganic` (key flat sah), membaca field record `fee_tvl_ratio` & `organic_score` yang memang tercatat. Blok mati `maxVolatility` lama sudah dihapus. `[CONFIRMED lessons.js:418-419,458-459; dossier §K.4]`
- **Risiko bentrok manual:** **sedang** — kalau owner set `minFeeActiveTvlRatio`/`minOrganic` manual, tiap kelipatan-5-close evolve bisa menaikkannya (hanya menaikkan, dibatasi step). 
- **Saran:** v2.1 — sadari dua ambang ini "hidup". Bila mau freeze, ini perlu flag (belum ada toggle khusus untuk mematikan evolve; satu-satunya jalan = data < `MIN_EVOLVE_POSITIONS`).

### 2.4 Darwin / `recalculateWeights`  🟢 AMAN (tak nulis config-file)
- **Apa yang diubah:** bobot sinyal di `signal-weights.json` — **bukan** `user-config.json`. `[CONFIRMED signal-weights.js loadWeights/saveWeights; tak ada writeFileSync ke USER_CONFIG]`
- **Pemicu kapan:** sama dengan evolve — tiap 5 close live, bila `darwin.enabled`. **Pemicu nyata = `MIN_EVOLVE_POSITIONS=5`, BUKAN `darwinRecalcEvery`** (key itu mati). `[CONFIRMED lessons.js:262-264]`
- **Baca config?** Ya — `windowDays/minSamples/boostFactor/decayFactor/weightFloor/weightCeiling` dari `config.darwin` (7 dari 8 key Darwin terpakai). `[CONFIRMED signal-weights.js:101-106]`
- **Nulis balik ke user-config.json?** **TIDAK.** Aman dari overwrite tuning manual.
- **Aktif sekarang?** Ya (`darwinEnabled=true`).
- **Saran:** aman. Hanya catat `darwinRecalcEvery` mati + Darwin tak bisa di-`/setcfg`.

### 2.5 `adaptiveScreening`  🟢 AMAN (cuma gerbang cron)
- **Apa yang diubah:** **tidak ada** — hanya menentukan apakah tick cron screening jalan; baca config live. `[CONFIRMED index.js:1047-1062]`
- **Nulis balik ke file?** **TIDAK.** Aktif sekarang? **TIDAK** (live=false). Risiko: nol. Saran: aman.

### 2.6 `counterfactualReview`  🟢 AMAN (laporan saja)
- **Apa yang diubah:** **tidak ada config** — hanya menambah seksi "skip review" di briefing harian (baca candidate-memory). `[CONFIRMED config.js:397-402; CLAUDE.md]`
- **Nulis balik ke file?** **TIDAK.** Aktif sekarang? **YA** (live=true). Risiko: nol. Saran: aman.

### 2.7 `repeatDeployCooldown*`  🟢 AMAN (gerbang runtime)
- **Apa yang diubah:** **tidak ada config** — gerbang yang **memblokir** re-deploy ke pool/token yang sama dalam jangka cooldown; baca state.json. `[CONFIRMED config.js:211-215; executor.js dpo]`
- **Nulis balik ke file?** **TIDAK.** Aktif sekarang? **YA** (enabled default true). Risiko: nol (membatasi aksi, bukan menulis setelan). Saran: aman.

### Tabel ringkas auto-tune

| mekanisme | mengubah apa | pemicu | NULIS user-config.json? | aktif? | risiko overwrite manual |
|---|---|---|---|---|---|
| gasReserveAutoTune | `gasReserve` | harian (briefing) | 🔴 **YA** | **YA** | TINGGI-sedang |
| update_config (LLM+manual) | key apa pun (CONFIG_MAP) | LLM tool-call / `/setcfg` | 🔴 **YA** (+`_lastAgentTune`) | **YA** (09:29 td) | **TINGGI** |
| evolveThresholds | `minFeeActiveTvlRatio`,`minOrganic` | tiap 5 close live | 🔴 **YA** (+`_lastEvolved`) | mekanisme aktif | sedang |
| Darwin recalculateWeights | bobot sinyal | tiap 5 close live | 🟢 tidak (→signal-weights.json) | YA | nol |
| adaptiveScreening | gerbang cron | tick cron | 🟢 tidak | tidak (false) | nol |
| counterfactualReview | seksi briefing | briefing harian | 🟢 tidak | YA | nol |
| repeatDeployCooldown | blok re-deploy | saat deploy | 🟢 tidak | YA | nol |

---

## BAGIAN 3 — PUNCH-LIST (ringkasan keputusan)

### 3A — MATI / DOBEL / MENCURIGAKAN (kandidat dibenahi)

**MATI (key ada, tak nyambung logika):**
1. `healthCheckIntervalMin` — cron health di-hardcode `"0 * * * *"` (per jam); key tak dibaca. `[CONFIRMED config.js:256; index.js:1087]`
2. `minSolToOpen` — tak ada consumer; gerbang buka pakai `deployAmountSol+gasReserve`. `[CONFIRMED config.js:221; index.js:582]`
3. `darwinRecalcEvery` — pemicu nyata konstanta `MIN_EVOLVE_POSITIONS=5`. `[CONFIRMED lessons.js:19,253; konfirmasi ulang dossier §K.5]`
4. `maxBundlePct` — orphan: live di user-config (=30) & diiklankan ke LLM (definitions.js:400) tapi tak di CONFIG_MAP & tak dibaca config.js; gerbang bundler nyata = `maxBundlerRate`/`maxBotHoldersPct`. **(R1 menandai UNKNOWN → kini CONFIRMED MATI.)** `[CONFIRMED]`
5. `athFilterPct` (sisi screening) — orphan: live di user-config (=null) tapi config.js screening tak punya field ini; yang hidup `gmgn.athFilterPct`. **(R1 UNKNOWN → kini CONFIRMED MATI.)** `[CONFIRMED config.js:185]`

**DOBEL (alias tumpang-tindih):**
6. `takeProfitFeePct` → alias `takeProfitPct` (CONFIG_MAP). `[CONFIRMED executor.js:364]`
7. `binsBelow` → alias `maxBinsBelow` (CONFIG_MAP). `[CONFIRMED executor.js:398]`
   - (Jinak — fallback legacy di config.js: `emergencyPriceDropPct`→stopLossPct, `repeatDeployCooldownMinFeeYieldPct`→…MinFeeEarnedPct. Tak perlu dibenahi, hanya dicatat. `[CONFIRMED config.js:215,217]`)

**MENCURIGAKAN:**
8. **`screeningModel = "minimax_m2_5"`** — format model id rusak (underscore, tak ada provider/slug). Model screening kemungkinan gagal attempt-1 lalu fallback (agent.js fallback 502/503/529). **Patut dicurigai sebagai biang screening flaky / output ngulang** yang kemarin. `[CONFIRMED value user-config.json:73; efek pasti UNKNOWN]`
9. 8 key `darwin*` **tampil di /config tapi TAK di CONFIG_MAP** → tak bisa di-`/setcfg`/chat/update_config (hanya edit file / wizard). 7 terpakai, 1 (`darwinRecalcEvery`) mati. `[CONFIRMED]`
10. `useDiscordSignals`/`discordSignalMode` — listener Discord tak terpasang → jalur efektif mati/OFF. `[CONFIRMED peta §2b]`

### 3B — BUTUH KEPUTUSAN OWNER
- **`screeningModel`**: perbaiki ke id sah (mis. `minimax/minimax-m2.5` seperti managementModel, atau model lain)? — **prioritas tinggi** (langsung pengaruhi kualitas screening).
- **5 key MATI** (`healthCheckIntervalMin`, `minSolToOpen`, `darwinRecalcEvery`, `maxBundlePct`, `athFilterPct`): hapus dari tampilan/CONFIG_MAP/user-config/definitions, ATAU sambungkan ke logika (mis. benar-benar pakai `minSolToOpen` sebagai gerbang)? 
- **2 alias DOBEL** (`takeProfitFeePct`, `binsBelow`): pertahankan demi kompatibilitas lama, atau buang?
- **Darwin tak bisa /setcfg**: daftarkan 7 key Darwin ke CONFIG_MAP agar bisa di-tune via Telegram, atau biarkan file-only (sengaja)?
- **Discord**: pasang listener, atau singkirkan 2 key + iklannya dari definitions.js?

### 3C — AUTO-TUNER yang NULIS BALIK CONFIG (risiko v2.1)
Tiga mekanisme bisa menimpa `user-config.json` saat owner tuning manual:
1. **`gasReserveAutoTune`** → `gasReserve` — **ON sekarang**, jalan harian. (Matikan flag bila mau kunci gasReserve manual.)
2. **`update_config` (LLM)** → **key apa pun** — jalur terluas; menstempel `_lastAgentTune` (terakhir 09:29 hari ini). (Pertimbangkan whitelist key yang boleh diubah LLM.)
3. **`evolveThresholds`** → `minFeeActiveTvlRatio` + `minOrganic` — tiap 5 close live (hanya menaikkan, dibatasi step). (Belum ada toggle mematikan; freeze hanya bila data < 5.)

Aman (tak nulis config): Darwin (→signal-weights.json), adaptiveScreening, counterfactualReview, repeatDeployCooldown.

> **Rekomendasi v2.1 (1 kalimat):** sebelum kunci racikan manual, sadari 3 penulis-balik di atas — minimal matikan `gasReserveAutoTune` bila gasReserve mau di-pin, dan perbaiki `screeningModel` yang rusak.

