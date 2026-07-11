# Audit F15 — Indicator gate + bundler + momentum/yield/sw injection
> Read-only. Bukti `file:line`. UNKNOWN kalau tak pasti. Resume: buka file ini.
> Kedalaman: ⬛ deep — alasan: 2 sistem indikator (Meteora path `confirmIndicatorPreset` di screening.js vs GMGN path `checkBounceSetup` di gmgn.js) + opt-in `rejectAlreadyAtBottom` veto + 8 preset entry/exit + multi-interval combine (`requireAllIntervals`) + SMI client-side; bundler detection 3-layer (CLAUDE.md klaim `common_funder`/`funded_same_window` = STALE — token.js tak compute, hanya expose `funding` raw; LIVE gate = `maxBotHoldersPct` Meteora + `gmgn.maxBundlerRate` GMGN; `maxBundlersPct` = DEAD CONFIG KEY cuma di CLAUDE.md); 3 soft-signal injection (`momentum`/`yield_to_me`/`sw_momentum`) ke candidate block opt-in fail-open; trusted vs untrusted text split (`sanitizeUntrustedPromptText` 500 char); shadow logging always-on (record ≠ influence).
> Cross-ref: F2 (runScreeningCycle hard-guards + candidate block assembly), F5 (SCREENER prompt + RISK SIGNALS line), F3 (indicator EXIT gate getIndicatorExitSignal opt-in), F6 (definitions indicator schema), F14 (screening funnel overview + injection point locations), F16 (GMGN checkBounceSetup + chart-indicators depth), F26 (config.indicators + config.gmgn defaults), F27 (experiments GRUP 16).

## Ringkasan eksekutif (5 baris)
1. **2 sistem indikator, dipilih oleh `screeningSource`** (config.js:150): Meteora path = `confirmIndicatorPreset` (chart-indicators.js:277-366) dipanggil screening.js:719-756 entry gate parallel over `eligible` — 8 preset (`supertrend_break`/`rsi_reversal`/`bollinger_reversion`/`rsi_plus_supertrend`/`supertrend_or_rsi`/`bb_plus_rsi`/`fibo_reclaim`/`fibo_reject`/`supertrend_plus_smi`) via `evaluatePreset(side,preset,payload)` switch (79-242); GMGN path = `checkBounceSetup` (gmgn.js:444-510) via `config.gmgn.indicatorRules` (requireBullishSupertrend/rejectAlreadyAtBottom/requireAboveSupertrend/minRsi/maxRsi/requireBbPosition) — detail F16. Server-side math (RSI/Supertrend/Bollinger/Fibonacci computed by API `/chart-indicators/{mint}`), bot baca `payload.latest`.
2. **ENTRY gate (always-on saat `indicators.enabled`)**: screening.js:719 `if (config.indicators.enabled && eligible.length>0)` → `Promise.all` over `eligible.map(pool → confirmIndicatorPreset({mint, side:"entry"}))` → hard-drop reject sebelum LLM lihat (744-752). Fail-open: API error → `{confirmed:true, skipped:true}` (chart-indicators.js:337-347) → candidate PASS (no penalty bila API down). `rejectAlreadyAtBottom` veto opt-in (304-314): RSI<oversold AND close<lowerBand → veto confirmed entry (single-side-below butuh room dump into range). EXIT gate opt-in `indicators.exitEnabled` default OFF — F3:1516.
3. **Multi-interval combine** (chart-indicators.js:288-352): `normalizeIntervals` filter `["5_MINUTE","15_MINUTE"]` only (18-23). Per interval fetch+evaluate → `requireAll = !!config.indicators.requireAllIntervals` (349). Confirmed = `requireAll ? successful.every(confirmed) : successful.some(confirmed)` (350-352). Default OFF = some (any interval confirmed enough). `successful = results.filter(ok:true)` (336) — API-failed interval excluded dari combine (bukan veto).
4. **Bundler detection — CLAUDE.md STALE**: klaim `common_funder`/`funded_same_window` di token.js:212-219 = TIDAK ADA di kode. token.js:113-118 hanya expose raw `funding {address, amount, slot}` per-holder dari Jupiter `addressInfo.fundingAddress`. LIVE bundler gate = 2 tempat: (a) Meteora path post-recon `bot_holders_pct > maxBotHoldersPct` (index.js:836-842, default 30%, Jupiter audit `botHoldersPercentage`); (b) GMGN path `bundler_rate > gmgn.maxBundlerRate` (gmgn.js:173/194/223, default 0.5 = 50%, GMGN API field). `maxBundlersPct` (CLAUDE.md:83,218) = DEAD CONFIG KEY — tak ada di config.js default, CONFIG_MAP, schema, atau logic. `maxTop10Pct` (default 60%) = LIVE di index.js:1562 hard filter + prompt.js:136 RISK SIGNALS.
5. **3 soft-signal injection** (index.js:925-960): tiap experiment wrapped `try/catch` → fail-open (omit line). `candidateMomentum` (929-934) → `formatCandidateMomentum(getCandidateMomentum(pool.pool))` → `momentum:` line; `expectedYieldSignal` (940-950) → `formatYieldToMe({deployAmountSol, solPriceUsd, tvlUsd, feeActiveTvlRatio})` → `yield_to_me:` line (proxy, ignores bin concentration); `smartWalletMomentum` (955-960) → `formatSmartWalletMomentum(getSmartWalletMomentum(pool.pool))` → `sw_momentum:` line. OFF by default → line null → `.filter(Boolean)` drop. Trusted lines (our own metric), inject ke DUA format candidate block (gmgn 966-978 + meteora 983-997). Narrative/memory = untrusted → `sanitizeUntrustedPromptText(text, 500)`.

## Progress
- [x] Baca screening.js 768-872 (condensePool + getPoolDetail)
- [x] Baca screening.js 1-89 (formatYieldToMe + scoreCandidate)
- [x] Baca screening.js 700-756 (indicator entry gate + dev-blocklist filter)
- [x] Baca chart-indicators.js 1-60 (buildSignalSummary + evaluatePreset setup)
- [x] Baca chart-indicators.js 61-242 (8 preset switch + supertrend_plus_smi)
- [x] Baca chart-indicators.js 244-366 (fetchChartIndicatorsForMint + confirmIndicatorPreset + rejectAlreadyAtBottom + multi-interval combine)
- [x] Baca token.js full (193 line — verify NO common_funder/funded_same_window compute)
- [x] Grep maxBundlersPct → ONLY CLAUDE.md (DEAD KEY confirmed)
- [x] Grep common_funder/funded_same_window → NONE in code (CLAUDE.md stale confirmed)
- [x] Baca index.js 820-849 (post-recon bot_holders_pct + launchpad filter)
- [x] Baca index.js 920-999 (3 soft-signal injection + 2 candidate block format)
- [x] Baca candidate-memory.js full (record/get/format momentum + sw_momentum + counterfactual skip review)
- [x] Cross-ref F3 (indicator EXIT gate), F14 (funnel + injection locations), F16 (GMGN checkBounceSetup pending)
- [x] Tulis §0 + §A-§H

---

## §0. Cara Kerja (Bahasa Awam)

**Analogi** (dua sudut pandang sehari-hari)
- *Sistem alarm rumah + CCTV*: alarm gerak (indikator RSI/Supertrend) cuma bunyi kalau dipasang (`indicators.enabled`). Tiap kamera (preset) punya aturan sendiri — "bunyi kalau pintu depan dibuka pakai kunci" (supertrend_break), "bunyi kalau jendela dibuka dari luar" (rsi_reversal). Bisa pasang 2 kamera (5_MINUTE + 15_MINUTE) — ATURAN: kedua kamera harus bunyi (`requireAllIntervals=true`) ATAU salah satu cukup (`false`, default). Kalau listrik mati (API down), alarm mati — tamu tetap boleh masuk (fail-open, candidate PASS). CCTV recording tetap nyala (shadow logging) walau alarm off — supaya besok bisa review "yang lewat kemarin siapa".
- *Pemeriksa beacon uang palsu*: kasir lihat uang ada tanda (bundler): (a) uang Meteora → cek `bot_holders_pct` dari mesin Jupiter (maxBotHoldersPct 30%) — kalau banyak bot pegang, tolak; (b) uang GMGN → cek `bundler_rate` dari mesin GMGN (max 50%). TAPI buku panduan kasir (CLAUDE.md) bilang "cek `common_funder` + `funded_same_window`" — di mesin asli TIDAK ADA itu (stale, cuma expose raw `funding` address per-holder buat di-interpret LLM). Yang dipakai = `maxBotHoldersPct` + `gmgn.maxBundlerRate`. Ada juga `maxBundlersPct` di buku panduan — di mesin asli TIDAK DIPAKAI sama sekali (dead key).

**Di bot, ini = technical-timing layer + bundler defense + soft signals** (1-2 kalimat)
2 jalur: Meteora path pakai `confirmIndicatorPreset` (8 preset entry/exit) sebagai ENTRY gate hard-drop sebelum LLM; GMGN path pakai `checkBounceSetup` (rule-based). Bundler defense = `maxBotHoldersPct` (Meteora post-recon) + `gmgn.maxBundlerRate` (GMGN pipeline). 3 soft signals (momentum/yield/sw_momentum) opt-in fail-open, never gate — inject ke candidate block sebagai trusted line.

**Posisi fase ini di alur bot** (1 paragraf)
Datang setelah F14 (funnel overview: discoverPools → getTopCandidates → runScreeningCycle post-recon). F15 = DETAIL dalam dari 3 filter spesifik yang F14 cuma sebut: (1) indicator entry gate di `getTopCandidates` ujung (sebelum return candidates ke runScreeningCycle), (2) bundler detect di post-recon filter (Meteora) / pipeline (GMGN), (3) 3 soft-signal injection ke candidate block assembly. Sebelum F4 (SCREENER LLM agentLoop). Tanpa F15, SCREENER LLM lihat candidate tanpa filter timing teknis + tanpa soft signals → pilih berdasarkan fundamental doang.

**Langkah kerja** (5-10 nomor, istilah teknis)
1. Trigger: `getTopCandidates` (screening.js:606) selesai filter occupied/cooldown/score → `eligible` array → masuk indicator entry gate (719).
2. `config.indicators.enabled` check (719) — OFF → skip gate seluruhnya, `eligible` lewat utuh.
3. ON → `Promise.all(eligible.map(pool → confirmIndicatorPreset({mint: pool.base.mint, side:"entry"})))` (720-740) — parallel fetch all candidate indicators.
4. Per pool: `confirmIndicatorPreset` loop `normalizeIntervals(["5_MINUTE","15_MINUTE"])` (288) → per interval `fetchChartIndicatorsForMint(mint,{interval})` (296) → `evaluatePreset(side,preset,payload)` (297) → 8 preset switch (79-242).
5. `rejectAlreadyAtBottom` veto opt-in (304-314): confirmed AND RSI<oversold AND close<lowerBand → flip confirmed=false (single-side-below butuh room dump into range).
6. Multi-interval combine (349-352): `requireAll ? every : some`. API-failed interval excluded dari combine (336), bukan veto.
7. Fail-open: API error catch (323-332) → push `{ok:false, confirmed:null}`. Bila semua interval gagal → return `{confirmed:true, skipped:true}` (337-347) → candidate PASS.
8. Back di screening.js:744-752: filter `!confirmation || confirmation.confirmed` → reject → `pushFilteredReason` + log. `pool.indicator_confirmation = confirmation` attach ke pool object (746) utk downstream visibility.
9. Bundler detect (post-recon, Meteora path SAJA): index.js:836-842 `bot_holders_pct > maxBotHoldersPct` filter. GMGN path: bundler sudah difilter di pipeline gmgn.js (173/194/223).
10. Soft-signal injection (index.js:925-960): per candidate, 3 experiment try/catch → null atau line. Inject ke DUA format block (gmgn 966-978 + meteera 983-997) via `.filter(Boolean).join("\n")`.

**Output indicator gate + bundler + soft signals**: `eligible` array filtered by indicator+bundler, each `pool` carries `indicator_confirmation` + `gmgn` flag + soft-signal lines terattach di block string. Cross-ref F4 (SCREENER LLM baca block) + F14 (return value ke runScreeningCycle).

**Kalau rusak / diskip** (2-3 kalimat, istilah teknis)
Indicator API down berkepanjangan → fail-open → semua candidate PASS indicator gate → SCREENER lihat pool tanpa filter timing → bisa deploy di momentum buruk (e.g. RSI overbought + sudah di atas supertrend = beli di pucuk). `maxBotHoldersPct` terlalu longgar (misal 80%) → pool dgn 70% bot holder lewat → rug risk (bundler dump ke posisi kita). `maxBundlersPct` di CLAUDE.md = dead key → user edit di user-config.json TIDAK efek apa-apa (silent ignore). Soft signals fail-open → line null → SCREENER lihat candidate tanpa momentum/yield context (keputusan tetap jalan, tapi less informed).

**Istilah yang muncul di fase ini** (bullet, cuma yang baru)
- **preset** — 8 aturan entry/exit kombinasi indikator (supertrend_break, rsi_reversal, dst). Dipilih via `indicatorEntryPreset`/`indicatorExitPreset`.
- **interval** — timeframe candle (5_MINUTE / 15_MINUTE). Multi-interval = cek beberapa timeframe sekaligus.
- **requireAllIntervals** — true = semua interval harus confirmed; false (default) = salah satu cukup.
- **rejectAlreadyAtBottom** — opt-in veto: RSI<oversold AND close<lowerBand → tolak confirmed entry. Single-side-below butuh room dump into range.
- **SMI** — client-side indicator (Ehlers SMI), entry-only via `supertrend_plus_smi` preset. Server tak return SMI; bot compute dari `payload.candles[]`.
- **bundler** — bot farm beli serentak. Detection: Meteora = `bot_holders_pct` (Jupiter audit); GMGN = `bundler_rate` (GMGN API).
- **maxBundlersPct** — DEAD CONFIG KEY di CLAUDE.md, tak ada di kode. LIVE key = `maxBotHoldersPct` + `gmgn.maxBundlerRate`.
- **soft signal** — trusted line inject ke candidate block, opt-in, fail-open, NEVER gate deploy (momentum/yield/sw_momentum).
- **shadow logging** — record snapshots selalu (bahkan saat experiment OFF) → data accrue, "recording ≠ influencing".

*Lewati §0 kalau sudah paham. Isi teknis mulai §A.*

---

## §A. Peta block fase ini (file:line → peran)

| file:line | simbol | peran |
|---|---|---|
| screening.js:6 | import confirmIndicatorPreset | entry gate dispatcher |
| screening.js:719-756 | indicator ENTRY gate | `Promise.all` eligible.map → hard-drop reject pre-LLM |
| screening.js:720-740 | per-pool confirmIndicatorPreset call | side:"entry", mint=pool.base.mint |
| screening.js:744-752 | filter confirmedEligible | `!confirmation \|\| confirmation.confirmed` true → keep; reject → pushFilteredReason + log |
| screening.js:746 | `pool.indicator_confirmation` | attach result ke pool object utk downstream visibility |
| chart-indicators.js:1-16 | imports + DEFAULT_INTERVALS=["5_MINUTE"] + DEFAULT_CANDLES=298 | const |
| chart-indicators.js:18-23 | `normalizeIntervals` | filter `["5_MINUTE","15_MINUTE"]` only |
| chart-indicators.js:30-53 | `buildSignalSummary` | extract close/rsi/bollinger/supertrend/fibonacci dari payload.latest |
| chart-indicators.js:55-242 | `evaluatePreset(side,preset,payload)` | 8 preset switch + supertrend_plus_smi (entry-only) |
| chart-indicators.js:79-91 | `supertrend_break` | entry: supertrendBreakUp OR (bullish AND close>=supertrendValue); exit mirror bearish |
| chart-indicators.js:92-103 | `rsi_reversal` | entry: rsi<=oversold; exit: rsi>=overbought |
| chart-indicators.js:104-115 | `bollinger_reversion` | entry: close<=lowerBand; exit: close>=upperBand |
| chart-indicators.js:116-131 | `rsi_plus_supertrend` | entry: rsi<=oversold AND (supertrendBreakUp OR bullish); exit mirror |
| chart-indicators.js:132-149 | `supertrend_or_rsi` | entry: supertrend bullish OR rsi oversold; exit mirror |
| chart-indicators.js:150-171 | `bb_plus_rsi` | entry: close<=lowerBand AND rsi<=oversold; exit mirror |
| chart-indicators.js:172-188 | `fibo_reclaim` | entry: crossedUp(fib618/50/786); exit: crossedUp(fib618/50) |
| chart-indicators.js:189-205 | `fibo_reject` | entry: crossedDown(fib618/50); exit: crossedDown(fib618/50/786) |
| chart-indicators.js:206-234 | `supertrend_plus_smi` | entry-only: supertrend_break AND evaluateSmi(payload.candles); exit mirror supertrend_break |
| chart-indicators.js:235-241 | default | unknown preset → confirmed:false |
| chart-indicators.js:244-275 | `fetchChartIndicatorsForMint` | API call `/chart-indicators/{mint}?interval=&candles=&rsiLength=` |
| chart-indicators.js:277-366 | `confirmIndicatorPreset` | orchestrator: enabled check → normalizeIntervals → loop fetch+evaluate → rejectAlreadyAtBottom veto → multi-interval combine → return |
| chart-indicators.js:284-286 | disabled guard | `!enabled \|\| !mint \|\| !preset` → `{confirmed:true, enabled:false}` |
| chart-indicators.js:304-314 | `rejectAlreadyAtBottom` veto | opt-in entry-only; RSI<oversold AND close<lowerBand → confirmed=false |
| chart-indicators.js:323-332 | per-interval error catch | push `{ok:false, confirmed:null}` |
| chart-indicators.js:336-347 | all-fail fail-open | `successful.length===0` → `{confirmed:true, skipped:true, reason:"API unavailable"}` |
| chart-indicators.js:349-352 | multi-interval combine | `requireAll ? successful.every : successful.some` |
| token.js:88-192 | `getTokenHolders` | fetch top 100 holders + Jupiter audit; expose `funding{address,amount,slot}` raw per-holder; compute `top10Pct`; NO `common_funder`/`funded_same_window` compute |
| token.js:113-118 | `funding` field | raw per-holder `addressInfo.fundingAddress/Amount/Slot` dari Jupiter |
| token.js:121-122 | `realHolders` + `top10Pct` | filter `!is_pool` + reduce top10 pct |
| index.js:820-849 | post-recon filter | Meteora path: launchpad allow/block + `bot_holders_pct > maxBotHoldersPct` filter; GMGN skip (upstream filtered) |
| index.js:836-842 | bot-holder filter | `botPct > maxBotHoldersPct` → drop + filteredOut + log |
| index.js:925-960 | 3 soft-signal injection | candidateMomentum/expectedYieldSignal/smartWalletMomentum try/catch fail-open |
| index.js:929-934 | `momentum:` line | `formatCandidateMomentum(getCandidateMomentum(pool.pool))` |
| index.js:940-950 | `yield_to_me:` line | `formatYieldToMe({deployAmountSol, solPriceUsd, tvlUsd, feeActiveTvlRatio})` |
| index.js:955-960 | `sw_momentum:` line | `formatSmartWalletMomentum(getSmartWalletMomentum(pool.pool))` |
| index.js:966-978 | gmgn candidate block | `formatGmgnCandidateForPrompt(pool)` + pvpLine + sw + activeBin + 3 soft lines + narrative/memory sanitize |
| index.js:983-997 | meteora candidate block | metrics/audit/gmgnPrice/pvp/sw/activeBin/1h + 3 soft lines + narrative/memory sanitize |
| candidate-memory.js:51-80 | `recordCandidateSnapshots` | 1 snap per candidate per cycle; `MAX_SNAPSHOTS=8`; 24h prune |
| candidate-memory.js:87-105 | `getCandidateMomentum` | oldest→newest TVL/volume/mcap delta_pct; `<2 snaps → first_sighting` |
| candidate-memory.js:117-145 | `getSkipReview` | counterfactual #8: pool snapshotted tapi never deployed, mcap drift oldest→newest |
| candidate-memory.js:151-161 | `formatCandidateMomentum` | render `tvl +X%, vol +Y%, mcap +Z% over N samples (~Mm)` atau `first sighting` |
| candidate-memory.js:169-185 | `recordSmartWalletCounts` | append `sw_snaps[].count` per cycle; `MAX_SNAPSHOTS=8` |
| candidate-memory.js:191-199 | `getSmartWalletMomentum` | oldest→newest count delta; `<2 snaps → null` |
| candidate-memory.js:205-209 | `formatSmartWalletMomentum` | render `smart wallets entering(+N): X→Y over M cycles` atau `leaving(-N)`; flat → null |
| screening.js:46-67 | `formatYieldToMe` | `sharePct = depUsd/tvl × 100` + `dep × feeActiveTvlRatio SOL` + `(proxy — ignores bin concentration)` label |

---

## §B. Alur data: screening → indicator gate → bundler → soft-signal → block

```
getTopCandidates (screening.js:606)
  └─ eligible[] (post occupied/cooldown/score/PVP/dev-blocklist)
      │
      ├─ IF config.indicators.enabled (719):
      │   └─ Promise.all(eligible.map → confirmIndicatorPreset({mint, side:"entry"}))
      │       │
      │       └─ chart-indicators.js:277
      │           ├─ !enabled || !mint || !preset → {confirmed:true, enabled:false} (284-286)
      │           ├─ normalizeIntervals(intervals) → ["5_MINUTE"?, "15_MINUTE"?] (288)
      │           ├─ targets.length===0 → {confirmed:true, enabled:false} (289-291)
      │           ├─ FOR interval of targets:
      │           │   ├─ fetchChartIndicatorsForMint(mint,{interval,refresh}) (296)
      │           │   ├─ evaluatePreset(side,preset,payload) (297) → 8 preset switch (79-242)
      │           │   ├─ IF side="entry" && confirmed && rejectAlreadyAtBottom:
      │           │   │   └─ RSI<oversold AND close<lowerBand → confirmed=false (304-314)
      │           │   └─ push {interval, ok:true, confirmed, reason, signal, latest} (315-322)
      │           ├─ CATCH error → push {ok:false, confirmed:null} (323-332)
      │           ├─ successful = results.filter(ok:true) (336)
      │           ├─ successful.length===0 → {confirmed:true, skipped:true} (337-347)  ← fail-open
      │           ├─ requireAll = !!requireAllIntervals (349)
      │           ├─ confirmed = requireAll ? successful.every : successful.some (350-352)
      │           └─ return {enabled:true, confirmed, skipped:false, preset, side, requireAllIntervals, reason, intervals}
      │       │
      │       └─ CATCH error → {confirmed:true, skipped:true, reason:"unavailable"} (728-738)  ← outer fail-open
      │       │
      │       └─ confirmationByPool Map (742)
      │       └─ filter confirmedEligible (744-752):
      │           ├─ pool.indicator_confirmation = confirmation (746)
      │           ├─ !confirmation || confirmation.confirmed → keep
      │           └─ reject → pushFilteredReason + log
      │       └─ eligible = confirmedEligible (752)
      │
      └─ return {candidates: eligible, ...} (758)
          │
          ↓
runScreeningCycle (index.js:778) → recon → post-recon filter (820-849)
  └─ Meteora path:
      ├─ launchpad not in allowedLaunchpads → drop (826-829)
      ├─ launchpad in blockedLaunchpads → drop (831-834)
      └─ bot_holders_pct > maxBotHoldersPct → drop (836-842)  ← bundler gate
  └─ GMGN path: `if (pool.gmgn) return true` (824) — skip (upstream filtered)
      │
      ↓
candidate block assembly (index.js:920-998)
  ├─ momentumLine = candidateMomentum ? formatCandidateMomentum(...) : null (929-934)
  ├─ yieldLine = expectedYieldSignal ? formatYieldToMe(...) : null (940-950)
  ├─ swMomentumLine = smartWalletMomentum ? formatSmartWalletMomentum(...) : null (955-960)
  └─ block = [...].filter(Boolean).join("\n")
      ├─ gmgn path (966-978): POOL + formatGmgnCandidateForPrompt + pvp + sw + activeBin + momentum + yield + sw_momentum + narrative_untrusted + memory_untrusted
      └─ meteora path (983-997): POOL + metrics + audit + gmgnPrice + pvp + sw + activeBin + 1h + momentum + yield + sw_momentum + narrative_untrusted + memory_untrusted
```

---

## §C. Sinkron: siapa-panggil-siapa

| Pemanggil (file:line) | Dipanggil (file:line) | Trigger | Data lewat | Fail-mode |
|---|---|---|---|---|
| screening.js:723 | chart-indicators.js:277 `confirmIndicatorPreset` | `config.indicators.enabled && eligible.length>0` | `{mint: pool.base.mint, side:"entry"}` | error → `{confirmed:true, skipped:true}` (fail-open candidate PASS) |
| chart-indicators.js:296 | chart-indicators.js:244 `fetchChartIndicatorsForMint` | per interval loop | `{mint, interval, refresh}` | error → push `{ok:false}` (323-332); all-fail → fail-open |
| chart-indicators.js:297 | chart-indicators.js:55 `evaluatePreset` | per interval after fetch | `(side, preset, payload)` | unknown preset → `{confirmed:false, reason:"Unknown preset"}` (235-241) |
| chart-indicators.js:218 | smi.js `evaluateSmi` | `preset==="supertrend_plus_smi" && side==="entry"` | `(payload.candles, {pdLookback, paLookback, crossWindow})` | UNKNOWN — verify F16 |
| chart-indicators.js:281 | config.indicators.intervals | preset resolve | `intervals` arg default | empty → `{confirmed:true, enabled:false}` (289-291) |
| index.js:836 | config.screening.maxBotHoldersPct | post-recon filter | Jupiter `bot_holders_pct` | null botPct → lewat (skip filter) |
| index.js:931 | candidate-memory.js:87 `getCandidateMomentum` | `candidateMomentum` experiment ON | `pool.pool` | try/catch → null line (933) |
| index.js:942 | screening.js:46 `formatYieldToMe` | `expectedYieldSignal` ON | `{deployAmountSol, solPriceUsd, tvlUsd, feeActiveTvlRatio}` | try/catch → null line (949) |
| index.js:957 | candidate-memory.js:191 `getSmartWalletMomentum` | `smartWalletMomentum` ON | `pool.pool` | try/catch → null line (959) |
| candidate-memory.js:51 | (file I/O) `paths.candidateMemoryPath` | tiap `runScreeningCycle` always (shadow logging) | `candidates[]` | error → silent (UNKNOWN — no try/catch around save) |

---

## §D. Logika kunci per fungsi

### `confirmIndicatorPreset` (chart-indicators.js:277-366)
- **Apa**: orchestrator — cek enabled → loop intervals → fetch+evaluate per interval → optional veto → multi-interval combine → return verdict.
- **Kapan dipicu**: ENTRY gate di screening.js:723 (per eligible pool, parallel); EXIT gate di index.js `getIndicatorExitSignal` (F3:1516, opt-in `exitEnabled`).
- **Output**: `{enabled, confirmed, skipped, preset, side, requireAllIntervals, reason, intervals: results[]}`.
- **Sinkron**: `pool.indicator_confirmation = confirmation` (screening.js:746) attach utk downstream. `intervals[]` details bila LLM/debug butuh.
- **Fail-mode**: 3 lapis fail-open — (1) disabled → confirmed=true; (2) all-intervals-error → confirmed=true, skipped=true; (3) outer try/catch di caller (screening.js:728) → confirmed=true, skipped=true. ANY error path = candidate PASS.
- **Bukti**: chart-indicators.js:277-366, screening.js:719-756.

### `evaluatePreset` (chart-indicators.js:55-242)
- **Apa**: pure fn — baca `payload.latest` → switch 8 preset → return `{confirmed, reason, signal}`.
- **Kapan dipicu**: di dalam `confirmIndicatorPreset` per interval (297).
- **Output**: `{confirmed:bool, reason:string, signal:summary}`. `signal` = `buildSignalSummary(payload)` (30-53).
- **Sinkron**: caller combine via `requireAll ? every : some`. `signal` di-pass ke rejectAlreadyAtBottom veto (305).
- **Fail-mode**: unknown preset → `{confirmed:false, reason:"Unknown preset"}` (235-241). `payload.latest` missing → summary fields null → preset comparison false → confirmed=false (NOT fail-open — silent reject bila API return empty).
- **Bukti**: chart-indicators.js:55-242.

### `rejectAlreadyAtBottom` veto (chart-indicators.js:304-314)
- **Apa**: opt-in veto — confirmed entry → flip false bila RSI<oversold AND close<lowerBand.
- **Kapan dipicu**: di `confirmIndicatorPreset` per interval after evaluate (304).
- **Output**: mutasi `confirmed` + `reason` lokal. Tidak return value.
- **Sinkron**: kontrak — "single-side-below butuh room dump into range". Kalau token sudah di dasar, tidak ada ruang turun lagi ke range kita → entry tidak masuk akal.
- **Fail-mode**: opt-in default OFF. `signal` missing (s.rsi null) → atBottom=false → no veto (fail-safe = candidate PASS).
- **Bukti**: chart-indicators.js:304-314, config default OFF.

### Indicator ENTRY gate (screening.js:719-756)
- **Apa**: hard-drop filter — `Promise.all` over eligible → filter confirmed → reject push to filteredOut.
- **Kapan dipicu**: di `getTopCandidates` setelah dev-blocklist filter (705-717), sebelum return.
- **Output**: `eligible` berkurang; `pool.indicator_confirmation` terattach; `filteredOut` append reject reasons.
- **Sinkron**: return ke `runScreeningCycle` (index.js:778) → candidates masuk recon + block assembly.
- **Fail-mode**: outer try/catch (728-738) → confirmed=true, skipped=true → candidate PASS. `config.indicators.enabled=false` → skip gate seluruhnya (719).
- **Bukti**: screening.js:719-756.

### `formatYieldToMe` (screening.js:46-67)
- **Apa**: pure fn — hitung rough "expected yield to me" dari data on-hand. 2 angka: share of pool TVL + fee capture proxy.
- **Kapan dipicu**: di candidate block assembly (index.js:942) saat `expectedYieldSignal` ON.
- **Output**: `~X.XX% of pool TVL ($A / $B), ~Y.YYYY SOL fees/window (proxy — ignores bin concentration)` atau null.
- **Sinkron**: line inject ke candidate block (gmgn 974 / meteora 993) via `.filter(Boolean)`.
- **Fail-mode**: input unusable (dep<=0 OR price/tvl null OR ratio<=0) → parts empty → return null (65). Try/catch caller (949).
- **Bukti**: screening.js:46-67, index.js:940-950.

### `getCandidateMomentum` / `formatCandidateMomentum` (candidate-memory.js:87-161)
- **Apa**: baca `snaps[]` per pool → oldest vs newest delta_pct (TVL/volume/mcap) → render 1 line.
- **Kapan dipicu**: saat `candidateMomentum` ON (index.js:929).
- **Output**: `{samples, span_min, tvl_delta_pct, volume_delta_pct, mcap_delta_pct}` atau `{samples, first_sighting}` bila `<2 snaps`. Format: `tvl +X%, vol +Y%, mcap +Z% over N samples (~Mm)` atau `first sighting (no momentum history yet)`.
- **Sinkron**: shadow `recordCandidateSnapshots` (51-80) selalu jalan tiap cycle → data accrue bahkan saat experiment OFF.
- **Fail-mode**: pool address null → null (88). `<2 snaps` → first_sighting (91). Format null parts → null (159). Try/catch caller (933).
- **Bukti**: candidate-memory.js:51-161, index.js:929-934.

### `getSmartWalletMomentum` / `formatSmartWalletMomentum` (candidate-memory.js:191-209)
- **Apa**: baca `sw_snaps[]` per pool → oldest vs newest count delta → render 1 line HANYA bila delta≠0.
- **Kapan dipicu**: saat `smartWalletMomentum` ON (index.js:955).
- **Output**: `{first, last, delta, samples}` atau null. Format: `smart wallets entering(+N): X→Y over M cycles` atau `leaving(-N)`. Flat (delta=0) → null.
- **Sinkron**: shadow `recordSmartWalletCounts` (169-185) — dipicu di index.js:901 (F14) dari `passing` rows after sw fetch.
- **Fail-mode**: `<2 snaps` → null (194). first/last null → null (197). delta=0 → null (206). Try/catch caller (959).
- **Bukti**: candidate-memory.js:169-209, index.js:955-960.

### Bot-holder filter (index.js:836-842)
- **Apa**: hard-drop — `bot_holders_pct > maxBotHoldersPct` → reject. Meteora path only.
- **Kapan dipicu**: post-recon filter (820-849) per candidate.
- **Output**: drop + `filteredOut.push({name, reason:"bot holders X% > Y%"})` + log.
- **Sinkron**: GMGN path skip (824 `if pool.gmgn return true`) — upstream gmgn.js sudah filter `bundler_rate`.
- **Fail-mode**: `botPct=null` (Jupiter API null) → skip filter (lewat). `maxBotHoldersPct=null` → skip filter.
- **Bukti**: index.js:836-842.

---

## §E. Temuan: bug / gap / kontrak-kunci / fail-open tak-terpenuhi

### E1. BUG (CLAUDE.md stale) — `common_funder`/`funded_same_window` TIDAK ADA di token.js
- **Klaim CLAUDE.md:212-219**: "Bundler Detection (token.js) — Two signals used in `getTokenHolders()`: `common_funder` — multiple wallets funded by same source; `funded_same_window` — multiple wallets funded in same time window".
- **Realitas**: token.js:88-192 TIDAK compute signals tersebut. Hanya expose raw `funding {address, amount, slot}` per-holder (113-118) dari Jupiter `addressInfo.fundingAddress/Amount/Slot`. LLM (atau downstream consumer) harus interpret sendiri.
- **Impact**: User baca CLAUDE.md → expect gate mekanis di token.js → sebenarnya cuma raw data utk LLM judgment. Tidak ada hard-rule bundler detect di token.js path.
- **Fix**: update CLAUDE.md — ganti "Two signals used in getTokenHolders()" → "Raw `funding{address,amount,slot}` exposed per-holder; bundler judgment delegated to LLM/scoring. LIVE hard bundler gate = `maxBotHoldersPct` (post-recon, Meteora) + `gmgn.maxBundlerRate` (GMGN pipeline)."

### E2. BUG (DEAD CONFIG KEY) — `maxBundlersPct` di CLAUDE.md tapi TIDAK di kode
- **Klaim CLAUDE.md:83,218**: `maxBundlersPct | screening | 30` + "Thresholds in config: `maxBundlersPct` (default 30%)".
- **Realitas**: grep `maxBundlersPct` → ONLY CLAUDE.md. Tidak ada di config.js default (151), CONFIG_MAP (executor.js:344 cuma `maxBotHoldersPct`), config-schema.js (67 cuma `maxBotHoldersPct`), atau logic. LIVE key = `maxBotHoldersPct` (default 30, config.js:151) + `gmgn.maxBundlerRate` (default 0.5, config.js:188).
- **Impact**: user set `maxBundlersPct: 25` di user-config.json → silent ignore (no effect). `update_config` tool akan reject dengan "unknown key" (CONFIG_MAP miss). Setup.js (312) expose `maxBundlerRate` (GMGN) bukan `maxBundlersPct`.
- **Fix**: hapus baris `maxBundlersPct` dari CLAUDE.md tabel config + section "Bundler Detection". Ganti dengan `maxBotHoldersPct` (sudah ada di tabel sebelahnya).

### E3. GAP — `evaluatePreset` silent-reject bila `payload.latest` missing
- **Lokasi**: chart-indicators.js:30-53 `buildSignalSummary` → semua field null bila payload kosong.
- **Masalah**: preset comparison (e.g. `close<=lowerBand`) → false → `{confirmed:false, reason:"..."}` (235-241 default). Bukan fail-open.
- **Kontras**: `confirmIndicatorPreset` outer catch (323-332) push `{ok:false}` → all-fail path fail-open (337-347). TAPI bila API return `{latest:null}` dengan 200 OK → `ok:true, confirmed:false` → counted sebagai successful → veto multi-interval combine → confirmed=false (reject).
- **Impact**: API return empty/latest-missing → candidate silent REJECT (bukan pass). Beda dari fail-open kontrak "API down → candidate PASS".
- **Severity**: low — API contract seharusnya selalu return `latest`. TAPI bila pernah return `{ok:200, latest:null}` → unintended hard-reject.
- **Open-Q**: verify API contract — apakah `latest` selalu present bila 200 OK? bila ya, gap tak praktis. Bila tidak, perlu guard `if (!payload.latest) throw` (route ke error catch → fail-open).

### E4. GAP — `recordCandidateSnapshots` / `recordSmartWalletCounts` no try/catch
- **Lokasi**: candidate-memory.js:51-80, 169-185.
- **Masalah**: `load()`/`save()` I/O tanpa try/catch di outer fn. `load()` internal try/catch (35-39) return `{}` bila parse error. TAPI `save()` (42-44) `fs.writeFileSync` tanpa try → error propagate ke caller (index.js:793/901).
- **Impact**: disk full / permission error → exception lewat ke `runScreeningCycle` → cycleFail (F14). Bukan fail-open.
- **Kontrak CLAUDE.md**: "Fail-open everywhere" untuk experiments. `recordCandidateSnapshots` = shadow logging infrastruktur (bukan experiment code path) → kontrak tak strict, tapi tetap risk.
- **Fix**: wrap `save(db)` di try/catch → log + silent return.

### E5. KONTRAK — fail-open 3-lapis di `confirmIndicatorPreset`
- **Lapis**: (1) disabled → confirmed=true (284-286); (2) all-intervals-error → confirmed=true, skipped=true (337-347); (3) outer caller try/catch → confirmed=true, skipped=true (screening.js:728-738).
- **Kontrak**: API unavailable → candidate PASS (no penalty). Betul untuk entry gate — tak mau block semua deploy karena API down.
- **Trade-off**: API down berkepanjangan → SCREENER lihat semua candidate confirmed → deploy tanpa filter timing → bisa beli di puncak. TAPI `runSafetyChecks` (F7) tetap filter fundamental (tvl/fee/holders). Indicator = timing layer, bukan safety layer.
- **Bukti**: chart-indicators.js:284-347, screening.js:719-738.

### E6. KONTRAK — trusted vs untrusted text split
- **Trusted lines** (our own metric, no sanitize): `momentum:`, `yield_to_me:`, `sw_momentum:`, `audit:`, `metrics:`, `1h:`, `active_bin:`, `smart_wallets:`, `pvp:`.
- **Untrusted lines** (external text, sanitize 500 char): `narrative_untrusted:`, `memory_untrusted:` → `sanitizeUntrustedPromptText(text, 500)`.
- **Kontrak**: label `_untrusted` + sanitize → prompt-injection defense. Trusted lines dari code/our own metric.
- **Bukti**: index.js:973-977 (gmgn) + 992-997 (meteora).

### E7. KONTRAK — `requireAllIntervals` default false (some) = longgar
- **Default**: config.js `requireAllIntervals: false` (verify F26). Berarti `successful.some(confirmed)` = salah satu interval confirmed cukup.
- **Trade-off**: 5_MINUTE confirmed bullish TAPI 15_MINUTE bearish → entry PASS (default). User strict → set `requireAllIntervals: true` → both must confirm.
- **Bukti**: chart-indicators.js:349-352.

### E8. KONTRAK — SMI entry-only, exit mirror supertrend_break
- **Lokasi**: chart-indicators.js:206-234 `supertrend_plus_smi` case.
- **Kontrak**: SMI (Ehlers SMI) computed client-side via `evaluateSmi(payload.candles, …)` — entry-only. Exit path mirror `supertrend_break` exit (229-233) supaya preset = complete pair (exit jalan saat `exitEnabled`).
- **Reason**: server tak return SMI series; bot compute dari `payload.candles[]`. Exit logic SMI tak di-design.
- **Bukti**: comment 209-210.

---

## §F. Glosarium istilah fase

- **preset** — 8 aturan kombinasi indikator (supertrend_break, rsi_reversal, bollinger_reversion, rsi_plus_supertrend, supertrend_or_rsi, bb_plus_rsi, fibo_reclaim, fibo_reject) + supertrend_plus_smi (SMI variant). Dipilih via `indicatorEntryPreset`/`indicatorExitPreset`.
- **interval** — timeframe candle. Aktif: `5_MINUTE`, `15_MINUTE` (chart-indicators.js:18-23). Multi-interval = cek beberapa timeframe sekaligus.
- **requireAllIntervals** — true = semua interval confirmed; false (default) = some (salah satu cukup).
- **rejectAlreadyAtBottom** — opt-in veto entry: RSI<oversold AND close<lowerBand → confirmed=false. Single-side-below butuh room dump into range.
- **SMI** — Ehlers Stochastic Momentum Index, client-side, entry-only via `supertrend_plus_smi`. Server tak return; bot compute dari `payload.candles[]`.
- **bundler** — bot farm beli serentak. LIVE detect: Meteora = `bot_holders_pct` (Jupiter audit, `maxBotHoldersPct`); GMGN = `bundler_rate` (GMGN API, `gmgn.maxBundlerRate`).
- **maxBundlersPct** — DEAD CONFIG KEY di CLAUDE.md, tak ada di kode.
- **maxBotHoldersPct** — LIVE config key, default 30%. Post-recon filter Meteora path (index.js:838).
- **soft signal** — trusted line inject ke candidate block, opt-in, fail-open, NEVER gate deploy (momentum/yield/sw_momentum).
- **shadow logging** — record snapshots selalu (bahkan saat experiment OFF) → data accrue, "recording ≠ influencing".
- **fail-open** — API error → candidate PASS (no penalty). 3-lapis di `confirmIndicatorPreset`.
- **trusted vs untrusted** — trusted = our own metric (no sanitize); untrusted = external text (sanitize 500 char + `_untrusted:` label).
- **indicator_confirmation** — field attached ke pool object (screening.js:746) utk downstream visibility. Contains `{enabled, confirmed, skipped, preset, side, intervals[]}`.

---

## §G. Link fase lain (cross-ref)

- **F2 (cycles)**: `runScreeningCycle` (index.js:665) trigger `getTopCandidates` (778) → F15 indicator gate jalan di dalam `getTopCandidates`. F15 = sub-step F2.
- **F3 (exits)**: `getIndicatorExitSignal` (index.js:1515-1528) opt-in `indicators.exitEnabled` default OFF — exit gate versi F15. `confirmIndicatorPreset({mint, side:"exit"})`. Mirror entry logic.
- **F5 (prompt)**: `prompt.js:135-139` RISK SIGNALS sebut `maxTop10Pct` guideline. `prompt.js:133` kontrak `bots > maxBotHoldersPct% → already hard-filtered before you see the candidate list` — betul (index.js:836-842 post-recon filter pre-LLM). TAPI `maxBundlersPct` tak disebut di prompt (karena dead key).
- **F6 (definitions)**: definitions.js:409 list 13 indicator config keys (chartIndicatorsEnabled, indicatorEntryPreset, indicatorExitPreset, indicatorExitEnabled, indicatorRejectAtBottom, rsiLength, indicatorIntervals, indicatorCandles, rsiOversold, rsiOverbought, requireAllIntervals, smiPdLookback, smiPaLookback, smiCrossWindow).
- **F14 (funnel)**: F14 sebut injection point locations (928-960) + post-recon filter (820-849). F15 = DEPTH dari 3 hal itu: indicator gate logic, bundler defense, soft-signal format functions.
- **F16 (GMGN indicators)**: `checkBounceSetup` (gmgn.js:444-510) = GMGN path version dari F15 indicator gate. Detail di F16.
- **F26 (config core)**: `config.indicators` defaults (enabled, entryPreset, exitPreset, exitEnabled=false, rejectAlreadyAtBottom=false, intervals, candles=298, rsiLength=2, rsiOversold=30, rsiOverbought=80, requireAllIntervals=false, smiPdLookback=5, smiPaLookback=3, smiCrossWindow=3). `config.screening.maxBotHoldersPct=30`, `maxTop10Pct=60`. `config.gmgn.maxBundlerRate=0.5`.
- **F27 (experiments)**: GRUP 16 — 3 soft-signal experiments (candidateMomentum, expectedYieldSignal, smartWalletMomentum) + `rejectAlreadyAtBottom` opt-in. Semua default OFF + fail-open.

---

## §H. Open-Q (bawa ke fase lain)

- **E3 → F16**: verify API contract `/chart-indicators/{mint}` — apakah `latest` selalu present bila 200 OK? Bila ya, silent-reject gap tak praktis. Bila tidak, perlu guard `if (!payload.latest) throw` route ke error catch.
- **E4 → F17/F23**: `recordCandidateSnapshots` no try/catch di `save()` — disk error propagate. Audit other memory stores (pool-memory, decision-log, state.json) utk pattern sama.
- **E1/E2 → F29 (config-doc)**: CLAUDE.md stale `maxBundlersPct` + `common_funder`/`funded_same_window`. Fix saat F29 (config core review) atau bikin tiket terpisah utk doc update.
- **SMI → F16**: `evaluateSmi` (smi.js) — verify implementation, parameter default, fail mode. Belum dibaca di F15.
- **GMGN indicatorRules → F16**: `checkBounceSetup` (gmgn.js:444-510) rule-based path — verify 5 rules (requireBullishSupertrend/rejectAlreadyAtBottom/requireAboveSupertrend/minRsi/maxRsi/requireBbPosition) + default values.
- **exitEnabled → F3**: EXIT gate sudah cover di F3, tapi verify `indicatorExitPreset` valid values (8 preset sama dengan entry?). F15 fokus entry; F3 fokus exit. Sumber sama (`confirmIndicatorPreset` side="exit").
