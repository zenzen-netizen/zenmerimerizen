# Audit F18 — Mekanis exit poll (mandatory deep) — jantung risk
> Read-only. Bukti `file:line`. UNKNOWN kalau tak pasti. Resume: buka file ini.
> Kedalaman: ⬛⬛ mandatory deep — alasan: 2 evaluator exit paralel (`updatePnlAndCheckExits` state.js:484-600 vs `getDeterministicCloseRule` index.js:1466-1509); 4 + 5 = 9 rule exit (3 overlap SL/OOR-time/low-yield, 2 unique trailing/TP+pump-OOR); 2 caller path (PnL poll 3s index.js:1316-1401 vs management cycle index.js:525-577); PnL poll = direct close via `emergencyCloseDirect` Lever A (no LLM, no cooldown); management cycle = LLM via `actionMap` (CLOSE/CLAIM/STAY/INSTRUCTION); peak/trough + price_peak/trough track sebagai side-effect; `pnl_pct_suspicious` guard skip 3 rule; 15s peak confirmation (tolerance 0.85) + 15s trailing confirmation + 30s exit window = 45s max delay; `confirmed_trailing_exit_until` replay; `trailing_active` state machine sekali trigger stay true; `STOP_LOSS` Lever A emergency no-cooldown vs non-emerg direct close vs cooldown-gated management fallback; `needs_confirmation` gate (TRAILING_TP only) — confirmation-pending lewat management lama, non-confirmation lewat direct close.
> Cross-ref: F2 (runManagementCycle + PnL poll orchestration), F3 (getDeterministicCloseRule 5 rule mekanis + emergencyCloseDirect Lever A + computeBinsBelow), F11 (getMyPositions PnL data source + in_range + active_bin + fee_per_tvl_24h), F17 (state.js registry + peak/trough + 15s confirmation machinery), F19 (recordPerformance baca peak/trough/price_peak/trough utk movement analysis), F24 (reports.js price_movement block + classifyCloseRule mapping), F26 (config.management 12-key: stopLossPct/takeProfitPct/trailingDropPct/trailingTakeProfit/trailingTriggerPct/outOfRangeWaitMinutes/outOfRangeBinsToClose/minFeePerTvl24h/minAgeBeforeYieldCheck/minClaimAmount/solMode/gasReserve).

## Ringkasan eksekutif (5 baris)
1. **2 evaluator exit paralel, 9 rule total** (3 overlap): `updatePnlAndCheckExits` (state.js:484-600) = 4 rule (STOP_LOSS 551 / TRAILING_TP 559 / OUT_OF_RANGE 574 / LOW_YIELD 585) + track peak/trough/price_peak/trough/OOR/trailing sebagai side-effect. `getDeterministicCloseRule` (index.js:1466-1509) = 5 rule pure (rule 1 SL 1480 / rule 2 TP 1485 / rule 3 pump-OOR 1490 / rule 4 OOR-time 1495 / rule 5 low-yield 1500). Overlap: SL/OOR-time/low-yield (3 rule di kedua evaluator). Unique updatePnlAndCheckExits: TRAILING_TP (needs `peak_pnl_pct` + confirmation). Unique getDeterministicCloseRule: TP (fixed `pnl >= takeProfitPct`) + pump-OOR (`active_bin > upper_bin + outOfRangeBinsToClose`). Order: updatePnlAndCheckExits FIRST (return pertama menang), getDeterministicCloseRule SECOND bila no exit.
2. **2 caller path**: (a) PnL poll 3s `setInterval` (index.js:1309-1401) per position: queuePeakConfirmation (1319) → updatePnlAndCheckExits (1324) → if exit: handle (TRAILING_TP confirm / STOP_LOSS emergency / non-emerg direct / cooldown mgmt fallback) → if no exit: getDeterministicCloseRule (1370) → handle (rule 1 emergency / rule 2-5 direct). (b) Management cycle `runManagementCycle` (index.js:525-577): same per-position loop → exitMap (549) → actionMap (547) → LLM MANAGER via agentLoop (605) utk actionPositions. PnL poll = direct close (Lever A, no LLM); management cycle = LLM via actionMap.
3. **`emergencyCloseDirect` Lever A** (F3:1207-1248): close LLM-free, NO cooldown, hold `_managementBusy` sendiri (1212) → management cron skip (anti double-close). STOP_LOSS = emergency (1333) → no cooldown. Non-emerg exit `!needs_confirmation` (1348) → direct close. Gagal → `needFallback` → `runManagementCycle({silent:true})` ASAP (1341/1354/1378/1390, no cooldown). Skipped (management busy) → continue, biarkan cycle itu tangani. Return `{success, skipped, needFallback}`.
4. **`pnl_pct_suspicious` guard** (state.js:506/551/559): bila PnL suspicious (RPC noise/anomaly) → skip trough track (506) + skip SL (551 `!pnl_pct_suspicious`) + skip trailing (559). TAPI OOR (574) + low-yield (585) TIDAK guard — masih jalan walau PnL suspicious. Reason: OOR/low-yield tak bergantung PnL value (OOR dari in_range, low-yield dari fee_per_tvl_24h). SL/trailing bergantung PnL accurate. Peak confirmation (index.js:1318) juga skip bila suspicious — anti-noise.
5. **15s + 15s + 30s = 45s max trailing exit delay** (state.js:318-426): peak detected → `queuePeakConfirmation` pending 15s → `resolvePendingPeak` (tolerance 0.85, current >= pending × 0.85) → confirm `peak_pnl_pct`. Trailing drop detected (`dropFromPeak >= trailingDropPct`) → `queueTrailingDropConfirmation` pending 15s → `resolvePendingTrailingDrop` (`stillNearCrash AND stillDroppedEnough`) → confirm + `confirmed_trailing_exit_until = now + 30s` exit window. Next `updatePnlAndCheckExits` poll baca `confirmed_trailing_exit_until` (490-500) → return `{action:"TRAILING_TP", confirmed_recheck:true}`. Max 45s dari drop detection → close. `trailing_active` (531) sekali trigger `peak_pnl_pct >= trailingTriggerPct` → stay true, never reset (until close). `shouldUsePnlRecheck()` gate — bila false (RPC trusted), `immediate:true` skip queue (327-334).

## Progress
- [x] Baca state.js 484-600 (updatePnlAndCheckExits full)
- [x] Baca index.js 1316-1401 (PnL poll per-position loop)
- [x] Baca index.js 525-577 (management cycle per-position loop + actionMap)
- [x] Cross-ref F3 (getDeterministicCloseRule 5 rule + emergencyCloseDirect Lever A + computeBinsBelow)
- [x] Cross-ref F17 (peak/trough + 15s confirmation + syncOpenPositions)
- [x] Cross-ref F11 (getMyPositions PnL data: pnl_pct/pnl_pct_suspicious/in_range/active_bin/fee_per_tvl_24h/age_minutes)
- [x] Cross-ref F26 (config.management 12-key defaults)
- [x] Detect 2 evaluator paralel + 3 overlap + 2 unique each
- [x] Detect 2 caller path (PnL poll direct vs management cycle LLM)
- [x] Detect pnl_pct_suspicious guard asymmetri (SL/trailing skip, OOR/low-yield jalan)
- [x] Detect 45s max trailing exit delay
- [x] Tulis §0 + §A-§H

---

## §0. Cara Kerja (Bahasa Awam)

**Analogi** (dua sudut pandang sehari-hari)
- *2 alarm rumah berlapis*: alarm A (`updatePnlAndCheckExits`) = alarm gerak dgn camera trap 15-detik — bunyi "STOP_LOSS" (pintu depan dibongkar), "TRAILING_TP" (tamudatang lalu pergi tiba-tiba, perlu 15s konfirmasi + 30s grace utk close), "OUT_OF_RANGE" (tamu keluar halaman >30menit), "LOW_YIELD" (tamu duduk 1 jam tapi tak beli apa-apa). Alarm B (`getDeterministicCloseRule`) = alarm pintu pure-mekanis — bunyi "TP" (target profit tercapai), "pump-OOR" (harga naik terlalu tinggi lewat range atas). Alarm A jalan dulu, bunyi → tamu diusir langsung (Lever A emergency, no cooldown). Alarm A diam → alarm B cek. Bunyi B → tamu diusir langsung. Alarm A + B sama-sama bunyi "STOP_LOSS/OOR/low-yield" → A menang (sudah ditangani).
- *Satpam 2 shift*: shift PnL poll (3 detik) = satpam jalan terus, kalau ada exit alert → usir tamu langsung (emergencyCloseDirect, no LLM, no tunggu bos). Shift management cycle (10 menit) = satpam lapor ke bos (LLM MANAGER) via actionMap, bos yang putuskan CLOSE/CLAIM/STAY. PnL poll = cepat tapi direct; management cycle = lambat tapi informed. Bila PnL poll gagal usir → lapor bos ASAP (runManagementCycle fallback). Bila PnL poll berhasil → management cycle skip (sudah bersih).

**Di bot, ini = jantung risk management mekanis NO-AI** (1-2 kalimat)
2 evaluator exit (4+5 rule) dipanggil 2 path (PnL poll 3s direct close vs management cycle 10min LLM). `updatePnlAndCheckExits` track peak/trough + 4 rule (SL/trailing/OOR/low-yield) + 15s confirmation. `getDeterministicCloseRule` 5 rule pure (SL/TP/pump-OOR/OOR-time/low-yield). `emergencyCloseDirect` Lever A = close LLM-free no-cooldown utk emergency.

**Posisi fase ini di alur bot** (1 paragraf)
Datang setelah F11 (getMyPositions sediakan PnL data) + F17 (state.js registry + 15s confirmation machinery). Sebelum F3 (getDeterministicCloseRule detail — F18 integrasi dgn updatePnlAndCheckExits) + F10 (closePosition execution) + F19 (recordPerformance baca peak/trough). F18 = JANTUNG: tiap 3 detik, bot evaluasi 9 rule exit per position. Tanpa F18, posisi terbuka tanpa SL/trailing/OOR/low-yield monitoring → rugi tak terkontrol.

**Langkah kerja** (5-10 nomor, istilah teknis)
1. Trigger PnL poll: `setInterval` 3s (index.js:1309) → `getMyPositions({force:true})` → loop per position (1316).
2. Peak confirm queue: `queuePeakConfirmation(p.position, p.pnl_pct, {immediate: !shouldUsePnlRecheck()})` (1319) — bila `!pnl_pct_suspicious && candidate > current peak` → pending 15s. `immediate:true` (RPC trusted) → skip queue, langsung set peak.
3. `updatePnlAndCheckExits(p.position, p, config.management)` (1324) — track trough + price_peak/trough + trailing_active + OOR + 4 rule (SL/trailing/OOR-time/low-yield). Return `{action, reason}` or null.
4. If exit.action === "TRAILING_TP" && needs_confirmation && shouldUsePnlRecheck (1326): `queueTrailingDropConfirmation` + `scheduleTrailingDropConfirmation` 15s + continue (skip close, tunggu recheck).
5. If exit.action === "STOP_LOSS" (1333): `emergencyCloseDirect(p, exit.reason)` Lever A — no cooldown. Success → break. needFallback → `runManagementCycle({silent:true})` ASAP (1341). skipped → continue.
6. If exit !needs_confirmation (1348): `emergencyCloseDirect` direct close. Success → break. needFallback → mgmt fallback. skipped → continue.
7. If exit needs_confirmation + cooldown (1359-1367): bila `sinceLastTrigger >= mgmtInterval` → `runManagementCycle({silent:true})`. Else → log cooldown.
8. If NO exit (1369): `getDeterministicCloseRule(p, config.management)` (1370) — 5 rule pure.
9. If closeRule.rule === 1 (SL) (1373): `emergencyCloseDirect` emergency. Fallback mgmt. skipped continue.
10. If closeRule.rule 2-5 (1385): `emergencyCloseDirect` direct close. Fallback mgmt. skipped continue.
11. Management cycle path (index.js:525-577): same per-position loop → exitMap (539) → actionMap (549: `if exitMap.has → {action:"CLOSE", rule:"exit"}`) → getDeterministicCloseRule (559) → indicatorExit (566) → CLAIM (572) → STAY (576). actionPositions → LLM MANAGER (605).

**Output exit evaluators**: `{action: "STOP_LOSS"|"TRAILING_TP"|"OUT_OF_RANGE"|"LOW_YIELD", reason}` (updatePnlAndCheckExits) or `{rule: 1-5, reason}` (getDeterministicCloseRule) or null (STAY). Side-effect: peak/trough/price_peak/trough/OOR/trailing_active/pending fields updated di state.json. Cross-ref F10 (closePosition execution) + F19 (recordPerformance baca tracked).

**Kalau rusak / diskip** (2-3 kalimat, istilah teknis)
`updatePnlAndCheckExits` throw (state.json corrupt) → PnL poll `try/finally _pnlPollBusy=false` (1398-1400) → silent continue. SL/trailing/OOR/low-yield monitoring broken → posisi terbuka tanpa exit mekanis → rugi tak terkontrol. `pnl_pct_suspicious` terus-menerus true (RPC noise) → SL+trailing skip selamanya → hanya OOR+low-yield jalan → exit rules incomplete. `shouldUsePnlRecheck()` false (RPC trusted) → immediate peak set, no 15s confirmation → peak bisa noise (PnL spike sebentar) → trailing trigger premature.

**Istilah yang muncul di fase ini** (bullet, cuma yang baru)
- **2 evaluator paralel** — `updatePnlAndCheckExits` (state.js, 4 rule + side-effect) vs `getDeterministicCloseRule` (index.js, 5 rule pure).
- **3 overlap rule** — SL/OOR-time/low-yield ada di kedua evaluator. updatePnlAndCheckExits return pertama menang.
- **2 unique updatePnlAndCheckExits** — TRAILING_TP (needs peak + confirmation), side-effect track peak/trough/price_peak/trough.
- **2 unique getDeterministicCloseRule** — TP (fixed take-profit), pump-OOR (active_bin > upper + outOfRangeBinsToClose).
- **2 caller path** — PnL poll 3s direct close (Lever A) vs management cycle 10min LLM (actionMap).
- **Lever A emergency** — `emergencyCloseDirect` close LLM-free, no cooldown, hold `_managementBusy`.
- **needs_confirmation** — TRAILING_TP only. Confirmation-pending lewat management lama, non-confirmation lewat direct close.
- **pnl_pct_suspicious guard** — skip trough + SL + trailing. OOR + low-yield tetap jalan (tidak bergantung PnL accurate).
- **trailing_active** — state machine, sekali trigger `peak_pnl_pct >= trailingTriggerPct` → stay true until close.
- **confirmed_trailing_exit_until** — 30s exit window after trailing drop confirmed. Next poll replay exit.
- **45s max trailing delay** — 15s peak + 15s trailing + 30s exit window.
- **shouldUsePnlRecheck** — gate utk 15s confirmation. false (RPC trusted) → immediate peak set, no queue.

*Lewati §0 kalau sudah paham. Isi teknis mulai §A.*

---

## §A. Peta block fase ini (file:line → peran)

| file:line | simbol | peran |
|---|---|---|
| state.js:484-600 | `updatePnlAndCheckExits` | evaluator A: 4 rule + side-effect track peak/trough/OOR/trailing |
| state.js:485 | destructure | `{pnl_pct: currentPnlPct, pnl_pct_suspicious, in_range, fee_per_tvl_24h}` dari positionData |
| state.js:488 | guard | `if (!pos \|\| pos.closed) return null` |
| state.js:490-500 | `confirmed_trailing_exit_until` replay | within 30s → return `{action:"TRAILING_TP", confirmed_recheck:true}` |
| state.js:502 | `let changed = false` | tracking dirty flag |
| state.js:506-511 | trough_pnl_pct track | `currentPnlPct < pos.trough_pnl_pct` → update; skip if suspicious |
| state.js:513-528 | price_peak/trough track | bin math `(1+step/1e4)^(binNow-binEntry)−1`×100; exact, no confirmation |
| state.js:516-518 | binNow/binEntry resolve | `positionData.active_bin` vs `pos.active_bin_at_deploy ?? pos.bin_range?.active` |
| state.js:531-535 | trailing_active trigger | `peak_pnl_pct >= trailingTriggerPct` → set true, log |
| state.js:538-546 | OOR state update | `in_range===false` → set; `in_range===true` → clear |
| state.js:548 | `if (changed) save()` | persist tracking |
| state.js:551-556 | exit rule 1: STOP_LOSS | `!suspicious && currentPnlPct <= stopLossPct` → return |
| state.js:559-571 | exit rule 2: TRAILING_TP | `!suspicious && trailing_active && dropFromPeak >= trailingDropPct` → return + needs_confirmation |
| state.js:574-582 | exit rule 3: OUT_OF_RANGE | `out_of_range_since && minutesOOR >= outOfRangeWaitMinutes` → return |
| state.js:585-597 | exit rule 4: LOW_YIELD | `fee_per_tvl_24h < minFeePerTvl24h AND age >= minAgeBeforeYieldCheck` → return |
| state.js:599 | return null | STAY |
| index.js:1316-1401 | PnL poll per-position loop | caller path A: direct close via emergencyCloseDirect |
| index.js:1318-1323 | peak confirm queue | `!suspicious && queuePeakConfirmation && shouldUsePnlRecheck` → schedule 15s |
| index.js:1324 | updatePnlAndCheckExits call | evaluator A |
| index.js:1326-1331 | TRAILING_TP confirm | `needs_confirmation && shouldUsePnlRecheck` → queue + schedule + continue |
| index.js:1333-1345 | STOP_LOSS emergency | `emergencyCloseDirect` Lever A; fallback mgmt ASAP |
| index.js:1348-1358 | non-emerg direct close | `!needs_confirmation` → emergencyCloseDirect; fallback mgmt |
| index.js:1359-1367 | cooldown-gated mgmt | `needs_confirmation && sinceLastTrigger >= mgmtInterval` → runManagementCycle |
| index.js:1370-1396 | getDeterministicCloseRule | evaluator B (if no exit from A) |
| index.js:1373-1383 | rule 1 emergency | SL → emergencyCloseDirect |
| index.js:1385-1395 | rule 2-5 direct | TP/pump-OOR/OOR-time/low-yield → emergencyCloseDirect |
| index.js:525-577 | management cycle per-position loop | caller path B: LLM via actionMap |
| index.js:525-530 | peak confirm queue | same dgn PnL poll |
| index.js:531-541 | updatePnlAndCheckExits + exitMap | `exitMap.set(p.position, exit.reason)` (539) |
| index.js:547-577 | actionMap build | exitMap has → CLOSE/exit; instruction → INSTRUCTION; getDeterministicCloseRule → closeRule; indicatorExit → indicator; claim → CLAIM; else STAY |
| index.js:549-552 | exitMap → CLOSE | `actionMap.set(p.position, {action:"CLOSE", rule:"exit", reason:exitMap.get})` |
| index.js:559-563 | getDeterministicCloseRule | evaluator B (same logic, called if no exitMap) |
| index.js:566-570 | indicatorExit (F3) | opt-in `indicators.exitEnabled` — upgrade STAY/CLAIM → CLOSE |
| index.js:572-575 | CLAIM rule | `unclaimed_fees_usd >= minClaimAmount` → CLAIM |
| index.js:585-588 | actionPositions filter | `action !== "STAY"` |
| index.js:605-621 | LLM MANAGER call | `agentLoop(...)` utk actionPositions |
| index.js:1466-1509 | `getDeterministicCloseRule` (F3) | 5 rule pure: SL/TP/pump-OOR/OOR-time/low-yield |
| index.js:1207-1248 | `emergencyCloseDirect` (F3) | Lever A close LLM-free, hold _managementBusy |
| state.js:318-368 | `queuePeakConfirmation`/`resolvePendingPeak` (F17) | 15s peak confirm, tolerance 0.85 |
| state.js:370-426 | `queueTrailingDropConfirmation`/`resolvePendingTrailingDrop` (F17) | 15s trailing confirm + 30s exit window |

---

## §B. Alur data: PnL poll → 2 evaluator → direct close / LLM

```
PnL POLL (setInterval 3s, index.js:1309)
  └─ getMyPositions({force:true}) → result.positions[]
      └─ FOR p in result.positions (1316):
          │
          ├─ Step 1: Peak confirm queue (1318-1323)
          │   └─ if (!p.pnl_pct_suspicious && queuePeakConfirmation(p.position, p.pnl_pct, {immediate: !shouldUsePnlRecheck()}) && shouldUsePnlRecheck())
          │       └─ schedulePeakConfirmation(p.position)  ← 15s recheck
          │
          ├─ Step 2: updatePnlAndCheckExits (1324) → evaluator A
          │   └─ state.js:484-600:
          │       ├─ if (!pos || pos.closed) return null (488)
          │       ├─ if (confirmed_trailing_exit_until && within 30s) → return {action:"TRAILING_TP", confirmed_recheck:true} (490-500)
          │       ├─ track trough_pnl_pct (506-511, skip if suspicious)
          │       ├─ track price_peak/trough via bin math (516-528)
          │       ├─ trailing_active trigger (531-535)
          │       ├─ OOR state update (538-546)
          │       ├─ if (changed) save() (548)
          │       ├─ rule 1 STOP_LOSS: !suspicious && currentPnlPct <= stopLossPct → return (551-556)
          │       ├─ rule 2 TRAILING_TP: !suspicious && trailing_active && dropFromPeak >= trailingDropPct → return + needs_confirmation (559-571)
          │       ├─ rule 3 OUT_OF_RANGE: out_of_range_since && minutesOOR >= outOfRangeWaitMinutes → return (574-582)
          │       ├─ rule 4 LOW_YIELD: fee_per_tvl_24h < minFeePerTvl24h && age >= minAgeBeforeYieldCheck → return (585-597)
          │       └─ return null (599)
          │
          ├─ Step 3: if exit (1325-1368):
          │   ├─ TRAILING_TP + needs_confirmation + shouldUsePnlRecheck (1326-1331):
          │   │   └─ queueTrailingDropConfirmation + scheduleTrailingDropConfirmation 15s + continue
          │   ├─ STOP_LOSS (1333-1345):
          │   │   └─ emergencyCloseDirect(p, exit.reason) Lever A — no cooldown
          │   │       ├─ success → break
          │   │       ├─ needFallback → runManagementCycle({silent:true}) ASAP + break
          │   │       └─ skipped → continue (management busy)
          │   ├─ !needs_confirmation (1348-1358):
          │   │   └─ emergencyCloseDirect(p, exit.reason) direct close
          │   │       ├─ success → break
          │   │       ├─ needFallback → runManagementCycle + break
          │   │       └─ skipped → continue
          │   └─ needs_confirmation + cooldown (1359-1367):
          │       ├─ sinceLastTrigger >= mgmtInterval → runManagementCycle({silent:true})
          │       └─ else → log cooldown
          │       break
          │
          └─ Step 4: if NO exit (1369-1396):
              └─ getDeterministicCloseRule(p, config.management) → evaluator B
                  ├─ rule 1 SL (1373-1383): emergencyCloseDirect emergency
                  └─ rule 2-5 (1385-1395): emergencyCloseDirect direct
                      ├─ success → break
                      ├─ needFallback → runManagementCycle + break
                      └─ skipped → continue

MANAGEMENT CYCLE (runManagementCycle, index.js:525-577)
  └─ FOR p in positionData (525):
      ├─ peak confirm queue (525-530) — same dgn PnL poll
      ├─ updatePnlAndCheckExits (531) → if exit: exitMap.set(p.position, exit.reason) (539)
      └─ (loop selesai)
  └─ FOR p in positionData (547-577) — actionMap build:
      ├─ if (exitMap.has(p.position)) → actionMap.set({action:"CLOSE", rule:"exit", reason}) (549-552)
      ├─ if (p.instruction) → actionMap.set({action:"INSTRUCTION"}) (554-556)
      ├─ getDeterministicCloseRule (559) → if closeRule: actionMap.set(closeRule) (560-563)
      ├─ getIndicatorExitSignal (566, F3 opt-in) → if indicatorExit: actionMap.set(indicatorExit) (567-570)
      ├─ if (unclaimed_fees_usd >= minClaimAmount) → actionMap.set({action:"CLAIM"}) (572-575)
      └─ else → actionMap.set({action:"STAY"}) (576)
  └─ actionPositions = filter !STAY (585-588)
  └─ if (actionPositions.length > 0): agentLoop LLM MANAGER (605-621)
  └─ else: log "all positions STAY — skipping LLM" (625)
```

---

## §C. Sinkron: siapa-panggil-siapa

| Pemanggil (file:line) | Dipanggil (file:line) | Trigger | Data lewat | Fail-mode |
|---|---|---|---|---|
| index.js:1316 PnL poll loop | state.js:318 `queuePeakConfirmation` | per position, 3s | `(position, pnl_pct, {immediate})` | suspicious → skip (1318) |
| index.js:1324 PnL poll | state.js:484 `updatePnlAndCheckExits` | per position, 3s | `(position, positionData, config.management)` | pos missing/closed → null (488) |
| index.js:1327 PnL poll | state.js:370 `queueTrailingDropConfirmation` | TRAILING_TP needs_confirmation | `(position, peak, current, trailingDropPct)` | drop < trailingDropPct → false (373) |
| index.js:1334/1349/1374/1386 PnL poll | index.js:1207 `emergencyCloseDirect` (F3) | exit alert / close rule | `(position, reason)` | needFallback → mgmt fallback |
| index.js:1341/1354/1378/1390 PnL poll | `runManagementCycle({silent:true})` | emergencyCloseDirect fail | — | catch log |
| index.js:1370 PnL poll | index.js:1466 `getDeterministicCloseRule` (F3) | no exit from A | `(p, config.management)` | return null (STAY) |
| index.js:531 management cycle | state.js:484 `updatePnlAndCheckExits` | per position, 10min | same | same |
| index.js:559 management cycle | index.js:1466 `getDeterministicCloseRule` (F3) | no exitMap | `(p, config.management)` | return null |
| index.js:566 management cycle | index.js:1515 `getIndicatorExitSignal` (F3) | no close rule | `(p)` | opt-in `indicators.exitEnabled` default OFF → null |
| index.js:605 management cycle | agent.js `agentLoop` | actionPositions > 0 | `(prompt, maxSteps, [], "MANAGER", model, 2048, callbacks)` | LLM error → catch log |
| state.js:349 `resolvePendingPeak` | (called by index.js 15s recheck scheduler) | scheduled recheck | `(position, currentPnl, 0.85)` | pending null → {confirmed:false} |
| state.js:395 `resolvePendingTrailingDrop` | (called by index.js 15s recheck scheduler) | scheduled recheck | `(position, current, drop, 1.0)` | pending null → {confirmed:false} |

---

## §D. Logika kunci per fungsi

### `updatePnlAndCheckExits` (state.js:484-600) — evaluator A
- **Apa**: track peak/trough/price_peak/trough/OOR/trailing + 4 rule exit (SL/trailing/OOR-time/low-yield). Return `{action, reason}` or null.
- **Kapan dipicu**: PnL poll 3s (index.js:1324) + management cycle 10min (index.js:531).
- **Output**: 4 action `STOP_LOSS`/`TRAILING_TP`/`OUT_OF_RANGE`/`LOW_YIELD` + side-effect mutate `pos` (trough/price_peak/trough/trailing_active/OOR/pending fields).
- **Sinkron**: PnL poll baca exit → direct close. Management cycle baca exit → exitMap → actionMap → LLM. `recordPerformance` (F19) baca `peak_pnl_pct`/`trough_pnl_pct`/`price_peak_pct`/`price_trough_pct` utk movement analysis.
- **Fail-mode**: `pos` missing/closed → null (488). `pnl_pct_suspicious` → skip trough (506) + SL (551) + trailing (559). OOR + low-yield TETAP jalan. `confirmed_trailing_exit_until` replay (490-500) — return TRAILING_TP confirmed_recheck.
- **Bukti**: state.js:484-600.

### `getDeterministicCloseRule` (index.js:1466-1509) — evaluator B (F3 detail)
- **Apa**: 5 rule pure mekanis (SL/TP/pump-OOR/OOR-time/low-yield). No side-effect, no peak, no confirmation.
- **Kapan dipicu**: PnL poll (index.js:1370) bila evaluator A return null. Management cycle (index.js:559) bila no exitMap.
- **Output**: `{rule: 1-5, reason}` or null (STAY).
- **Sinkron**: PnL poll direct close via emergencyCloseDirect. Management cycle → actionMap → LLM.
- **Fail-mode**: pure fn, no throw. `pnl` null → rule 1/2 skip (pnl comparison false). `active_bin`/`upper_bin` null → rule 3 skip. `out_of_range_since` null → rule 4 skip. `fee_per_tvl_24h` null → rule 5 skip.
- **Bukti**: index.js:1466-1509, F3 §D.

### `emergencyCloseDirect` (index.js:1207-1248) — Lever A (F3 detail)
- **Apa**: close LLM-free, NO cooldown, hold `_managementBusy` sendiri (anti double-close). Return `{success, skipped, needFallback}`.
- **Kapan dipicu**: PnL poll exit alert (1334/1349) + close rule (1374/1386). NOT management cycle (cycle pakai LLM).
- **Output**: `{success: bool, skipped: bool, needFallback: bool}`. success → position closed. skipped → management busy. needFallback → close attempted & failed, perlu management cycle ASAP.
- **Sinkron**: hold `_managementBusy` (1212) → management cron skip bila overlapping. Release di finally. Auto-swap + notify (F10).
- **Fail-mode**: close tx fail → needFallback=true → caller runManagementCycle ASAP. Management busy → skipped=true → continue (biarkan cycle itu tangani).
- **Bukti**: index.js:1207-1248, F3 §D.

### Peak confirmation flow (state.js:318-368, F17 detail)
- **Apa**: 15s peak PnL recheck. Anti-noise — PnL spike sebentar lalu drop jangan confirm sebagai peak.
- **Kapan dipicu**: PnL poll (index.js:1319) + management cycle (index.js:526) per position, bila `!suspicious && candidate > current peak && shouldUsePnlRecheck()`.
- **Output**: queue → `pending_peak_pnl_pct` + `pending_peak_started_at`. resolve → `peak_pnl_pct = Math.max(peak, pending, current)` bila confirm.
- **Sinkron**: `peak_pnl_pct` → `trailing_active` trigger (531) + `trailing_drop` check (560). `recordPerformance` baca utk movement.
- **Fail-mode**: `immediate:true` (RPC trusted, `!shouldUsePnlRecheck()`) → skip queue, langsung set peak (327-334). `toleranceRatio=0.85` — current >= pending × 0.85 → confirm (longgar 15%).
- **Bukti**: state.js:318-368, F17 §D.

### Trailing drop confirmation flow (state.js:370-426, F17 detail)
- **Apa**: 15s trailing drop recheck + 30s exit window. Bila PnL drop from peak >= trailingDropPct → queue 15s, recheck, confirm → 30s exit window.
- **Kapan dipicu**: PnL poll (index.js:1327) bila `exit.action === "TRAILING_TP" && needs_confirmation && shouldUsePnlRecheck()`.
- **Output**: queue → `pending_trailing_*` fields. confirm → `confirmed_trailing_exit_reason` + `confirmed_trailing_exit_until = now + 30s` (417). Next `updatePnlAndCheckExits` poll baca (490-500) → return `{action:"TRAILING_TP", confirmed_recheck:true}`.
- **Sinkron**: PnL poll next 3s cycle replay exit → emergencyCloseDirect (bila !needs_confirmation lagi, karena confirmed_recheck=true).
- **Fail-mode**: `tolerancePct=1.0` — `current <= pendingCurrent + 1.0` (longgar 1%). `stillDroppedEnough = (pendingPeak - current) >= trailingDropPct`. Bila salah satu false → reject.
- **Bukti**: state.js:370-426, F17 §D.

### Management cycle actionMap (index.js:547-577)
- **Apa**: build per-position action (CLOSE/CLAIM/STAY/INSTRUCTION/indicator) utk LLM MANAGER. Prioritas: exitMap > instruction > closeRule > indicatorExit > CLAIM > STAY.
- **Kapan dipicu**: `runManagementCycle` (index.js:471) cron 10min OR fallback dari PnL poll.
- **Output**: `actionMap` Map per position. `actionPositions = filter !STAY` → LLM.
- **Sinkron**: LLM MANAGER baca actionBlocks (593-603) → execute close_position/claim_fees per action. Tidak re-evaluate — "rules already applied. Just execute" (616).
- **Fail-mode**: LLM error → catch log. actionPositions=0 → skip LLM (624-627).
- **Bukti**: index.js:547-577, 585-627.

---

## §E. Temuan: bug / gap / kontrak-kunci / fail-open tak-terpenuhi

### E1. GAP — 3 rule overlap antara 2 evaluator (redundant, harmless tapi noisy)
- **Lokasi**: `updatePnlAndCheckExits` (state.js:551-597) vs `getDeterministicCloseRule` (index.js:1466-1509).
- **Overlap**: SL (A:551 / B:rule 1), OOR-time (A:574 / B:rule 4), low-yield (A:585 / B:rule 5).
- **Masalah**: evaluator A return pertama → B skip (PnL poll 1369 `if no exit`; management cycle 549 `if exitMap.has → CLOSE/exit, skip closeRule`). Redundant logic — bila threshold berubah di config, 2 tempat harus update (drift risk, seperti F14 funnel re-filter).
- **Impact**: low — A return menang, B hanya fallback utk TP/pump-OOR yang A tak cover. TAPI bila A bug (e.g. suspicious guard terus-menerus true) → B still catch SL/OOR/low-yield (defense-in-depth, POSITIF).
- **Kontrak**: 2 evaluator sengaja — A = stateful (peak/trailing), B = pure (TP/pump-OOR). Overlap = defense-in-depth, bukan bug.
- **Bukti**: state.js:551-597, index.js:1466-1509.

### E2. GAP — `pnl_pct_suspicious` guard asymmetri
- **Lokasi**: state.js:506 (trough skip) + 551 (SL skip `!pnl_pct_suspicious`) + 559 (trailing skip `!pnl_pct_suspicious`). TAPI 574 (OOR) + 585 (low-yield) TIDAK guard.
- **Kontrak**: OOR dari `in_range` (bin position, exact dari DLMM), low-yield dari `fee_per_tvl_24h` (on-chain fee, tidak bergantung PnL accurate). SL/trailing bergantung PnL value → suspicious skip masuk akal.
- **Impact**: bila `pnl_pct_suspicious` true berkepanjangan (RPC noise) → SL+trailing skip selamanya → hanya OOR+low-yield jalan → exit rules incomplete. Posisi bisa rugi dalam tanpa SL trigger.
- **Severity**: medium — `pnl_pct_suspicious` should be transient (RPC intermittent). TAPI bila persistent → SL blind.
- **Fix**: verify `pnl_pct_suspicious` source (F11 getMyPositions) — kapan true? Bila RPC pnh consensus, fallback ke Meteora API? Atau fail-closed (treat suspicious as SL trigger utk safety)?
- **Bukti**: state.js:506, 551, 559, 574, 585.

### E3. GAP — `trailing_active` sekali trigger stay true (never reset until close)
- **Lokasi**: state.js:531-535. `if (mgmtConfig.trailingTakeProfit && !pos.trailing_active && peak_pnl_pct >= trailingTriggerPct) → pos.trailing_active = true`.
- **Kontrak**: trailing_active = "once peak reached, monitor drops". Sekali true → stay true until close. Tidak ada reset bila PnL drop kembali ke 0.
- **Impact**: bila PnL peak 5% (trigger), drop ke 2%, lalu naik kembali ke 10% — trailing_active tetap true dari 5% onwards. trailing_drop check (560) = `peak_pnl_pct - currentPnlPct >= trailingDropPct`. peak_pnl_pct update via 15s confirmation. Jadi trailing drop trigger relatif terhadap peak tertinggi, bukan peak terakhir.
- **Severity**: low — ini kontrak yang diinginkan (trailing TP = lock profit dari peak tertinggi). TAPI user might expect "reset bila PnL drop below trailingTriggerPct" (re-arm). Tidak di-implement.
- **Bukti**: state.js:531-535, comment.

### E4. KONTRAK — 45s max trailing exit delay
- **Lokasi**: 15s peak (state.js:318-368) + 15s trailing (370-426) + 30s exit window (417).
- **Kontrak**: peak detected → 15s recheck → confirm → drop detected → 15s recheck → confirm → 30s exit window → close. Max 45s dari drop detection → close action.
- **Reason**: anti-noise (15s recheck) + grace utk close tx lanjut (30s window). Bila market crash cepat, 45s delay bisa rugi lebih. TAPI trailing TP = profit-lock, bukan stop-loss — sudah profit sebelum drop.
- **Trade-off**: 45s delay vs noise rejection. Bila user mau fast exit, set `shouldUsePnlRecheck()=false` (RPC trusted) → immediate peak set, no 15s queue. TAPI trailing drop confirmation masih jalan (1326 `needs_confirmation && shouldUsePnlRecheck()`).
- **Bukti**: state.js:318-426, index.js:1326-1331.

### E5. KONTRAK — PnL poll direct close vs management cycle LLM
- **Lokasi**: PnL poll (index.js:1333-1395) `emergencyCloseDirect` vs management cycle (index.js:605) `agentLoop LLM`.
- **Kontrak**: PnL poll = fast path, direct close LLM-free (Lever A). Management cycle = slow path, LLM MANAGER execute. PnL poll trigger fallback ke management cycle bila emergencyCloseDirect fail (needFallback).
- **Reason**: SL/OOR/low-yield = emergency, tidak perlu LLM thinking. LLM utk CLAIM/INSTRUCTION/edge case. PnL poll = real-time (3s), management cycle = scheduled (10min).
- **Sinkron**: `_managementBusy` guard (F3:1212) — emergencyCloseDirect hold sendiri → management cron skip bila overlapping. Anti double-close.
- **Bukti**: index.js:1333-1395, 547-577, F3:1207-1248.

### E6. KONTRAK — `confirmed_trailing_exit_until` replay mechanism
- **Lokasi**: state.js:490-500.
- **Kontrak**: bila `confirmed_trailing_exit_until` dalam 30s window + `confirmed_trailing_exit_reason` set → return `{action:"TRAILING_TP", confirmed_recheck:true}` langsung (skip 4 rule). Clear setelah return (493-494).
- **Reason**: trailing drop confirmation (15s recheck) → confirm → set 30s exit window. Next PnL poll (3s) baca → return TRAILING_TP tanpa re-evaluate. PnL poll caller (index.js:1325) handle exit → `!needs_confirmation` (karena `confirmed_recheck:true` tidak set needs_confirmation) → emergencyCloseDirect direct close.
- **Impact**: 30s window = grace utk close tx. Bila close gagal dalam 30s → `confirmed_trailing_exit_until` expire → next poll re-evaluate dari awal (mungkin peak/trailing berubah).
- **Bukti**: state.js:490-500, 414-418.

### E7. KONTRAK — `shouldUsePnlRecheck()` gate
- **Lokasi**: index.js:1318-1323 (peak) + 1326-1331 (trailing).
- **Kontrak**: bila `shouldUsePnlRecheck()` true → 15s confirmation queue. false (RPC trusted) → `immediate:true` skip queue (state.js:327-334) → langsung set peak.
- **Reason**: RPC source trusted → no noise → no need 15s recheck. Meteora API source → noise possible → 15s recheck.
- **Config**: verify `shouldUsePnlRecheck()` source (config.pnl.source? F11/F26). Default?
- **Bukti**: index.js:1318-1323, state.js:327-334.

### E8. GAP — management cycle `exitMap` lewat LLM, PnL poll `exitMap` lewat direct close
- **Lokasi**: management cycle (index.js:539 `exitMap.set(p.position, exit.reason)`) → actionMap (549 `CLOSE/exit`) → LLM (605). PnL poll (index.js:1324) → emergencyCloseDirect (1334/1349).
- **Asymmetri**: same `updatePnlAndCheckExits` return, 2 path berbeda. Management cycle = LLM execute (could re-evaluate, but prompt says "Do NOT re-evaluate" 616). PnL poll = direct execute.
- **Impact**: bila LLM gagal close (model error, tool fail) → exitMap position tetap open. PnL poll next 3s akan re-trigger → direct close. Defense-in-depth.
- **Bukti**: index.js:539, 549-552, 605-621, 1324, 1334-1345.

---

## §F. Glosarium istilah fase

- **2 evaluator paralel** — `updatePnlAndCheckExits` (state.js, 4 rule + side-effect) vs `getDeterministicCloseRule` (index.js, 5 rule pure).
- **3 overlap rule** — SL/OOR-time/low-yield ada di kedua evaluator. A return pertama menang.
- **2 unique A** — TRAILING_TP (needs peak + confirmation), side-effect track peak/trough/price_peak/trough.
- **2 unique B** — TP (fixed take-profit `pnl >= takeProfitPct`), pump-OOR (`active_bin > upper_bin + outOfRangeBinsToClose`).
- **2 caller path** — PnL poll 3s direct close (Lever A) vs management cycle 10min LLM (actionMap).
- **Lever A emergency** — `emergencyCloseDirect` close LLM-free, no cooldown, hold `_managementBusy`.
- **needs_confirmation** — TRAILING_TP only. Confirmation-pending lewat management lama, non-confirmation lewat direct close.
- **pnl_pct_suspicious guard** — skip trough + SL + trailing. OOR + low-yield tetap jalan.
- **trailing_active** — state machine, sekali trigger `peak_pnl_pct >= trailingTriggerPct` → stay true until close.
- **confirmed_trailing_exit_until** — 30s exit window after trailing drop confirmed. Next poll replay exit.
- **45s max trailing delay** — 15s peak + 15s trailing + 30s exit window.
- **shouldUsePnlRecheck** — gate utk 15s confirmation. false (RPC trusted) → immediate peak set.
- **toleranceRatio 0.85** — peak confirm threshold (current >= pending × 0.85).
- **tolerancePct 1.0** — trailing confirm threshold (current <= pendingCurrent + 1.0).
- **exitMap** — management cycle Map position → exit.reason (dari evaluator A).
- **actionMap** — management cycle Map position → {action, rule, reason} (CLOSE/CLAIM/STAY/INSTRUCTION/indicator).
- **actionPositions** — filter `action !== "STAY"` → LLM MANAGER.

---

## §G. Link fase lain (cross-ref)

- **F2 (cycles)**: `runManagementCycle` (index.js:471) + PnL poll (index.js:1309) = 2 caller path. F18 = detail exit evaluation di kedua path.
- **F3 (exits)**: `getDeterministicCloseRule` (1466-1509) = evaluator B. `emergencyCloseDirect` (1207-1248) = Lever A. `getIndicatorExitSignal` (1515-1528) = opt-in exit indicator (management cycle only). `computeBinsBelow` (1572-1580) = pump-OOR bin math.
- **F11 (positions)**: `getMyPositions` sediakan `pnl_pct`/`pnl_pct_suspicious`/`in_range`/`active_bin`/`fee_per_tvl_24h`/`age_minutes`/`unclaimed_fees_usd` — input utk exit rules. `pnl_pct_suspicious` source = F11 (RPC noise detection).
- **F17 (state registry)**: `updatePnlAndCheckExits` mutate state.json (peak/trough/OOR/trailing/pending). `queuePeakConfirmation`/`resolvePendingPeak`/`queueTrailingDropConfirmation`/`resolvePendingTrailingDrop` = 15s confirmation machinery. `syncOpenPositions` = auto-close missing.
- **F19 (capture)**: `recordPerformance` baca `peak_pnl_pct`/`trough_pnl_pct`/`price_peak_pct`/`price_trough_pct`/`deployed_at`/`out_of_range_since`/`total_fees_claimed_usd` utk performance record + movement analysis.
- **F24 (stats)**: `reports.js` `price_movement` block baca `price_peak_pct`/`price_trough_pct`/`peak_pnl_pct`/`trough_pnl_pct`. `classifyCloseRule` map exit action → canonical rule (SL/trailing/OOR/low-yield/TP/pump-OOR/indicator).
- **F26 (config)**: `config.management` 12-key: `stopLossPct=-50`/`takeProfitPct=5`/`trailingDropPct=1.5`/`trailingTakeProfit`/`trailingTriggerPct`/`outOfRangeWaitMinutes=30`/`outOfRangeBinsToClose=10`/`minFeePerTvl24h=7`/`minAgeBeforeYieldCheck=60`/`minClaimAmount`/`solMode`/`gasReserve`. Verify defaults F26.
- **F30 (telegram)**: `notifyOutOfRange` (telegram.js) — OOR alert notification. `notifyClose` — close notification dgn exit reason.

---

## §H. Open-Q (bawa ke fase lain)

- **E2 → F11**: `pnl_pct_suspicious` source — kapan true? RPC consensus check? Meteora API fallback? Bila persistent → SL blind. Verify di F11 (getMyPositions PnL data source).
- **E3 → F18 follow-up**: `trailing_active` never reset — user might expect re-arm bila PnL drop below trailingTriggerPct. Kontrak atau gap? Survey user expectation / setup.js wizard.
- **E7 → F11/F26**: `shouldUsePnlRecheck()` source — config key? Default? Bila true (Meteora API) → 15s confirmation. Bila false (RPC) → immediate.
- **`schedulePeakConfirmation`/`scheduleTrailingDropConfirmation` → F2 follow-up**: verify scheduler implementation (index.js 138/164/181). 15s setTimeout? Cancel bila position closed?
- **`unclaimed_fees_usd` claim rule → F18 follow-up**: management cycle CLAIM rule (index.js:572) `unclaimed_fees_usd >= minClaimAmount`. Verify `minClaimAmount` default (F26). PnL poll TIDAK trigger claim — hanya management cycle. Reason?
- **`instruction` INSTRUCTION action → F30**: management cycle INSTRUCTION (index.js:554) → LLM evaluate `p.instruction`. Siapa set instruction? User `/set <n> <note>` (F30)? Atau LLM tool? Verify call sites + sanitize.
- **`getIndicatorExitSignal` opt-in → F3/F15**: exit indicator gate (F3:1516) `indicators.enabled AND indicators.exitEnabled` default OFF. Management cycle only (566). PnL poll TIDAK pakai indicator exit. Reason: indicator = slow signal, PnL poll = fast emergency.
