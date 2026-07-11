# Audit F17 — State registry + record shape + peak/trough
> Read-only. Bukti `file:line`. UNKNOWN kalau tak pasti. Resume: buka file ini.
> Kedalaman: ⬛ deep — alasan: state.json = persistensi tunggal utk 35-field position record + recentEvents + briefing milestone/pin/periodic keys; `makePositionRecord` (61-136) shared oleh `trackPosition` (deploy) + `ensureDeployedAt` (backfill) — drift bisa corrupt shape; `trackPosition` protect deployed_at (146) + stamp active_setup/profile dari config fallback (154-155); `ensureDeployedAt` backfill assumption stamp current racikan (197) + "Backfilled from on-chain" note; peak/trough + price_peak/trough tracked via 15s confirmation (queuePeakConfirmation/resolvePendingPeak tolerance 0.85 + queueTrailingDropConfirmation/resolvePendingTrailingDrop 30s exit window); `syncOpenPositions` (672-696) auto-close missing on-chain positions after 5min grace — NO paper_ guard (F13 ghost gap); `updatePnlAndCheckExits` (484-600) = F18 deep, F17 cover ringan saja.
> Cross-ref: F9 (deploy trackPosition call + signal_snapshot), F11 (getMyPositions syncOpenPositions call + markInRange/markOutOfRange), F12 (closePosition baca tracked fields + recordClose), F13 (paper/live isolation — syncOpenPositions NO paper_ guard), F18 (updatePnlAndCheckExits deep — 4 exit rules), F19 (recordPerformance baca tracked fields), F25 (briefing milestone/pin/periodic keys), F29 (paths.statePath per-profil isolation).

## Ringkasan eksekutif (5 baris)
1. **state.json shape** (load 33-43, save 45-52): `{positions: {addr: record}, recentEvents: [{ts, action, position, pool_name, reason?}], lastUpdated, _lastBriefingDate, _lastBriefingPinId, _lastReportedMilestone, _lastBriefing_${period}}`. `load()` fail-open return `{positions:{}, lastUpdated:null}` (41) — NOTE: missing `recentEvents` field → `pushEvent` guard (263) `if (!state.recentEvents) state.recentEvents = []`. `save()` fail-open log + skip (49-51) — silent data loss bila disk error.
2. **`makePositionRecord` 35 fields** (61-136): identity (position/pool/pool_name/strategy/active_setup/profile) + deploy metadata (bin_range/amount_sol/amount_x/active_bin_at_deploy/bin_step/volatility/fee_tvl_ratio/initial_fee_tvl_24h/organic_score/initial_value_usd/narrative_category/shadow_signals/entry_mcap/entry_tvl/entry_volume/entry_holders/signal_snapshot/deployed_at) + management (out_of_range_since/last_claim_at/total_fees_claimed_usd/rebalance_count/closed/closed_at/notes) + peak/trough (peak_pnl_pct=0/trough_pnl_pct=0/price_peak_pct=0/price_trough_pct=0) + pending confirmations (pending_peak_pnl_pct/pending_peak_started_at/pending_trailing_current_pnl_pct/pending_trailing_peak_pnl_pct/pending_trailing_drop_pct/pending_trailing_started_at/confirmed_trailing_exit_reason/confirmed_trailing_exit_until/trailing_active).
3. **`trackPosition`** (141-160): re-track PROTECT deployed_at (146 `existing?.deployed_at ?? new Date().toISOString()`) — re-deploy same address TIDAK reset clock (anti-corrupt minutes-held/age). Stamps `active_setup = fields.active_setup ?? config.activeSetup ?? null` (154) + `profile = fields.profile ?? config.profile ?? null` (155) — fallback ke live config bila caller tak specify. `pushEvent({action:"deploy"})` (157) + save + log.
4. **`ensureDeployedAt`** (172-204): backfill utk on-chain position tak ter-track. Known position missing deployed_at → stamp first-seen (178-182). Untracked → `makePositionRecord` minimal (186-199) dgn `strategy:"unknown"` + `active_setup: config.activeSetup ?? null` (197 — ASSUMPTION stamp current racikan, betul utk attribusi tapi bisa salah bila racikan ganti) + note "Backfilled from on-chain — deploy metadata unknown" (200). Reason: tracking-lost position tidak orphaned dari racikan-scoped report.
5. **Peak/trough + price_peak/trough + 15s confirmation**: `updatePnlAndCheckExits` (506-528) track `trough_pnl_pct` (lowest PnL seen) + `price_peak_pct`/`price_trough_pct` (raw price excursion via bin math `(1+step/1e4)^(binNow-binEntry)−1`×100, 519). `queuePeakConfirmation` (318-347): candidate > current peak → pending 15s. `immediate:true` skip queue (327-334) — utk RPC poll. `resolvePendingPeak` (349-368): `currentPnlPct >= pendingPeak × 0.85` (toleranceRatio) → confirm `Math.max(peak, pending, current)`; else reject. `queueTrailingDropConfirmation` (370-393): `dropFromPeak >= trailingDropPct` → queue. `resolvePendingTrailingDrop` (395-426): `stillNearCrash (current <= pendingCurrent + 1.0) AND stillDroppedEnough ((pendingPeak - current) >= trailingDropPct)` → confirm + 30s exit window (`confirmed_trailing_exit_until`, 417). `syncOpenPositions` (672-696): auto-close positions missing from on-chain after `SYNC_GRACE_MS=5min` (670) — NO `paper_` prefix guard (F13 ghost gap, paper position vanish bila DRY_RUN→false flip).

## Progress
- [x] Baca state.js 1-160 (header + load/save + makePositionRecord + trackPosition)
- [x] Baca state.js 160-280 (ensureDeployedAt + markOutOfRange/markInRange + minutesOutOfRange + recordClaim + pushEvent + recordClose)
- [x] Baca state.js 280-440 (recordRebalance + setPositionInstruction + queuePeakConfirmation + resolvePendingPeak + queueTrailingDropConfirmation + resolvePendingTrailingDrop + getTrackedPositions + getTrackedPosition)
- [x] Baca state.js 440-560 (getStateSummary + updatePnlAndCheckExits header + confirmed_trailing_exit_until + trough + price_peak/trough + trailing activate + OOR)
- [x] Baca state.js 560-696 (4 exit rules + briefing tracking + syncOpenPositions)
- [x] Cross-ref F9 (trackPosition call + signal_snapshot), F11 (syncOpenPositions + markInRange/markOutOfRange), F12 (closePosition baca tracked), F13 (paper/live isolation syncOpenPositions gap), F18 (updatePnlAndCheckExits deep)
- [x] Tulis §0 + §A-§H

---

## §0. Cara Kerja (Bahasa Awam)

**Analogi** (dua sudut pandang sehari-hari)
- *Buku besar teller bank*: tiap nasabah buka rekening → teller catat di buku besar (state.json): nomor rekening (position address), cabang (pool), jenis deposito (strategy/bin_range), modal awal (amount_sol/initial_value_usd), tanggal buka (deployed_at). Tiap klaim bunga → teller update `total_fees_claimed_usd` + tambah note. Kalau nasabah tutup → `closed=true` + `closed_at` + alasan. Kalau rekening hilang dari sistem pusat (on-chain) >5 menit → auto-tutup (syncOpenPositions). Buku besar juga simpan event terakhir (recentEvents, max 20) supaya teller baru tau "yang baru terjadi apa".
- *Akuntan forensik dgn camera trap*: PnL posisi seperti jejak kaki di hutan — bisa naik (peak) turun (trough). Akuntan pasang camera trap 15-detik: bila lihat PnL新高 → snapshot pending 15s, cek lagi bila masih dekat (>=85% pending) → confirm peak. Bila PnL turun dari peak >= trailingDropPct → snapshot pending 15s, cek lagi bila masih dekat crash → confirm trailing exit + 30s window utk close. Tapi ada juga raw price movement (price_peak/trough) = jejak kaki asli, exact dari bin movement (tanpa camera trap, langsung record).

**Di bot, ini = persistent position registry + peak/trough tracking + 15s confirmation** (1-2 kalimat)
state.json = single source of truth utk 35-field position metadata (deploy time, bin config, OOR since, fees claimed, peak/trough PnL, price excursion, pending confirmations, trailing state). `trackPosition` di deploy, `ensureDeployedAt` backfill on-chain, `updatePnlAndCheckExits` track peak/trough + trigger 4 exit rules (F18 deep), `syncOpenPositions` auto-close missing on-chain.

**Posisi fase ini di alur bot** (1 paragraf)
Datang setelah F9 (deployPosition → `trackPosition` di state.js:141) + F11 (getMyPositions → `syncOpenPositions` + `markInRange/markOutOfRange`). Sebelum F12 (closePosition baca tracked fields utk recordPerformance) + F18 (updatePnlAndCheckExits deep — 4 exit rules) + F19 (recordPerformance baca tracked utk performance record). F17 = PERSISTENSI: on-chain state di Meteora, off-chain metadata di state.json. Tanpa F17, bot tak tau kapan deploy (→ minutes-held invalid), tak tau peak/trough (→ exit rules broken), tak tau OOR since (→ OOR-time exit broken).

**Langkah kerja** (5-10 nomor, istilah teknis)
1. Trigger deploy: `trackPosition(fields)` (141) dari dlmm.js:877/1101 (F9). `load()` → cek existing → `makePositionRecord` dgn `deployed_at = existing?.deployed_at ?? now` (146) → `pushEvent({action:"deploy"})` (157) → `save()`.
2. Backfill: `ensureDeployedAt(position_address, meta)` (172) dari dlmm.js:1803 (F11 syncOpenPositions) — known missing deployed_at → stamp; untracked → minimal record + "Backfilled from on-chain" note.
3. OOR detect: `markOutOfRange(position_address)` (209) / `markInRange` (223) dari dlmm.js:1970 (F11) — idempotent, save on change only.
4. Claim: `recordClaim(position_address, fees_usd)` (249) dari dlmm.js:2162 (F10) — accumulate `total_fees_claimed_usd` + note.
5. PnL poll: `updatePnlAndCheckExits(position_address, positionData, mgmtConfig)` (484) dari index.js:1324 (F2) — track trough + price_peak/trough + trailing activate + 4 exit rules (F18 deep) → return `{action, reason}` or null.
6. Peak confirm: `queuePeakConfirmation` (318) + 15s later `resolvePendingPeak` (349) — tolerance 0.85.
7. Trailing confirm: `queueTrailingDropConfirmation` (370) + 15s later `resolvePendingTrailingDrop` (395) — 30s exit window.
8. Close: `recordClose(position_address, reason)` (273) dari dlmm.js:2430 (F10) → `closed=true` + `closed_at` + note + `pushEvent({action:"close"})`.
9. Rebalance: `recordRebalance(old, new)` (288) — close old + transfer `rebalance_count` + note new.
10. Sync: `syncOpenPositions(active_addresses)` (672) dari dlmm.js:1803 (F11) — auto-close missing on-chain after 5min grace.

**Output state.json**: persistent 35-field record per position + recentEvents (max 20) + briefing tracking keys. Cross-ref F12 (closePosition baca tracked) + F19 (recordPerformance baca tracked) + F25 (briefing keys).

**Kalau rusak / diskip** (2-3 kalimat, istilah teknis)
state.json corrupt → `load()` fail-open return empty → semua position record ilang → `updatePnlAndCheckExits` return null (488 `!pos`) → exit rules broken (posisi terbuka tanpa SL/trailing/OOR monitoring). `save()` disk error → silent log + skip → perubahan ilang (peak/trough tidak ter-record). `syncOpenPositions` NO paper_ guard → DRY_RUN→false flip → paper positions auto-close sebagai "missing on-chain" (F13 ghost gap,Factory contract bug).

**Istilah yang muncul di fase ini** (bullet, cuma yang baru)
- **state.json** — single persistent file utk position registry + recentEvents + briefing keys. Path `paths.statePath` (per-profil).
- **position record** — 35-field object per position: identity + deploy metadata + management + peak/trough + pending confirmations.
- **`makePositionRecord`** — factory pure fn, shared `trackPosition` + `ensureDeployedAt` (drift-prevention).
- **deployed_at protect** — re-track same address TIDAK reset clock (anti-corrupt minutes-held).
- **active_setup/profile stamp** — racikan/wizard archetype at deploy time, fallback `config.activeSetup`/`config.profile`.
- **peak/trough** — PnL% highest/lowest seen while open, via 15s confirmation (tolerance 0.85).
- **price_peak/trough** — raw price excursion vs entry, exact from bin math, NO confirmation.
- **pending confirmation** — 15s recheck window utk peak/trailing (anti noise).
- **trailing_active** — flag trigger once `peak_pnl_pct >= trailingTriggerPct`.
- **confirmed_trailing_exit_until** — 30s exit window after trailing drop confirmed.
- **syncOpenPositions** — auto-close positions missing from on-chain after 5min grace.
- **`SYNC_GRACE_MS`** — 5 menit grace period utk newly deployed positions (may not be indexed yet).
- **recentEvents** — max 20 events, shown in every prompt utk context.

*Lewati §0 kalau sudah paham. Isi teknis mulai §A.*

---

## §A. Peta block fase ini (file:line → peran)

| file:line | simbol | peran |
|---|---|---|
| state.js:11-15 | imports | fs, log, repoPath, paths, config |
| state.js:17 | `STATE_FILE = paths.statePath` | per-profil isolation |
| state.js:19-20 | `MAX_RECENT_EVENTS=20` + `MAX_INSTRUCTION_LENGTH=280` | const |
| state.js:22-31 | `sanitizeStoredText` | strip newline/`<>`/backtick + slice 280 char |
| state.js:33-43 | `load()` | fail-open return `{positions:{}, lastUpdated:null}` (missing recentEvents guard di pushEvent) |
| state.js:45-52 | `save(state)` | fail-open log + skip on disk error (silent data loss) |
| state.js:61-136 | `makePositionRecord` | factory 35-field, shared trackPosition + ensureDeployedAt |
| state.js:86-135 | record shape | identity + deploy metadata + management + peak/trough + pending + trailing |
| state.js:94 | `active_bin_at_deploy` | utk price_peak/trough bin math |
| state.js:98 | `initial_fee_tvl_24h = fee_tvl_ratio` | snapshot utk compare drift |
| state.js:113 | `total_fees_claimed_usd: 0` | accumulate via recordClaim |
| state.js:118-125 | peak/trough + price_peak/trough | default 0 |
| state.js:126-131 | pending confirmation fields | peak + trailing pending state |
| state.js:132-134 | confirmed_trailing_exit + trailing_active | trailing state machine |
| state.js:141-160 | `trackPosition(fields)` | deploy record, protect deployed_at (146), stamp active_setup/profile (154-155) |
| state.js:146 | `deployed_at = existing?.deployed_at ?? now` | re-track protect clock |
| state.js:154-155 | `active_setup/profile ?? config.activeSetup/profile` | fallback to live config |
| state.js:157 | `pushEvent({action:"deploy"})` | event log |
| state.js:172-204 | `ensureDeployedAt(position_address, meta)` | backfill on-chain |
| state.js:178-182 | known missing deployed_at | stamp first-seen |
| state.js:186-199 | untracked backfill | minimal record + active_setup=currrent racikan ASSUMPTION (197) |
| state.js:200 | note "Backfilled from on-chain" | flag assumption |
| state.js:209-218 | `markOutOfRange` | idempotent, save on first set only |
| state.js:223-232 | `markInRange` | idempotent, clear OOR timestamp |
| state.js:238-244 | `minutesOutOfRange` | 0 bila in range |
| state.js:249-257 | `recordClaim` | accumulate `total_fees_claimed_usd` + note |
| state.js:262-268 | `pushEvent` | append `{ts, ...event}`, slice last 20 |
| state.js:273-283 | `recordClose` | `closed=true` + `closed_at` + note + pushEvent |
| state.js:288-302 | `recordRebalance` | close old + transfer rebalance_count + note new |
| state.js:308-316 | `setPositionInstruction` | sanitize 280 char, overwrite, null to clear |
| state.js:318-347 | `queuePeakConfirmation` | candidate > current peak → pending 15s; immediate skip queue |
| state.js:327-334 | `immediate:true` | RPC poll path, no queue |
| state.js:349-368 | `resolvePendingPeak` | tolerance 0.85, `Math.max(peak, pending, current)` |
| state.js:358 | `currentPnlPct >= pendingPeak × 0.85` | confirm threshold |
| state.js:370-393 | `queueTrailingDropConfirmation` | `dropFromPeak >= trailingDropPct` → queue |
| state.js:395-426 | `resolvePendingTrailingDrop` | `stillNearCrash AND stillDroppedEnough` → confirm + 30s exit window |
| state.js:411-412 | confirm condition | `current <= pendingCurrent + 1.0` AND `(pendingPeak - current) >= trailingDropPct` |
| state.js:417 | `confirmed_trailing_exit_until = now + 30s` | exit window |
| state.js:431-435 | `getTrackedPositions(openOnly)` | Object.values, filter !closed |
| state.js:440-443 | `getTrackedPosition` | single record lookup |
| state.js:448-474 | `getStateSummary` | summary utk prompt: open/closed count, fees, positions[], recent_events last 10 |
| state.js:459-470 | positions[] shape | subset fields utk prompt (position/pool/strategy/deployed_at/OOR/fees/instruction) |
| state.js:484-600 | `updatePnlAndCheckExits` | F18 deep — track trough + price_peak/trough + trailing + 4 exit rules |
| state.js:490-500 | confirmed_trailing_exit_until check | replay confirmed exit within 30s window |
| state.js:506-511 | trough_pnl_pct track | lowest PnL seen, skip if suspicious |
| state.js:516-528 | price_peak/trough track | bin math `(1+step/1e4)^(binNow-binEntry)−1`×100, exact from DLMM |
| state.js:531-535 | trailing_active trigger | `peak_pnl_pct >= trailingTriggerPct` |
| state.js:538-546 | OOR state update | in_range false → set; true → clear |
| state.js:551-556 | exit rule 1: STOP_LOSS | `currentPnlPct <= stopLossPct` |
| state.js:559-571 | exit rule 2: TRAILING_TP | `dropFromPeak >= trailingDropPct`, needs_confirmation |
| state.js:574-582 | exit rule 3: OUT_OF_RANGE | `minutesOOR >= outOfRangeWaitMinutes` |
| state.js:585-597 | exit rule 4: LOW_YIELD | `fee_per_tvl_24h < minFeePerTvl24h AND age >= minAgeBeforeYieldCheck` |
| state.js:607-664 | briefing tracking | getLastBriefingDate/setLast + PinId + ReportedMilestone + PeriodicBriefing |
| state.js:617 | `setLastBriefingDate` | `YYYY-MM-DD UTC` slice |
| state.js:670 | `SYNC_GRACE_MS = 5min` | grace utk newly deployed |
| state.js:672-696 | `syncOpenPositions(active_addresses)` | auto-close missing on-chain after grace — NO paper_ guard (F13 gap) |
| state.js:679 | `if (pos.closed \|\| activeSet.has(posId)) continue` | skip closed + still-on-chain |
| state.js:683-686 | grace check | `Date.now() - deployedAt < SYNC_GRACE_MS` → skip |
| state.js:688-692 | auto-close | `closed=true` + `closed_at` + note "Auto-closed during state sync" |

---

## §B. Alur data: deploy → track → poll → peak/trough → close → sync

```
DEPLOY (F9 dlmm.js:877/1101)
  └─ trackPosition(fields) (141)
      ├─ load() → existing = state.positions[fields.position]
      ├─ deployed_at = existing?.deployed_at ?? now (146)  ← PROTECT
      ├─ makePositionRecord({...fields, deployed_at, active_setup: ?? config.activeSetup, profile: ?? config.profile})
      ├─ state.positions[fields.position] = record
      ├─ pushEvent({action:"deploy", position, pool_name})
      └─ save()
          │
          ↓
PnL POLL (F2 index.js:1324, 3s interval)
  └─ updatePnlAndCheckExits(position_address, positionData, mgmtConfig) (484)
      ├─ load() → pos = state.positions[position_address]
      ├─ if (!pos || pos.closed) return null (488)
      ├─ if (confirmed_trailing_exit_until && within 30s) → return {action:"TRAILING_TP", confirmed_recheck:true} (490-500)
      ├─ track trough_pnl_pct (506-511) — skip if pnl_pct_suspicious
      ├─ track price_peak/trough via bin math (516-528)
      ├─ trailing_active trigger (531-535)
      ├─ OOR state update (538-546)
      ├─ if (changed) save() (548)
      ├─ exit rule 1: STOP_LOSS (551-556) → return {action, reason}
      ├─ exit rule 2: TRAILING_TP (559-571) → return {action, reason, needs_confirmation, peak, current, drop}
      ├─ exit rule 3: OUT_OF_RANGE (574-582) → return {action, reason}
      ├─ exit rule 4: LOW_YIELD (585-597) → return {action, reason}
      └─ return null (599)
          │
          ↓ (bila TRAILING_TP needs_confirmation)
PEAK CONFIRM (F2 index.js:1326, 15s recheck)
  └─ queuePeakConfirmation(position, candidatePnl, {immediate?}) (318)
      └─ if (candidate > current peak) → pending 15s
  └─ resolvePendingPeak(position, currentPnl, 0.85) (349)
      └─ if (current >= pending × 0.85) → confirm Math.max(peak, pending, current)
      └─ else → reject
          │
          ↓ (bila trailing drop candidate)
TRAILING CONFIRM (F2 index.js:1329, 15s recheck)
  └─ queueTrailingDropConfirmation(position, peak, current, drop) (370)
      └─ if (dropFromPeak >= trailingDropPct) → pending
  └─ resolvePendingTrailingDrop(position, current, drop, 1.0) (395)
      └─ if (stillNearCrash AND stillDroppedEnough) → confirm + 30s exit window
      └─ else → reject
          │
          ↓
CLOSE (F10 dlmm.js:2430)
  └─ recordClose(position_address, reason) (273)
      ├─ pos.closed = true + closed_at = now + note
      ├─ pushEvent({action:"close", position, pool_name, reason})
      └─ save()
          │
          ↓
SYNC (F11 dlmm.js:1803, called per getMyPositions)
  └─ syncOpenPositions(active_addresses) (672)
      └─ per pos in state.positions:
          ├─ if (pos.closed || activeSet.has(posId)) continue (679)
          ├─ if (Date.now() - deployedAt < 5min) skip grace (683-686)
          └─ else: pos.closed=true + note "Auto-closed during state sync" (688-692)
```

---

## §C. Sinkron: siapa-panggil-siapa

| Pemanggil (file:line) | Dipanggil (file:line) | Trigger | Data lewat | Fail-mode |
|---|---|---|---|---|
| dlmm.js:877/1101 (F9 deploy) | state.js:141 `trackPosition` | deploy success | `fields` (35-field) | error → save fail-open log |
| dlmm.js:1803 (F11 syncOpenPositions call) | state.js:172 `ensureDeployedAt` | per on-chain position observed | `(position_address, meta)` | null position_address → return (173) |
| dlmm.js:1970 (F11 markInRange/markOutOfRange) | state.js:209/223 | in_range true/false | `(position_address)` | pos missing → return (212/226) |
| dlmm.js:2162 (F10 claimFees) | state.js:249 `recordClaim` | claim success | `(position_address, fees_usd)` | pos missing → return (252) |
| dlmm.js:2430 (F10 closePosition) | state.js:273 `recordClose` | close success | `(position_address, reason)` | pos missing → return (276) |
| index.js:1324 (F2 PnL poll) | state.js:484 `updatePnlAndCheckExits` | 3s poll per position | `(position_address, positionData, mgmtConfig)` | pos missing → null (488) |
| index.js:1326 (F2 peak confirm) | state.js:318 `queuePeakConfirmation` | TRAILING_TP needs_confirmation | `(position, candidatePnl, {immediate?})` | candidate null → false (319) |
| index.js (F2 15s recheck) | state.js:349 `resolvePendingPeak` | 15s after queue | `(position, currentPnl, 0.85)` | pending null → {confirmed:false, pending:false} (352) |
| index.js:1329 (F2 trailing confirm) | state.js:370 `queueTrailingDropConfirmation` | peak detected drop | `(position, peak, current, drop)` | drop < trailingDropPct → false (373) |
| index.js (F2 15s recheck) | state.js:395 `resolvePendingTrailingDrop` | 15s after queue | `(position, current, drop, 1.0)` | pending null → {confirmed:false} (398) |
| dlmm.js:1803 (F11 getMyPositions) | state.js:672 `syncOpenPositions` | per getMyPositions call | `active_addresses[]` | grace period skip |
| agent.js (F4 prompt) | state.js:448 `getStateSummary` | system prompt build | — | return summary object |
| briefing.js (F25) | state.js:607/625/640/656 `get/setLast*` | briefing cron | — | missing key → null |

---

## §D. Logika kunci per fungsi

### `makePositionRecord` (state.js:61-136)
- **Apa**: pure factory fn — build 35-field position record dgn defaults. Shared `trackPosition` + `ensureDeployedAt` utk drift-prevention.
- **Kapan dipicu**: `trackPosition` (151) saat deploy; `ensureDeployedAt` (186) saat backfill.
- **Output**: 35-field object (86-135).
- **Sinkron**: caller spread `...fields` lalu override `deployed_at`/`active_setup`/`profile`. Shape consistency utk `getTrackedPosition`/`updatePnlAndCheckExits`/`recordPerformance` baca.
- **Fail-mode**: field missing → default null/0/false. Tidak throw.
- **Bukti**: state.js:61-136.

### `trackPosition` (state.js:141-160)
- **Apa**: record newly deployed position. Protect `deployed_at` bila re-track same address.
- **Kapan dipicu**: dlmm.js:877/1101 (F9 deploy success).
- **Output**: `state.positions[fields.position] = record` + `pushEvent({action:"deploy"})`.
- **Sinkron**: `updatePnlAndCheckExits` baca `pos.deployed_at` utk age. `recordPerformance` baca utk minutes-held. `getStateSummary` utk prompt.
- **Fail-mode**: `save()` fail-open log. Re-track protect deployed_at (146) — anti-corrupt clock.
- **Bukti**: state.js:141-160.

### `ensureDeployedAt` (state.js:172-204)
- **Apa**: backfill on-chain position tak ter-track. Known missing deployed_at → stamp. Untracked → minimal record.
- **Kapan dipicu**: dlmm.js:1803 (F11 syncOpenPositions) per on-chain position.
- **Output**: update deployed_at OR create minimal record dgn note "Backfilled from on-chain".
- **Sinkron**: `active_setup = config.activeSetup ?? null` (197) — ASSUMPTION stamp current racikan. `recordPerformance` baca `active_setup` utk racikan-scoped report. Backfilled records flagged via note (200) — queryable utk exclude dari Darwin purity jika perlu.
- **Fail-mode**: null position_address → return (173). Existing position → just stamp deployed_at if missing (178-182).
- **Bukti**: state.js:172-204.

### `queuePeakConfirmation` + `resolvePendingPeak` (state.js:318-368)
- **Apa**: 15s peak PnL confirmation. Anti-noise — bila PnL spike sebentar lalu drop, jangan confirm sebagai peak.
- **Kapan dipicu**: `queuePeakConfirmation` dari index.js:1326 (F2 poll) saat `shouldUsePnlRecheck` + candidate > current peak. `resolvePendingPeak` dari index.js 15s recheck (F2).
- **Output**: queue → pending fields set. resolve → `peak_pnl_pct = Math.max(peak, pending, current)` bila confirm; else clear pending + reject log.
- **Sinkron**: `updatePnlAndCheckExits` baca `pos.peak_pnl_pct` utk trailing trigger (531) + trailing drop check (560). `recordPerformance` baca utk movement analysis.
- **Fail-mode**: `immediate:true` (327-334) skip queue — utk RPC poll yang trusted. `candidate <= currentPeak` → false (325). pos closed → false (322). `toleranceRatio=0.85` — current >= pending × 0.85 → confirm (longgar 15%).
- **Bukti**: state.js:318-368.

### `queueTrailingDropConfirmation` + `resolvePendingTrailingDrop` (state.js:370-426)
- **Apa**: 15s trailing drop confirmation. Bila PnL drop from peak >= trailingDropPct → queue, 15s later cek still near crash → confirm + 30s exit window.
- **Kapan dipicu**: `queueTrailingDropConfirmation` dari index.js:1329 (F2 poll). `resolvePendingTrailingDrop` dari index.js 15s recheck.
- **Output**: queue → pending fields. confirm → `confirmed_trailing_exit_reason` + `confirmed_trailing_exit_until = now + 30s` (417). `updatePnlAndCheckExits` next poll baca (490-500) → return `{action:"TRAILING_TP", confirmed_recheck:true}`.
- **Sinkron**: 30s exit window = grace utk close tx lanjut. Kontrak: 15s recheck + 30s window = 45s total max delay dari peak drop → close.
- **Fail-mode**: `dropFromPeak < trailingDropPct` → false (373). `tolerancePct=1.0` — `current <= pendingCurrent + 1.0` (longgar 1%). `stillDroppedEnough = (pendingPeak - current) >= trailingDropPct`.
- **Bukti**: state.js:370-426.

### `updatePnlAndCheckExits` (state.js:484-600) — F18 deep, F17 ringkas
- **Apa**: track trough + price_peak/trough + trailing activate + OOR + 4 exit rules. Return `{action, reason}` or null.
- **Kapan dipicu**: index.js:1324 (F2 PnL poll 3s).
- **Output**: 4 exit actions (STOP_LOSS/TRAILING_TP/OUT_OF_RANGE/LOW_YIELD) or null (STAY).
- **Sinkron**: `peak_pnl_pct`/`trough_pnl_pct`/`price_peak_pct`/`price_trough_pct` → `recordPerformance` (F19) utk movement analysis. `confirmed_trailing_exit_until` → 30s window. `trailing_active` → once trigger, stay true.
- **Fail-mode**: `pnl_pct_suspicious` → skip trough track (506) + skip SL (551) + skip trailing (559). `pos.closed` → null (488). F18 cover deep.
- **Bukti**: state.js:484-600.

### `syncOpenPositions` (state.js:672-696)
- **Apa**: reconcile local state dgn on-chain. Auto-close positions missing from on-chain after 5min grace.
- **Kapan dipicu**: dlmm.js:1803 (F11 getMyPositions) per call.
- **Output**: `pos.closed=true` + `closed_at` + note "Auto-closed during state sync" utk missing positions.
- **Sinkron**: called per getMyPositions (cache 5min F11) — effective cadence ~5min. Grace period 5min = same dgn cache → double protection.
- **Fail-mode**: **NO `paper_` prefix guard** (F13 ghost gap) — bila DRY_RUN→false flip, paper positions (`paper_…` id) tidak ada di on-chain → auto-close sebagai "missing". F13 finding: factory contract bug, isolation broken on flip.
- **Bukti**: state.js:672-696, F13 §E.

### `getStateSummary` (state.js:448-474)
- **Apa**: summarize state utk system prompt. Open/closed count + positions[] subset + recent_events last 10.
- **Kapan dipicu**: agent.js (F4) saat build system prompt.
- **Output**: `{open_positions, closed_positions, total_fees_claimed_usd, positions: [{position, pool, strategy, deployed_at, out_of_range_since, minutes_out_of_range, total_fees_claimed_usd, initial_fee_tvl_24h, rebalance_count, instruction}], last_updated, recent_events}`.
- **Sinkron**: prompt SCREENER/MANAGER baca utk context. positions[] subset fields (459-470) — bukan full 35-field, utk token efficiency.
- **Fail-mode**: load fail-open → empty positions[].
- **Bukti**: state.js:448-474.

---

## §E. Temuan: bug / gap / kontrak-kunci / fail-open tak-terpenuhi

### E1. BUG (F13 ghost gap) — `syncOpenPositions` NO `paper_` guard
- **Lokasi**: state.js:672-696.
- **Masalah**: `syncOpenPositions` auto-close positions missing from on-chain after 5min grace. TAPI tidak cek `posId.startsWith("paper_")` → paper positions (virtual, `paper_…` id dari `trackPosition` F9 paper branch) tidak ada di on-chain → auto-close sebagai "missing" bila DRY_RUN→false flip.
- **Impact**: DRY_RUN→false flip → paper positions auto-close → `recordClose` → `recordPerformance` (paper:true tag) → masuk stats. **Paper/live isolation broken on flip** (F13 §E kontrak violation).
- **Fix**: tambah guard `if (posId.startsWith("paper_")) continue` di loop (679) — skip paper positions dari auto-close.
- **Bukti**: state.js:677-693, F13 §E.

### E2. GAP — `save()` fail-open silent data loss
- **Lokasi**: state.js:45-52.
- **Masalah**: `save()` catch disk error → log + skip. Tidak throw. Perubahan peak/trough/OOR/claim/close yang sudah di-mutate di `pos` object TIDAK persist.
- **Impact**: disk full / permission error → `pos.peak_pnl_pct` di memory sudah update tapi state.json tidak → next `load()` baca old value → peak lost. Trailing trigger `peak_pnl_pct >= trailingTriggerPct` bisa miss. Exit rules bisa broken.
- **Kontrak**: fail-open utk hindari crash bot. TAPI silent — user tidak alert kalau data loss terjadi.
- **Fix**: tambah `notifyTelegram` utk state_error kritis (disk full) supaya user aware. Atau retry save dgn backoff.
- **Bukti**: state.js:45-52.

### E3. GAP — `load()` fail-open return missing `recentEvents`
- **Lokasi**: state.js:33-43.
- **Masalah**: bila state.json corrupt/missing → `load()` return `{positions:{}, lastUpdated:null}` — TANPA `recentEvents` field. `pushEvent` guard (263) `if (!state.recentEvents) state.recentEvents = []` → recover gracefully. TAPI bila save() selanjutnya run → `recentEvents` baru ter-write.
- **Impact**: state.json reset → recentEvents ilang → SCREENER/MANAGER prompt kehilangan context "yang baru terjadi apa". Tidak fatal, tapi less informed.
- **Bukti**: state.js:33-43, 262-268.

### E4. KONTRAK — `ensureDeployedAt` ASSUMPTION stamp current racikan
- **Lokasi**: state.js:197 `active_setup: config.activeSetup ?? null`.
- **Kontrak**: backfilled position (tracking-lost) di-stamp dgn racikan CURRENT (bukan racikan saat deploy sebenarnya). Note "Backfilled from on-chain — deploy metadata unknown" (200) flag as assumption.
- **Reason**: tracking-lost position tidak orphaned dari racikan-scoped report (`getPerformanceForRacikan` F22 baca `active_setup`). Bila `null` → dropped dari report. Stamp current = best-effort attribution.
- **Trade-off**: bila user switch racikan sering → backfilled position bisa salah attribusi (di-rapor di racikan baru padahal deploy di racikan lama). Note flag queryable utk exclude jika perlu (comment 195-196 "excludable from Darwin/evolve purity via the note if ever needed — NOT now").
- **Bukti**: state.js:186-200, comment 191-196.

### E5. KONTRAK — `deployed_at` protect anti-corrupt
- **Lokasi**: state.js:146 `const deployed_at = existing?.deployed_at ?? new Date().toISOString()`.
- **Kontrak**: re-track same position address TIDAK reset `deployed_at`. Reason: `minutes-held`/`age` di `recordPerformance` (F19) + `updatePnlAndCheckExits` (531 trailing) baca `deployed_at`. Reset → corrupt timing.
- **Sinkron**: dlmm.js:877 (deploy live) + 1101 (deploy paper) + relay path → semua call `trackPosition` dgn same position address bila re-deploy.
- **Bukti**: state.js:146.

### E6. KONTRAK — price_peak/trough exact dari bin math, no confirmation
- **Lokasi**: state.js:516-528.
- **Kontrak**: `priceMovePct = (Math.pow(1 + pos.bin_step/10000, binNow - binEntry) - 1) × 100`. Exact dari DLMM bin movement (each bin = bin_step/10000 price step). Tidak perlu 15s confirmation karena bin movement exact (bukan PnL yang bisa noise dari fee estimation).
- **Sinkron**: `recordPerformance` (F19) baca `price_peak_pct`/`price_trough_pct` utk movement analysis (reports.js `price_movement` block F24).
- **Reason**: input utk tuning `stopLossPct` — "how deep entries actually dip before recovering".
- **Bukti**: state.js:513-528.

### E7. KONTRAK — 15s + 30s = 45s max trailing exit delay
- **Lokasi**: queuePeakConfirmation/resolvePendingPeak 15s (state.js:318-368) + queueTrailingDropConfirmation/resolvePendingTrailingDrop 15s (370-426) + confirmed_trailing_exit_until 30s window (417).
- **Kontrak**: peak detected → 15s recheck → confirm → trailing drop detected → 15s recheck → confirm → 30s exit window → close. Max 45s dari drop detection → close action.
- **Reason**: anti-noise (15s recheck) + grace utk close tx lanjut (30s window). Bila market crash cepat, 45s delay bisa rugi lebih. TAPI trailing TP = profit-lock, bukan stop-loss — sudah profit sebelum drop.
- **Bukti**: state.js:318-426, index.js (F2 15s recheck scheduler).

---

## §F. Glosarium istilah fase

- **state.json** — single persistent file utk position registry + recentEvents + briefing keys. Path `paths.statePath` (per-profil isolation).
- **position record** — 35-field object per position: identity + deploy metadata + management + peak/trough + pending confirmations + trailing.
- **`makePositionRecord`** — factory pure fn, shared `trackPosition` + `ensureDeployedAt` (drift-prevention).
- **deployed_at protect** — re-track same address TIDAK reset clock (anti-corrupt minutes-held).
- **active_setup/profile stamp** — racikan/wizard archetype at deploy time, fallback `config.activeSetup`/`config.profile`.
- **peak_pnl_pct** — highest PnL% seen while open, via 15s confirmation (tolerance 0.85).
- **trough_pnl_pct** — lowest PnL% seen, NO confirmation (tracked directly in updatePnlAndCheckExits).
- **price_peak/trough_pct** — raw price excursion vs entry, exact from bin math, NO confirmation.
- **pending confirmation** — 15s recheck window utk peak/trailing (anti noise).
- **toleranceRatio 0.85** — peak confirm threshold (current >= pending × 0.85).
- **trailing_active** — flag trigger once `peak_pnl_pct >= trailingTriggerPct`.
- **confirmed_trailing_exit_until** — 30s exit window after trailing drop confirmed.
- **syncOpenPositions** — auto-close positions missing from on-chain after 5min grace.
- **`SYNC_GRACE_MS`** — 5 menit grace period utk newly deployed positions (may not be indexed yet).
- **recentEvents** — max 20 events, shown in every prompt utk context.
- **`sanitizeStoredText`** — strip newline/`<>`/backtick + slice 280 char utk position instruction.
- **backfill assumption** — `ensureDeployedAt` stamp current racikan utk tracking-lost position, flagged via note.

---

## §G. Link fase lain (cross-ref)

- **F9 (deploy)**: `trackPosition` (state.js:141) dipanggil dlmm.js:877 (live) + 1101 (relay) + paper branch 819-830 (signal_snapshot fee capture). `deployed_at` protect (146) — re-deploy same address anti-corrupt.
- **F10 (close)**: `recordClose` (273) dipanggil dlmm.js:2430. `recordClaim` (249) dipanggil dlmm.js:2162. `recordRebalance` (288) — verifiy call site (UNKNOWN — grep needed).
- **F11 (positions)**: `syncOpenPositions` (672) dipanggil dlmm.js:1803 per getMyPositions. `markInRange/markOutOfRange` (209/223) dipanggil dlmm.js:1970. `ensureDeployedAt` (172) dipanggil dlmm.js:1803 utk on-chain position observed.
- **F12 (close PnL)**: `recordPerformance` (F19) baca tracked fields: `deployed_at` (minutes-held), `total_fees_claimed_usd`, `peak_pnl_pct`/`trough_pnl_pct`, `price_peak_pct`/`price_trough_pct`, `signal_snapshot`, `entry_*` fields, `bin_range`, `active_bin_at_deploy`.
- **F13 (paper isolation)**: `syncOpenPositions` NO `paper_` guard (E1) — paper positions auto-close on DRY_RUN→false flip. `recordClose` + `recordPerformance` `paper:true` tag honored di consumers. F13 §E.
- **F18 (exit poll deep)**: `updatePnlAndCheckExits` (484-600) = jantung risk. F17 ringkas, F18 deep dive 4 exit rules + peak/trough track + trailing state machine + suspicious guard.
- **F19 (capture)**: `recordPerformance` baca tracked utk performance record. `active_setup`/`profile` stamp → racikan-scoped report (F22). `deployed_at` → open_hour_wib/open_session (time-of-day profile).
- **F22 (profile)**: `getPerformanceForRacikan` filter by `active_setup`. `getModePerformance` paper/live filter (paper:true tag).
- **F25 (briefing)**: `getLastBriefingDate`/`setLastBriefingDate` (607/615) + PinId (625/630) + ReportedMilestone (640/645) + PeriodicBriefing (656/660) — semua persist di state.json. `maybeFireLearningReport` (index.js) baca `getLastReportedMilestone`.
- **F29 (paths)**: `paths.statePath` per-profil isolation. state.json tak shared antar profil.

---

## §H. Open-Q (bawa ke fase lain)

- **E1 → F13 follow-up**: `syncOpenPositions` NO `paper_` guard — fix recommendation `if (posId.startsWith("paper_")) continue` di 679. Tiket implementasi?
- **E2 → F17 follow-up**: `save()` fail-open silent — tambah Telegram notify utk state_error kritis? Atau retry save dgn backoff?
- **E4 → F22**: `ensureDeployedAt` ASSUMPTION stamp current racikan — verify impact ke `getPerformanceForRacikan` (F22). Berapa banyak backfilled records di lessons.json punya `active_setup` = current racikan vs actual deploy racikan?
- **`recordRebalance` call site → F10 follow-up**: grep `recordRebalance` caller — siapa yang trigger? dlmm.js? executor.js? UNKNOWN.
- **`pushEvent` consumers → F17 follow-up**: `recentEvents` max 20, shown in prompt via `getStateSummary`. Verify prompt rendering (F5) — apakah semua 10 last events ter-render atau slice lagi?
- **`instruction` field → F30 follow-up**: `setPositionInstruction` (308) — siapa yang set? User via `/set <n> <note>` Telegram command (F30)? Atau LLM tool? Verify call sites.
