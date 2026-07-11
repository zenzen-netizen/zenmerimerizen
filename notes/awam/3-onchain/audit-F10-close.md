# Audit F10 — Close relay + public + claim + gap trigger-vs-realisasi
> Read-only. Bukti `file:line`. UNKNOWN kalau tak pasti. Resume: buka file ini.
> Kedalaman: ⬛⬛ deep — alasan: `closePosition` 3-path (paper/relay/public) + claim tandem + rent refund via close ix + recordPerformance dipicu di dlmm.js (BUKAN executor, F8 #5 resolve) + F9-light gap fix notif==report + relay safety signAndSimulate (defense vs malicious relay tx) + circuit breaker + close-confirmation polling + cached pnl fallback + shouldRejectClosedPnl anti-outlier.
> Cross-ref: F8 (post-success notifyClose + swapBaseToSolWithRetry wiring), F9 (deployPosition + rent reserve + rent refund via close), F11 (getMyPositions refresh post-close), F13/F32 (closePaperPosition paper isolation), F19 (recordPerformance + resolvePerformanceSignalSnapshot), F21 (darwin staged signals), F23 (recordClose + appendDecision), F25 (gas-tracker close/claim), F30 (notifyClose telegram transport), F24 (classifyCloseRule mapping close_reason).

## Ringkasan eksekutif (5 baris)
1. `closePosition` (dlmm.js:2172-2760) 3-path: **DRY_RUN paper** (2176-2178, `isPaperMode + paper_` prefix → `closePaperPosition` F32) OR **relay zap-out** (2189-2436, LPAgent `/execution/zap-out/order`+`/submit`, `shouldUseLpAgentRelay` gate) OR **public SDK** (2438-2760, Step 1 claim + Step 2 removeLiquidity/closePosition). Relay fallback ke public bila error BEFORE submit (`relaySubmitted=false`); throw bila AFTER submit (can't recover). Both relay+public: 5s wait + 4-attempt × 3s close-confirmation polling via `getMyPositions({force:true})`.
2. **recordPerformance dipicu di dlmm.js** (relay 2348 + public 2652) — F8 #5 RESOLVED. Bukan di executor. 2 trigger point (relay + public), masing-masing passing tracked.* + exitMarket + signalSnapshot + feesUsd + finalValueUsd + initialUsd + minutes_held/OOR + close_reason. Paper path → `closePaperPosition` (1675) call `recordPerformance` (1693) dengan `paper:true` tag (F19). `appendDecision` close (2383 relay + 2687 public + 2734 untracked) persist decision-log.
3. **F9-light gap fix** (2403-2409 relay, 2707-2713 public): `recorded_pnl_usd = (finalValueUsd + feesUsd) - initialUsd` = formula recordPerformance (lessons.js:173). `notifyClose` (executor.js:803) pakai `recorded_pnl_usd ?? pnl_usd` → notif headline == `/report` post-fix. SOL mode: `recorded_pnl_usd=null` → fallback `pnl_usd` (SOL headline). Render-only — canonical recorded pnl_usd di recordPerformance unchanged. Pre-F9-light: notif pakai `pnlUsd` (Meteora API) yang bisa beda dengan lessons formula → gap notif vs report. **Gap closed.**
4. **claimFees** (2126-2169): `tracked.closed` guard → `lookupPoolForPosition` → `poolCache.delete` (fresh fee state) → `pool.getPosition` + `pool.claimSwapFee` → `sendTxTracked` → `recordClaim`. Return `base_mint` utk executor auto-swap (F8:821). Tandem dgn `closePosition` Step 1 (2447-2468): `recentlyClaimed = last_claim_at < 60s` → skip claim (avoid double-claim). `claimFees` standalone juga cek `tracked.closed` (2133) → refuse bila already closed ("fees were claimed during close").
5. **Rent refund via close ix** — F9 E.1 bug mitigation CONFIRMED: public path `pool.removeLiquidity({shouldClaimAndClose:true})` (2495) OR `pool.closePosition` (2504) → position account closed → rent ~0.057 SOL refund ke owner regardless of close reason. Relay path zap-out bundel close+swap, rent refund implisit. **Rent recovered on close** — distinct dari BIN_ARRAY_FEE non-refundable (blocked pre-deploy F9). Relay safety `signAndSimulateRelayTransactions` (394-464): simulate tiap tx pre-submit, assert owner lamport delta ≥ −0.05 SOL, assert no unrelated token debit (allowedDebitMints), assert requiredStaticAccounts present. Defense vs malicious relay tx. Circuit breaker (162-200): 2-fail OR 401/403 → open 10m.

## Progress
- [x] Baca dlmm.js 2126-2169 (claimFees)
- [x] Baca dlmm.js 2172-2479 (closePosition paper + relay path + public Step 1/2 start)
- [x] Baca dlmm.js 2480-2760 (public Step 2 + confirmation + recordPerformance + return + catch + lookupPoolForPosition start)
- [x] Baca dlmm.js 394-464 (signAndSimulateRelayTransactions relay safety)
- [x] Baca dlmm.js 1447-1504 (resolvePerformanceSignalSnapshot + getClosedPnlValue/Pct)
- [x] Baca telegram.js 580-622 (notifyClose solModeOn + estimateGasSol + getSolMarketRegime)
- [x] Grep notifyClose executor.js:803 (recorded_pnl_usd ?? pnl_usd gap fix)
- [x] Tulis §A-§H
- [x] §0 Cara Kerja (Bahasa Awam) — retro-fit 2026-07-07

---

## §0. Cara Kerja (Bahasa Awam)

**Analogi** (dua sudut pandang sehari-hari)
- *Pembongkar tenda + penyetor kembali sewa*: tenda diturunkan → sewa 0.057 SOL dikembalikan ke pemilik → isi tenda (token + SOL) ditukar balik ke SOL → catat ke buku besar (lessons). Kalau pakai jasa relay (perantara), kita simulasikan dulu tiap tx pre-submit supaya tak ada transfer janggal — kalau ada tanda relay nakal (delta lamport ≥ −0.05 SOL, ada token debit tak relevan) → circuit breaker 10 menit. Di bot, ini = `closePosition` 3-path.
- *Akuntan dual entry*: tiap close ada 2 angka — (1) `recorded_pnl_usd = (finalValueUsd + feesUsd) - initialUsd` (formula lessons.json), (2) `pnl_usd` dari API Meteora. Sebelum F9-light fix: notif Telegram pakai #2, /report pakai #1 → gap angka terlihat kontradiktif. Fix: notif pakai #1 (`recorded_pnl_usd ?? pnl_usd`) → angka sama di mana-mana.

**Di bot, ini = `closePosition` + `claimFees` dari `tools/dlmm.js:2172-2760`**: bongkar posisi LP on-chain, klaim fee, dan catat perf. 3 jalur: paper (sim kertas) / relay (perantara Meteora LPAgent) / public SDK (panggil SDK langsung). Rent posisi refundable di close ~0.057 SOL. recordPerformance dipicu di dlmm.js (`recorded_pnl_usd` + `paper:true` tag utk sim).

**Posisi fase ini di alur bot**
F10 = hilir on-chain. Datang SETELAH F7 (safety pass) + F3 (close rule triggered). F4 → `close_position` tool → F7 → F10. Bersamaan: F8 wiring (notifyClose + swapBaseToSolWithRetry + addPoolNote conditional). Lapisan 3 + 6 (Mesin + Koneksi). Tanpa F10, modal LP gantung on-chain → tak bisa withdraw → rugi tak terkunci. Tanpa `recordPerformance` → lessons kosong → no learning loop.

**Langkah kerja F10 — `closePosition(positionAddress, options)` 3-path**
1. Detect mode:
   - **Paper** (`isPaperMode()` + `paper_` prefix, 2176-2178) → `closePaperPosition` (1675) → `recordPerformance` dengan `paper:true` tag. Return. Skip on-chain.
   - **Relay path** (2189-2436, gate `shouldUseLpAgentRelay`): kirim ke LPAgent `/execution/zap-out/order` → `/submit`. Bundle close + swap. Bila error BEFORE submit (`relaySubmitted=false`) → fallback ke public. Bila error AFTER submit → throw (can't recover via public).
   - **Public SDK** (2438-2760): Step 1 `claimSwapFee` bila `recentlyClaimed = last_claim_at < 60s` (skip double-claim) → Step 2 `removeLiquidity({shouldClaimAndClose:true})` (2495) OR `closePosition` (2504) → rent refund implisit (position account closed → 0.057 SOL balik ke owner).
2. Close-confirmation polling: 5s wait + 4-attempt × 3s via `getMyPositions({force:true})` (supaya yakin close sukses di chain sebelum return).
3. recordPerformance (F19) — 2 trigger point (relay 2348 + public 2652) — DI DLMM.JS, BUKAN executor. Resolusi F8 #5.
4. `appendDecision` close (relay 2383 / public 2687 / untracked 2734) → persist decision-log.
5. F9-light gap fix (2403-2409 relay, 2707-2713 public): pakai `recorded_pnl_usd = (finalValueUsd + feesUsd) - initialUsd` (lessons formula), BUKAN `pnlUsd` Meteora API. `notifyClose` (F8) pakai `recorded_pnl_usd ?? pnl_usd` → gap notif vs /report closed. SOL mode: `recorded_pnl_usd=null` → fallback `pnl_usd`.

**Langkah kerja F10 — `claimFees(positionAddress)` (2126-2169)**
1. `tracked.closed` guard → refuse bila already closed ("fees were claimed during close").
2. `lookupPoolForPosition` → `poolCache.delete` (refresh fee state) → `pool.getPosition` → `pool.claimSwapFee` → `sendTxTracked` → `recordClaim`.
3. Return `base_mint` utk executor auto-swap (F8:821) bila `autoSwapAfterClaim` + token USD ≥ 0.10.
4. Tandem dengan `closePosition` Step 1 (2447-2468): `recentlyClaimed` skip double-claim.

**Relay safety `signAndSimulateRelayTransactions` (394-464)** — defense vs malicious relay tx:
- Simulate tiap tx pre-submit.
- Assert owner lamport delta ≥ −0.05 SOL (cegah relay rugiin kita quietly).
- Assert no unrelated token debit (`allowedDebitMints` whitelist).
- Assert required static accounts present (owner/pool/position).
- Circuit breaker (162-200): 2 fail berturut ATAU 401/403 → open 10 menit (skip relay) → fallback public path.

**Output F10**: `{success, recorded_pnl_usd, positionAddress, base_mint?, feesUsd, finalValueUsd, initialUsd, minutes_held, minutes_oor, close_reason, pnl_pct, ...}`. Notify close via F8 ke Telegram → /report lihat angka sama. Lessons perf entry masuk (paper/live terpisah tag).

**Bug kontrak-kunci teratasi (F8 #5 + F9-light gap)**:
- Sebelum: `recordPerformance` sebenarnya dipicu di dlmm.js (BUKAN executor) — F8 salah sebut executor. F10 mimprecisi: 2 trigger point di relay+public, plus paper path lewat `closePaperPosition`.
- Sebelum: `notifyClose` pakai `pnlUsd` (Meteora API) → kontradiksi dengan `/report` lessons formula. Fix F9-light: notif pakai `recorded_pnl_usd ?? pnl_usd` → angka ngaras.

**Kalau F10 rusak / diskip**
Bot bisa deploy (F9) tapi tak bisa close. Modal LP gantung forever on-chain. Atau: relay safety mati → relay bisa kirim tx nakal (kirim SOL kita ke address lain) tanpa kita sadar. Atau: `recordPerformance` tak ke-trigger → lessons.json kosong → `evolveThresholds` tak punya data → no learning loop → bot tak pernah improve. Atau: rent tak refund → 0.057 SOL hilang per posisi → silent modal drain. F10 = jembatan "modal di Solana → modal di wallet + pelajaran".

**Istilah yang muncul di fase ini**
- **`closePosition`** — fungsi on-chain hilir. 3-path: paper / relay / public SDK.
- **`claimFees`** — klaim fee swap on-chain. Tandem dengan close (Step 1) atau standalone. `tracked.closed` guard prevent double.
- **relay path** — kirim ke LPAgent `/execution/zap-out/order+submit`. Bundle close+swap. Fallback ke public bila error pre-submit; throw bila error post-submit (can't recover).
- **public SDK** — langsung panggil SDK Meteora. `removeLiquidity({shouldClaimAndClose:true})` atau `closePosition`. Rent refund implisit.
- **rent refund via close** — 0.057 SOL kembali ke owner tiap close (BEDA dari bin-array rent 0.0714 SOL NON-REFUNDABLE yang di-block F9 pre-deploy). Mitigasi F9 E.1 bug.
- **`recordPerformance`** — dipicu DI dlmm.js (BUKAN executor) → 2 trigger point (relay 2348 + public 2652) + paper path via `closePaperPosition`. F19 detail.
- **`recorded_pnl_usd`** — formula lessons: `(finalValueUsd + feesUsd) - initialUsd`. `notifyClose` pakai ini (F9-light fix) biar sinkron dengan /report.
- **`pnl_usd`** — angka PnL dari Meteora API closed. Bisa beda dengan `recorded_pnl_usd`. Pre-fix dipakai notif → gap.
- **paper `paper:true` tag** — stamp lessons record sim supaya isolasi (F13/F19/F22). Tak kontam live.
- **signAndSimulateRelayTransactions** — pre-submit simulate tx relay; assert owner lamport delta ≥ −0.05, no unrelated debit, required accounts present. Defense vs malicious relay.
- **circuit breaker** — 2 fail berturut ATAU 401/403 → open 10 menit (skip relay) → fallback public. dlmm.js:162-200.
- **close-confirmation polling** — 5s wait + 4-attempt × 3s `getMyPositions({force:true})`. Supaya yakin close sukses di chain.
- **F9-light gap fix** — notif pakai `recorded_pnl_usd ?? pnl_usd` biar sinkron dengan /report. Render-only — recorded pnl unchanged.
- **`recentlyClaimed`** — `last_claim_at < 60s` → skip claim tandem (anti double-claim).

*Lewati §0 kalau sudah paham. Isi teknis mulai §A.*

---

## §A. Peta block fase ini (file:line → peran)

| file:line | simbol | peran |
|---|---|---|
| dlmm.js:2126-2169 | `claimFees` | standalone claim, base_mint return utk auto-swap |
| dlmm.js:2132-2134 | `tracked.closed` guard | refuse claim bila already closed |
| dlmm.js:2140-2143 | lookupPool + poolCache.delete | fresh fee state |
| dlmm.js:2145-2149 | pool.getPosition + claimSwapFee | SDK claim ix |
| dlmm.js:2151-2153 | empty txs guard | "No fees to claim" |
| dlmm.js:2157 | sendTxTracked claim | gas track |
| dlmm.js:2162 | recordClaim | state.js stamp last_claim_at |
| dlmm.js:2164 | return base_mint | utk executor auto-swap |
| dlmm.js:2172-2173 | `closePosition` header + normalizeMint | entry |
| dlmm.js:2174-2180 | DRY_RUN paper branch | isPaperMode + paper_ prefix → closePaperPosition (F32) |
| dlmm.js:2179 | DRY_RUN non-paper fallback | would_close return (factory paper OFF) |
| dlmm.js:2182 | getTrackedPosition | state.js lookup |
| dlmm.js:2187-2188 | lookupPool + getPoolMetadata | pool addr + name |
| dlmm.js:2189 | `shouldUseLpAgentRelay` gate | relay vs public split (circuit breaker aware) |
| dlmm.js:2190-2241 | relay order + sign | `/execution/zap-out/order` + signAndSimulate |
| dlmm.js:2193-2197 | relayAllowedDebitMints | baseMint + quoteMint + SOL only |
| dlmm.js:2198-2202 | livePosition lookup + closeFromToBinId | force getMyPositions + fallback tracked.bin_range |
| dlmm.js:2204-2220 | `/execution/zap-out/order` POST | idempotencyKey close + bps 10000 + slippageBps 5000 + OKX provider |
| dlmm.js:2222-2226 | empty txs guard | "LPAgent close order returned no transactions" |
| dlmm.js:2228-2239 | signAndSimulateRelay close + swap | simulate + owner lamport delta + allowedDebitMints + requiredStaticAccounts |
| dlmm.js:2241 | `relaySubmitted=true` | mark submitted (can't fallback after this) |
| dlmm.js:2242-2253 | `/execution/zap-out/submit` POST | requestId + lastValidBlockHeight + signed txs |
| dlmm.js:2255-2257 | claimTxHashes empty (relay) | zap-out bundles claim, no separate claim txs |
| dlmm.js:2256 | normalizeExecutionSignatures(submit) | extract close sigs |
| dlmm.js:2259-2260 | 5s wait + cache invalidate | post-submit settle |
| dlmm.js:2262-2276 | close-confirmation polling | 4 attempt × 3s, force getMyPositions, stillOpen check |
| dlmm.js:2278-2287 | not confirmed fail return | "Close submit succeeded but position still appears open" |
| dlmm.js:2289 | `recordClose` | state.js stamp close reason + time |
| dlmm.js:2291-2401 | relay tracked block | recordPerformance relay (2348) + appendDecision close (2383) |
| dlmm.js:2292-2297 | deployedAt + minutesHeld + minutesOOR | time math dari tracked.deployed_at + out_of_range_since |
| dlmm.js:2306-2323 | closed PnL API fetch relay | dlmm.datapi.meteora.ag 6 attempt × 5s, posEntry match |
| dlmm.js:2313-2318 | pnlUsd/pnlTrueUsd/pnlPct/finalValue/initial/fees | solMode ? SOL : USD |
| dlmm.js:2328-2333 | closeBaseMint + signalSnapshot | resolvePerformanceSignalSnapshot merge |
| dlmm.js:2335-2346 | exitMarket fetch | pool-discovery-api exit_mcap/tvl/volume, fail-open |
| dlmm.js:2348-2381 | `recordPerformance` relay trigger | F19, passing tracked.* + exitMarket + signalSnapshot |
| dlmm.js:2383-2401 | appendDecision close relay | decision-log MANAGER |
| dlmm.js:2403-2409 | F9-light recorded_pnl_usd | (final+fees)−initial = lessons formula, USD only |
| dlmm.js:2410-2429 | relay success return | enriched + `relay:true` + recorded_pnl_usd + peak_pnl_pct + derived_lesson |
| dlmm.js:2431-2435 | relay catch fallback | `relaySubmitted` ? throw : relayCallFailed + fall-through ke public |
| dlmm.js:2438-2440 | public path: poolCache.delete + getPool | fresh SDK |
| dlmm.js:2443-2444 | claimTxHashes + closeTxHashes init | 2-step track |
| dlmm.js:2446-2468 | Step 1 claim | recentlyClaimed <60s skip OR pool.claimSwapFee |
| dlmm.js:2447 | `recentlyClaimed` check | avoid double-claim bila claimFees baru jalan |
| dlmm.js:2453-2457 | pool.getPosition + claimSwapFee | SDK claim ix (same as claimFees) |
| dlmm.js:2459-2462 | sendTxTracked claim | claimTxHashes push |
| dlmm.js:2466-2468 | claim fail-open | "Step 1 (Claim) failed or nothing to claim" log, lanjut Step 2 |
| dlmm.js:2471-2485 | Step 2 prep: hasLiquidity check | positionData.positionBinData, lowerBinId/upperBinId |
| dlmm.js:2487-2501 | Step 2a: removeLiquidity | `shouldClaimAndClose:true` + bps 10000, multi-tx |
| dlmm.js:2502-2510 | Step 2b: closePosition (no liquidity) | `pool.closePosition` single tx, rent refund |
| dlmm.js:2511-2513 | txHashes merge + log | claim + close |
| dlmm.js:2514-2517 | 5s wait + cache invalidate | post-close settle (prevent zero balance on swap) |
| dlmm.js:2519-2533 | close-confirmation polling public | 4 attempt × 3s, force getMyPositions |
| dlmm.js:2535-2545 | not confirmed fail return | "Close transactions sent but position still appears open" |
| dlmm.js:2547 | `recordClose` | state.js stamp |
| dlmm.js:2550-2732 | public tracked block | recordPerformance public (2652) + appendDecision (2687) |
| dlmm.js:2559-2566 | `shouldRejectClosedPnl` | reject ≤-90% unless stop-loss reason (anti unsettled outlier) |
| dlmm.js:2576-2607 | closed PnL API fetch public | 6 attempt × 5s, shouldRejectClosedPnl gate |
| dlmm.js:2612-2630 | cached pnl fallback | bila finalValueUsd=0 → _positionsCache pre-close snapshot, USD-consistent math |
| dlmm.js:2632-2637 | closeBaseMint + signalSnapshot | resolvePerformanceSignalSnapshot |
| dlmm.js:2639-2650 | exitMarket fetch public | same as relay |
| dlmm.js:2652-2685 | `recordPerformance` public trigger | F19, same shape as relay |
| dlmm.js:2687-2705 | appendDecision close public | decision-log MANAGER |
| dlmm.js:2707-2713 | F9-light recorded_pnl_usd public | same as relay |
| dlmm.js:2714-2731 | public success return | enriched + recorded_pnl_usd + peak_pnl_pct + derived_lesson |
| dlmm.js:2734-2743 | appendDecision close untracked | bila tracked=null (position untracked, F9 #17 risk) |
| dlmm.js:2745-2755 | public success return untracked | minimal fields (no pnl, no recorded_pnl) |
| dlmm.js:2756-2759 | catch fail return | `{success:false, error}` |
| dlmm.js:2763-2786 | `lookupPoolForPosition` | tracked.pool fast → cache → RPC fallback |
| dlmm.js:394-464 | `signAndSimulateRelayTransactions` | relay tx safety: simulate + lamport delta + token debit + static accounts |
| dlmm.js:404 | maxLamportLoss | `maxSolLoss * 1e9` (0.05 SOL default) |
| dlmm.js:411 | `assertNoUnsafeSystemTransfer` | defense vs system program transfer to non-allowed dest |
| dlmm.js:413-417 | requiredStaticAccounts assert | wallet + position must be in tx |
| dlmm.js:420-427 | simulateTransaction | `sigVerify:false` (signed later), `replaceRecentBlockhash:false` |
| dlmm.js:429-436 | owner lamport delta check | `postBalances - preBalances < -maxLamportLoss` → throw |
| dlmm.js:438-458 | token debit check | allowedMints only, preByMint vs postTokenBalances |
| dlmm.js:466-481 | `normalizeExecutionSignatures` | extract sigs from submit result, dedup |
| dlmm.js:1447-1464 | `resolvePerformanceSignalSnapshot` | merge darwin staged + tracked.signal_snapshot + PERFORMANCE_SIGNAL_FIELDS fallback |
| dlmm.js:1466-1470 | `getClosedPnlValue` | solMode ? pnlSol/valueNative : pnlUsd/value |
| dlmm.js:1472-1504 | `getClosedPnlPct` + helpers | mode-correct pct + deposits/withdrawals/fees/balances |
| dlmm.js:162-200 | relay circuit breaker | `_relayCircuitOpen` + 2-fail threshold + 10m cooldown + 401/403 instant-open |
| dlmm.js:168 | `shouldUseLpAgentRelay` | close/claim relay gate (vs `shouldUseLpAgentRelayForDeploy` F9 DEAD) |
| telegram.js:582-585 | `solModeOn` | read user-config management.solMode, fail-open false |
| telegram.js:594-608 | `notifyClose` | estimateGasSol + getSolMarketRegime SOL price + renderClose |
| telegram.js:601 | `estimateGasSol` | close+claim+swap gas est (F25) |
| executor.js:803 | `notifyClose` call | `recorded_pnl_usd ?? pnl_usd ?? 0` gap fix (F9-light) |

## §B. Alur close hulu→hilir (ASCII)

```
MANAGER tool call close_position({position_address, reason})
  │
  ├─ executor.js executeTool → toolMap.close_position → closePosition(dlmm.js:2172)
  │
  ├─ phase 0: DRY_RUN branch
  │   ├─ isPaperMode + paper_ prefix → closePaperPosition (F32) → recordPerformance paper:true
  │   └─ else (DRY_RUN non-paper) → would_close return (factory paper OFF)
  │
  ├─ phase 1: lookup
  │   ├─ getTrackedPosition (state.js F17)
  │   ├─ lookupPoolForPosition (tracked.pool fast → cache → RPC)
  │   └─ getPoolMetadata (pool name)
  │
  ├─ phase 2 path split: shouldUseLpAgentRelay (circuit breaker aware)
  │
  ├─ [RELAY path 2189-2436]
  │   ├─ relayAllowedDebitMints = [baseMint, quoteMint, SOL]
  │   ├─ livePosition lookup (force getMyPositions) + closeFromToBinId fallback
  │   ├─ /execution/zap-out/order POST (idempotencyKey, bps 10000, slippageBps 5000, OKX)
  │   ├─ signAndSimulateRelayTransactions close + swap (simulate + lamport delta + token debit + static accounts)
  │   ├─ relaySubmitted = true (can't fallback after)
  │   ├─ /execution/zap-out/submit POST (requestId + signed txs)
  │   ├─ 5s wait + _positionsCacheAt=0
  │   ├─ close-confirmation polling (4× × 3s, force getMyPositions, stillOpen check)
  │   ├─ !closedConfirmed → fail return "still appears open"
  │   ├─ recordClose (state.js)
  │   ├─ [tracked] deployedAt/minutesHeld/minutesOOR math
  │   ├─ closed PnL API fetch (6× × 5s, posEntry match)
  │   ├─ closeBaseMint + resolvePerformanceSignalSnapshot
  │   ├─ exitMarket fetch (pool-discovery-api, fail-open)
  │   ├─ recordPerformance (2348) ← F19 trigger
  │   ├─ appendDecision close (2383)
  │   ├─ F9-light recorded_pnl_usd = (final+fees)−initial
  │   └─ return enriched (relay:true + recorded_pnl_usd + peak_pnl_pct + derived_lesson)
  │   CATCH relay:
  │   ├─ relaySubmitted ? throw (can't recover, tx submitted)
  │   └─ else relayCallFailed + log + fall-through ke public path
  │
  ├─ [PUBLIC path 2438-2760]
  │   ├─ poolCache.delete + getPool (fresh SDK)
  │   ├─ Step 1 claim (recentlyClaimed <60s skip OR pool.claimSwapFee)
  │   │   └─ claim fail-open (log, lanjut Step 2)
  │   ├─ Step 2 hasLiquidity check (positionData.positionBinData)
  │   ├─ Step 2a: removeLiquidity (shouldClaimAndClose:true, bps 10000, multi-tx) ← rent refund
  │   ├─ Step 2b: closePosition (no liquidity, single tx) ← rent refund
  │   ├─ 5s wait + _positionsCacheAt=0
  │   ├─ close-confirmation polling (4× × 3s)
  │   ├─ !closedConfirmed → fail return
  │   ├─ recordClose
  │   ├─ [tracked] time math + shouldRejectClosedPnl (≤-90% unless stop-loss)
  │   ├─ closed PnL API fetch (6× × 5s, shouldReject gate)
  │   ├─ cached pnl fallback (finalValueUsd=0 → _positionsCache pre-close, USD-consistent)
  │   ├─ closeBaseMint + signalSnapshot + exitMarket
  │   ├─ recordPerformance (2652) ← F19 trigger
  │   ├─ appendDecision close (2687)
  │   ├─ F9-light recorded_pnl_usd
  │   └─ return enriched (recorded_pnl_usd + peak_pnl_pct + derived_lesson)
  │   [untracked] appendDecision (2734) + minimal return (2745)
  │   CATCH: return {success:false, error}
  │
  └─ return → executor post-success (F8:799-820)
      ├─ notifyClose (recorded_pnl_usd ?? pnl_usd, gap fix F9-light)
      ├─ addPoolNote low-yield bila reason includes "yield"
      └─ swapBaseToSolWithRetry (bila !skip_swap + base_mint)
```

## §C. Sinkron: siapa-panggil-siapa

| Pemanggil (file:line) | Dipanggil (file:line) | Trigger | Data lewat | Fail-mode |
|---|---|---|---|---|
| executor.js executeTool `close_position` | dlmm.js:2172 `closePosition` | MANAGER tool call | {position_address, reason} | catch return {success:false,error} |
| dlmm.js:2177 | paper-trading.js `closePaperPosition` (F32) | DRY_RUN + paper_ prefix | position_address, reason | recordPerformance paper:true |
| dlmm.js:2182 | state.js `getTrackedPosition` | close start | position_address | null bila untracked |
| dlmm.js:2187 | dlmm.js:2763 `lookupPoolForPosition` | close start | position_address, wallet | tracked.pool → cache → RPC |
| dlmm.js:2188 | dlmm.js:604 `getPoolMetadata` | close start | poolAddress | pool name |
| dlmm.js:2189 | dlmm.js:168 `shouldUseLpAgentRelay` | path split | — | circuit breaker gate |
| dlmm.js:2198 | dlmm.js:1768 `getMyPositions` | relay livePosition lookup | {force:true,silent:true} | `.positions.find` fallback tracked |
| dlmm.js:2204 | dlmm.js:206 `meridianJson` | relay order | `/execution/zap-out/order` POST | retry 30s/10 attempts |
| dlmm.js:2228 | dlmm.js:394 `signAndSimulateRelayTransactions` | relay sign | serialized txs, wallet, {label,allowedDebitMints,maxSolLoss,requiredStaticAccounts} | throw → relay catch |
| dlmm.js:411 | (internal) `assertNoUnsafeSystemTransfer` | relay simulate | tx, wallet, allowed dests | throw bila system transfer to non-allowed |
| dlmm.js:420 | RPC `simulateTransaction` | relay simulate | tx, {sigVerify:false} | throw bila value.err |
| dlmm.js:2242 | dlmm.js:206 `meridianJson` | relay submit | `/execution/zap-out/submit` POST | throw → relay catch (relaySubmitted=true → throw) |
| dlmm.js:2256 | dlmm.js:466 `normalizeExecutionSignatures` | relay submit parse | submit result | extract sigs, dedup |
| dlmm.js:2265/2522 | dlmm.js:1768 `getMyPositions` | close-confirmation | {force:true,silent:true} | `.catch` in relay, try-catch in public |
| dlmm.js:2289/2547 | state.js `recordClose` | post-confirm | position_address, reason | stamp close time + reason |
| dlmm.js:2306/2576 | HTTP fetch dlmm.datapi.meteora.ag | PnL fetch | closedUrl | 6× retry × 5s, fail-open |
| dlmm.js:2329/2633 | dlmm.js:1447 `resolvePerformanceSignalSnapshot` | pre-record | {poolAddress,baseMint,tracked} | merge darwin + tracked + fallback |
| dlmm.js:2337/2641 | HTTP fetch pool-discovery-api | exitMarket | poolAddress, timeframe | fail-open catch |
| dlmm.js:2348/2652 | lessons.js `recordPerformance` (F19) | post-close | tracked.* + exitMarket + signalSnapshot + fees/final/initial + minutes + close_reason | derivedLesson return |
| dlmm.js:2383/2687/2734 | decision-log.js `appendDecision` | post-close | type/actor/pool/summary/reason/risks/metrics | persist decision-log.json |
| dlmm.js:2489 | SDK `pool.removeLiquidity` | Step 2a | {user,position,fromBinId,toBinId,bps,shouldClaimAndClose} | multi-tx, rent refund |
| dlmm.js:2504 | SDK `pool.closePosition` | Step 2b | {owner,position} | single tx, rent refund |
| dlmm.js:2460/2499/2508 | dlmm.js:133 `sendTxTracked` | claim/close tx | tx, [wallet], "close"/"claim" | gas track background |
| dlmm.js:2157/2460 | dlmm.js:133 `sendTxTracked` | claim tx | tx, [wallet], "claim"/"close" | gas track |
| dlmm.js:2162 | state.js `recordClaim` | claimFees success | position_address | stamp last_claim_at |
| executor.js:803 | telegram.js:594 `notifyClose` | post-success | {pair, pnlUsd: recorded_pnl_usd ?? pnl_usd, pnlPct, peakPnlPct, reason, lesson, feesUsd} | `.catch(()=>{})` fail-open |
| telegram.js:601 | (F25) `estimateGasSol` | notifyClose render | {close_position:1, claim_fees:1, swap_token:1} | gas est SOL |
| telegram.js:604 | wallet.js `getSolMarketRegime` | notifyClose SOL price | — | fail-open null → 1-unit render |

## §D. Logika kunci per fungsi

### `closePosition` (dlmm.js:2172-2760)
- Apa: tutup LP position — claim fees + remove liquidity + close account + swap base→SOL (executor post).
- Kapan dipicu: MANAGER tool call via executor after F7 safety (close_position not in WRITE_TOOLS? verify — actually close_position IS in WRITE_TOOLS F8:740).
- Output: `{success, position, pool, pool_name, claim_txs, close_txs, txs, pnl_usd, pnl_pct, recorded_pnl_usd, recorded_pnl_pct, fees_earned_usd, base_mint, close_reason, peak_pnl_pct, derived_lesson, relay?}` or fail `{success:false, error}` or DRY_RUN `{dry_run:true, would_close}` or paper (via closePaperPosition).
- Sinkron: state.js recordClose + getTrackedPosition, lessons.js recordPerformance, decision-log appendDecision, executor notifyClose + swapBaseToSolWithRetry, gas-tracker via sendTxTracked.
- Fail-mode: DRY_RUN paper/would_close; relay error pre-submit → fallback public; relay error post-submit → throw; close-confirmation fail → return success:false "still appears open" (txs sent but unverified); claim fail-open (Step 2 proceeds); PnL fetch fail-open (cached fallback or 0).
- Bukti: 2172-2760.

### `claimFees` (dlmm.js:2126-2169)
- Apa: standalone claim swap fees (tanpa close).
- Kapan dipicu: MANAGER tool call `claim_fees` via executor (F8:821 auto-swap gated `autoSwapAfterClaim` + USD≥0.10).
- Output: `{success, position, txs, base_mint}` or `{success:false, error}`.
- Sinkron: state.js recordClose guard (tracked.closed refuse), getTrackedPosition, lookupPoolForPosition, poolCache.delete, SDK pool.getPosition + claimSwapFee, sendTxTracked, recordClaim.
- Fail-mode: tracked.closed → refuse "fees were claimed during close"; empty txs → "No fees to claim"; SDK error → catch return fail.
- Bukti: 2126-2169.
- Tandem: closePosition Step 1 (2447-2468) `recentlyClaimed <60s` skip bila claimFees baru jalan — avoid double-claim.

### `signAndSimulateRelayTransactions` (dlmm.js:394-464)
- Apa: safety wrapper utk relay tx — simulate pre-submit, assert owner lamport delta + no unrelated token debit + required static accounts.
- Kapan dipicu: relay close path (2228 close, 2234 swap) AND relay deploy path (DEAD F9).
- Output: array signed tx base64; throw bila any check fail.
- Sinkron: `signSerializedTransaction` + `deserializeSignedTransaction` + `assertNoUnsafeSystemTransfer` + `getStaticAccountKeyStrings` + RPC `simulateTransaction`.
- Fail-mode: simulation err → throw; owner lamport delta < −maxLamportLoss → throw; unrelated token debit → throw; missing requiredStaticAccounts → throw.
- Bukti: 394-464.
- **Solid defense** vs malicious relay tx (relay could craft tx debiting random token). maxSolLoss 0.05 SOL default. allowedDebitMints = [baseMint, quoteMint, SOL].

### `resolvePerformanceSignalSnapshot` (dlmm.js:1447-1464)
- Apa: merge signal snapshot utk recordPerformance — darwin staged + tracked.signal_snapshot + PERFORMANCE_SIGNAL_FIELDS fallback.
- Kapan dipicu: closePosition pre-record (2329 relay, 2633 public).
- Output: snapshot object or null bila all empty.
- Sinkron: signal-tracker.js `getAndClearStagedSignals` (darwin ON); tracked.signal_snapshot (deploy-time stash F9); PERFORMANCE_SIGNAL_FIELDS const.
- Fail-mode: darwin OFF → staged=null; tracked no signal_snapshot → fallback PERFORMANCE_SIGNAL_FIELDS from tracked.*; all empty → null.
- Bukti: 1447-1464.

### `getClosedPnlValue` / `getClosedPnlPct` (dlmm.js:1466-1504)
- Apa: parse Meteora closed PnL API response, mode-correct (SOL vs USD).
- Output: number pnl value/pct.
- Sinkron: posEntry.pnlSol/pnlUsd/pnl.valueNative/pnl.value; solMode config.management.solMode.
- Fail-mode: maybeNum fallback 0.
- Bukti: 1466-1504.

### `shouldRejectClosedPnl` (dlmm.js:2559-2566, public only)
- Apa: reject closed PnL ≤ -90% unless stop-loss reason — anti unsettled outlier.
- Kapan dipicu: public path closed PnL fetch (2590).
- Output: boolean reject.
- Fail-mode: non-finite pct → false (accept); stop-loss reason → false (accept, trust legitimate disaster); else pct ≤ -90 → true (reject, retry next attempt).
- Bukti: 2559-2566.
- **Solid**: Meteora sometimes briefly reports absurd closed pnl while record settling. Trust stop-loss disasters, reject obvious outliers.
- Gap: relay path (2306-2323) lacks shouldRejectClosedPnl — relay trusts API pnl verbatim. Inconsistency moot (relay rarely used, circuit breaker gates). Open-Q #4.

### relay circuit breaker (dlmm.js:162-200)
- Apa: trip relay after 2 consecutive fail OR 401/403 auth error, open 10m.
- Kapan dipicu: `shouldUseLpAgentRelay` (168) gate close/claim path split.
- Output: boolean (true = use relay, false = skip to public).
- Sinkron: `_relayCircuitOpen` + `_relayCircuitOpenAt` + `_relayConsecutiveFailures` + `RELAY_CIRCUIT_COOLDOWN_MS=10m` + `RELAY_CIRCUIT_FAIL_THRESHOLD=2`.
- Fail-mode: 401/403 instant-open (auth unrecoverable); 2+ fails → open; 10m elapsed → auto-reset.
- Bukti: 162-200.

### close-confirmation polling (dlmm.js:2262-2287 relay, 2519-2545 public)
- Apa: post-submit/wait verify position actually closed via getMyPositions refresh.
- Output: closedConfirmed boolean; fail return bila !confirmed.
- Sinkron: getMyPositions({force:true,silent:true}); `refreshed.positions.some(p => p.position === position_address)` stillOpen check.
- Fail-mode: 4 attempt × 3s + 5s initial wait = 17s window; stillOpen → return success:false "still appears open" (txs sent but unverified).
- Bukti: 2262-2287, 2519-2545.
- **Risk**: position closed on-chain tapi bot anggap fail → MANAGER bisa retry close → double-claim? Mitigasi: getMyPositions force refresh cek stillOpen (position gone = closed). TAPI bila RPC lag, stillOpen=true padahal actually closed → retry close → SDK error "position not found" → catch fail. Solid enugh.

### cached pnl fallback (dlmm.js:2612-2630, public only)
- Apa: bila closed API belum settle (finalValueUsd=0) → pakai _positionsCache pre-close snapshot.
- Output: pnlUsd/pnlTrueUsd/pnlPct/feesUsd/initialUsd/finalValueUsd dari cache, USD-consistent math.
- Fail-mode: cache miss (cachedPos null) → stay 0; initialUsd>0 → finalValueUsd = max(0, initial + pnlTrue − fees); else finalValueUsd = cached.total_value.
- Bukti: 2612-2630.
- **Solid**: prevents 0-pnl record bila API settle lag. Public path only (relay trusts API). Open-Q #5.

## §E. Temuan: bug / gap / kontrak-kunci / fail-open tak-terpenuhi

### E.1 — recordPerformance dipicu di dlmm.js, BUKAN executor (F8 #5 RESOLVED)
- 2 trigger point: relay (2348) + public (2652). Paper via closePaperPosition (1693, F32).
- Executor (F8:799-820) hanya post-wiring: notifyClose + addPoolNote + swapBaseToSolWithRetry.
- **Kontrak**: PnL recorded via dlmm.js post-close → lessons.json + briefings stats; `paper:true` tag utk paper isolation (F19/F22).
- Bukti: 2348, 2652, 1693 paper, F8:799-820 wiring only.
- F8 #5 CONFIRMED.

### E.2 — F9-light gap fix notif==report (plan F10 "gap trigger-vs-realisasi")
- Pre-F9-light: notifyClose pakai `pnlUsd` (Meteora API value) → bisa beda dengan `recordPerformance` formula `(final+fees)−initial` (lessons.js:173) → gap notif vs /report.
- Post-F9-light: `recorded_pnl_usd = (finalValueUsd + feesUsd) - initialUsd` (2408 relay, 2712 public) = lessons formula.
- notifyClose (executor.js:803): `pnlUsd: result.recorded_pnl_usd ?? result.pnl_usd ?? 0` → notif headline == /report.
- SOL mode: `recorded_pnl_usd = null` (config.management.solMode) → fallback `pnl_usd` (SOL headline via getClosedPnlValue solMode). Render-only — canonical recorded pnl_usd di recordPerformance unchanged.
- **Gap closed.** Render-only (no mutation of recordPerformance canonical).
- Bukti: 2403-2409, 2707-2713, executor.js:803, lessons.js:173 (F19).
- Comment: "F9-besar deferred" — full canonical pnl_usd mutation utk notif==report dicatat deferred.

### E.3 — Rent refund via close ix (F9 E.1 bug mitigation CONFIRMED)
- Public path: `pool.removeLiquidity({shouldClaimAndClose:true})` (2495) OR `pool.closePosition` (2504) → position account closed → rent ~0.057 SOL refund ke owner.
- Relay path: zap-out bundles close+swap, rent refund implisit (relay tx closes position account).
- **Rent recovered on close regardless of close path/reason** — distinct dari BIN_ARRAY_FEE non-refundable (blocked pre-deploy F9:906).
- Bukti: 2495, 2504, F9 E.1.
- F9 E.1 bug mitigation confirmed: even if rentPerPositionSol=0 (factory, no reserve), rent refund on close recovers the 0.057 SOL. Risk only mid-deploy gas squeeze (F9 E.1), not lost rent.

### E.4 — Relay safety signAndSimulate solid
- `signAndSimulateRelayTransactions` (394-464): simulate tiap tx pre-submit, assert owner lamport delta ≥ −0.05 SOL, assert no unrelated token debit (allowedDebitMints), assert requiredStaticAccounts present, assertNoUnsafeSystemTransfer.
- **Defense vs malicious relay tx**: relay could craft tx debiting random token or transferring SOL to attacker. Simulation catches pre-submit.
- maxSolLoss 0.05 SOL default — allows gas + small slippage, blocks large debit.
- Bukti: 394-464, 2228-2239 close+swap, 2193-2197 allowedDebitMints.

### E.5 — Relay fallback to public solid
- Relay catch (2431-2435): `relaySubmitted ? throw relayError : (relayCallFailed + log + fall-through ke public)`.
- `relaySubmitted=true` set di 2241 setelah sign+simulate sukses, sebelum submit. Bila submit (2242) throw → `relaySubmitted=true` → throw (can't fallback, tx might be in-flight).
- Bila order/sign/simulate throw BEFORE submit → `relaySubmitted=false` → fallback public.
- **Solid**: prevents double-close (relay tx in-flight + public tx). Circuit breaker trip via relayCallFailed.
- Bukti: 2241, 2431-2435.

### E.6 — close-confirmation polling solid but RPC-lag risk
- 4 attempt × 3s + 5s initial wait = 17s window. stillOpen check via getMyPositions force.
- **Risk**: RPC lag → stillOpen=true padahal actually closed → return success:false "still appears open" → MANAGER bisa retry close → SDK error "position not found" → catch fail.
- **Mitigasi**: getMyPositions force refresh cek stillOpen (position gone = closed). recordClose (2289/2547) hanya dipanggil bila closedConfirmed — bila !confirmed, recordClose skip → state.json masih open → next management cycle retry.
- **Gap**: bila RPC persistently lag, position closed on-chain tapi state.json open → management loop infinite retry close. Open-Q #6.
- Bukti: 2262-2287, 2519-2545, 2289/2547.

### E.7 — shouldRejectClosedPnl public-only (relay inconsistency)
- Public path (2590): shouldRejectClosedPnl gate reject ≤-90% unless stop-loss.
- Relay path (2306-2323): no shouldReject gate — trusts API pnl verbatim.
- **Risk**: relay path record unsettled outlier pnl → lesson drift. Moot krn relay rarely used (circuit breaker gates, deploy relay DEAD).
- Bukti: 2559-2566 public, 2306-2323 relay no gate.

### E.8 — cached pnl fallback public-only (relay inconsistency)
- Public path (2612-2630): bila finalValueUsd=0 → _positionsCache pre-close snapshot fallback.
- Relay path: no cached fallback — bila API settle lag, pnlUsd=0 → recordPerformance 0-pnl.
- **Risk**: relay close with API lag → 0-pnl record → lesson drift. Moot (relay rare).
- Bukti: 2612-2630 public, relay no fallback.

### E.9 — claimFees + closePosition Step 1 tandem solid
- claimFees (2126-2169): standalone claim, `tracked.closed` refuse.
- closePosition Step 1 (2447-2468): `recentlyClaimed = last_claim_at < 60s` → skip claim.
- **Avoid double-claim**: bila MANAGER call claimFees then close within 60s, Step 1 skip (claimTxHashes empty, lanjut Step 2).
- recordClaim (2162) stamp last_claim_at → recentlyClaimed check baca.
- **Solid tandem**. Bukti: 2126-2169, 2447-2468, 2162.

### E.10 — claim fail-open Step 2 proceeds solid
- Step 1 claim catch (2466-2468): `log("close_warn", "Step 1 (Claim) failed or nothing to claim")`, lanjut Step 2.
- **Solid**: claim fail (e.g. no fees, RPC err) tidak block close. removeLiquidity `shouldClaimAndClose:true` (2495) tetap claim + close in single ix — fees recovered.
- Bukti: 2466-2468, 2495.

### E.11 — untracked close path minimal
- Bila `tracked=null` (position untracked, F9 #17 risk), closePosition public path skip recordPerformance (2550 `if (tracked)` guard).
- appendDecision (2734-2743) minimal fields (no pnl, no recorded_pnl).
- Return (2745-2755) minimal — no pnl_usd/recorded_pnl_usd/base_mint close_reason only.
- **Risk**: untracked close → no lesson learned, no pnl recorded. F9 #17 risk realized.
- **Mitigasi**: F9 #17 on-chain backfill adopt untracked position. Once backfill tracks, next close goes through tracked path.
- Bukti: 2550 guard, 2734-2755.

### E.12 — relay claimTxHashes empty (zap-out bundles)
- Relay path (2255): `const claimTxHashes = []` — relay zap-out bundles claim in close+swap, no separate claim txs.
- Public path: claimTxHashes from Step 1 (2459-2462).
- Return `txs = [...claimTxHashes, ...closeTxHashes]` (2257 relay, 2511 public) — relay txs = closeTxHashes only.
- **Inconsistency moot**: relay bundles claim, public separates. Both record fees via recordPerformance (feesUsd from API).
- Bukti: 2255, 2459-2462, 2257/2511.

### E.13 — slippage relay 5000bps (50%) high
- Relay zap-out slippageBps 5000 (2213) = 50%. Public removeLiquidity bps 10000 (100%) = max.
- **Risk**: relay 50% slippage bisa significant value loss. Public 100% (max, no slippage protection on removeLiquidity — but removeLiquidity is exact-bin, slippage moot).
- Deploy relay slippage 500bps (5%, F9 E.12). Close relay 5000bps (50%) — 10x more tolerant. Close more tolerant (remove + swap, higher OK).
- Moot krn relay rare. Open-Q #7.
- Bukti: 2213, 2494, F9:972.

### E.14 — DRY_RUN paper close isolation solid
- `isPaperMode() && String(position_address).startsWith("paper_")` (2176) → closePaperPosition (F32).
- closePaperPosition (1675) → recordPerformance (1693) `paper:true` tag.
- Non-paper DRY_RUN (2179): would_close return (factory paper OFF, F13).
- **Solid isolation**: paper close → paper record → live consumers mode-scoped (F22 getModePerformance).
- Bukti: 2176-2178, 1675, 1693, F13/F32.

### E.15 — exitMarket fetch fail-open solid
- exitMarket (2337-2346 relay, 2640-2650 public): pool-discovery-api exit_mcap/tvl/volume utk counterfactual + learning.
- `.catch(() => null)` fail-open → exitMarket={} → recordPerformance exit_mcap/tvl/volume null.
- **Solid**: non-blocking, learning gets null exit data (counterfactual skips).
- Bukti: 2337-2346, 2640-2650.

### E.16 — F9-light recorded_pnl_pct render-only
- `recorded_pnl_pct = initialUsd > 0 ? (recordedPnlUsd / initialUsd) * 100 : 0` (2409/2713).
- notifyClose (executor.js:803): `pnlPct: result.recorded_pnl_pct ?? result.pnl_pct ?? 0`.
- Same render-only contract as recorded_pnl_usd. SOL mode null → fallback pnl_pct.
- Bukti: 2409, 2713, executor.js:803.

### E.17 — appendDecision 3-point (relay/public/untracked)
- Relay (2383-2401): full metrics (pnl_usd, pnl_pct, fees_usd, minutes_held) + risks (OOR, volatility).
- Public (2687-2705): same full metrics.
- Untracked (2734-2743): minimal (no metrics).
- **Solid audit trail**: every close logged regardless of path/tracked.
- Bukti: 2383, 2687, 2734.

### E.18 — lookupPoolForPosition 3-tier fallback solid
- Tracked.pool fast (2765-2766) → _positionsCache (2768-2769) → RPC (on-chain position → pool).
- **Solid**: pool lookup resilient bila tracked missing (untracked position) or cache stale.
- Bukti: 2763-2786.

## §F. Glosarium fase

- **closePosition**: dlmm.js:2172-2760, 3-path close (paper/relay/public).
- **claimFees**: dlmm.js:2126-2169, standalone claim swap fees.
- **closePaperPosition**: paper-trading.js:1675, paper close → recordPerformance paper:true (F32).
- **shouldUseLpAgentRelay**: dlmm.js:168, close/claim relay gate (circuit breaker aware). vs `shouldUseLpAgentRelayForDeploy` F9 DEAD.
- **signAndSimulateRelayTransactions**: dlmm.js:394-464, relay tx safety wrapper (simulate + lamport delta + token debit + static accounts).
- **maxSolLoss**: 0.05 SOL default, relay owner lamport delta floor.
- **allowedDebitMints**: relay tx hanya boleh debit [baseMint, quoteMint, SOL].
- **requiredStaticAccounts**: wallet + position must be in relay tx.
- **assertNoUnsafeSystemTransfer**: defense vs system program transfer to non-allowed dest.
- **relay circuit breaker**: 2-fail OR 401/403 → open 10m, auto-reset.
- **close-confirmation polling**: 4 attempt × 3s + 5s initial = 17s window, getMyPositions force stillOpen check.
- **closedConfirmed**: boolean, position gone from getMyPositions = closed.
- **recordClose**: state.js stamp close time + reason.
- **recordClaim**: state.js stamp last_claim_at.
- **recentlyClaimed**: `last_claim_at < 60s` → closePosition Step 1 skip claim.
- **shouldRejectClosedPnl**: reject closed PnL ≤-90% unless stop-loss (public only, anti unsettled outlier).
- **cached pnl fallback**: bila closed API finalValueUsd=0 → _positionsCache pre-close snapshot (public only).
- **resolvePerformanceSignalSnapshot**: merge darwin staged + tracked.signal_snapshot + PERFORMANCE_SIGNAL_FIELDS fallback.
- **getClosedPnlValue/Pct**: parse Meteora closed PnL API, mode-correct (SOL vs USD).
- **F9-light recorded_pnl_usd**: `(final+fees)−initial` = lessons formula, render-only, USD mode only (null in solMode).
- **recorded_pnl_pct**: render-only pct, same contract.
- **exitMarket**: pool-discovery-api exit_mcap/tvl/volume utk counterfactual + learning, fail-open.
- **lookupPoolForPosition**: 3-tier pool lookup (tracked → cache → RPC).
- **relaySubmitted**: flag set after sign+simulate, before submit. true → throw on submit error (can't fallback).
- **normalizeExecutionSignatures**: extract sigs from relay submit result, dedup.
- **estimateGasSol**: F25 gas est utk close+claim+swap, notifyClose render.
- **solModeOn**: telegram.js read user-config management.solMode, fail-open false.

## §G. Cross-ref fase lain

- **F8**: post-success notifyClose (executor.js:803 `recorded_pnl_usd ?? pnl_usd` gap fix) + addPoolNote low-yield + swapBaseToSolWithRetry; `close_position` in WRITE_TOOLS (F8:740).
- **F9**: deployPosition + rent reserve + rent refund via close ix (E.3 mitigation confirmed); deploy relay DEAD vs close relay alive.
- **F11**: getMyPositions post-close refresh (2265/2522 force) + close-confirmation polling; `_positionsCacheAt=0` invalidate (2260/2517); cached pnl fallback reads _positionsCache (2613).
- **F13/F32**: closePaperPosition paper isolation — recordPerformance paper:true tag; live consumers mode-scoped (F22).
- **F17**: getTrackedPosition (2182) + recordClose (2289/2547) + recordClaim (2162) + tracked.* fields passing ke recordPerformance.
- **F19**: recordPerformance (2348 relay, 2652 public, 1693 paper) — lessons.js trigger; derivedLesson return; `paper:true` tag isolation; formula `(final+fees)−initial` (lessons.js:173) = F9-light recorded_pnl_usd.
- **F21**: darwin staged signals — resolvePerformanceSignalSnapshot (2329/2633) getAndClearStagedSignals bila darwin.enabled.
- **F23**: recordClose + recordClaim (state.js) + appendDecision close (2383/2687/2734) decision-log.json.
- **F24**: classifyCloseRule mapping close_reason → canonical rule; reports.js stats baca recordPerformance.
- **F25**: estimateGasSol (telegram.js:601) utk notifyClose; sendTxTracked gas track close/claim (2157/2460/2499/2508).
- **F30**: notifyClose telegram transport (telegram.js:594) + renderClose (views/notifs.js) + solModeOn + getSolMarketRegime SOL price.
- **F31**: solMode config.management.solMode full-sync 6-surface (telegram.js solModeOn read user-config).
- **F18**: mekanis exit poll — close trigger dari SL/trailing/OOR/low-yield/indicator. closePosition menerima reason dari F18 rule. Rent refund regardless of reason (E.3).
- **F22**: getModePerformance mode-scoped — paper close records excluded from live stats (paper:true tag).

## §H. Open-Q (bawa ke fase lain)

1. **[F19]** recordPerformance formula `(final+fees)−initial` (lessons.js:173) = F9-light recorded_pnl_usd. Verify F19 exact line + field shape. CONFIRMED via comment 2403-2407.
2. **[F11]** close-confirmation polling RPC-lag risk: position closed on-chain tapi state.json open (closedConfirmed=false → recordClose skip). Next management cycle retry close → SDK "position not found" → catch fail. Infinite retry? Verify F11/F18 management loop handles "position not found" gracefully. Cross-F11/F18.
3. **[F18]** closePosition reason dari F18 rule (SL/trailing/OOR/low-yield/indicator). Reason string free-text. classifyCloseRule (F24) canonical mapping. Verify F24 mapping covers all F18 rule strings. Cross-F24.
4. **[F10 relay inconsistency]** shouldRejectClosedPnl public-only (E.7). Relay trusts API pnl verbatim. Moot (relay rare) tapi bila re-enabled, relay lesson drift risk. Cross-F10 relay re-enable.
5. **[F10 relay inconsistency]** cached pnl fallback public-only (E.8). Relay 0-pnl bila API lag. Moot. Cross-F10 relay re-enable.
6. **[F10 RPC lag]** close-confirmation polling 17s window. Bila RPC persistently lag, infinite retry close. Verify F11 management loop "position not found" SDK error handling. Cross-F11.
7. **[F10 relay slippage]** zap-out slippageBps 5000 (50%) vs deploy 500 (5%). 10x more tolerant. Verify intentional (close + swap higher OK). Moot. Cross-F10 relay re-enable.
8. **[F9 #17 RESOLVED]** untracked close path (E.11) — tracked=null skip recordPerformance. F9 #17 risk realized. Mitigasi: on-chain backfill adopt. Verify F11 backfill. Cross-F11.
9. **[F19]** derivedLesson return dari recordPerformance (2428/2730 `derived_lesson: derivedLesson1?.rule`). Verify F19 derivLesson return shape. Cross-F19.
10. **[F25]** sendTxTracked gas track close/claim multi-tx (claim + removeLiquidity multi-tx wide-range). Verify F25 gas aggregation per close. Cross-F25.
11. **[F32]** closePaperPosition (1675) → recordPerformance paper:true. Verify F32 paper close math (simulatePaperMetrics) + paper:true tag stamp. Cross-F32.
12. **[F21]** resolvePerformanceSignalSnapshot merge darwin staged + tracked.signal_snapshot. Darwin OFF factory → staged=null. Verify F21 staged signals lifecycle. Cross-F21.
13. **[F8 #5 RESOLVED]** recordPerformance diplicu di dlmm.js (2348 relay, 2652 public, 1693 paper), BUKAN executor. CONFIRMED. F8 #5 closed.
14. **[F9 E.1 RESOLVED]** rent refund via close ix (E.3) — public removeLiquidity shouldClaimAndClose:true (2495) OR pool.closePosition (2504). Rent ~0.057 SOL refund regardless of close path/reason. F9 E.1 bug mitigation confirmed (risk only mid-deploy gas squeeze, not lost rent).
15. **[F24]** classifyCloseRule (reports.js:163-174) maps free-text close_reason → canonical rule. F10 passes `reason || "agent decision"`. Verify F24 mapping covers "agent decision" default + all F18 rule strings + LLM free-text. Cross-F24.
16. **[F30]** notifyClose render (views/notifs.js renderClose) — gasSol + solMode + solPrice + peakPnlPct + lesson. Verify F30 renderClose mode-correct + peak give-back display. Cross-F30.
17. **[F31]** solMode config.management.solMode full-sync 6-surface. telegram.js solModeOn (582) read user-config. Verify F31 formatFullConfig + renderSettingsMenu + SETTINGS-GUIDE. Cross-F31.
18. **[F10 "F9-besar deferred"]** comment 2407/2711: "F9-besar deferred" — full canonical pnl_usd mutation utk notif==report. Current F9-light render-only. Verify F9-besar scope (canonical mutation) + timeline. Unknown.
19. **[F10 circuit breaker]** relay circuit breaker 2-fail threshold + 10m cooldown. Verify F10 close relay failure count persists across restart (in-memory `_relayConsecutiveFailures` resets on restart). Cross-F10 restart behavior.
20. **[F10 idempotencyKey close]** `close:${position_address}:10000` (2209). Dedup relay close order. Verify F10 relay idempotency on retry. Moot (relay rare).
