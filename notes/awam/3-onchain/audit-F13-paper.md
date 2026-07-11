# Audit F13 — DRY_RUN + paper lifecycle + paper/live isolation contract
> Read-only. Bukti `file:line`. UNKNOWN kalau tak pasti. Resume: buka file ini.
> Kedalaman: ⬛⬛ mandatory deep — alasan: lifecycle routing 4 cabang (deploy/getMyPositions/getPositionPnl/closePosition) di dlmm.js inside `if (DRY_RUN)` OR `isPaperMode` checks; `paper:true` tag honored di 9+ consumers (recordPerformance, getModePerformance, getLessonsForPrompt, getHourlyProfile, getNarrativeProfile, getLifetimePerformance, getPerformanceForRacikan, listRacikanInPerformance, getSuspectCount, briefing keepMode, evolveThresholds, recalculateWeights, hive, pool-memory, recordPositionSnapshot); `usePaperHistoryWhenLive` LIVE-only opt-in; paper_ id prefix detection cross-store (state.json positions vs lessons.json performance); syncOpenPositions NO paper_ guard (flip-live ghost gap); computePaperMetrics accuracy contract (exact timing/in-range, approximate fees/IL); signal_snapshot paper-only fee capture FASE 1.
> Cross-ref: F9 (deployPosition 794-875 paper branch + trackPosition virtual id + signal_snapshot fee capture), F11 (getMyPositions 1771-1773 paper short-circuit + syncOpenPositions 1669/1803/1970), F12 (closePaperPosition + computePaperMetrics + recordPerformance paper:true tag + decomposition), F17 (state.js trackPosition + recordClose + syncOpenPositions), F19 (recordPerformance paper filter + evolve livePerf + hive/pool-memory gate), F22 (getModePerformance + getLessonsForPrompt usePaperHistoryWhenLive), F25 (briefing keepMode + paper_ prefix detection + cost section sim label), F32 (paper-trading.js pure math + FASE 4 decomposition — full deep), F33 (hivemind isolation).

## Ringkasan eksekutif (5 baris)
1. **isPaperMode AND-contract** (paper-trading.js:20-22): `process.env.DRY_RUN === "true" && config.experiments?.paperTrading === true`. Both required. Flag OFF OR DRY_RUN=false → factory (would_deploy vanishes, getMyPositions hits RPC, closePosition dry-run-only no paper). Lifecycle routing 4 cabang di dlmm.js: (a) deploy 794-875 inside `if(DRY_RUN)` + `if(isPaperMode)` → trackPosition virtual `paper_<slice8>_<ts36>` id + stash `entry_fee`/`entry_active_tvl`/`entry_fee_window=24h` inside signal_snapshot (paper-only FASE 1 fee model); (b) getMyPositions 1771-1773 `isPaperMode && !wallet_address` → getPaperPositions short-circuit (bypass RPC/Meteora API); (c) getPositionPnl 1328-1347 `isPaperMode && position startsWith paper_` → computePaperMetrics; (d) closePosition 2176-2177 DRY_RUN+paper+paper_ → closePaperPosition.
2. **Paper/live isolation — `paper:true` tag honored di 9+ consumers**: recordPerformance stamps `entry.paper` via `...perf` spread (lessons.js:228) + `lesson.paper=true` (250); `livePerf` filter `!p.paper && !p.suspect_pnl && keepActiveRacikan` (298) → evolveThresholds + recalculateWeights LIVE-only; hive `!entry.paper` (257); pool-memory `!entry.paper` (265); getModePerformance (963) `isPaperMode ? p.paper : !p.paper` + suspect filter; getLifetimePerformance (927) `!p.paper`; getPerformanceForRacikan (936) `!p.paper`; listRacikanInPerformance (944) `if(p.paper) continue`; getSuspectCount (981) mode-scoped; disclosureStats (983) mode-scoped; getHourlyProfile (1047)/getNarrativeProfile (1155) via getModePerformance; getLessonsForPrompt (765) `!isPaperMode && !usePaperHistoryWhenLive → filter !l.paper`; briefing keepMode (106/309/441) `isPaperMode ? x.paper : !x.paper`; index.js recordPositionSnapshot (517) `!isPaperMode()` gate — paper positions NEVER snapshot ke pool-memory.
3. **`usePaperHistoryWhenLive`** (LIVE-only opt-in, default false): consulted ONLY when NOT paper mode (lessons.js:765). OFF → paper lessons filtered from prompt entirely. ON → paper lessons injected dgn 🧪 flag (836) as low-credibility soft reference. STILL excluded dari evolve/weights/reports/hive (tag honored regardless). Kontrak: prompt-only injection, stats tetap isolated. So a freshly-live bot carry paper history as advisory context, NEVER mechanical truth.
4. **computePaperMetrics accuracy contract** (paper-trading.js:12-15): EXACT = entry timing + in-range/OOR (read from on-chain active bin via `pool.getActiveBin()` dlmm.js:1571); APPROXIMATE = fees (proxy = `deposit × fee/active_tvl × minutesInRange/window` utk 24h window, capped `deposit × 0.5` utk data anomaly) + IL (first-order single-side-SOL fill model, `fillFrac = crossedBins/spanBins`). Pure math (paper-trading.js imports config only, no SDK, no circular). dlmm.js does on-chain reads + feeds prices. signal_snapshot paper-only fee capture (deploy 819-830): fetch pool-discovery 24h, stash raw `entry_fee`/`entry_active_tvl`. Fail-open → fall back `fee_tvl_ratio/100` (1597).
5. **PnL decomposition FASE 4** (paper-trading.js:178-216 + closePaperPosition 1734-1745): breakdown `fees_usd`/`il_usd`/`slippage_usd`/`gas_drag_usd`/`costs_usd` + `pnl_before_costs_usd` vs `pnl_usd` (after costs). `classifyPaperEdge` (184-193) labels source: "panen-fee" (fee > IL), "hoki-harga" (IL > fee), "rugi — fee tak nutup drag IL/harga", "rugi — kalah di ongkos". `formatPaperDecomposition` (200-216) human-readable utk close log. Gas-drag pakai `estimateGasSol` dari reports.js (GAS_EST_SOL) utk parity dgn briefing cost lines (paper-trading.js:1601-1604 comment). Paper close → recordPerformance dgn `final_value_usd = position_value_usd − fees_usd − costs_usd` (dlmm.js:1718, avoid fee double-count sebab position_value_usd SUDAH include fees per paper-trading.js:155).

## Progress
- [x] Baca paper-trading.js 1-65 (isPaperMode + makePaperPositionId + timeframeMinutes + clamp/fin + PAPER_EXIT_SLIPPAGE_PCT)
- [x] Baca paper-trading.js 66-176 (simulatePaperMetrics math: IL/slippage/fees/costs/decomposition return shape)
- [x] Baca paper-trading.js 178-216 (classifyPaperEdge + formatPaperDecomposition)
- [x] Baca dlmm.js 794-875 (deployPosition DRY_RUN+paper branch + signal_snapshot fee capture)
- [x] Baca dlmm.js 1328-1347 (getPositionPnl paper short-circuit)
- [x] Baca dlmm.js 1556-1622 (getPaperSolPriceUsd + computePaperMetrics on-chain reads)
- [x] Baca dlmm.js 1625-1672 (buildPaperPositionRow + getPaperPositions + syncOpenPositions call)
- [x] Baca dlmm.js 1675-1765 (closePaperPosition + recordPerformance paper:true + decomposition return)
- [x] Baca dlmm.js 1768-1773 (getMyPositions paper short-circuit)
- [x] Baca dlmm.js 2174-2177 (closePosition DRY_RUN+paper dispatch)
- [x] Baca lessons.js 156-338 (recordPerformance paper tag + livePerf filter + hive/pool-memory gate)
- [x] Baca lessons.js 756-790 (getLessonsForPrompt usePaperHistoryWhenLive + 🧪 flag)
- [x] Baca lessons.js 920-985 (getLifetimePerformance/getPerformanceForRacikan/listRacikanInPerformance/getModePerformance/getSuspectCount)
- [x] Baca lessons.js 1047-1050 (getHourlyProfile mode-scoped via getModePerformance)
- [x] Baca state.js 670-696 (syncOpenPositions — NO paper_ guard)
- [x] Baca index.js 513-517 (recordPositionSnapshot !isPaperMode gate)
- [x] Baca briefing.js 84-88/104-106/177-214/309-313/441-446/471-504 (keepMode + paper_ prefix + cost section sim label)
- [x] Grep paper references di screening.js/telegram.js/views/* (NONE — isolation confirmed)
- [x] Tulis §0 + §A-§H

---

## §0. Cara Kerja (Bahasa Awam)

**Analogi** (dua sudut pandang sehari-hari)
- *Simulator penerbangan*: pilot latihan di simulator (DRY_RUN=true + paperTrading ON). Pesawat terbang virtual (paper_ id), tidak ada bahan bakar sungguhan. Tiap gerakan terekam persis (entry timing, in-range = EXACT, baca dari "menara kontrol" on-chain). Tapi biaya simulator (fee, IL) cuma estimasi kasar (APPROXIMATE) — bukan ramalan untung. Saat pilot siap, simulator dimatikan (DRY_RUN=false) → pesawat sungguhan takeoff. Catatan simulator TIDAK PERNAH masuk logbook sungguhan (paper:true tag di-karantina di semua konsumen).
- *Akuntan dua-buku*: buku simulator (paper) + buku sungguhan (live) di lemari berbeda. Saat dry-run, buku simulator = satu-satunya dataset (tampil di /report dgn label 🧪). Saat live, buku simulator di-skip seluruhnya. Pengecualian: `usePaperHistoryWhenLive` opt-in → catatan simulator ditempel ke buku sungguhan dgn stempel 🧪 "referensi advisory, BUKAN kebenaran mekanis" — tapi tetap tak masuk perhitungan evolusi/weight/stats.

**Di bot, ini = paper trading mode + paper/live isolation contract** (1-2 kalimat)
`isPaperMode()` = DRY_RUN AND paperTrading flag. Saat ON, 4 lifecycle cabang (deploy/positions/pnl/close) route ke paper helpers di dlmm.js → pure-math sim di paper-trading.js. Setiap record diberi `paper:true` tag → 9+ consumers honor tag utk isolate dari live (evolve, stats, hive, pool-memory, prompt, briefings). Off/live = factory (would-deploy vanishes, no paper code runs).

**Posisi fase ini di alur bot** (1 paragraf)
F13 = lapisan sim di atas F9 (deploy) + F11 (positions) + F12 (close-PnL). Bukan fase terpisah — modus operasi. Saat ON, F9/F11/F12 route lewat paper helpers; saat OFF, route lewat live path. Isolation contract = jaminan saat flip ON→OFF, paper data tak contaminate live. F19 (recordPerformance) = chokepoint tag injection. F22 (getModePerformance) = chokepoint mode-scoped read. F25 (briefing) = chokepoint display label.

**Langkah kerja** (5-10 nomor, istilah teknis)
1. `isPaperMode()` check (paper-trading.js:20) = `DRY_RUN=true AND config.experiments.paperTrading===true`. AND-contract, both required.
2. Deploy route (dlmm.js:794): `if(DRY_RUN) if(isPaperMode)` → trackPosition virtual `paper_<slice8>_<ts36>` id + stash `entry_fee`/`entry_active_tvl`/`entry_fee_window=24h` inside signal_snapshot (paper-only FASE 1 fee capture, fetch pool-discovery 24h timeframe, fail-open). Return `paper:true` + 🧪-labelled pool_name → notifyDeploy fires.
3. Positions route (dlmm.js:1771): `if(isPaperMode && !wallet_address)` → getPaperPositions() → computePaperMetrics per tracked paper_ → buildPaperPositionRow (shape sama dgn live getMyPositions row) → syncOpenPositions auto-close grace utk paper yg ilang. Bypass RPC/Meteora API entirely.
4. PnL route (dlmm.js:1328): `if(isPaperMode && position startsWith paper_)` → computePaperMetrics → return open-PnL shape sama dgn live getPositionPnl.
5. Close route (dlmm.js:2176): `if(DRY_RUN) if(isPaperMode && paper_)` → closePaperPosition → computePaperMetrics → recordPerformance({…, paper:true, final_value_usd=position_value_usd−fees_usd−costs_usd}) → recordClose → return decomposition + breakdown + derived_lesson + 🧪-labelled pool_name.
6. recordPerformance (lessons.js:156): `entry = {...perf, paper:true}` via spread (228) → `lesson.paper=true` (250) → `livePerf = filter(!p.paper && !p.suspect_pnl && keepActiveRacikan)` (298) → evolve/Darwin LIVE-only. Hive `!entry.paper` (257). Pool-memory `!entry.paper` (265).
7. Read-time isolation: getModePerformance (963) `isPaperMode ? p.paper : !p.paper` + suspect filter → dipakai /report, milestone, briefings, getHourlyProfile, getNarrativeProfile. getLifetimePerformance/getPerformanceForRacikan/listRacikanInPerformance/getSuspectCount/disclosureStats semua `!p.paper`.
8. Prompt isolation: getLessonsForPrompt (765) `!isPaperMode && !usePaperHistoryWhenLive → filter !l.paper`. ON opt-in → inject dgn 🧪 flag (836), STILL excluded dari evolve/weights/reports/hive.
9. Display isolation: briefing keepMode (106/309/441) `isPaperMode ? x.paper : !x.paper`. Position rows (state.json carry no paper flag) → detect via `paper_` id prefix (310-313/443-446). Cost section label 🧪 simulasi (177-178).
10. Snapshot isolation: index.js recordPositionSnapshot (517) `!isPaperMode()` gate — paper positions NEVER snapshot ke pool-memory.json.

**Output paper lifecycle**: virtual position tracked di state.json dgn `paper_` id + `signal_snapshot` (entry_fee/active_tvl); performance record di lessons.json dgn `paper:true` tag + decomposition; lesson dgn `paper:true` tag (filtered dari live prompt/stats kecuali opt-in); 🧪-labelled Telegram notifs + briefings. NO on-chain state, NO real SOL.

**Kalau rusak / diskip** (2-3 kalimat, istilah teknis)
Isolation breach (consumer miss `!p.paper` filter) → paper sim data masuk live evolve/stats → evolution dorong pool beracun berdasarkan data palsu, /report + briefings tampak menang/padahal simulasi. Flip DRY_RUN→false dgn open paper positions → syncOpenPositions auto-close paper_ records di state.json TANPA recordPerformance (ghost close, NO lesson) — open paper positions vanish tanpa trace. computePaperMetrics on-chain read fail (getActiveBin/getPool) → return null → getPaperPositions skip position → /positions empty, management cycle skip.

**Istilah yang muncul di fase ini** (bullet, cuma yang baru)
- **isPaperMode** — AND(DRY_RUN=true, paperTrading flag). Mode selector.
- **paper_ id** — synthetic `paper_<poolslice8>_<ts36>`, no on-chain pubkey (paper-trading.js:25-28).
- **paper:true tag** — recordPerformance spread injection (lessons.js:228), honored di 9+ consumers utk isolation.
- **usePaperHistoryWhenLive** — LIVE-only opt-in, inject paper lessons ke prompt dgn 🧪 flag (lessons.js:765), STILL excluded dari evolve/stats/hive.
- **getModePerformance** — mode-scoped read chokepoint (lessons.js:963), `isPaperMode ? paper : !paper`.
- **FASE 1 fee capture** — paper-only raw fee/active_tvl stash di signal_snapshot (dlmm.js:819-830), 24h window.
- **FASE 4 decomposition** — PnL breakdown fees/il/slippage/gas, edge before vs after costs (paper-trading.js:178-216).
- **classifyPaperEdge** — label source paper edge: panen-fee/hoki-harga/rugi.
- **computePaperMetrics** — on-chain active-bin read + pure-math sim (dlmm.js:1567 + paper-trading.js:69).
- **syncOpenPositions** — auto-close grace 5min utk positions missing from on-chain (state.js:672), NO paper_ guard.

*Lewati §0 kalau sudah paham. Isi teknis mulai §A.*

---

## §A. Peta block fase ini (file:line → peran)

| file:line | simbol | peran |
|---|---|---|
| paper-trading.js:1-16 | module header | accuracy contract: EXACT timing/in-range, APPROXIMATE fees/IL |
| paper-trading.js:17-22 | isPaperMode | AND(DRY_RUN, paperTrading flag) |
| paper-trading.js:24-28 | makePaperPositionId | synthetic `paper_<slice8>_<ts36>` id |
| paper-trading.js:30-38 | timeframeMinutes | parse screening timeframe → minutes (fallback 30) |
| paper-trading.js:40-48 | clamp/fin + PAPER_EXIT_SLIPPAGE_PCT | helpers + 1% exit-swap haircut |
| paper-trading.js:69-169 | simulatePaperMetrics | pure math: IL/slippage/fees/costs/decomposition |
| paper-trading.js:178-193 | classifyPaperEdge | label source edge (panen-fee/hoki-harga/rugi) |
| paper-trading.js:200-216 | formatPaperDecomposition | human-readable breakdown utk log |
| dlmm.js:794-875 | deployPosition paper branch | trackPosition virtual id + signal_snapshot fee capture |
| dlmm.js:819-830 | paper FASE 1 fee fetch | pool-discovery 24h, stash entry_fee/active_tvl, fail-open |
| dlmm.js:1328-1347 | getPositionPnl paper | computePaperMetrics short-circuit |
| dlmm.js:1553-1564 | getPaperSolPriceUsd | cached SOL price TTL 5min (fail-open last-good) |
| dlmm.js:1567-1622 | computePaperMetrics | on-chain active-bin read + simulatePaperMetrics call |
| dlmm.js:1625-1654 | buildPaperPositionRow | shape sim result → getMyPositions row |
| dlmm.js:1657-1672 | getPaperPositions | synthesize open paper list + syncOpenPositions |
| dlmm.js:1675-1765 | closePaperPosition | recordPerformance paper:true + decomposition return |
| dlmm.js:1718 | paper final_value_usd | position_value_usd − fees_usd − costs_usd (avoid double-count) |
| dlmm.js:1771-1773 | getMyPositions paper short-circuit | isPaperMode && !wallet_address → getPaperPositions |
| dlmm.js:2176-2177 | closePosition paper dispatch | DRY_RUN+paper+paper_ → closePaperPosition |
| lessons.js:228 | recordPerformance entry spread | `...perf` injects paper:true |
| lessons.js:250 | lesson.paper stamp | tag derived lesson |
| lessons.js:257-259 | hive push gate | !entry.paper && !entry.suspect_pnl |
| lessons.js:265-289 | pool-memory gate | !entry.paper && !entry.suspect_pnl |
| lessons.js:298 | livePerf filter | !p.paper && !p.suspect_pnl && keepActiveRacikan → evolve/Darwin |
| lessons.js:328 | hive performance event gate | !entry.paper && !entry.suspect_pnl |
| lessons.js:765-767 | getLessonsForPrompt paper filter | !isPaperMode && !usePaperHistoryWhenLive → filter !l.paper |
| lessons.js:836 | 🧪 flag injection | l.paper ? "🧪 " : "" prefix |
| lessons.js:926-928 | getLifetimePerformance | !p.paper |
| lessons.js:936-941 | getPerformanceForRacikan | !p.paper |
| lessons.js:944-953 | listRacikanInPerformance | if(p.paper) continue |
| lessons.js:963-973 | getModePerformance | mode-scoped chokepoint + suspect filter |
| lessons.js:981-984 | getSuspectCount | mode-scoped + suspect_pnl |
| lessons.js:983 | disclosureStats | mode-scoped (returns {0,0} in paper mode) |
| lessons.js:1047-1050 | getHourlyProfile | via getModePerformance (mode-scoped) |
| lessons.js:1155 | getNarrativeProfile | via getModePerformance (mode-scoped) |
| state.js:670-696 | syncOpenPositions | auto-close grace 5min, NO paper_ guard |
| index.js:513-517 | recordPositionSnapshot gate | !isPaperMode() — paper never snapshot to pool-memory |
| index.js:238 | milestone perf | getModePerformance (mode-scoped) |
| index.js:1947-1948 | config display | paperTrading + usePaperHistoryWhenLive flags |
| index.js:2445-2446 | settings toggle | paper flags button menu |
| index.js:2875 | dry-run status line | "dryRun=true (paper, aman sampai owner flip)" |
| briefing.js:84-88 | gas-tracker count | skip dry-run/paper actions |
| briefing.js:104-106 | keepMode perf | isPaperMode ? x.paper : !x.paper |
| briefing.js:177-214 | cost section | 🧪 simulasi label + sim/est tag |
| briefing.js:309-313 | activity positions | keepMode + paper_ prefix detection |
| briefing.js:441-446 | periodic activity | keepMode + paper_ prefix detection |
| briefing.js:471-504 | periodic cost | paper label + sim/est tag |

---

## §B. Alur data hulu→hilir (ASCII diagram)

```
isPaperMode() = DRY_RUN=true AND config.experiments.paperTrading=true  (paper-trading.js:20)
  │
  ├─ OFF (flag false OR DRY_RUN false) → FACTORY
  │   deploy: would-deploy return + vanish (dlmm.js:876-880)
  │   getMyPositions: RPC/Meteora API (F11)
  │   getPositionPnl: Meteora direct (F11)
  │   closePosition: dry_run return OR live close (F10)
  │
  └─ ON (both true) → PAPER LIFECYCLE
      │
      DEPLOY (dlmm.js:794-875)
      ├─ activeBin = pool.getActiveBin() (on-chain EXACT)
      ├─ paperId = makePaperPositionId(pool_address)
      ├─ paper FASE 1 fee fetch (pool-discovery 24h) → signal_snapshot.entry_fee/active_tvl
      ├─ trackPosition({position: paperId, …, signal_snapshot: paperSig}) → state.json
      └─ return {paper:true, position: paperId, pool_name: 🧪…} → notifyDeploy
      │
      POSITIONS (dlmm.js:1771-1773 → 1657-1672)
      ├─ getTrackedPositions(true).filter(paper_) (state.json)
      ├─ per tracked: computePaperMetrics (on-chain active-bin + simulatePaperMetrics)
      ├─ markInRange/markOutOfRange (sync OOR time — EXACT)
      ├─ buildPaperPositionRow (shape == live row)
      ├─ syncOpenPositions(positions.map) → auto-close paper_ missing >5min
      └─ return {positions, paper:true}
      │
      PNL (dlmm.js:1328-1347)
      ├─ getTrackedPosition(paper_)
      ├─ computePaperMetrics(tracked)
      └─ return {pnl_usd, pnl_pct, in_range, lower/upper/active_bin, paper:true}
      │
      CLOSE (dlmm.js:2176-2177 → 1675-1765)
      ├─ computePaperMetrics(tracked) → sim metrics + decomposition
      ├─ recordPerformance({…, final_value_usd = position_value_usd − fees_usd − costs_usd,
      │                     paper:true, signal_snapshot: resolvePerformanceSignalSnapshot})
      │   ├─ entry = {...perf, paper:true}  (lessons.js:228)
      │   ├─ lesson.paper = true  (250)
      │   ├─ livePerf filter !p.paper → evolve/Darwin SKIP  (298)
      │   ├─ hive !entry.paper → SKIP  (257)
      │   └─ pool-memory !entry.paper → SKIP  (265)
      ├─ recordClose(position_address) → state.json mark closed
      ├─ decomposition = {fees, il, slippage, gas_drag, costs, edge_before/after, source}
      └─ return {paper:true, pnl_usd, pnl_pct, decomposition, breakdown, derived_lesson}
      │
      READ-TIME ISOLATION (live or dry-run)
      ├─ getModePerformance()  (lessons.js:963)
      │   isPaperMode ? filter(p.paper) : filter(!p.paper)  + suspect filter + keepActiveRacikan
      │   → /report, milestone, briefings, getHourlyProfile, getNarrativeProfile
      ├─ getLessonsForPrompt()  (lessons.js:765)
      │   !isPaperMode && !usePaperHistoryWhenLive → filter(!l.paper)
      │   opt-in ON → inject paper dgn 🧪 flag (836), STILL excluded evolve/stats/hive
      ├─ briefing keepMode  (briefing.js:106/309/441)
      │   isPaperMode ? x.paper : !x.paper
      │   position rows: paper_ id prefix detection (310-313/443-446)
      └─ recordPositionSnapshot  (index.js:517)  !isPaperMode() gate → paper never pool-memory
```

---

## §C. Sinkron: siapa-panggil-siapa

| Pemanggil (file:line) | Dipanggil (file:line) | Trigger | Data lewat | Fail-mode |
|---|---|---|---|---|
| dlmm.js:794 deployPosition DRY_RUN | dlmm.js:797 isPaperMode check | deploy tool call | — | flag false → factory would-deploy |
| dlmm.js:832 paper trackPosition | state.js trackPosition | paper deploy | {position: paperId, …, signal_snapshot} | throw → paper_warn, fall back would-deploy |
| dlmm.js:819-830 paper fee fetch | pool-discovery-api 24h | paper deploy | pool_address | catch → {} (fall back fee_tvl_ratio/100) |
| dlmm.js:1771 getMyPositions | dlmm.js:1657 getPaperPositions | isPaperMode && !wallet_address | — | throw → portfolio fetch path? (UNKNOWN) |
| dlmm.js:1663 getPaperPositions | dlmm.js:1567 computePaperMetrics | per tracked paper_ | tracked | null → skip position |
| dlmm.js:1567 computePaperMetrics | paper-trading.js:69 simulatePaperMetrics | on-chain read done | entryPrice/currentPrice/…/gasDragSol | throw → null (log paper_warn) |
| dlmm.js:1328 getPositionPnl | dlmm.js:1331 computePaperMetrics | isPaperMode && paper_ | tracked | null → {error} |
| dlmm.js:2176 closePosition DRY_RUN | dlmm.js:1675 closePaperPosition | isPaperMode && paper_ | position_address, reason | throw → caller |
| dlmm.js:1693 closePaperPosition | lessons.js:156 recordPerformance | paper close | perf + paper:true | throw → paper_warn log |
| dlmm.js:1718 paper final_value_usd | (formula) | recordPerformance prep | position_value_usd − fees_usd − costs_usd | — |
| dlmm.js:1669/1803/1970 syncOpenPositions | state.js:672 syncOpenPositions | getMyPositions both paths | positions.map(position) | NO paper_ guard (gap G1) |
| lessons.js:298 recordPerformance | lessons.js evolveThresholds + recalculateWeights | every 5 live close | livePerf (!paper) | paper excluded |
| lessons.js:765 getLessonsForPrompt | (filter) | prompt build | — | usePaperHistoryWhenLive opt-in |
| lessons.js:963 getModePerformance | (filter) | report/briefing/milestone | — | mode-scoped chokepoint |
| index.js:517 recordPositionSnapshot | pool-memory.js | management cycle | pool, position | !isPaperMode() gate |
| briefing.js:106/309/441 keepMode | (filter) | briefing render | — | mode-scoped |
| briefing.js:310-313 paper_ prefix | (string check) | briefing positions | position id | state.json carry no paper flag |

---

## §D. Logika kunci per fungsi

### isPaperMode (paper-trading.js:20-22)
- Apa: AND-contract mode selector.
- Kapan dipicu: setiap lifecycle routing (deploy/getMyPositions/getPositionPnl/close) + setiap consumer read (getModePerformance/getLessonsForPrompt/briefing/recordPositionSnapshot).
- Output: boolean.
- Sinkron: DRY_RUN env (process.env) + config.experiments.paperTrading (config.js). Flip either → mode switch.
- Fail-mode: either false → factory. NO partial mode.
- Bukti: paper-trading.js:20-22.

### makePaperPositionId (paper-trading.js:24-28)
- Apa: synthetic id `paper_<poolslice8>_<Date.now().toString(36)>`.
- Kapan dipicu: paper deploy (dlmm.js:809).
- Output: string. No on-chain pubkey.
- Sinkron: trackPosition keyed by this id (state.js). getTrackedPosition/getTrackedPositions filter by `paper_` prefix.
- Fail-mode: collision bila 2 deploy same pool same ms (edge, ms-precision base36). 2nd overwrites 1st (trackPosition keyed by position).
- Bukti: paper-trading.js:24-28.

### simulatePaperMetrics (paper-trading.js:69-169) — pure math
- Apa: IL (single-side-SOL fill) + slippage (flat % exit-swap) + fees (deposit × fee/TVL × time-in-range, capped) + costs (gas+slippage) + PnL decomposition.
- Kapan dipicu: computePaperMetrics (dlmm.js:1606).
- Output: {in_range, price_move_pct, fill_frac, fees_sol, il_sol, gas_drag_sol, slippage_sol, costs_sol, pnl_before_costs_sol, pnl_sol, pnl_pct, position_value_sol, *_usd mirrors, minutes_*}.
- Sinkron: inputs from dlmm.js computePaperMetrics (on-chain active-bin read + tracked signal_snapshot + getPaperSolPriceUsd + estimateGasSol dari reports.js).
- Fail-mode: solPrice 0 → USD fields 0 (SOL fields valid); fee defensive cap `deposit × 0.5` utk data anomaly; clamp slippagePct [0, 0.5].
- Bukti: paper-trading.js:69-169.

### computePaperMetrics (dlmm.js:1567-1622) — on-chain read + sim
- Apa: read on-chain active-bin (EXACT) + run simulatePaperMetrics.
- Kapan dipicu: getPaperPositions (1663), getPositionPnl paper (1331), closePaperPosition (1680).
- Output: sim metrics + currentBin/lowerBin/upperBin/entryPrice/currentPrice.
- Sinkron: signal_snapshot paper-only fields (entry_fee/entry_active_tvl/entry_fee_window) utk FASE 1 fee yield; fallback fee_tvl_ratio/100 (1597); estimateGasSol utk gas-drag parity dgn briefing (1604).
- Fail-mode: getActiveBin/getPool throw → return null + paper_warn log. Caller skip position.
- Bukti: dlmm.js:1567-1622.

### getPaperPositions (dlmm.js:1657-1672)
- Apa: synthesize open paper position list dari getTrackedPositions(true).filter(paper_).
- Kapan dipicu: getMyPositions paper short-circuit (1772).
- Output: {wallet, total_positions, positions, paper:true}.
- Sinkron: buildPaperPositionRow (shape == live row, F11); markInRange/markOutOfRange sync OOR time; syncOpenPositions auto-close grace.
- Fail-mode: computePaperMetrics null → skip position (silent).
- Bukti: dlmm.js:1657-1672.

### closePaperPosition (dlmm.js:1675-1765)
- Apa: finalize virtual close — recordPerformance paper:true + recordClose + decomposition return.
- Kapan dipicu: closePosition paper dispatch (2177).
- Output: {success, paper:true, pnl_usd, pnl_pct, decomposition, breakdown, derived_lesson, message}.
- Sinkron: recordPerformance (paper:true tag → isolation); recordClose (state.json mark closed); resolvePerformanceSignalSnapshot (staged Darwin signals).
- Fail-mode: tracked null → {dry_run, paper, would_close, message}; computePaperMetrics null → metrics 0; recordPerformance throw → paper_warn log, close tetap.
- Bukti: dlmm.js:1675-1765.

### recordPerformance paper tag (lessons.js:156-338)
- Apa: stamp `paper:true` via `...perf` spread, honor tag di all consumers.
- Kapan dipicu: closePaperPosition call (1693).
- Output: entry dgn paper:true + lesson.paper:true.
- Sinkron: livePerf filter !p.paper (298) → evolve/Darwin LIVE-only; hive !entry.paper (257); pool-memory !entry.paper (265); getModePerformance mode-scoped (963); getLessonsForPrompt filter/opt-in (765).
- Fail-mode: paper tag missed di consumer → isolation breach (cross-ref G1-G8 audit).
- Bukti: lessons.js:228, 250, 257, 265, 298, 328, 765, 963.

### getModePerformance (lessons.js:963-973) — mode-scoped chokepoint
- Apa: filter performance[] by current mode + active racikan + suspect.
- Kapan dipicu: /report, milestone (index.js:238), briefings, getHourlyProfile, getNarrativeProfile, all user-facing reads.
- Output: performance[] array (mode-scoped).
- Sinkron: isPaperMode (paper-trading.js); keepActiveRacikan (per-racikan isolation); suspect_pnl (quarantine).
- Fail-mode: mode misread → cross-mix. NO fail-open — mode read is deterministic.
- Bukti: lessons.js:963-973.

### syncOpenPositions (state.js:670-696) — NO paper_ guard
- Apa: auto-close tracked positions missing from on-chain after 5min grace.
- Kapan dipicu: getMyPositions both paths (dlmm.js:1669 paper, 1803 RPC, 1970 Meteora).
- Output: state.json mutate `pos.closed=true` + note "Auto-closed during state sync".
- Sinkron: getMyPositions activeSet (on-chain positions list, paper_ for paper mode, real for live).
- Fail-mode: NO paper_ guard — bila DRY_RUN flipped false mid-flight dgn open paper positions → paper_ records NOT in on-chain activeSet (RPC path) + past 5min grace → marked closed TANPA recordPerformance → ghost close, NO lesson (gap G1).
- Bukti: state.js:670-696.

---

## §E. Temuan: bug / gap / kontrak-kunci / fail-open tak-terpenuhi

### G1. syncOpenPositions NO paper_ guard — flip-live ghost close (⬛⬛ mandatory)
- state.js:672-696 syncOpenPositions iterates ALL `state.positions`, marks `pos.closed=true` bila `!activeSet.has(posId) && past SYNC_GRACE_MS=5min`. NO `paper_` prefix check.
- Skenario: user run paper mode, open paper positions tracked di state.json. User flip `DRY_RUN=false` (live). getMyPositions live path (RPC 1803 OR Meteora 1970) returns on-chain positions only (no `paper_` match). syncOpenPositions marks `paper_` records `closed=true` dgn note "Auto-closed during state sync (not found on-chain data)". TAPI `recordClose` di state.js hanya set `closed` flag — NO `recordPerformance` call (that's only di closePosition path). → ghost close: state.json marks closed, lessons.json NO performance record, NO lesson, NO decomposition.
- Impact: open paper positions vanish without lesson when flip live. /report + briefings lose those closes entirely. Pool-memory untouched (paper never snapshot, G录 index.js:517 gate — solid). Tapi state.json bloat + operator has no record of paper close outcomes.
- Mitigation available: operator should manually `close_position` all paper positions BEFORE flip (via Telegram /close <n> or REPL). closePosition paper dispatch (2176-2177) routes paper_ → closePaperPosition → recordPerformance properly. Tapi NO enforcement/alert at flip time.
- Fix arah: add `if (posId.startsWith("paper_")) continue;` di syncOpenPositions (state.js:679), OR alert at flip-live dgn open paper positions. Cross-ref F17 state registry audit.
- Bukti: state.js:672-696, dlmm.js:1669/1803/1970.

### G2. paper_ id collision (ms-precision)
- `makePaperPositionId` (paper-trading.js:25-28) = `paper_<poolslice8>_${Date.now().toString(36)}`. ms-precision base36. trackPosition keyed by position (state.js). Bila 2 deploy di same pool same ms (batch deploy, unlikely tapi possible) → 2nd overwrites 1st di state.json. 1st paper position ilang tanpa close.
- Realistic risk rendah (manual deploy, SCREENER sequential). Tapi NO uniqueness guarantee.
- Fix arah: append random suffix (e.g. `_${Math.random().toString(36).slice(2,6)}`).
- Bukti: paper-trading.js:24-28.

### G3. usePaperHistoryWhenLive — prompt-only injection, stats tetap isolated (KONTRAK)
- lessons.js:765-767: `!isPaperMode && !usePaperHistoryWhenLive → filter !l.paper`. ON opt-in → paper lessons KEPT dgn 🧪 flag (836). TAPI getModePerformance (963) tetap `!p.paper` bila live → /report + briefings + milestone TIDAK inject paper. evolveThresholds livePerf (298) tetap `!p.paper`. hive/pool-memory tetap skip.
- Kontrak: opt-in = prompt advisory ONLY. Stats/evolve/hive/pool-memory isolated regardless. SOLID — operator can carry paper history as soft reference without contaminating mechanical truth.
- Bukti: lessons.js:765-767, 836, 963-973, 298, 257, 265.

### G4. signal_snapshot paper-only fields — leak bila flag flipped mid-position
- deploy paper stash `entry_fee`/`entry_active_tvl`/`entry_fee_window=24h` inside `tracked.signal_snapshot` (dlmm.js:819-830, 846). Field names are paper-specific (no live consumer reads them).
- Bila `paperTrading` flag flipped OFF mid-position (DRY_RUN still true): computePaperMetrics fallback path (1597) `fee_tvl_ratio/100` bila `entry_fee` absent — but `entry_fee` IS present (stashed at deploy). So sim still uses paper-captured raw fee. NO leak (paper-only fields ignored by live consumers).
- Bila DRY_RUN flipped false: getMyPositions live → paper_ records ghost-closed (G1). signal_snapshot w/ paper fields stays in state.json (closed record). NO live consumer reads `entry_fee`/`entry_active_tvl` — confirmed via grep (only computePaperMetrics reads them). SOLID isolation.
- Bukti: dlmm.js:819-830, 846, 1591-1599; grep confirms no live reader.

### G5. paper fee-double-count avoidance fragile (cross-ref F12 G7)
- closePaperPosition `final_value_usd = position_value_usd − fees_usd − costs_usd` (dlmm.js:1718). Comment 1713-1717: "position_value_usd ALREADY includes fees, so pass PRINCIPAL ONLY". simulatePaperMetrics (paper-trading.js:155, 165): `position_value_sol = positionValueSol + feesSol` → `position_value_usd = (positionValueSol + feesSol) × sp`. Konfirmasi: position_value SUDAH include fees.
- Fragile: bila simulatePaperMetrics refactored utk exclude fees dari position_value, formula 1718 jadi SALAH (kurang fees dua kali → pnl double-discount). Tidak ada assertion/contract test. Comment = satu-satunya documentation.
- Bukti: dlmm.js:1713-1718, paper-trading.js:155, 165.

### G6. computePaperMetrics on-chain read dependency — fail-null cascade
- computePaperMetrics (dlmm.js:1567) calls `getPool(tracked.pool)` + `pool.getActiveBin()`. Bila RPC down OR pool cache miss → throw → return null. Caller:
  - getPaperPositions (1663): `if (!m) continue` → position skip dari /positions list. Management cycle tak liat position → skip OOR/SL/TP check utk position tsb.
  - getPositionPnl paper (1331): return `{error: "Paper PnL simulation unavailable"}`.
  - closePaperPosition (1680): `m?.pnl_usd ?? 0` → recordPerformance dgn pnl=0 (silent rug in record).
- Close path paling berbahaya: bila RPC down saat close, paper close tertulis pnl=0 padahal bisa rugi/untung. Tidak ada retry (beda dgn live closed-API 6× retry F12).
- Fix arah: closePaperPosition retry computePaperMetrics 3× 5s sebelum fall back ke 0. Cross-ref F32 paper lifecycle.
- Bukti: dlmm.js:1567-1622, 1663, 1331, 1680-1689.

### G7. paper_ prefix detection cross-store inconsistency
- state.json `positions[]` rows: NO `paper` field (trackPosition tidak set). Briefing detect via `String(p.position).startsWith("paper_")` (briefing.js:310-313, 443-446).
- lessons.json `performance[]` rows: `paper:true` field (recordPerformance spread, 228). Briefing keepMode filter via `x.paper` (briefing.js:106, 309, 441).
- Kontrak: detection scheme berbeda per store. Bila paper id scheme berubah (e.g. `sim_` prefix), briefing position detection break → paper positions leak ke live briefing activity counts. Tapi performance detection (tag) tetap solid.
- Fragile tapi documented (comment briefing.js:310 "Tracked positions carry no paper flag — the synthetic id prefix marks sim rows").
- Bukti: briefing.js:310-313, 443-446, 106, 309, 441; state.js trackPosition (no paper field); lessons.js:228.

### G8. getPaperPositions external wallet bypass
- getMyPositions paper short-circuit (dlmm.js:1771): `if (isPaperMode() && !wallet_address)`. Bila user query external wallet (e.g. `/positions <other_wallet>` saat paper mode) → `wallet_address` set → bypass paper → hit RPC/Meteora API → return empty (idle wallet has no on-chain positions) OR other wallet's real positions.
- Unintended: external wallet inspect di paper mode = silent empty OR foreign positions. Tapi documented behavior (wallet_address = external bypass). NO alert.
- Realistic risk rendah (rare operator action). Tapi paper-mode user expecting "all paper" might confuse.
- Bukti: dlmm.js:1771-1773.

### G9. paper solPrice TTL 5min — stale USD fields
- getPaperSolPriceUsd (dlmm.js:1556-1564) caches SOL price 5min. Bila Jupiter down >5min → last-good price retained. USD fields di simulatePaperMetrics (paper-trading.js:156-165) pakai cached `sp`. Stale `sp` → USD PnL stale (SOL fields tetap valid sebab pure-math di SOL).
- Accuracy contract (paper-trading.js:12-15): USD fields are display-only mirror of SOL fields. SOL fields = canonical. NO data corruption (just stale display).
- Mitigation: `if (Number.isFinite(p) && p > 0)` gate — bila Jupiter returns 0/invalid, retain last-good. SOL price 0 → USD fields 0 (paper-trading.js:156, sp=Math.max(0, …)).
- Bukti: dlmm.js:1553-1564, paper-trading.js:86, 156-165.

---

## §F. Glosarium istilah fase

- **isPaperMode**: AND(DRY_RUN=true, paperTrading flag=true). Mode selector, never partial.
- **paper_ id**: synthetic `paper_<poolslice8>_<ts36>`, no on-chain pubkey.
- **paper:true tag**: recordPerformance spread injection, honored di 9+ consumers utk isolation.
- **usePaperHistoryWhenLive**: LIVE-only opt-in, inject paper lessons ke prompt dgn 🧪 flag, STILL excluded dari evolve/stats/hive.
- **getModePerformance**: mode-scoped read chokepoint (isPaperMode ? paper : !paper) + suspect + racikan filter.
- **FASE 1 fee capture**: paper-only raw fee/active_tvl stash di signal_snapshot, 24h window (dlmm.js:819-830).
- **FASE 4 decomposition**: PnL breakdown fees/il/slippage/gas, edge before vs after costs (paper-trading.js:178-216).
- **classifyPaperEdge**: label source paper edge (panen-fee/hoki-harga/rugi).
- **computePaperMetrics**: on-chain active-bin read + pure-math sim (dlmm.js:1567 + paper-trading.js:69).
- **syncOpenPositions**: auto-close grace 5min utk positions missing from on-chain (state.js:672), NO paper_ guard.
- **EXACT/APPROXIMATE contract**: entry timing + in-range/OOR = EXACT (on-chain read); fees + IL = APPROXIMATE (proxy math).
- **keepMode**: briefing filter helper `isPaperMode ? x.paper : !x.paper`.
- **keepActiveRacikan**: per-racikan isolation (active_setup match), stacked dgn paper filter.

---

## §G. Link fase lain (cross-ref)

- **F9**: deployPosition 794-875 paper branch + trackPosition virtual id + signal_snapshot FASE 1 fee capture. F9 #17 (untracked backfill) — paper deploy selalu trackPosition, no backfill needed.
- **F11**: getMyPositions 1771-1773 paper short-circuit + syncOpenPositions 1669/1803/1970 (gap G1) + buildPaperPositionRow shape parity dgn live row.
- **F12**: closePaperPosition + computePaperMetrics + recordPerformance paper:true tag + decomposition + final_value_usd fee-double-count avoidance (G5).
- **F17**: state.js trackPosition + recordClose + syncOpenPositions (NO paper_ guard, G1). Paper_ records di state.json carry no paper flag (G7).
- **F19**: recordPerformance paper tag injection + livePerf filter + hive/pool-memory gate. F19 = chokepoint tag injection.
- **F22**: getModePerformance + getLessonsForPrompt usePaperHistoryWhenLive + getHourlyProfile/getNarrativeProfile mode-scoped. F22 = mode-scoped read chokepoint.
- **F25**: briefing keepMode + paper_ prefix detection (G7) + cost section 🧪 simulasi label + gas-tracker skip paper actions.
- **F32**: paper-trading.js pure math + FASE 4 decomposition + classifyPaperEdge + formatPaperDecomposition — full deep (F13 = lifecycle routing + isolation contract; F32 = math depth).
- **F33**: hivemind isolation (!entry.paper gate, lessons.js:257, 328).

---

## §H. Open-Q (bawa ke fase lain)

1. **syncOpenPositions paper_ guard (G1)** — add `if (posId.startsWith("paper_")) continue` OR alert at flip-live? Cross-store: state.json ghost close vs lessons.json no record. → bawa F17 state registry audit (chokepoint).
2. **paper_ id collision (G2)** — random suffix? Risk assessment di batch deploy scenario? → bawa F9 deploy audit.
3. **paper fee-double-count fragile (G5)** — assertion/contract test utk `position_value_usd` include/exclude fees? → bawa F32 paper lifecycle.
4. **computePaperMetrics close retry (G6)** — 3× 5s retry sebelum fall back pnl=0? Live closed-API has 6× retry, paper has none. → bawa F32.
5. **paper_ prefix detection cross-store (G7)** — add `paper:true` field to state.js positions too (parity dgn lessons.json)? Atau document scheme immutability? → bawa F17.
6. **getPaperPositions external wallet bypass (G8)** — alert paper-mode user bila query external wallet? Atau document? → bawa F30 telegram cmd audit.
7. **usePaperHistoryWhenLive prompt-only (G3)** — verify NO other consumer accidentally inject paper (e.g. milestone report, /report all tier). → bawa F22 + F24 stats audit.
8. **flip-live operational runbook** — G1 ghost close + G4 signal_snapshot retention + G7 detection. Documented procedure utk operator sebelum flip DRY_RUN→false? → bawa F33 edge audit / onboarding.

*F13 selesai 2026-07-07. Read-only. Kode/config tak diubah saat menyusun.*
