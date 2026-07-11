# Audit F16 — GMGN alt path + chart indicators + SMI
> Read-only. Bukti `file:line`. UNKNOWN kalau tak pasti. Resume: buka file ini.
> Kedalaman: ⬛ deep — alasan: GMGN alt path 5-stage pipeline (`discoverGmgnPools` 520-659) rule-based berbeda dari Meteora path; `checkBounceSetup` (452-518) reuse `fetchChartIndicatorsForMint` (shared server API) TAPI 5 rule vs 8 preset switch — 2 evaluation logic berbeda di atas API sama; 2 default drift (`rejectAlreadyAtBottom` true vs false, `rsiOversold` 35 vs 30); `indicatorFilter !== false` (default ON) vs `indicators.enabled` (default OFF); SMI client-side entry-only via `supertrend_plus_smi` (smi.js 166 line — Ehlers SMI phase machine PathA/PathB); KOL/smart/dump-KOL/sniper analysis; wallet.js quote impact (exit-liquidity experiment) utk exit-liquidity gate.
> Cross-ref: F2 (runScreeningCycle dispatch `screeningSource`), F14 (Meteora funnel + post-recon filter — GMGN skip upstream), F15 (Meteora indicator gate `confirmIndicatorPreset` + bundler detect), F26 (config.gmgn 40+ keys + config.indicators), F27 (experiments GRUP 16 — exitLiquidityCheck), F33 (Discord listener OFF, dead path).

## Ringkasan eksekutif (5 baris)
1. **GMGN 5-stage pipeline** (`discoverGmgnPools` gmgn.js:520-659): Stage1 `/v1/market/rank` + `passBasicRankFilter` (mcap/bundler_rate/age/volume, 165-182) → Stage2 `/v1/token/info` + `analyzeTokenInfo` (ATH/holders/total_fee/top10/dev_team/bot_degen/fresh_wallet/bundler/insider, 200-245) → Stage3 `/v1/market/token_top_holders` + `/v1/market/token_top_traders` + `analyzeHoldersAndTraders` (KOL/smart/dump-KOL/sniper, 247-302) + `fetchTopMeteoraDlmmPoolsForMint` (305-309) → Stage4 `checkBounceSetup` indicator gate (opt-in `indicatorFilter !== false`, default ON) → Stage5 `pickBestPool` + `condenseGmgnCandidate` (356-446). Tiap stage log + filtered_examples + stage_counts. `paceGmgnRequest` (18-24) delay 2500ms default (429 avoidance). `gmgnFetch` (51-94) maxRetries 2 + 429 backoff (3000×2^attempt / 60000 banned / retryAfter).
2. **`checkBounceSetup` (gmgn.js:452-518) = rule-based indicator gate GMGN path**: reuse `fetchChartIndicatorsForMint` (shared API `/chart-indicators/{mint}`) — server-side math SAMA dgn Meteora path. TAPI evaluation beda: 5 rule via `config.gmgn.indicatorRules` (requireBullishSupertrend/rejectAlreadyAtBottom/requireAboveSupertrend/minRsi/maxRsi/requireBbPosition, 484-503) vs 8 preset switch (chart-indicators.js:79-242). `passed = reasons.length === 0` (506). Signal return: `{interval, rsi, rsiLabel, bbPosition, supertrendDirection, supertrendBreakUp, aboveSupertrend}` (508-516). Fail-open: API error → `{passed:true, reasons:[]}` (610-613) → candidate PASS.
3. **2 DEFAULT DRIFT antara path** (CLAUDE.md tak dokumentasi): (a) `rejectAlreadyAtBottom` — Meteora path `config.indicators.rejectAlreadyAtBottom` default OFF (chart-indicators.js:304, config.js verify F26); GMGN path `rules.rejectAlreadyAtBottom !== false` (490) → bila rules undefined, `!== false` = TRUE → default ON. Kontrak CLAUDE.md "default OFF" betul untuk Meteora, SALAH untuk GMGN. (b) `rsiOversold` — Meteora path `config.indicators.rsiOversold ?? 30` (chart-indicators.js:306); GMGN path `config.indicators?.rsiOversold ?? 35` (gmgn.js:465). Bila user set `rsiOversold: 25` di config → 2 path pakai 25 (sama, OK). Bila user TIDAK set → Meteora pakai 30, GMGN pakai 35 (drift, GMGN lebih longgar = lebih sering veto "already at bottom").
4. **`indicatorFilter` default ON di GMGN path**: gmgn.js:605 `if (g.indicatorFilter !== false)` → bila `config.gmgn.indicatorFilter` undefined/null → `!== false` = TRUE → gate ACTIVE. Berbeda dari Meteora path `config.indicators.enabled` (default false per CLAUDE.md, config.js verify F26). Artinya: user switch `screeningSource=gmgn` → indicator gate otomatis ON (tanpa perlu set `indicators.enabled=true`). TAPI `indicatorFilter` read dari `config.gmgn`, BUKAN `config.indicators.enabled` — 2 config key terpisah. User baca CLAUDE.md "indicators.enabled default false" → kira indicator OFF di GMGN path → sebenarnya ON by default.
5. **SMI client-side entry-only** (smi.js:166 line): `evaluateSmi(candles, options)` (96-164) — Ehlers Stochastic Momentum Index. Compute `smi` + `smiEma` series dari `candles[]` via `computeSmiSeries` (56-89) — double-smoothed EMA. Phase machine: `aCnt` (consecutive smi>mid) + `bCnt` (consecutive smi<mid). PD trigger = `aCnt === distCandles` (default 2, pre-distribution top). PA trigger = `bCnt === akumCandles` (default 2, pre-accumulation bottom). PathA "topping → roll over": cross-down (`smi crosses below smiEma` while smi>mid) within `crossWindow` (default 3) candles, preceded by PD within `pdLookback` (default 5) candles BEFORE cross. PathB "already accumulating": PA trigger within `paLookback` (default 3) candles. `confirmed = pathA || pathB` (158). Hanya accessible via Meteora path `supertrend_plus_smi` preset (chart-indicators.js:206-234). GMGN path `checkBounceSetup` TIDAK pakai SMI. Insufficient candles (`< lenK+2`) → `{ok:false, confirmed:false}` (98-100). Server tak return SMI series; bot compute sendiri dari `payload.candles[]`.

## Progress
- [x] Baca gmgn.js 1-60 (imports + paceGmgnRequest + gmgnFetch header)
- [x] Baca gmgn.js 61-180 (gmgnFetch retry + unwrapList + helpers + passBasicRankFilter)
- [x] Baca gmgn.js 180-309 (analyzeSecurity + analyzeTokenInfo + analyzeHoldersAndTraders + fetchTopMeteoraDlmmPoolsForMint)
- [x] Baca gmgn.js 356-446 (condenseGmgnCandidate — context from F14)
- [x] Baca gmgn.js 440-559 (checkBounceSetup + discoverGmgnPools Stage1-2)
- [x] Baca gmgn.js 560-754 (Stage3-5 + formatGmgnCandidateForPrompt + getGmgnTokenFees)
- [x] Baca smi.js full (166 line — DEFAULTS + ema + computeSmiSeries + evaluateSmi PathA/PathB)
- [x] Cross-ref F15 (chart-indicators.js confirmIndicatorPreset — shared API), F14 (post-recon filter GMGN skip), F2 (screeningSource dispatch)
- [x] Detect 2 default drift (rejectAlreadyAtBottom true/false, rsiOversold 30/35)
- [x] Detect indicatorFilter default ON vs indicators.enabled default OFF
- [x] Tulis §0 + §A-§H

---

## §0. Cara Kerja (Bahasa Awam)

**Analogi** (dua sudut pandang sehari-hari)
- *2 jalur rekrutmen*: jalur A (Meteora) = HRD cari CV sendiri, pakai psikotes 8 preset (supertrend_break = "pernah naik jabatan", rsi_reversal = "pernah di-bottom karir", dst). Jalur B (GMGN) = pakai agen rekrutmen eksternal (GMGN API) yang sudah scan pasar dgn 5 stage: rank → info → holders/traders → indikator bounce → pilih pool. Agen B pakai 5 rule ketat (requireBullishSupertrend = "boss lama mendukung", rejectAlreadyAtBottom = "jangan yang sudah di-PHK semua", dst). Kedua jalur baca sumber data CHART yang SAMA (server Meridian `/chart-indicators/{mint}`) — beda cuma cara evaluate. Tapi 2 default beda: jalur B lebih ketat veto "already at bottom" (default ON + RSI<35 vs jalur A default OFF + RSI<30).
- *Detektor emas palsu homemade*: SMI = alat detektor bikin sendiri (client-side), tak dijual di toko (server tak return). Cara kerja: pantau gelombang (smi series) + signal line (smiEma). 2 pola: PathA "sudah topping lalu roll over" = gelombang naik lalu cross turun (tanda distribusi); PathB "sudah accumulating" = gelombang di bawah lama lalu ready naik (tanda akumulasi). Hanya kombinasi dgn supertrend bullish (`supertrend_plus_smi` preset). Cuma dipakai di jalur A. Jalur B tak pakai — pakai 5 rule sederhana saja.

**Di bot, ini = GMGN alt screening path + shared chart-indicators API + SMI client-side** (1-2 kalimat)
`screeningSource=gmgn` → `discoverGmgnPools` 5-stage pipeline (rank→info→holders→indikator→pool) → `checkBounceSetup` rule-based indicator gate (reuse `fetchChartIndicatorsForMint` API sama dgn Meteora path). SMI (Ehlers) client-side entry-only via `supertrend_plus_smi` preset — Meteora path only. 2 evaluation logic berbeda di atas API sama.

**Posisi fase ini di alur bot** (1 paragraf)
Datang setelah F15 (Meteora indicator gate depth) + F14 (funnel overview). F16 = PARITAS: jalur GMGN alt path, complement Meteora. Dipilih oleh `config.screening.screeningSource` (config.js:150, default "meteora"). Saat `screeningSource=gmgn`, `getTopCandidates` (screening.js:606) dispatch ke `discoverGmgnPools` bukan `discoverPools`. `checkBounceSetup` = GMGN equivalent dari `confirmIndicatorPreset` (Meteora). Sebelum F4 (SCREENER LLM). Tanpa F16, user switch `screeningSource=gmgn` → expect same behavior → sebenarnya 2 default drift + indicator gate otomatis ON.

**Langkah kerja** (5-10 nomor, istilah teknis)
1. Trigger: `getTopCandidates` (screening.js:606) baca `config.screening.screeningSource` → dispatch ke `discoverGmgnPools` (gmgn.js:520) bila `gmgn`.
2. Stage1 rank (526-548): `gmgnFetch("/v1/market/rank")` + `passBasicRankFilter` (mcap/bundler_rate/age/volume) → `s1` slice `enrichLimit` (default 20).
3. Stage2 info (551-569): per token `gmgnFetch("/v1/token/info")` + `analyzeTokenInfo` (ATH/holders/total_fee/top10/dev_team/bot/fresh/bundler/insider) → `s2`.
4. Stage3 holders/traders (572-601): parallel `token_top_holders` + `token_top_traders` + `analyzeHoldersAndTraders` (KOL/smart/dump-KOL/sniper) + `fetchTopMeteoraDlmmPoolsForMint` (cari DLMM pool di Meteora API) → `s3`.
5. Stage4 indicator (604-625): `if (g.indicatorFilter !== false)` → per entry `checkBounceSetup(mint)` (452-518) → 5 rule `config.gmgn.indicatorRules` → reject bila `!passed` → fail-open bila API error → `s4`.
6. Stage5 pool pick (628-651): per entry `pickBestPool` (topPools) + `condenseGmgnCandidate` (356-446) → `pools` slice `limit`.
7. Return `{total, stage_counts, pools, filtered_examples}` (653-658) → `getTopCandidates` (screening.js:606) bungkus jadi `{candidates: pools, total_screened, source:"gmgn", ...}`.
8. `runScreeningCycle` (index.js:778) → recon → post-recon filter (820-849): `if (pool.gmgn) return true` (824) — skip launchpad/bot filter (upstream sudah).
9. Candidate block assembly (index.js:966-978): `formatGmgnCandidateForPrompt(pool)` (gmgn.js:661-729) render header + pool + risk + traction + KOL + dumpKOL + indLine.
10. SMI (jika Meteora path + `supertrend_plus_smi` preset): `evaluateSmi(payload.candles, opts)` (smi.js:96) → PathA/PathB → `confirmed = pathA || pathB` → combined dgn supertrend_break entry.

**Output GMGN path**: `pools[]` array candidate sudah filtered 5-stage. Each candidate: `pool.gmgn=true` flag, `pool.indicators` attached (signal from checkBounceSetup), `formatGmgnCandidateForPrompt` render ke block string. Cross-ref F4 (SCREENER LLM) + F14 (runScreeningCycle consumer).

**Kalau rusak / diskip** (2-3 kalimat, istilah teknis)
GMGN API key invalid → `gmgnFetch` throw "GMGN_API_KEY is required" (28) → `discoverGmgnPools` reject → `getTopCandidates` error → `runScreeningCycle` cycleFail (F14). `checkBounceSetup` API error → fail-open `{passed:true}` (613) → candidate PASS tanpa indicator filter → bisa deploy di momentum buruk. 2 default drift (`rejectAlreadyAtBottom` ON, `rsiOversold` 35) → user switch GMGN path → veto lebih sering "already at bottom" → candidates lebih sedikit dari expected (vs Meteora path default). SMI insufficient candles (`<lenK+2=7`) → `{ok:false, confirmed:false}` (98-100) → `supertrend_plus_smi` preset return confirmed=false → candidate REJECT indicator gate (bukan fail-open — beda dari API-down case).

**Istilah yang muncul di fase ini** (bullet, cuma yang baru)
- **GMGN path** — alt screening source via GMGN OpenAPI (`screeningSource=gmgn`). 5-stage pipeline.
- **`gmgnFetch`** — fetch wrapper w/ X-APIKEY header + paceGmgnRequest delay + 429 backoff retry.
- **`paceGmgnRequest`** — rate-limit delay 2500ms default (`config.gmgn.requestDelayMs`).
- **`checkBounceSetup`** — GMGN path indicator gate, 5 rule-based via `config.gmgn.indicatorRules`. Reuse `fetchChartIndicatorsForMint` (shared API).
- **`indicatorFilter`** — config.gmgn key, default ON (`!== false`). Beda dari `config.indicators.enabled` (default OFF).
- **`rejectAlreadyAtBottom` drift** — Meteora default OFF; GMGN default ON (`!== false` true).
- **`rsiOversold` drift** — Meteora default 30; GMGN default 35.
- **SMI** — Ehlers Stochastic Momentum Index, client-side, entry-only via `supertrend_plus_smi`. Server tak return; bot compute dari `payload.candles[]`.
- **PathA "topping → roll over"** — cross-down smi below smiEma while smi>mid, preceded by PD trigger.
- **PathB "already accumulating"** — PA trigger (consecutive smi<mid) within last paLookback candles.
- **PD/PA trigger** — pre-distribution/pre-accumulation phase machine. `aCnt/bCnt === distCandles/akumCandles`.
- **KOL/smart/dump-KOL** — Key Opinion Leader / smart wallet / dumping KOL analysis di `analyzeHoldersAndTraders`.

*Lewati §0 kalau sudah paham. Isi teknis mulai §A.*

---

## §A. Peta block fase ini (file:line → peran)

| file:line | simbol | peran |
|---|---|---|
| gmgn.js:1-8 | imports + setDefaultResultOrder("ipv4first") | GMGN OpenAPI IPv4-only |
| gmgn.js:10-11 | METEORA_DLMM_API const + SUPPORTED_INTERVALS | "1m","5m","1h","6h","24h" |
| gmgn.js:12-24 | `lastGmgnRequestAt` + `paceGmgnRequest` | rate-limit delay 2500ms default |
| gmgn.js:26-30 | `getApiKey` | `config.gmgn.apiKey` OR `GMGN_API_KEY` env, required |
| gmgn.js:32-35 | `normalizeInterval` | filter SUPPORTED_INTERVALS, fallback "5m" |
| gmgn.js:51-94 | `gmgnFetch` | fetch + X-APIKEY + retry 429 backoff |
| gmgn.js:79-88 | 429 retry | retryAfter OR 60000 banned OR 3000×2^attempt (cap 30000) |
| gmgn.js:96-106 | `unwrapList` | unwrap `list`/`rank`/`data` dari payload |
| gmgn.js:108-126 | `num`/`optionalNum`/`boolish`/`ratioPct` | helpers |
| gmgn.js:128-145 | `hasTag`/`entryName`/`entryAmountPct` | holder/trader tag + name + amount helpers |
| gmgn.js:147-163 | `isPreferredKol`/`isDumpKol` | match `config.gmgn.preferredKolNames`/`dumpKolNames` |
| gmgn.js:165-182 | `passBasicRankFilter` | Stage1 filter: mcap/bundler_rate/age/volume |
| gmgn.js:173 | `bundler_rate > maxBundlerRate` | LIVE bundler gate GMGN path |
| gmgn.js:184-198 | `analyzeSecurity` | security filter: renounced_mint/freeze/honeypot/wash/creator_hold/rug_ratio/top10/bundler/rat/sniper |
| gmgn.js:200-245 | `analyzeTokenInfo` | Stage2 filter: ATH/holders/total_fee/top10/dev_team/bot/fresh/bundler/insider |
| gmgn.js:211-215 | ATH filter | `priceVsAthPct > 100+athFilterPct` → reject |
| gmgn.js:247-302 | `analyzeHoldersAndTraders` | Stage3 enrichment: KOL/smart/dump-KOL/sniper counts + reasons |
| gmgn.js:268-270 | `bundlerTopHolders`/`sniperTopHolders` | tag-based count |
| gmgn.js:272 | `sniperHoldRate > maxSniperHoldRate` | hard reject |
| gmgn.js:305-309 | `fetchTopMeteoraDlmmPoolsForMint` | cari DLMM pool di Meteora API (`METEORA_DLMM_API/pools?query=mint&sort_by=tvl:desc`) |
| gmgn.js:356-446 | `condenseGmgnCandidate` | shape candidate utk LLM consumption |
| gmgn.js:444 | `indicators: indicatorSignal ?? null` | attach checkBounceSetup signal ke candidate |
| gmgn.js:448-518 | `checkBounceSetup` | GMGN path indicator gate, 5 rule-based |
| gmgn.js:453-454 | interval + fetchChartIndicatorsForMint | reuse chart-indicators API (shared server) |
| gmgn.js:465 | `rsiOversold ?? 35` | DEFAULT DRIFT vs Meteora path 30 |
| gmgn.js:484-503 | 5 rule via `config.gmgn.indicatorRules` | requireBullishSupertrend/rejectAlreadyAtBottom/requireAboveSupertrend/minRsi/maxRsi/requireBbPosition |
| gmgn.js:487-488 | `requireBullishSupertrend !== false && !isBullish` | default ON (bila undefined, !== false = true) |
| gmgn.js:490-491 | `rejectAlreadyAtBottom !== false && alreadyAtBottom` | DEFAULT ON — drift vs Meteora OFF |
| gmgn.js:505-517 | return `{passed, reasons, signal}` | signal = `{interval, rsi, rsiLabel, bbPosition, supertrendDirection, supertrendBreakUp, aboveSupertrend}` |
| gmgn.js:520-659 | `discoverGmgnPools` | 5-stage pipeline orchestrator |
| gmgn.js:526-548 | Stage1 rank | `/v1/market/rank` + passBasicRankFilter → s1 |
| gmgn.js:551-569 | Stage2 info | `/v1/token/info` + analyzeTokenInfo → s2 |
| gmgn.js:572-601 | Stage3 holders/traders | `/v1/market/token_top_holders` + `/v1/market/token_top_traders` + analyzeHoldersAndTraders + fetchTopMeteoraDlmmPoolsForMint → s3 |
| gmgn.js:604-625 | Stage4 indicator | `if (g.indicatorFilter !== false)` → checkBounceSetup per entry → fail-open (610-613) → s4 |
| gmgn.js:605 | `indicatorFilter !== false` | DEFAULT ON — drift vs `indicators.enabled` default OFF |
| gmgn.js:610-613 | API error fail-open | `{passed:true, reasons:[]}` → candidate PASS |
| gmgn.js:628-651 | Stage5 pool pick | pickBestPool + condenseGmgnCandidate → pools |
| gmgn.js:653-658 | return shape | `{total, stage_counts, pools, filtered_examples}` |
| gmgn.js:661-729 | `formatGmgnCandidateForPrompt` | render candidate block: header + pool + risk + traction + KOL + dumpKOL + indLine |
| gmgn.js:736-754 | `hasGmgnApiKey` + `getGmgnTokenFees` | fee source helper (used by token.js `resolveGlobalFeesSol` F15) |
| smi.js:1-28 | header + DEFAULTS | lenK=5, lenD=3, lenE=3, mid=0, distCandles=2, akumCandles=2, pdLookback=5, paLookback=3, crossWindow=3 |
| smi.js:30-52 | `ema` | Pine-style EMA, hold last on null input |
| smi.js:56-89 | `computeSmiSeries` | double-smoothed rel/rng → smi = 200×relSmooth/rngSmooth; smiEma = ema(smi, lenE) |
| smi.js:96-164 | `evaluateSmi` | phase machine + PathA + PathB + return |
| smi.js:98-100 | insufficient candles guard | `candles.length < lenK+2` → `{ok:false, confirmed:false}` |
| smi.js:107-127 | phase machine replay | pd/pa/crossDown arrays per candle; aCnt/bCnt consecutive |
| smi.js:113-127 | per-candle loop | `smi>mid` → aCnt++; `smi<mid` → bCnt++; `aCnt===distCandles` → pd[i]=true; `bCnt===akumCandles` → pa[i]=true; cross-down check |
| smi.js:120-125 | cross-down detect | `smi[lastDefined]>=smiEma[lastDefined] && smi[i]<smiEma[i] && smi[i]>mid` |
| smi.js:133-145 | PathA loop | cross-down within crossWindow + PD within pdLookback BEFORE cross |
| smi.js:147-156 | PathB loop | PA trigger within paLookback |
| smi.js:158-163 | return | `{ok:true, confirmed: pathA\|\|pathB, pathA, pathB, reason, smi, smiEma}` |
| chart-indicators.js:206-234 | `supertrend_plus_smi` preset | entry-only: stEntry AND evaluateSmi; exit mirror supertrend_break |
| chart-indicators.js:218 | `evaluateSmi(payload?.candles, opts)` | call site utk SMI |

---

## §B. Alur data: screeningSource dispatch → GMGN 5-stage → indicator → block

```
getTopCandidates (screening.js:606)
  └─ if (screeningSource === "gmgn") → discoverGmgnPools (gmgn.js:520)
      │
      ├─ Stage1: gmgnFetch("/v1/market/rank") (526)
      │   └─ passBasicRankFilter(token) per item (538-545)
      │       ├─ mcap < g.minMcap → reject
      │       ├─ mcap > g.maxMcap → reject
      │       ├─ bundler_rate > g.maxBundlerRate → reject (173)  ← LIVE bundler gate
      │       ├─ age < g.minTokenAgeHours → reject
      │       ├─ age > g.maxTokenAgeHours → reject
      │       └─ volume < g.minVolume → reject
      │   └─ sort by volume desc, slice enrichLimit (545-546) → s1
      │
      ├─ Stage2: per token gmgnFetch("/v1/token/info") (555)
      │   └─ analyzeTokenInfo(info) (557)
      │       ├─ ATH: priceVsAthPct > 100+athFilterPct → reject (212-214)
      │       ├─ holders < g.minHolders → reject (217)
      │       ├─ total_fee < g.minTotalFeeSol → reject (218)
      │       ├─ top_10_holder_rate > g.maxTop10HolderRate → reject (219)
      │       ├─ dev_team_hold_rate > g.maxDevTeamHoldRate → reject (220)
      │       ├─ bot_degen_rate > g.maxBotDegenRate → reject (221)
      │       ├─ fresh_wallet_rate > g.maxFreshWalletRate → reject (222)
      │       ├─ top_bundler_trader_percentage > g.maxBundlerRate → reject (223)
      │       └─ top_rat_trader_percentage > g.maxRatTraderRate → reject (224)
      │   └─ push {token, info, infoCheck} → s2
      │
      ├─ Stage3: per s2 entry (574-594)
      │   ├─ parallel: gmgnFetch("/v1/market/token_top_holders") + ("/v1/market/token_top_traders") (577-584)
      │   ├─ analyzeHoldersAndTraders(holders, traders) (587)
      │   │   ├─ sniperHoldRate > maxSniperHoldRate → reject (272)
      │   │   └─ extract: kolHolding, smartHolding, preferredKolHolders, dumpKolSignificant, bundlerTopHolders
      │   └─ fetchTopMeteoraDlmmPoolsForMint(mint, minTvl, 2) (589) → topPools
      │       └─ topPools.length === 0 → reject "no SOL DLMM pool above tvl" (590-592)
      │   └─ push {token, info, infoCheck, holdersCheck, topPools} → s3
      │
      ├─ Stage4: indicator gate (604-625)
      │   └─ if (g.indicatorFilter !== false):  ← default ON
      │       └─ per s3 entry: checkBounceSetup(mint) (610)
      │           ├─ fetchChartIndicatorsForMint(mint, {interval}) (454)  ← shared API
      │           ├─ 5 rule via config.gmgn.indicatorRules (484-503):
      │           │   ├─ requireBullishSupertrend !== false && !isBullish → reason (487-488)
      │           │   ├─ rejectAlreadyAtBottom !== false && alreadyAtBottom → reason (490-491)  ← DEFAULT ON drift
      │           │   ├─ requireAboveSupertrend && !priceAboveSupertrend → reason (493-494)
      │           │   ├─ minRsi != null && rsi < minRsi → reason (496-497)
      │           │   ├─ maxRsi != null && rsi > maxRsi → reason (499-500)
      │           │   └─ requireBbPosition != null && bbPosition !== required → reason (502-503)
      │           └─ return {passed: reasons.length===0, reasons, signal} (505-517)
      │       └─ CATCH error → {passed:true, reasons:[]} (610-613)  ← fail-open
      │       └─ !passed → filtered.push + continue (615-617)
      │       └─ push {...entry, indicatorSignal: indicatorCheck.signal} → s4
      │   └─ else: s4.push(...s3) (622)
      │
      ├─ Stage5: pool pick (628-651)
      │   └─ per s4 entry: pickBestPool(topPools) → {pool, detail: poolDetail}
      │       └─ condenseGmgnCandidate(...) (639) → candidate
      │       └─ push → pools (slice limit)
      │
      └─ return {total, stage_counts, pools, filtered_examples} (653-658)
          │
          ↓
      screening.js:606 wrap → {candidates: pools, source:"gmgn", ...}
          │
          ↓
runScreeningCycle (index.js:778) → recon → post-recon filter (820-849)
  └─ if (pool.gmgn) return true (824) — skip launchpad/bot filter (upstream)
      │
      ↓
candidate block assembly (index.js:966-978)
  └─ formatGmgnCandidateForPrompt(pool) (gmgn.js:661-729)
      ├─ header = sym | launchpad | age | mcap | binStep (715)
      ├─ pool = tvl | feeTvl | vol | volatility | ath (716)
      ├─ risk = top10 | dev | bot | fresh | bundler (717)
      ├─ traction = holders | fees | smart | kol (718)
      ├─ kolLine (preferred/kol_names + profit leaders) (685-694)
      ├─ dumpKolLine (significant/minor) (696-702)
      └─ indLine (interval + supertrend + rsi + bb) (704-712)
```

**SMI sub-flow (Meteora path only, `supertrend_plus_smi` preset)**:
```
confirmIndicatorPreset({mint, side:"entry", preset:"supertrend_plus_smi"}) (chart-indicators.js:277)
  └─ per interval: fetchChartIndicatorsForMint → evaluatePreset(side, "supertrend_plus_smi", payload) (297)
      └─ stEntry = supertrendBreakUp OR (bullish AND close>=supertrendValue) (212-214)
      └─ if (!stEntry) → {confirmed:false, reason:"Supertrend not bullish"} (215-217)
      └─ smiRes = evaluateSmi(payload?.candles, {pdLookback, paLookback, crossWindow}) (218-222)
          ├─ computeSmiSeries(candles, opts) (56-89) → {smi, smiEma}
          ├─ phase machine replay (113-127): pd/pa/crossDown arrays
          ├─ PathA: cross-down within crossWindow + PD within pdLookback BEFORE cross (133-145)
          ├─ PathB: PA within paLookback (147-156)
          └─ return {ok, confirmed: pathA||pathB, pathA, pathB, reason, smi, smiEma} (158-163)
      └─ return {confirmed: smiRes.ok && smiRes.confirmed, reason: `Supertrend ✓ + ${smiRes.reason}`, signal: summary} (223-227)
```

---

## §C. Sinkron: siapa-panggil-siapa

| Pemanggil (file:line) | Dipanggil (file:line) | Trigger | Data lewat | Fail-mode |
|---|---|---|---|---|
| screening.js:606 (getTopCandidates) | gmgn.js:520 `discoverGmgnPools` | `screeningSource === "gmgn"` | `{limit}` | error → getTopCandidates propagate → runScreeningCycle cycleFail |
| gmgn.js:526 | gmgn.js:51 `gmgnFetch` | Stage1 | `("/v1/market/rank", {params})` | 429 retry backoff; maxRetries 2 → throw |
| gmgn.js:539 | gmgn.js:165 `passBasicRankFilter` | per rank token | `token` | `{pass, reasons}` (181) |
| gmgn.js:555 | gmgn.js:51 `gmgnFetch` | Stage2 per token | `("/v1/token/info", {params})` | error → filtered.push + continue (563-566) |
| gmgn.js:557 | gmgn.js:200 `analyzeTokenInfo` | Stage2 | `info` | `{passed, reasons, smartWallets, kolWallets, priceVsAthPct, ...}` (225-244) |
| gmgn.js:577-584 | gmgn.js:51 `gmgnFetch` × 2 parallel | Stage3 | `("/v1/market/token_top_holders", ...)` + `("/v1/market/token_top_traders", ...)` | error → filtered.push + continue (595-598) |
| gmgn.js:587 | gmgn.js:247 `analyzeHoldersAndTraders` | Stage3 | `(holders, traders)` | `{passed, reasons, kolHolding, smartHolding, ...}` (273-301) |
| gmgn.js:589 | gmgn.js:305 `fetchTopMeteoraDlmmPoolsForMint` | Stage3 | `(mint, minTvl, 2)` | `topPools.length===0` → reject (590-592) |
| gmgn.js:610 | gmgn.js:452 `checkBounceSetup` | Stage4 per s3 entry | `mint` | API error → `{passed:true, reasons:[]}` (610-613) |
| gmgn.js:454 | chart-indicators.js:244 `fetchChartIndicatorsForMint` | checkBounceSetup | `(mint, {interval})` | error propagate → outer catch fail-open |
| gmgn.js:639 | gmgn.js:356 `condenseGmgnCandidate` | Stage5 per s4 entry | `{token, pool, poolDetail, security, info, infoAnalysis, holdersAnalysis, indicatorSignal}` | incomplete pool mapping → reject (640-642) |
| index.js:969 (F15 ref) | gmgn.js:661 `formatGmgnCandidateForPrompt` | candidate block assembly | `pool` (gmgn flag) | render string (no throw) |
| chart-indicators.js:218 | smi.js:96 `evaluateSmi` | `supertrend_plus_smi` preset entry | `(payload?.candles, {pdLookback, paLookback, crossWindow})` | `<lenK+2` candles → `{ok:false, confirmed:false}` (98-100) |
| token.js:12 (F15 ref) | gmgn.js:742 `getGmgnTokenFees` | `resolveGlobalFeesSol` | `mint` | error → null (fallback to Jupiter fees) |

---

## §D. Logika kunci per fungsi

### `discoverGmgnPools` (gmgn.js:520-659)
- **Apa**: 5-stage pipeline orchestrator — rank → info → holders/traders → indicator → pool pick.
- **Kapan dipicu**: `getTopCandidates` (screening.js:606) dispatch saat `screeningSource=gmgn`.
- **Output**: `{total: ranked.length, stage_counts: {s1,s2,s3,s4,s5}, pools: candidates[], filtered_examples: filtered[]}`.
- **Sinkron**: `getTopCandidates` wrap jadi `{candidates: pools, total_screened, source:"gmgn", filtered_examples, all_filtered, stage_counts}`. `runScreeningCycle` (index.js:778) consumer.
- **Fail-mode**: per-stage try/catch → filtered.push + continue (stage 2/3/5). Stage4 fail-open (API error → candidate PASS). Pipeline-level error → reject → cycleFail.
- **Bukti**: gmgn.js:520-659.

### `checkBounceSetup` (gmgn.js:452-518)
- **Apa**: rule-based indicator gate GMGN path — 5 rule via `config.gmgn.indicatorRules`. Reuse `fetchChartIndicatorsForMint` (shared API).
- **Kapan dipicu**: Stage4 (gmgn.js:610) per s3 entry, bila `indicatorFilter !== false`.
- **Output**: `{passed: reasons.length===0, reasons: string[], signal: {interval, rsi, rsiLabel, bbPosition, supertrendDirection, supertrendBreakUp, aboveSupertrend}}`.
- **Sinkron**: `condenseGmgnCandidate` (444) attach `indicators: indicatorSignal` ke candidate. `formatGmgnCandidateForPrompt` (704-712) render `indLine`.
- **Fail-mode**: API error → outer catch (610-613) → `{passed:true, reasons:[]}` (fail-open candidate PASS). `rules = config.gmgn.indicatorRules || {}` (484) — missing rules → default behavior (requireBullishSupertrend ON, rejectAlreadyAtBottom ON).
- **Bukti**: gmgn.js:452-518.

### `evaluateSmi` (smi.js:96-164)
- **Apa**: client-side SMI entry evaluation — PathA (topping→roll over) + PathB (already accumulating). Pure fn over `candles[]`.
- **Kapan dipicu**: chart-indicators.js:218 dalam `supertrend_plus_smi` preset entry path.
- **Output**: `{ok, confirmed: pathA||pathB, pathA, pathB, reason, smi, smiEma}`. `ok=false` bila insufficient candles → confirmed=false.
- **Sinkron**: caller `evaluatePreset` (chart-indicators.js:206-234) combine `stEntry && smiRes.ok && smiRes.confirmed`. `signal: summary` dari buildSignalSummary, BUKAN dari SMI.
- **Fail-mode**: `candles.length < lenK+2` (98-100) → `{ok:false, confirmed:false, reason:"insufficient candles"}`. `payload.candles` null → `Array.isArray(null)` false → reject. Bukan fail-open — confirmed=false (candidate REJECT indicator gate, beda dari API-down fail-open).
- **Bukti**: smi.js:96-164, chart-indicators.js:206-234.

### `computeSmiSeries` (smi.js:56-89)
- **Apa**: pure fn — compute `smi` + `smiEma` series dari `candles[]` OHLCV.
- **Kapan dipicu**: `evaluateSmi` (102).
- **Output**: `{smi: number[n], smiEma: number[n]}`. Null entries during lenK warmup.
- **Sinkron**: phase machine (107-127) baca per-candle.
- **Fail-mode**: `high[j]==null || low[j]==null` (70) → skip that candle. `rngSmooth[i]===0` (84) → skip (avoid div0).
- **Bukti**: smi.js:56-89.

### `passBasicRankFilter` (gmgn.js:165-182)
- **Apa**: Stage1 filter — mcap/bundler_rate/age/volume. Pure fn.
- **Kapan dipicu**: Stage1 (539) per rank token.
- **Output**: `{pass: reasons.length===0, reasons}`.
- **Sinkron**: reject → filtered.push + continue (540-543).
- **Fail-mode**: `num()` helper returns 0 bila value invalid → bisa miss reject (e.g. `bundler_rate=undefined` → `num=0`, `0 > 0.5` false → PASS). Potential silent-bypass bila GMGN API return missing field.
- **Bukti**: gmgn.js:165-182.

### `analyzeTokenInfo` (gmgn.js:200-245)
- **Apa**: Stage2 filter — ATH/holders/total_fee/top10/dev_team/bot/fresh/bundler/insider. Pure fn.
- **Kapan dipicu**: Stage2 (557) per s1 token.
- **Output**: `{passed, reasons, smartWallets, kolWallets, priceVsAthPct, tradeFeeSol, totalFeeSol, top10HolderPct, devTeamHoldPct, botDegenCount, botDegenPct, freshWalletPct, bundlerPct, insiderPct, sniperWallets, bundlerWallets, whaleWallets, freshWallets}`.
- **Sinkron**: `condenseGmgnCandidate` (infoAnalysis) baca fields → `gmgn_*` prefixed fields.
- **Fail-mode**: same `num()` issue — missing field → 0 → bisa miss reject. `athFilter != null` guard (212) → skip filter bila config null.
- **Bukti**: gmgn.js:200-245.

### `analyzeHoldersAndTraders` (gmgn.js:247-302)
- **Apa**: Stage3 enrichment — KOL/smart/dump-KOL/sniper counts + 1 hard reject (sniperHoldRate).
- **Kapan dipicu**: Stage3 (587) per s2 entry.
- **Output**: `{passed, reasons, kolHolding, kolHolderNames, kolProfitNames, preferredKolHolding, preferredKolHolders, dumpKolSignificantCount, dumpKolMinorCount, dumpKolHolders, smartHolding, smartAccumulating, smartExiting, mostlyExited, bundlerTopHolderCount, sniperTopHolderCount, sniperHoldRate}`.
- **Sinkron**: `condenseGmgnCandidate` (holdersAnalysis) baca → `gmgn_*` fields. `formatGmgnCandidateForPrompt` (685-702) render KOL/dumpKol lines.
- **Fail-mode**: `holders.length===0` → `sniperHoldRate=0` (270) → pass. No hard fail bila API return empty.
- **Bukti**: gmgn.js:247-302.

### `formatGmgnCandidateForPrompt` (gmgn.js:661-729)
- **Apa**: render candidate ke block string utk SCREENER LLM. 7 section: header/pool/risk/traction/KOL/dumpKOL/indLine.
- **Kapan dipicu**: candidate block assembly (index.js:969) untuk `pool.gmgn=true` path.
- **Output**: multi-line string (728) — `[header]`, `  Pool: ...`, `  Risk: ...`, `  Traction: ...`, `  KOL: ...`, `  ⚠ DUMP KOL: ...`, `  Indicators [...]`.
- **Sinkron**: index.js:966-978 combine dgn pvpLine + sw + activeBin + 3 soft-signal lines (F15) + narrative/memory sanitize.
- **Fail-mode**: any field null → empty string via `.filter(Boolean)` (728). No throw.
- **Bukti**: gmgn.js:661-729.

---

## §E. Temuan: bug / gap / kontrak-kunci / fail-open tak-terpenuhi

### E1. GAP — 2 default drift antara Meteora vs GMGN path (CLAUDE.md tak dokumentasi)
- **`rejectAlreadyAtBottom`**:
  - Meteora path: `config.indicators.rejectAlreadyAtBottom` (chart-indicators.js:304) — default OFF per CLAUDE.md.
  - GMGN path: `rules.rejectAlreadyAtBottom !== false` (gmgn.js:490) — bila `config.gmgn.indicatorRules.rejectAlreadyAtBottom` undefined → `undefined !== false` = TRUE → default ON.
  - Impact: user switch `screeningSource=gmgn` → veto "already at bottom" otomatis ON (tanpa user set). User baca CLAUDE.md "default OFF" → expect OFF → sebenarnya ON.
- **`rsiOversold`**:
  - Meteora path: `config.indicators.rsiOversold ?? 30` (chart-indicators.js:306).
  - GMGN path: `config.indicators?.rsiOversold ?? 35` (gmgn.js:465).
  - Impact: user TIDAK set `rsiOversold` → Meteora pakai 30, GMGN pakai 35. GMGN lebih longgar veto (RSI<35 lebih sering trigger "already at bottom" daripada RSI<30). Bila user set `rsiOversold: 25` → 2 path sama (25).
- **Fix**: (a) konsistenkan default — pilih satu (30 atau 35), hardcoded di gmgn.js:465 jadi `?? 30` (match Meteora). (b) konsistenkan `rejectAlreadyAtBottom` default — pilih OFF (per CLAUDE.md kontrak "default OFF"), hardcoded `rules.rejectAlreadyAtBottom === true` (explicit opt-in). (c) update CLAUDE.md dokumentasi drift atau fix code.

### E2. GAP — `indicatorFilter` default ON vs `indicators.enabled` default OFF
- **Lokasi**: gmgn.js:605 `if (g.indicatorFilter !== false)` — bila undefined → TRUE → gate ACTIVE.
- **Kontras**: Meteora path `config.indicators.enabled` (default false per CLAUDE.md) → gate INACTIVE by default.
- **Impact**: user switch `screeningSource=gmgn` → indicator gate otomatis ON (tanpa set `indicators.enabled=true`). User baca CLAUDE.md "indicators.enabled default false" → kira indicator OFF di GMGN path → sebenarnya ON.
- **Kontrak**: 2 config key terpisah (`config.gmgn.indicatorFilter` vs `config.indicators.enabled`). User harus set keduanya utk Meteora path; GMGN path auto-on via `indicatorFilter`.
- **Severity**: medium — user intent "indicators off" tergantung path. GMGN path lebih ketat by default.
- **Fix**: update CLAUDE.md — explicitly state `config.gmgn.indicatorFilter` default ON untuk GMGN path. Atau unify: GMGN path juga cek `config.indicators.enabled` sebagai master switch.

### E3. GAP — `passBasicRankFilter` silent-bypass bila GMGN API field missing
- **Lokasi**: gmgn.js:165-182.
- **Masalah**: `num(value)` (108) returns 0 bila value invalid/undefined. `bundler_rate > g.maxBundlerRate` (173) → `0 > 0.5` = false → PASS. Bila GMGN API return token object tanpa `bundler_rate` field → silent bypass bundler gate.
- **Impact**: pool dgn missing `bundler_rate` lewat Stage1 tanpa filter → Stage2 `analyzeTokenInfo` punya check serupa (223) `top_bundler_trader_percentage > maxBundlerRate` — defense-in-depth. TAPI bila kedua field missing → silent pass seluruh pipeline.
- **Severity**: low — GMGN API contract seharusnya selalu return `bundler_rate`. TAPI bila pernah null → no guard.
- **Fix**: `optionalNum(value)` (113) returns null → `null > 0.5` = false → still pass. Bisa ganti ke explicit null check: `if (optionalNum(token.bundler_rate) == null) reasons.push("bundler_rate missing")` (fail-closed bila data missing).

### E4. KONTRAK — SMI confirmed=false bila insufficient candles (NOT fail-open)
- **Lokasi**: smi.js:98-100 `if (candles.length < opts.lenK+2) return {ok:false, confirmed:false, ...}`.
- **Kontrak**: chart-indicators.js `confirmIndicatorPreset` fail-open (API down → candidate PASS). TAPI SMI insufficient candles → `ok:false, confirmed:false` → `evaluatePreset` (224) `smiRes.ok && smiRes.confirmed` = false → confirmed=false → candidate REJECT indicator gate.
- **Asymetri**: API down (no payload) → fail-open PASS. API OK tapi candles insufficient → REJECT. Bisa terjadi bila token baru (candle history < 7 = `lenK+2`).
- **Impact**: token fresh dgn candle <7 → `supertrend_plus_smi` preset reject (bukan pass). User pilih preset ini utk token baru → silent reject semua fresh token.
- **Severity**: low — `supertrend_plus_smi` opt-in preset (user explicit pilih). Default preset lain tak pakai SMI.
- **Bukti**: smi.js:98-100, chart-indicators.js:218-227.

### E5. KONTRAK — GMGN path indicator signal TIDAK multi-interval
- **Lokasi**: gmgn.js:453 `const interval = String(config.gmgn.indicatorInterval || "15_MINUTE")` — single interval.
- **Kontras**: Meteora path `confirmIndicatorPreset` (chart-indicators.js:288) loop `normalizeIntervals(["5_MINUTE","15_MINUTE"])` + `requireAll ? every : some`.
- **Impact**: GMGN path check 1 interval saja (default 15_MINUTE). User set `config.indicators.intervals=["5_MINUTE","15_MINUTE"]` →ignored di GMGN path (hanya `indicatorInterval` field yang dibaca).
- **Severity**: low — 2 path memang berbeda kontrak. TAPI user expect unified intervals config.
- **Bukti**: gmgn.js:453, chart-indicators.js:288.

### E6. KONTRAK — GMGN pipeline reuse Meteora DLMM API utk pool discovery
- **Lokasi**: gmgn.js:305-309 `fetchTopMeteoraDlmmPoolsForMint` → `METEORA_DLMM_API/pools?query=mint&sort_by=tvl:desc`.
- **Kontrak**: GMGN path discover tokens via GMGN API, tapi cari DLMM pool di Meteora API. Hybrid: GMGN utk token ranking, Meteora utk pool selection.
- **Reason**: GMGN tidak expose DLMM pool structure; Meteora DLMM API authoritative utk pool state.
- **Bukti**: gmgn.js:10, 305-309.

### E7. KONTRAK — `paceGmgnRequest` global rate-limit 2500ms
- **Lokasi**: gmgn.js:18-24, `lastGmgnRequestAt` module-level global.
- **Kontrak**: semua `gmgnFetch` call (apapun endpoint) kena delay 2500ms default (`config.gmgn.requestDelayMs`). 5-stage pipeline = ~5-20 GMGN calls per candidate → 12-50 detik per candidate. Stage1+2+3 = 3 calls × 2.5s = 7.5s minimum per token.
- **Impact**: GMGN path LAMBAT vs Meteora. `enrichLimit=20` (default) → Stage2-3 = 20 × 2 × 2.5s = 100s minimum. User expect fast screening → GMGN path bottleneck.
- **Bukti**: gmgn.js:18-24, 526-659.

---

## §F. Glosarium istilah fase

- **GMGN path** — alt screening source via GMGN OpenAPI (`screeningSource=gmgn`). 5-stage pipeline.
- **`gmgnFetch`** — fetch wrapper w/ X-APIKEY header + paceGmgnRequest delay + 429 backoff retry (max 2).
- **`paceGmgnRequest`** — global rate-limit delay 2500ms default (`config.gmgn.requestDelayMs`).
- **`checkBounceSetup`** — GMGN path indicator gate, 5 rule-based via `config.gmgn.indicatorRules`. Reuse `fetchChartIndicatorsForMint` (shared API).
- **`indicatorFilter`** — `config.gmgn` key, default ON (`!== false`). Beda dari `config.indicators.enabled` (default OFF).
- **`rejectAlreadyAtBottom` drift** — Meteora default OFF; GMGN default ON (`!== false` true).
- **`rsiOversold` drift** — Meteora default 30; GMGN default 35.
- **5 rule** — requireBullishSupertrend/rejectAlreadyAtBottom/requireAboveSupertrend/minRsi/maxRsi/requireBbPosition.
- **5-stage pipeline** — rank → info → holders/traders → indicator → pool pick.
- **SMI** — Ehlers Stochastic Momentum Index, client-side, entry-only via `supertrend_plus_smi`. Server tak return; bot compute dari `payload.candles[]`.
- **PathA "topping → roll over"** — cross-down smi below smiEma while smi>mid, preceded by PD trigger within pdLookback BEFORE cross.
- **PathB "already accumulating"** — PA trigger (consecutive smi<mid) within last paLookback candles.
- **PD/PA trigger** — pre-distribution/pre-accumulation. `aCnt===distCandles` → PD; `bCnt===akumCandles` → PA.
- **`computeSmiSeries`** — double-smoothed EMA over rel/rng → smi = 200×relSmooth/rngSmooth; smiEma = ema(smi, lenE).
- **KOL/smart/dump-KOL** — Key Opinion Leader / smart wallet / dumping KOL analysis di `analyzeHoldersAndTraders`.
- **`fetchTopMeteoraDlmmPoolsForMint`** — hybrid: GMGN discover token, Meteora API cari DLMM pool (`METEORA_DLMM_API/pools?query=mint`).
- **`formatGmgnCandidateForPrompt`** — render 7-section block: header/pool/risk/traction/KOL/dumpKOL/indLine.

---

## §G. Link fase lain (cross-ref)

- **F2 (cycles)**: `runScreeningCycle` (index.js:665) → `getTopCandidates` (778) dispatch via `screeningSource`. F16 = jalur GMGN, F14 = jalur Meteora.
- **F14 (Meteora funnel)**: discoverPools 18 API filters vs GMGN 5-stage. Post-recon filter (820-849) `if (pool.gmgn) return true` skip — upstream GMGN sudah filter.
- **F15 (Meteora indicator)**: `confirmIndicatorPreset` 8 preset vs GMGN `checkBounceSetup` 5 rule. Shared API `fetchChartIndicatorsForMint`. 2 default drift (E1). `indicatorFilter` default ON vs `indicators.enabled` default OFF (E2).
- **F26 (config)**: `config.gmgn` 40+ keys (apiKey, baseUrl, interval, orderBy, filters, platforms, minMcap, maxBundlerRate, athFilterPct, indicatorFilter, indicatorInterval, indicatorRules, preferredKolNames, dumpKolNames, dst). `config.indicators` (enabled, intervals, candles, rsiOversold, rsiOverbought, requireAllIntervals, smiPdLookback, smiPaLookback, smiCrossWindow). Verify defaults di F26.
- **F27 (experiments)**: `exitLiquidityCheck` (+ `exitLiquidityMaxSlippagePct`) — pre-deploy gate `quoteSellPriceImpact()` (wallet.js). F16 belum baca wallet.js quote impact — verify di F16 follow-up atau F9 (deploy safety).
- **F33 (Discord listener OFF)**: discoverPools (Meteora) cek `useDiscordSignals`. GMGN path tidak pakai Discord. Dead path di GMGN.

---

## §H. Open-Q (bawa ke fase lain)

- **E1 → F26 (config core)**: verify default `config.gmgn.indicatorRules` di config.js — apakah `rejectAlreadyAtBottom` explicit false atau undefined? Bila undefined → drift confirmed (GMGN default ON). Bila explicit false → no drift.
- **E2 → F26**: verify `config.gmgn.indicatorFilter` default di config.js. Bila undefined → default ON (`!== false` true). Bila explicit false → default OFF.
- **E3 → F16 follow-up**: audit GMGN API contract — apakah `bundler_rate`/`top_bundler_trader_percentage` selalu present di rank/info payload? Bila ya, silent-bypass gap tak praktis. Bila tidak, perlu fail-closed guard.
- **E4 → F15 follow-up**: SMI insufficient candles asymetri — verify apakah `supertrend_plus_smi` preset intended utk mature token only (candle history >=7). Bila ya, dokumentasi. Bila tidak, perlu fail-open (treat as API-down).
- **wallet.js quote impact → F9/F27**: `quoteSellPriceImpact()` utk `exitLiquidityCheck` experiment. Belum dibaca di F16. Verify di F9 (deploy safety) atau F27 (experiments deep).
- **`pickBestPool` → F16 follow-up**: gmgn.js:633 call `pickBestPool(topPools)` — verify implementasi (sort by tvl? fee? volatility?). Belum dibaca.
- **`fetchTopMeteoraDlmmPoolsForMint` filter → F16 follow-up**: gmgn.js:306 `filter_by=tvl>${minTvl}` — verify `minTvl` source (config.gmgn.minTvl vs config.screening.minTvl fallback 573).
