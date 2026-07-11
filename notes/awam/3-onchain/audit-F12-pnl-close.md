# Audit F12 — PnL tutup compute (close-time PnL → recordPerformance)
> Read-only. Bukti `file:line`. UNKNOWN kalau tak pasti. Resume: buka file ini.
> Kedalaman: ⬛⬛ mandatory deep — alasan: 2 close-path (relay 2289-2430 vs public/local 2547-2732) duplikat compute dgn drift risk; 2 sumber (Meteora closed-API authoritatif + cached-open fallback); solMode vs USD field-select; `recordPerformance` formula `(final+fees)−initial` (lessons.js:175); `shouldRejectClosedPnl` outlier guard HANYA di public path (relay gap); `suspect_pnl` quarantine defense-in-depth (lessons.js:183-221); unit-mix guard SKIP record (159-173); `recorded_pnl_usd` render-only biar notif==/report; paper close routing `computePaperMetrics` + fee-double-count avoidance; `range_efficiency` derived di recordPerformance bukan input.
> Cross-ref: F9 (deploy trackPosition → tracked record sumber final/initial/fees), F10 (closePosition relay+public flow, notifyClose consumer), F11 (getMyPositions open-PnL + cached pnl fallback dipakai sini), F13/F32 (closePaperPosition + computePaperMetrics paper path), F17 (state.js tracked fields: total_fees_claimed_usd, deployed_at, out_of_range_since, peak/trough), F18 (peak_pnl_pct/trough_pnl_pct tracked dari PnL poll), F19 (recordPerformance + derivLesson + suspect filter), F24 (reports.js computeTradeStats baca performance[] field sama), F25 (notifyClose render + /report baca recorded pnl).

## Ringkasan eksekutif (5 baris)
1. **2 close-path, duplikat compute PnL**: relay (dlmm.js:2289-2430, `shouldUseLpAgentRelay`) dan public/local (2547-2732). Both: baca `tracked` (deployed_at, total_fees_claimed_usd, peak/trough) → hitung `minutesHeld`/`minutesOOR` → fetch Meteora `status=closed` API 6× retry 5s → extract `pnlUsd`/`pnlPct`/`finalValueUsd` (allTimeWithdrawals)/`initialUsd` (allTimeDeposits)/`feesUsd` (allTimeFees) → fetch exit-market (pool-discovery) → `recordPerformance` → `appendDecision` → return. **DRIFT RISK**: relay path (2299-2326) stripped copy tanpa `shouldRejectClosedPnl` outlier guard (public 2559-2666) + tanpa cached-fallback block (public 2612-2630).
2. **recordPerformance formula** (lessons.js:175): `pnl_usd = (final_value_usd + fees_earned_usd) − initial_value_usd`; `pnl_pct = (pnl_usd / initial_value_usd) × 100`; `range_efficiency = (minutes_in_range / minutes_held) × 100` (179-181). Final_value = PRINCIPAL dikembalikan (allTimeWithdrawals − fees sudah dipisah field). Fees_earned = fee terpisah. Initial = allTimeDeposits. Suspect guard: ≤−90% non-stopLoss → flag `suspect_pnl` (quarantine, NOT dropped) + alert Telegram (183-221). Unit-mix guard: `final_value_usd ≤ amount_sol × 2 AND initial≥20 AND amount_sol≥0.25` → SKIP record (159-173, deteksi SOL-value-tulis-ke-USD-field).
3. **solMode field-select**: `getClosedPnlValue` (1466-1470) → `pnlSol ?? pnl.valueNative ?? 0` (solMode) vs `pnlUsd ?? pnl.value ?? 0`; `getClosedPnlPct` (1472-1483) → reported `pnlSolPctChange`/`pnlPctChange` OR derived `(pnl/deposit)×100`. TAPI recordPerformance formula USD-only → `recorded_pnl_usd` (dlmm.js:2408/2712) = `(finalValueUsd + feesUsd) − initialUsd` recomputed dari USD field supaya notif-popup == /report (USD). solMode → `recorded_pnl_usd=null` (keep SOL headline, F9-light comment 2403-2407/2707-2711).
4. **2 sumber PnL closed**: (a) Meteora closed-API `dlmm.datapi.meteora.ag/positions/{pool}/pnl?user=…&status=closed` 6× retry 5s — authoritative setelah withdrawal settle (2559-2660 public, 2299-2326 relay); (b) cached-open fallback (2612-2630, public SAJA) — bila `finalValueUsd===0` (closed-API belum settle) baca `_positionsCache` pre-close snapshot, recompute `finalValueUsd = max(0, initial + pnlTrueUsd − feesUsd)` utk internal consistency. Relay path TANPA fallback → return PnL=0 kalau closed-API gagal/empty (silent rug in notif).
5. **Paper close** (1675-1765, F32): `computePaperMetrics` (pure math, paper-trading.js:69-169) → sim `pnl_usd`/`pnl_pct`/`fees_usd`/`il_usd`/`slippage_usd`/`gas_drag_usd`/`costs_usd`/`pnl_before_costs_usd`. `closePaperPosition` → `recordPerformance` dgn `final_value_usd = position_value_usd − fees_usd − costs_usd` (1718, avoid fee double-count sebab position_value_usd SUDAH include fees) + `paper:true` tag → isolated dari evolve/stats/hive (F13/F19). Return decomposition (fees/il/slippage/gas, before/after costs) + `classifyPaperEdge` source label.

## Progress
- [x] Baca dlmm.js 2172-2261 (closePosition entry + relay setup)
- [x] Baca dlmm.js 2289-2430 (relay closed-PnL compute + recordPerformance call)
- [x] Baca dlmm.js 2547-2732 (public/local closed-PnL compute + shouldRejectClosedPnl + cached fallback + recordPerformance)
- [x] Baca dlmm.js 1324-1406 (getPositionPnl open-PnL — context)
- [x] Baca dlmm.js 1408-1520 (safeNum/maybeNum/roundNum/resolvePerformanceSignalSnapshot/getClosedPnlValue/getClosedPnlPct/deriveOpenPnlPct/deriveLpAgentPnlPct)
- [x] Baca dlmm.js 1556-1765 (getPaperSolPriceUsd/computePaperMetrics/buildPaperPositionRow/getPaperPositions/closePaperPosition)
- [x] Baca lessons.js 156-300 (recordPerformance: unit-mix guard + formula + suspect quarantine + entry shape + evolve trigger)
- [x] Baca paper-trading.js 66-176 (simulatePaperMetrics math: IL/slippage/fees/costs/decomposition)
- [x] Baca tools/pnl.js 107-294 (fetchDlmmPnlForPool + buildPosition open-PnL math — context)
- [x] Baca telegram.js 580-608 + views/notifs.js 68-111 (notifyClose render consumer — context)
- [x] Baca index.js 1220-1244 (notifyClose call recorded_pnl_usd fallback)
- [x] Tulis §0 + §A-§H

---

## §0. Cara Kerja (Bahasa Awam)

**Analogi** (dua sudut pandang sehari-hari)
- *Teller bank tutup rekening deposito*: nasabah datang tutup (close_position). Teller cek buku besar (tracked record: kapan buka, modal awal). Teller tunggu sistem pusat konfirmasi pencairan (Meteora closed-API 6× retry). Teller catat: modal awal (initial), nilai akhir (final), bunga (fees) — lalu hitung untung/rugi = (akhir + bunga) − modal. Kalau rugi ≥90% padahal bukan stop-loss → kasir ketok-ketok pengawas (suspect_pnl, dikarantina, jangan dipakai belajar dulu). Kalau ada anomali "angka SOL ketulis ke kolom USD" → tolak catatan (unit-mix guard).
- *Akuntan forensik*: ada 2 jalur tutup (relay = teller cepat via pusat; public = teller manual). Keduanya catat sama tapi jalur relay lewati 1 filter anti-outlier + 1 jaring pengaman cached. Kalau closed-API belum settle (5-30detik), jalur public ambil snapshot pre-close (cached open PnL); jalur relay cuma balik 0. Akuntan juga simpan snapshot pasar saat exit (mcap/tvl/volume) biar bisa audit "waktu tutup, pasar lagi gimana".

**Di bot, ini = closed-PnL compute + recordPerformance trigger** (1-2 kalimat)
Setelah close tx confirmed, baca Meteora closed-API utk `final_value_usd`/`fees_earned_usd`/`initial_value_usd` → lempar ke `recordPerformance` (lessons.js) → simpan ke `performance[]` array (lessons.json) → derived lesson → evolve/Darwin trigger. PnL tutup = sumber kebenaran buat /report, briefings, evolution threshold, Darwin weights, pool-memory.

**Posisi fase ini di alur bot** (1 paragraf)
Datang setelah F10 (close tx confirmed on-chain, position verified gone). Sebelum F19 (recordPerformance → derivLesson → evolve → Darwin → pool-memory). F12 = JEMBATAN: close-tx sukses → record belajar. Tanpa F12, close sukses tapi tak tercatat → bot tak pernah belajar dari trade, /report kosong, evolution nganggur. Fail-open F12 = recordPerformance gagal → close tetap sukses tapi trade "ilang" dari history (silent gap).

**Langkah kerja** (5-10 nomor, istilah teknis)
1. Trigger: `closePosition({position_address, reason})` (dlmm.js:2172) — dari executor (MANAGER close_position tool) atau index.js PnL-poll EMERGENCY close.
2. Baca `tracked = getTrackedPosition(position_address)` (2182) — sumber `deployed_at`, `total_fees_claimed_usd`, `bin_range`, `peak_pnl_pct`/`trough_pnl_pct`, `signal_snapshot`, `entry_*` fields (F17).
3. Branch: `shouldUseLpAgentRelay()` → relay path (2189-2430) OR public/local path (2438-2732). DRY_RUN+paper → `closePaperPosition` (2176-2177, F32).
4. (both paths) Hitung `minutesHeld = floor((now − deployedAt)/60000)` + `minutesOOR = floor((now − out_of_range_since)/60000)` bila OOR.
5. Fetch Meteora closed-API: `dlmm.datapi.meteora.ag/positions/{pool}/pnl?user=…&status=closed&pageSize=50&page=1` 6× retry 5s. Cari `posEntry.positionAddress === position_address`.
6. Extract: `pnlTrueUsd = safeNum(posEntry.pnlUsd)`; `pnlUsd = solMode ? getClosedPnlValue(posEntry, true) : pnlTrueUsd`; `pnlPct = getClosedPnlPct(posEntry, solMode)`; `finalValueUsd = allTimeWithdrawals.total.usd`; `initialUsd = allTimeDeposits.total.usd`; `feesUsd = allTimeFees.total.usd`.
7. (public path SAJA) `shouldRejectClosedPnl(nextPnlPct, reason)` (2559-2566): reject ≤−90% non-stopLoss sebagai "unsettled outlier" + retry. Cached fallback (2612-2630) bila `finalValueUsd===0`.
8. (both) Fetch exit-market snapshot: `pool-discovery-api.datapi.meteora.ag/pools?filter_by=pool_address=…` → `exit_mcap`/`exit_tvl`/`exit_volume` (fail-open).
9. `recordPerformance({…, final_value_usd, fees_earned_usd, initial_value_usd, minutes_in_range, minutes_held, close_reason, signal_snapshot, entry_*, …exitMarket})` (2348/2652).
10. recordPerformance (lessons.js:156): unit-mix guard → formula `pnl_usd=(final+fees)−initial` → suspect quarantine → push `performance[]` → `derivLesson` → save → hive push (non-paper/non-suspect) → pool-memory (non-paper/non-suspect) → evolve trigger tiap 5 live close.
11. Return `{success, pnl_usd, pnl_pct, recorded_pnl_usd, recorded_pnl_pct, fees_earned_usd, base_mint, derived_lesson, …}` (2410-2429/2714-2731) → consumer notifyClose (index.js:1226) + appendDecision.

**Output closed-PnL compute**: `performance[]` entry di lessons.json (pnl_usd/pct, range_efficiency, suspect_pnl flag, paper flag, signal_snapshot, entry/exit market, minutes) + derived lesson + (hive/pool-memory sync live-only). Return obj ke caller bawa `recorded_pnl_usd` utk notif==/report parity.

**Kalau rusak / diskip** (2-3 kalimat, istilah teknis)
Closed-API 6× retry gagal + cached fallback absent (relay path) → `pnlUsd=0/pnlPct=0` ter-record → trade tampak "break-even" padahal bisa rugi besar → /report + evolution + Darwin ter-contaminate (silent data corruption). recordPerformance throw → close tetap sukses tapi trade ilang dari history → /report count turun, evolve tak trigger. Suspect quarantine fail (≤−90% non-stopLoss lewat) → rugi 95% masuk stats → win-rate artifisial, evolution dorong pool beracun.

**Istilah yang muncul di fase ini** (bullet, cuma yang baru)
- **closed-PnL API** — Meteora endpoint `status=closed`, authoritative setelah withdrawal settle (5-30detik lag).
- **final_value_usd** — principal dikembalikan (allTimeWithdrawals), SUDAH dipisah dari fees di recordPerformance formula.
- **fees_earned_usd** — fee terpisah (allTimeFees), ditambah ke final di formula.
- **initial_value_usd** — modal awal (allTimeDeposits), basis % PnL.
- **range_efficiency** — `minutes_in_range / minutes_held × 100`, derived di recordPerformance (179-181), BUKAN input.
- **shouldRejectClosedPnl** — public-path outlier guard, reject ≤−90% non-stopLoss sebagai "unsettled" + retry.
- **suspect_pnl** — quarantine flag ≤−90% non-stopLoss yg LOLUS shouldRejectClosedPnl atau fallback path, DITAHAN di record tapi di-exclude dari evolve/stats/hive.
- **unit-mix guard** — deteksi `final_value_usd ≤ amount_sol × 2` (SOL-sized value di USD field) → SKIP record (159-173).
- **recorded_pnl_usd** — render-only recomputed `(final+fees)−initial` utk notif-popup == /report parity; solMode → null.
- **decomposition** — paper-only PnL breakdown: fees/il/slippage/gas, edge before vs after costs (FASE 4 paper-trading.js).

*Lewati §0 kalau sudah paham. Isi teknis mulai §A.*

---

## §A. Peta block fase ini (file:line → peran)

| file:line | simbol | peran |
|---|---|---|
| dlmm.js:2172-2180 | closePosition entry | DRY_RUN/paper branch + entry |
| dlmm.js:2182-2188 | tracked + pool lookup | sumber metadata record |
| dlmm.js:2189-2430 | relay close path | LPAgent zap-out + closed-PnL compute (stripped, no outlier guard) |
| dlmm.js:2289-2326 | relay closed-PnL fetch | Meteora closed-API 6× retry, extract pnl/final/initial/fees |
| dlmm.js:2335-2346 | exit-market snapshot | pool-discovery exit_mcap/tvl/volume (fail-open) |
| dlmm.js:2348-2381 | relay recordPerformance call | push performance[] + trigger learning |
| dlmm.js:2383-2401 | relay appendDecision | audit-trail close event |
| dlmm.js:2403-2429 | relay return + recorded_pnl | render-only recomputed pnl utk notif parity |
| dlmm.js:2438-2516 | public close step1+2 | claim + removeLiquidity/closePosition on-chain |
| dlmm.js:2519-2545 | public close-verify | 4× getMyPositions force-check stillOpen |
| dlmm.js:2547-2610 | public closed-PnL fetch | Meteora closed-API 6× retry + shouldRejectClosedPnl |
| dlmm.js:2559-2666 | shouldRejectClosedPnl | outlier ≤−90% non-SL reject+retry (public SAJA) |
| dlmm.js:2612-2630 | cached-open fallback | pre-close snapshot bila closed-API empty (public SAJA) |
| dlmm.js:2632-2650 | public exit-market | duplikat relay 2335-2346 |
| dlmm.js:2652-2685 | public recordPerformance | duplikat relay 2348-2381 |
| dlmm.js:2687-2705 | public appendDecision | duplikat relay 2383-2401 |
| dlmm.js:2707-2731 | public return + recorded_pnl | duplikat relay 2403-2429 |
| dlmm.js:1324-1406 | getPositionPnl (open) | open-PnL path — context, BUKAN tutup |
| dlmm.js:1408-1424 | safeNum/maybeNum/roundNum | parse helpers |
| dlmm.js:1447-1464 | resolvePerformanceSignalSnapshot | staged Darwin signals + tracked.signal_snapshot merge |
| dlmm.js:1466-1483 | getClosedPnlValue/getClosedPnlPct | solMode field-select closed-PnL |
| dlmm.js:1485-1519 | deriveOpenPnlPct/deriveLpAgentPnlPct | independent % cross-check (open PnL) |
| dlmm.js:1556-1622 | computePaperMetrics | sim math entry (on-chain active-bin read) |
| dlmm.js:1625-1654 | buildPaperPositionRow | shape sim result → getMyPositions row |
| dlmm.js:1657-1672 | getPaperPositions | synthesize open paper list |
| dlmm.js:1675-1765 | closePaperPosition | paper close → recordPerformance (paper:true) + decomposition |
| lessons.js:156-173 | unit-mix guard | SKIP record bila SOL-value di USD field |
| lessons.js:175-181 | PnL formula | `(final+fees)−initial`, range_efficiency derived |
| lessons.js:183-221 | suspect quarantine | ≤−90% non-SL → flag + alert (NOT dropped) |
| lessons.js:223-256 | entry shape + lesson derive | persist performance[] + derivLesson |
| lessons.js:257-289 | hive + pool-memory sync | live/non-suspect only |
| lessons.js:298-305 | evolve trigger | tiap 5 live close (gated evolveEnabled) |
| paper-trading.js:69-169 | simulatePaperMetrics | pure math IL/slippage/fees/costs/decomposition |
| tools/pnl.js:107-128 | fetchDlmmPnlForPool | open-PnL API (context, sumber cached fallback) |
| tools/pnl.js:204-294 | buildPosition open-PnL | open pnl formula (context) |
| index.js:1226-1236 | notifyClose call | consumer recorded_pnl_usd fallback |
| telegram.js:594-608 | notifyClose | render consumer, solMode resolve |
| views/notifs.js:68-111 | renderClose | Net PnL + give-back + trigger-gap lines |

---

## §B. Alur data hulu→hilir (ASCII diagram)

```
closePosition({position_address, reason})  dlmm.js:2172
  │
  ├─ DRY_RUN+paper? → closePaperPosition (F32) ──→ computePaperMetrics ──→ recordPerformance(paper:true)
  │                                                    ↓
  ├─ tracked = getTrackedPosition()  [deployed_at, total_fees_claimed_usd, peak/trough, signal_snapshot, entry_*]
  │
  ├─ shouldUseLpAgentRelay()?
  │   YES → relay path (2189-2430)
  │   │   ├─ zap-out order + sign+simulate + submit (F10)
  │   │   ├─ verify stillOpen (2259-2287)
  │   │   ├─ recordClose
  │   │   ├─ Meteora closed-API 6× retry (2299-2326)  ← NO shouldRejectClosedPnl, NO cached fallback
  │   │   ├─ exit-market snapshot (2335-2346)
  │   │   ├─ recordPerformance (2348-2381)
  │   │   ├─ appendDecision (2383-2401)
  │   │   └─ return {pnl_usd, pnl_pct, recorded_pnl_usd, derived_lesson, …} (2410-2429)
  │   │
  │   NO → public/local path (2438-2732)
  │       ├─ claim fees (Step 1, 2446-2468, fail-open)
  │       ├─ removeLiquidity OR closePosition (Step 2, 2470-2510)
  │       ├─ 5s wait + cache invalidate (2516-2517)
  │       ├─ verify stillOpen 4× retry (2519-2545)
  │       ├─ recordClose (2547)
  │       ├─ Meteora closed-API 6× retry + shouldRejectClosedPnl (2568-2610)
  │       ├─ cached-open fallback bila finalValueUsd===0 (2612-2630)  ← PUBLIC SAJA
  │       ├─ exit-market snapshot (2639-2650)
  │       ├─ recordPerformance (2652-2685)
  │       ├─ appendDecision (2687-2705)
  │       └─ return {pnl_usd, pnl_pct, recorded_pnl_usd, derived_lesson, …} (2714-2731)
  │
  ↓
recordPerformance(perf)  lessons.js:156
  ├─ unit-mix guard (159-173) → SKIP bila SOL-value di USD field
  ├─ pnl_usd = (final_value_usd + fees_earned_usd) − initial_value_usd  (175)
  ├─ pnl_pct = (pnl_usd / initial_value_usd) × 100  (176-178)
  ├─ range_efficiency = (minutes_in_range / minutes_held) × 100  (179-181)
  ├─ suspect quarantine (183-221): ≤−90% non-SL → suspect_pnl flag + Telegram alert
  ├─ entry = {...perf, pnl_usd, pnl_pct, range_efficiency, suspect_pnl?, paper?, signal_snapshot, opened_at, closed_at, open_hour_wib, open_session}  (227-241)
  ├─ data.performance.push(entry)  (243)
  ├─ derivLesson(entry) → data.lessons.push  (248-253)
  ├─ save(data)  (256)
  ├─ hive push (257-259, non-paper/non-suspect)
  ├─ pool-memory recordPoolDeploy (265-289, non-paper/non-suspect)
  ├─ evolve trigger tiap 5 live close (298-305, gated evolveEnabled)
  └─ return lesson (utk caller derived_lesson field)
  │
  ↓
return {…, pnl_usd, pnl_pct, recorded_pnl_usd=(final+fees)−initial, derived_lesson}  → caller
  │
  ↓
index.js:1226  notifyClose({pnlUsd: res.recorded_pnl_usd ?? res.pnl_usd, …})
  → views/notifs.js renderClose → Telegram popup
  → /report baca performance[] (F24) → angka == popup (F9-light parity)
```

---

## §C. Sinkron: siapa-panggil-siapa

| Pemanggil (file:line) | Dipanggil (file:line) | Trigger | Data lewat | Fail-mode |
|---|---|---|---|---|
| executor.js (MANAGER close_position) | dlmm.js:2172 closePosition | tool call | {position_address, reason} | throw → agent loop tangkap |
| index.js:1210 PnL-poll EMERGENCY | dlmm.js:2172 closePosition | SL/TP/OOR rule trigger | {position_address, reason} | .catch log, close tetap |
| dlmm.js:2176 DRY_RUN+paper | dlmm.js:1675 closePaperPosition | paper close | position_address, reason | throw → caller |
| dlmm.js:2299/2576 Meteora fetch | dlmm.datapi.meteora.ag closed-API | recordPerformance step | poolAddress, wallet, position_address | 6× retry 5s, then fallback/0 |
| dlmm.js:2337/2641 exit-market | pool-discovery-api.datapi.meteora.ag | recordPerformance step | poolAddress, timeframe | catch → {} (fail-open) |
| dlmm.js:2348/2652 | lessons.js:156 recordPerformance | post-verify | full perf obj | throw → caller catch |
| dlmm.js:1723 paper | lessons.js:156 recordPerformance | paper close | perf + paper:true | throw → paper_warn log |
| dlmm.js:1447 resolvePerformanceSignalSnapshot | signal-weights.js getAndClearStagedSignals (darwin) | recordPerformance prep | {poolAddress, baseMint, tracked} | staged null → tracked.signal_snapshot |
| lessons.js:265 recordPoolDeploy | pool-memory.js | post-save | perf subset | throw → caller |
| lessons.js:257 pushHiveLesson | hive-mind.js | post-save non-paper | lesson | void fire-and-forget |
| index.js:1226 | telegram.js:594 notifyClose | close return | {pnlUsd, pnlPct, peakPnlPct, …} | .catch → {} |
| telegram.js:604 | wallet.js getSolMarketRegime | notifyClose render | — | try/catch → null |
| views/notifs.js:80 | telegram.js fmtMoneySigned | render | net PnL | — |

---

## §D. Logika kunci per fungsi

### closePosition (dlmm.js:2172)
- Apa: close position on-chain + compute closed-PnL + record learning.
- Kapan dipicu: MANAGER close_position tool (executor.js) OR index.js PnL-poll EMERGENCY close.
- Output: {success, pnl_usd, pnl_pct, recorded_pnl_usd, fees_earned_usd, base_mint, derived_lesson, txs, …}.
- Sinkron: index.js:1226 notifyClose consumer; reports.js performance[] reader; F10 close-tx flow; F17 tracked fields.
- Fail-mode: DRY_RUN+paper → closePaperPosition; relay fail → fallback public (2431-2435); closed-API fail → 0/cached-fallback; recordPerformance throw → close tetap sukses, trade ilang dari history.
- Bukti: dlmm.js:2172-2786.

### Relay closed-PnL compute (dlmm.js:2289-2430)
- Apa: post-relay-verify, fetch closed-API + extract + recordPerformance.
- Kapan dipicu: relay path, after `closedConfirmed` (2259-2287).
- Output: return obj bawa `pnl_usd`/`pnl_pct`/`recorded_pnl_usd`/`derived_lesson`.
- Sinkron: sama dgn public path 2547-2732 (DUPLIKAT).
- Fail-mode: closed-API 6× retry gagal → `pnlUsd=0` (TANPA cached fallback); shouldRejectClosedPnl ABSENT → outlier ≤−90% non-SL langsung masuk record (suspect_pnl tertangkap di recordPerformance).
- Bukti: dlmm.js:2289-2430.

### Public closed-PnL compute (dlmm.js:2547-2732)
- Apa: post-local-close, fetch closed-API + shouldRejectClosedPnl + cached fallback + recordPerformance.
- Kapan dipicu: public/local path, after `closedConfirmed` (2519-2545).
- Output: sama dgn relay.
- Sinkron: relay 2289-2430 (DUPLIKAT dgn drift).
- Fail-mode: shouldRejectClosedPnl reject ≤−90% non-SL + retry; cached fallback bila `finalValueUsd===0` (2612-2630); recordPerformance suspect_pnl quarantine defense-in-depth.
- Bukti: dlmm.js:2547-2732.

### getClosedPnlValue/getClosedPnlPct (dlmm.js:1466-1483)
- Apa: solMode field-select dari Meteora posEntry.
- Kapan dipicu: closed-PnL extract step (2314/2584).
- Output: number (SOL or USD per solMode).
- Sinkron: recordPerformance formula USD-only → `recorded_pnl_usd` recomputed dari USD field (2408/2712).
- Fail-mode: maybeNum null → 0 fallback; deposit missing → derived pct 0.
- Bukti: dlmm.js:1466-1483.

### shouldRejectClosedPnl (dlmm.js:2559-2566) — public path SAJA
- Apa: reject ≤−90% non-stopLoss closed-PnL sebagai "unsettled outlier".
- Kapan dipicu: tiap retry attempt di public path (2590).
- Output: boolean. `true` → skip update, retry; `false` → accept.
- Sinkron: recordPerformance suspect_pnl (defense-in-depth bila lewat); relay path TANPA guard ini (gap).
- Fail-mode: stop-loss reason → always accept (trust rug disaster); non-SL ≤−90% → reject + log "unsettled".
- Bukti: dlmm.js:2559-2566, 2590-2601.

### recordPerformance (lessons.js:156)
- Apa: hitung PnL final, quarantine suspect, push performance[], derive lesson, trigger evolve/hive/pool-memory.
- Kapan dipicu: closePosition both paths (2348/2652) + closePaperPosition (1693).
- Output: return `lesson` obj (utk caller `derived_lesson`); side-effects: lessons.json mutate, hive push, pool-memory sync, evolve trigger.
- Sinkron: reports.js computeTradeStats baca performance[] (F24); getLessonsForPrompt baca lessons (F22); briefing counts (F25); Darwin evolve.
- Fail-mode: unit-mix guard → SKIP return (silent); suspect_pnl → flag+alert, record tetap; throw → caller catch, close tetap sukses tapi trade ilang.
- Bukti: lessons.js:156-305.

### computePaperMetrics (dlmm.js:1567) + simulatePaperMetrics (paper-trading.js:69)
- Apa: pure-math sim PnL dari on-chain active-bin read + tracked metadata.
- Kapan dipicu: getPaperPositions (1663), getPositionPnl paper (1331), closePaperPosition (1680).
- Output: {pnl_usd, pnl_pct, fees_usd, il_usd, slippage_usd, gas_drag_usd, costs_usd, pnl_before_costs_usd, position_value_usd, initial_value_usd, minutes_*}.
- Sinkron: closePaperPosition → recordPerformance dgn `final_value_usd = position_value_usd − fees_usd − costs_usd` (1718, avoid double-count sebab position_value SUDAH include fees).
- Fail-mode: getActiveBin/getPool throw → return null; solPrice 0 → USD fields 0 (SOL fields tetap); fees defensive cap ≤ deposit × 0.5.
- Bukti: dlmm.js:1567-1622, paper-trading.js:69-169.

### resolvePerformanceSignalSnapshot (dlmm.js:1447)
- Apa: merge staged Darwin signals + tracked.signal_snapshot + backfill signal fields dari tracked.
- Kapan dipicu: recordPerformance call prep (2329/2633/1723).
- Output: snapshot obj or null.
- Sinkron: signal-weights.js staged signals (darwin enabled); tracked.signal_snapshot (F17); Darwin weighting (F21).
- Fail-mode: darwin disabled → staged null; tracked.signal_snapshot absent → backfill from tracked fields; semua null → return null.
- Bukti: dlmm.js:1447-1464.

---

## §E. Temuan: bug / gap / kontrak-kunci / fail-open tak-terpenuhi

### G1. Relay path duplikat public path, drift risk (⬛⬛ mandatory)
dlmm.js:2289-2430 (relay) = stripped copy of 2547-2732 (public). Dua perubahan serius ilang di relay:
- **`shouldRejectClosedPnl` ABSENT di relay** (2299-2326 vs public 2559-2666). Relay path terima ≤−90% non-SL outlier langsung. Defense-in-depth `suspect_pnl` (lessons.js:183-221) TETAP quarantines record-nya, tapi record masuk dgn angka absurd (vs public retry utk dapat angka settled). → /report + briefings bisa tampak rugi 95% padahal bad-data.
- **Cached-open fallback ABSENT di relay** (2299-2326 vs public 2612-2630). Bila closed-API 6× retry empty/gagal, relay return `pnlUsd=0/pnlPct=0` → trade ter-record "break-even" padahal bisa rugi/untung besar. Public path ambil cached pre-close snapshot. → silent data corruption di relay mode.
- **Fix arah**: extract helper `fetchClosedPnl({poolAddress, positionAddress, reason, tracked})` bawa shouldRejectClosedPnl + cached fallback, dipanggil both paths. (F9-besar deferred comment 2403-2407 akui "F9-besar deferred" utk recorded_pnl parity; gap ini sepertinya belum terdokumentasi.)

### G2. shouldRejectClosedPnl vs suspect_pnl — dua lapis defense, kontrak samar
- `shouldRejectClosedPnl` (dlmm.js:2559, public SAJA): reject ≤−90% non-SL **sebelum** record, retry utk dapat settled value.
- `suspect_pnl` (lessons.js:183-221, BOTH paths via recordPerformance): ≤−90% non-SL **lolos** shouldReject OR via relay/fallback → flag quarantined, NOT dropped, alert Telegram.
- Kontrak: shouldRejectClosedPnl = "coba dapat angka baik dulu" (best-effort); suspect_pnl = "kalo tetap absurd, quarantine+alert" (last-resort). Relay path lewati lapis pertama → suspect_pnl jadi satu-satunya defense, dan alert-nya fire HANYA bila record tertulis (gap bila recordPerformance throw sebelum suspect check).
- Bukti: dlmm.js:2559-2566, lessons.js:183-221.

### G3. Unit-mix guard SKIP record — silent gap bila triggers
- `suspiciousUnitMix` (lessons.js:159-173): `final_value_usd ≤ amount_sol × 2 AND initial ≥ 20 AND amount_sol ≥ 0.25` → `return` (SKIP record, NO alert).
- Tujuan: deteksi "2 SOL ketulis ke final_value_usd=2" (SOL value di USD field). Tapi:
  - SKIP tanpa throw → closePosition return success dgn `pnl_usd=0` (recordPerformance return undefined → `derivedLesson1=undefined` → 2428 `derived_lesson: null`). Caller **tak tahu** record diskip.
  - NO alert → operator tak tau trade ilang dari history. /report count turun diam-diam.
  - False-positive risk: position SOL-kecil dgn final USD rendah (deposit 0.3 SOL ≈ $45 bila SOL=$150, final $30 ≤ 0.3×2=0.6 — wait, `amount_sol×2` = 0.6, final $30 > 0.6 → OK). Tapi bila final USD = $50 (deposit 0.3 SOL) dan amount_sol=0.3 → `50 ≤ 0.6`? TIDAK (50 > 0.6). Guard trigger HANYA bila final_value_usd (USD-angka) ≤ amount_sol×2 (SOL-angka) — masuk akal utk deposit $20-200. Tapi edge: amount_sol=10, final_value_usd=15 (USD) → `15 ≤ 20` true, initial≥20? bila initial=$1500 (10 SOL × $150) → ya → SKIP. False-positive utk wallet besar dgn final kecil.
- Fix arah: ganti SKIP → flag `unit_mix_suspect:true` (quarantine-style, mirip suspect_pnl) + alert. Jangan silent drop.

### G4. `recorded_pnl_usd` solMode=null — parity gap
- `recorded_pnl_usd = config.management.solMode ? null : recordedPnlUsd` (2422/2724). solMode → null → notifyClose fallback ke `res.pnl_usd` (SOL-field) → popup tampak SOL-angka, /report baca USD-angka dari performance[]. → notif != /report di solMode.
- Comment (2403-2407/2707-2711) akui "F9-besar deferred". Aktif solMode user lihat popup SOL ≠ report USD. Render-only, bukan data corruption, tapi parity contract melebar.
- Bukti: dlmm.js:2408-2422, 2712-2724, index.js:1229.

### G5. Exit-market fetch non-idempotent, time-sensitive
- exit-market snapshot (2335-2346/2639-2650) fetch pool-discovery `timeframe=config.screening.timeframe` (default 5m). Bila close terjadi saat API lag, `exit_mcap/tvl/volume` bisa reflect 5m lama, bukan exit-time. Fail-open → {} bila fetch fail. NO retry (beda dgn closed-API 6×).
- Kontrak: exit_market dipakai lessons utk context (derivLesson entry/exit compare) + reports.js by-tier. Bukan gate.
- Bukti: dlmm.js:2335-2346, 2639-2650.

### G6. signal_snapshot staging — Darwin-gated, silent bila disabled
- `resolvePerformanceSignalSnapshot` (1447-1464): `config.darwin.enabled ? getAndClearStagedSignals : null`. Darwin OFF → staged null → snapshot dari `tracked.signal_snapshot` only. Signal fields backfilled dari tracked.
- Kontrak: Darwin OFF = staging skip entirely (factory). Darwin ON = staged signals cleared (one-shot, consumer clears). Bila Darwin di-flip OFF→ON mid-flight, staged signals akumulasi (clear hanya saat Darwin ON + close) → no leak (next close clear).
- Fail-open: snapshot null bila semua null → recordPerformance tetap jalan dgn signal_snapshot null.
- Bukti: dlmm.js:1447-1464.

### G7. Paper fee-double-count avoidance — fragile kontrak
- `closePaperPosition` (1718): `final_value_usd = (position_value_usd ?? 0) − (fees_usd ?? 0) − (costs_usd ?? 0)`. Comment 1713-1717: "position_value_usd ALREADY includes fees, so pass PRINCIPAL ONLY".
- `simulatePaperMetrics` (paper-trading.js:155): `position_value_sol = positionValueSol + feesSol` → `position_value_usd = (positionValueSol + feesSol) × sp` (165). Konfirmasi: position_value SUDAH include fees.
- Fragile: bila `simulatePaperMetrics` refactored utk exclude fees dari position_value, formula 1718 jadi SALAH (kurang fees dua kali). Tidak ada assertion/contract test. Comment = satu-satunya documentation.
- Bukti: dlmm.js:1713-1718, paper-trading.js:155-165.

### G8. Closed-API pageSize=50 — positions >50 ilang
- `pageSize=50&page=1` (2306/2576). Bila wallet punya >50 closed positions di pool yg sama (extreme edge,unlikely tapi possible utk bot lama di 1 pool aktif), `posEntry.find` miss → fallback/0. NO pagination loop.
- Realistic risk rendah (jarang >50 close di 1 pool), tapi silent gap bila triggers.
- Bukti: dlmm.js:2306, 2576.

### G9. verify-then-record race — recordClose sebelum PnL settle
- `recordClose(position_address, reason)` (2289/2547) dipanggil SEBELUM closed-API fetch (2299/2568). recordClose mutate state.json (mark closed). Bila closed-API fetch + recordPerformance throw setelahnya, state.json sudah mark closed tapi performance[] kosong → trade "closed" di state tapi "tidak tercatat" di lessons.
- Fail-mode: closePosition caller lihat `success:false` (recordPerformance throw catch di caller) OR `success:true` dgn `derived_lesson:null` (recordPerformance return undefined). Operator tau ada gap hanya bila cek derived_lesson.
- Bukti: dlmm.js:2289-2299, 2547-2568.

---

## §F. Glosarium istilah fase

- **closed-PnL API**: Meteora endpoint `status=closed`, authoritative setelah withdrawal settle (5-30d lag).
- **allTimeWithdrawals**: total principal+fees ditarik (Meteora field) → `final_value_usd` (principal only setelah fees dipisah).
- **allTimeDeposits**: total modal masuk → `initial_value_usd`.
- **allTimeFees**: total fee ter-claim → `fees_earned_usd`.
- **pnlUsd/pnlSol**: Meteora precomputed PnL (USD/SOL); `pnlPctChange`/`pnlSolPctChange` = %.
- **solMode**: `config.management.solMode` — true=SOL display, false=USD. Field-select di getClosedPnlValue/getClosedPnlPct.
- **range_efficiency**: `minutes_in_range / minutes_held × 100` derived di recordPerformance (179-181), bukan input.
- **shouldRejectClosedPnl**: public-path outlier guard, reject ≤−90% non-SL sebagai unsettled + retry.
- **suspect_pnl**: quarantine flag ≤−90% non-SL yg lolus shouldReject atau via relay/fallback. Record TETAP, di-exclude dari evolve/stats/hive (lessons.js:183-221).
- **unit-mix guard**: deteksi SOL-value di USD field (`final_value_usd ≤ amount_sol×2`) → SKIP record (159-173).
- **recorded_pnl_usd**: render-only `(final+fees)−initial` recomputed utk notif==/report parity; solMode → null.
- **signal_snapshot**: merge staged Darwin signals + tracked.signal_snapshot + backfilled signal fields (1447-1464).
- **staged signals**: Darwin-mode signals staged at deploy, cleared at close (one-shot, getAndClearStagedSignals).
- **decomposition**: paper-only PnL breakdown fees/il/slippage/gas, edge before vs after costs (FASE 4 paper-trading.js).
- **classifyPaperEdge**: label source paper edge (fee-driven vs price-driven vs cost-drag), paper-trading.js:180+.

---

## §G. Link fase lain (cross-ref)

- **F9**: deploy trackPosition → `tracked` record (sumber `deployed_at`, `total_fees_claimed_usd`, `bin_range`, `peak_pnl_pct`/`trough_pnl_pct`, `signal_snapshot`, `entry_*` fields). F9 #17 mitigation = ensureDeployedAt backfill (F11) → F12 baca tracked utk compute PnL.
- **F10**: closePosition relay+public flow (zap-out vs claim+removeLiquidity). F12 = post-verify step di F10. notifyClose consumer F12 return.
- **F11**: getMyPositions open-PnL + `_positionsCache` — dipakai cached-open fallback (2612-2630). getPositionPnl open path context.
- **F13/F32**: closePaperPosition + computePaperMetrics paper path. `paper:true` tag isolation. simulatePaperMetrics pure math.
- **F17**: state.js tracked fields (deployed_at, total_fees_claimed_usd, out_of_range_since, peak_pnl_pct/trough_pnl_pct, signal_snapshot, entry_*). recordClose mutate state.
- **F18**: peak_pnl_pct/trough_pnl_pct tracked dari PnL poll (updatePnlAndCheckExits). Passed-through F12 ke return utk notifyClose give-back line.
- **F19**: recordPerformance + derivLesson + suspect_pnl filter + evolve trigger + hive/pool-memory sync. F12 = trigger utk F19.
- **F21**: Darwin signal-weights recalc — staged signals cleared di F12 (resolvePerformanceSignalSnapshot).
- **F24**: reports.js computeTradeStats baca performance[] field sama (pnl_usd/pct, range_efficiency, suspect_pnl, paper, close_reason). classifyCloseRule map close_reason.
- **F25**: notifyClose render + /report baca performance[] (F9-light parity target).

---

## §H. Open-Q (bawa ke fase lain)

1. **Relay path duplikat (G1)** — extract helper `fetchClosedPnl` shared both paths? Atau cukup tambah `shouldRejectClosedPnl` + cached fallback di relay 2299-2326? → bawa F20 evolve audit (utk assess impact data corruption di evolution).
2. **Unit-mix guard SKIP silent (G3)** — ganti SKIP → suspect-style flag + alert? False-positive rate real di wallet besar? → bawa F19 capture audit.
3. **recorded_pnl_usd solMode=null (G4)** — F9-besar deferred comment. solMode parity contract: popup SOL vs report USD. Solusinya: popup render both-units (sudah ada solPrice path, telegram.js:604)? → bawa F25 briefing audit.
4. **signal_snapshot Darwin-gated (G6)** — Darwin OFF → staged signals never cleared (akumulasi di memory). Bila Darwin ON setelah lama OFF, staged signals dari kapan? → bawa F21 Darwin audit.
5. **Paper fee-double-count fragile (G7)** — assertion/contract test utk `position_value_usd` include/exclude fees? → bawa F32 paper lifecycle.
6. **pageSize=50 (G8)** — pagination loop utk >50 closed positions? Realistic risk assessment di wallet lama? → bawa F23 memory stores audit.
7. **recordClose sebelum PnL fetch (G9)** — race window state.json mutated vs performance[] kosong. Idempotent re-record path bila recordPerformance throw? → bawa F17 state registry audit.

*F12 selesai 2026-07-07. Read-only. Kode/config tak diubah saat menyusun.*
