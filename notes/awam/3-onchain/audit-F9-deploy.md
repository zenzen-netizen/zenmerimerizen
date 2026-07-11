# Audit F9 — Deploy + rentang + rent reserve + base factor fee
> Read-only. Bukti `file:line`. UNKNOWN kalau tak pasti. Resume: buka file ini.
> Kedalaman: ⬛⬛ mandatory deep — alasan: `deployPosition` jantung on-chain hulu; rentang-bug + rent refundable/non-refundable distinction kontrak-kunci cegah silent capital drain; 2 path (relay DEAD / direct SDK) + wide-range non-atomic orphan cleanup; paper branch isolation; base factor fee formula sumber真 value; COOLDOWN gate anti re-deploy pool yang baru close OOR; full-sync rentPerPositionSol 6-surface.
> Cross-ref: F7 (gate-12 SOL+rent + exit-liquidity experiment), F8 (post-success notifyDeploy wiring), F11 (getMyPositions post-deploy refresh), F13/F32 (paper branch), F17 (trackPosition), F19 (signal_snapshot→recordPerformance), F21 (darwin staged signals), F26 (computeDeployAmount + minDeployAmount floor), F27 (convictionSizing re-clamp), F10 (close→rent refund), F31 (rentPerPositionSol 6-surface verify), F14 (isUsableVolatility mirror).

## Ringkasan eksekutif (5 baris)
1. `deployPosition` (dlmm.js:650-1285) 6 phase: **cooldown gate → activeBin fetch + downside/upside_pct→bins → amount fallback (computeDeployAmount) + single-side enforce + dual-side transform (OFF factory) → minBinsBelow clamp + DRY_RUN branch (paper/would_deploy) OR live → assertRange... (bin-array non-refundable rent guard, pre-path-split) → [relay path DEAD] / direct SDK path (standard atomic OR wide-range non-atomic 2-tx create+add)**. Slippage 1000bps/10% standard, 10% chunked, 500bps relay (moot, relay dead). Trackposition + appendDecision persist sukses maupun orphan.
2. **Rent reserve bug CONFIRMED** (plan F9): `rentPerPositionSol` factory 0 (config.js:253, schema min:0 executor.js:1026 `Math.max(0, ??0)`). Gate-12 (executor.js:1019-1035) cadangin `amountY + gasReserve + rentReserve=0` → position account rent ~0.057 SOL (refundable on close) TAK dicadangin bila user tak opt-in. Berbeda dari `BIN_ARRAY_FEE` 0.0714 SOL/bin-array + `BIN_ARRAY_BITMAP_FEE` 0.0118 SOL — non-refundable, di-block hard oleh `assertRangeDoesNotRequireBinArrayInitialization` (dlmm.js:489-545) pre-path-split. User harus set `rentPerPositionSol` ~0.057 manual; F8 #9 cross-resolved — CONFIG_MAP line 380 `["management","rentPerPositionSol"]` flat ✓, gate-12 honors ✓.
3. **Relay deploy path DEAD**: `shouldUseLpAgentRelayForDeploy()` (dlmm.js:202-204) hardcoded `return false;`. Seluruh blok 950-1089 (meridianJson `/execution/zap-in/order` + `/submit`, idempotencyKey, `assertNoInitializeBinArrayInstructions` 982, position lookup post-relay 1005-1008) tak pernah dieksekusi. Relay infra (circuit breaker 162-200, meridianJson retry 206-266) hidup utk close/claim (F10). Direct SDK path (1091-1235) always. Slippage 500bps relay moot.
4. **Wide-range non-atomic orphan cleanup** (dlmm.js:1099-1266): `totalBins > 69` → `createExtendedEmptyPosition` (Phase 1, multi-tx) → `addLiquidityByStrategyChunkable` (Phase 2, multi-tx). `positionCreated` flag set true setelah Phase 1 tx[0] (rent locked). Catch block: bila Phase 2 throw → orphan trackPosition + `setPositionInstruction("incomplete deploy — liquidity add failed; close to recover rent")` → management loop (F18/F11) tutup via normal close path → rent recovered. Idempotent (trackPosition keyed by address + ensureDeployedAt early-return). Standard path (≤69 bins) atomic `initializePositionAndAddLiquidityByStrategy` single tx, `positionCreated=false`, catch tak reach cleanup. Solid contract.
5. **Dual-side (E1) cleanup + paper branch + base factor fee**: dual-side pre-swap (918-938) swap porsi SOL→token utk sisi atas; catch (1269-1282) revert swap bila deploy gagal, fail-open log "token nyangkut, owner swap manual" bila revert gagal. Dual-side OFF factory (`dualSideEnabled` default false). Paper branch (797-875): `isPaperMode()` track virtual `paper_…` id + stash `entry_fee`/`entry_active_tvl` 24h window di `signal_snapshot` (paper-only, fetch pool-discovery-api 822, fail-open 830) → fallback `would_deploy` 876 bila paper tracking error. Base factor fee (914-916): `pool.lbPair.parameters?.baseFactor ?? 0` → `baseFactor * binStep / 1e6 * 100` = fee %; `base_fee ?? actualBaseFee` (LLM override menang). Formula match CLAUDE.md.

## Progress
- [x] Baca dlmm.js 480-599 (discriminator const + assertRange + assertNoInit + getDlmmInstructionDiscriminators + pool cache)
- [x] Baca dlmm.js 645-844 (deployPosition header + cooldown + downside/upside_pct + amount fallback + dual-side transform + minBinsBelow + DRY_RUN paper start)
- [x] Baca dlmm.js 845-1064 (paper branch tail + would_deploy + live path + assertRange call + base fee + dual-side pre-swap + relay path start + relay trackPosition)
- [x] Baca dlmm.js 1060-1309 (relay return + direct path standard + wide-range + trackPosition + appendDecision + success return + catch orphan+dual-side cleanup + fetchLpAgentOpenPositions start)
- [x] Baca executor.js 975-1074 (gate-9 dup pool + gate-10 dup base mint + amount limits + gate-12 SOL+rent reserve + exit-liquidity experiment)
- [x] Baca config.js 510-549 (computeDeployAmount maximize rent-aware + minDeployAmount floor)
- [x] Grep rentPerPositionSol 6-surface: executor CONFIG_MAP ✓, config default ✓, schema ✓
- [x] Grep helper fns: MIN_SAFE_BINS_BELOW, sendTxTracked, shouldUseLpAgentRelayForDeploy (DEAD), isPoolOnCooldown, captureShadowSignals, getAndClearStagedSignals
- [x] Tulis §A-§H
- [x] §0 Cara Kerja (Bahasa Awam) — retro-fit 2026-07-07

---

## §0. Cara Kerja (Bahasa Awam)

**Analogi** (dua sudut pandang sehari-hari)
- *Petugas pasang tenda di lapak*: ambil alamat lapak → cek sudah ada tenda belum (cooldown) → cek ukuran lapak sesuai volatilitas pasar (bin range bawah/atas) → sediakan modal sesuai pos (single-side SOL) → pasang tenda. Kalau tenda lebar banget (>69 bin) → 2 fase: bikin tenda kosong (kunci sewa) → tambah isi. Kalau fase isi gagal → tenda yatim → catat "close manual untuk recover sewa". Di bot, ini = `deployPosition` 6 phase.
- *Penyewa kios yang lupa naruh deposit*: sewa kios = 0.057 SOL (refundable on close). Tapi petugas gak naruh deposit ini di perhitungan saldo → saldo keliatan lebih banyak dari sebenarnya → setelah N sewa, jangan kaget max-pos gagal. Bug F9 #2: `rentPerPositionSol` factory 0 → gate-12 tak cadanhin rent.

**Di bot, ini = `deployPosition` dari `tools/dlmm.js:650-1285`**: fungsi on-chain hulu untuk taruh modal LP. 6 phase: cooldown → fetch activeBin + bins → amount + single-side enforce → DRY_RUN branch OR live → assertRange (block bin-array non-refundable rent) → direct SDK path (standard atomic OR wide-range 2-tx).

**Posisi fase ini di alur bot**
F9 = jantung on-chain hulu. Datang SETELAH F7 (safety checks lolos). SCREENER LLM (F4) pilih kolam + kasi argumen → F7 cek 13 gate → F9 kirim tx on-chain. Sukses → `trackPosition` (F17) + `poolMemory.recordPoolDeploy` + `notifyDeploy` (F8). Lapisan 3 (Mesin) + 6 (Koneksi/Solana RPC). Tanpa F9, modal tak pernah jadi LP → tak ada fee → tak ada PnL.

**Langkah kerja F9 — `deployPosition(pool, args)` 6 phase**
1. **Cooldown gate**: cek pool-address → bila barusan close OOR (cooldown `cooldownMs`) → refuse (cegah re-deploy pool yang baru burn).
2. **activeBin fetch + downside/upside_pct→bins**: baca bin aktif on-chain + harga → SCREENER kasih `downside_pct`/`upside_pct` → konversi ke `bins_below`/`bins_above` via `computeBinsBelow` (F3). Bila tak ada → fallback dari volatilitas.
3. **Amount fallback**: bila `args.amount_y` tak di-set → `computeDeployAmount(walletSol)` (F26 compounding formula + convictionSizing re-clamp jika opt-in). Single-side enforce: `amount_x` harus 0; bila dual-side ON (factory OFF) → pre-swap sebagian SOL → token via Jupiter.
4. **DRY_RUN branch**: bila `isPaperMode()` → track virtual `paper_…` id (F13/F32) + stash `signal_snapshot` (paper-only fetch pool-discovery fee_active_tvl 24h, fail-open) → return. Bila `DRY_RUN=true` non-paper → return `would_deploy` (vanishing). Bila live → lanjut.
5. **assertRange...** (dlmm.js:489-545) — pre-path-split guard: cek instruksi tx TIDAK contain `InitializeBinArray`. Kalau ada → blok hard (bin-array rent 0.0714 SOL + bitmap 0.0118 SOL = **NON-REFUNDABLE**). Cegah silent capital drain permanent.
6. **Direct SDK path**: 2 sub-jalur:
   - **Standard atomic (≤69 bins)**: `initializePositionAndAddLiquidityByStrategy` 1 tx → atomic all-or-nothing. Slippage 1000bps/10%.
   - **Wide-range 2-tx (>69 bins)**: Phase 1 `createExtendedEmptyPosition` (multi-tx, rent kunci) → Phase 2 `addLiquidityByStrategyChunkable` (multi-tx chunized). Bila Phase 2 throw → orphan `trackPosition` + `setPositionInstruction "incomplete deploy — close to recover rent"` → management loop (F11) akan tutup normal → rent recovered.

**Dual-side cleanup (E1, factory OFF)** — pre-swap SOL→token utk sisi atas (918-938). Bila deploy gagal → revert swap di catch (1269-1282). Bila revert gagal → log "token nyangkut, owner swap manual" (fail-open).

**Base factor fee formula** (914-916): `pool.lbPair.parameters?.baseFactor ?? 0` → `baseFactor × binStep / 1e6 × 100` = fee persen. Field untuk `notifyDeploy`. LLM override (`base_fee` di args) menang.

**Output F9**: 
- Live → `{success, positionAddress, binRange, baseFee, amountDepositedSol, ...}`
- Paper → track virtual `paper_…` id
- DRY_RUN non-paper → `would_deploy` (vanishing)
- Orphan wide-range → trackPosition + instruction tag (management loop akan cleanup via close)
- `notifyDeploy` (F8) Telegram: pool name, range, baseFee, amount.

**Bug kontrak-kunci** — `rentPerPositionSol` factory 0 (config.js:253). Gate-12 (F7) cek `amountY + gasReserve + rentReserve=0` → 0.057 SOL rent posisi TAK dihitung. Setelah N deploys, `gasReserve` makin tipis → max-pos bisa gagal / deploy gagal. Roadmap kontrak #5. Solusi: user opt-in `rentPerPositionSol ~ 0.057` manual. Beda dari `BIN_ARRAY_FEE` (0.0714 SOL, NON-REFUNDABLE) yang sudah di-block hard oleh `assertRangeDoesNotRequireBinArrayInitialization`.

**Bug relay DEAD** — `shouldUseLpAgentRelayForDeploy()` hardcoded `return false` (dlmm.js:202-204). Seluruh blok 950-1089 (`meridianJson /execution/zap-in` pernah dulunya meteora-zen relay) tak pernah dieksekusi. Direct SDK path always. Relay infra hidup cuma utk close/claim (F10) — circuit breaker + meridianJson retry utility.

**Kalau F9 rusak / diskip**
Bot tak bisa LP. Modal di wallet, tak ada fee yang masuk. Atau: `assertRange` mati → deploy layang bin-array (NON-REFUNDABLE rent 0.0714 SOL / array) → modal silent drain permanent. Atau: wide-range orphan cleanup mati → posisi yatim (rent kunci, tak ada liquidity) → 0.057 SOL stuck per posisi. Atau: cooldown gate mati → re-deploy pool yang baru OOR → cycle burn modal. F9 = pintu utama "modal jadi kolam".

**Istilah yang muncul di fase ini**
- **`deployPosition`** — fungsi jantung on-chain hulu. 6 phase. Implementasi `tools/dlmm.js:650-1285`.
- **cooldown gate** — cegah re-deploy pool yang baru close OOR (cooldown `cooldownMs`).
- **`computeBinsBelow`** — rumus linear `round(minBinsBelow + (vol/5) × (maxBinsBelow-minBinsBelow))` clamp `[minBinsBelow=35, maxBinsBelow]`. F3.
- **single-side deploy** — modal SOL saja, `amount_x=0`, `bins_above=0`. Cegah deposit base token.
- **dual-side deploy (E1, factory OFF)** — pre-swap sebagian SOL→token utk sisi atas (cedeg fee di kedua sisi). Cleanup revert bila gagal.
- **`MIN_SAFE_BINS_BELOW=35`** — hard floor range modal di bawah harga. Multi-layer.
- **`assertRangeDoesNotRequireBinArrayInitialization`** — guard pre-path yang block tx mengandung `InitializeBinArray`. Cegah NON-REFUNDABLE bin-array rent 0.0714 SOL.
- **rent posisi** — 0.057 SOL refundable on close. Bug: tak dihitung gate-12 bila `rentPerPositionSol=0` factory. Solusi: opt-in manual ~0.057.
- **bin-array rent** — 0.0714 SOL + 0.0118 SOL bitmap. NON-REFUNDABLE. BLOCKED hard oleh assertRange.
- **wide-range 2-tx** — bila `totalBins > 69` → non-atomic: Phase 1 create empty (rent kunci) → Phase 2 chunkable add liquidity. Orphan cleanup via `trackPosition` + instruction tag.
- **standard atomic** — bila `totalBins ≤ 69` → 1 tx `initializePositionAndAddLiquidityByStrategy`. Slippage 10%.
- **base factor fee** — `pool.lbPair.parameters.baseFactor × binStep / 1e6 × 100` = fee % di `notifyDeploy`. LLM `base_fee` override menang.
- **paper branch** — `isPaperMode()` track virtual `paper_…` id + `signal_snapshot` (paper-only fetch). Diket F13/F32.
- **relay deploy path DEAD** — `shouldUseLpAgentRelayForDeploy()` returns false hardcode. Block relay meridian infra tak dipakai utk deploy.
- **`trackPosition`** — `state.js` simpen record posisi (`position_address`, bins, entry, dsb). Orphan juga di-track supaya management loop bisa cleanup.

*Lewati §0 kalau sudah paham. Isi teknis mulai §A.*

---

## §A. Peta block fase ini (file:line → peran)

| file:line | simbol | peran |
|---|---|---|
| dlmm.js:482-483 | `METEORA_INIT_BIN_ARRAY_DISCRIMINATOR` + `BITMAP_EXT` | hex discriminator const utk detect init ix |
| dlmm.js:485-487 | `getDlmmProgramId` | hardcoded LBUZKh... program id |
| dlmm.js:489-492 | `formatSolFee` | rent fee formatter (trim trailing 0) |
| dlmm.js:494-545 | `assertRangeDoesNotRequireBinArrayInitialization` | pre-deploy range guard, block non-refundable bin-array rent |
| dlmm.js:504-506 | SDK fn guard | `getBinArrayKeysCoverage`/`getBinArrayIndexesCoverage` missing → throw "Cannot verify" (fail-closed) |
| dlmm.js:512-520 | bin-array coverage + missing detect | `getMultipleAccountsInfo` → map missing → filter |
| dlmm.js:522-530 | missing bin-array throw | `BIN_ARRAY_FEE ?? 0.07143744` SOL each × missing.length |
| dlmm.js:532-544 | bitmap extension check | `isOverflowDefaultBinArrayBitmap` → `deriveBinArrayBitmapExtension` → `BIN_ARRAY_BITMAP_FEE ?? 0.01180416` |
| dlmm.js:547-565 | `assertNoInitializeBinArrayInstructions` | instruction-level veto (relay path only, 982) |
| dlmm.js:567-585 | `getDlmmInstructionDiscriminators` | deserialize versioned/legacy tx → filter DLMM program ix → first 8 bytes discriminator |
| dlmm.js:650-674 | `deployPosition` header | 17 params (pool/amount/strategy/bins/pct/metadata/narrative/entry-conditions) |
| dlmm.js:675-684 | strategy/binsBelow default + volatility validate | `config.strategy.strategy` fallback; volatility ≤0/non-finite → throw |
| dlmm.js:686-697 | cooldown gate | `isPoolOnCooldown`/`isBaseMintOnCooldown` (pool-memory.js) → return soft-fail |
| dlmm.js:699-700 | activeBin + actualBinStep + activePrice | SDK `pool.getActiveBin()` + `getPriceOfBinByBinId` |
| dlmm.js:702-720 | downside_pct/upside_pct → bins | override bins_below/above via `getBinIdFromPrice` |
| dlmm.js:724-727 | amount fallback | `computeDeployAmount((await getWalletBalances()).sol)` bila amount_y+amount_sol null |
| dlmm.js:728-739 | amount validate + single-side enforce | finalAmountX>0 → throw (single-side SOL only) |
| dlmm.js:741-754 | dual-side transform (E1, OFF factory) | `dualSideEnabled` gate + `dualSideTokenPct` + `dualSideUpsidePct` → bins_above |
| dlmm.js:756-763 | single-side bins_above veto | `isSingleSidedSol && !dualSide && bins_above>0` → throw |
| dlmm.js:775-781 | minBinsBelow floor | `Math.max(MIN_SAFE_BINS_BELOW=35, config.minBinsBelow)` + totalBins<floor → throw |
| dlmm.js:794-875 | DRY_RUN paper branch | `isPaperMode()` track virtual `paper_…` id + signal_snapshot 24h fee/tvl |
| dlmm.js:822-830 | paper fee fetch | pool-discovery-api 24h window, fail-open catch |
| dlmm.js:853-871 | paper return | enriched result `paper:true` + `🧪` display name |
| dlmm.js:876-891 | would_deploy fallback | DRY_RUN non-paper return (factory OFF) |
| dlmm.js:893-912 | live path: wide-range flag + bin/price math | `totalBins > 69` → isWideRange; min/maxBinId + price + coverage pct |
| dlmm.js:906 | `assertRangeDoesNotRequireBinArrayInitialization` call | pre-path-split rent guard (BIN_ARRAY non-refundable) |
| dlmm.js:914-916 | base factor fee read | `baseFactor * binStep / 1e6 * 100` = fee %, `base_fee ?? actualBaseFee` |
| dlmm.js:918-938 | dual-side pre-swap (Cara B) | `swapToken` SOL→token, decimals fetch, finalAmountX/Y adjust |
| dlmm.js:940-948 | lamport conversion | `finalAmountY * 1e9` Y; X mint decimals fetch (default 9) |
| dlmm.js:950-1089 | relay path (DEAD) | `shouldUseLpAgentRelayForDeploy()` return false → never reach |
| dlmm.js:957-975 | `/execution/zap-in/order` POST | idempotencyKey + poolId + strategy + amounts + percentX + slippageBps 500 |
| dlmm.js:982 | `assertNoInitializeBinArrayInstructions` | relay-only instruction veto (defense-in-depth) |
| dlmm.js:984-985 | `signSerializedTransactions` | wallet sign relay tx |
| dlmm.js:986-1001 | `/execution/zap-in/submit` POST | requestId + lastValidBlockHeight + signed txs |
| dlmm.js:1003-1008 | post-relay refresh + position lookup | `_positionsCacheAt=0` + force getMyPositions + match by pool+bin range, fallback pool-only |
| dlmm.js:1015-1037 | trackPosition post-relay | signal_snapshot gated darwin.enabled |
| dlmm.js:1039-1060 | appendDecision post-relay | deploy decision-log entry |
| dlmm.js:1062-1084 | relay success return | enriched result + `relay:true` + txs normalized |
| dlmm.js:1085-1088 | relay catch | soft fail `{success:false, error}` (no orphan cleanup — relay txs not tracked locally) |
| dlmm.js:1091-1097 | direct path setup | wallet + newPosition Keypair + log header |
| dlmm.js:1099-1103 | `positionCreated` flag | wide-range sets true after Phase 1 tx[0]; standard never sets |
| dlmm.js:1108-1148 | wide-range path | `createExtendedEmptyPosition` (multi-tx) → `addLiquidityByStrategyChunkable` (multi-tx, slippage 10%) |
| dlmm.js:1115-1132 | Phase 1 create | signers [wallet,newPosition] on tx[0] → rent locked → `positionCreated=true` |
| dlmm.js:1135-1148 | Phase 2 add liquidity | signers [wallet] only, slippage 10% |
| dlmm.js:1149-1161 | standard path | `initializePositionAndAddLiquidityByStrategy` single tx (slippage 1000bps=10%), atomic |
| dlmm.js:1165-1190 | trackPosition post-direct | cache invalidate + signal_snapshot gated + entry conditions |
| dlmm.js:1192-1213 | appendDecision post-direct | deploy decision-log |
| dlmm.js:1215-1235 | direct success return | position addr + bin/price range + coverage + base_fee + txs |
| dlmm.js:1236-1266 | catch: orphan cleanup | wide-range only (`positionCreated`) → trackPosition + setPositionInstruction "incomplete deploy" |
| dlmm.js:1269-1282 | catch: dual-side revert | swap token→SOL, fail-open log "owner swap manual" |
| dlmm.js:1283-1284 | catch: fail return | `{success:false, error:error.message}` |
| dlmm.js:133-137 | `sendTxTracked` | sendAndConfirm + `trackTxGas` background (no await) |
| dlmm.js:139-148 | `getWallet` | lazy Keypair from WALLET_PRIVATE_KEY bs58 |
| dlmm.js:150-160 | `getMeridianApiBase` + `getMeridianHeaders` | api.url + x-api-key header |
| dlmm.js:162-200 | relay circuit breaker | `_relayCircuitOpen` + 2-fail threshold + 10m cooldown + auth 401/403 instant-open |
| dlmm.js:202-204 | `shouldUseLpAgentRelayForDeploy` | **DEAD** — hardcoded `return false` |
| dlmm.js:206-266 | `meridianJson` retry wrapper | retry budget 30s/10 attempts, backoff 500*2^n cap 5s, retryable status 408/409/425/429/5xx |
| executor.js:380 | CONFIG_MAP `rentPerPositionSol` | `["management","rentPerPositionSol"]` flat |
| executor.js:1005-1011 | gate minDeploy floor | `amountY < minDeployAmount()` → reject |
| executor.js:1012-1017 | gate maxDeploy ceil | `amountY > config.risk.maxDeployAmount` → reject |
| executor.js:1019-1035 | gate-12 SOL+rent reserve | `amountY + gasReserve + rentReserve` check, DRY_RUN skip |
| executor.js:1023 | DRY_RUN bypass | paper mode skips SOL gate (empty wallet OK) |
| executor.js:1026 | rentReserve | `Math.max(0, config.management.rentPerPositionSol ?? 0)` → 0 factory |
| executor.js:1042-1063 | exit-liquidity experiment | `exitLiquidityCheck` + base_mint + !DRY_RUN → `quoteSellPriceImpact` round-trip, fail-open |
| config.js:35 | `MIN_SAFE_BINS_BELOW = 35` | exported const hard floor |
| config.js:43-47 | configuredMinBinsBelow clamp | `Math.max(35, round(u.minBinsBelow))` |
| config.js:253 | `rentPerPositionSol` default | `u.rentPerPositionSol ?? 0` |
| config.js:528-549 | `computeDeployAmount` maximize | adaptive slots N: `(wallet − gas − rent×N)/N`, floor 3 decimals (never round up), clamp ceil |
| config.js:644-646 | rentPerPositionSol live-update | `numericConfig(fresh.rentPerPositionSol)` → mutate config.management |
| config-schema.js:103 | rentPerPositionSol schema | `numStrict({ min:0, max:1, label:"SOL/posisi cadangan rent" })` |

## §B. Alur hulu→hilir deploy (ASCII)

```
SCREENER picks pool (F14 screening) + args {pool_address, amount_y, bins_below, strategy, base_fee, volatility, fee_tvl_ratio, organic_score, narrative_category, entry_mcap/tvl/volume/holders}
  │
  ├─ executor.js runSafetyChecks case "deploy_position" (F7)
  │   ├─ gate-1..7 bin_step/max-pos force-fresh/dup-pool/dup-base-mint/amount>0/minBinsBelow≥35/single-side bins_above=0
  │   ├─ gate-8 amount limits (minDeployAmount floor / maxDeployAmount ceil)
  │   ├─ gate-9 dup pool (force: true getMyPositions)              [:976-981]
  │   ├─ gate-10 dup base mint                                       [:984-994]
  │   ├─ gate-11 amountY>0 + minDeploy + maxDeploy                   [:996-1017]
  │   ├─ gate-12 SOL balance + rentReserve (DRY_RUN skip)            [:1019-1035]
  │   └─ experiment exitLiquidityCheck (OFF factory, fail-open)      [:1042-1063]
  │
  ├─ executor.js executeTool → toolMap.deploy_position → deployPosition(dlmm.js:650)
  │
  ├─ deployPosition phase 1: cooldown gate
  │   ├─ isPoolOnCooldown(pool_address) → soft-fail return            [:686-689]
  │   └─ isBaseMintOnCooldown(baseMint) → soft-fail return            [:694-697]
  │
  ├─ phase 2: activeBin + downside/upside_pct → bins
  │   ├─ pool.getActiveBin() + actualBinStep + activePrice           [:698-700]
  │   └─ if downside_pct/upside_pct → getBinIdFromPrice override bins [:702-720]
  │
  ├─ phase 3: amount + dual-side + minBinsBelow
  │   ├─ fallback computeDeployAmount(wallet.sol) bila amount_y+amount_sol null [:724-727]
  │   ├─ finalAmountX>0 → throw (single-side SOL only)               [:733-735]
  │   ├─ dual-side transform (dualSideEnabled OFF factory)            [:747-754]
  │   ├─ single-side bins_above veto                                  [:756-763]
  │   └─ minBinsBelow floor clamp + totalBins<floor → throw           [:775-781]
  │
  ├─ phase 4: DRY_RUN branch
  │   ├─ isPaperMode() → trackPosition virtual paper_id + signal_snapshot 24h fee/tvl [:797-871]
  │   │   └─ fail-open → would_deploy fallback                         [:872-891]
  │   └─ else (DRY_RUN non-paper) → would_deploy return                [:876-891]
  │
  ├─ phase 5 live: assertRange + base fee + dual-side pre-swap
  │   ├─ wide-range flag (totalBins>69)                                [:893]
  │   ├─ min/maxBinId + price/coverage pct                             [:894-912]
  │   ├─ assertRangeDoesNotRequireBinArrayInitialization (BIN_ARRAY rent guard) [:906]
  │   ├─ base factor fee read                                          [:914-916]
  │   └─ dual-side pre-swap swapToken SOL→token (OFF factory)          [:918-938]
  │
  ├─ phase 6 path split:
  │   ├─ [DEAD] shouldUseLpAgentRelayForDeploy()=false → never        [:950-1089]
  │   │   └─ relay order/submit + assertNoInitializeBinArrayInstructions (982) + post-relay trackPosition
  │   │
  │   └─ direct SDK path                                                [:1091-1235]
  │       ├─ wide-range (totalBins>69): createExtendedEmptyPosition (Phase 1, multi-tx, rent locked) → addLiquidityByStrategyChunkable (Phase 2, multi-tx)
  │       │   └─ positionCreated=true after Phase 1 tx[0]
  │       └─ standard (≤69 bins): initializePositionAndAddLiquidityByStrategy single tx (atomic)
  │
  ├─ post-success direct:
  │   ├─ _positionsCacheAt=0 (cache invalidate)                        [:1165]
  │   ├─ signalSnapshot = darwin.enabled ? getAndClearStagedSignals : null [:1166-1168]
  │   ├─ trackPosition (state.js F17)                                  [:1169-1190]
  │   └─ appendDecision deploy (decision-log.json F23)                 [:1192-1213]
  │
  └─ return → executor post-success wiring notifyDeploy (F8) → LLM
    
  CATCH (deployPosition):
  ├─ if positionCreated (wide-range Phase 1 sukses + Phase 2 fail):
  │   ├─ trackPosition orphan + setPositionInstruction "incomplete deploy" [:1247-1266]
  │   └─ management loop (F18/F11) tutup via normal close path → rent recovered
  └─ if dualSideSwapped + finalAmountX>0:
      ├─ swapToken token→SOL revert                                     [:1269-1282]
      └─ fail-open: revert gagal → log "owner swap manual"
  └─ return {success:false, error}
```

## §C. Sinkron: siapa-panggil-siapa

| Pemanggil (file:line) | Dipanggil (file:line) | Trigger | Data lewat | Fail-mode |
|---|---|---|---|---|
| executor.js executeTool `deploy_position` | dlmm.js:650 `deployPosition` | SCREENER tool call | args{pool_address,amount_y,bins_below,strategy,base_fee,volatility,fee_tvl_ratio,organic_score,narrative_category,entry_mcap/tvl/volume/holders,bin_step,pool_name,initial_value_usd} | throw → catch return {success:false,error} |
| dlmm.js:686 | pool-memory.js `isPoolOnCooldown` | deploy start | pool_address | soft-fail return (no throw) |
| dlmm.js:694 | pool-memory.js `isBaseMintOnCooldown` | deploy start | baseMint | soft-fail return |
| dlmm.js:691 | getDLMM() dynamic import | deploy start | — | throw (SDK unavailable) |
| dlmm.js:692 | dlmm.js:591 `getPool` | deploy start | pool_address | cache + DLMM.create |
| dlmm.js:698 | SDK `pool.getActiveBin` | deploy | — | throw → catch |
| dlmm.js:700 | SDK `getPriceOfBinByBinId` | deploy | binId, binStep | throw → catch |
| dlmm.js:715-716 | SDK `getBinIdFromPrice` | downside_pct/upside_pct path | targetPrice, binStep, roundDown/Up | throw → catch |
| dlmm.js:726 | wallet.js `getWalletBalances` | amount fallback | — | throw → catch (balance fetch fail) |
| dlmm.js:726 | config.js:528 `computeDeployAmount` | amount fallback | walletSol | return 0 (can't deploy) or number |
| dlmm.js:797 | paper-trading.js `isPaperMode` | DRY_RUN branch | — | false → would_deploy fallback |
| dlmm.js:809 | paper-trading.js `makePaperPositionId` | paper track | pool_address | synthetic id `paper_…` |
| dlmm.js:832 | state.js `trackPosition` | paper track | position,pool,strategy,bin_range,amounts,signal_snapshot,entry conditions | try/catch fail-open → would_deploy |
| dlmm.js:906 | dlmm.js:494 `assertRangeDoesNotRequireBinArrayInitialization` | live pre-deploy | pool, minBinId, maxBinId | throw → catch (no tx sent) |
| dlmm.js:514 | RPC `getMultipleAccountsInfo` | assertRange | binArray keys | throw "Cannot verify" if RPC fail |
| dlmm.js:923 | wallet.js `swapToken` | dual-side pre-swap | input_mint=SOL, output_mint=baseMint, amount=swapSol | throw → catch (dual-side cleanup) |
| dlmm.js:950 | dlmm.js:202 `shouldUseLpAgentRelayForDeploy` | path split | — | **DEAD return false** |
| dlmm.js:957 | dlmm.js:206 `meridianJson` | relay order (DEAD) | pathname+options | retry budget 30s |
| dlmm.js:982 | dlmm.js:547 `assertNoInitializeBinArrayInstructions` | relay post-order (DEAD) | serialized txs | throw → catch |
| dlmm.js:1005 | dlmm.js `getMyPositions({force:true,silent:true})` | relay post-submit (DEAD) | — | `.catch(()=>null)` fail-open |
| dlmm.js:1125/1145/1159 | dlmm.js:133 `sendTxTracked` | direct path tx send | tx, signers, "deploy" | throw → catch |
| dlmm.js:135 | gas-tracker.js `trackTxGas` | sendTxTracked | connection, sig, action | fire-and-forget no-await |
| dlmm.js:1169 | state.js `trackPosition` | direct post-success | position addr + full meta | throw → catch (position untracked, on-chain exists) |
| dlmm.js:1167 | signal-tracker.js `getAndClearStagedSignals` | direct post-success (darwin ON) | pool_address, baseMint | null if darwin OFF |
| dlmm.js:1184 | dlmm.js:55 `captureShadowSignals` | direct post-success | pool_address | shadow signals obj |
| dlmm.js:1192 | decision-log.js `appendDecision` | direct post-success | type/actor/pool/summary/reason/risks/metrics | persist decision-log.json |
| dlmm.js:1250 | state.js `trackPosition` | catch orphan cleanup | orphan addr + meta | try/catch fail-open |
| dlmm.js:1261 | state.js `setPositionInstruction` | catch orphan | addr, "incomplete deploy" | try/catch fail-open |
| dlmm.js:1273 | wallet.js `swapToken` | catch dual-side revert | token→SOL | fail-open log |
| executor.js:1024 | wallet.js `getWalletBalances` | gate-12 SOL check | — | balance.sol=0 → reject |
| executor.js:1049 | wallet.js `quoteSellPriceImpact` | exit-liq experiment | baseMint, solNotional | fail-open catch → allow |

## §D. Logika kunci per fungsi

### `deployPosition` (dlmm.js:650-1285)
- Apa: deploy LP position ke Meteora DLMM pool.
- Kapan dipicu: SCREENER tool call via executor after F7 safety gate.
- Output: `{success, position, pool, bin_range, price_range, range_coverage, bin_step, base_fee, strategy, wide_range, amount_x, amount_y, txs}` or `{success:false, error}` or DRY_RUN `{dry_run:true, would_deploy}` or paper `{success:true, dry_run:true, paper:true, position:paper_id, ...}`.
- Sinkron: state.js trackPosition, decision-log appendDecision, executor post-success notifyDeploy (F8), gas-tracker trackTxGas.
- Fail-mode: cooldown soft-fail; volatility unusable throw; amount invalid throw; single-side bins_above throw; minBinsBelow throw; assertRange throw (no tx); SDK tx throw → catch orphan cleanup (wide-range) or dual-side revert or plain fail return.
- Bukti: dlmm.js:650-1285.

### `assertRangeDoesNotRequireBinArrayInitialization` (dlmm.js:494-545)
- Apa: pre-deploy guard — block rentang yang butuh bin-array init (non-refundable rent).
- Kapan dipicu: deployPosition live path pre-tx (906), sebelum path split relay/direct.
- Output: throw bila missing bin-array OR bitmap ext missing; return void bila OK.
- Sinkron: SDK getBinArrayKeysCoverage/getBinArrayIndexesCoverage/deriveBinArrayBitmapExtension/isOverflowDefaultBinArrayBitmap; RPC getMultipleAccountsInfo.
- Fail-mode: SDK fn missing → throw "Cannot verify" (fail-closed); RPC fail → throw; range all-initialized → pass.
- Bukti: 494-545, call at 906.
- Constants: `BIN_ARRAY_FEE ?? 0.07143744` SOL each, `BIN_ARRAY_BITMAP_FEE ?? 0.01180416` SOL. Non-refundable (pool rent, burned to bin-array PDA).

### `assertNoInitializeBinArrayInstructions` (dlmm.js:547-565)
- Apa: instruction-level veto — scan serialized tx utk Meteora init bin-array/bitmap ix discriminator.
- Kapan dipicu: relay path post-order (982, DEAD).
- Output: throw bila offender found; return void bila clean.
- Sinkron: `getDlmmInstructionDiscriminators` (567) deserialize versioned OR legacy tx.
- Fail-mode: tx deserialize both fail → silent return (no discriminators) — potential blind spot bila malformed tx.
- Bukti: 547-565, call at 982 (DEAD path).
- Gap: direct SDK path tak call this. Mitigated by assertRange pre-check (range-level). Defense-in-depth hanya di relay (dead).

### `getDlmmInstructionDiscriminators` (dlmm.js:567-585)
- Apa: extract first 8 bytes data dari setiap DLMM program ix dalam serialized tx.
- Output: array of hex string discriminator.
- Fail-mode: versioned deserialize fail → fallback legacy; legacy fail → return [] (silent).
- Bukti: 567-585.

### `computeDeployAmount` maximize (config.js:528-549)
- Apa: hitung deploy size adaptive berdasarkan slot tersisa + gas + rent per slot.
- Kapan dipicu: deployPosition amount fallback (dlmm.js:726) bila LLM tak provide amount_y.
- Output: perSlot number clamped to ceil; 0 bila N=1 tak clear min (explicit can't-deploy).
- Sinkron: config.management.{gasReserve, rentPerPositionSol, sizingMode}, config.risk.{maxDeployAmount, maxPositions}, minDeployAmount() floor.
- Fail-mode: sizingMode!="maximize" → legacy fixed formula (config.js:550+); 0 return → caller skip.
- Bukti: config.js:528-549.

### gate-12 SOL+rent reserve (executor.js:1019-1035)
- Apa: validasi wallet SOL cukup utk amount + gas + rent per position.
- Kapan dipicu: runSafetyChecks deploy_position, after gate-11 amount limits.
- Output: `{pass:false, reason}` bila `balance.sol < amountY + gasReserve + rentReserve`; `{pass:true}` otherwise.
- Sinkron: wallet.js getWalletBalances; config.management.{gasReserve, rentPerPositionSol}.
- Fail-mode: DRY_RUN skip entire block (paper empty wallet OK); rentReserve=0 factory → legacy check (gas only).
- Bukti: executor.js:1019-1035.
- **Bug kontrak-kunci**: rentPerPositionSol default 0 → rent ~0.057 SOL tak dicadangin. User harus opt-in manual. Position account rent REFUNDABLE on close (F10), BIN_ARRAY rent NON-REFUNDABLE (blocked by assertRange). Distinction critical.

### wide-range orphan cleanup (dlmm.js:1099-1266)
- Apa: bila wide-range Phase 1 (create) sukses + Phase 2 (add liquidity) fail, position account exists on-chain dengan rent locked tapi untracked.
- Kapan dipicu: catch block deployPosition, `positionCreated=true` only.
- Output: trackPosition orphan + setPositionInstruction "incomplete deploy — liquidity add failed; close to recover rent".
- Sinkron: state.js trackPosition + setPositionInstruction; management loop F18/F11 baca instruction → close via normal path F10 → rent refund.
- Fail-mode: trackPosition/setPositionInstruction error → inner try/catch fail-open (orphan tetap untracked, di-adopt by on-chain backfill later — idempotent trackPosition mencegah double-adopt).
- Bukti: 1099-1103 flag set, 1247-1266 cleanup.
- Solid contract: standard path atomic, positionCreated=false, catch tak reach cleanup.

### base factor fee read (dlmm.js:914-916)
- Apa: baca base fee pool dari `pool.lbPair.parameters.baseFactor`.
- Formula: `baseFactor * binStep / 1e6 * 100` = fee %.
- Output: `actualBaseFee` number or null bila baseFactor=0; `base_fee ?? actualBaseFee` (LLM override menang).
- Sinkron: pool object dari getPool cache; return value dipakai prompt SCREENER + recordPerformance.
- Fail-mode: baseFactor missing → null (fee unknown, LLM fallback to candidate data).
- Bukti: 914-916, return at 1078/1229.

### `sendTxTracked` (dlmm.js:133-137)
- Apa: send tx + background gas track.
- Output: signature string.
- Sinkron: sendAndConfirmTransaction; gas-tracker.js trackTxGas (no await — fire-and-forget, fail-open).
- Fail-mode: sendAndConfirm throw → propagate ke caller catch; trackTxGas error tak block return.
- Bukti: 133-137.

## §E. Temuan: bug / gap / kontrak-kunci / fail-open tak-terpenuhi

### E.1 — Rent reserve default 0 (plan F9 bug CONFIRMED)
- `rentPerPositionSol` factory 0 (config.js:253 `u.rentPerPositionSol ?? 0`).
- config-schema.js:103 `numStrict({min:0, max:1})` — min 0 allow factory.
- executor.js:1026 `rentReserve = Math.max(0, config.management.rentPerPositionSol ?? 0)` → 0 factory.
- gate-12 check: `amountY + gasReserve + 0` → position account rent ~0.057 SOL tak dicadangin.
- **Kontrak-kunci distinction**:
  - Position account rent ~0.057 SOL — REFUNDABLE on close (F10 close ix closes position account, rent returned to owner). TAK blocked, hanya tak dicadangin → bila wallet pas-pasan, Nth deploy bisa fail mid-tx krn rent ngutang dari gas reserve.
  - BIN_ARRAY_FEE 0.0714 SOL/bin-array + BITMAP_EXT 0.0118 SOL — NON-REFUNDABLE pool rent, di-block hard oleh assertRange (906) pre-tx. TAK related ke rentReserve.
- **Impact**: wallet 0.8 SOL, gasReserve 0.2, amountY 0.55 (factory deployAmountSol), rentReserve 0 → check 0.55+0.2=0.75 ≤ 0.8 pass. Tapi actual deploy butuh 0.55+0.057 rent = 0.607, sisa 0.193 < gasReserve 0.2 → gas ke-squeze. Bisa fail mid-tx atau gastx kurang.
- **Mitigasi user**: set `rentPerPositionSol` ~0.057 via `/setcfg rentPerPositionSol 0.057` atau racikan. F8 #9 cross-resolved — CONFIG_MAP line 380 flat ✓, gate-12 honors ✓.
- **Open-Q #11**: full-sync 6-surface rentPerPositionSol — verify formatFullConfig GRUP management + renderSettingsMenu pageForKey + SETTINGS-GUIDE + definitions desc. Cross-F31.
- Bukti: config.js:253, config-schema.js:103, executor.js:1026-1027, dlmm.js:906 (assertRange), BIN_ARRAY_FEE 523.

### E.2 — Relay deploy path DEAD
- `shouldUseLpAgentRelayForDeploy()` (dlmm.js:202-204) hardcoded `return false;`.
- Seluruh blok 950-1089 (meridianJson `/execution/zap-in/order` + `/submit`, idempotencyKey 962, `assertNoInitializeBinArrayInstructions` 982, post-relay getMyPositions refresh 1005, relay trackPosition 1015, relay appendDecision 1039, relay return 1062) tak pernah dieksekusi.
- Relay infra (circuit breaker 162-200, meridianJson retry 206-266) HIDAP utk close/claim (F10) — `shouldUseLpAgentRelay` (without "ForDeploy") line 168 used elsewhere.
- **Impact**: deploy always direct SDK path (1091-1235). Slippage 500bps relay moot. idempotencyKey moot.
- **Risk**: bila relay re-enabled (flip `shouldUseLpAgentRelayForDeploy` return true), need verify:
  - relay return shape (1062-1084) vs executor expectation (executor.js post-success notifyDeploy baca `result.position`/`result.pool` etc).
  - assertNoInitializeBinArrayInstructions (982) defense-in-depth utk relay tx (direct path lacks).
  - post-relay position lookup (1005-1008) fallback match-by-pool-only bila multiple positions same pool (gate-9 blocks, mitigated).
- Bukti: 202-204, 950-1089 dead, 168 shouldUseLpAgentRelay (close/claim) hidup.

### E.3 — assertNoInitializeBinArrayInstructions relay-only (defense-in-depth gap)
- assertRange (906) pre-path-split block missing bin-array at range level — solid.
- assertNoInitializeBinArrayInstructions (982) instruction-level veto HANYA di relay path (DEAD).
- Direct SDK path (1108+ wide-range / 1149+ standard) TAK re-verify generated tx utk init ix.
- **Theoretical risk**: SDK `createExtendedEmptyPosition` (1116) atau `initializePositionAndAddLiquidityByStrategy` (1151) emit init bin-array ix despite range check pass. assertRange should cover all missing bin-arrays in range → SDK shouldn't emit init. TAPI bila SDK bug atau range edge-case (bitmap ext overflow), direct path silent execute + charge non-refundable rent.
- **Mitigasi**: assertRange call (906) dengan `isOverflowDefaultBinArrayBitmap` check (532-544) covers bitmap ext. Range-level guard sufficient by design.
- **Gap**: bila user manually craft range dekat bitmap boundary, defense-in-depth absent di direct path. Low-risk krn assertRange conservative.
- Bukti: 906 assertRange call, 982 relay-only assert, 1108-1161 direct path no re-check.

### E.4 — Wide-range orphan cleanup solid
- `positionCreated` flag (1103) set true hanya setelah Phase 1 tx[0] (1125-1130) — rent locked on-chain.
- Catch (1247-1266): trackPosition orphan + setPositionInstruction "incomplete deploy — liquidity add failed; close to recover rent".
- Management loop F18/F11 baca `instruction` field → close via normal close path F10 → position account closed → rent refund.
- Idempotent: trackPosition keyed by address (state.js F17 ensureDeployedAt early-return) → on-chain backfill later tak double-adopt.
- Inner try/catch (1263-1265) fail-open: cleanup error tak block fail return.
- **Solid contract**: standard path atomic, positionCreated=false, catch tak reach cleanup (no orphan possible).
- Bukti: 1099-1103, 1125-1130, 1247-1266.

### E.5 — Dual-side cleanup fail-open (residual token risk)
- Dual-side pre-swap (918-938) success + deploy fail → catch (1269-1282) swap token→SOL revert.
- `dsBack?.success` check + log "Dual-side cleanup selesai" OR "⚠️ GAGAL — token nyangkut, owner swap manual".
- Inner try/catch (1279-1281) fail-open: revert error tak block fail return.
- **Risk**: bila Jupiter temp error saat revert, token stuck di wallet. Owner must manual swap. Edge-case (dual-side OFF factory, experiment).
- **Mitigasi**: dual-side default OFF (`dualSideEnabled` false). User opt-in sadar.
- Bukti: 918-938 pre-swap, 1269-1282 revert.

### E.6 — Volatility unusable feed guard solid
- `volatility != null && (normalizedVolatility == null || normalizedVolatility <= 0)` → throw "refusing deploy because the volatility feed is unusable" (682-684).
- `volatility == null` OK (skip — SCREENER tak provide).
- Mirror `isUsableVolatility()` F14 (finite & > 0).
- **Solid**: prevents deploy dengan stale/zero volatility feed (bins_below calc dari volatility bisa 0/bin-edge).
- Bukti: 679-684.

### E.7 — Single-side SOL enforcement solid
- `isSingleSidedSol && !dualSide && (Number(bins_above ?? 0) > 0 || Number(upside_pct ?? 0) > 0)` → throw (756-760).
- Single-side SOL: upper bin = SDK active bin (maxBinId = activeBin.binId, line 895).
- Dual-side bypasses (dualSide=true → bins_above dari dualSideUpsidePct, line 753).
- **Solid**: prevents upper-range gap (single-side SOL fill from active bin downward only).
- Bukti: 739, 756-763, 895, 900-904.

### E.8 — minBinsBelow floor solid
- `minBinsBelow = Math.max(MIN_SAFE_BINS_BELOW=35, Number(config.strategy.minBinsBelow ?? MIN_SAFE_BINS_BELOW))` (775).
- `totalBins = activeBinsBelow + activeBinsAbove` (776).
- `totalBins < minBinsBelow` → throw "refusing 1-bin/tiny-range deploy" (777-781).
- **Solid**: matches CLAUDE.md screener hard floor 35. Prevents narrow-range deploy (high IL risk, fee trap).
- Bukti: 775-781, config.js:35.

### E.9 — DRY_RUN paper branch isolation solid
- `isPaperMode()` (paper-trading.js F13/F32) = `config.experiments.paperTrading && DRY_RUN=true`.
- Paper branch (797-875): trackPosition virtual `paper_…` id + signal_snapshot stash `entry_fee`/`entry_active_tvl` 24h window (822 fetch, 830 fail-open).
- Fail-open: paper tracking error (872-874) → fallback would_deploy (876-891).
- Paper return (853-871): `paper:true` flag + `🧪` display name + enriched meta utk notifyDeploy.
- **Solid isolation**: paper record tagged via trackPosition → state.js record → recordPerformance paper:true (F19). Live consumers mode-scoped (F22 getModePerformance).
- Bukti: 794-891, 822-830 fetch fail-open.

### E.10 — Amount fallback computeDeployAmount conditional
- `fallbackAmountY = (amount_y == null && amount_sol == null) ? computeDeployAmount(wallet.sol) : 0` (724-727).
- Means: LLM-provided amount_y BYPASSES maximize/rent-aware logic. SCREENER usually provides amount_y (conviction sizing applied at executor gate-1, F27).
- **Risk**: bila SCREENER provide amount_y dari candidate data (bukan computeDeployAmount), rent-aware adaptive slots tak dipakai. Wallet could over-commit.
- **Mitigasi**: gate-12 still check `balance.sol < amountY + gasReserve + rentReserve` → block over-commit. TAPI rentReserve=0 factory (E.1 bug).
- **Open-Q #2**: SCREENER prompt convention provide amount_y? Verify prompt.js. Cross-F5/F27.
- Bukti: 724-727, executor.js gate-12.

### E.11 — Base factor fee LLM override drift
- `actualBaseFee = base_fee ?? (baseFactor > 0 ? parseFloat(...) : null)` (916).
- `base_fee` LLM-provided (dari candidate data screening.js F14) menang atas on-chain read.
- **Risk**: bila LLM pass stale base_fee (snapshot lama), return value tak match on-chain actualBaseFee. Affects recordPerformance + prompt SCREENER accuracy.
- **Mitigasi**: on-chain read authoritative bila LLM tak provide. SCREENER biasanya provide (candidate data fresh per cycle).
- **Gap**: no validation base_fee LLM vs on-chain. Drift silent.
- Bukti: 916, return 1078/1229.

### E.12 — Slippage inconsistency moot (relay dead)
- Relay path slippage 500 bps (5%, line 972) vs direct standard 1000 bps (10%, 1157) vs direct chunked 10% (1141).
- Direct path: standard 10% bps, chunked 10% — consistent.
- Relay dead → 5% moot.
- **Open-Q #14**: bila relay re-enabled, slippage 5% vs direct 10% diff. Verify relay slippage intentional (relay tx mungkin pre-optimized).
- Bukti: 972, 1141, 1157.

### E.13 — Relay idempotencyKey solid (dead)
- `idempotencyKey: deploy:${pool}:${minBinId}:${maxBinId}:${amountY}:${amountX}` (962).
- Dedup relay order bila retry. Dead with relay.
- Solid design bila re-enabled.
- Bukti: 962.

### E.14 — Post-relay position lookup fallback risk (dead)
- `refreshed?.positions?.find(p => p.pool===pool_address && p.lower_bin===minBinId && p.upper_bin===maxBinId)` (1006-1007).
- Fallback: `|| refreshed?.positions?.find(p => p.pool===pool_address)` (1008).
- **Risk**: fallback match-by-pool-only bila multiple positions same pool. Gate-9 (executor.js:976-981) blocks dup pool → mitigated.
- Dead with relay. Solid bila re-enabled.
- Bukti: 1005-1008, executor.js:976-981 gate-9.

### E.15 — DRY_RUN bypass SOL gate correct for paper
- `if (process.env.DRY_RUN !== "true")` (executor.js:1023) — paper mode skips SOL gate.
- Allows paper deploys with empty wallet (simulasi).
- amount_y still validated ≥ minDeploy (1005-1011) — paper must respect floor.
- **Solid**: paper simulation realistic (no SOL needed) + floor enforced (size discipline).
- Bukti: executor.js:1023, 1005-1011.

### E.16 — exit-liquidity experiment fail-open solid
- `config.experiments?.exitLiquidityCheck && args.base_mint && process.env.DRY_RUN !== "true"` (1042-1046).
- `quoteSellPriceImpact` round-trip probe; `roundTripLossPct > maxPct` → reject.
- Catch (1060-1062): `exitLiquidityCheck probe failed — allowing deploy (fail-open)`.
- Skipped under DRY_RUN (paper can't probe real Jupiter).
- **Solid**: experiment default OFF, fail-open, paper-skip. Matches CLAUDE.md GRUP 16 contract.
- Bukti: 1042-1063.

### E.17 — trackPosition signal_snapshot darwin-gated solid
- `signalSnapshot = config.darwin?.enabled ? getAndClearStagedSignals(pool_address, baseMint) : null` (1012-1014, 1166-1168).
- Darwin OFF factory → null snapshot. Paper branch (832-851) pakai paperSig terpisah (paper-only signal_snapshot).
- **Solid**: darwin-gated, paper-isolated.
- Bukti: 1012-1014, 1166-1168, 832-851 paper.

### E.18 — sendTxTracked gas track fire-and-forget solid
- `trackTxGas(getConnection(), sig, action)` no await (135).
- Wide-range multi-tx → multiple gas entries per deploy (Phase 1 create + Phase 2 add).
- **Open-Q #8**: F25 gas aggregation multi-tx per deploy — verify sum utk wide-range.
- **Solid**: fire-and-forget fail-open (trackTxGas error tak block sendTxTracked return sig).
- Bukti: 133-137.

### E.19 — Cooldown gate soft-fail solid
- `isPoolOnCooldown(pool_address)` (686) → return `{success:false, error:"Pool on cooldown..."}` (688).
- `isBaseMintOnCooldown(baseMint)` (694) → return `{success:false, error:"Token on cooldown..."}` (696).
- Soft-fail (no throw) → executor return ke LLM, LLM retry pool lain.
- **Solid**: prevents re-deploy pool yang baru close OOR (F18 cooldown stamp) atau token yang sering OOR.
- Bukti: 686-697, pool-memory.js isPoolOnCooldown/isBaseMintOnCooldown (F23).

### E.20 — assertRange SDK fn fail-closed solid
- `if (!getBinArrayKeysCoverage || !getBinArrayIndexesCoverage)` (504) → throw "Cannot verify Meteora bin-array initialization risk; refusing deploy." (505).
- **Solid**: SDK fn missing → fail-closed (no deploy). Prevents silent bin-array rent charge.
- Bukti: 504-506.

## §F. Glosarium fase

- **BIN_ARRAY_FEE**: ~0.07143744 SOL, non-refundable pool rent per bin-array init. Blocked by assertRange.
- **BIN_ARRAY_BITMAP_FEE**: ~0.01180416 SOL, non-refundable pool rent for bitmap ext init. Blocked by assertRange (532-544).
- **baseFactor**: pool.lbPair.parameters.baseFactor; `baseFactor * binStep / 1e6 * 100` = fee %.
- **MIN_SAFE_BINS_BELOW**: 35, hard floor utk totalBins (config.js:35).
- **rentPerPositionSol**: config.management key, default 0. Per-position refundable rent cadangan ~0.057 SOL. User opt-in.
- **positionCreated**: wide-range flag, set true after Phase 1 create tx[0]. Triggers orphan cleanup in catch.
- **isSingleSidedSol**: `finalAmountX <= 0 && finalAmountY > 0` (739). Factory deploy mode.
- **dualSide**: `config.strategy.dualSideEnabled && isSingleSidedSol && finalAmountY > 0` (747). OFF factory.
- **wide_range**: `totalBins > 69` (893). Non-atomic 2-phase create+add. Solana inner ix 10240 byte limit.
- **assertRangeDoesNotRequireBinArrayInitialization**: pre-deploy range guard (494-545). Blocks non-refundable bin-array rent.
- **assertNoInitializeBinArrayInstructions**: instruction-level veto (547-565). Relay-only (982, DEAD).
- **getDlmmInstructionDiscriminators**: deserialize versioned/legacy tx → extract DLMM ix discriminator hex (567-585).
- **shouldUseLpAgentRelayForDeploy**: DEAD (202-204 return false). Direct SDK path always.
- **shouldUseLpAgentRelay**: close/claim relay gate (168, F10). Circuit breaker 2-fail/10m cooldown.
- **idempotencyKey**: relay deploy dedup `deploy:${pool}:${minBinId}:${maxBinId}:${amountY}:${amountX}` (962, DEAD).
- **computeDeployAmount maximize**: adaptive slots `(wallet − gas − rent×N)/N` (config.js:528-549).
- **signal_snapshot**: darwin-gated staged signals (1012-1014) OR paper-only fee/tvl stash (832-851).
- **shadow_signals**: captureShadowSignals(pool_address) (55, 1184). Always captured.
- **paper_ id**: makePaperPositionId(pool_address) synthetic id utk virtual position (809).
- **isPaperMode**: `config.experiments.paperTrading && DRY_RUN=true` (paper-trading.js F13/F32).
- **orphan position**: wide-range Phase 1 sukses + Phase 2 fail → position account on-chain untracked. Cleanup trackPosition + setPositionInstruction.
- **cooldown soft-fail**: isPoolOnCooldown/isBaseMintOnCooldown → return `{success:false}` no throw. Pool-memory.js F23.
- **trackTxGas**: gas-tracker.js background gas log, no await (135).

## §G. Cross-ref fase lain

- **F7**: gate-9/10 dup pool/base-mint (executor.js:976-994) pre-deployPosition; gate-11 amount min/max (996-1017); gate-12 SOL+rent (1019-1035); exit-liquidity experiment (1042-1063).
- **F8**: post-success notifyDeploy wiring (executor.js:797); deployPosition return shape baca result.position/pool/pool_name/bin_range/base_fee/amount_y.
- **F10**: closePosition path — position account closed → rent refund (rentPerPositionSol dikembalikan ke owner). Verify F10 close ix closes position account fully. E.1 bug mitigation via close.
- **F11**: getMyPositions post-deploy refresh — direct path `_positionsCacheAt=0` (1165) invalidate cache; relay path (1005, DEAD) force refresh.
- **F13/F32**: paper branch (797-875) — isPaperMode gate, makePaperPositionId, signal_snapshot paper-only stash, fail-open would_deploy fallback. Paper/live isolation via paper:true tag (F19 recordPerformance, F22 getModePerformance).
- **F17**: trackPosition (state.js makePositionRecord) — direct path (1169), paper (832), orphan (1250). Field shape: position,pool,strategy,bin_range,amounts,active_bin,bin_step,volatility,fee_tvl_ratio,organic_score,initial_value_usd,narrative_category,shadow_signals,signal_snapshot,entry_mcap/tvl/volume/holders.
- **F19**: signal_snapshot → recordPerformance (close path F10). Darwin staged signals getAndClearStagedSignals. Paper signal_snapshot paper-only.
- **F21**: darwin.enabled gate signal_snapshot (1012-1014, 1166-1168). Darwin OFF factory → null.
- **F26**: computeDeployAmount (config.js:528-549) maximize rent-aware; minDeployAmount() floor (config.js shared); sizingMode fixed/maximize.
- **F27**: convictionSizing re-clamp at executor top (applyConvictionSizing) — applied BEFORE gate-12 minDeploy check. conviction-low could drop below minDeploy → gate reject. Verify F27.
- **F14**: isUsableVolatility mirror (dlmm.js:682-684); base_fee candidate data dari screening.js getTopCandidates; blockedLaunchpads pre-filter.
- **F18**: mekanis exit poll — SL/trailing/OOR/low-yield tak consider rent. Rent refund only on close (F10). Cooldown stamp from F18 close (OOR repeat) → deployPosition cooldown gate (686-697).
- **F23**: pool-memory.js isPoolOnCooldown/isBaseMintOnCooldown; decision-log appendDecision deploy (1192-1213).
- **F25**: gas-tracker trackTxGas (135) — wide-range multi-tx multiple gas entries. Verify F25 aggregation.
- **F29**: preset snapshot full user-config.json copy — rentPerPositionSol rides through. Solid.
- **F31**: rentPerPositionSol full-sync 6-surface — CONFIG_MAP (380) ✓, config-schema (103) ✓. Verify formatFullConfig GRUP management + renderSettingsMenu pageForKey + SETTINGS-GUIDE + definitions desc. Open-Q #11.
- **F5**: SCREENER prompt convention amount_y — provide atau biar fallback computeDeployAmount? Open-Q #2.

## §H. Open-Q (bawa ke fase lain)

1. **[F10]** closePosition path: position account closed via Meteora SDK close ix → rent ~0.057 SOL refund ke owner. Verify F10 close ix closes position account fully (no residual). E.1 bug mitigation.
2. **[F5/F27]** SCREENER prompt convention: provide amount_y (conviction-adjusted) atau biar deployPosition fallback computeDeployAmount? Bila provide, maximize/rent-aware adaptive slots tak dipakai. Cross-F5 prompt.js + F27 convictionSizing.
3. **[F27]** convictionSizing re-clamp applied BEFORE gate-12 minDeploy check. conviction-low (−convictionSizingMaxAdjustPct%) bisa drop below minDeploy → gate reject. Verify convictionSizingMaxAdjustPct bounded so low conviction tidak selalu reject. Cross-F27.
4. **[F10/F19]** recordPerformance NOT in deployPosition. Only close (F10). F8 #5 confirmed — executor wiring only. Verify F10 close path trigger recordPerformance exact line.
5. **[F11]** getMyPositions post-deploy refresh — direct path invalidate cache (1165) + force refresh implicit via next management cycle. Relay path (1005, DEAD) explicit force. Verify F11 cache TTL consistency.
6. **[F14]** assertRange calls getBinArrayIndexesCoverage from SDK. If SDK fn signature change → throw "Cannot verify" (504-506) fail-closed. Verify F14 SDK version pin.
7. **[F25]** sendTxTracked trackTxGas fire-and-forget (135). Wide-range multi-tx → multiple gas entries per deploy. Verify F25 gas aggregation sum utk wide-range (Phase 1 + Phase 2).
8. **[F32]** paper branch fetch pool-discovery-api 24h window (822) utk entry_fee/active_tvl. Network call inside DRY_RUN. If API down → fail-open (830 catch) → fallback fee_tvl_ratio/100. Verify F32 paper metrics accuracy fallback.
9. **[F29]** rentPerPositionSol in preset snapshot: rides through full user-config.json copy. Solid. Verify F29 preset-manager applyPreset.
10. **[F8 #9 RESOLVED]** rentPerPositionSol CONFIG_MAP line 380 → `["management","rentPerPositionSol"]` flat. Gate-12 honors via `config.management.rentPerPositionSol`. Cross-ref F7 solid. CONFIRMED.
11. **[F31 verify]** rentPerPositionSol full-sync 6-surface: CONFIG_MAP (380) ✓, config-schema (103) ✓. Verify formatFullConfig GRUP management + renderSettingsMenu pageForKey + SETTINGS-GUIDE + definitions desc update_config. Cross-F31.
12. **[F18]** rent reserve NOT in mekanis exit poll. SL/trailing/OOR/low-yield don't consider rent. Rent refund only on close. If position closed via OOR + rent was 0.057, rent recovered via close ix regardless of reason. Solid. Verify F18 exit rules independent of rent.
13. **[F8 #5 RESOLVED]** recordPerformance NOT in deployPosition. F9 confirms executor wiring only (notifyDeploy). recordPerformance trigger di closePosition dlmm.js (F10). CONFIRMED.
14. **[F10 relay re-enable]** shouldUseLpAgentRelayForDeploy DEAD (return false). Bila re-enabled: verify relay return shape (1062-1084) vs executor expectation; assertNoInitializeBinArrayInstructions (982) defense-in-depth; post-relay position lookup (1005-1008) fallback match-by-pool-only risk (mitigated by gate-9); slippage 500bps vs direct 10% diff; idempotencyKey dedup. Cross-F10.
15. **[F14]** assertRange `isOverflowDefaultBinArrayBitmap` (532) covers bitmap ext. Direct path lacks instruction-level re-check (982 relay-only). Verify F14 SDK `createExtendedEmptyPosition` tidak emit init ix despite range check pass. Cross-F14/F16.
16. **[F25 gas]** sendTxTracked gas track fire-and-forget — bila trackTxGas throw async, unhandled rejection? Verify F25 gas-tracker.js internal try/catch. Cross-F25.
17. **[F11/F17]** trackPosition post-direct (1169) — bila trackPosition throw (state.json write fail), position on-chain exists tapi untracked. Catch block (1236) tangkap? TIDAK — trackPosition di try block post-tx-success, bila throw akan ke catch orphan path (1247) tapi positionCreated=false (standard) → skip orphan cleanup → position untracked. Risk: standard path trackPosition fail → position on-chain tapi untracked. Verify F11 on-chain backfill adopt. Cross-F11/F17.
18. **[F19]** signal_snapshot staged signals (darwin ON) — getAndClearStagedSignals clear after deploy. Bila deploy fail post-track (paper branch only, 832-851), signals cleared tapi position virtual. Verify F19 staged signals lifecycle. Cross-F19/F21.
19. **[F14]** volatility null OK (skip bins_below calc dari volatility) — bila SCREENER tak provide, bins_below dari config.strategy.defaultBinsBelow. Verify F14 SCREENER prompt always provide volatility. Cross-F5.
20. **[F27]** exitLiquidityCheck experiment (executor.js:1042) skip DRY_RUN — paper mode can't probe real Jupiter. Solid. Verify F27 experiment fail-open contract match CLAUDE.md GRUP 16.
