# Audit F19 — Capture belajar (mandatory deep) — recordPerformance jantung
> Read-only. Bukti `file:line`. UNKNOWN kalau tak pasti. Resume: buka file ini.
> Kedalaman: ⬛⬛ mandatory deep — alasan: 3 caller path 2 live close (relay 2348 + public 2652) + 1 paper close (1693) → `recordPerformance` tunggal `lessons.js:156` → side-effect ganda (push lesson + recordPoolDeploy + evolve trigger + Darwin trigger + hive push + suspect quarantine + paper tag stamp); 3 isolation contract berlapis (`paper:true` mode, `active_setup` racikan, `suspect_pnl` ≤-90% non-stopLoss) diterapkan di 7 consumer (lesson stamp/hive, pool-memory, livePerf evolve, Darwin recalc, hive event, getLessonsForPrompt, getModePerformance); `derivLesson` 4 outcome bucket (good/neutral/poor/bad) + 6 rule-template (AVOID-OOR/PREFER/AVOID-volume-collapse/WORKED/FAILED) + confidence evidence-based 0.22-0.88; `buildSignalSnapshot` 15 PERFORMANCE_SIGNAL_FIELDS utk shadow correlation; `keepActiveRacikan` filter di chokepoint evolve + getModePerformance+getExcludedRacikanStats+getHourlyProfile+getNarrativeProfile; `evolveThresholds` tiap 5 close LIVE aktif-racikan (tulis balik user-config.json via `reloadScreeningThresholds` 311) gated `learning.evolveEnabled` (FREEZE); Darwin recalc gated `darwin.enabled` terpisah.
> Cross-ref: F10 (closePosition 2 path → recordPerformance trigger), F12 (PnL tutup compute → initial/final/fees/pnl_pct dikirim), F13 (paper:true stamp isolation contract — F13 tag sediakan, F19 konsumen tag), F17 (state.js peak_pnl_pct/trough_pnl_pct/price_peak/trough sumber 4 field), F18 (updatePnlAndCheckExits mutasi peak/trough setiap poll), F20 (evolveThresholds detail + 84 record lama archive bug), F21 (Darwin recalcWeights terpisah), F22 (getModePerformance + getLessonsForPrompt mode-scoped), F23 (pool-memory recordPoolDeploy cross-store), F24 (reports.js consume performance[] utk PF/DD/by-tier/movement), F25 (briefing getModePerformance trade-stats), F26 (config.activeSetup racikan isolation, config.learning.evolveEnabled FREEZE, config.darwin.enabled).

## Ringkasan eksekutif (5 baris)
1. **1 funnel, 3 caller path, 7 side-effect**. `recordPerformance({perf})` (lessons.js:156-337) = satu-satunya titik tulis ke `lessons.json.performance[]`. Caller: `closePosition` relay branch `closePosition`→`derivedLesson1` (dlmm.js:2348) + `closePosition` public branch →`derivedLesson2` (dlmm.js:2652) — 2 path live, sama payload (peak/trough/active_setup signal_snapshot exitMarket paper=NULL implisit) beda flag `relay:true` (dlmm.js:2412) vs non-relay. `closePaperPosition`→`derivedLesson` (dlmm.js:1693) = paper path, payload sama + `paper:true` eksplisit (dlmm.js:1728). Side-effect per call: (1) compute pnl_usd/pct/range_efficiency; (2) build signal_snapshot (lessons.js:121-130, 15 fields); (3) stamp suspect_pnl bila ≤-90% non-stopLoss + alert Telegram fire-and-forget (lessons.js:199-220); (4) push entry ke performance[]; (5) derive lesson + `paper:true`/`suspect:true` stamp + push lesson[] + log; (6) `recordPoolDeploy` utk LIVE non-suspect (lessons.js:265-289); (7) evolve trigger bila `livePerf.length % 5 === 0` + Darwin + hive event.
2. **3 isolation contract diterapkan KONSISTEN lewat tag**. (a) `paper:true` (perf.paper — datang dari dlmm.js:1728 paper path saja) → record + lesson stamp `lesson.paper=true` (lessons.js:250) → exclude hive lesson push (257) + pool-memory skip (265) + livePerf filter (298) + hive event skip (328) + getLessonsForPrompt exclude bila live-mode-unless-opt-in (765-766) + getModePerformance filter (963-967 mode-scoped). (b) `active_setup` racikan — `keepActiveRacikan(p)` (lessons.js:893-895) = `(p?.active_setup ?? null) === (config.activeSetup ?? null)` → livePerf filter (298) + getModePerformance (972) + getExcludedRacikanStats (998) + getHourlyProfile (1050) + getNarrativeProfile (1155) + evolveThresholds chokepoint filter (462). (c) `suspect_pnl:true` (≤-90% non-stopLoss, `initial_value_usd>=20`) — record stamp (lessons.js:240) → exclude lesson hive / pool-memory / livePerf / hive event / getLessonsForPrompt (770) / getModePerformance (972) — karantina data tak terverifikasi sampai operator verifikasi. Tag = kontrak lokal (persisted), consumer = guard penerima. Tak ada broadcast.
3. **`derivLesson` 5-rule + 4-outcome bucket** (lessons.js:344-446). Outcome: `good` (pnl≥5% ATAU pnl≥0&feeYield≥2%) / `neutral` (pnl≥0 tanpa good — return null, tak pelajari) / `poor` (pnl -5..0%) / `bad` (pnl<-5%). 5 rule-template: `AVOID-OOR` (range_eff<30 & bad → widerr bin_range / bid_ask) / `PREFER` (range_eff>80 & good → entry mcap/tvl/vol context) / `AVOID-volume-collapse` (bad + close_reason includes "volume") / `WORKED` (good generic) / `FAILED` (bad generic). Confidence evidence-based: good positiveEvidence=0.82 else 0.22; bad negativeEvidence=0.88 else 0.45; poor=0.68/0.32. Neutral = null lesson (tak masuk loop belajar). Lesson objek = {id:Date.now(), rule, tags, outcome:"performance", confidence, context, pnl_pct, fees_earned_usd, initial_value_usd, range_efficiency, close_reason, pool, entry_*/exit_*}. `sourceType:"performance"` bedain dari manual lesson (addLesson) + evolve summary lesson (`outcome:"manual"`, tags ["evolution","config_change"]).
4. **FREEZE + racikan isolation di trigger**. Trigger evolve (lessons.js:298-324): `livePerf = !paper && !suspect && keepActiveRacikan`. Bila `livePerf.length > 0 && % 5 === 0` → cek `config.learning?.evolveEnabled === false` (FREEZE baseline, tak tulis user-config) (305); else `evolveThresholds(livePerf, config)` (309) → bila changes → `reloadScreeningThresholds()` (311) (config.js:531 re-baca thresholds tanpa restart). Darwin terpisah: bila `config.darwin?.enabled` → `recalculateWeights(livePerf, config)` (318-322) — toggle independen dari evolveEnabled. MIN_EVOLVE_POSITIONS=5 konstanta (lessons.js:21), bukan config — pemicu hardcoded. Manual `/evolve` (REPL) langsung call `evolveThresholds(getAllPerformance(), config)` → filter keepActiveRacikan di chokepoint (462) → tetap mode-isolated.
5. **persist-write = atomic sychronous JSON**. `load()` (106-115) baca file (return `{lessons:[],performance:[]}` kalau absent/parse-fail). `save()` (117-119) `fs.writeFileSync` sync. lessons.json shape: `{lessons:[...], performance:[...]}`. Archive separate file `paths.lessonsArchivePath` (903) — 84 record lama mainzen_v2 pre-baseline reset (F20 bug konteks). Per record field mandatori: position/pool/pool_name/base_mint/strategy/bin_range/bin_step/volatility/fee_tvl_ratio/organic_score/amount_sol/deployed_at/narrative_category/active_setup/peak_pnl_pct/trough_pnl_pct/price_peak_pct/price_trough_pct/fees_earned_usd/final_value_usd/initial_value_usd/minutes_in_range/minutes_held/close_reason/signal_snapshot/entry_*/exit_*/pnl_usd/pnl_pct/range_efficiency/opened_at/closed_at/open_hour_wib/open_session/recorded_at/[paper]/[suspect_pnl/suspect_reason].

## Progress
- [x] Spec F19 baca PLAN-audit-meridian Bagian 3 line 74
- [x] Cross-ref F10 close (recordPerformance 3 caller), F13 paper stamp, F17 peak/trough source, F18 mutation poll, F22 mode-scoped consumer, F23 pool-memory cross-store, F24/F25 downstream
- [x] Baca lessons.js 1-130 (header + load/save + buildSignalSnapshot)
- [x] Baca lessons.js 156-337 (recordPerformance full)
- [x] Baca lessons.js 344-446 (derivLesson full)
- [x] Baca lessons.js 458-570 (evolveThresholds summary)
- [x] Baca lessons.js 754-839 (getLessonsForPrompt tier + paper/suspect filter)
- [x] Baca lessons.js 893-984 (keepActiveRacikan + getModePerformance + getSuspectCount)
- [x] Baca dlmm.js 1675-1733 (closePaperPosition + paper:true payload)
- [x] Baca dlmm.js 2171-2690 (closePosition 2 path → recordPerformance relay/public)
- [x] Baca pool-memory.js 1-130 (recordPoolDeploy signature + db shape)
- [x] Detect 3 isolation contract (paper/active_setup/suspect_pnl) + 7 consumer honor-tag
- [x] Detect 4 outcome bucket + 5 rule-template + confidence evidence
- [x] Detect evolve trigger freeze + darwin split + racikan chokepoint
- [x] Tulis §0 + §A-§H

---

## §0. Cara Kerja (Bahasa Awam)

**Analogi** (dua sudut pandang sehari-hari)
- *Buku besar toko 3 jenis transaksi*: setiap barang terjual, kasir catat di buku besar. Tiket 3 warna: putih (jualan asli), kuning (simulasi/latihan), merah (curiga — angka aneh, tunggu bos periksa). Yang putih dipakai hitung untung-bulan-ini + dipake ubah aturan pilih barang besok (evolve). Yang kuning dicatat tapi angka latihan tak pernah ubah aturan jualan asli + tak dipamerkan ke bos lain di grup (hive). Yang merah dikarantina — dicatat utk audit tapi disisihkan dari hitungan sampai diverifikasi. Selain itu buku dipisah per "racikan" — catatan mainzen_v2 tak ubah aturan mainzen_v3. Tiap 5 transaksi asli, sistem eveolusi otomatis cek "winners vs losers" → naik-turun threshold minimum.
- *Analis pertandingan pasca-pertandingan*: tiap pemain tiup peluit → pelatih catat (record performance), turun kesimpulan (lesson): AVOID strategi-X di kondisi-Y, PREFER strategi-A. Sketsa per-trust: yang menang konsisten → confidence tinggi. Yang undecisive = neutral tak dipelajari. Confidence naik kalau ada bukti (feeYield≥1% / pnl≥3 / range_eff>80 utk good; pnl≤-5 / OOR / low-yield utk bad).

**Di bot, ini = learning capture layer** (1-2 kalimat)
`recordPerformance(perf)` `lessons.js:156` = funnel tunggal capture hasil close → compute PnL + flag (paper/suspect) + derive lesson + persist `lessons.json` + trigger evolve/Darwin + cross-store pool-memory + broadcast hive. `derivLesson` `lessons.js:344` rubah satu trade jadi rule teks (AVOID/PREFER/WORKED/FAILED) + confidence. `recordPoolDeploy` `pool-memory.js:104` catat per-pool history.

**Posisi fase ini di alur bot** (1 paragraf)
Datang SETELAH F10/F12 (close + PnL compute selesai, payload dikirim), SETELAH F17/F18 (peak/trough/price_peak/trough sudah terakumulasi state.js saat open). Sebelum F20 (evolve detail), F21 (Darwin detail), F22 (mode-scoped consumer), F23 (pool-memory cross-store), F24/F25 (reports/briefing consume performance[]). F19 = JANTUNG capture: tanpa fase ini, semua trade hilang ke void, tak ada lesson masuk prompt, tak ada evolve, tak ada report, tak ada briefing. Paper isolation contract (F13) pada F19 dijahit: paper tag datang dari dlmm.js:1728, F19 honor tag di 7 consumer.

**Langkah kerja** (urutan, pakai istilah teknis)
1. **Trigger**: close path selesai (F10 closePosition relay at 2348 / public at 2652 / paper at 1693) → panggil `recordPerformance(perf)` dengan payload PnL (F12 supply) + tracked (F17 supply peak/trough/active_setup/narrative_category) + exitMarket (dlmm fetch Meteora API).
2. **Compute**: `pnl_usd = final_value_usd + fees_earned_usd − initial_value_usd` (lessons.js:175); `pnl_pct = pnl_usd / initial_value_usd × 100` (177); `range_efficiency = minutes_in_range / minutes_held × 100` (179).
3. **Quarantine scan**: `suspiciousAbsurdClosedPnl` (190) bila `initial>=20 && pnl_pct<=−90 && !stop loss` → stamp `suspect_pnl:true, suspect_reason` di entry + fire-and-forget Telegram alert (203-220). `suspiciousUnitMix` (161) bila final_value_usd kelihatan SOL-sized (final ≤ amount_sol×2 + initial≥20) → SKIP record total (170 return) — bad-data guard awal.
4. **Snapshot+stamp**: `buildSignalSnapshot` (121) freeze 15 PERFORMANCE_SIGNAL_FIELDS (organic_score/fee_tvl_ratio/volatility/entry_mcap/entry_top10_pct/entry_dev_migrations …) utk shadow correlation. `wibHour(deployed_at)` → `open_hour_wib` + `open_session` (dini/pagi/siang/sore/malam). entry spread `...perf` (incl `paper:true` bila datang paper path) + computed fields + closed_at + (suspect_pnl conditional).
5. **Push entry**: `data.performance.push(entry)` (243).
6. **Derive lesson**: `derivLesson(entry)` → bila non-null → stamp `lesson.paper=true` bila `entry.paper` (250) + `lesson.suspect=true` bila `entry.suspect_pnl` (251) → `data.lessons.push(lesson)` + log `[paper]`/`[suspect]` tag (253).
7. **Save atomic**: `save(data)` sync write lessons.json (256).
8. **Hive push lesson**: bila `lesson && !paper && !suspect` → `void pushHiveLesson(lesson)` (257-259) fire-and-forget.
9. **Pool-memory cross-store**: bila `perf.pool && !paper && !suspect` → dynamic import pool-memory.js → `recordPoolDeploy(perf.pool, {...17 fields})` (265-289). Skips paper/suspect.
10. **Evolve trigger**: `livePerf = !paper && !suspect && keepActiveRacikan`. Bila length>0 && %5===0 → bila `evolveEnabled===false` (FREEZE) log only; else `evolveThresholds(livePerf, config)` → changes → `reloadScreeningThresholds()`. Darwin: bila `darwin.enabled` → `recalculateWeights(livePerf, config)` (318-322). Independen dari freeze gate.
11. **Hive event broadcast**: bila `!paper && !suspect` → `void pushHivePerformanceEvent({...entry, eventId:close:<pos>:<recorded_at>})` (328-335) fire-and-forget.
12. **Return**: `lesson || null` (337) → caller (dlmm.js) bungkus ke `derived_lesson` utk notifyClose (executor.js:803 trigger Telegram close notification dgn lesson).

**Output recordPerformance**: lesson object atau null + side-effect mutate lessons.json (entry + lesson) + pool-memory.json (per-pool deploy appended, win-rate/cooldown recalced F23) + user-config.json (evolve thresholds write, gated freeze) + signal-weights.json (Darwin recalc gated). Trigger ke fase berikut: lesson → prompt injection via `getLessonsForPrompt` (F22) → SCREENER/MANAGER loop (F4) → behavior shift.

**Kalau rusak / diskip** (2-3 kalimat, istilah teknis)
`recordPerformance` throw (dlmm.js caller pakai try-catch 1730 `paper_warn`/public catch fallback) → entry tak tercatat, lesson tak ke-derive, evolve skip cycle, hive skip. Bila `load()/save()` corrupt lessons.json (parse-fail → reset ke `{lessons:[],performance:[]}` F-perf reset 726), seluruh history hilang. Bila evolve salah naik `minFeeActiveTvlRatio` tinggi → kolam eligible shrink → SCREENER tak deploy (loops also break). `suspiciousUnitMix` false-positive → trade legit di-skip (data hilang). `suspect_pnl` flag misklasifikasi → record rugi asli dikarantina tak masuk stats (operator must verify).

**Istilah yang muncul di fase ini** (bullet, cuma yang baru)
- **PERFORMANCE_SIGNAL_FIELDS** — 15 field freeze di snapshot utk post-hoc correlation dgn PnL (organic/fee_tvl/vol/entry_*/concentration). Shadow logging (dlmm.js:48-70) sediakan hidden experiments; F19 freeze disini.
- **outcome bucket** — good/neutral/poor/bad. Neutral = tak dipelajari (return null lesson). Good = pnl≥5 OR (pnl≥0 & feeYield≥2%). Bad = pnl<-5.
- **rule-template** — 5 kerangka teks lesson derivLesson: AVOID-OOR / PREFER / AVOID-volume-collapse / WORKED / FAILED.
- **confidence evidence** — 0.22-0.88 berdasar positiveEvidence (feeYield≥1 OR fees≥3 OR pnl≥3) / negativeEvidence (pnl≤-5 OR range_eff≤30 OR close_reason OOR/low-yield/volume).
- **isolation contract** — 3 tag quarantine: `paper:true` (sim data), `active_setup` mismatch (different racikan), `suspect_pnl:true` (unverified ≤-90%). Consumer = guard penerima tag.
- **keepActiveRacikan** — `(p.active_setup ?? null) === (config.activeSetup ?? null)`. Racikan isolation chokepoint utk evolve + stats + profile.
- **evolveEnabled (FREEZE)** — `config.learning.evolveEnabled=false` → auto-evolve skip total (no user-config write). Manual `/evolve` still callable. Independen dari Darwin `darwin.enabled`.
- **MIN_EVOLVE_POSITIONS** — konstanta 5 (lessons.js:21). Pemicu evolve hardcoded, bukan config. F20 catat bug terkait archive 84 record.
- **shadow_signals** — dlmm.js captureShadowSignals (49-70) freeze momentum/sw-momentum di deploy. Masuk tracked → entry → derivLesson baca.

*Lewati §0 kalau sudah paham. Isi teknis mulai §A.*

---

## §A. Peta file fase ini (tabel file → peran)

| File | Peran di F19 | Baris kunci |
|------|--------------|-------------|
| `lessons.js` | **Funnel utama**: recordPerformance + derivLesson + signal_snapshot + session bucket + load/save + getModePerformance + getLessonsForPrompt + evolveThresholds + keepActiveRacikan + suspect quarantine + archive read | 106-119 load/save; 121-130 buildSignalSnapshot; 156-337 recordPerformance; 344-446 derivLesson; 458-570 evolveThresholds; 754-839 getLessonsForPrompt; 885-895 keepActiveRacikan; 899-985 getMode/getSuspect/getExcludedRacikan; 1046+ profile functions |
| `pool-memory.js` | **Cross-store write**: recordPoolDeploy (dipanggil dlm recordPerformance) update per-pool deploys[] + avg_pnl + win_rate + cooldown logic | 104-225 recordPoolDeploy + cooldown; 256-280 getDeployedPoolAddresses |
| `tools/dlmm.js` | **3 caller path**: closePaperPosition (paper path, paper:true) + closePosition relay branch + closePosition public branch. Sediakan tracked fields (peak/trough/active_setup/narrative) + exitMarket fetch + feesUsd/finalValueUsd/initialUsd | 1675-1733 closePaperPosition; 2172 closePosition start; 2348 relay recordPerformance; 2652 public recordPerformance |
| `tools/executor.js` | **Post-close wire**: notifyClose inject lesson + telegram. `recorded_pnl_usd/pct` + `peak_pnl_pct` + `derived_lesson` + `fees_usd` | 803 notifyClose call inside close_position executor |
| `state.js` | **Source data**: makePositionRecord (60-130) sediakan peak_pnl_pct/trough_pnl_pct/price_peak/trough initial 0 + active_setup + narrative_category. updatePnlAndCheckExits (473-589) mutasi setiap poll | 60-135 makePositionRecord; 118-125 peak/trough init; 324-359 confirmation; 507-525 trough/price track; 140-157 trackPosition |
| `config.js` | **Config consumer**: activeSetup (racikan identity) + learning.evolveEnabled (FREEZE) + darwin.enabled + screening thresholds (target evolve). reloadScreeningThresholds (531) re-baca after evolve write | activeSetup di config singleton; config.learning; config.darwin; reloadScreeningThresholds |
| `signal-weights.js` | **Darwin consumer**: recalculateWeights (dipanggil conditional). Detail di F21 | recalculateWeights |
| `hivemind.js` | **Broadcast consumer**: pushHiveLesson + pushHivePerformanceEvent (skip paper/suspect). Detail di F33 | pushHiveLesson, pushHivePerformanceEvent, getSharedLessonsForPrompt |
| `paper-trading.js` | **Paper mode identity**: isPaperMode() (dipakai getModePerformance 963 + getLessonsForPrompt 765) = flag AND DRY_RUN | isPaperMode |
| `paths.js` | **File locations**: lessonsPath + lessonsArchivePath + poolMemoryPath + userConfigPath. Per-profil resolve | lessonsPath, lessonsArchivePath |
| `decision-log.js` | **Audit trail**: appendDecision di close path (dlmm.js 2383/2687) catat close reason + market data | appendDecision |

---

## §B. Alur data hulu→hilir (ASCII diagram)

```
┌── F10/F12 (close + PnL compute) ─────────────┐
│ closePosition {position_address, reason}         │
│  → fetch exitMarket via Meteora API (2337/2641)  │
│  → compute feesUsd/finalValueUsd/initialUsd       │
│  →CloseOperation SDK (relay 2412 / public 2474)  │
└────────────────┬─────────────────────────────────┘
                 │
                 │ + tracked (state.js: peak/trough/active_setup/narrative
                 │   /signal_snapshot/entry_*/shadow_signals)
                 │ + signalSnapshot (resolvePerformanceSignalSnapshot dlmm.js:1447)
                 ▼
┌── F19 recordPerformance(perf) lessons.js:156 ──────────────────────────┐
│ 1. load() lessons.json                                                 │
│ 2. suspiciousUnitMix guard (161-173) [SKIP bila SOL-sized USD field]    │
│ 3. compute pnl_usd/pct/range_efficiency (175-181)                      │
│ 4. suspiciousAbsurdClosedPnl scan (190-221) [≤-90% non-SL + initial≥20] │
│    └→ stamp suspect_pnl:true + Telegram alert fire-and-forget          │
│ 5. buildSignalSnapshot (121-130) [15 fields + base_mint from perf]     │
│ 6. compute open_hour_wib + open_session (from deployed_at)             │
│ 7. entry = {...perf, computed, signal_snapshot, suspect_pnl?}          │
│ 8. data.performance.push(entry)                                        │
│ 9. lesson = derivLesson(entry) (344)                                   │
│    └→ stamp lesson.paper (250) / lesson.suspect (251)                 │
│    └→ data.lessons.push(lesson) + log                                  │
│10. save(data) [sync write lessons.json]                                │
│11. if lesson && !paper && !suspect → void pushHiveLesson (257)         │
│12. if pool && !paper && !suspect → recordPoolDeploy (265)             │
│    └→ pool-memory.json: deploys[] + avg_pnl + win_rate + cooldown      │
│13. livePerf = filter !paper && !suspect && keepActiveRacikan (298)     │
│14. if livePerf.length>0 && %5===0:                                     │
│    ├→ if evolveEnabled===false [FREEZE] → log only                     │
│    └→ else evolveThresholds(livePerf, config) (309)                   │
│        └→ changes? → reloadScreeningThresholds() (311) [user-config] │
│15. if darwin.enabled → recalculateWeights(livePerf, config) (318)     │
│16. if !paper && !suspect → void pushHivePerformanceEvent (328)       │
│17. return lesson||null (337)                                          │
└────────────────┬──────────────────────────────────────────────────────┘
                 │
                 ▼
┌── F22/F24/F25 consumer ────────────────────────────────────────────┐
│ getModePerformance() (963) → getLessonsForPrompt() (754) [injek prompt] │
│ getHourlyProfile() (1046) / getNarrativeProfile() (1153) [soft signal] │
│ reports.computeTradeStats() [PF/DD/by-tier/movement price_peak/trough] │
│ briefing generateBriefing [daily trade-stats]                          │
└───────────────────────────────────────────────────────────────────────┘
```

---

## §C. Sinkron: siapa-panggil-siapa

| Pemanggil (file:line) | Dipanggil (file:line) | Trigger | Data lewat | Fail-mode |
|---|---|---|---|---|
| `closePosition` (dlmm.js:2172) → recordPerformance relay (2348) | `recordPerformance` (lessons.js:156) | relay branch (2412 `relay:true`) — relay sudah submit on-chain | tracked (state.js) + feesUsd/finalUsd/initialUsd + exitMarket + peak/trough/active_setup | try-catch → log, record still attempted; throw → closePosition outer catch (2431 `if (relaySubmitted) throw`) |
| `closePosition` (dlmm.js:2172) → recordPerformance public (2652) | same | public branch — tidak submit relay, jalankan public close full | same payload, paper omited (implicit falsy) | try-catch di closePosition outer → relay fallback throw |
| `closePaperPosition` (dlmm.js:1675) → recordPerformance (1693) | same | paper path (DRY_RUN + paperTrading flag) | same + `paper:true` (1728) + m.sim fields `computePaperMetrics` (1680) | catch (1730) `paper_warn` — fail-open, sim tak block management |
| `recordPerformance` (lessons.js:248) | `derivLesson` (lessons.js:344) | entry composed post-stamp | entry (with paper/suspect tags carried) | neutral return null → no lesson push; throw → caught upstream |
| `recordPerformance` (lessons.js:266) | `recordPoolDeploy` (pool-memory.js:104) | LIVE non-suspect only | perf pool subset (17 fields: pnl, fees, range_eff, minutes_held, exitMarket, strategy) | dynamic import → throw inside → caught (logs), no pool-memory update |
| `recordPerformance` (lessons.js:308-309) | `evolveThresholds` (lessons.js:458) | livePerf.length>0 && %5===0 + evolveEnabled≠false | livePerf (filtered active-racikan non-suspect non-paper) + config | null return (tak cukup signal); changes non-empty → reloadScreeningThresholds (311) |
| `recordPerformance` (lessons.js:318) | `recalculateWeights` (signal-weights.js) | `darwin.enabled` truthy, sama trigger window | livePerf + config | log only (320-322) |
| `recordPerformance` (lessons.js:258) | `pushHiveLesson` (hivemind.js:?) | lesson non-null + !paper + !suspect | lesson objek | void (fire-and-forget) — Telegram/hive hiccup tidak block |
| `recordPerformance` (lessons.js:329) | `pushHivePerformanceEvent` (hivemind.js) | !paper && !suspect | entry base + base_mint + fees_earned_sol + eventId `close:<pos>:<recorded_at>` | void fire-and-forget |
| `recordPerformance` (lessons.js:203-220) | Telegram `sendMessage` (telegram.js) | suspect_pnl stamp | pool_name + pnl_pct + close_reason + suspect_reason | void try-catch `lessons_warn` fail-open |
| `recordPerformance` (lessons.js:243) | `save` (lessons.js:117) | post-push entry+lesson | full data objek | `fs.writeFileSync` sync — corrupt → reset parse fail on next load |
| `close_position executor` (executor.js:803) | `notifyClose` (telegram.js) | post-close result | `recorded_pnl_usd/pct` + `peak_pnl_pct` + `derived_lesson` + `fees_earned_usd` | `.catch(() => {})` — non-blocking |
| `getLessonsForPrompt` (lessons.js:754) — F22 | `keepActiveRacikan` via paper filter (766) + suspect filter (770) | agent.js build prompt | lessons array | empty array → null return |
| `getModePerformance` (lessons.js:963) — F22 | `keepActiveRacikan` + paper filter (967) + suspect filter (972) | reports/briefing/stats | performance array scoped | empty return |
| `getHourlyProfile` (lessons.js:1046) — F22 | `getModePerformance()` (line 1050) | prompt time-of-day signal | profile per session | insufficient samples → neutral |
| `getNarrativeProfile` (lessons.js:1153) — F22 | `getModePerformance()` (line 1155) | prompt narrative signal / get_narrative_profile tool | profile per category | insufficient → neutral |
| `evolveThresholds` (lessons.js:462) — F20 | `keepActiveRacikan` chokepoint filter | manual `/evolve` (raw) atau auto (already filtered) | perfData → filtered | <5 records → null |
| `getExcludedRacikanStats` (lessons.js:998) | `!keepActiveRacikan(p)` filter | `/report setups` disclosure | {count, net_usd} | {0,0} empty |
| `state.js updatePnlAndCheckExits` (473-589) — F18 | mutasi `pos.peak_pnl_pct/trough_pnl_pct/price_peak_pct/price_trough_pct` | tiap PnL poll 3s | pos + currentPnlPct + priceMovePct | no-op bila suspicious |
| `state.js makePositionRecord` (60-135) — F17 | init 4 field peak/trough=0 | trackPosition at deploy | tracked scaffold | inherited initial 0 |
| `pool-memory recordPoolDeploy` (104) — F23 | recalc avg_pnl + win_rate + cooldown + adjusted_win_rate | dipanggil recordPerformance | deployData subset | load/save sync → corrupt reset |

---

## §D. Logika kunci per fungsi

### `recordPerformance(perf)` (lessons.js:156-337)
- **Apa**: funnel tunggal capture close → derive lesson + persist + trigger evolve/Darwin/hive + cross-store pool-memory.
- **Kapan dipicu**: tiap `closePosition` sukses (live) atau `closePaperPosition` (paper) atau `closePosition` public fallback path (relay gagal/tidak dipakai).
- **Output**: `lesson | null` + side-effect (lessons.json + pool-memory.json + user-config.json + signal-weights.json + hive).
- **Sinkron**: dipanggil dlmm.js 3 caller; consumers baca lessons.json via getLessonsForPrompt/getModePerformance/getAllPerformance/getHourlyProfile/getNarrativeProfile.
- **Fail-mode**: suspiciousUnitMix → SKIP return early (no record); suspiciousAbsurdClosedPnl → FLAG (recorded + suspect); load/save corrupt → reset; recordPoolDeploy throw → caught; evolve throw → ? (tidak terlihat try-catch di recordPerformance — bisa unhandled — UNKNOWN verifikasi F20).
- **Bukti**: lessons.js:156-337 (recordPerformance); 161-173 (unit-mix skip); 190-221 (suspect stamp + alert); 175-181 (compute); 121-130 (snapshot); 227-241 (entry); 243 (push); 248-254 (lesson stamp); 256 (save); 257-259 (hive lesson); 265-289 (pool-memory); 291-324 (evolve trigger); 318-322 (Darwin); 328-335 (hive event); 337 (return).

### `buildSignalSnapshot(perf)` (lessons.js:121-130)
- **Apa**: freeze 15 PERFORMANCE_SIGNAL_FIELDS dari perf ke snapshot object utk shadow correlation dgn PnL (post-hoc analisis di F24/F21 weights).
- **Output**: snapshot object atau null.
- **Sinkron**: dipanggil recordPerformance step 5 (223) → persist ke `entry.signal_snapshot`.
- **Bukti**: lessons.js:121-130; PERFORMANCE_SIGNAL_FIELDS (23-44).

### `derivLesson(perf)` (lessons.js:344-446)
- **Apa**: derive lesson rule-teks dari 1 close. 4-outcome bucket + 5-rule-template + confidence evidence-based.
- **Output**: lesson object `{id, rule, tags, outcome, sourceType:"performance", confidence, context, pnl_pct, fees_earned_usd, initial_value_usd, range_efficiency, close_reason, pool, entry_*/exit_*, created_at}` atau null (neutral).
- **Sinkron**: dipanggil recordPerformance step 9 (248); consumer honor `lesson.paper`/`lesson.suspect` stamp yang diterapkan PADA recordPerformance setelah derive (250-251).
- **Fail-mode**: neutral outcome → null; missing fields → `?` placeholder di rule (fmtNum null-handler 360). Rule kosong → return null (400).
- **Bukti**: lessons.js:344-446; outcome bucket 351-357; rule-template 380-398; confidence 415-422; return 424-445.

### `evolveThresholds(perfData, config)` (lessons.js:458-570)
- **Apa**: evolve `minFeeActiveTvlRatio` + `minOrganic` dari livePerf (winners vs losers) → tulis balik user-config.json + live config.screening + log [AUTO-EVOLVED] lesson.
- **Kapan**: livePerf %5===0 + `evolveEnabled≠false` (auto) atau manual `/evolve` (REPL).
- **Output**: `{changes, rationale}` atau null (tak ada signal).
- **Sinkron**: tulis `config.screening.minFeeActiveTvlRatio`/`minOrganic` live + persist user-config.json; then `reloadScreeningThresholds` (config.js:531) re-baca dari disk.
- **Fail-mode**: <5 records → null; <2 winners/losers → null; MAX_CHANGE_PER_STEP=0.20 cap (clamp); push [AUTO-EVOLVED] lesson ke lessons.json 560-566.
- **Bukti** (summary, detail di F20): lessons.js:458-570; chokepoint keepActiveRacikan 462; winners/losers 465-466; hasSignal 469; minFeeActiveTvlRatio block 477-513; minOrganic block 517-537; persist 541-551; live apply 554-556; [AUTO-EVOLVED] lesson 559-567.

### `keepActiveRacikan(p)` (lessons.js:893-895)
- **Apa**: banding `(p?.active_setup ?? null) === (config.activeSetup ?? null)`. Racikan isolation chokepoint.
- **Output**: boolean.
- **Sinkron**: dipanggil evolveThresholds chokepoint (462), getModePerformance (972), getExcludedRacikanStats (998), getHourlyProfile (1050), getNarrativeProfile (1155), recordPerformance livePerf filter (298).
- **Kontrak**: future-proof — ganti activeSetup → record lawas otomatis aus dari scope tanpa rebuild/hardcode racikan name.
- **Bukti**: lessons.js:893-895.

### `getLessonsForPrompt({agentType, maxLessons})` (lessons.js:754-830)
- **Apa**: 3-tier lesson selection (Pinned → Role-matched → Recent) utk injek prompt agent (F22 detail).
- **Isolation**: paper filter (765-766): bila `!isPaperMode() && !usePaperHistoryWhenLive` → drop `l.paper`. Suspect filter (770): drop `l.suspect` selalu (kedua mode). HIVEMIND tier tambahan via `getSharedLessonsForPrompt` (817-820).
- **Bukti** (summary, detail F22): lessons.js:754-830; cap-tier PINNED_CAP/ROLE_CAP/RECENT_CAP 775-777; outcomePriority 779; filter paper 766; filter suspect 770.

### `getModePerformance()` (lessons.js:963-973)
- **Apa**: scoped performance array utk reports/briefings. Paper mode → paper only. Live → !paper only. PLUS keepActiveRacikan + !suspect_pnl.
- **Kontrak**: paper history tak pernah contaminate live stats (F13). Archival archive separate via `getArchivedPerformance` (910).
- **Bukti** (summary, detail F22): lessons.js:963-973; mode-filter 965-967; racikan+suspect 972.

### `recordPoolDeploy(poolAddress, deployData)` (pool-memory.js:104-225)
- **Apa**: catat per-pool deploy sejarah. Update entry `deploys[]` + recalc `total_deploys/avg_pnl_pct/win_rate/adjusted_win_rate` + set cooldown bila trigger (low-yield 177 / bad-outcome / OOR).
- **Kapan**: dipanggil recordPerformance step 12 (lessons.js:265) — LIVE non-suspect only.
- **Output**: pool-memory.json updated (sync write).
- **Fail-mode**: `load()` parse-fail → {} (start fresh); `poolAddress` falsy → early return 105.
- **Sinkron**: SCREENER baca `getDeployedPoolAddresses` (256) + `isPoolOnCooldown`/`isBaseMintOnCooldown` (import dlmm.js:31) utk skip cooldown pools.
- **Bukti** (summary, detail F23): pool-memory.js:104-225; cooldown helpers 65-82; isOorCloseReason 42-45; isFeeGeneratingDeploy 55-63.

---

## §E. Temuan: bug / gap / kontrak-kunci / fail-open tak-terpenuhi

### Kontrak kunci (bukan bug — design intent)
1. **`paper:true` dijahit di caller, dijahit ulang di consumer**. Tag datang dari dlmm.js:1728 paper path saja — recordPerformance tak set sendiri, hanya honor (`...perf` spread 228). 7 consumer honor: lesson stamp (250) + hive lesson skip (257) + pool-memory skip (265) + livePerf filter (298) + hive event skip (328) + getLessonsForPrompt (766) + getModePerformance (967). EXIT contract: `usePaperHistoryWhenLive` opt-in Live-only bypasses getLessonsForPrompt filter (765) supaya paper lessons bisa advisori masuk prompt — tapi tetap excluded evolve/weights/reports/hive (F13 spec). Verifikasi: live journals inspect — `l.paper` flag di-tag disini saja, tak ada path lain men-set paper.
2. **`active_setup` racikan isolation tidak hardcoded**. `keepActiveRacikan` pakai null-coalesce `?? null` (894) supaya record dengan `active_setup=null` (record lawas tanpa racikan) match only saat `config.activeSetup=null` juga. Switching racikan auto-isolate — tidak ada list nama. F20 bug konteks: 84 record lama mainzen_v2 pre-baseline archive (903-919) — unattributed, dipisah file `lessonsArchivePath`, tak masuk getAllPerformance default.
3. **`suspect_pnl` karantina konsisten**. Flag muncul saat `initial≥20 && pnl_pct≤-90 && !close_reason.includes('stop loss')` (190-194). 8 consumer honor: entry stamp (240), lesson stamp (251), hive lesson skip (257), pool-memory skip (265), livePerf filter (298), hive event skip (328), getLessonsForPrompt filter (770), getModePerformance filter (972). Disclosure stats `getSuspectCount` (981) + `/report ⚠️ Suspect` line lihat F24. Kontrak: dicatat (audit) + disisihkan (stats/learning) + operator verify utk unflag — UNKNOWN verifikasi manual mekanisme unflag (tak ada `clear_suspect` tool di grep awal — perlu cek F20/F24 konfirmasi).
4. **`evolveEnabled` FREEZE vs `darwin.enabled` independence**. Evolve + Darwin adalah 2 toggle terpisah. FREEZE baseline (`evolveEnabled=false`) cuma henti auto-write threshold; Darwin masih recalc bila enabled. Manual `/evolve` tak kena FREEZE gate (305 comment eksplisit). Evolve + Darwin trigger di window yang sama (saat livePerf %5) — Darwin dispatch di dalam `if (livePerf %5)` block (316), jadi FREEZE nggak henti Darwin.

### Bug / gap potensial
5. **evolve/Darwin trigger TIDAK di try-catch** di recordPerformance. `evolveThresholds` (309) dan `recalculateWeights` (318) dispatch dengan await — bila throw (mis JSON parse user-config saat persist access race), exception propagate ke caller `closePosition` → closePosition outer catch (2431/2652) mungkin swallow, atau throw unhandled. Bukti: tak ada try-catch di 298-324 sekitar evolve/Darwin — UNKNOWN behavior sebenarnya, perlu tes stress (F20 harus verifikasi).
6. **`MIN_EVOLVE_POSITIONS=5` hardcoded** (lessons.js:21), pemicu konstanta — bukan config. `darwinRecalcEvery` (CLAUDE.md flag diwarisan) tercatat MATI (F21 temuan awal — perlu verifikasi F21). User tak bisa tune interval evolve tanpa recompile.
7. **`pnl_pct` identik → `outcomE="poor"` (bukan neutral)**. threshold `-5 ≥ pnl_pct ≥ 0` → poor (354), `0 ≤ pnl_pct < 5` tanpa feeYield≥2 → neutral (357). Border `pnl_pct === 0` → neutral (pembacaan `>=0 && feeYield≥2`? 352 false → cek neutral 0). Edge-case: pos draw 0%Flat → tak pelajari. Beralasan (no signal), bukan bug.
8. **`suspiciousUnitMix` false-positive tinggi bila real-USD small**. `final_value_usd <= amount_sol * 2` + `initial ≥ 20` + `amount_sol ≥ 0.25`. Token small-cap real $25 close dengan amount 0.5 SOL (~$50) → final $40 (mis rugi) — final ≤ $100 AND initial $20 → FLAGGED sebagai unit-mix → SKIP record. Bukti: 161-173. UNKNOWN dampak real; parameter `initial>=20` mungkin ketat. CROSSREF F12 PnL compute data integritas.
9. **`signal_snapshot` partial populate**. `buildSignalSnapshot` loop PERFORMANCE_SIGNAL_FIELDS; null fallback `perf[field]` bila absent. Bila SCREENER tak kasi entry_top10_pct (e.g. meteora path tak fetch bundler utk grid), field null → recalc weight darwin skip field. Silent. F21 cross-ref.
10. **`peak_pnl_pct`/`trough_pnl_pct` source mutability** (F17/F18). Sumber ambil dari state.js tracked (mutated updatePnlAndCheckExits per poll). Bila close path baca tepat sebelum stamp entry (dlmm.js 1708/2365/2669) → stale bila poll baru saja mutated. Race window = 3s PnL poll. UNKNOWN konsekuensi praktis (peak/trough monotonic jadi stale = minor).

### Fail-open tak-terpenuhi
11. **Telegram suspect alert path tak truly fail-open?**. `void (async () => { try ... catch })()` (203-220) — async try-catch, swallow error → "fail-open" (alerts tak block record). PASS. Bukti: 217-220 catch `lessons_warn`.
12. **Darwin recalc dengan changes kosong tetap mencatat log** (321). Bila `wResult.changes.length > 0` only — good. PASS.
13. **recordPoolDeploy throw → caught?**. Tidak terlihat explicit try-catch sekitar `recordPoolDeploy` call di 266-289. Bila throw (pool-memory.json parse-fail saat load/save) → prop recordPerformance caller. UNKNOWN verifikasi F23.

---

## §F. Glosarium istilah fase
- **lessons.json** — `{lessons:[...], performance:[...]}`. performance = raw close records (PnL facts), lessons = derived rules. Pre-baseline archive di `lessonsArchivePath` separate.
- **PERFORMANCE_SIGNAL_FIELDS** — 15 field shadow-correlation (organic/fee_tvl/vol/entry_*/concentration) — frozen at close via buildSignalSnapshot.
- **outcomE bucket** — good/neutral/poor/bad. Threshold: good=pnl≥5 OR (≥0 & feeYield≥2); neutral=≥0 else; poor=-5..0; bad=<-5.
- **rule-template** — 5 kerangka AVOID-OOR / PREFER / AVOID-volume-collapse / WORKED / FAILED. `derivLesson` pilih 1.
- **confidence** — 0.22-0.88 evidence-based. Good positiveEvidence: feeYield≥1 OR fees≥3 OR pnl≥3. Bad negativeEvidence: pnl≤-5 OR range_eff≤30 OR close_reason OOR/low-yield/volume.
- **paper:true** — sim data tag. Stamp lesson+entry. 7 consumer honor. Opt-in `usePaperHistoryWhenLive` utk prompt advisori.
- **suspect_pnl** — ≤-90% non-stopLoss tag. 8 consumer honor. Karantina sampai verifikasi.
- **active_setup** — racikan identity. `keepActiveRacikan` chokepoint.
- **evolveEnabled (FREEZE)** — `config.learning.evolveEnabled=false` → auto-evolve skip (no user-config write). Manual `/evolve` tetap.
- **MIN_EVOLVE_POSITIONS** — constant 5 (hardcoded, not config).
- **reloadScreeningThresholds** (config.js:531) — re-baca user-config.jsn threshold tanpa restart. Trigger evolve.
- **shadow_signals** — dlmm.js captureShadowSignals (49-70) freeze momentum/sw-momentum di deploy. Persist tracked, baca derivLesson.
- **relay path** (dlmm.js closePosition 2348) — relay API submit tx on-chain, manager tx broadcast terpisah. `relay:true` flag (2412). Public fallback (2652) bila relay unavailable.

---

## §G. Link fase lain (cross-ref)
- **F10**: closePosition 2 path (relay+public) → recordPerformance trigger. F19 = downstream consumer dari close.
- **F12**: PnL tutup compute (initial/final/fees/pnl_pct) → payload dikirim F19. `recordPerformance` re-compute ulang `pnl_usd` (175) — cross-check integritas F12.
- **F13**: paper:true isolation contract spesifikasi. F19 = implementasi tag-handle di funnel. Verifikasi 7 consumer lengkap di sini.
- **F17**: makePositionRecord init peak/trough + active_setup + narrative. F19 baca tracked → entry payload.
- **F18**: updatePnlAndCheckExits mutasi peak/trough setiap poll. F19 persist snapshot terakhir saat close.
- **F20**: evolveThresholds detail (algoritma nudge/clamp/delta) + 84 record lama archive bug. F19 trigger launch.
- **F21**: recalculateWeights / Darwin signal-weights detail. F19 dispatch window.
- **F22**: getModePerformance + getLessonsForPrompt mode-scoped + profile functions. F19 sediakan data, F22 manipulasi.
- **F23**: pool-memory recordPoolDeploy + getDeployedPoolAddresses + cooldown logic detail. F19 panggil cross-store.
- **F24**: reports.js consume performance[] utk PF/DD/by-tier/movement (price_peak/trough). F19 funnel supply.
- **F25**: briefing getModePerformance trade-stats + cost. F19 supply data terisolasi.
- **F30**: notifyClose Telegram dengan derived_lesson dari F19 return (executor.js:803).

---

## §H. Open-Q (bawa ke fase berikutnya)
- **evolve/Darwin try-catch gap** (temuan #5) — bener-nggak exceptions propagate ke closePosition swallow? Perlu tes F20. Konsekuensi: 1 close ke-5 atau ke-10 bila evolve throw → close notification mungkin rusak atau position left dangling?
- **`suspect_pnl` manual unflag mechanism** — tak terlihat di grep awal. Apa ada `/clear_suspect <position>` tool atau harus manual edit lessons.json? Check F20/F24 (operator action).
- **`suspiciousUnitMix` false-positive bench** — berapa persen real trade ke-SKIP? Threshold `initial>=20 + final<=amount_sol*2` ketat. Perlu sampling F24 (data audit).
- **`signal_snapshot` partial populate** — bila meteora path tak isi entry_top10_pct → Darwin weight recalc skip field. Bisakah pemicu pada GMGN path selalu populate? F21 cek coverage.
- **`peak_pnl_pct`/`trough_pnl_pct` race window** — 3s poll staleness saat close. Konsekuensi praktis minor (monotonic), tapi verifikasi F18 snap terakhir bila close via direct emergency baca stale.
- **`active_setup` flag inherited via perf sender (dlmm.js 2362/2666)** — `tracked.active_setup || null`. Bila tracked migrate tanpa active_setup (e.g. reset state.json) → active_setup=null → match hanya saat system juga null → isolation mismatch record trail off. UNKNOWN konsekuensi F17/F22.
- **`signal_snapshot` vs `shadow_signals` overlapping** — dua field beda? `signal_snapshot` (121 buildSignalSnapshot dari PERFORMANCE_SIGNAL_FIELDS) vs `shadow_signals` (dlmm.js:55 captureShadowSignals momentum/sw). F19 persist keduanya (`signal_snapshot` di entry 229, `shadow_signals` via `...perf` spread). F21/F24 bedain consumer.

---

> Resume: buka file ini → lihat "## Progress" → lanjut dari `[ ]` terakhir. Audit read-only.