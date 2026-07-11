# Audit F11 — Positions list + in-range/OOR + rent read + /positions render
> Read-only. Bukti `file:line`. UNKNOWN kalau tak pasti. Resume: buka file ini.
> Kedalaman: ⬛ deep — alasan: `getMyPositions` 3-path (paper/RPC/Meteora API) + cache+inflight dedup; OOR detection 2-write-path (getMyPositions + updatePnlAndCheckExits) redundant idempotent; ensureDeployedAt backfill adopt untracked (F9 #17 mitigation); syncOpenPositions auto-close grace 5min; PnL dual-source mode-correct + sanity diff; price_peak/trough bin-math; rent read on-chain lamports; CLAUDE.md progress bar claim vs actual tree-style render (docs gap).
> Cross-ref: F9 (deploy trackPosition + positionCreated orphan), F10 (close-confirmation polling baca getMyPositions + cached pnl fallback), F13/F32 (getPaperPositions paper short-circuit), F17 (state.js makePositionRecord + trackPosition + ensureDeployedAt + syncOpenPositions), F18 (updatePnlAndCheckExits OOR + price_peak/trough), F25 (rent read render-only + gas-tracker via sendTxTracked), F30 (/positions Telegram command + render), F24 (pnl_pct_suspicious flag feed).

## Ringkasan eksekutif (5 baris)
1. `getMyPositions` (dlmm.js:1768-1989) 3-path: **paper** (1771-1773, `isPaperMode && !wallet_address` → `getPaperPositions` F32 synthesizes dari `getTrackedPositions(true)` paper_ ids) OR **RPC primary** (1798-1811, `config.pnl.source==="rpc"` → `computePositions` pnl.js, fail-through ke Meteora API) OR **Meteora portfolio API fallback** (1813-1974, `dlmm.datapi.meteora.ag/portfolio/open` + `fetchDlmmPnlForPool` parallel bin data). Cache `_positionsCache` TTL 5menit (1287/1782) + `_positionsInflight` dedup concurrent (1291/1785/1984). `wallet_address` external bypass cache (useLocalWallet=false).
2. **OOR detection 2-write-path redundant idempotent**: getMyPositions (1837-1840) baca `pool.outOfRange`/`pool.positionsOutOfRange?.includes` → `markOutOfRange`/`markInRange` (state.js:209-232). updatePnlAndCheckExits (state.js:538-546) juga update OOR dari `in_range` field. Both idempotent (`if (!pos.out_of_range_since)` set / `if (pos.out_of_range_since)` clear). `out_of_range_since` ISO timestamp (214). `minutesOutOfRange` (238-244) = floor((now−since)/60000). OOR exit rule (574-582): `minutesOOR >= outOfRangeWaitMinutes` → OUT_OF_RANGE action (F18).
3. **ensureDeployedAt backfill** (state.js:172-204): on-chain position ditemukan tanpa tracked record → minimal backfill record `makePositionRecord` + `deployed_at = first-seen now` + `active_setup/profile` stamp CURRENT racikan (assumption, note "Backfilled from on-chain — deploy metadata unknown"). Solid adopt untracked (F9 #17 mitigation — on-chain backfill). syncOpenPositions (672-696): tracked position not in activeSet + not closed + past `SYNC_GRACE_MS=5min` → auto-close "missing from on-chain data". Risk: RPC lag false-positive auto-close; mitigasi 5min grace.
4. **PnL dual-source mode-correct**: `lpData` (LPAgent, REMOVED — `lpAgentByPosition = {}` 1828) OR `binData` (Meteora PnL API `fetchDlmmPnlForPool`). solMode ? SOL fields (`pnlSol`, `valueNative`, `amountSol`) : USD fields (`pnlUsd`, `value`, `usd`). Always-USD `*_true_usd` fields utk internal accounting + lesson recording (F19). `pnlSanityMaxDiffPct` (1868, default 5): `|reported − derived| > 5%` → `pnl_pct_suspicious` flag. `pnl_pct_derived` = `deriveOpenPnlPct`/`deriveLpAgentPnlPct` independent calc. Anti bad API data.
5. **/positions render tree-style, NO progress bar** (CLAUDE.md gap): index.js:3254-3265 force getMyPositions + `getPositionsRentSol` (on-chain lamports batched ≤100, fallback `POSITION_RENT_ESTIMATE_SOL=0.057` utk synthetic/paper/unreadable) + `getSolMarketRegime` SOL price → `views/positions.js buildView` → `sendHTML`. Render tree-style (├/└) per position: pair · state IN/OOR+menit · PnL · Value+fees · Age+bins · fee density · held rent. Footer total held + hint. CLAUDE.md claims `[████████░░░░░░░░░░░░] 40% (no bin numbers, no arrows)` — NOT FOUND anywhere. `/pool <n>` detail (3267-3295) → `views/pool.js` + `buildRangeEfficiencyLines` "Range efficiency" text lines (comment says "Active-bin bar" tapi text lines, no unicode bar).

## Progress
- [x] Baca dlmm.js 1768-1989 (getMyPositions full)
- [x] Baca dlmm.js 2003-2034 (getPositionsRentSol)
- [x] Baca state.js 160-244 (ensureDeployedAt + markInRange/markOutOfRange + minutesOutOfRange + recordClaim)
- [x] Baca state.js 510-599 (updatePnlAndCheckExits price_peak/trough + OOR + exit rules)
- [x] Baca state.js 670-696 (syncOpenPositions)
- [x] Baca index.js 3254-3295 (/positions + /pool handlers)
- [x] Baca views/positions.js (buildView + telegram render)
- [x] Grep progress bar `████/░░░` — NOT FOUND (CLAUDE.md gap)
- [x] Tulis §A-§H
- [x] §0 Cara Kerja (Bahasa Awam) — retro-fit 2026-07-07

---

## §0. Cara Kerja (Bahasa Awam)

**Analogi** (dua sudut pandang sehari-hari)
- *Manajer gudang cek stok harian*: tiap pagi (cron 10m / poll 3s) manajer buka buku inventaris + cross-check ke gudang on-chain (Solana). Yang ilang dari gudang tapi belum sempat ditandai → "missing from on-chain" → auto-close setelah 5 menit grace (cegah ghost posisi). Yang muncul di gudang tapi tak ada di buku → "backfill" → bikin record baru dengan catatan "Backfilled from on-chain — metadata unknown". Tiap item ditandai IN-range (masih jualan) atau OOR (harga kabur, fee berhenti).
- *Sensor pintar yang cross-check 2 sumber*: stok di-baca dari 2 sumber (RPC langsung vs Meteora Portfolio API). Kalau dua sumber beda lebih dari 5% → flag `pnl_pct_suspicious` (sensorTak dipercaya, jangan close pake angka PnL). PnL di SOL mode (hitung SOL) atau USD mode (hitung USD) — selalu ada field `*_true_usd` utk accounting internal + lessons (F19).

**Di bot, ini = `getMyPositions` dari `tools/dlmm.js:1768-1989` + `getPositionsRentSol` (2003) + `markInRange/markOutOfRange` (state.js:209-232) + `ensureDeployedAt` (state.js:172-204) + `syncOpenPositions` (state.js:672-696)**: baca posisi live on-chain + track OOR/time + cross-check tracked vs active.

**Posisi fase ini di alur bot**
F11 = jendela inventaris. Dipanggil banyak tempat setiap saat: F2 (runManagementCycle) tiap cron + poller 3s, F10 (close-confirmation polling), F1 (`/positions` Telegram command), F2 PnL poller. Output → `updatePnlAndCheckExits` (F18) cek mekanis exits. Lapisan 3 + 4 (Mesin + Belajar/Pengukuran). Tanpa F11, bot tak tahu posisi masih buka / masih IN-range / sudah OOR berapa lama → tak bisa trigger exit mekanis (F3) → modal bisa gantung di IL.

**Langkah kerja F11 — `getMyPositions({force, silent, wallet_address})`**
1. Cek mode + cache:
   - **Paper** (`isPaperMode && !wallet_address`) → `getPaperPositions` F32 synthesizes dari `getTrackedPositions(true)` paper_ ids. Skip on-chain.
   - **RPC primary** (`config.pnl.source==="rpc"`) → `computePositions` (pnl.js) → fail-through ke Meteora API bila RPC error.
   - **Meteora portfolio API fallback** → `dlmm.datapi.meteora.ag/portfolio/open` + `fetchDlmmPnlForPool` parallel bin data.
2. Cache + dedup: `_positionsCache` TTL 5 menit (cuma kena bila `force:false`) + `_positionsInflight` dedup concurrent (bila 2 caller panggil bareng → 1 x jalan, 2 x await sama Promise). External `wallet_address` bypass cache (`useLocalWallet=false`).
3. Untuk tiap posisi on-chain:
   a. Baca `pool.outOfRange` / `pool.positionsOutOfRange?.includes`.
   b. `markOutOfRange` atau `markInRange` (state.js:209-232). Idempotent (`if (!pos.out_of_range_since)` set / `if (pos.out_of_range_since)` clear). `out_of_range_since` ISO timestamp.
   c. `ensureDeployedAt` backfill: bila posisi on-chain tapi tracked record tak ada → bikin minimal record + `deployed_at = now` + `active_setup/profile` stamp CURRENT racikan + note "Backfilled from on-chain — deploy metadata unknown". Mitigasi F9 #17 (orphan / untracked).
4. `fetchDlmmPnlForPool` per pool (parallel) → hitung PnL dual-source:
   - `solMode ? pnlSol/valueNative/amountSol : pnlUsd/value/usd`.
   - Always-USD fields `*_true_usd` utk internal accounting + lesson.
   - `pnlSanityMaxDiffPct` (default 5%): `|reported − derived| > 5%` → flag `pnl_pct_suspicious`.
   - `pnl_pct_derived` = `deriveOpenPnlPct` / `deriveLpAgentPnlPct` independent calc.
5. Return `{positions, total_positions, rent_sol_total, ...}`.

**OOR detection 2-write-path** — getMyPositions (1837-1840) + updatePnlAndCheckExits (state.js:538-546). Redundant idempotent. `minutesOutOfRange` (state.js:238-244) = `floor((now − since) / 60000)`. OOR exit rule (F18:574-582): `minutesOOR >= outOfRangeWaitMinutes` → action `OUT_OF_RANGE`.

**`syncOpenPositions` (state.js:672-696)** — tracked record tak in activeSet (on-chain current) + not closed + past `SYNC_GRACE_MS=5min` → auto-close "missing from on-chain data". Risk: RPC lag → false-positive auto-close. Mitigasi: 5min grace.

**`price_peak/trough bin-math` (state.js)** — tiap poll 3s update `price_peak_pct` / `price_trough_pct` dari active_bin movement (relative ke entry_bin). Dipakai F24 report "raw price excursion" + SL tuning.

**`/positions` Telegram render (index.js:3254-3265)** — force `getMyPositions` + `getPositionsRentSol` (on-chain lamports batched ≤100, fallback `POSITION_RENT_ESTIMATE_SOL=0.057` utk synthetic/paper/unreadable) + `getSolMarketRegime` SOL price → `views/positions.js buildView` → `sendHTML`. Render tree-style (├/└) per posisi: pair · state IN/OOR+menit · PnL · Value+fees · Age+bins · fee density · held rent. Footer total held + hint. CLAUDE.md bilang ada progress bar `[████░░░░] 40%` — gap docs (NOT FOUND anywhere). Tree-style render sebenarnya.

**Output F11**: 
- Posisi list (paper/RPC/Meteora API), masing-masing dengan PnL, IN/OOR status, rent, dll.
- Backfill record utk untracked positions.
- Auto-close utk "missing from on-chain" (5min grace).
- PnL dual-source + sanity flag `pnl_pct_suspicious`.
- `price_peak_pct`/`price_trough_pct` per poll.

**Bug docs gap (#5)** — CLAUDE.md klaim progress bar `[████░░░░] 40% (no bin numbers, no arrows)` di `/positions`, tapi render SEBENARNYA tree-style (├/└) pakai text lines. Tak ada unicode bar di kode. Docs misleading → user kira bakal lihat progress bar.

**Kalau F11 rusak / diskip**
- Bot tak tahu posisi masih buka (getMyPositions mati) → tak ada cross-check → tracked vs on-chain bisa desinkron.
- OOR detection mati → modal di pool tapi harga kabur tak terdeteksi → fee berhenti, IL makin dalam, tak trigger close.
- `pnl_pct_suspicious` mati → bad API data diikutin → SL/TP bisa trigger palsu.
- `syncOpenPositions` mati → ghost position (tracked tapi ilang on-chain) gantung di state.json → max-pos bisa kepenuhan virtual.
- Rent read mati → `/positions` tak tampilkan held → user tak sadar rent 0.057 SOL per posisi.
- F11 = mata bot. Tanpa ini, semua cron/poll jalan tapi buta.

**Istilah yang muncul di fase ini**
- **`getMyPositions`** — baca posisi live on-chain. 3-path: paper / RPC primary / Meteora API fallback.
- **`_positionsCache`** — TTL 5 menit. Cache selalu skipped bila `force:true` (safety check max-pos tetap FRESH di F7).
- **`_positionsInflight`** — dedup concurrent: bila 2 caller bareng → 1 jalan, 2 await Promise sama.
- **`markInRange` / `markOutOfRange`** — state.js update `out_of_range_since`. Idempotent. Dipanggil dari getMyPositions + F18.
- **`out_of_range_since`** — ISO timestamp kapan harga kabur dari range. Lalu `minutesOutOfRange` dihitung → trigger rule 4 OOR-time (F3).
- **`ensureDeployedAt`** — backfill record utk posisi on-chain yang tak ada di state.json. Stamp `deployed_at = now`, `active_setup` racikan current, note "Backfilled from on-chain — deploy metadata unknown".
- **`syncOpenPositions`** — auto-close tracked position yang missing dari on-chain setelah 5min grace. Cegah ghost position.
- **PnL dual-source** — `lpData` (REMOVED, kosong) vs `binData` (Meteora PnL API). `pnlSanityMaxDiffPct` 5% → flag `pnl_pct_suspicious` bila beda source berbeda terlalu jauh.
- **`*_true_usd` fields** — always-USD fields utk internal accounting + lesson recording (F19), walaupun mode display USD/SOL.
- **`deriveOpenPnlPct`** — independent calc PnL % utk cek sanity vs reported angka API.
- **`getPositionsRentSol`** — baca lamports on-chain per position (≤100 batched). Fallback `POSITION_RENT_ESTIMATE_SOL=0.057` utk paper/unreadable.
- **tree-style render** — `/positions` Telegram tampil tree (├/└) text lines per posisi: pair, state, PnL, value+fees, age+bins, fee density, held rent. CLAUDE.md docs gap bilang progress bar unicode — tak ada di kode.
- **price_peak_pct / price_trough_pct** — track per poll dari active_bin movement. Dipakai F24 report "raw price excursion" + SL tuning.

*Lewati §0 kalau sudah paham. Isi teknis mulai §A.*

---

## §A. Peta block fase ini (file:line → peran)

| file:line | simbol | peran |
|---|---|---|
| dlmm.js:1768-1773 | paper short-circuit | `isPaperMode && !wallet_address` → getPaperPositions (F32) |
| dlmm.js:1774-1779 | wallet_address parse | invalid → return empty + error |
| dlmm.js:1781-1785 | cache + inflight dedup | TTL 5menit + concurrent dedup |
| dlmm.js:1787-1792 | walletAddress resolve | walletOverride or getWallet |
| dlmm.js:1794-1811 | RPC primary path | `config.pnl.source==="rpc"` → computePositions (pnl.js), fail-through |
| dlmm.js:1803 | syncOpenPositions | state.js sync tracked vs on-chain |
| dlmm.js:1804-1805 | cache store | _positionsCache + _positionsCacheAt |
| dlmm.js:1813-1818 | Meteora portfolio API | `dlmm.datapi.meteora.ag/portfolio/open` |
| dlmm.js:1820-1827 | bin data parallel fetch | fetchDlmmPnlForPool per pool, binDataByPool map |
| dlmm.js:1828 | lpAgentByPosition empty | LPAgent removed, Meteora binData only |
| dlmm.js:1830-1961 | positions loop | per position build field object |
| dlmm.js:1835 | ensureDeployedAt | state.js backfill deployed_at + untracked adopt |
| dlmm.js:1836 | getTrackedPosition | state.js lookup |
| dlmm.js:1837 | isOOR detect | `pool.outOfRange` or `pool.positionsOutOfRange?.includes` |
| dlmm.js:1839-1840 | markOutOfRange/markInRange | state.js OOR stamp (write path 1) |
| dlmm.js:1843-1849 | binData fallback | lowerBin/upperBin/activeBin dari binData or tracked.bin_range |
| dlmm.js:1852-1854 | ageFromState | dari tracked.deployed_at |
| dlmm.js:1855-1864 | reportedPnlPct + derivedPnlPct | mode-correct pct + independent derived |
| dlmm.js:1865-1871 | pnlPctDiff + suspicious | sanity check vs pnlSanityMaxDiffPct 5% |
| dlmm.js:1873-1959 | position field object | 25 fields (position/pool/pair/base_mint/bins/in_range/fees/value/pnl/pct/age/OOR/instruction) |
| dlmm.js:1881 | in_range field | `binData ? !binData.isOutOfRange : !isOOR` |
| dlmm.js:1909-1913 | total_value_true_usd | always-USD field utk internal accounting |
| dlmm.js:1923-1927 | collected_fees_true_usd | always-USD |
| dlmm.js:1937-1941 | pnl_true_usd | always-USD |
| dlmm.js:1948-1952 | unclaimed_fees_true_usd | always-USD |
| dlmm.js:1953-1955 | fee_per_tvl_24h | dari binData.feePerTvl24h |
| dlmm.js:1956 | age_minutes | binData.createdAt or ageFromState |
| dlmm.js:1957 | minutes_out_of_range | state.js minutesOutOfRange |
| dlmm.js:1958 | instruction | tracked.instruction (F9 orphan "incomplete deploy") |
| dlmm.js:1963-1974 | result + cache store | {wallet, total_positions, positions, source:"meteora"} |
| dlmm.js:1975-1980 | catch + finally | error return + _positionsInflight clear |
| dlmm.js:1983-1988 | inflight dispatch | _positionsInflight = loadPositions() |
| dlmm.js:1994 | POSITION_RENT_ESTIMATE_SOL | 0.057 const, refundable on close |
| dlmm.js:2003-2034 | getPositionsRentSol | on-chain lamports read batched ≤100, fallback est |
| dlmm.js:2008-2013 | synthetic id fallback | paper_ or invalid → est 0.057 |
| dlmm.js:2016-2032 | batched getMultipleAccountsInfo | chunk ≤100, lamports → SOL, est fallback |
| state.js:172-204 | ensureDeployedAt | backfill deployed_at + untracked adopt |
| state.js:177-184 | known position missing deployed_at | stamp first-seen |
| state.js:186-203 | untracked backfill | makePositionRecord minimal + active_setup/profile current racikan + note |
| state.js:209-218 | markOutOfRange | set out_of_range_since on first detect (idempotent) |
| state.js:223-232 | markInRange | clear out_of_range_since (idempotent) |
| state.js:238-244 | minutesOutOfRange | floor((now−since)/60000) |
| state.js:249-257 | recordClaim | stamp last_claim_at + total_fees_claimed_usd accumulate |
| state.js:273-283 | recordClose | stamp closed + closed_at + note + pushEvent |
| state.js:513-528 | price_peak/trough bin-math | `(pow(1+step/1e4, binNow−binEntry) − 1)·100`, no extra API |
| state.js:530-535 | trailing TP activate | peak_pnl_pct >= trailingTriggerPct → trailing_active=true |
| state.js:537-546 | OOR update (write path 2) | in_range false → set; true → clear (idempotent, redundant vs getMyPositions) |
| state.js:550-556 | STOP_LOSS rule | currentPnlPct <= stopLossPct |
| state.js:558-571 | TRAILING_TP rule | dropFromPeak >= trailingDropPct, needs_confirmation |
| state.js:573-582 | OUT_OF_RANGE rule | minutesOOR >= outOfRangeWaitMinutes |
| state.js:584-597 | LOW_YIELD rule | fee_per_tvl_24h < minFeePerTvl24h + age >= minAgeBeforeYieldCheck |
| state.js:670-696 | syncOpenPositions | tracked not in activeSet + past 5min grace → auto-close |
| state.js:672 | SYNC_GRACE_MS | 5min, newly deployed may not be indexed |
| index.js:3254-3265 | /positions handler | force getMyPositions + rentMap + solPrice → views/positions.js |
| index.js:3259 | getPositionsRentSol | rent read |
| index.js:3260 | getSolMarketRegime | SOL price utk dual-unit |
| index.js:3261 | positionsView.buildView | view-model netral |
| index.js:3262 | sendHTML(render(vm,"telegram")) | HTML render |
| index.js:3267-3295 | /pool <n> handler | per-position detail → views/pool.js + buildRangeEfficiencyLines |
| views/positions.js:29-72 | buildView | view-model: pair/state/value/pnl/fees/age/bins/feeDensity/heldSol |
| views/positions.js:33-41 | rent aggregation | totalHeldSol + anyHeldEst |
| views/positions.js:43-53 | bins + feeDensity | upper−lower+1; (collected+unclaimed)/value × 100 |
| views/positions.js:55-69 | item fields | inRange/oorMin/value/pnlVal/pnlPct/fees/ageMin/bins/feeDensityPct/heldSol/heldEst |
| views/positions.js:75-104 | telegram render | tree-style, ICON, fmtBothFromMode dual-unit |
| views/positions.js:82-96 | per-item tree | state line + PnL/Value+fees/Age+bins/fee/held |
| views/positions.js:99 | footer total held | fmtSol + "refund saat close" |
| views/positions.js:102 | hint | /close /pool /set (escaped) |

## §B. Alur getMyPositions + /positions render (ASCII)

```
Trigger: management cron / screener freed-slot / /positions Telegram / close-confirmation polling / claimFees
  │
  ├─ getMyPositions({force, silent, wallet_address}) dlmm.js:1768
  │   ├─ isPaperMode && !wallet_address → getPaperPositions (F32)         [:1771-1773]
  │   ├─ wallet_address parse (invalid → empty)                            [:1774-1779]
  │   ├─ useLocalWallet ? cache TTL 5menit check : skip cache             [:1781-1785]
  │   │   └─ _positionsInflight dedup (concurrent calls share promise)    [:1785, 1984]
  │   ├─ walletAddress = walletOverride or getWallet                       [:1787-1792]
  │   │
  │   ├─ loadPositions()                                                   [:1794]
  │   │   ├─ [PRIMARY] config.pnl.source==="rpc" → computePositions (pnl.js) [:1798-1811]
  │   │   │   ├─ syncOpenPositions(rpcResult.positions.map position)       [:1803]
  │   │   │   ├─ _positionsCache = rpcResult + _positionsCacheAt = now     [:1804-1805]
  │   │   │   └─ fail → fall-through ke Meteora API                        [:1808-1810]
  │   │   │
  │   │   ├─ [FALLBACK] Meteora portfolio API                              [:1813-1974]
  │   │   │   ├─ fetch dlmm.datapi.meteora.ag/portfolio/open               [:1815-1818]
  │   │   │   ├─ pools = portfolio.pools                                   [:1820]
  │   │   │   ├─ binDataByPool = Promise.all fetchDlmmPnlForPool per pool  [:1826-1827]
  │   │   │   ├─ lpAgentByPosition = {} (LPAgent removed)                  [:1828]
  │   │   │   ├─ FOR each pool, each positionAddress:
  │   │   │   │   ├─ ensureDeployedAt (backfill deployed_at / adopt untracked) [:1835]
  │   │   │   │   ├─ getTrackedPosition                                    [:1836]
  │   │   │   │   ├─ isOOR = pool.outOfRange or positionsOutOfRange.includes [:1837]
  │   │   │   │   ├─ markOutOfRange/markInRange (write path 1, idempotent) [:1839-1840]
  │   │   │   │   ├─ binData fallback lowerBin/upperBin/activeBin          [:1843-1849]
  │   │   │   │   ├─ ageFromState dari tracked.deployed_at                 [:1852-1854]
  │   │   │   │   ├─ reportedPnlPct (mode-correct) + derivedPnlPct (independent) [:1855-1864]
  │   │   │   │   ├─ pnlPctDiff + suspicious (sanity 5%)                  [:1865-1871]
  │   │   │   │   └─ positions.push({ 25 fields })                        [:1873-1959]
  │   │   │   ├─ result = {wallet, total_positions, positions, source:"meteora"} [:1963-1968]
  │   │   │   ├─ syncOpenPositions + _positionsCache store                 [:1970-1973]
  │   │   │   └─ return result
  │   │   ├─ catch → {wallet, 0, [], error}                                [:1975-1977]
  │   │   └─ finally → _positionsInflight = null                           [:1978-1980]
  │   │
  │   └─ useLocalWallet ? _positionsInflight = loadPositions() : loadPositions() [:1983-1988]
  │
  ├─ [consumer] /positions Telegram (index.js:3254)
  │   ├─ getMyPositions({force:true})
  │   ├─ getPositionsRentSol(positions.map position) → rentMap             [:3259]
  │   ├─ getSolMarketRegime → solPrice                                     [:3260]
  │   ├─ positionsView.buildView(positions, config, rentMap, solPrice)     [:3261]
  │   └─ sendHTML(render(vm, "telegram"))                                  [:3262]
  │
  └─ [consumer] management cron (index.js runManagementCycle)
      ├─ livePositions = await getMyPositions                              [:483-486]
      ├─ positions.map → updatePnlAndCheckExits (state.js F18)
      │   ├─ price_peak/trough bin-math (513-528)
      │   ├─ trailing TP activate (530-535)
      │   ├─ OOR update (write path 2, 538-546) — redundant vs getMyPositions
      │   └─ exit rules: STOP_LOSS / TRAILING_TP / OUT_OF_RANGE / LOW_YIELD
      └─ exit action → closePosition (F10) bila rule trigger
```

## §C. Sinkron: siapa-panggil-siapa

| Pemanggil (file:line) | Dipanggil (file:line) | Trigger | Data lewat | Fail-mode |
|---|---|---|---|---|
| index.js:3256 / 486 / 3271 / F10:2265,2522 | dlmm.js:1768 getMyPositions | /positions, cron, /pool, close-confirm | {force, silent, wallet_address} | catch return {error} |
| dlmm.js:1772 | paper-trading.js getPaperPositions (F32) | paper mode | {silent} | synthesize dari getTrackedPositions(true) |
| dlmm.js:1801 | pnl.js computePositions | RPC primary | walletAddress | fail-through ke Meteora API |
| dlmm.js:1803/1970 | state.js syncOpenPositions | post-load | positions.map(position) | auto-close missing |
| dlmm.js:1815 | HTTP fetch dlmm.datapi.meteora.ag | Meteora fallback | portfolioUrl | throw → catch |
| dlmm.js:1826 | pnl.js fetchDlmmPnlForPool | bin data | poolAddress, walletAddress | binDataByPool null |
| dlmm.js:1835 | state.js ensureDeployedAt | per position | {pool, pool_name} | backfill or stamp |
| dlmm.js:1836 | state.js getTrackedPosition | per position | position_address | null bila untracked |
| dlmm.js:1839-1840 | state.js markOutOfRange/markInRange | OOR detect | position_address | idempotent, no-op bila state sama |
| dlmm.js:1957 | state.js minutesOutOfRange | field build | position_address | 0 bila in range |
| dlmm.js:2003 | RPC getMultipleAccountsInfo | rent read | batched ≤100 keys | fallback est 0.057 |
| state.js:538-546 | (internal) OOR update | updatePnlAndCheckExits | in_range field | idempotent (redundant vs getMyPositions) |
| state.js:513-528 | (internal) price_peak/trough | updatePnlAndCheckExits | binNow, binEntry, bin_step | no-op bila non-finite |
| index.js:3259 | dlmm.js:2003 getPositionsRentSol | /positions | positions.map position | .catch(()=>({})) |
| index.js:3260 | wallet.js getSolMarketRegime | /positions | — | ?.usdPrice || null |
| index.js:3261 | views/positions.js buildView | /positions | positions, config, rentMap, solPrice | view-model netral |
| index.js:3262 | views/render.js render + sendHTML | /positions | vm, "telegram" | HTML output |

## §D. Logika kunci per fungsi

### `getMyPositions` (dlmm.js:1768-1989)
- Apa: fetch semua open positions utk wallet, dgn PnL + fees + bin + OOR state.
- Kapan dipicu: management cron (index.js:486), /positions (3256), /pool (3271), close-confirmation polling (F10:2265,2522), screener freed-slot.
- Output: `{wallet, total_positions, positions[], source, error?}`. Position 25 fields.
- Sinkron: state.js ensureDeployedAt + getTrackedPosition + markInRange/markOutOfRange + syncOpenPositions + minutesOutOfRange; pnl.js computePositions/fetchDlmmPnlForPool; RPC getMultipleAccountsInfo (rent); HTTP dlmm.datapi.meteora.ag.
- Fail-mode: paper short-circuit; RPC fail → Meteora API fallback; Meteora API fail → catch {error}; cache hit skip fetch; inflight dedup concurrent.
- Bukti: 1768-1989.

### `ensureDeployedAt` (state.js:172-204)
- Apa: pastikan on-chain position punya persistent deployed_at; backfill untracked.
- Kapan dipicu: getMyPositions per position (1835).
- Output: void; side-effect: stamp deployed_at or create minimal backfill record.
- Sinkron: makePositionRecord; config.activeSetup/profile (current racikan stamp).
- Fail-mode: known position w/ deployed_at → no-op; known missing → stamp; untracked → backfill record + note.
- Bukti: 172-204.
- **Solid adopt untracked** (F9 #17 mitigation): on-chain position ditemukan tanpa tracked record → minimal backfill, management loop adopts. active_setup/profile stamp CURRENT racikan (assumption, note honest).

### `markOutOfRange` / `markInRange` (state.js:209-232)
- Apa: set/clear out_of_range_since timestamp.
- Kapan dipicu: getMyPositions (1839-1840) write path 1; updatePnlAndCheckExits (538-546) write path 2.
- Output: void; idempotent.
- Fail-mode: position not tracked → no-op (pos null return).
- Bukti: 209-232, 538-546.
- **Redundant 2-write-path**: getMyPositions baca portfolio API OOR flag, updatePnlAndCheckExits baca in_range field (from getMyPositions output). Both idempotent. Solid but redundant.

### `minutesOutOfRange` (state.js:238-244)
- Apa: hitung menit OOR dari out_of_range_since.
- Output: integer minutes; 0 bila in range.
- Bukti: 238-244. Dipakai getMyPositions field (1957) + OOR exit rule (574-582).

### `syncOpenPositions` (state.js:672-696)
- Apa: sinkronisasi tracked positions vs on-chain active set; auto-close missing.
- Kapan dipicu: getMyPositions post-load (1803, 1970).
- Output: void; side-effect: mark closed utk tracked not in activeSet + past grace.
- Fail-mode: closed position skip; in activeSet skip; within SYNC_GRACE_MS 5min skip; else auto-close "missing from on-chain data".
- Bukti: 672-696.
- **Risk**: RPC lag → position not indexed → false-positive auto-close. Mitigasi: 5min grace (SYNC_GRACE_MS). Newly deployed may not be indexed.

### `getPositionsRentSol` (dlmm.js:2003-2034)
- Apa: read held SOL (rent-exempt) per position account, render-only.
- Kapan dipicu: /positions (index.js:3259), /pool (3275).
- Output: `{[position]: {sol, estimated}}`.
- Sinkron: RPC getMultipleAccountsInfo batched ≤100; POSITION_RENT_ESTIMATE_SOL 0.057 fallback.
- Fail-mode: synthetic id (paper_) or invalid → est 0.057; account null → est; RPC fail → all est.
- Bukti: 2003-2034, 1994 const.
- **Render-only**: never touches deploy/close logic. Refundable on close (F10 E.3).

### `updatePnlAndCheckExits` price_peak/trough (state.js:513-528)
- Apa: track raw price excursion vs entry via bin movement.
- Formula: `priceMovePct = (pow(1 + step/1e4, binNow − binEntry) − 1) × 100`.
- Output: update pos.price_peak_pct (max) / pos.price_trough_pct (min).
- Sinkron: binNow dari positionData.active_bin (getMyPositions); binEntry dari pos.active_bin_at_deploy or bin_range.active; pos.bin_step.
- Fail-mode: non-finite binNow/binEntry/bin_step → skip (no update).
- Bukti: 513-528.
- **No extra API call** — bin = exact price measure in DLMM (each bin = bin_step/10000 price step).

### /positions render (index.js:3254 + views/positions.js)
- Apa: render open positions list ke Telegram HTML.
- Output: tree-style HTML (NOT progress bar).
- Sinkron: getMyPositions force, getPositionsRentSol, getSolMarketRegime, views/positions.js buildView + telegram.
- Fail-mode: total 0 → "No open positions"; error → systemView.renderError.
- Bukti: 3254-3265, views/positions.js.
- **CLAUDE.md gap**: claims progress bar `[████████░░░░░░░░░░░░] 40%` — NOT FOUND. Actual tree-style.

## §E. Temuan: bug / gap / kontrak-kunci / fail-open tak-terpenuhi

### E.1 — CLAUDE.md progress bar claim vs actual tree-style (docs gap)
- CLAUDE.md:133-134: "Progress bar format: `[████████░░░░░░░░░░░░] 40%` (no bin numbers, no arrows)".
- Grep `████/░░░/progress/bar` across views/*.js + index.js: NOT FOUND.
- Actual render (views/positions.js:75-104 telegram): tree-style (├/└) per position. Pair · state IN/OOR+menit · PnL · Value+fees · Age+bins · fee density · held rent. Footer total held + hint.
- views/pool.js comment (line 6): "Active-bin bar 'N dari bawah/ke atas'" — text lines, no unicode bar.
- **Docs vs code mismatch**: CLAUDE.md outdated/incorrect. Either docs fix or code add progress bar. Open-Q #1.
- Bukti: CLAUDE.md:133-134, views/positions.js:75-104, views/pool.js:6.

### E.2 — OOR 2-write-path redundant idempotent (solid)
- Write path 1: getMyPositions (1839-1840) baca portfolio API `pool.outOfRange`/`pool.positionsOutOfRange?.includes` → markOutOfRange/markInRange.
- Write path 2: updatePnlAndCheckExits (538-546) baca `in_range` field (from getMyPositions output) → set/clear out_of_range_since.
- Both idempotent: `if (!pos.out_of_range_since)` set / `if (pos.out_of_range_since)` clear. No double-stamp.
- **Solid**: redundant but safe. getMyPositions called first (caches), updatePnlAndCheckExits reads cached in_range. State consistent.
- Bukti: 1839-1840, 538-546, 209-232.

### E.3 — ensureDeployedAt backfill adopt untracked solid (F9 #17 mitigation)
- On-chain position ditemukan tanpa tracked record (F9 #17 risk: standard path trackPosition fail or position adopted externally) → ensureDeployedAt (1835) create minimal backfill record.
- Backfill: makePositionRecord minimal + deployed_at = first-seen + active_setup/profile stamp CURRENT racikan + note "Backfilled from on-chain — deploy metadata unknown".
- **Solid adopt**: management loop sees backfilled position, can close via F10. F9 #17 risk mitigated.
- **Assumption honest**: active_setup/profile = CURRENT racikan (not real deploy-time, unknown). Note makes it queryable/excludable later.
- Bukti: 172-204, 1835.

### E.4 — syncOpenPositions auto-close RPC-lag risk
- Tracked position not in activeSet + not closed + past SYNC_GRACE_MS 5min → auto-close "missing from on-chain data" (688-692).
- **Risk**: RPC persistently lag → position not indexed → false-positive auto-close. State.json marks closed, but position actually still open on-chain.
- **Mitigasi**: 5min grace (SYNC_GRACE_MS=5×60_000). Newly deployed may not be indexed.
- **Impact**: bila false-positive auto-close, management loop stops tracking. Next getMyPositions re-discovers (ensureDeployedAt backfill) → re-adopt. Cycle: auto-close → backfill → auto-close. Solid self-healing tapi state churn.
- Bukti: 670-696.

### E.5 — PnL dual-source mode-correct solid
- lpData (LPAgent) REMOVED — `lpAgentByPosition = {}` (1828). binData (Meteora PnL API) only.
- solMode ? SOL fields (`pnlSol`, `valueNative`, `amountSol`) : USD fields (`pnlUsd`, `value`, `usd`).
- Always-USD `*_true_usd` fields (1909-1952): total_value_true_usd, collected_fees_true_usd, pnl_true_usd, unclaimed_fees_true_usd. Utk internal accounting + lesson recording (F19 recordPerformance baca true_usd utk canonical).
- **Solid**: mode-correct display + always-USD canonical. F10 cached pnl fallback reads true_usd.
- Bukti: 1828, 1881-1952, F10:2615-2618.

### E.6 — pnlSanityMaxDiffPct anti-bad-API solid
- `reportedPnlPct` (from API) vs `derivedPnlPct` (independent calc via deriveOpenPnlPct/deriveLpAgentPnlPct).
- `pnlPctDiff = |reported − derived|`; `pnlPctSuspicious = diff > (pnlSanityMaxDiffPct ?? 5)` (1865-1871).
- `pnl_pct_suspicious` flag → updatePnlAndCheckExits (F18) skip STOP_LOSS/TRAILING_TP bila suspicious (state.js:551,559 `!pnl_pct_suspicious` guard).
- **Solid**: prevents exit rule trigger on bad API data. Low-yield rule NOT gated (587-597 no suspicious check) — fee_per_tvl_24h independent. Open-Q #2.
- Bukti: 1865-1871, state.js:551,559.

### E.7 — price_peak/trough bin-math no-API solid
- `priceMovePct = (pow(1 + step/1e4, binNow − binEntry) − 1) × 100` (519).
- Bin = exact price measure in DLMM (each bin = bin_step/10000 price step). No extra API call, no recheck machinery.
- Track peak (max) + trough (min) per poll. Stored pos.price_peak_pct/price_trough_pct.
- **Solid**: raw price excursion vs entry. Dipakai recordPerformance (F19) + reports MAE (F24).
- Bukti: 513-528, F9:2365-2368 passing ke recordPerformance.

### E.8 — cache + inflight dedup solid
- `_positionsCache` + `_positionsCacheAt` TTL 5menit (POSITIONS_CACHE_TTL=5×60_000, 1287).
- `_positionsInflight` (1291) dedup concurrent: `if (useLocalWallet && _positionsInflight) return _positionsInflight` (1785). Set at 1984 `loadPositions()` return.
- `force:true` bypass cache (1782 `!force &&` guard).
- **Solid**: prevents concurrent fetches (race condition). wallet_address external bypass cache (useLocalWallet=false).
- Bukti: 1287, 1781-1785, 1983-1988.

### E.9 — getPositionsRentSol render-only solid
- On-chain lamports read batched ≤100 (2018-2022), fallback POSITION_RENT_ESTIMATE_SOL 0.057 utk synthetic/paper/unreadable (2012, 2027, 2031).
- Render-only: views/positions.js heldSol + totalHeldSol footer (34-41, 94, 99). "refund saat close" label.
- Never touches deploy/close logic (F9 gate-12 rent reserve uses config.management.rentPerPositionSol, NOT this read).
- **Solid**: accurate rent display, distinct dari F9 gate-12 reserve.
- Bukti: 2003-2034, 1994 const, views/positions.js:34-41, F9:1026.

### E.10 — /positions + /pool render delegation solid
- /positions (3254-3265): data fetch unchanged, render delegated views/positions.js buildView + telegram.
- /pool (3267-3295): per-position detail, render delegated views/pool.js + buildRangeEfficiencyLines.
- View-model netral (buildView) → render (telegram) split. Phase 2 🅴 pilot.
- **Solid**: separation of concerns. Data fetch in index.js, render in views/.
- Bukti: 3254-3295, views/positions.js, views/pool.js.

### E.11 — DRY_RUN paper short-circuit solid
- `isPaperMode() && !wallet_address` (1771) → getPaperPositions (F32).
- getPaperPositions (F13): synthesizes dari getTrackedPositions(true) paper_ ids, runs markInRange/markOutOfRange so OOR time accrues.
- wallet_address external bypass paper (utk /wallet atau cross-wallet query).
- **Solid isolation**: paper mode = full lifecycle sim, no on-chain API call (idle wallet empty).
- Bukti: 1771-1773, F13/F32.

### E.12 — LPAgent removed, Meteora binData only
- `lpAgentByPosition = {}` (1828) — LPAgent integration removed.
- `fetchLpAgentOpenPositions` (1294) still defined tapi tidak dipanggil di getMyPositions.
- All PnL from binData (Meteora PnL API fetchDlmmPnlForPool).
- **Solid simplification**: LPAgent dependency removed, single source Meteora. fetchLpAgentOpenPositions dead code? Open-Q #3.
- Bukti: 1828, 1294-1322 dead?, 1826 fetchDlmmPnlForPool.

### E.13 — in_range field derivation
- `in_range: binData ? !binData.isOutOfRange : !isOOR` (1881).
- binData (Meteora PnL API) isOutOfRange authoritative; fallback to portfolio API isOOR.
- **Solid**: dual-source consistent. binData preferred (per-position), portfolio fallback (pool-level).
- Bukti: 1881, 1837.

### E.14 — instruction field passthrough
- `instruction: tracked?.instruction ?? null` (1958).
- F9 orphan cleanup (dlmm.js:1261) sets "incomplete deploy — liquidity add failed; close to recover rent".
- /positions render shows note (views/positions.js `note` in /pool, not /positions list — /positions list tidak render instruction, /pool does).
- **Solid**: orphan instruction visible to user via /pool, management loop can close.
- Bukti: 1958, F9:1261, /pool render.

### E.15 — recordClaim accumulate total_fees_claimed_usd
- `pos.total_fees_claimed_usd = (pos.total_fees_claimed_usd || 0) + (fees_usd || 0)` (254).
- claimFees (dlmm.js:2162) calls recordClaim(position_address) WITHOUT fees_usd arg → fees_usd=undefined → accumulate +0.
- **Bug minor**: recordClaim always +0 bila claimFees call (fees_usd arg missing). total_fees_claimed_usd never accumulates from standalone claimFees.
- **Mitigasi**: closePosition Step 1 claim juga tidak call recordClaim (claimTxHashes push only). total_fees_claimed_usd hanya updated via... verify F19 recordPerformance baca feesUsd dari closed API (F10:2318, 2588) bukan tracked.total_fees_claimed_usd.
- **Risk**: tracked.total_fees_claimed_usd stale/0, tapi recordPerformance pakai API feesUsd. Solid downstream. Open-Q #4.
- Bukti: 249-257, dlmm.js:2162, F10:2318/2588.

### E.16 — OOR exit rule not gated by pnl_pct_suspicious
- STOP_LOSS (551) + TRAILING_TP (559) gated `!pnl_pct_suspicious`.
- OUT_OF_RANGE (574) + LOW_YIELD (587) NOT gated.
- **Solid**: OOR/low-yield independent of PnL API quality. OOR dari in_range field (bin position), low-yield dari fee_per_tvl_24h (independent metric).
- Bukti: 551, 559, 574, 587.

### E.17 — close-confirmation polling depends on getMyPositions accuracy
- F10 close-confirmation (dlmm.js:2265,2522): `refreshed.positions.some(p => p.position === addr)` stillOpen check.
- Depends on getMyPositions force refresh accuracy. Bila RPC lag → stillOpen=true padahal closed → fail return.
- **Mitigasi**: 4 attempt × 3s + 5s wait = 17s window. getMyPositions force bypass cache.
- **Risk**: persistent RPC lag → false fail → state.json open → management retry close → SDK "position not found" → catch fail. F10 #6.
- Bukti: F10:2265,2522, 1782 force bypass.

## §F. Glosarium fase

- **getMyPositions**: dlmm.js:1768-1989, fetch open positions 3-path (paper/RPC/Meteora API).
- **POSITIONS_CACHE_TTL**: 5×60_000 ms, cache duration (dlmm.js:1287).
- **_positionsCache/_positionsCacheAt**: cache + timestamp, force bypass.
- **_positionsInflight**: dedup concurrent calls, share promise.
- **useLocalWallet**: `!walletOverride`, true = cache+inflight, false = external bypass.
- **computePositions**: pnl.js RPC primary path, on-chain + Jupiter + Meteora deposits.
- **fetchDlmmPnlForPool**: pnl.js Meteora PnL API per pool, returns binData.
- **binData**: Meteora PnL API response per position (lowerBinId, upperBinId, poolActiveBinId, isOutOfRange, pnlUsd/pct, fees, feePerTvl24h).
- **lpData**: LPAgent response (REMOVED, lpAgentByPosition={}).
- **markOutOfRange/markInRange**: state.js:209-232, set/clear out_of_range_since (idempotent).
- **out_of_range_since**: ISO timestamp, OOR start. Cleared on in-range.
- **minutesOutOfRange**: floor((now−since)/60000), 0 bila in range.
- **ensureDeployedAt**: state.js:172-204, backfill deployed_at + adopt untracked.
- **syncOpenPositions**: state.js:672-696, auto-close tracked not in activeSet + past 5min grace.
- **SYNC_GRACE_MS**: 5min, newly deployed indexing grace.
- **POSITION_RENT_ESTIMATE_SOL**: 0.057 const, refundable on close, fallback utk synthetic/unreadable.
- **getPositionsRentSol**: dlmm.js:2003-2034, on-chain lamports read batched ≤100, render-only.
- **pnlSanityMaxDiffPct**: default 5%, |reported−derived| > 5% → suspicious flag.
- **reportedPnlPct**: from API (mode-correct).
- **derivedPnlPct**: independent calc (deriveOpenPnlPct/deriveLpAgentPnlPct).
- **pnl_pct_suspicious**: flag, gates STOP_LOSS/TRAILING_TP.
- **true_usd fields**: always-USD (total_value_true_usd, collected_fees_true_usd, pnl_true_usd, unclaimed_fees_true_usd) utk internal accounting.
- **price_peak_pct/price_trough_pct**: raw price excursion vs entry, bin-math.
- **active_bin_at_deploy**: bin at deploy time, utk price_peak/trough binEntry.
- **views/positions.js**: render /positions, tree-style (NOT progress bar).
- **views/pool.js**: render /pool <n> detail, "Range efficiency" lines.
- **buildRangeEfficiencyLines**: index.js helper, range efficiency calc utk /pool.

## §G. Cross-ref fase lain

- **F9**: deploy trackPosition + positionCreated orphan (dlmm.js:1261 instruction "incomplete deploy" → field 1958 instruction); F9 #17 untracked risk → E.3 ensureDeployedAt mitigation.
- **F10**: close-confirmation polling (2265,2522) baca getMyPositions; cached pnl fallback (2613) reads _positionsCache; recordClose (state.js:273) mark closed; recordClaim (2162) tandem closePosition Step 1.
- **F13/F32**: getPaperPositions paper short-circuit (1771-1773); paper_ id synthetic; markInRange/markOutOfRange sinkron paper OOR accrual.
- **F17**: state.js makePositionRecord + trackPosition + ensureDeployedAt + syncOpenPositions + getTrackedPosition + markInRange/markOutOfRange + minutesOutOfRange + recordClaim + recordClose; out_of_range_since field.
- **F18**: updatePnlAndCheckExits OOR write path 2 (538-546) + price_peak/trough (513-528) + exit rules (STOP_LOSS/TRAILING_TP/OUT_OF_RANGE/LOW_YIELD); pnl_pct_suspicious gate.
- **F19**: recordPerformance baca true_usd fields (F10:2318/2588 API feesUsd, not tracked.total_fees_claimed_usd); price_peak/trough passing (F9:2365-2368).
- **F24**: reports.js computeTradeStats price_movement block baca price_peak/trough; pnl_pct_suspicious flag feed; classifyCloseRule mapping.
- **F25**: getPositionsRentSol render-only (dlmm.js:2003); gas-tracker via sendTxTracked (F10).
- **F30**: /positions + /pool Telegram commands (index.js:3254,3267); notifyOutOfRange (telegram.js:615).
- **F31**: solMode config.management.solMode mode-correct fields; formatFullConfig + renderSettingsMenu.
- **F22**: getModePerformance mode-scoped — paper positions excluded from live stats (paper_ id prefix filter in briefing counts).
- **F23**: syncOpenPositions + ensureDeployedAt + recordClose decision-log; appendDecision close (F10).

## §H. Open-Q (bawa ke fase lain)

1. **[F30/F31 docs]** CLAUDE.md:133-134 claims /positions progress bar `[████████░░░░░░░░░░░░] 40%` — NOT FOUND in code. Actual tree-style (views/positions.js). Either CLAUDE.md fix or code add progress bar. Cross-F30 docs.
2. **[F18]** LOW_YIELD rule (587-597) NOT gated by pnl_pct_suspicious (E.6). fee_per_tvl_24h independent metric. Verify F18 low-yield not affected by bad PnL API. Cross-F18.
3. **[F11 dead code]** fetchLpAgentOpenPositions (dlmm.js:1294) defined tapi tidak dipanggil di getMyPositions (lpAgentByPosition={} 1828). Dead code? Verify F11 cleanup. Cross-F11.
4. **[F19/E.15]** recordClaim (state.js:249) accumulate total_fees_claimed_usd, tapi claimFees (dlmm.js:2162) call WITHOUT fees_usd arg → +0. total_fees_claimed_usd stale. recordPerformance pakai API feesUsd (F10:2318/2588) bukan tracked. Verify F19 recordPerformance feesUsd source. Cross-F19.
5. **[F10 #6]** close-confirmation polling RPC-lag risk (E.17) — persistent RPC lag → false fail → state open → management retry close → SDK "position not found". Verify F10/F11 management loop "position not found" handling. Cross-F10/F11.
6. **[F18]** updatePnlAndCheckExits OOR write path 2 (538-546) redundant vs getMyPositions (1839-1840). Both idempotent. Verify F18 no race condition (concurrent write). Cross-F18.
7. **[F17/E.4]** syncOpenPositions auto-close false-positive (E.4) — RPC lag → state churn (auto-close → backfill → auto-close). Verify F17 state.json churn rate. Cross-F17.
8. **[F24]** price_peak_pct/price_trough_pct (513-528) feed reports MAE. Verify F24 computeTradeStats price_movement block baca fields. Cross-F24.
9. **[F32]** getPaperPositions (F13) synthesizes dari getTrackedPositions(true) paper_ ids. Verify F32 paper OOR accrual via markInRange/markOutOfRange. Cross-F32.
10. **[F19]** recordPerformance canonical feesUsd source — API (F10:2318/2588) vs tracked.total_fees_claimed_usd (stale E.15). Verify F19 recordPerformance feesUsd field source. Cross-F19.
11. **[F25]** getPositionsRentSol on-chain lamports read batched ≤100. Verify F25 gas-tracker rent aggregation (rent ≠ gas, separate). Cross-F25.
12. **[F31]** solMode config.management.solMode full-sync 6-surface. getMyPositions mode-correct fields (SOL vs USD). Verify F31 formatFullConfig + renderSettingsMenu + SETTINGS-GUIDE. Cross-F31.
13. **[F9 #17 RESOLVED]** ensureDeployedAt (E.3) backfill adopt untracked — F9 #17 risk mitigated. CONFIRMED. F9 #17 closed.
14. **[F10 E.3 RESOLVED]** rent refund via close ix — getPositionsRentSol (E.9) reads rent-exempt lamports, "refund saat close" label. F10 E.3 rent refund confirmed. CONFIRMED.
15. **[F18]** OUT_OF_RANGE rule (574-582) baca minutesOutOfRange (state.js 238-244) dari out_of_range_since. out_of_range_since set by getMyPositions (1839) OR updatePnlAndCheckExits (538). Verify F18 OOR time accrual consistency. Cross-F18.
16. **[F30]** /positions render (views/positions.js) tree-style, ICON, fmtBothFromMode dual-unit. /pool render (views/pool.js) "Range efficiency" lines. Verify F30 render mode-correct + dual-unit. Cross-F30.
17. **[F11]** getMyPositions 3-path (paper/RPC/Meteora API) + cache+inflight. Verify F11 RPC primary fail-through edge case (computePositions partial fail). Cross-F11.
18. **[F24]** pnl_pct_derived (1860-1864) independent calc utk sanity. Verify F24 reports baca derived vs reported. Cross-F24.
19. **[F17]** makePositionRecord field shape (state.js:60-135) — out_of_range_since null init (111), price_peak/trough fields. Verify F17 record shape vs getMyPositions output. Cross-F17.
20. **[F11]** LPAgent removal — `fetchLpAgentOpenPositions` (1294) dead code, `lpAgentByPosition = {}` (1828). Verify F11 cleanup or keep utk future re-enable. Cross-F11.
